# Girişim Atlası — Mevcut Proje Durumu

## Genel durum

Girişim Atlası; Next.js App Router, Supabase, Vercel Cron, stale refresh,
admin ingestion paneli ve kaynak bazlı ingestion sistemiyle çalışmaktadır.
Son geliştirmede ana akışın tarih semantiği, API tabanlı arama, istatistikler
ve kart durumları iyileştirildi. Commit veya push yapılmadı.

## Zaman filtresi ve sıralama

`/api/opportunities` aşağıdaki `timeRange` değerlerini destekler:

- `near` (varsayılan): Geçmemiş ve en fazla 12 ay içindeki deadline kayıtları;
  deadline yoksa son 90 günde yayımlanmış kayıtlar.
- `active`: Geçmemiş tüm deadline kayıtları; deadline yoksa gerçek bir
  `published_at` değeri bulunan kayıtlar.
- `all`: Eski, yeni, uzak ve tarihi belirsiz tüm kayıtlar.

Ana sayfanın varsayılanı “Yakın fırsatlar”dır. Dashboard’da “Yakın fırsatlar”,
“Tüm aktif fırsatlar” ve “Tüm tarihler” seçenekleri bulunur. Kategori, ülke,
arama ve sayfalama ile birlikte çalışırlar.

Yaklaşan deadline’lar önce ve yakın tarihten uzağa; deadline’sız yeni yayınlar
sonra; 12 aydan uzak çağrılar daha sonra sıralanır. EU/Horizon 2027 kayıtları
silinmedi; `near` akışını kaplamaz, `active` ve `all` içinde kalır.

## API tabanlı arama

`/api/opportunities?q=...` tüm veritabanı kayıtları üzerinde çalışır. Supabase
satırları 1000’lik güvenli sayfalarla okunur; yalnız ilk ekrandaki kartlar
aranmaz.

Aranan alanlar:

- `title`
- `summary`
- `source_name`
- `category`
- `location`
- `source_url`
- `application_url`

Arama küçük/büyük harf duyarsızdır. Türkçe karakterler ve noktalama normalize
edilir; `odtu`, `tubitak`, `yatirim`, `girisim`, `cagri` ve `basvuru` gibi
sade yazımlar Türkçe karşılıklarını bulabilir.

Frontend yaklaşık 300 ms debounce ile API’ye `q` gönderir. Yeni arama sayfayı
1’e döndürür, önceki istek iptal edilir ve yükleme durumu gösterilir. Sonuç
yoksa açıklayıcı mesaj ile “Tüm tarihlerde ara” düğmesi gösterilir.

## Tarih semantiği ve kartlar

- `deadline_at` varsa: `Son başvuru: DD.MM.YYYY`
- Deadline yok, `published_at` varsa: `Yayın: DD.MM.YYYY`
- İki güvenilir alan da yoksa: `Tarih belirtilmemiş`

`fetched_at` ve `created_at` kartın fırsat tarihi değildir. Tarih yokken
`Date.now()` veya bugünün tarihi atanmaz.

Kartlarda şu durumlar hesaplanır:

- Başvuruya açık
- Gelecek çağrı
- Kapandı
- Tarih belirsiz

Mevcut şemada opening/publication semantiğini ayrı saklayan bir kolon yoktur.
Bu nedenle yanlış bir “Açılış” etiketi üretmek yerine kartta güvenli
`published_at` etiketi kullanılır.

## EU Funding & Tenders

EU payload’ında aşağıdaki alanlar ayrı okunur:

- `publicationDate`
- `openingDate`
- `startDate`
- `deadlineDate`
- `status`
- `callIdentifier`
- `topicIdentifier`

Güvenli mevcut-şema eşlemesi:

- `deadlineDate` → `deadline_at`
- `publicationDate`, yoksa `openingDate`, yoksa `startDate` → `published_at`
- ingestion zamanı → yalnız `fetched_at`

`fetched_at` hiçbir zaman EU yayın/açılış/deadline tarihi yerine kullanılmaz.
EU 2027 deadline kayıtları korunur. Unique key yalnız başlığa bağlı değildir;
normalize edilmiş özgün kaynak URL’si kullanılır. Bu davranış eski kayıtlarla
key uyumunu korur ve aynı URL’nin farklı takip parametreleriyle çoğalmasını
engeller.

## İstatistikler ve “bugün” ifadeleri

`/api/stats` eski alanları korur ve şu alanları da döndürür:

- `totalCount`
- `nearCount`
- `activeCount`
- `farFutureCount`
- `expiredCount`
- `noDateCount`
- `todayIngestedCount`
- `todayPublishedCount`

Dashboard “Bugün sisteme eklenen” ile “Bugün yayımlanan” değerlerini ayrı
gösterir. `todayPublishedCount` yalnız `published_at` üzerinden hesaplanır;
bugünkü ingestion tarihi yayın tarihi sayılmaz.

## Kaynak ve kapsam korumaları

- Beş ana kategori ve `isEntrepreneurshipRelevant` kapsam filtresi korundu.
- ODTÜ Teknokent’in mevcut fetch + Cheerio scraper’ı ve tek sourceConfig kaydı
  korundu.
- NATO DIANA lightweight fragile kaynak kaydı korundu.
- `workers/nato-diana/`, `/api/worker/opportunities` ve
  `.github/workflows/nato-diana-worker.yml` korundu.
- Ana Next.js uygulamasına Selenium, Playwright, Puppeteer veya ChromeDriver
  eklenmedi.
- NASA SBIR/STTR tarih temizliği korunuyor; 2029 selection tarihi deadline
  olarak geri getirilmedi.
- Admin, cron, ingest, refresh-if-stale ve worker rotaları build içinde
  doğrulandı.

## Bağımlılık ve migration

- Yeni paket kurulmadı.
- Package manager değiştirilmedi.
- Yeni migration oluşturulmadı.
- Veritabanından kayıt silinmedi.
- `.env.local` okunmadı veya değiştirilmedi.
- Secret değeri yazılmadı.

`package.json` yalnız yeni test dosyasını test komutuna dahil etmek için
değiştirildi.

## Son kontroller

- `npm.cmd run typecheck` başarılı
- `npm.cmd run lint` başarılı
- `npm.cmd test` başarılı — 53/53
- `npm.cmd run build` başarılı
- Yerel smoke test: `/`, `/api/stats` ve geçerli timeRange/arama
  kombinasyonları HTTP 200; geçersiz `timeRange` HTTP 400

Sandbox dış ağa erişemediği için yerel smoke test fallback kaynağı üzerinden
çalıştı. Supabase production verisi değiştirilmedi.

## Kalan işler

- Production/Supabase üzerinde `near`, `active`, `all` ve Türkçe arama
  kombinasyonları deploy sonrasında smoke-test edilmelidir.
- EU `openingDate` ile `publicationDate` değerlerinin kartta ayrı etiketlerle
  kalıcı gösterimi istenirse önce şemaya tarih türü/opening alanı eklenmesi
  değerlendirilmelidir; bu çalışma migration üretmedi.
- GitHub Actions NATO worker secretları ayarlanmalı ve workflow ilk kez
  manuel çalıştırılmalıdır.
- Değişiklikler kullanıcı onayından sonra commit/push edilebilir.

## 4 Temmuz 2026 — canlı yenileme ve günlük görünürlük

- Ana sayfadaki Yenile düğmesi artık
  `/api/refresh-if-stale?force=true` endpointine POST gönderir.
- Force yenileme freshness kontrolünü aşar; çalışan-job kilidi, 30 dakikalık
  global cooldown ve aynı-origin kontrolü korunur.
- Yenileme tamamlanınca yeni/güncellenen kayıt ve kaynak durumları güvenli,
  secret içermeyen bir raporla gösterilir.
- Fırsat listesi ve `/api/stats`, aktif filtreler korunarak otomatik yenilenir.
- `today=ingested|published|deadline|all` filtreleri eklendi.
- `source=all|tubitak|kosgeb|eu-funding|grants-gov|odtu-teknokent|nato-diana|nasa-sbir|other`
  filtresi eklendi.
- Dashboard’a bugün ve kaynak filtreleri eklendi. Opening date ayrı şema alanı
  olmadığı için “Bugün açılan çağrılar” yanlış veri üretmemek adına gösterilmez.
- Son başarılı kaynak taraması ile son veri eklenme zamanı ayrıldı.
- Tarih-saat gösterimi İstanbul saatinde `DD.MM.YYYY HH:mm` biçimindedir.
- Admin ingestion ekranı kaynak slug, yöntem/worker, son çalışma, son başarı,
  bulunan/yeni/güncellenen, durum, hata ve mevcut HTTP bilgisini gösterir.
- Mevcut 40+ RSS/API/HTML kaynak kataloğu incelendi; doğrulanmamış yeni kaynak
  veya sahte veri eklenmedi.
- Kontroller: typecheck başarılı, lint başarılı, testler 58/58, build başarılı.

## 4 Temmuz 2026 — NATO ve ODTÜ production workerları

- `/api/worker/opportunities` artık zorunlu ve allowlist kontrollü
  `sourceSlug` kabul eder: `nato-diana`, `odtu-teknokent`.
- Worker payload'ı kanonik kaynak adı ve kaynağa ait gerçek URL hostu ile
  doğrulanır. Kaynak adı item tarafından değiştirilemez.
- Worker ve normal scraper aynı kanonik kaynak adı + URL unique key'ini
  kullandığı için iki kanaldan gelen aynı kayıt çoğalmaz.
- Worker POST sonucu mevcut ingestion run/log tablolarına source slug ile
  yazılır. Sıfır kayıt çalışması `empty` olarak izlenebilir.
- NATO worker gerçek public `connect` sayfalarını headless Chrome ile açar;
  detay/başvuru URL'si, özet, güvenilir yayın/deadline ve kategori çıkarır.
- ODTÜ worker resmi ana sayfadaki gerçek haber/program/başvuru kartlarını
  headless Chrome ile açar; URL tekrarlarını temizler ve tarih uydurmaz.
- İki worker da günlük schedule ve `workflow_dispatch` ile çalışabilir.
- Ana Next.js `package.json` dosyasına browser bağımlılığı eklenmedi.

Gerekli GitHub repository secrets:

```text
WORKER_INGESTION_URL=https://girisimcilik-ekosistemi-platformu.vercel.app/api/worker/opportunities
WORKER_INGESTION_SECRET=Vercel BOT_INGESTION_SECRET ile aynı değer
```

NATO manuel çalıştırma:

1. GitHub → Actions → NATO DIANA Worker.
2. Run workflow.
3. Step summary içinde collected/inserted/updated sayılarını kontrol et.
4. `/api/opportunities?source=nato-diana&timeRange=all&limit=10` aç.

ODTÜ manuel çalıştırma:

1. GitHub → Actions → ODTÜ Teknokent Worker.
2. Run workflow.
3. Step summary içinde collected/inserted/updated sayılarını kontrol et.
4. `/api/opportunities?source=odtu-teknokent&timeRange=all&limit=10` aç.

## 22 Temmuz 2026 — Aşama 5 sosyal medya kaynak katmanı

- `sourceGroup: social_media` altında YouTube, Instagram, X ve LinkedIn resmî
  hesap kaynakları eklendi.
- YouTube Data API, Meta Instagram Graph API ve X API adapterları yalnız env
  tokenlarıyla çalışır. LinkedIn organizasyon gönderileri rol/onay gerektirdiği
  için `fragile` ve sınırlı erişim olarak raporlanır.
- Sosyal kayıtlar platform, bağlı teknopark, paylaşım tarihi ve resmî gönderi
  URL'siyle ana `normalizeOpportunity` akışından geçer.
- Site ve sosyal kanaldaki aynı teknopark/başlık kayıtları aynı title identity
  anahtarında birleşir; web kaydı varsa canonical web URL'si korunur.
- Ana kaynak filtresine `Sosyal Medya`, admin diagnostics ekranına ayrı sosyal
  medya grubu eklendi.
- `005_social_media_sources.sql` migration'ı `platform` ve
  `related_technopark` alanlarını ekler.
- Kontroller: typecheck, lint, 107/107 test ve production build başarılı.
