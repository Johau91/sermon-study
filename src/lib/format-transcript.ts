/**
 * Format raw sermon transcript for display:
 * - Remove congregational "아멘" responses (keep when discussing the concept)
 * - Add paragraph breaks for readability
 */
export function formatTranscript(raw: string): string {
  let text = raw.replace(/\s+/g, " ").trim();

  // Remove congregational "아멘"
  // 1. Repeated "아멘" (clearly congregational: "아멘. 아멘." or "아멘 아멘")
  text = text.replace(/(아멘[.,!]?\s*){2,}/g, "");
  // 2. Standalone "아멘." between sentences
  //    Keep when followed by particles (이을에은는의란라하으) = discussing concept
  text = text.replace(/아멘\.\s*(?![이을에은는의란라하으])/g, "");

  text = text.replace(/\s+/g, " ").trim();

  // Add paragraph breaks at sentence boundaries (~300 chars)
  return splitIntoParagraphs(text, 300);
}

function splitIntoParagraphs(text: string, target: number): string {
  const paragraphs: string[] = [];
  let pos = 0;

  while (pos < text.length) {
    // If remaining text is short enough, take it all
    if (text.length - pos <= target * 1.5) {
      paragraphs.push(text.slice(pos).trim());
      break;
    }

    // Find last sentence-ending punctuation in range [target-100, target+100]
    const lo = pos + Math.max(target - 100, 100);
    const hi = pos + Math.min(target + 100, text.length - pos);
    let breakAt = -1;

    for (let i = hi; i >= lo; i--) {
      if (
        (text[i] === "." || text[i] === "?" || text[i] === "!") &&
        i + 1 < text.length &&
        text[i + 1] === " "
      ) {
        breakAt = i + 2;
        break;
      }
    }

    if (breakAt > pos) {
      paragraphs.push(text.slice(pos, breakAt).trim());
      pos = breakAt;
    } else {
      // Fallback: find next space after target
      const space = text.indexOf(" ", pos + target);
      if (space > 0) {
        paragraphs.push(text.slice(pos, space).trim());
        pos = space + 1;
      } else {
        paragraphs.push(text.slice(pos).trim());
        break;
      }
    }
  }

  return paragraphs.join("\n\n");
}
