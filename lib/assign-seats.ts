import type { Entry } from "@/lib/supabase";
import type { ParsedWish } from "@/lib/sitzwunsch-types";

export const SEATS_PER_TABLE = 8;

export type WishPreferenceType = "same-table" | "nearby";

export type ParsedWishMention = {
  entry: Entry;
  type: WishPreferenceType;
  confidence?: "high" | "medium" | "low";
};

export type WishContext = {
  lookup: Map<string, ParsedWishMention[]>;
};

export function buildWishContext(
  entries: Entry[],
  aiWishes?: ParsedWish[]
): WishContext {
  const lookup = new Map<string, ParsedWishMention[]>();

  if (aiWishes && aiWishes.length > 0) {
    const byId = new Map(entries.map((e) => [e.id, e]));
    for (const entry of entries) lookup.set(entry.id, []);

    for (const wish of aiWishes) {
      if (!byId.has(wish.entryId)) continue;
      const mentions: ParsedWishMention[] = [];
      for (const target of wish.targets) {
        if (target.wishType === "none") continue;
        const matched = byId.get(target.entryId);
        if (!matched || target.entryId === wish.entryId) continue;
        mentions.push({
          entry: matched,
          type: target.wishType === "same_table" ? "same-table" : "nearby",
          confidence: target.confidence,
        });
      }
      lookup.set(wish.entryId, mentions);
    }
    return { lookup };
  }

  for (const entry of entries) {
    const wish = entry.sitzwunsch?.trim();
    lookup.set(
      entry.id,
      wish ? parseSitzwunschPreferences(wish, entries, entry.id) : []
    );
  }
  return { lookup };
}

function getPreferences(ctx: WishContext, entryId: string): ParsedWishMention[] {
  return ctx.lookup.get(entryId) ?? [];
}

function getSameTableTargets(ctx: WishContext, entryId: string): Entry[] {
  return getPreferences(ctx, entryId)
    .filter((p) => p.type === "same-table")
    .map((p) => p.entry);
}

function getNearbyTargets(ctx: WishContext, entryId: string): Entry[] {
  return getPreferences(ctx, entryId)
    .filter((p) => p.type === "nearby")
    .map((p) => p.entry);
}

function entryHasPreferences(ctx: WishContext, entryId: string): boolean {
  return getPreferences(ctx, entryId).length > 0;
}

export type NearbyTableLink = {
  tableIndexA: number;
  tableIndexB: number;
  fulfilled: boolean;
};

export type AssignedTable = {
  entries: Entry[];
  seatsUsed: number;
  groupSplit?: boolean;
  manuallyResolved?: boolean;
  /** True when this table is linked to the next table in display order via nearby preference. */
  nearbyLinkNext?: boolean;
};

export type OversizedGroup = {
  entries: Entry[];
  names: string;
};

export type AssignSeatsResult = {
  tables: AssignedTable[];
  unfulfilledWishes: UnfulfilledWish[];
  oversizedGroups: OversizedGroup[];
  overCapacityEntries: Entry[];
  nearbyTableLinks: NearbyTableLink[];
  stats: {
    totalWishes: number;
    fulfilledWishes: number;
    fulfilledPercent: number;
  };
};

export type UnfulfilledWish = {
  from: Entry;
  wanted: Entry;
  reason: string;
  /** True only when both entries wished to sit together but were placed apart. */
  isMutualConflict: boolean;
  preferenceType: WishPreferenceType;
};

export type EntryChipStatus = "fulfilled" | "nearby-fulfilled" | "neutral" | "conflict";

type Cluster = Entry[];

function clusterPersons(cluster: Cluster): number {
  return cluster.reduce((sum, e) => sum + e.total_persons, 0);
}

const SAME_TABLE_PREFIXES = [/^mit\s+/i, /^bei\s+/i];

const NEARBY_SECTION_REGEX =
  /(?:tisch\s+in\s+der\s+n[aä]he\s+von|in\s+der\s+n[aä]he\s+von|\bn[aä]he\s+von|\bneben)\s*([^.;]+)/gi;

function stripSameTablePrefixes(text: string): string {
  let result = text.trim();
  let changed = true;
  while (changed) {
    changed = false;
    for (const prefix of SAME_TABLE_PREFIXES) {
      const next = result.replace(prefix, "").trim();
      if (next !== result) {
        result = next;
        changed = true;
      }
    }
  }
  return result;
}

function splitNameTokens(text: string): string[] {
  return text
    .split(/\s*,\s*|\s+und\s+|\s*&\s*/i)
    .map((t) => t.trim())
    .filter(Boolean);
}

function entryFullName(entry: Entry): string {
  return `${entry.vorname} ${entry.nachname}`.trim().toLowerCase();
}

function matchTokenToEntries(token: string, entries: Entry[]): Entry[] {
  const t = token.trim().toLowerCase();
  if (!t) return [];

  const matches: Entry[] = [];
  for (const entry of entries) {
    const full = entryFullName(entry);
    const first = entry.vorname.trim().toLowerCase();
    const last = entry.nachname.trim().toLowerCase();

    const matched =
      full === t ||
      first === t ||
      last === t ||
      (t.length > 3 && (full.includes(t) || first.includes(t) || last.includes(t)));

    if (matched) matches.push(entry);
  }
  return matches;
}

/** Parse sitzwunsch into same-table vs nearby preferences. Same-table overrides nearby. */
export function parseSitzwunschPreferences(
  sitzwunsch: string,
  entries: Entry[],
  excludeId?: string
): ParsedWishMention[] {
  const wish = sitzwunsch.trim();
  if (!wish) return [];

  const byType = new Map<string, WishPreferenceType>();
  const nearbySections: string[] = [];
  const regex = new RegExp(NEARBY_SECTION_REGEX.source, "gi");
  let match: RegExpExecArray | null;
  while ((match = regex.exec(wish)) !== null) {
    nearbySections.push(match[1].trim());
  }
  const remaining = wish.replace(regex, " ").replace(/\s+/g, " ").trim();

  for (const section of nearbySections) {
    for (const token of splitNameTokens(section)) {
      for (const entry of matchTokenToEntries(token, entries)) {
        if (entry.id === excludeId) continue;
        if (!byType.has(entry.id)) byType.set(entry.id, "nearby");
      }
    }
  }

  for (const token of splitNameTokens(stripSameTablePrefixes(remaining))) {
    for (const entry of matchTokenToEntries(token, entries)) {
      if (entry.id === excludeId) continue;
      byType.set(entry.id, "same-table");
    }
  }

  const byId = new Map(entries.map((e) => [e.id, e]));
  return Array.from(byType.entries())
    .map(([id, type]) => {
      const entry = byId.get(id);
      return entry ? { entry, type } : null;
    })
    .filter((p): p is ParsedWishMention => p !== null);
}

export function parseSameTableMentions(
  sitzwunsch: string,
  entries: Entry[],
  excludeId?: string
): Entry[] {
  return parseSitzwunschPreferences(sitzwunsch, entries, excludeId)
    .filter((p) => p.type === "same-table")
    .map((p) => p.entry);
}

export function parseNearbyMentions(
  sitzwunsch: string,
  entries: Entry[],
  excludeId?: string
): Entry[] {
  return parseSitzwunschPreferences(sitzwunsch, entries, excludeId)
    .filter((p) => p.type === "nearby")
    .map((p) => p.entry);
}

/** Match sitzwunsch text against registered entries; return all mentioned entries. */
export function parseSitzwunschMentions(
  sitzwunsch: string,
  entries: Entry[],
  excludeId?: string
): Entry[] {
  return parseSitzwunschPreferences(sitzwunsch, entries, excludeId).map((p) => p.entry);
}

function buildSameTableGraph(entries: Entry[], ctx: WishContext): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();
  const ensure = (id: string) => {
    if (!graph.has(id)) graph.set(id, new Set());
  };

  for (const entry of entries) {
    ensure(entry.id);
    for (const other of getSameTableTargets(ctx, entry.id)) {
      ensure(other.id);
      graph.get(entry.id)!.add(other.id);
      graph.get(other.id)!.add(entry.id);
    }
  }

  return graph;
}

function connectedComponents(entries: Entry[], graph: Map<string, Set<string>>): Cluster[] {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const visited = new Set<string>();
  const clusters: Cluster[] = [];

  for (const entry of entries) {
    if (visited.has(entry.id)) continue;

    const stack = [entry.id];
    const cluster: Cluster = [];

    while (stack.length > 0) {
      const id = stack.pop()!;
      if (visited.has(id)) continue;
      visited.add(id);
      const e = byId.get(id);
      if (e) cluster.push(e);
      for (const neighbor of Array.from(graph.get(id) ?? [])) {
        if (!visited.has(neighbor)) stack.push(neighbor);
      }
    }

    clusters.push(cluster);
  }

  return clusters;
}

function countCrossPreferences(
  groupA: Cluster,
  groupB: Cluster,
  graph: Map<string, Set<string>>
): number {
  let cross = 0;
  for (const a of groupA) {
    for (const b of groupB) {
      if (graph.get(a.id)?.has(b.id)) cross++;
    }
  }
  return cross;
}

/** Split cluster at the break with fewest cross-preferences between sub-groups. */
function splitClusterOptimal(
  cluster: Cluster,
  graph: Map<string, Set<string>>
): [Cluster, Cluster] {
  const n = cluster.length;
  if (n <= 1) return [cluster, []];

  let bestA: Cluster = [cluster[0]];
  let bestB: Cluster = cluster.slice(1);
  let minCross = countCrossPreferences(bestA, bestB, graph);

  for (let mask = 1; mask < (1 << n) - 1; mask++) {
    const groupA: Cluster = [];
    const groupB: Cluster = [];
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) groupA.push(cluster[i]);
      else groupB.push(cluster[i]);
    }
    if (groupA.length === 0 || groupB.length === 0) continue;

    const cross = countCrossPreferences(groupA, groupB, graph);
    if (cross < minCross) {
      minCross = cross;
      bestA = groupA;
      bestB = groupB;
    }
  }

  return [bestA, bestB];
}

function splitUntilFits(
  cluster: Cluster,
  graph: Map<string, Set<string>>
): Cluster[] {
  const queue: Cluster[] = [cluster];
  const result: Cluster[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (clusterPersons(current) <= SEATS_PER_TABLE || current.length <= 1) {
      result.push(current);
      continue;
    }
    const [partA, partB] = splitClusterOptimal(current, graph);
    queue.unshift(partB, partA);
  }

  return result;
}

function isNeutralCluster(cluster: Cluster, ctx: WishContext): boolean {
  return cluster.every((e) => !entryHasPreferences(ctx, e.id));
}

function createEmptyTables(count: number): AssignedTable[] {
  return Array.from({ length: Math.max(count, 1) }, () => ({
    entries: [],
    seatsUsed: 0,
  }));
}

function tableRemaining(table: AssignedTable): number {
  return SEATS_PER_TABLE - table.seatsUsed;
}

function findBestTableForCluster(
  tables: AssignedTable[],
  needed: number
): number | null {
  let bestIdx: number | null = null;
  let bestRemaining = -1;

  for (let i = 0; i < tables.length; i++) {
    const remaining = tableRemaining(tables[i]);
    if (remaining >= needed && remaining > bestRemaining) {
      bestRemaining = remaining;
      bestIdx = i;
    }
  }

  return bestIdx;
}

function assignClusterToTable(
  tables: AssignedTable[],
  cluster: Cluster,
  tableIdx: number
) {
  tables[tableIdx].entries.push(...cluster);
  tables[tableIdx].seatsUsed += clusterPersons(cluster);
}

function findTableForCluster(
  tables: AssignedTable[],
  needed: number,
  lockTableCount: boolean
): number {
  const fit = findBestTableForCluster(tables, needed);
  if (fit !== null) return fit;

  if (lockTableCount && tables.length > 0) {
    let bestIdx = 0;
    let bestRemaining = -Infinity;
    for (let i = 0; i < tables.length; i++) {
      const remaining = tableRemaining(tables[i]);
      if (remaining > bestRemaining) {
        bestRemaining = remaining;
        bestIdx = i;
      }
    }
    return bestIdx;
  }

  return tables.length;
}

function assignCluster(
  tables: AssignedTable[],
  cluster: Cluster,
  lockTableCount: boolean
) {
  const needed = clusterPersons(cluster);
  let tableIdx = findBestTableForCluster(tables, needed);

  if (tableIdx === null) {
    if (lockTableCount) {
      tableIdx = findTableForCluster(tables, needed, true);
    } else {
      tables.push({ entries: [], seatsUsed: 0 });
      tableIdx = tables.length - 1;
    }
  }

  assignClusterToTable(tables, cluster, tableIdx);
}

function assignClusterPartsAdjacent(
  tables: AssignedTable[],
  parts: Cluster[],
  lockTableCount: boolean
) {
  if (parts.length === 0) return;

  let startIdx = findBestTableForCluster(tables, clusterPersons(parts[0]));
  if (startIdx === null) {
    startIdx = lockTableCount
      ? findTableForCluster(tables, clusterPersons(parts[0]), true)
      : tables.length;
    if (!lockTableCount) tables.push({ entries: [], seatsUsed: 0 });
  }

  for (let i = 0; i < parts.length; i++) {
    let targetIdx = startIdx + i;
    if (lockTableCount) {
      if (targetIdx >= tables.length) targetIdx = tables.length - 1;
    } else {
      while (targetIdx >= tables.length) {
        tables.push({ entries: [], seatsUsed: 0 });
      }
    }

    assignClusterToTable(tables, parts[i], targetIdx);
    if (parts.length > 1) tables[targetIdx].groupSplit = true;
  }
}

function assignLargePreferenceCluster(
  tables: AssignedTable[],
  cluster: Cluster,
  graph: Map<string, Set<string>>,
  oversizedGroups: OversizedGroup[],
  overCapacityEntries: Entry[],
  lockTableCount: boolean
) {
  const persons = clusterPersons(cluster);

  if (cluster.length === 1 && cluster[0].total_persons > SEATS_PER_TABLE) {
    overCapacityEntries.push(cluster[0]);
    assignCluster(tables, cluster, lockTableCount);
    return;
  }

  if (persons <= SEATS_PER_TABLE) {
    assignCluster(tables, cluster, lockTableCount);
    return;
  }

  oversizedGroups.push({
    entries: cluster,
    names: cluster.map((e) => `${e.vorname} ${e.nachname}`).join(", "),
  });
  const parts = splitUntilFits(cluster, graph);
  assignClusterPartsAdjacent(tables, parts, lockTableCount);
}

function assignNeutralEntries(
  tables: AssignedTable[],
  neutrals: Entry[],
  lockTableCount: boolean
) {
  const sorted = [...neutrals].sort((a, b) => b.total_persons - a.total_persons);

  for (const entry of sorted) {
    const needed = entry.total_persons;
    let tableIdx = findBestTableForCluster(tables, needed);

    if (tableIdx === null) {
      if (lockTableCount) {
        tableIdx = findTableForCluster(tables, needed, true);
      } else {
        tables.push({ entries: [], seatsUsed: 0 });
        tableIdx = tables.length - 1;
      }
    }

    assignClusterToTable(tables, [entry], tableIdx);
  }
}

export function mentionsMutually(
  entryA: Entry,
  entryB: Entry,
  allEntries?: Entry[],
  ctx?: WishContext
): boolean {
  const entries = allEntries ?? [entryA, entryB];
  const wishCtx = ctx ?? buildWishContext(entries);

  const aMentionsB = getSameTableTargets(wishCtx, entryA.id).some(
    (e) => e.id === entryB.id
  );
  const bMentionsA = getSameTableTargets(wishCtx, entryB.id).some(
    (e) => e.id === entryA.id
  );

  return aMentionsB && bMentionsA;
}

export function entryOnSameTable(
  tables: AssignedTable[],
  entryA: Entry,
  entryB: Entry
): boolean {
  return tables.some(
    (t) =>
      t.entries.some((e) => e.id === entryA.id) &&
      t.entries.some((e) => e.id === entryB.id)
  );
}

export function areTablesAdjacent(
  tables: AssignedTable[],
  entryA: Entry,
  entryB: Entry
): boolean {
  const idxA = findEntryTableIndex(tables, entryA.id);
  const idxB = findEntryTableIndex(tables, entryB.id);
  if (idxA < 0 || idxB < 0) return false;
  return Math.abs(idxA - idxB) === 1;
}

export function isNearbyWishFulfilled(
  tables: AssignedTable[],
  from: Entry,
  wanted: Entry
): boolean {
  if (entryOnSameTable(tables, from, wanted)) return true;
  return areTablesAdjacent(tables, from, wanted);
}

export function isWishFulfilled(
  tables: AssignedTable[],
  from: Entry,
  wanted: Entry,
  type: WishPreferenceType
): boolean {
  if (type === "same-table") return entryOnSameTable(tables, from, wanted);
  return isNearbyWishFulfilled(tables, from, wanted);
}

function computeUnfulfilledWishes(
  entries: Entry[],
  tables: AssignedTable[],
  ctx: WishContext
): UnfulfilledWish[] {
  const unfulfilled: UnfulfilledWish[] = [];

  for (const entry of entries) {
    for (const { entry: wanted, type } of getPreferences(ctx, entry.id)) {
      if (isWishFulfilled(tables, entry, wanted, type)) continue;

      unfulfilled.push({
        from: entry,
        wanted,
        reason:
          type === "nearby"
            ? `${entry.vorname} ${entry.nachname} wollte in der Nähe von ${wanted.vorname} ${wanted.nachname} sitzen`
            : `${entry.vorname} ${entry.nachname} wollte mit ${wanted.vorname} ${wanted.nachname} sitzen`,
        isMutualConflict:
          type === "same-table" &&
          mentionsMutually(entry, wanted, entries, ctx),
        preferenceType: type,
      });
    }
  }

  return unfulfilled;
}

function computeWishStats(
  entries: Entry[],
  tables: AssignedTable[],
  ctx: WishContext
): AssignSeatsResult["stats"] {
  let totalWishes = 0;
  let fulfilledWishes = 0;

  for (const entry of entries) {
    for (const { entry: wanted, type } of getPreferences(ctx, entry.id)) {
      totalWishes++;
      if (isWishFulfilled(tables, entry, wanted, type)) fulfilledWishes++;
    }
  }

  const fulfilledPercent =
    totalWishes === 0 ? 100 : Math.round((fulfilledWishes / totalWishes) * 100);

  return { totalWishes, fulfilledWishes, fulfilledPercent };
}

function computeNearbyTableLinks(
  entries: Entry[],
  tables: AssignedTable[],
  ctx: WishContext
): NearbyTableLink[] {
  const links: NearbyTableLink[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    for (const target of getNearbyTargets(ctx, entry.id)) {
      const idxA = findEntryTableIndex(tables, entry.id);
      const idxB = findEntryTableIndex(tables, target.id);
      if (idxA < 0 || idxB < 0) continue;

      const lo = Math.min(idxA, idxB);
      const hi = Math.max(idxA, idxB);
      const key = `${lo}:${hi}`;
      if (seen.has(key)) continue;
      seen.add(key);

      links.push({
        tableIndexA: lo,
        tableIndexB: hi,
        fulfilled: Math.abs(idxA - idxB) === 1 || entryOnSameTable(tables, entry, target),
      });
    }
  }

  return links;
}

function markNearbyLinkNext(tables: AssignedTable[], links: NearbyTableLink[]): void {
  for (const table of tables) {
    table.nearbyLinkNext = false;
  }
  for (const link of links) {
    if (link.fulfilled && link.tableIndexB === link.tableIndexA + 1) {
      tables[link.tableIndexA].nearbyLinkNext = true;
    }
  }
}

function optimizeNearbyTableOrder(
  tables: AssignedTable[],
  entries: Entry[],
  ctx: WishContext
): AssignedTable[] {
  const result = cloneTables(tables);

  for (const entry of entries) {
    for (const target of getNearbyTargets(ctx, entry.id)) {
      if (isNearbyWishFulfilled(result, entry, target)) continue;

      const idxA = findEntryTableIndex(result, entry.id);
      const idxB = findEntryTableIndex(result, target.id);
      if (idxA < 0 || idxB < 0 || Math.abs(idxA - idxB) === 1) continue;

      const wantIdx = idxA < idxB ? idxA + 1 : idxA - 1;
      if (wantIdx < 0 || wantIdx >= result.length) continue;

      const tmp = result[wantIdx];
      result[wantIdx] = result[idxB];
      result[idxB] = tmp;
    }
  }

  return result;
}

export type TableSatisfaction = "none" | "partial" | "full" | "overfull" | "conflict";

export function getTableSatisfaction(
  table: AssignedTable,
  allEntries: Entry[],
  unfulfilledWishes: UnfulfilledWish[],
  ctx?: WishContext
): TableSatisfaction {
  const wishCtx = ctx ?? buildWishContext(allEntries);
  if (table.seatsUsed > SEATS_PER_TABLE) return "overfull";

  const hasConflictOnTable = unfulfilledWishes.some(
    (w) =>
      w.isMutualConflict &&
      (table.entries.some((e) => e.id === w.from.id) ||
        table.entries.some((e) => e.id === w.wanted.id))
  );
  if (hasConflictOnTable) return "conflict";

  const withWish = table.entries.filter((e) => entryHasPreferences(wishCtx, e.id));
  if (withWish.length === 0) return "none";

  let hasAnyMention = false;
  let allOnSameTable = true;

  for (const entry of withWish) {
    const sameTableMentions = getSameTableTargets(wishCtx, entry.id);
    if (sameTableMentions.length === 0) continue;

    hasAnyMention = true;

    for (const wanted of sameTableMentions) {
      const onTable = table.entries.some((e) => e.id === wanted.id);
      if (!onTable) allOnSameTable = false;
    }
  }

  if (!hasAnyMention) return "none";
  if (allOnSameTable) return "full";
  return "partial";
}

export function getEntryChipStatus(
  entry: Entry,
  table: AssignedTable,
  allEntries: Entry[],
  allTables: AssignedTable[],
  unfulfilledWishes: UnfulfilledWish[],
  overCapacityIds: Set<string>,
  aiWishes?: ParsedWish[]
): EntryChipStatus {
  const wishCtx = buildWishContext(allEntries, aiWishes);
  if (overCapacityIds.has(entry.id)) return "conflict";

  const hasMutualConflict = unfulfilledWishes.some(
    (w) =>
      w.isMutualConflict &&
      (w.from.id === entry.id || w.wanted.id === entry.id)
  );
  if (hasMutualConflict) return "conflict";

  if (!entryHasPreferences(wishCtx, entry.id)) return "neutral";

  const preferences = getPreferences(wishCtx, entry.id);
  const sameTable = preferences.filter((p) => p.type === "same-table");
  const nearby = preferences.filter((p) => p.type === "nearby");

  const sameTableOk = sameTable.every((p) =>
    table.entries.some((e) => e.id === p.entry.id)
  );
  if (!sameTableOk) return "neutral";

  const nearbyOk = nearby.every((p) =>
    isNearbyWishFulfilled(allTables, entry, p.entry)
  );
  if (!nearbyOk) return "neutral";

  const nearbyViaAdjacency = nearby.some(
    (p) =>
      !entryOnSameTable(allTables, entry, p.entry) &&
      areTablesAdjacent(allTables, entry, p.entry)
  );

  if (nearbyViaAdjacency && nearby.length > 0) return "nearby-fulfilled";
  return "fulfilled";
}

export function abbreviateName(entry: Entry): string {
  return `${entry.vorname} ${entry.nachname.charAt(0)}.`;
}

export type SeatGroup =
  | { type: "occupied"; entry: Entry; guestLabels: string[] }
  | { type: "empty" };

export function buildSeatGroups(table: AssignedTable): SeatGroup[] {
  const groups: SeatGroup[] = [];

  for (const entry of table.entries) {
    const guestCount = entry.total_persons - 1;
    const guestLabels: string[] = [];
    if (entry.guests?.length) {
      for (let i = 0; i < guestCount; i++) {
        guestLabels.push(entry.guests[i] ?? `Begleitung ${i + 1}`);
      }
    } else {
      for (let i = 0; i < guestCount; i++) {
        guestLabels.push(`Begleitung ${i + 1}`);
      }
    }
    groups.push({ type: "occupied", entry, guestLabels });
  }

  const emptyCount = Math.max(0, SEATS_PER_TABLE - table.seatsUsed);
  for (let i = 0; i < emptyCount; i++) {
    groups.push({ type: "empty" });
  }

  return groups;
}

export function assignSeats(
  entries: Entry[],
  options?: { fixedTableCount?: number; aiWishes?: ParsedWish[] }
): AssignSeatsResult {
  const emptyResult: AssignSeatsResult = {
    tables: [],
    unfulfilledWishes: [],
    oversizedGroups: [],
    overCapacityEntries: [],
    nearbyTableLinks: [],
    stats: { totalWishes: 0, fulfilledWishes: 0, fulfilledPercent: 100 },
  };

  if (entries.length === 0) return emptyResult;

  const overCapacityEntries: Entry[] = [];
  const oversizedGroups: OversizedGroup[] = [];

  for (const entry of entries) {
    if (entry.total_persons > SEATS_PER_TABLE) {
      overCapacityEntries.push(entry);
    }
  }

  const totalPersons = entries.reduce((sum, e) => sum + e.total_persons, 0);
  const autoTableCount = Math.ceil(totalPersons / SEATS_PER_TABLE);
  const fixedCount = options?.fixedTableCount;
  const initialTableCount = fixedCount ?? autoTableCount;
  const lockTableCount = fixedCount !== undefined && fixedCount > 0;

  const wishCtx = buildWishContext(entries, options?.aiWishes);
  const graph = buildSameTableGraph(entries, wishCtx);
  const clusters = connectedComponents(entries, graph);

  const preferenceClusters = clusters.filter((c) => !isNeutralCluster(c, wishCtx));
  const neutralEntries = clusters
    .filter((c) => isNeutralCluster(c, wishCtx))
    .flat()
    .sort((a, b) => b.total_persons - a.total_persons);

  preferenceClusters.sort((a, b) => clusterPersons(b) - clusterPersons(a));

  const tables = createEmptyTables(initialTableCount);

  for (const cluster of preferenceClusters) {
    assignLargePreferenceCluster(
      tables,
      cluster,
      graph,
      oversizedGroups,
      overCapacityEntries,
      lockTableCount
    );
  }

  assignNeutralEntries(tables, neutralEntries, lockTableCount);

  let resultTables = tables;
  if (lockTableCount) {
    while (resultTables.length < fixedCount!) {
      resultTables.push({ entries: [], seatsUsed: 0 });
    }
    resultTables = resultTables.slice(0, fixedCount);
  } else {
    resultTables = tables.filter((t) => t.entries.length > 0);
  }

  resultTables = optimizeNearbyTableOrder(resultTables, entries, wishCtx);
  const nearbyTableLinks = computeNearbyTableLinks(entries, resultTables, wishCtx);
  markNearbyLinkNext(resultTables, nearbyTableLinks);

  const unfulfilledWishes = computeUnfulfilledWishes(entries, resultTables, wishCtx);
  const stats = computeWishStats(entries, resultTables, wishCtx);

  return {
    tables: resultTables,
    unfulfilledWishes,
    oversizedGroups,
    overCapacityEntries: Array.from(
      new Map(overCapacityEntries.map((e) => [e.id, e])).values()
    ),
    nearbyTableLinks,
    stats,
  };
}

export function formatEntryLabel(entry: Entry): string {
  const guests = entry.total_persons - 1;
  const base = `${entry.vorname} ${entry.nachname}`;
  if (guests === 1) return `${base} + 1 Begleitung`;
  if (guests > 1) return `${base} + ${guests} Begleitungen`;
  return base;
}

export function hasNoSitzwunsch(entry: Entry): boolean {
  return !entry.sitzwunsch?.trim();
}

export function cloneTables(tables: AssignedTable[]): AssignedTable[] {
  return tables.map((t) => ({
    entries: [...t.entries],
    seatsUsed: t.seatsUsed,
    groupSplit: t.groupSplit,
    manuallyResolved: t.manuallyResolved,
    nearbyLinkNext: t.nearbyLinkNext,
  }));
}

export function recalcTableSeats(table: AssignedTable): void {
  table.seatsUsed = table.entries.reduce((sum, e) => sum + e.total_persons, 0);
}

export function recalcAllTableSeats(tables: AssignedTable[]): void {
  for (const table of tables) recalcTableSeats(table);
}

export function buildAssignmentMap(tables: AssignedTable[]): Map<string, number> {
  const map = new Map<string, number>();
  tables.forEach((t, i) => {
    for (const e of t.entries) map.set(e.id, i);
  });
  return map;
}

/** Table composition signature — stable when empty tables are reordered to the bottom. */
export function buildTableSignature(table: AssignedTable): string {
  return table.entries
    .map((e) => e.id)
    .sort()
    .join(",");
}

export function buildAssignmentSignatures(
  tables: AssignedTable[]
): Map<string, string> {
  const map = new Map<string, string>();
  for (const table of tables) {
    const sig = buildTableSignature(table);
    for (const e of table.entries) map.set(e.id, sig);
  }
  return map;
}

export type TableSortMode = "default" | "seats-asc" | "seats-desc";

export function sortTables(
  tables: AssignedTable[],
  mode: TableSortMode
): AssignedTable[] {
  const occupied = tables.filter((t) => t.entries.length > 0);
  const empty = tables.filter((t) => t.entries.length === 0);

  if (mode === "default") {
    return [...occupied, ...empty];
  }

  const sorted = [...occupied].sort((a, b) =>
    mode === "seats-asc" ? a.seatsUsed - b.seatsUsed : b.seatsUsed - a.seatsUsed
  );
  return [...sorted, ...empty];
}

export function sortTablesEmptyLast(tables: AssignedTable[]): AssignedTable[] {
  return sortTables(tables, "default");
}

export function canDropEntryOnTable(table: AssignedTable, entry: Entry): boolean {
  return table.seatsUsed + entry.total_persons <= SEATS_PER_TABLE;
}

export function canDropEntryOnTableExcluding(
  tables: AssignedTable[],
  targetTableIdx: number,
  entry: Entry,
  sourceTableIdx: number
): boolean {
  const target = tables[targetTableIdx];
  if (!target) return false;
  let used = target.seatsUsed;
  if (sourceTableIdx === targetTableIdx) used -= entry.total_persons;
  return used + entry.total_persons <= SEATS_PER_TABLE;
}

export function findEntryTableIndex(
  tables: AssignedTable[],
  entryId: string
): number {
  return tables.findIndex((t) => t.entries.some((e) => e.id === entryId));
}

export function syncManualEntryIds(
  tables: AssignedTable[],
  baseSignatures: Map<string, string>
): Set<string> {
  const currentSignatures = buildAssignmentSignatures(tables);
  const manual = new Set<string>();

  for (const [id, sig] of Array.from(currentSignatures.entries())) {
    const baseSig = baseSignatures.get(id);
    if (baseSig !== undefined && baseSig !== sig) manual.add(id);
  }

  return manual;
}

export function moveEntryToTable(
  tables: AssignedTable[],
  entryId: string,
  targetTableIdx: number
): AssignedTable[] | null {
  const cloned = cloneTables(tables);
  let entry: Entry | null = null;
  let sourceIdx = -1;

  for (let i = 0; i < cloned.length; i++) {
    const idx = cloned[i].entries.findIndex((e) => e.id === entryId);
    if (idx !== -1) {
      entry = cloned[i].entries[idx];
      sourceIdx = i;
      cloned[i].entries.splice(idx, 1);
      recalcTableSeats(cloned[i]);
      break;
    }
  }

  if (!entry || targetTableIdx < 0 || targetTableIdx >= cloned.length) return null;
  if (sourceIdx === targetTableIdx) return cloned;

  cloned[targetTableIdx].entries.push(entry);
  recalcTableSeats(cloned[targetTableIdx]);
  return cloned;
}

export function fisherYatesShuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function shuffleNeutralEntries(tables: AssignedTable[]): AssignedTable[] {
  const cloned = cloneTables(tables);
  const neutrals: Entry[] = [];

  for (const table of cloned) {
    table.entries = table.entries.filter((e) => {
      if (hasNoSitzwunsch(e)) {
        neutrals.push(e);
        return false;
      }
      return true;
    });
    recalcTableSeats(table);
  }

  const shuffled = fisherYatesShuffle(neutrals);

  for (const entry of shuffled) {
    const needed = entry.total_persons;
    let bestIdx = -1;
    let bestRemaining = -1;

    for (let i = 0; i < cloned.length; i++) {
      const rem = tableRemaining(cloned[i]);
      if (rem >= needed && rem > bestRemaining) {
        bestRemaining = rem;
        bestIdx = i;
      }
    }

    if (bestIdx === -1) {
      for (let i = 0; i < cloned.length; i++) {
        const rem = tableRemaining(cloned[i]);
        if (rem > bestRemaining) {
          bestRemaining = rem;
          bestIdx = i;
        }
      }
    }

    if (bestIdx >= 0) {
      cloned[bestIdx].entries.push(entry);
      recalcTableSeats(cloned[bestIdx]);
    }
  }

  return cloned;
}

export function buildResultFromTables(
  entries: Entry[],
  tables: AssignedTable[],
  meta: Pick<AssignSeatsResult, "oversizedGroups" | "overCapacityEntries">,
  aiWishes?: ParsedWish[]
): AssignSeatsResult {
  const wishCtx = buildWishContext(entries, aiWishes);
  const tablesWithLinks = cloneTables(tables);
  const nearbyTableLinks = computeNearbyTableLinks(entries, tablesWithLinks, wishCtx);
  markNearbyLinkNext(tablesWithLinks, nearbyTableLinks);
  const unfulfilledWishes = computeUnfulfilledWishes(entries, tablesWithLinks, wishCtx);
  const stats = computeWishStats(entries, tablesWithLinks, wishCtx);
  return {
    tables: tablesWithLinks,
    unfulfilledWishes,
    oversizedGroups: meta.oversizedGroups,
    overCapacityEntries: meta.overCapacityEntries,
    nearbyTableLinks,
    stats,
  };
}

export function entryWishBroken(
  entry: Entry,
  table: AssignedTable,
  allEntries: Entry[],
  allTables: AssignedTable[],
  aiWishes?: ParsedWish[]
): boolean {
  const wishCtx = buildWishContext(allEntries, aiWishes);
  const preferences = getPreferences(wishCtx, entry.id);
  if (preferences.length === 0) return false;

  return preferences.some(
    (p) => !isWishFulfilled(allTables, entry, p.entry, p.type)
  );
}

export function isTableOverfull(table: AssignedTable): boolean {
  return table.seatsUsed > SEATS_PER_TABLE;
}

export function exportSeatingPlan(
  result: AssignSeatsResult,
  manualEntryIds?: Set<string>
): string {
  if (result.tables.length === 0) return "Keine Anmeldungen vorhanden.";

  const lines: string[] = [];

  result.tables.forEach((table, i) => {
    const splitNote = table.groupSplit ? " [Gruppe aufgeteilt]" : "";
    const overfullNote = isTableOverfull(table) ? " ⚠ ÜBERFÜLLT" : "";
    lines.push(
      `Tisch ${i + 1} (${table.seatsUsed}/${SEATS_PER_TABLE} Plätze)${splitNote}${overfullNote}:`
    );
    for (const entry of table.entries) {
      const wish = entry.sitzwunsch?.trim();
      const label = formatEntryLabel(entry);
      const manualNote = manualEntryIds?.has(entry.id) ? " (manuell)" : "";
      lines.push(
        wish
          ? `- ${label}${manualNote} | Sitzwunsch: ${wish}`
          : `- ${label}${manualNote}`
      );
    }
    lines.push("");
  });

  if (result.oversizedGroups.length > 0) {
    lines.push("Zu große Gruppen (aufgeteilt):");
    for (const g of result.oversizedGroups) {
      lines.push(`- ${g.names}`);
    }
    lines.push("");
  }

  if (result.overCapacityEntries.length > 0) {
    lines.push("Einzelanmeldungen über Tischkapazität:");
    for (const e of result.overCapacityEntries) {
      lines.push(`- ${formatEntryLabel(e)} (${e.total_persons} Personen)`);
    }
    lines.push("");
  }

  if (result.unfulfilledWishes.length > 0) {
    const sameTableUnfulfilled = result.unfulfilledWishes.filter(
      (u) => u.preferenceType === "same-table"
    );
    const nearbyUnfulfilled = result.unfulfilledWishes.filter(
      (u) => u.preferenceType === "nearby"
    );

    if (sameTableUnfulfilled.length > 0) {
      lines.push("Wunsch nicht erfüllt:");
      for (const u of sameTableUnfulfilled) {
        lines.push(`- ${u.reason}`);
      }
      lines.push("");
    }

    if (nearbyUnfulfilled.length > 0) {
      lines.push("Nähe nicht erfüllt:");
      for (const u of nearbyUnfulfilled) {
        lines.push(`- ${u.reason}`);
      }
    }
  }

  return lines.join("\n").trim();
}
