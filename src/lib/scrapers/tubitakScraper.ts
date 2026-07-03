import { scrapeGenericHtml } from "@/lib/scrapers/genericHtmlScraper";
import type { OpportunityInput } from "@/types/opportunity";

const BIGG_FALLBACK_URL =
  "https://tubitak.gov.tr/tr/destekler/sanayi/ulusal-destek-programlari/1812-yatirim-tabanli-girisimcilik-destek-programi-bigg-yatirim";

export function scrapeTubitak(): Promise<OpportunityInput[]> {
  return scrapeGenericHtml({
    url: "https://tubitak.gov.tr/tr/duyuru",
    sourceName: "TÜBİTAK",
    category: "Ulusal Destek ve Fonlar",
    itemSelector: 'a[href*="/tr/duyuru/"]',
    linkPattern: /tubitak\.gov\.tr\/tr\/duyuru\/[^/]+$/i,
    containerSelector: "article, .views-row, .card, li",
    summarySelector: "p",
    dateSelector: "time, .date, .field--name-field-date",
  });
}

export async function scrapeTubitakBigg(): Promise<OpportunityInput[]> {
  try {
    return await scrapeGenericHtml({
      url: "https://bigg.tubitak.gov.tr/",
      sourceName: "TÜBİTAK BİGG",
      category: "Ulusal Destek ve Fonlar",
      itemSelector: "main a[href], .content a[href]",
      linkPattern: /bigg\.tubitak\.gov\.tr/i,
      containerSelector: "article, .card, .views-row, li",
      summarySelector: "p",
      dateSelector: "time, .date",
      maxItems: 20,
    });
  } catch (primaryError) {
    try {
      return await scrapeGenericHtml({
        url: BIGG_FALLBACK_URL,
        sourceName: "TÜBİTAK BİGG",
        category: "Ulusal Destek ve Fonlar",
        itemSelector:
          'main a[href*="/sites/default/files/"], main a[href*="1812"]',
        linkPattern:
          /tubitak\.gov\.tr\/(?:sites\/default\/files\/|tr\/destekler\/.*1812)/i,
        containerSelector: "article, .field__item, .paragraph, li",
        summarySelector: "p",
        dateSelector: "time, .date, .field--name-field-date",
        maxItems: 20,
      });
    } catch {
      throw primaryError;
    }
  }
}
