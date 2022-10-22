import pg from "pg";

import cacheService, { CacheService } from "./cache.js";
import jsonldService, { JsonLdService } from "./jsonld.js";
import signingService, { SigningService } from "./signing.js";

export interface AppConfig {
  isDev: boolean;
  scheme: string;
  domain: string;
  adminUrl: string;
  adminEmail: string;
  publicKeyPem: string;
  privateKeyPem: string;
  hmacSecret: string;
}

export interface BaseApp extends AppConfig {
  origin: string;
  actorUrl: string;
  publicKeyUrl: string;

  pg: pg.Pool;

  cache: CacheService;
  jsonld: JsonLdService;
  signing: SigningService;
}

export default async ({
  isDev,
  scheme,
  domain,
  adminUrl,
  adminEmail,
  publicKeyPem,
  privateKeyPem,
  hmacSecret,
}: AppConfig): Promise<BaseApp> => {
  // Derived settings.
  const origin = `${scheme}://${domain}`;
  const actorUrl = `${origin}/@king`;
  const publicKeyUrl = `${actorUrl}#public-key`;

  // Main application object.
  const app = <BaseApp>{
    isDev,
    scheme,
    domain,
    adminUrl,
    adminEmail,
    publicKeyPem,
    privateKeyPem,
    hmacSecret,
    origin,
    actorUrl,
    publicKeyUrl,
  };

  // Instances of external dependencies.
  app.pg = new pg.Pool();

  // Parts of the app. These interconnect, so order is important.
  // (Basically poor-man's dependency injection.)
  app.cache = await cacheService(app);
  app.jsonld = await jsonldService(app);
  app.signing = await signingService(app);

  return app;
};
