import cors from "@fastify/cors";
import Fastify from "fastify";
import { z } from "zod";
import { AiProvider } from "./ai.js";
import { JournalDatabase } from "./database.js";

const createEntrySchema = z.object({
  text: z.string().trim().min(3, "Write at least three characters.").max(10000, "Entries must be 10,000 characters or fewer."),
  language: z.string().trim().min(2).max(80)
});

export function buildApp(dependencies: { database: JournalDatabase; ai: AiProvider }) {
  const app = Fastify({ logger: true });
  app.register(cors, { origin: true });

  app.get("/api/health", async () => ({ ok: true }));
  app.get("/api/entries", async () => dependencies.database.listEntries());
  app.get("/api/entries/:id", async (request, reply) => {
    const entry = dependencies.database.getEntry((request.params as { id: string }).id);
    if (!entry) return reply.code(404).send({ error: "Entry not found." });
    return entry;
  });
  app.get("/api/insights", async () => dependencies.database.getInsights());

  app.post("/api/entries", async (request, reply) => {
    const parsed = createEntrySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid entry." });

    const entry = dependencies.database.createEntry(parsed.data);
    try {
      const analysis = await dependencies.ai.analyze(parsed.data);
      dependencies.database.completeEntry(entry.id, analysis);
      return reply.code(201).send(dependencies.database.getEntry(entry.id));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Analysis failed.";
      dependencies.database.failEntry(entry.id, message);
      return reply.code(502).send({ error: "We saved your entry, but feedback could not be generated. Please try again.", entryId: entry.id });
    }
  });

  return app;
}
