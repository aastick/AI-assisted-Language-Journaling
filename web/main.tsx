import { useEffect, useState } from "react";
import { BookOpen, ChartNoAxesColumnIncreasing, ChevronRight, Languages, PenLine, Sparkles } from "lucide-react";
import { createRoot } from "react-dom/client";
import type { EntryDetail, EntrySummary, Insights } from "../src/types";
import "./styles.css";

type View = "write" | "history" | "insights";
const languages = ["Spanish", "French", "German", "Italian", "Japanese"];

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "Something went wrong.");
  return body as T;
}

function App() {
  const [view, setView] = useState<View>("write");
  const [text, setText] = useState("");
  const [language, setLanguage] = useState("Spanish");
  const [current, setCurrent] = useState<EntryDetail | null>(null);
  const [history, setHistory] = useState<EntrySummary[]>([]);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const loadHistory = async () => setHistory(await api<EntrySummary[]>("/api/entries"));
  const loadInsights = async () => setInsights(await api<Insights>("/api/insights"));
  useEffect(() => { void loadHistory(); }, []);

  async function submit() {
    setError(""); setLoading(true);
    try {
      const entry = await api<EntryDetail>("/api/entries", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, language }) });
      setCurrent(entry); setText(""); await Promise.all([loadHistory(), loadInsights()]);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not get feedback."); } finally { setLoading(false); }
  }
  async function openEntry(id: string) { setError(""); setCurrent(await api<EntryDetail>(`/api/entries/${id}`)); setView("history"); }
  function changeView(next: View) { setView(next); if (next === "history") void loadHistory(); if (next === "insights") void loadInsights(); }

  return <main className="shell">
    <aside className="sidebar"><div className="brand"><span className="brand-mark"><Languages size={21} /></span><span>Lingua<br />Journal</span></div><nav>
      <button className={view === "write" ? "active" : ""} onClick={() => changeView("write")}><PenLine size={18} /> Write</button>
      <button className={view === "history" ? "active" : ""} onClick={() => changeView("history")}><BookOpen size={18} /> Entries</button>
      <button className={view === "insights" ? "active" : ""} onClick={() => changeView("insights")}><ChartNoAxesColumnIncreasing size={18} /> Insights</button>
    </nav><div className="local-note"><span className="status-dot" /> Local AI with Ollama</div></aside>
    <section className="workspace">{error && <div className="error" role="alert">{error}</div>}
      {view === "write" && <WriteView language={language} setLanguage={setLanguage} text={text} setText={setText} loading={loading} onSubmit={() => void submit()} current={current} />}
      {view === "history" && <HistoryView entries={history} current={current} onOpen={(id) => void openEntry(id)} />}
      {view === "insights" && <InsightsView insights={insights} />}
    </section>
  </main>;
}

function WriteView(props: { language: string; setLanguage: (value: string) => void; text: string; setText: (value: string) => void; loading: boolean; onSubmit: () => void; current: EntryDetail | null }) {
  return <div className="page-grid"><section className="writer"><header><p className="eyebrow">Today’s practice</p><h1>Write freely.</h1><p>Let the feedback wait until you finish your thought.</p></header><label className="select-label">Writing in<select value={props.language} onChange={(event) => props.setLanguage(event.target.value)}>{languages.map((item) => <option key={item}>{item}</option>)}</select></label><textarea value={props.text} onChange={(event) => props.setText(event.target.value)} placeholder="What happened today? Write it the way you would say it..." maxLength={10000} /><div className="editor-footer"><span>{props.text.length} characters</span><button className="primary" disabled={props.loading || props.text.trim().length < 3} onClick={props.onSubmit}>{props.loading ? "Thinking..." : <><Sparkles size={17} /> Get feedback</>}</button></div></section><Feedback detail={props.current} /></div>;
}

function Feedback({ detail }: { detail: EntryDetail | null }) {
  if (!detail) return <aside className="feedback empty"><Sparkles size={28} /><h2>Your feedback will appear here</h2><p>Finish your entry, then get thoughtful corrections in one calm review.</p></aside>;
  if (!detail.feedback) return <aside className="feedback empty"><h2>Feedback unavailable</h2><p>{detail.analysisError ?? "This entry is still being analyzed."}</p></aside>;
  return <aside className="feedback"><p className="eyebrow">Feedback</p><h2>{detail.feedback.encouragement}</h2><section className="corrected"><span>Suggested rewrite</span><p>{detail.feedback.correctedText}</p></section><div className="correction-list">{detail.feedback.corrections.length === 0 ? <p className="clean">No changes needed. Nicely done.</p> : detail.feedback.corrections.map((item, index) => <article className="correction" key={`${item.original}-${index}`}><span className={`tag ${item.category}`}>{item.category}</span><p><del>{item.original}</del><ChevronRight size={14} /><strong>{item.suggestion}</strong></p><small><strong>Why: </strong>{item.explanation}</small></article>)}</div></aside>;
}

function HistoryView({ entries, current, onOpen }: { entries: EntrySummary[]; current: EntryDetail | null; onOpen: (id: string) => void }) {
  return <div className="history-layout"><section><header><p className="eyebrow">Your archive</p><h1>Past entries</h1></header><div className="entry-list">{entries.length === 0 ? <p className="empty-list">Your saved entries will appear here.</p> : entries.map((entry) => <button className={`entry-row ${current?.id === entry.id ? "selected" : ""}`} key={entry.id} onClick={() => onOpen(entry.id)}><span className="date">{new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(entry.createdAt))}</span><span className="entry-copy"><strong>{entry.language}</strong><small>{entry.text}</small></span><span className="count">{entry.correctionCount}</span></button>)}</div></section><Feedback detail={current} /></div>;
}

function InsightsView({ insights }: { insights: Insights | null }) {
  if (!insights || insights.totalCorrections === 0) return <section className="insights"><header><p className="eyebrow">Patterns, not grades</p><h1>What to revisit</h1><p>These counts reflect saved suggestions, not a measure of fluency.</p></header><div className="empty-list">Write a few entries to begin seeing patterns.</div></section>;
  const maxDensity = Math.max(...insights.trend.entries.map((item) => item.correctionsPer100Words), 1);
  const trendSummary = insights.trend.direction === "improving"
    ? "Your recent entries have fewer suggestions per 100 words."
    : insights.trend.direction === "needs-attention"
      ? "Your recent entries have more suggestions per 100 words. Revisit the patterns below."
      : insights.trend.direction === "steady"
        ? "Your suggestion density is steady across recent entries."
        : "Complete at least four entries to compare recent writing with earlier writing.";
  return <section className="insights"><header><p className="eyebrow">Patterns, not grades</p><h1>What to revisit</h1><p>These counts reflect saved suggestions, not a measure of fluency.</p></header><div className="stat"><strong>{insights.totalCorrections}</strong><span>saved suggestions</span></div><div className="category-grid">{insights.categories.map((item) => <article key={item.category}><span className={`tag ${item.category}`}>{item.category}</span><strong>{item.count}</strong><small>suggestions</small></article>)}</div><section className="progress"><div><h2>Recent correction density</h2><p>{trendSummary}</p></div>{insights.trend.entries.length > 0 && <div className="trend-bars">{insights.trend.entries.map((item) => <div className="trend-item" key={item.createdAt}><span className="trend-value">{item.correctionsPer100Words}</span><span className="trend-bar" style={{ height: `${Math.max(10, (item.correctionsPer100Words / maxDensity) * 100)}%` }} /><small>{new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(item.createdAt))}</small></div>)}</div>}<p className="trend-caption">Suggestions per 100 words</p></section>{insights.frequentPatterns.length > 0 && <section className="patterns"><h2>Repeated phrases</h2>{insights.frequentPatterns.map((item) => <p key={item.original}><code>{item.original}</code><span>{item.count} times</span></p>)}</section>}</section>;
}
createRoot(document.getElementById("root")!).render(<App />);
