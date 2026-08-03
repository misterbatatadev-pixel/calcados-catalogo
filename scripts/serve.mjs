import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const publicDir = path.join(rootDir, "public");
const dataDir = path.join(rootDir, "data");
const publicationStatePath = path.join(dataDir, "publication-state.json");
const ordersPath = path.join(dataDir, "orders.json");
const port = Number(process.env.PORT ?? 4174);
const adminUser = process.env.ADMIN_USER ?? "";
const adminPassword = process.env.ADMIN_PASSWORD ?? "";
const botToken = process.env.BOT_TOKEN ?? "";

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://localhost:${port}`);
    if (url.pathname === "/health") {
      writeJson(response, { ok: true });
      return;
    }
    if (requiresAuth(url.pathname, request.method) && !isAuthorized(request)) {
      requestAuth(response);
      return;
    }
    if (url.pathname.startsWith("/api/bot/") && !isBotAuthorized(request)) {
      response.writeHead(401, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "Token do robo invalido" }));
      return;
    }
    if (url.pathname === "/api/bot/search") {
      await handleBotSearch(request, response);
      return;
    }
    if (url.pathname === "/api/bot/orders") {
      await handleBotOrders(request, response);
      return;
    }
    if (url.pathname === "/publication-state") {
      await handlePublicationState(request, response);
      return;
    }
    if (url.pathname === "/products") {
      await handleProducts(request, response);
      return;
    }
    if (url.pathname === "/orders") {
      await handleOrders(request, response);
      return;
    }

    const filePath = resolveRequest(url.pathname);
    const content = await fs.readFile(filePath);
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": contentType(filePath),
    });
    response.end(content);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Nao encontrado");
  }
});

server.listen(port, () => {
  console.log(`Catalogo local: http://localhost:${port}`);
});

function resolveRequest(pathname) {
  if (pathname === "/") return path.join(publicDir, "index.html");
  if (pathname === "/products.json") return path.join(dataDir, "products.json");
  if (pathname.startsWith("/images/")) return path.join(dataDir, pathname);
  return path.join(publicDir, pathname);
}

function requiresAuth(pathname, method = "GET") {
  const protectedPages = new Set(["/review.html", "/orders.html", "/seller.html"]);
  if (protectedPages.has(pathname)) return true;
  if (pathname === "/products" && method !== "GET") return true;
  if (pathname === "/publication-state" && method !== "GET") return true;
  if (pathname === "/orders" && method !== "POST") return true;
  return false;
}

function isAuthorized(request) {
  if (!adminUser || !adminPassword) return false;

  const header = request.headers.authorization ?? "";
  if (!header.startsWith("Basic ")) return false;

  try {
    const decoded = Buffer.from(header.slice("Basic ".length), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator === -1) return false;

    const user = decoded.slice(0, separator);
    const password = decoded.slice(separator + 1);
    return user === adminUser && password === adminPassword;
  } catch {
    return false;
  }
}

function requestAuth(response) {
  response.writeHead(401, {
    "Content-Type": "text/plain; charset=utf-8",
    "WWW-Authenticate": 'Basic realm="Area interna do catalogo"',
  });
  response.end("Acesso interno protegido");
}

function isBotAuthorized(request) {
  if (!botToken) return false;
  return request.headers["x-bot-token"] === botToken;
}

async function handleBotSearch(request, response) {
  if (request.method !== "POST") {
    response.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "Metodo nao permitido" }));
    return;
  }

  const body = JSON.parse((await readRequestBody(request)) || "{}");
  const intent = parseSearchIntent(text(body.message), body);
  const products = await readProducts();
  const publicationState = await readPublicationState();
  const published = products.filter((product) => publicationState.approved[productKey(product)]);
  const matches = findProducts(published, intent).slice(0, Number(body.limit ?? 5));

  writeJson(response, {
    intent,
    count: matches.length,
    products: matches.map(publicProduct),
    reply: buildSearchReply(intent, matches),
  });
}

async function handleBotOrders(request, response) {
  if (request.method !== "POST") {
    response.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "Metodo nao permitido" }));
    return;
  }

  const body = JSON.parse((await readRequestBody(request)) || "{}");
  const products = await readProducts();
  const product = products.find((item) => productKey(item) === text(body.productKey))
    ?? products.find((item) => String(item.code ?? item.id) === text(body.code));

  if (!product) {
    response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "Produto nao encontrado" }));
    return;
  }

  const requestedSize = text(body.size);
  const sizeItem = (product.sizes ?? []).find((item) => item.size === requestedSize && item.quantity > 0);
  if (!sizeItem) {
    response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "Tamanho indisponivel" }));
    return;
  }

  const order = normalizeOrder({
    productKey: productKey(product),
    code: product.code ?? product.id ?? "",
    boxLocation: product.boxLocation ?? product.note ?? "",
    size: requestedSize,
    priceText: product.priceText ?? "",
    image: product.localImage ?? "",
    customerName: text(body.customerName),
    customerPhone: text(body.customerPhone),
    deliveryMode: text(body.deliveryMode) || "Retirada",
    paymentMode: text(body.paymentMode) || "Pagar na entrega/retirada",
    note: text(body.note) || "Pedido criado pelo robo do WhatsApp",
    whatsappText: buildWhatsappText(product, {
      size: requestedSize,
      customerName: text(body.customerName),
      deliveryMode: text(body.deliveryMode) || "Retirada",
      paymentMode: text(body.paymentMode) || "Pagar na entrega/retirada",
      note: text(body.note),
      customerPhone: text(body.customerPhone),
    }),
  });

  const orders = await readOrders();
  orders.unshift(order);
  await saveOrders(orders);
  writeJson(response, { order, reply: `Pedido registrado: COD ${order.code}, tamanho ${order.size}.` });
}

async function handleProducts(request, response) {
  const productsPath = path.join(dataDir, "products.json");

  if (request.method === "GET") {
    writeJson(response, await readProducts());
    return;
  }

  if (request.method === "POST") {
    const body = await readRequestBody(request);
    const products = JSON.parse(body || "[]");
    if (!Array.isArray(products)) {
      response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Produtos invalidos");
      return;
    }

    await fs.writeFile(productsPath, JSON.stringify(products, null, 2), "utf8");
    writeJson(response, products);
    return;
  }

  response.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
  response.end("Metodo nao permitido");
}

async function readProducts() {
  const productsPath = path.join(dataDir, "products.json");
  try {
    const products = JSON.parse(await fs.readFile(productsPath, "utf8"));
    return Array.isArray(products) ? products : [];
  } catch {
    return [];
  }
}

async function handlePublicationState(request, response) {
  if (request.method === "GET") {
    const state = await readPublicationState();
    writeJson(response, state);
    return;
  }

  if (request.method === "POST") {
    const body = await readRequestBody(request);
    const state = JSON.parse(body || "{}");
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(publicationStatePath, JSON.stringify(normalizePublicationState(state), null, 2), "utf8");
    writeJson(response, await readPublicationState());
    return;
  }

  response.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
  response.end("Metodo nao permitido");
}

async function handleOrders(request, response) {
  if (request.method === "GET") {
    writeJson(response, await readOrders());
    return;
  }

  if (request.method === "POST") {
    const body = await readRequestBody(request);
    const order = normalizeOrder(JSON.parse(body || "{}"));
    const orders = await readOrders();
    orders.unshift(order);
    await saveOrders(orders);
    writeJson(response, order);
    return;
  }

  if (request.method === "PUT") {
    const body = await readRequestBody(request);
    const orders = JSON.parse(body || "[]");
    if (!Array.isArray(orders)) {
      response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Pedidos invalidos");
      return;
    }

    await saveOrders(orders.map(normalizeOrder));
    writeJson(response, await readOrders());
    return;
  }

  response.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
  response.end("Metodo nao permitido");
}

async function readPublicationState() {
  try {
    return normalizePublicationState(JSON.parse(await fs.readFile(publicationStatePath, "utf8")));
  } catch {
    return { approved: {} };
  }
}

async function readOrders() {
  try {
    const orders = JSON.parse(await fs.readFile(ordersPath, "utf8"));
    return Array.isArray(orders) ? orders.map(normalizeOrder) : [];
  } catch {
    return [];
  }
}

async function saveOrders(orders) {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(ordersPath, JSON.stringify(orders, null, 2), "utf8");
}

function normalizeOrder(order) {
  const createdAt = order.createdAt || new Date().toISOString();
  const paymentMode = text(order.paymentMode) || "Pagar na entrega/retirada";
  const fallbackStatus = paymentMode === "Pagar na entrega/retirada" ? "pagamento_entrega" : "novo";

  return {
    id: text(order.id) || `pedido-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    createdAt,
    productKey: text(order.productKey),
    code: text(order.code),
    boxLocation: text(order.boxLocation),
    size: text(order.size),
    priceText: text(order.priceText),
    image: text(order.image),
    customerName: text(order.customerName),
    customerPhone: text(order.customerPhone),
    deliveryMode: text(order.deliveryMode) || "Retirada",
    paymentMode,
    note: text(order.note),
    stockFlow: text(order.stockFlow) || "a_definir",
    whatsappText: text(order.whatsappText),
    status: text(order.status) || fallbackStatus,
  };
}

function parseSearchIntent(message, body = {}) {
  const normalized = message.toLowerCase();
  const colorWords = ["preto", "branco", "cinza", "azul", "vermelho", "rosa", "verde", "amarelo", "bege", "marrom", "lilas", "roxo"];
  const sizes = [...normalized.matchAll(/\b(3[3-9]|4[0-6])\b/g)].map((match) => match[1]);
  const codeMatch = normalized.match(/(?:cod|codigo|c[oó]digo)\s*[:#-]?\s*(\d+)/) ?? normalized.match(/\b(4\d{3}|5\d{3})\b/);

  return {
    message,
    size: text(body.size) || sizes[0] || "",
    colors: Array.isArray(body.colors) && body.colors.length ? body.colors.map(text).filter(Boolean) : colorWords.filter((color) => normalized.includes(color)),
    code: text(body.code) || codeMatch?.[1] || "",
  };
}

function findProducts(products, intent) {
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

function publicProduct(product) {
  const catalogImageUrl = product.localImage ? `https://${process.env.CATALOGO_HOST ?? "catalogo.eliteagents.com.br"}/images/${path.basename(product.localImage)}` : "";
  const sourceImageUrl = text(product.imageUrl);

  return {
    productKey: productKey(product),
    code: product.code ?? product.id ?? "",
    priceText: product.priceText ?? "",
    boxLocation: product.boxLocation ?? product.note ?? "",
    colors: product.colors ?? [],
    sizes: product.sizes ?? [],
    imageUrl: product.localImage ? `/images/${path.basename(product.localImage)}` : "",
    absoluteImageUrl: catalogImageUrl,
    sourceImageUrl,
    whatsappImageUrl: sourceImageUrl || catalogImageUrl,
  };
}

function productKey(product) {
  return [product.position, product.code ?? product.id ?? "sem-codigo", product.boxLocation ?? product.note ?? "sem-caixa"].join("|");
}

function buildSearchReply(intent, matches) {
  if (!matches.length) {
    return "Nao encontrei esse modelo disponivel agora. Posso procurar outra cor ou tamanho para voce?";
  }

  const first = matches[0];
  const sizes = (first.sizes ?? []).filter((item) => item.quantity > 0).map((item) => item.size).join(", ");
  return `Encontrei ${matches.length} opcao(oes). Primeira opcao: COD ${first.code ?? first.id}, ${first.priceText ?? ""}. Tamanhos disponiveis: ${sizes}.`;
}

function buildWhatsappText(product, order) {
  return [
    "Ola, quero fazer um pedido.",
    "",
    `Produto: COD ${product.code ?? product.id}`,
    `Tamanho: ${order.size}`,
    `Preco: ${product.priceText ?? ""}`,
    `Caixa/estoque: ${product.boxLocation ?? product.note ?? "nao informada"}`,
    `Forma: ${order.deliveryMode}`,
    `Pagamento: ${order.paymentMode}`,
    order.customerName ? `Nome: ${order.customerName}` : "",
    order.customerPhone ? `Telefone: ${order.customerPhone}` : "",
    order.note ? `Obs: ${order.note}` : "",
    "",
    "Pode confirmar disponibilidade e proximo passo para pagamento?",
  ].filter(Boolean).join("\n");
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePublicationState(state) {
  return {
    approved: typeof state.approved === "object" && state.approved !== null ? state.approved : {},
  };
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        request.destroy();
        reject(new Error("Corpo muito grande"));
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function writeJson(response, data) {
  response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(data));
}

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) return "image/jpeg";
  if (filePath.endsWith(".png")) return "image/png";
  return "application/octet-stream";
}
