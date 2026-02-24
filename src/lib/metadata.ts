const DEFAULT_PRODUCTION_URL = "https://bibleharu.com";

function toHttpsUrl(hostOrUrl: string): string {
  const trimmed = hostOrUrl.trim();
  if (!trimmed) return DEFAULT_PRODUCTION_URL;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

export function resolveMetadataBase(): URL {
  const candidates = [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.SITE_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_URL,
  ];

  for (const value of candidates) {
    if (!value) continue;
    try {
      return new URL(toHttpsUrl(value));
    } catch {
      continue;
    }
  }

  return new URL(DEFAULT_PRODUCTION_URL);
}

