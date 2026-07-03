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
  url: string;
  enabled: boolean;
  fragile: boolean;
  requiresApiKey: boolean;
  requiredEnv?: string;
  category: OpportunityCategory;
  opportunityType: OpportunityType;
  country: string;
  notes: string;
  collect: () => Promise<OpportunityInput[]>;
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
};

function rssSource(options: RssSourceOptions): SourceConfig {
  return {
    ...options,
    kind: "rss",
    enabled: true,
    fragile: options.fragile ?? false,
    requiresApiKey: false,
    collect: () =>
      scrapeRss({
        feedUrl: options.url,
        sourceName: options.sourceName ?? options.name,
        category: options.category,
        maxItems: 50,
        location: options.country,
      }),
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

export const sourceConfigs: SourceConfig[] = [
  rssSource({
    id: "webrazzi-rss",
    name: "Webrazzi",
    url: "https://webrazzi.com/feed/",
    category: "Haber ve Sosyal Medya Akışı",
    opportunityType: "news",
    country: "Türkiye",
    notes: "Resmî RSS akışı.",
  }),
  rssSource({
    id: "techcrunch-rss",
    name: "TechCrunch",
    url: "https://techcrunch.com/feed/",
    category: "Haber ve Sosyal Medya Akışı",
    opportunityType: "news",
    country: "Global",
    notes: "Ana teknoloji ve startup RSS akışı.",
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
    url: "https://www.diana.nato.int/challenges.html",
    enabled: true,
    fragile: true,
    requiresApiKey: false,
    category: "Uluslararası Fonlar",
    opportunityType: "accelerator",
    country: "Global",
    notes: "Sunucu otomatik isteklere 403 verebiliyor.",
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
  configuredSource({
    id: "odtu-teknokent",
    name: "ODTÜ Teknokent",
    kind: "html",
    url: "https://www.odtuteknokent.com.tr/tr/haber-kategori/odtu-teknokent/",
    enabled: true,
    fragile: true,
    requiresApiKey: false,
    category: "Etkinlik ve Programlar",
    opportunityType: "program",
    country: "Türkiye",
    notes:
      "Güncel ODTÜ Teknokent haber akışı; bot koruması döndürebiliyor.",
    collect: scrapeOdtuTeknokent,
  }),
  configuredSource({
    id: "yildiz-teknopark",
    name: "Yıldız Teknopark",
    kind: "html",
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

  htmlSource({
    id: "startupcentrum-news",
    name: "StartupCentrum",
    url: "https://media.startupcentrum.com/tr/",
    fragile: false,
    category: "Yatırım ve Sermaye Ağları",
    opportunityType: "investment",
    country: "Türkiye",
    notes: "StartupCentrum Media haberleri; etkinlik listesi sunucuda ayrı bir açık akış vermiyor.",
    scraper: {
      itemSelector: 'a[href^="https://media.startupcentrum.com/tr/"]',
      linkPattern: /media\.startupcentrum\.com\/tr\/[^/]+\/?$/i,
      excludeLinkPattern: /\/(?:category|tag|author|wp-admin)\//i,
      containerSelector: "article, .elementor-post, .post, li",
      titleSelector: "h2, h3, h4, .elementor-heading-title",
      summarySelector: "p, .elementor-post__excerpt",
      dateSelector: "time, .date, .elementor-post-date",
      maxItems: 50,
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
