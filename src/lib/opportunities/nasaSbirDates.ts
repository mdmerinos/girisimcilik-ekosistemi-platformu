import { parseDate } from "@/lib/utils/parseDate";
import type { Opportunity } from "@/types/opportunity";

const NASA_SBIR_PATTERN =
  /\bNASA\b[\s\S]*\b(?:SBIR|STTR)\b|\b(?:SBIR|STTR)\b[\s\S]*\bNASA\b/i;
const NASA_2026_APPENDIX_PATTERN =
  /\b(?:2026[-–]2027\s+BAA\s+)?Appendix\s+26[AB](?:-I)?\s+(?:SBIR|STTR)\b/i;

function isNasaSbir(title: string, agency?: string) {
  return NASA_SBIR_PATTERN.test(`${agency ?? ""} ${title}`);
}

export function resolveNasaSbirPublishedAt(
  title: string,
  agency: string | undefined,
  openDate: string | undefined,
): string | null {
  const parsed = parseDate(openDate);
  if (!isNasaSbir(title, agency)) return parsed;
  if (NASA_2026_APPENDIX_PATTERN.test(title)) return parseDate("2026-04-21");
  if (
    /\b2026[-–]2027\b/.test(title) &&
    parsed &&
    new Date(parsed).getUTCFullYear() > 2027
  ) {
    return null;
  }
  return parsed;
}

export function resolveNasaSbirDeadlineAt(
  title: string,
  agency: string | undefined,
  closeDate: string | undefined,
): string | null {
  const parsed = parseDate(closeDate);
  if (!isNasaSbir(title, agency)) return parsed;
  if (NASA_2026_APPENDIX_PATTERN.test(title)) return parseDate("2026-05-21");
  if (
    /\b2026[-–]2027\b/.test(title) &&
    parsed &&
    new Date(parsed).getUTCFullYear() > 2027
  ) {
    return null;
  }
  return parsed;
}

export function sanitizeNasaSbirOpportunityDates<T extends Opportunity>(
  opportunity: T,
): T {
  if (!isNasaSbir(opportunity.title, opportunity.source_name)) {
    return opportunity;
  }

  return {
    ...opportunity,
    published_at: resolveNasaSbirPublishedAt(
      opportunity.title,
      opportunity.source_name,
      opportunity.published_at ?? undefined,
    ),
    deadline_at: resolveNasaSbirDeadlineAt(
      opportunity.title,
      opportunity.source_name,
      opportunity.deadline_at ?? undefined,
    ),
  };
}
