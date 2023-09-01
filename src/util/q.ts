import createDebug from "debug";
import type { ClientBase, Pool, QueryResult, QueryResultRow } from "pg";

const debug = createDebug("chess:query");

export type Pg = ClientBase | Pool;
export type { QueryResult, QueryResultRow };

let _pg: Pg | undefined;

// Query the database. Use as a tagged template literal.
// Column names are transformed to camel-case.
//
// const { rows } = await q(pg)`
//   -- optional name of prepared statement
//   select * from "widgets" where "id" = ${widgetId}
// `
//
// (The prepared statement name *cannot* be dynamic.)
const q = (pg: Pg) => {
  _pg = pg;
  return _q;
};

const _q = async <T extends QueryResultRow>(
  strings: TemplateStringsArray,
  ...values: any[]
): Promise<QueryResult<T>> => {
  const pg = _pg!;
  _pg = undefined;

  // Build the statement text.
  const { length } = values;
  let text = strings[0];
  for (let idx = 1; idx <= length; idx++) {
    text += `$${idx}`;
    text += strings[idx];
  }
  text = text.trim();

  // Extract the prepared statement name.
  let name;
  if (text.slice(0, 2) === "--") {
    const idx = text.indexOf("\n");
    name = text.slice(2, idx).trim();
    text = text.slice(idx + 1);
  }

  debug(name || "!UNNAMED!", values);
  const res = await pg.query({ name, text, values });

  // Rewrite fields and rows using camel-case.
  for (const field of res.fields) {
    field.name = fromUnderscored(field.name);
  }
  res.rows = res.rows.map((raw) => {
    const out: any = {};
    for (const rawField in raw) {
      const outField = fromUnderscored(rawField);
      out[outField] = raw[rawField];
    }
    return out;
  });

  return res;
};

// Convert an underscored identifier to camel-case.
const fromUnderscored = (input: string): string => {
  const parts = input.split("_");
  let out = parts.shift();
  for (const part of parts) {
    out += part[0].toUpperCase() + part.slice(1);
  }
  return out || "";
};

// Run the code block with a single connection.
q.withClient = async <T>(
  pg: Pg,
  fn: (client: ClientBase) => Promise<T>,
): Promise<T> => {
  // Can't rely on an `instanceof` check here, unfortunately.
  if ("idleCount" in pg) {
    const pool = <Pool>pg;
    const client = await pool.connect();
    try {
      return await fn(client);
    } finally {
      client.release();
    }
  } else {
    return fn(<ClientBase>pg);
  }
};

// Run the code block within a transaction.
// Throw or return `false` to roll back the transaction.
q.transact = <T>(
  pg: Pg,
  fn: (client: ClientBase) => Promise<T>,
): Promise<T> => {
  return q.withClient(pg, async (pg) => {
    let res;
    await pg.query(`begin`);
    try {
      res = await fn(pg);
    } catch (err) {
      await pg.query("rollback");
      throw err;
    }
    await pg.query("commit");
    return res;
  });
};

export default q;
