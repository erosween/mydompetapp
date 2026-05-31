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

1. Generate token dan setup link dari terminal seller:

```bash
node scripts/generate-token.mjs "Nama pembeli" --app "https://URL-APP-KAMU" --api "https://script.google.com/macros/s/.../exec"
```

2. Buka setup link itu sekali di device client.
3. App akan menyimpan koneksi database dan token. Setup link default membawa `fresh=1`, jadi transaksi lokal/demo lama dan isi sheet `Transactions` untuk database itu dikosongkan.
4. Client cukup memakai app dan Add to Home Screen.

## Catatan jualan one-purchase

Setiap pembeli bisa punya spreadsheet sendiri. Dengan model ini, biaya server hampir nol karena data tinggal di Google Sheets milik user atau milik admin.
