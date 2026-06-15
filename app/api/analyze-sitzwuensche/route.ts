import { NextRequest, NextResponse } from "next/server";
import { analyzeSitzwuensche } from "@/lib/analyze-sitzwuensche";
import type { Entry } from "@/lib/supabase";

function verifyAdmin(req: NextRequest): boolean {
  const token = req.headers.get("x-admin-token");
  const adminPassword = process.env.ADMIN_PASSWORD;
  return !!(token && adminPassword && token === adminPassword);
}

export async function POST(req: NextRequest) {
  if (!verifyAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const entries = body.entries as Entry[] | undefined;

    if (!Array.isArray(entries)) {
      return NextResponse.json({ error: "Invalid entries payload" }, { status: 400 });
    }

    const wishes = await analyzeSitzwuensche(entries);
    return NextResponse.json({ wishes });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Analysis failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
