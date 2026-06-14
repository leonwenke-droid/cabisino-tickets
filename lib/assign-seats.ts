import { ALLOWED_NAMES } from "@/lib/allowed-names";
import type { Entry } from "@/lib/supabase";

export const SEATS_PER_TABLE = 8;

export type AssignedTable = {
  entries: Entry[];
  seatsUsed: number;
  groupSplit?: boolean;
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
};

export type EntryChipStatus = "fulfilled" | "neutral" | "conflict";

type Cluster = Entry[];

function clusterPersons(cluster: Cluster): number {
  return cluster.reduce((sum, e) => sum + e.total_persons, 0);
}

function findEntryByAllowedName(name: string, entries: Entry[]): Entry | undefined {
  const normalizedName = name.trim().toLowerCase();
  return entries.find(
    (e) => `${e.vorname} ${e.nachname}`.trim().toLowerCase() === normalizedName
  );
}

/** Match sitzwunsch text against ALLOWED_NAMES; return corresponding entries. */
export function parseSitzwunschMentions(
  sitzwunsch: string,
  entries: Entry[],
  excludeId?: string
): Entry[] {
  const wish = sitzwunsch.toLowerCase();
  const matched: Entry[] = [];
  const seen = new Set<string>();

  for (const name of ALLOWED_NAMES) {
    const parts = name.trim().split(/\s+/);
    const first = parts[0]?.toLowerCase() ?? "";
    const last = parts.slice(1).join(" ").toLowerCase();
    const full = name.toLowerCase();

    const nameMatches =
      (full.length > 0 && wish.includes(full)) ||
      (first.length > 1 && wish.includes(first)) ||
      (last.length > 2 && wish.includes(last));

    if (!nameMatches) continue;

    const entry = findEntryByAllowedName(name, entries);
    if (!entry || entry.id === excludeId || seen.has(entry.id)) continue;

    matched.push(entry);
    seen.add(entry.id);
  }

  return matched;
}

function buildPreferenceGraph(entries: Entry[]): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();
  const ensure = (id: string) => {
    if (!graph.has(id)) graph.set(id, new Set());
  };

  for (const entry of entries) {
    ensure(entry.id);
    const wish = entry.sitzwunsch?.trim();
    if (!wish) continue;

    const mentioned = parseSitzwunschMentions(wish, entries, entry.id);
    for (const other of mentioned) {
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

function isNeutralCluster(cluster: Cluster): boolean {
  return cluster.every((e) => !e.sitzwunsch?.trim());
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

  if (persons > SEATS_PER_TABLE) {
    oversizedGroups.push({
      entries: cluster,
      names: cluster.map((e) => `${e.vorname} ${e.nachname}`).join(", "),
    });
    const parts = splitUntilFits(cluster, graph);
    assignClusterPartsAdjacent(tables, parts, lockTableCount);
    return;
  }

  assignCluster(tables, cluster, lockTableCount);
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

export function mentionsMutually(entryA: Entry, entryB: Entry): boolean {
  const wishA = entryA.sitzwunsch?.trim();
  const wishB = entryB.sitzwunsch?.trim();
  if (!wishA || !wishB) return false;

  const aMentionsB = parseSitzwunschMentions(wishA, [entryB], entryA.id).some(
    (e) => e.id === entryB.id
  );
  const bMentionsA = parseSitzwunschMentions(wishB, [entryA], entryB.id).some(
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
  tables: AssignedTable[]
): UnfulfilledWish[] {
  const unfulfilled: UnfulfilledWish[] = [];

  for (const entry of entries) {
    const wish = entry.sitzwunsch?.trim();
    if (!wish) continue;

    const mentioned = parseSitzwunschMentions(wish, entries, entry.id);
    for (const wanted of mentioned) {
      if (!entryOnSameTable(tables, entry, wanted)) {
        unfulfilled.push({
          from: entry,
          wanted,
          reason: `${entry.vorname} ${entry.nachname} wollte mit ${wanted.vorname} ${wanted.nachname} sitzen`,
        });
      }
    }
  }

  return unfulfilled;
}

function computeWishStats(
  entries: Entry[],
  tables: AssignedTable[]
): AssignSeatsResult["stats"] {
  let totalWishes = 0;
  let fulfilledWishes = 0;

  for (const entry of entries) {
    const wish = entry.sitzwunsch?.trim();
    if (!wish) continue;

    const mentioned = parseSitzwunschMentions(wish, entries, entry.id);
    for (const wanted of mentioned) {
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
  unfulfilledWishes: UnfulfilledWish[]
): TableSatisfaction {
  if (table.seatsUsed > SEATS_PER_TABLE) return "overfull";

  const hasConflictOnTable = unfulfilledWishes.some((w) =>
    table.entries.some((e) => e.id === w.from.id)
  );
  if (hasConflictOnTable) return "conflict";

  const withWish = table.entries.filter((e) => e.sitzwunsch?.trim());
  if (withWish.length === 0) return "none";

  let hasAnyMention = false;
  let allOnSameTable = true;
  let allMutual = true;

  for (const entry of withWish) {
    const mentioned = parseSitzwunschMentions(entry.sitzwunsch!, allEntries, entry.id);
    if (mentioned.length === 0) continue;

    hasAnyMention = true;

    for (const wanted of mentioned) {
      const onTable = table.entries.some((e) => e.id === wanted.id);
      if (!onTable) allOnSameTable = false;
      if (!mentionsMutually(entry, wanted)) allMutual = false;
    }
  }

  if (!hasAnyMention) return "none";
  if (allOnSameTable && allMutual) return "full";
  return "partial";
}

export function getEntryChipStatus(
  entry: Entry,
  table: AssignedTable,
  allEntries: Entry[],
  unfulfilledWishes: UnfulfilledWish[],
  overCapacityIds: Set<string>
): EntryChipStatus {
  if (overCapacityIds.has(entry.id)) return "conflict";

  const hasConflict = unfulfilledWishes.some((w) => w.from.id === entry.id);
  if (hasConflict) return "conflict";

  const wish = entry.sitzwunsch?.trim();
  if (!wish) return "neutral";

  const mentioned = parseSitzwunschMentions(wish, allEntries, entry.id);
  if (mentioned.length === 0) return "neutral";

  const allOnTable = mentioned.every((m) =>
    table.entries.some((e) => e.id === m.id)
  );
  if (!allOnTable) return "conflict";

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
  options?: { fixedTableCount?: number }
): AssignSeatsResult {
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
    if (entry.total_persons > SEATS_PER_TABLE) {
      overCapacityEntries.push(entry);
    }
  }

  const totalPersons = entries.reduce((sum, e) => sum + e.total_persons, 0);
  const autoTableCount = Math.ceil(totalPersons / SEATS_PER_TABLE);
  const fixedCount = options?.fixedTableCount;
  const initialTableCount = fixedCount ?? autoTableCount;
  const lockTableCount = fixedCount !== undefined && fixedCount > 0;

  const graph = buildPreferenceGraph(entries);
  const clusters = connectedComponents(entries, graph);

  const preferenceClusters = clusters.filter((c) => !isNeutralCluster(c));
  const neutralEntries = clusters
    .filter(isNeutralCluster)
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

  const unfulfilledWishes = computeUnfulfilledWishes(entries, resultTables);
  const stats = computeWishStats(entries, resultTables);

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
  baseAssignmentMap: Map<string, number>
): Set<string> {
  const currentMap = buildAssignmentMap(tables);
  const manual = new Set<string>();
  for (const [id, idx] of Array.from(currentMap.entries())) {
    if (baseAssignmentMap.get(id) !== idx) manual.add(id);
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
  if (!canDropEntryOnTable(cloned[targetTableIdx], entry)) return null;

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
  meta: Pick<AssignSeatsResult, "oversizedGroups" | "overCapacityEntries">
): AssignSeatsResult {
  const unfulfilledWishes = computeUnfulfilledWishes(entries, tables);
  const stats = computeWishStats(entries, tables);
  return {
    tables,
    unfulfilledWishes,
    oversizedGroups: meta.oversizedGroups,
    overCapacityEntries: meta.overCapacityEntries,
    stats,
  };
}

export function entryWishBroken(
  entry: Entry,
  table: AssignedTable,
  allEntries: Entry[]
): boolean {
  const wish = entry.sitzwunsch?.trim();
  if (!wish) return false;

  const mentioned = parseSitzwunschMentions(wish, allEntries, entry.id);
  if (mentioned.length === 0) return false;

  return mentioned.some((m) => !table.entries.some((e) => e.id === m.id));
}

export function exportSeatingPlan(
  result: AssignSeatsResult,
  manualEntryIds?: Set<string>
): string {
  if (result.tables.length === 0) return "Keine Anmeldungen vorhanden.";

  const lines: string[] = [];

  result.tables.forEach((table, i) => {
    const splitNote = table.groupSplit ? " [Gruppe aufgeteilt]" : "";
    lines.push(
      `Tisch ${i + 1} (${table.seatsUsed}/${SEATS_PER_TABLE} Plätze)${splitNote}:`
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
    lines.push("Nicht erfüllte Wünsche:");
    for (const u of result.unfulfilledWishes) {
      lines.push(`- ${u.reason}`);
    }
  }

  return lines.join("\n").trim();
}
