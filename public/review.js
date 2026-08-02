let products = [];
let reviews = [];
let publicationState = { approved: {} };

const summary = document.querySelector("#review-summary");
const stats = document.querySelector("#review-stats");
const list = document.querySelector("#review-list");
const filter = document.querySelector("#review-filter");
const search = document.querySelector("#review-search");
const approveReadyButton = document.querySelector("#approve-ready");

init();

async function init() {
  try {
    const response = await fetch("/products");
    products = response.ok ? await response.json() : [];
    const publicationResponse = await fetch("/publication-state");
    publicationState = publicationResponse.ok ? await publicationResponse.json() : { approved: {} };
  } catch {
    products = [];
    publicationState = { approved: {} };
  }

  reviews = products.map(reviewProduct);
  render();

  filter.addEventListener("change", render);
  search.addEventListener("input", render);
  approveReadyButton.addEventListener("click", approveReadyProducts);
  list.addEventListener("click", handleReviewClick);
}

function reviewProduct(product) {
  const issues = [];
  const warnings = [];
  const boxLocation = product.boxLocation ?? product.note;

  if (!product.localImage) issues.push("sem imagem");
  if (!product.code) issues.push("sem codigo");
  if (!product.priceText) issues.push("sem preco");
  if (!boxLocation) issues.push("sem caixa");
  if (!Array.isArray(product.sizes) || product.sizes.length === 0) issues.push("sem tamanhos");
  if (!Array.isArray(product.colors) || product.colors.length === 0) issues.push("sem cores");
  if (product.colorSource !== "vision-ai") warnings.push("cor sem IA visual");
  if ((product.sizes ?? []).some((item) => !item.size || !item.quantity)) issues.push("tamanho incompleto");

  return {
    product,
    key: productKey(product),
    boxLocation,
    issues,
    warnings,
    ready: issues.length === 0,
  };
}

function render() {
  const query = search.value.trim().toLowerCase();
  const mode = filter.value;
  const visible = reviews.filter((review) => {
    const haystack = [
      review.product.code,
      review.boxLocation,
      review.product.priceText,
      ...(review.product.colors ?? []),
      ...review.issues,
      ...review.warnings,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    if (mode === "issues" && review.ready && review.warnings.length === 0) return false;
    if (mode === "ready" && !review.ready) return false;
    if (query && !haystack.includes(query)) return false;
    return true;
  });

  renderStats(visible);
  summary.textContent = `${visible.length} de ${reviews.length} produtos em revisao`;
  list.innerHTML = visible.map(reviewTemplate).join("");
}

function renderStats(visible) {
  const issueCount = reviews.filter((review) => !review.ready).length;
  const warningCount = reviews.filter((review) => review.ready && review.warnings.length > 0).length;
  const readyCount = reviews.length - issueCount;
  const approvedCount = reviews.filter((review) => publicationState.approved[review.key]).length;
  const noImage = reviews.filter((review) => review.issues.includes("sem imagem")).length;
  const noPrice = reviews.filter((review) => review.issues.includes("sem preco")).length;
  const noSizes = reviews.filter((review) => review.issues.includes("sem tamanhos")).length;

  stats.innerHTML = [
    statTemplate("Produtos", reviews.length),
    statTemplate("Aprovados", approvedCount),
    statTemplate("Prontos", readyCount),
    statTemplate("Problemas", issueCount),
    statTemplate("Avisos", warningCount),
    statTemplate("Sem imagem", noImage),
    statTemplate("Sem preco", noPrice),
    statTemplate("Sem tamanhos", noSizes),
  ].join("");
}

function statTemplate(label, value) {
  return `
    <article class="stat">
      <strong>${escapeHtml(value)}</strong>
      <span>${escapeHtml(label)}</span>
    </article>
  `;
}

function reviewTemplate(review) {
  const { product, boxLocation, issues } = review;
  const isApproved = Boolean(publicationState.approved[review.key]);
  const tags = [...issues.map((issue) => ({ kind: "issue", text: issue })), ...review.warnings.map((warning) => ({ kind: "warning", text: warning }))];
  const issueTags = issues.length
    ? tags.map(tagTemplate).join("")
    : review.warnings.length
      ? tags.map(tagTemplate).join("")
    : `<span class="ok-tag">pronto para publicar</span>`;
  const sizes = (product.sizes ?? [])
    .map((item) => `${item.size}: ${item.quantity}`)
    .join(" | ");
  const colors = (product.colors ?? []).join(", ");
  const image = product.localImage
    ? `<img src="/${product.localImage}" alt="Produto ${escapeHtml(product.code ?? product.id)}">`
    : `<div class="missing-image">sem imagem</div>`;

  return `
    <article class="review-item ${issues.length ? "has-issues" : review.warnings.length ? "has-warnings" : "is-ready"} ${isApproved ? "is-approved" : ""}">
      ${image}
      <div class="review-body">
        <div class="row">
          <strong>COD ${escapeHtml(product.code ?? "pendente")}</strong>
          <span class="price">${escapeHtml(product.priceText ?? "sem preco")}</span>
        </div>
        <p>Caixa/estoque: ${escapeHtml(boxLocation ?? "pendente")}</p>
        <p>Tamanhos: ${escapeHtml(sizes || "pendente")}</p>
        <p>Cores: ${escapeHtml(colors || "pendente")} (${escapeHtml(product.colorSource ?? "sem fonte")})</p>
        ${product.colorDescription ? `<p>${escapeHtml(product.colorDescription)}</p>` : ""}
        <div class="chips">${issueTags}</div>
        <div class="color-edit">
          <input data-colors-for="${escapeHtml(review.key)}" type="text" value="${escapeHtml(colors)}" placeholder="Ex.: preto, rosa, branco" />
          <button class="save-colors-button" data-key="${escapeHtml(review.key)}" type="button">Salvar cores</button>
        </div>
        <div class="publish-row">
          <span class="${isApproved ? "ok-tag" : "warning-tag"}">${isApproved ? "aprovado para cliente" : "nao publicado"}</span>
          <button class="publish-button" data-key="${escapeHtml(review.key)}" type="button" ${issues.length ? "disabled" : ""}>${isApproved ? "Remover" : "Aprovar"}</button>
        </div>
        ${product.imageUrl ? `<a class="source-link" href="${escapeHtml(product.imageUrl)}" target="_blank" rel="noreferrer">abrir imagem usada</a>` : ""}
      </div>
    </article>
  `;
}

async function approveReadyProducts() {
  for (const review of reviews) {
    if (review.ready) publicationState.approved[review.key] = true;
  }

  await savePublicationState();
  render();
}

async function handleReviewClick(event) {
  const colorButton = event.target.closest(".save-colors-button");
  if (colorButton) {
    await saveColors(colorButton.dataset.key);
    return;
  }

  const button = event.target.closest(".publish-button");
  if (!button) return;

  await togglePublication(button.dataset.key);
}

async function savePublicationState() {
  const response = await fetch("/publication-state", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(publicationState),
  });

  publicationState = response.ok ? await response.json() : publicationState;
}

async function togglePublication(key) {
  if (!key) return;

  if (publicationState.approved[key]) {
    delete publicationState.approved[key];
  } else {
    publicationState.approved[key] = true;
  }

  await savePublicationState();
  render();
}

async function saveColors(key) {
  const input = document.querySelector(`[data-colors-for="${cssEscape(key)}"]`);
  const product = products.find((item) => productKey(item) === key);
  if (!input || !product) return;

  const colors = input.value
    .split(",")
    .map((color) => color.trim().toLowerCase())
    .filter(Boolean);

  product.colors = [...new Set(colors)];
  product.colorSource = "manual";
  product.colorDescription = colors.length ? `Cores revisadas manualmente: ${colors.join(", ")}` : null;

  await saveProducts();
  reviews = products.map(reviewProduct);
  render();
}

async function saveProducts() {
  const response = await fetch("/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(products),
  });

  products = response.ok ? await response.json() : products;
}

function cssEscape(value) {
  if (window.CSS?.escape) return CSS.escape(value);
  return String(value).replaceAll('"', '\\"');
}

function productKey(product) {
  return [product.position, product.code ?? product.id ?? "sem-codigo", product.boxLocation ?? product.note ?? "sem-caixa"].join("|");
}

function tagTemplate(tag) {
  const className = tag.kind === "issue" ? "issue-tag" : "warning-tag";
  return `<span class="${className}">${escapeHtml(tag.text)}</span>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
