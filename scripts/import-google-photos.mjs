import fs from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { analyzeColors, emptyColorAnalysis } from "./lib/color-analysis.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const dataDir = path.join(rootDir, "data");
const imageDir = path.join(dataDir, "images");

const albumUrl = process.argv[2];

if (!albumUrl) {
  console.error('Uso: npm run import -- "https://photos.google.com/share/..."');
  process.exit(1);
}

await fs.rm(imageDir, { recursive: true, force: true });
await fs.mkdir(imageDir, { recursive: true });

const browser = await chromium.launch({
  headless: process.env.HEADLESS !== "false",
});

const page = await browser.newPage({
  viewport: { width: 1440, height: 950 },
  locale: "pt-BR",
});

try {
  console.log("Abrindo album...");
  await page.goto(albumUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(4_000);

  const photoLinks = await collectPhotoLinks(page);
  console.log(`Fotos encontradas: ${photoLinks.length}`);

  const products = [];
  const report = {
    albumUrl,
    importedAt: new Date().toISOString(),
    totalPhotoLinks: photoLinks.length,
    failures: [],
  };

  for (let index = 0; index < photoLinks.length; index += 1) {
    const photoItem = photoLinks[index];
    const photoUrl = photoItem.photoUrl;
    console.log(`Importando ${index + 1}/${photoLinks.length}`);

    try {
      const product = await importPhoto(browser, photoItem, index + 1);
      products.push(product);
      console.log(`  COD ${product.code ?? "sem codigo"} | ${product.priceText ?? "sem preco"} | ${product.colors.join(", ") || "sem cor"}`);
    } catch (error) {
      report.failures.push({ photoUrl, error: error.message });
      console.warn(`  Falhou: ${error.message}`);
    }
  }

  await fs.writeFile(path.join(dataDir, "products.json"), JSON.stringify(products, null, 2), "utf8");
  await fs.writeFile(path.join(dataDir, "import-report.json"), JSON.stringify(report, null, 2), "utf8");

  console.log("");
  console.log(`Catalogo gerado em: ${path.join(dataDir, "products.json")}`);
  console.log(`Imagens em: ${imageDir}`);
} finally {
  await browser.close();
}

async function collectPhotoLinks(page) {
  const links = new Map();
  let stableRounds = 0;
  let previousSize = 0;

  for (let round = 0; round < 80 && stableRounds < 8; round += 1) {
    const batch = await page.evaluate(() => {
      return [...document.querySelectorAll('a[href*="/photo/"]')]
        .map((anchor) => {
          const elements = [anchor, ...anchor.querySelectorAll("*")];
          const background = elements
            .map((element) => getComputedStyle(element).backgroundImage)
            .find((value) => value && value.includes("googleusercontent.com"));
          const match = background?.match(/url\\(["']?([^"')]+)["']?\\)/);

          return {
            photoUrl: anchor.href,
            thumbnailUrl: match?.[1] ?? null,
          };
        })
        .filter((item) => item.photoUrl);
    });

    for (const item of batch) {
      const previous = links.get(item.photoUrl);
      links.set(item.photoUrl, {
        photoUrl: item.photoUrl,
        thumbnailUrl: item.thumbnailUrl ?? previous?.thumbnailUrl ?? null,
      });
    }

    if (links.size === previousSize) {
      stableRounds += 1;
    } else {
      stableRounds = 0;
      previousSize = links.size;
    }

    await page.evaluate(() => window.scrollBy(0, Math.max(900, window.innerHeight * 0.9)));
    await page.waitForTimeout(900);
  }

  return [...links.values()];
}

async function importPhoto(browser, photoItem, position) {
  const { photoUrl } = photoItem;
  const page = await browser.newPage({
    viewport: { width: 1440, height: 950 },
    locale: "pt-BR",
  });

  try {
    await gotoWithRetry(page, photoUrl);
    await waitForPhotoImage(page);

    const imageUrl = normalizeGoogleImageUrl(photoItem.thumbnailUrl) ?? await getBestImageUrl(page);
    const activityText = await readActivityText(page);
    const parsed = parseActivity(activityText);

    const codeForFile = safeFilePart(parsed.code ?? `foto-${String(position).padStart(4, "0")}`);
    const imageFileName = `${codeForFile}-${String(position).padStart(4, "0")}.jpg`;
    const imagePath = path.join(imageDir, imageFileName);

    if (imageUrl) {
      try {
        await downloadImage(imageUrl, imagePath);
      } catch {
        await saveRenderedImage(page, imagePath);
      }
    }

    const colorAnalysis = imageUrl ? await analyzeColors(imagePath) : emptyColorAnalysis();
    const imageHash = imageUrl ? await hashFile(imagePath) : null;

    return {
      id: codeForFile,
      position,
      code: parsed.code,
      priceText: parsed.priceText,
      priceCents: parsed.priceCents,
      sizes: parsed.sizes,
      boxLocation: parsed.boxLocation,
      colors: colorAnalysis.colors,
      colorDescription: colorAnalysis.description,
      visualDescription: colorAnalysis.description,
      apparentBrand: colorAnalysis.apparentBrand,
      searchKeywords: colorAnalysis.keywords,
      colorConfidence: colorAnalysis.confidence,
      colorSource: colorAnalysis.source,
      photoUrl,
      imageUrl,
      imageHash,
      localImage: imageUrl ? `images/${imageFileName}` : null,
      rawActivityText: activityText,
    };
  } finally {
    await page.close();
  }
}

function normalizeGoogleImageUrl(url) {
  if (!url) return null;
  return url.replace(/=w\d+-h\d+(?:-[a-z]+)*$/i, "=w1200-h1200-no");
}

async function waitForPhotoImage(page) {
  try {
    await waitForAnyGoogleImage(page);
  } catch {
    await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
    await waitForAnyGoogleImage(page);
  }

  await page.waitForTimeout(1_000);
}

async function waitForAnyGoogleImage(page) {
  await page.waitForFunction(() => {
    return [...document.images].some((img) => {
      const src = img.currentSrc || img.src;
      return src.includes("googleusercontent.com") && img.naturalWidth > 100 && img.naturalHeight > 100;
    });
  }, { timeout: 45_000 });
}

async function gotoWithRetry(page, url) {
  let lastError;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
      return;
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(1_500 * attempt);
    }
  }

  throw lastError;
}

async function getBestImageUrl(page) {
  const images = await page.evaluate(() => {
    return [...document.images]
      .map((img) => ({
        src: img.currentSrc || img.src,
        width: img.naturalWidth,
        height: img.naturalHeight,
      }))
      .filter((img) => img.src.includes("googleusercontent.com") && img.width > 100 && img.height > 100)
      .sort((a, b) => b.width * b.height - a.width * a.height);
  });

  return images[0]?.src ?? null;
}

async function readActivityText(page) {
  const commentByName = page.getByRole("button", { name: /coment/i });
  const numericCommentButton = page
    .locator('[role="button"], button')
    .filter({ hasText: /^\s*\d+\s*$/ });

  if (await commentByName.count() > 0) {
    await commentByName.first().click({ timeout: 10_000 });
  } else if (await numericCommentButton.count() > 0) {
    await numericCommentButton.first().click({ timeout: 10_000 });
  } else {
    await page.evaluate(() => {
      const buttons = [...document.querySelectorAll('[role="button"], button')];
      const commentButton = buttons.find((button) => {
        const aria = button.getAttribute("aria-label") ?? "";
        const text = button.textContent?.trim() ?? "";
        return aria.toLowerCase().includes("coment") || /^\d+$/.test(text);
      });

      commentButton?.click();
    });
  }

  await waitForActivityText(page);

  const text = await page.evaluate(() => document.body.innerText);
  const activityIndex = text.indexOf("Atividade");
  return activityIndex >= 0 ? text.slice(activityIndex).trim() : text.trim();
}

async function waitForActivityText(page) {
  try {
    await page.waitForFunction(() => {
      const text = document.body.innerText;
      return /Atacado|COD\s*:|Numera/i.test(text);
    }, { timeout: 10_000 });
  } catch {
    await page.waitForTimeout(1_500);
  }
}

function parseActivity(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const priceMatch = text.match(/R\$\s*([\d.,]+)/i);
  const priceText = priceMatch ? `R$${priceMatch[1]}` : null;
  const priceCents = priceMatch ? parseBrazilianMoneyToCents(priceMatch[1]) : null;

  const sizes = [];
  for (const line of lines) {
    const sizeMatch = line.match(/^(\d{2})\s*[-:]\s*(\d+)$/);
    if (sizeMatch) {
      sizes.push({
        size: sizeMatch[1],
        quantity: Number(sizeMatch[2]),
      });
    }
  }

  const codeMatch = text.match(/\bCOD\s*:?\s*([A-Z0-9._-]+)/i);
  const code = codeMatch?.[1] ?? null;

  const boxLocation = findBoxLocation(lines);

  return { priceText, priceCents, sizes, code, boxLocation };
}

function findBoxLocation(lines) {
  const ignored = [
    /^atividade$/i,
    /^fechar painel/i,
    /^numera/i,
    /^atacado/i,
    /^rr shoes/i,
    /^cod\s*:?/i,
    /^\d{2}\s*[-:]\s*\d+$/,
  ];

  return lines.find((line) => {
    if (ignored.some((pattern) => pattern.test(line))) return false;
    return /^[a-z]?\d+\/\d+$/i.test(line) || /^ntr$/i.test(line);
  }) ?? null;
}

function parseBrazilianMoneyToCents(value) {
  const normalized = value.replace(/\./g, "").replace(",", ".");
  return Math.round(Number(normalized) * 100);
}

async function downloadImage(url, targetPath) {
  let lastError;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      await fs.writeFile(targetPath, buffer);
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 1_500 * attempt));
    }
  }

  throw new Error(`Download da imagem falhou: ${lastError.message}`);
}

async function saveRenderedImage(page, targetPath) {
  const image = page.locator('img[src*="googleusercontent.com"]').first();
  await image.screenshot({ path: targetPath, timeout: 15_000 });
}

async function hashFile(filePath) {
  const buffer = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function safeFilePart(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
