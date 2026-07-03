import dayjs from "dayjs";

import { OpportunityImage } from "@/components/OpportunityImage";
import { cleanOpportunitySummary } from "@/lib/scrapers/cleanOpportunitySummary";
import {
  chooseOpportunityUrl,
  getOpportunityLinkLabel,
} from "@/lib/utils/opportunityUrl";
import type { Opportunity } from "@/types/opportunity";

const categoryColors: Record<Opportunity["category"], string> = {
  "Ulusal Destek ve Fonlar": "bg-[#eff7e6] text-[#48672f]",
  "Uluslararası Fonlar": "bg-[#e6f5f1] text-[#27705f]",
  "Yatırım ve Sermaye Ağları": "bg-[#fff1df] text-[#9a5a11]",
  "Etkinlik ve Programlar": "bg-[#eeeafd] text-[#5d45a0]",
  "Haber ve Sosyal Medya Akışı": "bg-[#edf0f2] text-[#4c5d67]",
};

export function OpportunityCard({ opportunity }: { opportunity: Opportunity }) {
  const date = opportunity.deadline_at ?? opportunity.published_at;
  const summary = cleanOpportunitySummary(
    opportunity.summary,
    opportunity.title,
  );
  const link = chooseOpportunityUrl(
    [opportunity.application_url, opportunity.source_url],
    opportunity.source_url,
  );
  const linkLabel = getOpportunityLinkLabel(link);

  return (
    <article className="group flex min-h-80 flex-col rounded-2xl border border-[#dfe5df] bg-white p-5 transition duration-300 hover:-translate-y-1 hover:border-[#b5c5ae] hover:shadow-[0_18px_50px_rgba(27,48,35,0.08)]">
      <OpportunityImage
        src={opportunity.image_url}
        alt={`${opportunity.title} görseli`}
      />
      <div className="flex items-start justify-between gap-4">
        <span
          className={`rounded-full px-3 py-1 text-[11px] font-bold ${categoryColors[opportunity.category]}`}
        >
          {opportunity.category}
        </span>
        {opportunity.is_featured && (
          <span className="text-lg text-[#73944c]" title="Öne çıkan">
            ✦
          </span>
        )}
      </div>

      <div className="mt-7 flex-1">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#839087]">
          {opportunity.source_name}
        </p>
        <h3 className="mt-3 text-xl font-semibold leading-7 tracking-[-0.02em] text-[#142219]">
          {opportunity.title}
        </h3>
        <p className="mt-3 line-clamp-3 text-sm leading-6 text-[#657168]">
          {summary}
        </p>
      </div>

      <div className="mt-7 flex items-center justify-between border-t border-[#edf0ed] pt-4">
        <div className="text-xs text-[#78847c]">
          {opportunity.location ?? "Online"}
          {date && (
            <>
              <span className="mx-2 text-[#c4cbc5]">·</span>
              {dayjs(date).format("DD.MM.YYYY")}
            </>
          )}
        </div>
        {link && linkLabel && (
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            className="rounded-full bg-[#f0f4ef] px-3 py-2 text-[11px] font-semibold text-[#274232] transition group-hover:bg-[#b8f26a]"
            aria-label={`${opportunity.title}: ${linkLabel}`}
          >
            {linkLabel}
          </a>
        )}
      </div>
    </article>
  );
}
