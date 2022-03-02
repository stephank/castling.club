import assert from "assert";

import q from "../util/q";
import { CONFIRMATIONS } from "../util/consts";
import { ObjectExt } from "./inbox";
import { OutboxCtrl } from "./outbox";
import { createElement as h, createMention, render } from "../util/html";
import { sample } from "../util/misc";

import {
  Pg,
  insertOrBumpChallengeBoard,
  removeFromChallengeBoard,
} from "../util/model";

export interface ChallengeBoardCtrl {
  handleRequest(object: ObjectExt): Promise<void>;
  handleRemove(object: ObjectExt): Promise<void>;
}

export default async ({
  actorUrl,
  outbox,
  pg,
}: {
  actorUrl: string;
  outbox: OutboxCtrl;
  pg: Pg;
}): Promise<ChallengeBoardCtrl> => {
  // Handle a request to be added to the challenge board.
  const handleRequest: ChallengeBoardCtrl["handleRequest"] = async (object) => {
    await q.transact(pg, async () => {
      const { id, preferredUsername: name = "???" } = object.actor;

      // Update the challenge board.
      const now = new Date();
      const { rows } = await insertOrBumpChallengeBoard(pg, id, name, now);
      assert.strictEqual(rows.length, 1);

      // Build the reply text.
      const replyContent = render([
        h("p", {}, [
          createMention(id, name),
          " ",
          sample(CONFIRMATIONS),
          now.valueOf() === rows[0].createdAt.valueOf()
            ? " You are now on the challenge board."
            : " You have been bumped to the top of the challenge board.",
        ]),
      ]);

      // Create the reply note.
      await outbox.createObject(pg, {
        type: "Note",
        published: now.toISOString(),
        attributedTo: actorUrl,
        inReplyTo: object.id,
        to: [object.actor.id],
        content: replyContent,
        tag: [{ type: "Mention", href: object.actor.id }],
      });
    });
  };

  // Handle a request to be removed from the challenge board.
  const handleRemove: ChallengeBoardCtrl["handleRemove"] = async (object) => {
    await q.transact(pg, async () => {
      const { id, preferredUsername: name = "???" } = object.actor;

      // Update the challenge board.
      const { rowCount } = await removeFromChallengeBoard(pg, object.actor.id);

      // Build the reply text.
      let replyText;
      if (rowCount === 0) {
        replyText = "You are not on the challenge board.";
      } else {
        assert.strictEqual(rowCount, 1);
        replyText = "You've been removed from the challenge board.";
      }
      const replyContent = render([
        h("p", {}, [createMention(id, name), " ", replyText]),
      ]);

      // Create the reply note.
      await outbox.createObject(pg, {
        type: "Note",
        published: new Date().toISOString(),
        attributedTo: actorUrl,
        inReplyTo: object.id,
        to: [object.actor.id],
        content: replyContent,
        tag: [{ type: "Mention", href: object.actor.id }],
      });
    });
  };

  return { handleRequest, handleRemove };
};
