import { AiAnalysis, aiAnalysisSchema } from "./types.js";

export interface AiProvider {
  analyze(input: { text: string; language: string }): Promise<AiAnalysis>;
}

export class AiOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiOutputError";
  }
}

const analysisJsonSchema = {
  type: "object",
  properties: {
    correctedText: { type: "string" },
    encouragement: { type: "string" },
    corrections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          category: { type: "string", enum: ["grammar", "spelling", "vocabulary", "style"] },
          original: { type: "string" },
          suggestion: { type: "string" },
          explanation: { type: "string" }
        },
        required: ["category", "original", "suggestion", "explanation"]
      }
    }
  },
  required: ["correctedText", "encouragement", "corrections"]
};

export class OllamaProvider implements AiProvider {
  constructor(
    private readonly baseUrl = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434",
    private readonly model = process.env.OLLAMA_MODEL ?? "qwen2.5:7b"
  ) {}

  async analyze({ text, language }: { text: string; language: string }): Promise<AiAnalysis> {
    let lastError: AiOutputError | undefined;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.requestAnalysis(text, language, attempt > 0);
      } catch (error) {
        if (!(error instanceof AiOutputError)) throw error;
        lastError = error;
      }
    }
    throw lastError ?? new AiOutputError("Ollama returned feedback in an invalid format.");
  }

  private async requestAnalysis(text: string, language: string, isRetry: boolean): Promise<AiAnalysis> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          stream: false,
          format: analysisJsonSchema,
          options: { temperature: 0 },
          messages: [
            { role: "system", content: `You are a supportive foreign-language writing coach. Return JSON matching the supplied schema. Preserve the writer's intended meaning and identify only meaningful improvements. Field rules: correctedText, original, and suggestion must stay in the learner's target language. encouragement and every explanation must be English only, regardless of the learner's target language. Never write Spanish, French, German, Italian, or Japanese in explanation. For example, for original 'yo fue' and suggestion 'yo fui', the explanation should be 'Use fui because it is the first-person past tense of ir.' If the entry is not in the learner's target language, use a vocabulary correction for the full entry and suggest a natural translation. ${isRetry ? "This is a retry because your previous response was invalid. Return only schema-valid JSON with every required field present." : "If there are no corrections, return an empty corrections array."}` },
            { role: "user", content: `The learner is writing in ${language}. Analyze this journal entry:\n\n${text}` }
          ]
        })
      });
    } catch {
      throw new Error("Ollama is not running. Start it, then run: ollama pull qwen2.5:7b");
    }
    if (!response.ok) throw new Error(`Ollama could not analyze this entry (${response.status}). Check that the configured model is installed.`);
    const body = await response.json() as { message?: { content?: string } };
    const content = body.message?.content;
    if (!content) throw new AiOutputError("Ollama returned an empty response.");
    try {
      return aiAnalysisSchema.parse(JSON.parse(content));
    } catch {
      throw new AiOutputError("Ollama returned feedback in an invalid format.");
    }
  }
}
