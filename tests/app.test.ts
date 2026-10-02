import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { JournalDatabase } from "../src/database.js";
import { AiProvider } from "../src/ai.js";

const database = new JournalDatabase(":memory:");
const ai: AiProvider = { analyze: async () => ({ correctedText: "Hoy fui al mercado.", encouragement: "Great start. Your meaning is very clear.", corrections: [{ category: "grammar", original: "Yo fue", suggestion: "Yo fui", explanation: "Use fui for the first person of ir in the past tense." }] }) };
const app = buildApp({ database, ai });
afterAll(async () => { await app.close(); database.close(); });

describe("journal entry flow", () => {
  it("creates, analyzes, stores, and retrieves an entry", async () => {
    const create = await app.inject({ method: "POST", url: "/api/entries", payload: { text: "Yo fue al mercado hoy.", language: "Spanish" } });
    expect(create.statusCode).toBe(201); const created = create.json(); expect(created.status).toBe("complete"); expect(created.feedback.corrections).toHaveLength(1);
    const history = await app.inject({ method: "GET", url: "/api/entries" }); expect(history.json()).toHaveLength(1);
    const retrieved = await app.inject({ method: "GET", url: `/api/entries/${created.id}` }); expect(retrieved.statusCode).toBe(200); expect(retrieved.json().feedback.correctedText).toBe("Hoy fui al mercado.");
  });
  it("rejects invalid entries", async () => { const response = await app.inject({ method: "POST", url: "/api/entries", payload: { text: " ", language: "Spanish" } }); expect(response.statusCode).toBe(400); });
  it("aggregates saved corrections", async () => { const response = await app.inject({ method: "GET", url: "/api/insights" }); expect(response.json().categories).toContainEqual({ category: "grammar", count: 1 }); });
});
