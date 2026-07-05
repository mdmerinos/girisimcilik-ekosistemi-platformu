"use client";

import dayjs from "dayjs";
import { useId, useState } from "react";

import { OpportunityImage } from "@/components/OpportunityImage";
import {
  buildTurkishExplanation,
  getCardSummaryDisplay,
  shouldShowTurkishExplanationButton,
} from "@/lib/opportunities/opportunityDisplayText";
import { getOpportunityDateDisplay } from "@/lib/opportunities/opportunityDate";
import { getOpportunityStatus } from "@/lib/opportunities/opportunityFilters";
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
  "Eski arşiv kaydı": "border-[#ffd93d]/30 text-[#d6a900]",
  "Tarih belirsiz": "border-[var(--atlas-border)] atlas-muted",
} as const;

export function OpportunityCard({ opportunity }: { opportunity: Opportunity }) {
  const [showTurkishExplanation, setShowTurkishExplanation] = useState(false);
  const explanationId = useId();
  const dateDisplay = getOpportunityDateDisplay(opportunity);
  const status = getOpportunityStatus(opportunity);
  const summaryDisplay = getCardSummaryDisplay(opportunity);
  const showExplanationButton =
    shouldShowTurkishExplanationButton(opportunity);
  const turkishExplanation = showExplanationButton
    ? buildTurkishExplanation(opportunity)
    : null;
  const link = chooseOpportunityUrl(
    [opportunity.application_url, opportunity.source_url],
    opportunity.source_url,
  );
  const linkLabel = getOpportunityLinkLabel(link);

  return (
    <article className="atlas-card group flex min-h-[27rem] min-w-0 flex-col rounded-2xl p-5 transition duration-300 hover:-translate-y-1">
      <OpportunityImage
        src={opportunity.image_url}
        alt={`${opportunity.title} görseli`}
      />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="atlas-muted text-[9px] font-bold uppercase tracking-[0.14em]">
            Kaynak
          </p>
          <p className="atlas-text mt-1 truncate text-xs font-semibold">
            {opportunity.source_name}
          </p>
        </div>
        {opportunity.is_featured && (
          <span className="shrink-0 text-lg text-[#ffd93d]" title="Öne çıkan">
            ✦
          </span>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
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

      <div className="mt-4 flex-1">
        <h3 className="atlas-text text-lg font-semibold leading-7 tracking-[-0.02em]">
          {opportunity.title}
        </h3>
        <p className="atlas-muted mt-3 line-clamp-3 text-sm leading-6">
          {summaryDisplay.text}
        </p>
        {showExplanationButton && (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setShowTurkishExplanation((current) => !current)}
              aria-expanded={showTurkishExplanation}
              aria-controls={explanationId}
              className="atlas-control rounded-full px-3 py-2 text-[11px] font-semibold transition hover:border-[var(--atlas-border-hover)] hover:text-[var(--atlas-text)]"
            >
              {showTurkishExplanation
                ? "Türkçe açıklamayı gizle"
                : "Türkçe açıklama"}
            </button>
            {showTurkishExplanation && turkishExplanation && (
              <div
                id={explanationId}
                className="atlas-text mt-3 rounded-xl border border-[var(--atlas-border)] bg-[var(--atlas-surface)] px-3 py-3 text-xs leading-5"
              >
                <p className="atlas-muted mb-1 text-[9px] font-bold uppercase tracking-[0.12em]">
                  Türkçe kısa açıklama
                </p>
                {turkishExplanation}
              </div>
            )}
          </div>
        )}
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-[var(--atlas-border)] pt-4 text-xs">
        <div className="min-w-0">
          <dt className="atlas-muted text-[9px] font-bold uppercase tracking-[0.12em]">
            Bölge
          </dt>
          <dd className="atlas-text mt-1 truncate font-medium">
            {opportunity.location ?? "Online"}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="atlas-muted text-[9px] font-bold uppercase tracking-[0.12em]">
            Tarih
          </dt>
          <dd className="atlas-text mt-1 font-medium">
            {dateDisplay
              ? `${dateDisplay.label}: ${dayjs(dateDisplay.value).format("DD.MM.YYYY")}`
              : "Tarih belirtilmemiş"}
          </dd>
        </div>
      </dl>

      <div className="mt-4 flex justify-end">
        {link && linkLabel ? (
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            className="atlas-control rounded-full px-3 py-2 text-[11px] font-semibold transition group-hover:border-[#ff4d9d]/50 group-hover:text-[#ff85ba]"
            aria-label={`${opportunity.title}: ${linkLabel}`}
          >
            {linkLabel}
          </a>
        ) : (
          <span className="atlas-muted text-[10px]">Bağlantı bulunamadı</span>
        )}
      </div>
    </article>
  );
}
