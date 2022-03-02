import q, { Pg, QueryResult } from "./q";

export { Pg };
export const transact = q.transact;

// Convenience type for a promise for a query result.
export type QueryPromise<T> = Promise<QueryResult<T>>;
// Base signature of all our query functions.
export type QueryFunction<T> = (pg: Pg, ...args: any[]) => QueryPromise<T>;
// Given a query function, gets the type of rows returned.
export type QueryReturn<F> = F extends QueryFunction<infer T> ? T : never;

// A query result with empty rows.
export type EmptyResult = QueryResult<{}>;
export type EmptyPromise = QueryPromise<{}>;

// A query result for a selection of model fields.
export type ModelResult<T, F extends keyof T = keyof T> = QueryResult<
  Pick<T, F>
>;
export type ModelPromise<T, F extends keyof T = keyof T> = QueryPromise<
  Pick<T, F>
>;

export interface InboxRow {
  activityId: string;
  createdAt: Date;
}

export interface OutboxRow {
  id: string;
  object: any;
  activity: any;
  hasFen: boolean;
  createdAt: Date;
}

export interface DeliveryRow {
  outboxId: string;
  addressee: string;
  inbox: string;
  attemptAt: Date;
  attemptNum: number;
}

export interface GameRow {
  id: string;
  whiteId: string;
  whiteName: string;
  blackId: string;
  blackName: string;
  fen: string;
  gameOver: boolean;
  numMoves: number;
  badge: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface GameObjectRow {
  objectId: string;
  gameId: string;
}

export interface DrawCacheRow {
  id: string;
  data: Buffer;
}

export interface HttpCacheRow {
  id: string;
  data: string;
}

export interface ChallengeBoardRow {
  actorId: string;
  actorName: string;
  bumpedAt: Date;
  createdAt: Date;
}

export const tryInsertInboxObject = async (
  pg: Pg,
  activityId: string,
  createdAt: Date
): EmptyPromise =>
  q(pg)`
    -- try insert inbox object
    insert into inbox (activity_id, created_at)
    values (${activityId}, ${createdAt})
    on conflict (activity_id) do nothing
  `;

export const insertOutboxObject = async (
  pg: Pg,
  id: string,
  object: any,
  activity: any,
  createdAt: Date
): EmptyPromise =>
  q(pg)`
    -- insert outbox object
    insert into outbox (id, object, activity, has_fen, created_at)
    values (${id}, ${object}, ${activity}, ${!!object.fen}, ${createdAt})
  `;

export const insertDelivery = async (
  pg: Pg,
  id: string,
  addressee: string,
  createdAt: Date
): EmptyPromise =>
  q(pg)`
    -- insert delivery
    insert into deliveries (outbox_id, addressee, attempt_at)
    values (${id}, ${addressee}, ${createdAt})
  `;

export const getOutboxObjectById = async (
  pg: Pg,
  id: string
): ModelPromise<OutboxRow, "object" | "hasFen" | "createdAt"> =>
  q(pg)`
    -- get outbox object by id
    select object, has_fen, created_at
    from outbox
    where id = ${id}
  `;

export const getPrevOutboxMoveId = async (
  pg: Pg,
  gameId: string,
  refCreatedAt: Date
): ModelPromise<OutboxRow, "id"> =>
  q(pg)`
    -- get prev outbox move id
    select id
    from outbox
    where
      id in (
        select object_id
        from game_objects
        where game_id = ${gameId}
      ) and
      has_fen = true and
      created_at < ${refCreatedAt}
    order by created_at desc
    limit 1
  `;

export const getNextOutboxMoveId = async (
  pg: Pg,
  gameId: string,
  refCreatedAt: Date
): ModelPromise<OutboxRow, "id"> =>
  q(pg)`
    -- get next outbox move id
    select id
    from outbox
    where
      id in (
        select object_id
        from game_objects
        where game_id = ${gameId}
      ) and
      has_fen = true and
      created_at > ${refCreatedAt}
    order by created_at asc
    limit 1
  `;

export const getGameOverById = async (
  pg: Pg,
  id: string
): ModelPromise<GameRow, "gameOver"> =>
  q(pg)`
    -- get game over by id
    select game_over
    from games
    where id = ${id}
  `;

export const getOutboxActivityById = async (
  pg: Pg,
  id: string
): ModelPromise<OutboxRow, "activity" | "hasFen"> =>
  q(pg)`
    -- get outbox activity by id
    select activity, has_fen
    from outbox
    where id = ${id}
  `;

export const lockSharedAddresseeDeliveries = async (
  pg: Pg,
  addressee: string
): ModelPromise<DeliveryRow, "outboxId"> =>
  q(pg)`
    -- lock shared addressee deliveries
    select outbox_id from deliveries
    where
      addressee = ${addressee} and
      inbox is null
    for update skip locked
  `;

export const updateDeliveryInboxByAddressee = async (
  pg: Pg,
  outboxIds: string[],
  addressee: string,
  inbox: string,
  attemptAt: Date
): EmptyPromise =>
  q(pg)`
    -- update delivery inbox by addressee
    update deliveries set
      inbox = ${inbox},
      attempt_at = ${attemptAt},
      attempt_num = 0
    where
      outbox_id = any (${outboxIds}) and
      addressee = ${addressee}
  `;

export const lockSharedInboxDeliveries = async (
  pg: Pg,
  outboxId: string,
  inbox: string
): ModelPromise<DeliveryRow, "addressee"> =>
  q(pg)`
    -- lock shared inbox deliveries
    select addressee from deliveries
    where
      outbox_id = ${outboxId} and
      inbox = ${inbox}
    for update skip locked
  `;

export const getOutboxById = async (
  pg: Pg,
  id: string
): ModelPromise<OutboxRow, "object" | "activity"> =>
  q(pg)`
    -- get outbox by id
    select object, activity
    from outbox
    where id = ${id}
  `;

export const updateDeliveryAttemptByAddressees = async (
  pg: Pg,
  outboxId: string,
  addressees: string[],
  attemptAt: Date,
  attemptNum: number
): EmptyPromise =>
  q(pg)`
    -- update delivery attempt by addressees
    update deliveries set
      attempt_at = ${attemptAt},
      attempt_num = ${attemptNum}
    where
      outbox_id = ${outboxId} and
      addressee = any (${addressees})
  `;

export const deleteDeliveriesByAddressees = async (
  pg: Pg,
  outboxId: string,
  addressees: string[]
): EmptyPromise =>
  q(pg)`
    -- delete deliveries by addressees
    delete from deliveries
    where
      outbox_id = ${outboxId} and
      addressee = any (${addressees})
  `;

export const getNextDelivery = async (pg: Pg): ModelPromise<DeliveryRow> =>
  q(pg)`
    -- get next delivery
    select outbox_id, addressee, inbox, attempt_at, attempt_num
    from deliveries
    order by attempt_at asc
    limit 1
    for update skip locked
  `;

export const getGameByObjectForUpdate = async (
  pg: Pg,
  objectId: string
): ModelPromise<
  GameRow,
  "id" | "whiteId" | "whiteName" | "blackId" | "blackName" | "fen" | "badge"
> =>
  q(pg)`
    -- get game by object for update
    select id, white_id, white_name, black_id, black_name, fen, badge
    from games
    where id = (
      select game_id
      from game_objects
      where object_id = ${objectId}
    )
    for update
  `;

export const updateGame = async (
  pg: Pg,
  id: string,
  fen: string,
  gameOver: boolean,
  updatedAt: Date
): EmptyPromise =>
  q(pg)`
    -- update game
    update games
    set
      fen = ${fen},
      game_over = ${gameOver},
      num_moves = num_moves + 1,
      updated_at = ${updatedAt}
    where
      id = ${id}
  `;

export const insertGame = async (
  pg: Pg,
  id: string,
  whiteId: string,
  whiteName: string,
  blackId: string,
  blackName: string,
  fen: string,
  badge: string,
  createdAt: Date
): EmptyPromise =>
  q(pg)`
    -- insert game
    insert into games (
      id,
      white_id,
      white_name,
      black_id,
      black_name,
      fen,
      badge,
      created_at,
      updated_at
    ) values (
      ${id},
      ${whiteId},
      ${whiteName},
      ${blackId},
      ${blackName},
      ${fen},
      ${badge},
      ${createdAt},
      ${createdAt}
    )
  `;

export const insertGameObject = async (
  pg: Pg,
  gameId: string,
  objectId: string
): EmptyPromise =>
  q(pg)`
    -- insert game object
    insert into game_objects (object_id, game_id)
    values (${objectId}, ${gameId})
  `;

export const getGameById = async (
  pg: Pg,
  id: string
): ModelPromise<
  GameRow,
  | "id"
  | "whiteId"
  | "whiteName"
  | "blackId"
  | "blackName"
  | "fen"
  | "badge"
  | "gameOver"
> =>
  q(pg)`
    -- get game by id
    select
      id,
      white_id,
      white_name,
      black_id,
      black_name,
      fen,
      badge,
      game_over
    from
      games
    where
      id = ${id}
  `;

export const getOutboxMovesByGame = async (
  pg: Pg,
  gameId: string
): ModelPromise<OutboxRow, "object"> =>
  q(pg)`
    -- get outbox moves by game
    select object
    from outbox
    where
      id in (
        select object_id
        from game_objects
        where game_id = ${gameId}
      ) and
      has_fen = true
    order by created_at asc
  `;

export const getRecentGames = async (
  pg: Pg
): ModelPromise<
  GameRow,
  "id" | "whiteName" | "blackName" | "numMoves" | "updatedAt"
> =>
  q(pg)`
    -- get recent games
    select id, white_name, black_name, num_moves, updated_at
    from games
    where num_moves > 6
    order by updated_at desc
    limit 25
  `;

export const getChallengeBoard = async (
  pg: Pg
): ModelPromise<ChallengeBoardRow, "actorId" | "actorName"> =>
  q(pg)`
    -- get challenge board
    select actor_id, actor_name
    from challenge_board
    order by bumped_at desc
    limit 50
  `;

export const insertOrBumpChallengeBoard = async (
  pg: Pg,
  actorId: string,
  actorName: string,
  now: Date
): ModelPromise<ChallengeBoardRow, "createdAt"> =>
  q(pg)`
    -- insert or bump challenge board
    insert into challenge_board (actor_id, actor_name, bumped_at, created_at)
    values (${actorId}, ${actorName}, ${now}, ${now})
    on conflict (actor_id) do update set
      actor_name = ${actorName},
      bumped_at = ${now}
    returning created_at
  `;

export const removeFromChallengeBoard = async (
  pg: Pg,
  actorId: string
): EmptyPromise =>
  q(pg)`
    -- remove from challenge board
    delete from challenge_board
    where actor_id = ${actorId}
  `;
