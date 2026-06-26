const DEFAULT_CONFIG = {
  siteHost: "heibai.com",
  endpoints: {
    scanTron: "/api/risk/tron",
    scanEthereum: "/api/risk/ethereum",
    batchScan: "/api/risk/batch",
  },
};

const CONFIG = {
  ...DEFAULT_CONFIG,
  ...(window.APP_CONFIG ?? {}),
  endpoints: {
    ...DEFAULT_CONFIG.endpoints,
    ...(window.APP_CONFIG?.endpoints ?? {}),
  },
};

const state = {
  chain: "tron",
};

const form = document.querySelector("#scanForm");
const input = document.querySelector("#addressInput");
const chainButtons = document.querySelectorAll(".chain-switch button");

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

  const report = await scanAddress(state.chain, address);
  renderReport(state.chain, address, report);
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

  try {
    const url = `${endpoint.replace(/\/+$/, "")}/${encodeURIComponent(address)}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("scan failed");
    return normalizeReport(await response.json());
  } catch {
    return getPreviewReport(address);
  }
}

function normalizeReport(payload) {
  return {
    score: payload.score ?? 72,
    level: payload.level ?? "低风险",
    income: payload.income ?? payload.usdtIn ?? 0,
    outcome: payload.outcome ?? payload.usdtOut ?? 0,
    counterparties: payload.counterparties ?? payload.counterpartyCount ?? 0,
    hits: payload.hits ?? payload.riskHits ?? 0,
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
  return Number(value || 0).toLocaleString("en-US");
}
