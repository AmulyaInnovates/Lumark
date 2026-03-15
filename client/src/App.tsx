import { useEffect, useState } from "react";
import "./App.css";

type RunStatus = "idle" | "uploading" | "analyzing" | "done" | "error";

type Report = {
  summary?: string;
  positives?: { title: string; why?: string }[];
  negatives?: { title: string; impact?: string }[];
  actions?: { title: string; owner?: string; effort?: number; impact?: number }[];
  metrics?: { readability?: number; redundancy?: number; sentiment?: number };
  outline?: string[];
};

function App() {
  const [file, setFile] = useState<File | null>(null);
  const [fileInfo, setFileInfo] = useState<{ fileId: string; pageCount: number; chunkCount: number } | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [status, setStatus] = useState<RunStatus>("idle");
  const [message, setMessage] = useState<string>("");
  const [report, setReport] = useState<Report | null>(null);

  const handleUpload = async () => {
    if (!file) return;
    setStatus("uploading");
    setMessage("Uploading and chunking PDF…");
    setReport(null);
    setFileInfo(null);

    const form = new FormData();
    form.append("pdf", file);
    const res = await fetch("/api/upload", { method: "POST", body: form });
    if (!res.ok) {
      setStatus("error");
      setMessage(`Upload failed: ${(await res.json()).error}`);
      return;
    }
    const data = await res.json();
    setFileInfo(data);
    setStatus("analyzing");
    setMessage("Embedding and analyzing…");

    const analyzeRes = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileId: data.fileId }),
    });
    const analyze = await analyzeRes.json();
    setRunId(analyze.runId);
  };

  useEffect(() => {
    if (!runId) return;
    const id = setInterval(async () => {
      const res = await fetch(`/api/run/${runId}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.status === "done") {
        setStatus("done");
        setMessage("Analysis complete.");
        try {
          setReport(JSON.parse(data.report));
        } catch {
          setReport({ summary: data.report });
        }
        clearInterval(id);
      } else if (data.status === "error") {
        setStatus("error");
        setMessage(data.report || "Something went wrong.");
        clearInterval(id);
      } else {
        setStatus("analyzing");
      }
    }, 2000);
    return () => clearInterval(id);
  }, [runId]);

  return (
    <div className="page">
      <header>
        <div>
          <p className="eyebrow">PDF Insight Lab</p>
          <h1>Summarize & critique giant PDFs with AI</h1>
          <p className="lede">Upload a 1000+ page PDF, get an executive summary, positives, negatives, and action plan—plus quick metrics.</p>
        </div>
      </header>

      <section className="panel">
        <div className="upload">
          <label className="file-drop">
            <input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            {file ? <span>{file.name}</span> : <span>Drop your PDF or click to browse (max 512 MB)</span>}
          </label>
          <button className="primary" disabled={!file || status === "uploading" || status === "analyzing"} onClick={handleUpload}>
            {status === "uploading" ? "Uploading…" : status === "analyzing" ? "Analyzing…" : "Analyze PDF"}
          </button>
          <p className="status">{message}</p>
          {fileInfo && (
            <p className="meta">
              Ingested {fileInfo.pageCount} pages into {fileInfo.chunkCount} chunks.
            </p>
          )}
        </div>
      </section>

      {report && (
        <section className="grid">
          <div className="card">
            <h3>Summary</h3>
            <p>{report.summary}</p>
          </div>
          <div className="card">
            <h3>Positives</h3>
            <ul>
              {report.positives?.map((p, i) => (
                <li key={i}>
                  <strong>{p.title}</strong>
                  <span>{p.why}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="card">
            <h3>Negatives / Risks</h3>
            <ul>
              {report.negatives?.map((n, i) => (
                <li key={i}>
                  <strong>{n.title}</strong>
                  <span>{n.impact}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="card">
            <h3>Actions</h3>
            <ul>
              {report.actions?.map((a, i) => (
                <li key={i}>
                  <strong>{a.title}</strong>
                  <span>
                    Owner: {a.owner || "Unassigned"} · Effort {a.effort ?? "-"} · Impact {a.impact ?? "-"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="card">
            <h3>Metrics</h3>
            <div className="metrics">
              <Metric label="Readability" value={report.metrics?.readability} />
              <Metric label="Redundancy" value={report.metrics?.redundancy} />
              <Metric label="Sentiment" value={report.metrics?.sentiment} />
            </div>
          </div>
          <div className="card">
            <h3>Outline</h3>
            <ol>
              {report.outline?.map((o, i) => (
                <li key={i}>{o}</li>
              ))}
            </ol>
          </div>
        </section>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value?: number }) {
  if (value === undefined) return <div className="metric">{label}: –</div>;
  const pct = Math.round((value + 1) * 50); // maps -1..1 to 0..100
  return (
    <div className="metric">
      <div className="metric-head">
        <span>{label}</span>
        <span>{value.toFixed(2)}</span>
      </div>
      <div className="bar">
        <div className="fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default App;
