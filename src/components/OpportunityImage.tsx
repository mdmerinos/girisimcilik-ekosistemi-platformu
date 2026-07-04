"use client";

import { useState } from "react";

export function OpportunityImage({
  src,
  alt,
}: {
  src: string | null;
  alt: string;
}) {
  const [failed, setFailed] = useState(false);
  const showPlaceholder = !src || failed;

  return (
    <div className="-mx-5 -mt-5 mb-5 flex aspect-[16/7] items-center justify-center overflow-hidden rounded-t-2xl border-b border-[var(--atlas-border)] bg-[var(--atlas-surface)]">
      {showPlaceholder ? (
        <div
          className="atlas-muted flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em]"
          role="img"
          aria-label="Fırsat görseli bulunmuyor"
        >
          <span
            className="size-2 rounded-full bg-[var(--atlas-purple)]"
            aria-hidden="true"
          />
          Girişim Atlası
        </div>
      ) : (
        // Dynamic source domains cannot be enumerated safely for next/image.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src ?? undefined}
          alt={alt}
          loading="lazy"
          className="h-full w-full object-contain p-3"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}
