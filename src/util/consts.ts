import path from "path";

import { ns, words } from "./misc";

export const ASSETS_BASE = path.join(__dirname, "../../assets");

// Various RDF namespaces used.
export const XML = ns("http://www.w3.org/2001/XMLSchema#");
export const RDF = ns("http://www.w3.org/1999/02/22-rdf-syntax-ns#");
export const LDP = ns("http://www.w3.org/ns/ldp#");
export const AS = ns("https://www.w3.org/ns/activitystreams#");
export const SEC = ns("https://w3id.org/security#");
export const CHESS = ns("https://castling.club/ns/chess/v0#");

// Various JSON-LD contexts used.
export const AS_CONTEXT = "https://www.w3.org/ns/activitystreams";
export const SEC_CONTEXT = "https://w3id.org/security/v1";
export const CHESS_CONTEXT = "https://castling.club/ns/chess/v0";

// Various MIME types used.
export const JSON_MIME = "application/json";
export const JSON_LD_MIME = "application/ld+json";
export const AS_MIME = `${JSON_LD_MIME}; profile="${AS_CONTEXT}"`;
export const LEGACY_AS_MIME = "application/activity+json";
export const CHESS_MIME = `${JSON_LD_MIME}; profile="${CHESS_CONTEXT}"`;
export const PGN_MIME = "application/vnd.chess-pgn";

// The `Accept` header value we send out when requesting JSON-LD.
export const JSON_ACCEPTS = [
  AS_MIME,
  LEGACY_AS_MIME,
  JSON_LD_MIME,
  JSON_MIME,
].join(",");

// Koa `accepts` parameter, listing all types we respond to with JSON.
export const KOA_JSON_ACCEPTS = [
  "json",
  JSON_LD_MIME,
  AS_MIME,
  LEGACY_AS_MIME,
  CHESS_MIME,
];

// For signed requests we receive, the leeway allowed in the `Date` header.
export const SIGNATURE_LEEWAY = 30 * 1000;

// Default cache duration for static resources.
export const DEFAULT_CACHE_SEC = 14 * 24 * 60 * 60;
// Short cache duration, used for resources describing games in progress.
export const SHORT_CACHE_SEC = 5 * 60;
// Tiny cache duration, used for the front page.
export const TINY_CACHE_SEC = 30;

// Badges used to tag related notes for each game.
export const UNICODE_BADGES = words(`
  🐝 🐍 🐴 🦇 🐳 🐙 🐷 🐛 🍄 🐠 🦀 🐊 🦒 🐇 ☘ ️🍁 🌷 🌻 🌍 🌈 🌪 🔥 ☄ ️☂ ️⛅ ️🕷
  🌵 🌴 🌳 🦋 🦄 🐚 🐌 🐜 🐼 🐸 🐵 🐭 🍏 🥥 🍉 🌶 🍔 🍕 🍌 🍒 🍭 🍩 ⚽ ️🏀 🏈 🎱
`);

// Map of chess pieces to their unicode characters.
export const UNICODE_PIECES: { [piece: string]: string } = {
  wp: "♙",
  wn: "♘",
  wb: "♗",
  wr: "♖",
  wq: "♕",
  wk: "♔",
  bp: "♟",
  bn: "♞",
  bb: "♝",
  br: "♜",
  bq: "♛",
  bk: "♚",
};

// Generic confirmations, which should be followed by a description.
export const CONFIRMATIONS = [
  "OK!",
  "Splendid!",
  "Perfect!",
  "Awesome!",
  "Great!",
  "Marvelous!",
  "Dope!",
  "Whicked!",
  "Cool!",
  "Superb!",
  "Nice!",
];
