// A simple PostgreSQL migration runner.

import dotenv from "dotenv";
import fs from "node:fs/promises";
import pg from "pg";

export type MigrationDirection = "up" | "down";
export type MigrationFunction = (inject: { pg: pg.Client }) => Promise<void>;
export type Migration = {
  [direction in MigrationDirection]: MigrationFunction;
};

export interface MigrationRow {
  name: string;
  stamp?: Date;
}

export interface MigrationOptions {
  before?(
    direction: MigrationDirection,
    row: MigrationRow,
  ): Promise<void> | void;
  after?(
    direction: MigrationDirection,
    row: MigrationRow,
  ): Promise<void> | void;
}

const BASE_DIR = new URL("./migrations/", import.meta.url);

class Runner {
  private pg?: pg.Client = undefined;

  async init() {
    if (!this.pg) {
      this.pg = new pg.Client();
      await this.pg.connect();
    }

    await this.pg.query(`
      create table if not exists "migrations" (
        "name" text primary key,
        "stamp" timestamp not null
      )
    `);
  }

  async destroy() {
    if (this.pg) {
      this.pg.end();
      this.pg = undefined;
    }
  }

  async list(): Promise<MigrationRow[]> {
    const pg = this.pg!;

    const allFiles = await fs.readdir(BASE_DIR);
    const files = allFiles.filter((name) => /^\d{3}_.+\.js$/.test(name)).sort();

    const { rows } = await pg.query<MigrationRow>({
      text: 'select "name", "stamp" from "migrations" order by "stamp" asc',
    });

    return files.map((name) => {
      const row = rows.find((row) => row.name === name);
      return row || { name, stamp: undefined };
    });
  }

  async run(
    direction: MigrationDirection,
    rows: MigrationRow[],
    options: MigrationOptions = {},
  ): Promise<void> {
    const pg = this.pg!;
    for (const row of rows) {
      await pg.query("begin");
      try {
        await options.before?.(direction, row);
        const file = new URL(row.name, BASE_DIR);
        const mod: Migration = await import(file.toString());
        await mod[direction]({ pg });
        await options.after?.(direction, row);
      } catch (err) {
        await pg.query("rollback");
        throw err;
      }
      await pg.query("commit");
    }
  }

  async up(options: MigrationOptions = {}): Promise<MigrationRow[]> {
    const pg = this.pg!;
    const rows = await this.list();
    const stamp = new Date();
    const todo = rows.filter((row) => !row.stamp);
    await this.run("up", todo, {
      ...options,
      after: async (direction, row) => {
        await pg.query({
          text: 'insert into "migrations" ("name", "stamp") values ($1, $2)',
          values: [row.name, stamp],
        });
        return options.after?.(direction, row);
      },
    });
    return todo;
  }

  async down(options: MigrationOptions = {}): Promise<MigrationRow[]> {
    const pg = this.pg!;
    const rows = await this.list();
    const stamp = Math.max(
      ...rows.map((row) => (row.stamp ? row.stamp.getTime() : -1)),
    );
    const todo = rows.filter(
      (row) => row.stamp && row.stamp.getTime() === stamp,
    );
    await this.run("down", todo, {
      ...options,
      after: async (direction, row) => {
        await pg.query({
          text: 'delete from "migrations" where "name" = $1',
          values: [row.name],
        });
        return options.after?.(direction, row);
      },
    });
    return todo;
  }
}

export default Runner;

export const cli = () => {
  dotenv.config();

  const main = async (): Promise<void> => {
    const runner = new Runner();
    try {
      await runner.init();

      const cmd = process.argv[2];
      if (cmd === "up" || cmd === "down") {
        const rows = await runner[cmd]({
          before: (direction, row) => {
            console.log(`${row.name} ${direction}...`);
          },
        });
        console.log(`Ran ${rows.length} migration(s)`);
      } else if (cmd === "list") {
        const rows = await runner.list();
        console.log("Migration listing:");
        for (const row of rows) {
          if (row.stamp) {
            console.log(` - ${row.name},  ${row.stamp || "-"}`);
          } else {
            console.log(` - ${row.name}`);
          }
        }
      } else {
        console.log(`Usage: ${process.argv[1]} [list|up|down]`);
        process.exit(64);
      }
    } finally {
      runner.destroy();
    }
  };

  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
};
