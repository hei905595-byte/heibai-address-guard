export function isValidAddress(chain, value) {
  const address = String(value || "").trim();
  return chain === "tron" ? /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address) : /^0x[a-fA-F0-9]{40}$/.test(address);
}

export function addressError(chain) {
  return chain === "tron" ? "请输入有效的 TRON 地址（T 开头，共 34 位）" : "请输入有效的 Ethereum 地址（0x 开头，共 42 位）";
}
