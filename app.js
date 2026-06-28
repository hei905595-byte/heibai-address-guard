const DEFAULT_CONFIG = {
  siteHost: "heibai.com",
  endpoints: {
    scanTron: "/api/risk/tron",
    scanEthereum: "/api/risk/ethereum",
    batchScan: "/api/risk/batch",
  },
  navigation: {
    points: "/points",
    query: "/query",
    guard: "/guard",
  },
};

const CONFIG = {
  ...DEFAULT_CONFIG,
  ...(window.APP_CONFIG ?? {}),
  endpoints: {
    ...DEFAULT_CONFIG.endpoints,
    ...(window.APP_CONFIG?.endpoints ?? {}),
  },
  navigation: {
    ...DEFAULT_CONFIG.navigation,
    ...(window.APP_CONFIG?.navigation ?? {}),
  },
};

const state = {
  chain: "tron",
};

const form = document.querySelector("#scanForm");
const input = document.querySelector("#addressInput");
const status = document.querySelector("#scanStatus");
const reportPanel = document.querySelector("#riskReport");
const chainButtons = document.querySelectorAll(".chain-switch button");

document.querySelectorAll("[data-app-link]").forEach((link) => {
  link.href = CONFIG.navigation[link.dataset.appLink];
});

chainButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.chain = button.dataset.chain;
    chainButtons.forEach((item) => item.classList.toggle("active", item === button));
    input.placeholder =
      state.chain === "tron" ? "请输入 TRX 地址" : "请输入 ETH 地址";
  });
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const address = input.value.trim();
  if (!address) return;

  status.textContent = "正在检测，请稍候…";
  reportPanel.hidden = true;
  try {
    const report = await scanAddress(state.chain, address);
    renderReport(state.chain, address, report);
    reportPanel.hidden = false;
    status.textContent = report.disclaimer || "检测完成；结果来自正式风险接口。";
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : "检测失败，请稍后重试。";
  }
});

document.querySelector("#batchButton").addEventListener("click", () => {
  alert("批量检测接口已预留，后端接入后启用。");
});

document.querySelector("#shareButton").addEventListener("click", () => {
  alert("报告链接功能已预留，后端接入后生成可分享报告。");
});

async function scanAddress(chain, address) {
  const endpoint =
    chain === "tron" ? CONFIG.endpoints.scanTron : CONFIG.endpoints.scanEthereum;

  if (window.location.protocol === "file:") {
    return getPreviewReport(address);
  }

  const url = `${endpoint.replace(/\/+$/, "")}/${encodeURIComponent(address)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`风险接口暂不可用（${response.status}），未生成模拟报告。`);
  return normalizeReport(await response.json());
}

function normalizeReport(payload) {
  const score = Number(payload.score);
  if (!Number.isFinite(score) || score < 0 || score > 100 || !payload.level) {
    throw new Error("风险接口返回了不完整的数据，未展示报告。");
  }
  return {
    score,
    level: payload.level,
    income: payload.income ?? payload.usdtIn ?? 0,
    outcome: payload.outcome ?? payload.usdtOut ?? 0,
    counterparties: payload.counterparties ?? payload.counterpartyCount ?? 0,
    hits: payload.hits ?? payload.riskHits ?? 0,
    disclaimer: payload.disclaimer || "风险结果仅供辅助判断，不构成资金安全保证。",
  };
}

function getPreviewReport(address) {
  const seed = address.split("").reduce((total, char) => total + char.charCodeAt(0), 0);
  const hits = seed % 5 === 0 ? 2 : seed % 7 === 0 ? 1 : 0;
  const score = hits === 0 ? 82 : hits === 1 ? 64 : 38;
  return {
    score,
    level: hits === 0 ? "低风险" : hits === 1 ? "需复核" : "高风险",
    income: 42000 + (seed % 90000),
    outcome: 18000 + (seed % 70000),
    counterparties: 12 + (seed % 80),
    hits,
  };
}

function renderReport(chain, address, report) {
  const levelClass =
    report.score >= 75 ? "safe" : report.score >= 55 ? "warn" : "danger";

  const ring = document.querySelector("#scoreRing");
  ring.style.setProperty("--score", report.score);
  document.querySelector("#scoreValue").textContent = report.score;

  const level = document.querySelector("#riskLevel");
  level.className = `status-pill ${levelClass}`;
  level.textContent = report.level;

  document.querySelector("#reportTitle").textContent =
    chain === "tron" ? "TRON 地址安全报告" : "Ethereum 地址安全报告";
  document.querySelector("#reportAddress").textContent = address;
  document.querySelector("#incomeValue").textContent = formatNumber(report.income);
  document.querySelector("#outcomeValue").textContent = formatNumber(report.outcome);
  document.querySelector("#counterpartyValue").textContent = formatNumber(
    report.counterparties,
  );
  document.querySelector("#hitValue").textContent = formatNumber(report.hits);
}

function formatNumber(value) {
  if (value === null || value === undefined || value === "") return "未采集";
  return Number(value).toLocaleString("en-US");
}
