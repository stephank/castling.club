import dotenv from "dotenv";
import fs from "node:fs";

import deliver from "./deliver/index.js";
import front from "./front/index.js";

// Load configuration.
dotenv.config();
const {
  APP_SCHEME: scheme = "http",
  APP_DOMAIN: domain = "localhost:5080",
  APP_ADMIN_URL: adminUrl = "",
  APP_ADMIN_EMAIL: adminEmail = "",
  APP_KEY_FILE: keyFile = "signing-key",
  APP_HMAC_SECRET: hmacSecret = "INSECURE",
  NODE_ENV: env = "development",
  PORT: port = "5080",
} = process.env;

// Read actor key files.
const privateKeyPem = fs.readFileSync(keyFile, "utf-8");
const publicKeyPem = fs.readFileSync(`${keyFile}.pub`, "utf-8");

// Build the configuration object.
const config = {
  isDev: env !== "production",
  scheme,
  domain,
  adminUrl,
  adminEmail,
  publicKeyPem,
  privateKeyPem,
  hmacSecret,
};
if (config.isDev) {
  console.warn(`DEV MODE enabled, security checks disabled!`);
}

// Create the front instance.
front(config).then((instance) => {
  // Start listening.
  const server = instance.listen(parseInt(port, 10), () => {
    const addr = server.address();
    const desc =
      typeof addr === "string" ? addr : addr ? addr.port : "<unknown>";
    console.log(`Listening on port ${desc}`);
  });
});

// Create the deliver instance.
deliver(config);
