"use client";

import { useEffect, useRef } from "react";
import { FloorplanArchitecture } from "@/components/floorplan-architecture";
import { GRAYED_OUT_TABLES } from "@/lib/floorplan-extras";
import {
  floorplanPointToPercent,
  floorplanViewBoxAttr,
} from "@/lib/floorplan-viewbox";
import {
  TABLE_POLYGONS,
  type TablePolygon,
} from "@/lib/floorplan-table-polygons";
import { ZOLLHAUS_TABLE_NUMBERS } from "@/lib/zollhaus-tables";

const OCTAGON_CLIP =
  "polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)";

const COLORS = {
  dimFill: "rgba(255,255,255,0.06)",
  dimStroke: "rgba(148,163,184,0.6)",
  dimText: "rgba(203,213,225,0.85)",
  goldFill: "#C9A227",
  goldStroke: "#a07d15",
  goldText: "#111827",
  grayedFill: "#0d0d10",
  grayedStroke: "#2a2a30",
  grayedText: "#9ca3af",
};

function PlanPolygon({
  tableNumber,
  poly,
  highlighted,
}: {
  tableNumber: number;
  poly: TablePolygon;
  highlighted: boolean;
}) {
  const isGrayedOut = GRAYED_OUT_TABLES.has(tableNumber);

  if (isGrayedOut) {
    return (
      <g>
        <polygon
          points={poly.points}
          fill={COLORS.grayedFill}
          stroke={COLORS.grayedStroke}
          strokeWidth={2}
          opacity={0.25}
        />
        <text
          x={poly.tx}
          y={poly.ty}
          fill={COLORS.grayedText}
          fontSize={15}
          fontWeight={800}
          textAnchor="middle"
          dominantBaseline="central"
          pointerEvents="none"
          opacity={0.2}
          fontFamily="system-ui, -apple-system, sans-serif"
        >
          {tableNumber}
        </text>
      </g>
    );
  }

  const opacity = highlighted ? 1 : 0.42;
  const fill = highlighted ? COLORS.goldFill : COLORS.dimFill;
  const stroke = highlighted ? COLORS.goldStroke : COLORS.dimStroke;
  const textFill = highlighted ? COLORS.goldText : COLORS.dimText;
  const strokeWidth = highlighted ? 4 : 2;
  const transform = highlighted
    ? `translate(${poly.tx} ${poly.ty}) scale(1.15) translate(${-poly.tx} ${-poly.ty})`
    : undefined;

  return (
    <g transform={transform} style={{ transition: "opacity 0.2s, transform 0.2s" }}>
      <polygon
        points={poly.points}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        opacity={opacity}
        style={
          highlighted
            ? {
                filter:
                  "drop-shadow(0 0 14px rgba(201,162,39,0.95)) drop-shadow(0 0 28px rgba(201,162,39,0.45))",
              }
            : undefined
        }
        className={highlighted ? "animate-pulse-gold" : undefined}
      />
      <text
        x={poly.tx}
        y={poly.ty}
        fill={textFill}
        fontSize={highlighted ? 20 : 15}
        fontWeight={800}
        textAnchor="middle"
        dominantBaseline="central"
        pointerEvents="none"
        opacity={opacity}
        fontFamily="system-ui, -apple-system, sans-serif"
        style={highlighted ? { textShadow: "0 0 12px rgba(201,162,39,0.55)" } : undefined}
      >
        {tableNumber}
      </text>
    </g>
  );
}

function VisualOnlyTable({
  tableNumber,
  poly,
  highlighted,
}: {
  tableNumber: number;
  poly: TablePolygon;
  highlighted: boolean;
}) {
  const opacity = highlighted ? 1 : 0.42;
  const fill = highlighted ? COLORS.goldFill : COLORS.dimFill;
  const stroke = highlighted ? COLORS.goldStroke : COLORS.dimStroke;
  const textFill = highlighted ? COLORS.goldText : COLORS.dimText;
  const strokeWidth = highlighted ? 4 : 2;
  const transform = highlighted
    ? `translate(${poly.tx} ${poly.ty}) scale(1.15) translate(${-poly.tx} ${-poly.ty})`
    : undefined;

  return (
    <g transform={transform} style={{ transition: "opacity 0.2s, transform 0.2s" }}>
      <polygon
        points={poly.points}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        opacity={opacity}
        style={
          highlighted
            ? {
                filter:
                  "drop-shadow(0 0 14px rgba(201,162,39,0.95)) drop-shadow(0 0 28px rgba(201,162,39,0.45))",
              }
            : undefined
        }
        className={highlighted ? "animate-pulse-gold" : undefined}
      />
      <text
        x={poly.tx}
        y={poly.ty}
        fill={textFill}
        fontSize={highlighted ? 20 : 15}
        fontWeight={800}
        textAnchor="middle"
        dominantBaseline="central"
        pointerEvents="none"
        opacity={opacity}
        fontFamily="system-ui, -apple-system, sans-serif"
        style={highlighted ? { textShadow: "0 0 12px rgba(201,162,39,0.55)" } : undefined}
      >
        {tableNumber}
      </text>
    </g>
  );
}

export function PublicFloorplan({
  highlightTableNumber,
}: {
  highlightTableNumber: number;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = scrollRef.current;
    const poly = TABLE_POLYGONS[highlightTableNumber];
    if (!container || !poly) return;

    const { left } = floorplanPointToPercent(poly.tx, poly.ty);
    const targetX =
      (left / 100) * container.scrollWidth - container.clientWidth / 2;
    container.scrollTo({ left: Math.max(0, targetX), behavior: "smooth" });
  }, [highlightTableNumber]);

  const planTables = ZOLLHAUS_TABLE_NUMBERS.flatMap((tableNumber) => {
    const poly = TABLE_POLYGONS[tableNumber];
    if (!poly) return [];
    return [{ tableNumber, poly }];
  });

  const visualOnlyTables = Object.keys(TABLE_POLYGONS)
    .map(Number)
    .filter((tableNumber) => !ZOLLHAUS_TABLE_NUMBERS.includes(tableNumber))
    .flatMap((tableNumber) => {
      const poly = TABLE_POLYGONS[tableNumber];
      if (!poly) return [];
      return [{ tableNumber, poly }];
    });

  const allDisplayTables = [...planTables, ...visualOnlyTables];

  return (
    <div
      ref={scrollRef}
      className="w-full overflow-x-auto overflow-y-hidden touch-pan-x rounded-2xl border border-gold/25 bg-black/20 max-sm:rounded-none max-sm:border-x-0 max-sm:h-[58vh] sm:h-[400px]"
    >
      <div className="relative inline-block h-full">
        <svg
          viewBox={floorplanViewBoxAttr()}
          xmlns="http://www.w3.org/2000/svg"
          className="block h-full w-auto max-w-none"
          role="img"
          aria-label="Tischplan"
        >
          <FloorplanArchitecture />
          {planTables.map(({ tableNumber, poly }) => (
            <PlanPolygon
              key={tableNumber}
              tableNumber={tableNumber}
              poly={poly}
              highlighted={tableNumber === highlightTableNumber}
            />
          ))}
          {visualOnlyTables.map(({ tableNumber, poly }) => (
            <VisualOnlyTable
              key={tableNumber}
              tableNumber={tableNumber}
              poly={poly}
              highlighted={tableNumber === highlightTableNumber}
            />
          ))}
        </svg>

        <div className="absolute inset-0 pointer-events-none">
          {allDisplayTables.map(({ poly, tableNumber }) => {
            if (GRAYED_OUT_TABLES.has(tableNumber)) return null;

            return (
              <div
                key={tableNumber}
                className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  left: `${floorplanPointToPercent(poly.tx, poly.ty).left}%`,
                  top: `${floorplanPointToPercent(poly.tx, poly.ty).top}%`,
                  width: "4.8%",
                  minWidth: 48,
                  aspectRatio: "1",
                  clipPath: OCTAGON_CLIP,
                  opacity: tableNumber === highlightTableNumber ? 1 : 0.22,
                  boxShadow:
                    tableNumber === highlightTableNumber
                      ? "0 0 0 2px rgba(201,162,39,0.35)"
                      : "none",
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
