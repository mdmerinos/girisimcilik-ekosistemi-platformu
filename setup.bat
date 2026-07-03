@echo off
setlocal

where node >nul 2>&1
if errorlevel 1 (
  echo [HATA] Node.js bulunamadi. Once https://nodejs.org/ adresinden Node.js LTS kurun.
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo [HATA] npm bulunamadi. Node.js kurulumunu kontrol edin.
  exit /b 1
)

echo Bagimliliklar npm ile kuruluyor...
call npm install
if errorlevel 1 (
  echo [HATA] npm install basarisiz oldu.
  exit /b 1
)

if not exist ".env.local" (
  if not exist ".env.example" (
    echo [HATA] .env.example bulunamadi.
    exit /b 1
  )
  copy ".env.example" ".env.local" >nul
  echo .env.local olusturuldu.
) else (
  echo .env.local zaten mevcut; degistirilmedi.
)

echo.
echo .env.local dosyasini kendi Supabase ve secret degerlerinizle doldurun.
echo Supabase migration dosyalarini SQL Editor'da sirayla calistirin.
echo Hazir oldugunuzda projeyi su komutla baslatin:
echo npm run dev

endlocal
