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

  if (!src || failed) return null;

  return (
    <div className="-mx-5 -mt-5 mb-5 aspect-[16/9] overflow-hidden rounded-t-2xl bg-[#f0f3ef]">
      {/* Dynamic source domains cannot be enumerated safely for next/image. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className="h-full w-full object-cover"
        onError={() => setFailed(true)}
      />
    </div>
  );
}
