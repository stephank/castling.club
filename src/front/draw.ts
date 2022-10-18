import Router from "@koa/router";
import assert from "assert";
import crypto from "crypto";
import { Context } from "koa";
import { Image, createCanvas, loadImage, registerFont } from "canvas";

import { ASSETS_BASE } from "../util/consts.js";
import { CacheService } from "../shared/cache.js";
import { PrettyMove } from "../util/chess.js";
import { words } from "../util/misc.js";

export interface ImageUrls {
  boardImage: string;
  boardImageWhite: string;
  boardImageBlack: string;
  moveImage: string;
  moveImageWhite: string;
  moveImageBlack: string;
}

export interface DrawCtrl {
  draw(slug: string): Promise<Buffer>;
  imageUrls(fen: string, move?: PrettyMove): ImageUrls;
}

const { PI, atan2, cos, hypot, sin } = Math;
const HALF_PI = PI / 2;
const CC_LOWER_A = "a".charCodeAt(0);

const BACKGROUND_STYLE = "#fff";
const LABEL_FILL_STYLE = "#444";
const LIGHT_SQUARE_STYLE = "#ffce9e";
const DARK_SQUARE_STYLE = "#d18b47";
const LINE_FILL_STYLE = "#c00";

// Size of the margin.
const MARGIN_SIZE = 80;
// Size of a single board square.
const SQUARE_SIZE = 140;
// Padding around the piece within a board square.
const SQUARE_PADDING_SIZE = 8;

// Length to cut off the end of a move arrow, to not overlap the piece.
const LINE_END_CUT = 45;
// Minimum distance of a move arrow before it curves.
// (In practice, starts at a knight's move, or a bishop moving more than 2.)
const LINE_CURVE_MIN_DIST = 300;
// Amount to curve the arrow as a factor of arrow length.
const LINE_CURVE_FACTOR = 0.3;
// Base width of the arrow.
const LINE_CURVE_WIDTH_BASE = 8;
// Factor of arrow length to add to the arrow base width.
const LINE_CURVE_WIDTH_FACTOR = 0.02;
// Base size of the arrow head.
const CAP_SIZE_BASE = 50;
// Factor of arrow length to add to the arrow head base size.
const CAP_SIZE_FACTOR = 0.005;
// Indent size of the arrow head, as factor of arrow size.
const CAP_INDENT_FACTOR = 0.8;
// Arrow head angle in radians. This is half the total angle of the arrow head.
const CAP_WIDTH_ANGLE = 0.3;

// Derived constants.
const BOARD_SIZE = SQUARE_SIZE * 8;
const IMAGE_SIZE = BOARD_SIZE + MARGIN_SIZE * 2;
const HALF_MARGIN_SIZE = MARGIN_SIZE / 2;
const HALF_SQUARE_SIZE = SQUARE_SIZE / 2;
const SQUARE_IMAGE_SIZE = SQUARE_SIZE - 2 * SQUARE_PADDING_SIZE;

const LEFT_MARGIN_CENTER = HALF_MARGIN_SIZE;
const RIGHT_MARGIN_CENTER = IMAGE_SIZE - HALF_MARGIN_SIZE;
const TOP_MARGIN_CENTER = HALF_MARGIN_SIZE;
const BOTTOM_MARGIN_CENTER = IMAGE_SIZE - HALF_MARGIN_SIZE;

// Setup the label font.
const FONT = "48px DejaVuSans";
const fontPath = new URL("DejaVuSans.ttf", ASSETS_BASE);
registerFont(fontPath.pathname, { family: "DejaVuSans" });

export default async ({
  cache,
  hmacSecret,
  origin,
  router,
}: {
  cache: CacheService;
  hmacSecret: string;
  origin: string;
  router: Router;
}): Promise<DrawCtrl> => {
  // Preload piece images and put them in a map by name.
  const pieceImages = await (async () => {
    const names = words(`
      wb wk wn wp wq wr
      bb bk bn bp bq br
    `);

    const obj: { [piece: string]: Image } = {};
    for (const name of names) {
      const imagePath = new URL(`img/${name}.png`, ASSETS_BASE);
      obj[name] = await loadImage(imagePath.pathname);
    }
    return obj;
  })();

  // Decode slug format into an array of pieces.
  // Trusts input, assuming the HMAC signature was already verified.
  const decodeSlug = (
    slug: string
  ): {
    pieces: string[];
    side: string;
    move?: { from: string; to: string };
  } => {
    // Extract move if present.
    const match = /-([a-h][1-8])([a-h][1-8])$/.exec(slug);
    const move = match
      ? {
          from: match[1],
          to: match[2],
        }
      : undefined;

    // Take individual characters.
    const chrs = Array.from(match ? slug.slice(0, -5) : slug);
    // Extract side.
    const side = chrs.pop()!;

    // Extract the board pieces.
    const pieces = new Array(64);
    let idx = 0;
    for (const chr of chrs) {
      if (/[rnbqkp]/.test(chr)) {
        pieces[idx++] = "b" + chr;
      } else if (/[RNBQKP]/.test(chr)) {
        pieces[idx++] = "w" + chr.toLowerCase();
      } else if (/[1-8]/.test(chr)) {
        let empties = parseInt(chr, 10);
        while (empties--) {
          pieces[idx++] = "";
        }
      }
    }
    assert.strictEqual(idx, 64);

    return { pieces, side, move };
  };

  // Draw a board state and return a PNG buffer.
  // Trusts input, assuming the HMAC signature was already verified.
  const draw: DrawCtrl["draw"] = async (slug) => {
    const { pieces, side, move } = decodeSlug(slug);

    // Create and configure the canvas.
    const canvas = createCanvas(IMAGE_SIZE, IMAGE_SIZE);
    const ctx = canvas.getContext("2d");
    ctx.font = FONT;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Draw the background.
    ctx.fillStyle = BACKGROUND_STYLE;
    ctx.fillRect(0, 0, IMAGE_SIZE, IMAGE_SIZE);

    // Fill the board with the light background, initially.
    ctx.fillStyle = LIGHT_SQUARE_STYLE;
    ctx.fillRect(MARGIN_SIZE, MARGIN_SIZE, BOARD_SIZE, BOARD_SIZE);

    // Walk the board squares to draw dark squares and pieces.
    // The loop coordinates are array coordinates.
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        // Determine base pixel coordinates (top-left corner)
        const pixelX = MARGIN_SIZE + x * SQUARE_SIZE;
        const pixelY = MARGIN_SIZE + y * SQUARE_SIZE;

        // Determine board coordinates, based on perspective.
        const realX = side === "w" ? x : 7 - x;
        const realY = side === "b" ? y : 7 - y;

        // Redraw the background, if a dark square.
        if (((realY % 2) + realX) % 2 === 0) {
          ctx.fillStyle = DARK_SQUARE_STYLE;
          ctx.fillRect(pixelX, pixelY, SQUARE_SIZE, SQUARE_SIZE);
        }

        // Draw the piece.
        const piece = pieces[(7 - realY) * 8 + realX];
        if (piece) {
          const image = pieceImages[piece];
          ctx.drawImage(
            image,
            pixelX + SQUARE_PADDING_SIZE,
            pixelY + SQUARE_PADDING_SIZE,
            SQUARE_IMAGE_SIZE,
            SQUARE_IMAGE_SIZE
          );
        }
      }
    }

    // Draw the labels in the margin.
    ctx.fillStyle = LABEL_FILL_STYLE;
    for (let x = 0; x < 8; x++) {
      const centerX = MARGIN_SIZE + x * SQUARE_SIZE + HALF_SQUARE_SIZE;
      const realX = side === "w" ? x : 7 - x;
      const char = String.fromCharCode(CC_LOWER_A + realX);
      ctx.fillText(char, centerX, TOP_MARGIN_CENTER);
      ctx.fillText(char, centerX, BOTTOM_MARGIN_CENTER);
    }
    for (let y = 0; y < 8; y++) {
      const centerY = MARGIN_SIZE + y * SQUARE_SIZE + HALF_SQUARE_SIZE;
      const realY = side === "b" ? y : 7 - y;
      const char = `${realY + 1}`;
      ctx.fillText(char, LEFT_MARGIN_CENTER, centerY);
      ctx.fillText(char, RIGHT_MARGIN_CENTER, centerY);
    }

    // Draw an arrow for the move.
    if (move) {
      const { from, to } = move;

      // Translate to board coordinates.
      const fromRealX = from.charCodeAt(0) - CC_LOWER_A;
      const fromRealY = parseInt(from[1], 10) - 1;
      const toRealX = to.charCodeAt(0) - CC_LOWER_A;
      const toRealY = parseInt(to[1], 10) - 1;

      // Translate to array coordinates.
      const fromX = side === "w" ? fromRealX : 7 - fromRealX;
      const fromY = side === "b" ? fromRealY : 7 - fromRealY;
      const toX = side === "w" ? toRealX : 7 - toRealX;
      const toY = side === "b" ? toRealY : 7 - toRealY;

      // Determine pixel center coordinates.
      const fromCenterX = MARGIN_SIZE + fromX * SQUARE_SIZE + HALF_SQUARE_SIZE;
      const fromCenterY = MARGIN_SIZE + fromY * SQUARE_SIZE + HALF_SQUARE_SIZE;
      const toCenterX = MARGIN_SIZE + toX * SQUARE_SIZE + HALF_SQUARE_SIZE;
      const toCenterY = MARGIN_SIZE + toY * SQUARE_SIZE + HALF_SQUARE_SIZE;

      // Find the middle point of the line segment.
      const distX = toCenterX - fromCenterX;
      const distY = toCenterY - fromCenterY;
      const midX = fromCenterX + distX / 2;
      const midY = fromCenterY + distY / 2;

      // Find the control points for the curve.
      const dist = hypot(distX, distY);
      const curveWidth = LINE_CURVE_WIDTH_BASE + dist * LINE_CURVE_WIDTH_FACTOR;
      const angle = atan2(toCenterX - fromCenterX, toCenterY - fromCenterY);
      const anglePerp = angle + HALF_PI;
      const [sinPerp, cosPerp] = [sin(anglePerp), cos(anglePerp)];
      const curveFactor = dist >= LINE_CURVE_MIN_DIST ? LINE_CURVE_FACTOR : 0;
      const ctrlX = midX + sinPerp * dist * curveFactor;
      const ctrlY = midY + cosPerp * dist * curveFactor;
      const ctrlInnerX = ctrlX - sinPerp * curveWidth;
      const ctrlInnerY = ctrlY - cosPerp * curveWidth;
      const ctrlOuterX = ctrlX + sinPerp * curveWidth;
      const ctrlOuterY = ctrlY + cosPerp * curveWidth;

      // Shorten the line segment a bit at the end, towards the control.
      const angleControl = atan2(toCenterX - ctrlX, toCenterY - ctrlY);
      const endX = toCenterX - sin(angleControl) * LINE_END_CUT;
      const endY = toCenterY - cos(angleControl) * LINE_END_CUT;

      // Find the cap angle and size.
      const longCapSize = CAP_SIZE_BASE + dist * CAP_SIZE_FACTOR;
      const shortCapSize = longCapSize * CAP_INDENT_FACTOR;

      // Draw the array curved line segment.
      ctx.fillStyle = LINE_FILL_STYLE;
      ctx.beginPath();
      ctx.moveTo(endX, endY);
      ctx.quadraticCurveTo(ctrlOuterX, ctrlOuterY, fromCenterX, fromCenterY);
      ctx.quadraticCurveTo(ctrlInnerX, ctrlInnerY, endX, endY);
      ctx.fill();

      // Draw the arrow cap.
      ctx.beginPath();
      ctx.lineTo(
        endX - sin(angleControl + CAP_WIDTH_ANGLE) * longCapSize,
        endY - cos(angleControl + CAP_WIDTH_ANGLE) * longCapSize
      );
      ctx.lineTo(
        endX - sin(angleControl) * shortCapSize,
        endY - cos(angleControl) * shortCapSize
      );
      ctx.lineTo(
        endX - sin(angleControl - CAP_WIDTH_ANGLE) * longCapSize,
        endY - cos(angleControl - CAP_WIDTH_ANGLE) * longCapSize
      );
      ctx.lineTo(endX, endY);
      ctx.fill();
    }

    // Return a PNG buffer.
    return new Promise((resolve, reject) => {
      canvas.toBuffer((err, png) => {
        err ? reject(err) : resolve(png);
      });
    });
  };

  // Serve a board drawing.
  router.get("/images/:slug/:signature.png", async (ctx: Context) => {
    const { slug, signature } = ctx.params;

    // Verify the HMAC signature.
    const expected = crypto
      .createHmac("sha256", hmacSecret)
      .update(slug)
      .digest("hex");
    ctx.assert(signature === expected, 404, "Image not found");

    // Try to load from cache.
    let png = await cache.draw.get(slug);
    if (!png) {
      // Draw the image.
      png = await draw(slug);
      console.log(`Created and cached drawing for board state '${slug}'`);
      // Async cache the image.
      cache.draw.set(slug, png).catch((err) => {
        console.error(err);
      });
    }

    ctx.body = png;
    ctx.type = "image/png";
  });

  // Create an image URL for a FEN game state.
  const imageUrlFor = (
    pieces: string,
    side: string,
    move?: PrettyMove
  ): string => {
    let slug = `${pieces}${side}`;
    if (move) {
      slug += `-${move.from}${move.to}`;
    }

    const signature = crypto
      .createHmac("sha256", hmacSecret)
      .update(slug)
      .digest("hex");

    return `${origin}/images/${slug}/${signature}.png`;
  };

  // Generate the image URLs for all variants of the board.
  const imageUrls: DrawCtrl["imageUrls"] = (fen, move) => {
    const [pieces, currentSide] = fen.replace(/\//g, "").split(" ", 2);
    const urls = {
      boardImage: imageUrlFor(pieces, currentSide),
      boardImageWhite: imageUrlFor(pieces, "w"),
      boardImageBlack: imageUrlFor(pieces, "b"),
    };
    return move
      ? {
          ...urls,
          moveImage: imageUrlFor(pieces, currentSide, move),
          moveImageWhite: imageUrlFor(pieces, "w", move),
          moveImageBlack: imageUrlFor(pieces, "b", move),
        }
      : {
          ...urls,
          moveImage: urls.boardImage,
          moveImageWhite: urls.boardImageWhite,
          moveImageBlack: urls.boardImageBlack,
        };
  };

  return { draw, imageUrls };
};
