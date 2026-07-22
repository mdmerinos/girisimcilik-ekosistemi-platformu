import { scrapeDiana } from "@/lib/scrapers/dianaScraper";
import { fetchEuFunding } from "@/lib/scrapers/euFundingApi";
import {
  scrapeGenericHtml,
  type HtmlScraperOptions,
} from "@/lib/scrapers/genericHtmlScraper";
import { fetchGrantsGov } from "@/lib/scrapers/grantsGovApi";
import { scrapeItuCekirdek } from "@/lib/scrapers/ituCekirdekScraper";
import {
  scrapeKosgebAnnouncements,
  scrapeKosgebSupports,
} from "@/lib/scrapers/kosgebScraper";
import { scrapeOdtuTeknokent } from "@/lib/scrapers/odtuTeknokentScraper";
import {
  collectRssWithPublicFallback,
  collectRssWithPublicFallbackDetailed,
  scrapePublicNewsListing,
  type PublicNewsListingOptions,
} from "@/lib/scrapers/publicNewsListingScraper";
import { scrapeRss } from "@/lib/scrapers/rssScraper";
import { fetchSamGov } from "@/lib/scrapers/samGovApi";
import {
  scrapeTubitak,
  scrapeTubitakBigg,
} from "@/lib/scrapers/tubitakScraper";
import { scrapeUlusalAjans } from "@/lib/scrapers/ulusalAjansScraper";
import { scrapeYatirimaDestek } from "@/lib/scrapers/yatirimaDestekScraper";
import { scrapeYildizTeknopark } from "@/lib/scrapers/yildizTeknoparkScraper";
import type {
  OpportunityCategory,
  OpportunityInput,
} from "@/types/opportunity";

export type SourceKind = "rss" | "html" | "api";
export type SourceGroup = "technopark";
export type SourceAccessMode = SourceKind | "fragile";
export type OpportunityType =
  | "funding"
  | "investment"
  | "accelerator"
  | "event"
  | "news"
  | "program";

export type SourceConfig = {
  id: string;
  name: string;
  kind: SourceKind;
  sourceGroup?: SourceGroup;
  accessMode?: SourceAccessMode;
  url: string;
  fetchUrls?: string[];
  enabled: boolean;
  fragile: boolean;
  requiresApiKey: boolean;
  requiredEnv?: string;
  category: OpportunityCategory;
  opportunityType: OpportunityType;
  country: string;
  notes: string;
  collect: () => Promise<OpportunityInput[]>;
  collectDetailed?: () => Promise<{
    items: OpportunityInput[];
    attemptedUrls: string[];
    fallbackStatus: "not_needed" | "success" | "failed";
  }>;
};

type RssSourceOptions = {
  id: string;
  name: string;
  url: string;
  sourceName?: string;
  category: OpportunityCategory;
  opportunityType: OpportunityType;
  country: string;
  notes: string;
  fragile?: boolean;
  publicFallback?: PublicNewsListingOptions;
};

function rssSource(options: RssSourceOptions): SourceConfig {
  const collectRss = () =>
    scrapeRss({
      feedUrl: options.url,
      sourceName: options.sourceName ?? options.name,
      category: options.category,
      maxItems: 50,
      location: options.country,
    });
  const collectFallbackDetailed = options.publicFallback
    ? () =>
        collectRssWithPublicFallbackDetailed({
          collectRss,
          collectPublic: () =>
            scrapePublicNewsListing(options.publicFallback!),
          rssUrl: options.url,
          publicUrl: options.publicFallback!.url,
        })
    : undefined;
  return {
    ...options,
    kind: "rss",
    enabled: true,
    fragile: options.fragile ?? false,
    requiresApiKey: false,
    fetchUrls: [
      options.url,
      ...(options.publicFallback ? [options.publicFallback.url] : []),
    ],
    collect: () =>
      options.publicFallback
        ? collectRssWithPublicFallback({
            collectRss,
            collectPublic: () =>
              scrapePublicNewsListing(options.publicFallback!),
            rssUrl: options.url,
            publicUrl: options.publicFallback.url,
          })
        : collectRss(),
    collectDetailed: collectFallbackDetailed,
  };
}

type HtmlSourceOptions = Omit<
  SourceConfig,
  "kind" | "enabled" | "requiresApiKey" | "collect"
> & {
  scraper: Omit<
    HtmlScraperOptions,
    "url" | "sourceName" | "category" | "location"
  >;
};

function htmlSource(options: HtmlSourceOptions): SourceConfig {
  const { scraper, ...metadata } = options;
  return {
    ...metadata,
    kind: "html",
    enabled: true,
    requiresApiKey: false,
    collect: () =>
      scrapeGenericHtml({
        ...scraper,
        url: options.url,
        sourceName: options.name,
        category: options.category,
        location: options.country,
      }),
  };
}

function configuredSource(source: SourceConfig): SourceConfig {
  return source;
}

type TechnoparkHtmlInventoryItem = {
  id: string;
  name: string;
  url: string;
  fragile?: boolean;
  category?: OpportunityCategory;
  opportunityType?: OpportunityType;
  notes?: string;
  itemSelector?: string;
  linkPattern: RegExp;
  excludeLinkPattern?: RegExp;
  maxItems?: number;
};

function technoparkHtmlSource(
  source: TechnoparkHtmlInventoryItem,
): SourceConfig {
  return htmlSource({
    id: source.id,
    name: source.name,
    url: source.url,
    fragile: source.fragile ?? true,
    sourceGroup: "technopark",
    accessMode: (source.fragile ?? true) ? "fragile" : "html",
    category: source.category ?? "Etkinlik ve Programlar",
    opportunityType: source.opportunityType ?? "program",
    country: "Türkiye",
    notes:
      source.notes ??
      "TGBD üyesi teknopark public duyuru/haber/program sayfası; erişim kısıtı varsa fragile raporlanır.",
    scraper: {
      itemSelector:
        source.itemSelector ??
        'main article a[href], main .card a[href], main .post a[href], #content a[href], a[href*="duyuru"], a[href*="haber"], a[href*="etkinlik"], a[href*="program"], a[href*="basvuru"]',
      linkPattern: source.linkPattern,
      excludeLinkPattern:
        source.excludeLinkPattern ??
        /\/(?:kategori|category|etiket|tag|author|yazar|arama|search|login|giris|iletisim|contact|kurumsal|hakkimizda|about)(?:\/|$)/i,
      containerSelector:
        "article, .card, .post, .news, .news-item, .duyuru, .event, .etkinlik, li, tr, section, div",
      titleSelector: "h1, h2, h3, h4, h5, .title, .baslik",
      summarySelector: "p, .summary, .description, .excerpt, td",
      dateSelector: "time, .date, .tarih, .published, td",
      maxItems: source.maxItems ?? 40,
      // This inventory intentionally contains broad, occasionally unavailable
      // public sites. Fail fast so one daily run stays within the serverless
      // execution window instead of spending three long attempts per site.
      requestTimeoutMs: 6_000,
      requestRetries: 0,
    },
  });
}

export const sourceConfigs: SourceConfig[] = [
  rssSource({
    id: "webrazzi-rss",
    name: "Webrazzi",
    url: "https://webrazzi.com/feed/",
    category: "Haber ve Sosyal Medya Akışı",
    opportunityType: "news",
    country: "Türkiye",
    notes: "Resmî RSS akışı.",
    publicFallback: {
      url: "https://webrazzi.com/",
      sourceName: "Webrazzi",
      category: "Haber ve Sosyal Medya Akışı",
      location: "Türkiye",
      itemSelector: 'a[href*="webrazzi.com/20"]',
      linkPattern: /webrazzi\.com\/20\d{2}\/\d{1,2}\/\d{1,2}\/[^/]+\/?$/i,
      containerSelector: "article, li, .post, .card",
      summarySelector: "p",
      maxItems: 50,
    },
  }),
  rssSource({
    id: "swipeline-rss",
    name: "Swipeline",
    url: "https://swipeline.co/feed/",
    category: "Haber ve Sosyal Medya Akışı",
    opportunityType: "news",
    country: "Türkiye",
    notes: "Public WordPress RSS akışı; başlık, bağlantı, özet, yayın tarihi ve görsel alınır.",
    fragile: true,
  }),
  rssSource({
    id: "techcrunch-rss",
    name: "TechCrunch",
    url: "https://techcrunch.com/feed/",
    category: "Haber ve Sosyal Medya Akışı",
    opportunityType: "news",
    country: "Global",
    notes: "Ana teknoloji ve startup RSS akışı.",
    publicFallback: {
      url: "https://techcrunch.com/category/startups/",
      sourceName: "TechCrunch",
      category: "Haber ve Sosyal Medya Akışı",
      location: "Global",
      itemSelector: ".loop-card__content a[href]",
      linkPattern: /techcrunch\.com\/20\d{2}\/\d{1,2}\/\d{1,2}\/[^/]+\/?$/i,
      containerSelector: ".loop-card__content, article",
      summarySelector: "p",
      maxItems: 50,
    },
  }),
  rssSource({
    id: "techcrunch-startups-rss",
    name: "TechCrunch / Startups",
    sourceName: "TechCrunch",
    url: "https://techcrunch.com/category/startups/feed/",
    category: "Haber ve Sosyal Medya Akışı",
    opportunityType: "news",
    country: "Global",
    notes: "Startup kategori RSS akışı.",
  }),
  rssSource({
    id: "techcrunch-funding-rss",
    name: "TechCrunch / Funding",
    sourceName: "TechCrunch",
    url: "https://techcrunch.com/tag/funding/feed/",
    category: "Yatırım ve Sermaye Ağları",
    opportunityType: "investment",
    country: "Global",
    notes: "Funding etiket RSS akışı.",
  }),
  rssSource({
    id: "venturebeat-rss",
    name: "VentureBeat",
    url: "https://venturebeat.com/feed/",
    category: "Haber ve Sosyal Medya Akışı",
    opportunityType: "news",
    country: "Global",
    notes: "Resmî RSS akışı.",
  }),

  ...[
    ["startup", "Hacker News / Startup", "Haber ve Sosyal Medya Akışı", "news"],
    ["funding", "Hacker News / Funding", "Yatırım ve Sermaye Ağları", "investment"],
    ["accelerator", "Hacker News / Accelerator", "Etkinlik ve Programlar", "accelerator"],
    ["grant", "Hacker News / Grant", "Uluslararası Fonlar", "funding"],
    ["venture%20capital", "Hacker News / Venture Capital", "Yatırım ve Sermaye Ağları", "investment"],
  ].map(([query, name, category, opportunityType]) =>
    rssSource({
      id: `hacker-news-${query.replace("%20", "-")}`,
      name,
      sourceName: "Hacker News",
      url: `https://hnrss.org/newest?q=${query}`,
      category: category as OpportunityCategory,
      opportunityType: opportunityType as OpportunityType,
      country: "Global",
      notes: "HN RSS arama akışı; farklı sorgulardaki tekrarlar aynı source_name ile ayıklanır.",
      fragile: query === "venture%20capital",
    }),
  ),
  rssSource({
    id: "egirisim-rss",
    name: "egirişim",
    url: "https://egirisim.com/feed/",
    category: "Haber ve Sosyal Medya Akışı",
    opportunityType: "news",
    country: "Türkiye",
    notes: "Resmî WordPress RSS akışı.",
    publicFallback: {
      url: "https://egirisim.com/",
      sourceName: "egirişim",
      category: "Haber ve Sosyal Medya Akışı",
      location: "Türkiye",
      itemSelector: ".td-module-meta-info h1 a[href], .td-module-meta-info h2 a[href], .td-module-meta-info h3 a[href]",
      linkPattern: /egirisim\.com\/20\d{2}\/\d{1,2}\/\d{1,2}\/[^/]+\/?$/i,
      containerSelector: ".td_module_wrap, article, .td-module-meta-info",
      summarySelector: ".td-excerpt, p",
      dateSelector: "time, .entry-date, .td-post-date",
      maxItems: 50,
    },
  }),
  rssSource({
    id: "startupcentrum-news",
    name: "StartupCentrum",
    url: "https://media.startupcentrum.com/tr/feed/",
    category: "Haber ve Sosyal Medya Akışı",
    opportunityType: "news",
    country: "Türkiye",
    notes: "StartupCentrum Media public RSS akışı; iş ilanı sayfaları yerine editoryal içerik alınır.",
    publicFallback: {
      url: "https://media.startupcentrum.com/tr/",
      sourceName: "StartupCentrum",
      category: "Haber ve Sosyal Medya Akışı",
      location: "Türkiye",
      itemSelector: ".td-module-meta-info h1 a[href], .td-module-meta-info h2 a[href], .td-module-meta-info h3 a[href]",
      linkPattern: /media\.startupcentrum\.com\/tr\/[^/]+\/?$/i,
      excludeLinkPattern: /\/(?:category|tag|author|wp-admin|jobs?|ilan)\//i,
      containerSelector: ".td_module_wrap, article, .td-module-meta-info",
      summarySelector: ".td-excerpt, p",
      dateSelector: "time, .entry-date, .td-post-date",
      maxItems: 50,
    },
  }),
  rssSource({
    id: "eu-startups-rss",
    name: "EU-Startups",
    url: "https://www.eu-startups.com/feed/",
    category: "Haber ve Sosyal Medya Akışı",
    opportunityType: "news",
    country: "Avrupa / Global",
    notes: "Public RSS akışı; startup ve yatırım sinyalleri içerik bazında sınıflandırılır.",
    publicFallback: {
      url: "https://www.eu-startups.com/",
      sourceName: "EU-Startups",
      category: "Haber ve Sosyal Medya Akışı",
      location: "Avrupa / Global",
      itemSelector: "main article h2 a[href], main article h3 a[href]",
      linkPattern: /eu-startups\.com\/20\d{2}\/\d{1,2}\/[^/]+\/?$/i,
      containerSelector: "article",
      summarySelector: "p",
      dateSelector: "time, .date",
      maxItems: 50,
    },
  }),
  htmlSource({
    id: "crunchbase-news",
    name: "Crunchbase News",
    url: "https://news.crunchbase.com/",
    fragile: true,
    category: "Haber ve Sosyal Medya Akışı",
    opportunityType: "news",
    country: "Global",
    notes: "Public haber sayfası Cloudflare 403 verebiliyor; koruma aşılmadan fragile raporlanır.",
    scraper: {
      itemSelector: "main article a[href], main h2 a[href], main h3 a[href]",
      linkPattern: /news\.crunchbase\.com\/(?:venture|startups|ai|business|fintech|ma|public)\/[^/]+\/?$/i,
      containerSelector: "article, .post, .card",
      titleSelector: "h2, h3",
      summarySelector: "p",
      dateSelector: "time, .date",
      maxItems: 50,
    },
  }),
  htmlSource({
    id: "sifted-latest",
    name: "Sifted",
    url: "https://sifted.eu/latest",
    fragile: true,
    category: "Haber ve Sosyal Medya Akışı",
    opportunityType: "news",
    country: "Avrupa / Global",
    notes: "Public latest sayfası Cloudflare/paywall koruması verebiliyor; yalnızca public kartlar denenir.",
    scraper: {
      itemSelector: "main article a[href], main h2 a[href], main h3 a[href]",
      linkPattern: /sifted\.eu\/articles\/[^/]+\/?$/i,
      containerSelector: "article, .card",
      titleSelector: "h2, h3",
      summarySelector: "p",
      dateSelector: "time, .date",
      maxItems: 40,
    },
  }),
  htmlSource({
    id: "reuters-technology",
    name: "Reuters Technology",
    url: "https://www.reuters.com/technology/",
    fragile: true,
    category: "Haber ve Sosyal Medya Akışı",
    opportunityType: "news",
    country: "Global",
    notes: "Public teknoloji listesi 401/bot koruması verebiliyor; erişim zorlanmaz.",
    scraper: {
      itemSelector: "main article a[href], main a[data-testid='Heading']",
      linkPattern: /reuters\.com\/technology\/[^/]+\/[^/]+\/?$/i,
      containerSelector: "article, li",
      titleSelector: "h2, h3",
      summarySelector: "p",
      dateSelector: "time",
      maxItems: 40,
    },
  }),
  htmlSource({
    id: "the-information",
    name: "The Information",
    url: "https://www.theinformation.com/",
    fragile: true,
    category: "Haber ve Sosyal Medya Akışı",
    opportunityType: "news",
    country: "Global",
    notes: "Paywall aşılmaz; yalnızca public başlık/meta görünürse alınır, aksi halde fragile/empty olur.",
    scraper: {
      itemSelector: "main article a[href], main h2 a[href], main h3 a[href]",
      linkPattern: /theinformation\.com\/articles\/[^/]+\/?$/i,
      containerSelector: "article, .story",
      titleSelector: "h2, h3",
      summarySelector: "p",
      dateSelector: "time",
      maxItems: 30,
    },
  }),

  configuredSource({
    id: "tubitak",
    name: "TÜBİTAK Duyuruları",
    kind: "html",
    url: "https://tubitak.gov.tr/tr/duyuru",
    enabled: true,
    fragile: false,
    requiresApiKey: false,
    category: "Ulusal Destek ve Fonlar",
    opportunityType: "funding",
    country: "Türkiye",
    notes: "Resmî duyuru listesi.",
    collect: scrapeTubitak,
  }),
  configuredSource({
    id: "tubitak-bigg",
    name: "TÜBİTAK BİGG",
    kind: "html",
    url: "https://bigg.tubitak.gov.tr/",
    enabled: true,
    fragile: true,
    requiresApiKey: false,
    category: "Ulusal Destek ve Fonlar",
    opportunityType: "funding",
    country: "Türkiye",
    notes: "Bağlantı zaman zaman sunucu tarafından kapatılıyor.",
    collect: scrapeTubitakBigg,
  }),
  configuredSource({
    id: "kosgeb-announcements",
    name: "KOSGEB Duyuruları",
    kind: "html",
    url: "https://www.kosgeb.gov.tr/site/tr/genel/liste/2/duyurular",
    enabled: true,
    fragile: false,
    requiresApiKey: false,
    category: "Ulusal Destek ve Fonlar",
    opportunityType: "funding",
    country: "Türkiye",
    notes: "Resmî duyuru listesi.",
    collect: scrapeKosgebAnnouncements,
  }),
  configuredSource({
    id: "kosgeb-supports",
    name: "KOSGEB Destekleri",
    kind: "html",
    url: "https://www.kosgeb.gov.tr/site/tr/genel/destekler",
    enabled: true,
    fragile: false,
    requiresApiKey: false,
    category: "Ulusal Destek ve Fonlar",
    opportunityType: "funding",
    country: "Türkiye",
    notes: "Resmî destek programı listesi.",
    collect: scrapeKosgebSupports,
  }),
  configuredSource({
    id: "yatirima-destek",
    name: "Yatırıma Destek",
    kind: "html",
    url: "https://www.yatirimadestek.gov.tr/gelismis-arama",
    enabled: true,
    fragile: true,
    requiresApiKey: false,
    category: "Ulusal Destek ve Fonlar",
    opportunityType: "funding",
    country: "Türkiye",
    notes: "Bot koruması veya 415 yanıtı verebiliyor.",
    collect: scrapeYatirimaDestek,
  }),
  configuredSource({
    id: "nato-diana",
    name: "NATO DIANA",
    kind: "html",
    url: "https://www.diana.nato.int/connect.html",
    enabled: true,
    fragile: true,
    requiresApiKey: false,
    category: "Uluslararası Fonlar",
    opportunityType: "accelerator",
    country: "Global",
    notes:
      "Resmî haber ve fırsat sayfaları; ilk dört sayfa kontrollü taranır, sunucu otomatik isteklere 403 verebilir.",
    collect: scrapeDiana,
  }),
  configuredSource({
    id: "ulusal-ajans",
    name: "Türkiye Ulusal Ajansı",
    kind: "html",
    url: "https://www.ua.gov.tr/haber/",
    enabled: true,
    fragile: false,
    requiresApiKey: false,
    category: "Etkinlik ve Programlar",
    opportunityType: "program",
    country: "Türkiye",
    notes: "Erasmus+ ve ESC haberleri.",
    collect: scrapeUlusalAjans,
  }),
  configuredSource({
    id: "itu-cekirdek",
    name: "İTÜ Çekirdek",
    kind: "html",
    url: "https://itucekirdek.com/programlar/",
    enabled: true,
    fragile: false,
    requiresApiKey: false,
    category: "Etkinlik ve Programlar",
    opportunityType: "accelerator",
    country: "Türkiye",
    notes: "Program ve hızlandırıcı sayfaları.",
    collect: scrapeItuCekirdek,
  }),
  htmlSource({
    id: "itu-ari-teknokent",
    name: "İTÜ ARI Teknokent",
    url: "https://www.ariteknokent.com.tr/tr/haberler",
    fragile: false,
    sourceGroup: "technopark",
    accessMode: "html",
    category: "Haber ve Sosyal Medya Akışı",
    opportunityType: "news",
    country: "Türkiye",
    notes: "Public haber kartları; girişim, yatırım, program ve etkinlik içerikleri alınır.",
    scraper: {
      itemSelector: 'a[href*="/tr/haberler/"]',
      linkPattern: /ariteknokent\.com\.tr\/tr\/haberler\/[^/]+\/?$/i,
      excludeLinkPattern: /\/(?:basinda|arsiv)\//i,
      containerSelector: "article, .news-item, .item, .card, li, div",
      titleSelector: "h2, h3, h4, .title",
      summarySelector: "p, .description, .summary",
      dateSelector: "time, .date, .tarih",
      maxItems: 50,
    },
  }),
  configuredSource({
    id: "odtu-teknokent",
    name: "ODTÜ Teknokent",
    kind: "html",
    sourceGroup: "technopark",
    accessMode: "fragile",
    url: "https://www.odtuteknokent.com.tr/tr/",
    enabled: true,
    fragile: true,
    requiresApiKey: false,
    category: "Etkinlik ve Programlar",
    opportunityType: "program",
    country: "Türkiye",
    notes:
      "Ana sayfadaki gerçek haber, program ve başvuru kartları; bot koruması döndürebilir.",
    collect: scrapeOdtuTeknokent,
  }),
  configuredSource({
    id: "yildiz-teknopark",
    name: "Yıldız Teknopark",
    kind: "html",
    sourceGroup: "technopark",
    accessMode: "html",
    url: "https://www.yildizteknopark.com.tr/duyurular",
    enabled: true,
    fragile: false,
    requiresApiKey: false,
    category: "Etkinlik ve Programlar",
    opportunityType: "program",
    country: "Türkiye",
    notes: "Resmî duyuru listesi.",
    collect: scrapeYildizTeknopark,
  }),

  technoparkHtmlSource({
    id: "innopark-events",
    name: "InnoPark / Etkinlik ve Duyurular",
    url: "https://innopark.com.tr/etkinlik-ve-duyurular",
    fragile: false,
    category: "Etkinlik ve Programlar",
    opportunityType: "event",
    notes:
      "InnoPark Konya TGB etkinlik, duyuru ve program başvuru kartları.",
    linkPattern:
      /innopark\.com\.tr\/(?:etkinlik-ve-duyurular|etkinlik|duyuru|haber|program|basvuru|girisimci|tubitak)[^#]*/i,
    maxItems: 60,
  }),
  technoparkHtmlSource({
    id: "innopark-incubation-programs",
    name: "InnoPark / Kuluçka ve Hızlandırma",
    url: "https://innopark.com.tr/teknoloji-transfer-ofisi-kulucka-ve-hizlandirma-programlari",
    fragile: false,
    category: "Etkinlik ve Programlar",
    opportunityType: "accelerator",
    notes:
      "InnoPark kuluçka, ön kuluçka, hızlandırma ve başvuru/program içerikleri.",
    itemSelector:
      'main a[href], #content a[href], a[href*="kulucka"], a[href*="hizlandirma"], a[href*="girisimci"], a[href*="basvuru"]',
    linkPattern:
      /innopark\.com\.tr\/(?:teknoloji-transfer-ofisi|kulucka|hizlandirma|girisimci|basvuru)[^#]*/i,
    maxItems: 30,
  }),
  technoparkHtmlSource({
    id: "innopark-tto-supports",
    name: "InnoPark / TTO ve Girişimcilik Destekleri",
    url: "https://www.innopark.com.tr/teknoloji-transfer-ofisi",
    fragile: false,
    category: "Ulusal Destek ve Fonlar",
    opportunityType: "funding",
    notes:
      "InnoPark TTO proje, patent, girişimcilik ve destek hizmetleri sayfası.",
    itemSelector:
      'main a[href], #content a[href], a[href*="patent"], a[href*="destek"], a[href*="girisim"], a[href*="tto"]',
    linkPattern:
      /innopark\.com\.tr\/(?:teknoloji-transfer-ofisi|patent|destek|girisim|tto)[^#]*/i,
    maxItems: 30,
  }),
  technoparkHtmlSource({
    id: "innopark-info-program",
    name: "InnoPark / Investment for Founders",
    url: "https://info.innopark.com.tr/",
    fragile: true,
    category: "Yatırım ve Sermaye Ağları",
    opportunityType: "investment",
    notes:
      "InnoPark INFO / Investment for Founders girişimci-yatırımcı programı; istemci tarafı içerik empty dönebilir.",
    itemSelector:
      'main a[href], #content a[href], a[href*="basvuru"], a[href*="program"], a[href*="founder"], a[href*="invest"]',
    linkPattern: /(?:info\.)?innopark\.com\.tr\/[^#]*/i,
    maxItems: 25,
  }),

  ...[
    {
      id: "bilkent-cyberpark",
      name: "Bilkent CYBERPARK",
      url: "https://www.cyberpark.com.tr/",
      pattern: /cyberpark\.com\.tr\/(?:haber|duyuru|etkinlik|program|kulucka|girisim)[^#]*/i,
    },
    {
      id: "hacettepe-teknokent",
      name: "Hacettepe Teknokent",
      url: "https://www.hacettepeteknokent.com.tr/",
      pattern: /hacettepeteknokent\.com\.tr\/(?:haber|duyuru|etkinlik|program|kulucka|girisim)[^#]*/i,
    },
    {
      id: "gazi-teknopark",
      name: "Gazi Teknopark",
      url: "https://www.gaziteknopark.com.tr/",
      pattern: /gaziteknopark\.com\.tr\/(?:haber|duyuru|etkinlik|program|kulucka|girisim)[^#]*/i,
    },
    {
      id: "ankara-universitesi-teknokent",
      name: "Ankara Üniversitesi Teknokent",
      url: "https://ankarateknokent.com/",
      pattern: /ankarateknokent\.com\/(?:haber|duyuru|etkinlik|program|kulucka|girisim)[^#]*/i,
    },
    {
      id: "antalya-teknokent",
      name: "Antalya Teknokent",
      url: "https://www.antalya-teknokent.com.tr/",
      pattern: /antalya-teknokent\.com\.tr\/(?:haber|duyuru|etkinlik|program|kulucka|girisim)[^#]*/i,
    },
    {
      id: "ege-teknopark",
      name: "Ege Teknopark",
      url: "https://egeteknopark.com.tr/",
      pattern: /egeteknopark\.com\.tr\/(?:haber|duyuru|etkinlik|program|kulucka|girisim)[^#]*/i,
    },
    {
      id: "depark",
      name: "DEPARK",
      url: "https://depark.com/",
      pattern: /depark\.com\/(?:haber|duyuru|etkinlik|program|kulucka|girisim)[^#]*/i,
    },
    {
      id: "erciyes-teknopark",
      name: "Erciyes Teknopark",
      url: "https://www.erciyesteknopark.com/",
      pattern: /erciyesteknopark\.com\/(?:haber|duyuru|etkinlik|program|kulucka|girisim)[^#]*/i,
    },
    {
      id: "ulutek-teknopark",
      name: "Ulutek Teknopark",
      url: "https://www.ulutek.com.tr/",
      pattern: /ulutek\.com\.tr\/(?:haber|duyuru|etkinlik|program|kulucka|girisim)[^#]*/i,
    },
    {
      id: "marmara-teknokent",
      name: "Marmara Teknokent",
      url: "https://marmarateknokent.com.tr/",
      pattern: /marmarateknokent\.com\.tr\/(?:haber|duyuru|etkinlik|program|kulucka|girisim)[^#]*/i,
    },
    {
      id: "konya-teknokent",
      name: "Konya Teknokent",
      url: "https://innopark.com.tr/",
      pattern: /innopark\.com\.tr\/(?:haber|duyuru|etkinlik|program|basvuru|girisim|teknoloji-transfer-ofisi)[^#]*/i,
      fragile: false,
    },
    {
      id: "mersin-teknopark",
      name: "Mersin Teknopark",
      url: "https://www.mersinteknopark.com/",
      pattern: /mersinteknopark\.com\/(?:haber|duyuru|etkinlik|program|kulucka|girisim)[^#]*/i,
    },
    {
      id: "teknopark-izmir",
      name: "Teknopark İzmir",
      url: "https://www.teknoparkizmir.com.tr/",
      pattern: /teknoparkizmir\.com\.tr\/(?:haber|duyuru|etkinlik|program|kulucka|girisim)[^#]*/i,
    },
    {
      id: "trabzon-teknokent",
      name: "Trabzon Teknokent",
      url: "https://trabzonteknokent.com.tr/",
      pattern: /trabzonteknokent\.com\.tr\/(?:haber|duyuru|etkinlik|program|kulucka|girisim)[^#]*/i,
    },
    {
      id: "entertech-istanbul-teknokent",
      name: "Entertech İstanbul Teknokent",
      url: "https://entertech.com.tr/",
      pattern: /entertech\.com\.tr\/(?:haber|duyuru|etkinlik|program|kulucka|girisim)[^#]*/i,
    },
    {
      id: "ostim-teknopark",
      name: "Ostim Teknopark",
      url: "https://www.ostimteknopark.com.tr/",
      pattern: /ostimteknopark\.com\.tr\/(?:haber|duyuru|etkinlik|program|kulucka|girisim)[^#]*/i,
    },
    {
      id: "teknopark-ankara",
      name: "Teknopark Ankara",
      url: "https://www.teknoparkankara.com.tr/",
      pattern: /teknoparkankara\.com\.tr\/(?:haber|duyuru|etkinlik|program|kulucka|girisim)[^#]*/i,
    },
    {
      id: "ata-teknokent",
      name: "Ata Teknokent",
      url: "https://www.atateknokent.com.tr/",
      pattern: /atateknokent\.com\.tr\/(?:haber|duyuru|etkinlik|program|kulucka|girisim)[^#]*/i,
    },
    {
      id: "bursa-teknopark",
      name: "Bursateknopark",
      url: "https://www.bursateknopark.com.tr/",
      pattern: /bursateknopark\.com\.tr\/(?:haber|duyuru|etkinlik|program|kulucka|girisim)[^#]*/i,
    },
    {
      id: "samsun-teknopark",
      name: "Samsun Teknopark",
      url: "https://samsunteknopark.com/",
      pattern: /samsunteknopark\.com\/(?:haber|duyuru|etkinlik|program|kulucka|girisim)[^#]*/i,
    },
    {
      id: "van-teknokent",
      name: "Van Teknokent",
      url: "https://www.vanteknokent.com/",
      pattern: /vanteknokent\.com\/(?:haber|duyuru|etkinlik|program|kulucka|girisim)[^#]*/i,
    },
    {
      id: "tgbd-member-announcements",
      name: "TGBD / Teknopark Duyuruları",
      url: "https://www.tgbd.org.tr/duyurular",
      pattern: /tgbd\.org\.tr\/(?:.+(?:duyuru|haberi|haber)|duyurular)[^#]*/i,
      notes:
        "TGBD üye teknoparkların ortak duyuru/haber arşivi; üye ekosistem sinyali olarak izlenir.",
    },
  ].map((source) =>
    technoparkHtmlSource({
      id: source.id,
      name: source.name,
      url: source.url,
      fragile: source.fragile ?? true,
      category: "Etkinlik ve Programlar",
      opportunityType: "program",
      notes: source.notes,
      linkPattern: source.pattern,
      maxItems: 35,
    }),
  ),

  htmlSource({
    id: "analiz-gazetesi",
    name: "Analiz Gazetesi / İş ve Girişim",
    url: "https://www.analizgazetesi.com.tr/",
    fragile: true,
    category: "Haber ve Sosyal Medya Akışı",
    opportunityType: "news",
    country: "Türkiye",
    notes: "Public haber kartları erişilebildiğinde alınır; bağlantı zaman zaman ağ/bot kısıtı verebilir.",
    scraper: {
      itemSelector: "main article a[href], main h2 a[href], main h3 a[href]",
      linkPattern: /analizgazetesi\.com\.tr\/(?:haber|is-ve-girisim|teknoloji)\/[^/]+\/?$/i,
      containerSelector: "article, .news, .card, li",
      titleSelector: "h2, h3, h4",
      summarySelector: "p",
      dateSelector: "time, .date, .tarih",
      maxItems: 40,
    },
  }),
  htmlSource({
    id: "endeavor-turkiye",
    name: "Endeavor Türkiye",
    url: "https://turkiye.endeavor.org/programlarimiz/",
    fragile: false,
    category: "Etkinlik ve Programlar",
    opportunityType: "accelerator",
    country: "Türkiye",
    notes: "Resmî program sayfası.",
    scraper: {
      itemSelector: "main article a[href], main .card a[href], #content a[href]",
      linkPattern: /turkiye\.endeavor\.org\/(?!programlarimiz|category|hakkimizda)[^#]+/i,
      containerSelector:
        "article, .card, .program, .wp-block-column, .elementor-column, li",
      titleSelector: "h2, h3, h4, .title",
      summarySelector: "p",
      maxItems: 30,
    },
  }),
  htmlSource({
    id: "girisimcilik-vakfi",
    name: "Türkiye Girişimcilik Vakfı",
    url: "https://www.girisimcilikvakfi.org/",
    fragile: false,
    category: "Etkinlik ve Programlar",
    opportunityType: "program",
    country: "Türkiye",
    notes: "Gençlik, etki ve yetenek programları.",
    scraper: {
      itemSelector: 'a[href*="program"], a[href*="odul"], a[href*="award"]',
      linkPattern: /girisimcilikvakfi\.org\/[^#]+/i,
      containerSelector: "article, .card, section, li",
      titleSelector: "h2, h3, h4, .title",
      summarySelector: "p",
      maxItems: 30,
    },
  }),
  htmlSource({
    id: "kworks",
    name: "KWORKS",
    url: "https://kworks.ku.edu.tr/",
    fragile: true,
    category: "Etkinlik ve Programlar",
    opportunityType: "accelerator",
    country: "Türkiye",
    notes: "Koç Üniversitesi program ve Demo Day sayfaları; 403 döndürebiliyor.",
    scraper: {
      itemSelector: 'a[href*="program"], a[href*="basvuru"], a[href*="demoday"]',
      linkPattern: /(kworks\.ku\.edu\.tr|climatetech\.koc\.com\.tr)/i,
      containerSelector: "article, .card, .elementor-widget, li",
      titleSelector: "h2, h3, h4, .title",
      summarySelector: "p",
      maxItems: 30,
    },
  }),
  htmlSource({
    id: "workup",
    name: "Workup İş Bankası",
    url: "https://www.workup.ist/workup",
    fragile: false,
    category: "Etkinlik ve Programlar",
    opportunityType: "accelerator",
    country: "Türkiye",
    notes: "Workup program ailesi.",
    scraper: {
      itemSelector: 'a[href*="workup"]',
      linkPattern: /workup\.ist\/(?!workup$)[^#]+/i,
      containerSelector: "section, article, .card, li",
      titleSelector: "h2, h3, h4, .title",
      summarySelector: "p",
      maxItems: 20,
    },
  }),
  htmlSource({
    id: "arya-women",
    name: "Arya Women Investment Platform",
    url: "https://www.aryawomen.com/etkinlikler/",
    fragile: true,
    category: "Yatırım ve Sermaye Ağları",
    opportunityType: "event",
    country: "Türkiye / Global",
    notes: "Resmî etkinlik takvimi; bot koruması döndürebiliyor.",
    scraper: {
      itemSelector: 'a[href*="/etkinlik/"]',
      linkPattern: /aryawomen\.com\/etkinlik\/[^/]+/i,
      containerSelector: "article, .tribe-events-calendar-list__event-row, .card",
      titleSelector: "h2, h3, .tribe-events-calendar-list__event-title",
      summarySelector: "p, .tribe-events-calendar-list__event-description",
      dateSelector: "time, .tribe-event-date-start",
      maxItems: 30,
    },
  }),
  htmlSource({
    id: "teknopark-istanbul",
    name: "Teknopark İstanbul",
    url: "https://www.teknoparkistanbul.com.tr/haberler",
    fragile: true,
    sourceGroup: "technopark",
    accessMode: "fragile",
    category: "Etkinlik ve Programlar",
    opportunityType: "program",
    country: "Türkiye",
    notes: "Cloudflare 403 döndürebiliyor.",
    scraper: {
      itemSelector: 'a[href*="/haber/"], a[href*="/haberler/"]',
      linkPattern: /teknoparkistanbul\.com\.tr\/haber/i,
      containerSelector: "article, .card, .news-item, li",
      titleSelector: "h2, h3, h4",
      summarySelector: "p",
      dateSelector: "time, .date",
      maxItems: 30,
    },
  }),
  htmlSource({
    id: "bilisim-vadisi",
    name: "Bilişim Vadisi",
    url: "https://bilisimvadisi.com.tr/",
    fragile: false,
    sourceGroup: "technopark",
    accessMode: "html",
    category: "Etkinlik ve Programlar",
    opportunityType: "program",
    country: "Türkiye",
    notes: "Program, haber ve etkinlik duyuruları.",
    scraper: {
      itemSelector:
        'a[href*="/haberler/"], a[href*="/programlar/"], a[href*="/etkinlikler/"]',
      linkPattern: /bilisimvadisi\.com\.tr\/(?:haberler|programlar|etkinlikler)\/[^/]+/i,
      excludeLinkPattern: /\/author\//i,
      containerSelector: "article, .card, .post, li",
      titleSelector: "h2, h3, h4, .title",
      summarySelector: "p",
      dateSelector: "time, .date",
      maxItems: 50,
    },
  }),
  ...[
    {
      id: "istka",
      name: "İstanbul Kalkınma Ajansı",
      url: "https://www.istka.org.tr/duyurular",
      pattern: /istka\.org\.tr\/.+/i,
      notes: "Sunucu bot koruma sayfası döndürebiliyor.",
    },
    {
      id: "ankaraka",
      name: "Ankara Kalkınma Ajansı",
      url: "https://ankaraka.org.tr/duyurular?t=3",
      pattern: /ankaraka\.org\.tr\/.+/i,
      notes: "Sunucu bot koruma sayfası döndürebiliyor.",
    },
    {
      id: "izka",
      name: "İzmir Kalkınma Ajansı",
      url: "https://izka.org.tr/duyurular/",
      pattern: /izka\.org\.tr\/[^/]+\/?$/i,
      notes: "Bağlantı zaman zaman başarısız oluyor.",
    },
  ].map((agency) =>
    htmlSource({
      ...agency,
      fragile: true,
      category: "Ulusal Destek ve Fonlar",
      opportunityType: "funding",
      country: "Türkiye",
      scraper: {
        itemSelector: "main article a[href], main .card a[href], #content a[href]",
        linkPattern: agency.pattern,
        containerSelector: "article, .card, .views-row, .post, li",
        titleSelector: "h2, h3, h4, h5",
        summarySelector: "p",
        dateSelector: "time, .date, .tarih",
        maxItems: 50,
      },
    }),
  ),

  configuredSource({
    id: "grants-gov",
    name: "Grants.gov",
    kind: "api",
    url: "https://api.grants.gov/v1/api/search2",
    enabled: true,
    fragile: false,
    requiresApiKey: false,
    category: "Uluslararası Fonlar",
    opportunityType: "funding",
    country: "ABD / Global",
    notes: "10 girişimcilik anahtar kelimesiyle public API taraması.",
    collect: fetchGrantsGov,
  }),
  configuredSource({
    id: "eu-funding",
    name: "EU Funding & Tenders",
    kind: "api",
    url: "https://api.tech.ec.europa.eu/search-api/prod/rest/search",
    enabled: true,
    fragile: false,
    requiresApiKey: false,
    category: "Uluslararası Fonlar",
    opportunityType: "funding",
    country: "Avrupa / Global",
    notes: "10 anahtar kelimeyle public SEDIA API taraması.",
    collect: fetchEuFunding,
  }),
  configuredSource({
    id: "sam-gov",
    name: "SAM.gov Opportunities",
    kind: "api",
    url: "https://api.sam.gov/prod/opportunities/v2/search",
    enabled: true,
    fragile: false,
    requiresApiKey: true,
    requiredEnv: "SAM_GOV_API_KEY",
    category: "Uluslararası Fonlar",
    opportunityType: "funding",
    country: "ABD",
    notes: "API key yoksa ingestion kaynağı skipped olur.",
    collect: fetchSamGov,
  }),
  htmlSource({
    id: "nasa-sbir",
    name: "NASA SBIR/STTR",
    url: "https://www.nasa.gov/sbir_sttr/",
    fragile: false,
    category: "Uluslararası Fonlar",
    opportunityType: "funding",
    country: "ABD",
    notes: "NASA program takvimi ve solicitation bağlantıları.",
    scraper: {
      itemSelector:
        'a[href*="/sbir_sttr/"], a[href*="/stmd-solicitations-and-opportunities"]',
      linkPattern: /nasa\.gov\/(?:sbir_sttr|stmd-solicitations)/i,
      excludeLinkPattern: /nasa\.gov\/sbir_sttr\/?$/i,
      containerSelector: "article, tr, .card, li",
      titleSelector: "h2, h3, h4, th",
      summarySelector: "p, td",
      dateSelector: "time, .date, td",
      maxItems: 30,
    },
  }),
  htmlSource({
    id: "sbir-gov",
    name: "SBIR.gov Funding Opportunities",
    url: "https://www.sbir.gov/topics",
    fragile: false,
    category: "Uluslararası Fonlar",
    opportunityType: "funding",
    country: "ABD",
    notes: "Public topic ve solicitation listesi.",
    scraper: {
      itemSelector: 'a[href^="/topics/"]',
      linkPattern: /sbir\.gov\/topics\/\d+$/i,
      containerSelector: "article, .views-row, .card, tr, li",
      titleSelector: "h2, h3, h4, .title",
      summarySelector: "p",
      dateSelector: "time, .date",
      maxItems: 50,
    },
  }),
  htmlSource({
    id: "techstars-news",
    name: "Techstars News",
    url: "https://www.techstars.com/newsroom",
    fragile: false,
    category: "Haber ve Sosyal Medya Akışı",
    opportunityType: "news",
    country: "Global",
    notes: "Techstars newsroom akışı.",
    scraper: {
      itemSelector: 'a[href^="/newsroom/"]',
      linkPattern: /techstars\.com\/newsroom\/[^/]+$/i,
      containerSelector: "article, .card, li",
      titleSelector: "h2, h3, h4",
      summarySelector: "p",
      dateSelector: "time, .date",
      maxItems: 50,
    },
  }),
  htmlSource({
    id: "techstars-programs",
    name: "Techstars Programs",
    url: "https://www.techstars.com/accelerators",
    fragile: false,
    category: "Etkinlik ve Programlar",
    opportunityType: "accelerator",
    country: "Global",
    notes: "Aktif accelerator programları.",
    scraper: {
      itemSelector: 'a[href^="/accelerators/"]',
      linkPattern: /techstars\.com\/accelerators\/[^/]+$/i,
      containerSelector: "article, .card, li",
      titleSelector: "h2, h3, h4",
      summarySelector: "p",
      dateSelector: "time, .date",
      maxItems: 50,
    },
  }),
  htmlSource({
    id: "startup-wise-guys",
    name: "Startup Wise Guys",
    url: "https://startupwiseguys.com/all-programs/",
    fragile: false,
    category: "Etkinlik ve Programlar",
    opportunityType: "accelerator",
    country: "Global",
    notes: "Public program listesi.",
    scraper: {
      itemSelector:
        'a[href*="/all-programs/"], a[href*="/growing/"], a[href*="/building/"]',
      linkPattern: /startupwiseguys\.com\/(?:all-programs|growing|building)\/[^/]+/i,
      containerSelector: "article, .card, .program, li",
      titleSelector: "h2, h3, h4, .title",
      summarySelector: "p",
      maxItems: 40,
    },
  }),
  htmlSource({
    id: "plug-and-play",
    name: "Plug and Play Startup Programs",
    url: "https://www.plugandplaytechcenter.com/programs/",
    fragile: true,
    category: "Etkinlik ve Programlar",
    opportunityType: "accelerator",
    country: "Global",
    notes: "İçerik istemci tarafında üretildiği için empty dönebilir.",
    scraper: {
      itemSelector: 'a[href*="/programs/"], a[href*="/industries/"]',
      linkPattern: /plugandplaytechcenter\.com\/(?:programs|industries)\/[^/]+/i,
      containerSelector: "article, .card, li",
      titleSelector: "h2, h3, h4",
      summarySelector: "p",
      maxItems: 40,
    },
  }),
  htmlSource({
    id: "y-combinator-blog",
    name: "Y Combinator Blog",
    url: "https://www.ycombinator.com/blog/",
    fragile: false,
    category: "Haber ve Sosyal Medya Akışı",
    opportunityType: "news",
    country: "Global",
    notes: "Public YC blog listesi.",
    scraper: {
      itemSelector: 'a[href^="/blog/"]',
      linkPattern: /ycombinator\.com\/blog\/[^/]+$/i,
      containerSelector: "article, .card, li, section",
      titleSelector: "h2, h3, h4",
      summarySelector: "p",
      dateSelector: "time, .date",
      maxItems: 50,
    },
  }),
];

export const publicSourceCatalog = sourceConfigs.map((source) => ({
  id: source.id,
  name: source.name,
  kind: source.kind,
  sourceGroup: source.sourceGroup ?? null,
  accessMode: source.accessMode ?? (source.fragile ? "fragile" : source.kind),
  url: source.url,
  enabled: source.enabled,
  fragile: source.fragile,
  requiresApiKey: source.requiresApiKey,
  category: source.category,
  opportunityType: source.opportunityType,
  country: source.country,
  notes: source.notes,
  configured:
    !source.requiredEnv || Boolean(process.env[source.requiredEnv]),
}));
