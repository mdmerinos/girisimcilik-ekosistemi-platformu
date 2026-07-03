import {
  BotProtectionError,
  HttpError,
  RequestTimeoutError,
} from "@/lib/ingestion/fetchWithRetry";

export const SOURCE_STATUSES = [
  "success",
  "partial",
  "empty",
  "skipped",
  "fragile",
  "error",
] as const;

export type SourceStatus = (typeof SOURCE_STATUSES)[number];

export const SOURCE_STATUS_PRESENTATION: Record<
  SourceStatus,
  { label: string; className: string }
> = {
  success: {
    label: "success",
    className: "bg-[#edf7e8] text-[#477033]",
  },
  partial: {
    label: "partial",
    className: "bg-[#fff5cc] text-[#80621f]",
  },
  empty: {
    label: "empty",
    className: "bg-[#f2f0eb] text-[#655f55]",
  },
  skipped: {
    label: "skipped",
    className: "bg-[#f2f0eb] text-[#655f55]",
  },
  fragile: {
    label: "fragile",
    className: "bg-[#fff0dc] text-[#9a5a11]",
  },
  error: {
    label: "error",
    className: "bg-[#fcebec] text-[#9b464d]",
  },
};

export class EmptySourceError extends Error {
  constructor(public readonly url: string) {
    super(`No matching items found at ${url}`);
    this.name = "EmptySourceError";
  }
}

export type ClassifiedSourceError = {
  status: Exclude<SourceStatus, "success" | "partial">;
  message: string;
};

export function classifySourceError(
  error: unknown,
  sourceIsFragile = false,
): ClassifiedSourceError {
  const rawMessage =
    error instanceof Error ? error.message : "Bilinmeyen sistem hatası";
  const normalizedMessage = rawMessage.toLocaleLowerCase("en-US");

  if (error instanceof HttpError && error.status === 403) {
    return {
      status: "fragile",
      message: "Kaynak güvenlik politikası nedeniyle bot isteklerini engelliyor.",
    };
  }

  if (error instanceof HttpError && error.status === 404) {
    return {
      status: "skipped",
      message: "Kaynak sayfa şu anda bulunamadı veya taşınmış olabilir.",
    };
  }

  if (
    error instanceof EmptySourceError ||
    normalizedMessage.includes("no matching items found")
  ) {
    return {
      status: "empty",
      message:
        "Kaynak sayfa yapısı değişmiş olabilir veya şu an uygun kayıt bulunamadı.",
    };
  }

  if (
    error instanceof RequestTimeoutError ||
    error instanceof DOMException && error.name === "AbortError" ||
    /\b(timeout|timed out)\b/.test(normalizedMessage)
  ) {
    return {
      status: "fragile",
      message: "Kaynak zamanında yanıt vermedi.",
    };
  }

  if (
    error instanceof BotProtectionError ||
    /(bot protection|captcha|paywall|access denied|just a moment|bir dakika lütfen)/i.test(
      rawMessage,
    )
  ) {
    return {
      status: "fragile",
      message: "Kaynak güvenlik politikası nedeniyle bot isteklerini engelliyor.",
    };
  }

  if (
    normalizedMessage.includes("fetch failed") ||
    /(econnreset|econnrefused|enotfound|network|socket hang up)/i.test(rawMessage)
  ) {
    return {
      status: "fragile",
      message: "Kaynağa geçici olarak ulaşılamadı.",
    };
  }

  if (sourceIsFragile) {
    return {
      status: "fragile",
      message: "Kaynağa geçici olarak ulaşılamadı.",
    };
  }

  return {
    status: "error",
    message: rawMessage,
  };
}
