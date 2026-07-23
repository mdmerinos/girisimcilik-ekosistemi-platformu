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

export function createUniqueKey(
  sourceName: string,
  originalUrl: string,
  title?: string | null,
): string {
  const normalizedSource = sourceName
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("tr-TR");
  const normalizedUrl = normalizeOriginalUrl(originalUrl);
  const normalizedTitle = title
    ?.normalize("NFKD")
    .toLocaleLowerCase("tr-TR")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const identity = normalizedTitle
    ? `${normalizedSource}:title:${normalizedTitle}`
    : `${normalizedSource}:url:${normalizedUrl}`;

  return createHash("sha256")
    .update(identity)
    .digest("hex");
}
