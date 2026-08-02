let products = [];
let publicationState = { approved: {} };

const colorWords = [
  "preto",
  "branco",
  "cinza",
  "azul",
  "vermelho",
  "rosa",
  "verde",
  "amarelo",
  "bege",
  "marrom",
  "lilas",
  "roxo",
];

const summary = document.querySelector("#seller-summary");
const chatLog = document.querySelector("#chat-log");
const chatForm = document.querySelector("#chat-form");
const chatInput = document.querySelector("#chat-input");
const quickPrompts = document.querySelector("#quick-prompts");
const customerName = document.querySelector("#seller-customer-name");
const deliveryMode = document.querySelector("#seller-delivery-mode");
const paymentMode = document.querySelector("#seller-payment-mode");
const sellerNote = document.querySelector("#seller-note");

init();

async function init() {
  try {
    const productsResponse = await fetch("/products.json");
    const stateResponse = await fetch("/publication-state");
    const allProducts = productsResponse.ok ? await productsResponse.json() : [];
    publicationState = stateResponse.ok ? await stateResponse.json() : { approved: {} };
    products = allProducts.filter((product) => publicationState.approved[productKey(product)]);
  } catch {
    products = [];
  }

  summary.textContent = `${products.length} produtos publicados disponiveis para atendimento`;
  renderQuickPrompts();
  addBotMessage("Oi! Me diga o tamanho, cor ou codigo do calcado que voce procura. Eu posso mostrar opcoes e registrar o pedido por aqui.");

  chatForm.addEventListener("submit", handleChatSubmit);
  chatLog.addEventListener("click", handleChatClick);
  quickPrompts.addEventListener("click", handleQuickPrompt);
}

function renderQuickPrompts() {
  const sizes = [...new Set(products.flatMap((product) => (product.sizes ?? []).map((item) => item.size)))].sort((a, b) => Number(a) - Number(b));
  const colors = [...new Set(products.flatMap((product) => product.colors ?? []))].slice(0, 4);
  const prompts = [
    sizes[0] ? `Quero tamanho ${sizes[0]}` : "",
    colors[0] ? `Tem calcado ${colors[0]}?` : "",
    "Mostrar opcoes disponiveis",
  ].filter(Boolean);

  quickPrompts.innerHTML = prompts.map((prompt) => `<button type="button" data-prompt="${escapeHtml(prompt)}">${escapeHtml(prompt)}</button>`).join("");
}

function handleQuickPrompt(event) {
  const button = event.target.closest("button[data-prompt]");
  if (!button) return;
  chatInput.value = button.dataset.prompt;
  chatForm.requestSubmit();
}

function handleChatSubmit(event) {
  event.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;

  addUserMessage(text);
  chatInput.value = "";

  const intent = parseIntent(text);
  const matches = findProducts(intent);

  if (!products.length) {
    addBotMessage("Ainda nao tem produtos publicados para eu oferecer. Aprove os itens na revisao primeiro.");
    return;
  }

  if (!matches.length) {
    addBotMessage("Nao achei uma opcao exata com esse pedido. Posso procurar por outro tamanho, cor ou codigo.");
    showProducts(products.slice(0, 3), intent);
    return;
  }

  addBotMessage(responseForIntent(intent, matches.length));
  showProducts(matches.slice(0, 4), intent);
}

function parseIntent(text) {
  const normalized = text.toLowerCase();
  const sizes = [...normalized.matchAll(/\b(3[3-9]|4[0-6])\b/g)].map((match) => match[1]);
  const colors = colorWords.filter((color) => normalized.includes(color));
  const codeMatch = normalized.match(/(?:cod|codigo|c[oó]digo)\s*[:#-]?\s*(\d+)/) ?? normalized.match(/\b(4\d{3}|5\d{3})\b/);

  return {
    raw: text,
    size: sizes[0] ?? "",
    colors,
    code: codeMatch?.[1] ?? "",
  };
}

function findProducts(intent) {
  return products
    .filter((product) => {
      if (intent.code && String(product.code ?? product.id) !== intent.code) return false;
      if (intent.size && !(product.sizes ?? []).some((item) => item.size === intent.size && item.quantity > 0)) return false;
      if (intent.colors.length && !intent.colors.some((color) => (product.colors ?? []).includes(color))) return false;
      return true;
    })
    .sort((a, b) => scoreProduct(b, intent) - scoreProduct(a, intent));
}

function scoreProduct(product, intent) {
  let score = 0;
  if (intent.code && String(product.code ?? product.id) === intent.code) score += 4;
  if (intent.size && (product.sizes ?? []).some((item) => item.size === intent.size && item.quantity > 0)) score += 3;
  score += intent.colors.filter((color) => (product.colors ?? []).includes(color)).length * 2;
  return score;
}

function responseForIntent(intent, count) {
  const details = [
    intent.size ? `tamanho ${intent.size}` : "",
    intent.colors.length ? intent.colors.join(", ") : "",
    intent.code ? `COD ${intent.code}` : "",
  ].filter(Boolean);

  if (!details.length) return `Encontrei ${count} opcoes disponiveis. Veja as fotos e escolha um tamanho.`;
  return `Encontrei ${count} opcao(oes) para ${details.join(" / ")}. Veja as fotos e escolha o tamanho para eu registrar.`;
}

function showProducts(items, intent) {
  const bubble = document.createElement("div");
  bubble.className = "chat-message bot-message product-message";
  bubble.innerHTML = items.map((product) => productCard(product, intent)).join("");
  chatLog.append(bubble);
  scrollChat();
}

function productCard(product, intent) {
  const availableSizes = (product.sizes ?? []).filter((item) => item.quantity > 0);
  const sizes = (intent.size ? availableSizes.filter((item) => item.size === intent.size) : availableSizes).slice(0, 6);
  const colors = (product.colors ?? []).map((color) => `<span class="color-chip">${escapeHtml(color)}</span>`).join("");
  const image = product.localImage ? `<img src="/${escapeHtml(product.localImage)}" alt="Produto COD ${escapeHtml(product.code ?? product.id)}">` : "";

  return `
    <article class="seller-product">
      ${image}
      <div class="seller-product-body">
        <div class="row">
          <strong>COD ${escapeHtml(product.code ?? product.id)}</strong>
          <span class="price">${escapeHtml(product.priceText ?? "")}</span>
        </div>
        <div class="chips">${colors}</div>
        <div class="seller-size-actions">
          ${sizes.map((item) => `<button type="button" data-product-key="${escapeHtml(productKey(product))}" data-size="${escapeHtml(item.size)}">Pedir tam. ${escapeHtml(item.size)}</button>`).join("")}
        </div>
      </div>
    </article>
  `;
}

async function handleChatClick(event) {
  const button = event.target.closest("button[data-product-key][data-size]");
  if (!button) return;

  const product = products.find((item) => productKey(item) === button.dataset.productKey);
  if (!product) return;

  button.disabled = true;
  button.textContent = "Registrando...";

  const order = {
    productKey: productKey(product),
    code: product.code ?? product.id ?? "",
    boxLocation: product.boxLocation ?? product.note ?? "",
    size: button.dataset.size,
    priceText: product.priceText ?? "",
    image: product.localImage ?? "",
    customerName: customerName.value.trim(),
    deliveryMode: deliveryMode.value,
    paymentMode: paymentMode.value,
    note: sellerNote.value.trim() || "Pedido criado pelo vendedor robo",
    whatsappText: buildWhatsappText(product, button.dataset.size),
  };

  try {
    const response = await fetch("/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(order),
    });
    if (!response.ok) throw new Error("Falha ao salvar");
    addBotMessage(`Pedido registrado: COD ${product.code ?? product.id}, tamanho ${button.dataset.size}. Ele ja apareceu na tela de pedidos.`);
  } catch {
    addBotMessage("Nao consegui registrar esse pedido agora. Tente novamente em instantes.");
  } finally {
    button.disabled = false;
    button.textContent = `Pedir tam. ${button.dataset.size}`;
  }
}

function buildWhatsappText(product, size) {
  const lines = [
    "Ola, quero fazer um pedido.",
    "",
    `Produto: COD ${product.code ?? product.id}`,
    `Tamanho: ${size}`,
    `Preco: ${product.priceText ?? ""}`,
    `Caixa/estoque: ${product.boxLocation ?? product.note ?? "nao informada"}`,
    `Forma: ${deliveryMode.value}`,
    `Pagamento: ${paymentMode.value}`,
    customerName.value.trim() ? `Nome: ${customerName.value.trim()}` : "",
    sellerNote.value.trim() ? `Obs: ${sellerNote.value.trim()}` : "",
    "",
    "Pode confirmar disponibilidade e proximo passo para pagamento?",
  ];

  return lines.filter(Boolean).join("\n");
}

function addUserMessage(text) {
  addMessage("user-message", text);
}

function addBotMessage(text) {
  addMessage("bot-message", text);
}

function addMessage(className, text) {
  const bubble = document.createElement("div");
  bubble.className = `chat-message ${className}`;
  bubble.textContent = text;
  chatLog.append(bubble);
  scrollChat();
}

function scrollChat() {
  chatLog.scrollTop = chatLog.scrollHeight;
}

function productKey(product) {
  return [product.position, product.code ?? product.id ?? "sem-codigo", product.boxLocation ?? product.note ?? "sem-caixa"].join("|");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
