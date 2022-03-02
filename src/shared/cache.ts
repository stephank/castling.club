import createDebug from "debug";
import { Store } from "keyv";

import { Pg } from "../util/q";

export interface CacheStore<T> extends Store<T> {
  get(id: string): Promise<T | undefined>;
  set(id: string, data: T): Promise<void>;
  delete(id: string): Promise<boolean>;
  clear(): Promise<void>;
}

export interface CacheService {
  draw: CacheStore<Buffer>;
  http: CacheStore<string>;
}

const debug = createDebug("chess:cache");

export default async ({ pg }: { pg: Pg }): Promise<CacheService> => {
  // Creates a Keyv compatible store.
  //
  // We don't use `@keyv/postgres`, because some of our caching uses the store
  // directly to store a different value type, and we get to reuse our pool.
  const createStore = <T>(name: string): CacheStore<T> => ({
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
        return rows[0].data;
      } else {
        debug(`MISS ${name}: ${id}`);
        return undefined;
      }
    },

    async set(id, data) {
      debug(`SET ${name}: ${id}`);
      await pg.query({
        name: `set ${name}`,
        text: `
          insert into ${name} (id, data)
            values ($1, $2)
          on conflict (id) do update
            set data = $2
        `,
        values: [id, data],
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
    http: createStore<string>("http_cache"),
  };
};
