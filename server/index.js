import express from "express";
import multer from "multer";
import cors from "cors";
import dotenv from "dotenv";
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { v4 as uuidv4 } from "uuid";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const DOMMatrix = require("@thednp/dommatrix");
global.DOMMatrix = global.DOMMatrix || DOMMatrix;
const pdf = require("pdf-parse");

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));

const upload = multer({ dest: "uploads/" });

const DATA_DIR = "data";
const RUNS_FILE = join(DATA_DIR, "runs.json");
const VECTORS_FILE = join(DATA_DIR, "vectors.json");

async function ensureDataFiles() {
  if (!existsSync(DATA_DIR)) await mkdir(DATA_DIR);
  if (!existsSync(RUNS_FILE)) await writeFile(RUNS_FILE, "[]", "utf-8");
  if (!existsSync(VECTORS_FILE)) await writeFile(VECTORS_FILE, "[]", "utf-8");
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

async function embedChunks(chunks, fileId) {
  // Placeholder: store chunks without embeddings (NVIDIA API key does not provide embeddings here)
  const vectors = chunks.map((c) => ({
    id: uuidv4(),
    fileId,
    chunk: c,
    vector: [], // empty vector
  }));
  const existing = await loadVectors();
  await saveVectors([...existing, ...vectors]);
  return vectors;
}

async function retrieveSimilar(fileId, query, k = 12) {
  // Simple relevance: score by keyword overlap since embeddings are unavailable
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
  try {
    await ensureDataFiles();
    if (!req.file) return res.status(400).json({ error: "Missing file" });
    if (req.file.size > 512 * 1024 * 1024) {
      return res.status(400).json({ error: "File exceeds 512MB OpenAI limit." });
    }
    const data = await readFile(req.file.path);
    const parsed = await pdf(data);
    const chunks = chunkText(parsed.text);
    const fileId = uuidv4();
    await embedChunks(chunks, fileId);
    res.json({ fileId, pageCount: parsed.numpages, chunkCount: chunks.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Upload failed" });
  }
});

app.post("/api/analyze", async (req, res) => {
  const { fileId, question } = req.body;
  if (!fileId) return res.status(400).json({ error: "fileId required" });
  const runId = uuidv4();
  const runs = await loadRuns();
  runs.push({ runId, status: "queued", fileId, report: null });
  await saveRuns(runs);

  // kick off async job
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
    const payload = {
      model: process.env.NVIDIA_MODEL || "nvidia/nemotron-3-super-120b-a12b",
      messages: [
        {
          role: "system",
          content:
            "You are an analyst. Produce JSON with fields: summary (150 words), positives[title,why], negatives[title,impact], actions[title,owner,effort1-5,impact1-5], metrics{readability0-1,redundancy0-1,sentiment-1..1}, outline[string]. Keep it concise.",
        },
        { role: "user", content: `User query: ${query}\n\nContext:\n${context}` },
      ],
      max_tokens: 16384,
      temperature: 1,
      top_p: 0.95,
      extra_body: {
        chat_template_kwargs: { enable_thinking: true },
        reasoning_budget: 16384,
      },
      stream: false,
    };

    const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`NVIDIA API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content || JSON.stringify(data);
    runs[idx].status = "done";
    runs[idx].report = text;
    await saveRuns(runs);
  } catch (err) {
    console.error(err);
    const runsAfter = await loadRuns();
    const i2 = runsAfter.findIndex((r) => r.runId === runId);
    runsAfter[i2].status = "error";
    runsAfter[i2].report = err.message;
    await saveRuns(runsAfter);
  }
}

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
