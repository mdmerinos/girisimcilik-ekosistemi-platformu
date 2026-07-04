# ODTÜ Teknokent External Worker

Bu worker, ODTÜ Teknokent'in resmi ana sayfasındaki gerçek haber, program ve
başvuru kartlarını GitHub Actions üzerinde headless Chrome ile okur. Carousel
tekrarlarını URL ile temizler; gerçek başlık, özet, detay/başvuru URL'si ve
yalnız kaynakta bulunan tarihleri çıkarır. Sonucu
`sourceSlug=odtu-teknokent` ile güvenli worker endpointine yollar.

Ana Next.js/Vercel uygulamasına Selenium veya Chrome bağımlılığı eklemez.

## Gerekli repository secrets

```text
WORKER_INGESTION_URL=https://girisimcilik-ekosistemi-platformu.vercel.app/api/worker/opportunities
WORKER_INGESTION_SECRET=Vercel BOT_INGESTION_SECRET ile aynı değer
```

Gerçek secret değeri hiçbir dosyaya yazılmamalıdır.

## Manuel çalıştırma

1. GitHub repository içinde **Actions** sekmesine gir.
2. **ODTÜ Teknokent Worker** workflow'unu seç.
3. **Run workflow** düğmesine bas.
4. Log ve step summary içinde collected/inserted/updated sayılarını kontrol et.
5. Canlı API'yi kontrol et:

```text
/api/opportunities?source=odtu-teknokent&timeRange=all&limit=10
```

## Yerel çalıştırma

Python 3.12 ve Google Chrome gerekir:

```bash
python -m pip install -r requirements.txt
python odtu_teknokent_worker.py
```
