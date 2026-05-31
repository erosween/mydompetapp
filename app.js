const STORAGE_KEYS = {
  transactions: "my-dompet.transactions",
  settings: "my-dompet.settings"
};

const DEFAULT_CATEGORIES = {
  expense: ["Makan", "Transport", "Belanja", "Tagihan", "Hiburan", "Kesehatan", "Bisnis"],
  income: ["Gaji", "Bonus", "Jualan", "Freelance", "Investasi", "Lainnya"]
};

const DEFAULT_ACCOUNTS = ["Cash", "Bank", "E-Wallet", "Kartu Kredit"];

const VIEW_TITLES = {
  dashboard: "Dompet hari ini",
  transactions: "Money log",
  reports: "Insight",
  settings: "Studio"
};

const ACCENTS = ["#ff7a70", "#ffbf5c", "#baff5a", "#41e3bd", "#8ea2ff", "#b58cff", "#f58ac8"];

const state = {
  view: "dashboard",
  transactions: [],
  settings: loadSettings(),
  selectedMonth: toMonthKey(new Date()),
  search: "",
  typeFilter: "all",
  formType: "expense",
  busy: {
    savingTransaction: false,
    deletingTransaction: false,
    savingSettings: false,
    syncing: false,
    setup: false,
    pushing: false
  }
};

let toastTimer;

document.addEventListener("DOMContentLoaded", init);

function init() {
  state.transactions = loadTransactions();

  if (state.transactions.length === 0) {
    state.transactions = createDemoTransactions();
    saveTransactions();
  }

  state.selectedMonth = latestMonthKey(state.transactions) || toMonthKey(new Date());

  bindEvents();
  render();
  registerServiceWorker();

  if (state.settings.apiUrl) {
    syncFromSheet(false).catch(() => {
      setSyncStatus("Spreadsheet belum tersambung");
    });
  }
}

function bindEvents() {
  document.body.addEventListener("click", (event) => {
    const viewButton = event.target.closest("[data-view-link]");
    if (viewButton) {
      setView(viewButton.dataset.viewLink);
      return;
    }

    if (event.target.closest("[data-open-transaction]")) {
      openTransactionModal();
      return;
    }

    const editButton = event.target.closest("[data-edit]");
    if (editButton) {
      const transaction = state.transactions.find((item) => item.id === editButton.dataset.edit);
      if (transaction) openTransactionModal(transaction);
      return;
    }

    const removeButton = event.target.closest("[data-remove]");
    if (removeButton) {
      deleteTransaction(removeButton.dataset.remove);
    }
  });

  document.getElementById("closeModalButton").addEventListener("click", closeTransactionModal);
  document.getElementById("transactionForm").addEventListener("submit", saveTransactionFromForm);
  document.getElementById("deleteTransactionButton").addEventListener("click", () => {
    const id = document.getElementById("transactionId").value;
    if (id) deleteTransaction(id);
  });

  document.querySelectorAll("[data-type-option]").forEach((button) => {
    button.addEventListener("click", () => {
      setFormType(button.dataset.typeOption);
    });
  });

  document.getElementById("amountInput").addEventListener("input", (event) => {
    event.target.value = formatInputNumber(event.target.value);
  });

  document.getElementById("monthlyBudgetInput").addEventListener("input", (event) => {
    event.target.value = formatInputNumber(event.target.value);
  });

  document.getElementById("monthSelector").addEventListener("change", (event) => {
    state.selectedMonth = event.target.value;
    render();
  });

  document.getElementById("searchInput").addEventListener("input", (event) => {
    state.search = event.target.value.trim().toLowerCase();
    renderTransactionsView();
  });

  document.getElementById("typeFilter").addEventListener("change", (event) => {
    state.typeFilter = event.target.value;
    renderTransactionsView();
  });

  document.getElementById("settingsForm").addEventListener("submit", saveSettingsFromForm);
  document.getElementById("syncButton").addEventListener("click", () => syncFromSheet(true));
  document.getElementById("setupSheetButton").addEventListener("click", setupSpreadsheet);
  document.getElementById("pullSheetButton").addEventListener("click", () => syncFromSheet(true));
  document.getElementById("pushSheetButton").addEventListener("click", pushLocalToSheet);
  document.getElementById("exportCsvButton").addEventListener("click", exportCsv);
}

function render() {
  document.getElementById("todayLabel").textContent = new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long"
  }).format(new Date());

  document.getElementById("screenTitle").textContent = VIEW_TITLES[state.view];
  renderMonthSelector();
  renderDashboard();
  renderTransactionsView();
  renderReports();
  renderSettings();
  setActiveNavigation();
  refreshIcons();
}

function setView(view) {
  if (!VIEW_TITLES[view]) return;
  state.view = view;
  document.querySelectorAll(".view").forEach((section) => {
    section.classList.toggle("is-active", section.dataset.view === view);
  });
  document.getElementById("screenTitle").textContent = VIEW_TITLES[view];
  setActiveNavigation();
  refreshIcons();
}

function setActiveNavigation() {
  document.querySelectorAll("[data-view-link]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.viewLink === state.view);
  });
}

function renderDashboard() {
  const monthTransactions = getMonthTransactions();
  const allTotals = calculateTotals(state.transactions);
  const monthTotals = calculateTotals(monthTransactions);
  const budget = Number(state.settings.monthlyBudget) || 0;
  const budgetRatio = budget > 0 ? Math.min(999, Math.round((monthTotals.expense / budget) * 100)) : 0;

  document.getElementById("balanceAmount").textContent = money(allTotals.balance);
  document.getElementById("incomeAmount").textContent = money(monthTotals.income);
  document.getElementById("expenseAmount").textContent = money(monthTotals.expense);
  document.getElementById("budgetPercent").textContent = `${budgetRatio}%`;
  document.getElementById("budgetAmount").textContent = `${money(monthTotals.expense)} dari ${money(budget)}`;
  document.getElementById("incomeCount").textContent = `${monthTotals.incomeCount} transaksi`;
  document.getElementById("expenseCount").textContent = `${monthTotals.expenseCount} transaksi`;
  document.getElementById("monthCashflow").textContent = `Cashflow bulan ini ${money(monthTotals.balance)}`;
  document.getElementById("syncStatus").textContent = state.settings.apiUrl
    ? "Tersambung ke spreadsheet"
    : "Mode demo lokal";

  renderWeeklyChart(monthTransactions);
  renderCategoryList(document.getElementById("categoryList"), monthTransactions, 5);
  renderTransactionRows(document.getElementById("recentTransactions"), sortTransactions(state.transactions).slice(0, 4));
}

function renderMonthSelector() {
  const selector = document.getElementById("monthSelector");
  const months = Array.from(new Set([toMonthKey(new Date()), ...state.transactions.map((item) => item.date.slice(0, 7))]))
    .filter(Boolean)
    .sort()
    .reverse();

  selector.innerHTML = months.map((month) => {
    return `<option value="${escapeHtml(month)}">${monthLabel(month)}</option>`;
  }).join("");

  if (!months.includes(state.selectedMonth)) {
    state.selectedMonth = months[0] || toMonthKey(new Date());
  }

  selector.value = state.selectedMonth;
}

function renderWeeklyChart(transactions) {
  const chart = document.getElementById("weeklyChart");
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (6 - index));
    const key = toDateKey(date);
    const total = transactions
      .filter((item) => item.date === key)
      .reduce((sum, item) => sum + (item.type === "income" ? item.amount : -item.amount), 0);
    return { key, total };
  });

  const max = Math.max(...days.map((day) => Math.abs(day.total)), 1);
  chart.innerHTML = days.map((day) => {
    const height = Math.max(8, Math.round((Math.abs(day.total) / max) * 100));
    const fill = day.total >= 0
      ? "linear-gradient(180deg, #41e3bd, #8ea2ff)"
      : "linear-gradient(180deg, #ff7a70, #ffbf5c)";
    return `
      <div class="chart-day" title="${escapeHtml(money(day.total))}">
        <div class="bar-track">
          <div class="bar-fill" style="height:${height}%; background:${fill}"></div>
        </div>
        <small>${shortDayLabel(day.key)}</small>
      </div>
    `;
  }).join("");
}

function renderTransactionsView() {
  const list = document.getElementById("transactionList");
  const filtered = sortTransactions(state.transactions).filter((item) => {
    const matchesType = state.typeFilter === "all" || item.type === state.typeFilter;
    const haystack = `${item.category} ${item.account} ${item.note} ${money(item.amount)}`.toLowerCase();
    return matchesType && (!state.search || haystack.includes(state.search));
  });
  renderTransactionRows(list, filtered);
  refreshIcons();
}

function renderReports() {
  const monthTransactions = getMonthTransactions();
  const totals = calculateTotals(monthTransactions);
  const activeDays = new Set(monthTransactions.map((item) => item.date)).size || 1;

  document.getElementById("reportSummary").innerHTML = [
    ["Pemasukan", money(totals.income)],
    ["Pengeluaran", money(totals.expense)],
    ["Saldo bersih", money(totals.balance)],
    ["Rata-rata harian", money(Math.round(totals.expense / activeDays))]
  ].map(([label, value]) => `
    <div class="summary-item">
      <span>${label}</span>
      <strong>${value}</strong>
    </div>
  `).join("");

  renderCategoryList(document.getElementById("reportCategoryList"), monthTransactions, 10);
  renderAccountGrid();
}

function renderSettings() {
  document.getElementById("userNameInput").value = state.settings.userName;
  document.getElementById("monthlyBudgetInput").value = formatInputNumber(String(state.settings.monthlyBudget || ""));
  document.getElementById("apiUrlInput").value = state.settings.apiUrl || "";
  document.getElementById("licenseKeyLabel").textContent = state.settings.licenseKey || "MD-LIFETIME-DEMO";
}

function renderCategoryList(container, transactions, limit) {
  const expenses = transactions.filter((item) => item.type === "expense");
  const groups = groupSum(expenses, "category").slice(0, limit);
  const max = Math.max(...groups.map((item) => item.total), 1);

  if (groups.length === 0) {
    container.innerHTML = `<div class="empty-state">Belum ada pengeluaran di periode ini</div>`;
    return;
  }

  container.innerHTML = groups.map((item, index) => {
    const width = Math.round((item.total / max) * 100);
    const accent = ACCENTS[index % ACCENTS.length];
    return `
      <div class="category-row">
        <div class="category-row__top">
          <span>${escapeHtml(item.label)}</span>
          <strong>${money(item.total)}</strong>
        </div>
        <div class="progress-track">
          <div class="progress-fill" style="width:${width}%; background:${accent}"></div>
        </div>
      </div>
    `;
  }).join("");
}

function renderAccountGrid() {
  const grid = document.getElementById("accountGrid");
  const accounts = DEFAULT_ACCOUNTS.map((account) => {
    const total = state.transactions
      .filter((item) => item.account === account)
      .reduce((sum, item) => sum + (item.type === "income" ? item.amount : -item.amount), 0);
    return { account, total };
  });

  grid.innerHTML = accounts.map((item) => `
    <article class="account-card">
      <span>${escapeHtml(item.account)}</span>
      <strong>${money(item.total)}</strong>
    </article>
  `).join("");
}

function renderTransactionRows(container, transactions) {
  if (transactions.length === 0) {
    container.innerHTML = `<div class="empty-state">Belum ada transaksi</div>`;
    return;
  }

  container.innerHTML = transactions.map((item) => {
    const sign = item.type === "income" ? "+" : "-";
    const icon = item.type === "income" ? "arrow-down-left" : "arrow-up-right";
    const accent = item.type === "income" ? "#41e3bd" : categoryAccent(item.category);
    const title = item.note || item.category;
    const meta = item.note
      ? `${item.category} · ${item.account} · ${dateLabel(item.date)}`
      : `${item.account} · ${dateLabel(item.date)}`;
    return `
      <article class="transaction-row">
        <div class="transaction-main">
          <span class="transaction-icon ${item.type === "income" ? "income" : ""}" style="background:${accent}">
            <i data-lucide="${icon}"></i>
          </span>
          <div class="transaction-copy">
            <strong>${escapeHtml(title)}</strong>
            <small>${escapeHtml(meta)}</small>
          </div>
        </div>
        <div class="transaction-amount ${item.type}">
          <span>${sign}${money(item.amount)}</span>
          <div class="row-actions">
            <button type="button" data-edit="${escapeHtml(item.id)}" aria-label="Edit transaksi">
              <i data-lucide="pencil"></i>
            </button>
            <button type="button" data-remove="${escapeHtml(item.id)}" aria-label="Hapus transaksi">
              <i data-lucide="trash-2"></i>
            </button>
          </div>
        </div>
      </article>
    `;
  }).join("");
}

function openTransactionModal(transaction) {
  const dialog = document.getElementById("transactionDialog");
  const isEditing = Boolean(transaction);

  document.getElementById("transactionModalTitle").textContent = isEditing ? "Edit transaksi" : "Tambah transaksi";
  document.getElementById("transactionId").value = transaction?.id || "";
  document.getElementById("amountInput").value = transaction ? formatInputNumber(String(transaction.amount)) : "";
  document.getElementById("dateInput").value = transaction?.date || toDateKey(new Date());
  document.getElementById("accountInput").innerHTML = DEFAULT_ACCOUNTS.map((account) => {
    return `<option value="${escapeHtml(account)}">${escapeHtml(account)}</option>`;
  }).join("");
  document.getElementById("accountInput").value = transaction?.account || DEFAULT_ACCOUNTS[0];
  document.getElementById("noteInput").value = transaction?.note || "";
  document.getElementById("deleteTransactionButton").style.visibility = isEditing ? "visible" : "hidden";

  setFormType(transaction?.type || "expense", transaction?.category);
  dialog.showModal();
  refreshIcons();
}

function closeTransactionModal(force = false) {
  if (!force && (state.busy.savingTransaction || state.busy.deletingTransaction)) return;
  document.getElementById("transactionDialog").close();
}

function setFormType(type, selectedCategory) {
  state.formType = type;
  document.querySelectorAll("[data-type-option]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.typeOption === type);
  });

  const categoryInput = document.getElementById("categoryInput");
  categoryInput.innerHTML = DEFAULT_CATEGORIES[type].map((category) => {
    return `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`;
  }).join("");
  categoryInput.value = selectedCategory || DEFAULT_CATEGORIES[type][0];
}

async function saveTransactionFromForm(event) {
  event.preventDefault();
  if (state.busy.savingTransaction) return;

  const id = document.getElementById("transactionId").value;
  const existing = state.transactions.find((item) => item.id === id);
  const amount = numberFromInput(document.getElementById("amountInput").value);

  if (!amount || amount < 1) {
    showToast("Jumlah transaksi belum valid");
    return;
  }

  const now = new Date().toISOString();
  const transaction = {
    id: id || `md-${Date.now()}`,
    date: document.getElementById("dateInput").value,
    type: state.formType,
    category: document.getElementById("categoryInput").value,
    account: document.getElementById("accountInput").value,
    amount,
    note: document.getElementById("noteInput").value.trim(),
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };

  try {
    setBusy("savingTransaction", true, "saveTransactionButton", "Menyimpan...");
    setModalEditingEnabled(false);
    if (state.settings.apiUrl) {
      await apiRequest("upsertTransaction", { transaction });
      await syncFromSheet(false);
    } else {
      upsertLocalTransaction(transaction);
    }

    closeTransactionModal(true);
    showToast("Transaksi tersimpan");
    render();
  } catch (error) {
    showToast(getFriendlySyncError(error));
  } finally {
    setBusy("savingTransaction", false, "saveTransactionButton");
    setModalEditingEnabled(true);
  }
}

async function deleteTransaction(id) {
  if (!id || state.busy.deletingTransaction || state.busy.savingTransaction) return;

  try {
    setBusy("deletingTransaction", true, "deleteTransactionButton", "Menghapus...");
    setModalEditingEnabled(false);
    if (state.settings.apiUrl) {
      await apiRequest("deleteTransaction", { id });
      await syncFromSheet(false);
    } else {
      state.transactions = state.transactions.filter((item) => item.id !== id);
      saveTransactions();
    }

    closeTransactionModal(true);
    showToast("Transaksi dihapus");
    render();
  } catch (error) {
    showToast(getFriendlySyncError(error));
  } finally {
    setBusy("deletingTransaction", false, "deleteTransactionButton");
    setModalEditingEnabled(true);
  }
}

function saveSettingsFromForm(event) {
  event.preventDefault();
  if (state.busy.savingSettings) return;
  setBusy("savingSettings", true, "saveSettingsButton", "Menyimpan...");

  state.settings = {
    ...state.settings,
    userName: document.getElementById("userNameInput").value.trim() || "Owner",
    monthlyBudget: numberFromInput(document.getElementById("monthlyBudgetInput").value),
    apiUrl: document.getElementById("apiUrlInput").value.trim()
  };

  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(state.settings));
  showToast("Setting tersimpan");
  render();
  setBusy("savingSettings", false, "saveSettingsButton");
}

async function setupSpreadsheet() {
  if (state.busy.setup) return;
  try {
    setBusy("setup", true, "setupSheetButton", "Menyiapkan...");
    setSyncStatus("Menyiapkan spreadsheet...");
    await apiRequest("setupSpreadsheet", {});
    showToast("Spreadsheet siap dipakai");
    setSyncStatus("Spreadsheet siap");
  } catch (error) {
    setSyncStatus("Setup gagal");
    showToast(getFriendlySyncError(error));
  } finally {
    setBusy("setup", false, "setupSheetButton");
  }
}

async function syncFromSheet(showSuccess) {
  if (state.busy.syncing) return;
  if (!state.settings.apiUrl) {
    showToast("Isi URL Apps Script dulu");
    setView("settings");
    return;
  }

  try {
    setBusy("syncing", true, showSuccess ? "pullSheetButton" : "syncButton", "Mengambil...");
    setSyncStatus("Sinkronisasi...");
    const data = await apiRequest("listTransactions", {});
    state.transactions = normalizeTransactions(data.transactions || []);
    saveTransactions();
    render();
    setSyncStatus("Tersambung ke spreadsheet");
    if (showSuccess) showToast("Data spreadsheet diperbarui");
  } catch (error) {
    setSyncStatus("Sync gagal");
    if (showSuccess) showToast(getFriendlySyncError(error));
    throw error;
  } finally {
    setBusy("syncing", false, "pullSheetButton");
    setBusy("syncing", false, "syncButton");
  }
}

async function pushLocalToSheet() {
  if (state.busy.pushing) return;
  if (!state.settings.apiUrl) {
    showToast("Isi URL Apps Script dulu");
    setView("settings");
    return;
  }

  try {
    setBusy("pushing", true, "pushSheetButton", "Backup...");
    setSyncStatus("Mengirim data lokal...");
    await apiRequest("replaceTransactions", { transactions: state.transactions });
    await syncFromSheet(false);
    showToast("Data lokal dikirim ke spreadsheet");
  } catch (error) {
    setSyncStatus("Push gagal");
    showToast(getFriendlySyncError(error));
  } finally {
    setBusy("pushing", false, "pushSheetButton");
  }
}

async function apiRequest(action, payload) {
  const url = state.settings.apiUrl;
  if (!url) throw new Error("URL Apps Script belum diisi");

  const response = await fetch(url, {
    method: "POST",
    body: JSON.stringify({ action, payload })
  });

  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("Response Apps Script tidak valid. Pastikan URL berakhir /exec dan deployment bisa diakses publik.");
  }

  if (!response.ok || json.ok === false) {
    throw new Error(json.message || "Request spreadsheet gagal");
  }

  return json.data || {};
}

function upsertLocalTransaction(transaction) {
  const index = state.transactions.findIndex((item) => item.id === transaction.id);
  if (index >= 0) {
    state.transactions[index] = transaction;
  } else {
    state.transactions.unshift(transaction);
  }
  saveTransactions();
}

function setSyncStatus(message) {
  document.getElementById("syncStatus").textContent = message;
}

function setBusy(key, isBusy, buttonId, busyLabel) {
  state.busy[key] = isBusy;

  if (!buttonId) return;
  const button = document.getElementById(buttonId);
  if (!button) return;

  if (isBusy) {
    if (!button.dataset.idleHtml) {
      button.dataset.idleHtml = button.innerHTML;
    }
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.innerHTML = `<span class="button-spinner" aria-hidden="true"></span><span>${escapeHtml(busyLabel || "Memproses...")}</span>`;
  } else {
    button.disabled = false;
    button.removeAttribute("aria-busy");
    if (button.dataset.idleHtml) {
      button.innerHTML = button.dataset.idleHtml;
    }
  }

  refreshIcons();
}

function setModalEditingEnabled(isEnabled) {
  const dialog = document.getElementById("transactionDialog");
  dialog.querySelectorAll("input, select, button").forEach((control) => {
    if (control.id === "closeModalButton") {
      control.disabled = !isEnabled;
      return;
    }

    if (control.id === "saveTransactionButton") return;
    if (control.id === "deleteTransactionButton" && state.busy.deletingTransaction) return;
    control.disabled = !isEnabled;
  });
}

function getFriendlySyncError(error) {
  if (String(error?.message || "").includes("Failed to fetch")) {
    return "Apps Script belum bisa diakses. Deploy Web app dengan Execute as: Me dan Who has access: Anyone.";
  }

  return error.message || "Request spreadsheet gagal";
}

function exportCsv() {
  const rows = [
    ["ID", "Tanggal", "Jenis", "Kategori", "Akun", "Jumlah", "Catatan"],
    ...sortTransactions(state.transactions).map((item) => [
      item.id,
      item.date,
      item.type,
      item.category,
      item.account,
      item.amount,
      item.note || ""
    ])
  ];

  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `my-dompet-${toDateKey(new Date())}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  showToast("CSV dibuat");
}

function getMonthTransactions() {
  return state.transactions.filter((item) => item.date && item.date.startsWith(state.selectedMonth));
}

function calculateTotals(transactions) {
  return transactions.reduce((totals, item) => {
    if (item.type === "income") {
      totals.income += item.amount;
      totals.incomeCount += 1;
    } else {
      totals.expense += item.amount;
      totals.expenseCount += 1;
    }
    totals.balance = totals.income - totals.expense;
    return totals;
  }, { income: 0, expense: 0, balance: 0, incomeCount: 0, expenseCount: 0 });
}

function groupSum(transactions, key) {
  const map = new Map();
  transactions.forEach((item) => {
    const label = item[key] || "Lainnya";
    map.set(label, (map.get(label) || 0) + Number(item.amount || 0));
  });

  return Array.from(map, ([label, total]) => ({ label, total }))
    .sort((a, b) => b.total - a.total);
}

function categoryAccent(category) {
  const index = Math.abs(String(category || "").split("").reduce((sum, char) => sum + char.charCodeAt(0), 0));
  return ACCENTS[index % ACCENTS.length];
}

function sortTransactions(transactions) {
  return [...transactions].sort((a, b) => {
    const byDate = b.date.localeCompare(a.date);
    if (byDate !== 0) return byDate;
    return (b.updatedAt || "").localeCompare(a.updatedAt || "");
  });
}

function loadSettings() {
  const fallback = {
    userName: "Owner",
    monthlyBudget: 5000000,
    apiUrl: "",
    licenseKey: "MD-LIFETIME-DEMO"
  };

  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(STORAGE_KEYS.settings) || "{}") };
  } catch {
    return fallback;
  }
}

function loadTransactions() {
  try {
    return normalizeTransactions(JSON.parse(localStorage.getItem(STORAGE_KEYS.transactions) || "[]"));
  } catch {
    return [];
  }
}

function saveTransactions() {
  localStorage.setItem(STORAGE_KEYS.transactions, JSON.stringify(state.transactions));
}

function normalizeTransactions(transactions) {
  return transactions
    .filter(Boolean)
    .map((item) => ({
      id: String(item.id || `md-${Date.now()}-${Math.random().toString(16).slice(2)}`),
      date: String(item.date || toDateKey(new Date())).slice(0, 10),
      type: item.type === "income" ? "income" : "expense",
      category: item.category || "Lainnya",
      account: item.account || DEFAULT_ACCOUNTS[0],
      amount: Number(item.amount || 0),
      note: item.note || "",
      createdAt: item.createdAt || new Date().toISOString(),
      updatedAt: item.updatedAt || new Date().toISOString()
    }));
}

function createDemoTransactions() {
  const now = new Date();
  const date = (daysAgo) => {
    const value = new Date(now);
    value.setDate(now.getDate() - daysAgo);
    return toDateKey(value);
  };

  return normalizeTransactions([
    { id: "demo-1", date: date(0), type: "expense", category: "Makan", account: "E-Wallet", amount: 58000, note: "Lunch" },
    { id: "demo-2", date: date(1), type: "expense", category: "Transport", account: "Cash", amount: 35000, note: "Bensin" },
    { id: "demo-3", date: date(2), type: "income", category: "Jualan", account: "Bank", amount: 850000, note: "Order online" },
    { id: "demo-4", date: date(3), type: "expense", category: "Belanja", account: "E-Wallet", amount: 240000, note: "Stok rumah" },
    { id: "demo-5", date: date(5), type: "income", category: "Gaji", account: "Bank", amount: 6500000, note: "" },
    { id: "demo-6", date: date(6), type: "expense", category: "Tagihan", account: "Bank", amount: 410000, note: "Internet" },
    { id: "demo-7", date: date(8), type: "expense", category: "Hiburan", account: "Kartu Kredit", amount: 120000, note: "Streaming" }
  ]);
}

function money(value) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function numberFromInput(value) {
  return Number(String(value || "").replace(/[^\d]/g, "")) || 0;
}

function formatInputNumber(value) {
  const number = numberFromInput(value);
  if (!number) return "";
  return new Intl.NumberFormat("id-ID").format(number);
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toMonthKey(date) {
  return toDateKey(date).slice(0, 7);
}

function latestMonthKey(transactions) {
  return sortTransactions(transactions)[0]?.date.slice(0, 7);
}

function monthLabel(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" })
    .format(new Date(year, month - 1, 1));
}

function dateLabel(dateKey) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" })
    .format(new Date(`${dateKey}T00:00:00`));
}

function shortDayLabel(dateKey) {
  return new Intl.DateTimeFormat("id-ID", { weekday: "short" })
    .format(new Date(`${dateKey}T00:00:00`));
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2600);
}

function refreshIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  }
}
