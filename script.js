const partsBody = document.getElementById("partsBody");
const errorBox = document.getElementById("errorBox");
const resultsSection = document.getElementById("resultsSection");
let rowCounter = 0;

function addPartRow(width = "", height = "", qty = 1) {
  rowCounter++;
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td><span class="row-number">${String(rowCounter).padStart(2, "0")}</span></td>
    <td><input class="table-input part-width" type="number" min="0.1" step="0.1" placeholder="Largura" value="${width}" aria-label="Largura da peça"></td>
    <td><input class="table-input part-height" type="number" min="0.1" step="0.1" placeholder="Altura" value="${height}" aria-label="Altura da peça"></td>
    <td><input class="table-input part-qty" type="number" min="1" step="1" value="${qty}" aria-label="Quantidade"></td>
    <td><button class="delete-row" type="button" title="Remover peça" aria-label="Remover peça">×</button></td>`;
  tr.querySelector(".delete-row").addEventListener("click", () => { tr.remove(); updateCount(); renumberRows(); });
  tr.querySelectorAll("input").forEach((input, index, inputs) => input.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (index === inputs.length - 1) addPartRow().querySelector(".part-width").focus();
      else inputs[index + 1].focus();
    }
  }));
  partsBody.appendChild(tr);
  updateCount();
  return tr;
}
function renumberRows() {
  [...partsBody.querySelectorAll("tr")].forEach((row, i) => row.querySelector(".row-number").textContent = String(i + 1).padStart(2, "0"));
  rowCounter = partsBody.querySelectorAll("tr").length;
}
function updateCount() {
  const count = partsBody.querySelectorAll("tr").length;
  document.getElementById("partCount").textContent = `${count} ${count === 1 ? "item" : "itens"}`;
}
document.getElementById("addPart").addEventListener("click", () => addPartRow().querySelector(".part-width").focus());
const sheetWidthInput = document.getElementById("sheetWidth");
const sheetHeightInput = document.getElementById("sheetHeight");

function updateSheetDimensions() {
  const preset = document.getElementById("sheetPreset").value;
  const isCustom = preset === "custom";

  // Nos modelos prontos, os campos exibem as medidas do modelo e ficam bloqueados.
  // Em Personalizado, os campos são liberados para edição manual.
  sheetWidthInput.disabled = !isCustom;
  sheetHeightInput.disabled = !isCustom;

  if (!isCustom) {
    const [width, height] = preset.split("x").map(Number);
    sheetWidthInput.value = width;
    sheetHeightInput.value = height;
  }
}

document.getElementById("sheetPreset").addEventListener("change", updateSheetDimensions);
updateSheetDimensions();
document.getElementById("clearBtn").addEventListener("click", () => {
  partsBody.innerHTML = ""; rowCounter = 0; addPartRow();
  errorBox.hidden = true; resultsSection.hidden = true;
});

function getSheetSize() {
  return {
    w: Number(sheetWidthInput.value),
    h: Number(sheetHeightInput.value)
  };
}
function readParts() {
  const parts = []; let id = 0;
  for (const row of partsBody.querySelectorAll("tr")) {
    const widthValue = row.querySelector(".part-width").value;
    const heightValue = row.querySelector(".part-height").value;
    const qtyValue = row.querySelector(".part-qty").value;
    if (!widthValue && !heightValue) continue;
    const w = Number(widthValue), h = Number(heightValue), qty = Number(qtyValue);
    if (!(w > 0 && h > 0 && Number.isInteger(qty) && qty > 0)) throw new Error("Preencha largura, altura e quantidade com valores válidos em todas as linhas utilizadas.");
    for (let i = 0; i < qty; i++) { id++; parts.push({ id, label: `P${String(id).padStart(2, "0")}`, w, h, area: w * h }); }
  }
  if (!parts.length) throw new Error("Adicione pelo menos uma peça com dimensões e quantidade válidas.");
  return parts;
}
function intersects(a, b) { return !(b.x >= a.x + a.w || b.x + b.w <= a.x || b.y >= a.y + a.h || b.y + b.h <= a.y); }
function contains(a, b) { return b.x >= a.x - 0.001 && b.y >= a.y - 0.001 && b.x + b.w <= a.x + a.w + 0.001 && b.y + b.h <= a.y + a.h + 0.001; }
function splitFreeRect(free, used) {
  if (!intersects(free, used)) return [free];

  const rightWidth = free.x + free.w - (used.x + used.w);
  const bottomHeight = free.y + free.h - (used.y + used.h);

  const verticalSplit = [];

  // Corte vertical: separa uma faixa à direita
  if (rightWidth > 0.001) {
    verticalSplit.push({
      x: used.x + used.w,
      y: free.y,
      w: rightWidth,
      h: free.h
    });
  }

  // Corte horizontal: separa uma faixa inferior
  if (bottomHeight > 0.001) {
    verticalSplit.push({
      x: free.x,
      y: used.y + used.h,
      w: used.w,
      h: bottomHeight
    });
  }

  const horizontalSplit = [];

  // Corte horizontal: separa uma faixa inferior
  if (bottomHeight > 0.001) {
    horizontalSplit.push({
      x: free.x,
      y: used.y + used.h,
      w: free.w,
      h: bottomHeight
    });
  }

  // Corte vertical: separa uma faixa à direita
  if (rightWidth > 0.001) {
    horizontalSplit.push({
      x: used.x + used.w,
      y: free.y,
      w: rightWidth,
      h: used.h
    });
  }

  function evaluate(regions) {
    if (!regions.length) return 0;

    return Math.max(...regions.map(r => r.w * r.h));
  }

  // Escolhe a divisão que preserva o maior espaço retangular.
  return evaluate(verticalSplit) >= evaluate(horizontalSplit)
    ? verticalSplit
    : horizontalSplit;
}
function pruneFreeRects(rects) {
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      if (contains(rects[i], rects[j])) { rects.splice(j, 1); j--; }
      else if (contains(rects[j], rects[i])) { rects.splice(i, 1); i--; break; }
    }
  }
  return rects;
}
function findPosition(sheet, part, kerf, rotate) {
  let best = null;
  const orientations = rotate && Math.abs(part.w - part.h) > 0.001
    ? [{ w: part.w, h: part.h, rot: false }, { w: part.h, h: part.w, rot: true }]
    : [{ w: part.w, h: part.h, rot: false }];
  for (const free of sheet.free) for (const o of orientations) {
    // Kerf é reservado somente no lado direito e inferior; bordas externas não recebem desconto.
    const reserveW = o.w + (free.x + o.w < sheet.w - 0.001 ? kerf : 0);
    const reserveH = o.h + (free.y + o.h < sheet.h - 0.001 ? kerf : 0);
    if (reserveW <= free.w + 0.001 && reserveH <= free.h + 0.001) {
      const dw = free.w - reserveW, dh = free.h - reserveH;
      const score = [Math.min(dw, dh), Math.max(dw, dh), free.y, free.x];
      if (!best || compareScore(score, best.score) < 0) best = { x: free.x, y: free.y, w: o.w, h: o.h, fw: reserveW, fh: reserveH, rot: o.rot, score };
    }
  }
  return best;
}
function compareScore(a, b) { for (let i = 0; i < a.length; i++) { if (a[i] < b[i] - 0.001) return -1; if (a[i] > b[i] + 0.001) return 1; } return 0; }
function placeOnSheet(sheet, part, pos) {
  const used = {
    x: pos.x,
    y: pos.y,
    w: pos.fw,
    h: pos.fh
  };

  let next = [];

  for (const free of sheet.free) {
    next.push(...splitFreeRect(free, used));
  }

  sheet.free = pruneFreeRects(next);

  sheet.placements.push({
    ...part,
    x: pos.x,
    y: pos.y,
    w: pos.w,
    h: pos.h,
    rot: pos.rot
  });
}
function optimize(parts, sw, sh, kerf, rotate) {
  const ordered = [...parts].sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || b.area - a.area);
  const sheets = [];
  for (const part of ordered) {
    const fitsNormal = part.w <= sw + 0.001 && part.h <= sh + 0.001;
    const fitsRotated = rotate && part.h <= sw + 0.001 && part.w <= sh + 0.001;
    if (!fitsNormal && !fitsRotated) throw new Error(`${part.label} (${fmt(part.w)} × ${fmt(part.h)} mm) é maior que a chapa disponível, mesmo rotacionada.`);
    let bestSheet = -1, bestPos = null;
    for (let i = 0; i < sheets.length; i++) {
      const pos = findPosition(sheets[i], part, kerf, rotate);
      if (pos && (!bestPos || compareScore(pos.score, bestPos.score) < 0)) { bestSheet = i; bestPos = pos; }
    }
    if (bestSheet < 0) {
      const sheet = { w: sw, h: sh, free: [{ x: 0, y: 0, w: sw, h: sh }], placements: [] };
      const pos = findPosition(sheet, part, kerf, rotate);
      if (!pos) throw new Error(`${part.label} não coube na chapa. Verifique as dimensões e o kerf.`);
      sheets.push(sheet); bestSheet = sheets.length - 1; bestPos = pos;
    }
    placeOnSheet(sheets[bestSheet], part, bestPos);
  }
  return sheets;
}
function fmt(n) { return Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 1 }); }
function areaFmt(mm2) { return `${fmt(mm2 / 1e6)} m²`; }
function renderPlan(sheet, index, sw, sh, kerf) {
  const colors = ["#d9eff0", "#e5eafa", "#fbead8", "#e4f1e3", "#f2e3ef", "#e9e6d9", "#dcebf4"];
  const scale = 760 / sw, svgHeight = sh * scale;
  const rects = sheet.placements.map(p => {
    const x = p.x * scale, y = p.y * scale, w = p.w * scale, h = p.h * scale, color = colors[(p.id - 1) % colors.length];
    const showLabel = w > 48 && h > 27;
    return `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}" stroke="#52717c" stroke-width="1.3"/><text x="${x + w / 2}" y="${y + h / 2 - (showLabel ? 5 : 0)}" text-anchor="middle" dominant-baseline="middle" font-size="${Math.max(8, Math.min(15, scale * 24))}" font-weight="700" fill="#284653">${p.label}</text>${showLabel ? `<text x="${x + w / 2}" y="${y + h / 2 + 11}" text-anchor="middle" font-size="${Math.max(7, Math.min(10, scale * 15))}" fill="#49616b">${fmt(p.w)} × ${fmt(p.h)}</text>` : ""}${p.rot ? `<text x="${x + w - 5}" y="${y + 12}" text-anchor="end" font-size="9" fill="#46616a">↻</text>` : ""}</g>`;
  }).join("");
  const svg = `<svg class="plan-svg" viewBox="0 0 780 ${svgHeight + 4}" role="img" aria-label="Plano de corte da chapa ${index + 1}"><rect x="1" y="1" width="${sw * scale - 2}" height="${svgHeight - 2}" fill="#fff" stroke="#83969e" stroke-width="2"/>${rects}</svg>`;
  const used = sheet.placements.reduce((sum, p) => sum + p.area, 0), utilization = used / (sw * sh) * 100;
  return `<article class="plan-card"><div class="plan-head"><strong>Chapa ${String(index + 1).padStart(2, "0")}</strong><span>${sheet.placements.length} peças • ${fmt(utilization)}% aproveitamento</span></div><div class="plan-svg-wrap">${svg}</div><div class="plan-legend"><span><i class="legend-dot" style="background:#d9eff0"></i>Peças</span><span><i class="legend-dot" style="background:#fff;border:1px solid #83969e"></i>Área restante</span><span>↻ Peça rotacionada</span></div><div class="plan-details"><span>Área ocupada: ${areaFmt(used)}</span><span>Kerf: ${fmt(kerf)} mm</span></div></article>`;
}
function showResults(sheets, parts, sw, sh, kerf) {
  const totalArea = sw * sh * sheets.length, partsArea = parts.reduce((sum, p) => sum + p.area, 0);
  document.getElementById("metricSheets").textContent = sheets.length;
  document.getElementById("metricYield").textContent = `${fmt(partsArea / totalArea * 100)}%`;
  document.getElementById("metricPartsArea").textContent = areaFmt(partsArea);
  document.getElementById("metricWaste").textContent = areaFmt(totalArea - partsArea);
  document.getElementById("resultSummary").textContent = `${parts.length} peças distribuídas em ${sheets.length} ${sheets.length === 1 ? "chapa" : "chapas"} de ${fmt(sw)} × ${fmt(sh)} mm.`;
  document.getElementById("plansContainer").innerHTML = sheets.map((sheet, i) => renderPlan(sheet, i, sw, sh, kerf)).join("");
  resultsSection.hidden = false;
}
document.getElementById("optimizeBtn").addEventListener("click", () => {
  errorBox.hidden = true;
  try {
    const { w: sw, h: sh } = getSheetSize(), kerf = Number(document.getElementById("kerf").value);
    if (!(sw > 0 && sh > 0)) throw new Error("Informe dimensões válidas para a chapa.");
    if (!(kerf >= 0 && Number.isFinite(kerf))) throw new Error("Informe um kerf válido (zero ou maior). ");
    const parts = readParts();
    const sheets = optimize(parts, sw, sh, kerf, document.getElementById("allowRotation").checked);
    showResults(sheets, parts, sw, sh, kerf);
    resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    errorBox.textContent = error.message; errorBox.hidden = false; resultsSection.hidden = true;
  }
});
document.getElementById("printBtn").addEventListener("click", () => window.print());
addPartRow();
