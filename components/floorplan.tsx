"use client";

import { useEffect, useMemo, useState } from "react";
import type { Entry } from "@/lib/supabase";
import {
  buildSeatGroups,
  buildWishContext,
  formatEntryLabel,
  getTableSatisfaction,
  isTableOverfull,
  type AssignSeatsResult,
  type AssignedTable,
} from "@/lib/assign-seats";
import { TABLE_POLYGONS } from "@/lib/floorplan-table-polygons";
import {
  ZOLLHAUS_FIRST_TABLE,
  ZOLLHAUS_TABLE_NUMBERS,
  formatZollhausTableLabel,
  getTableCapacityForDisplay,
} from "@/lib/zollhaus-tables";

/** Show roped-off tables 1–20 as faint outlines on the plan. */
export const SHOW_UNUSED_TABLES = true;

const COLORS = {
  gold: "#C9A227",
  goldStroke: "#a07d15",
  blue: "#5b7fa6",
  blueStroke: "#3d5876",
  red: "#c0392b",
  redStroke: "#922b21",
  emptyFill: "#f5f5f5",
  emptyStroke: "#cccccc",
  unusedFill: "none",
  unusedStroke: "#bbbbbb",
  unusedText: "#999999",
  partialFill: "#d4a843",
  partialStroke: "#a07d15",
};

function isUsableTableNumber(tableNumber: number): boolean {
  return tableNumber >= ZOLLHAUS_FIRST_TABLE;
}

function tableNumberToIndex(tableNumber: number): number | null {
  const idx = ZOLLHAUS_TABLE_NUMBERS.indexOf(tableNumber);
  return idx >= 0 ? idx : null;
}

function getTableColors(
  tableNumber: number,
  table: AssignedTable | null,
  allEntries: Entry[],
  allTables: AssignedTable[],
  unfulfilledWishes: AssignSeatsResult["unfulfilledWishes"]
): {
  fill: string;
  stroke: string;
  textFill: string;
  interactive: boolean;
} {
  if (tableNumber < ZOLLHAUS_FIRST_TABLE) {
    if (!SHOW_UNUSED_TABLES) {
      return {
        fill: "transparent",
        stroke: "transparent",
        textFill: "transparent",
        interactive: false,
      };
    }
    return {
      fill: COLORS.unusedFill,
      stroke: COLORS.unusedStroke,
      textFill: COLORS.unusedText,
      interactive: false,
    };
  }

  if (!table) {
    return {
      fill: COLORS.emptyFill,
      stroke: COLORS.emptyStroke,
      textFill: "#888888",
      interactive: false,
    };
  }

  const wishCtx = buildWishContext(allEntries);
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
  const overfull = !table.manuallyResolved && isTableOverfull(table);
  const isEmpty = table.entries.length === 0;

  if (overfull || satisfaction === "conflict") {
    return {
      fill: COLORS.red,
      stroke: COLORS.redStroke,
      textFill: "#ffffff",
      interactive: true,
    };
  }
  if (isEmpty) {
    return {
      fill: COLORS.emptyFill,
      stroke: COLORS.emptyStroke,
      textFill: "#666666",
      interactive: true,
    };
  }
  if (satisfaction === "full") {
    return {
      fill: COLORS.gold,
      stroke: COLORS.goldStroke,
      textFill: "#1a1a1a",
      interactive: true,
    };
  }
  if (satisfaction === "partial") {
    return {
      fill: COLORS.partialFill,
      stroke: COLORS.partialStroke,
      textFill: "#1a1a1a",
      interactive: true,
    };
  }
  return {
    fill: COLORS.blue,
    stroke: COLORS.blueStroke,
    textFill: "#ffffff",
    interactive: true,
  };
}

function FloorplanStaticLayers() {
  return (
    <>
      <path
        fill="none"
        stroke="#111"
        strokeWidth={6}
        d="M 60 360 L 1260 350 L 1740 345"
      />
      <path fill="none" stroke="#111" strokeWidth={6} d="M 1740 345 L 1745 760" />
      <path fill="none" stroke="#111" strokeWidth={6} d="M 1745 760 L 1080 765" />
      <path fill="none" stroke="#111" strokeWidth={6} d="M 760 765 L 60 770" />
      <path fill="none" stroke="#111" strokeWidth={6} d="M 60 360 L 60 770" />

      <path fill="none" stroke="#111" strokeWidth={3} d="M 30 340 L 110 340 L 110 460" />
      <path fill="none" stroke="#111" strokeWidth={3} d="M 30 460 L 30 600" />
      <path fill="none" stroke="#111" strokeWidth={3} d="M 30 600 L 110 600 L 110 720" />
      <path fill="none" stroke="#111" strokeWidth={3} d="M 30 720 L 110 720" />
      <path fill="none" stroke="#111" strokeWidth={3} d="M 110 360 L 210 460" />
      <rect
        x={62}
        y={540}
        width={40}
        height={40}
        fill="none"
        stroke="#c0392b"
        strokeWidth={1.5}
      />
      <rect
        x={30}
        y={600}
        width={20}
        height={30}
        fill="none"
        stroke="#c0392b"
        strokeWidth={1.5}
      />
      <circle cx={48} cy={420} r={7} fill="#e8c34a" />
      <circle cx={48} cy={525} r={7} fill="#e8c34a" />

      <g>
        <rect
          x={830}
          y={650}
          width={130}
          height={115}
          fill="none"
          stroke="#111"
          strokeWidth={3}
        />
        <line stroke="#111" strokeWidth={1} x1={865} y1={660} x2={865} y2={755} />
        <line stroke="#111" strokeWidth={1} x1={880} y1={660} x2={880} y2={755} />
        <line stroke="#111" strokeWidth={1} x1={895} y1={660} x2={895} y2={755} />
        <line stroke="#111" strokeWidth={1} x1={910} y1={660} x2={910} y2={755} />
        <line stroke="#111" strokeWidth={1} x1={925} y1={660} x2={925} y2={755} />
        <line stroke="#111" strokeWidth={1} x1={940} y1={660} x2={940} y2={755} />
        <circle cx={850} cy={668} r={4} fill="none" stroke="#111" strokeWidth={1} />
        <circle cx={850} cy={745} r={4} fill="none" stroke="#111" strokeWidth={1} />
      </g>

      <g>
        <path
          fill="none"
          stroke="#111"
          strokeWidth={3}
          d="M 945 765 L 945 960 L 1070 960 L 1070 765"
        />
        <line stroke="#111" strokeWidth={6} x1={985} y1={960} x2={1035} y2={960} />
        <path
          fill="none"
          stroke="#111"
          strokeWidth={1.5}
          d="M 960 850 Q 1010 850 1010 900"
        />
        <line stroke="#111" strokeWidth={1.5} x1={960} y1={850} x2={1010} y2={900} />
      </g>

      <path
        fill="none"
        stroke="#111"
        strokeWidth={1.5}
        d="M 1745 430 Q 1700 460 1700 500"
      />

      <rect
        x={1545}
        y={540}
        width={55}
        height={100}
        rx={2}
        fill="#5b7fa6"
        stroke="#3d5876"
        strokeWidth={1.5}
      />
    </>
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

export function Floorplan({
  tables,
  allEntries,
  unfulfilledWishes,
}: {
  tables: AssignedTable[];
  allEntries: Entry[];
  unfulfilledWishes: AssignSeatsResult["unfulfilledWishes"];
}) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const tableNumbers = useMemo(
    () =>
      Object.keys(TABLE_POLYGONS)
        .map(Number)
        .sort((a, b) => a - b),
    []
  );

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
      <div className="overflow-x-auto rounded-2xl border border-gold/25 bg-[#f8f6f0] touch-pan-x">
        <svg
          viewBox="0 0 1800 1280"
          xmlns="http://www.w3.org/2000/svg"
          width="100%"
          className="block min-w-[720px] h-auto"
          role="img"
          aria-label="Zollhaus Grundriss"
        >
          <FloorplanStaticLayers />

          {tableNumbers.map((tableNumber) => {
            const poly = TABLE_POLYGONS[tableNumber];
            if (!poly) return null;

            const tableIdx = tableNumberToIndex(tableNumber);
            const assignedTable =
              tableIdx !== null ? tables[tableIdx] ?? null : null;
            const colors = getTableColors(
              tableNumber,
              isUsableTableNumber(tableNumber) ? assignedTable : null,
              allEntries,
              tables,
              unfulfilledWishes
            );

            if (colors.fill === "transparent" && colors.stroke === "transparent") {
              return null;
            }

            const handleClick = () => {
              if (!colors.interactive || tableIdx === null) return;
              setSelectedIndex(tableIdx);
            };

            return (
              <g
                key={tableNumber}
                className={colors.interactive ? "cursor-pointer" : undefined}
                onClick={handleClick}
                style={
                  colors.interactive
                    ? { transition: "opacity 0.15s" }
                    : undefined
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleClick();
                  }
                }}
                role={colors.interactive ? "button" : undefined}
                tabIndex={colors.interactive ? 0 : undefined}
                aria-label={
                  colors.interactive
                    ? `Tisch ${tableNumber}`
                    : `Tisch ${tableNumber} gesperrt`
                }
              >
                <polygon
                  points={poly.points}
                  fill={colors.fill}
                  stroke={colors.stroke}
                  strokeWidth={2}
                  strokeDasharray={
                    tableNumber < ZOLLHAUS_FIRST_TABLE ? "4 3" : undefined
                  }
                  style={
                    colors.interactive
                      ? { opacity: 1 }
                      : undefined
                  }
                  className={colors.interactive ? "hover:opacity-80" : undefined}
                />
                <text
                  x={poly.tx}
                  y={poly.ty}
                  fill={colors.textFill}
                  fontSize={15}
                  fontWeight={600}
                  textAnchor="middle"
                  dominantBaseline="central"
                  pointerEvents="none"
                  fontFamily="system-ui, -apple-system, sans-serif"
                >
                  {tableNumber}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <p className="text-cream-muted/70 text-[11px] font-sans text-center">
        Gold = Wunsch erfüllt · Blau = kein Wunsch · Gelb = offen · Rot =
        Konflikt · Tisch antippen für Details · Verschieben nur in Raster-Ansicht
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
