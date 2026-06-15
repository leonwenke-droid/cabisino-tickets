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
  type TableSatisfaction,
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

const GLOW_BY_SATISFACTION: Record<TableSatisfaction, string> = {
  none: "",
  partial: "shadow-[0_0_28px_rgba(234,179,8,0.25)]",
  full: "shadow-[0_0_28px_rgba(34,197,94,0.3)]",
  overfull: "shadow-[0_0_32px_rgba(239,68,68,0.35)]",
  conflict: "shadow-[0_0_32px_rgba(239,68,68,0.35)]",
};

const CHIP_BASE =
  "bg-cream/95 text-[#0a0a0f] border-cream/80";

type WishDotStatus = "none" | "fulfilled" | "nearby" | "unmet" | "conflict";

function truncateSitzwunsch(text: string, max = 30): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
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

function WishStatusDot({ status }: { status: WishDotStatus }) {
  switch (status) {
    case "fulfilled":
      return (
        <span
          className="w-1.5 h-1.5 rounded-full bg-gold flex-shrink-0"
          title="Wunsch erfüllt"
        />
      );
    case "nearby":
      return (
        <span
          className="inline-flex items-center justify-center w-3 h-3 rounded-full bg-yellow-400 flex-shrink-0"
          title="Nähe erfüllt"
        >
          <span className="text-[7px] font-bold text-[#0a0a0f] leading-none">~</span>
        </span>
      );
    case "unmet":
      return (
        <span
          className="w-1.5 h-1.5 rounded-full bg-orange-400 flex-shrink-0"
          title="Wunsch nicht erfüllt"
        />
      );
    case "conflict":
      return (
        <span
          className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0"
          title="Konflikt"
        />
      );
    default:
      return (
        <span
          className="w-1.5 h-1.5 rounded-full bg-gray-400 flex-shrink-0"
          title="Kein Wunsch"
        />
      );
  }
}

function SeatChip({
  label,
  wishDotStatus,
  sitzwunsch,
  isManual,
  lowConfidenceNote,
  dragHandle,
}: {
  label: string;
  wishDotStatus: WishDotStatus;
  sitzwunsch?: string | null;
  isManual?: boolean;
  lowConfidenceNote?: boolean;
  dragHandle?: React.HTMLAttributes<HTMLSpanElement>;
}) {
  const wishText = sitzwunsch?.trim();

  return (
    <div className="flex flex-col items-center gap-0.5 max-w-[100px]">
      <span
        {...dragHandle}
        className={`relative inline-flex items-center gap-1 rounded-full border font-sans font-medium truncate text-[10px] px-2 py-1 w-full cursor-grab active:cursor-grabbing touch-none ${CHIP_BASE}`}
        title={wishText ? `${label} — ${wishText}` : label}
      >
        <WishStatusDot status={wishDotStatus} />
        <span className="truncate">{label}</span>
        {isManual && (
          <span className="text-[7px] uppercase tracking-wide text-gray-500 flex-shrink-0">
            manuell
          </span>
        )}
      </span>
      {wishText && (
        <p
          className="text-xs text-cream-muted/60 font-sans text-center leading-tight w-full truncate px-0.5"
          title={wishText}
        >
          → {truncateSitzwunsch(wishText)}
        </p>
      )}
      {lowConfidenceNote && (
        <p className="text-[9px] text-gray-400 font-sans text-center leading-tight">
          Unsichere Zuordnung
        </p>
      )}
    </div>
  );
}

function EmptySeat() {
  return (
    <div className="flex flex-col items-center justify-center gap-0.5">
      <div className="w-10 h-10 rounded-full border border-dashed border-gray-500/50 bg-black/20 flex items-center justify-center">
        <span className="text-gray-500/60 text-[8px] font-sans">Frei</span>
      </div>
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex flex-col items-center gap-1 ${isDragging ? "opacity-40" : ""}`}
    >
      <SeatChip
        label={abbreviateName(entry)}
        wishDotStatus={wishDotStatus}
        sitzwunsch={entry.sitzwunsch}
        isManual={isManual}
        lowConfidenceNote={lowConfidenceIds.has(entry.id)}
        dragHandle={{ ...listeners, ...attributes }}
      />
      {guestLabels.length > 0 && (
        <div className="flex flex-wrap justify-center gap-0.5 max-w-[90px] pointer-events-none">
          {guestLabels.map((label, gi) => (
            <span
              key={gi}
              className="inline-block text-[8px] font-sans px-1.5 py-0.5 rounded-full bg-gray-500/35 text-gray-300 border border-gray-500/40 truncate max-w-[72px]"
              title={label}
            >
              {label.split(" ")[0]}
            </span>
          ))}
        </div>
      )}
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

  return (
    <div className="relative">
      <div
        ref={setNodeRef}
        className={`relative rounded-[2rem] border-2 p-1 transition-shadow ${
          overfull
            ? "border-red-500 shadow-[0_0_32px_rgba(239,68,68,0.35)]"
            : isOver && isDropTarget
              ? "border-gold shadow-[0_0_20px_rgba(201,162,39,0.35)]"
              : `border-gold/50 ${GLOW_BY_SATISFACTION[satisfaction]}`
        } ${table.groupSplit ? "ring-2 ring-yellow-500/40 ring-offset-1 ring-offset-surface" : ""}`}
      >
      <div
        className="relative rounded-[1.75rem] px-4 pt-8 pb-5 min-h-[220px]"
        style={{
          background:
            "radial-gradient(ellipse 80% 70% at 50% 45%, #1a4d32 0%, #0d2a1a 55%, #081a10 100%)",
        }}
      >
        <div className="absolute top-2 left-1/2 -translate-x-1/2">
          <span className="font-serif text-xs text-gold tracking-wide">
            Tisch {index + 1}
          </span>
        </div>

        <div className="absolute top-2 right-3 flex flex-col items-end gap-0.5">
          <span
            className={`text-[10px] font-sans px-2 py-0.5 rounded-full border ${
              overfull
                ? "border-red-400/50 text-red-300 bg-red-500/15"
                : "border-gold/30 text-gold/90 bg-black/25"
            }`}
          >
            {overfull
              ? `Überfüllt · ${table.seatsUsed}/${SEATS_PER_TABLE}`
              : `${table.seatsUsed}/${SEATS_PER_TABLE}`}
          </span>
          {manualCount > 0 && (
            <span className="text-[9px] font-sans text-gray-400">
              {manualCount} manuell
            </span>
          )}
        </div>

        {table.groupSplit && (
          <p className="absolute top-7 left-1/2 -translate-x-1/2 text-[9px] text-yellow-400/90 font-sans whitespace-nowrap">
            Gruppe aufgeteilt
          </p>
        )}

        <div className="grid grid-cols-4 gap-x-2 gap-y-4 mt-5">
          {seatGroups.map((group, i) => {
            if (group.type === "empty") {
              return (
                <div key={`empty-${i}`} className="flex justify-center items-center">
                  <EmptySeat />
                </div>
              );
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
    <div className="space-y-5 animate-fade-in">
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
      <div className="felt-card rounded-2xl px-4 py-3 grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="text-center">
          <p className="font-serif text-xl text-gold">{tables.length}</p>
          <p className="text-cream-muted text-[10px] font-sans uppercase tracking-wide">
            Tische
          </p>
        </div>
        <div className="text-center">
          <p className="font-serif text-xl text-cream">{totalPersons}</p>
          <p className="text-cream-muted text-[10px] font-sans uppercase tracking-wide">
            Personen
          </p>
        </div>
        <div className="text-center">
          <p className="font-serif text-xl text-emerald-400">
            {displayResult.stats.fulfilledPercent}%
          </p>
          <p className="text-cream-muted text-[10px] font-sans uppercase tracking-wide">
            Wünsche erfüllt
          </p>
        </div>
        <div className="text-center">
          <p className="font-serif text-xl text-red-400">
            {overfullTableCount}
          </p>
          <p className="text-cream-muted text-[10px] font-sans uppercase tracking-wide">
            Überfüllt
          </p>
        </div>
        <div className="text-center col-span-2 sm:col-span-1">
          <p className="font-serif text-xl text-red-400">
            {displayResult.unfulfilledWishes.length}
          </p>
          <p className="text-cream-muted text-[10px] font-sans uppercase tracking-wide">
            Offen
          </p>
        </div>
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

      <div className="flex flex-wrap gap-4 text-[10px] font-sans text-cream-muted justify-center">
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-gold" />
          Wunsch erfüllt
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-flex items-center justify-center w-3 h-3 rounded-full bg-yellow-400">
            <span className="text-[7px] font-bold text-[#0a0a0f] leading-none">~</span>
          </span>
          Nähe erfüllt
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
          Kein Wunsch
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
          Wunsch offen
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
          Konflikt
        </span>
      </div>

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
            <SeatChip
              label={abbreviateName(activeEntry)}
              wishDotStatus={
                activeEntry.sitzwunsch?.trim() ? "unmet" : "none"
              }
              sitzwunsch={activeEntry.sitzwunsch}
            />
          ) : null}
        </DragOverlay>
      </DndContext>

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
