import { scrapeGenericHtml } from "@/lib/scrapers/genericHtmlScraper";
import type { OpportunityInput } from "@/types/opportunity";

export function scrapeItuCekirdek(): Promise<OpportunityInput[]> {
  return scrapeGenericHtml({
    url: "https://itucekirdek.com/programlar/",
    sourceName: "İTÜ Çekirdek",
    category: "Etkinlik ve Programlar",
    itemSelector: "a[href]",
    linkPattern:
      /itucekirdek\.com\/(?:[^/]*(?:program|bigg|acceleration|growth|kulucka|demo-day|enerji|otomotiv|hubrica|dijitalsaglik|iklim)[^/]*)\/?$/i,
    containerSelector: "article, .card, .vc_column_container, .portfolio-item, li",
    titleSelector: "h2, h3, h4, h5, .title",
    summarySelector: "p",
    maxItems: 30,
  });
}
