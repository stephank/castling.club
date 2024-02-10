// Calls the draw code and writes `test.png`.

import fs from "node:fs";

import draw from "./front/draw.js";

const main = async (): Promise<void> => {
  // Create stubs.
  const app: any = {};
  app.router = {
    get: () => {},
  };
  app.draw = await draw(app);

  // Render.
  const buf = await app.draw.draw("rnbqkbnrpppppppp8888PPPPPPPPRNBQKBNRw");
  fs.writeFileSync("test.png", buf);
};

main();
