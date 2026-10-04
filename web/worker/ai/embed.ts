// Voyage AI embeddings (voyage-code-3, 1024 dims) over its public REST API, with your own VOYAGE_API_KEY.
import type { Embedder } from "./types";

export class VoyageEmbedder implements Embedder {
  readonly dimensions = 1024;
  constructor(private apiKey = process.env.VOYAGE_API_KEY, private model = process.env.EMBED_MODEL ?? "voyage-code-3") {
    if (!apiKey) throw new Error("VOYAGE_API_KEY is missing");
  }
  async embed(texts: string[], kind: "document" | "query"): Promise<number[][]> {
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += 64) {
      const batch = texts.slice(i, i + 64);
      for (let attempt = 0; ; attempt++) {
        const res = await fetch("https://api.voyageai.com/v1/embeddings", {
          method: "POST",
          headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
          body: JSON.stringify({ input: batch, model: this.model, input_type: kind, output_dimension: this.dimensions }),
        });
        if (res.status === 429 || res.status >= 500) {
          if (attempt >= 4) throw new Error(`Voyage embeddings failed with ${res.status}`);
          await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
          continue;
        }
        if (!res.ok) throw new Error(`Voyage embeddings failed with ${res.status}: ${(await res.text()).slice(0, 200)}`);
        const json = (await res.json()) as { data: { embedding: number[]; index: number }[] };
        out.push(...json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding));
        break;
      }
    }
    return out;
  }
}
