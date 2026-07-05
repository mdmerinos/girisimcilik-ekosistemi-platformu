import { hasArchiveSignal } from "@/lib/opportunities/opportunityFreshness";
import { scrapeGenericHtml } from "@/lib/scrapers/genericHtmlScraper";
import type { OpportunityInput } from "@/types/opportunity";

export function isKosgebArchiveItem(item: OpportunityInput): boolean {
  return hasArchiveSignal(item);
}

export async function scrapeKosgebAnnouncements(): Promise<OpportunityInput[]> {
  const items = await scrapeGenericHtml({
    url: "https://www.kosgeb.gov.tr/site/tr/genel/liste/2/duyurular",
    sourceName: "KOSGEB Duyuruları",
    category: "Ulusal Destek ve Fonlar",
    itemSelector: 'a[href*="/site/tr/genel/detay/"]',
    linkPattern: /kosgeb\.gov\.tr\/site\/tr\/genel\/detay\/\d+/i,
    excludeLinkPattern:
      /\/detay\/(?:180|8535)\/|(?:turkiye-gazetesi|gazete|basinda|medya-yansimasi|kupur|arsiv)/i,
    containerSelector: "article, .item, .news-item, li",
    summarySelector: "p",
    dateSelector: "time, .date, .tarih",
  });
  return items.filter((item) => !isKosgebArchiveItem(item));
}

export async function scrapeKosgebSupports(): Promise<OpportunityInput[]> {
  const items = await scrapeGenericHtml({
    url: "https://www.kosgeb.gov.tr/site/tr/genel/destekler",
    sourceName: "KOSGEB Destekleri",
    category: "Ulusal Destek ve Fonlar",
    itemSelector: 'a[href*="/site/tr/genel/destekdetay/"]',
    linkPattern: /kosgeb\.gov\.tr\/site\/tr\/genel\/destekdetay\/\d+/i,
    containerSelector: "article, .item, .support-item, li",
    summarySelector: "p",
    maxItems: 40,
  });
  return items.filter((item) => !isKosgebArchiveItem(item));
}

export const scrapeKosgeb = scrapeKosgebAnnouncements;
