import { NextRequest, NextResponse } from "next/server";
import { getBibleVerses, parseBibleReference } from "@/lib/bible";

export async function GET(req: NextRequest) {
  const ref = req.nextUrl.searchParams.get("ref") || "";
  const translation = req.nextUrl.searchParams.get("translation") || "개역한글";

  const parsed = parseBibleReference(ref);
  if (!parsed) {
    return NextResponse.json(
      { error: "유효한 성경 구절 형식이 아닙니다. 예: 요 3:16" },
      { status: 400 }
    );
  }

  const verses = getBibleVerses(parsed, translation);
  return NextResponse.json({ ref, translation, verses });
}
