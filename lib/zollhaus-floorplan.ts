import { ZOLLHAUS_TABLE_NUMBERS } from "@/lib/zollhaus-tables";

/** Room width : height (wide rectangle matching the venue). */
export const FLOOR_ROOM_ASPECT = 3;

/**
 * Table center positions as % of room width/height.
 * Tweak these values after comparing with the venue PDF.
 */
export const TABLE_POSITIONS: Record<number, { x: number; y: number }> = {
  // Left block
  21: { x: 36, y: 78 },
  22: { x: 41, y: 60 },
  23: { x: 30, y: 42 },
  24: { x: 35, y: 42 },
  25: { x: 38, y: 28 },
  26: { x: 33, y: 28 },
  27: { x: 28, y: 28 },
  28: { x: 30, y: 55 },
  29: { x: 35, y: 55 },
  30: { x: 38, y: 68 },
  31: { x: 33, y: 68 },
  32: { x: 62, y: 18 },
  33: { x: 48, y: 18 },
  34: { x: 52, y: 18 },
  35: { x: 56, y: 18 },
  // Right block
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
  55: { x: 86, y: 84 },
  56: { x: 92, y: 53 },
  57: { x: 91, y: 68 },
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

/** Tables 1–20 only — adjust to match the PDF. */
export const ROPE_OFF_REGIONS: FloorRegion[] = [
  { x: 1, y: 5, w: 33, h: 90, label: "Gesperrt (1–20)", variant: "roped" },
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
