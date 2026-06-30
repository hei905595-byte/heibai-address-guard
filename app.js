import { addressError, isValidAddress } from "./validation.mjs";

const DEFAULT_CONFIG = {
  siteHost: "heibai.com",
  endpoints: {
    scanTron: "/api/risk/tron",
    tronIntel: "/api/intel/tron",
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
const scanButton = form.querySelector('button[type="submit"]');

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
  if (!isValidAddress(state.chain, address)) {
    status.textContent = addressError(state.chain);
    input.focus();
    return;
  }

  status.textContent = "正在检测，请稍候…";
  setBusy(scanButton, true, "检测中…");
  reportPanel.hidden = true;
  try {
    const report = await scanAddress(state.chain, address);
    renderReport(state.chain, address, report);
    reportPanel.hidden = false;
    status.textContent = report.disclaimer || "检测完成；结果来自正式风险接口。";
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : "检测失败，请稍后重试。";
  } finally {
    setBusy(scanButton, false, "检测");
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
  const invalid = addresses.filter(address => !isValidAddress(address.startsWith("0x") ? "ethereum" : "tron", address));
  if (invalid.length) { batchStatus.textContent = `发现 ${invalid.length} 个无效地址，请检查格式。`; return; }
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
  const [response, intelResponse] = await Promise.all([
    fetchWithTimeout(url),
    chain === "tron"
      ? fetchWithTimeout(`${CONFIG.endpoints.tronIntel.replace(/\/+$/, "")}/${encodeURIComponent(address)}`).catch(() => null)
      : Promise.resolve(null),
  ]);
  if (!response.ok) {
    let detail = "";
    try {
      const payload = await response.json();
      detail = payload?.error?.message || payload?.error || "";
    } catch {}
    throw new Error(detail || `风险接口暂不可用（${response.status}），未生成模拟报告。`);
  }
  const report = normalizeReport(await response.json());
  if (intelResponse?.ok) report.intel = await intelResponse.json();
  return report;
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
    evidence: Array.isArray(payload.evidence) ? payload.evidence : [],
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
  renderChecks(chain, report);
  state.lastReport = { chain, address };
}

function renderChecks(chain, report) {
  const intel = report.intel;
  const rules = intel?.riskAssessment?.rules || [];
  const warnings = intel?.completeness?.warnings || [];
  const evidence = report.evidence || [];
  setCheck("reviewedCheck", evidence.length ? "danger" : "clear", evidence.length ? `命中 ${evidence.length} 条已审核风险证据。` : "当前已审核风险库未命中；未命中不代表安全。");
  setCheck("activityCheck", rules.length ? "warn" : (intel ? "clear" : "pending"), rules.length ? rules.map(item => `${item.title}（+${item.points || 0}）`).join("；") : (intel ? "当前扫描窗口未命中 TRON 行为规则。" : "深度行为索引尚未接入。"));
  const approvals = intel?.approvals;
  const riskyApprovals = Number(intel?.approvalRiskSummary?.high || 0) + Number(intel?.approvalRiskSummary?.medium || 0);
  setCheck("approvalCheck", approvals?.enabled ? (riskyApprovals ? "danger" : "clear") : "pending", approvals?.enabled ? `已扫描 ${approvals.scanned || 0} 条授权，风险授权 ${riskyApprovals} 条。` : (chain === "ethereum" ? "Ethereum ERC-20 授权数据源待接入。" : "授权数据暂不可用。"));
  setCheck("completenessCheck", warnings.length ? "warn" : (intel ? "clear" : "pending"), intel ? (warnings.length ? warnings.join("；") : "TRON 情报数据源本次返回完整。") : "当前仅有基础风险库结果，深度数据待接入。");
  const list = document.querySelector("#riskEvidence");
  list.replaceChildren();
  [...evidence, ...rules].forEach(item => {
    const row = document.createElement("li");
    row.textContent = item.summary || item.title || item.id || "风险证据";
    list.append(row);
  });
  document.querySelector("#evidencePanel").hidden = list.children.length === 0;
}

function setCheck(id, tone, text) {
  const node = document.querySelector(`#${id}`);
  node.className = `check-card ${tone}`;
  node.querySelector(".check-icon").textContent = tone === "clear" ? "✓" : tone === "pending" ? "…" : "!";
  node.querySelector("p").textContent = text;
}

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 15000);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  catch (error) {
    if (error?.name === "AbortError") throw new Error("接口响应超时，请稍后重试。");
    throw new Error("网络连接失败，请检查网络后重试。");
  } finally { window.clearTimeout(timer); }
}

function setBusy(button, busy, label) {
  button.disabled = busy;
  button.textContent = label;
  button.setAttribute("aria-busy", String(busy));
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
