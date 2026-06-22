/** Physical table numbers available at the Zollhaus for this event (tables 1–20 are roped off). */
export const ZOLLHAUS_TABLE_NUMBERS: number[] = [
  21, 22,
  32, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 58, 59, 60,
];

export const TABLE_CAPACITY = 8;
export const TABLE_CAPACITY_MAX_EXCEPTION = 9;
export const ZOLLHAUS_TABLE_COUNT = ZOLLHAUS_TABLE_NUMBERS.length;

export function getZollhausTableNumber(tableIndex: number): number {
  return ZOLLHAUS_TABLE_NUMBERS[tableIndex] ?? tableIndex + 1;
}

export function formatZollhausTableLabel(tableIndex: number): string {
  return `Tisch ${getZollhausTableNumber(tableIndex)}`;
}

export function getMaxVenueCapacity(): number {
  return ZOLLHAUS_TABLE_COUNT * TABLE_CAPACITY_MAX_EXCEPTION;
}

export function getTableCapacityForDisplay(seatsUsed: number): number {
  return seatsUsed > TABLE_CAPACITY
    ? TABLE_CAPACITY_MAX_EXCEPTION
    : TABLE_CAPACITY;
}
