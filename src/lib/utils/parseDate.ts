import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";

dayjs.extend(customParseFormat);

const TURKISH_MONTHS: Record<string, string> = {
  Oca: "Jan",
  Şub: "Feb",
  Mar: "Mar",
  Nis: "Apr",
  May: "May",
  Haz: "Jun",
  Tem: "Jul",
  Ağu: "Aug",
  Eyl: "Sep",
  Eki: "Oct",
  Kas: "Nov",
  Ara: "Dec",
};

export function parseDate(value?: string | Date | null): string | null {
  if (!value) return null;

  if (value instanceof Date) {
    return dayjs(value).isValid() ? dayjs(value).toISOString() : null;
  }

  const normalized = Object.entries(TURKISH_MONTHS).reduce(
    (result, [turkish, english]) =>
      result.replace(new RegExp(turkish, "gi"), english),
    value.trim(),
  );
  const direct = dayjs(normalized);
  if (direct.isValid()) return direct.toISOString();

  const parsed = dayjs(normalized, [
    "DD.MM.YYYY",
    "MM/DD/YYYY",
    "DD MMM YYYY",
    "D MMM YYYY",
    "YYYY-MM-DD-HH-mm-ss",
  ]);
  return parsed.isValid() ? parsed.toISOString() : null;
}
