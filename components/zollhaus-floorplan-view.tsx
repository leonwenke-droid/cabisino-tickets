"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Entry } from "@/lib/supabase";
import {
  buildSeatGroups,
  buildWishContext,
  formatEntryLabel,
  getTableSatisfaction,
  isTableOverfull,
  type AssignSeatsResult,
  type AssignedTable,
  type TableSatisfaction,
} from "@/lib/assign-seats";
import {
  formatZollhausTableLabel,
  getTableCapacityForDisplay,
} from "@/lib/zollhaus-tables";
import {
  FLOOR_ROOM_ASPECT,
  ROPE_OFF_REGIONS,
  STAIRCASE_REGION,
  getFloorplanTableMarkers,
  type FloorRegion,
} from "@/lib/zollhaus-floorplan";

const OCTAGON_CLIP =
  "polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)";

function RegionOverlay({ region }: { region: FloorRegion }) {
  const isRoped = region.variant === "roped";

  return (
    <div
      className="absolute flex items-center justify-center pointer-events-none"
      style={{
        left: `${region.x}%`,
        top: `${region.y}%`,
        width: `${region.w}%`,
        height: `${region.h}%`,
      }}
    >
      <div
        className={`absolute inset-0 rounded-sm border ${
          isRoped
            ? "border-gray-600/40 bg-gray-900/55"
            : "border-gray-500/35 bg-gray-800/45"
        }`}
        style={
          isRoped
            ? {
                backgroundImage:
                  "repeating-linear-gradient(135deg, rgba(120,120,120,0.18) 0, rgba(120,120,120,0.18) 6px, transparent 6px, transparent 12px)",
              }
            : undefined
        }
      />
      {region.label && (
        <span
          className={`relative z-10 text-[10px] sm:text-xs font-sans uppercase tracking-widest px-2 py-0.5 rounded ${
            isRoped ? "text-gray-500/90" : "text-gray-400/80"
          }`}
        >
          {region.label}
        </span>
      )}
    </div>
  );
}

function tableStatusStyle(
  satisfaction: TableSatisfaction,
  overfull: boolean,
  isEmpty: boolean
): { ring: string; fill: string; text: string } {
  if (overfull) {
    return {
      ring: "ring-red-400/80",
      fill: "bg-red-950/70",
      text: "text-red-200",
    };
  }
  if (satisfaction === "conflict") {
    return {
      ring: "ring-red-400/70",
      fill: "bg-red-950/55",
      text: "text-red-200",
    };
  }
  if (isEmpty) {
    return {
      ring: "ring-gray-500/35",
      fill: "bg-gray-900/50",
      text: "text-gray-500",
    };
  }
  if (satisfaction === "full") {
    return {
      ring: "ring-gold/70",
      fill: "bg-emerald-950/75",
      text: "text-gold",
    };
  }
  if (satisfaction === "partial") {
    return {
      ring: "ring-yellow-500/60",
      fill: "bg-yellow-950/40",
      text: "text-yellow-200/90",
    };
  }
  return {
    ring: "ring-gray-400/40",
    fill: "bg-surface-2/80",
    text: "text-cream-muted",
  };
}

function FloorplanTableOctagon({
  tableNumber,
  seatsUsed,
  seatCap,
  satisfaction,
  overfull,
  isEmpty,
  isSelected,
  onSelect,
}: {
  tableNumber: number;
  seatsUsed: number;
  seatCap: number;
  satisfaction: TableSatisfaction;
  overfull: boolean;
  isEmpty: boolean;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const styles = tableStatusStyle(satisfaction, overfull, isEmpty);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`absolute -translate-x-1/2 -translate-y-1/2 w-[clamp(2.25rem,4.2vw,3.25rem)] h-[clamp(2.25rem,4.2vw,3.25rem)] ring-2 transition-all hover:scale-110 focus:outline-none focus-visible:ring-gold/80 ${styles.ring} ${styles.fill} ${
        isSelected ? "scale-110 ring-gold shadow-[0_0_16px_rgba(201,162,39,0.45)]" : ""
      }`}
      style={{ clipPath: OCTAGON_CLIP }}
      aria-label={`Tisch ${tableNumber}, ${seatsUsed} von ${seatCap} Plätzen`}
    >
      <span
        className={`flex flex-col items-center justify-center w-full h-full font-serif font-bold leading-none ${styles.text}`}
      >
        <span className="text-[clamp(0.65rem,1.4vw,0.85rem)] tabular-nums">
          {tableNumber}
        </span>
        {!isEmpty && (
          <span className="text-[clamp(0.45rem,0.9vw,0.55rem)] font-sans opacity-75 mt-0.5 tabular-nums">
            {seatsUsed}/{seatCap}
          </span>
        )}
      </span>
    </button>
  );
}

function TableDetailModal({
  tableIndex,
  table,
  allEntries,
  unfulfilledWishes,
  onClose,
}: {
  tableIndex: number;
  table: AssignedTable;
  allEntries: Entry[];
  unfulfilledWishes: AssignSeatsResult["unfulfilledWishes"];
  onClose: () => void;
}) {
  const seatCap = getTableCapacityForDisplay(table.seatsUsed);
  const seatGroups = buildSeatGroups(table);
  const overfull = isTableOverfull(table);
  const wishCtx = buildWishContext(allEntries);
  const satisfaction = getTableSatisfaction(
    table,
    allEntries,
    unfulfilledWishes,
    wishCtx
  );

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="felt-card w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl border border-gold/30 p-5 shadow-2xl animate-fade-in"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="floorplan-table-title"
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3
              id="floorplan-table-title"
              className="font-serif text-xl text-gold"
            >
              {formatZollhausTableLabel(tableIndex)}
            </h3>
            <p className="text-cream-muted text-xs font-sans mt-1 tabular-nums">
              {table.seatsUsed}/{seatCap} Plätze
              {overfull && (
                <span className="text-red-400 ml-2">· Überfüllt</span>
              )}
              {table.groupSplit && (
                <span className="text-yellow-400/80 ml-2">· Gruppe aufgeteilt</span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-cream-muted hover:text-cream text-lg leading-none px-2"
            aria-label="Schließen"
          >
            ×
          </button>
        </div>

        {table.entries.length === 0 ? (
          <p className="text-cream-muted text-sm font-sans text-center py-6">
            Keine Gäste an diesem Tisch.
          </p>
        ) : (
          <ul className="space-y-3">
            {seatGroups.map((group, i) => {
              if (group.type === "empty") return null;
              const entry = group.entry;
              return (
                <li
                  key={`${entry.id}-${i}`}
                  className="rounded-xl border border-gold/15 bg-surface-2/60 px-3 py-2.5"
                >
                  <p className="font-serif text-cream text-sm font-medium">
                    {entry.vorname} {entry.nachname}
                  </p>
                  {group.guestLabels.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5">
                      {group.guestLabels.map((guest, gi) => (
                        <li
                          key={gi}
                          className="text-cream-muted text-xs font-sans pl-2"
                        >
                          {guest}
                        </li>
                      ))}
                    </ul>
                  )}
                  {entry.sitzwunsch?.trim() && (
                    <p className="text-[10px] text-cream-muted/70 font-sans mt-1.5 italic">
                      Sitzwunsch: {entry.sitzwunsch}
                    </p>
                  )}
                  <p className="text-[10px] text-cream-muted/60 font-sans mt-1">
                    {formatEntryLabel(entry)}
                  </p>
                </li>
              );
            })}
          </ul>
        )}

        {satisfaction === "conflict" && (
          <p className="text-red-400/90 text-xs font-sans mt-4">
            Konflikt an diesem Tisch — Details in der Raster-Ansicht prüfen.
          </p>
        )}
      </div>
    </div>
  );
}

export function ZollhausFloorplanView({
  tables,
  allEntries,
  unfulfilledWishes,
}: {
  tables: AssignedTable[];
  allEntries: Entry[];
  unfulfilledWishes: AssignSeatsResult["unfulfilledWishes"];
}) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const markers = useMemo(() => getFloorplanTableMarkers(), []);
  const wishCtx = useMemo(() => buildWishContext(allEntries), [allEntries]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    setZoom((z) => Math.min(2.5, Math.max(0.6, z - e.deltaY * 0.002)));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedIndex(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const selectedTable =
    selectedIndex !== null ? tables[selectedIndex] ?? null : null;

  return (
    <div className="space-y-3">
      <div
        className="overflow-x-auto overflow-y-hidden rounded-2xl border border-gold/20 bg-[#0a0a0f] touch-pan-x"
        onWheel={handleWheel}
      >
        <div
          className="relative mx-auto origin-top-left transition-transform duration-150"
          style={{
            width: "100%",
            minWidth: "min(100%, 720px)",
            aspectRatio: `${FLOOR_ROOM_ASPECT} / 1`,
            transform: `scale(${zoom})`,
            transformOrigin: "top center",
          }}
        >
          <div className="absolute inset-2 sm:inset-3 rounded-xl border border-gold/25 bg-[radial-gradient(ellipse_at_center,#111a12_0%,#080f0a_100%)]">
            {ROPE_OFF_REGIONS.map((region, i) => (
              <RegionOverlay key={`roped-${i}`} region={region} />
            ))}
            <RegionOverlay region={STAIRCASE_REGION} />

            {markers.map(({ tableIndex, tableNumber, position }) => {
              const table = tables[tableIndex];
              if (!table) return null;

              const rawSatisfaction = getTableSatisfaction(
                table,
                allEntries,
                unfulfilledWishes,
                wishCtx
              );
              const satisfaction =
                table.manuallyResolved &&
                (rawSatisfaction === "conflict" || rawSatisfaction === "overfull")
                  ? "partial"
                  : rawSatisfaction;
              const overfull =
                !table.manuallyResolved && isTableOverfull(table);
              const isEmpty = table.entries.length === 0;
              const seatCap = getTableCapacityForDisplay(table.seatsUsed);

              return (
                <div
                  key={tableNumber}
                  className="absolute"
                  style={{
                    left: `${position.x}%`,
                    top: `${position.y}%`,
                  }}
                >
                  <FloorplanTableOctagon
                    tableNumber={tableNumber}
                    seatsUsed={table.seatsUsed}
                    seatCap={seatCap}
                    satisfaction={satisfaction}
                    overfull={overfull}
                    isEmpty={isEmpty}
                    isSelected={selectedIndex === tableIndex}
                    onSelect={() => setSelectedIndex(tableIndex)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <p className="text-cream-muted/70 text-[11px] font-sans text-center">
        Horizontal scrollen · Pinch/Strg+Scroll zum Zoomen · Tisch antippen für
        Details · Verschieben nur in Raster-Ansicht möglich
      </p>

      {selectedTable && selectedIndex !== null && (
        <TableDetailModal
          tableIndex={selectedIndex}
          table={selectedTable}
          allEntries={allEntries}
          unfulfilledWishes={unfulfilledWishes}
          onClose={() => setSelectedIndex(null)}
        />
      )}
    </div>
  );
}
