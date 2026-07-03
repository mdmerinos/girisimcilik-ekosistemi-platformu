import { scrapeGenericHtml } from "@/lib/scrapers/genericHtmlScraper";
import type { OpportunityInput } from "@/types/opportunity";

export function scrapeYildizTeknopark(): Promise<OpportunityInput[]> {
  return scrapeGenericHtml({
    url: "https://www.yildizteknopark.com.tr/duyurular",
    sourceName: "Yıldız Teknopark",
    category: "Etkinlik ve Programlar",
    itemSelector: 'a[href*="/duyurular/"]',
    linkPattern: /yildizteknopark\.com\.tr\/duyurular\/[^/]+/i,
    containerSelector: "article, .card, .post-item, li",
    summarySelector: "p",
    dateSelector: "time, .date, .tarih",
  });
}
