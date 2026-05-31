const SPREADSHEET_ID = ""; // Isi kalau script tidak dibuat langsung dari Google Sheet.
const SHEET_TRANSACTIONS = "Transactions";
const SHEET_REFERENCE = "Reference";

const TRANSACTION_HEADERS = [
  "ID",
  "Date",
  "Type",
  "Category",
  "Account",
  "Amount",
  "Note",
  "Created At",
  "Updated At"
];

const REFERENCE_HEADERS = ["Type", "Name"];

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || "listTransactions";
  return handleRequest_(action, {});
}

function doPost(e) {
  try {
    const body = e && e.postData && e.postData.contents
      ? JSON.parse(e.postData.contents)
      : {};
    return handleRequest_(body.action, body.payload || {});
  } catch (error) {
    return json_({ ok: false, message: error.message });
  }
}

function handleRequest_(action, payload) {
  try {
    switch (action) {
      case "setupSpreadsheet":
        return json_({ ok: true, data: setupSpreadsheet_() });
      case "listTransactions":
        return json_({ ok: true, data: { transactions: listTransactions_() } });
      case "upsertTransaction":
        return json_({ ok: true, data: upsertTransaction_(payload.transaction) });
      case "deleteTransaction":
        return json_({ ok: true, data: deleteTransaction_(payload.id) });
      case "replaceTransactions":
        return json_({ ok: true, data: replaceTransactions_(payload.transactions || []) });
      default:
        return json_({ ok: false, message: "Action tidak dikenal" });
    }
  } catch (error) {
    return json_({ ok: false, message: error.message });
  }
}

function setupSpreadsheet_() {
  const spreadsheet = getSpreadsheet_();
  const transactionSheet = ensureSheet_(spreadsheet, SHEET_TRANSACTIONS, TRANSACTION_HEADERS);
  const referenceSheet = ensureSheet_(spreadsheet, SHEET_REFERENCE, REFERENCE_HEADERS);

  if (referenceSheet.getLastRow() < 2) {
    referenceSheet.getRange(2, 1, 21, 2).setValues([
      ["expense", "Makan"],
      ["expense", "Transport"],
      ["expense", "Belanja"],
      ["expense", "Tagihan"],
      ["expense", "Rumah"],
      ["expense", "Kesehatan"],
      ["expense", "Hiburan"],
      ["expense", "Pendidikan"],
      ["expense", "Cicilan"],
      ["expense", "Lainnya"],
      ["income", "Gaji"],
      ["income", "Bonus"],
      ["income", "Jualan"],
      ["income", "Freelance"],
      ["income", "Transfer"],
      ["income", "Investasi"],
      ["income", "Lainnya"],
      ["account", "Cash"],
      ["account", "Bank"],
      ["account", "E-Wallet"],
      ["account", "Kartu Kredit"]
    ]);
  }

  transactionSheet.autoResizeColumns(1, TRANSACTION_HEADERS.length);
  referenceSheet.autoResizeColumns(1, REFERENCE_HEADERS.length);

  return {
    spreadsheetId: spreadsheet.getId(),
    spreadsheetUrl: spreadsheet.getUrl()
  };
}

function listTransactions_() {
  const sheet = ensureSheet_(getSpreadsheet_(), SHEET_TRANSACTIONS, TRANSACTION_HEADERS);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  return sheet.getRange(2, 1, lastRow - 1, TRANSACTION_HEADERS.length)
    .getValues()
    .filter(function(row) {
      return row[0];
    })
    .map(rowToTransaction_);
}

function upsertTransaction_(input) {
  const sheet = ensureSheet_(getSpreadsheet_(), SHEET_TRANSACTIONS, TRANSACTION_HEADERS);
  const transaction = normalizeTransaction_(input);
  const values = sheet.getDataRange().getValues();
  const row = transactionToRow_(transaction);

  for (let i = 1; i < values.length; i += 1) {
    if (String(values[i][0]) === transaction.id) {
      sheet.getRange(i + 1, 1, 1, TRANSACTION_HEADERS.length).setValues([row]);
      return { transaction: transaction, mode: "updated" };
    }
  }

  sheet.appendRow(row);
  return { transaction: transaction, mode: "created" };
}

function deleteTransaction_(id) {
  if (!id) throw new Error("ID transaksi kosong");

  const sheet = ensureSheet_(getSpreadsheet_(), SHEET_TRANSACTIONS, TRANSACTION_HEADERS);
  const values = sheet.getDataRange().getValues();

  for (let i = 1; i < values.length; i += 1) {
    if (String(values[i][0]) === String(id)) {
      sheet.deleteRow(i + 1);
      return { deleted: true };
    }
  }

  return { deleted: false };
}

function replaceTransactions_(transactions) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const sheet = ensureSheet_(getSpreadsheet_(), SHEET_TRANSACTIONS, TRANSACTION_HEADERS);
    sheet.clearContents();
    sheet.getRange(1, 1, 1, TRANSACTION_HEADERS.length).setValues([TRANSACTION_HEADERS]);

    const rows = transactions.map(normalizeTransaction_).map(transactionToRow_);
    if (rows.length > 0) {
      sheet.getRange(2, 1, rows.length, TRANSACTION_HEADERS.length).setValues(rows);
    }

    sheet.setFrozenRows(1);
    return { count: rows.length };
  } finally {
    lock.releaseLock();
  }
}

function getSpreadsheet_() {
  const spreadsheet = SPREADSHEET_ID
    ? SpreadsheetApp.openById(SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();

  if (!spreadsheet) {
    throw new Error("Buat script dari Google Sheet atau isi SPREADSHEET_ID.");
  }

  return spreadsheet;
}

function ensureSheet_(spreadsheet, name, headers) {
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(name);
  }

  const currentHeaders = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const needsHeader = headers.some(function(header, index) {
    return currentHeaders[index] !== header;
  });

  if (needsHeader) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length)
      .setFontWeight("bold")
      .setBackground("#0b6b58")
      .setFontColor("#ffffff");
  }

  return sheet;
}

function normalizeTransaction_(input) {
  if (!input) throw new Error("Data transaksi kosong");

  const now = new Date().toISOString();
  const amount = Number(input.amount || 0);
  if (!amount || amount < 1) throw new Error("Jumlah transaksi tidak valid");

  return {
    id: String(input.id || "md-" + new Date().getTime()),
    date: normalizeDate_(input.date || new Date()),
    type: input.type === "income" ? "income" : "expense",
    category: String(input.category || "Lainnya"),
    account: String(input.account || "Cash"),
    amount: amount,
    note: String(input.note || ""),
    createdAt: String(input.createdAt || now),
    updatedAt: String(input.updatedAt || now)
  };
}

function rowToTransaction_(row) {
  return {
    id: String(row[0]),
    date: normalizeDate_(row[1]),
    type: row[2] === "income" ? "income" : "expense",
    category: String(row[3] || "Lainnya"),
    account: String(row[4] || "Cash"),
    amount: Number(row[5] || 0),
    note: String(row[6] || ""),
    createdAt: String(row[7] || ""),
    updatedAt: String(row[8] || "")
  };
}

function transactionToRow_(transaction) {
  return [
    transaction.id,
    transaction.date,
    transaction.type,
    transaction.category,
    transaction.account,
    transaction.amount,
    transaction.note,
    transaction.createdAt,
    transaction.updatedAt
  ];
}

function normalizeDate_(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  return String(value).slice(0, 10);
}

function json_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
