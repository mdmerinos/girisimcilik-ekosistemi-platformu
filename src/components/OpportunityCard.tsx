import dayjs from "dayjs";

import { OpportunityImage } from "@/components/OpportunityImage";
import { getOpportunityDateDisplay } from "@/lib/opportunities/opportunityDate";
import { getOpportunityStatus } from "@/lib/opportunities/opportunityFilters";
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

const statusColors = {
  "Başvuruya açık": "border-[#6bcb77]/30 text-[#6bcb77]",
  "Gelecek çağrı": "border-[#00d9f5]/30 text-[#00d9f5]",
  Kapandı: "border-[#ff6b6b]/30 text-[#ff8585]",
  "Tarih belirsiz": "border-[var(--atlas-border)] atlas-muted",
} as const;

export function OpportunityCard({ opportunity }: { opportunity: Opportunity }) {
  const dateDisplay = getOpportunityDateDisplay(opportunity);
  const status = getOpportunityStatus(opportunity);
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
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <span
            className={`rounded-full border bg-transparent px-3 py-1 text-[10px] font-bold ${categoryColors[opportunity.category]}`}
          >
            {opportunity.category}
          </span>
          <span
            className={`rounded-full border bg-transparent px-2.5 py-1 text-[10px] font-semibold ${statusColors[status]}`}
          >
            {status}
          </span>
        </div>
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
          <span className="mx-2 opacity-40">·</span>
          {dateDisplay ? (
            <span>
              {dateDisplay.label}:{" "}
              {dayjs(dateDisplay.value).format("DD.MM.YYYY")}
            </span>
          ) : (
            <span>Tarih belirtilmemiş</span>
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
