import { scrapeGenericHtml } from "@/lib/scrapers/genericHtmlScraper";
import type { OpportunityInput } from "@/types/opportunity";

export function scrapeDiana(): Promise<OpportunityInput[]> {
  return scrapeGenericHtml({
    url: "https://www.diana.nato.int/challenges.html",
    sourceName: "NATO DIANA",
    category: "Uluslararası Fonlar",
    itemSelector:
      'main a[href*="challenge"], .challenge a[href], a[href*="/challenges/"]',
    linkPattern: /diana\.nato\.int\/.+challenge/i,
    containerSelector: "article, .card, .challenge, li",
    summarySelector: "p",
    dateSelector: "time, .date",
    location: "Global",
    maxItems: 20,
  });
}
