export interface ChunkOptions {
  chunkSize?: number;
  overlap?: number;
}

export interface TextChunk {
  index: number;
  content: string;
}

export function chunkText(
  text: string,
  options: ChunkOptions = {}
): TextChunk[] {
  const { chunkSize = 800, overlap = 150 } = options;

  if (!text || text.trim().length === 0) return [];

  const cleaned = text.replace(/\s+/g, " ").trim();

  if (cleaned.length <= chunkSize) {
    return [{ index: 0, content: cleaned }];
  }

  const chunks: TextChunk[] = [];
  let start = 0;
  let index = 0;

  while (start < cleaned.length) {
    let end = start + chunkSize;

    if (end < cleaned.length) {
      // Try to break at sentence boundary
      const segment = cleaned.slice(start, end);
      const lastPeriod = Math.max(
        segment.lastIndexOf(". "),
        segment.lastIndexOf("다. "),
        segment.lastIndexOf("요. "),
        segment.lastIndexOf("! "),
        segment.lastIndexOf("? ")
      );

      if (lastPeriod > chunkSize * 0.5) {
        end = start + lastPeriod + 2;
      }
    } else {
      end = cleaned.length;
    }

    chunks.push({
      index,
      content: cleaned.slice(start, end).trim(),
    });

    if (end >= cleaned.length) break;
    start = end - overlap;
    index++;
  }

  return chunks;
}
