import type { Entry } from "@/lib/supabase";
import {
  TABLE_CAPACITY,
  TABLE_CAPACITY_MAX_EXCEPTION,
  ZOLLHAUS_TABLE_COUNT,
  formatZollhausTableLabel,
  getTableCapacityForDisplay,
} from "@/lib/zollhaus-tables";

export const SEATS_PER_TABLE = TABLE_CAPACITY;

export type WishContext = {
  lookup: Map<string, Entry[]>;
};

export function buildWishContext(entries: Entry[]): WishContext {
  const lookup = new Map<string, Entry[]>();
  for (const entry of entries) {
    const wish = entry.sitzwunsch?.trim();
    lookup.set(
      entry.id,
      wish ? parseSitzwunschMentions(wish, entries, entry.id) : []
    );
  }
  return { lookup };
}

function getWishTargets(ctx: WishContext, entryId: string): Entry[] {
  return ctx.lookup.get(entryId) ?? [];
}

function entryHasPreferences(ctx: WishContext, entryId: string): boolean {
  return getWishTargets(ctx, entryId).length > 0;
}

export type AssignedTable = {
  entries: Entry[];
  seatsUsed: number;
  groupSplit?: boolean;
  manuallyResolved?: boolean;
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
};

export type EntryChipStatus = "fulfilled" | "neutral" | "conflict";

type Cluster = Entry[];

function clusterPersons(cluster: Cluster): number {
  return cluster.reduce((sum, e) => sum + e.total_persons, 0);
}

const WISH_TOKEN_PREFIXES = [
  /^mit\s+/i,
  /^bei\s+/i,
  /^(?:tisch\s+in\s+der\s+n[aä]he\s+von|in\s+der\s+n[aä]he\s+von|n[aä]he\s+von|neben)\s+/i,
];

function stripSameTablePrefixes(text: string): string {
  let result = text.trim();
  let changed = true;
  while (changed) {
    changed = false;
    for (const prefix of WISH_TOKEN_PREFIXES) {
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

/** Parse sitzwunsch tokens and match against registered entries (same-table only). */
export function parseSitzwunschMentions(
  sitzwunsch: string,
  entries: Entry[],
  excludeId?: string
): Entry[] {
  const wish = sitzwunsch.trim();
  if (!wish) return [];

  const seen = new Set<string>();
  const result: Entry[] = [];

  for (const rawToken of splitNameTokens(wish)) {
    const token = stripSameTablePrefixes(rawToken);
    if (!token) continue;
    for (const entry of matchTokenToEntries(token, entries)) {
      if (entry.id === excludeId || seen.has(entry.id)) continue;
      seen.add(entry.id);
      result.push(entry);
    }
  }

  return result;
}

export function parseSameTableMentions(
  sitzwunsch: string,
  entries: Entry[],
  excludeId?: string
): Entry[] {
  return parseSitzwunschMentions(sitzwunsch, entries, excludeId);
}

export function collectUnresolvableNames(entries: Entry[]): string[] {
  const names = new Set<string>();
  for (const entry of entries) {
    const wish = entry.sitzwunsch?.trim();
    if (!wish) continue;
    for (const rawToken of splitNameTokens(wish)) {
      const token = stripSameTablePrefixes(rawToken);
      if (!token) continue;
      if (matchTokenToEntries(token, entries).length === 0) {
        names.add(token);
      }
    }
  }
  return Array.from(names).sort();
}

function buildSameTableGraph(entries: Entry[], ctx: WishContext): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();
  const ensure = (id: string) => {
    if (!graph.has(id)) graph.set(id, new Set());
  };

  for (const entry of entries) {
    ensure(entry.id);
    for (const other of getWishTargets(ctx, entry.id)) {
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
  if (table.seatsUsed >= TABLE_CAPACITY) {
    return TABLE_CAPACITY_MAX_EXCEPTION - table.seatsUsed;
  }
  return TABLE_CAPACITY - table.seatsUsed;
}

function fitsStandardCapacity(table: AssignedTable, needed: number): boolean {
  return table.seatsUsed + needed <= TABLE_CAPACITY;
}

function fitsExceptionCapacity(table: AssignedTable, needed: number): boolean {
  return table.seatsUsed + needed <= TABLE_CAPACITY_MAX_EXCEPTION;
}

function findBestTableForCluster(
  tables: AssignedTable[],
  needed: number
): number | null {
  let bestIdx: number | null = null;
  let bestRemaining = -1;

  for (let i = 0; i < tables.length; i++) {
    if (!fitsStandardCapacity(tables[i], needed)) continue;
    const remaining = TABLE_CAPACITY - tables[i].seatsUsed;
    if (remaining > bestRemaining) {
      bestRemaining = remaining;
      bestIdx = i;
    }
  }
  if (bestIdx !== null) return bestIdx;

  bestRemaining = -1;
  for (let i = 0; i < tables.length; i++) {
    if (!fitsExceptionCapacity(tables[i], needed)) continue;
    const remaining = TABLE_CAPACITY_MAX_EXCEPTION - tables[i].seatsUsed;
    if (remaining > bestRemaining) {
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

  if (cluster.length === 1 && cluster[0].total_persons > TABLE_CAPACITY_MAX_EXCEPTION) {
    overCapacityEntries.push(cluster[0]);
    assignCluster(tables, cluster, lockTableCount);
    return;
  }

  if (persons <= TABLE_CAPACITY_MAX_EXCEPTION) {
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

  const aMentionsB = getWishTargets(wishCtx, entryA.id).some(
    (e) => e.id === entryB.id
  );
  const bMentionsA = getWishTargets(wishCtx, entryB.id).some(
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

function computeUnfulfilledWishes(
  entries: Entry[],
  tables: AssignedTable[],
  ctx: WishContext
): UnfulfilledWish[] {
  const unfulfilled: UnfulfilledWish[] = [];

  for (const entry of entries) {
    for (const wanted of getWishTargets(ctx, entry.id)) {
      if (entryOnSameTable(tables, entry, wanted)) continue;

      unfulfilled.push({
        from: entry,
        wanted,
        reason: `${entry.vorname} ${entry.nachname} wollte mit ${wanted.vorname} ${wanted.nachname} sitzen`,
        isMutualConflict: mentionsMutually(entry, wanted, entries, ctx),
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
    for (const wanted of getWishTargets(ctx, entry.id)) {
      totalWishes++;
      if (entryOnSameTable(tables, entry, wanted)) fulfilledWishes++;
    }
  }

  const fulfilledPercent =
    totalWishes === 0 ? 100 : Math.round((fulfilledWishes / totalWishes) * 100);

  return { totalWishes, fulfilledWishes, fulfilledPercent };
}

export type TableSatisfaction = "none" | "partial" | "full" | "overfull" | "conflict";

export function getTableSatisfaction(
  table: AssignedTable,
  allEntries: Entry[],
  unfulfilledWishes: UnfulfilledWish[],
  ctx?: WishContext
): TableSatisfaction {
  const wishCtx = ctx ?? buildWishContext(allEntries);
  if (table.seatsUsed > TABLE_CAPACITY_MAX_EXCEPTION) return "overfull";

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
    const mentions = getWishTargets(wishCtx, entry.id);
    if (mentions.length === 0) continue;

    hasAnyMention = true;

    for (const wanted of mentions) {
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
  overCapacityIds: Set<string>
): EntryChipStatus {
  const wishCtx = buildWishContext(allEntries);
  if (overCapacityIds.has(entry.id)) return "conflict";

  const hasMutualConflict = unfulfilledWishes.some(
    (w) =>
      w.isMutualConflict &&
      (w.from.id === entry.id || w.wanted.id === entry.id)
  );
  if (hasMutualConflict) return "conflict";

  if (!entryHasPreferences(wishCtx, entry.id)) return "neutral";

  const targets = getWishTargets(wishCtx, entry.id);
  const allOnTable = targets.every((wanted) =>
    table.entries.some((e) => e.id === wanted.id)
  );
  if (!allOnTable) return "neutral";

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

export function assignSeats(entries: Entry[]): AssignSeatsResult {
  const emptyResult: AssignSeatsResult = {
    tables: [],
    unfulfilledWishes: [],
    oversizedGroups: [],
    overCapacityEntries: [],
    stats: { totalWishes: 0, fulfilledWishes: 0, fulfilledPercent: 100 },
  };

  if (entries.length === 0) return emptyResult;

  const overCapacityEntries: Entry[] = [];
  const oversizedGroups: OversizedGroup[] = [];

  for (const entry of entries) {
    if (entry.total_persons > TABLE_CAPACITY_MAX_EXCEPTION) {
      overCapacityEntries.push(entry);
    }
  }

  const initialTableCount = ZOLLHAUS_TABLE_COUNT;
  const lockTableCount = true;

  const wishCtx = buildWishContext(entries);
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
  while (resultTables.length < ZOLLHAUS_TABLE_COUNT) {
    resultTables.push({ entries: [], seatsUsed: 0 });
  }
  resultTables = resultTables.slice(0, ZOLLHAUS_TABLE_COUNT);

  const unfulfilledWishes = computeUnfulfilledWishes(entries, resultTables, wishCtx);
  const stats = computeWishStats(entries, resultTables, wishCtx);

  return {
    tables: resultTables,
    unfulfilledWishes,
    oversizedGroups,
    overCapacityEntries: Array.from(
      new Map(overCapacityEntries.map((e) => [e.id, e])).values()
    ),
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

export function sortTables(tables: AssignedTable[]): AssignedTable[] {
  return cloneTables(tables);
}

export function sortTablesEmptyLast(tables: AssignedTable[]): AssignedTable[] {
  return sortTables(tables);
}

export function canDropEntryOnTable(table: AssignedTable, entry: Entry): boolean {
  return table.seatsUsed + entry.total_persons <= TABLE_CAPACITY_MAX_EXCEPTION;
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
  return used + entry.total_persons <= TABLE_CAPACITY_MAX_EXCEPTION;
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
  if (targetTableIdx < 0 || targetTableIdx >= tables.length) return null;

  const sourceIdx = findEntryTableIndex(tables, entryId);
  if (sourceIdx < 0) return null;
  if (sourceIdx === targetTableIdx) return cloneTables(tables);

  const cloned = cloneTables(tables);
  const entry = cloned[sourceIdx].entries.find((e) => e.id === entryId);
  if (!entry) return null;

  cloned[sourceIdx].entries = cloned[sourceIdx].entries.filter(
    (e) => e.id !== entryId
  );
  recalcTableSeats(cloned[sourceIdx]);

  cloned[targetTableIdx].entries.push(entry);
  recalcTableSeats(cloned[targetTableIdx]);
  return cloned;
}

/** Assign an entry to a table (from unassigned or another table). */
export function assignEntryToTable(
  tables: AssignedTable[],
  entry: Entry,
  targetTableIdx: number
): AssignedTable[] | null {
  if (targetTableIdx < 0 || targetTableIdx >= tables.length) return null;

  const sourceIdx = findEntryTableIndex(tables, entry.id);
  if (sourceIdx === targetTableIdx) return cloneTables(tables);

  const cloned = cloneTables(tables);
  if (sourceIdx >= 0) {
    cloned[sourceIdx].entries = cloned[sourceIdx].entries.filter(
      (e) => e.id !== entry.id
    );
    recalcTableSeats(cloned[sourceIdx]);
  }

  cloned[targetTableIdx].entries.push(entry);
  recalcTableSeats(cloned[targetTableIdx]);
  return cloned;
}

/** Remove an entry from its table back to the unassigned pool. */
export function removeEntryFromTable(
  tables: AssignedTable[],
  entryId: string
): AssignedTable[] | null {
  const sourceIdx = findEntryTableIndex(tables, entryId);
  if (sourceIdx < 0) return null;

  const cloned = cloneTables(tables);
  cloned[sourceIdx].entries = cloned[sourceIdx].entries.filter(
    (e) => e.id !== entryId
  );
  recalcTableSeats(cloned[sourceIdx]);
  return cloned;
}

export function getAssignedEntryIds(tables: AssignedTable[]): Set<string> {
  const ids = new Set<string>();
  for (const table of tables) {
    for (const entry of table.entries) ids.add(entry.id);
  }
  return ids;
}

/** Entries not placed on any table, largest groups first. */
export function getUnassignedEntries(
  entries: Entry[],
  tables: AssignedTable[]
): Entry[] {
  const assigned = getAssignedEntryIds(tables);
  return entries
    .filter((e) => !assigned.has(e.id))
    .sort((a, b) => b.total_persons - a.total_persons);
}

function normalizeTableCount(tables: AssignedTable[]): AssignedTable[] {
  if (tables.length === ZOLLHAUS_TABLE_COUNT) return tables;
  if (tables.length < ZOLLHAUS_TABLE_COUNT) {
    return [
      ...tables,
      ...Array.from({ length: ZOLLHAUS_TABLE_COUNT - tables.length }, () => ({
        entries: [],
        seatsUsed: 0,
      })),
    ];
  }
  return tables.slice(0, ZOLLHAUS_TABLE_COUNT);
}

/**
 * Sync table assignments with the current Supabase entry list:
 * refresh entry data, drop cancelled registrations, leave new entries unassigned.
 */
export function reconcileTablesWithEntries(
  tables: AssignedTable[],
  entries: Entry[]
): { tables: AssignedTable[]; changed: boolean } {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const normalized = normalizeTableCount(tables);
  let changed = normalized.length !== tables.length;

  const next = normalized.map((table) => {
    const beforeIds = table.entries.map((e) => e.id).join(",");
    const freshEntries = table.entries
      .map((e) => byId.get(e.id))
      .filter((e): e is Entry => e !== undefined);
    const seatsUsed = freshEntries.reduce((s, e) => s + e.total_persons, 0);
    const afterIds = freshEntries.map((e) => e.id).join(",");

    if (
      beforeIds !== afterIds ||
      seatsUsed !== table.seatsUsed ||
      freshEntries.some((e, i) => e !== table.entries[i])
    ) {
      changed = true;
      return { ...table, entries: freshEntries, seatsUsed };
    }
    return table;
  });

  return { tables: next, changed };
}

export function getTableFreeSeats(
  table: AssignedTable,
  excludeEntryId?: string
): number {
  let used = table.seatsUsed;
  if (excludeEntryId) {
    const excluded = table.entries.find((e) => e.id === excludeEntryId);
    if (excluded) used -= excluded.total_persons;
  }
  return Math.max(0, TABLE_CAPACITY - used);
}

export function wouldExceedTableCapacity(
  table: AssignedTable,
  entry: Entry,
  sourceTableIdx: number,
  targetTableIdx: number
): boolean {
  let used = table.seatsUsed;
  if (sourceTableIdx === targetTableIdx) used -= entry.total_persons;
  return used + entry.total_persons > TABLE_CAPACITY;
}

/** Swap full group assignments between two tables (positions/numbers stay fixed). */
export function swapTableAssignments(
  tables: AssignedTable[],
  indexA: number,
  indexB: number
): AssignedTable[] | null {
  if (indexA < 0 || indexB < 0 || indexA >= tables.length || indexB >= tables.length) {
    return null;
  }
  if (indexA === indexB) return cloneTables(tables);

  const cloned = cloneTables(tables);
  const a = cloned[indexA];
  const b = cloned[indexB];

  cloned[indexA] = {
    entries: [...b.entries],
    seatsUsed: b.seatsUsed,
    groupSplit: b.groupSplit,
    manuallyResolved: b.manuallyResolved,
  };
  cloned[indexB] = {
    entries: [...a.entries],
    seatsUsed: a.seatsUsed,
    groupSplit: a.groupSplit,
    manuallyResolved: a.manuallyResolved,
  };

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
  meta: Pick<AssignSeatsResult, "oversizedGroups" | "overCapacityEntries">
): AssignSeatsResult {
  const wishCtx = buildWishContext(entries);
  const tablesCopy = cloneTables(tables);
  const unfulfilledWishes = computeUnfulfilledWishes(entries, tablesCopy, wishCtx);
  const stats = computeWishStats(entries, tablesCopy, wishCtx);
  return {
    tables: tablesCopy,
    unfulfilledWishes,
    oversizedGroups: meta.oversizedGroups,
    overCapacityEntries: meta.overCapacityEntries,
    stats,
  };
}

export function entryWishBroken(
  entry: Entry,
  table: AssignedTable,
  allEntries: Entry[],
  allTables: AssignedTable[]
): boolean {
  const wishCtx = buildWishContext(allEntries);
  const targets = getWishTargets(wishCtx, entry.id);
  if (targets.length === 0) return false;

  return targets.some((wanted) => !entryOnSameTable(allTables, entry, wanted));
}

export function isTableOverfull(table: AssignedTable): boolean {
  return table.seatsUsed > TABLE_CAPACITY_MAX_EXCEPTION;
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
    const cap = getTableCapacityForDisplay(table.seatsUsed);
    lines.push(
      `${formatZollhausTableLabel(i)} (${table.seatsUsed}/${cap} Plätze)${splitNote}${overfullNote}:`
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
    lines.push("Wunsch nicht erfüllt:");
    for (const u of result.unfulfilledWishes) {
      lines.push(`- ${u.reason}`);
    }
  }

  return lines.join("\n").trim();
}
