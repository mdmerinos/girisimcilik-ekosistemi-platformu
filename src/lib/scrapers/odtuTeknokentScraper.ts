import { scrapeGenericHtml } from "@/lib/scrapers/genericHtmlScraper";
import type { OpportunityInput } from "@/types/opportunity";

export function scrapeOdtuTeknokent(): Promise<OpportunityInput[]> {
  return scrapeGenericHtml({
    url: "https://www.odtuteknokent.com.tr/tr/haber-kategori/odtu-teknokent/",
    sourceName: "ODTÜ Teknokent",
    category: "Etkinlik ve Programlar",
    itemSelector:
      'main a[href*="/tr/haber/"], main a[href*="/tr/haberler/"], main a[href*="/tr/duyuru/"]',
    linkPattern:
      /odtuteknokent\.com\.tr\/tr\/(?:haber|haberler|duyuru)\/[^/]+/i,
    containerSelector: "article, .card, .news-item, .haber-item, li",
    titleSelector: "h2, h3, h4",
    summarySelector: "p",
    dateSelector: "time, .date, .tarih",
  });
}
