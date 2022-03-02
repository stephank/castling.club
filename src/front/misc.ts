import Router from "@koa/router";

import { JSON_LD_MIME, TINY_CACHE_SEC } from "../util/consts";
import { readAsset, renderTemplate } from "../util/fs";

import { Pg, getChallengeBoard, getRecentGames } from "../util/model";

export type MiscCtrl = void;

export default async ({
  adminUrl,
  adminEmail,
  domain,
  origin,
  pg,
  router,
}: {
  adminUrl: string;
  adminEmail: string;
  domain: string;
  origin: string;
  pg: Pg;
  router: Router;
}): Promise<MiscCtrl> => {
  const chessNs = JSON.parse(await readAsset("ns/chess_v0.json", "utf8"));
  const stylesheet = await readAsset("css/main.css");

  // Serve the index page.
  router.get("/", async (ctx) => {
    const { rows: challengeBoardRows } = await getChallengeBoard(pg);
    const { rows: recentGames } = await getRecentGames(pg);

    // Format full names for each entry, as you'd use in a mention.
    const challengeBoard = challengeBoardRows.map((entry) => {
      const match = /^https?:\/\/([^/]+)\//.exec(entry.actorId);
      const actorFullName = match
        ? `${entry.actorName}@${match[1]}`
        : undefined;
      return { ...entry, actorFullName };
    });

    ctx.set("Cache-Control", `public, max-age=${TINY_CACHE_SEC}`);
    ctx.body = await renderTemplate("index", {
      domain,
      challengeBoard,
      recentGames,
    });
    ctx.type = "html";
  });

  // Serve the stylesheet for HTML responses.
  router.get("/main.css", async (ctx) => {
    ctx.body = stylesheet;
    ctx.type = "css";
  });

  // Serve the chess vocabulary for JSON-LD.
  router.get("/ns/chess/v0", async (ctx) => {
    ctx.body = chessNs;
    ctx.type = JSON_LD_MIME;
  });

  // Serve nodeinfo webfinger.
  router.get("/.well-known/nodeinfo", (ctx) => {
    ctx.body = {
      links: [
        {
          rel: "http://nodeinfo.diaspora.software/ns/schema/2.0",
          href: `${origin}/nodeinfo`,
        },
      ],
    };
  });

  // Serve nodeinfo.
  router.get("/nodeinfo", (ctx) => {
    ctx.body = {
      version: "2.0",
      software: {
        name: domain,
        version: "n/a",
      },
      protocols: ["activitypub"],
      services: {
        inbound: [],
        outbound: [],
      },
      openRegistrations: false,
      usage: {
        users: {},
      },
      metadata: {
        description:
          "A custom server in the fediverse that hosts games of chess." +
          ` See ${origin}/ for how to play!`,
        admin: adminUrl,
        email: adminEmail,
      },
    };
    ctx.type =
      "application/json; profile=http://nodeinfo.diaspora.software/ns/schema/2.0#";
  });
};
