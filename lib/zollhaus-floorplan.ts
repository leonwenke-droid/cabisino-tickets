import { ZOLLHAUS_TABLE_NUMBERS } from "@/lib/zollhaus-tables";

/**
 * Source: Zollhaus floor plan screenshot (1024×578 px).
 * Positions are % of the room interior bounding box (outer walls).
 */
export const FLOOR_PLAN_SOURCE = {
  imageWidth: 1024,
  imageHeight: 578,
  roomLeft: 32,
  roomRight: 1023,
  roomTop: 141,
  roomBottom: 380,
} as const;

/** Room width ÷ height from the floor plan image (~4.15∶1). */
export const FLOOR_ROOM_ASPECT =
  (FLOOR_PLAN_SOURCE.roomRight - FLOOR_PLAN_SOURCE.roomLeft) /
  (FLOOR_PLAN_SOURCE.roomBottom - FLOOR_PLAN_SOURCE.roomTop);

/**
 * Table center positions (% of room width/height).
 * Tables 1–38: pixel-derived from the floor plan image.
 * Tables 25–27, 29–30, 33–35, 55–57: interpolated (not on the plan).
 */
export const TABLE_POSITIONS: Record<number, { x: number; y: number }> = {
  1: { x: 8.2, y: 49.8 },
  2: { x: 11.0, y: 32.2 },
  3: { x: 14.4, y: 15.5 },
  4: { x: 20.9, y: 15.5 },
  5: { x: 17.8, y: 33.1 },
  6: { x: 14.5, y: 50.2 },
  7: { x: 11.3, y: 66.5 },
  8: { x: 8.1, y: 83.7 },
  9: { x: 14.3, y: 83.7 },
  10: { x: 17.6, y: 67.8 },
  11: { x: 20.3, y: 50.2 },
  12: { x: 23.8, y: 33.5 },
  13: { x: 26.9, y: 16.3 },
  14: { x: 33.1, y: 15.5 },
  15: { x: 30.3, y: 33.1 },
  16: { x: 26.4, y: 50.2 },
  17: { x: 23.6, y: 67.8 },
  18: { x: 20.4, y: 83.3 },
  19: { x: 26.5, y: 84.1 },
  20: { x: 30.2, y: 67.4 },
  21: { x: 33.2, y: 50.2 },
  22: { x: 36.4, y: 32.6 },
  23: { x: 39.6, y: 15.1 },
  24: { x: 46.0, y: 15.1 },
  25: { x: 46.9, y: 15.1 },
  26: { x: 47.9, y: 15.1 },
  27: { x: 48.8, y: 15.1 },
  28: { x: 33.2, y: 84.1 },
  29: { x: 39.6, y: 61.1 },
  30: { x: 46.0, y: 38.1 },
  31: { x: 52.5, y: 15.1 },
  32: { x: 58.9, y: 15.1 },
  33: { x: 59.9, y: 18.9 },
  34: { x: 60.8, y: 22.8 },
  35: { x: 61.7, y: 26.7 },
  36: { x: 62.7, y: 30.5 },
  37: { x: 65.6, y: 15.1 },
  38: { x: 71.7, y: 15.1 },
  39: { x: 68.5, y: 31.4 },
  40: { x: 65.8, y: 47.3 },
  41: { x: 62.7, y: 66.5 },
  42: { x: 61.0, y: 85.4 },
  43: { x: 66.9, y: 86.2 },
  44: { x: 68.7, y: 65.3 },
  45: { x: 71.8, y: 46.9 },
  46: { x: 74.7, y: 30.5 },
  47: { x: 77.5, y: 15.1 },
  48: { x: 83.1, y: 15.1 },
  49: { x: 80.3, y: 30.5 },
  50: { x: 77.4, y: 47.7 },
  51: { x: 74.4, y: 66.1 },
  52: { x: 72.4, y: 85.8 },
  53: { x: 78.1, y: 85.8 },
  54: { x: 80.1, y: 66.1 },
  55: { x: 81.1, y: 70.9 },
  56: { x: 82.1, y: 75.7 },
  57: { x: 83.1, y: 80.5 },
  58: { x: 84.1, y: 85.4 },
  59: { x: 89.7, y: 85.4 },
  60: { x: 92.7, y: 65.7 },
};

export type FloorRegion = {
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
  variant: "roped" | "staircase";
};

export type OtherElement = {
  x: number;
  y: number;
  w: number;
  h: number;
};

/** Fixed bar/furniture landmark (not a table). */
export const OTHER_ELEMENTS: OtherElement[] = [
  { x: 85.6, y: 49.0, w: 3.2, h: 14 },
];

/** Subtle label over the roped-off left block (tables 1–20). */
export const ROPE_OFF_REGIONS: FloorRegion[] = [
  { x: 4, y: 12, w: 36, h: 78, label: "Gesperrt (1–20)", variant: "roped" },
];

/** Central staircase / passage between the two table blocks. */
export const STAIRCASE_REGION: FloorRegion = {
  x: 40,
  y: 80,
  w: 16,
  h: 17,
  label: "Treppe",
  variant: "staircase",
};

export type FloorplanTableMarker = {
  tableIndex: number;
  tableNumber: number;
  position: { x: number; y: number };
};

export type FloorplanGhostMarker = {
  tableNumber: number;
  position: { x: number; y: number };
};

export function getRopedTableMarkers(): FloorplanGhostMarker[] {
  const markers: FloorplanGhostMarker[] = [];
  for (let n = 1; n <= 20; n++) {
    const position = TABLE_POSITIONS[n];
    if (position) markers.push({ tableNumber: n, position });
  }
  return markers;
}

export function getFloorplanTableMarkers(): FloorplanTableMarker[] {
  return ZOLLHAUS_TABLE_NUMBERS.map((tableNumber, tableIndex) => {
    const position = TABLE_POSITIONS[tableNumber];
    if (!position) return null;
    return { tableIndex, tableNumber, position };
  }).filter((m): m is FloorplanTableMarker => m !== null);
}
