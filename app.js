const STORAGE_KEYS = {
  transactions: "my-dompet.transactions",
  settings: "my-dompet.settings"
};

const DEFAULT_CATEGORIES = {
  expense: ["Makan", "Transport", "Belanja", "Tagihan", "Rumah", "Kesehatan", "Hiburan", "Pendidikan", "Cicilan", "Lainnya"],
  income: ["Gaji", "Bonus", "Jualan", "Freelance", "Transfer", "Investasi", "Lainnya"]
};

const DEFAULT_ACCOUNTS = ["Cash", "Bank", "E-Wallet", "Kartu Kredit"];
const LICENSE_TOKEN_PATTERN = /^MD-([A-HJ-NP-Z2-9]{4})-([A-HJ-NP-Z2-9]{4})-([A-HJ-NP-Z2-9]{4})$/;
const LICENSE_TOKEN_SECRET = "MYDOMPET-LIFETIME-2026";
const LICENSE_REGISTRY_SECRET = "MYDOMPET-REGISTRY-2026";
const LICENSE_REGISTRY_URL = "license-registry.json";
const TOKEN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const DEMO_TRANSACTION_LIMIT = 10;

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
  transactionMonth: "all",
  transactionSort: "latest",
  formType: "expense",
  busy: {
    savingTransaction: false,
    deletingTransaction: false,
    savingSettings: false,
    activatingLicense: false,
    syncing: false
  }
};

let toastTimer;

document.addEventListener("DOMContentLoaded", init);

function init() {
  const setup = applySetupParamsFromUrl();
  state.transactions = loadTransactions();

  state.selectedMonth = latestMonthKey(state.transactions) || toMonthKey(new Date());

  bindEvents();
  render();
  registerServiceWorker();

  if (setup.resetRemote) {
    resetFreshSetupData();
  } else if (state.settings.apiUrl) {
    syncFromSheet(false).catch(() => {
      setSyncStatus("Offline");
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
      return;
    }

    const removeCategoryButton = event.target.closest("[data-remove-category]");
    if (removeCategoryButton) {
      removeCategory(removeCategoryButton.dataset.categoryType, removeCategoryButton.dataset.removeCategory);
      return;
    }

    const sortButton = event.target.closest("[data-sort-option]");
    if (sortButton) {
      state.transactionSort = sortButton.dataset.sortOption;
      renderTransactionsView();
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

  document.getElementById("transactionMonthFilter").addEventListener("change", (event) => {
    state.transactionMonth = event.target.value;
    renderTransactionsView();
  });

  document.getElementById("settingsForm").addEventListener("submit", saveSettingsFromForm);
  document.getElementById("licenseForm").addEventListener("submit", (event) => {
    activateLicenseFromForm(event, "licenseKeyInput");
  });
  document.getElementById("activationForm").addEventListener("submit", (event) => {
    activateLicenseFromForm(event, "activationTokenInput");
  });
  document.getElementById("closeActivationButton").addEventListener("click", closeActivationDialog);
  ["licenseKeyInput", "activationTokenInput"].forEach((id) => {
    document.getElementById(id).addEventListener("input", (event) => {
      event.target.value = formatLicenseToken(event.target.value);
    });
  });
  document.querySelectorAll("[data-category-form]").forEach((form) => {
    form.addEventListener("submit", addCategoryFromForm);
  });
  document.getElementById("syncButton").addEventListener("click", () => syncFromSheet(true));
  document.getElementById("exportExcelButton").addEventListener("click", exportExcel);
}

function render() {
  document.getElementById("todayLabel").textContent = new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long"
  }).format(new Date());

  document.getElementById("screenTitle").textContent = VIEW_TITLES[state.view];
  renderMonthSelector();
  renderTransactionMonthFilter();
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
  const todayTotals = calculateTotals(getTodayTransactions());
  const allTotals = calculateTotals(state.transactions);
  const monthTotals = calculateTotals(monthTransactions);
  const budget = Number(state.settings.monthlyBudget) || 0;
  const budgetRatio = budget > 0 ? Math.min(999, Math.round((monthTotals.expense / budget) * 100)) : 0;

  document.getElementById("balanceAmount").textContent = compactMoney(allTotals.balance);
  document.getElementById("summaryPeriodLabel").textContent = monthLabel(state.selectedMonth);
  document.getElementById("incomeAmount").textContent = compactMoney(monthTotals.income);
  document.getElementById("expenseAmount").textContent = compactMoney(monthTotals.expense);
  document.getElementById("budgetPercent").textContent = `${budgetRatio}%`;
  document.getElementById("budgetAmount").textContent = `${compactMoney(monthTotals.expense)} / ${compactMoney(budget)}`;
  document.getElementById("incomeCount").textContent = `${monthTotals.incomeCount} transaksi`;
  document.getElementById("expenseCount").textContent = `${monthTotals.expenseCount} transaksi`;
  document.getElementById("todayIncomeAmount").textContent = compactMoney(todayTotals.income);
  document.getElementById("todayExpenseAmount").textContent = compactMoney(todayTotals.expense);
  document.getElementById("todayIncomeCount").textContent = `${todayTotals.incomeCount} transaksi`;
  document.getElementById("todayExpenseCount").textContent = `${todayTotals.expenseCount} transaksi`;
  document.getElementById("monthCashflow").textContent = `Bulan ini ${compactMoney(monthTotals.balance)}`;
  document.getElementById("syncStatus").textContent = state.settings.apiUrl
    ? "Online"
    : "Lokal";

  renderWeeklyChart(monthTransactions);
  renderMonthlyExpenseChart();
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

function renderTransactionMonthFilter() {
  const selector = document.getElementById("transactionMonthFilter");
  const months = Array.from(new Set(state.transactions.map((item) => item.date?.slice(0, 7))))
    .filter(Boolean)
    .sort()
    .reverse();

  selector.innerHTML = [
    `<option value="all">Semua bulan</option>`,
    ...months.map((month) => `<option value="${escapeHtml(month)}">${monthLabel(month)}</option>`)
  ].join("");

  if (state.transactionMonth !== "all" && !months.includes(state.transactionMonth)) {
    state.transactionMonth = "all";
  }

  selector.value = state.transactionMonth;
}

function renderSortOptions() {
  document.querySelectorAll("[data-sort-option]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.sortOption === state.transactionSort);
  });
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

function renderMonthlyExpenseChart() {
  const chart = document.getElementById("monthlyExpenseChart");
  const months = getRecentMonthKeys(4);
  const data = months.map((month) => {
    const total = state.transactions
      .filter((item) => item.type === "expense" && item.date && item.date.startsWith(month))
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    return { month, total };
  });
  const max = Math.max(...data.map((item) => item.total), 1);

  chart.innerHTML = data.map((item, index) => {
    const height = Math.max(item.total > 0 ? 18 : 8, Math.round((item.total / max) * 100));
    const accent = ACCENTS[(index + 1) % ACCENTS.length];
    return `
      <div class="chart-month" title="${escapeHtml(`${monthLabel(item.month)} ${money(item.total)}`)}">
        <div class="bar-track month-bar-track">
          <div class="bar-fill month-bar-fill" style="height:${height}%; background:${accent}"></div>
        </div>
        <div class="month-chart-label">
          <strong>${shortMonthName(item.month)}</strong>
          <small>${compactMoney(item.total)}</small>
        </div>
      </div>
    `;
  }).join("");
}

function renderTransactionsView() {
  const list = document.getElementById("transactionList");
  const filtered = state.transactions.filter((item) => {
    const matchesType = state.typeFilter === "all" || item.type === state.typeFilter;
    const matchesMonth = state.transactionMonth === "all" || item.date?.startsWith(state.transactionMonth);
    const haystack = `${transactionTitle(item)} ${item.category} ${item.account} ${dateLabel(item.date)} ${money(item.amount)}`.toLowerCase();
    return matchesType && matchesMonth && (!state.search || haystack.includes(state.search));
  });

  renderSortOptions();
  renderTransactionRows(list, sortTransactionList(filtered, state.transactionSort), {
    groupByMonth: state.transactionSort === "month"
  });
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
  document.getElementById("licenseKeyInput").value = state.settings.licenseKey || "";
  document.getElementById("databaseSettingPanel").hidden = !isAdminMode();
  renderLicenseState();
  renderDemoUsageState();
  renderCategoryManager();
}

function renderLicenseState() {
  const isActive = isLicenseActive();
  const status = document.getElementById("licenseStatusPill");
  const label = document.getElementById("licenseKeyLabel");

  status.textContent = isActive ? "Aktif" : "Belum aktif";
  status.classList.toggle("is-inactive", !isActive);
  label.textContent = state.settings.licenseKey || "Belum ada token";
}

function renderDemoUsageState() {
  const used = getDemoEntriesUsed();
  const remaining = getDemoEntriesRemaining();
  const text = isLicenseActive()
    ? "Akses lifetime aktif"
    : `Demo gratis ${used}/${DEMO_TRANSACTION_LIMIT} input terpakai, sisa ${remaining}`;

  document.getElementById("trialStatusLabel").textContent = text;
  document.getElementById("activationTrialLabel").textContent = text;
}

async function activateLicenseFromForm(event, inputId) {
  event.preventDefault();
  if (state.busy.activatingLicense) return;

  const input = document.getElementById(inputId);
  const buttonId = inputId === "licenseKeyInput" ? "activateLicenseButton" : "activateDialogButton";
  const token = formatLicenseToken(input.value);
  input.value = token;

  if (!isLicenseTokenValid(token)) {
    showToast("Token belum valid. Pakai token dari seller.");
    input.focus();
    return;
  }

  setBusy("activatingLicense", true, buttonId, "Aktivasi...");

  try {
    const registryData = await resolveLicenseRegistry(token);
    const nextApiUrl = registryData?.apiUrl || state.settings.apiUrl;
    const apiChanged = Boolean(registryData?.apiUrl && registryData.apiUrl !== state.settings.apiUrl);

    state.settings = {
      ...state.settings,
      apiUrl: nextApiUrl,
      userName: registryData?.owner || state.settings.userName,
      monthlyBudget: registryData?.budget ? numberFromInput(registryData.budget) : state.settings.monthlyBudget,
      licenseKey: token,
      activatedAt: state.settings.activatedAt || new Date().toISOString()
    };

    persistSettings();

    if (apiChanged) {
      state.transactions = [];
      saveTransactions();
      render();
      try {
        await syncFromSheet(false);
      } catch {
        setSyncStatus("Offline");
      }
    } else {
      renderSettings();
    }

    closeActivationDialog();
    showToast(registryData?.apiUrl ? "Token aktif, spreadsheet tersambung" : "Token lifetime aktif");
  } finally {
    setBusy("activatingLicense", false, buttonId);
  }
}

function openActivationDialog() {
  const dialog = document.getElementById("activationDialog");
  const input = document.getElementById("activationTokenInput");

  if (isLicenseActive() || dialog.open) return;
  input.value = state.settings.licenseKey || "";
  renderDemoUsageState();
  dialog.showModal();
  input.focus();
}

function closeActivationDialog() {
  const dialog = document.getElementById("activationDialog");
  if (dialog.open) dialog.close();
}

function renderCategoryManager() {
  ["expense", "income"].forEach((type) => {
    const categories = getCategories(type);
    const list = document.getElementById(`${type}CategoryList`);
    const count = document.getElementById(`${type}CategoryCount`);

    count.textContent = `${categories.length} kategori`;
    list.innerHTML = categories.map((category) => `
      <button class="category-chip" type="button" data-category-type="${type}" data-remove-category="${escapeHtml(category)}" aria-label="Hapus kategori ${escapeHtml(category)}">
        <span>${escapeHtml(category)}</span>
        <i data-lucide="x"></i>
      </button>
    `).join("");
  });
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

function renderTransactionRows(container, transactions, options = {}) {
  if (transactions.length === 0) {
    container.innerHTML = `<div class="empty-state">Belum ada transaksi</div>`;
    return;
  }

  let currentMonth = "";
  container.innerHTML = transactions.map((item) => {
    const sign = item.type === "income" ? "+" : "-";
    const icon = item.type === "income" ? "arrow-down-left" : "arrow-up-right";
    const accent = item.type === "income" ? "#41e3bd" : categoryAccent(item.category);
    const title = transactionTitle(item);
    const meta = item.note
      ? `${item.category} · ${item.account} · ${dateLabel(item.date)}`
      : `${item.account} · ${dateLabel(item.date)}`;
    const month = item.date?.slice(0, 7) || "";
    const divider = options.groupByMonth && month !== currentMonth
      ? `<div class="transaction-month-divider">${escapeHtml(monthLabel(month))}</div>`
      : "";

    currentMonth = month || currentMonth;

    return `
      ${divider}
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
  let categories = getCategories(type);
  if (selectedCategory && !categories.some((category) => category.toLowerCase() === selectedCategory.toLowerCase())) {
    categories = [selectedCategory, ...categories];
  }

  categoryInput.innerHTML = categories.map((category) => {
    return `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`;
  }).join("");
  categoryInput.value = selectedCategory || categories[0];
}

async function saveTransactionFromForm(event) {
  event.preventDefault();
  if (state.busy.savingTransaction) return;

  const id = document.getElementById("transactionId").value;
  const existing = state.transactions.find((item) => item.id === id);
  const isCreating = !existing;
  const amount = numberFromInput(document.getElementById("amountInput").value);

  if (!amount || amount < 1) {
    showToast("Jumlah transaksi belum valid");
    return;
  }

  if (isCreating && !isLicenseActive() && getDemoEntriesRemaining() <= 0) {
    showToast("Demo gratis sudah habis. Masukkan token untuk lanjut.");
    openActivationDialog();
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

    if (isCreating && !isLicenseActive()) recordDemoEntry();
    closeTransactionModal(true);
    showToast(existing ? "Transaksi diperbarui" : "Transaksi tersimpan");
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

async function saveSettingsFromForm(event) {
  event.preventDefault();
  if (state.busy.savingSettings) return;
  setBusy("savingSettings", true, "saveSettingsButton", "Menyimpan...");

  const adminMode = isAdminMode();
  const previousApiUrl = state.settings.apiUrl || "";
  const nextApiUrl = adminMode
    ? document.getElementById("apiUrlInput").value.trim()
    : previousApiUrl;
  const apiChanged = previousApiUrl !== nextApiUrl;
  const resetDatabase = adminMode && apiChanged && nextApiUrl && document.getElementById("resetDatabaseOnSave").checked;

  state.settings = {
    ...state.settings,
    userName: document.getElementById("userNameInput").value.trim() || "Owner",
    monthlyBudget: numberFromInput(document.getElementById("monthlyBudgetInput").value),
    apiUrl: nextApiUrl
  };

  persistSettings();

  try {
    if (apiChanged) {
      state.transactions = [];
      saveTransactions();
      render();

      if (resetDatabase) {
        setSyncStatus("Menyiapkan...");
        await apiRequest("replaceTransactions", { transactions: [] });
        setSyncStatus("Online");
        showToast("Database baru siap kosong");
      } else if (nextApiUrl) {
        await syncFromSheet(false);
        showToast("Database spreadsheet tersambung");
      } else {
        setSyncStatus("Lokal");
        showToast("Mode lokal aktif");
      }
    } else {
      showToast("Setting tersimpan");
      render();
    }
  } catch (error) {
    setSyncStatus("Setup perlu dicek");
    showToast(getFriendlySyncError(error));
  } finally {
    setBusy("savingSettings", false, "saveSettingsButton");
  }
}

function applySetupParamsFromUrl() {
  const url = new URL(window.location.href);
  const params = url.searchParams;
  const apiUrl = params.get("api") || params.get("apiUrl") || params.get("database");
  const tokenParam = params.get("token") || params.get("license");
  const owner = params.get("owner") || params.get("name");
  const budget = params.get("budget");
  const hasSetupData = Boolean(apiUrl || tokenParam);
  const freshSetup = hasTruthySetupParam(params, ["fresh", "reset", "clear"]);
  let changed = false;

  if (apiUrl) {
    state.settings.apiUrl = apiUrl.trim();
    changed = true;
  }

  if (tokenParam) {
    const token = formatLicenseToken(tokenParam);
    if (isLicenseTokenValid(token)) {
      state.settings.licenseKey = token;
      state.settings.activatedAt = state.settings.activatedAt || new Date().toISOString();
      changed = true;
    }
  }

  if (owner) {
    state.settings.userName = owner.trim() || state.settings.userName;
    changed = true;
  }

  if (budget) {
    state.settings.monthlyBudget = numberFromInput(budget);
    changed = true;
  }

  if (changed) {
    persistSettings();
    if (hasSetupData) localStorage.removeItem(STORAGE_KEYS.transactions);
  }

  const shouldResetRemote = Boolean(apiUrl && freshSetup && isLicenseActive());
  const setupKeys = ["api", "apiUrl", "database", "token", "license", "owner", "name", "budget", "fresh", "reset", "clear"];
  if (setupKeys.some((key) => params.has(key)) && window.history?.replaceState) {
    setupKeys.forEach((key) => params.delete(key));
    const query = params.toString();
    window.history.replaceState({}, "", `${url.pathname}${query ? `?${query}` : ""}${url.hash}`);
  }

  return { resetRemote: shouldResetRemote };
}

function hasTruthySetupParam(params, keys) {
  return keys.some((key) => {
    const value = params.get(key);
    if (value === null) return false;
    return value === "" || ["1", "true", "yes", "fresh"].includes(value.toLowerCase());
  });
}

function isAdminMode() {
  return hasTruthySetupParam(new URLSearchParams(window.location.search), ["admin"]);
}

async function resetFreshSetupData() {
  try {
    setSyncStatus("Menyiapkan...");
    await apiRequest("replaceTransactions", { transactions: [] });
    state.transactions = [];
    saveTransactions();
    render();
    setSyncStatus("Online");
    showToast("Data client baru siap kosong");
  } catch (error) {
    setSyncStatus("Setup perlu dicek");
    showToast(getFriendlySyncError(error));
  }
}

function addCategoryFromForm(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const type = form.dataset.categoryType;
  const input = form.querySelector("input");
  const category = normalizeCategoryName(input.value);
  const categories = getCategories(type);

  if (!category) {
    showToast("Nama kategori belum diisi");
    return;
  }

  if (categories.some((item) => item.toLowerCase() === category.toLowerCase())) {
    showToast("Kategori sudah ada");
    return;
  }

  state.settings.categories = {
    ...state.settings.categories,
    [type]: [...categories, category]
  };

  persistSettings();
  input.value = "";
  renderCategoryManager();
  setFormType(state.formType);
  refreshIcons();
  showToast("Kategori ditambahkan");
}

function removeCategory(type, category) {
  const categories = getCategories(type);

  if (categories.length <= 1) {
    showToast("Minimal satu kategori");
    return;
  }

  state.settings.categories = {
    ...state.settings.categories,
    [type]: categories.filter((item) => item !== category)
  };

  persistSettings();
  renderCategoryManager();
  setFormType(state.formType);
  refreshIcons();
  showToast("Kategori dihapus");
}

async function syncFromSheet(showSuccess) {
  if (state.busy.syncing) return;
  if (!state.settings.apiUrl) {
    showToast("Database belum disiapkan");
    return;
  }

  try {
    setBusy("syncing", true, "syncButton", "Mengambil...");
    setSyncStatus("Sync...");
    const data = await apiRequest("listTransactions", {});
    state.transactions = normalizeTransactions(data.transactions || []);
    saveTransactions();
    render();
    setSyncStatus("Online");
    if (showSuccess) showToast("Data spreadsheet diperbarui");
  } catch (error) {
    setSyncStatus("Sync gagal");
    if (showSuccess) showToast(getFriendlySyncError(error));
    throw error;
  } finally {
    setBusy("syncing", false, "syncButton");
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

function exportExcel() {
  const rows = [
    ["ID", "Tanggal", "Jenis", "Kategori", "Akun", "Jumlah", "Catatan", "Dibuat", "Diupdate"],
    ...sortTransactions(state.transactions).map((item) => [
      item.id,
      item.date,
      item.type === "income" ? "Pemasukan" : "Pengeluaran",
      item.category,
      item.account,
      item.amount,
      item.note || "",
      item.createdAt || "",
      item.updatedAt || ""
    ])
  ];

  const blob = createXlsxBlob(rows);
  downloadBlob(blob, `my-dompet-${toDateKey(new Date())}.xlsx`);
  showToast("Excel dibuat");
}

function createXlsxBlob(rows) {
  const files = [
    {
      name: "[Content_Types].xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`
    },
    {
      name: "_rels/.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`
    },
    {
      name: "xl/workbook.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Transaksi" sheetId="1" r:id="rId1"/></sheets>
</workbook>`
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`
    },
    {
      name: "xl/styles.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills count="1"><fill><patternFill patternType="none"/></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`
    },
    {
      name: "xl/worksheets/sheet1.xml",
      content: buildWorksheetXml(rows)
    }
  ];

  return createZipBlob(files);
}

function buildWorksheetXml(rows) {
  const widths = [24, 12, 14, 18, 16, 14, 28, 22, 22];
  const columns = widths.map((width, index) => {
    const column = index + 1;
    return `<col min="${column}" max="${column}" width="${width}" customWidth="1"/>`;
  }).join("");
  const sheetRows = rows.map((row, rowIndex) => {
    const rowNumber = rowIndex + 1;
    const cells = row.map((cell, columnIndex) => excelCellXml(cell, rowNumber, columnIndex + 1)).join("");
    return `<row r="${rowNumber}">${cells}</row>`;
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <cols>${columns}</cols>
  <sheetData>${sheetRows}</sheetData>
</worksheet>`;
}

function excelCellXml(value, rowNumber, columnNumber) {
  const reference = `${excelColumnName(columnNumber)}${rowNumber}`;
  if (typeof value === "number" && Number.isFinite(value)) {
    return `<c r="${reference}"><v>${value}</v></c>`;
  }

  const text = String(value ?? "");
  const preserveSpace = /^\s|\s$/.test(text) ? ` xml:space="preserve"` : "";
  return `<c r="${reference}" t="inlineStr"><is><t${preserveSpace}>${xmlCell(text)}</t></is></c>`;
}

function excelColumnName(index) {
  let name = "";
  let value = index;

  while (value > 0) {
    value -= 1;
    name = String.fromCharCode(65 + (value % 26)) + name;
    value = Math.floor(value / 26);
  }

  return name;
}

function createZipBlob(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  const timestamp = dosDateTime(new Date());
  let offset = 0;

  files.forEach((file) => {
    const nameBytes = encoder.encode(file.name);
    const dataBytes = encoder.encode(file.content);
    const checksum = crc32(dataBytes);
    const localHeader = createLocalZipHeader(nameBytes, dataBytes, checksum, timestamp);
    const centralHeader = createCentralZipHeader(nameBytes, dataBytes, checksum, timestamp, offset);

    localParts.push(localHeader, dataBytes);
    centralParts.push(centralHeader);
    offset += localHeader.length + dataBytes.length;
  });

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const endRecord = createEndZipRecord(files.length, centralSize, offset);
  return new Blob([...localParts, ...centralParts, endRecord], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
}

function createLocalZipHeader(nameBytes, dataBytes, checksum, timestamp) {
  const header = new Uint8Array(30 + nameBytes.length);
  const view = new DataView(header.buffer);

  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, timestamp.time, true);
  view.setUint16(12, timestamp.date, true);
  view.setUint32(14, checksum, true);
  view.setUint32(18, dataBytes.length, true);
  view.setUint32(22, dataBytes.length, true);
  view.setUint16(26, nameBytes.length, true);
  view.setUint16(28, 0, true);
  header.set(nameBytes, 30);

  return header;
}

function createCentralZipHeader(nameBytes, dataBytes, checksum, timestamp, offset) {
  const header = new Uint8Array(46 + nameBytes.length);
  const view = new DataView(header.buffer);

  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, timestamp.time, true);
  view.setUint16(14, timestamp.date, true);
  view.setUint32(16, checksum, true);
  view.setUint32(20, dataBytes.length, true);
  view.setUint32(24, dataBytes.length, true);
  view.setUint16(28, nameBytes.length, true);
  view.setUint16(30, 0, true);
  view.setUint16(32, 0, true);
  view.setUint16(34, 0, true);
  view.setUint16(36, 0, true);
  view.setUint32(38, 0, true);
  view.setUint32(42, offset, true);
  header.set(nameBytes, 46);

  return header;
}

function createEndZipRecord(fileCount, centralSize, centralOffset) {
  const record = new Uint8Array(22);
  const view = new DataView(record.buffer);

  view.setUint32(0, 0x06054b50, true);
  view.setUint16(4, 0, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, fileCount, true);
  view.setUint16(10, fileCount, true);
  view.setUint32(12, centralSize, true);
  view.setUint32(16, centralOffset, true);
  view.setUint16(20, 0, true);

  return record;
}

function dosDateTime(date) {
  const year = Math.max(date.getFullYear(), 1980);
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  };
}

let crcTable;

function crc32(bytes) {
  if (!crcTable) {
    crcTable = Array.from({ length: 256 }, (_, index) => {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) {
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      }
      return value >>> 0;
    });
  }

  let crc = 0xffffffff;
  bytes.forEach((byte) => {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  });

  return (crc ^ 0xffffffff) >>> 0;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 250);
}

function getMonthTransactions() {
  return state.transactions.filter((item) => item.date && item.date.startsWith(state.selectedMonth));
}

function getTodayTransactions() {
  const today = toDateKey(new Date());
  return state.transactions.filter((item) => item.date === today);
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
  return [...transactions].sort(compareLatest);
}

function sortTransactionList(transactions, mode) {
  if (mode === "alphabetical") {
    return [...transactions].sort((a, b) => {
      const byTitle = transactionTitle(a).localeCompare(transactionTitle(b), "id", { sensitivity: "base" });
      return byTitle || compareLatest(a, b);
    });
  }

  if (mode === "amount") {
    return [...transactions].sort((a, b) => {
      const byType = Number(b.type === "expense") - Number(a.type === "expense");
      if (byType !== 0) return byType;
      const byAmount = Number(b.amount || 0) - Number(a.amount || 0);
      if (byAmount !== 0) return byAmount;
      return b.date.localeCompare(a.date);
    });
  }

  if (mode === "month") {
    return [...transactions].sort((a, b) => {
      const byMonth = b.date.slice(0, 7).localeCompare(a.date.slice(0, 7));
      if (byMonth !== 0) return byMonth;
      const byDate = b.date.localeCompare(a.date);
      if (byDate !== 0) return byDate;
      return transactionTitle(a).localeCompare(transactionTitle(b), "id", { sensitivity: "base" });
    });
  }

  return sortTransactions(transactions);
}

function compareLatest(a, b) {
  const byDate = b.date.localeCompare(a.date);
  if (byDate !== 0) return byDate;
  return (b.updatedAt || "").localeCompare(a.updatedAt || "");
}

function transactionTitle(transaction) {
  return transaction.note || transaction.category || "Transaksi";
}

function isLicenseActive() {
  return isLicenseTokenValid(state.settings.licenseKey);
}

function isLicenseTokenValid(token) {
  const value = normalizeLicenseToken(token);
  const match = value.match(LICENSE_TOKEN_PATTERN);
  if (!match) return false;

  const payload = `${match[1]}${match[2]}`;
  return match[3] === licenseChecksum(payload);
}

async function resolveLicenseRegistry(token) {
  if (!globalThis.crypto?.subtle) return null;

  try {
    const response = await fetch(`${LICENSE_REGISTRY_URL}?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) return null;

    const registry = await response.json();
    const entry = registry.tokens?.[await registryLookupKey(token)];
    if (!entry?.iv || !entry?.data) return null;

    const key = await registryCryptoKey(token);
    const decrypted = await globalThis.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64UrlToBytes(entry.iv) },
      key,
      base64UrlToBytes(entry.data)
    );

    return JSON.parse(new TextDecoder().decode(decrypted));
  } catch {
    return null;
  }
}

function normalizeLicenseToken(value) {
  return String(value || "").trim().toUpperCase();
}

function formatLicenseToken(value) {
  const raw = normalizeLicenseToken(value).replace(/[^A-Z0-9]/g, "");
  const body = (raw.startsWith("MD") ? raw.slice(2) : raw).slice(0, 12);
  const chunks = body.match(/.{1,4}/g) || [];

  if (!body) return raw.startsWith("MD") ? "MD-" : "";
  return ["MD", ...chunks].join("-");
}

function licenseChecksum(payload) {
  let hash = 2166136261;
  const source = `${LICENSE_TOKEN_SECRET}:${payload}`;

  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }

  let value = hash;
  let checksum = "";
  for (let index = 0; index < 4; index += 1) {
    checksum += TOKEN_ALPHABET[value % TOKEN_ALPHABET.length];
    value = Math.floor(value / TOKEN_ALPHABET.length);
  }

  return checksum;
}

async function registryLookupKey(token) {
  return bytesToBase64Url(await digestBytes(`lookup:${LICENSE_REGISTRY_SECRET}:${normalizeLicenseToken(token)}`));
}

async function registryCryptoKey(token) {
  const raw = await digestBytes(`key:${LICENSE_REGISTRY_SECRET}:${normalizeLicenseToken(token)}`);
  return globalThis.crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
}

async function digestBytes(text) {
  return new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

function bytesToBase64Url(bytes) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlToBytes(value) {
  const base64 = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function getDemoEntriesUsed() {
  return Math.min(DEMO_TRANSACTION_LIMIT, Math.max(0, Number(state.settings.demoEntriesUsed || 0)));
}

function getDemoEntriesRemaining() {
  return Math.max(0, DEMO_TRANSACTION_LIMIT - getDemoEntriesUsed());
}

function recordDemoEntry() {
  state.settings = {
    ...state.settings,
    demoEntriesUsed: Math.min(DEMO_TRANSACTION_LIMIT, getDemoEntriesUsed() + 1)
  };
  persistSettings();
  renderDemoUsageState();
}

function getCategories(type) {
  return normalizeCategoryList(state.settings.categories?.[type], DEFAULT_CATEGORIES[type]);
}

function cloneDefaultCategories() {
  return {
    expense: [...DEFAULT_CATEGORIES.expense],
    income: [...DEFAULT_CATEGORIES.income]
  };
}

function normalizeCategories(categories) {
  return {
    expense: normalizeCategoryList(categories?.expense, DEFAULT_CATEGORIES.expense),
    income: normalizeCategoryList(categories?.income, DEFAULT_CATEGORIES.income)
  };
}

function normalizeCategoryList(list, fallback) {
  const source = Array.isArray(list) && list.length > 0 ? list : fallback;
  const normalized = [];

  source.forEach((item) => {
    const category = normalizeCategoryName(item);
    if (category && !normalized.some((current) => current.toLowerCase() === category.toLowerCase())) {
      normalized.push(category);
    }
  });

  return normalized.length > 0 ? normalized : ["Lainnya"];
}

function normalizeCategoryName(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function persistSettings() {
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(state.settings));
}

function loadSettings() {
  const fallback = {
    userName: "Owner",
    monthlyBudget: 5000000,
    apiUrl: "",
    licenseKey: "",
    activatedAt: "",
    demoEntriesUsed: 0,
    categories: cloneDefaultCategories()
  };

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.settings) || "{}");
    return { ...fallback, ...saved, categories: normalizeCategories(saved.categories) };
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

function money(value) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function compactMoney(value) {
  const amount = Number(value || 0);
  const sign = amount < 0 ? "-" : "";
  const absolute = Math.abs(amount);

  if (absolute >= 1000000000) return `${sign}Rp${compactDecimal(absolute / 1000000000)} M`;
  if (absolute >= 1000000) return `${sign}Rp${compactDecimal(absolute / 1000000)} jt`;
  if (absolute >= 1000) return `${sign}Rp${compactDecimal(absolute / 1000)} rb`;
  return money(amount);
}

function compactDecimal(value) {
  return new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: value >= 10 ? 0 : 1
  }).format(value);
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

function getRecentMonthKeys(count) {
  const now = new Date();
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (count - 1 - index), 1);
    return toMonthKey(date);
  });
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

function shortMonthName(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Intl.DateTimeFormat("id-ID", { month: "short" })
    .format(new Date(year, month - 1, 1));
}

function shortDayLabel(dateKey) {
  return new Intl.DateTimeFormat("id-ID", { weekday: "short" })
    .format(new Date(`${dateKey}T00:00:00`));
}

function xmlCell(value) {
  const text = String(value ?? "");
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
