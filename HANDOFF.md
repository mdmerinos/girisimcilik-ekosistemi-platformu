# Proje Devir Notu

## 1. Projenin mevcut durumu

Proje kökü:

```text
Proje kökü: `girisimcilik-ekosistemi-platformu/`
```

Türkiye ve global girişimcilik ekosistemindeki destek, fon, yatırım, program,
etkinlik ve haberleri toplayan çalışan bir Next.js uygulamasıdır.

Ana veri kaynağı Supabase/PostgreSQL'dir. Dış kaynaklar yalnızca sunucu
tarafındaki ingestion katmanından çağrılır. Frontend bütün verileri
`/api/opportunities` üzerinden okur. Supabase yapılandırılmamışsa veya sorgu
başarısız olursa sınırlı fallback veri kullanılır.

Son gerçek ingestion sonucu:

```text
status: partial
collected: 770
inserted: 517
updated: 247
skipped: 6
errors: 12
toplam opportunities: 804
toplam kaynak: 42
```

Duplicate davranışı doğrudur ve korunmalıdır: `unique_key`, kaynak adı ile
normalize edilmiş orijinal URL'den üretilir. Mevcut kayıtlar tekrar insert
edilmez; upsert ile `fetched_at` ve `updated_at` alanları güncellenir.

Son doğrulanan kategori dağılımı:

```text
Ulusal Destek ve Fonlar: 68
Uluslararası Fonlar: 439
Yatırım ve Sermaye Ağları: 52
Etkinlik ve Programlar: 136
Haber ve Sosyal Medya Akışı: 109
```

## 2. Çalışan teknolojiler

- Next.js 16.2.10
- App Router
- TypeScript
- React
- Tailwind CSS
- Supabase/PostgreSQL
- `@supabase/supabase-js`
- `rss-parser`
- `cheerio`
- `zod`
- `dayjs`
- `tsx` ve Node test runner
- Vercel Cron

Kaynaklar beşli kontrollü paralellikle işlenir. Kaynak bazında timeout, retry,
hata izolasyonu ve ingestion loglama vardır.

## 3. Supabase tabloları ve migration durumu

Çalıştırılmış olması gereken migration dosyaları:

```text
supabase/migrations/001_create_opportunities.sql
supabase/migrations/002_ingestion_observability.sql
```

Mevcut tablolar:

### `opportunities`

Başlıca alanlar:

- `id`
- `unique_key` — unique constraint
- `title`
- `summary`
- `category`
- `source_name`
- `source_url`
- `application_url`
- `published_at`
- `deadline_at`
- `fetched_at`
- `location`
- `is_featured`
- `created_at`
- `updated_at`

Public select için RLS politikası vardır. Yazma işlemleri service-role istemcisi
üzerinden yapılır.

### `ingestion_runs`

Her manuel veya cron çalışmasının genel durumunu ve toplam sayaçlarını tutar:

- `trigger`
- `status`
- başlangıç/bitiş zamanları
- collected/inserted/updated/skipped/error sayaçları

### `ingestion_logs`

Her kaynak için ayrı sonuç tutar:

- kaynak kimliği, adı ve türü
- success/error/skipped durumu
- süre
- collected/inserted/updated/skipped sayaçları
- hata mesajı

Ingestion tablolarına public RLS politikası verilmemiştir.

Üçüncü aşamada yeni SQL migration eklenmedi.

## 4. Mevcut çalışan kaynaklar

### Önceden çalışan kaynaklar

- Webrazzi RSS
- TechCrunch ana RSS
- TechCrunch Startups RSS
- TechCrunch Funding RSS
- VentureBeat RSS
- TÜBİTAK duyuruları
- KOSGEB duyuruları
- KOSGEB destekleri
- Türkiye Ulusal Ajansı
- İTÜ Çekirdek
- Yıldız Teknopark
- Grants.gov
- EU Funding & Tenders

### Son aşamada eklenen ve canlı testte çalışan kaynaklar

- Hacker News Startup RSS
- Hacker News Funding RSS
- Hacker News Accelerator RSS
- Hacker News Grant RSS
- egirişim RSS
- StartupCentrum
- Endeavor Türkiye
- Türkiye Girişimcilik Vakfı
- Workup İş Bankası
- Bilişim Vadisi
- NASA SBIR/STTR
- SBIR.gov Funding Opportunities
- Techstars News
- Techstars Programs
- Startup Wise Guys
- Y Combinator Blog

Grants.gov şu anahtar kelimelerle taranır:

- startup
- entrepreneurship
- innovation
- small business
- technology
- research
- artificial intelligence
- climate
- women entrepreneurs
- education technology

EU Funding & Tenders şu anahtar kelimelerle taranır:

- startup
- innovation
- SME
- entrepreneurship
- digital
- AI
- green
- climate
- women
- education

RSS adapter'ının feed başına üst sınırı 50 kayıttır. Kaynak daha az kayıt
döndürürse mevcut kayıtların tamamı alınır.

## 5. Fragile / hata veren kaynaklar

Kaynak kataloğunda `enabled`, `fragile`, `requiresApiKey`, `category`,
`opportunityType`, `country` ve `notes` alanları bulunur.

Son canlı ingestion sırasında hata veren kaynaklar:

- Hacker News Venture Capital — `502`
- TÜBİTAK BİGG — bağlantı/fetch hatası
- Yatırıma Destek — eşleşen içerik bulunamadı/bot koruması
- NATO DIANA — `403`
- ODTÜ Teknokent — eşleşen içerik bulunamadı/bot koruması
- KWORKS — `403`
- Arya Women Investment Platform — bot koruması
- Teknopark İstanbul — `403`
- İstanbul Kalkınma Ajansı — koruma/empty içerik
- Ankara Kalkınma Ajansı — koruma/empty içerik
- İzmir Kalkınma Ajansı — bağlantı hatası
- Plug and Play — içerik istemci tarafında üretildiği için empty

SAM.gov Opportunities etkin katalogdadır ancak `SAM_GOV_API_KEY` olmadığı
durumda hata değil `skipped` olarak loglanır.

Login, captcha, ücretli erişim veya sosyal medya oturumu atlatılmamalıdır.
Fragile kaynak hataları diğer kaynakların çalışmasını durdurmaz.

## 6. Yapılmış son frontend iyileştirmeleri

- `/api/opportunities` varsayılan limiti 100 yapıldı.
- API şu meta alanlarını döndürüyor:
  - filtrelenmiş kayıt sayısı
  - toplam veritabanı kayıt sayısı
  - kategori sayaçları
  - son güncelleme tarihi
  - `hasMore`
- Ana sayfaya **Daha fazla göster** butonu eklendi.
- Filtre ve arama sunucu taraflı API sorgularına bağlandı.
- Her kategori için kayıt sayısı gösteriliyor.
- Seçili kategori toplamı gösteriliyor.
- “Veritabanında toplam X güncel kayıt var.” metni gösteriliyor.
- Son güncelleme tarihi gösteriliyor.
- Az veya sıfır sonuçta **Tüm kategorileri göster** seçeneği sunuluyor.
- Admin panelinde:
  - toplam opportunities sayısı
  - toplam/etkin kaynak sayısı
  - fragile kaynak sayısı
  - son ingestion özeti
  - kaynak bazında collected/inserted/updated/skipped sayaçları
  - fragile etiketleri
  - API key bekleyen kaynaklar
  gösteriliyor.

## 7. Çalışan komutlar ve test sonuçları

Son doğrulama sonuçları:

```text
npm run typecheck  -> başarılı
npm run lint       -> başarılı, warning yok
npm test           -> 7/7 başarılı
npm run build      -> başarılı
```

Build çıktısında çalışan route'lar:

```text
/
/admin/ingestion
/api/opportunities
/api/ingest
/api/cron/ingest
```

Geliştirme sunucusu:

```powershell
npm run dev
```

Manuel ingestion:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:3000/api/ingest" `
  -Headers @{ Authorization = "Bearer YOUR_INGESTION_SECRET" }
```

## 8. `.env.local` içinde gereken değişken adları

Değerleri bu dosyaya yazılmamalıdır.

Zorunlu:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
CRON_SECRET
INGESTION_SECRET
```

Opsiyonel:

```text
SAM_GOV_API_KEY
EVENTBRITE_API_KEY
PRODUCT_HUNT_TOKEN
GRANTS_GOV_API_KEY
```

Notlar:

- Mevcut Grants.gov `search2` adapter'ı gizli API key istemez.
- EU Funding & Tenders adapter'ındaki `SEDIA` public servis tanımlayıcısıdır.
- `SAM_GOV_API_KEY` yoksa SAM.gov kaynağı `skipped` olur.
- Eventbrite ve Product Hunt şu anda aktif kaynak kataloğunda kullanılmıyor.

## 9. Bir sonraki yapılacak işler

Önerilen öncelik sırası:

1. Veritabanındaki düşük kaliteli başlıkları incele:
   - “Daha Fazla Bilgi”
   - navigasyon başlıkları
   - kategori veya ana sayfa bağlantıları
2. Kaynak bazında kalite filtresi ekle:
   - minimum başlık kalitesi
   - genel CTA metinlerini reddetme
   - geçmiş/kapalı çağrıları isteğe göre gizleme
3. Kategori dengesini gerçek içerik sınıflandırmasıyla iyileştir:
   - başlık/özet anahtar kelimelerine göre kategori önerisi
   - kozmetik denge için yanlış kategori atamama
4. Fragile kaynaklar için yalnız izin verilen alternatifleri araştır:
   - resmî RSS
   - resmî API
   - server-rendered arşiv sayfası
5. SAM.gov API key sağlanırsa gerçek adapter smoke testi yap.
6. StartupCentrum etkinliklerinin public ve izinli bir endpoint'i olup olmadığını
   araştır.
7. Admin paneline kaynak açma/kapatma kontrolü eklemek istenirse ayarları
   veritabanına taşı; kod içi katalog şu anda read-only'dir.
8. Eski/kapanmış kayıtlar için arşivleme politikası tasarla:
   - `is_active`
   - `last_seen_at`
   - belirli süre görülmeyen kaydı pasifleştirme
9. Production Vercel cron süresini ve function timeout limitini gözlemle.
10. Supabase sorguları için gerekirse kategori sayaçlarını tek RPC sorgusunda
    toplamak üzere optimizasyon yap.

## 10. Yeni Codex oturumunda devam promptu

```text
girisimcilik-ekosistemi-platformu projesinde çalışmaya devam et.

Önce proje kökündeki HANDOFF.md dosyasını tamamen oku ve mevcut yapıyı incele.
Mevcut unique_key/upsert davranışını, Supabase ana veri kaynağını ve
/api/opportunities veri akışını bozma.

İlk görev:
1. Supabase opportunities tablosundaki mevcut kayıtların veri kalitesini
   read-only sorgularla analiz et.
2. “Daha Fazla Bilgi”, “Devamını Oku”, navigasyon metinleri, ana sayfa ve
   kategori bağlantıları gibi düşük kaliteli kayıtları kaynak bazında raporla.
3. Sorunun hangi scraper seçicilerinden kaynaklandığını belirle.
4. Ardından scraper katmanına genel CTA başlık filtresi ve kaynak bazlı kalite
   filtreleri ekle.
5. Mevcut veritabanından kayıt silmeden önce bulguları raporla; silme veya toplu
   veri değişikliği için benden onay iste.
6. Fragile kaynakların hata vermesi diğer ingestion kaynaklarını etkilemesin.
7. npm run typecheck, npm run lint, npm test ve npm run build çalıştır.
8. Son olarak canlı ingestion çalıştır ve önceki HANDOFF.md sayılarına göre
   collected/inserted/updated/skipped/errors, toplam kayıt ve kategori
   dağılımını karşılaştır.
```
