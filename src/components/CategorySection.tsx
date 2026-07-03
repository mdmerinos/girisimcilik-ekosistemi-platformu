import type { ReactNode } from "react";

export function CategorySection({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="px-5 py-16 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#73944c]">
          {eyebrow}
        </p>
        <h2 className="mt-2 text-3xl font-semibold text-[#142219]">{title}</h2>
        <div className="mt-8">{children}</div>
      </div>
    </section>
  );
}
