import assert from "assert";
import createDebug from "debug";
import got from "got";
import postgres from "pg";

import { AS_MIME, JSON_ACCEPTS } from "../util/consts.js";
import { JsonLdService } from "../shared/jsonld.js";
import { SigningService } from "../shared/signing.js";
import { checkPublicUrl, detach } from "../util/misc.js";
import { getActor, getEndpoints } from "../util/rdfModel.js";

import {
  Pg,
  DeliveryRow,
  lockSharedAddresseeDeliveries,
  updateDeliveryInboxByAddressee,
  lockSharedInboxDeliveries,
  getOutboxById,
  updateDeliveryAttemptByAddressees,
  deleteDeliveriesByAddressees,
  getNextDelivery,
  transact,
} from "../util/model.js";

export type DeliverCtrl = void;

interface DeliveryRetry {
  delay: number;
  attemptAt: Date;
  attemptNum: number;
}

const DEFAULT_INTERVAL = 60 * 1000;
const DELIVER_DELAY = 2 * 1000;

const MAX_ATTEMPTS = 10;
const BASE_DELAY = 10 * 1000;

const debug = createDebug("chess:deliver");

export default async ({
  env,
  origin,
  publicKeyUrl,
  privateKeyPem,
  pg,
  jsonld,
  signing,
}: {
  env: string;
  origin: string;
  publicKeyUrl: string;
  privateKeyPem: string;
  pg: Pg;
  jsonld: JsonLdService;
  signing: SigningService;
}): Promise<DeliverCtrl> => {
  let idle = true;
  let timerHandle: NodeJS.Timeout | undefined;

  // Resolve an actor inbox URL.
  const resolveInbox = async (pg: Pg, delivery: DeliveryRow): Promise<void> => {
    const { outboxId, addressee } = delivery;
    const store = jsonld.createStore();

    // Lock all rows with the same addressee and no inbox yet.
    const { rows: deliveryRows } = await lockSharedAddresseeDeliveries(
      pg,
      addressee
    );

    // Should've matched the original delivery as well.
    const outboxIds = deliveryRows.map((row) => row.outboxId);
    assert(outboxIds.includes(outboxId));

    // Try to load the actor document.
    try {
      await store.load(addressee);
    } catch (err: any) {
      console.warn(`Failed to load addressee document: ${addressee}`);
      console.warn(`Error: ${err.message}`);

      // Schedule a retry, if appropriate.
      const statusCode = err.statusCode || 0;
      const retry =
        (!statusCode || statusCode >= 500) &&
        (await scheduleRetry(pg, delivery));

      if (retry) {
        const delaySec = ~~(retry.delay / 1000);
        console.warn(`Scheduled retry #${retry.attemptNum} in ${delaySec}s`);
      } else {
        console.warn(`Exhausted retries, giving up.`);
        await deleteDelivery(pg, delivery);
      }

      return;
    }

    // Get the actor details we need.
    const actor = getActor(store, addressee);

    // Try to use the shared inbox if possible.
    let inbox;
    if (actor.endpoints) {
      try {
        await store.load(actor.endpoints);
        inbox = getEndpoints(store, actor.endpoints).sharedInbox;
      } catch (err: any) {
        console.warn(`Failed to load endpoints for addressee: ${addressee}`);
        console.warn(`Error: ${err.message}`);
      }
    }

    if (inbox && (env !== "production" || checkPublicUrl(inbox))) {
      debug(`Resolved ${addressee}, shared inbox: ${inbox}`);
    } else {
      inbox = actor.inbox;
      if (inbox && (env !== "production" || checkPublicUrl(inbox))) {
        debug(`Resolved ${addressee}, personal inbox: ${inbox}`);
      } else {
        console.warn(
          `Tried to address actor with no or invalid inbox: ${addressee}`
        );
        return deleteDelivery(pg, delivery);
      }
    }

    // Do first delivery attempt after a short delay,
    // so (hopefully) shared inboxes can be gathered.
    // @todo: Should probably prioritize resolving inboxes before deliveries?
    const attemptAt = new Date(Date.now() + DELIVER_DELAY);
    const { rowCount } = await updateDeliveryInboxByAddressee(
      pg,
      outboxIds,
      addressee,
      inbox,
      attemptAt
    );
    assert.strictEqual(rowCount, outboxIds.length);
  };

  // Deliver an activity from the outbox.
  const deliverActivity = async (
    pg: Pg,
    delivery: DeliveryRow
  ): Promise<void> => {
    const { outboxId, addressee, inbox } = delivery;

    // Lock all rows with the same inbox.
    const { rows: deliveryRows } = await lockSharedInboxDeliveries(
      pg,
      outboxId,
      inbox
    );

    // Should've matched the original delivery as well.
    const addressees = deliveryRows.map((delivery) => delivery.addressee);
    assert(addressees.includes(addressee));

    // Get the activity body.
    const { rows: outboxRows } = await getOutboxById(pg, outboxId);
    assert.strictEqual(outboxRows.length, 1);

    // Build the request body, with the object embedded in the activity.
    // Use the object context, assuming it contains the activity streams
    // context, but may contain additional vocabularies.
    const { object, activity } = outboxRows[0];
    const json = {
      ...activity,
      "@context": object["@context"],
      object: {
        ...object,
        "@context": undefined,
      },
    };

    // Make the signed request to the inbox.
    let res;
    try {
      res = await got.post(inbox, {
        headers: {
          "user-agent": `${origin}/`,
          "content-type": AS_MIME,
          accept: JSON_ACCEPTS,
        },
        hooks: {
          beforeRequest: [signing.signHook(publicKeyUrl, privateKeyPem)],
        },
        json,
      });
    } catch (err: any) {
      console.warn(`Failed delivery to inbox: ${inbox}`);
      console.warn(`Error: ${err.message}`);

      // Schedule a retry, if appropriate.
      const statusCode = err.statusCode || 0;
      const retry =
        (!statusCode || statusCode >= 500) &&
        (await scheduleRetry(pg, delivery, addressees));

      if (retry) {
        const delaySec = ~~(retry.delay / 1000);
        console.warn(`Scheduled retry #${retry.attemptNum} in ${delaySec}s`);
      } else {
        console.warn(`Exhausted retries, giving up.`);
        await deleteDelivery(pg, delivery, addressees);
      }

      return;
    }

    // Delete the deliveries that finished successfully.
    debug(`Delivered (${res.statusCode}): [${outboxId}] ${inbox}`);
    return deleteDelivery(pg, delivery, addressees);
  };

  // Schedule a retry of a delivery.
  // Optionally updates all similar deliveries for a list of addressees.
  const scheduleRetry = async (
    pg: Pg,
    delivery: DeliveryRow,
    addressees?: string[]
  ): Promise<DeliveryRetry | undefined> => {
    const attemptNum = delivery.attemptNum + 1;
    if (attemptNum >= MAX_ATTEMPTS) {
      return;
    }

    const delay = BASE_DELAY * 3 ** delivery.attemptNum;
    const attemptAt = new Date(Date.now() + delay);
    if (!addressees) {
      addressees = [delivery.addressee];
    }

    const { rowCount } = await updateDeliveryAttemptByAddressees(
      pg,
      delivery.outboxId,
      addressees,
      attemptAt,
      attemptNum
    );
    assert.strictEqual(rowCount, addressees.length);

    return { delay, attemptAt, attemptNum };
  };

  // Delete a delivery.
  // Optionally deletes all similar deliveries for a list of addressees.
  const deleteDelivery = async (
    pg: Pg,
    delivery: DeliveryRow,
    addressees?: string[]
  ): Promise<void> => {
    if (!addressees) {
      addressees = [delivery.addressee];
    }

    const { rowCount } = await deleteDeliveriesByAddressees(
      pg,
      delivery.outboxId,
      addressees
    );
    assert.strictEqual(rowCount, addressees.length);
  };

  // Attempt to dequeue the next delivery, or set a timer.
  const dequeue = async (): Promise<boolean> => {
    let result = false;
    await transact(pg, async (pg) => {
      const { rows } = await getNextDelivery(pg);
      if (rows.length === 0) {
        return;
      } else {
        assert.strictEqual(rows.length, 1);
      }

      // If attempt is in the future, schedule the timer.
      const delivery = rows[0];
      const now = new Date();
      if (delivery.attemptAt > now) {
        const delta = Math.min(
          DEFAULT_INTERVAL,
          delivery.attemptAt.valueOf() - now.valueOf()
        );
        debug(`Have pending, next run in ${(delta / 1000).toFixed(1)}s`);
        timerHandle = setTimeout(onTimer, delta);
        return;
      }

      // Process this delivery.
      if (!delivery.inbox) {
        await resolveInbox(pg, delivery);
      } else {
        await deliverActivity(pg, delivery);
      }
      result = true;

      // Notify other delivery workers.
      await pg.query("notify deliveries_changed");
    });
    return result;
  };

  // Dequeue deliveries as long as we're successful.
  const dequeueLoop = detach(async () => {
    while (await dequeue());
  });

  // Timer callback.
  const onTimer = () => {
    idle = false;
    timerHandle = undefined;
    dequeueLoop().then(() => {
      if (timerHandle === undefined) {
        const delta = DEFAULT_INTERVAL;
        debug(`Idle, next run in ${(delta / 1000).toFixed(1)}s`);
        timerHandle = setTimeout(onTimer, delta);
      }
      idle = true;
    });
  };

  // Dedicated PG connection to listen for notifications.
  const listener = new postgres.Client();
  await listener.connect();
  await listener.query("listen deliveries_changed");
  listener.on("notification", (msg) => {
    if (idle && msg.channel === "deliveries_changed") {
      if (timerHandle) {
        clearTimeout(timerHandle);
      }
      onTimer();
    }
  });

  // Fire timer callback now, to initialize.
  onTimer();
};
