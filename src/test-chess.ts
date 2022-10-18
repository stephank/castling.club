// Heavily modified version of chess.js v0.10.2.
// See LICENSE.md for the original license.

import { assert } from "chai";

import createGame from "./util/chess.js";
import { words } from "./util/misc.js";

describe("Checkmate", () => {
  const checkmates = [
    "8/5r2/4K1q1/4p3/3k4/8/8/8 w - - 0 7",
    "4r2r/p6p/1pnN2p1/kQp5/3pPq2/3P4/PPP3PP/R5K1 b - - 0 2",
    "r3k2r/ppp2p1p/2n1p1p1/8/2B2P1q/2NPb1n1/PP4PP/R2Q3K w kq - 0 8",
    "8/6R1/pp1r3p/6p1/P3R1Pk/1P4P1/7K/8 b - - 0 4",
  ];
  for (const checkmate of checkmates) {
    const chess = createGame(checkmate);
    it(checkmate, () => {
      assert(chess.isInCheckmate());
    });
  }
});

describe("Stalemate", () => {
  const stalemates = [
    "1R6/8/8/8/8/8/7R/k6K b - - 0 1",
    "8/8/5k2/p4p1p/P4K1P/1r6/8/8 w - - 0 2",
  ];
  for (const stalemate of stalemates) {
    const chess = createGame(stalemate);
    it(stalemate, () => {
      assert(chess.isInStalemate());
    });
  }
});

describe("Insufficient Material", () => {
  const positions = [
    {
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      draw: false,
    },
    { fen: "8/8/8/8/8/8/8/k6K w - - 0 1", draw: true },
    { fen: "8/2p5/8/8/8/8/8/k6K w - - 0 1", draw: false },
    { fen: "8/2N5/8/8/8/8/8/k6K w - - 0 1", draw: true },
    { fen: "8/2b5/8/8/8/8/8/k6K w - - 0 1", draw: true },
    { fen: "8/b7/3B4/8/8/8/8/k6K w - - 0 1", draw: true },
    { fen: "8/b7/B7/8/8/8/8/k6K w - - 0 1", draw: false },
    { fen: "8/b1B1b1B1/1b1B1b1B/8/8/8/8/1k5K w - - 0 1", draw: true },
    { fen: "8/bB2b1B1/1b1B1b1B/8/8/8/8/1k5K w - - 0 1", draw: false },
  ];
  for (const position of positions) {
    const chess = createGame(position.fen);
    it(position.fen, () => {
      if (position.draw) {
        assert(chess.hasInsufficientMaterial() && chess.isInDraw());
      } else {
        assert(!chess.hasInsufficientMaterial() && !chess.isInDraw());
      }
    });
  }
});

describe("Algebraic Notation", () => {
  const moveSet = (str: string): Set<string> => new Set(words(str));
  const positions = [
    {
      fen: "7k/3R4/3p2Q1/6Q1/2N1N3/8/8/3R3K w - - 0 1",
      moves: moveSet(`
        Rd8# Re7 Rf7 Rg7 Rh7# R7xd6 Rc7 Rb7 Ra7
        Qf7 Qe8# Qg7# Qg8# Qh7# Q6h6# Q6h5# Q6f5
        Q6f6# Qe6 Qxd6 Q5f6# Qe7 Qd8# Q5h6# Q5h5#
        Qh4# Qg4 Qg3 Qg2 Qg1 Qf4 Qe3 Qd2 Qc1
        Q5f5 Qe5+ Qd5 Qc5 Qb5 Qa5 Na5 Nb6 Ncxd6
        Ne5 Ne3 Ncd2 Nb2 Na3 Nc5 Nexd6 Nf6 Ng3
        Nf2 Ned2 Nc3 Rd2 Rd3 Rd4 Rd5 R1xd6 Re1
        Rf1 Rg1 Rc1 Rb1 Ra1 Kg2 Kh2 Kg1
      `),
    },
    {
      fen: "1r3k2/P1P5/8/8/8/8/8/R3K2R w KQ - 0 1",
      moves: moveSet(`
        a8=Q a8=R a8=B a8=N axb8=Q+ axb8=R+ axb8=B
        axb8=N c8=Q+ c8=R+ c8=B c8=N cxb8=Q+ cxb8=R+
        cxb8=B cxb8=N Ra2 Ra3 Ra4 Ra5 Ra6 Rb1
        Rc1 Rd1 Kd2 Ke2 Kf2 Kf1 Kd1 Rh2 Rh3
        Rh4 Rh5 Rh6 Rh7 Rh8+ Rg1 Rf1+ O-O+
        O-O-O
      `),
    },
    {
      fen: "5rk1/8/8/8/8/8/2p5/R3K2R w KQ - 0 1",
      moves: moveSet(`
        Ra2 Ra3 Ra4 Ra5 Ra6 Ra7 Ra8 Rb1 Rc1
        Rd1 Kd2 Ke2 Rh2 Rh3 Rh4 Rh5 Rh6 Rh7
        Rh8+ Rg1+ Rf1
      `),
    },
    {
      fen: "5rk1/8/8/8/8/8/2p5/R3K2R b KQ - 0 1",
      moves: moveSet(`
        Rf7 Rf6 Rf5 Rf4 Rf3 Rf2 Rf1+ Re8+ Rd8
        Rc8 Rb8 Ra8 Kg7 Kf7 c1=Q+ c1=R+ c1=B
        c1=N
      `),
    },
    {
      fen: "r3k2r/p2pqpb1/1n2pnp1/2pPN3/1p2P3/2N2Q1p/PPPB1PPP/R3K2R w KQkq c6 0 2",
      moves: moveSet(`
        gxh3 Qxf6 Qxh3 Nxd7 Nxf7 Nxg6 dxc6 dxe6
        Rg1 Rf1 Ke2 Kf1 Kd1 Rb1 Rc1 Rd1 g3
        g4 Be3 Bf4 Bg5 Bh6 Bc1 b3 a3 a4 Qf4
        Qf5 Qg4 Qh5 Qg3 Qe2 Qd1 Qe3 Qd3 Na4
        Nb5 Ne2 Nd1 Nb1 Nc6 Ng4 Nd3 Nc4 d6
        O-O O-O-O
      `),
    },
    {
      fen: "k7/8/K7/8/3n3n/5R2/3n4/8 b - - 0 1",
      moves: moveSet(`
        N2xf3 Nhxf3 Nd4xf3 N2b3 Nc4 Ne4 Nf1 Nb1
        Nhf5 Ng6 Ng2 Nb5 Nc6 Ne6 Ndf5 Ne2 Nc2
        N4b3 Kb8
      `),
    },
  ];
  for (const position of positions) {
    const chess = createGame(position.fen);
    it(position.fen, () => {
      assert.deepEqual(chess.moves(), position.moves);
    });
  }
});

describe("FEN", () => {
  const positions = [
    "8/8/8/8/8/8/8/8 w - - 0 1",
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
    "1nbqkbn1/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/1NBQKBN1 b - - 1 2",
  ];
  for (const fen of positions) {
    it(fen, () => {
      const chess = createGame(fen);
      assert.equal(chess.fen(), fen);
    });
  }
});

describe("Make Move", () => {
  const positions = [
    {
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      legal: true,
      move: "e4",
      next: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
    },
    {
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      legal: false,
      move: "e5",
    },
    {
      fen: "7k/3R4/3p2Q1/6Q1/2N1N3/8/8/3R3K w - - 0 1",
      legal: true,
      move: "Rd8#",
      next: "3R3k/8/3p2Q1/6Q1/2N1N3/8/8/3R3K b - - 1 1",
    },
    {
      fen: "rnbqkbnr/pp3ppp/2pp4/4pP2/4P3/8/PPPP2PP/RNBQKBNR w KQkq e6 0 1",
      legal: true,
      move: "fxe6",
      next: "rnbqkbnr/pp3ppp/2ppP3/8/4P3/8/PPPP2PP/RNBQKBNR b KQkq - 0 1",
      captured: "p",
    },
    {
      fen: "rnbqkbnr/pppp2pp/8/4p3/4Pp2/2PP4/PP3PPP/RNBQKBNR b KQkq e3 0 1",
      legal: true,
      move: "fxe3",
      next: "rnbqkbnr/pppp2pp/8/4p3/8/2PPp3/PP3PPP/RNBQKBNR w KQkq - 0 2",
      captured: "p",
    },

    // strict move parser
    {
      fen: "r2qkbnr/ppp2ppp/2n5/1B2pQ2/4P3/8/PPP2PPP/RNB1K2R b KQkq - 3 7",
      legal: true,
      next: "r2qkb1r/ppp1nppp/2n5/1B2pQ2/4P3/8/PPP2PPP/RNB1K2R w KQkq - 4 8",
      move: "Ne7",
    },

    // sloppy move parser
    {
      fen: "r2qkbnr/ppp2ppp/2n5/1B2pQ2/4P3/8/PPP2PPP/RNB1K2R b KQkq - 3 7",
      legal: true,
      move: "Nge7",
      next: "r2qkb1r/ppp1nppp/2n5/1B2pQ2/4P3/8/PPP2PPP/RNB1K2R w KQkq - 4 8",
    },

    // the sloppy parser should still accept correctly disambiguated moves
    {
      fen: "r2qkbnr/ppp2ppp/2n5/1B2pQ2/4P3/8/PPP2PPP/RNB1K2R b KQkq - 3 7",
      legal: true,
      move: "Ne7",
      next: "r2qkb1r/ppp1nppp/2n5/1B2pQ2/4P3/8/PPP2PPP/RNB1K2R w KQkq - 4 8",
    },
  ];

  for (const position of positions) {
    const chess = createGame(position.fen);
    it(`${position.fen} (${position.move} ${position.legal})`, () => {
      const result = chess.move(position.move);
      if (position.legal) {
        assert(result);
        assert.equal(chess.fen(), position.next);
        assert.equal(result!.captured, position.captured);
      } else {
        assert(!result);
      }
    });
  }
});
