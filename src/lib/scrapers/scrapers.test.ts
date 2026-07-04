import assert from "node:assert/strict";
import test from "node:test";

import { BotProtectionError } from "@/lib/ingestion/fetchWithRetry";
import { resolveNasaSbirPublishedAt } from "@/lib/opportunities/nasaSbirDates";
import {
  parseDianaListingPage,
  scrapeDiana,
} from "@/lib/scrapers/dianaScraper";
import { fetchEuFunding } from "@/lib/scrapers/euFundingApi";
import { extractPageMetadata } from "@/lib/scrapers/extractPageMetadata";
import { scrapeGenericHtml } from "@/lib/scrapers/genericHtmlScraper";
import { resolveGrantsGovDeadline } from "@/lib/scrapers/grantsGovApi";
import { scrapeKosgebSupports } from "@/lib/scrapers/kosgebScraper";
import {
  extractOdtuDeadlineAt,
  extractOdtuPublishedAt,
  parseOdtuListingPage,
  scrapeOdtuTeknokent,
} from "@/lib/scrapers/odtuTeknokentScraper";
import { scrapeRss } from "@/lib/scrapers/rssScraper";
import { scrapeTubitakBigg } from "@/lib/scrapers/tubitakScraper";
import {
  getOpportunityLinkLabel,
  resolveOpportunityUrl,
} from "@/lib/utils/opportunityUrl";
import { parseDate } from "@/lib/utils/parseDate";

test("generic HTML scraper maps matching cards", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(`
      <main>
        <article>
          <time>02.07.2026</time>
          <a href="/duyuru/acik-cagri">Açık Çağrı</a>
          <p>Teknoloji girişimleri için destek.</p>
        </article>
      </main>
    `);

  try {
    const items = await scrapeGenericHtml({
      url: "https://example.com/duyurular",
      sourceName: "Test Kaynağı",
      category: "Ulusal Destek ve Fonlar",
      itemSelector: 'a[href*="/duyuru/"]',
      containerSelector: "article",
      dateSelector: "time",
    });

    assert.equal(items.length, 1);
    assert.equal(items[0].title, "Açık Çağrı");
    assert.equal(items[0].summary, "Teknoloji girişimleri için destek.");
    assert.equal(items[0].source_url, "https://example.com/duyuru/acik-cagri");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("opportunity URLs resolve relative detail paths and reject unsafe hrefs", () => {
  assert.equal(
    resolveOpportunityUrl(
      "/site/tr/genel/detay/12345/dijital-donusum",
      "https://www.kosgeb.gov.tr/",
    ),
    "https://www.kosgeb.gov.tr/site/tr/genel/detay/12345/dijital-donusum",
  );

  for (const href of ["", "#", "javascript:void(0)", "mailto:test@example.com"]) {
    assert.equal(
      resolveOpportunityUrl(href, "https://www.kosgeb.gov.tr/"),
      null,
    );
  }
});

test("homepage links use source CTA while detail links use detail CTA", () => {
  assert.equal(
    getOpportunityLinkLabel("https://www.kosgeb.gov.tr/"),
    "Kaynak sayfayı aç",
  );
  assert.equal(
    getOpportunityLinkLabel(
      "https://www.kosgeb.gov.tr/site/tr/genel/destekdetay/9144/program",
    ),
    "Detayları görüntüle",
  );
  assert.equal(getOpportunityLinkLabel("javascript:void(0)"), null);
});

test("KOSGEB support cards retain their real detail URL", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(`
      <main>
        <article>
          <a href="/site/tr/genel/destekdetay/9144/kobi-dijital-donusum-destek-programi">
            KOBİ Dijital Dönüşüm Destek Programı
          </a>
          <p>KOBİ'lerin dijital dönüşüm süreçlerine yönelik destek programı.</p>
        </article>
      </main>
    `);

  try {
    const items = await scrapeKosgebSupports();

    assert.equal(items.length, 1);
    assert.equal(
      items[0].source_url,
      "https://www.kosgeb.gov.tr/site/tr/genel/destekdetay/9144/kobi-dijital-donusum-destek-programi",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("RSS scraper maps feed items", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(`<?xml version="1.0" encoding="UTF-8" ?>
      <rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
        <channel>
          <title>Test</title>
          <item>
            <title>Yeni yatırım turu</title>
            <link>https://news.example.com/yatirim?utm_source=rss</link>
            <description><![CDATA[<p>Girişim yatırım aldı.</p>]]></description>
            <media:content url="https://news.example.com/image.jpg" />
            <pubDate>Thu, 02 Jul 2026 08:00:00 GMT</pubDate>
          </item>
        </channel>
      </rss>`);

  try {
    const items = await scrapeRss({
      feedUrl: "https://news.example.com/feed",
      sourceName: "Test Haber",
    });

    assert.equal(items.length, 1);
    assert.equal(items[0].title, "Yeni yatırım turu");
    assert.equal(items[0].summary, "Girişim yatırım aldı.");
    assert.equal(items[0].source_url, "https://news.example.com/yatirim");
    assert.equal(items[0].image_url, "https://news.example.com/image.jpg");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Hacker News RSS replaces URL boilerplate with article metadata", async () => {
  const originalFetch = globalThis.fetch;
  let requestCount = 0;
  globalThis.fetch = async () => {
    requestCount += 1;
    if (requestCount === 1) {
      return new Response(`<?xml version="1.0" encoding="UTF-8" ?>
        <rss version="2.0">
          <channel>
            <title>Hacker News</title>
            <item>
              <title>Yeni yapay zekâ girişimi yatırım aldı</title>
              <link>https://startup.example.com/funding</link>
              <description><![CDATA[
                Article URL: https://startup.example.com/funding
                Comments URL: https://news.ycombinator.com/item?id=1
              ]]></description>
            </item>
          </channel>
        </rss>`);
    }

    return new Response(`
      <html>
        <head>
          <meta name="description"
            content="Makalenin gerçek metadata açıklaması.">
          <meta property="og:description"
            content="İkincil OG açıklaması.">
          <meta property="og:image" content="/funding.jpg">
          <link rel="canonical" href="/">
        </head>
      </html>
    `);
  };

  try {
    const items = await scrapeRss({
      feedUrl: "https://hnrss.org/newest?q=funding",
      sourceName: "Hacker News",
    });

    assert.equal(
      items[0].summary,
      "Makalenin gerçek metadata açıklaması.",
    );
    assert.equal(
      items[0].image_url,
      "https://startup.example.com/funding.jpg",
    );
    assert.equal(
      items[0].source_url,
      "https://startup.example.com/funding",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("metadata extractor reads social, canonical and JSON-LD fields", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(`
      <html>
        <head>
          <title>Sayfa Başlığı</title>
          <meta name="description" content="Meta açıklaması">
          <meta property="og:title" content="OG Başlığı">
          <meta property="og:description" content="OG açıklaması">
          <meta property="og:image" content="/images/share.jpg">
          <link rel="canonical" href="/canonical">
          <script type="application/ld+json">
            {"@type":"Article","description":"JSON-LD açıklaması"}
          </script>
        </head>
      </html>
    `);

  try {
    const metadata = await extractPageMetadata("https://example.com/article");

    assert.equal(metadata?.openGraphDescription, "OG açıklaması");
    assert.equal(metadata?.jsonLdDescription, "JSON-LD açıklaması");
    assert.equal(metadata?.imageUrl, "https://example.com/images/share.jpg");
    assert.equal(metadata?.canonicalUrl, "https://example.com/canonical");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("metadata extractor returns null for 403 and timeout responses", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async () => new Response("", { status: 403 });
    assert.equal(
      await extractPageMetadata("https://example.com/protected"),
      null,
    );

    globalThis.fetch = async (_input, init) =>
      new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    assert.equal(
      await extractPageMetadata("https://example.com/slow", 1),
      null,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("generic HTML scraper detects a Turkish bot protection page", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response("<html><title>Bir dakika lütfen…</title></html>");

  try {
    await assert.rejects(
      () =>
        scrapeGenericHtml({
          url: "https://protected.example.com",
          sourceName: "Korumalı Kaynak",
          category: "Ulusal Destek ve Fonlar",
          itemSelector: "main a[href]",
        }),
      BotProtectionError,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("TÜBİTAK BİGG uses the official program page as fallback", async () => {
  const originalFetch = globalThis.fetch;
  let requestCount = 0;
  globalThis.fetch = async () => {
    requestCount += 1;
    if (requestCount === 1) {
      return new Response("<html><title>Bir dakika lütfen…</title></html>");
    }

    return new Response(`
      <main>
        <article>
          <a href="/sites/default/files/2026-03/1812-2026-1.pdf">
            1812-BİGG Yatırım 2026 Yılı 1. Çağrısı
          </a>
          <p>Teknoloji tabanlı girişimler için yatırım çağrısı.</p>
        </article>
      </main>
    `);
  };

  try {
    const items = await scrapeTubitakBigg();

    assert.equal(items.length, 1);
    assert.equal(items[0].title, "1812-BİGG Yatırım 2026 Yılı 1. Çağrısı");
    assert.match(items[0].source_url, /1812-2026-1\.pdf$/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("ODTÜ Teknokent scraper uses the current news category path", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  globalThis.fetch = async (input) => {
    requestedUrl = input.toString();
    return new Response(`
      <main>
        <article class="news-container">
          <h4>Yeni Fikirler Yeni İşler Başvuruları</h4>
          <a class="read-more" href="/tr/haber/yfyi-basvurulari">Devamını Oku</a>
          <p class="news-excerpt">Teknoloji girişimleri için hızlandırma programı.</p>
        </article>
      </main>
    `);
  };

  try {
    const items = await scrapeOdtuTeknokent();

    assert.equal(
      requestedUrl,
      "https://www.odtuteknokent.com.tr/tr/",
    );
    assert.equal(items.length, 1);
    assert.equal(items[0].title, "Yeni Fikirler Yeni İşler Başvuruları");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("NATO DIANA parser accepts only real connect detail links", () => {
  const items = parseDianaListingPage(`
    <main>
      <article>
        <a href="/connect/challenge-call-2026.html">
          NATO DIANA Challenge Call Opens Jun 25, 2026
        </a>
      </article>
      <a href="/about.html">About NATO DIANA</a>
      <a href="/connect/page/2.html">Next</a>
      <a href="https://www.linkedin.com/company/nato-diana">LinkedIn</a>
    </main>
  `);

  assert.deepEqual(items, [
    {
      title: "NATO DIANA Challenge Call Opens",
      url: "https://www.diana.nato.int/connect/challenge-call-2026.html",
      dateText: "Jun 25, 2026",
    },
  ]);
});

test("NATO DIANA scraper returns real OpportunityInput fields without Selenium", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = input.toString();
    if (url === "https://www.diana.nato.int/connect.html") {
      return new Response(`
        <main>
          <article>
            <a href="/connect/challenge-call-2026.html">
              NATO DIANA Challenge Call Opens Jun 25, 2026
            </a>
          </article>
        </main>
      `);
    }
    if (url.includes("/connect/page/2.html")) {
      return new Response("<main></main>");
    }
    return new Response(`
      <html>
        <head>
          <meta name="description" content="Innovators can apply to the official NATO DIANA accelerator challenge.">
          <meta property="og:image" content="/images/challenge.jpg">
        </head>
        <main>
          <time datetime="2026-06-25">25 June 2026</time>
        </main>
      </html>
    `);
  };

  try {
    const items = await scrapeDiana();
    assert.equal(items.length, 1);
    assert.equal(items[0].source_name, "NATO DIANA");
    assert.equal(
      items[0].source_url,
      "https://www.diana.nato.int/connect/challenge-call-2026.html",
    );
    assert.equal(
      items[0].summary,
      "Innovators can apply to the official NATO DIANA accelerator challenge.",
    );
    assert.equal(items[0].category, "Uluslararası Fonlar");
    assert.equal(items[0].published_at, parseDate("2026-06-25"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("ODTÜ parser removes carousel duplicates and preserves application cards", () => {
  const items = parseOdtuListingPage(`
    <main>
      <article class="news-container">
        <h4>Kilis GO Başvuruları Açıldı</h4>
        <p class="news-excerpt">Teknoloji tabanlı girişimler için başvurular başladı.</p>
        <a class="read-more" href="/tr/duyuru/kilis-go">Başvuru</a>
      </article>
      <article class="news-container cloned">
        <h4>Kilis GO Başvuruları Açıldı</h4>
        <a class="read-more" href="/tr/duyuru/kilis-go">Başvuru</a>
      </article>
    </main>
  `);

  assert.equal(items.length, 1);
  assert.equal(items[0].category, "Etkinlik ve Programlar");
  assert.equal(
    items[0].source_url,
    "https://www.odtuteknokent.com.tr/tr/duyuru/kilis-go",
  );
});

test("ODTÜ date extraction follows explicit safe priority", () => {
  assert.equal(
    extractOdtuPublishedAt(`
      <article>
        <time datetime="2026-07-03">Eski görünen metin</time>
        <span class="date">01.01.2020</span>
        <script type="application/ld+json">{"datePublished":"2019-01-01"}</script>
      </article>
    `),
    parseDate("2026-07-03"),
  );
});

test("ODTÜ deadline extraction only uses a labelled application deadline", () => {
  assert.equal(
    extractOdtuDeadlineAt(`
      <article>
        Başvurular 29 Aralık 2025 tarihinde başladı.
        <strong>Son Başvuru Tarihi: 25 Ocak 2026</strong>
      </article>
    `),
    parseDate("25 Ocak 2026"),
  );
  assert.equal(
    extractOdtuDeadlineAt(
      "<article>Seçim duyurusu Ağustos 2029 tarihinde yapılacaktır.</article>",
    ),
    null,
  );
});

test("NASA SBIR appendices use the official close date, not a later announcement", () => {
  assert.equal(
    resolveNasaSbirPublishedAt(
      "2026-2027 BAA Appendix 26A-I SBIR",
      "NASA",
      "02/20/2029",
    ),
    parseDate("2026-04-21"),
  );
  assert.equal(
    resolveGrantsGovDeadline(
      "2026-2027 BAA Appendix 26A-I SBIR",
      "NASA",
      "09/30/2029",
    ),
    parseDate("2026-05-21"),
  );
  assert.equal(
    resolveGrantsGovDeadline(
      "2026-2027 NASA SBIR/STTR Broad Agency Announcement",
      "NASA",
      "09/30/2029",
    ),
    null,
  );
});

test("EU Funding structured 2027 deadlines remain unchanged", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        results: [
          {
            url: "https://ec.europa.eu/funding/topic-2027",
            metadata: {
              title: ["Horizon Europe startup innovation call"],
              objective: ["Support for innovative European startups."],
              startDate: ["2026-07-01T00:00:00.000Z"],
              deadlineDate: ["2027-09-15T00:00:00.000Z"],
            },
          },
        ],
      }),
      { headers: { "content-type": "application/json" } },
    );

  try {
    const items = await fetchEuFunding();
    assert.equal(items.length, 1);
    assert.equal(items[0].deadline_at, "2027-09-15T00:00:00.000Z");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("EU Funding keeps publication, opening and deadline fields distinct from fetch time", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        results: [
          {
            url: "https://ec.europa.eu/funding/publication-priority",
            metadata: {
              title: ["Startup innovation publication call"],
              publicationDate: ["2026-05-01T00:00:00.000Z"],
              openingDate: ["2026-06-01T00:00:00.000Z"],
              deadlineDate: ["2026-10-01T00:00:00.000Z"],
            },
          },
          {
            url: "https://ec.europa.eu/funding/opening-fallback",
            metadata: {
              title: ["SME innovation opening call"],
              openingDate: ["2026-08-01T00:00:00.000Z"],
              deadlineDate: ["2027-01-15T00:00:00.000Z"],
            },
          },
        ],
      }),
      { headers: { "content-type": "application/json" } },
    );

  try {
    const items = await fetchEuFunding();
    const publication = items.find((item) =>
      item.source_url.includes("publication-priority"),
    );
    const opening = items.find((item) =>
      item.source_url.includes("opening-fallback"),
    );

    assert.equal(publication?.published_at, "2026-05-01T00:00:00.000Z");
    assert.equal(publication?.deadline_at, "2026-10-01T00:00:00.000Z");
    assert.equal(opening?.published_at, "2026-08-01T00:00:00.000Z");
    assert.notEqual(publication?.published_at, publication?.fetched_at);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
