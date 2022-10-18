import Router from "@koa/router";

import { readAsset } from "../util/fs.js";

import {
  AS_CONTEXT,
  AS_MIME,
  KOA_JSON_ACCEPTS,
  SEC_CONTEXT,
} from "../util/consts.js";

export type ActorCtrl = void;

export default async ({
  actorUrl,
  domain,
  origin,
  publicKeyPem,
  publicKeyUrl,
  router,
}: {
  actorUrl: string;
  domain: string;
  origin: string;
  publicKeyPem: string;
  publicKeyUrl: string;
  router: Router;
}): Promise<ActorCtrl> => {
  const kingIcon = await readAsset("img/bk.png");
  const accountUrl = `acct:king@${domain}`;

  // Allow some invalid Webfinger queries.
  // @todo: Appears to be old Mastodon?
  const validQueries = new Set([
    "king",
    `king@${domain}`,
    "acct:king",
    accountUrl,
  ]);

  // Handle Webfinger requests.
  router.get("/.well-known/webfinger", (ctx) => {
    const { resource } = ctx.query;
    if (typeof resource === "string" && validQueries.has(resource)) {
      ctx.body = {
        subject: accountUrl,
        links: [
          {
            rel: "self",
            type: AS_MIME,
            href: actorUrl,
          },
        ],
      };
      ctx.type = "application/jrd+json";
    } else {
      ctx.status = 404;
    }
  });

  // Our actor document (including public key).
  // @todo: Support non-RSA keys.
  router.get("/@king", (ctx) => {
    const actor = {
      "@context": [AS_CONTEXT, SEC_CONTEXT],
      id: actorUrl,
      type: "Service",
      name: "King",
      summary: `<p>I'm a bot, hosting games of chess!</p>`,
      preferredUsername: "king",
      inbox: `${origin}/inbox`,
      icon: {
        type: "Image",
        mediaType: "image/png",
        url: `${actorUrl}/icon`,
      },
      attachment: [
        {
          type: "PropertyValue",
          name: "Website",
          value: `<a href="${origin}/">${domain}</a>`,
        },
      ],
      publicKey: {
        id: publicKeyUrl,
        owner: actorUrl,
        publicKeyPem,
      },
    };

    ctx.response.vary("accept");
    if (ctx.accepts("html")) {
      ctx.redirect("/");
    } else if (ctx.accepts(KOA_JSON_ACCEPTS)) {
      ctx.body = actor;
      ctx.type = AS_MIME;
    } else {
      ctx.status = 406;
    }
  });

  // Our actor icon. Doubles as our favicon.
  router.get("/@king/icon", (ctx) => {
    ctx.body = kingIcon;
    ctx.type = "png";
  });
};
