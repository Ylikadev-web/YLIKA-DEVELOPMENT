// ─── CONFIG ──────────────────────────────────────────────────────────────────
const ADMIN_USER     = "admin";
const ADMIN_PASSWORD = "adminmike2026_ylikadev_2026";
const ADMIN_NAME     = "Administrador";
const STORAGE_KEY    = "ylika_tender_admin_state";
const SESSION_KEY    = "ylika_tender_admin_session";
const IVA_RATE       = 0.16;

// ⚠️  Reemplaza con tu webhook real.
// El Google Apps Script debe aceptar POST con body JSON en e.postData.contents
// y debe estar publicado como "Cualquier usuario, incluso anónimo".
const GOOGLE_DRIVE_WEBHOOK =
  "https://script.google.com/macros/s/AKfycbzRW_LJUTKNhcGo9tJCZGpdz44ZOxROajeasmfeLh2bYl7UD7dCddIWv8Mawy67QNEg/exec";

// Fases del proceso licitatorio en México (Ley de Adquisiciones)
const LICITACION_PHASES = [
  { id: "p1", name: "Convocatoria / Invitación",        icon: "megaphone",              color: "var(--accent)",   desc: "Publicación en CompraNet, DOF o convocatoria restringida. Bases, especificaciones técnicas y calendario." },
  { id: "p2", name: "Junta de Aclaraciones",            icon: "message-circle-question", color: "var(--violet)",   desc: "Reunión para resolver dudas sobre las bases. Las respuestas integran la convocatoria." },
  { id: "p3", name: "Presentación y Apertura",          icon: "package-open",            color: "var(--warning)",  desc: "Recepción de sobres con propuestas técnicas y económicas. Acto público con levantamiento de acta." },
  { id: "p4", name: "Evaluación de Proposiciones",      icon: "clipboard-list",          color: "#38a8ff",         desc: "Análisis técnico y económico. Verificación de requisitos y criterios." },
  { id: "p5", name: "Fallo",                            icon: "gavel",                   color: "var(--success)",  desc: "Comunicación oficial del resultado. Se indica el proveedor adjudicado y los montos." },
  { id: "p6", name: "Firma de Contrato",                icon: "file-signature",          color: "var(--accent)",   desc: "Formalización del instrumento jurídico entre la dependencia y el proveedor." },
  { id: "p7", name: "Ejecución / Entregas",             icon: "truck",                   color: "var(--warning)",  desc: "Cumplimiento: entregas parciales, supervisión y verificación de calidad." },
  { id: "p8", name: "Finiquito y Cierre",               icon: "check-circle-2",          color: "var(--success)",  desc: "Verificación de cumplimiento total, devolución de garantías, factura final y cierre administrativo." },
];

// ─── STATE ───────────────────────────────────────────────────────────────────
const state = {
  tenders: [],
  users:   [],
  activeTenderId: null,
  activeTab: "products",
  search: "",
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const money  = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const number = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 2 });
const dateFormatter = new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", year: "numeric" });

function createId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
function toPositiveNumber(v) {
  const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0;
}
function today() { return new Date().toISOString().slice(0, 10); }
function formatDate(v) {
  if (!v) return "Sin fecha";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  const d = m ? new Date(+m[1], +m[2]-1, +m[3]) : new Date(v);
  return isNaN(d) ? "Sin fecha" : dateFormatter.format(d);
}
function formatFileSize(b) {
  if (!b) return "0 B";
  const u = ["B","KB","MB","GB"]; let s = b, i = 0;
  while (s >= 1024 && i < u.length-1) { s /= 1024; i++; }
  return `${number.format(s)} ${u[i]}`;
}
function escapeHtml(v) {
  return String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}
function escapeAttr(v) { return escapeHtml(v).replaceAll("`","&#096;"); }
function emptyRow(txt, cols) {
  const r = document.createElement("tr");
  r.innerHTML = `<td colspan="${cols}" class="empty-row">${escapeHtml(txt)}</td>`;
  return r;
}
function refreshIcons() { if (window.lucide) window.lucide.createIcons(); }
function readFileAsDataUrl(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(file);
  });
}

// ─── DRIVE UPLOAD ─────────────────────────────────────────────────────────────
// Con fetch mode:"no-cors" no podemos leer la respuesta, pero el Apps Script
// recibirá el JSON en e.postData.contents.
// En tu Apps Script usa: const body = JSON.parse(e.postData.contents);
async function uploadToDrive(file, meta, tender) {
  const dataUrl  = await readFileAsDataUrl(file);
  const payload  = {
    fileName:     file.name,
    mimeType:     file.type || "application/octet-stream",
    fileBase64:   dataUrl.split(",")[1] || "",
    documentType: meta.type  || "Archivo",
    tenderId:     tender.id,
    tenderName:   tender.name,
    contract:     tender.contract,
    client:       tender.client,
    uploadedAt:   meta.uploadedAt,
  };
  await fetch(GOOGLE_DRIVE_WEBHOOK, {
    method:  "POST",
    mode:    "no-cors",         // permite cross-origin sin preflight
    headers: { "Content-Type": "text/plain" },  // text/plain no dispara preflight
    body:    JSON.stringify(payload),
  });
  // Con no-cors la respuesta es opaque; no podemos leer la URL generada.
  return "";
}

// ─── NORMALIZE ───────────────────────────────────────────────────────────────
function normalizeUser(u) {
  return {
    id:        u.id        || createId("usr"),
    username:  String(u.username || "").trim().toLowerCase(),
    password:  String(u.password || ""),
    name:      String(u.name || u.username || "").trim(),
    role:      u.role      || "Usuario",
    isAdmin:   Boolean(u.isAdmin),
    protected: Boolean(u.protected),
    createdAt: u.createdAt || new Date().toISOString(),
  };
}

function normalizeProduct(p) {
  return {
    id:          p.id         || createId("prd"),
    name:        p.name       || "",
    unit:        p.unit       || "pieza",
    sector:      p.sector     || "",
    partida:     p.partida    || "",
    quantity:    Number(p.quantity)   || 0,
    unitPrice:   Number(p.unitPrice)  || 0,
    profitPct:   Number(p.profitPct)  || 0,
    contractType: p.contractType || "in",           // "in" | "out"
    substituteId: p.substituteId || "",             // id del producto que sustituye
  };
}

function normalizeOrder(o) {
  return {
    id:          o.id          || createId("ord"),
    number:      o.number      || "",
    productId:   o.productId   || "",
    qtyOrdered:  Number(o.qtyOrdered)  || 0,
    qtyDelivered:Number(o.qtyDelivered)|| 0,
    date:        o.date        || today(),
    eta:         o.eta         || "",
    requestedBy: o.requestedBy || "",
    notes:       o.notes       || "",
    status:      o.status      || "Pendiente",   // Pendiente | Parcial | Entregado | Cancelado
    deliveries:  Array.isArray(o.deliveries) ? o.deliveries.map(normalizeOrderDelivery) : [],
    createdAt:   o.createdAt   || new Date().toISOString(),
  };
}

function normalizeOrderDelivery(d) {
  return {
    id:           d.id           || createId("od"),
    qty:          Number(d.qty)  || 0,
    date:         d.date         || today(),
    receivedBy:   d.receivedBy   || "",
    remisionNum:  d.remisionNum  || "",
    notes:        d.notes        || "",
    evidenceName: d.evidenceName || "",
    evidenceSize: Number(d.evidenceSize) || 0,
    evidenceMime: d.evidenceMime || "",
    evidenceStatus: d.evidenceStatus || "",
    evidenceDriveUrl: d.evidenceDriveUrl || "",
    createdAt:    d.createdAt    || new Date().toISOString(),
  };
}

function normalizeDocument(d) {
  return {
    id:         d.id         || createId("doc"),
    type:       d.type       || "Otro",
    name:       d.name       || "",
    mime:       d.mime       || "",
    size:       Number(d.size) || 0,
    status:     d.status     || "Registrado",
    uploadedAt: d.uploadedAt || new Date().toISOString(),
    driveUrl:   d.driveUrl   || "",
  };
}

function normalizeQuoteLine(l) {
  return {
    id:          l.id          || createId("ql"),
    description: l.description || "",
    unit:        l.unit        || "pieza",
    quantity:    Number(l.quantity)  || 0,
    unitPrice:   Number(l.unitPrice) || 0,
  };
}

function normalizePhaseDoc(d) {
  return {
    id:         d.id         || createId("phd"),
    name:       d.name       || "",
    mime:       d.mime       || "",
    size:       Number(d.size) || 0,
    status:     d.status     || "Registrado",
    uploadedAt: d.uploadedAt || new Date().toISOString(),
    driveUrl:   d.driveUrl   || "",
  };
}

function normalizePhaseDocs(raw) {
  const result = {};
  LICITACION_PHASES.forEach(ph => {
    result[ph.id] = Array.isArray(raw?.[ph.id]) ? raw[ph.id].map(normalizePhaseDoc) : [];
  });
  return result;
}

function normalizeTender(t) {
  return {
    id:             t.id             || createId("lic"),
    name:           t.name           || "",
    client:         t.client         || "",
    contract:       t.contract       || "",
    deadline:       t.deadline       || "",
    notes:          t.notes          || "",
    status:         t.status         || "Activa",
    createdAt:      t.createdAt      || new Date().toISOString(),
    quoteNumber:    t.quoteNumber    || "",
    quoteCreatedAt: t.quoteCreatedAt || "",
    quoteUpdatedAt: t.quoteUpdatedAt || "",
    products:   Array.isArray(t.products)   ? t.products.map(normalizeProduct)   : [],
    orders:     Array.isArray(t.orders)     ? t.orders.map(normalizeOrder)       : [],
    documents:  Array.isArray(t.documents)  ? t.documents.map(normalizeDocument) : [],
    quoteLines: Array.isArray(t.quoteLines) ? t.quoteLines.map(normalizeQuoteLine): [],
    phaseDocs:  normalizePhaseDocs(t.phaseDocs),
  };
}

function normalizeUsers(users) {
  const normalized = Array.isArray(users)
    ? users.map(normalizeUser).filter(u => u.username && u.password) : [];
  const admin = normalized.find(u => u.username === ADMIN_USER);
  if (admin) {
    Object.assign(admin, { password: ADMIN_PASSWORD, name: admin.name||ADMIN_NAME, role:"Admin", isAdmin:true, protected:true });
    return [admin, ...normalized.filter(u => u.id !== admin.id)];
  }
  return [normalizeUser({ id:"usr_admin", username:ADMIN_USER, password:ADMIN_PASSWORD, name:ADMIN_NAME, role:"Admin", isAdmin:true, protected:true, createdAt:new Date().toISOString() }), ...normalized];
}

// ─── STORAGE ─────────────────────────────────────────────────────────────────
function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!stored || !Array.isArray(stored.tenders)) { state.users = normalizeUsers([]); return; }
    state.tenders       = stored.tenders.map(normalizeTender);
    state.users         = normalizeUsers(stored.users);
    state.activeTenderId= stored.activeTenderId || state.tenders[0]?.id || null;
  } catch {
    state.tenders = []; state.users = normalizeUsers([]); state.activeTenderId = null;
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    tenders: state.tenders, users: state.users, activeTenderId: state.activeTenderId,
  }));
}

function getActiveTender() {
  return state.tenders.find(t => t.id === state.activeTenderId) || null;
}
function getCurrentUser() {
  const u = sessionStorage.getItem(SESSION_KEY);
  return u ? state.users.find(x => x.username === u) || null : null;
}
function getFinancials(tender) {
  // Uses quoteLines if they exist, otherwise falls back to products
  const lines = tender.quoteLines?.length ? tender.quoteLines : [];
  const sub = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  return { subtotal: sub, iva: sub * IVA_RATE, total: sub * (1 + IVA_RATE) };
}
function getProductTotal(p) { return p.quantity * p.unitPrice * (1 + IVA_RATE); }
function getOrderDeliveredQty(order) {
  return order.deliveries.reduce((s, d) => s + d.qty, 0);
}
function getProductOrderedQty(tender, productId) {
  return tender.orders.filter(o => o.productId === productId && o.status !== "Cancelado")
    .reduce((s, o) => s + o.qtyOrdered, 0);
}
function getProductDeliveredQty(tender, productId) {
  return tender.orders.filter(o => o.productId === productId)
    .flatMap(o => o.deliveries).reduce((s, d) => s + d.qty, 0);
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  loadState();
  bindEvents();
  renderAuth();
});

// ─── BIND EVENTS ─────────────────────────────────────────────────────────────
function bindEvents() {
  $("loginForm").addEventListener("submit", handleLogin);
  $("logoutButton").addEventListener("click", handleLogout);
  $("usersButton").addEventListener("click", openUsersDialog);
  $("newTenderButton").addEventListener("click", () => openTenderDialog());
  document.querySelectorAll("[data-open-tender]").forEach(b => b.addEventListener("click", () => openTenderDialog()));

  // Close dialogs — only the static ones; dynamic ones get bound in open*
  document.querySelectorAll("[data-close-dialog]").forEach(b => {
    b.addEventListener("click", () => closeDialog(b.dataset.closeDialog));
  });

  $("searchInput").addEventListener("input", e => { state.search = e.target.value.trim().toLowerCase(); renderTenderList(); });

  $("tenderForm").addEventListener("submit", handleTenderSubmit);
  $("productForm").addEventListener("submit", handleProductSubmit);
  $("orderForm").addEventListener("submit", handleOrderSubmit);
  $("orderDeliveryForm").addEventListener("submit", handleOrderDeliverySubmit);
  $("uploadForm").addEventListener("submit", handleUploadSubmit);
  $("userForm").addEventListener("submit", handleUserSubmit);
  $("quoteLineForm").addEventListener("submit", handleQuoteLineSubmit);
  $("phaseUploadForm").addEventListener("submit", handlePhaseUploadSubmit);

  $("editTenderButton").addEventListener("click", () => { const t = getActiveTender(); if (t) openTenderDialog(t); });
  $("deleteTenderButton").addEventListener("click", deleteActiveTender);
  $("statusSelect").addEventListener("change", e => { const t = getActiveTender(); if (!t) return; t.status = e.target.value; saveState(); render(); });

  $("newProductButton").addEventListener("click", openProductDialog);
  $("newOrderButton").addEventListener("click", openOrderDialog);

  // Quote buttons — bound here so they always work
  $("generateQuoteButton").addEventListener("click", generateQuote);
  $("printQuoteButton").addEventListener("click", printQuote);
  $("addQuoteLineButton").addEventListener("click", () => openQuoteLineDialog());
  $("importProductsButton").addEventListener("click", importProductsToQuote);

  $("productsTable").addEventListener("change", handleProductTableChange);
  $("productsTable").addEventListener("click", handleProductTableClick);
  $("documentsTable").addEventListener("click", handleDocumentTableClick);
  $("quoteLinesTable").addEventListener("click", handleQuoteLineTableClick);
  $("usersTable").addEventListener("click", handleUsersTableClick);

  // Product dialog price calculator
  ["priceInput","profitInput"].forEach(id => {
    $(id).addEventListener("input", updatePriceCalc);
  });

  // Contract type radio toggle
  document.querySelectorAll("input[name='contractType']").forEach(r => {
    r.addEventListener("change", () => {
      const isOut = $("contractTypeOut").checked;
      $("substituteRow").classList.toggle("is-hidden", !isOut);
    });
  });

  document.querySelectorAll(".tab-button").forEach(b => {
    b.addEventListener("click", () => { state.activeTab = b.dataset.tab; renderDetail(); });
  });
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────
function handleLogin(e) {
  e.preventDefault();
  const u = $("usernameInput").value.trim().toLowerCase();
  const p = $("passwordInput").value;
  const user = state.users.find(x => x.username === u && x.password === p);
  if (user) {
    sessionStorage.setItem(SESSION_KEY, user.username);
    $("loginError").textContent = "";
    $("passwordInput").value = "";
    renderAuth(); return;
  }
  $("loginError").textContent = "Usuario o contraseña incorrectos.";
}
function handleLogout() { sessionStorage.removeItem(SESSION_KEY); renderAuth(); }
function renderAuth() {
  const cu = getCurrentUser();
  const ok = Boolean(cu);
  $("loginScreen").classList.toggle("is-hidden", ok);
  $("appShell").classList.toggle("is-hidden", !ok);
  if (ok) {
    $("currentUserLabel").textContent = cu.name || cu.username;
    $("usersButton").classList.toggle("is-hidden", !cu.isAdmin);
    render();
  }
  refreshIcons();
}

// ─── RENDER ───────────────────────────────────────────────────────────────────
function render() {
  if (!state.activeTenderId && state.tenders.length) state.activeTenderId = state.tenders[0].id;
  renderMetrics();
  renderTenderList();
  renderDetail();
  renderUsers();
  refreshIcons();
}

function renderMetrics() {
  const total = state.tenders.reduce((s, t) => s + getFinancials(t).total, 0);
  const cUnits = state.tenders.reduce((s, t) => s + t.products.reduce((x, p) => x + p.quantity, 0), 0);
  const dUnits = state.tenders.reduce((s, t) => s + t.orders.flatMap(o=>o.deliveries).reduce((x, d) => x + d.qty, 0), 0);
  const docs   = state.tenders.reduce((s, t) => s + t.documents.length, 0);
  const pct    = cUnits ? Math.min(100, (dUnits / cUnits) * 100) : 0;
  $("totalTenders").textContent   = state.tenders.length;
  $("contractedTotal").textContent= money.format(total);
  $("deliveredTotal").textContent = `${number.format(pct)}%`;
  $("documentTotal").textContent  = docs;
}

function renderTenderList() {
  const list = $("tenderList"); list.replaceChildren();
  const filtered = state.tenders.filter(t =>
    `${t.name} ${t.client} ${t.contract}`.toLowerCase().includes(state.search));
  if (!filtered.length) {
    const p = document.createElement("p"); p.className = "empty-row";
    p.textContent = state.search ? "Sin coincidencias." : "Sin licitaciones.";
    list.append(p); return;
  }
  filtered.forEach(t => {
    const f = getFinancials(t);
    const btn = document.createElement("button");
    btn.type = "button"; btn.className = "tender-card";
    btn.classList.toggle("is-active", t.id === state.activeTenderId);
    btn.addEventListener("click", () => { state.activeTenderId = t.id; saveState(); render(); });
    btn.innerHTML = `
      <span class="status-pill" data-status="${escapeHtml(t.status)}">${escapeHtml(t.status)}</span>
      <strong>${escapeHtml(t.name)}</strong>
      <small>${escapeHtml(t.client)} · ${escapeHtml(t.contract)}</small>
      <small>${money.format(f.total)}</small>`;
    list.append(btn);
  });
}

function renderDetail() {
  const t = getActiveTender();
  $("emptyState").classList.toggle("is-hidden", Boolean(t));
  $("detailView").classList.toggle("is-hidden", !t);
  if (!t) return;

  $("detailMeta").textContent   = `${t.contract} · ${formatDate(t.deadline)}`;
  $("detailTitle").textContent  = t.name;
  $("detailClient").textContent = t.client;
  $("statusSelect").value       = t.status;

  document.querySelectorAll(".tab-button").forEach(b => b.classList.toggle("is-active", b.dataset.tab === state.activeTab));
  const panels = { products:"productsPanel", orders:"ordersPanel", quote:"quotePanel", documents:"documentsPanel", phases:"phasesPanel" };
  Object.entries(panels).forEach(([k,id]) => $(id).classList.toggle("is-hidden", k !== state.activeTab));

  renderProducts(t);
  renderOrders(t);
  renderQuote(t);
  renderDocuments(t);
  renderPhases(t);
  refreshIcons();
}

// ─── PRODUCTS ─────────────────────────────────────────────────────────────────
function renderProducts(t) {
  const tbody = $("productsTable"); tbody.replaceChildren();
  if (!t.products.length) { tbody.append(emptyRow("Sin productos registrados.", 12)); return; }

  t.products.forEach(p => {
    const delivered = getProductDeliveredQty(t, p.id);
    const pct = p.quantity ? Math.min(100, (delivered / p.quantity) * 100) : 0;
    const priceWithIva    = p.unitPrice * (1 + IVA_RATE);
    const priceWithProfit = p.unitPrice * (1 + IVA_RATE) * (1 + (p.profitPct || 0) / 100);
    const contractBadge   = p.contractType === "out"
      ? `<span class="badge-out">Fuera</span>` : `<span class="badge-in">Contrato</span>`;
    const substituteName  = p.substituteId
      ? (t.products.find(x => x.id === p.substituteId)?.name || "?") : "";
    const substituteNote  = p.contractType === "out" && substituteName
      ? `<small class="sub-note">↔ ${escapeHtml(substituteName)}</small>` : "";

    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${contractBadge}${substituteNote}</td>
      <td><input data-product-id="${p.id}" data-product-field="name" value="${escapeAttr(p.name)}" /></td>
      <td><input data-product-id="${p.id}" data-product-field="sector" value="${escapeAttr(p.sector)}" placeholder="Sector" style="min-width:90px"/></td>
      <td><span class="partida-badge">${escapeHtml(p.partida||"—")}</span></td>
      <td><input data-product-id="${p.id}" data-product-field="unit" value="${escapeAttr(p.unit)}" style="min-width:70px"/></td>
      <td><input data-product-id="${p.id}" data-product-field="quantity" type="number" min="0" step="0.01" value="${p.quantity}" /></td>
      <td><input data-product-id="${p.id}" data-product-field="unitPrice" type="number" min="0" step="0.01" value="${p.unitPrice}" /></td>
      <td class="number-cell">${money.format(priceWithIva)}</td>
      <td class="number-cell">
        <input data-product-id="${p.id}" data-product-field="profitPct" type="number" min="0" step="0.1" value="${p.profitPct||0}" style="min-width:60px" />
        <small>${money.format(priceWithProfit)}</small>
      </td>
      <td>
        <div class="progress-line">
          <span>${number.format(delivered)} / ${number.format(p.quantity)}</span>
          <div class="progress-track"><div class="progress-fill" style="--progress:${pct}%"></div></div>
        </div>
      </td>
      <td class="number-cell">${money.format(getProductTotal(p))}</td>
      <td>
        <button class="icon-button" type="button" data-delete-product="${p.id}" title="Eliminar">
          <i data-lucide="trash-2"></i>
        </button>
      </td>`;
    tbody.append(row);
  });
}

function handleProductTableChange(e) {
  const { productId, productField } = e.target.dataset;
  if (!productId || !productField) return;
  const t = getActiveTender();
  const p = t?.products.find(x => x.id === productId);
  if (!p) return;
  if (["quantity","unitPrice","profitPct"].includes(productField)) {
    p[productField] = toPositiveNumber(e.target.value);
  } else {
    p[productField] = e.target.value.trim();
  }
  saveState(); render();
}

function handleProductTableClick(e) {
  const btn = e.target.closest("[data-delete-product]"); if (!btn) return;
  const t = getActiveTender(); if (!t) return;
  const p = t.products.find(x => x.id === btn.dataset.deleteProduct); if (!p) return;
  if (!confirm(`¿Eliminar "${p.name}" y sus pedidos?`)) return;
  t.products = t.products.filter(x => x.id !== p.id);
  t.orders   = t.orders.filter(o => o.productId !== p.id);
  saveState(); render();
}

// ─── ORDERS ───────────────────────────────────────────────────────────────────
function renderOrders(t) {
  const container = $("ordersContainer"); container.replaceChildren();
  if (!t.products.length) {
    container.innerHTML = `<p class="empty-row" style="padding:20px">Primero agrega productos al contrato.</p>`;
    return;
  }
  if (!t.orders.length) {
    container.innerHTML = `<p class="empty-row" style="padding:20px">Sin pedidos registrados. Crea el primero con el botón + Nuevo pedido.</p>`;
    return;
  }

  // Group by product
  const byProduct = {};
  t.products.forEach(p => { byProduct[p.id] = { product: p, orders: [] }; });
  t.orders.forEach(o => {
    if (byProduct[o.productId]) byProduct[o.productId].orders.push(o);
    else {
      // product deleted — still show
      if (!byProduct["__deleted__"]) byProduct["__deleted__"] = { product: { id:"__deleted__", name:"Producto eliminado", unit:""}, orders:[] };
      byProduct["__deleted__"].orders.push(o);
    }
  });

  Object.values(byProduct).filter(g => g.orders.length).forEach(({ product, orders }) => {
    const totalOrdered   = orders.reduce((s,o) => s + o.qtyOrdered, 0);
    const totalDelivered = orders.reduce((s,o) => s + getOrderDeliveredQty(o), 0);
    const pct = totalOrdered ? Math.min(100, (totalDelivered / totalOrdered) * 100) : 0;

    const section = document.createElement("div");
    section.className = "order-product-section";
    section.innerHTML = `
      <div class="order-product-header">
        <div>
          <strong>${escapeHtml(product.name)}</strong>
          <small>${escapeHtml(product.sector||"")} ${product.partida ? "· Partida: "+escapeHtml(product.partida) : ""}</small>
        </div>
        <div class="order-product-stats">
          <span>${number.format(totalDelivered)} / ${number.format(totalOrdered)} ${escapeHtml(product.unit)}</span>
          <div class="progress-track" style="width:120px"><div class="progress-fill" style="--progress:${pct}%"></div></div>
        </div>
      </div>
      <div class="responsive-table">
        <table>
          <thead><tr>
            <th>Pedido</th><th>Fecha</th><th>Cant. pedida</th><th>Entregado</th>
            <th>Estatus</th><th>Solicitó</th><th>Remisiones</th><th></th>
          </tr></thead>
          <tbody id="orderRows_${product.id}"></tbody>
        </table>
      </div>`;
    container.append(section);

    const tbody = section.querySelector(`#orderRows_${product.id}`);
    orders.forEach(o => {
      const delivered = getOrderDeliveredQty(o);
      const remRows = o.deliveries.map(d => {
        const evLink = d.evidenceDriveUrl
          ? `<a href="${escapeAttr(d.evidenceDriveUrl)}" target="_blank"><i data-lucide="external-link"></i></a>`
          : (d.evidenceName ? `<span title="${escapeAttr(d.evidenceName)}"><i data-lucide="file-check"></i></span>` : "");
        return `<div class="delivery-chip">${escapeHtml(d.remisionNum||d.id.slice(-6))} · ${number.format(d.qty)} · ${formatDate(d.date)} ${evLink}</div>`;
      }).join("");

      const row = document.createElement("tr");
      row.innerHTML = `
        <td><strong>${escapeHtml(o.number)}</strong></td>
        <td>${formatDate(o.date)}</td>
        <td class="number-cell">${number.format(o.qtyOrdered)} ${escapeHtml(product.unit)}</td>
        <td class="number-cell">${number.format(delivered)} ${escapeHtml(product.unit)}</td>
        <td><span class="status-pill" data-status="${escapeHtml(o.status)}">${escapeHtml(o.status)}</span></td>
        <td>${escapeHtml(o.requestedBy||"—")}</td>
        <td><div class="remision-list">${remRows||"Sin remisiones"}</div></td>
        <td>
          <div style="display:flex;gap:6px">
            ${o.status !== "Entregado" && o.status !== "Cancelado"
              ? `<button class="icon-button" type="button" data-deliver-order="${o.id}" title="Registrar entrega"><i data-lucide="truck"></i></button>` : ""}
            <button class="icon-button" type="button" data-cancel-order="${o.id}" title="Cancelar pedido" ${o.status==="Cancelado"?"disabled":""}><i data-lucide="x-circle"></i></button>
            <button class="icon-button danger-button" type="button" data-delete-order="${o.id}" title="Eliminar pedido"><i data-lucide="trash-2"></i></button>
          </div>
        </td>`;
      tbody.append(row);
    });
  });

  // Bind order action buttons
  container.querySelectorAll("[data-deliver-order]").forEach(btn => {
    btn.addEventListener("click", () => openOrderDeliveryDialog(btn.dataset.deliverOrder));
  });
  container.querySelectorAll("[data-cancel-order]").forEach(btn => {
    btn.addEventListener("click", () => {
      const t = getActiveTender(); if (!t) return;
      const o = t.orders.find(x => x.id === btn.dataset.cancelOrder); if (!o) return;
      if (!confirm(`¿Cancelar pedido ${o.number}?`)) return;
      o.status = "Cancelado"; saveState(); render();
    });
  });
  container.querySelectorAll("[data-delete-order]").forEach(btn => {
    btn.addEventListener("click", () => {
      const t = getActiveTender(); if (!t) return;
      if (!confirm("¿Eliminar este pedido?")) return;
      t.orders = t.orders.filter(x => x.id !== btn.dataset.deleteOrder);
      saveState(); render();
    });
  });

  refreshIcons();
}

// ─── QUOTE ────────────────────────────────────────────────────────────────────
function renderQuote(t) {
  const lines = t.quoteLines || [];
  const sub   = lines.reduce((s,l) => s + l.quantity * l.unitPrice, 0);
  const iva   = sub * IVA_RATE;
  const total = sub + iva;

  $("quoteSummary").innerHTML = `
    <article><span>Subtotal</span><strong>${money.format(sub)}</strong></article>
    <article><span>IVA 16%</span><strong>${money.format(iva)}</strong></article>
    <article><span>Total con IVA</span><strong>${money.format(total)}</strong></article>`;

  // Editable lines table
  const ltbody = $("quoteLinesTable"); ltbody.replaceChildren();
  if (!lines.length) {
    ltbody.append(emptyRow("Sin líneas. Agrega manualmente o importa de productos.", 6));
  } else {
    lines.forEach(l => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${escapeHtml(l.description)}</td>
        <td>${escapeHtml(l.unit)}</td>
        <td class="number-cell">${number.format(l.quantity)}</td>
        <td class="number-cell">${money.format(l.unitPrice)}</td>
        <td class="number-cell">${money.format(l.quantity * l.unitPrice)}</td>
        <td><button class="icon-button" type="button" data-delete-quoteline="${l.id}"><i data-lucide="trash-2"></i></button></td>`;
      ltbody.append(row);
    });
  }

  // Preview
  const qDate  = t.quoteCreatedAt || new Date().toISOString();
  const qNum   = t.quoteNumber || "Sin folio";
  const previewRows = lines.length
    ? lines.map((l,i) => `<tr><td>${i+1}</td><td>${escapeHtml(l.description)}</td><td>${escapeHtml(l.unit)}</td>
        <td class="number-cell">${number.format(l.quantity)}</td>
        <td class="number-cell">${money.format(l.unitPrice)}</td>
        <td class="number-cell">${money.format(l.quantity*l.unitPrice)}</td></tr>`).join("")
    : `<tr><td colspan="6" class="empty-row">Sin líneas registradas.</td></tr>`;

  $("quotePreview").innerHTML = `
    <header>
      <div><p class="eyebrow">YLIKA DEVELOPMENT</p><h2>Cotización</h2><p class="muted">${escapeHtml(qNum)}</p></div>
      <div>
        <p><strong>Fecha:</strong> ${formatDate(qDate)}</p>
        <p><strong>Cliente:</strong> ${escapeHtml(t.client)}</p>
        <p><strong>Contrato:</strong> ${escapeHtml(t.contract)}</p>
      </div>
    </header>
    <table>
      <thead><tr><th>#</th><th>Descripción</th><th>Unidad</th><th>Cantidad</th><th>Precio unitario</th><th>Importe</th></tr></thead>
      <tbody>${previewRows}</tbody>
    </table>
    <div class="quote-totals">
      <div><span>Subtotal</span><strong>${money.format(sub)}</strong></div>
      <div><span>IVA 16%</span><strong>${money.format(iva)}</strong></div>
      <div><span>Total con IVA incluido</span><strong>${money.format(total)}</strong></div>
    </div>
    ${t.notes ? `<p><strong>Notas:</strong> ${escapeHtml(t.notes)}</p>` : ""}`;
}

function generateQuote() {
  const t = getActiveTender(); if (!t) return;
  if (!t.quoteNumber) {
    const dp = new Date().toISOString().slice(0,10).replaceAll("-","");
    t.quoteNumber    = `COT-${dp}-${String(state.tenders.indexOf(t)+1).padStart(3,"0")}`;
    t.quoteCreatedAt = new Date().toISOString();
  }
  t.quoteUpdatedAt = new Date().toISOString();
  state.activeTab  = "quote";
  saveState(); render();
}

function printQuote() {
  const t = getActiveTender(); if (!t) return;
  if (!t.quoteNumber) generateQuote();
  window.print();
}

function importProductsToQuote() {
  const t = getActiveTender();
  if (!t?.products.length) { alert("No hay productos para importar."); return; }
  if (!confirm("¿Agregar todos los productos como líneas de cotización? (No borra líneas existentes)")) return;
  t.products.forEach(p => {
    t.quoteLines.push(normalizeQuoteLine({ description: p.name, unit: p.unit, quantity: p.quantity, unitPrice: p.unitPrice }));
  });
  saveState(); renderQuote(t);
}

// ─── DOCUMENTS ────────────────────────────────────────────────────────────────
function renderDocuments(t) {
  const tbody = $("documentsTable"); tbody.replaceChildren();
  if (!t.documents.length) { tbody.append(emptyRow("Sin archivos registrados.", 5)); return; }
  [...t.documents].sort((a,b) => new Date(b.uploadedAt)-new Date(a.uploadedAt)).forEach(d => {
    const link = d.driveUrl
      ? `<a href="${escapeAttr(d.driveUrl)}" target="_blank" rel="noreferrer">${escapeHtml(d.name)}</a>`
      : escapeHtml(d.name);
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(d.type)}</td>
      <td>${link}<br><small>${formatFileSize(d.size)}</small></td>
      <td>${formatDate(d.uploadedAt)}</td>
      <td>${escapeHtml(d.status)}</td>
      <td><button class="icon-button" type="button" data-delete-document="${d.id}"><i data-lucide="trash-2"></i></button></td>`;
    tbody.append(row);
  });
}

function handleDocumentTableClick(e) {
  const btn = e.target.closest("[data-delete-document]"); if (!btn) return;
  const t = getActiveTender(); if (!t) return;
  if (!confirm("¿Eliminar este registro?")) return;
  t.documents = t.documents.filter(x => x.id !== btn.dataset.deleteDocument);
  saveState(); render();
}

// ─── PHASES ───────────────────────────────────────────────────────────────────
function renderPhases(t) {
  const container = $("phasesContainer"); container.replaceChildren();
  LICITACION_PHASES.forEach(ph => {
    const docs = t.phaseDocs?.[ph.id] || [];
    const sect = document.createElement("div");
    sect.className = "phase-block";
    sect.innerHTML = `
      <div class="phase-header ${docs.length ? 'phase-has-docs' : ''}">
        <div class="phase-icon" style="--phase-color:${ph.color}"><i data-lucide="${ph.icon}"></i></div>
        <div class="phase-info"><strong>${escapeHtml(ph.name)}</strong><p>${escapeHtml(ph.desc)}</p></div>
        <div class="phase-actions">
          <span class="phase-doc-count ${docs.length?'has-docs':''}">${docs.length} doc${docs.length!==1?"s":""}</span>
          <button class="secondary-action phase-upload-btn" type="button"
            data-phase-id="${ph.id}" data-phase-name="${escapeAttr(ph.name)}">
            <i data-lucide="upload"></i> Subir
          </button>
        </div>
      </div>`;

    if (docs.length) {
      const dl = document.createElement("div"); dl.className = "phase-doc-list";
      docs.forEach(d => {
        const item = document.createElement("div"); item.className = "phase-doc-item";
        const link = d.driveUrl
          ? `<a href="${escapeAttr(d.driveUrl)}" target="_blank">${escapeHtml(d.name)}</a>`
          : `<span>${escapeHtml(d.name)}</span>`;
        item.innerHTML = `
          <i data-lucide="file-text"></i>
          <div>${link}<small>${formatDate(d.uploadedAt)} · ${formatFileSize(d.size)} · ${escapeHtml(d.status)}</small></div>
          <button class="icon-button" type="button" data-delete-phase-doc="${d.id}" data-phase-id="${ph.id}"><i data-lucide="trash-2"></i></button>`;
        dl.append(item);
      });
      sect.append(dl);
    }
    container.append(sect);
  });

  container.querySelectorAll(".phase-upload-btn").forEach(btn => {
    btn.addEventListener("click", () => openPhaseUploadDialog(btn.dataset.phaseId, btn.dataset.phaseName));
  });
  container.querySelectorAll("[data-delete-phase-doc]").forEach(btn => {
    btn.addEventListener("click", () => deletePhaseDoc(btn.dataset.phaseId, btn.dataset.deletePhaseDoc));
  });
  refreshIcons();
}

function deletePhaseDoc(phaseId, docId) {
  const t = getActiveTender(); if (!t) return;
  if (!confirm("¿Eliminar este documento?")) return;
  t.phaseDocs[phaseId] = (t.phaseDocs[phaseId]||[]).filter(d => d.id !== docId);
  saveState(); renderPhases(t); refreshIcons();
}

// ─── USERS ────────────────────────────────────────────────────────────────────
function renderUsers() {
  const tbody = $("usersTable"); if (!tbody) return;
  tbody.replaceChildren();
  state.users.forEach(u => {
    const row = document.createElement("tr");
    const action = u.protected ? `<span class="muted">Admin base</span>`
      : `<button class="icon-button" type="button" data-delete-user="${u.id}"><i data-lucide="user-minus"></i></button>`;
    row.innerHTML = `
      <td><strong>${escapeHtml(u.username)}</strong></td>
      <td>${escapeHtml(u.name)}</td>
      <td>${escapeHtml(u.role)}</td>
      <td>${u.protected ? "Protegido" : "Activo"}</td>
      <td>${action}</td>`;
    tbody.append(row);
  });
}

function handleUsersTableClick(e) {
  const btn = e.target.closest("[data-delete-user]"); if (!btn || !getCurrentUser()?.isAdmin) return;
  const u = state.users.find(x => x.id === btn.dataset.deleteUser);
  if (!u || u.protected) return;
  if (!confirm(`¿Dar de baja "${u.username}"?`)) return;
  state.users = state.users.filter(x => x.id !== u.id);
  if (sessionStorage.getItem(SESSION_KEY) === u.username) sessionStorage.removeItem(SESSION_KEY);
  saveState(); renderUsers(); refreshIcons();
}

// ─── DIALOGS ─────────────────────────────────────────────────────────────────
function openDialog(id)  { const d = $(id); d.showModal ? d.showModal() : d.setAttribute("open",""); refreshIcons(); }
function closeDialog(id) { const d = $(id); d.close    ? d.close()     : d.removeAttribute("open"); }

function openTenderDialog(t = null) {
  $("tenderDialogTitle").textContent = t ? "Editar licitación" : "Nueva licitación";
  $("tenderIdInput").value    = t?.id       || "";
  $("tenderNameInput").value  = t?.name     || "";
  $("clientInput").value      = t?.client   || "";
  $("contractInput").value    = t?.contract || "";
  $("deadlineInput").value    = t?.deadline || "";
  $("notesInput").value       = t?.notes    || "";
  openDialog("tenderDialog");
}

function openProductDialog(productToEdit = null) {
  const t = getActiveTender(); if (!t) return;
  $("productDialogTitle").textContent = productToEdit ? "Editar producto" : "Agregar producto";
  $("productIdInput").value      = productToEdit?.id         || "";
  $("productNameInput").value    = productToEdit?.name       || "";
  $("unitInput").value           = productToEdit?.unit       || "pieza";
  $("sectorInput").value         = productToEdit?.sector     || "";
  $("partidaInput").value        = productToEdit?.partida    || "";
  $("quantityInput").value       = productToEdit?.quantity   || "";
  $("priceInput").value          = productToEdit?.unitPrice  || "";
  $("profitInput").value         = productToEdit?.profitPct  || "0";

  const isOut = productToEdit?.contractType === "out";
  $("contractTypeIn").checked  = !isOut;
  $("contractTypeOut").checked = isOut;
  $("substituteRow").classList.toggle("is-hidden", !isOut);

  // Populate substitute dropdown (other products)
  const sel = $("substituteProductInput");
  sel.replaceChildren();
  sel.innerHTML = `<option value="">— Selecciona la partida que libera uso —</option>`;
  t.products.filter(p => !productToEdit || p.id !== productToEdit.id).forEach(p => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = `${p.name} (Partida: ${p.partida||"—"})`;
    if (productToEdit?.substituteId === p.id) opt.selected = true;
    sel.append(opt);
  });

  updatePriceCalc();
  openDialog("productDialog");
}

function updatePriceCalc() {
  const base   = toPositiveNumber($("priceInput").value);
  const profit = toPositiveNumber($("profitInput").value);
  $("calcWithIva").textContent    = money.format(base * (1 + IVA_RATE));
  $("calcWithProfit").textContent = money.format(base * (1 + IVA_RATE) * (1 + profit / 100));
}

function openOrderDialog() {
  const t = getActiveTender();
  if (!t || !t.products.length) { alert("Primero agrega productos al contrato."); return; }
  $("orderIdInput").value = "";
  $("orderForm").reset();
  $("orderDateInput").value = today();
  $("orderEvidenceError").textContent = "";

  const sel = $("orderProductInput"); sel.replaceChildren();
  t.products.forEach(p => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = `${p.name} | Partida: ${p.partida||"—"} | ${number.format(p.quantity)} ${p.unit}`;
    sel.append(opt);
  });
  openDialog("orderDialog");
}

function openOrderDeliveryDialog(orderId) {
  const t = getActiveTender(); if (!t) return;
  const o = t.orders.find(x => x.id === orderId); if (!o) return;
  $("odOrderIdInput").value = orderId;
  $("orderDeliveryForm").reset();
  $("odOrderIdInput").value = orderId;
  $("odDateInput").value = today();
  $("odEvidenceError").textContent = "";
  openDialog("orderDeliveryDialog");
}

function openQuoteLineDialog(line = null) {
  $("quoteLineDialogTitle").textContent = line ? "Editar línea" : "Agregar línea";
  $("quoteLineIdInput").value    = line?.id          || "";
  $("quoteLineDescInput").value  = line?.description || "";
  $("quoteLineUnitInput").value  = line?.unit        || "pieza";
  $("quoteLineQtyInput").value   = line?.quantity    || "";
  $("quoteLinePriceInput").value = line?.unitPrice   || "";
  openDialog("quoteLineDialog");
}

function openPhaseUploadDialog(phaseId, phaseName) {
  $("phaseIdInput").value          = phaseId;
  $("phaseUploadTitle").textContent= `Subir doc: ${phaseName}`;
  $("phaseUploadForm").reset();
  $("phaseIdInput").value          = phaseId;
  $("phaseUploadStatus").textContent = "";
  openDialog("phaseUploadDialog");
}

function openUsersDialog() {
  if (!getCurrentUser()?.isAdmin) return;
  $("userForm").reset();
  $("userFormError").textContent = "";
  renderUsers();
  openDialog("usersDialog");
}

// ─── FORM HANDLERS ───────────────────────────────────────────────────────────
function handleTenderSubmit(e) {
  e.preventDefault();
  const id = $("tenderIdInput").value;
  const payload = {
    name: $("tenderNameInput").value.trim(), client: $("clientInput").value.trim(),
    contract: $("contractInput").value.trim(), deadline: $("deadlineInput").value,
    notes: $("notesInput").value.trim(),
  };
  if (!payload.name || !payload.client || !payload.contract) return;
  if (id) {
    const t = state.tenders.find(x => x.id === id); if (t) Object.assign(t, payload);
  } else {
    const t = normalizeTender({ ...payload, id: createId("lic"), createdAt: new Date().toISOString(), status: "Activa" });
    state.tenders.unshift(t); state.activeTenderId = t.id;
  }
  saveState(); closeDialog("tenderDialog"); render();
}

function handleProductSubmit(e) {
  e.preventDefault();
  const t = getActiveTender(); if (!t) return;
  const id           = $("productIdInput").value;
  const contractType = $("contractTypeOut").checked ? "out" : "in";
  const substituteId = contractType === "out" ? $("substituteProductInput").value : "";

  const payload = normalizeProduct({
    id:           id || createId("prd"),
    name:         $("productNameInput").value.trim(),
    unit:         $("unitInput").value.trim() || "pieza",
    sector:       $("sectorInput").value.trim(),
    partida:      $("partidaInput").value.trim(),
    quantity:     toPositiveNumber($("quantityInput").value),
    unitPrice:    toPositiveNumber($("priceInput").value),
    profitPct:    toPositiveNumber($("profitInput").value),
    contractType,
    substituteId,
  });

  if (id) {
    const idx = t.products.findIndex(p => p.id === id);
    if (idx >= 0) t.products[idx] = payload;
  } else {
    t.products.push(payload);
  }
  saveState(); closeDialog("productDialog"); state.activeTab = "products"; render();
}

async function handleOrderSubmit(e) {
  e.preventDefault();
  const t = getActiveTender(); if (!t) return;
  const productId   = $("orderProductInput").value;
  const qtyOrdered  = toPositiveNumber($("orderQtyInput").value);
  if (!productId || qtyOrdered <= 0) return;

  const nextNum = t.orders.length + 1;
  const order = normalizeOrder({
    id:          createId("ord"),
    number:      `PED-${String(nextNum).padStart(4,"0")}`,
    productId,
    qtyOrdered,
    date:        $("orderDateInput").value || today(),
    eta:         $("orderEtaInput").value || "",
    requestedBy: $("orderRequestedByInput").value.trim(),
    notes:       $("orderNotesInput").value.trim(),
    status:      "Pendiente",
    createdAt:   new Date().toISOString(),
  });
  t.orders.push(order);
  saveState();
  closeDialog("orderDialog");
  state.activeTab = "orders";
  render();

  // Optional evidence on creation
  const evFile = $("orderEvidenceFile").files[0];
  if (evFile) {
    uploadOrderEvidence(evFile, order, t, null);
  }
}

async function handleOrderDeliverySubmit(e) {
  e.preventDefault();
  const t = getActiveTender(); if (!t) return;
  const orderId = $("odOrderIdInput").value;
  const order   = t.orders.find(x => x.id === orderId); if (!order) return;

  const evFile = $("odEvidenceFile").files[0];
  if (!evFile) { $("odEvidenceError").textContent = "Debes adjuntar PDF o imagen de la remisión."; return; }
  const ok = evFile.type.startsWith("image/") || evFile.type === "application/pdf";
  if (!ok) { $("odEvidenceError").textContent = "Solo se permiten PDF o imágenes."; return; }
  $("odEvidenceError").textContent = "";

  const qty  = toPositiveNumber($("odQtyInput").value);
  if (qty <= 0) return;

  const delivery = normalizeOrderDelivery({
    id:          createId("od"),
    qty,
    date:        $("odDateInput").value || today(),
    receivedBy:  $("odReceivedByInput").value.trim(),
    remisionNum: $("odRemisionInput").value.trim(),
    notes:       $("odNotesInput").value.trim(),
    evidenceName:   evFile.name,
    evidenceSize:   evFile.size,
    evidenceMime:   evFile.type,
    evidenceStatus: "Subiendo",
    createdAt:   new Date().toISOString(),
  });

  order.deliveries.push(delivery);
  const totalDel = getOrderDeliveredQty(order);
  order.qtyDelivered = totalDel;
  if (totalDel >= order.qtyOrdered) order.status = "Entregado";
  else if (totalDel > 0)            order.status = "Parcial";

  saveState();
  closeDialog("orderDeliveryDialog");
  render();

  uploadOrderEvidence(evFile, order, t, delivery);
}

async function uploadOrderEvidence(file, order, tender, delivery) {
  try {
    await uploadToDrive(file, { type: "Remisión-Pedido", name: file.name, uploadedAt: new Date().toISOString() }, tender);
    if (delivery) { delivery.evidenceStatus = "Enviado a Drive"; saveState(); renderOrders(tender); refreshIcons(); }
  } catch {
    if (delivery) { delivery.evidenceStatus = "Error al subir"; saveState(); renderOrders(tender); refreshIcons(); }
  }
}

async function handleUploadSubmit(e) {
  e.preventDefault();
  const t = getActiveTender();
  const file = $("documentFile").files[0];
  if (!t || !file) return;

  const doc = normalizeDocument({
    id: createId("doc"), type: $("documentType").value,
    name: file.name, mime: file.type || "application/octet-stream",
    size: file.size, status: "Subiendo", uploadedAt: new Date().toISOString(),
  });
  t.documents.unshift(doc);
  saveState(); renderDocuments(t);
  $("uploadStatus").textContent = "Subiendo a Google Drive...";

  try {
    await uploadToDrive(file, doc, t);
    doc.status = "Enviado a Drive";
    $("uploadStatus").textContent = "✓ Archivo enviado a Google Drive.";
    $("uploadForm").reset();
  } catch (err) {
    doc.status = "Error al subir";
    $("uploadStatus").textContent = "✗ Error al subir. Revisa el endpoint.";
    console.error(err);
  }
  saveState(); renderDocuments(t); refreshIcons();
}

async function handlePhaseUploadSubmit(e) {
  e.preventDefault();
  const t       = getActiveTender();
  const phaseId = $("phaseIdInput").value;
  const file    = $("phaseDocFile").files[0];
  const docName = $("phaseDocNameInput").value.trim();
  if (!t || !phaseId || !file || !docName) return;

  if (!t.phaseDocs) t.phaseDocs = {};
  if (!Array.isArray(t.phaseDocs[phaseId])) t.phaseDocs[phaseId] = [];

  const doc = normalizePhaseDoc({
    id: createId("phd"), name: docName,
    mime: file.type || "application/octet-stream",
    size: file.size, status: "Subiendo", uploadedAt: new Date().toISOString(),
  });
  t.phaseDocs[phaseId].push(doc);
  saveState();
  $("phaseUploadStatus").textContent = "Subiendo a Google Drive...";
  renderPhases(t);

  try {
    await uploadToDrive(file, { type: `Fase-${phaseId}`, name: docName, uploadedAt: doc.uploadedAt }, t);
    doc.status = "Enviado a Drive";
    $("phaseUploadStatus").textContent = "✓ Documento enviado.";
    saveState();
    setTimeout(() => { closeDialog("phaseUploadDialog"); renderPhases(t); refreshIcons(); }, 1000);
  } catch (err) {
    doc.status = "Error al subir";
    $("phaseUploadStatus").textContent = "✗ Error al subir. Revisa el endpoint.";
    saveState(); renderPhases(t); refreshIcons();
    console.error(err);
  }
}

function handleQuoteLineSubmit(e) {
  e.preventDefault();
  const t = getActiveTender(); if (!t) return;
  const id = $("quoteLineIdInput").value;
  const payload = {
    description: $("quoteLineDescInput").value.trim(),
    unit:        $("quoteLineUnitInput").value.trim() || "pieza",
    quantity:    toPositiveNumber($("quoteLineQtyInput").value),
    unitPrice:   toPositiveNumber($("quoteLinePriceInput").value),
  };
  if (!payload.description || payload.quantity <= 0) return;
  if (id) {
    const l = t.quoteLines.find(x => x.id === id); if (l) Object.assign(l, payload);
  } else {
    t.quoteLines.push(normalizeQuoteLine({ id: createId("ql"), ...payload }));
  }
  saveState(); closeDialog("quoteLineDialog"); renderQuote(t);
}

function handleQuoteLineTableClick(e) {
  const btn = e.target.closest("[data-delete-quoteline]"); if (!btn) return;
  const t = getActiveTender(); if (!t) return;
  if (!confirm("¿Eliminar esta línea?")) return;
  t.quoteLines = t.quoteLines.filter(l => l.id !== btn.dataset.deleteQuoteline);
  saveState(); renderQuote(t);
}

function handleUserSubmit(e) {
  e.preventDefault();
  if (!getCurrentUser()?.isAdmin) return;
  const username = $("newUsernameInput").value.trim().toLowerCase();
  const password = $("newUserPasswordInput").value;
  const name     = $("newUserNameInput").value.trim();
  const role     = $("newUserRoleInput").value;
  const err      = $("userFormError"); err.textContent = "";

  if (!username || !password || !name) { err.textContent = "Completa todos los campos."; return; }
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) { err.textContent = "Usuario: 3-32 chars, solo letras, números, punto, guion."; return; }
  if (password.length < 6) { err.textContent = "Contraseña mínimo 6 caracteres."; return; }
  if (state.users.some(u => u.username === username)) { err.textContent = "Ese usuario ya existe."; return; }

  state.users.push(normalizeUser({ id: createId("usr"), username, password, name, role, isAdmin:false, protected:false, createdAt:new Date().toISOString() }));
  saveState(); $("userForm").reset(); renderUsers(); refreshIcons();
}

function deleteActiveTender() {
  const t = getActiveTender(); if (!t) return;
  if (!confirm(`¿Eliminar la licitación "${t.name}"?`)) return;
  state.tenders = state.tenders.filter(x => x.id !== t.id);
  state.activeTenderId = state.tenders[0]?.id || null;
  saveState(); render();
}
