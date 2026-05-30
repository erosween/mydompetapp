# my dompet app

Mobile-first finance tracker dengan mode PWA dan database Google Spreadsheet.

## Isi project

- `index.html` aplikasi utama
- `styles.css` UI responsive
- `app.js` logic transaksi, laporan, local storage, dan sync spreadsheet
- `manifest.webmanifest` konfigurasi PWA
- `service-worker.js` cache offline dasar
- `backend/apps-script.gs` backend Google Apps Script untuk spreadsheet
- `docs/spreadsheet-setup.md` langkah setup database spreadsheet

## Cara coba lokal

Jalankan static server dari folder ini:

```bash
python3 -m http.server 4173
```

Buka:

```text
http://localhost:4173
```

## Cara pakai spreadsheet

1. Buat Google Sheet baru.
2. Buka `Extensions > Apps Script`.
3. Tempel isi `backend/apps-script.gs`.
4. Klik `Deploy > New deployment`.
5. Pilih `Web app`, akses `Anyone`.
6. Copy URL `/exec`.
7. Buka app `my dompet > Setting`, paste URL, lalu klik `Simpan setting`.
8. Klik `Setup sheet`, lalu `Push lokal` kalau mau mengirim data demo/lokal.

## Packaging iOS dan Android

Versi ini sudah PWA. Untuk jualan cepat, user bisa buka URL app dari browser HP dan pilih Add to Home Screen. Kalau nanti butuh APK/IPA native wrapper, app ini bisa dibungkus dengan Capacitor tanpa mengubah logic utama.
