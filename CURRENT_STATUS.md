# Mevcut Proje Durumu

## Genel durum

Girişimcilik Ekosistemi Platformu geliştirme ortamında çalışır durumdadır.
Next.js arayüzü, Supabase veri katmanı, ingestion sistemi, admin paneli,
zamanlanmış çalışma altyapısı ve site açılışında telafi amaçlı otomatik kontrol
birlikte kullanılmaktadır.

## Tamamlanan işler

- `fragile`, `empty`, `skipped` ve gerçek sistem `error` durum yönetimi
- Kaynakların birbirinden izole çalışması
- RSS, HTML ve API kaynaklarında kontrollü timeout/retry
- `image_url` desteği
- Kaynak açıklamalarını temizleme
- Sahte veya tahmini açıklama üretmeme kuralı
- KOSGEB kartlarında gerçek detay linkini koruma
- Homepage fallback ile gerçek detay linkini ayırma
- Girişimcilik relevance filtresi
- Manuel ve cron ingestion
- Admin ingestion durum ve sayaç görünümü
- Yatırım ve Sermaye Ağları kategorisi için sıkı yatırım filtresi
- Günlük Vercel Cron sistemi
- `/api/refresh-if-stale` yedek otomatik yenileme sistemi
- Ana sayfa açılışında arka plan stale kontrolü
- Admin panelde otomatik güncelleme bilgi alanı

## Yatırım filtresi sıkılaştırması

`src/lib/ingestion/investmentClassification.ts` artık `funding`, `fund`, `VC`,
`venture capital` veya `capital` kelimelerini tek başına yatırım kategorisi için
yeterli görmez.

Yatırım kategorisine geçiş için başlık, özet veya kaynak metninde startup,
şirket, founder, yatırım turu, seed/Series, investor, valuation, backed by,
fintech/SaaS/biotech/deeptech veya Türkçe girişim/yatırım bağlamlarından biri
aranır.

Aşağıdaki gürültülü içerikler startup/VC ekosistemi bağlamı yoksa yatırım
kategorisine alınmaz ve çoğu durumda relevance filtresinden de geçmez:

- government/public/research funding haberleri
- HIV, science, ocean, climate funding cuts haberleri
- political/far-right/ad-war funding haberleri
- funding rate arbitrage ve crypto arbitrage içerikleri
- memecoin venture capital içerikleri
- spor takımı ownership by VC firm haberleri
- borsa, hisse senedi, banka kampanyası, kredi kartı kampanyası, yatırım tavsiyesi

`/api/opportunities?category=Yatırım%20ve%20Sermaye%20Ağları` endpoint'i, DB'de
eskiden yanlış kategoriyle kalmış kayıtları da strict yatırım filtresinden
geçirmeden response'a dahil etmez.

Yeni ingestion sırasında kategori yatırım görünse bile içerik strict filtreden
geçmiyorsa kayıt `Haber ve Sosyal Medya Akışı` kategorisine düşürülür veya
relevance dışıysa atlanır.

## Günlük otomatik veri çekme

`vercel.json` içinde günlük cron aktiftir:

```json
{
  "crons": [
    {
      "path": "/api/cron/ingest",
      "schedule": "0 6 * * *"
    }
  ]
}
```

Vercel Cron UTC çalışır. `0 6 * * *` Türkiye saatiyle yaklaşık 09:00'da
`/api/cron/ingest` endpoint'ini çağırır. Endpoint `CRON_SECRET` değerini yalnız
server tarafında kontrol eder; secret client tarafına gönderilmez.

`runIngestion` başlamadan önce aktif `running` ingestion var mı diye kontrol
eder. Böylece cron, manuel admin tetiklemesi ve stale refresh aynı anda ikinci
ingestion başlatmaz.

## `/api/refresh-if-stale` sistemi

Yeni endpoint:

```text
/api/refresh-if-stale
```

Davranış:

- Son başarılı ingestion 12 saatten yeniyse `fresh`
- Veri 12 saatten eskiyse ve cooldown yoksa `started`
- Aktif `running` ingestion varsa `already_running`
- Son deneme 30 dakikadan yeniyse `cooldown`
- Hata olursa siteyi bozmadan `error`

Response yalnız şu alanları döndürür:

```json
{
  "ok": true,
  "status": "fresh | started | already_running | cooldown | error",
  "lastSuccessfulIngestionAt": "...",
  "message": "..."
}
```

`INGESTION_SECRET` veya `CRON_SECRET` client tarafına sızdırılmaz.

## Ana sayfa otomatik kontrol davranışı

`src/components/OpportunityGrid.tsx` ana sayfa açıldığında mevcut fırsatları
normal şekilde yüklemeye devam eder. Buna paralel olarak `/api/refresh-if-stale`
arka planda çağrılır.

Kullanıcı bekletilmez. Küçük bir bilgi rozeti şu mesajlardan birini gösterir:

- `Veriler güncel.`
- `Veriler arka planda güncelleniyor.`
- `Veriler şu anda güncelleniyor.`
- `Veriler kısa süre önce kontrol edildi.`
- `Veriler gösteriliyor, güncelleme daha sonra tekrar denenecek.`

## Admin panel otomatik güncelleme bilgisi

Admin ingestion panelinde mevcut tasarım korunarak küçük bir otomatik güncelleme
alanı eklendi. Gösterilen bilgiler:

- Otomatik cron aktifliği
- Cron schedule: `0 6 * * *`
- Türkiye saatiyle yaklaşık 09:00 bilgisi
- Son başarılı ingestion zamanı
- Son deneme zamanı
- Running ingestion var mı
- Son run durumu
- Son run için kaynak durum sayıları

## Son temiz kontrol

- `npm.cmd run typecheck` başarılı
- `npm.cmd run lint` başarılı
- `npm.cmd test` başarılı — 33/33
- `npm.cmd run build` başarılı

PowerShell `npm.ps1` execution policy sorunu nedeniyle kontroller `npm.cmd` ile
çalıştırıldı. Paket yöneticisi değiştirilmedi, pnpm kullanılmadı, paket kurulmadı.

## Supabase migration listesi

1. `supabase/migrations/001_create_opportunities.sql`
2. `supabase/migrations/002_ingestion_observability.sql`
3. `supabase/migrations/003_expand_ingestion_statuses.sql`
4. `supabase/migrations/004_add_opportunity_media_fields.sql`

Bu aşamada yeni migration oluşturulmadı.

## Sonraki yapılacak işler

- Production deploy sonrası Vercel ortam değişkenlerini doğrulama
- Gerçek cron çalışmasını Vercel dashboard üzerinden izleme
- Yeni kaynak kalitesi ve mobil tasarım iyileştirmeleri

## KALAN İŞ

Bu geliştirme kapsamında kalan zorunlu iş yoktur. Production ortamında yalnızca
Vercel `CRON_SECRET`, Supabase server env değerleri ve cron logları doğrulanmalıdır.