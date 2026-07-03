import { createHash } from "node:crypto";

export function normalizeOriginalUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";

  for (const key of [...url.searchParams.keys()]) {
    if (
      key.toLowerCase().startsWith("utm_") ||
      ["fbclid", "gclid", "ref", "source"].includes(key.toLowerCase())
    ) {
      url.searchParams.delete(key);
    }
  }

  url.hostname = url.hostname.toLowerCase();
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  url.searchParams.sort();
  return url.toString();
}

export function createUniqueKey(sourceName: string, originalUrl: string): string {
  const normalizedSource = sourceName
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("tr-TR");
  const normalizedUrl = normalizeOriginalUrl(originalUrl);

  return createHash("sha256")
    .update(`${normalizedSource}:${normalizedUrl}`)
    .digest("hex");
}
