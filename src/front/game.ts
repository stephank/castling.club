import Router from "@koa/router";
import assert from "node:assert";
import createDebug from "debug";
import leven from "leven";
import { Context } from "koa";
import { v4 as uuid } from "uuid";

import createGame, { Game, PrettyMove } from "../util/chess.js";
import { DrawCtrl } from "./draw.js";
import { JsonLdService } from "../shared/jsonld.js";
import { ObjectExt } from "./inbox.js";
import { OutboxCtrl } from "./outbox.js";
import { createElement as h, createMention, render } from "../util/html.js";
import { getActor } from "../util/rdfModel.js";
import { renderPgn } from "../util/pgn.js";
import { renderTemplate } from "../util/fs.js";
import { sample, sortBy } from "../util/misc.js";

import {
  AS,
  AS_CONTEXT,
  CHESS_CONTEXT,
  AS_MIME,
  PGN_MIME,
  KOA_JSON_ACCEPTS,
  SHORT_CACHE_SEC,
  UNICODE_BADGES,
  UNICODE_PIECES,
} from "../util/consts.js";

import {
  Pg,
  GameRow,
  transact,
  getGameById,
  getGameByObjectForUpdate,
  insertGame,
  insertGameObject,
  updateGame,
  getOutboxMovesByGame,
  removeFromChallengeBoard,
} from "../util/model.js";

export interface GameCtrl {
  handleChallenge(object: ObjectExt): Promise<void>;
  handleReply(object: ObjectExt): Promise<boolean>;
}

type GameMeta = Pick<
  GameRow,
  "id" | "badge" | "whiteId" | "whiteName" | "blackId" | "blackName"
>;

const UUID_REGEXP =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// What kind of actors can be challengers.
const CHALLENGER_TYPES = new Set([AS("Person")]);
// What kind of actors can be challenged.
const CHALLENGED_TYPES = new Set([
  AS("Person"),
  AS("Service"),
  AS("Application"),
]);

const debug = createDebug("chess:game");

export default async ({
  actorUrl,
  domain,
  draw,
  jsonld,
  origin,
  outbox,
  pg,
  router,
}: {
  actorUrl: string;
  domain: string;
  draw: DrawCtrl;
  jsonld: JsonLdService;
  origin: string;
  outbox: OutboxCtrl;
  pg: Pg;
  router: Router;
}): Promise<GameCtrl> => {
  // Handle challenges, and start a new game if everything looks good.
  const handleChallenge: GameCtrl["handleChallenge"] = async (object) => {
    // Verify the actor is a type that can be issue challenges.
    const challengerActor = object.actor;
    if (!CHALLENGER_TYPES.has(challengerActor.type || "")) {
      debug("Challenge from invalid actor type");
      return;
    }

    // The note usually mentions us, and must mention exactly one other.
    const mentions = new Set(object.mentions);
    mentions.delete(actorUrl);
    mentions.delete(challengerActor.id);
    if (mentions.size !== 1) {
      debug("Challenge contained invalid mentions");
      return;
    }

    // Load the actor document of the other player.
    const otherId = mentions.values().next().value;
    const store = jsonld.createStore();
    try {
      await store.load(otherId);
    } catch (err: any) {
      console.log(`Failed to load challenged actor document: ${otherId}`);
      console.log(`Error: ${err.message}`);
      return;
    }

    const otherActor = getActor(store, otherId);

    // Verify the other player actor is a type that can be challenged.
    if (!CHALLENGED_TYPES.has(otherActor.type || "")) {
      debug("Challenge to invalid actor type");
      return;
    }

    // Pick sides.
    const [whiteActor, blackActor] =
      Math.random() > 0.5
        ? [challengerActor, otherActor]
        : [otherActor, challengerActor];

    // Create the game.
    const game = createGame();
    const row = {
      id: uuid(),
      badge: sample(UNICODE_BADGES),
      whiteId: whiteActor.id,
      whiteName: whiteActor.preferredUsername || "???",
      blackId: blackActor.id,
      blackName: blackActor.preferredUsername || "???",
    };

    await transact(pg, async (pg) => {
      const now = new Date();

      // Create the game record.
      const { rowCount } = await insertGame(
        pg,
        row.id,
        row.whiteId,
        row.whiteName,
        row.blackId,
        row.blackName,
        game.fen(),
        row.badge,
        now,
      );
      assert.strictEqual(rowCount, 1);

      // Mark the message as related to the game.
      await insertGameObjectChecked(pg, row.id, object.id);

      // Remove the other player from the challenge board, if present.
      await removeFromChallengeBoard(pg, otherActor.id);

      // Finish up with a reply.
      await finishWithReply(pg, object, game, row, {
        createdAt: now,
      });
    });
  };

  // Handle replies to see if they belong to a game and contain a move.
  // Returns `true` if the object belongs to a game.
  const handleReply: GameCtrl["handleReply"] = async (object) => {
    let result = false;
    await transact(pg, async (pg) => {
      // Look up the game.
      const { rows: gameRows } = await getGameByObjectForUpdate(
        pg,
        object.inReplyTo!,
      );
      if (gameRows.length !== 1) {
        debug("Reply unrelated to a game");
        return;
      }

      // Restore the game.
      const row = gameRows[0];
      const game = createGame(row.fen);

      // Mark the message as related to the game.
      await insertGameObjectChecked(pg, row.id, object.id);
      result = true;

      // Check if the game is still in play.
      if (game.isGameOver()) {
        debug("Reply to finished game");
        return;
      }

      // Check if the correct side is trying to make a move.
      const turnId = game.turn() === "w" ? row.whiteId : row.blackId;
      if (object.actor.id !== turnId) {
        debug("Reply from wrong actor");
        return;
      }

      // Extract the SAN move from the text.
      const input = object.contentText
        // Strip inline mentions, which may prefix the move.
        .replace(/@[^\s]*/g, "")
        // Strip whitespace.
        .trim()
        // The first 'word' should now be the move; strip the rest.
        // A dot/period can also be used to have the bot ignore a reply.
        .replace(/[?!.,;\s].*$/, "");
      if (!input) {
        debug("Reply contained no move");
        return;
      }

      // Try to make the move.
      const move = game.move(input);
      if (!move) {
        debug("Reply contained invalid move");
        await suggestMove(pg, object, game, row, input);
        return;
      }

      // Save the new game state.
      const now = new Date();
      const { rowCount } = await updateGame(
        pg,
        row.id,
        game.fen(),
        game.isGameOver(),
        now,
      );
      assert.strictEqual(rowCount, 1);

      // Finish up with a reply.
      await finishWithReply(pg, object, game, row, { move });
    });
    return result;
  };

  // Finish up a succesful action by creating a reply, and marking both notes
  // as part of the game. Returns the reply note.
  const finishWithReply = async (
    pg: Pg,
    object: ObjectExt,
    game: Game,
    row: GameMeta,
    opts: { move?: PrettyMove; createdAt?: Date } = {},
  ): Promise<void> => {
    const move = opts.move;

    let line1, line2, line3;

    // Describe the last move.
    if (move) {
      const piece = UNICODE_PIECES[move.color + move.piece];
      const opponent = move.color === "w" ? "b" : "w";

      let descr;
      if (move.flags.includes("k")) {
        descr = `${piece} castled king-side`;
      } else if (move.flags.includes("q")) {
        descr = `${piece} castled queen-side`;
      } else {
        descr = `${piece} ${move.from} → ${move.to}`;
        if (move.flags.includes("p")) {
          const promotion = UNICODE_PIECES[move.color + move.promotion];
          descr += `, promoted to ${promotion}`;
        } else if (move.flags.includes("c")) {
          const captured = UNICODE_PIECES[opponent + move.captured];
          descr += `, captured ${captured}`;
        } else if (move.flags.includes("e")) {
          const captured = UNICODE_PIECES[opponent + move.captured];
          descr += `, en passant captured ${captured}`;
        }
      }

      // Note: there's an en-space after the badge.
      // eslint-disable-next-line no-irregular-whitespace
      line1 = [`${row.badge} [${move.number}. ${move.san}] ${descr}`];
    } else {
      // Note: there's an en-space after the badge.
      line1 = [
        // eslint-disable-next-line no-irregular-whitespace
        `${row.badge} ♙ `,
        createMention(row.whiteId, row.whiteName),
        " vs. ♟ ",
        createMention(row.blackId, row.blackName),
      ];

      // Add the game URL to the setup note.
      const gameUrl = `${origin}/games/${row.id}`;
      line3 = [
        "View the full game at any time at: ",
        h("a", { href: gameUrl }, [gameUrl]),
      ];
    }

    // Describe the next move or ending condition.
    if (game.isInCheckmate()) {
      line2 = ["Checkmate."];
    } else if (game.isInDraw()) {
      line2 = ["Draw."];
    } else {
      line2 = [
        game.turn() === "w"
          ? createMention(row.whiteId, row.whiteName)
          : createMention(row.blackId, row.blackName),
        "'s turn",
      ];
      if (game.isInCheck()) {
        line2.push(" (Check)");
      }
      if (!move) {
        line2.push(", reply with your move.");
      }
    }

    const replyContent = [h("p", {}, line1), h("p", {}, line2)];
    if (line3) {
      replyContent.push(h("p", {}, line3));
    }

    // Create the reply note.
    const fen = game.fen();
    const images = draw.imageUrls(fen, move);
    const createdAt = opts.createdAt || new Date();
    const replyId = await outbox.createObject(pg, {
      "@context": [AS_CONTEXT, CHESS_CONTEXT],
      type: "Note",
      published: createdAt.toISOString(),
      attributedTo: actorUrl,
      inReplyTo: object.id,
      // @todo: Disabled for now, but maybe should be configurable?
      // @todo: Mastodon requires us to specify this in full.
      // to: [AS("Public")],
      // cc: [row.whiteId, row.blackId],
      to: [row.whiteId, row.blackId],
      content: render(replyContent),
      attachment: [
        {
          type: "Image",
          mediaType: "image/png",
          url: images.moveImage,
        },
      ],
      tag: [
        { type: "Mention", href: row.whiteId },
        { type: "Mention", href: row.blackId },
      ],
      game: `${origin}/games/${row.id}`,
      san: move ? move.san : undefined,
      fen,
      ...images,
    });

    // Mark our reply as related to the game.
    await insertGameObjectChecked(pg, row.id, replyId);
  };

  // Create a reply suggesting a move, after invalid input.
  const suggestMove = async (
    pg: Pg,
    object: ObjectExt,
    game: Game,
    row: GameMeta,
    input: string,
  ): Promise<void> => {
    // Get the 5 best matching moves, and turn them into text.
    const moves = sortBy([...game.moves()], (move) => leven(input, move))
      .slice(0, 5)
      .map((x) => `'${x}'`);
    assert(moves.length >= 1);

    const lastMove = moves.pop();
    const movesText =
      moves.length === 0 ? lastMove : `${moves.join(", ")} or ${lastMove}`;

    // Craft a hilarious reply.
    const actor = object.actor;
    const replyContent = render(
      h("p", {}, [
        createMention(actor.id, actor.preferredUsername || "???"),
        " ",
        sample([
          "That appears to be invalid!",
          "I can't make that work, I'm afraid.",
          "Does not compute!",
          "I don't know what to do with that.",
          "A small misunderstanding.",
        ]),
        " ",
        sample([
          `Perhaps you want ${movesText}?`,
          `Did you mean ${movesText}?`,
          `Maybe ${movesText}?`,
          `Looking for ${movesText}?`,
        ]),
      ]),
    );

    // Create the reply note.
    const replyId = await outbox.createObject(pg, {
      "@context": [AS_CONTEXT, CHESS_CONTEXT],
      type: "Note",
      published: new Date().toISOString(),
      attributedTo: actorUrl,
      inReplyTo: object.id,
      to: [actor.id],
      content: replyContent,
      tag: [{ type: "Mention", href: actor.id }],
      game: `${origin}/games/${row.id}`,
    });

    // Mark our reply as related to the game.
    await insertGameObjectChecked(pg, row.id, replyId);
  };

  // Mark an object as related to a game.
  // Replies to the object are then also matched to the game.
  const insertGameObjectChecked = async (
    pg: Pg,
    gameId: string,
    objectId: string,
  ): Promise<void> => {
    const { rowCount } = await insertGameObject(pg, gameId, objectId);
    assert.strictEqual(rowCount, 1);
  };

  // Complete representation of a game.
  router.get("/games/:id", async (ctx: Context) => {
    ctx.assert(UUID_REGEXP.test(ctx.params.id), 404, "Game not found");

    const { rows: gameRows } = await getGameById(pg, ctx.params.id);
    ctx.assert(gameRows.length === 1, 404, "Game not found");

    const gameRow = gameRows[0];
    const { rows: moveRows } = await getOutboxMovesByGame(pg, gameRow.id);
    ctx.assert(moveRows.length >= 1);

    const notes = moveRows.map((row) => ({
      ...row.object,
      "@context": undefined,
    }));
    const game = {
      "@context": [AS_CONTEXT, CHESS_CONTEXT],
      id: `${origin}/games/${gameRow.id}`,
      fen: gameRow.fen,
      badge: gameRow.badge,
      whiteActor: gameRow.whiteId,
      blackActor: gameRow.blackId,
      whiteUsername: gameRow.whiteName,
      blackUsername: gameRow.blackName,
      setupNote: notes[0],
      moves: notes.slice(1),
    };

    // Shorter cache for games that are in-progress.
    if (!gameRow.gameOver) {
      ctx.set("Cache-Control", `public, max-age=${SHORT_CACHE_SEC}`);
    }

    const wantPgn = ctx.query.pgn !== undefined;
    wantPgn || ctx.response.vary("accept");
    if (!wantPgn && ctx.accepts("html")) {
      ctx.body = await renderTemplate("game", { domain, game });
      ctx.type = "html";
    } else if (wantPgn || ctx.accepts(PGN_MIME)) {
      ctx.body = renderPgn({ game, origin });
      ctx.type = PGN_MIME;
      ctx.attachment(`${gameRow.id}.pgn`);
    } else if (ctx.accepts(KOA_JSON_ACCEPTS)) {
      ctx.body = game;
      ctx.type = AS_MIME;
    } else {
      ctx.status = 406;
    }
  });

  return { handleChallenge, handleReply };
};
