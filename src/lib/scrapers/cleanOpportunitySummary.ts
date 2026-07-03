import { normalizeText } from "@/lib/utils/normalizeText";

export const SUMMARY_FALLBACK =
  "Detaylı bilgi için kaynak sayfasını görüntüleyin.";

const URL_ONLY_PATTERN = /^(?:https?:\/\/|www\.)\S+$/i;
const URL_LABEL_PATTERN =
  /\b(?:Article|Comments) URL:\s*(?:https?:\/\/|www\.)\S+/gi;
const EU_PREFIX_PATTERNS = [
  /^expected outcomes?\s*:\s*/i,
  /^project results are expected to contribute to (?:all of )?the following (?:expected )?outcomes?\s*:\s*/i,
  /^projects should contribute to (?:all of )?the following (?:expected )?outcomes?\s*:\s*/i,
  /^proposals should contribute to (?:all of )?the following (?:expected )?outcomes?\s*:\s*/i,
  /^following (?:expected )?outcomes?\s*:\s*/i,
  /^projects should contribute to (?:all(?: of)? )?(?:the )?(?:following )?(?:expected )?outcomes?[\s.:;-]*/i,
  /^the expected outcomes?[\s.:;-]*/i,
];

function htmlToLines(value: string): string[] {
  const text = value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|li|div|section|article|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'");

  return text
    .split(/\r?\n/)
    .map((line) => normalizeText(line))
    .filter(Boolean);
}

function truncateAtBoundary(value: string, maxLength = 260): string {
  if (value.length <= maxLength) return value;

  const candidate = value.slice(0, maxLength - 1);
  const sentenceBoundary = Math.max(
    candidate.lastIndexOf(". "),
    candidate.lastIndexOf("! "),
    candidate.lastIndexOf("? "),
  );
  const wordBoundary = candidate.lastIndexOf(" ");
  const boundary =
    sentenceBoundary >= 180 ? sentenceBoundary + 1 : wordBoundary >= 180 ? wordBoundary : -1;

  return `${candidate.slice(0, boundary > 0 ? boundary : maxLength - 1).trim()}…`;
}

export function extractCleanSummary(
  value: string | null | undefined,
  title?: string,
): string | null {
  if (!value) return null;

  const lines = htmlToLines(value)
    .map((line) => {
      let cleanedLine = normalizeText(line.replace(URL_LABEL_PATTERN, ""));
      let changed = true;

      while (cleanedLine && changed) {
        const previous = cleanedLine;
        cleanedLine = normalizeText(
          EU_PREFIX_PATTERNS.reduce(
            (current, pattern) => current.replace(pattern, ""),
            cleanedLine,
          ),
        );
        changed = cleanedLine !== previous;
      }

      return cleanedLine;
    })
    .filter(
      (line) =>
        line &&
        !URL_ONLY_PATTERN.test(line) &&
        !/^[\s.:;,\-–—]+$/.test(line),
    );

  const cleaned = normalizeText(lines.join(" "));

  if (
    !cleaned ||
    URL_ONLY_PATTERN.test(cleaned) ||
    (title && cleaned.toLocaleLowerCase() === normalizeText(title).toLocaleLowerCase())
  ) {
    return null;
  }

  return truncateAtBoundary(cleaned);
}

export function cleanOpportunitySummary(
  value: string | null | undefined,
  title?: string,
): string {
  return extractCleanSummary(value, title) ?? SUMMARY_FALLBACK;
}
