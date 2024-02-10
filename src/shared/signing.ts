import createError from "http-errors";
import crypto from "node:crypto";
import { Context } from "koa";

import { TripleStore } from "./jsonld.js";
import { PublicKey, getPublicKey } from "../util/rdfModel.js";
import { ensureArray } from "../util/misc.js";

export interface SigningService {
  verify(ctx: Context, body: string, store: TripleStore): Promise<PublicKey>;
  sign(
    keyId: string,
    privateKeyPem: string,
    url: URL,
    options: RequestInit,
  ): RequestInit;
}

type HeaderMap = Map<string, string[]>;

export default async ({
  domain,
}: {
  domain: string;
}): Promise<SigningService> => {
  // Verify the `Digest` and `Signature` headers,
  // and return the public key used to sign the request.
  const verify: SigningService["verify"] = async (ctx, body, store) => {
    const { headers, rawHeaders } = ctx.req;

    // Ensure the `Host` header matches our domain.
    // (Proxies may need to be configured to not rewrite the header.)
    if (headers.host !== domain) {
      throw createError(400, "Host header mismatch");
    }

    // Ensure the `Date` header is current, with some leeway.
    // @todo: Pleroma doesn't send this.
    /*
    const date = Date.parse(headers.date);
    if (isNaN(date) || Math.abs(Date.now() - date) > SIGNATURE_LEEWAY) {
      throw createError(400, "Date header missing or out of range");
    }
    */

    // Parse the `Digest` header, require SHA256.
    const sha256 = ensureArray(headers.digest || [])
      .join(",")
      .split(",")
      .find((x) => x.slice(0, 8) === "SHA-256=");
    if (!sha256) {
      throw createError(400, "Expected a Digest header with SHA-256");
    }

    // Validate the SHA256 hash.
    const expected = crypto.createHash("sha256").update(body).digest("base64");
    if (sha256.slice(8) !== expected) {
      throw createError(400, "Digest mismatch");
    }

    // Build our own headers map, because we need to operate on raw values
    // and preserve order.
    const numRawHeaders = rawHeaders.length;
    const headerMap: HeaderMap = new Map();
    for (let i = 0; i < numRawHeaders; i += 2) {
      const name = rawHeaders[i].toLowerCase();
      let arr = headerMap.get(name);
      if (!arr) {
        arr = [];
        headerMap.set(name, arr);
      }
      arr.push(rawHeaders[i + 1]);
    }

    // Check that there is a signature header.
    const signatureHeaders = headerMap.get("signature");
    if (!signatureHeaders) {
      throw createError(400, "Expected a Signature header");
    }

    // Try each `Signature` header provided, but limit to 2.
    for (const signatureHeader of signatureHeaders.slice(0, 2)) {
      const publicKey = await verifyOne(ctx, signatureHeader, headerMap, store);
      if (publicKey) {
        return publicKey;
      }
    }

    // Fell-through the loop, so failed verification.
    throw createError(400, "RSA-SHA256 signature mismatch");
  };

  // Verify a single `Signature` header, and return the public key if valid.
  const verifyOne = async (
    ctx: Context,
    signatureHeader: string,
    headerMap: HeaderMap,
    store: TripleStore,
  ): Promise<PublicKey | undefined> => {
    // Parse the `Signature` header parameters.
    // @todo: Properly parse quoted-strings.
    const params = signatureHeader
      .split(/\s*,\s*/g)
      .reduce<{ [param: string]: string }>((obj, param) => {
        const sepIdx = param.indexOf("=");
        if (sepIdx === -1) {
          obj[param] = "";
        } else {
          const key = param.slice(0, sepIdx);
          const value = param.slice(sepIdx + 2, -1);
          obj[key] = value;
        }
        return obj;
      }, {});

    // Validate basic signature parameters.
    const { keyId, signature } = params;
    if (!keyId || !signature) {
      throw createError(400, "Missing required signature parameters");
    }

    // Ensure signed headers contain some required headers.
    const signedHeaders = params.headers ? params.headers.split(" ") : ["date"];
    if (
      // @todo: Pleroma doesn't send these.
      // !signedHeaders.includes("date") ||
      // !signedHeaders.includes("(request-target)") ||
      !signedHeaders.includes("host") ||
      !signedHeaders.includes("digest")
    ) {
      throw createError(400, "Not all required headers included in signature");
    }
    // Sanity check for duplicate signed headers.
    if (new Set(signedHeaders).size !== signedHeaders.length) {
      throw createError(400, "Duplicate headers in signature");
    }
    // Sanity check that signed headers are actually in the request.
    for (const name of signedHeaders) {
      if (name !== "(request-target)" && !headerMap.has(name)) {
        throw createError(400, "Signature contains headers not in the request");
      }
    }

    // Load the JSON-LD public key document.
    // @todo: Support non-RSA keys.
    try {
      await store.load(keyId);
    } catch (err: any) {
      throw createError(
        400,
        `Signature public key document could not be loaded: ${err.mesage}`,
      );
    }

    const publicKey = getPublicKey(store, keyId);
    if (!publicKey.publicKeyPem) {
      return undefined;
    }

    // Build the signed data.
    const signedData = signedHeaders
      .map((name) => {
        const value =
          name === "(request-target)"
            ? `${ctx.method.toLowerCase()} ${ctx.path}`
            : headerMap.get(name)!.join(", ");
        return `${name}: ${value}`;
      })
      .join("\n");

    // Validate the signature.
    const valid = crypto
      .createVerify("sha256")
      .update(signedData)
      .verify(publicKey.publicKeyPem, signature, "base64");
    if (!valid) {
      return undefined;
    }

    return publicKey;
  };

  // Sign a request.
  const sign: SigningService["sign"] = (keyId, privateKeyPem, url, options) => {
    let body = options.body;
    if (typeof body !== "string" && !Buffer.isBuffer(body)) {
      throw Error("Cannot sign streaming body");
    }

    // Hash the body.
    const sha256 = crypto.createHash("sha256").update(body).digest("base64");

    if (!(options.headers instanceof Headers)) {
      options.headers = new Headers(options.headers);
    }
    const headers = options.headers;

    // Ensure a `Host` header is present, so it is included in the signature.
    headers.set("host", url.host);

    // Create the `Digest` header.
    headers.set("digest", `SHA-256=${sha256}`);

    // Create our own `Date` header, because we include it in the signature.
    headers.set("date", new Date().toUTCString());

    // Build the signed data.
    const method = (options.method || "get").toLowerCase();
    const signedHeaders = (() => {
      const list = new Set<string>();
      headers.forEach((_value, name) => {
        list.add(name);
      });
      return [...list].sort();
    })();
    const signedData = [
      `(request-target): ${method} ${url.pathname}`,
      ...signedHeaders.map((name) => `${name}: ${headers.get(name)}`),
    ].join("\n");

    // Sign the headers.
    // @todo: Support non-RSA keys.
    const signature = crypto
      .createSign("sha256")
      .update(signedData)
      .sign(privateKeyPem, "base64");

    // Create the `Signature` header.
    const signatureHeaders = [
      "(request-target)",
      ...signedHeaders.map((name) => name.toLowerCase()),
    ].join(" ");
    headers.set(
      "signature",
      [
        `keyId="${keyId}"`,
        `headers="${signatureHeaders}"`,
        `signature="${signature}"`,
      ].join(","),
    );

    return options;
  };

  return { verify, sign };
};
