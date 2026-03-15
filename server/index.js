import express from "express";
import multer from "multer";
import cors from "cors";
import dotenv from "dotenv";
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join, resolve } from "path";
import { v4 as uuidv4 } from "uuid";
import { createRequire } from "module";

import "./polyfills.js";
import { createCanvas } from "@napi-rs/canvas";

const pdf = async (data) => {
  console.log("DEBUG: pdf function entry, data size:", data.length);
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const uint8Data = new Uint8Array(data);
  let loadingTask;
  
  try {
    loadingTask = pdfjs.getDocument({ data: uint8Data });
    console.log("DEBUG: getDocument called.");
  } catch (err) {
    console.error("DEBUG: getDocument call failed, trying with 'new':", err.message);
    loadingTask = new pdfjs.getDocument({ data: uint8Data });
  }

  const pdfDocument = await loadingTask.promise;
  console.log("DEBUG: PDF document loaded, pages:", pdfDocument.numPages);
  let fullText = "";
  const images = [];

  // Render first 10 pages for visual analysis (will be processed in batches of 5)
  const maxVisualPages = Math.min(pdfDocument.numPages, 10);
  
  for (let i = 1; i <= pdfDocument.numPages; i++) {
    const page = await pdfDocument.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map(item => item.str).join(" ");
    fullText += pageText + "\n";

    if (i <= maxVisualPages) {
      try {
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = createCanvas(viewport.width, viewport.height);
        const context = canvas.getContext("2d");

        await page.render({
          canvasContext: context,
          viewport: viewport,
        }).promise;

        images.push(canvas.toBuffer("image/jpeg").toString("base64"));
        console.log(`DEBUG: Rendered page ${i} for visual analysis.`);
      } catch (renderErr) {
        console.error(`DEBUG: Failed to render page ${i}:`, renderErr.message);
      }
    }
  }
  
  return {
    text: fullText,
    numpages: pdfDocument.numPages,
    images: images
  };
};

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Serve frontend static files
const __dirname = resolve();
app.use(express.static(join(__dirname, "../client/dist")));

const upload = multer({ 
  dest: "uploads/",
  limits: { fileSize: 1024 * 1024 * 1024 } // 1GB limit
});

const DATA_DIR = "data";
const RUNS_FILE = join(DATA_DIR, "runs.json");
const IMAGES_FILE = join(DATA_DIR, "images.json");
const VECTORS_FILE = join(DATA_DIR, "vectors.json");

async function ensureDataFiles() {
  if (!existsSync(DATA_DIR)) await mkdir(DATA_DIR);
  if (!existsSync(RUNS_FILE)) await writeFile(RUNS_FILE, "[]", "utf-8");
  if (!existsSync(VECTORS_FILE)) await writeFile(VECTORS_FILE, "[]", "utf-8");
  if (!existsSync(IMAGES_FILE)) await writeFile(IMAGES_FILE, "{}", "utf-8");
}

async function loadImages() {
  return JSON.parse(await readFile(IMAGES_FILE, "utf-8"));
}

async function saveImages(data) {
  await writeFile(IMAGES_FILE, JSON.stringify(data, null, 2), "utf-8");
}

function chunkText(text, targetWords = 450, overlap = 50) {
  const words = text.split(/\s+/);
  const chunks = [];
  for (let i = 0; i < words.length; i += targetWords - overlap) {
    const slice = words.slice(i, i + targetWords);
    if (slice.length === 0) break;
    chunks.push(slice.join(" "));
  }
  return chunks;
}

function cosineSimilarity(a, b) {
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function loadVectors() {
  const json = await readFile(VECTORS_FILE, "utf-8");
  return JSON.parse(json);
}

async function saveVectors(arr) {
  await writeFile(VECTORS_FILE, JSON.stringify(arr, null, 2), "utf-8");
}

async function loadRuns() {
  return JSON.parse(await readFile(RUNS_FILE, "utf-8"));
}

async function saveRuns(arr) {
  await writeFile(RUNS_FILE, JSON.stringify(arr, null, 2), "utf-8");
}

async function embedChunks(chunks, fileId, images = []) {
  const vectors = chunks.map((c) => ({
    id: uuidv4(),
    fileId,
    chunk: c,
    vector: [],
  }));
  const existing = await loadVectors();
  await saveVectors([...existing, ...vectors]);

  if (images.length > 0) {
    const allImages = await loadImages();
    allImages[fileId] = images;
    await saveImages(allImages);
  }
  return vectors;
}

async function retrieveSimilar(fileId, query, k = 12) {
  const vectors = (await loadVectors()).filter((v) => v.fileId === fileId);
  const terms = new Set(query.toLowerCase().split(/\W+/));
  const scored = vectors
    .map((v) => {
      const words = v.chunk.toLowerCase().split(/\W+/);
      const overlap = words.reduce((acc, w) => acc + (terms.has(w) ? 1 : 0), 0);
      return { ...v, score: overlap };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
  return scored;
}

app.post("/api/upload", upload.single("pdf"), async (req, res) => {
  console.log(`Received upload request: ${req.file?.originalname}`);
  try {
    await ensureDataFiles();
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    
    const data = await readFile(req.file.path);
    const parsed = await pdf(data);
    const chunks = chunkText(parsed.text);
    
    const fileId = uuidv4();
    await embedChunks(chunks, fileId, parsed.images);
    
    res.json({ fileId, pageCount: parsed.numpages, chunkCount: chunks.length });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/analyze", async (req, res) => {
  const { fileId, question } = req.body;
  if (!fileId) return res.status(400).json({ error: "fileId required" });
  const runId = uuidv4();
  const runs = await loadRuns();
  runs.push({ runId, status: "queued", fileId, report: null });
  await saveRuns(runs);

  analyzeJob(runId, fileId, question || "Provide full executive summary.").catch(console.error);
  res.json({ runId });
});

app.get("/api/run/:runId", async (req, res) => {
  const runs = await loadRuns();
  const run = runs.find((r) => r.runId === req.params.runId);
  if (!run) return res.status(404).json({ error: "Not found" });
  res.json(run);
});

async function analyzeJob(runId, fileId, query) {
  const runs = await loadRuns();
  const idx = runs.findIndex((r) => r.runId === runId);
  if (idx === -1) return;
  runs[idx].status = "running";
  await saveRuns(runs);

  try {
    const top = await retrieveSimilar(fileId, query);
    const context = top.map((t, i) => `Chunk ${i + 1}:\n${t.chunk}`).join("\n\n");
    const allImages = await loadImages();
    const images = allImages[fileId] || [];

    // Process images in batches of 5 (NVIDIA API limit)
    const visualInsights = [];
    const batches = [];
    for (let i = 0; i < images.length; i += 5) {
      batches.push(images.slice(i, i + 5));
    }

    // Run vision prompts in parallel to stay within the 15s window
    const visionPromises = batches.map(async (batch, bIdx) => {
      const messages = [
        {
          role: "system",
          content: "/think"
        },
        {
          role: "user",
          content: [
            { type: "text", text: `Analyze these document pages (Batch ${bIdx + 1}). Extract graphical data and statistical trends.` },
            ...batch.map(img => ({
              type: "image_url",
              image_url: { url: `data:image/jpeg;base64,${img}` }
            }))
          ]
        }
      ];

      const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.NVIDIA_API_KEY}`,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({
          model: process.env.NVIDIA_MODEL || "nvidia/nemotron-nano-12b-v2-vl",
          messages,
          max_tokens: 4096,
          temperature: 1,
          top_p: 1,
          stream: false
        }),
      });

      if (!response.ok) return `(Vision Error Batch ${bIdx + 1}: ${response.status})`;
      const data = await response.json();
      return data?.choices?.[0]?.message?.content || "";
    });

    const visionResults = await Promise.all(visionPromises);
    const aggregatedVisualContext = visionResults.join("\n\n---\n\n");

    const isReport = query === "Provide full executive summary.";

    const systemPrompt = isReport 
      ? "You are an expert document analyst. Produce a structured JSON report with fields: " +
        "summary (150 words), " +
        "positives (array of {title, why}), " +
        "negatives (array of {title, impact}), " +
        "actions (array of {title, impact, owner, effort}), " +
        "metrics (object with keys 'readability', 'redundancy', 'sentiment' as floating point numbers 0.0-1.0), " +
        "charts (object with keys 'barCharts' [array of {label, value}] and 'lineCharts' [array of {title, points: array of {x, y}}]), " +
        "dataInsights (array with objects {label, value, trend: 'up'|'down'|'stable', interpretation}), outline (array of strings). " +
        "Synthesize BOTH the textual context AND the visual analysis provided. IMPORTANT: positives/negatives/actions MUST be arrays of OBJECTS, not strings. Populate 'charts' ONLY if statistical or trend data is found."
      : "You are a helpful document assistant. Answer the user's question directly and concisely using the provided context and visual analysis. Use clean Markdown formatting. Do NOT use JSON.";

    const finalResponse = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.NVIDIA_API_KEY}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        model: process.env.NVIDIA_MODEL || "nvidia/nemotron-nano-12b-v2-vl",
        messages: [
          { role: "system", content: "/think\n" + systemPrompt },
          { role: "user", content: `User request: ${query}\n\n[Textual Context]:\n${context}\n\n[Visual Analysis from Images]:\n${aggregatedVisualContext}` }
        ],
        max_tokens: 4096,
        temperature: 0.7,
        top_p: 1,
        stream: false,
      }),
    });

    if (!finalResponse.ok) throw new Error(`NVIDIA Final API error: ${finalResponse.status}`);

    const finalData = await finalResponse.json();
    let text = finalData?.choices?.[0]?.message?.content || "";
    
    // Clean JSON for report mode
    if (isReport) {
      if (text.includes("```json")) {
        text = text.split("```json")[1].split("```")[0].trim();
      } else if (text.includes("```")) {
        text = text.split("```")[1].split("```")[0].trim();
      }
    }

    const runsFinal = await loadRuns();
    const finalIdx = runsFinal.findIndex((r) => r.runId === runId);
    runsFinal[finalIdx].status = "done";
    runsFinal[finalIdx].report = text;
    await saveRuns(runsFinal);
  } catch (err) {
    console.error("Analysis Failure:", err);
    const runsErr = await loadRuns();
    const errIdx = runsErr.findIndex((r) => r.runId === runId);
    runsErr[errIdx].status = "error";
    runsErr[errIdx].report = err.message;
    await saveRuns(runsErr);
  }
}

// SPA Support: Serve index.html for unknown routes
app.use((req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  res.sendFile(join(__dirname, "../client/dist/index.html"));
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
