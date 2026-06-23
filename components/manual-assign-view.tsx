"use client";

import { useCallback, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type { Entry } from "@/lib/supabase";
import {
  abbreviateName,
  formatEntryLabel,
  getAssignedEntryIds,
  getEntryChipStatus,
  getTableFreeSeats,
  wouldExceedTableCapacity,
  type AssignSeatsResult,
  type AssignedTable,
} from "@/lib/assign-seats";
import {
  TABLE_CAPACITY_MAX_EXCEPTION,
  ZOLLHAUS_TABLE_NUMBERS,
  getTableCapacityForDisplay,
} from "@/lib/zollhaus-tables";

type WishDotStatus = "none" | "fulfilled" | "unmet" | "conflict";

function truncateSitzwunsch(text: string, max = 32): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function getWishDotStatus(
  entry: Entry,
  table: AssignedTable | null,
  allEntries: Entry[],
  allTables: AssignedTable[],
  unfulfilledWishes: AssignSeatsResult["unfulfilledWishes"],
  overCapacityIds: Set<string>
): WishDotStatus {
  if (!table) return entry.sitzwunsch?.trim() ? "unmet" : "none";
  const chipStatus = getEntryChipStatus(
    entry,
    table,
    allEntries,
    allTables,
    unfulfilledWishes,
    overCapacityIds
  );
  const wish = entry.sitzwunsch?.trim();
  if (chipStatus === "conflict") return "conflict";
  if (!wish) return "none";
  if (chipStatus === "fulfilled") return "fulfilled";
  if (chipStatus === "neutral") return "unmet";
  return "none";
}

function WishStatusDot({ status }: { status: WishDotStatus }) {
  switch (status) {
    case "fulfilled":
      return (
        <span
          className="w-2 h-2 rounded-full bg-gold flex-shrink-0"
          title="Wunsch erfüllt"
        />
      );
    case "unmet":
      return (
        <span
          className="w-2 h-2 rounded-full bg-orange-400 flex-shrink-0"
          title="Wunsch nicht erfüllt"
        />
      );
    case "conflict":
      return (
        <span
          className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0"
          title="Konflikt"
        />
      );
    default:
      return (
        <span
          className="w-2 h-2 rounded-full bg-gray-400 flex-shrink-0"
          title="Kein Wunsch"
        />
      );
  }
}

function isTableDropId(id: unknown): id is string {
  return typeof id === "string" && /^table-\d+$/.test(id);
}

function parseTableDropIndex(id: string): number | null {
  const idx = parseInt(id.replace("table-", ""), 10);
  return Number.isFinite(idx) && idx >= 0 ? idx : null;
}

function OverfillConfirmDialog({
  tableNumber,
  freeSeats,
  groupSize,
  onConfirm,
  onCancel,
}: {
  tableNumber: number;
  freeSeats: number;
  groupSize: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onCancel}
      role="presentation"
    >
      <div
        className="felt-card w-full max-w-sm rounded-2xl border border-gold/30 p-5 shadow-2xl animate-fade-in"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <h3 className="font-serif text-lg text-gold mb-2">Tisch überfüllen?</h3>
        <p className="text-cream-muted text-sm font-sans mb-4">
          Tisch {tableNumber} hat nur {freeSeats} freie Plätze (bis 8), die Gruppe
          braucht {groupSize}. Trotzdem zuweisen (überfüllt)?
        </p>
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-xl text-sm font-sans text-cream-muted hover:text-cream border border-gold/20"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 rounded-xl text-sm font-sans bg-red-500/20 text-red-300 border border-red-500/40 hover:bg-red-500/30"
          >
            Trotzdem zuweisen
          </button>
        </div>
      </div>
    </div>
  );
}

function TablePickerModal({
  entry,
  tables,
  sourceTableIdx,
  onSelect,
  onClose,
}: {
  entry: Entry;
  tables: AssignedTable[];
  sourceTableIdx: number;
  onSelect: (tableIdx: number) => void;
  onClose: () => void;
}) {
  const options = useMemo(
    () =>
      ZOLLHAUS_TABLE_NUMBERS.map((tableNumber, tableIdx) => {
        const table = tables[tableIdx];
        const freeSeats = getTableFreeSeats(
          table,
          sourceTableIdx === tableIdx ? entry.id : undefined
        );
        const remainingMax = TABLE_CAPACITY_MAX_EXCEPTION - table.seatsUsed;
        return { tableNumber, tableIdx, table, freeSeats, remainingMax };
      }).sort((a, b) => b.freeSeats - a.freeSeats),
    [tables, sourceTableIdx, entry.id]
  );

  return (
    <div
      className="fixed inset-0 z-[65] flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="felt-card w-full max-w-md max-h-[80vh] overflow-hidden rounded-2xl border border-gold/30 shadow-2xl animate-fade-in flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="px-4 py-3 border-b border-gold/20 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-serif text-lg text-gold">Tisch wählen</h3>
            <p className="text-cream-muted text-xs font-sans mt-0.5">
              {formatEntryLabel(entry)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-cream-muted hover:text-cream text-lg leading-none px-1"
            aria-label="Schließen"
          >
            ×
          </button>
        </div>
        <ul className="overflow-y-auto p-2 space-y-1">
          {options.map(({ tableNumber, tableIdx, table, freeSeats }) => {
            const cap = getTableCapacityForDisplay(table.seatsUsed);
            const names =
              table.entries.length === 0
                ? "Leer"
                : table.entries.map((e) => abbreviateName(e)).join(", ");
            return (
              <li key={tableIdx}>
                <button
                  type="button"
                  onClick={() => onSelect(tableIdx)}
                  className="w-full text-left rounded-xl border border-gold/15 hover:border-gold/40 hover:bg-gold/5 px-3 py-2.5 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-serif text-gold text-sm">
                      Tisch {tableNumber}
                    </span>
                    <span className="text-[10px] text-cream-muted font-sans tabular-nums">
                      {table.seatsUsed}/{cap} · {freeSeats} frei
                    </span>
                  </div>
                  <p className="text-[11px] text-cream-muted font-sans truncate mt-0.5">
                    {names}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function UnassignedEntryRow({
  entry,
  wishDotStatus,
  onAssignClick,
}: {
  entry: Entry;
  wishDotStatus: WishDotStatus;
  onAssignClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: entry.id });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  const wishText = entry.sitzwunsch?.trim();

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-xl border border-gold/20 bg-surface-2/50 px-3 py-2.5 ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <div className="flex items-start gap-2">
        <div
          {...listeners}
          {...attributes}
          className="flex-1 min-w-0 cursor-grab active:cursor-grabbing touch-none"
        >
          <div className="flex items-center gap-2">
            <WishStatusDot status={wishDotStatus} />
            <span className="font-serif text-sm text-cream font-medium truncate">
              {entry.vorname} {entry.nachname}
            </span>
            <span className="text-[10px] text-cream-muted font-sans tabular-nums flex-shrink-0">
              {entry.total_persons} Pers.
            </span>
          </div>
          {wishText && (
            <p className="text-[11px] text-gold/55 italic font-sans truncate mt-1 pl-4">
              → {truncateSitzwunsch(wishText)}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onAssignClick}
          className="flex-shrink-0 text-[10px] font-sans text-gold border border-gold/30 rounded-lg px-2 py-1 hover:bg-gold/10 transition-colors whitespace-nowrap"
        >
          → Tisch
        </button>
      </div>
    </div>
  );
}

function ManualTableRow({
  tableIdx,
  table,
  allEntries,
  allTables,
  unfulfilledWishes,
  overCapacityIds,
  isDropTarget,
  onUnassign,
}: {
  tableIdx: number;
  table: AssignedTable;
  allEntries: Entry[];
  allTables: AssignedTable[];
  unfulfilledWishes: AssignSeatsResult["unfulfilledWishes"];
  overCapacityIds: Set<string>;
  isDropTarget?: boolean;
  onUnassign: (entryId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `table-${tableIdx}` });
  const tableNumber = ZOLLHAUS_TABLE_NUMBERS[tableIdx];
  const cap = getTableCapacityForDisplay(table.seatsUsed);
  const freeSeats = getTableFreeSeats(table);
  const hovered = isOver || isDropTarget;

  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl border px-3 py-2.5 transition-colors ${
        hovered
          ? "border-gold/50 bg-gold/10 ring-1 ring-gold/30"
          : "border-gold/15 bg-surface-2/40"
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="font-serif text-gold text-sm">Tisch {tableNumber}</span>
        <span className="text-[10px] text-cream-muted font-sans tabular-nums">
          {table.seatsUsed}/{cap} · {freeSeats} frei
        </span>
      </div>
      {table.entries.length === 0 ? (
        <p className="text-[11px] text-cream-muted/60 font-sans italic">
          Noch leer — Gruppe hierher ziehen
        </p>
      ) : (
        <ul className="space-y-1">
          {table.entries.map((entry) => {
            const wishDotStatus = getWishDotStatus(
              entry,
              table,
              allEntries,
              allTables,
              unfulfilledWishes,
              overCapacityIds
            );
            return (
              <li
                key={entry.id}
                className="flex items-center gap-2 rounded-lg bg-black/20 px-2 py-1"
              >
                <WishStatusDot status={wishDotStatus} />
                <span className="text-xs text-cream font-sans truncate flex-1">
                  {abbreviateName(entry)} ({entry.total_persons})
                </span>
                <button
                  type="button"
                  onClick={() => onUnassign(entry.id)}
                  className="text-cream-muted hover:text-red-400 text-sm leading-none px-1"
                  aria-label={`${entry.vorname} ${entry.nachname} entfernen`}
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

type PendingAssign = {
  entryId: string;
  tableIdx: number;
  freeSeats: number;
  groupSize: number;
  tableNumber: number;
};

export function ManualAssignView({
  entries,
  tables,
  unfulfilledWishes,
  overCapacityIds,
  onAssign,
  onUnassign,
}: {
  entries: Entry[];
  tables: AssignedTable[];
  unfulfilledWishes: AssignSeatsResult["unfulfilledWishes"];
  overCapacityIds: Set<string>;
  onAssign: (entryId: string, tableIdx: number) => void;
  onUnassign: (entryId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [pickerEntryId, setPickerEntryId] = useState<string | null>(null);
  const [pendingAssign, setPendingAssign] = useState<PendingAssign | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [overDropIdx, setOverDropIdx] = useState<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 150, tolerance: 8 },
    })
  );

  const assignedIds = useMemo(() => getAssignedEntryIds(tables), [tables]);

  const unassignedEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries
      .filter((e) => !assignedIds.has(e.id))
      .filter((e) => {
        if (!q) return true;
        const hay = `${e.vorname} ${e.nachname} ${e.sitzwunsch ?? ""}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => b.total_persons - a.total_persons);
  }, [entries, assignedIds, search]);

  const pickerEntry = pickerEntryId
    ? entries.find((e) => e.id === pickerEntryId) ?? null
    : null;

  const activeEntry = activeDragId
    ? entries.find((e) => e.id === activeDragId) ?? null
    : null;

  const tryAssign = useCallback(
    (entryId: string, tableIdx: number) => {
      const entry = entries.find((e) => e.id === entryId);
      if (!entry) return;

      const table = tables[tableIdx];
      const sourceIdx = tables.findIndex((t) =>
        t.entries.some((e) => e.id === entryId)
      );
      const tableNumber = ZOLLHAUS_TABLE_NUMBERS[tableIdx];

      if (
        wouldExceedTableCapacity(table, entry, sourceIdx, tableIdx)
      ) {
        const after =
          (sourceIdx === tableIdx
            ? table.seatsUsed - entry.total_persons
            : table.seatsUsed) + entry.total_persons;
        if (after > TABLE_CAPACITY_MAX_EXCEPTION) return;

        const freeSeats = getTableFreeSeats(
          table,
          sourceIdx === tableIdx ? entry.id : undefined
        );
        setPendingAssign({
          entryId,
          tableIdx,
          freeSeats,
          groupSize: entry.total_persons,
          tableNumber,
        });
        return;
      }

      onAssign(entryId, tableIdx);
      setPickerEntryId(null);
    },
    [entries, tables, onAssign]
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
    setOverDropIdx(null);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDragId(null);
      setOverDropIdx(null);

      const entryId = String(event.active.id);
      const overRaw = event.over?.id;
      if (!overRaw || !isTableDropId(overRaw)) return;

      const targetIdx = parseTableDropIndex(overRaw);
      if (targetIdx === null) return;

      tryAssign(entryId, targetIdx);
    },
    [tryAssign]
  );

  return (
    <>
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragOver={(e) => {
          const idx = e.over?.id && isTableDropId(e.over.id)
            ? parseTableDropIndex(String(e.over.id))
            : null;
          setOverDropIdx(idx);
        }}
        onDragEnd={handleDragEnd}
        onDragCancel={() => {
          setActiveDragId(null);
          setOverDropIdx(null);
        }}
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-[480px]">
          <div className="felt-card rounded-2xl border border-gold/25 flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-gold/20">
              <h3 className="font-serif text-gold text-sm">
                Noch nicht zugewiesen ({unassignedEntries.length})
              </h3>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name suchen…"
                className="mt-2 w-full rounded-lg border border-gold/20 bg-black/20 px-3 py-2 text-sm font-sans text-cream placeholder:text-cream-muted/50 focus:outline-none focus:border-gold/40"
              />
              <p className="text-[10px] text-cream-muted/70 font-sans mt-2">
                Größte Gruppen zuerst · Ziehen oder „→ Tisch“
              </p>
            </div>
            <ul className="flex-1 overflow-y-auto p-3 space-y-2 max-h-[60vh] lg:max-h-none">
              {unassignedEntries.length === 0 ? (
                <li className="text-center text-cream-muted text-sm font-sans py-8">
                  Alle Gruppen sind zugewiesen.
                </li>
              ) : (
                unassignedEntries.map((entry) => (
                  <li key={entry.id}>
                    <UnassignedEntryRow
                      entry={entry}
                      wishDotStatus={getWishDotStatus(
                        entry,
                        null,
                        entries,
                        tables,
                        unfulfilledWishes,
                        overCapacityIds
                      )}
                      onAssignClick={() => setPickerEntryId(entry.id)}
                    />
                  </li>
                ))
              )}
            </ul>
          </div>

          <div className="felt-card rounded-2xl border border-gold/25 flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-gold/20">
              <h3 className="font-serif text-gold text-sm">
                Tische ({ZOLLHAUS_TABLE_NUMBERS.length})
              </h3>
              <p className="text-[10px] text-cream-muted/70 font-sans mt-1">
                Nach Tischnummer · Gruppe auf Zeile ziehen
              </p>
            </div>
            <ul className="flex-1 overflow-y-auto p-3 space-y-2 max-h-[60vh] lg:max-h-none">
              {tables.map((table, tableIdx) => (
                <li key={tableIdx}>
                  <ManualTableRow
                    tableIdx={tableIdx}
                    table={table}
                    allEntries={entries}
                    allTables={tables}
                    unfulfilledWishes={unfulfilledWishes}
                    overCapacityIds={overCapacityIds}
                    isDropTarget={overDropIdx === tableIdx}
                    onUnassign={onUnassign}
                  />
                </li>
              ))}
            </ul>
          </div>
        </div>

        <DragOverlay>
          {activeEntry ? (
            <div className="w-[200px] shadow-2xl rotate-1 rounded-xl border border-gold/40 bg-surface-2/95 px-3 py-2">
              <p className="font-serif text-sm text-cream truncate">
                {abbreviateName(activeEntry)}
              </p>
              <p className="text-[10px] text-cream-muted font-sans">
                {activeEntry.total_persons} Pers.
              </p>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {pickerEntry && (
        <TablePickerModal
          entry={pickerEntry}
          tables={tables}
          sourceTableIdx={-1}
          onSelect={(tableIdx) => tryAssign(pickerEntry.id, tableIdx)}
          onClose={() => setPickerEntryId(null)}
        />
      )}

      {pendingAssign && (
        <OverfillConfirmDialog
          tableNumber={pendingAssign.tableNumber}
          freeSeats={pendingAssign.freeSeats}
          groupSize={pendingAssign.groupSize}
          onConfirm={() => {
            onAssign(pendingAssign.entryId, pendingAssign.tableIdx);
            setPendingAssign(null);
            setPickerEntryId(null);
          }}
          onCancel={() => setPendingAssign(null)}
        />
      )}
    </>
  );
}
