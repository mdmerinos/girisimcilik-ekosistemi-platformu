# Girişimcilik Ekosistemi Platformu

Türkiye ve dünyadaki girişimcilik fırsatlarını güvenilir kaynaklardan toplayan,
Next.js ve Supabase tabanlı açık kaynak platform.

Platformun temel amacı:

> Girişimcilik programlarını, destekleri, etkinlikleri ve güncel haberleri
> otomatik olarak tek bir merkezde toplamak.

## Kullanılan teknolojiler

- Next.js
- TypeScript
- Tailwind CSS
- Supabase / PostgreSQL
- RSS, resmî API ve web scraping

## Özellikler

- Gerçek kaynaklardan kontrollü veri toplama
- Girişimcilikle ilgili içerik filtresi
- `fragile`, `empty`, `skipped` ve `error` kaynak yönetimi
- Kart açıklamalarında HTML ve teknik tekrar temizliği
- Kaynakta açıklama yoksa sahte özet üretmeme
- RSS ve sayfa metadata alanlarından `image_url` desteği
- Gerçek detay URL’sini koruyan link kalite kontrolü
- Admin ingestion paneli ve çalışma geçmişi
- Manuel ingestion ve günlük Vercel Cron desteği
- Supabase kullanılamadığında sınırlı örnek veri

## Gereksinimler

- Güncel LTS sürümüyle [Node.js](https://nodejs.org/)
- Node.js ile gelen npm
- Bir Supabase hesabı ve projesi
- Git ile kurulum için Git

## GitHub’dan kurulum

Windows CMD:

```cmd
git clone REPO_LINKI
cd girisimcilik-ekosistemi-platformu
npm install
copy .env.example .env.local
npm run dev
```

`REPO_LINKI` yerine GitHub depo adresini yazın.

## ZIP ile kurulum

1. GitHub’daki **Code → Download ZIP** seçeneğiyle projeyi indirin.
2. ZIP arşivini çıkarın.
3. Windows CMD’yi proje klasöründe açın.
4. Şu komutları çalıştırın:

```cmd
npm install
copy .env.example .env.local
npm run dev
```

Windows kullanıcıları isterse proje kökündeki `setup.bat` dosyasını da
çalıştırabilir.

## Ortam değişkenleri

`.env.example` dosyasını `.env.local` adıyla kopyalayın ve yalnız kendi
Supabase/proje değerlerinizle doldurun:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_publishable_or_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
INGESTION_SECRET=your_long_random_ingestion_secret
CRON_SECRET=your_long_random_cron_secret
SAM_GOV_API_KEY=your_optional_sam_gov_api_key
```

`SAM_GOV_API_KEY` isteğe bağlıdır. Tanımlanmazsa SAM.gov kaynağı güvenli
şekilde `skipped` olur.

## Supabase migration kurulumu

Aşağıdaki dosyaları sırayla uygulayın:

1. `supabase/migrations/001_create_opportunities.sql`
2. `supabase/migrations/002_ingestion_observability.sql`
3. `supabase/migrations/003_expand_ingestion_statuses.sql`
4. `supabase/migrations/004_add_opportunity_media_fields.sql`

Her dosya için:

1. Supabase Dashboard’u açın.
2. **SQL Editor → New query** seçeneğine gidin.
3. İlgili migration dosyasının içeriğini yapıştırın.
4. **Run** düğmesine basın.
5. Başarılı olduktan sonra sıradaki dosyaya geçin.

Eski migration dosyalarını atlamayın veya sırasını değiştirmeyin.

## Geliştirme modunda çalıştırma

```cmd
npm run dev
```

Uygulama: [http://localhost:3000](http://localhost:3000)

## Manuel veri çekme

Windows CMD:

```cmd
curl -X POST http://localhost:3000/api/ingest -H "Authorization: Bearer YOUR_INGESTION_SECRET"
```

`YOUR_INGESTION_SECRET`, `.env.local` içindeki kendi
`INGESTION_SECRET` değeriniz olmalıdır. Bu değeri GitHub’a veya ekran
görüntülerine eklemeyin.

## Admin ingestion paneli

Admin ekranı:

```text
http://localhost:3000/admin/ingestion
```

Panelde `INGESTION_SECRET` kullanılarak manuel veri toplama başlatılabilir;
kaynak durumları, sayaçlar ve son ingestion çalışmaları görüntülenebilir.

## Kontrol ve test komutları

```cmd
npm run typecheck
npm run lint
npm test
```

## Production build

```cmd
npm run build
npm start
```

## Güvenlik notları

- `.env.local` dosyasını GitHub’a yüklemeyin.
- `SUPABASE_SERVICE_ROLE_KEY`, `INGESTION_SECRET` ve `CRON_SECRET` yalnız
  sunucu ortamında tutulmalıdır.
- Service-role anahtarını istemci bileşenlerinde veya `NEXT_PUBLIC_` isimli bir
  değişkende kullanmayın.
- `node_modules`, `.next`, `.vercel`, `tsconfig.tsbuildinfo` ve
  `pnpm-lock.yaml` repoya eklenmemelidir.
- `.env.example` yalnız güvenli placeholder değerler içermelidir.
- Captcha, login, paywall veya bot koruması aşılmaya çalışılmaz.

## Vercel deploy

1. GitHub deposunu Vercel’e bağlayın.
2. Framework olarak Next.js seçildiğini doğrulayın.
3. `.env.local` içindeki gerekli değişkenleri Vercel
   **Project Settings → Environment Variables** alanına tek tek ekleyin.
4. Supabase migration’larının uygulanmış olduğundan emin olun.
5. Deploy işlemini başlatın.

`vercel.json`, günlük ingestion için `/api/cron/ingest` endpoint’ini
`06:00 UTC` zamanında çağırır. Vercel ortamında `CRON_SECRET` tanımlı
olmalıdır.
