import { isIPv4 } from "net";

// Get the arguments array type of a functino.
type ArgumentsOf<T> = T extends (...args: infer A) => any ? A : never;

// Type that holds any async function.
type AnyAsyncFunction = (...args: any[]) => Promise<any>;

// https://en.wikipedia.org/wiki/Top-level_domain#Reserved_domains
const INVALID_TLDS = new Set([
  // RFC 3172
  "arpa",
  // RFC 6761
  "example",
  "invalid",
  "localhost",
  "test",
  "localdomain", // additional
  // RFC 6762
  "local",
  // RFC 7686
  "onion",
]);

// https://url.spec.whatwg.org/#forbidden-host-code-point
const INVALID_HOST_CHARS = new Set("\0\t\n\r #%/:?@[\\]");

// A very simple namespacing tool.
export const ns =
  (prefix: string) =>
  (name: string): string =>
    prefix + name;

// Coerce a value into an array.
export const ensureArray = <T>(value: T | T[]): T[] =>
  value == null ? [] : Array.isArray(value) ? value : [value];

// Extract words from a string.
export const words = (s: string): string[] => s.trim().split(/\s+/g);

// Pick a random element from the array.
export const sample = <T>(arr: T[]): T =>
  arr[Math.floor(Math.random() * arr.length)];

// Sort an array by a predicate, which should return a numeric value.
export const sortBy = <T, S extends number>(
  arr: T[],
  pred: (value: T) => S
): T[] => {
  const values = arr.map(pred);
  return arr
    .map((_value, idx) => idx)
    .sort((a, b) => values[a] - values[b])
    .map((idx) => arr[idx]);
};

// Detach an async function. The wrapped function returns a promise for
// nothing, which also never fails. Errors will be logged.
export const detach =
  <F extends AnyAsyncFunction>(
    fn: F
  ): ((...args: ArgumentsOf<F>) => Promise<void>) =>
  async (...args) =>
    fn(...args).catch((err) => {
      console.error(err);
    });

// Get the origin of a URL.
export const originOf = (url: string): string | undefined => {
  const match = /^[a-z][a-z0-9.+-]*:\/\/[^/]+/i.exec(url);
  return match ? match[0] : undefined;
};

// Checks that a URL that is supposed to be some resource on the public
// internet doesn't point to known invalid hosts. We also require HTTPS.
export const checkPublicUrl = (url: string): boolean => {
  // Filter non-HTTPS URLs.
  if (url.slice(0, 8) !== "https://") {
    return false;
  }

  // We want a valid domain, not an IP address. The invalid character list
  // also prevents IPv6 addresses and ports.
  const [host] = url.slice(8).split("/");
  if (
    !host ||
    !host.includes(".") ||
    isIPv4(host) ||
    [...host].find((c) => INVALID_HOST_CHARS.has(c))
  ) {
    return false;
  }

  // Filter reserved TLDs.
  const tld = host.split(".").pop();
  if (!tld || INVALID_TLDS.has(tld)) {
    return false;
  }

  return true;
};
