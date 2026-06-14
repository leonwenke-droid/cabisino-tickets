import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const vorname = body.vorname?.trim();
  const nachname = body.nachname?.trim();
  const sitzwunsch = body.sitzwunsch?.trim();

  if (!vorname || !nachname) {
    return NextResponse.json(
      { error: "Vor- und Nachname erforderlich." },
      { status: 400 }
    );
  }

  if (!sitzwunsch) {
    return NextResponse.json(
      { error: "Bitte gib deinen Sitzwunsch an." },
      { status: 400 }
    );
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

  const { data: entry, error: findError } = await supabase
    .from("entries")
    .select("id")
    .ilike("vorname", vorname)
    .ilike("nachname", nachname)
    .maybeSingle();

  if (findError) {
    return NextResponse.json({ error: findError.message }, { status: 500 });
  }

  if (!entry) {
    return NextResponse.json(
      {
        error:
          "Du bist noch nicht angemeldet. Melde dich zuerst unter der Hauptseite an.",
      },
      { status: 404 }
    );
  }

  const { data, error } = await supabase
    .from("entries")
    .update({ sitzwunsch })
    .eq("id", entry.id)
    .select("id, vorname, nachname, sitzwunsch")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, entry: data });
}
