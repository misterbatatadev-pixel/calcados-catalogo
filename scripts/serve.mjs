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

async function handleProducts(request, response) {
  const productsPath = path.join(dataDir, "products.json");

  if (request.method === "GET") {
    writeJson(response, JSON.parse(await fs.readFile(productsPath, "utf8")));
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
    deliveryMode: text(order.deliveryMode) || "Retirada",
    paymentMode,
    note: text(order.note),
    stockFlow: text(order.stockFlow) || "a_definir",
    whatsappText: text(order.whatsappText),
    status: text(order.status) || fallbackStatus,
  };
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
