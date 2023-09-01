import Router from "@koa/router";
import coBody from "co-body";
import createDebug from "debug";
import createError from "http-errors";
import { EventEmitter } from "events";

import { AS } from "../util/consts.js";
import { JsonLdService } from "../shared/jsonld.js";
import { Pg, tryInsertInboxObject } from "../util/model.js";
import { SigningService } from "../shared/signing.js";
import { extractText } from "../util/html.js";
import { originOf } from "../util/misc.js";

import {
  Actor,
  Object,
  getActivity,
  getActor,
  getObject,
  getTag,
} from "../util/rdfModel.js";

export interface ObjectExt extends Object {
  actor: Actor;
  contentText: string;
  mentions: Set<string>;
}

export interface InboxCtrl extends EventEmitter {
  on(event: "noteCreated", listener: (object: ObjectExt) => void): this;
}

const debug = createDebug("chess");

export default async ({
  isDev,
  jsonld,
  pg,
  router,
  signing,
}: {
  isDev: boolean;
  jsonld: JsonLdService;
  pg: Pg;
  router: Router;
  signing: SigningService;
}): Promise<InboxCtrl> => {
  const inbox = new EventEmitter();

  // Remote server submits to our inbox.
  router.post("/inbox", async (ctx) => {
    const { raw, parsed } = await coBody.json(ctx.req, { returnRawBody: true });

    // Sanity check.
    if (!parsed || typeof parsed.id !== "string") {
      throw createError(400, "Invalid request body");
    }

    // Extract the origin.
    const origin = originOf(parsed.id);
    if (!origin) {
      throw createError(400, "Invalid activity ID, not a URL");
    }

    // Load the activity document.
    const store = jsonld.createStore();
    try {
      await store.load(parsed);
    } catch (err: any) {
      throw createError(
        400,
        `Activity document could not be loaded: ${err.message}`,
      );
    }

    const activity = getActivity(store, parsed.id);
    if (!activity.type || !activity.actor) {
      throw createError(400, "Incomplete activity object");
    }

    // Verify the actor signature.
    try {
      const publicKey = await signing.verify(ctx, raw, store);
      if (publicKey.owner !== activity.actor) {
        throw createError(400, "Signature does not match actor");
      }
    } catch (err: any) {
      if (isDev) {
        console.warn(
          `DEV MODE: Would reject signature in production: ${err.message}`,
        );
      } else {
        throw err;
      }
    }

    // Verify the activity is from the actor's origin.
    if (originOf(activity.actor) !== origin) {
      throw createError(400, "Activity and actor origins don't match");
    }

    // Load the actor document.
    try {
      await store.load(activity.actor);
    } catch (err: any) {
      throw createError(
        400,
        `Actor document could not be loaded: ${err.message}`,
      );
    }

    const actor = getActor(store, activity.actor);

    // Deduplicate based on activity ID.
    const now = new Date();
    const { rowCount } = await tryInsertInboxObject(pg, activity.id, now);
    if (rowCount === 0) {
      debug(`Ignoring duplicate activity: ${activity.id}`);
      ctx.status = 202;
      ctx.body = "";
      return;
    }

    // We currently handle just 'Create'.
    if (activity.type === AS("Create")) {
      // The object MUST be inlined in the raw JSON, according to spec.
      // This also means it was already loaded into the store.
      if (typeof parsed.object !== "object") {
        throw createError(400, "Invalid object in 'Create' activity");
      }

      const object = getObject(store, activity.object!);
      if (object.type === AS("Note")) {
        if (object.attributedTo !== activity.actor) {
          throw createError(
            400,
            "Activity creates note not attributed to the actor",
          );
        }

        // Amend object with convenience props.
        const objectExt = {
          ...object,
          actor: actor,
          contentText: extractText(object.content || ""),
          mentions: new Set(),
        };
        for (const tagId of object.tags) {
          // Assume these are also inlined in the JSON, and thus loaded.
          // If they're not, they'll simply not pass the type check.
          const tag = getTag(store, tagId);
          if (tag.type === AS("Mention")) {
            objectExt.mentions.add(tag.href);
          }
        }

        // Dispatch.
        debug(`<< ${objectExt.actor.id} - ${objectExt.contentText}`);
        inbox.emit("noteCreated", objectExt);
      }
    }

    ctx.status = 202;
    ctx.body = "";
  });

  return inbox;
};
