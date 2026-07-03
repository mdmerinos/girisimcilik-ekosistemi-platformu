# Girişim Atlası — Mevcut Proje Durumu

## Genel durum

Girişim Atlası; Next.js App Router, Supabase, Vercel Cron, stale refresh,
admin ingestion paneli ve kaynak bazlı ingestion sistemiyle çalışmaktadır.

Mevcut `/api/opportunities`, `/api/refresh-if-stale`, `/api/cron/ingest` ve
`/api/ingest` sözleşmeleri korunmuştur. Commit veya push yapılmamıştır.

## Dashboard tasarımı

Ana sayfa modern terminal/pano tasarımıyla çalışmaktadır:

- Girişim Atlası marka başlığı
- Yavaş ticker
- Koyu/açık tema
- Arama
- Güvenli stale refresh düğmesi
- Kategori sidebar/sekme görünümü
- Türkiye / Dünya / Tümü filtresi
- Public istatistik kartları
- Responsive fırsat grid'i
- Gerçek `image_url` varsa görsel, yoksa sade kart

Mobil taşmaya neden olan geniş ticker şeridi layout/paint containment içine
alındı. Sayfa seviyesinde yatay taşma engellendi; kategori şeridi kendi içinde
kontrollü yatay kaydırma kullanır. Kartların gereksiz minimum yüksekliği
azaltıldı, footer durumu gerçek API kaynağına göre gösterilir. Statik fırsat,
sahte Unsplash görseli, `/api/data`, `/api/refresh` veya public
`/api/ingest` bağlantısı eklenmedi.

Tarayıcı kontrolünde masaüstü görünüm, 24 gerçek kart, country filtreleri,
istatistikler ve sıfır istemci console hatası doğrulandı.

## Kart tarih etiketleri

Kartlar artık çıplak tarih göstermez:

- `deadline_at` varsa `Son başvuru: DD.MM.YYYY`
- Deadline yok, `published_at` varsa `Yayın: DD.MM.YYYY`
- İki alan da yoksa tarih gösterilmez

Deadline ve yayın tarihi birbirine karıştırılmaz.

## NASA SBIR/STTR tarih düzeltmesi

NASA SBIR/STTR kayıtları Grants.gov akışından gelmektedir. Appendix 26A/26B
kayıtları için güvenilir resmî takvim uygulandı:

- Açılış / yayın: 21 Nisan 2026
- Son başvuru: 21 Mayıs 2026

2026–2027 NASA SBIR/STTR kayıtlarında 2027 sonrasına taşan desteklenmeyen ham
tarihler gösterilmez. Düzeltme hem yeni ingestion kayıtlarına hem API'den
okunan mevcut NASA kayıtlarına uygulanır. Tarayıcıda NASA kartının
`Son başvuru: 21.05.2026` gösterdiği doğrulandı.

EU Funding/Horizon structured `deadlineDate` alanları değiştirilmedi. Testte
15 Eylül 2027 tarihi korundu ve tarayıcı kartında
`Son başvuru: 15.09.2027` olarak doğrulandı.

## ODTÜ Teknokent scraper

Yeni kaynak eklenmedi; mevcut `odtu-teknokent` kaydı geliştirildi.

Kullanılan selector ve öncelikler:

- `.news-container-wrapper .news-container`
- `.news-main-container .news-container`
- `.news-item`
- `.read-more`
- `h4`, `h3`, `h2`
- `.news-excerpt`, `.excerpt`, `p`
- `time[datetime]`
- `.haber-tarih`, `.news-date`, `.date`
- JSON-LD `datePublished`
- Etiketli `Son Başvuru Tarihi`

Detay/başvuru linki görsel anchor'dan önce seçilir. Menü, footer ve sosyal
bağlantılar kart container'ı dışında kalır. URL bazlı duplicate temizliği
korunur. Rastgele body tarihi kullanılmaz.

3 Temmuz 2026 canlı sonucu:

- 12 kayıt
- 12 başlık
- 12 gerçek detay/başvuru linki
- 12 gerçek özet
- 1 güvenilir son başvuru tarihi
- 0 uydurma tarih veya özet

## NATO DIANA lightweight scraper

Mevcut Vercel collector ilk dört `connect` sayfasını fetch + Cheerio ile
kontrollü tarar. Bu ortamda resmî site HTTP 403 verdi; canlı lightweight
sonucu 0 kayıttır ve kaynak `fragile` durumuna uygundur.

Ana uygulamaya browser automation eklenmedi.

## NATO DIANA harici Selenium worker

Harici worker eklendi:

- `workers/nato-diana/nato_diana_worker.py`
- `workers/nato-diana/requirements.txt`
- `workers/nato-diana/README.md`
- `.github/workflows/nato-diana-worker.yml`

Worker GitHub Actions üzerinde günlük veya manuel çalışabilir. Selenium,
BeautifulSoup ve Requests yalnız worker requirements dosyasındadır; ana
`package.json` ve Vercel build'i etkilenmez.

Worker CAPTCHA, Cloudflare, login, proxy rotation, stealth veya fingerprint
bypass uygulamaz. Erişim engellenirse hata vererek durur.

## Harici worker endpoint'i

Yeni güvenli endpoint:

```text
POST /api/worker/opportunities
```

Özellikler:

- `Authorization: Bearer ...` zorunlu
- `BOT_INGESTION_SECRET` veya mevcut `INGESTION_SECRET` kabul edilir
- Envelope ve her kayıt Zod ile ayrı doğrulanır
- Hatalı tek kayıt tüm batch'i çökertmez
- `normalizeOpportunity` uygulanır
- `isEntrepreneurshipRelevant` uygulanır
- `unique_key` sunucu tarafında oluşturulur
- Batch içi duplicate kayıtlar tekilleştirilir
- Supabase `unique_key` upsert kullanılır
- Response yalnız public sayaçlar döndürür
- Secret veya service-role key response'a girmez

Yanlış secret ile canlı istek 401 döndürdü. Eksik payload, normalize/relevance,
duplicate ve mocked upsert akışları unit testlerle doğrulandı.

## GitHub Actions secrets

Repository secrets:

```text
WORKER_INGESTION_URL
WORKER_INGESTION_SECRET
```

Vercel tarafında isteğe bağlı:

```text
BOT_INGESTION_SECRET
```

Worker secret değeri mevcut `INGESTION_SECRET` ile aynı da olabilir; dosyalara
gerçek değer yazılmamıştır.

## API smoke testleri

Yerel çalışan uygulamada:

- `/api/opportunities` → 200
- `/api/opportunities?countryGroup=turkiye` → 200
- `/api/opportunities?countryGroup=global` → 200
- `/api/opportunities?category=Uluslararası%20Fonlar` → 200
- `/api/stats` → 200
- `/api/refresh-if-stale` POST → 200
- `/api/worker/opportunities` yanlış secret → 401

Admin, cron ve refresh-if-stale kaynak kodları değiştirilmedi.

## Bağımlılık ve migration

- Ana npm projesine yeni paket kurulmadı.
- Ana `package.json` değiştirilmedi.
- Yeni Supabase migration oluşturulmadı.
- Selenium yalnız `workers/nato-diana/requirements.txt` içindedir.
- `.env.local` okunmadı veya değiştirilmedi.
- `.env.example` yalnız güvenli `BOT_INGESTION_SECRET` placeholder'ı ile
  güncellendi.

## Son kontroller

- `npm.cmd run typecheck` başarılı
- `npm.cmd run lint` başarılı
- `npm.cmd test` başarılı — 46/46
- `npm.cmd run build` başarılı
- Build içinde `/api/worker/opportunities` rotası doğrulandı

## KALAN İŞ

- GitHub repository secrets değerleri tanımlanmalı.
- Vercel'de `BOT_INGESTION_SECRET` tanımlanmalı veya worker ile mevcut
  `INGESTION_SECRET` paylaşılmalı.
- GitHub Actions workflow'u ilk kez manuel çalıştırılıp NATO'nun GitHub-hosted
  runner üzerinden normal Chrome erişimine izin verip vermediği doğrulanmalı.
- Python bu Codex makinesinde PATH'te olmadığı için harici worker burada
  çalıştırılmadı; GitHub Actions ortamında requirements kurulumu ile
  doğrulanmalıdır.
- Production deploy sonrasında ODTÜ ingestion sayıları ve NASA mevcut
  kayıtlarının güncellenmesi admin panelden izlenmelidir.
