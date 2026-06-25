import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { validateGuestStrings } from "@/lib/guest-names";

const PRICE_PER_PERSON = 64;

function verifyAdmin(req: NextRequest): boolean {
  const token = req.headers.get("x-admin-token");
  const adminPassword = process.env.ADMIN_PASSWORD;
  return !!(token && adminPassword && token === adminPassword);
}

type CreateBody = {
  vorname: string;
  nachname: string;
  guests?: string[] | null;
  isFree?: boolean;
};

export async function POST(req: NextRequest) {
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

  const body = (await req.json()) as CreateBody;
  const vorname = body.vorname?.trim();
  const nachname = body.nachname?.trim();
  if (!vorname || !nachname) {
    return NextResponse.json(
      { error: "Vor- und Nachname erforderlich." },
      { status: 400 }
    );
  }

  const filteredGuests: string[] = Array.isArray(body.guests)
    ? body.guests.map((g) => String(g).trim()).filter(Boolean)
    : [];

  const guestError = validateGuestStrings(filteredGuests);
  if (guestError) {
    return NextResponse.json({ error: guestError }, { status: 400 });
  }

  const totalPersons = 1 + filteredGuests.length;
  const totalPrice = body.isFree ? 0 : totalPersons * PRICE_PER_PERSON;
  const bezahlt = body.isFree ? true : false;
  const bezahlt_at = body.isFree ? new Date().toISOString() : null;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey
  );

  const { data: existing } = await supabase
    .from("entries")
    .select("*")
    .ilike("vorname", vorname)
    .ilike("nachname", nachname)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: "Dieser Name existiert bereits in der Liste." },
      { status: 409 }
    );
  }

  const { data, error } = await supabase
    .from("entries")
    .insert({
      vorname,
      nachname,
      guests: filteredGuests.length > 0 ? filteredGuests : null,
      total_persons: totalPersons,
      total_price: totalPrice,
      bezahlt,
      bezahlt_at,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, entry: data });
}

