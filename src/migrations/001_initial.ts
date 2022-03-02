import { MigrationFunction } from "../migrate";

export const up: MigrationFunction = async ({ pg }) => {
  await pg.query(`
    create table inbox (
      activity_id text not null,
      created_at timestamp not null,
      constraint inbox_pkey
        primary key (activity_id)
    )
  `);

  await pg.query(`
    create table outbox (
      id text not null,
      object json not null,
      activity json not null,
      has_fen boolean default true,
      created_at timestamp not null,
      constraint outbox_pkey
        primary key (id)
    )
  `);

  await pg.query(`
    create table deliveries (
      outbox_id text not null,
      addressee text not null,
      inbox text,
      attempt_at timestamp not null,
      attempt_num integer default 0,
      constraint deliveries_pkey
        primary key (outbox_id, addressee),
      constraint deliveries_outbox_fkey
        foreign key (outbox_id) references outbox (id)
    )
  `);
  await pg.query(`
    create index deliveries_attempt_at_idx
      on deliveries (attempt_at)
  `);

  await pg.query(`
    create table games (
      id uuid not null,
      white_id text not null,
      white_name text not null,
      black_id text not null,
      black_name text not null,
      fen text not null,
      game_over boolean default false,
      num_moves smallint default 0,
      badge text default '',
      created_at timestamp not null,
      updated_at timestamp not null,
      constraint games_pkey
        primary key (id)
    )
  `);
  await pg.query(`
    create index games_updated_at_idx
      on games (updated_at)
  `);

  await pg.query(`
    create table game_objects (
      object_id text not null,
      game_id uuid not null,
      constraint game_objects_pkey
        primary key (object_id),
      constraint game_objects_game_fkey
        foreign key (game_id) references games (id)
    )
  `);

  await pg.query(`
    create table draw_cache (
      id text not null,
      data bytea not null,
      constraint draw_cache_pkey
        primary key (id)
    )
  `);

  await pg.query(`
    create table http_cache (
      id text not null,
      data text not null,
      constraint http_cache_pkey
        primary key (id)
    )
  `);

  await pg.query(`
    create table challenge_board (
      actor_id text not null,
      actor_name text not null,
      bumped_at timestamp not null,
      created_at timestamp not null,
      constraint challenge_board_pkey
        primary key (actor_id)
    )
  `);
  await pg.query(`
    create index challenge_board_bumped_at_idx
      on challenge_board (bumped_at)
  `);
};

export const down: MigrationFunction = async () => {
  throw Error("Not supported");
};
