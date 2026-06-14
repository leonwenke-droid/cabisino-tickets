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
import {
  assignSeats,
  exportSeatingPlan,
  getTableSatisfaction,
  getEntryChipStatus,
  abbreviateName,
  buildSeatGroups,
  formatEntryLabel,
  cloneTables,
  buildAssignmentMap,
  buildResultFromTables,
  moveEntryToTable,
  shuffleNeutralEntries,
  syncManualEntryIds,
  entryWishBroken,
  isTableOverfull,
  SEATS_PER_TABLE,
  type AssignSeatsResult,
  type TableSatisfaction,
  type EntryChipStatus,
  type AssignedTable,
} from "@/lib/assign-seats";

const TABLE_COUNT_STORAGE_KEY = "admin_tische_table_count";

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

const GLOW_BY_SATISFACTION: Record<TableSatisfaction, string> = {
  none: "",
  partial: "shadow-[0_0_28px_rgba(234,179,8,0.25)]",
  full: "shadow-[0_0_28px_rgba(34,197,94,0.3)]",
  overfull: "shadow-[0_0_32px_rgba(239,68,68,0.35)]",
  conflict: "shadow-[0_0_32px_rgba(239,68,68,0.35)]",
};

const CHIP_STYLES: Record<EntryChipStatus, string> = {
  fulfilled: "bg-gold/90 text-[#0a0a0f] border-gold",
  neutral: "bg-cream/95 text-[#0a0a0f] border-cream/80",
  conflict: "bg-red-500/90 text-white border-red-400",
};

function SeatChip({
  label,
  status,
  isManual,
  wishBroken,
  dragHandle,
}: {
  label: string;
  status: EntryChipStatus;
  isManual?: boolean;
  wishBroken?: boolean;
  dragHandle?: React.HTMLAttributes<HTMLSpanElement>;
}) {
  return (
    <span
      {...dragHandle}
      className={`relative inline-flex items-center gap-0.5 rounded-full border font-sans font-medium truncate text-[10px] px-2 py-1 max-w-[100px] cursor-grab active:cursor-grabbing touch-none ${CHIP_STYLES[status]}`}
      title={label}
    >
      {wishBroken && (
        <span className="text-yellow-400 text-[9px] flex-shrink-0" title="Sitzwunsch nicht mehr erfüllt">
          ⚠
        </span>
      )}
      <span className="truncate">{label}</span>
      {isManual && (
        <span className="text-[7px] uppercase tracking-wide text-gray-500 flex-shrink-0 ml-0.5">
          manuell
        </span>
      )}
    </span>
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
  unfulfilledWishes,
  overCapacityIds,
  manualEntryIds,
  guestLabels,
}: {
  entry: Entry;
  table: AssignedTable;
  allEntries: Entry[];
  unfulfilledWishes: AssignSeatsResult["unfulfilledWishes"];
  overCapacityIds: Set<string>;
  manualEntryIds: Set<string>;
  guestLabels: string[];
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: entry.id,
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  const status = getEntryChipStatus(
    entry,
    table,
    allEntries,
    unfulfilledWishes,
    overCapacityIds
  );
  const wishBroken = entryWishBroken(entry, table, allEntries);
  const isManual = manualEntryIds.has(entry.id);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex flex-col items-center gap-1 ${isDragging ? "opacity-40" : ""}`}
    >
      <SeatChip
        label={abbreviateName(entry)}
        status={status}
        isManual={isManual}
        wishBroken={wishBroken}
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
  unfulfilledWishes,
  overCapacityIds,
  manualEntryIds,
  isDropTarget,
}: {
  index: number;
  table: AssignedTable;
  allEntries: Entry[];
  unfulfilledWishes: AssignSeatsResult["unfulfilledWishes"];
  overCapacityIds: Set<string>;
  manualEntryIds: Set<string>;
  isDropTarget?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `table-${index}` });

  const satisfaction = getTableSatisfaction(table, allEntries, unfulfilledWishes);
  const overfull = isTableOverfull(table);
  const seatGroups = buildSeatGroups(table);
  const manualCount = table.entries.filter((e) => manualEntryIds.has(e.id)).length;

  return (
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
                unfulfilledWishes={unfulfilledWishes}
                overCapacityIds={overCapacityIds}
                manualEntryIds={manualEntryIds}
                guestLabels={group.guestLabels}
              />
            );
          })}
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
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [currentTables, setCurrentTables] = useState<AssignedTable[] | null>(null);
  const [manualEntryIds, setManualEntryIds] = useState<Set<string>>(new Set());
  const [baseAssignmentMap, setBaseAssignmentMap] = useState<Map<string, number>>(
    new Map()
  );
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const fixedTableCount = appliedTableCount;

  const baseResult = useMemo(() => {
    void recalcKey;
    return assignSeats(
      entries,
      fixedTableCount ? { fixedTableCount } : undefined
    );
  }, [entries, recalcKey, fixedTableCount]);

  useEffect(() => {
    setCurrentTables(cloneTables(baseResult.tables));
    setManualEntryIds(new Set());
    setBaseAssignmentMap(buildAssignmentMap(baseResult.tables));
  }, [baseResult]);

  const displayResult = useMemo(() => {
    const tables = currentTables ?? baseResult.tables;
    return buildResultFromTables(entries, tables, {
      oversizedGroups: baseResult.oversizedGroups,
      overCapacityEntries: baseResult.overCapacityEntries,
    });
  }, [currentTables, baseResult, entries]);

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
    const n = parseInt(tableCountInput.trim(), 10);
    const applied = Number.isFinite(n) && n > 0 ? n : undefined;
    setAppliedTableCount(applied);
    persistTableCount(tableCountInput);
    setRecalcKey((k) => k + 1);
  }, [tableCountInput]);

  const handleTableCountChange = useCallback((value: string) => {
    setTableCountInput(value);
    persistTableCount(value);
  }, []);

  const handleResetManual = useCallback(() => {
    setCurrentTables(cloneTables(baseResult.tables));
    setManualEntryIds(new Set());
  }, [baseResult.tables]);

  const handleShuffle = useCallback(() => {
    if (!currentTables) return;
    const shuffled = shuffleNeutralEntries(currentTables);
    setCurrentTables(shuffled);
    setManualEntryIds(syncManualEntryIds(shuffled, baseAssignmentMap));
  }, [currentTables, baseAssignmentMap]);

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

      const newTables = moveEntryToTable(tables, entryId, targetIdx);
      if (!newTables) return;

      setCurrentTables(newTables);
      setManualEntryIds(syncManualEntryIds(newTables, baseAssignmentMap));
    },
    [currentTables, baseResult.tables, baseAssignmentMap]
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

  const tables = currentTables ?? displayResult.tables;
  const overfullTableCount = tables.filter(isTableOverfull).length;

  return (
    <div className="space-y-5 animate-fade-in">
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

      {displayResult.oversizedGroups.length > 0 && (
        <div className="rounded-2xl border border-yellow-500/35 bg-yellow-500/10 px-4 py-3 space-y-2">
          {displayResult.oversizedGroups.map((group, i) => (
            <p key={i} className="text-yellow-200/90 text-xs font-sans leading-relaxed">
              <span className="mr-1">⚠</span>
              Gruppe zu groß für einen Tisch:{" "}
              <span className="text-yellow-100">{group.names}</span>. Bitte manuell
              aufteilen.
            </p>
          ))}
        </div>
      )}

      {displayResult.overCapacityEntries.length > 0 && (
        <div className="rounded-2xl border border-red-500/35 bg-red-500/10 px-4 py-3 space-y-2">
          {displayResult.overCapacityEntries.map((entry) => (
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
          <span className="w-4 h-4 rounded-full bg-gold/90 border border-gold" />
          Wunsch erfüllt
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-4 rounded-full bg-cream/95 border border-cream/80" />
          Kein Wunsch
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-4 rounded-full bg-red-500/90 border border-red-400" />
          Konflikt
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-yellow-400">⚠</span>
          Wunsch gebrochen
        </span>
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {tables.map((table, i) => (
            <PokerTableCard
              key={i}
              index={i}
              table={table}
              allEntries={entries}
              unfulfilledWishes={displayResult.unfulfilledWishes}
              overCapacityIds={overCapacityIds}
              manualEntryIds={manualEntryIds}
              isDropTarget={activeDragId !== null}
            />
          ))}
        </div>

        <DragOverlay>
          {activeEntry ? (
            <SeatChip
              label={abbreviateName(activeEntry)}
              status="neutral"
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      {displayResult.unfulfilledWishes.length > 0 && (
        <div className="felt-card rounded-2xl p-4 border-red-500/20">
          <h3 className="font-serif text-sm text-cream mb-3">
            Nicht erfüllte Wünsche
          </h3>
          <ul className="space-y-2">
            {displayResult.unfulfilledWishes.map((wish, i) => (
              <li
                key={`${wish.from.id}-${wish.wanted.id}-${i}`}
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
    </div>
  );
}
