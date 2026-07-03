# Mevcut Proje Durumu

## Genel durum

Girişimcilik Ekosistemi Platformu geliştirme ortamında çalışır durumdadır.
Next.js arayüzü, Supabase veri katmanı, ingestion sistemi, admin paneli ve
zamanlanmış çalışma altyapısı birlikte kullanılmaktadır.

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

## Son temiz kontrol

- `npm run typecheck` başarılı
- `npm run lint` başarılı
- `npm test` başarılı — 28/28
- `npm run build` başarılı

## Supabase migration listesi

1. `supabase/migrations/001_create_opportunities.sql`
2. `supabase/migrations/002_ingestion_observability.sql`
3. `supabase/migrations/003_expand_ingestion_statuses.sql`
4. `supabase/migrations/004_add_opportunity_media_fields.sql`

Migration’lar sırasıyla Supabase **SQL Editor → New query → Run** akışıyla
uygulanmalıdır.

## Sonraki yapılacak işler

- Yatırım ve Sermaye Ağları kategorisini güçlendirme
- Otomatik güncelleme ve bildirim kartları
- Modern mobil/yatay kart tasarımı
- Yeni kaynakları iyileştirme
- Vercel deploy

## Başka bir Codex oturumunda devam etmek

1. Proje kökünü çalışma klasörü olarak açın.
2. Önce `README.md`, `CURRENT_STATUS.md`, `package.json` ve ilgili kaynak
   dosyalarını okuyun.
3. `.env.local`, `node_modules` ve `.next` dosya/klasörlerine dokunmayın.
4. Paket yönetimi ve kontroller için yalnız npm kullanın.
5. Değişiklikten önce temiz başlangıç kontrollerini çalıştırın:

```cmd
npm run typecheck
npm run lint
npm test
npm run build
```

Gerçek secret değerlerini sohbet, doküman, commit veya ekran görüntülerine
eklemeyin.
