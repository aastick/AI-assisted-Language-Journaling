import { z } from "zod";

export const correctionSchema = z.object({
  category: z.enum(["grammar", "spelling", "vocabulary", "style"]),
  original: z.string().min(1),
  suggestion: z.string().min(1),
  explanation: z.string().min(1)
});

export const aiAnalysisSchema = z.object({
  correctedText: z.string().min(1),
  encouragement: z.string().min(1),
  corrections: z.array(correctionSchema).max(20)
});

export type Correction = z.infer<typeof correctionSchema>;
export type AiAnalysis = z.infer<typeof aiAnalysisSchema>;

export type EntrySummary = {
  id: string;
  text: string;
  language: string;
  status: "complete" | "failed" | "analyzing";
  createdAt: string;
  correctionCount: number;
};

export type EntryDetail = EntrySummary & {
  feedback?: AiAnalysis;
  analysisError?: string;
};

export type Insights = {
  totalCorrections: number;
  categories: Array<{ category: Correction["category"]; count: number }>;
  frequentPatterns: Array<{ original: string; count: number }>;
  trend: {
    direction: "improving" | "needs-attention" | "steady" | "not-enough-history";
    olderAverage: number | null;
    recentAverage: number | null;
    entries: Array<{ createdAt: string; correctionCount: number; correctionsPer100Words: number }>;
  };
};
