import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
import { AiAnalysis, Correction, EntryDetail, EntrySummary, Insights } from "./types.js";

type EntryRow = {
  id: string;
  text: string;
  language: string;
  status: "complete" | "failed" | "analyzing";
  created_at: string;
  analysis_error: string | null;
};

export class JournalDatabase {
  private db: Database.Database;

  constructor(filename = "data/journal.db") {
    if (filename !== ":memory:") mkdirSync(dirname(filename), { recursive: true });
    this.db = new Database(filename);
    this.db.pragma("journal_mode = WAL");
    this.migrate();
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS entries (
        id TEXT PRIMARY KEY,
        text TEXT NOT NULL,
        language TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('analyzing', 'complete', 'failed')),
        analysis_error TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS feedback (
        entry_id TEXT PRIMARY KEY REFERENCES entries(id) ON DELETE CASCADE,
        corrected_text TEXT NOT NULL,
        encouragement TEXT NOT NULL,
        raw_response TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS corrections (
        id TEXT PRIMARY KEY,
        entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
        category TEXT NOT NULL,
        original_text TEXT NOT NULL,
        suggestion TEXT NOT NULL,
        explanation TEXT NOT NULL
      );
    `);
  }

  createEntry(input: { text: string; language: string }): EntrySummary {
    const entry: EntryRow = {
      id: randomUUID(), text: input.text, language: input.language, status: "analyzing",
      created_at: new Date().toISOString(), analysis_error: null
    };
    this.db.prepare("INSERT INTO entries (id, text, language, status, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(entry.id, entry.text, entry.language, entry.status, entry.created_at);
    return this.toSummary(entry, 0);
  }

  completeEntry(id: string, analysis: AiAnalysis) {
    const save = this.db.transaction(() => {
      this.db.prepare("UPDATE entries SET status = 'complete', analysis_error = NULL WHERE id = ?").run(id);
      this.db.prepare("INSERT INTO feedback (entry_id, corrected_text, encouragement, raw_response) VALUES (?, ?, ?, ?)")
        .run(id, analysis.correctedText, analysis.encouragement, JSON.stringify(analysis));
      const insert = this.db.prepare("INSERT INTO corrections (id, entry_id, category, original_text, suggestion, explanation) VALUES (?, ?, ?, ?, ?, ?)");
      for (const correction of analysis.corrections) {
        insert.run(randomUUID(), id, correction.category, correction.original, correction.suggestion, correction.explanation);
      }
    });
    save();
  }

  failEntry(id: string, message: string) {
    this.db.prepare("UPDATE entries SET status = 'failed', analysis_error = ? WHERE id = ?").run(message, id);
  }

  listEntries(): EntrySummary[] {
    const rows = this.db.prepare(`SELECT e.*, COUNT(c.id) AS correction_count FROM entries e LEFT JOIN corrections c ON c.entry_id = e.id GROUP BY e.id ORDER BY e.created_at DESC`).all() as Array<EntryRow & { correction_count: number }>;
    return rows.map((row) => this.toSummary(row, row.correction_count));
  }

  getEntry(id: string): EntryDetail | undefined {
    const row = this.db.prepare("SELECT * FROM entries WHERE id = ?").get(id) as EntryRow | undefined;
    if (!row) return undefined;
    const feedback = this.db.prepare("SELECT corrected_text, encouragement FROM feedback WHERE entry_id = ?").get(id) as { corrected_text: string; encouragement: string } | undefined;
    const corrections = this.db.prepare("SELECT category, original_text, suggestion, explanation FROM corrections WHERE entry_id = ?").all(id) as Array<{ category: Correction["category"]; original_text: string; suggestion: string; explanation: string }>;
    return {
      ...this.toSummary(row, corrections.length),
      analysisError: row.analysis_error ?? undefined,
      feedback: feedback ? { correctedText: feedback.corrected_text, encouragement: feedback.encouragement, corrections: corrections.map((item) => ({ category: item.category, original: item.original_text, suggestion: item.suggestion, explanation: item.explanation })) } : undefined
    };
  }

  getInsights(): Insights {
    const categories = this.db.prepare("SELECT category, COUNT(*) AS count FROM corrections GROUP BY category ORDER BY count DESC, category ASC").all() as Insights["categories"];
    const frequentPatterns = this.db.prepare("SELECT original_text AS original, COUNT(*) AS count FROM corrections GROUP BY original_text HAVING count > 1 ORDER BY count DESC, original_text ASC LIMIT 5").all() as Insights["frequentPatterns"];
    return { totalCorrections: categories.reduce((total, item) => total + item.count, 0), categories, frequentPatterns };
  }

  close() { this.db.close(); }

  private toSummary(row: EntryRow, correctionCount: number): EntrySummary {
    return { id: row.id, text: row.text, language: row.language, status: row.status, createdAt: row.created_at, correctionCount };
  }
}
