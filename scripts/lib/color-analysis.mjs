import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");
const colorPromptPath = path.join(rootDir, "config", "color-analysis-prompt.md");

const allowedColors = new Set([
  "preto",
  "branco",
  "cinza",
  "azul",
  "vermelho",
  "rosa",
  "laranja",
  "verde",
  "amarelo",
  "bege",
  "marrom",
  "lilas",
  "roxo",
]);

const colorAliases = new Map([
  ["grafite", "cinza"],
  ["prata", "cinza"],
  ["chumbo", "cinza"],
  ["off white", "branco"],
  ["off-white", "branco"],
  ["creme", "bege"],
  ["nude", "bege"],
  ["caramelo", "marrom"],
  ["bordo", "vermelho"],
  ["vinho", "vermelho"],
  ["pink", "rosa"],
  ["salmao", "laranja"],
  ["salmão", "laranja"],
  ["lilás", "lilas"],
  ["violeta", "roxo"],
]);

export async function analyzeColors(imagePath) {
  if (process.env.OPENAI_API_KEY) {
    try {
      return await analyzeColorsWithVision(imagePath);
    } catch (error) {
      console.warn(`  Analise visual falhou, usando fallback: ${error.message}`);
    }
  }

  return {
    colors: await detectColors(imagePath),
    description: "Cores estimadas automaticamente pela imagem; revisar se houver caixa ou fundo chamativo.",
    confidence: "baixa",
    source: "fallback",
  };
}

export async function analyzeColorsWithVision(imagePath) {
  const [imageBuffer, colorPrompt] = await Promise.all([
    fs.readFile(imagePath),
    fs.readFile(colorPromptPath, "utf8"),
  ]);

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_COLOR_MODEL ?? "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `${colorPrompt}\n\nAnalise a imagem do produto e retorne somente o JSON solicitado.`,
            },
            {
              type: "input_image",
              image_url: `data:image/jpeg;base64,${imageBuffer.toString("base64")}`,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI HTTP ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  const text = extractResponseText(data);
  const parsed = JSON.parse(text.replace(/^```json\s*|\s*```$/g, "").trim());

  return {
    colors: sanitizeColors(parsed.colors),
    description: parsed.description ?? null,
    confidence: ["alta", "media", "baixa"].includes(parsed.confidence) ? parsed.confidence : "media",
    source: "vision-ai",
  };
}

export function emptyColorAnalysis() {
  return {
    colors: [],
    description: null,
    confidence: "baixa",
    source: "none",
  };
}

export function sanitizeColors(colors) {
  if (!Array.isArray(colors)) return [];

  return [...new Set(colors
    .map((color) => normalizeColorName(color))
    .filter((color) => color && allowedColors.has(color)))]
    .slice(0, 4);
}

export async function detectColors(imagePath) {
  const { data, info } = await sharp(imagePath)
    .resize({ width: 140, height: 140, fit: "inside" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const counts = new Map();
  const width = info.width;
  const height = info.height;
  const centerX = width / 2;
  const centerY = height / 2;
  const maxDistance = Math.hypot(centerX, centerY);

  for (let y = 0; y < height; y += 1) {
    const yRatio = y / height;
    if (yRatio < 0.06 || yRatio > 0.88) continue;

    for (let x = 0; x < width; x += 1) {
      const xRatio = x / width;
      if (xRatio < 0.06 || xRatio > 0.94) continue;

      const offset = (y * width + x) * info.channels;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      const color = classifyRgb(r, g, b);
      if (!color) continue;

      const delta = Math.max(r, g, b) - Math.min(r, g, b);
      const distance = Math.hypot(x - centerX, y - centerY);
      let weight = 1.25 - (distance / maxDistance) * 0.55;

      // Caixas e bancadas costumam ocupar a faixa inferior da foto.
      if (yRatio > 0.62) weight *= 0.45;
      if (yRatio > 0.76) weight *= 0.18;

      // Fundo desfocado claro costuma dominar, mas nao ajuda a descrever o calcado.
      if (isLowInformationBackground(r, g, b) && distance > maxDistance * 0.42) {
        weight *= 0.35;
      }

      if (delta > 70) weight *= 1.35;
      if (delta > 120) weight *= 1.65;

      counts.set(color, (counts.get(color) ?? 0) + weight);
    }
  }

  return [...counts.entries()]
    .filter(([, count]) => count >= 8)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([color]) => color);
}

function extractResponseText(data) {
  if (typeof data.output_text === "string") return data.output_text;

  for (const item of data.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && content.text) return content.text;
    }
  }

  throw new Error("Resposta da IA nao trouxe texto.");
}

function normalizeColorName(value) {
  const color = String(value)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");

  return colorAliases.get(color) ?? color;
}

function isLowInformationBackground(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max > 175 && max - min < 35;
}

function classifyRgb(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  if (max < 45) return "preto";
  if (min > 218 && delta < 28) return "branco";
  if (delta < 18) {
    if (max < 95) return "preto";
    if (max > 190) return "branco";
    return "cinza";
  }

  if (r > 150 && g > 120 && b < 95) return "bege";
  if (r > 175 && g > 70 && g < 165 && b < 95) return "laranja";
  if (r > 160 && g < 105 && b < 105) return "vermelho";
  if (r > 180 && g < 130 && b > 130) return "rosa";
  if (r > 130 && g > 80 && b < 60) return "marrom";
  if (r > 190 && g > 150 && b < 80) return "amarelo";
  if (g > r * 1.2 && g > b * 1.15) return "verde";
  if (b > r * 1.15 && b > g * 1.1) return "azul";
  if (r > 120 && b > 120 && g < 120) return "roxo";

  return null;
}
