export type WishType = "same_table" | "nearby" | "none";

export type WishConfidence = "high" | "medium" | "low";

export interface ParsedWish {
  entryId: string;
  targets: {
    entryId: string;
    wishType: WishType;
    confidence: WishConfidence;
  }[];
  unresolvable: string[];
}

export function collectUnresolvableNames(wishes: ParsedWish[]): string[] {
  const names = new Set<string>();
  for (const wish of wishes) {
    for (const name of wish.unresolvable) names.add(name);
  }
  return Array.from(names).sort();
}

export function entryIdsWithLowConfidence(wishes: ParsedWish[]): Set<string> {
  const ids = new Set<string>();
  for (const wish of wishes) {
    if (wish.targets.some((t) => t.confidence === "low")) {
      ids.add(wish.entryId);
    }
  }
  return ids;
}
