import { afterEach, describe, expect, it, vi } from "vitest";
import { AiOutputError, OllamaProvider } from "../src/ai.js";

afterEach(() => vi.unstubAllGlobals());

describe("OllamaProvider", () => {
  it("rejects malformed model output instead of treating it as feedback", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: { content: "this is not JSON" } })
    }));

    const provider = new OllamaProvider("http://ollama.test", "test-model");
    await expect(provider.analyze({ text: "Hola mundo", language: "Spanish" }))
      .rejects.toBeInstanceOf(AiOutputError);
  });

  it("rejects JSON that does not match the correction schema", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: { content: JSON.stringify({ correctedText: "Hola" }) } })
    }));

    const provider = new OllamaProvider("http://ollama.test", "test-model");
    await expect(provider.analyze({ text: "Hola mundo", language: "Spanish" }))
      .rejects.toBeInstanceOf(AiOutputError);
  });

  it("retries once when the first model response is malformed", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ message: { content: "not JSON" } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ message: { content: JSON.stringify({ correctedText: "Hola.", encouragement: "Nice work.", corrections: [] }) } }) });
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OllamaProvider("http://ollama.test", "test-model");
    await expect(provider.analyze({ text: "Hola.", language: "Spanish" })).resolves.toMatchObject({ correctedText: "Hola." });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
