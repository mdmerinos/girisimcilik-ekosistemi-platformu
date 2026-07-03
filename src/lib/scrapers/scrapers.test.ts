import assert from "node:assert/strict";
import test from "node:test";

import { BotProtectionError } from "@/lib/ingestion/fetchWithRetry";
import { extractPageMetadata } from "@/lib/scrapers/extractPageMetadata";
import { scrapeGenericHtml } from "@/lib/scrapers/genericHtmlScraper";
import { scrapeKosgebSupports } from "@/lib/scrapers/kosgebScraper";
import { scrapeOdtuTeknokent } from "@/lib/scrapers/odtuTeknokentScraper";
import { scrapeRss } from "@/lib/scrapers/rssScraper";
import { scrapeTubitakBigg } from "@/lib/scrapers/tubitakScraper";
import {
  getOpportunityLinkLabel,
  resolveOpportunityUrl,
} from "@/lib/utils/opportunityUrl";

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
        <article>
          <h3>Yeni Fikirler Yeni İşler Başvuruları</h3>
          <a href="/tr/haber/yfyi-basvurulari">Devamını Oku</a>
          <p>Teknoloji girişimleri için hızlandırma programı.</p>
        </article>
      </main>
    `);
  };

  try {
    const items = await scrapeOdtuTeknokent();

    assert.equal(
      requestedUrl,
      "https://www.odtuteknokent.com.tr/tr/haber-kategori/odtu-teknokent/",
    );
    assert.equal(items.length, 1);
    assert.equal(items[0].title, "Yeni Fikirler Yeni İşler Başvuruları");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
