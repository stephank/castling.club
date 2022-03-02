// Render a game as PGN.
export const renderPgn = ({
  game,
  origin,
}: {
  game: any;
  origin: string;
}): string => {
  const date = new Date(game.setupNote.published).toISOString();
  const tags = [
    ["Site", origin],
    ["Date", date.slice(0, 10).replace(/-/g, ".")],
    ["Time", date.slice(11, 19)],
    ["White", game.whiteActor],
    ["Black", game.blackActor],
    // @todo: Add Result
    ["Permalink", game.id],
  ];

  const lines = [];
  for (const [name, value] of tags) {
    lines.push(`[${name} ${JSON.stringify(String(value))}]`);
  }
  lines.push("");

  let line = "";
  for (let idx = 0; idx < game.moves.length; idx += 2) {
    const whiteNote = game.moves[idx];
    const blackNote = game.moves[idx + 1];
    let turn = ` ${idx / 2 + 1}. ${whiteNote.san}`;
    if (blackNote) {
      turn += ` ${blackNote.san}`;
    }

    // @todo: Add Result

    if (line.length + turn.length > 79) {
      lines.push(line.slice(1));
      line = "";
    }

    line += turn;
  }
  if (line) {
    lines.push(line.slice(1));
    lines.push("");
  }

  return lines.join("\n");
};
