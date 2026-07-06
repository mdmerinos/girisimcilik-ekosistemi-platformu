export const STALE_AFTER_MS = 60 * 60 * 1000;
export const REFRESH_COOLDOWN_MS = 30 * 60 * 1000;

export type RefreshIfStaleStatus =
  | "fresh"
  | "started"
  | "completed"
  | "already_running"
  | "cooldown"
  | "error";

export type RefreshIfStaleResult = {
  ok: boolean;
  status: RefreshIfStaleStatus;
  lastSuccessfulIngestionAt: string | null;
  message: string;
};

type RefreshDecisionInput = {
  now: Date;
  lastSuccessfulIngestionAt: string | null;
  lastAttemptAt: string | null;
  isRunning: boolean;
  force?: boolean;
  staleAfterMs?: number;
  cooldownMs?: number;
};

function isWithin(value: string | null, now: Date, durationMs: number): boolean {
  if (!value) return false;
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return false;
  return now.getTime() - time < durationMs;
}

export function decideRefreshIfStale({
  now,
  lastSuccessfulIngestionAt,
  lastAttemptAt,
  isRunning,
  force = false,
  staleAfterMs = STALE_AFTER_MS,
  cooldownMs = REFRESH_COOLDOWN_MS,
}: RefreshDecisionInput): RefreshIfStaleResult {
  if (isRunning) {
    return {
      ok: true,
      status: "already_running",
      lastSuccessfulIngestionAt,
      message: "Veriler şu anda güncelleniyor.",
    };
  }

  if (!force && isWithin(lastSuccessfulIngestionAt, now, staleAfterMs)) {
    return {
      ok: true,
      status: "fresh",
      lastSuccessfulIngestionAt,
      message:
        "Veriler zaten güncel görünüyor. Zorla yenilemek için Yenile düğmesini kullanabilirsin.",
    };
  }

  if (isWithin(lastAttemptAt, now, cooldownMs)) {
    return {
      ok: true,
      status: "cooldown",
      lastSuccessfulIngestionAt,
      message: "Veriler kısa süre önce kontrol edildi.",
    };
  }

  return {
    ok: true,
    status: "started",
    lastSuccessfulIngestionAt,
    message: "Veriler arka planda güncelleniyor.",
  };
}
