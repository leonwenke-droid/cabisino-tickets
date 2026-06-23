"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type { Entry } from "@/lib/supabase";
import {
  abbreviateName,
  buildSeatGroups,
  buildWishContext,
  formatEntryLabel,
  getTableSatisfaction,
  isTableOverfull,
  type AssignSeatsResult,
  type AssignedTable,
  type SeatGroup,
} from "@/lib/assign-seats";
import {
  TABLE_POLYGONS,
  type TablePolygon,
} from "@/lib/floorplan-table-polygons";
import {
  TABLE_CAPACITY,
  ZOLLHAUS_TABLE_NUMBERS,
  formatZollhausTableLabel,
  getTableCapacityForDisplay,
  isBufferTableIndex,
} from "@/lib/zollhaus-tables";

const VIEWBOX = { w: 1800, h: 1280 };

const OCTAGON_CLIP =
  "polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)";

const COLORS = {
  gold: "#C9A227",
  goldStroke: "#a07d15",
  red: "#c0392b",
  redStroke: "#922b21",
  emptyFill: "rgba(255,255,255,0.06)",
  emptyStroke: "#4b5563",
  occupiedFill: "#C9A227",
  occupiedStroke: "#a07d15",
  bufferFill: "rgba(255,255,255,0.04)",
  bufferStroke: "#6b7280",
};

function getPolygonBadgeAnchor(poly: TablePolygon): { x: number; y: number } {
  const coords = poly.points.trim().split(/\s+/);
  let maxX = 0;
  let maxY = 0;
  for (const pair of coords) {
    const [x, y] = pair.split(",").map(Number);
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  const inset = 0.42;
  return {
    x: maxX + (poly.tx - maxX) * inset,
    y: maxY + (poly.ty - maxY) * inset,
  };
}

function getOccupancyBadgeStyle(table: AssignedTable): {
  stroke: string;
  fill: string;
  textFill: string;
} {
  if (table.seatsUsed === 0) {
    return {
      stroke: "#6b7280",
      fill: "#1a1a22",
      textFill: "#9ca3af",
    };
  }
  if (table.seatsUsed > TABLE_CAPACITY) {
    return {
      stroke: "#c0392b",
      fill: "#2a1210",
      textFill: "#f0a8a0",
    };
  }
  return {
    stroke: "#C9A227",
    fill: "#1a1810",
    textFill: "#e8d48a",
  };
}

function floorplanTableId(tableIdx: number): string {
  return `fp-table-${tableIdx}`;
}

function parseFloorplanTableId(id: unknown): number | null {
  if (typeof id !== "string" || !/^fp-table-\d+$/.test(id)) return null;
  const idx = parseInt(id.replace("fp-table-", ""), 10);
  return Number.isFinite(idx) && idx >= 0 ? idx : null;
}

function getTableColors(
  table: AssignedTable,
  tableIdx: number
): {
  fill: string;
  stroke: string;
  textFill: string;
  interactive: boolean;
} {
  if (isBufferTableIndex(tableIdx)) {
    return {
      fill: COLORS.bufferFill,
      stroke: COLORS.bufferStroke,
      textFill: "#9ca3af",
      interactive: false,
    };
  }

  const overfull = isTableOverfull(table);
  const isEmpty = table.entries.length === 0;

  if (overfull) {
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
      textFill: "#9ca3af",
      interactive: true,
    };
  }
  return {
    fill: COLORS.occupiedFill,
    stroke: COLORS.occupiedStroke,
    textFill: "#1a1a1a",
    interactive: true,
  };
}

function getPrimaryGroupLabel(
  table: AssignedTable | null,
  tableNumber: number
): string {
  if (!table || table.entries.length === 0) return `Tisch ${tableNumber}`;
  return abbreviateName(table.entries[0]);
}

function FloorplanStaticLayers() {
  const wall = "#9ca3af";
  const wallThin = "#6b7280";

  return (
    <>
      <path
        fill="none"
        stroke={wall}
        strokeWidth={6}
        d="M 60 360 L 1260 350 L 1740 345"
      />
      <path fill="none" stroke={wall} strokeWidth={6} d="M 1740 345 L 1745 760" />
      <path fill="none" stroke={wall} strokeWidth={6} d="M 1745 760 L 1080 765" />
      <path fill="none" stroke={wall} strokeWidth={6} d="M 760 765 L 60 770" />
      <path fill="none" stroke={wall} strokeWidth={6} d="M 60 360 L 60 770" />

      <path fill="none" stroke={wallThin} strokeWidth={3} d="M 30 340 L 110 340 L 110 460" />
      <path fill="none" stroke={wallThin} strokeWidth={3} d="M 30 460 L 30 600" />
      <path fill="none" stroke={wallThin} strokeWidth={3} d="M 30 600 L 110 600 L 110 720" />
      <path fill="none" stroke={wallThin} strokeWidth={3} d="M 30 720 L 110 720" />
      <path fill="none" stroke={wallThin} strokeWidth={3} d="M 110 360 L 210 460" />
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
          stroke={wallThin}
          strokeWidth={3}
        />
        <line stroke={wallThin} strokeWidth={1} x1={865} y1={660} x2={865} y2={755} />
        <line stroke={wallThin} strokeWidth={1} x1={880} y1={660} x2={880} y2={755} />
        <line stroke={wallThin} strokeWidth={1} x1={895} y1={660} x2={895} y2={755} />
        <line stroke={wallThin} strokeWidth={1} x1={910} y1={660} x2={910} y2={755} />
        <line stroke={wallThin} strokeWidth={1} x1={925} y1={660} x2={925} y2={755} />
        <line stroke={wallThin} strokeWidth={1} x1={940} y1={660} x2={940} y2={755} />
        <circle cx={850} cy={668} r={4} fill="none" stroke={wallThin} strokeWidth={1} />
        <circle cx={850} cy={745} r={4} fill="none" stroke={wallThin} strokeWidth={1} />
      </g>

      <g>
        <path
          fill="none"
          stroke={wallThin}
          strokeWidth={3}
          d="M 945 765 L 945 960 L 1070 960 L 1070 765"
        />
        <line stroke={wall} strokeWidth={6} x1={985} y1={960} x2={1035} y2={960} />
        <path
          fill="none"
          stroke={wallThin}
          strokeWidth={1.5}
          d="M 960 850 Q 1010 850 1010 900"
        />
        <line stroke={wallThin} strokeWidth={1.5} x1={960} y1={850} x2={1010} y2={900} />
      </g>

      <path
        fill="none"
        stroke={wallThin}
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

function FloorplanTablePolygon({
  tableNumber,
  poly,
  table,
  colors,
  isBuffer,
  isDragging,
  isDropTarget,
  isDimmed,
  isSwapSource,
}: {
  tableNumber: number;
  poly: TablePolygon;
  table: AssignedTable;
  colors: ReturnType<typeof getTableColors>;
  isBuffer?: boolean;
  isDragging?: boolean;
  isDropTarget?: boolean;
  isDimmed?: boolean;
  isSwapSource?: boolean;
}) {
  const stroke = isDropTarget || isSwapSource ? COLORS.gold : colors.stroke;
  const strokeWidth = isDropTarget || isSwapSource ? 4 : isDragging ? 3 : 2;
  const opacity = isDimmed ? 0.6 : isDragging ? 0.35 : 1;
  const transform =
    isDragging || isDropTarget
      ? `translate(${poly.tx} ${poly.ty}) scale(${isDropTarget ? 1.08 : 1.1}) translate(${-poly.tx} ${-poly.ty})`
      : undefined;
  const badgeAnchor = getPolygonBadgeAnchor(poly);
  const badgeStyle = getOccupancyBadgeStyle(table);
  const seatCap = getTableCapacityForDisplay(table.seatsUsed);
  const occupancyLabel = `${table.seatsUsed}/${seatCap}`;

  return (
    <g transform={transform} style={{ transition: "opacity 0.15s" }}>
      <polygon
        points={poly.points}
        fill={colors.fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        opacity={opacity}
        style={
          isDragging
            ? { filter: "drop-shadow(0 4px 12px rgba(201,162,39,0.55))" }
            : isDropTarget
              ? { filter: "drop-shadow(0 0 10px rgba(201,162,39,0.85))" }
              : undefined
        }
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
        opacity={opacity}
        fontFamily="system-ui, -apple-system, sans-serif"
      >
        {tableNumber}
      </text>
      {isBuffer ? (
        <text
          x={poly.tx}
          y={poly.ty + 14}
          fill="#9ca3af"
          fontSize={8}
          fontWeight={600}
          textAnchor="middle"
          dominantBaseline="central"
          pointerEvents="none"
          opacity={opacity}
          fontFamily="system-ui, -apple-system, sans-serif"
        >
          Puffer
        </text>
      ) : (
      <g opacity={opacity} pointerEvents="none">
        <rect
          x={badgeAnchor.x - 17}
          y={badgeAnchor.y - 9}
          width={34}
          height={16}
          rx={8}
          fill={badgeStyle.fill}
          stroke={badgeStyle.stroke}
          strokeWidth={1.25}
        />
        <text
          x={badgeAnchor.x}
          y={badgeAnchor.y + 1}
          fill={badgeStyle.textFill}
          fontSize={10}
          fontWeight={600}
          textAnchor="middle"
          dominantBaseline="central"
          fontFamily="system-ui, -apple-system, sans-serif"
        >
          {occupancyLabel}
        </text>
      </g>
      )}
    </g>
  );
}

function TableHoverTooltip({
  tableNumber,
  table,
  poly,
  isBuffer,
}: {
  tableNumber: number;
  table: AssignedTable;
  poly: TablePolygon;
  isBuffer?: boolean;
}) {
  const occupied = buildSeatGroups(table).filter(
    (g): g is Extract<SeatGroup, { type: "occupied" }> => g.type === "occupied"
  );

  return (
    <div
      className="absolute z-40 pointer-events-none"
      style={{
        left: `${(poly.tx / VIEWBOX.w) * 100}%`,
        top: `${(poly.ty / VIEWBOX.h) * 100}%`,
        transform: "translate(-50%, calc(-100% - 10px))",
      }}
    >
      <div className="rounded-lg border border-gold/45 bg-[#1a1a22]/95 backdrop-blur-sm px-2.5 py-2 shadow-[0_4px_16px_rgba(0,0,0,0.35)] min-w-[110px] max-w-[200px] animate-fade-in">
        <p className="text-[10px] text-gold font-sans font-medium mb-1 tabular-nums">
          Tisch {tableNumber}
          {isBuffer ? " · Puffer" : ""}
        </p>
        {isBuffer ? (
          <p className="text-[11px] text-cream-muted font-sans">
            Freihalten für Umplanungen
          </p>
        ) : occupied.length === 0 ? (
          <p className="text-[11px] text-cream-muted font-sans">Frei</p>
        ) : (
          <ul className="space-y-0.5">
            {occupied.map((group) => (
              <li
                key={group.entry.id}
                className="text-[11px] text-cream font-sans leading-snug"
              >
                {group.entry.vorname} {group.entry.nachname}
                {group.guestLabels.length > 0 && (
                  <span className="text-cream-muted">
                    {" "}
                    +{group.guestLabels.length}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function FloorplanTableHitArea({
  tableIdx,
  tableNumber,
  poly,
  swapMode,
  disabled,
  bufferTable,
  isDropTarget,
  onTap,
  onHoverChange,
}: {
  tableIdx: number;
  tableNumber: number;
  poly: TablePolygon;
  swapMode: boolean;
  disabled?: boolean;
  bufferTable?: boolean;
  isDropTarget?: boolean;
  onTap: () => void;
  onHoverChange: (tableIdx: number | null) => void;
}) {
  const id = floorplanTableId(tableIdx);
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } =
    useDraggable({
      id,
      disabled: disabled || swapMode || bufferTable,
    });
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id,
    disabled: bufferTable,
  });

  const setRef = useCallback(
    (node: HTMLButtonElement | null) => {
      setDragRef(node);
      setDropRef(node);
    },
    [setDragRef, setDropRef]
  );

  const showTargetRing = isDropTarget || isOver;

  return (
    <button
      type="button"
      ref={setRef}
      className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full touch-none ${
        swapMode ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"
      } ${showTargetRing ? "ring-2 ring-gold animate-pulse-gold scale-110 z-20" : "z-10"} ${
        isDragging ? "opacity-0" : ""
      }`}
      style={{
        left: `${(poly.tx / VIEWBOX.w) * 100}%`,
        top: `${(poly.ty / VIEWBOX.h) * 100}%`,
        width: "4.8%",
        minWidth: 48,
        aspectRatio: "1",
        clipPath: OCTAGON_CLIP,
      }}
      onClick={onTap}
      onMouseEnter={() => onHoverChange(tableIdx)}
      onMouseLeave={() => onHoverChange(null)}
      onFocus={() => onHoverChange(tableIdx)}
      onBlur={() => onHoverChange(null)}
      aria-label={`Tisch ${tableNumber}`}
      {...(swapMode ? {} : { ...listeners, ...attributes })}
    />
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

function SwapConfirmDialog({
  tableIndexA,
  tableIndexB,
  tables,
  onConfirm,
  onCancel,
}: {
  tableIndexA: number;
  tableIndexB: number;
  tables: AssignedTable[];
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const tableA = tables[tableIndexA];
  const tableB = tables[tableIndexB];
  const numA = ZOLLHAUS_TABLE_NUMBERS[tableIndexA];
  const numB = ZOLLHAUS_TABLE_NUMBERS[tableIndexB];

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onCancel}
      role="presentation"
    >
      <div
        className="felt-card w-full max-w-sm rounded-2xl border border-gold/30 p-5 shadow-2xl animate-fade-in"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <h3 className="font-serif text-lg text-gold mb-2">Tische tauschen?</h3>
        <p className="text-cream-muted text-sm font-sans mb-4">
          Tisch {numA} ({getPrimaryGroupLabel(tableA, numA)}) und Tisch {numB} (
          {getPrimaryGroupLabel(tableB, numB)}) komplett tauschen?
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
            className="px-4 py-2 rounded-xl text-sm font-sans bg-gold/20 text-gold border border-gold/40 hover:bg-gold/30"
          >
            Tauschen
          </button>
        </div>
      </div>
    </div>
  );
}

export function Floorplan({
  tables,
  allEntries,
  unfulfilledWishes,
  onSwapTables,
}: {
  tables: AssignedTable[];
  allEntries: Entry[];
  unfulfilledWishes: AssignSeatsResult["unfulfilledWishes"];
  onSwapTables: (indexA: number, indexB: number) => void;
}) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [swapMode, setSwapMode] = useState(false);
  const [swapSourceIdx, setSwapSourceIdx] = useState<number | null>(null);
  const [swapPending, setSwapPending] = useState<{
    a: number;
    b: number;
  } | null>(null);
  const [activeDragIdx, setActiveDragIdx] = useState<number | null>(null);
  const [overDropIdx, setOverDropIdx] = useState<number | null>(null);
  const [hoveredTableIdx, setHoveredTableIdx] = useState<number | null>(null);
  const skipTapAfterDragRef = useRef(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    })
  );

  const planTables = useMemo(
    () =>
      ZOLLHAUS_TABLE_NUMBERS.flatMap((tableNumber, tableIdx) => {
        const poly = TABLE_POLYGONS[tableNumber];
        const table = tables[tableIdx];
        if (!poly || !table) return [];
        return [{ tableNumber, tableIdx, poly, table }];
      }),
    [tables]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedIndex(null);
        setSwapPending(null);
        setSwapSourceIdx(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!swapMode) {
      setSwapSourceIdx(null);
      setSwapPending(null);
    }
  }, [swapMode]);

  const commitSwap = useCallback(
    (indexA: number, indexB: number) => {
      if (indexA === indexB) return;
      if (isBufferTableIndex(indexA) || isBufferTableIndex(indexB)) return;
      onSwapTables(indexA, indexB);
      setSwapSourceIdx(null);
      setSwapPending(null);
    },
    [onSwapTables]
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const idx = parseFloorplanTableId(event.active.id);
    setActiveDragIdx(idx);
    setOverDropIdx(null);
    setHoveredTableIdx(null);
    setSelectedIndex(null);
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const idx = event.over ? parseFloorplanTableId(event.over.id) : null;
    setOverDropIdx(idx);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const sourceIdx = parseFloorplanTableId(event.active.id);
      const targetIdx = event.over ? parseFloorplanTableId(event.over.id) : null;

      setActiveDragIdx(null);
      setOverDropIdx(null);

      if (sourceIdx === null || targetIdx === null || sourceIdx === targetIdx) {
        skipTapAfterDragRef.current = sourceIdx !== null;
        window.setTimeout(() => {
          skipTapAfterDragRef.current = false;
        }, 120);
        return;
      }

      skipTapAfterDragRef.current = true;
      window.setTimeout(() => {
        skipTapAfterDragRef.current = false;
      }, 120);

      commitSwap(sourceIdx, targetIdx);
    },
    [commitSwap]
  );

  const handleDragCancel = useCallback(() => {
    setActiveDragIdx(null);
    setOverDropIdx(null);
    skipTapAfterDragRef.current = true;
    window.setTimeout(() => {
      skipTapAfterDragRef.current = false;
    }, 120);
  }, []);

  const handleTableTap = useCallback(
    (tableIdx: number) => {
      if (skipTapAfterDragRef.current) return;
      if (isBufferTableIndex(tableIdx) && swapMode) return;

      if (swapMode) {
        if (swapSourceIdx === null) {
          setSwapSourceIdx(tableIdx);
          return;
        }
        if (swapSourceIdx === tableIdx) {
          setSwapSourceIdx(null);
          return;
        }
        setSwapPending({ a: swapSourceIdx, b: tableIdx });
        return;
      }
      setSelectedIndex(tableIdx);
    },
    [swapMode, swapSourceIdx]
  );

  const selectedTable =
    selectedIndex !== null ? tables[selectedIndex] ?? null : null;

  const dragTable =
    activeDragIdx !== null ? tables[activeDragIdx] ?? null : null;
  const dragTableNumber =
    activeDragIdx !== null ? ZOLLHAUS_TABLE_NUMBERS[activeDragIdx] : null;

  const isDragActive = activeDragIdx !== null;

  const hoveredTable = useMemo(() => {
    if (hoveredTableIdx === null || isDragActive || selectedIndex !== null) {
      return null;
    }
    return planTables.find((t) => t.tableIdx === hoveredTableIdx) ?? null;
  }, [hoveredTableIdx, isDragActive, selectedIndex, planTables]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setSwapMode((v) => !v)}
          className={`px-3 py-1.5 rounded-xl text-xs font-sans border transition-colors ${
            swapMode
              ? "bg-gold/20 text-gold border-gold/50"
              : "text-cream-muted border-gold/20 hover:text-cream hover:border-gold/35"
          }`}
        >
          {swapMode ? "Tauschen-Modus aktiv" : "Tauschen-Modus"}
        </button>
        {swapMode && (
          <p className="text-cream-muted/70 text-[11px] font-sans">
            {swapSourceIdx === null
              ? "Ersten Tisch antippen"
              : "Zweiten Tisch antippen zum Tauschen"}
          </p>
        )}
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="overflow-x-auto rounded-2xl border border-gold/25 touch-pan-x">
          <div className="relative min-w-[720px]">
            <svg
              viewBox={`0 0 ${VIEWBOX.w} ${VIEWBOX.h}`}
              xmlns="http://www.w3.org/2000/svg"
              width="100%"
              className="block h-auto"
              role="img"
              aria-label="Zollhaus Grundriss"
            >
              <FloorplanStaticLayers />

              {planTables.map(({ tableNumber, tableIdx, poly, table }) => {
                const colors = getTableColors(table, tableIdx);
                const isBuffer = isBufferTableIndex(tableIdx);

                const isDragging = activeDragIdx === tableIdx;
                const isDropTarget =
                  overDropIdx === tableIdx && activeDragIdx !== tableIdx;
                const isDimmed =
                  isDragActive &&
                  tableIdx !== activeDragIdx &&
                  tableIdx !== overDropIdx;
                const isSwapSource =
                  swapMode && swapSourceIdx === tableIdx;

                return (
                  <FloorplanTablePolygon
                    key={tableNumber}
                    tableNumber={tableNumber}
                    poly={poly}
                    table={table}
                    colors={colors}
                    isBuffer={isBuffer}
                    isDragging={isDragging}
                    isDropTarget={isDropTarget}
                    isDimmed={isDimmed}
                    isSwapSource={isSwapSource}
                  />
                );
              })}
            </svg>

            <div className="absolute inset-0 pointer-events-none">
              {planTables.map(({ tableNumber, tableIdx, poly }) => (
                <div key={tableNumber} className="pointer-events-auto">
                  <FloorplanTableHitArea
                    tableIdx={tableIdx}
                    tableNumber={tableNumber}
                    poly={poly}
                    swapMode={swapMode}
                    bufferTable={isBufferTableIndex(tableIdx)}
                    disabled={isDragActive && activeDragIdx !== tableIdx}
                    isDropTarget={
                      overDropIdx === tableIdx && activeDragIdx !== tableIdx
                    }
                    onTap={() => handleTableTap(tableIdx)}
                    onHoverChange={setHoveredTableIdx}
                  />
                </div>
              ))}

              {hoveredTable && (
                <TableHoverTooltip
                  tableNumber={hoveredTable.tableNumber}
                  table={hoveredTable.table}
                  poly={hoveredTable.poly}
                  isBuffer={isBufferTableIndex(hoveredTable.tableIdx)}
                />
              )}
            </div>
          </div>
        </div>

        <DragOverlay dropAnimation={null}>
          {dragTable && dragTableNumber !== null && activeDragIdx !== null ? (
            <div className="pointer-events-none flex flex-col items-center gap-1.5">
              <div
                className="w-14 h-14 flex items-center justify-center bg-[#C9A227] border-2 border-gold shadow-[0_8px_24px_rgba(201,162,39,0.45)] scale-110"
                style={{ clipPath: OCTAGON_CLIP }}
              >
                <span className="font-sans font-bold text-[#1a1a1a] text-sm tabular-nums">
                  {dragTableNumber}
                </span>
              </div>
              <span className="text-xs font-sans bg-surface-2/95 text-gold px-2.5 py-1 rounded-full border border-gold/40 shadow-lg whitespace-nowrap max-w-[200px] truncate">
                {getPrimaryGroupLabel(dragTable, dragTableNumber)}
              </span>
              {overDropIdx !== null && overDropIdx !== activeDragIdx && (
                <span className="text-[10px] font-sans text-gold bg-black/85 px-2 py-0.5 rounded border border-gold/30">
                  ⇄ Tauschen
                </span>
              )}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <p className="text-cream-muted/70 text-[11px] font-sans text-center">
        Tisch ziehen und auf anderen Tisch legen zum Tauschen · Hover für
        Namen · Antippen für Details · Raster-Ansicht für Einzelplätze
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

      {swapPending && (
        <SwapConfirmDialog
          tableIndexA={swapPending.a}
          tableIndexB={swapPending.b}
          tables={tables}
          onConfirm={() => commitSwap(swapPending.a, swapPending.b)}
          onCancel={() => {
            setSwapPending(null);
            setSwapSourceIdx(null);
          }}
        />
      )}
    </div>
  );
}
