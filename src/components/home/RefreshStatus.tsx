export type RefreshState = {
  ok: boolean;
  status: "fresh" | "started" | "already_running" | "cooldown" | "error";
  lastSuccessfulIngestionAt: string | null;
  message: string;
};

export function RefreshStatus({ state }: { state: RefreshState | null }) {
  if (!state) return null;

  return (
    <p
      className={`atlas-status inline-flex rounded-full px-3 py-1.5 text-[11px] font-semibold ${
        state.status === "error" ? "is-error" : ""
      }`}
      role="status"
    >
      <span className="mr-2" aria-hidden="true">
        {state.status === "error" ? "!" : "●"}
      </span>
      {state.message}
    </p>
  );
}
