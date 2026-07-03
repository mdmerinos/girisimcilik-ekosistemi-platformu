import dayjs from "dayjs";

import { OpportunityImage } from "@/components/OpportunityImage";
import { getOpportunityDateDisplay } from "@/lib/opportunities/opportunityDate";
import { cleanOpportunitySummary } from "@/lib/scrapers/cleanOpportunitySummary";
import {
  chooseOpportunityUrl,
  getOpportunityLinkLabel,
} from "@/lib/utils/opportunityUrl";
import type { Opportunity } from "@/types/opportunity";

const categoryColors: Record<Opportunity["category"], string> = {
  "Ulusal Destek ve Fonlar": "text-[#6bcb77] border-[#6bcb77]/25",
  "Uluslararası Fonlar": "text-[#00d9f5] border-[#00d9f5]/25",
  "Yatırım ve Sermaye Ağları": "text-[#ffd93d] border-[#ffd93d]/25",
  "Etkinlik ve Programlar": "text-[#b394ff] border-[#9b6dff]/25",
  "Haber ve Sosyal Medya Akışı": "text-[#ff85ba] border-[#ff4d9d]/25",
};

export function OpportunityCard({ opportunity }: { opportunity: Opportunity }) {
  const dateDisplay = getOpportunityDateDisplay(opportunity);
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
    <article className="atlas-card group flex min-h-[17rem] min-w-0 flex-col rounded-2xl p-5 transition duration-300 hover:-translate-y-1">
      <OpportunityImage
        src={opportunity.image_url}
        alt={`${opportunity.title} görseli`}
      />
      <div className="flex items-start justify-between gap-4">
        <span
          className={`rounded-full border bg-transparent px-3 py-1 text-[10px] font-bold ${categoryColors[opportunity.category]}`}
        >
          {opportunity.category}
        </span>
        {opportunity.is_featured && (
          <span className="text-lg text-[#ffd93d]" title="Öne çıkan">
            ✦
          </span>
        )}
      </div>

      <div className="mt-5 flex-1">
        <p className="atlas-muted text-xs font-semibold uppercase tracking-[0.16em]">
          {opportunity.source_name}
        </p>
        <h3 className="atlas-text mt-3 text-lg font-semibold leading-7 tracking-[-0.02em]">
          {opportunity.title}
        </h3>
        <p className="atlas-muted mt-3 line-clamp-3 text-sm leading-6">
          {summary}
        </p>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--atlas-border)] pt-4">
        <div className="atlas-muted min-w-0 text-xs">
          {opportunity.location ?? "Online"}
          {dateDisplay && (
            <>
              <span className="mx-2 opacity-40">·</span>
              <span>
                {dateDisplay.label}:{" "}
                {dayjs(dateDisplay.value).format("DD.MM.YYYY")}
              </span>
            </>
          )}
        </div>
        {link && linkLabel && (
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            className="atlas-control rounded-full px-3 py-2 text-[11px] font-semibold transition group-hover:border-[#ff4d9d]/50 group-hover:text-[#ff85ba]"
            aria-label={`${opportunity.title}: ${linkLabel}`}
          >
            {linkLabel}
          </a>
        )}
      </div>
    </article>
  );
}
