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
  lastReport: null,
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

const batchDialog = document.querySelector("#batchDialog");
const batchForm = document.querySelector("#batchForm");
const batchAddresses = document.querySelector("#batchAddresses");
const batchStatus = document.querySelector("#batchStatus");
const batchResults = document.querySelector("#batchResults");

document.querySelector("#batchButton").addEventListener("click", () => batchDialog.showModal());
document.querySelector("#batchClose").addEventListener("click", () => batchDialog.close());
document.querySelector("#batchCancel").addEventListener("click", () => batchDialog.close());

batchForm.addEventListener("submit", async event => {
  event.preventDefault();
  const addresses = parseBatchInput(batchAddresses.value);
  if (!addresses.length) { batchStatus.textContent = "请至少输入一个地址。"; return; }
  if (addresses.length > 20) { batchStatus.textContent = "每次最多检测 20 个地址。"; return; }
  batchStatus.textContent = `正在检测 ${addresses.length} 个地址…`;
  batchResults.replaceChildren();
  try {
    const response = await fetch(CONFIG.endpoints.batchScan, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ addresses }),
    });
    if (!response.ok) throw new Error(await responseMessage(response));
    const payload = await response.json();
    renderBatchRisks(payload.results || []);
    batchStatus.textContent = `完成：返回 ${payload.count ?? payload.results?.length ?? 0} 条结果。`;
  } catch (error) {
    batchStatus.textContent = error instanceof Error ? error.message : "批量检测失败。";
  }
});

document.querySelector("#shareButton").addEventListener("click", async () => {
  if (!state.lastReport) { status.textContent = "请先完成一次地址检测。"; return; }
  const url = new URL(window.location.href);
  url.search = "";
  url.searchParams.set("chain", state.lastReport.chain);
  url.searchParams.set("address", state.lastReport.address);
  try {
    if (navigator.share) await navigator.share({ title: "黑白地址安全复查", url: url.toString() });
    else await navigator.clipboard.writeText(url.toString());
    status.textContent = "复查链接已生成；打开链接会重新获取最新风险结果。";
  } catch {
    window.prompt("复制复查链接", url.toString());
  }
});

async function scanAddress(chain, address) {
  const endpoint =
    chain === "tron" ? CONFIG.endpoints.scanTron : CONFIG.endpoints.scanEthereum;

  if (window.location.protocol === "file:") {
    throw new Error("正式检测需要通过已部署的网站访问。");
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
    income: payload.income ?? payload.usdtIn ?? null,
    outcome: payload.outcome ?? payload.usdtOut ?? null,
    counterparties: payload.counterparties ?? payload.counterpartyCount ?? null,
    hits: payload.hits ?? payload.riskHits ?? 0,
    disclaimer: payload.disclaimer || "风险结果仅供辅助判断，不构成资金安全保证。",
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
  state.lastReport = { chain, address };
}

function formatNumber(value) {
  if (value === null || value === undefined || value === "") return "未采集";
  return Number(value).toLocaleString("en-US");
}

function parseBatchInput(value) {
  return [...new Set(String(value).split(/[\s,，;；]+/).map(item => item.trim()).filter(Boolean))];
}

async function responseMessage(response) {
  try { return (await response.json())?.error?.message || `接口请求失败（${response.status}）`; }
  catch { return `接口请求失败（${response.status}）`; }
}

function shortAddress(value) {
  return value?.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value || "未知地址";
}

function createText(tag, text) {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}

function renderBatchRisks(results) {
  batchResults.replaceChildren(...results.map(result => {
    const row = document.createElement("article");
    const detail = document.createElement("div");
    detail.append(createText("strong", shortAddress(result.address)), createText("span", result.chain ? result.chain.toUpperCase() : "无法识别链"));
    const value = result.ok ? `${result.riskLevel} · ${result.riskScore} 分` : result.error?.message || "检测失败";
    const badge = createText("em", value);
    badge.dataset.ok = String(Boolean(result.ok));
    row.append(detail, badge);
    return row;
  }));
}

const shared = new URLSearchParams(window.location.search);
const sharedChain = shared.get("chain");
const sharedAddress = shared.get("address");
if ((sharedChain === "tron" || sharedChain === "ethereum") && sharedAddress) {
  state.chain = sharedChain;
  chainButtons.forEach(item => item.classList.toggle("active", item.dataset.chain === sharedChain));
  input.value = sharedAddress;
  form.requestSubmit();
}
