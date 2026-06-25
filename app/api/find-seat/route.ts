import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

type FindSeatBody = {
  query: string;
};

type SeatMatch = {
  entryId: string;
  registrantName: string;
  tableNumber: number;
  groupNames: string[];
};

type SearchEntryRow = {
  id: string;
  vorname: string | null;
  nachname: string | null;
  guests: string[] | null;
};

function normalizeQuery(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

export async function POST(req: NextRequest) {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json(
      { error: "Server-Konfigurationsfehler" },
      { status: 500 }
    );
  }

  let body: FindSeatBody;
  try {
    body = (await req.json()) as FindSeatBody;
  } catch {
    return NextResponse.json({ error: "Ungültiger Body" }, { status: 400 });
  }

  const q = normalizeQuery(body?.query ?? "");
  if (q.length < 2) {
    return NextResponse.json({ matches: [] satisfies SeatMatch[] });
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
      { error: "Sitzplan ist noch nicht veröffentlicht." },
      { status: 404 }
    );
  }

  const { data: entries, error: searchError } = await supabase.rpc(
    "search_entries",
    { search_term: q }
  );

  if (searchError) {
    return NextResponse.json({ error: searchError.message }, { status: 500 });
  }

  const matches: SeatMatch[] = [];
  for (const row of (entries ?? []) as SearchEntryRow[]) {
    const entryId = String(row.id);
    const tableRaw = assignment[entryId];
    const tableNumber =
      typeof tableRaw === "number"
        ? tableRaw
        : typeof tableRaw === "string"
          ? Number.parseInt(tableRaw, 10)
          : NaN;

    if (!Number.isFinite(tableNumber)) continue;

    const vorname = String(row.vorname ?? "").trim();
    const nachname = String(row.nachname ?? "").trim();
    const registrantName = `${vorname} ${nachname}`.trim();
    const guests: string[] = Array.isArray(row.guests)
      ? row.guests.map((g) => String(g).trim()).filter(Boolean)
      : [];

    const groupNames = [registrantName, ...guests].filter(Boolean);

    matches.push({
      entryId,
      registrantName,
      tableNumber,
      groupNames,
    });
  }

  // De-dupe (just in case) + stable ordering
  const byEntryId = new Map<string, SeatMatch>();
  for (const m of matches) byEntryId.set(m.entryId, m);
  const unique = Array.from(byEntryId.values()).sort((a, b) =>
    a.registrantName.localeCompare(b.registrantName, "de")
  );

  return NextResponse.json({
    matches: unique.slice(0, 20),
    published_at: planRow?.published_at ?? null,
  });
}

