#!/usr/bin/env node

// This script tests the castling.club server by playing a simple game. It
// expects the server to be running with roughly defaults, except
// APP_DOMAIN="localhost:5080".
//
// Note this script is run outside of the source tree in CI, so dependencies
// are not available.

import assert from "node:assert";
import crypto from "node:crypto";
import http from "node:http";

const origin = "http://localhost:5081";
const appOrigin = "http://localhost:5080";

// CI runs this in a Nix sandbox, so we can't access the network.
// We can get by with a super simple JSON-LD context.
const context = { "@context": `${origin}/context.json` };
const contextDoc = {
  "@context": {
    as: "https://www.w3.org/ns/activitystreams#",
    ldp: "http://www.w3.org/ns/ldp#",
    id: "@id",
    type: "@type",
    inbox: {
      "@id": "ldp:inbox",
      "@type": "@id",
    },
    // ActivityStreams string properties.
    ...Object.fromEntries(
      [
        "Person",
        "Note",
        "Mention",
        "Create",
        "content",
        "preferredUsername",
        "name",
      ].map((prop) => [prop, `as:${prop}`])
    ),
    // ActivityStreams relation properties.
    ...Object.fromEntries(
      ["actor", "object", "attributedTo", "inReplyTo", "tag", "to", "href"].map(
        (prop) => [prop, { "@id": `as:${prop}`, "@type": "@id" }]
      )
    ),
  },
};

/** A simple queue for the inbox of an actor. */
class Inbox {
  constructor() {
    this.list = [];
    this.callbacks = [];
  }

  /** Get the next activity from the queue. */
  pull() {
    return new Promise((resolve) => {
      const activity = this.list.shift();
      activity ? resolve(activity) : this.callbacks.push(resolve);
    });
  }

  /** Insert an activity into the queue. */
  push(activity) {
    const callback = this.callbacks.shift();
    callback ? callback(activity) : this.list.push(activity);
  }

  /** Insert an activity by reading from an HTTP request. */
  async pushRequest(req, res) {
    let activity;
    try {
      req.setEncoding("utf8");
      let data = "";
      for await (const chunk of req) {
        data += chunk;
      }
      activity = JSON.parse(data);
    } catch (err) {
      console.error(err.message);
      res.destroy();
      return;
    }
    res.writeHead(202);
    res.end();
    this.push(activity);
  }
}

const actorA = {
  id: `${origin}/actors/A`,
  inbox: new Inbox(),
};
const actorB = {
  id: `${origin}/actors/B`,
  inbox: new Inbox(),
};

// Minimal ActivityPub server that handles requests from the app.
const server = http.createServer((req, res) => {
  let body = null;
  switch (`${req.method} ${req.url}`) {
    case "GET /context.json":
      body = contextDoc;
      break;
    case "GET /actors/A":
      body = {
        ...context,
        id: actorA.id,
        type: "Person",
        preferredUsername: "A",
        inbox: `${origin}/actors/A/inbox`,
      };
      break;
    case "GET /actors/B":
      body = {
        ...context,
        id: actorB.id,
        type: "Person",
        preferredUsername: "B",
        inbox: `${origin}/actors/B/inbox`,
      };
      break;
    case "POST /actors/A/inbox":
      actorA.inbox.pushRequest(req, res);
      return;
    case "POST /actors/B/inbox":
      actorB.inbox.pushRequest(req, res);
      return;
  }
  if (body) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  } else {
    res.writeHead(400);
    res.end();
  }
});
server.listen(5081);

try {
  const acceptJson = { headers: { Accept: "application/json" } };

  // Do a webfinger lookup to find the King actor document / ID.
  let res = await fetch(`${appOrigin}/.well-known/webfinger?resource=king`);
  const { links } = await res.json();
  const king = links[0].href;

  // Find the inbox for King.
  res = await fetch(king, acceptJson);
  const { inbox } = await res.json();

  // Helper: Send a note to King.
  async function sendToKing(from, to, object) {
    console.log(">>", object.content);
    const noteId = crypto.randomUUID();
    let res = await fetch(inbox, {
      ...acceptJson,
      method: "POST",
      body: JSON.stringify({
        ...context,
        id: `${origin}/posts/${noteId}/activity`,
        type: "Create",
        actor: from.id,
        object: {
          ...object,
          id: `${origin}/posts/${noteId}`,
          type: "Note",
          attributedTo: from.id,
          to: [king, to.id],
        },
      }),
    });
    if (res.status !== 202) {
      throw Error(
        `Unexpected status on King's inbox: ${res.status}\n` +
          (await res.text())
      );
    }
    // Pull from both inboxes, but we care about just one.
    const [activity] = await Promise.all([from.inbox.pull(), to.inbox.pull()]);
    // Verify the object exists by refetching.
    res = await fetch(activity.object.id, acceptJson);
    const reply = await res.json();
    console.log("<<", reply.content);
    return reply;
  }

  // Send a challenge.
  res = await sendToKing(actorA, actorB, {
    content: `<p><a href="${king}">@king</a> I challenge <a href="${actorB.id}">@B</a>!</p>`,
    tag: [
      { type: "Mention", href: king, name: "@king" },
      { type: "Mention", href: actorB, name: "@B" },
    ],
  });
  assert.ok(res.fen); // A success result contains FEN
  let lastKingNoteId = res.id;

  // Fetch the game document.
  res = await fetch(res.game, acceptJson);
  const game = await res.json();

  // Determine who is white (to start).
  let activePlayer = game.whiteActor == actorA.id ? actorA : actorB;
  let otherPlayer = game.blackActor == actorA.id ? actorA : actorB;

  // Play a game. This performs the Fool's Mate.
  const moves = ["e4", "g5", "Nc3", "f5", "Qh5#"];
  for (const move of moves) {
    res = await sendToKing(activePlayer, otherPlayer, {
      inReplyTo: lastKingNoteId,
      content: `<p><a href="${king}">@king</a> ${move}</p>`,
      tag: [{ type: "Mention", href: king, name: "@king" }],
    });
    assert.strictEqual(res.san, move);
    lastKingNoteId = res.id;
    [otherPlayer, activePlayer] = [activePlayer, otherPlayer];
  }
} finally {
  server.close();
}
