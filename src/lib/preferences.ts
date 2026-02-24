// localStorage-based preferences for single-user app

const FONT_SIZE_KEY = "sermon-font-size";
const READ_SERMONS_KEY = "sermon-read";
const LAST_READ_KEY = "sermon-last-read";
const SCROLL_KEY = "sermon-list-scroll";

// --- Font Size ---
const DEFAULT_FONT_SIZE = 15;
const MIN_FONT_SIZE = 13;
const MAX_FONT_SIZE = 21;

export function getFontSize(): number {
  if (typeof window === "undefined") return DEFAULT_FONT_SIZE;
  const v = localStorage.getItem(FONT_SIZE_KEY);
  if (!v) return DEFAULT_FONT_SIZE;
  const n = parseInt(v, 10);
  return n >= MIN_FONT_SIZE && n <= MAX_FONT_SIZE ? n : DEFAULT_FONT_SIZE;
}

export function setFontSize(size: number) {
  const clamped = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, size));
  localStorage.setItem(FONT_SIZE_KEY, String(clamped));
  return clamped;
}

export { MIN_FONT_SIZE, MAX_FONT_SIZE };

// --- Read Sermons ---
export function getReadSermons(): Set<number> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(READ_SERMONS_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

export function markAsRead(id: number) {
  const set = getReadSermons();
  set.add(id);
  localStorage.setItem(READ_SERMONS_KEY, JSON.stringify([...set]));
}

// --- Last Read (continue reading) ---
interface LastRead {
  id: number;
  scrollY: number;
  title?: string;
  timestamp: number;
}

export function getLastRead(): LastRead | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LAST_READ_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setLastRead(id: number, scrollY: number, title?: string) {
  const data: LastRead = { id, scrollY, title, timestamp: Date.now() };
  localStorage.setItem(LAST_READ_KEY, JSON.stringify(data));
}

// --- Scroll Position (list page) ---
export function saveListScroll() {
  sessionStorage.setItem(SCROLL_KEY, String(window.scrollY));
}

export function restoreListScroll() {
  const v = sessionStorage.getItem(SCROLL_KEY);
  if (v) {
    requestAnimationFrame(() => window.scrollTo(0, parseInt(v, 10)));
    sessionStorage.removeItem(SCROLL_KEY);
  }
}

// --- Sermon Notes ---
export function getSermonNote(id: number): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(`sermon-notes-${id}`) || "";
}

export function setSermonNote(id: number, note: string) {
  if (note.trim()) {
    localStorage.setItem(`sermon-notes-${id}`, note);
  } else {
    localStorage.removeItem(`sermon-notes-${id}`);
  }
}
