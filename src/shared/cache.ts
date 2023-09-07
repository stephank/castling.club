import createDebug from "debug";

import type { Pg } from "../util/q.js";
import type { FetchacheCacheEntry } from "fetchache";
import { identity } from "../util/misc.js";

export interface CacheStore<T> {
  get(id: string): Promise<T | undefined>;
  set(id: string, data: T): Promise<void>;
  delete(id: string): Promise<boolean>;
  clear(): Promise<void>;
}

export interface CacheService {
  draw: CacheStore<Buffer>;
  http: CacheStore<FetchacheCacheEntry>;
}

const debug = createDebug("chess:cache");

export default async ({ pg }: { pg: Pg }): Promise<CacheService> => {
  // Creates a Keyv compatible store.
  //
  // We don't use `@keyv/postgres`, because some of our caching uses the store
  // directly to store a different value type, and we get to reuse our pool.
  const createStore = <T>(
    name: string,
    {
      serialize = identity,
      deserialize = identity,
    }: {
      serialize?: (value: T) => any;
      deserialize?: (data: any) => T;
    } = {},
  ): CacheStore<T> => ({
    async get(id) {
      const { rows } = await pg.query({
        name: `get ${name}`,
        text: `
          select data from ${name}
          where id = $1
        `,
        values: [id],
      });
      if (rows.length !== 0) {
        debug(`HIT ${name}: ${id}`);
        return deserialize(rows[0].data);
      } else {
        debug(`MISS ${name}: ${id}`);
        return undefined;
      }
    },

    async set(id, value) {
      debug(`SET ${name}: ${id}`);
      await pg.query({
        name: `set ${name}`,
        text: `
          insert into ${name} (id, data)
            values ($1, $2)
          on conflict (id) do update
            set data = $2
        `,
        values: [id, serialize(value)],
      });
    },

    async delete(id) {
      debug(`DEL ${name}: ${id}`);
      const { rowCount } = await pg.query({
        name: `delete ${name}`,
        text: `
          delete from ${name}
          where id = $1
        `,
        values: [id],
      });
      return rowCount !== 0;
    },

    async clear() {
      debug(`CLEAR ${name}`);
      await pg.query({
        name: `clear ${name}`,
        text: `
          truncate table ${name}
        `,
      });
    },
  });

  // Create default stores.
  return {
    draw: createStore<Buffer>("draw_cache"),
    http: createStore<FetchacheCacheEntry>("http_cache", {
      serialize: JSON.stringify,
      deserialize: JSON.parse,
    }),
  };
};
