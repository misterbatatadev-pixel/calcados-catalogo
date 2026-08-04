import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeColors } from "./lib/color-analysis.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const dataDir = path.join(rootDir, "data");
const productsPath = path.join(dataDir, "products.json");
const force = process.argv.includes("--force");

const products = JSON.parse(await fs.readFile(productsPath, "utf8"));
let changed = 0;
let skipped = 0;

for (const product of products) {
  if (!product.localImage) {
    skipped += 1;
    continue;
  }

  if (!force && product.colorSource === "manual") {
    skipped += 1;
    continue;
  }

  const imagePath = path.join(dataDir, product.localImage);
  try {
    await fs.access(imagePath);
  } catch {
    skipped += 1;
    continue;
  }

  const previousColors = (product.colors ?? []).join(", ");
  const analysis = await analyzeColors(imagePath);

  product.colors = analysis.colors;
  product.colorDescription = analysis.description;
  product.visualDescription = analysis.description;
  product.apparentBrand = analysis.apparentBrand;
  product.searchKeywords = analysis.keywords;
  product.colorConfidence = analysis.confidence;
  product.colorSource = analysis.source;
  changed += 1;

  console.log(
    `COD ${product.code ?? product.id ?? "sem codigo"} ${product.boxLocation ?? ""}: ${previousColors || "sem cor"} -> ${product.colors.join(", ") || "sem cor"} (${product.colorSource})`,
  );
}

await fs.writeFile(productsPath, JSON.stringify(products, null, 2), "utf8");

console.log("");
console.log(`Cores reanalisadas: ${changed}`);
console.log(`Produtos ignorados: ${skipped}`);
