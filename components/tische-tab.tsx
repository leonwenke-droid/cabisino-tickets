"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type { Entry } from "@/lib/supabase";
import type { ParsedWish } from "@/lib/sitzwunsch-types";
import {
  collectUnresolvableNames,
  entryIdsWithLowConfidence,
} from "@/lib/sitzwunsch-types";
import {
  assignSeats,
  exportSeatingPlan,
  getTableSatisfaction,
  getEntryChipStatus,
  buildWishContext,
  abbreviateName,
  buildSeatGroups,
  formatEntryLabel,
  cloneTables,
  buildAssignmentSignatures,
  buildResultFromTables,
  moveEntryToTable,
  shuffleNeutralEntries,
  syncManualEntryIds,
  isTableOverfull,
  sortTables,
  findEntryTableIndex,
  SEATS_PER_TABLE,
  type AssignSeatsResult,
  type AssignedTable,
  type TableSortMode,
} from "@/lib/assign-seats";

const TABLE_COUNT_STORAGE_KEY = "admin_tische_table_count";
const TABLE_SORT_STORAGE_KEY = "admin_tische_table_sort";
const TISCHPLAN_STORAGE_KEY = "kabisino-tischplan";

type PersistedTable = {
  entryIds: string[];
  manuallyResolved?: boolean;
  groupSplit?: boolean;
};

type PersistedTischplan = {
  tables: PersistedTable[];
};

function serializeTischplan(tables: AssignedTable[]): PersistedTischplan {
  return {
    tables: tables.map((t) => ({
      entryIds: t.entries.map((e) => e.id),
      manuallyResolved: t.manuallyResolved,
      groupSplit: t.groupSplit,
    })),
  };
}

function deserializeTischplan(data: PersistedTischplan, entries: Entry[]): AssignedTable[] {
  const byId = new Map(entries.map((e) => [e.id, e]));
  return data.tables.map((t) => {
    const tableEntries = t.entryIds
      .map((id) => byId.get(id))
      .filter((e): e is Entry => e !== undefined);
    return {
      entries: tableEntries,
      seatsUsed: tableEntries.reduce((sum, e) => sum + e.total_persons, 0),
      groupSplit: t.groupSplit,
      manuallyResolved: t.manuallyResolved,
    };
  });
}

function persistTischplan(tables: AssignedTable[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(TISCHPLAN_STORAGE_KEY, JSON.stringify(serializeTischplan(tables)));
}

function clearPersistedTischplan() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TISCHPLAN_STORAGE_KEY);
}

function createEmptyAssignedTables(count: number): AssignedTable[] {
  return Array.from({ length: Math.max(count, 1) }, () => ({
    entries: [],
    seatsUsed: 0,
  }));
}

function loadPersistedTischplan(entries: Entry[]): AssignedTable[] | null {
  if (typeof window === "undefined" || entries.length === 0) return null;
  const raw = localStorage.getItem(TISCHPLAN_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PersistedTischplan;
    if (!Array.isArray(parsed.tables)) return null;
    return deserializeTischplan(parsed, entries);
  } catch {
    return null;
  }
}

const TABLE_SORT_OPTIONS: { value: TableSortMode; label: string }[] = [
  { value: "default", label: "Standard" },
  { value: "seats-asc", label: "Plätze ↑" },
  { value: "seats-desc", label: "Plätze ↓" },
];

type WishDotStatus = "none" | "fulfilled" | "nearby" | "unmet" | "conflict";

function readStoredTableCount(): { input: string; applied?: number } {
  if (typeof window === "undefined") return { input: "" };
  const stored = sessionStorage.getItem(TABLE_COUNT_STORAGE_KEY) ?? "";
  const n = parseInt(stored.trim(), 10);
  return {
    input: stored,
    applied: Number.isFinite(n) && n > 0 ? n : undefined,
  };
}

function persistTableCount(value: string) {
  if (typeof window === "undefined") return;
  if (value.trim()) sessionStorage.setItem(TABLE_COUNT_STORAGE_KEY, value.trim());
  else sessionStorage.removeItem(TABLE_COUNT_STORAGE_KEY);
}

function readStoredTableSort(): TableSortMode {
  if (typeof window === "undefined") return "default";
  const stored = sessionStorage.getItem(TABLE_SORT_STORAGE_KEY);
  if (stored === "seats-asc" || stored === "seats-desc" || stored === "default") {
    return stored;
  }
  return "default";
}

function persistTableSort(mode: TableSortMode) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(TABLE_SORT_STORAGE_KEY, mode);
}

function truncateSitzwunsch(text: string, max = 24): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function formatGuestSummary(guestLabels: string[]): string {
  if (guestLabels.length === 0) return "";
  const firstNames = guestLabels.map((g) => g.split(" ")[0] ?? g);
  const shown = firstNames.slice(0, 3);
  const rest = firstNames.length - 3;
  if (rest > 0) return `${shown.join(", ")} +${rest} weitere`;
  return shown.join(", ");
}

function getWishDotStatus(
  entry: Entry,
  table: AssignedTable,
  allEntries: Entry[],
  allTables: AssignedTable[],
  unfulfilledWishes: AssignSeatsResult["unfulfilledWishes"],
  overCapacityIds: Set<string>,
  aiWishes?: ParsedWish[]
): WishDotStatus {
  const chipStatus = getEntryChipStatus(
    entry,
    table,
    allEntries,
    allTables,
    unfulfilledWishes,
    overCapacityIds,
    aiWishes
  );
  const wish = entry.sitzwunsch?.trim();

  if (chipStatus === "conflict") return "conflict";
  if (!wish) return "none";
  if (chipStatus === "fulfilled") return "fulfilled";
  if (chipStatus === "nearby-fulfilled") return "nearby";
  if (chipStatus === "neutral") return "unmet";
  return "none";
}

function WishStatusDot({
  status,
  size = "sm",
}: {
  status: WishDotStatus;
  size?: "sm" | "lg";
}) {
  const dotSm = "w-2 h-2";
  const dotLg = "w-2.5 h-2.5";
  const nearbySm = "w-3.5 h-3.5 text-[8px]";
  const nearbyLg = "w-4 h-4 text-[9px]";
  const dot = size === "lg" ? dotLg : dotSm;
  const nearby = size === "lg" ? nearbyLg : nearbySm;

  switch (status) {
    case "fulfilled":
      return (
        <span
          className={`${dot} rounded-full bg-gold flex-shrink-0`}
          title="Wunsch erfüllt"
        />
      );
    case "nearby":
      return (
        <span
          className={`inline-flex items-center justify-center ${nearby} rounded-full bg-yellow-400 flex-shrink-0`}
          title="Nähe erfüllt"
        >
          <span className="font-bold text-[#0a0a0f] leading-none">~</span>
        </span>
      );
    case "unmet":
      return (
        <span
          className={`${dot} rounded-full bg-orange-400 flex-shrink-0`}
          title="Wunsch nicht erfüllt"
        />
      );
    case "conflict":
      return (
        <span
          className={`${dot} rounded-full bg-red-500 flex-shrink-0`}
          title="Konflikt"
        />
      );
    default:
      return (
        <span
          className={`${dot} rounded-full bg-gray-400 flex-shrink-0`}
          title="Kein Wunsch"
        />
      );
  }
}

function PlayerCard({
  label,
  wishDotStatus,
  sitzwunsch,
  personCount,
  isManual,
  lowConfidenceNote,
  guestSummary,
  dragHandle,
}: {
  label: string;
  wishDotStatus: WishDotStatus;
  sitzwunsch?: string | null;
  personCount?: number;
  isManual?: boolean;
  lowConfidenceNote?: boolean;
  guestSummary?: string;
  dragHandle?: React.HTMLAttributes<HTMLDivElement>;
}) {
  const wishText = sitzwunsch?.trim();

  return (
    <div className="w-full flex flex-col gap-1">
      <div
        {...dragHandle}
        className="relative w-full rounded-xl bg-[#2a6b4a]/85 border border-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] px-3 py-2.5 cursor-grab active:cursor-grabbing touch-none transition-colors hover:bg-[#327a56]/90"
        title={wishText ? `${label} — ${wishText}` : label}
      >
        {isManual && (
          <span className="absolute top-1.5 right-1.5 text-[7px] uppercase tracking-wider text-gray-400/90 bg-gray-500/20 border border-gray-500/25 px-1.5 py-0.5 rounded-full font-sans">
            MANUELL
          </span>
        )}
        <div className="flex items-center justify-between gap-2 pr-0">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <WishStatusDot status={wishDotStatus} size="lg" />
            <span className="font-serif font-bold text-sm text-cream truncate leading-tight">
              {label}
            </span>
          </div>
          {personCount !== undefined && personCount > 0 && (
            <span className="text-[10px] text-cream-muted/60 font-sans flex-shrink-0 tabular-nums">
              {personCount} Pers.
            </span>
          )}
        </div>
        {wishText && (
          <p
            className="text-[11px] text-gold/55 italic font-sans truncate mt-1.5 pl-[18px]"
            title={wishText}
          >
            → {truncateSitzwunsch(wishText)}
          </p>
        )}
        {lowConfidenceNote && (
          <p className="text-[9px] text-gray-400/80 font-sans mt-1 pl-[18px]">
            Unsichere Zuordnung
          </p>
        )}
      </div>
      {guestSummary && (
        <p
          className="text-[10px] text-cream-muted/50 font-sans truncate px-1 pointer-events-none"
          title={guestSummary}
        >
          {guestSummary}
        </p>
      )}
    </div>
  );
}

function EmptySeat() {
  return (
    <div className="w-full min-h-[76px] rounded-xl border border-dashed border-gray-500/35 bg-black/20 shadow-[inset_0_2px_8px_rgba(0,0,0,0.25)] flex flex-col items-center justify-center gap-1.5">
      <span className="text-gray-500/45 text-base leading-none select-none" aria-hidden>
        ◇
      </span>
      <span className="text-[9px] text-gray-500/35 font-sans uppercase tracking-wider">
        Frei
      </span>
    </div>
  );
}

function DraggableSeatGroup({
  entry,
  table,
  allEntries,
  allTables,
  unfulfilledWishes,
  overCapacityIds,
  manualEntryIds,
  guestLabels,
  aiWishes,
  lowConfidenceIds,
}: {
  entry: Entry;
  table: AssignedTable;
  allEntries: Entry[];
  allTables: AssignedTable[];
  unfulfilledWishes: AssignSeatsResult["unfulfilledWishes"];
  overCapacityIds: Set<string>;
  manualEntryIds: Set<string>;
  guestLabels: string[];
  aiWishes?: ParsedWish[];
  lowConfidenceIds: Set<string>;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: entry.id,
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  const wishDotStatus = getWishDotStatus(
    entry,
    table,
    allEntries,
    allTables,
    unfulfilledWishes,
    overCapacityIds,
    aiWishes
  );
  const isManual = manualEntryIds.has(entry.id);
  const guestSummary = formatGuestSummary(guestLabels);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`w-full ${isDragging ? "opacity-40" : ""}`}
    >
      <PlayerCard
        label={abbreviateName(entry)}
        wishDotStatus={wishDotStatus}
        sitzwunsch={entry.sitzwunsch}
        personCount={entry.total_persons}
        isManual={isManual}
        lowConfidenceNote={lowConfidenceIds.has(entry.id)}
        guestSummary={guestSummary || undefined}
        dragHandle={{ ...listeners, ...attributes }}
      />
    </div>
  );
}

function PokerTableCard({
  index,
  table,
  allEntries,
  allTables,
  unfulfilledWishes,
  overCapacityIds,
  manualEntryIds,
  isDropTarget,
  showNearbyLinkAfter,
  aiWishes,
  lowConfidenceIds,
}: {
  index: number;
  table: AssignedTable;
  allEntries: Entry[];
  allTables: AssignedTable[];
  unfulfilledWishes: AssignSeatsResult["unfulfilledWishes"];
  overCapacityIds: Set<string>;
  manualEntryIds: Set<string>;
  isDropTarget?: boolean;
  showNearbyLinkAfter?: boolean;
  aiWishes?: ParsedWish[];
  lowConfidenceIds: Set<string>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `table-${index}` });

  const rawSatisfaction = getTableSatisfaction(
    table,
    allEntries,
    unfulfilledWishes,
    aiWishes !== undefined ? buildWishContext(allEntries, aiWishes) : undefined
  );
  const satisfaction =
    table.manuallyResolved &&
    (rawSatisfaction === "conflict" || rawSatisfaction === "overfull")
      ? "partial"
      : rawSatisfaction;
  const overfull = !table.manuallyResolved && isTableOverfull(table);
  const seatGroups = buildSeatGroups(table);
  const manualCount = table.entries.filter((e) => manualEntryIds.has(e.id)).length;
  const hasIssue = overfull || satisfaction === "conflict";
  const leftStripe = hasIssue ? "border-l-[5px] border-l-red-500" : "";

  return (
    <div className="relative">
      <div
        ref={setNodeRef}
        className={`group relative rounded-2xl border-2 border-gold/40 p-0.5 transition-all duration-300 hover:shadow-[0_0_28px_rgba(201,162,39,0.28)] ${leftStripe} ${
          isOver && isDropTarget
            ? "border-gold shadow-[0_0_24px_rgba(201,162,39,0.4)]"
            : ""
        } ${table.groupSplit ? "ring-1 ring-yellow-500/30 ring-offset-1 ring-offset-surface" : ""}`}
      >
        <div
          className="relative rounded-[0.9rem] px-4 pt-4 pb-5 min-h-[280px] flex flex-col"
          style={{
            background:
              "radial-gradient(ellipse 85% 75% at 50% 40%, #1a4d32 0%, #0d2a1a 55%, #081a10 100%)",
            boxShadow: "inset 0 3px 16px rgba(0,0,0,0.45), inset 0 -2px 8px rgba(0,0,0,0.2)",
          }}
        >
          <div className="absolute top-3 right-3 flex flex-col items-end gap-1 z-10">
            <span
              className={`text-[11px] font-sans px-2.5 py-1 rounded-full border tabular-nums ${
                overfull
                  ? "border-red-400/40 text-red-300/90 bg-red-500/10"
                  : "border-gold/40 text-gold bg-black/30"
              }`}
            >
              {overfull
                ? `Überfüllt · ${table.seatsUsed}/${SEATS_PER_TABLE}`
                : `${table.seatsUsed}/${SEATS_PER_TABLE}`}
            </span>
            {manualCount > 0 && (
              <span className="text-[9px] font-sans text-gray-400/80 italic">
                {manualCount} manuell
              </span>
            )}
          </div>

          <div className="text-center pt-1 pb-3 mb-1 border-b border-gold/25">
            <h3 className="font-serif text-xl text-gold tracking-wide">
              Tisch {index + 1}
            </h3>
            {table.groupSplit && (
              <p className="text-[10px] text-yellow-400/65 italic font-sans mt-1">
                Gruppe aufgeteilt
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2.5 flex-1 content-start">
            {seatGroups.map((group, i) => {
              if (group.type === "empty") {
                return <EmptySeat key={`empty-${i}`} />;
              }

              return (
                <DraggableSeatGroup
                  key={`group-${group.entry.id}-${i}`}
                  entry={group.entry}
                  table={table}
                  allEntries={allEntries}
                  allTables={allTables}
                  unfulfilledWishes={unfulfilledWishes}
                  overCapacityIds={overCapacityIds}
                  manualEntryIds={manualEntryIds}
                  guestLabels={group.guestLabels}
                  aiWishes={aiWishes}
                  lowConfidenceIds={lowConfidenceIds}
                />
              );
            })}
          </div>
        </div>
      </div>

      {showNearbyLinkAfter && (
        <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 whitespace-nowrap pointer-events-none">
          <span className="w-8 border-t border-dashed border-gold/50" />
          <span className="text-[8px] font-sans text-gold/70 px-1">Nähe gewünscht</span>
          <span className="w-8 border-t border-dashed border-gold/50" />
        </div>
      )}
    </div>
  );
}

function WishLegendBar() {
  const items: { status: WishDotStatus; label: string }[] = [
    { status: "fulfilled", label: "Wunsch erfüllt" },
    { status: "nearby", label: "Nähe erfüllt" },
    { status: "none", label: "Kein Wunsch" },
    { status: "unmet", label: "Wunsch offen" },
    { status: "conflict", label: "Konflikt" },
  ];

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-3xl pointer-events-none">
      <div className="felt-card rounded-2xl px-5 py-3.5 border border-gold/30 shadow-[0_8px_32px_rgba(0,0,0,0.55)] backdrop-blur-sm">
        <div className="flex flex-wrap justify-center gap-x-7 gap-y-2.5">
          {items.map(({ status, label }) => (
            <span
              key={label}
              className="flex items-center gap-2 text-sm font-sans text-cream-muted"
            >
              <WishStatusDot status={status} size="lg" />
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function TischeTab({
  entries,
  isLoading,
}: {
  entries: Entry[];
  isLoading?: boolean;
}) {
  const [recalcKey, setRecalcKey] = useState(0);
  const [tableCountInput, setTableCountInput] = useState(
    () => readStoredTableCount().input
  );
  const [appliedTableCount, setAppliedTableCount] = useState<number | undefined>(
    () => readStoredTableCount().applied
  );
  const [tableSort, setTableSort] = useState<TableSortMode>(() => readStoredTableSort());
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [currentTables, setCurrentTables] = useState<AssignedTable[] | null>(null);
  const [manualEntryIds, setManualEntryIds] = useState<Set<string>>(new Set());
  const [baseAssignmentSignatures, setBaseAssignmentSignatures] = useState<
    Map<string, string>
  >(new Map());
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [planInitialized, setPlanInitialized] = useState(false);
  const [planLoadedFromStorage, setPlanLoadedFromStorage] = useState(false);
  const [skipBaseResultSync, setSkipBaseResultSync] = useState(false);
  const [aiWishes, setAiWishes] = useState<ParsedWish[] | undefined>(undefined);
  const [analyzingWishes, setAnalyzingWishes] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [analyzeKey, setAnalyzeKey] = useState(0);

  const fixedTableCount = appliedTableCount;

  const hasSitzwuensche = useMemo(
    () => entries.some((e) => e.sitzwunsch?.trim()),
    [entries]
  );

  useEffect(() => {
    if (entries.length === 0) {
      setAiWishes(undefined);
      setAnalyzingWishes(false);
      return;
    }

    if (!hasSitzwuensche) {
      setAiWishes([]);
      setAnalyzingWishes(false);
      setAnalyzeError(null);
      return;
    }

    let cancelled = false;
    setAnalyzingWishes(true);
    setAnalyzeError(null);
    setAiWishes(undefined);

    fetch("/api/analyze-sitzwuensche", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-token": sessionStorage.getItem("admin_auth_token") ?? "",
      },
      body: JSON.stringify({ entries }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Analyse fehlgeschlagen");
        }
        return res.json();
      })
      .then((data: { wishes: ParsedWish[] }) => {
        if (!cancelled) setAiWishes(data.wishes);
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setAnalyzeError(err.message);
          setAiWishes(undefined);
        }
      })
      .finally(() => {
        if (!cancelled) setAnalyzingWishes(false);
      });

    return () => {
      cancelled = true;
    };
  }, [entries, analyzeKey, hasSitzwuensche]);

  const wishesReady = !analyzingWishes && (aiWishes !== undefined || !hasSitzwuensche);

  const baseResult = useMemo(() => {
    void recalcKey;
    if (!wishesReady) {
      return {
        tables: [],
        unfulfilledWishes: [],
        oversizedGroups: [],
        overCapacityEntries: [],
        nearbyTableLinks: [],
        stats: { totalWishes: 0, fulfilledWishes: 0, fulfilledPercent: 100 },
      } satisfies AssignSeatsResult;
    }
    return assignSeats(entries, {
      ...(fixedTableCount ? { fixedTableCount } : {}),
      ...(aiWishes !== undefined ? { aiWishes } : {}),
    });
  }, [entries, recalcKey, fixedTableCount, aiWishes, wishesReady]);

  const unresolvableNames = useMemo(
    () => (aiWishes ? collectUnresolvableNames(aiWishes) : []),
    [aiWishes]
  );

  const lowConfidenceIds = useMemo(
    () => (aiWishes ? entryIdsWithLowConfidence(aiWishes) : new Set<string>()),
    [aiWishes]
  );

  useEffect(() => {
    if (planInitialized || entries.length === 0) return;

    const persisted = loadPersistedTischplan(entries);
    if (persisted) {
      setCurrentTables(sortTables(persisted, tableSort));
      setSkipBaseResultSync(true);
      setPlanLoadedFromStorage(true);
    }
    setPlanInitialized(true);
  }, [entries, planInitialized, tableSort]);

  useEffect(() => {
    if (!planInitialized || skipBaseResultSync || !wishesReady) return;
    setCurrentTables(sortTables(cloneTables(baseResult.tables), tableSort));
    setManualEntryIds(new Set());
    setBaseAssignmentSignatures(buildAssignmentSignatures(baseResult.tables));
  }, [baseResult, skipBaseResultSync, planInitialized, tableSort, wishesReady]);

  useEffect(() => {
    if (!skipBaseResultSync || !currentTables) return;
    setManualEntryIds(
      syncManualEntryIds(currentTables, buildAssignmentSignatures(baseResult.tables))
    );
    setBaseAssignmentSignatures(buildAssignmentSignatures(baseResult.tables));
  }, [skipBaseResultSync, currentTables, baseResult.tables]);

  useEffect(() => {
    if (!skipBaseResultSync) return;
    const byId = new Map(entries.map((e) => [e.id, e]));
    setCurrentTables((prev) => {
      if (!prev) return prev;
      let changed = false;
      const next = prev.map((table) => {
        const freshEntries = table.entries
          .map((e) => byId.get(e.id))
          .filter((e): e is Entry => e !== undefined);
        if (
          freshEntries.length !== table.entries.length ||
          freshEntries.some((e, i) => e !== table.entries[i])
        ) {
          changed = true;
        }
        const seatsUsed = freshEntries.reduce((s, e) => s + e.total_persons, 0);
        if (seatsUsed !== table.seatsUsed) changed = true;
        return { ...table, entries: freshEntries, seatsUsed };
      });
      return changed ? next : prev;
    });
  }, [entries, skipBaseResultSync]);

  useEffect(() => {
    setCurrentTables((prev) => (prev ? sortTables(prev, tableSort) : prev));
    persistTableSort(tableSort);
  }, [tableSort]);

  const applyTableSort = useCallback(
    (tables: AssignedTable[]) => sortTables(tables, tableSort),
    [tableSort]
  );

  const displayResult = useMemo(() => {
    const tables = currentTables ?? baseResult.tables;
    return buildResultFromTables(
      entries,
      tables,
      {
        oversizedGroups: baseResult.oversizedGroups,
        overCapacityEntries: baseResult.overCapacityEntries,
      },
      aiWishes
    );
  }, [currentTables, baseResult, entries, aiWishes]);

  const totalPersons = useMemo(
    () => entries.reduce((s, e) => s + e.total_persons, 0),
    [entries]
  );

  const overCapacityIds = useMemo(
    () => new Set(displayResult.overCapacityEntries.map((e) => e.id)),
    [displayResult.overCapacityEntries]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const activeEntry = activeDragId
    ? entries.find((e) => e.id === activeDragId)
    : null;

  const handleRecalculate = useCallback(() => {
    clearPersistedTischplan();
    setSkipBaseResultSync(false);
    setPlanLoadedFromStorage(false);
    const n = parseInt(tableCountInput.trim(), 10);
    const applied = Number.isFinite(n) && n > 0 ? n : undefined;
    setAppliedTableCount(applied);
    persistTableCount(tableCountInput);
    setRecalcKey((k) => k + 1);
    setAnalyzeKey((k) => k + 1);
  }, [tableCountInput]);

  const handleClearPlan = useCallback(() => {
    clearPersistedTischplan();
    setSkipBaseResultSync(false);
    setPlanLoadedFromStorage(false);
    const autoCount = Math.max(
      1,
      Math.ceil(entries.reduce((s, e) => s + e.total_persons, 0) / SEATS_PER_TABLE)
    );
    const count = appliedTableCount ?? autoCount;
    setCurrentTables(createEmptyAssignedTables(count));
    setManualEntryIds(new Set());
  }, [appliedTableCount, entries]);

  const handleTableCountChange = useCallback((value: string) => {
    setTableCountInput(value);
    persistTableCount(value);
  }, []);

  const handleResetManual = useCallback(() => {
    clearPersistedTischplan();
    setSkipBaseResultSync(false);
    setPlanLoadedFromStorage(false);
    setCurrentTables(applyTableSort(cloneTables(baseResult.tables)));
    setManualEntryIds(new Set());
  }, [baseResult.tables, applyTableSort]);

  const handleShuffle = useCallback(() => {
    if (!currentTables) return;
    const shuffled = shuffleNeutralEntries(currentTables);
    const sorted = applyTableSort(shuffled);
    setCurrentTables(sorted);
    setManualEntryIds(syncManualEntryIds(sorted, baseAssignmentSignatures));
  }, [currentTables, baseAssignmentSignatures, applyTableSort]);

  const handleExport = useCallback(async () => {
    const text = exportSeatingPlan(displayResult, manualEntryIds);
    try {
      await navigator.clipboard.writeText(text);
      setExportMsg("Tischplan in Zwischenablage kopiert!");
      setTimeout(() => setExportMsg(null), 2500);
    } catch {
      setExportMsg("Kopieren fehlgeschlagen.");
      setTimeout(() => setExportMsg(null), 2500);
    }
  }, [displayResult, manualEntryIds]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDragId(null);

      const entryId = String(event.active.id);
      const overId = event.over?.id;
      if (!overId || !String(overId).startsWith("table-")) return;

      const targetIdx = parseInt(String(overId).replace("table-", ""), 10);
      const tables = currentTables ?? baseResult.tables;
      const sourceIdx = findEntryTableIndex(tables, entryId);

      const newTables = moveEntryToTable(tables, entryId, targetIdx);
      if (!newTables) return;

      if (sourceIdx >= 0) newTables[sourceIdx].manuallyResolved = true;
      if (targetIdx >= 0 && targetIdx !== sourceIdx) {
        newTables[targetIdx].manuallyResolved = true;
      }

      const sorted = applyTableSort(newTables);
      setCurrentTables(sorted);
      setManualEntryIds(syncManualEntryIds(sorted, baseAssignmentSignatures));
      persistTischplan(sorted);
    },
    [currentTables, baseResult.tables, baseAssignmentSignatures, applyTableSort]
  );

  const handleDragCancel = useCallback(() => {
    setActiveDragId(null);
  }, []);

  if (isLoading) {
    return (
      <div className="felt-card rounded-2xl p-8 text-center animate-fade-in">
        <p className="text-cream-muted text-sm font-sans animate-pulse">
          Lädt Anmeldungen…
        </p>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="felt-card rounded-2xl p-8 text-center animate-fade-in">
        <p className="text-gold/60 text-2xl mb-3">♣</p>
        <p className="text-cream-muted text-sm font-sans">
          Noch keine Anmeldungen vorhanden.
        </p>
      </div>
    );
  }

  const tables = displayResult.tables;
  const overfullTableCount = tables.filter(
    (t) => isTableOverfull(t) && !t.manuallyResolved
  ).length;

  const visibleOversizedGroups = displayResult.oversizedGroups.filter((group) => {
    const entryIds = new Set(group.entries.map((e) => e.id));
    return tables.some(
      (t) =>
        t.entries.some((e) => entryIds.has(e.id)) && !t.manuallyResolved
    );
  });

  const visibleOverCapacityEntries = displayResult.overCapacityEntries.filter(
    (entry) => {
      const tableIdx = findEntryTableIndex(tables, entry.id);
      if (tableIdx < 0) return true;
      return !tables[tableIdx].manuallyResolved;
    }
  );

  return (
    <div className="space-y-5 animate-fade-in pb-28">
      {planLoadedFromStorage && (
        <div className="rounded-2xl border border-gold/30 bg-gold/10 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
          <p className="text-cream text-xs font-sans flex-1">
            Gespeicherter Tischplan geladen.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleRecalculate}
              className="py-2 px-4 rounded-xl border border-gold/20 text-cream-muted text-xs font-sans hover:text-cream hover:border-gold/40 transition-all"
            >
              Neu berechnen
            </button>
            <button
              type="button"
              onClick={handleClearPlan}
              className="py-2 px-4 rounded-xl border border-gray-500/30 text-gray-400 text-xs font-sans hover:text-cream hover:border-gray-400/50 transition-all"
            >
              Plan löschen
            </button>
          </div>
        </div>
      )}

      {/* Settings bar */}
      <div className="felt-card rounded-2xl px-4 py-3 flex flex-col sm:flex-row sm:items-end gap-3">
        <div className="flex-1 min-w-[140px]">
          <label className="block text-cream-muted text-[10px] font-sans uppercase tracking-wide mb-1.5">
            Verfügbare Tische
          </label>
          <input
            type="number"
            min={1}
            value={tableCountInput}
            onChange={(e) => handleTableCountChange(e.target.value)}
            placeholder="Automatisch"
            className="input-dark w-full rounded-lg px-3 py-2 text-sm font-sans outline-none"
          />
        </div>
        <div className="flex-1 min-w-[140px]">
          <label className="block text-cream-muted text-[10px] font-sans uppercase tracking-wide mb-1.5">
            Sortierung
          </label>
          <select
            value={tableSort}
            onChange={(e) => setTableSort(e.target.value as TableSortMode)}
            className="input-dark w-full rounded-lg px-3 py-2 text-sm font-sans outline-none"
          >
            {TABLE_SORT_OPTIONS.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          <button
            type="button"
            onClick={handleRecalculate}
            className="py-2 px-4 rounded-xl border border-gold/20 text-cream-muted text-xs font-sans hover:text-cream hover:border-gold/40 transition-all"
          >
            Neu berechnen
          </button>
          <button
            type="button"
            onClick={handleShuffle}
            className="py-2 px-4 rounded-xl border border-gold/20 text-cream-muted text-xs font-sans hover:text-cream hover:border-gold/40 transition-all"
          >
            Zufällig mischen
          </button>
          {manualEntryIds.size > 0 && (
            <button
              type="button"
              onClick={handleResetManual}
              className="py-2 px-4 rounded-xl border border-gray-500/30 text-gray-400 text-xs font-sans hover:text-cream hover:border-gray-400/50 transition-all"
            >
              Reset manuelle Änderungen
            </button>
          )}
          <button
            type="button"
            onClick={handleExport}
            className="py-2 px-4 rounded-xl border border-gold/30 text-gold text-xs font-sans font-medium hover:bg-gold/5 transition-all"
          >
            Tischplan exportieren
          </button>
        </div>
      </div>

      {/* Summary bar */}
      <div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="felt-card rounded-xl px-3 py-4 text-center">
            <span className="text-gold/50 text-xl leading-none">♠</span>
            <p className="font-serif text-2xl text-gold mt-2 tabular-nums">{tables.length}</p>
            <p className="text-cream-muted text-[10px] font-sans uppercase tracking-wide mt-1">
              Tische
            </p>
          </div>
          <div className="felt-card rounded-xl px-3 py-4 text-center">
            <span className="text-gold/50 text-xl leading-none">♥</span>
            <p className="font-serif text-2xl text-gold mt-2 tabular-nums">{totalPersons}</p>
            <p className="text-cream-muted text-[10px] font-sans uppercase tracking-wide mt-1">
              Personen
            </p>
          </div>
          <div className="felt-card rounded-xl px-3 py-4 text-center">
            <span className="text-gold/50 text-xl leading-none">♦</span>
            <p className="font-serif text-2xl text-emerald-400 mt-2 tabular-nums">
              {displayResult.stats.fulfilledPercent}%
            </p>
            <p className="text-cream-muted text-[10px] font-sans uppercase tracking-wide mt-1">
              Wünsche erfüllt
            </p>
          </div>
          <div className="felt-card rounded-xl px-3 py-4 text-center">
            <span className="text-gold/50 text-xl leading-none">♣</span>
            <p className="font-serif text-2xl text-red-400 mt-2 tabular-nums">
              {overfullTableCount}
            </p>
            <p className="text-cream-muted text-[10px] font-sans uppercase tracking-wide mt-1">
              Überfüllt
            </p>
          </div>
          <div className="felt-card rounded-xl px-3 py-4 text-center col-span-2 sm:col-span-1">
            <span className="text-gold/50 text-xl leading-none">♠</span>
            <p className="font-serif text-2xl text-red-400 mt-2 tabular-nums">
              {displayResult.unfulfilledWishes.length}
            </p>
            <p className="text-cream-muted text-[10px] font-sans uppercase tracking-wide mt-1">
              Offen
            </p>
          </div>
        </div>
        <div className="mt-4 border-b border-gold/20" />
      </div>

      {exportMsg && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-emerald-400 text-xs font-sans text-center">
          {exportMsg}
        </div>
      )}

      {analyzingWishes && (
        <div className="rounded-2xl border border-gold/30 bg-gold/10 px-4 py-3 text-cream text-xs font-sans text-center">
          Analysiere Sitzwünsche…
        </div>
      )}

      {analyzeError && !analyzingWishes && (
        <div className="rounded-2xl border border-orange-500/35 bg-orange-500/10 px-4 py-3 text-orange-200/90 text-xs font-sans">
          KI-Analyse fehlgeschlagen ({analyzeError}). Es wird die Standard-Zuordnung verwendet.
        </div>
      )}

      {unresolvableNames.length > 0 && (
        <div className="rounded-2xl border border-yellow-500/35 bg-yellow-500/10 px-4 py-3 text-yellow-200/90 text-xs font-sans leading-relaxed">
          Folgende Namen konnten nicht zugeordnet werden:{" "}
          <span className="text-yellow-100">{unresolvableNames.join(", ")}</span>.
          Bitte nachfragen.
        </div>
      )}

      {visibleOversizedGroups.length > 0 && (
        <div className="rounded-2xl border border-yellow-500/35 bg-yellow-500/10 px-4 py-3 space-y-2">
          {visibleOversizedGroups.map((group, i) => (
            <p key={i} className="text-yellow-200/90 text-xs font-sans leading-relaxed">
              <span className="mr-1">⚠</span>
              Gruppe zu groß für einen Tisch:{" "}
              <span className="text-yellow-100">{group.names}</span>. Bitte manuell
              aufteilen.
            </p>
          ))}
        </div>
      )}

      {visibleOverCapacityEntries.length > 0 && (
        <div className="rounded-2xl border border-red-500/35 bg-red-500/10 px-4 py-3 space-y-2">
          {visibleOverCapacityEntries.map((entry) => (
            <p key={entry.id} className="text-red-300 text-xs font-sans">
              <span className="mr-1">✗</span>
              Einzelne Anmeldung überschreitet Tischkapazität:{" "}
              <span className="font-medium">
                {formatEntryLabel(entry)} ({entry.total_persons} Personen)
              </span>
            </p>
          ))}
        </div>
      )}

      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        {wishesReady ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {tables.map((table, i) => (
            <PokerTableCard
              key={i}
              index={i}
              table={table}
              allEntries={entries}
              allTables={tables}
              unfulfilledWishes={displayResult.unfulfilledWishes}
              overCapacityIds={overCapacityIds}
              manualEntryIds={manualEntryIds}
              isDropTarget={activeDragId !== null}
              showNearbyLinkAfter={Boolean(table.nearbyLinkNext)}
              aiWishes={aiWishes}
              lowConfidenceIds={lowConfidenceIds}
            />
          ))}
        </div>
        ) : (
          <div className="felt-card rounded-2xl p-8 text-center">
            <p className="text-cream-muted text-sm font-sans">Analysiere Sitzwünsche…</p>
          </div>
        )}

        <DragOverlay>
          {activeEntry ? (
            <div className="w-[180px] shadow-2xl rotate-2">
              <PlayerCard
                label={abbreviateName(activeEntry)}
                wishDotStatus={
                  activeEntry.sitzwunsch?.trim() ? "unmet" : "none"
                }
                sitzwunsch={activeEntry.sitzwunsch}
                personCount={activeEntry.total_persons}
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <WishLegendBar />

      {displayResult.unfulfilledWishes.length > 0 && (
        <div className="felt-card rounded-2xl p-4 border-red-500/20 space-y-4">
          {displayResult.unfulfilledWishes.some((w) => w.preferenceType === "same-table") && (
            <div>
              <h3 className="font-serif text-sm text-cream mb-3">
                Wunsch nicht erfüllt
              </h3>
              <ul className="space-y-2">
                {displayResult.unfulfilledWishes
                  .filter((w) => w.preferenceType === "same-table")
                  .map((wish, i) => (
                    <li
                      key={`same-${wish.from.id}-${wish.wanted.id}-${i}`}
                      className="text-xs font-sans text-cream-muted"
                    >
                      <span className="text-red-400/90">✗</span> {wish.reason}
                      {wish.from.sitzwunsch && (
                        <span className="block text-[10px] text-cream-muted/60 mt-0.5 ml-4">
                          &bdquo;{wish.from.sitzwunsch}&ldquo;
                        </span>
                      )}
                    </li>
                  ))}
              </ul>
            </div>
          )}
          {displayResult.unfulfilledWishes.some((w) => w.preferenceType === "nearby") && (
            <div>
              <h3 className="font-serif text-sm text-cream mb-3">
                Nähe nicht erfüllt
              </h3>
              <ul className="space-y-2">
                {displayResult.unfulfilledWishes
                  .filter((w) => w.preferenceType === "nearby")
                  .map((wish, i) => (
                    <li
                      key={`nearby-${wish.from.id}-${wish.wanted.id}-${i}`}
                      className="text-xs font-sans text-cream-muted"
                    >
                      <span className="text-yellow-400/90">~</span> {wish.reason}
                      {wish.from.sitzwunsch && (
                        <span className="block text-[10px] text-cream-muted/60 mt-0.5 ml-4">
                          &bdquo;{wish.from.sitzwunsch}&ldquo;
                        </span>
                      )}
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
