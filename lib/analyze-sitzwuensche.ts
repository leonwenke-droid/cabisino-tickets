import OpenAI from "openai";
import type { Entry } from "@/lib/supabase";
import type { ParsedWish } from "@/lib/sitzwunsch-types";

export type { ParsedWish, WishType, WishConfidence } from "@/lib/sitzwunsch-types";

type AnalyzeResponse = {
  wishes: ParsedWish[];
};

function buildPrompt(entries: Entry[]): string {
  return `You are analyzing seating preferences for a graduation party.

Here are all registered attendees:
${entries
  .map(
    (e) =>
      `- ID: ${e.id} | Name: ${e.vorname} ${e.nachname} | Sitzwunsch: ${e.sitzwunsch || "none"}`
  )
  .join("\n")}

For each person with a sitzwunsch, identify:
1. Which registered person(s) they are referring to (match by first name, last name, or full name, fuzzy)
2. Whether it's a "same_table" wish or "nearby" wish (keywords: "Nähe", "nähe", "neben", "in der Nähe von" = nearby)
3. Names you cannot match to any registered person

Special cases:
- "Zoe" matches "Zoe Kunanz"
- "Femke" matches "Femke Lüning"
- "Marit" — check if this matches "Marit Wolters" (she may not be registered yet)
- "Julian" matches "Julian Redetzky"
- "Hanno" — could be "Hanno Rademacher" or "Hanno Steffen", use context to disambiguate
- "Louisa" matches "Louisa Cristal"
- "Wiebke" in Joris's wish matches "Wiebke Straat"
- "Thies" matches "Thies Groenewold"
- "Zino" matches "Zino Ley"
- "Hanno Steffen" — if not in the list, mark as unresolvable

Respond with JSON in this exact format:
{
  "wishes": [
    {
      "entryId": "uuid",
      "targets": [
        { "entryId": "uuid", "wishType": "same_table", "confidence": "high" }
      ],
      "unresolvable": ["Marit"]
    }
  ]
}`;
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenceMatch ? fenceMatch[1].trim() : trimmed;
  return JSON.parse(raw);
}

function sanitizeWishes(raw: ParsedWish[], entries: Entry[]): ParsedWish[] {
  const entryIds = new Set(entries.map((e) => e.id));

  return raw
    .filter((w) => entryIds.has(w.entryId))
    .map((w) => ({
      entryId: w.entryId,
      targets: (w.targets ?? [])
        .filter(
          (t) =>
            entryIds.has(t.entryId) &&
            t.entryId !== w.entryId &&
            (t.wishType === "same_table" ||
              t.wishType === "nearby" ||
              t.wishType === "none")
        )
        .map((t) => ({
          entryId: t.entryId,
          wishType: t.wishType,
          confidence:
            t.confidence === "high" ||
            t.confidence === "medium" ||
            t.confidence === "low"
              ? t.confidence
              : "medium",
        })),
      unresolvable: Array.isArray(w.unresolvable)
        ? w.unresolvable.map(String).filter(Boolean)
        : [],
    }));
}

export async function analyzeSitzwuensche(entries: Entry[]): Promise<ParsedWish[]> {
  const withWishes = entries.filter((e) => e.sitzwunsch?.trim());
  if (withWishes.length === 0) return [];

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const client = new OpenAI({ apiKey });

  const response = await client.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 2000,
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: buildPrompt(entries) }],
  });

  const text = response.choices[0]?.message?.content ?? "";
  const parsed = extractJson(text) as AnalyzeResponse;

  if (!parsed?.wishes || !Array.isArray(parsed.wishes)) {
    throw new Error("Invalid response format from OpenAI API");
  }

  return sanitizeWishes(parsed.wishes, entries);
}
