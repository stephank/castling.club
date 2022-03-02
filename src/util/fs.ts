import ejs from "ejs";
import fs from "fs";
import path from "path";
import { promisify } from "util";

const { ASSETS_BASE } = require("./consts");

// Promise version of `fs.readFile`.
export const readFile = promisify(fs.readFile);

// Wrap `readFile` to read from the asset directory.
export const readAsset = async (file: string, encoding?: string) =>
  exports.readFile(path.resolve(ASSETS_BASE, file), encoding);

// Render a template.
export const renderTemplate = async (name: string, data: any) =>
  new Promise((resolve, reject) => {
    const tmplPath = path.resolve(ASSETS_BASE, "tmpl", `${name}.html.ejs`);
    ejs.renderFile(tmplPath, data, (err, res) => {
      err ? reject(err) : resolve(res);
    });
  });
