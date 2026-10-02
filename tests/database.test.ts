import { afterEach, describe, expect, it } from "vitest";
import { JournalDatabase } from "../src/database.js";

const databases: JournalDatabase[] = [];
afterEach(() => databases.splice(0).forEach((database) => database.close()));

function correctionCount(count: number) {
  return {
    correctedText: "Corrected text.",
    encouragement: "Keep practicing.",
    corrections: Array.from({ length: count }, (_, index) => ({ category: "grammar" as const, original: `wrong ${index}`, suggestion: `right ${index}`, explanation: "A grammar correction." }))
  };
}

describe("insight trends", () => {
  it("compares recent correction density with earlier entries", () => {
    const database = new JournalDatabase(":memory:");
    databases.push(database);
    const text = "one two three four five six seven eight nine ten";
    [4, 3, 1, 0].forEach((count, index) => {
      const entry = database.createEntry({ text, language: "Spanish" }, new Date(`2026-01-0${index + 1}T00:00:00.000Z`));
      database.completeEntry(entry.id, correctionCount(count));
    });

    const insights = database.getInsights();
    expect(insights.trend.direction).toBe("improving");
    expect(insights.trend.olderAverage).toBe(35);
    expect(insights.trend.recentAverage).toBe(5);
  });
});
