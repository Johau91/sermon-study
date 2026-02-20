import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  const db = getDb();
  const rows = db
    .prepare("SELECT key, value FROM app_settings")
    .all() as { key: string; value: string }[];

  const settings: Record<string, string> = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }

  return Response.json(settings);
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { key, value } = body as { key: string; value: string };

    if (!key || typeof key !== "string" || typeof value !== "string") {
      return Response.json({ error: "key and value are required" }, { status: 400 });
    }

    const db = getDb();
    db.prepare(
      "INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
    ).run(key, value);

    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
}
