const OLLAMA_BASE = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || "all-minilm";

// all-minilm has 256 token context; truncate to stay within limits
const MAX_EMBED_CHARS = 500;

export async function generateEmbedding(text: string): Promise<Float32Array> {
  const truncated = text.length > MAX_EMBED_CHARS ? text.slice(0, MAX_EMBED_CHARS) : text;
  const res = await fetch(`${OLLAMA_BASE}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBED_MODEL, input: truncated }),
  });

  if (!res.ok) throw new Error(`Ollama embed error: ${res.status}`);
  const data = await res.json();
  return new Float32Array(data.embeddings[0]);
}

export async function generateEmbeddings(
  texts: string[]
): Promise<Float32Array[]> {
  const res = await fetch(`${OLLAMA_BASE}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts.map(t => t.length > MAX_EMBED_CHARS ? t.slice(0, MAX_EMBED_CHARS) : t) }),
  });

  if (!res.ok) throw new Error(`Ollama embed error: ${res.status}`);
  const data = await res.json();
  return data.embeddings.map((e: number[]) => new Float32Array(e));
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function embeddingToBuffer(embedding: Float32Array): Buffer {
  return Buffer.from(embedding.buffer);
}

export function bufferToEmbedding(buffer: Buffer): Float32Array {
  return new Float32Array(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength / 4
  );
}
