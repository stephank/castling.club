import Router from "@koa/router";
import assert from "node:assert";
import createDebug from "debug";
import { Context } from "koa";
import { v4 as uuid } from "uuid";

import { ensureArray } from "../util/misc.js";
import { extractText } from "../util/html.js";
import { renderTemplate } from "../util/fs.js";

import {
  AS,
  AS_CONTEXT,
  AS_MIME,
  KOA_JSON_ACCEPTS,
  SHORT_CACHE_SEC,
} from "../util/consts.js";

import {
  Pg,
  insertOutboxObject,
  getOutboxObjectById,
  getPrevOutboxMoveId,
  getNextOutboxMoveId,
  getOutboxActivityById,
  getGameOverById,
  insertDelivery,
} from "../util/model.js";

export interface OutboxCtrl {
  createObject(pg: Pg, object: any): Promise<string>;
}

const debug = createDebug("chess");

export default async ({
  actorUrl,
  domain,
  origin,
  pg,
  router,
}: {
  actorUrl: string;
  domain: string;
  origin: string;
  pg: Pg;
  router: Router;
}): Promise<OutboxCtrl> => {
  // Create a object in the database. The database handle is provided, so it
  // can be part of a transaction. Usually followed by `deliverObject`.
  const createObject: OutboxCtrl["createObject"] = async (pg, object) => {
    if (object.content) {
      debug(`>> ${extractText(object.content)}`);
    }

    // Assign an ID.
    const id = (object.id = `${origin}/objects/${uuid()}`);

    // Assume the default context, if none was specified.
    if (!object["@context"]) {
      object["@context"] = AS_CONTEXT;
    }

    // Create the wrapping activity.
    const activity = {
      "@context": AS_CONTEXT,
      id: `${id}/activity`,
      type: "Create",
      actor: actorUrl,
      object: id,
      to: object.to,
      cc: object.cc,
      published: object.published,
    };

    // Collect addressees.
    const addressees = new Set([
      ...ensureArray(object.to),
      ...ensureArray(object.cc),
      ...ensureArray(object.bcc),
    ]);

    // Don't deliver to ourselves, or the special public endpoint.
    addressees.delete(actorUrl);
    addressees.delete(AS("Public"));

    // Add to database outbox.
    const createdAt = new Date(object.published);
    const { rowCount } = await insertOutboxObject(
      pg,
      id,
      object,
      activity,
      createdAt,
    );
    assert.strictEqual(rowCount, 1);

    // Add to database deliveries.
    await Promise.all(
      [...addressees].map(async (addressee) => {
        const { rowCount } = await insertDelivery(pg, id, addressee, createdAt);
        assert.strictEqual(rowCount, 1);
      }),
    );

    // Notify delivery workers.
    await pg.query("notify deliveries_changed");

    return id;
  };

  // Fetch one of our objects.
  router.get("/objects/:id", async (ctx: Context) => {
    const id = `${origin}/objects/${ctx.params.id}`;
    const { rows } = await getOutboxObjectById(pg, id);
    ctx.assert(rows.length === 1, 404, "Object not found");

    // Currently, the only public objects are moves.
    const { object, hasFen, createdAt } = rows[0];
    ctx.assert(hasFen, 403, "Forbidden");

    // Find previous and next moves.
    const gameId = object.game.split("/").pop();
    const { rows: prevRows } = await getPrevOutboxMoveId(pg, gameId, createdAt);
    const prevId = prevRows[0] ? prevRows[0].id : null;

    const { rows: nextRows } = await getNextOutboxMoveId(pg, gameId, createdAt);
    const nextId = nextRows[0] ? nextRows[0].id : null;

    // Build the Link header.
    const links = [];
    if (prevId) {
      links.push(`<${prevId}>; rel="previous"`);
    }
    if (nextId) {
      links.push(`<${nextId}>; rel="next"`);
    }
    if (links.length) {
      ctx.set("Link", links.join(", "));
    }

    // If there is no next move, and the game is not over, reduce cache time.
    if (!nextId) {
      const { rows: gameRows } = await getGameOverById(pg, gameId);
      assert.strictEqual(gameRows.length, 1);

      const gameRow = gameRows[0];
      if (!gameRow.gameOver) {
        ctx.set("Cache-Control", `public, max-age=${SHORT_CACHE_SEC}`);
      }
    }

    ctx.response.vary("accept");
    if (ctx.accepts("html")) {
      ctx.body = await renderTemplate("object", {
        domain,
        object,
        prevId,
        nextId,
      });
      ctx.type = "html";
    } else if (ctx.accepts(KOA_JSON_ACCEPTS)) {
      ctx.body = object;
      ctx.type = AS_MIME;
    } else {
      ctx.status = 406;
    }
  });

  // Fetch the activity for one of our objects.
  router.get("/objects/:id/activity", async (ctx: Context) => {
    const id = `${origin}/objects/${ctx.params.id}`;
    const { rows } = await getOutboxActivityById(pg, id);
    ctx.assert(rows.length === 1, 404, "Object not found");

    // Currently, the only public objects are moves.
    const { activity, hasFen } = rows[0];
    ctx.assert(hasFen, 403, "Forbidden");

    ctx.response.vary("accept");
    if (ctx.accepts("html")) {
      ctx.redirect(activity.object);
    } else if (ctx.accepts(KOA_JSON_ACCEPTS)) {
      ctx.body = activity;
      ctx.type = AS_MIME;
    } else {
      ctx.status = 406;
    }
  });

  return { createObject };
};
