const ADMIN_USER = "admin";
const ADMIN_PASSWORD = "adminmike2026_ylikadev_2026";
const ADMIN_NAME = "Administrador";
const STORAGE_KEY = "ylika_tender_admin_state";
const SESSION_KEY = "ylika_tender_admin_session";
// Drive endpoint: tu Apps Script debe estar publicado como "Anyone, even anonymous"
// y debe aceptar POST con JSON (no FormData).
const DRIVE_ENDPOINT =
  "https://script.google.com/macros/s/AKfycbzRW_LJUTKNhcGo9tJCZGpdz44ZOxROajeasmfeLh2bYl7UD7dCddIWv8Mawy67QNEg/exec";
const IVA_RATE = 0.16;

// Fases estándar de una licitación pública en México (Ley de Adquisiciones)
const LICITACION_PHASES = [
  {
    id: "fase_convocatoria",
    name: "Convocatoria / Invitación",
    description: "Publicación en CompraNet, DOF o convocatoria restringida. Incluye bases, especificaciones técnicas y calendario.",
    icon: "megaphone",
    color: "var(--accent)",
  },
  {
    id: "fase_junta",
    name: "Junta de Aclaraciones",
    description: "Reunión para resolver dudas sobre las bases. Las respuestas forman parte integral de la convocatoria.",
    icon: "message-circle-question",
    color: "var(--violet)",
  },
  {
    id: "fase_presentacion",
    name: "Presentación y Apertura de Proposiciones",
    description: "Recepción de sobres con propuestas técnicas y económicas. Acto público con levantamiento de acta.",
    icon: "package-open",
    color: "var(--warning)",
  },
  {
    id: "fase_evaluacion",
    name: "Evaluación de Proposiciones",
    description: "Análisis técnico y económico de las propuestas recibidas. Verificación de requisitos y criterios de evaluación.",
    icon: "clipboard-list",
    color: "#38a8ff",
  },
  {
    id: "fase_fallo",
    name: "Fallo",
    description: "Comunicación oficial del resultado. Se indica el proveedor adjudicado y los montos. Se levanta acta de fallo.",
    icon: "gavel",
    color: "var(--success)",
  },
  {
    id: "fase_contrato",
    name: "Firma de Contrato",
    description: "Formalización del instrumento jurídico entre la dependencia y el proveedor adjudicado.",
    icon: "file-signature",
    color: "var(--accent)",
  },
  {
    id: "fase_ejecucion",
    name: "Ejecución / Entregas",
    description: "Cumplimiento del objeto contractual: entregas parciales, supervisión y verificación de calidad.",
    icon: "truck",
    color: "var(--warning)",
  },
  {
    id: "fase_finiquito",
    name: "Finiquito y Cierre",
    description: "Verificación de cumplimiento total, devolución de garantías, factura final y cierre administrativo.",
    icon: "check-circle-2",
    color: "var(--success)",
  },
];

const state = {
  tenders: [],
  users: [],
  activeTenderId: null,
  activeTab: "products",
  search: "",
};

const $ = (id) => document.getElementById(id);
const money = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});
const number = new Intl.NumberFormat("es-MX", {
  maximumFractionDigits: 2,
});
const dateFormatter = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

document.addEventListener("DOMContentLoaded", init);

function init() {
  loadState();
  bindEvents();
  renderAuth();
}

function bindEvents() {
  $("loginForm").addEventListener("submit", handleLogin);
  $("logoutButton").addEventListener("click", handleLogout);
  $("usersButton").addEventListener("click", openUsersDialog);
  $("newTenderButton").addEventListener("click", () => openTenderDialog());
  document.querySelectorAll("[data-open-tender]").forEach((button) => {
    button.addEventListener("click", () => openTenderDialog());
  });
  document.querySelectorAll("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => closeDialog(button.dataset.closeDialog));
  });

  $("searchInput").addEventListener("input", (event) => {
    state.search = event.target.value.trim().toLowerCase();
    renderTenderList();
  });

  $("tenderForm").addEventListener("submit", handleTenderSubmit);
  $("productForm").addEventListener("submit", handleProductSubmit);
  $("deliveryForm").addEventListener("submit", handleDeliverySubmit);
  $("uploadForm").addEventListener("submit", handleUploadSubmit);
  $("userForm").addEventListener("submit", handleUserSubmit);
  $("quoteLineForm").addEventListener("submit", handleQuoteLineSubmit);
  $("phaseUploadForm").addEventListener("submit", handlePhaseUploadSubmit);

  $("editTenderButton").addEventListener("click", () => {
    const tender = getActiveTender();
    if (tender) openTenderDialog(tender);
  });
  $("deleteTenderButton").addEventListener("click", deleteActiveTender);
  $("statusSelect").addEventListener("change", handleStatusChange);

  $("newProductButton").addEventListener("click", () => openProductDialog());
  $("newDeliveryButton").addEventListener("click", () => openDeliveryDialog());
  $("generateQuoteButton").addEventListener("click", generateQuote);
  $("printQuoteButton").addEventListener("click", printQuote);
  $("addQuoteLineButton").addEventListener("click", () => openQuoteLineDialog());
  $("importProductsButton").addEventListener("click", importProductsToQuote);

  $("productsTable").addEventListener("change", handleProductTableChange);
  $("productsTable").addEventListener("click", handleProductTableClick);
  $("deliveriesTable").addEventListener("click", handleDeliveryTableClick);
  $("documentsTable").addEventListener("click", handleDocumentTableClick);
  $("quoteLinesTable").addEventListener("click", handleQuoteLineTableClick);
  $("usersTable").addEventListener("click", handleUsersTableClick);

  document.querySelectorAll(".tab-button").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeTab = button.dataset.tab;
      renderDetail();
    });
  });
}

// ─── AUTH ────────────────────────────────────────────────────────────────────

function handleLogin(event) {
  event.preventDefault();
  const username = $("usernameInput").value.trim().toLowerCase();
  const password = $("passwordInput").value;
  const user = state.users.find(
    (item) => item.username.toLowerCase() === username && item.password === password,
  );
  if (user) {
    sessionStorage.setItem(SESSION_KEY, user.username);
    $("loginError").textContent = "";
    $("passwordInput").value = "";
    renderAuth();
    return;
  }
  $("loginError").textContent = "Usuario o contraseña incorrectos.";
}

function handleLogout() {
  sessionStorage.removeItem(SESSION_KEY);
  renderAuth();
}

function renderAuth() {
  const currentUser = getCurrentUser();
  const isLoggedIn = Boolean(currentUser);
  $("loginScreen").classList.toggle("is-hidden", isLoggedIn);
  $("appShell").classList.toggle("is-hidden", !isLoggedIn);
  if (isLoggedIn) {
    $("currentUserLabel").textContent = currentUser.name || currentUser.username;
    $("usersButton").classList.toggle("is-hidden", !currentUser.isAdmin);
    render();
  }
  refreshIcons();
}

// ─── STATE ───────────────────────────────────────────────────────────────────

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!stored || !Array.isArray(stored.tenders)) {
      state.users = getDefaultUsers();
      return;
    }
    state.tenders = stored.tenders.map(normalizeTender);
    state.users = normalizeUsers(stored.users);
    state.activeTenderId = stored.activeTenderId || state.tenders[0]?.id || null;
  } catch {
    state.tenders = [];
    state.users = getDefaultUsers();
    state.activeTenderId = null;
  }
  if (!state.users.length) {
    state.users = getDefaultUsers();
  }
}

function saveState() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      tenders: state.tenders,
      users: state.users,
      activeTenderId: state.activeTenderId,
    }),
  );
}

function getDefaultUsers() {
  return [
    normalizeUser({
      id: "usr_admin",
      username: ADMIN_USER,
      password: ADMIN_PASSWORD,
      name: ADMIN_NAME,
      role: "Admin",
      isAdmin: true,
      protected: true,
      createdAt: new Date().toISOString(),
    }),
  ];
}

function normalizeUsers(users) {
  const normalized = Array.isArray(users)
    ? users.map(normalizeUser).filter((user) => user.username && user.password)
    : [];
  const admin = normalized.find((user) => user.username.toLowerCase() === ADMIN_USER);
  if (admin) {
    admin.password = ADMIN_PASSWORD;
    admin.name = admin.name || ADMIN_NAME;
    admin.role = "Admin";
    admin.isAdmin = true;
    admin.protected = true;
    return [admin, ...normalized.filter((user) => user.id !== admin.id)];
  }
  return [...getDefaultUsers(), ...normalized];
}

function normalizeUser(user) {
  return {
    id: user.id || createId("usr"),
    username: String(user.username || "").trim().toLowerCase(),
    password: String(user.password || ""),
    name: String(user.name || user.username || "").trim(),
    role: user.role || "Usuario",
    isAdmin: Boolean(user.isAdmin),
    protected: Boolean(user.protected),
    createdAt: user.createdAt || new Date().toISOString(),
  };
}

function normalizeTender(tender) {
  return {
    id: tender.id || createId("lic"),
    name: tender.name || "",
    client: tender.client || "",
    contract: tender.contract || "",
    deadline: tender.deadline || "",
    notes: tender.notes || "",
    status: tender.status || "Activa",
    createdAt: tender.createdAt || new Date().toISOString(),
    quoteNumber: tender.quoteNumber || "",
    quoteCreatedAt: tender.quoteCreatedAt || "",
    quoteUpdatedAt: tender.quoteUpdatedAt || "",
    products: Array.isArray(tender.products) ? tender.products.map(normalizeProduct) : [],
    deliveries: Array.isArray(tender.deliveries) ? tender.deliveries.map(normalizeDelivery) : [],
    documents: Array.isArray(tender.documents) ? tender.documents.map(normalizeDocument) : [],
    quoteLines: Array.isArray(tender.quoteLines) ? tender.quoteLines.map(normalizeQuoteLine) : [],
    // phases: object keyed by phase id, each with array of docs
    phaseDocs: tender.phaseDocs && typeof tender.phaseDocs === "object" ? normalizePhaseDocs(tender.phaseDocs) : {},
  };
}

function normalizeProduct(product) {
  return {
    id: product.id || createId("prd"),
    name: product.name || "",
    unit: product.unit || "pieza",
    sector: product.sector || "",
    partida: product.partida || "",
    quantity: Number(product.quantity) || 0,
    unitPrice: Number(product.unitPrice) || 0,
  };
}

function normalizeDelivery(delivery) {
  return {
    id: delivery.id || createId("rem"),
    number: delivery.number || "",
    productId: delivery.productId || "",
    quantity: Number(delivery.quantity) || 0,
    date: delivery.date || today(),
    receivedBy: delivery.receivedBy || "",
    notes: delivery.notes || "",
    evidenceName: delivery.evidenceName || "",
    evidenceSize: Number(delivery.evidenceSize) || 0,
    evidenceMime: delivery.evidenceMime || "",
    evidenceDriveUrl: delivery.evidenceDriveUrl || "",
    evidenceStatus: delivery.evidenceStatus || "",
    createdAt: delivery.createdAt || new Date().toISOString(),
  };
}

function normalizeDocument(documentRecord) {
  return {
    id: documentRecord.id || createId("doc"),
    type: documentRecord.type || "Otro",
    name: documentRecord.name || "",
    mime: documentRecord.mime || "",
    size: Number(documentRecord.size) || 0,
    status: documentRecord.status || "Registrado",
    uploadedAt: documentRecord.uploadedAt || new Date().toISOString(),
    driveUrl: documentRecord.driveUrl || "",
  };
}

function normalizeQuoteLine(line) {
  return {
    id: line.id || createId("ql"),
    description: line.description || "",
    unit: line.unit || "pieza",
    quantity: Number(line.quantity) || 0,
    unitPrice: Number(line.unitPrice) || 0,
  };
}

function normalizePhaseDocs(phaseDocs) {
  const result = {};
  LICITACION_PHASES.forEach((phase) => {
    const docs = phaseDocs[phase.id];
    result[phase.id] = Array.isArray(docs) ? docs.map(normalizePhaseDoc) : [];
  });
  return result;
}

function normalizePhaseDoc(doc) {
  return {
    id: doc.id || createId("phd"),
    name: doc.name || "",
    mime: doc.mime || "",
    size: Number(doc.size) || 0,
    status: doc.status || "Registrado",
    uploadedAt: doc.uploadedAt || new Date().toISOString(),
    driveUrl: doc.driveUrl || "",
  };
}

// ─── RENDER ──────────────────────────────────────────────────────────────────

function render() {
  if (!state.activeTenderId && state.tenders.length) {
    state.activeTenderId = state.tenders[0].id;
  }
  renderMetrics();
  renderTenderList();
  renderDetail();
  renderUsers();
  refreshIcons();
}

function renderMetrics() {
  const totalContracted = state.tenders.reduce(
    (sum, tender) => sum + getFinancials(tender).total,
    0,
  );
  const contractedUnits = state.tenders.reduce(
    (sum, tender) => sum + tender.products.reduce((inner, product) => inner + product.quantity, 0),
    0,
  );
  const deliveredUnits = state.tenders.reduce(
    (sum, tender) =>
      sum + tender.deliveries.reduce((inner, delivery) => inner + delivery.quantity, 0),
    0,
  );
  const documentCount = state.tenders.reduce(
    (sum, tender) => sum + tender.documents.length,
    0,
  );
  const progress = contractedUnits ? Math.min(100, (deliveredUnits / contractedUnits) * 100) : 0;

  $("totalTenders").textContent = state.tenders.length;
  $("contractedTotal").textContent = money.format(totalContracted);
  $("deliveredTotal").textContent = `${number.format(progress)}%`;
  $("documentTotal").textContent = documentCount;
}

function renderTenderList() {
  const list = $("tenderList");
  list.replaceChildren();
  const filtered = state.tenders.filter((tender) => {
    const haystack = `${tender.name} ${tender.client} ${tender.contract}`.toLowerCase();
    return haystack.includes(state.search);
  });

  if (!filtered.length) {
    const empty = document.createElement("p");
    empty.className = "empty-row";
    empty.textContent = state.search ? "Sin coincidencias." : "Sin licitaciones.";
    list.append(empty);
    return;
  }

  filtered.forEach((tender) => {
    const financials = getFinancials(tender);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tender-card";
    button.classList.toggle("is-active", tender.id === state.activeTenderId);
    button.addEventListener("click", () => {
      state.activeTenderId = tender.id;
      saveState();
      render();
    });
    button.innerHTML = `
      <span class="status-pill" data-status="${escapeHtml(tender.status)}">${escapeHtml(tender.status)}</span>
      <strong>${escapeHtml(tender.name)}</strong>
      <small>${escapeHtml(tender.client)} · ${escapeHtml(tender.contract)}</small>
      <small>${money.format(financials.total)}</small>
    `;
    list.append(button);
  });
}

function renderDetail() {
  const tender = getActiveTender();
  $("emptyState").classList.toggle("is-hidden", Boolean(tender));
  $("detailView").classList.toggle("is-hidden", !tender);
  if (!tender) return;

  $("detailMeta").textContent = `${tender.contract} · ${formatDate(tender.deadline)}`;
  $("detailTitle").textContent = tender.name;
  $("detailClient").textContent = tender.client;
  $("statusSelect").value = tender.status;

  document.querySelectorAll(".tab-button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tab === state.activeTab);
  });
  const panels = {
    products: $("productsPanel"),
    quote: $("quotePanel"),
    deliveries: $("deliveriesPanel"),
    documents: $("documentsPanel"),
    phases: $("phasesPanel"),
  };
  Object.entries(panels).forEach(([key, panel]) => {
    panel.classList.toggle("is-hidden", key !== state.activeTab);
  });

  renderProducts(tender);
  renderQuote(tender);
  renderDeliveries(tender);
  renderDocuments(tender);
  renderPhases(tender);
  refreshIcons();
}

function renderProducts(tender) {
  const tbody = $("productsTable");
  tbody.replaceChildren();
  $("newDeliveryButton").disabled = tender.products.length === 0;

  if (!tender.products.length) {
    tbody.append(emptyRow("Sin productos registrados.", 9));
    return;
  }

  tender.products.forEach((product) => {
    const delivered = getDeliveredQuantity(tender, product.id);
    const progress = product.quantity ? Math.min(100, (delivered / product.quantity) * 100) : 0;
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>
        <input data-product-id="${product.id}" data-product-field="name" value="${escapeAttribute(product.name)}" aria-label="Producto" />
      </td>
      <td>
        <input data-product-id="${product.id}" data-product-field="sector" value="${escapeAttribute(product.sector)}" aria-label="Sector" placeholder="Sector" />
      </td>
      <td>
        <span class="partida-badge">${escapeHtml(product.partida || "—")}</span>
      </td>
      <td>
        <input data-product-id="${product.id}" data-product-field="unit" value="${escapeAttribute(product.unit)}" aria-label="Unidad" />
      </td>
      <td>
        <input data-product-id="${product.id}" data-product-field="quantity" type="number" min="0" step="0.01" value="${product.quantity}" aria-label="Cantidad contratada" />
      </td>
      <td>
        <input data-product-id="${product.id}" data-product-field="unitPrice" type="number" min="0" step="0.01" value="${product.unitPrice}" aria-label="Precio unitario" />
      </td>
      <td>
        <div class="progress-line">
          <span>${number.format(delivered)} / ${number.format(product.quantity)}</span>
          <div class="progress-track" aria-hidden="true">
            <div class="progress-fill" style="--progress:${progress}%"></div>
          </div>
        </div>
      </td>
      <td class="number-cell">${money.format(getProductTotal(product))}</td>
      <td>
        <button class="icon-button" type="button" data-delete-product="${product.id}" title="Eliminar producto">
          <i data-lucide="trash-2" aria-hidden="true"></i>
        </button>
      </td>
    `;
    tbody.append(row);
  });
}

function renderQuote(tender) {
  const lines = tender.quoteLines || [];
  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const iva = subtotal * IVA_RATE;
  const total = subtotal + iva;

  $("quoteSummary").innerHTML = `
    <article>
      <span>Subtotal</span>
      <strong>${money.format(subtotal)}</strong>
    </article>
    <article>
      <span>IVA</span>
      <strong>${money.format(iva)}</strong>
    </article>
    <article>
      <span>Total con IVA</span>
      <strong>${money.format(total)}</strong>
    </article>
  `;

  // Render editable lines table
  const ltbody = $("quoteLinesTable");
  ltbody.replaceChildren();
  if (!lines.length) {
    ltbody.append(emptyRow("Sin líneas. Agrega manualmente o importa de productos.", 6));
  } else {
    lines.forEach((line) => {
      const importe = line.quantity * line.unitPrice;
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${escapeHtml(line.description)}</td>
        <td>${escapeHtml(line.unit)}</td>
        <td class="number-cell">${number.format(line.quantity)}</td>
        <td class="number-cell">${money.format(line.unitPrice)}</td>
        <td class="number-cell">${money.format(importe)}</td>
        <td>
          <button class="icon-button" type="button" data-delete-quoteline="${line.id}" title="Eliminar línea">
            <i data-lucide="trash-2" aria-hidden="true"></i>
          </button>
        </td>
      `;
      ltbody.append(row);
    });
  }

  // Quote preview
  const quoteDate = tender.quoteCreatedAt || new Date().toISOString();
  const quoteNumber = tender.quoteNumber || "Sin folio";
  const rows = lines.length
    ? lines
        .map(
          (line, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(line.description)}</td>
          <td>${escapeHtml(line.unit)}</td>
          <td class="number-cell">${number.format(line.quantity)}</td>
          <td class="number-cell">${money.format(line.unitPrice)}</td>
          <td class="number-cell">${money.format(line.quantity * line.unitPrice)}</td>
        </tr>
      `,
        )
        .join("")
    : `<tr><td colspan="6" class="empty-row">Sin líneas registradas.</td></tr>`;

  $("quotePreview").innerHTML = `
    <header>
      <div>
        <p class="eyebrow">YLIKA DEVELOPMENT</p>
        <h2>Cotización</h2>
        <p class="muted">${escapeHtml(quoteNumber)}</p>
      </div>
      <div>
        <p><strong>Fecha:</strong> ${formatDate(quoteDate)}</p>
        <p><strong>Cliente:</strong> ${escapeHtml(tender.client)}</p>
        <p><strong>Contrato:</strong> ${escapeHtml(tender.contract)}</p>
      </div>
    </header>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Descripción</th>
          <th>Unidad</th>
          <th>Cantidad</th>
          <th>Precio unitario</th>
          <th>Importe</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="quote-totals">
      <div><span>Subtotal</span><strong>${money.format(subtotal)}</strong></div>
      <div><span>IVA 16%</span><strong>${money.format(iva)}</strong></div>
      <div><span>Total con IVA incluido</span><strong>${money.format(total)}</strong></div>
    </div>
    ${tender.notes ? `<p><strong>Notas:</strong> ${escapeHtml(tender.notes)}</p>` : ""}
  `;
}

function renderDeliveries(tender) {
  const progressGrid = $("deliveryProgress");
  const tbody = $("deliveriesTable");
  progressGrid.replaceChildren();
  tbody.replaceChildren();

  if (!tender.products.length) {
    progressGrid.innerHTML = `<p class="empty-row">Sin productos registrados.</p>`;
    tbody.append(emptyRow("Sin remisiones registradas.", 7));
    return;
  }

  tender.products.forEach((product) => {
    const delivered = getDeliveredQuantity(tender, product.id);
    const remaining = Math.max(0, product.quantity - delivered);
    const progress = product.quantity ? Math.min(100, (delivered / product.quantity) * 100) : 0;
    const card = document.createElement("article");
    card.className = "progress-card";
    card.innerHTML = `
      <span>${escapeHtml(product.name)}</span>
      <strong>${number.format(delivered)} de ${number.format(product.quantity)} ${escapeHtml(product.unit)}</strong>
      <div class="progress-track" aria-hidden="true">
        <div class="progress-fill" style="--progress:${progress}%"></div>
      </div>
      <span>Restante: ${number.format(remaining)}</span>
    `;
    progressGrid.append(card);
  });

  if (!tender.deliveries.length) {
    tbody.append(emptyRow("Sin remisiones registradas.", 7));
    return;
  }

  [...tender.deliveries]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .forEach((delivery) => {
      const product = tender.products.find((item) => item.id === delivery.productId);
      const evidenceHtml = delivery.evidenceName
        ? delivery.evidenceDriveUrl
          ? `<a href="${escapeAttribute(delivery.evidenceDriveUrl)}" target="_blank" rel="noreferrer" class="evidence-link"><i data-lucide="file-check" aria-hidden="true"></i> ${escapeHtml(delivery.evidenceName)}</a>`
          : `<span class="evidence-local"><i data-lucide="file-check" aria-hidden="true"></i> ${escapeHtml(delivery.evidenceName)}</span>`
        : `<span class="evidence-missing"><i data-lucide="alert-circle" aria-hidden="true"></i> Sin evidencia</span>`;
      const row = document.createElement("tr");
      row.innerHTML = `
        <td><strong>${escapeHtml(delivery.number)}</strong></td>
        <td>${formatDate(delivery.date)}</td>
        <td>${escapeHtml(product?.name || "Producto eliminado")}</td>
        <td class="number-cell">${number.format(delivery.quantity)}</td>
        <td>${escapeHtml(delivery.receivedBy || "Sin dato")}</td>
        <td>${evidenceHtml}</td>
        <td>
          <button class="icon-button" type="button" data-delete-delivery="${delivery.id}" title="Eliminar remisión">
            <i data-lucide="trash-2" aria-hidden="true"></i>
          </button>
        </td>
      `;
      tbody.append(row);
    });
}

function renderDocuments(tender) {
  const tbody = $("documentsTable");
  tbody.replaceChildren();
  if (!tender.documents.length) {
    tbody.append(emptyRow("Sin archivos registrados.", 5));
    return;
  }

  [...tender.documents]
    .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))
    .forEach((documentRecord) => {
      const link = documentRecord.driveUrl
        ? `<a href="${escapeAttribute(documentRecord.driveUrl)}" target="_blank" rel="noreferrer">${escapeHtml(documentRecord.name)}</a>`
        : escapeHtml(documentRecord.name);
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${escapeHtml(documentRecord.type)}</td>
        <td>${link}<br><small>${formatFileSize(documentRecord.size)}</small></td>
        <td>${formatDate(documentRecord.uploadedAt)}</td>
        <td>${escapeHtml(documentRecord.status)}</td>
        <td>
          <button class="icon-button" type="button" data-delete-document="${documentRecord.id}" title="Eliminar registro">
            <i data-lucide="trash-2" aria-hidden="true"></i>
          </button>
        </td>
      `;
      tbody.append(row);
    });
}

function renderPhases(tender) {
  const container = $("phasesContainer");
  container.replaceChildren();

  LICITACION_PHASES.forEach((phase) => {
    const docs = tender.phaseDocs?.[phase.id] || [];
    const completedCount = docs.length;

    const section = document.createElement("div");
    section.className = "phase-block";

    const phaseStatusClass = completedCount > 0 ? "phase-has-docs" : "phase-empty";

    section.innerHTML = `
      <div class="phase-header ${phaseStatusClass}">
        <div class="phase-icon" style="--phase-color:${phase.color}">
          <i data-lucide="${phase.icon}" aria-hidden="true"></i>
        </div>
        <div class="phase-info">
          <strong>${escapeHtml(phase.name)}</strong>
          <p>${escapeHtml(phase.description)}</p>
        </div>
        <div class="phase-actions">
          <span class="phase-doc-count ${completedCount > 0 ? 'has-docs' : ''}">${completedCount} doc${completedCount !== 1 ? "s" : ""}</span>
          <button class="secondary-action phase-upload-btn" type="button"
            data-phase-id="${phase.id}"
            data-phase-name="${escapeAttribute(phase.name)}">
            <i data-lucide="upload" aria-hidden="true"></i>
            Subir
          </button>
        </div>
      </div>
    `;

    if (docs.length) {
      const docList = document.createElement("div");
      docList.className = "phase-doc-list";
      docs.forEach((doc) => {
        const item = document.createElement("div");
        item.className = "phase-doc-item";
        const link = doc.driveUrl
          ? `<a href="${escapeAttribute(doc.driveUrl)}" target="_blank" rel="noreferrer">${escapeHtml(doc.name)}</a>`
          : `<span>${escapeHtml(doc.name)}</span>`;
        item.innerHTML = `
          <i data-lucide="file-text" aria-hidden="true"></i>
          <div>
            ${link}
            <small>${formatDate(doc.uploadedAt)} · ${formatFileSize(doc.size)} · ${escapeHtml(doc.status)}</small>
          </div>
          <button class="icon-button" type="button"
            data-delete-phase-doc="${doc.id}"
            data-phase-id="${phase.id}"
            title="Eliminar">
            <i data-lucide="trash-2" aria-hidden="true"></i>
          </button>
        `;
        docList.append(item);
      });
      section.append(docList);
    }

    container.append(section);
  });

  // Bind upload buttons
  container.querySelectorAll(".phase-upload-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      openPhaseUploadDialog(btn.dataset.phaseId, btn.dataset.phaseName);
    });
  });

  // Bind delete buttons
  container.querySelectorAll("[data-delete-phase-doc]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const docId = btn.dataset.deletePhaseDoc;
      const phaseId = btn.dataset.phaseId;
      deletePhaseDoc(phaseId, docId);
    });
  });

  refreshIcons();
}

function renderUsers() {
  const tbody = $("usersTable");
  if (!tbody) return;
  tbody.replaceChildren();

  state.users.forEach((user) => {
    const row = document.createElement("tr");
    const protectedText = user.protected ? "Protegido" : "Activo";
    const action = user.protected
      ? `<span class="muted">Admin base</span>`
      : `<button class="icon-button" type="button" data-delete-user="${user.id}" title="Dar de baja usuario">
          <i data-lucide="user-minus" aria-hidden="true"></i>
        </button>`;
    row.innerHTML = `
      <td><strong>${escapeHtml(user.username)}</strong></td>
      <td>${escapeHtml(user.name)}</td>
      <td>${escapeHtml(user.role)}</td>
      <td>${protectedText}</td>
      <td>${action}</td>
    `;
    tbody.append(row);
  });
}

// ─── DIALOGS ─────────────────────────────────────────────────────────────────

function openTenderDialog(tender = null) {
  $("tenderDialogTitle").textContent = tender ? "Editar licitación" : "Nueva licitación";
  $("tenderIdInput").value = tender?.id || "";
  $("tenderNameInput").value = tender?.name || "";
  $("clientInput").value = tender?.client || "";
  $("contractInput").value = tender?.contract || "";
  $("deadlineInput").value = tender?.deadline || "";
  $("notesInput").value = tender?.notes || "";
  openDialog("tenderDialog");
}

function openProductDialog() {
  if (!getActiveTender()) return;
  $("productForm").reset();
  $("unitInput").value = "pieza";
  openDialog("productDialog");
}

function openDeliveryDialog() {
  const tender = getActiveTender();
  if (!tender || !tender.products.length) return;
  const select = $("deliveryProductInput");
  select.replaceChildren();
  tender.products.forEach((product) => {
    const option = document.createElement("option");
    option.value = product.id;
    option.textContent = `${product.name} (${number.format(getRemainingQuantity(tender, product.id))} restante)`;
    select.append(option);
  });
  $("deliveryForm").reset();
  $("deliveryDateInput").value = today();
  $("evidenceError").textContent = "";
  openDialog("deliveryDialog");
}

function openUsersDialog() {
  if (!getCurrentUser()?.isAdmin) return;
  $("userForm").reset();
  $("userFormError").textContent = "";
  renderUsers();
  openDialog("usersDialog");
}

function openQuoteLineDialog(line = null) {
  $("quoteLineDialogTitle").textContent = line ? "Editar línea" : "Agregar línea";
  $("quoteLineIdInput").value = line?.id || "";
  $("quoteLineDescInput").value = line?.description || "";
  $("quoteLineUnitInput").value = line?.unit || "pieza";
  $("quoteLineQtyInput").value = line?.quantity || "";
  $("quoteLinePriceInput").value = line?.unitPrice || "";
  openDialog("quoteLineDialog");
}

function openPhaseUploadDialog(phaseId, phaseName) {
  $("phaseIdInput").value = phaseId;
  $("phaseUploadTitle").textContent = `Subir doc: ${phaseName}`;
  $("phaseUploadForm").reset();
  $("phaseIdInput").value = phaseId;
  $("phaseUploadStatus").textContent = "";
  openDialog("phaseUploadDialog");
}

function openDialog(id) {
  const dialog = $(id);
  if (dialog.showModal) {
    dialog.showModal();
  } else {
    dialog.setAttribute("open", "");
  }
  refreshIcons();
}

function closeDialog(id) {
  const dialog = $(id);
  if (dialog.close) {
    dialog.close();
  } else {
    dialog.removeAttribute("open");
  }
}

// ─── FORM HANDLERS ───────────────────────────────────────────────────────────

function handleTenderSubmit(event) {
  event.preventDefault();
  const id = $("tenderIdInput").value;
  const payload = {
    name: $("tenderNameInput").value.trim(),
    client: $("clientInput").value.trim(),
    contract: $("contractInput").value.trim(),
    deadline: $("deadlineInput").value,
    notes: $("notesInput").value.trim(),
  };
  if (!payload.name || !payload.client || !payload.contract) return;

  if (id) {
    const tender = state.tenders.find((item) => item.id === id);
    if (tender) Object.assign(tender, payload);
  } else {
    const tender = normalizeTender({
      ...payload,
      id: createId("lic"),
      createdAt: new Date().toISOString(),
      status: "Activa",
    });
    state.tenders.unshift(tender);
    state.activeTenderId = tender.id;
  }
  saveState();
  closeDialog("tenderDialog");
  render();
}

function handleProductSubmit(event) {
  event.preventDefault();
  const tender = getActiveTender();
  if (!tender) return;
  tender.products.push(
    normalizeProduct({
      id: createId("prd"),
      name: $("productNameInput").value.trim(),
      unit: $("unitInput").value.trim() || "pieza",
      sector: $("sectorInput").value.trim(),
      partida: $("partidaInput").value.trim(),
      quantity: toPositiveNumber($("quantityInput").value),
      unitPrice: toPositiveNumber($("priceInput").value),
    }),
  );
  saveState();
  closeDialog("productDialog");
  state.activeTab = "products";
  render();
}

async function handleDeliverySubmit(event) {
  event.preventDefault();
  const tender = getActiveTender();
  if (!tender) return;

  const productId = $("deliveryProductInput").value;
  const product = tender.products.find((item) => item.id === productId);
  const quantity = toPositiveNumber($("deliveryQuantityInput").value);
  if (!product || quantity <= 0) return;

  const remaining = getRemainingQuantity(tender, productId);
  if (quantity > remaining) {
    alert(`La cantidad excede el restante contratado: ${number.format(remaining)}.`);
    return;
  }

  // Validate evidence file
  const evidenceFile = $("deliveryEvidenceFile").files[0];
  if (!evidenceFile) {
    $("evidenceError").textContent = "Debes adjuntar un PDF o imagen como evidencia de la entrega.";
    return;
  }
  const allowedTypes = ["application/pdf", "image/"];
  const isAllowed = allowedTypes.some((t) => evidenceFile.type.startsWith(t));
  if (!isAllowed) {
    $("evidenceError").textContent = "Solo se permiten archivos PDF o imágenes (JPG, PNG, WEBP, etc.).";
    return;
  }
  $("evidenceError").textContent = "";

  const nextNumber = tender.deliveries.length + 1;
  const delivery = normalizeDelivery({
    id: createId("rem"),
    number: `REM-${String(nextNumber).padStart(4, "0")}`,
    productId,
    quantity,
    date: $("deliveryDateInput").value || today(),
    receivedBy: $("receivedByInput").value.trim(),
    notes: $("deliveryNotesInput").value.trim(),
    evidenceName: evidenceFile.name,
    evidenceSize: evidenceFile.size,
    evidenceMime: evidenceFile.type,
    evidenceStatus: "Subiendo",
    createdAt: new Date().toISOString(),
  });
  tender.deliveries.push(delivery);
  saveState();
  closeDialog("deliveryDialog");
  state.activeTab = "deliveries";
  render();

  // Upload evidence in background
  try {
    const url = await uploadToDrive(evidenceFile, {
      type: "Evidencia-Remisión",
      name: evidenceFile.name,
      uploadedAt: delivery.createdAt,
    }, tender);
    delivery.evidenceDriveUrl = url || "";
    delivery.evidenceStatus = "Enviado a Drive";
    saveState();
    renderDeliveries(tender);
    refreshIcons();
  } catch {
    delivery.evidenceStatus = "Error al subir";
    saveState();
    renderDeliveries(tender);
    refreshIcons();
  }
}

async function handleUploadSubmit(event) {
  event.preventDefault();
  const tender = getActiveTender();
  const file = $("documentFile").files[0];
  if (!tender || !file) return;

  const documentRecord = normalizeDocument({
    id: createId("doc"),
    type: $("documentType").value,
    name: file.name,
    mime: file.type || "application/octet-stream",
    size: file.size,
    status: "Subiendo",
    uploadedAt: new Date().toISOString(),
  });
  tender.documents.unshift(documentRecord);
  saveState();
  renderDocuments(tender);
  $("uploadStatus").textContent = "Subiendo archivo a Google Drive...";

  try {
    await uploadToDrive(file, documentRecord, tender);
    documentRecord.status = "Enviado a Drive";
    $("uploadStatus").textContent = "Solicitud enviada correctamente a Google Drive.";
    $("uploadForm").reset();
  } catch (error) {
    documentRecord.status = "Error al subir";
    $("uploadStatus").textContent = "No se pudo completar la subida. Revisa el endpoint de Drive.";
    console.error(error);
  }
  saveState();
  renderDocuments(tender);
  refreshIcons();
}

function handleUserSubmit(event) {
  event.preventDefault();
  if (!getCurrentUser()?.isAdmin) return;

  const username = $("newUsernameInput").value.trim().toLowerCase();
  const password = $("newUserPasswordInput").value;
  const name = $("newUserNameInput").value.trim();
  const role = $("newUserRoleInput").value;
  const error = $("userFormError");
  error.textContent = "";

  if (!username || !password || !name) {
    error.textContent = "Completa nombre, usuario y contraseña.";
    return;
  }
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
    error.textContent = "El usuario debe tener 3 a 32 caracteres: letras, números, punto, guion o guion bajo.";
    return;
  }
  if (password.length < 6) {
    error.textContent = "La contraseña debe tener al menos 6 caracteres.";
    return;
  }
  const exists = state.users.some((user) => user.username.toLowerCase() === username);
  if (exists) {
    error.textContent = "Ese usuario ya existe.";
    return;
  }

  state.users.push(
    normalizeUser({
      id: createId("usr"),
      username,
      password,
      name,
      role,
      isAdmin: false,
      protected: false,
      createdAt: new Date().toISOString(),
    }),
  );
  saveState();
  $("userForm").reset();
  renderUsers();
  refreshIcons();
}

function handleQuoteLineSubmit(event) {
  event.preventDefault();
  const tender = getActiveTender();
  if (!tender) return;
  const id = $("quoteLineIdInput").value;
  const payload = {
    description: $("quoteLineDescInput").value.trim(),
    unit: $("quoteLineUnitInput").value.trim() || "pieza",
    quantity: toPositiveNumber($("quoteLineQtyInput").value),
    unitPrice: toPositiveNumber($("quoteLinePriceInput").value),
  };
  if (!payload.description || payload.quantity <= 0) return;
  if (id) {
    const line = tender.quoteLines.find((l) => l.id === id);
    if (line) Object.assign(line, payload);
  } else {
    tender.quoteLines.push(normalizeQuoteLine({ id: createId("ql"), ...payload }));
  }
  saveState();
  closeDialog("quoteLineDialog");
  renderQuote(tender);
}

async function handlePhaseUploadSubmit(event) {
  event.preventDefault();
  const tender = getActiveTender();
  const phaseId = $("phaseIdInput").value;
  const file = $("phaseDocFile").files[0];
  const docName = $("phaseDocNameInput").value.trim();
  if (!tender || !phaseId || !file || !docName) return;

  if (!tender.phaseDocs) tender.phaseDocs = {};
  if (!Array.isArray(tender.phaseDocs[phaseId])) tender.phaseDocs[phaseId] = [];

  const doc = normalizePhaseDoc({
    id: createId("phd"),
    name: docName,
    mime: file.type || "application/octet-stream",
    size: file.size,
    status: "Subiendo",
    uploadedAt: new Date().toISOString(),
  });
  tender.phaseDocs[phaseId].push(doc);
  saveState();
  $("phaseUploadStatus").textContent = "Subiendo a Google Drive...";
  renderPhases(tender);

  try {
    await uploadToDrive(file, { type: `Fase-${phaseId}`, name: docName, uploadedAt: doc.uploadedAt }, tender);
    doc.status = "Enviado a Drive";
    $("phaseUploadStatus").textContent = "Documento enviado correctamente.";
  } catch {
    doc.status = "Error al subir";
    $("phaseUploadStatus").textContent = "Error al subir. Revisa el endpoint.";
  }
  saveState();
  setTimeout(() => {
    closeDialog("phaseUploadDialog");
    renderPhases(tender);
    refreshIcons();
  }, 1200);
}

function importProductsToQuote() {
  const tender = getActiveTender();
  if (!tender || !tender.products.length) {
    alert("No hay productos para importar.");
    return;
  }
  const confirmed = confirm("¿Importar todos los productos actuales como líneas de cotización? Esto agregará líneas nuevas sin borrar las existentes.");
  if (!confirmed) return;
  tender.products.forEach((product) => {
    tender.quoteLines.push(normalizeQuoteLine({
      id: createId("ql"),
      description: product.name,
      unit: product.unit,
      quantity: product.quantity,
      unitPrice: product.unitPrice,
    }));
  });
  saveState();
  renderQuote(tender);
}

// ─── TABLE CLICK HANDLERS ────────────────────────────────────────────────────

function handleProductTableChange(event) {
  const { productId, productField } = event.target.dataset;
  if (!productId || !productField) return;
  const tender = getActiveTender();
  const product = tender?.products.find((item) => item.id === productId);
  if (!product) return;
  if (["quantity", "unitPrice"].includes(productField)) {
    product[productField] = toPositiveNumber(event.target.value);
  } else {
    product[productField] = event.target.value.trim();
  }
  saveState();
  render();
}

function handleProductTableClick(event) {
  const button = event.target.closest("[data-delete-product]");
  if (!button) return;
  const tender = getActiveTender();
  if (!tender) return;
  const productId = button.dataset.deleteProduct;
  const product = tender.products.find((item) => item.id === productId);
  if (!product) return;
  const confirmed = confirm(`¿Eliminar "${product.name}" y sus remisiones?`);
  if (!confirmed) return;
  tender.products = tender.products.filter((item) => item.id !== productId);
  tender.deliveries = tender.deliveries.filter((item) => item.productId !== productId);
  saveState();
  render();
}

function handleDeliveryTableClick(event) {
  const button = event.target.closest("[data-delete-delivery]");
  if (!button) return;
  const tender = getActiveTender();
  if (!tender) return;
  const delivery = tender.deliveries.find((item) => item.id === button.dataset.deleteDelivery);
  if (!delivery) return;
  const confirmed = confirm(`¿Eliminar la remisión ${delivery.number}?`);
  if (!confirmed) return;
  tender.deliveries = tender.deliveries.filter((item) => item.id !== delivery.id);
  saveState();
  render();
}

function handleDocumentTableClick(event) {
  const button = event.target.closest("[data-delete-document]");
  if (!button) return;
  const tender = getActiveTender();
  if (!tender) return;
  const confirmed = confirm("¿Eliminar este registro de archivo del panel?");
  if (!confirmed) return;
  tender.documents = tender.documents.filter((item) => item.id !== button.dataset.deleteDocument);
  saveState();
  render();
}

function handleQuoteLineTableClick(event) {
  const button = event.target.closest("[data-delete-quoteline]");
  if (!button) return;
  const tender = getActiveTender();
  if (!tender) return;
  const confirmed = confirm("¿Eliminar esta línea de cotización?");
  if (!confirmed) return;
  tender.quoteLines = tender.quoteLines.filter((l) => l.id !== button.dataset.deleteQuoteline);
  saveState();
  renderQuote(tender);
}

function handleUsersTableClick(event) {
  const button = event.target.closest("[data-delete-user]");
  if (!button || !getCurrentUser()?.isAdmin) return;
  const user = state.users.find((item) => item.id === button.dataset.deleteUser);
  if (!user || user.protected) return;
  const confirmed = confirm(`¿Dar de baja al usuario "${user.username}"?`);
  if (!confirmed) return;
  state.users = state.users.filter((item) => item.id !== user.id);
  if (sessionStorage.getItem(SESSION_KEY) === user.username) {
    sessionStorage.removeItem(SESSION_KEY);
  }
  saveState();
  renderUsers();
  refreshIcons();
}

function handleStatusChange(event) {
  const tender = getActiveTender();
  if (!tender) return;
  tender.status = event.target.value;
  saveState();
  render();
}

function deleteActiveTender() {
  const tender = getActiveTender();
  if (!tender) return;
  const confirmed = confirm(`¿Eliminar la licitación "${tender.name}"?`);
  if (!confirmed) return;
  state.tenders = state.tenders.filter((item) => item.id !== tender.id);
  state.activeTenderId = state.tenders[0]?.id || null;
  saveState();
  render();
}

function deletePhaseDoc(phaseId, docId) {
  const tender = getActiveTender();
  if (!tender || !tender.phaseDocs?.[phaseId]) return;
  const confirmed = confirm("¿Eliminar este documento de la fase?");
  if (!confirmed) return;
  tender.phaseDocs[phaseId] = tender.phaseDocs[phaseId].filter((d) => d.id !== docId);
  saveState();
  renderPhases(tender);
  refreshIcons();
}

// ─── QUOTE ───────────────────────────────────────────────────────────────────

function generateQuote() {
  const tender = getActiveTender();
  if (!tender) return;
  if (!tender.quoteNumber) {
    const datePart = new Date().toISOString().slice(0, 10).replaceAll("-", "");
    tender.quoteNumber = `COT-${datePart}-${String(state.tenders.indexOf(tender) + 1).padStart(3, "0")}`;
    tender.quoteCreatedAt = new Date().toISOString();
  }
  tender.quoteUpdatedAt = new Date().toISOString();
  state.activeTab = "quote";
  saveState();
  render();
}

function printQuote() {
  const tender = getActiveTender();
  if (!tender) return;
  if (!tender.quoteNumber) generateQuote();
  window.print();
}

// ─── DRIVE UPLOAD ─────────────────────────────────────────────────────────────
// Se envía como JSON con base64, porque fetch con mode:"no-cors" + FormData
// no retorna respuesta útil y a veces falla el Content-Type. El Apps Script
// debe leer e.postData.contents (JSON) en lugar de e.parameter.

async function uploadToDrive(file, documentRecord, tender) {
  const dataUrl = await readFileAsDataUrl(file);
  const base64Data = dataUrl.split(",")[1] || "";

  const payload = {
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    fileBase64: base64Data,
    documentType: documentRecord.type,
    tenderId: tender.id,
    tenderName: tender.name,
    contract: tender.contract,
    client: tender.client,
    uploadedAt: documentRecord.uploadedAt,
  };

  // NOTE: Con mode:"no-cors" NO podemos leer la respuesta.
  // El script debe manejar el JSON parseando e.postData.contents.
  // Si tu script ya usa e.parameter, cambia a JSON.parse(e.postData.contents).
  await fetch(DRIVE_ENDPOINT, {
    method: "POST",
    mode: "no-cors",
    headers: {
      "Content-Type": "text/plain", // no-cors no permite application/json
    },
    body: JSON.stringify(payload),
  });

  // Con no-cors no podemos leer la URL de respuesta; retornamos vacío.
  return "";
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function getActiveTender() {
  return state.tenders.find((tender) => tender.id === state.activeTenderId) || null;
}

function getCurrentUser() {
  const username = sessionStorage.getItem(SESSION_KEY);
  if (!username) return null;
  return state.users.find((user) => user.username === username) || null;
}

function getFinancials(tender) {
  const subtotal = tender.products.reduce(
    (sum, product) => sum + product.quantity * product.unitPrice,
    0,
  );
  const iva = subtotal * IVA_RATE;
  return {
    subtotal,
    iva,
    total: subtotal + iva,
  };
}

function getProductTotal(product) {
  return product.quantity * product.unitPrice * (1 + IVA_RATE);
}

function getDeliveredQuantity(tender, productId) {
  return tender.deliveries
    .filter((delivery) => delivery.productId === productId)
    .reduce((sum, delivery) => sum + delivery.quantity, 0);
}

function getRemainingQuantity(tender, productId) {
  const product = tender.products.find((item) => item.id === productId);
  if (!product) return 0;
  return Math.max(0, product.quantity - getDeliveredQuantity(tender, productId));
}

function createId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function toPositiveNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value) {
  if (!value) return "Sin fecha";
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";
  return dateFormatter.format(date);
}

function formatFileSize(bytes) {
  if (!bytes) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${number.format(size)} ${units[unitIndex]}`;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function emptyRow(text, colspan) {
  const row = document.createElement("tr");
  row.innerHTML = `<td colspan="${colspan}" class="empty-row">${escapeHtml(text)}</td>`;
  return row;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

function refreshIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}
