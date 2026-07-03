# NATO DIANA External Worker

Bu worker, NATO DIANA'nın herkese açık haber sayfalarını ana Next.js/Vercel
uygulamasından bağımsız olarak normal bir headless Chrome oturumuyla okur.

Ana uygulamaya Selenium veya Chrome bağımlılığı eklemez. CAPTCHA, Cloudflare,
login, proxy rotation veya stealth/fingerprint bypass uygulamaz. Kaynak erişimi
engellerse hata vererek durur.

## Çalışma akışı

1. İlk dört `connect` liste sayfasını kontrollü olarak açar.
2. Yalnız `/connect/<detay>.html` bağlantılarını toplar.
3. URL bazlı tekrarları temizler.
4. Başlık, gerçek detay URL, mevcutsa tarih, özet ve görseli çıkarır.
5. Sonucu güvenli `/api/worker/opportunities` endpoint'ine gönderir.
6. Ana uygulama kayıtları doğrular, normalize eder, relevance filtresinden
   geçirir ve Supabase'e `unique_key` üzerinden upsert eder.

## Gerekli ortam değişkenleri

```text
WORKER_INGESTION_URL=https://your-domain.example/api/worker/opportunities
WORKER_INGESTION_SECRET=your-secret
```

Secret değeri dosyaya yazılmamalıdır. GitHub Actions kullanılırken değerler
repository secrets olarak tanımlanır.

## Yerel çalıştırma

Python 3.11+, Google Chrome ve aşağıdaki komutlar gerekir:

```bash
python -m pip install -r requirements.txt
python nato_diana_worker.py
```

Selenium Manager uygun ChromeDriver sürümünü çalışma sırasında bulur. Worker
ana uygulamanın npm bağımlılıklarını veya Vercel build'ini etkilemez.
