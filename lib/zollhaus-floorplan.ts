import { ZOLLHAUS_TABLE_NUMBERS } from "@/lib/zollhaus-tables";

/** Room width : height (wide rectangle matching the venue). */
export const FLOOR_ROOM_ASPECT = 3;

/**
 * Table center positions as % of room width/height.
 * Tweak these values after comparing with the venue PDF.
 */
export const TABLE_POSITIONS: Record<number, { x: number; y: number }> = {
  21: { x: 36, y: 78 },
  22: { x: 41, y: 60 },
  32: { x: 62, y: 18 },
  36: { x: 67, y: 36 },
  37: { x: 70, y: 18 },
  38: { x: 76, y: 18 },
  39: { x: 73, y: 36 },
  40: { x: 70, y: 53 },
  41: { x: 67, y: 68 },
  42: { x: 65, y: 84 },
  43: { x: 71, y: 84 },
  44: { x: 73, y: 68 },
  45: { x: 76, y: 53 },
  46: { x: 79, y: 36 },
  47: { x: 82, y: 18 },
  48: { x: 88, y: 18 },
  49: { x: 85, y: 36 },
  50: { x: 82, y: 53 },
  51: { x: 79, y: 68 },
  52: { x: 77, y: 84 },
  53: { x: 83, y: 84 },
  54: { x: 88, y: 68 },
  58: { x: 89, y: 84 },
  59: { x: 95, y: 84 },
  60: { x: 95, y: 68 },
};

export type FloorRegion = {
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
  variant: "roped" | "staircase";
};

/** Roped-off zones (tables 1–20, 23–31, 33–35) — adjust to match the PDF. */
export const ROPE_OFF_REGIONS: FloorRegion[] = [
  { x: 1, y: 5, w: 33, h: 90, label: "Gesperrt", variant: "roped" },
  { x: 54, y: 3, w: 10, h: 14, label: "Gesperrt", variant: "roped" },
];

/** Central staircase / passage between the two table blocks. */
export const STAIRCASE_REGION: FloorRegion = {
  x: 46,
  y: 20,
  w: 9,
  h: 58,
  label: "Treppe",
  variant: "staircase",
};

export type FloorplanTableMarker = {
  tableIndex: number;
  tableNumber: number;
  position: { x: number; y: number };
};

export function getFloorplanTableMarkers(): FloorplanTableMarker[] {
  return ZOLLHAUS_TABLE_NUMBERS.map((tableNumber, tableIndex) => {
    const position = TABLE_POSITIONS[tableNumber];
    if (!position) return null;
    return { tableIndex, tableNumber, position };
  }).filter((m): m is FloorplanTableMarker => m !== null);
}
