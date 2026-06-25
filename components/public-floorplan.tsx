"use client";

import {
  TABLE_POLYGONS,
  type TablePolygon,
} from "@/lib/floorplan-table-polygons";
import { ZOLLHAUS_TABLE_NUMBERS } from "@/lib/zollhaus-tables";

const VIEWBOX = { w: 1800, h: 1280 };

const OCTAGON_CLIP =
  "polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)";

const COLORS = {
  dimFill: "rgba(255,255,255,0.03)",
  dimStroke: "rgba(148,163,184,0.35)",
  dimText: "rgba(148,163,184,0.55)",
  goldFill: "#C9A227",
  goldStroke: "#a07d15",
  goldText: "#111827",
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
  const opacity = highlighted ? 1 : 0.18;
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

function EntranceMarker() {
  const x = VIEWBOX.w / 2;
  const y = VIEWBOX.h - 60;
  return (
    <g opacity={0.9}>
      <path
        d={`M ${x} ${y} L ${x} ${y - 38}`}
        stroke="rgba(201,162,39,0.9)"
        strokeWidth={4}
        strokeLinecap="round"
      />
      <path
        d={`M ${x} ${y - 38} L ${x - 14} ${y - 22} M ${x} ${y - 38} L ${x + 14} ${
          y - 22
        }`}
        stroke="rgba(201,162,39,0.9)"
        strokeWidth={4}
        strokeLinecap="round"
      />
      <text
        x={x}
        y={y + 18}
        fill="rgba(245,239,221,0.9)"
        fontSize={14}
        fontWeight={700}
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="system-ui, -apple-system, sans-serif"
      >
        Eingang
      </text>
    </g>
  );
}

export function PublicFloorplan({
  highlightTableNumber,
}: {
  highlightTableNumber: number;
}) {
  const planTables = ZOLLHAUS_TABLE_NUMBERS.flatMap((tableNumber) => {
    const poly = TABLE_POLYGONS[tableNumber];
    if (!poly) return [];
    return [{ tableNumber, poly }];
  });

  return (
    <div className="overflow-x-auto rounded-2xl border border-gold/25 bg-black/20">
      <div className="relative min-w-[720px]">
        <svg
          viewBox={`0 0 ${VIEWBOX.w} ${VIEWBOX.h}`}
          xmlns="http://www.w3.org/2000/svg"
          width="100%"
          className="block h-auto"
          role="img"
          aria-label="Tischplan"
        >
          <EntranceMarker />
          {planTables.map(({ tableNumber, poly }) => (
            <PlanPolygon
              key={tableNumber}
              tableNumber={tableNumber}
              poly={poly}
              highlighted={tableNumber === highlightTableNumber}
            />
          ))}
        </svg>

        <div className="absolute inset-0 pointer-events-none">
          {planTables.map(({ poly, tableNumber }) => (
            <div
              key={tableNumber}
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                left: `${(poly.tx / VIEWBOX.w) * 100}%`,
                top: `${(poly.ty / VIEWBOX.h) * 100}%`,
                width: "4.8%",
                minWidth: 48,
                aspectRatio: "1",
                clipPath: OCTAGON_CLIP,
                opacity: tableNumber === highlightTableNumber ? 1 : 0.12,
                boxShadow:
                  tableNumber === highlightTableNumber
                    ? "0 0 0 2px rgba(201,162,39,0.35)"
                    : "none",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

