import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

function verifyAdmin(req: NextRequest): boolean {
  const token = req.headers.get("x-admin-token");
  const adminPassword = process.env.ADMIN_PASSWORD;
  return !!(token && adminPassword && token === adminPassword);
}

type PublishBody = {
  assignment: Record<string, number>;
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

  let body: PublishBody;
  try {
    body = (await req.json()) as PublishBody;
  } catch {
    return NextResponse.json({ error: "Ungültiger Body" }, { status: 400 });
  }

  if (!body?.assignment || typeof body.assignment !== "object") {
    return NextResponse.json({ error: "assignment fehlt" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey
  );

  const publishedAt = new Date().toISOString();

  const { data, error } = await supabase
    .from("seating_plan")
    .upsert(
      { id: 1, assignment: body.assignment, published_at: publishedAt },
      { onConflict: "id" }
    )
    .select("published_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, published_at: data?.published_at });
}

