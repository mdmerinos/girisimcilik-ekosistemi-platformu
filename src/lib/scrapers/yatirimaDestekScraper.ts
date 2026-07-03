import { scrapeGenericHtml } from "@/lib/scrapers/genericHtmlScraper";
import type { OpportunityInput } from "@/types/opportunity";

export function scrapeYatirimaDestek(): Promise<OpportunityInput[]> {
  return scrapeGenericHtml({
    url: "https://www.yatirimadestek.gov.tr/gelismis-arama",
    sourceName: "Yatırıma Destek",
    category: "Ulusal Destek ve Fonlar",
    itemSelector:
      "main .card, main .support-item, main .search-result, .destek-item",
    linkSelector: 'a[href]:not([href*=".pdf"]):not([href="#"])',
    titleSelector: "h2, h3, h4, h5",
    summarySelector: "p, .description",
    dateSelector: "time, .date, .tarih",
    maxItems: 40,
  });
}
