import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

function verifyAdmin(req: NextRequest): boolean {
  const token = req.headers.get("x-admin-token");
  const adminPassword = process.env.ADMIN_PASSWORD;
  return !!(token && adminPassword && token === adminPassword);
}

type EntryRow = {
  id: string;
  vorname: string;
  nachname: string;
  guests: string[] | null;
};

export async function GET(req: NextRequest) {
  if (!verifyAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json(
      { error: "Server-Konfigurationsfehler" },
      { status: 500 }
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey
  );

  const { data: planRow, error: planError } = await supabase
    .from("seating_plan")
    .select("assignment,published_at")
    .eq("id", 1)
    .maybeSingle();

  if (planError) {
    return NextResponse.json({ error: planError.message }, { status: 500 });
  }

  const assignment = (planRow?.assignment ?? null) as Record<string, unknown> | null;
  if (!assignment) {
    return NextResponse.json(
      {
        ok: false,
        error: "Noch kein Sitzplan veröffentlicht.",
        published_at: planRow?.published_at ?? null,
      },
      { status: 404 }
    );
  }

  const { data: entries, error: entriesError } = await supabase
    .from("entries")
    .select("id,vorname,nachname,guests")
    .order("created_at", { ascending: false });

  if (entriesError) {
    return NextResponse.json({ error: entriesError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    published_at: planRow?.published_at ?? null,
    assignment,
    entries: (entries as EntryRow[]) ?? [],
  });
}

