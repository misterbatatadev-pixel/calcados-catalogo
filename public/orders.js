let orders = [];

const statusLabels = {
  novo: "Novo",
  aguardando_pagamento: "Aguardando pagamento",
  pagamento_entrega: "Pagamento na entrega/retirada",
  pago: "Pago",
  separado: "Separado",
  saiu_entrega: "Saiu para entrega",
  entregue: "Entregue/retirado",
  cancelado: "Cancelado",
};

const stockFlowLabels = {
  a_definir: "Conferir estoque",
  em_maos: "Tenho em maos",
  buscar_fornecedor: "Buscar no fornecedor",
  pronto_retirada: "Pronto para retirada",
  pronto_entrega: "Pronto para entrega",
  saiu_entrega: "Saiu para entrega",
  entregue: "Entregue/retirado",
  indisponivel: "Indisponivel",
};

const summary = document.querySelector("#orders-summary");
const statusFilter = document.querySelector("#orders-status");
const searchInput = document.querySelector("#orders-search");
const stats = document.querySelector("#orders-stats");
const list = document.querySelector("#orders-list");

init();

async function init() {
  try {
    const response = await fetch("/orders");
    orders = response.ok ? await response.json() : [];
  } catch {
    orders = [];
  }

  fillStatusFilter();
  render();

  statusFilter.addEventListener("change", render);
  searchInput.addEventListener("input", render);
  list.addEventListener("change", handleStatusChange);
}

function fillStatusFilter() {
  for (const [value, label] of Object.entries(statusLabels)) {
    statusFilter.append(new Option(label, value));
  }
}

function render() {
  const query = searchInput.value.trim().toLowerCase();
  const status = statusFilter.value;
  const visible = orders.filter((order) => {
    const haystack = [
      order.customerName,
      order.code,
      order.size,
      order.boxLocation,
      order.deliveryMode,
      order.paymentMode,
      order.note,
      statusLabels[order.status],
      stockFlowLabels[order.stockFlow],
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    if (status && order.status !== status) return false;
    if (query && !haystack.includes(query)) return false;
    return true;
  });

  summary.textContent = `${visible.length} de ${orders.length} pedidos`;
  stats.innerHTML = statsTemplate();
  list.innerHTML = visible.length ? visible.map(orderTemplate).join("") : emptyOrdersTemplate();
}

function statsTemplate() {
  const total = orders.length;
  const open = orders.filter((order) => !["entregue", "cancelado"].includes(order.status)).length;
  const waiting = orders.filter((order) => order.status === "aguardando_pagamento").length;
  const supplier = orders.filter((order) => order.stockFlow === "buscar_fornecedor").length;
  const ready = orders.filter((order) => ["em_maos", "pronto_retirada", "pronto_entrega"].includes(order.stockFlow)).length;

  return [
    statTemplate(total, "pedidos"),
    statTemplate(open, "em andamento"),
    statTemplate(waiting, "aguardando pagamento"),
    statTemplate(supplier, "buscar fornecedor"),
    statTemplate(ready, "prontos/em maos"),
  ].join("");
}

function statTemplate(value, label) {
  return `<article class="stat"><strong>${value}</strong><span>${label}</span></article>`;
}

function orderTemplate(order) {
  const date = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(order.createdAt));

  return `
    <article class="order-item" data-order-id="${escapeHtml(order.id)}">
      ${order.image ? `<img src="/${escapeHtml(order.image)}" alt="Produto COD ${escapeHtml(order.code)}">` : `<div class="missing-image">Sem foto</div>`}
      <div class="order-body">
        <div class="row">
          <div>
            <strong>COD ${escapeHtml(order.code || "sem codigo")}</strong>
            <p>${escapeHtml(order.customerName || "Cliente sem nome")} | Tam. ${escapeHtml(order.size || "-")} | ${escapeHtml(order.priceText || "")}</p>
          </div>
          <span class="status-chip status-${escapeHtml(order.status)}">${escapeHtml(statusLabels[order.status] ?? order.status)}</span>
        </div>
        <div class="order-details">
          <span>Caixa/estoque: ${escapeHtml(order.boxLocation || "nao informado")}</span>
          <span class="stock-flow stock-${escapeHtml(order.stockFlow || "a_definir")}">${escapeHtml(stockFlowLabels[order.stockFlow] ?? stockFlowLabels.a_definir)}</span>
          <span>${escapeHtml(order.deliveryMode || "Retirada")}</span>
          <span>${escapeHtml(order.paymentMode || "")}</span>
          <span>${escapeHtml(date)}</span>
        </div>
        ${order.note ? `<p class="order-note">Obs: ${escapeHtml(order.note)}</p>` : ""}
        <div class="order-actions">
          <label>
            Status
            <select class="status-select">
              ${Object.entries(statusLabels).map(([value, label]) => `<option value="${value}" ${order.status === value ? "selected" : ""}>${label}</option>`).join("")}
            </select>
          </label>
          <label>
            Estoque/fornecedor
            <select class="stock-flow-select">
              ${Object.entries(stockFlowLabels).map(([value, label]) => `<option value="${value}" ${normalizeStockFlow(order.stockFlow) === value ? "selected" : ""}>${label}</option>`).join("")}
            </select>
          </label>
          <a class="nav-link" href="https://wa.me/?text=${encodeURIComponent(customerUpdateText(order))}" target="_blank" rel="noreferrer">Avisar cliente</a>
          ${order.whatsappText ? `<a class="nav-link" href="https://wa.me/?text=${encodeURIComponent(order.whatsappText)}" target="_blank" rel="noreferrer">Abrir WhatsApp</a>` : ""}
        </div>
      </div>
    </article>
  `;
}

async function handleStatusChange(event) {
  const select = event.target.closest(".status-select, .stock-flow-select");
  if (!select) return;

  const item = event.target.closest(".order-item");
  const order = orders.find((current) => current.id === item?.dataset.orderId);
  if (!order) return;

  if (select.classList.contains("status-select")) {
    order.status = select.value;
  } else {
    order.stockFlow = select.value;
    applySuggestedStatus(order);
  }
  select.disabled = true;

  try {
    await fetch("/orders", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(orders),
    });
  } finally {
    select.disabled = false;
    render();
  }
}

function applySuggestedStatus(order) {
  if (order.stockFlow === "pronto_retirada" || order.stockFlow === "pronto_entrega") {
    order.status = order.status === "aguardando_pagamento" ? order.status : "separado";
  }
  if (order.stockFlow === "saiu_entrega") order.status = "saiu_entrega";
  if (order.stockFlow === "entregue") order.status = "entregue";
  if (order.stockFlow === "indisponivel") order.status = "cancelado";
}

function normalizeStockFlow(value) {
  return stockFlowLabels[value] ? value : "a_definir";
}

function customerUpdateText(order) {
  const productLine = `Produto COD ${order.code || ""}, tamanho ${order.size || ""}`.trim();
  const base = [`Ola${order.customerName ? `, ${order.customerName}` : ""}!`, productLine].filter(Boolean);
  const stockFlow = normalizeStockFlow(order.stockFlow);

  const messages = {
    a_definir: "Estou conferindo a disponibilidade do seu pedido e ja te aviso o proximo passo.",
    em_maos: "Seu produto esta comigo. Vou separar e te confirmo a retirada ou entrega.",
    buscar_fornecedor: "Seu pedido esta reservado para eu buscar no fornecedor. Assim que estiver comigo, te aviso.",
    pronto_retirada: "Seu pedido ja esta pronto para retirada.",
    pronto_entrega: "Seu pedido ja esta pronto para entrega.",
    saiu_entrega: "Seu pedido saiu para entrega.",
    entregue: "Pedido entregue/retirado. Obrigado pela compra!",
    indisponivel: "Conferi o produto e infelizmente ele nao esta disponivel no momento. Posso te ajudar com outra opcao parecida?",
  };

  return [...base, "", messages[stockFlow]].join("\n");
}

function emptyOrdersTemplate() {
  return `
    <section class="empty-state">
      <h2>Nenhum pedido encontrado</h2>
      <p>Os pedidos aparecem aqui quando o cliente confirma pelo catalogo.</p>
      <a class="nav-link" href="/">Abrir catalogo</a>
    </section>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
