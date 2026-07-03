# Kurulum Rehberi

## 1. Node.js kurun

Güncel LTS Node.js sürümünü [nodejs.org](https://nodejs.org/) adresinden
kurun. Kurulum npm’i de içerir.

## 2. Projeyi GitHub’dan indirin

Windows CMD:

```cmd
git clone REPO_LINKI
```

Git kullanmıyorsanız GitHub’daki **Code → Download ZIP** seçeneğini kullanıp
arşivi çıkarabilirsiniz.

## 3. Proje klasörüne girin

```cmd
cd girisimcilik-ekosistemi-platformu
```

## 4. Bağımlılıkları kurun

```cmd
npm install
```

## 5. Ortam dosyasını oluşturun

```cmd
copy .env.example .env.local
```

## 6. Supabase bilgilerini girin

`.env.local` dosyasını açıp kendi Supabase URL, anon/publishable key,
service-role key ve uygulama secret değerlerinizi yazın. Bu dosyayı GitHub’a
yüklemeyin.

## 7. Supabase migration’larını uygulayın

Dosyaları şu sırayla çalıştırın:

1. `supabase/migrations/001_create_opportunities.sql`
2. `supabase/migrations/002_ingestion_observability.sql`
3. `supabase/migrations/003_expand_ingestion_statuses.sql`
4. `supabase/migrations/004_add_opportunity_media_fields.sql`

Her dosya için Supabase’de **SQL Editor → New query** seçeneğine gidin, dosya
içeriğini yapıştırın ve **Run** düğmesine basın.

## 8. Projeyi başlatın

```cmd
npm run dev
```

## 9. Uygulamayı açın

Tarayıcıda [http://localhost:3000](http://localhost:3000) adresine gidin.

## 10. Manuel veri çekin

```cmd
curl -X POST http://localhost:3000/api/ingest -H "Authorization: Bearer YOUR_INGESTION_SECRET"
```

`YOUR_INGESTION_SECRET` yerine yalnız kendi `.env.local` dosyanızdaki değeri
kullanın.
