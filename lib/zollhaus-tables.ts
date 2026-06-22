/** Tables 1–20 are roped off; this event uses tables 21 through 60 (40 tables). */
export const ZOLLHAUS_FIRST_TABLE = 21;
export const ZOLLHAUS_LAST_TABLE = 60;

export const ZOLLHAUS_TABLE_NUMBERS: number[] = Array.from(
  { length: ZOLLHAUS_LAST_TABLE - ZOLLHAUS_FIRST_TABLE + 1 },
  (_, i) => ZOLLHAUS_FIRST_TABLE + i
);

export const TABLE_CAPACITY = 8;
export const TABLE_CAPACITY_MAX_EXCEPTION = 9;
export const ZOLLHAUS_TABLE_COUNT = ZOLLHAUS_TABLE_NUMBERS.length;

export function getZollhausTableNumber(tableIndex: number): number {
  return ZOLLHAUS_TABLE_NUMBERS[tableIndex] ?? ZOLLHAUS_FIRST_TABLE + tableIndex;
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
