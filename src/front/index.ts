import Koa from "koa";
import Router from "@koa/router";
import { Server } from "http";

import createApp, { AppConfig, BaseApp } from "../shared/createApp";
import { DEFAULT_CACHE_SEC } from "../util/consts";

import actorCtrl, { ActorCtrl } from "./actor";
import challengeBoardCtrl, { ChallengeBoardCtrl } from "./challengeBoard";
import dispatchCtrl, { DispatchCtrl } from "./dispatch";
import drawCtrl, { DrawCtrl } from "./draw";
import gameCtrl, { GameCtrl } from "./game";
import inboxCtrl, { InboxCtrl } from "./inbox";
import miscCtrl, { MiscCtrl } from "./misc";
import outboxCtrl, { OutboxCtrl } from "./outbox";

interface FrontApp extends BaseApp {
  koa: Koa;
  router: Router;

  misc: MiscCtrl;
  actor: ActorCtrl;
  inbox: InboxCtrl;
  outbox: OutboxCtrl;
  draw: DrawCtrl;
  game: GameCtrl;
  challengeBoard: ChallengeBoardCtrl;
  dispatch: DispatchCtrl;

  listen(port: number, onListening: () => void): Server;
}

export default async (config: AppConfig): Promise<FrontApp> => {
  const app = <FrontApp>await createApp(config);

  // Instances of external dependencies.
  app.koa = new Koa();
  app.router = new Router();

  // Parts of the app. These interconnect, so order is important.
  // (Basically poor-man's dependency injection.)
  app.misc = await miscCtrl(app);
  app.actor = await actorCtrl(app);
  app.inbox = await inboxCtrl(app);
  app.outbox = await outboxCtrl(app);
  app.draw = await drawCtrl(app);
  app.game = await gameCtrl(app);
  app.challengeBoard = await challengeBoardCtrl(app);
  app.dispatch = await dispatchCtrl(app);

  // All of our resources are default public and cacheable.
  app.koa.use(async (ctx, next) => {
    if (ctx.method === "GET") {
      ctx.set("Cache-Control", `public, max-age=${DEFAULT_CACHE_SEC}`);
    }
    return next();
  });

  // Setup request handling.
  app.koa.use(app.router.routes()).use(app.router.allowedMethods());
  app.koa.on("error", (err) => {
    if (typeof err.status !== "number" || err.status > 499) {
      console.error(err);
    }
  });

  // Expose Koa listen function on the app.
  app.listen = (...args) => app.koa.listen(...args);

  return app;
};
