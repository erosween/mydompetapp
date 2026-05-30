# Setup Spreadsheet

## Sheet yang dibuat

Backend akan membuat dua sheet:

- `Transactions`
- `Reference`

Kolom `Transactions`:

```text
ID, Date, Type, Category, Account, Amount, Note, Created At, Updated At
```

## Deploy Apps Script

1. Buat Google Sheet baru untuk database user.
2. Buka `Extensions > Apps Script`.
3. Paste file `backend/apps-script.gs`.
4. Simpan project.
5. Klik `Deploy > New deployment`.
6. Type: `Web app`.
7. Execute as: `Me`.
8. Who has access: `Anyone`.
9. Deploy dan copy URL yang berakhir `/exec`.

## Hubungkan ke app

1. Buka app `my dompet`.
2. Masuk `Setting`.
3. Paste URL Apps Script.
4. Klik `Simpan setting`.
5. Klik `Setup sheet`.
6. Klik `Pull data` untuk membaca data spreadsheet atau `Push lokal` untuk mengirim data lokal.

## Catatan jualan one-purchase

Setiap pembeli bisa punya spreadsheet sendiri. Dengan model ini, biaya server hampir nol karena data tinggal di Google Sheets milik user atau milik admin.
