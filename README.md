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
7. Buat link setup untuk device client dengan tool seller:

```bash
node scripts/generate-token.mjs "Nama pembeli" --app "https://URL-APP-KAMU" --api "https://script.google.com/macros/s/.../exec"
```

Parameter `api` dan `token` akan disimpan otomatis. Secara default setup link juga membawa `fresh=1`, jadi transaksi lokal/demo lama dan isi sheet `Transactions` untuk database itu akan dikosongkan. URL spreadsheet juga bisa diganti manual lewat `Setting > Preferensi > URL Web App spreadsheet`. Kalau ingin mempertahankan data sheet lama, tambahkan opsi `--keep-data` saat generate setup link.

## Aktivasi token pembeli

Token dimasukkan pembeli saat pertama membuka app, atau lewat `Setting > Akses lifetime`.

Format token:

```text
MD-XXXX-XXXX-XXXX
```

Token tidak lagi asal format saja. Buat token dari terminal seller, lalu catat bersama nama pembeli atau nomor invoice.

```bash
node scripts/generate-token.mjs "Nama pembeli / invoice"
```

Kalau URL Vercel dan Apps Script sudah ada, tool ini juga bisa langsung membuat setup link:

```bash
node scripts/generate-token.mjs "Nama pembeli" --app "https://URL-APP-KAMU" --api "https://script.google.com/macros/s/.../exec"
```

Saat `--api` diisi, tool juga memperbarui `license-registry.json`. Setelah file itu dipush/deploy, user yang hanya memasukkan token bisa otomatis tersambung ke spreadsheet yang benar.
Jangan lupa commit dan push `license-registry.json` setiap selesai generate token baru supaya Vercel ikut membawa mapping token tersebut.

Tambahkan `--keep-data` kalau setup link dipakai untuk client lama dan data spreadsheet tidak boleh dihapus.

Tanpa token, pembeli bisa mencoba app gratis sampai 10 input transaksi baru. Setelah limit habis, app akan meminta token lifetime untuk lanjut input transaksi.

Alur jualan yang disarankan:

1. Pembeli transfer dan kirim email Google yang dipakai untuk spreadsheet.
2. Kita buatkan Google Sheet baru untuk pembeli.
3. Kita pasang `backend/apps-script.gs` di Apps Script pembeli atau sheet yang kita siapkan.
4. Kita deploy Web app dan copy URL `/exec`.
5. Kita generate token lifetime dari terminal seller.
6. Kita buka/kirim link setup berisi `api` dan `token`, lalu pembeli tinggal Add to Home Screen.

Catatan MVP: validasi token berjalan di frontend dan batas demo tersimpan di device user. Ini cukup untuk client awam di fase awal; kalau nanti volume penjualan sudah besar, naikkan ke registry token online supaya token dan limit demo bisa dikunci dari server.

## Packaging iOS dan Android

Versi ini sudah PWA. Untuk jualan cepat, user bisa buka URL app dari browser HP dan pilih Add to Home Screen. Kalau nanti butuh APK/IPA native wrapper, app ini bisa dibungkus dengan Capacitor tanpa mengubah logic utama.
