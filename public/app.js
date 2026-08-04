let products = [];
let publicationState = { approved: {} };

const grid = document.querySelector("#grid");
const summary = document.querySelector("#summary");
const searchInput = document.querySelector("#search");
const sizeSelect = document.querySelector("#size");
const colorSelect = document.querySelector("#color");
const orderDialog = document.querySelector("#order-dialog");
const orderForm = document.querySelector("#order-form");
const orderSummary = document.querySelector("#order-summary");
const orderImage = document.querySelector("#order-image");
const customerName = document.querySelector("#customer-name");
const deliveryMode = document.querySelector("#delivery-mode");
const paymentMode = document.querySelector("#payment-mode");
const orderNote = document.querySelector("#order-note");
const sendOrder = document.querySelector("#send-order");

let selectedOrder = null;

init();

async function init() {
  try {
    const response = await fetch("/products.json");
    products = response.ok ? await response.json() : [];
    const publicationResponse = await fetch("/publication-state");
    publicationState = publicationResponse.ok ? await publicationResponse.json() : { approved: {} };
  } catch {
    products = [];
    publicationState = { approved: {} };
  }

  products = products.filter((product) => publicationState.approved[productKey(product)]);
  fillFilters();
  render();

  searchInput.addEventListener("input", render);
  sizeSelect.addEventListener("change", render);
  colorSelect.addEventListener("change", render);
  grid.addEventListener("click", handleGridClick);
  orderForm.addEventListener("input", updateOrderLink);
  sendOrder.addEventListener("click", handleSendOrder);
}

function fillFilters() {
  const sizes = new Set();
  const colors = new Set();

  for (const product of products) {
    for (const item of product.sizes ?? []) sizes.add(item.size);
    for (const color of product.colors ?? []) colors.add(color);
  }

  for (const size of [...sizes].sort((a, b) => Number(a) - Number(b))) {
    sizeSelect.append(new Option(size, size));
  }

  for (const color of [...colors].sort()) {
    colorSelect.append(new Option(color, color));
  }
}

function render() {
  const query = searchInput.value.trim().toLowerCase();
  const size = sizeSelect.value;
  const color = colorSelect.value;

  const visible = products.filter((product) => {
    const boxLocation = product.boxLocation ?? product.note;
    const haystack = [
      product.code,
      boxLocation,
      product.apparentBrand,
      product.visualDescription,
      product.colorDescription,
      ...(product.searchKeywords ?? []),
      ...(product.colors ?? []),
      ...(product.sizes ?? []).map((item) => item.size),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    if (query && !haystack.includes(query)) return false;
    if (size && !(product.sizes ?? []).some((item) => item.size === size && item.quantity > 0)) return false;
    if (color && !(product.colors ?? []).includes(color)) return false;
    return true;
  });

  summary.textContent = `${visible.length} de ${products.length} produtos`;
  grid.innerHTML = visible.length ? visible.map(cardTemplate).join("") : emptyTemplate();
}

function productKey(product) {
  return [product.position, product.code ?? product.id ?? "sem-codigo", product.boxLocation ?? product.note ?? "sem-caixa"].join("|");
}

function cardTemplate(product) {
  const boxLocation = product.boxLocation ?? product.note;
  const sizes = (product.sizes ?? [])
    .map((item) => {
      const unit = item.quantity === 1 ? "un." : "uns.";
      return `
        <button class="size-pill size-link" data-product-key="${escapeHtml(productKey(product))}" data-size="${escapeHtml(item.size)}" type="button">
          <span class="size-info">
            <strong>Tam. ${escapeHtml(item.size)}</strong>
            <small>${escapeHtml(item.quantity)} ${unit}</small>
          </span>
          <span class="order-badge">Pedir</span>
        </button>
      `;
    })
    .join("");
  const colors = (product.colors ?? [])
    .map((color) => `<span class="color-chip">${escapeHtml(color)}</span>`)
    .join("");
  const description = product.visualDescription ?? product.colorDescription ?? "";
  const brand = product.apparentBrand ? `<span class="color-chip">${escapeHtml(product.apparentBrand)}</span>` : "";
  const message = encodeURIComponent(
    `Ola, quero este calcado COD ${product.code ?? product.id}, preco ${product.priceText ?? ""}. Pode me ajudar a escolher o tamanho?`
  );

  return `
    <article class="card">
      ${product.localImage ? `<img src="/${product.localImage}" alt="Produto ${escapeHtml(product.code ?? product.id)}">` : ""}
      <div class="content">
        <div class="row">
          <span class="code">COD ${escapeHtml(product.code ?? product.id)}</span>
          <span class="price">${escapeHtml(product.priceText ?? "")}</span>
        </div>
        ${description ? `<p class="product-description">${escapeHtml(description)}</p>` : ""}
        <section class="product-section">
          <h2>Comprar por tamanho</h2>
          <div class="sizes">${sizes}</div>
        </section>
        <section class="product-section">
          <h2>Cores do calcado</h2>
          <div class="chips">${colors}${brand}</div>
        </section>
        <div class="actions">
          <a href="https://wa.me/?text=${message}" target="_blank" rel="noreferrer">Tirar duvida no WhatsApp</a>
        </div>
      </div>
    </article>
  `;
}

function handleGridClick(event) {
  const button = event.target.closest(".size-link");
  if (!button) return;

  const product = products.find((item) => productKey(item) === button.dataset.productKey);
  const size = button.dataset.size;
  if (!product || !size) return;

  selectedOrder = { product, size };
  orderSummary.textContent = `COD ${product.code ?? product.id} | Tam. ${size} | ${product.priceText ?? ""}`;
  orderImage.src = product.localImage ? `/${product.localImage}` : "";
  orderImage.alt = `Produto ${product.code ?? product.id}`;
  customerName.value = "";
  deliveryMode.value = "Retirada";
  paymentMode.value = "Pagar na entrega/retirada";
  orderNote.value = "";
  updateOrderLink();
  orderDialog.showModal();
}

function updateOrderLink() {
  if (!selectedOrder) return;

  const { product, size } = selectedOrder;
  const message = buildOrderMessage(product, size);

  sendOrder.href = `https://wa.me/?text=${encodeURIComponent(message)}`;
}

async function handleSendOrder(event) {
  event.preventDefault();
  if (!selectedOrder) return;

  const { product, size } = selectedOrder;
  const message = buildOrderMessage(product, size);
  const originalText = sendOrder.textContent;

  sendOrder.textContent = "Registrando pedido...";
  sendOrder.setAttribute("aria-busy", "true");

  try {
    await fetch("/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productKey: productKey(product),
        code: product.code ?? product.id ?? "",
        boxLocation: product.boxLocation ?? product.note ?? "",
        size,
        priceText: product.priceText ?? "",
        image: product.localImage ?? "",
        customerName: customerName.value.trim(),
        deliveryMode: deliveryMode.value,
        paymentMode: paymentMode.value,
        note: orderNote.value.trim(),
        whatsappText: message,
      }),
    });
  } catch {
    // Mesmo se o registro local falhar, o cliente ainda consegue chamar no WhatsApp.
  } finally {
    sendOrder.textContent = originalText;
    sendOrder.removeAttribute("aria-busy");
  }

  window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noreferrer");
  orderDialog.close();
}

function buildOrderMessage(product, size) {
  const boxLocation = product.boxLocation ?? product.note ?? "nao informada";
  const nameLine = customerName.value.trim() ? `\nNome: ${customerName.value.trim()}` : "";
  const noteLine = orderNote.value.trim() ? `\nObs: ${orderNote.value.trim()}` : "";
  const message = [
    "Ola, quero fazer um pedido.",
    "",
    `Produto: COD ${product.code ?? product.id}`,
    `Tamanho: ${size}`,
    `Preco: ${product.priceText ?? ""}`,
    `Caixa/estoque: ${boxLocation}`,
    `Forma: ${deliveryMode.value}`,
    `Pagamento: ${paymentMode.value}`,
    nameLine.trimStart(),
    noteLine.trimStart(),
    "",
    "Pode confirmar disponibilidade e proximo passo para pagamento?",
  ].filter(Boolean).join("\n");

  return message;
}

function emptyTemplate() {
  return `
    <section class="empty-state">
      <h2>Nenhum produto publicado</h2>
      <p>Os produtos aparecem aqui depois que forem aprovados na revisao.</p>
      <a class="nav-link" href="/review.html">Abrir revisao</a>
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
