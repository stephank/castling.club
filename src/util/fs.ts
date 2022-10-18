import ejs from "ejs";
import fs from "fs/promises";

import { ASSETS_BASE } from "./consts.js";

// Wrap `readFile` to read from the asset directory.
export const readAsset = async (file: string) =>
  fs.readFile(new URL(file, ASSETS_BASE));

// Render a template.
export const renderTemplate = async (name: string, data: any) =>
  new Promise((resolve, reject) => {
    const tmplPath = new URL(`tmpl/${name}.html.ejs`, ASSETS_BASE);
    ejs.renderFile(tmplPath.pathname, data, (err, res) => {
      err ? reject(err) : resolve(res);
    });
  });
