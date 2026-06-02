import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const PRICE_PER_PERSON = 64;

function verifyAdmin(req: NextRequest): boolean {
  const token = req.headers.get("x-admin-token");
  const adminPassword = process.env.ADMIN_PASSWORD;
  return !!(token && adminPassword && token === adminPassword);
}

export async function PATCH(req: NextRequest) {
  if (!verifyAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { id, vorname, nachname, guests } = body;

  if (!id || !vorname?.trim() || !nachname?.trim()) {
    return NextResponse.json({ error: "Pflichtfelder fehlen" }, { status: 400 });
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json({ error: "Server-Konfigurationsfehler" }, { status: 500 });
  }

  const filteredGuests: string[] = Array.isArray(guests)
    ? guests.map((g: string) => String(g).trim()).filter(Boolean)
    : [];

  const totalPersons = 1 + filteredGuests.length;
  const totalPrice = totalPersons * PRICE_PER_PERSON;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey
  );

  const { data: duplicate } = await supabase
    .from("entries")
    .select("id")
    .ilike("vorname", vorname.trim())
    .ilike("nachname", nachname.trim())
    .neq("id", id)
    .maybeSingle();

  if (duplicate) {
    return NextResponse.json(
      { error: "Es existiert bereits eine Anmeldung mit diesem Namen." },
      { status: 409 }
    );
  }

  const { data, error } = await supabase
    .from("entries")
    .update({
      vorname: vorname.trim(),
      nachname: nachname.trim(),
      guests: filteredGuests.length > 0 ? filteredGuests : null,
      total_persons: totalPersons,
      total_price: totalPrice,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, entry: data });
}
