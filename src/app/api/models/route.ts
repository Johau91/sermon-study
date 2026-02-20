const OLLAMA_BASE = process.env.OLLAMA_BASE_URL || "http://localhost:11434";

export async function GET() {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`);
    if (!res.ok) {
      return Response.json({ error: "Ollama not reachable" }, { status: 502 });
    }
    const data = await res.json();
    const EMBEDDING_MODELS = ["all-minilm", "nomic-embed", "bge-m3", "mxbai-embed"];
    const models = (data.models || [])
      .filter((m: { name: string }) => !EMBEDDING_MODELS.some((e) => m.name.startsWith(e)))
      .map((m: { name: string; size: number; modified_at: string }) => ({
        name: m.name,
        size: m.size,
        modified_at: m.modified_at,
      }));
    return Response.json(models);
  } catch {
    return Response.json({ error: "Failed to fetch models" }, { status: 502 });
  }
}
