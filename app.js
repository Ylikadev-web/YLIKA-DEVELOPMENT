// ─── CONFIG ───────────────────────────────────────────────────────────────────
const ADMIN_USER     = "admin";
const ADMIN_PASSWORD = "adminmike2026_ylikadev_2026";
const ADMIN_NAME     = "Administrador";
const STORAGE_KEY    = "ylika_tender_admin_state_v3";
const SESSION_KEY    = "ylika_tender_admin_session";
const IVA_RATE       = 0.16;

const GOOGLE_DRIVE_WEBHOOK =
  "https://script.google.com/macros/s/AKfycbzRW_LJUTKNhcGo9tJCZGpdz44ZOxROajeasmfeLh2bYl7UD7dCddIWv8Mawy67QNEg/exec";

// ─── QUOTE TEMPLATES ──────────────────────────────────────────────────────────
const QUOTE_TEMPLATES = {
  ylika_materiales: {
    id: "ylika_materiales",
    label: "YLIKA Materiales",
    company: "GRUPO YLIKA",
    subtitle: "Distribuidora de materiales, YLIKA MATERIALES",
    website: "https://ylikamateriales.com",
    phones: "55-8550-7827 | 55-1957-2484 | 56-2424-0009 | 56-3407-1953",
    emails: "ylikamateriales@gmail.com · atencionylika@gmail.com · ventas@ylikamateriales.com",
    conditions: [
      "                                                                         "
      "PRECIOS Y CONDICIONES SUJETOS A CAMBIOS SIN PREVIO AVISO (PRECIO AL DÍA).",
      "TIEMPO DE ENTREGA ESTIMADO ES DE 24 A 72 HORAS, CON EXCEPCIONES EN ALGUNOS MATERIALES.",
      "UNA VEZ CONFIRMADO EL PEDIDO NO SE PODRÁN HACER CAMBIOS EN DÍA Y LUGAR DE ENTREGA.",
      "NO NOS HACEMOS RESPONSABLES DE GASTOS RELACIONADOS CON LOS TIEMPOS ESTABLECIDOS DE ENTREGA, CAMBIOS O DEVOLUCIONES.",
      "NO SE ACEPTAN CAMBIOS NI DEVOLUCIONES UNA VEZ CONFIRMADA LA COTIZACIÓN.",
      "PARA REALIZAR UN PAGO FAVOR DE NOTIFICAR AL ÁREA DE ATENCIÓN AL CLIENTE 56-2424-0009.",
    ],
    accentColor: "#20f7d2",
  },
  mone: {
    id: "mone",
    label: "Distribuidora Mone",
    company: "DISTRIBUIDORA DE MATERIALES Y CONSTRUCCIÓN MONE",
    subtitle: "Materiales de construcción y ferretería",
    website: "",
    phones: "55-8550-7827 | 56-2424-0009 | 5549008090",
    emails: "distribuidoramoneventas@gmail.com",
    conditions: [
      "                                                                         "
      "PRECIOS SUJETOS A CAMBIOS SIN PREVIO AVISO.",
      "TIEMPO DE ENTREGA ESTIMADO: 24 A 72 HORAS.",
      "UNA VEZ CONFIRMADO EL PEDIDO NO SE PODRÁN HACER MODIFICACIONES.",
      "NO SE ACEPTAN DEVOLUCIONES UNA VEZ CONFIRMADA LA COTIZACIÓN.",
    ],
    accentColor: "#ba63ff",
  },
};

// ─── FASES LICITACIÓN ─────────────────────────────────────────────────────────
const LICITACION_PHASES = [
  { id:"p1", name:"Convocatoria / Invitación",   icon:"megaphone",               color:"var(--accent)",  desc:"Publicación en CompraNet, DOF o convocatoria restringida." },
  { id:"p2", name:"Junta de Aclaraciones",       icon:"message-circle-question", color:"var(--violet)",  desc:"Reunión para resolver dudas sobre las bases." },
  { id:"p3", name:"Presentación y Apertura",     icon:"package-open",            color:"var(--warning)", desc:"Recepción de sobres con propuestas técnicas y económicas." },
  { id:"p4", name:"Evaluación de Proposiciones", icon:"clipboard-list",          color:"#38a8ff",        desc:"Análisis técnico y económico de las propuestas." },
  { id:"p5", name:"Fallo",                       icon:"gavel",                   color:"var(--success)", desc:"Comunicación oficial del resultado y proveedor adjudicado." },
  { id:"p6", name:"Firma de Contrato",           icon:"file-signature",          color:"var(--accent)",  desc:"Formalización del instrumento jurídico." },
  { id:"p7", name:"Ejecución / Entregas",        icon:"truck",                   color:"var(--warning)", desc:"Cumplimiento: entregas parciales y verificación de calidad." },
  { id:"p8", name:"Finiquito y Cierre",          icon:"check-circle-2",          color:"var(--success)", desc:"Verificación de cumplimiento, devolución de garantías y cierre." },
];

// ─── STATE ────────────────────────────────────────────────────────────────────
const state = {
  tenders: [], users: [],
  activeTenderId: null, activeTab: "products", search: "",
};

// ─── FORMATTERS ──────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const money  = new Intl.NumberFormat("es-MX", { style:"currency", currency:"MXN" });
const number = new Intl.NumberFormat("es-MX", { maximumFractionDigits:2 });
const dateFmt = new Intl.DateTimeFormat("es-MX", { day:"2-digit", month:"short", year:"numeric" });

function createId(p) { return `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`; }
function toPos(v) { const n=Number(v); return Number.isFinite(n)&&n>0?n:0; }
function today() { return new Date().toISOString().slice(0,10); }
function fmtDate(v) {
  if (!v) return "Sin fecha";
  const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  const d=m?new Date(+m[1],+m[2]-1,+m[3]):new Date(v);
  return isNaN(d)?v:dateFmt.format(d);
}
function fmtSize(b) {
  if (!b) return "0 B";
  const u=["B","KB","MB","GB"]; let s=b,i=0;
  while(s>=1024&&i<u.length-1){s/=1024;i++;}
  return `${number.format(s)} ${u[i]}`;
}
function esc(v) {
  return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;")
    .replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}
function escA(v) { return esc(v).replaceAll("`","&#096;"); }
function emptyRow(t,c) { const r=document.createElement("tr"); r.innerHTML=`<td colspan="${c}" class="empty-row">${esc(t)}</td>`; return r; }
function refreshIcons() { if (window.lucide) window.lucide.createIcons(); }
function readAsDataUrl(f) {
  return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(String(r.result)); r.onerror=()=>rej(r.error); r.readAsDataURL(f); });
}

// ─── DRIVE UPLOAD ─────────────────────────────────────────────────────────────
async function uploadToDrive(file, meta, tender) {
  const dataUrl = await readAsDataUrl(file);
  const payload = {
    fileName: file.name, mimeType: file.type||"application/octet-stream",
    fileBase64: dataUrl.split(",")[1]||"", documentType: meta.type||"Archivo",
    tenderId: tender.id, tenderName: tender.name,
    contract: tender.contract, client: tender.client, uploadedAt: meta.uploadedAt,
  };
  await fetch(GOOGLE_DRIVE_WEBHOOK, {
    method:"POST", mode:"no-cors",
    headers:{"Content-Type":"text/plain"},
    body: JSON.stringify(payload),
  });
  return "";
}

// ─── NORMALIZE ────────────────────────────────────────────────────────────────
function normalizeUser(u) {
  return {
    id: u.id||createId("usr"),
    username: String(u.username||"").trim().toLowerCase(),
    password: String(u.password||""),
    name: String(u.name||u.username||"").trim(),
    role: u.role||"Usuario",
    isAdmin: Boolean(u.isAdmin),
    isPartner: Boolean(u.isPartner),
    protected: Boolean(u.protected),
    createdAt: u.createdAt||new Date().toISOString(),
  };
}

function normalizeProduct(p) {
  return {
    id: p.id||createId("prd"), name: p.name||"", unit: p.unit||"pieza",
    sector: p.sector||"", partida: p.partida||"",
    quantity: Number(p.quantity)||0, unitPrice: Number(p.unitPrice)||0,
    profitPct: Number(p.profitPct)||0,
    contractType: p.contractType||"in", substituteId: p.substituteId||"",
  };
}

function normalizeOrder(o) {
  return {
    id: o.id||createId("ord"), number: o.number||"", productId: o.productId||"",
    qtyOrdered: Number(o.qtyOrdered)||0, qtyDelivered: Number(o.qtyDelivered)||0,
    date: o.date||today(), eta: o.eta||"", requestedBy: o.requestedBy||"",
    notes: o.notes||"", status: o.status||"Pendiente",
    deliveries: Array.isArray(o.deliveries)?o.deliveries.map(normalizeOD):[],
    createdAt: o.createdAt||new Date().toISOString(),
  };
}

function normalizeOD(d) {
  return {
    id: d.id||createId("od"), qty: Number(d.qty)||0, date: d.date||today(),
    receivedBy: d.receivedBy||"", remisionNum: d.remisionNum||"",
    notes: d.notes||"", evidenceName: d.evidenceName||"",
    evidenceSize: Number(d.evidenceSize)||0, evidenceMime: d.evidenceMime||"",
    evidenceStatus: d.evidenceStatus||"", evidenceDriveUrl: d.evidenceDriveUrl||"",
    createdAt: d.createdAt||new Date().toISOString(),
  };
}

function normalizeDoc(d) {
  return {
    id: d.id||createId("doc"), type: d.type||"Otro", name: d.name||"",
    mime: d.mime||"", size: Number(d.size)||0, status: d.status||"Registrado",
    uploadedAt: d.uploadedAt||new Date().toISOString(), driveUrl: d.driveUrl||"",
  };
}

function normalizeQL(l) {
  return {
    id: l.id||createId("ql"), description: l.description||"",
    unit: l.unit||"pieza", quantity: Number(l.quantity)||0, unitPrice: Number(l.unitPrice)||0,
  };
}

function normalizePhaseDoc(d) {
  return {
    id: d.id||createId("phd"), name: d.name||"", mime: d.mime||"",
    size: Number(d.size)||0, status: d.status||"Registrado",
    uploadedAt: d.uploadedAt||new Date().toISOString(), driveUrl: d.driveUrl||"",
  };
}

function normalizePhaseDocs(raw) {
  const r={};
  LICITACION_PHASES.forEach(ph=>{r[ph.id]=Array.isArray(raw?.[ph.id])?raw[ph.id].map(normalizePhaseDoc):[];});
  return r;
}

function normalizeTender(t) {
  return {
    id: t.id||createId("lic"), name: t.name||"", client: t.client||"",
    clientAddress: t.clientAddress||"", clientPhone: t.clientPhone||"", clientEmail: t.clientEmail||"",
    contract: t.contract||"", deadline: t.deadline||"", notes: t.notes||"",
    status: t.status||"Activa", createdAt: t.createdAt||new Date().toISOString(),
    quoteNumber: t.quoteNumber||"", quoteCreatedAt: t.quoteCreatedAt||"",
    quoteUpdatedAt: t.quoteUpdatedAt||"",
    quoteTemplate: t.quoteTemplate||"ylika_materiales",
    products:   Array.isArray(t.products)?t.products.map(normalizeProduct):[],
    orders:     Array.isArray(t.orders)?t.orders.map(normalizeOrder):[],
    documents:  Array.isArray(t.documents)?t.documents.map(normalizeDoc):[],
    quoteLines: Array.isArray(t.quoteLines)?t.quoteLines.map(normalizeQL):[],
    phaseDocs:  normalizePhaseDocs(t.phaseDocs),
    partnerAllocs: Array.isArray(t.partnerAllocs)?t.partnerAllocs:[],
  };
}

function normalizeUsers(users) {
  const n=Array.isArray(users)?users.map(normalizeUser).filter(u=>u.username&&u.password):[];
  const a=n.find(u=>u.username===ADMIN_USER);
  if (a) {
    Object.assign(a,{password:ADMIN_PASSWORD,name:a.name||ADMIN_NAME,role:"Admin",isAdmin:true,protected:true});
    return [a,...n.filter(u=>u.id!==a.id)];
  }
  return [normalizeUser({id:"usr_admin",username:ADMIN_USER,password:ADMIN_PASSWORD,name:ADMIN_NAME,role:"Admin",isAdmin:true,protected:true,createdAt:new Date().toISOString()}),...n];
}

// ─── STORAGE ──────────────────────────────────────────────────────────────────
function loadState() {
  try {
    const s=JSON.parse(localStorage.getItem(STORAGE_KEY));
    // Also try old key for migration
    const old=!s&&JSON.parse(localStorage.getItem("ylika_tender_admin_state"));
    const data = s || old;
    if (!data||!Array.isArray(data.tenders)){state.users=normalizeUsers([]);return;}
    state.tenders       = data.tenders.map(normalizeTender);
    state.users         = normalizeUsers(data.users);
    state.activeTenderId= data.activeTenderId||state.tenders[0]?.id||null;
    if (!s && old) saveState(); // migrate
  } catch {
    state.tenders=[]; state.users=normalizeUsers([]); state.activeTenderId=null;
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    tenders:state.tenders, users:state.users, activeTenderId:state.activeTenderId,
  }));
}

// ─── ACCESSORS ────────────────────────────────────────────────────────────────
function getActiveTender() { return state.tenders.find(t=>t.id===state.activeTenderId)||null; }
function getCurrentUser()  { const u=sessionStorage.getItem(SESSION_KEY); return u?state.users.find(x=>x.username===u)||null:null; }
function canSeePartners()  { const u=getCurrentUser(); return u&&(u.isAdmin||u.role==="Socio"||u.isPartner); }
function getProductTotal(p){ return p.quantity*p.unitPrice*(1+IVA_RATE); }
function getODQty(o)       { return o.deliveries.reduce((s,d)=>s+d.qty,0); }
function getProductDelivered(t,pid){ return t.orders.filter(o=>o.productId===pid).flatMap(o=>o.deliveries).reduce((s,d)=>s+d.qty,0); }
function getFinancials(t)  {
  const lines=t.quoteLines?.length?t.quoteLines:[];
  const sub=lines.reduce((s,l)=>s+l.quantity*l.unitPrice,0);
  return {subtotal:sub,iva:sub*IVA_RATE,total:sub*(1+IVA_RATE)};
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded",()=>{ loadState(); bindEvents(); renderAuth(); });

// ─── BIND EVENTS ─────────────────────────────────────────────────────────────
function bindEvents() {
  $("loginForm").addEventListener("submit", handleLogin);
  $("logoutButton").addEventListener("click", handleLogout);
  $("usersButton").addEventListener("click", openUsersDialog);
  $("partnersButton").addEventListener("click", openPartnersDialog);
  $("syncButton").addEventListener("click", ()=>openDialog("syncDialog"));
  $("newTenderButton").addEventListener("click", ()=>openTenderDialog());
  document.querySelectorAll("[data-open-tender]").forEach(b=>b.addEventListener("click",()=>openTenderDialog()));
  document.querySelectorAll("[data-close-dialog]").forEach(b=>b.addEventListener("click",()=>closeDialog(b.dataset.closeDialog)));

  $("searchInput").addEventListener("input", e=>{ state.search=e.target.value.trim().toLowerCase(); renderTenderList(); });

  $("tenderForm").addEventListener("submit", handleTenderSubmit);
  $("productForm").addEventListener("submit", handleProductSubmit);
  $("orderForm").addEventListener("submit", handleOrderSubmit);
  $("orderDeliveryForm").addEventListener("submit", handleOrderDeliverySubmit);
  $("uploadForm").addEventListener("submit", handleUploadSubmit);
  $("userForm").addEventListener("submit", handleUserSubmit);
  $("quoteLineForm").addEventListener("submit", handleQuoteLineSubmit);
  $("phaseUploadForm").addEventListener("submit", handlePhaseUploadSubmit);

  $("editTenderButton").addEventListener("click",()=>{ const t=getActiveTender(); if(t) openTenderDialog(t); });
  $("deleteTenderButton").addEventListener("click", deleteActiveTender);
  $("statusSelect").addEventListener("change", e=>{ const t=getActiveTender(); if(!t)return; t.status=e.target.value; saveState(); render(); });

  $("newProductButton").addEventListener("click", openProductDialog);
  $("newOrderButton").addEventListener("click", openOrderDialog);
  $("printFinalRemisionButton").addEventListener("click", printFinalRemision);

  $("generateQuoteButton").addEventListener("click", generateQuote);
  $("printQuoteButton").addEventListener("click", printQuote);
  $("addQuoteLineButton").addEventListener("click", ()=>openQuoteLineDialog());
  $("importProductsButton").addEventListener("click", importProductsToQuote);

  $("productsTable").addEventListener("change", handleProductTableChange);
  $("productsTable").addEventListener("click", handleProductTableClick);
  $("documentsTable").addEventListener("click", handleDocumentTableClick);
  $("quoteLinesTable").addEventListener("click", handleQLTableClick);
  $("usersTable").addEventListener("click", handleUsersTableClick);

  ["priceInput","profitInput"].forEach(id=>$(id).addEventListener("input",updatePriceCalc));
  document.querySelectorAll("input[name='contractType']").forEach(r=>{
    r.addEventListener("change",()=>$("substituteRow").classList.toggle("is-hidden",!$("contractTypeOut").checked));
  });
  document.querySelectorAll(".tab-button").forEach(b=>{
    b.addEventListener("click",()=>{ state.activeTab=b.dataset.tab; renderDetail(); });
  });

  // Sync export/import
  $("exportDataButton").addEventListener("click", exportData);
  $("importDataFile").addEventListener("change", importData);
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────
function handleLogin(e) {
  e.preventDefault();
  const u=$("usernameInput").value.trim().toLowerCase();
  const p=$("passwordInput").value;
  const user=state.users.find(x=>x.username===u&&x.password===p);
  if (user) {
    sessionStorage.setItem(SESSION_KEY,user.username);
    $("loginError").textContent=""; $("passwordInput").value="";
    renderAuth(); return;
  }
  $("loginError").textContent="Usuario o contraseña incorrectos.";
}
function handleLogout(){ sessionStorage.removeItem(SESSION_KEY); renderAuth(); }

function renderAuth() {
  const cu=getCurrentUser(); const ok=Boolean(cu);
  $("loginScreen").classList.toggle("is-hidden",ok);
  $("appShell").classList.toggle("is-hidden",!ok);
  if (ok) {
    $("currentUserLabel").textContent=cu.name||cu.username;
    $("usersButton").classList.toggle("is-hidden",!cu.isAdmin);
    $("partnersButton").classList.toggle("is-hidden",!canSeePartners());
    render();
  }
  refreshIcons();
}

// ─── RENDER ───────────────────────────────────────────────────────────────────
function render() {
  if (!state.activeTenderId&&state.tenders.length) state.activeTenderId=state.tenders[0].id;
  renderMetrics(); renderTenderList(); renderDetail(); renderUsers(); refreshIcons();
}

function renderMetrics() {
  const total=state.tenders.reduce((s,t)=>s+getFinancials(t).total,0);
  const cU=state.tenders.reduce((s,t)=>s+t.products.reduce((x,p)=>x+p.quantity,0),0);
  const dU=state.tenders.reduce((s,t)=>s+t.orders.flatMap(o=>o.deliveries).reduce((x,d)=>x+d.qty,0),0);
  const docs=state.tenders.reduce((s,t)=>s+t.documents.length,0);
  $("totalTenders").textContent=state.tenders.length;
  $("contractedTotal").textContent=money.format(total);
  $("deliveredTotal").textContent=`${number.format(cU?Math.min(100,(dU/cU)*100):0)}%`;
  $("documentTotal").textContent=docs;
}

function renderTenderList() {
  const list=$("tenderList"); list.replaceChildren();
  const filtered=state.tenders.filter(t=>`${t.name} ${t.client} ${t.contract}`.toLowerCase().includes(state.search));
  if (!filtered.length) {
    const p=document.createElement("p"); p.className="empty-row";
    p.textContent=state.search?"Sin coincidencias.":"Sin licitaciones."; list.append(p); return;
  }
  filtered.forEach(t=>{
    const f=getFinancials(t);
    const btn=document.createElement("button"); btn.type="button"; btn.className="tender-card";
    btn.classList.toggle("is-active",t.id===state.activeTenderId);
    btn.addEventListener("click",()=>{ state.activeTenderId=t.id; saveState(); render(); });
    btn.innerHTML=`<span class="status-pill" data-status="${esc(t.status)}">${esc(t.status)}</span>
      <strong>${esc(t.name)}</strong><small>${esc(t.client)} · ${esc(t.contract)}</small>
      <small>${money.format(f.total)}</small>`;
    list.append(btn);
  });
}

function renderDetail() {
  const t=getActiveTender();
  $("emptyState").classList.toggle("is-hidden",Boolean(t));
  $("detailView").classList.toggle("is-hidden",!t);
  if (!t) return;
  $("detailMeta").textContent=`${t.contract} · ${fmtDate(t.deadline)}`;
  $("detailTitle").textContent=t.name;
  $("detailClient").textContent=t.client;
  $("statusSelect").value=t.status;
  document.querySelectorAll(".tab-button").forEach(b=>b.classList.toggle("is-active",b.dataset.tab===state.activeTab));
  const panels={products:"productsPanel",orders:"ordersPanel",quote:"quotePanel",documents:"documentsPanel",phases:"phasesPanel"};
  Object.entries(panels).forEach(([k,id])=>$(id).classList.toggle("is-hidden",k!==state.activeTab));
  renderProducts(t); renderOrders(t); renderQuote(t); renderDocuments(t); renderPhases(t);
  refreshIcons();
}

// ─── PRODUCTS ─────────────────────────────────────────────────────────────────
function renderProducts(t) {
  const tbody=$("productsTable"); tbody.replaceChildren();
  if (!t.products.length){ tbody.append(emptyRow("Sin productos registrados.",12)); return; }
  t.products.forEach(p=>{
    const del=getProductDelivered(t,p.id);
    const pct=p.quantity?Math.min(100,(del/p.quantity)*100):0;
    const withIva=p.unitPrice*(1+IVA_RATE);
    const withProfit=p.unitPrice*(1+IVA_RATE)*(1+(p.profitPct||0)/100);
    const badge=p.contractType==="out"
      ?`<span class="badge-out">Fuera</span>`:`<span class="badge-in">Contrato</span>`;
    const subNote=p.contractType==="out"&&p.substituteId
      ?`<small class="sub-note">↔ ${esc(t.products.find(x=>x.id===p.substituteId)?.name||"?")}</small>`:"";
    const row=document.createElement("tr");
    row.innerHTML=`
      <td>${badge}${subNote}</td>
      <td><input data-pid="${p.id}" data-pf="name" value="${escA(p.name)}" /></td>
      <td><input data-pid="${p.id}" data-pf="sector" value="${escA(p.sector)}" placeholder="Sector" style="min-width:80px"/></td>
      <td><span class="partida-badge">${esc(p.partida||"—")}</span></td>
      <td><input data-pid="${p.id}" data-pf="unit" value="${escA(p.unit)}" style="min-width:60px"/></td>
      <td><input data-pid="${p.id}" data-pf="quantity" type="number" min="0" step="0.01" value="${p.quantity}" /></td>
      <td><input data-pid="${p.id}" data-pf="unitPrice" type="number" min="0" step="0.01" value="${p.unitPrice}" /></td>
      <td class="number-cell">${money.format(withIva)}</td>
      <td class="number-cell">
        <input data-pid="${p.id}" data-pf="profitPct" type="number" min="0" step="0.1" value="${p.profitPct||0}" style="min-width:55px" />
        <small>${money.format(withProfit)}</small>
      </td>
      <td><div class="progress-line">
        <span>${number.format(del)} / ${number.format(p.quantity)}</span>
        <div class="progress-track"><div class="progress-fill" style="--progress:${pct}%"></div></div>
      </div></td>
      <td class="number-cell">${money.format(getProductTotal(p))}</td>
      <td><button class="icon-button" type="button" data-delete-product="${p.id}"><i data-lucide="trash-2"></i></button></td>`;
    tbody.append(row);
  });
}

function handleProductTableChange(e) {
  const {pid:productId, pf:productField}=e.target.dataset; if(!productId||!productField) return;
  const t=getActiveTender(); const p=t?.products.find(x=>x.id===productId); if(!p) return;
  ["quantity","unitPrice","profitPct"].includes(productField)?p[productField]=toPos(e.target.value):p[productField]=e.target.value.trim();
  saveState(); render();
}

function handleProductTableClick(e) {
  const btn=e.target.closest("[data-delete-product]"); if(!btn) return;
  const t=getActiveTender(); if(!t) return;
  const p=t.products.find(x=>x.id===btn.dataset.deleteProduct); if(!p) return;
  if(!confirm(`¿Eliminar "${p.name}" y sus pedidos?`)) return;
  t.products=t.products.filter(x=>x.id!==p.id);
  t.orders=t.orders.filter(o=>o.productId!==p.id);
  saveState(); render();
}

// ─── ORDERS ───────────────────────────────────────────────────────────────────
function renderOrders(t) {
  const container=$("ordersContainer"); container.replaceChildren();
  if (!t.products.length){ container.innerHTML=`<p class="empty-row" style="padding:20px">Primero agrega productos al contrato.</p>`; return; }
  if (!t.orders.length){ container.innerHTML=`<p class="empty-row" style="padding:20px">Sin pedidos registrados.</p>`; return; }
  const byProd={};
  t.products.forEach(p=>{byProd[p.id]={product:p,orders:[]};});
  t.orders.forEach(o=>{
    if(byProd[o.productId]) byProd[o.productId].orders.push(o);
    else {
      if(!byProd["__del__"]) byProd["__del__"]={product:{id:"__del__",name:"Producto eliminado",unit:""},orders:[]};
      byProd["__del__"].orders.push(o);
    }
  });
  Object.values(byProd).filter(g=>g.orders.length).forEach(({product,orders})=>{
    const tot=orders.reduce((s,o)=>s+o.qtyOrdered,0);
    const del=orders.reduce((s,o)=>s+getODQty(o),0);
    const pct=tot?Math.min(100,(del/tot)*100):0;
    const sec=document.createElement("div"); sec.className="order-product-section";
    sec.innerHTML=`
      <div class="order-product-header">
        <div>
          <strong>${esc(product.name)}</strong>
          <small>${esc(product.sector||"")} ${product.partida?"· Partida: "+esc(product.partida):""}</small>
        </div>
        <div class="order-product-stats">
          <span>${number.format(del)} / ${number.format(tot)} ${esc(product.unit)}</span>
          <div class="progress-track" style="width:120px"><div class="progress-fill" style="--progress:${pct}%"></div></div>
        </div>
      </div>
      <div class="responsive-table">
        <table>
          <thead><tr><th>Pedido</th><th>Fecha</th><th>Pedido</th><th>Entregado</th><th>Estatus</th><th>Solicitó</th><th>Remisiones</th><th></th></tr></thead>
          <tbody id="orows_${product.id}"></tbody>
        </table>
      </div>`;
    container.append(sec);
    const tbody=sec.querySelector(`#orows_${product.id}`);
    orders.forEach(o=>{
      const odel=getODQty(o);
      const chips=o.deliveries.map(d=>{
        const ev=d.evidenceDriveUrl?`<a href="${escA(d.evidenceDriveUrl)}" target="_blank"><i data-lucide="external-link"></i></a>`
          :(d.evidenceName?`<span title="${escA(d.evidenceName)}"><i data-lucide="file-check"></i></span>`:"");
        return `<div class="delivery-chip">${esc(d.remisionNum||d.id.slice(-6))} · ${number.format(d.qty)} · ${fmtDate(d.date)} ${ev}</div>`;
      }).join("");
      const row=document.createElement("tr");
      row.innerHTML=`
        <td><strong>${esc(o.number)}</strong></td>
        <td>${fmtDate(o.date)}</td>
        <td class="number-cell">${number.format(o.qtyOrdered)} ${esc(product.unit)}</td>
        <td class="number-cell">${number.format(odel)} ${esc(product.unit)}</td>
        <td><span class="status-pill" data-status="${esc(o.status)}">${esc(o.status)}</span></td>
        <td>${esc(o.requestedBy||"—")}</td>
        <td><div class="remision-list">${chips||"Sin remisiones"}</div></td>
        <td><div style="display:flex;gap:6px">
          ${o.status!=="Entregado"&&o.status!=="Cancelado"
            ?`<button class="icon-button" type="button" data-deliver-order="${o.id}" title="Registrar entrega"><i data-lucide="truck"></i></button>`:""}
          <button class="icon-button" type="button" data-cancel-order="${o.id}" ${o.status==="Cancelado"?"disabled":""}><i data-lucide="x-circle"></i></button>
          <button class="icon-button danger-button" type="button" data-delete-order="${o.id}"><i data-lucide="trash-2"></i></button>
        </div></td>`;
      tbody.append(row);
    });
  });
  container.querySelectorAll("[data-deliver-order]").forEach(b=>b.addEventListener("click",()=>openOrderDeliveryDialog(b.dataset.deliverOrder)));
  container.querySelectorAll("[data-cancel-order]").forEach(b=>b.addEventListener("click",()=>{
    const t=getActiveTender(); const o=t?.orders.find(x=>x.id===b.dataset.cancelOrder); if(!o) return;
    if(!confirm(`¿Cancelar ${o.number}?`)) return; o.status="Cancelado"; saveState(); render();
  }));
  container.querySelectorAll("[data-delete-order]").forEach(b=>b.addEventListener("click",()=>{
    const t=getActiveTender(); if(!t) return;
    if(!confirm("¿Eliminar este pedido?")) return;
    t.orders=t.orders.filter(x=>x.id!==b.dataset.deleteOrder); saveState(); render();
  }));
  refreshIcons();
}

// ─── FINAL REMISIÓN ───────────────────────────────────────────────────────────
function printFinalRemision() {
  const t=getActiveTender(); if(!t) return;
  const today_=new Date();
  const rows=t.products.map(p=>{
    const del=getProductDelivered(t,p.id);
    const pct=p.quantity?Math.min(100,(del/p.quantity)*100):0;
    // Collect all individual remisión chips
    const remisiones=t.orders.filter(o=>o.productId===p.id)
      .flatMap(o=>o.deliveries)
      .map(d=>`<span class="rem-chip">${esc(d.remisionNum||d.id.slice(-6))} · ${number.format(d.qty)} · ${fmtDate(d.date)}</span>`)
      .join(" ");
    return `<tr>
      <td>${esc(p.partida||"—")}</td>
      <td>${esc(p.name)}</td>
      <td style="text-align:center">${esc(p.unit)}</td>
      <td style="text-align:right">${number.format(p.quantity)}</td>
      <td style="text-align:right"><strong>${number.format(del)}</strong></td>
      <td style="text-align:right">${number.format(Math.max(0,p.quantity-del))}</td>
      <td style="text-align:center">
        <div class="print-progress" style="--pct:${pct}%"></div>
        <small>${number.format(pct)}%</small>
      </td>
      <td style="font-size:.75rem">${remisiones}</td>
    </tr>`;
  }).join("");

  $("finalRemisionPrint").innerHTML=`
    <div class="final-remision">
      <div class="fr-header">
        <div>
          <h1>REMISIÓN ACUMULADA</h1>
          <p class="fr-subtitle">Resumen total de entregas realizadas</p>
        </div>
        <div class="fr-meta">
          <p><strong>Licitación:</strong> ${esc(t.name)}</p>
          <p><strong>Cliente:</strong> ${esc(t.client)}</p>
          <p><strong>Contrato:</strong> ${esc(t.contract)}</p>
          <p><strong>Fecha emisión:</strong> ${fmtDate(today_.toISOString())}</p>
        </div>
      </div>
      <table class="fr-table">
        <thead>
          <tr>
            <th>Partida</th><th>Producto</th><th>Unidad</th>
            <th>Contratado</th><th>Entregado</th><th>Pendiente</th>
            <th>% Avance</th><th>Remisiones</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="fr-footer">
        <p>Emitido por YLIKA · ${today_.toLocaleDateString("es-MX",{day:"2-digit",month:"long",year:"numeric"})}</p>
      </div>
    </div>`;
  $("finalRemisionPrint").classList.remove("is-hidden");

  requestAnimationFrame(()=>{ window.print(); $("finalRemisionPrint").classList.add("is-hidden"); });
}

// ─── QUOTE ────────────────────────────────────────────────────────────────────
function renderQuote(t) {
  const lines=t.quoteLines||[];
  const sub=lines.reduce((s,l)=>s+l.quantity*l.unitPrice,0);
  const iva=sub*IVA_RATE; const total=sub+iva;
  $("quoteSummary").innerHTML=`
    <article><span>Subtotal</span><strong>${money.format(sub)}</strong></article>
    <article><span>IVA 16%</span><strong>${money.format(iva)}</strong></article>
    <article><span>Total con IVA</span><strong>${money.format(total)}</strong></article>`;
  const ltbody=$("quoteLinesTable"); ltbody.replaceChildren();
  if (!lines.length){ ltbody.append(emptyRow("Sin líneas. Agrega manualmente o importa de productos.",6)); }
  else {
    lines.forEach(l=>{
      const row=document.createElement("tr");
      row.innerHTML=`
        <td>${esc(l.description)}</td><td>${esc(l.unit)}</td>
        <td class="number-cell">${number.format(l.quantity)}</td>
        <td class="number-cell">${money.format(l.unitPrice)}</td>
        <td class="number-cell">${money.format(l.quantity*l.unitPrice)}</td>
        <td><button class="icon-button" type="button" data-delete-quoteline="${l.id}"><i data-lucide="trash-2"></i></button></td>`;
      ltbody.append(row);
    });
  }
  // Build print area
  buildQuotePrintArea(t, lines, sub, iva, total);
}

function buildQuotePrintArea(t, lines, sub, iva, total) {
  const tpl=QUOTE_TEMPLATES[t.quoteTemplate||"ylika_materiales"];
  const qNum=t.quoteNumber||"Sin folio";
  const qDate=t.quoteCreatedAt||new Date().toISOString();
  const tplOptions=Object.values(QUOTE_TEMPLATES).map(tp=>
    `<option value="${tp.id}" ${tp.id===t.quoteTemplate?"selected":""}>${tp.label}</option>`).join("");

  const itemRows=lines.length
    ?lines.map((l,i)=>`<tr>
        <td style="text-align:center">${i+1}</td>
        <td>${esc(l.description)}</td>
        <td style="text-align:center">${esc(l.unit)}</td>
        <td style="text-align:right">${number.format(l.quantity)}</td>
        <td style="text-align:right">${money.format(l.unitPrice)}</td>
        <td style="text-align:right"><strong>${money.format(l.quantity*l.unitPrice)}</strong></td>
      </tr>`).join("")
    :`<tr><td colspan="6" style="text-align:center;color:#888;padding:20px">Sin líneas registradas</td></tr>`;

  const conditions=tpl.conditions.map(c=>`<p>${esc(c)}</p>`).join("");

  $("quotePrintArea").innerHTML=`
    <!-- Template selector (screen only) -->
    <div class="quote-template-selector no-print">
      <label>Plantilla de cotización:
        <select id="quoteTemplateSelect" style="margin-left:8px">
          ${tplOptions}
        </select>
      </label>
    </div>

    <!-- QUOTE DOCUMENT -->
    <div class="quote-doc" id="quoteDocument">
      <!-- HEADER -->
      <div class="qd-header">
        <div class="qd-logo-block">
          <div class="qd-logo-mark" style="background:${tpl.accentColor}">
            <span style="color:#031119;font-weight:900;font-size:1.4rem">YL</span>
          </div>
          <div>
            <div class="qd-company">${esc(tpl.company)}</div>
            <div class="qd-company-sub">${esc(tpl.subtitle)}</div>
          </div>
        </div>
        <div class="qd-title-block">
          <div class="qd-big-title" style="color:${tpl.accentColor}">COTIZACIÓN</div>
          <div class="qd-folio-row">
            <span class="qd-folio-badge">${esc(qNum)}</span>
            <span class="qd-date-label">FECHA: <strong>${fmtDate(qDate)}</strong></span>
          </div>
        </div>
      </div>

      <!-- CLIENT INFO -->
      <div class="qd-client-block">
        <div class="qd-client-left">
          <div class="qd-section-label">PARA:</div>
          <div class="qd-client-name">${esc(t.client)}</div>
          ${t.clientAddress?`<div class="qd-client-detail">📍 ${esc(t.clientAddress)}</div>`:""}
          ${t.clientPhone?`<div class="qd-client-detail">📞 ${esc(t.clientPhone)}</div>`:""}
          ${t.clientEmail?`<div class="qd-client-detail">✉ ${esc(t.clientEmail)}</div>`:""}
        </div>
        <div class="qd-client-right">
          <div class="qd-section-label">CONTRATO RELACIONADO:</div>
          <div class="qd-contract-value">${esc(t.contract||"Ningún Contrato Relacionado")}</div>
          ${t.deadline?`<div class="qd-client-detail">Vence: ${fmtDate(t.deadline)}</div>`:""}
        </div>
      </div>

      <!-- ITEMS TABLE -->
      <table class="qd-table">
        <thead>
          <tr>
            <th style="width:40px;text-align:center">N</th>
            <th>DESCRIPCIÓN</th>
            <th style="width:80px;text-align:center">UNIDAD</th>
            <th style="width:80px;text-align:right">CANTIDAD</th>
            <th style="width:110px;text-align:right">COSTO UNIT.</th>
            <th style="width:120px;text-align:right">PRECIO</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>

      <!-- TOTALS -->
      <div class="qd-totals-row">
        <div></div>
        <div class="qd-totals">
          <div class="qd-total-line"><span>SUBTOTAL</span><strong>${money.format(sub)}</strong></div>
          <div class="qd-total-line"><span>IVA 16%</span><strong>${money.format(iva)}</strong></div>
          <div class="qd-total-line qd-total-final"><span>TOTAL</span><strong>${money.format(total)}</strong></div>
        </div>
      </div>

      <!-- CONDITIONS -->
      <div class="qd-conditions">
        <div class="qd-conditions-title">CONDICIONES DE COMPRA:</div>
        ${conditions}
      </div>

      <!-- FOOTER -->
      <div class="qd-footer">
        <div class="qd-footer-left">
          <p>Si tiene dudas sobre esta cotización, use la siguiente información de contacto:</p>
          <p class="qd-thanks">GRACIAS POR SU CONFIANZA</p>
          <p class="qd-footer-company">${esc(tpl.company)}</p>
          <p class="qd-footer-sub">${esc(tpl.subtitle)}</p>
          ${tpl.website?`<p><a href="${esc(tpl.website)}">${esc(tpl.website)}</a></p>`:""}
          <p>${esc(tpl.phones)}</p>
          <p>${esc(tpl.emails)}</p>
        </div>
      </div>
    </div>`;

  // Bind template selector
  const sel=$("quoteTemplateSelect");
  if (sel) {
    sel.addEventListener("change",()=>{
      const t2=getActiveTender(); if(!t2) return;
      t2.quoteTemplate=sel.value; saveState(); renderQuote(t2);
    });
  }
}

function generateQuote() {
  const t=getActiveTender(); if(!t) return;
  if (!t.quoteNumber) {
    const dp=new Date().toISOString().slice(0,10).replaceAll("-","");
    t.quoteNumber=`COT-${dp}-${String(state.tenders.indexOf(t)+1).padStart(3,"0")}`;
    t.quoteCreatedAt=new Date().toISOString();
  }
  t.quoteUpdatedAt=new Date().toISOString();
  state.activeTab="quote"; saveState(); render();
}

function printQuote() {
  const t=getActiveTender(); if(!t) return;
  if(!t.quoteNumber) generateQuote();
  // Hide everything except the quote doc
  document.body.dataset.printMode="quote";
  window.print();
  delete document.body.dataset.printMode;
}

function importProductsToQuote() {
  const t=getActiveTender();
  if(!t?.products.length){ alert("No hay productos para importar."); return; }
  if(!confirm("¿Agregar todos los productos como líneas de cotización? (No borra líneas existentes)")) return;
  t.products.forEach(p=>t.quoteLines.push(normalizeQL({description:p.name,unit:p.unit,quantity:p.quantity,unitPrice:p.unitPrice})));
  saveState(); renderQuote(t);
}

// ─── DOCUMENTS ────────────────────────────────────────────────────────────────
function renderDocuments(t) {
  const tbody=$("documentsTable"); tbody.replaceChildren();
  if (!t.documents.length){ tbody.append(emptyRow("Sin archivos registrados.",5)); return; }
  [...t.documents].sort((a,b)=>new Date(b.uploadedAt)-new Date(a.uploadedAt)).forEach(d=>{
    const link=d.driveUrl?`<a href="${escA(d.driveUrl)}" target="_blank">${esc(d.name)}</a>`:esc(d.name);
    const row=document.createElement("tr");
    row.innerHTML=`<td>${esc(d.type)}</td><td>${link}<br><small>${fmtSize(d.size)}</small></td>
      <td>${fmtDate(d.uploadedAt)}</td><td>${esc(d.status)}</td>
      <td><button class="icon-button" type="button" data-delete-document="${d.id}"><i data-lucide="trash-2"></i></button></td>`;
    tbody.append(row);
  });
}

function handleDocumentTableClick(e) {
  const btn=e.target.closest("[data-delete-document]"); if(!btn) return;
  const t=getActiveTender(); if(!t) return;
  if(!confirm("¿Eliminar?")) return;
  t.documents=t.documents.filter(x=>x.id!==btn.dataset.deleteDocument); saveState(); render();
}

// ─── PHASES ───────────────────────────────────────────────────────────────────
function renderPhases(t) {
  const container=$("phasesContainer"); container.replaceChildren();
  LICITACION_PHASES.forEach(ph=>{
    const docs=t.phaseDocs?.[ph.id]||[];
    const sec=document.createElement("div"); sec.className="phase-block";
    sec.innerHTML=`
      <div class="phase-header ${docs.length?"phase-has-docs":""}">
        <div class="phase-icon" style="--phase-color:${ph.color}"><i data-lucide="${ph.icon}"></i></div>
        <div class="phase-info"><strong>${esc(ph.name)}</strong><p>${esc(ph.desc)}</p></div>
        <div class="phase-actions">
          <span class="phase-doc-count ${docs.length?"has-docs":""}">${docs.length} doc${docs.length!==1?"s":""}</span>
          <button class="secondary-action phase-upload-btn" type="button" data-phase-id="${ph.id}" data-phase-name="${escA(ph.name)}">
            <i data-lucide="upload"></i> Subir
          </button>
        </div>
      </div>`;
    if (docs.length) {
      const dl=document.createElement("div"); dl.className="phase-doc-list";
      docs.forEach(d=>{
        const item=document.createElement("div"); item.className="phase-doc-item";
        const link=d.driveUrl?`<a href="${escA(d.driveUrl)}" target="_blank">${esc(d.name)}</a>`:`<span>${esc(d.name)}</span>`;
        item.innerHTML=`<i data-lucide="file-text"></i>
          <div>${link}<small>${fmtDate(d.uploadedAt)} · ${fmtSize(d.size)} · ${esc(d.status)}</small></div>
          <button class="icon-button" type="button" data-delete-pd="${d.id}" data-phase-id="${ph.id}"><i data-lucide="trash-2"></i></button>`;
        dl.append(item);
      });
      sec.append(dl);
    }
    container.append(sec);
  });
  container.querySelectorAll(".phase-upload-btn").forEach(b=>b.addEventListener("click",()=>openPhaseUploadDialog(b.dataset.phaseId,b.dataset.phaseName)));
  container.querySelectorAll("[data-delete-pd]").forEach(b=>b.addEventListener("click",()=>{
    const t=getActiveTender(); if(!t) return;
    if(!confirm("¿Eliminar?")) return;
    t.phaseDocs[b.dataset.phaseId]=(t.phaseDocs[b.dataset.phaseId]||[]).filter(d=>d.id!==b.dataset.deletePd);
    saveState(); renderPhases(t); refreshIcons();
  }));
  refreshIcons();
}

// ─── PARTNERS DASHBOARD ───────────────────────────────────────────────────────
function openPartnersDialog() {
  if (!canSeePartners()) return;
  renderPartnersDashboard();
  openDialog("partnersDialog");
}

function renderPartnersDashboard() {
  const partners=state.users.filter(u=>u.role==="Socio"||u.isPartner);
  const container=$("partnersDashboard"); container.replaceChildren();

  if (!state.tenders.length) {
    container.innerHTML=`<p class="empty-row" style="padding:20px">Sin licitaciones registradas.</p>`; return;
  }

  // Global summary
  const totalContract=state.tenders.reduce((s,t)=>{
    const sub=t.products.reduce((x,p)=>x+p.quantity*p.unitPrice,0);
    return s+sub*(1+IVA_RATE);
  },0);

  const summaryEl=document.createElement("div"); summaryEl.className="partners-summary";
  summaryEl.innerHTML=`
    <div class="partners-global">
      <h3>Resumen global</h3>
      <div class="partners-kpi-row">
        <div class="partners-kpi"><span>Total contratos</span><strong>${money.format(totalContract)}</strong></div>
        <div class="partners-kpi"><span>Licitaciones activas</span><strong>${state.tenders.filter(t=>t.status==="Activa").length}</strong></div>
        <div class="partners-kpi"><span>Socios registrados</span><strong>${partners.length}</strong></div>
      </div>
    </div>`;
  container.append(summaryEl);

  // Per-tender allocation table
  state.tenders.forEach(t=>{
    const contractValue=t.products.reduce((s,p)=>s+p.quantity*p.unitPrice,0)*(1+IVA_RATE);
    const allocs=t.partnerAllocs||[];

    const sec=document.createElement("div"); sec.className="partner-tender-block";
    sec.innerHTML=`
      <div class="partner-tender-header">
        <div>
          <strong>${esc(t.name)}</strong>
          <small>${esc(t.contract)} · ${esc(t.client)}</small>
        </div>
        <div class="partner-tender-value">
          <span class="eyebrow">Valor contrato</span>
          <strong>${money.format(contractValue)}</strong>
        </div>
      </div>
      <div class="partner-allocs-wrap">
        <table class="partner-alloc-table">
          <thead><tr><th>Socio</th><th>% Asignado</th><th>Monto</th><th>Notas</th><th></th></tr></thead>
          <tbody id="pallocBody_${t.id}"></tbody>
        </table>
        <button class="secondary-action" type="button" data-add-alloc="${t.id}" style="margin-top:8px">
          <i data-lucide="plus"></i> Agregar socio a este contrato
        </button>
      </div>`;
    container.append(sec);

    const tbody=sec.querySelector(`#pallocBody_${t.id}`);
    if (!allocs.length) {
      tbody.append(emptyRow("Sin asignaciones.",5));
    } else {
      allocs.forEach((a,idx)=>{
        const partner=state.users.find(u=>u.id===a.userId);
        const amount=contractValue*(a.pct/100);
        const row=document.createElement("tr");
        row.innerHTML=`
          <td>${esc(partner?.name||a.userId||"Socio desconocido")}</td>
          <td><input type="number" min="0" max="100" step="0.1" value="${a.pct}" data-tender="${t.id}" data-alloc-idx="${idx}" class="alloc-pct-input" style="width:80px" /> %</td>
          <td class="number-cell"><strong>${money.format(amount)}</strong></td>
          <td><input type="text" value="${esc(a.notes||"")}" data-tender="${t.id}" data-alloc-notes="${idx}" placeholder="Notas" style="min-width:120px" class="alloc-notes-input" /></td>
          <td><button class="icon-button danger-button" type="button" data-remove-alloc="${t.id}" data-alloc-idx="${idx}"><i data-lucide="trash-2"></i></button></td>`;
        tbody.append(row);
      });
    }

    // Totals row
    const totalPct=allocs.reduce((s,a)=>s+a.pct,0);
    const tRow=document.createElement("tr"); tRow.className="alloc-total-row";
    tRow.innerHTML=`<td><strong>Total</strong></td><td><strong ${totalPct>100?"style='color:var(--danger)'":" "}>${number.format(totalPct)}%</strong></td>
      <td class="number-cell"><strong>${money.format(contractValue*(totalPct/100))}</strong></td><td colspan="2"></td>`;
    tbody.append(tRow);
  });

  // Bind partner add/edit buttons
  container.querySelectorAll("[data-add-alloc]").forEach(btn=>{
    btn.addEventListener("click",()=>{
      const t=state.tenders.find(x=>x.id===btn.dataset.addAlloc); if(!t) return;
      if (!partners.length){ alert("No hay socios registrados. Ve a Usuarios y crea un usuario con perfil Socio."); return; }
      // Show partner picker inline
      const sel=document.createElement("select"); sel.style.cssText="margin:8px 0;width:100%;";
      partners.forEach(p=>{ const o=document.createElement("option"); o.value=p.id; o.textContent=p.name; sel.append(o); });
      btn.insertAdjacentElement("afterend", sel);
      const confirmBtn=document.createElement("button"); confirmBtn.className="primary-action"; confirmBtn.style.cssText="margin:4px 0;";
      confirmBtn.innerHTML=`<i data-lucide="save"></i> Agregar`; refreshIcons();
      confirmBtn.addEventListener("click",()=>{
        if (!t.partnerAllocs) t.partnerAllocs=[];
        t.partnerAllocs.push({userId:sel.value,pct:10,notes:""});
        saveState(); renderPartnersDashboard(); refreshIcons();
      });
      sel.insertAdjacentElement("afterend", confirmBtn);
      btn.remove();
    });
  });

  container.querySelectorAll(".alloc-pct-input").forEach(inp=>{
    inp.addEventListener("change",()=>{
      const t=state.tenders.find(x=>x.id===inp.dataset.tender); if(!t) return;
      t.partnerAllocs[+inp.dataset.allocIdx].pct=toPos(inp.value)||0;
      saveState(); renderPartnersDashboard();
    });
  });

  container.querySelectorAll(".alloc-notes-input").forEach(inp=>{
    inp.addEventListener("change",()=>{
      const t=state.tenders.find(x=>x.id===inp.dataset.tender); if(!t) return;
      t.partnerAllocs[+inp.dataset.allocNotes].notes=inp.value;
      saveState();
    });
  });

  container.querySelectorAll("[data-remove-alloc]").forEach(btn=>{
    btn.addEventListener("click",()=>{
      const t=state.tenders.find(x=>x.id===btn.dataset.removeAlloc); if(!t) return;
      t.partnerAllocs.splice(+btn.dataset.allocIdx,1);
      saveState(); renderPartnersDashboard(); refreshIcons();
    });
  });

  refreshIcons();
}

// ─── USERS ────────────────────────────────────────────────────────────────────
function renderUsers() {
  const tbody=$("usersTable"); if(!tbody) return; tbody.replaceChildren();
  state.users.forEach(u=>{
    const row=document.createElement("tr");
    const action=u.protected?`<span class="muted">Admin base</span>`
      :`<button class="icon-button" type="button" data-delete-user="${u.id}"><i data-lucide="user-minus"></i></button>`;
    row.innerHTML=`<td><strong>${esc(u.username)}</strong></td><td>${esc(u.name)}</td>
      <td>${esc(u.role)}</td><td>${u.protected?"Protegido":"Activo"}</td><td>${action}</td>`;
    tbody.append(row);
  });
}

function handleUsersTableClick(e) {
  const btn=e.target.closest("[data-delete-user]"); if(!btn||!getCurrentUser()?.isAdmin) return;
  const u=state.users.find(x=>x.id===btn.dataset.deleteUser); if(!u||u.protected) return;
  if(!confirm(`¿Dar de baja "${u.username}"?`)) return;
  state.users=state.users.filter(x=>x.id!==u.id);
  if(sessionStorage.getItem(SESSION_KEY)===u.username) sessionStorage.removeItem(SESSION_KEY);
  saveState(); renderUsers(); refreshIcons();
}

// ─── SYNC (export/import JSON) ────────────────────────────────────────────────
function exportData() {
  const data=JSON.parse(localStorage.getItem(STORAGE_KEY)||"{}");
  const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a"); a.href=url;
  a.download=`ylika_backup_${new Date().toISOString().slice(0,10)}.json`;
  a.click(); URL.revokeObjectURL(url);
  $("syncStatus").textContent="✓ Datos exportados. Comparte el archivo con el otro dispositivo e impórtalo ahí.";
}

function importData(e) {
  const file=e.target.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=ev=>{
    try {
      const data=JSON.parse(ev.target.result);
      if (!Array.isArray(data.tenders)) throw new Error("Formato inválido");
      localStorage.setItem(STORAGE_KEY,JSON.stringify(data));
      loadState(); render();
      $("syncStatus").textContent=`✓ Datos importados correctamente. ${data.tenders.length} licitaciones cargadas.`;
    } catch {
      $("syncStatus").textContent="✗ Error al importar. Verifica que el archivo sea un JSON válido exportado desde YLIKA.";
    }
  };
  reader.readAsText(file);
  e.target.value=""; // reset input
}

// ─── DIALOGS ─────────────────────────────────────────────────────────────────
function openDialog(id){ const d=$(id); d.showModal?d.showModal():d.setAttribute("open",""); refreshIcons(); }
function closeDialog(id){ const d=$(id); d.close?d.close():d.removeAttribute("open"); }

function openTenderDialog(t=null) {
  $("tenderDialogTitle").textContent=t?"Editar licitación":"Nueva licitación";
  $("tenderIdInput").value    = t?.id             || "";
  $("tenderNameInput").value  = t?.name           || "";
  $("clientInput").value      = t?.client         || "";
  $("contractInput").value    = t?.contract       || "";
  $("deadlineInput").value    = t?.deadline       || "";
  $("notesInput").value       = t?.notes          || "";
  $("clientAddressInput").value = t?.clientAddress || "";
  $("clientPhoneInput").value   = t?.clientPhone   || "";
  $("clientEmailInput").value   = t?.clientEmail   || "";
  openDialog("tenderDialog");
}

function openProductDialog(pe=null) {
  const t=getActiveTender(); if(!t) return;
  $("productDialogTitle").textContent=pe?"Editar producto":"Agregar producto";
  $("productIdInput").value   = pe?.id          || "";
  $("productNameInput").value = pe?.name        || "";
  $("unitInput").value        = pe?.unit        || "pieza";
  $("sectorInput").value      = pe?.sector      || "";
  $("partidaInput").value     = pe?.partida     || "";
  $("quantityInput").value    = pe?.quantity    || "";
  $("priceInput").value       = pe?.unitPrice   || "";
  $("profitInput").value      = pe?.profitPct   || "0";
  const isOut=pe?.contractType==="out";
  $("contractTypeIn").checked=!isOut; $("contractTypeOut").checked=isOut;
  $("substituteRow").classList.toggle("is-hidden",!isOut);
  const sel=$("substituteProductInput"); sel.replaceChildren();
  sel.innerHTML=`<option value="">— Selecciona la partida —</option>`;
  t.products.filter(p=>!pe||p.id!==pe.id).forEach(p=>{
    const o=document.createElement("option"); o.value=p.id;
    o.textContent=`${p.name} (${p.partida||"—"})`;
    if(pe?.substituteId===p.id) o.selected=true; sel.append(o);
  });
  updatePriceCalc(); openDialog("productDialog");
}

function updatePriceCalc() {
  const b=toPos($("priceInput").value); const pr=toPos($("profitInput").value);
  $("calcWithIva").textContent=money.format(b*(1+IVA_RATE));
  $("calcWithProfit").textContent=money.format(b*(1+IVA_RATE)*(1+pr/100));
}

function openOrderDialog() {
  const t=getActiveTender();
  if(!t||!t.products.length){ alert("Primero agrega productos."); return; }
  $("orderIdInput").value=""; $("orderForm").reset(); $("orderDateInput").value=today();
  $("orderEvidenceError").textContent="";
  const sel=$("orderProductInput"); sel.replaceChildren();
  t.products.forEach(p=>{
    const o=document.createElement("option"); o.value=p.id;
    o.textContent=`${p.name} | ${p.partida||"—"} | ${number.format(p.quantity)} ${p.unit}`; sel.append(o);
  });
  openDialog("orderDialog");
}

function openOrderDeliveryDialog(orderId) {
  const t=getActiveTender(); if(!t) return;
  const o=t.orders.find(x=>x.id===orderId); if(!o) return;
  $("odOrderIdInput").value=orderId; $("orderDeliveryForm").reset();
  $("odOrderIdInput").value=orderId; $("odDateInput").value=today();
  $("odEvidenceError").textContent=""; openDialog("orderDeliveryDialog");
}

function openQuoteLineDialog(l=null) {
  $("quoteLineDialogTitle").textContent=l?"Editar línea":"Agregar línea";
  $("quoteLineIdInput").value   = l?.id          || "";
  $("quoteLineDescInput").value = l?.description || "";
  $("quoteLineUnitInput").value = l?.unit        || "pieza";
  $("quoteLineQtyInput").value  = l?.quantity    || "";
  $("quoteLinePriceInput").value= l?.unitPrice   || "";
  openDialog("quoteLineDialog");
}

function openPhaseUploadDialog(phaseId, phaseName) {
  $("phaseIdInput").value=$("phaseIdInput").value=phaseId;
  $("phaseUploadTitle").textContent=`Subir doc: ${phaseName}`;
  $("phaseUploadForm").reset(); $("phaseIdInput").value=phaseId;
  $("phaseUploadStatus").textContent=""; openDialog("phaseUploadDialog");
}

function openUsersDialog() {
  if(!getCurrentUser()?.isAdmin) return;
  $("userForm").reset(); $("userFormError").textContent="";
  renderUsers(); openDialog("usersDialog");
}

// ─── FORM HANDLERS ────────────────────────────────────────────────────────────
function handleTenderSubmit(e) {
  e.preventDefault();
  const id=$("tenderIdInput").value;
  const payload={
    name:$("tenderNameInput").value.trim(), client:$("clientInput").value.trim(),
    contract:$("contractInput").value.trim(), deadline:$("deadlineInput").value,
    notes:$("notesInput").value.trim(),
    clientAddress:$("clientAddressInput").value.trim(),
    clientPhone:$("clientPhoneInput").value.trim(),
    clientEmail:$("clientEmailInput").value.trim(),
  };
  if(!payload.name||!payload.client||!payload.contract) return;
  if (id) {
    const t=state.tenders.find(x=>x.id===id); if(t) Object.assign(t,payload);
  } else {
    const t=normalizeTender({...payload,id:createId("lic"),createdAt:new Date().toISOString(),status:"Activa"});
    state.tenders.unshift(t); state.activeTenderId=t.id;
  }
  saveState(); closeDialog("tenderDialog"); render();
}

function handleProductSubmit(e) {
  e.preventDefault();
  const t=getActiveTender(); if(!t) return;
  const id=$("productIdInput").value;
  const contractType=$("contractTypeOut").checked?"out":"in";
  const payload=normalizeProduct({
    id:id||createId("prd"),
    name:$("productNameInput").value.trim(), unit:$("unitInput").value.trim()||"pieza",
    sector:$("sectorInput").value.trim(), partida:$("partidaInput").value.trim(),
    quantity:toPos($("quantityInput").value), unitPrice:toPos($("priceInput").value),
    profitPct:toPos($("profitInput").value), contractType,
    substituteId:contractType==="out"?$("substituteProductInput").value:"",
  });
  if (id){ const idx=t.products.findIndex(p=>p.id===id); if(idx>=0) t.products[idx]=payload; }
  else { t.products.push(payload); }
  saveState(); closeDialog("productDialog"); state.activeTab="products"; render();
}

async function handleOrderSubmit(e) {
  e.preventDefault();
  const t=getActiveTender(); if(!t) return;
  const productId=$("orderProductInput").value;
  const qtyOrdered=toPos($("orderQtyInput").value);
  if(!productId||qtyOrdered<=0) return;
  const n=t.orders.length+1;
  const order=normalizeOrder({
    id:createId("ord"), number:`PED-${String(n).padStart(4,"0")}`,
    productId, qtyOrdered, date:$("orderDateInput").value||today(),
    eta:$("orderEtaInput").value||"", requestedBy:$("orderRequestedByInput").value.trim(),
    notes:$("orderNotesInput").value.trim(), status:"Pendiente", createdAt:new Date().toISOString(),
  });
  t.orders.push(order); saveState(); closeDialog("orderDialog"); state.activeTab="orders"; render();
  const evFile=$("orderEvidenceFile").files[0];
  if(evFile) uploadOrderEvidence(evFile,order,t,null);
}

async function handleOrderDeliverySubmit(e) {
  e.preventDefault();
  const t=getActiveTender(); if(!t) return;
  const orderId=$("odOrderIdInput").value;
  const order=t.orders.find(x=>x.id===orderId); if(!order) return;
  const evFile=$("odEvidenceFile").files[0];
  if(!evFile){ $("odEvidenceError").textContent="Debes adjuntar PDF o imagen."; return; }
  if(!evFile.type.startsWith("image/")&&evFile.type!=="application/pdf"){
    $("odEvidenceError").textContent="Solo PDF o imágenes."; return;
  }
  $("odEvidenceError").textContent="";
  const qty=toPos($("odQtyInput").value); if(qty<=0) return;
  const delivery=normalizeOD({
    id:createId("od"), qty, date:$("odDateInput").value||today(),
    receivedBy:$("odReceivedByInput").value.trim(), remisionNum:$("odRemisionInput").value.trim(),
    notes:$("odNotesInput").value.trim(), evidenceName:evFile.name,
    evidenceSize:evFile.size, evidenceMime:evFile.type, evidenceStatus:"Subiendo",
    createdAt:new Date().toISOString(),
  });
  order.deliveries.push(delivery);
  const tot=getODQty(order); order.qtyDelivered=tot;
  if(tot>=order.qtyOrdered) order.status="Entregado";
  else if(tot>0) order.status="Parcial";
  saveState(); closeDialog("orderDeliveryDialog"); render();
  uploadOrderEvidence(evFile,order,t,delivery);
}

async function uploadOrderEvidence(file,order,tender,delivery) {
  try {
    await uploadToDrive(file,{type:"Remisión-Pedido",name:file.name,uploadedAt:new Date().toISOString()},tender);
    if(delivery){ delivery.evidenceStatus="Enviado a Drive"; saveState(); renderOrders(tender); refreshIcons(); }
  } catch {
    if(delivery){ delivery.evidenceStatus="Error al subir"; saveState(); renderOrders(tender); refreshIcons(); }
  }
}

async function handleUploadSubmit(e) {
  e.preventDefault();
  const t=getActiveTender(); const file=$("documentFile").files[0]; if(!t||!file) return;
  const doc=normalizeDoc({id:createId("doc"),type:$("documentType").value,name:file.name,
    mime:file.type||"application/octet-stream",size:file.size,status:"Subiendo",uploadedAt:new Date().toISOString()});
  t.documents.unshift(doc); saveState(); renderDocuments(t);
  $("uploadStatus").textContent="Subiendo a Google Drive...";
  try {
    await uploadToDrive(file,doc,t); doc.status="Enviado a Drive";
    $("uploadStatus").textContent="✓ Archivo enviado a Google Drive."; $("uploadForm").reset();
  } catch(err) {
    doc.status="Error al subir"; $("uploadStatus").textContent="✗ Error al subir. Revisa el endpoint."; console.error(err);
  }
  saveState(); renderDocuments(t); refreshIcons();
}

async function handlePhaseUploadSubmit(e) {
  e.preventDefault();
  const t=getActiveTender(); const phaseId=$("phaseIdInput").value;
  const file=$("phaseDocFile").files[0]; const docName=$("phaseDocNameInput").value.trim();
  if(!t||!phaseId||!file||!docName) return;
  if(!t.phaseDocs) t.phaseDocs={};
  if(!Array.isArray(t.phaseDocs[phaseId])) t.phaseDocs[phaseId]=[];
  const doc=normalizePhaseDoc({id:createId("phd"),name:docName,mime:file.type||"application/octet-stream",
    size:file.size,status:"Subiendo",uploadedAt:new Date().toISOString()});
  t.phaseDocs[phaseId].push(doc); saveState();
  $("phaseUploadStatus").textContent="Subiendo a Google Drive..."; renderPhases(t);
  try {
    await uploadToDrive(file,{type:`Fase-${phaseId}`,name:docName,uploadedAt:doc.uploadedAt},t);
    doc.status="Enviado a Drive"; $("phaseUploadStatus").textContent="✓ Documento enviado."; saveState();
    setTimeout(()=>{ closeDialog("phaseUploadDialog"); renderPhases(t); refreshIcons(); },1000);
  } catch(err) {
    doc.status="Error al subir"; $("phaseUploadStatus").textContent="✗ Error al subir."; saveState(); renderPhases(t); refreshIcons(); console.error(err);
  }
}

function handleQuoteLineSubmit(e) {
  e.preventDefault();
  const t=getActiveTender(); if(!t) return;
  const id=$("quoteLineIdInput").value;
  const payload={
    description:$("quoteLineDescInput").value.trim(), unit:$("quoteLineUnitInput").value.trim()||"pieza",
    quantity:toPos($("quoteLineQtyInput").value), unitPrice:toPos($("quoteLinePriceInput").value),
  };
  if(!payload.description||payload.quantity<=0) return;
  if(id){ const l=t.quoteLines.find(x=>x.id===id); if(l) Object.assign(l,payload); }
  else { t.quoteLines.push(normalizeQL({id:createId("ql"),...payload})); }
  saveState(); closeDialog("quoteLineDialog"); renderQuote(t);
}

function handleQLTableClick(e) {
  const btn=e.target.closest("[data-delete-quoteline]"); if(!btn) return;
  const t=getActiveTender(); if(!t) return;
  if(!confirm("¿Eliminar esta línea?")) return;
  t.quoteLines=t.quoteLines.filter(l=>l.id!==btn.dataset.deleteQuoteline);
  saveState(); renderQuote(t);
}

function handleUserSubmit(e) {
  e.preventDefault();
  if(!getCurrentUser()?.isAdmin) return;
  const username=$("newUsernameInput").value.trim().toLowerCase();
  const password=$("newUserPasswordInput").value;
  const name=$("newUserNameInput").value.trim();
  const role=$("newUserRoleInput").value;
  const err=$("userFormError"); err.textContent="";
  if(!username||!password||!name){ err.textContent="Completa todos los campos."; return; }
  if(!/^[a-z0-9._-]{3,32}$/.test(username)){ err.textContent="Usuario: 3-32 chars, letras/números/punto/guion."; return; }
  if(password.length<6){ err.textContent="Contraseña mínimo 6 caracteres."; return; }
  if(state.users.some(u=>u.username===username)){ err.textContent="Ese usuario ya existe."; return; }
  const isPartner=role==="Socio";
  state.users.push(normalizeUser({id:createId("usr"),username,password,name,role,isAdmin:false,isPartner,protected:false,createdAt:new Date().toISOString()}));
  saveState(); $("userForm").reset(); renderUsers(); refreshIcons();
}

function deleteActiveTender() {
  const t=getActiveTender(); if(!t) return;
  if(!confirm(`¿Eliminar la licitación "${t.name}"?`)) return;
  state.tenders=state.tenders.filter(x=>x.id!==t.id);
  state.activeTenderId=state.tenders[0]?.id||null;
  saveState(); render();
}
