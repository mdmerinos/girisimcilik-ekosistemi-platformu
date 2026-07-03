export type OpportunityLinkKind = "detail" | "homepage" | "none";

const REJECTED_HREF_PATTERN = /^(?:#|javascript:|mailto:|tel:)/i;

export function resolveOpportunityUrl(
  href: string | null | undefined,
  baseUrl: string,
): string | null {
  const candidate = href?.trim();
  if (!candidate || REJECTED_HREF_PATTERN.test(candidate)) return null;

  try {
    const base = new URL(baseUrl);
    const firstBaseSegment = base.pathname.split("/").filter(Boolean)[0];
    const normalizedCandidate =
      firstBaseSegment &&
      !candidate.startsWith("/") &&
      !candidate.startsWith(".") &&
      candidate.startsWith(`${firstBaseSegment}/`)
        ? `/${candidate}`
        : candidate;
    const url = new URL(normalizedCandidate, base);

    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export function hasMeaningfulPath(value: string): boolean {
  try {
    const pathname = new URL(value).pathname.replace(/\/+$/, "") || "/";
    return pathname !== "/";
  } catch {
    return false;
  }
}

export function isLikelyHomepageUrl(value: string): boolean {
  return !hasMeaningfulPath(value);
}

export function getOpportunityLinkKind(
  value: string | null | undefined,
): OpportunityLinkKind {
  if (!value || !resolveOpportunityUrl(value, value)) return "none";
  return isLikelyHomepageUrl(value) ? "homepage" : "detail";
}

export function getOpportunityLinkLabel(
  value: string | null | undefined,
): "Detayları görüntüle" | "Kaynak sayfayı aç" | null {
  const kind = getOpportunityLinkKind(value);
  if (kind === "detail") return "Detayları görüntüle";
  if (kind === "homepage") return "Kaynak sayfayı aç";
  return null;
}

export function chooseOpportunityUrl(
  hrefs: Array<string | null | undefined>,
  baseUrl: string,
): string | null {
  const resolved = hrefs
    .map((href) => resolveOpportunityUrl(href, baseUrl))
    .filter((url): url is string => Boolean(url));

  return (
    resolved.find((url) => !isLikelyHomepageUrl(url)) ??
    resolved.find((url) => isLikelyHomepageUrl(url)) ??
    null
  );
}
