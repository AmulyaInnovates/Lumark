import { useEffect, useState } from "react";

type RunStatus = "idle" | "uploading" | "analyzing" | "done" | "error";

type Report = {
  summary?: string;
  positives?: { title: string; why?: string }[];
  negatives?: { title: string; impact?: string }[];
  actions?: { title: string; owner?: string; effort?: number; impact?: number }[];
  metrics?: { readability?: number; redundancy?: number; sentiment?: number };
  dataInsights?: { label: string; value: string; trend: 'up' | 'down' | 'stable'; interpretation: string }[];
  charts?: {
    barCharts?: { label: string; value: number }[];
    lineCharts?: { title: string; points: { x: string | number; y: number }[] }[];
  };
  outline?: string[];
};


type Message = { role: "user" | "ai"; content: string };

function App() {
  const [file, setFile] = useState<File | null>(null);
  const [fileInfo, setFileInfo] = useState<{ fileId: string; pageCount: number; chunkCount: number } | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [status, setStatus] = useState<RunStatus>("idle");
  const [message, setMessage] = useState<string>("");
  const [processingStep, setProcessingStep] = useState<number>(0);
  const [report, setReport] = useState<Report | null>(null);
  const [chat, setChat] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");

  const steps = [
    "Initializing ingestion pipeline...",
    "Extracting high-resolution page snapshots...",
    "Encoding semantic text vectors...",
    "Synthesizing visual and textual data...",
    "NVIDIA Neural Engine performing deep reasoning...",
    "Finalizing strategic report..."
  ];

  useEffect(() => {
    let interval: any;
    if (status === "analyzing" || status === "uploading") {
      interval = setInterval(() => {
        setProcessingStep(prev => (prev + 1) % steps.length);
      }, 2500);
    } else {
      setProcessingStep(0);
    }
    return () => clearInterval(interval);
  }, [status]);

  const handleUpload = async () => {
    if (!file) return;
    setStatus("uploading");
    setReport(null);
    setFileInfo(null);
    setChat([]);

    const form = new FormData();
    form.append("pdf", file);
    
    try {
      const apiUrl = import.meta.env.VITE_API_URL || "";
      const res = await fetch(`${apiUrl}/api/upload`, { method: "POST", body: form });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      setFileInfo(data);
      triggerAnalysis(data.fileId, "Provide full executive summary.");
    } catch (err: any) {
      setStatus("error");
      setMessage(err.message);
    }
  };

  const triggerAnalysis = async (fileId: string, q: string) => {
    setStatus("analyzing");
    try {
      const apiUrl = import.meta.env.VITE_API_URL || "";
      const res = await fetch(`${apiUrl}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId, question: q }),
      });
      const data = await res.json();
      setRunId(data.runId);
    } catch (err: any) {
      setStatus("error");
      setMessage(err.message);
    }
  };

  const handleAsk = () => {
    if (!question || !fileInfo) return;
    const userQ = question;
    setChat(prev => [...prev, { role: "user", content: userQ }]);
    setQuestion("");
    triggerAnalysis(fileInfo.fileId, userQ);
  };

  useEffect(() => {
    if (!runId) return;
    const id = setInterval(async () => {
      try {
        const apiUrl = import.meta.env.VITE_API_URL || "";
        const res = await fetch(`${apiUrl}/api/run/${runId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === "done") {
          setStatus("done");
          
          let reportContent = data.report;
          let isJson = false;
          let parsedData: any = null;

          // Attempt to detect and parse JSON
          try {
            if (reportContent.trim().startsWith('{')) {
                parsedData = JSON.parse(reportContent);
                isJson = true;
            }
          } catch (e) {
            isJson = false;
          }

          if (chat.length > 0) {
              // It's a follow-up question
              const responseText = isJson ? (parsedData.summary || reportContent) : reportContent;
              setChat(prev => [...prev, { role: "ai", content: responseText }]);
          } else {
              // Initial full report
              if (isJson) {
                  setReport(parsedData);
              } else {
                  // Fallback for non-JSON initial report
                  setReport({ summary: reportContent });
              }
          }
          
          setRunId(null);
          clearInterval(id);
        } else if (data.status === "error") {
          setStatus("error");
          setMessage(data.report || "Analysis failed.");
          setRunId(null);
          clearInterval(id);
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
    }, 1500);
    return () => clearInterval(id);
  }, [runId, chat]);

  return (
    <div className="page">
      <nav className="top-nav">
        <a href="#" className="nav-logo-link" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
          <img src="/logo.png" alt="Lumark Logo" className="nav-logo" />
        </a>
      </nav>
      <header>
        <p className="eyebrow">Document Intelligence Lab v3.0</p>
        <h1>Analyze, Visualize, Converse.</h1>
        <p className="lede">Next-gen multi-modal analysis. See charts, ask questions, and get strategic insights in seconds.</p>
      </header>

      <div className="main-layout">
        <section className="panel-container">
          <section className="panel">
            <div className="upload">
              <label className="file-drop">
                <input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                <Icon.Upload />
                {file ? <span>{file.name}</span> : <span>Drop your PDF here or click to browse</span>}
              </label>
              
              <button className="primary" disabled={!file || status === "uploading" || status === "analyzing"} onClick={handleUpload}>
                {status === "uploading" || status === "analyzing" ? (
                  <div className="loader-container">
                    <div className="spinner" />
                    <span>Processing...</span>
                  </div>
                ) : (
                  <>Generate Insights <Icon.Zap /></>
                )}
              </button>
              
              {(status === "uploading" || status === "analyzing") && (
                <div className="processing-indicator">
                  <div className="progress-track"><div className="progress-fill" style={{ width: `${(processingStep + 1) * 16.6}%` }} /></div>
                  <p className="step-text">{steps[processingStep]}</p>
                </div>
              )}

              {status === "error" && <p className="status error">{message}</p>}
              
              {fileInfo && !report && status === "done" && (
                <div className="init-buttons">
                    <button className="secondary" onClick={() => triggerAnalysis(fileInfo.fileId, "Provide full executive summary.")}>
                        Reset Analysis <Icon.Rotate />
                    </button>
                </div>
              )}
            </div>
          </section>

          {report && (
            <div className="grid">
              <div className="card full">
                <h3><Icon.File /> Executive Summary</h3>
                <p>{report.summary}</p>
              </div>

              {report.dataInsights && report.dataInsights.length > 0 && (
                <div className="card full">
                  <h3><Icon.BarChart /> Visual Data Insights</h3>
                  <div className="data-grid">
                    {report.dataInsights.map((insight, i) => (
                      <div key={i} className="insight-card">
                        <div className="insight-header">
                          <span className="insight-label">{insight.label}</span>
                          <div className={`trend-badge ${insight.trend}`}>
                            {insight.trend === 'up' ? <Icon.TrendingUp /> : insight.trend === 'down' ? <Icon.TrendingDown /> : <Icon.Activity />}
                            {insight.trend.toUpperCase()}
                          </div>
                        </div>
                        <div className="insight-value">{insight.value}</div>
                        <p className="insight-desc">{insight.interpretation}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              <div className="card">
                <h3><Icon.TrendingUp /> Strategic Positives</h3>
                <ul>
                  {report.positives?.filter(p => p && p.title).map((p, i) => (
                    <li key={i}>
                      <strong>{p.title}</strong>
                      {p.why && <span>{p.why}</span>}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="card">
                <h3><Icon.TrendingDown /> Structural Risks</h3>
                <ul>
                  {report.negatives?.filter(n => n && n.title).map((n, i) => (
                    <li key={i}>
                      <strong>{n.title}</strong>
                      {n.impact && <span>{n.impact}</span>}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="card full">
                  <h3><Icon.Zap /> Strategic Action Plan</h3>
                  <div className="actions-grid">
                    {report.actions?.map((a, i) => (
                      <div key={i} className="action-item">
                        <strong>{a.title}</strong>
                        <div className="action-meta">
                            <span>Impact: {a.impact}/5</span>
                            <div className="mini-bar"><div className="mini-fill" style={{ width: `${(a.impact || 0) * 20}%` }} /></div>
                        </div>
                      </div>
                    ))}
                  </div>
              </div>

              <div className="card">
                <h3><Icon.Zap /> Document Metrics</h3>
                <div className="metrics">
                  <Metric label="Readability" value={report.metrics?.readability} />
                  <Metric label="Information Density" value={report.metrics?.redundancy} />
                  <Metric label="Strategic Sentiment" value={report.metrics?.sentiment} />
                </div>
              </div>

              <div className="card">
                <h3><Icon.Layout /> Document Architecture</h3>
                <div className="outline-list">
                  {report.outline?.map((o, i) => (
                    <li key={i} style={{ border: 'none', padding: '0.5rem 0' }}>
                      <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>• {o}</span>
                    </li>
                  ))}
                </div>
              </div>

              {/* Statistical Visualization Section */}
              {report.charts && (
                <div className="card full">
                  <h3><Icon.TrendingUp /> Statistical Trend Intelligence</h3>
                  <div className="charts-container">
                    {report.charts.barCharts && report.charts.barCharts.length > 0 && (
                      <div className="chart-item">
                        <p className="chart-label">Statistical Distribution</p>
                        <BarChart data={report.charts.barCharts} />
                      </div>
                    )}
                    {report.charts.lineCharts && report.charts.lineCharts.length > 0 && (
                      <div className="chart-item">
                        {report.charts.lineCharts.map((lc, idx) => (
                          <div key={idx} style={{ marginTop: idx > 0 ? '2rem' : 0 }}>
                            <p className="chart-label">{lc.title || "Trend Analysis"}</p>
                            <LineChart points={lc.points} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {fileInfo && (
          <aside className="chat-sidebar">
            <div className="chat-header">
              <h3><Icon.Activity /> Document Chat</h3>
              <p>Ask anything about the file</p>
            </div>
            <div className="chat-messages">
                {chat.length === 0 && <p className="empty-chat">Try asking: "What are the key statistical takeaways?"</p>}
                {chat.map((m, i) => (
                    <div key={i} className={`chat-bubble ${m.role}`}>
                        {m.content}
                    </div>
                ))}
                {status === "analyzing" && runId && <div className="chat-bubble ai pulse">Thinking...</div>}
            </div>
            <div className="chat-input-area">
                <input 
                    type="text" 
                    placeholder="Ask a question..." 
                    value={question} 
                    onChange={e => setQuestion(e.target.value)}
                    onKeyPress={e => e.key === 'Enter' && handleAsk()}
                />
                <button onClick={handleAsk} disabled={!question || status === "analyzing"}>
                    <Icon.Zap />
                </button>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

const Icon = {
  Upload: () => (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  ),
  File: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  ),
  TrendingUp: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  ),
  TrendingDown: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
      <polyline points="17 18 23 18 23 12" />
    </svg>
  ),
  Zap: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  ),
  Layout: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="9" y1="21" x2="9" y2="9" />
    </svg>
  ),
  Activity: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  ),
  BarChart: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="20" x2="12" y2="10" />
      <line x1="18" y1="20" x2="18" y2="4" />
      <line x1="6" y1="20" x2="6" y2="16" />
    </svg>
  ),
  Rotate: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
    </svg>
  )
};

function Metric({ label, value }: { label: string; value?: any }) {
  if (value === undefined || value === null) return null;
  
  const numValue = typeof value === 'number' ? value : parseFloat(String(value));
  if (isNaN(numValue)) {
      return (
        <div className="metric-item">
            <div className="metric-head">
                <span>{label}</span>
                <span className="metric-value">{String(value)}</span>
            </div>
        </div>
      );
  }
  
  const pct = Math.max(0, Math.min(100, Math.round(numValue * 100))); // maps 0..1 to 0..100 securely
  return (
    <div className="metric-item">
      <div className="metric-head">
        <span>{label}</span>
        <span className="metric-value">{numValue.toFixed(2)}</span>
      </div>
      <div className="bar">
        <div className="fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function BarChart({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="bar-chart">
      {data.map((d, i) => {
        const h = (d.value / max) * 100;
        return (
          <div key={i} className="bar-group">
            <div className="bar-track">
              <div className="bar-fill" style={{ height: `${h}%` }}>
                <span className="bar-tooltip">{d.value}</span>
              </div>
            </div>
            <span className="bar-label">{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function LineChart({ points }: { points: { x: string | number; y: number }[] }) {
  if (points.length < 2) return null;
  const max = Math.max(...points.map(p => p.y), 1);
  const min = Math.min(...points.map(p => p.y), 0);
  const range = max - min || 1;
  const width = 1000;
  const height = 400;
  
  const pathData = points.map((p, i) => {
    const x = (i / (points.length - 1)) * width;
    const y = height - ((p.y - min) / range) * height;
    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');

  return (
    <div className="line-chart">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent-primary)" stopOpacity="0.4" />
            <stop offset="100%" stopColor="var(--accent-primary)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${pathData} L ${width} ${height} L 0 ${height} Z`} fill="url(#lineGrad)" />
        <path d={pathData} fill="none" stroke="var(--accent-primary)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle key={i} cx={(i / (points.length - 1)) * width} cy={height - ((p.y - min) / range) * height} r="8" fill="var(--accent-primary)" />
        ))}
      </svg>
      <div className="line-labels">
        {points.map((p, i) => (
          <span key={i}>{p.x}</span>
        ))}
      </div>
    </div>
  );
}

export default App;
