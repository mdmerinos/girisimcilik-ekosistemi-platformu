import { scrapeGenericHtml } from "@/lib/scrapers/genericHtmlScraper";
import type { OpportunityInput } from "@/types/opportunity";

export function scrapeUlusalAjans(): Promise<OpportunityInput[]> {
  return scrapeGenericHtml({
    url: "https://www.ua.gov.tr/haber/",
    sourceName: "Türkiye Ulusal Ajansı",
    category: "Etkinlik ve Programlar",
    itemSelector: 'a[href^="/haber/"]',
    linkPattern: /ua\.gov\.tr\/haber\/[^/]+\/?$/i,
    containerSelector: "article, .news-item, .card, li",
    summarySelector: "p",
    dateSelector: "time, .date, .tarih",
  });
}
