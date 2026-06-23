/** All physically existing tables in the Zollhaus (no 25–27, 29–30, 33–35, 55–57). */
export const ZOLLHAUS_TABLE_NUMBERS: number[] = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
  21, 22, 23, 24, 28, 31, 32,
  36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54,
  58, 59, 60,
];

export const TABLE_CAPACITY = 8;
export const TABLE_CAPACITY_MAX_EXCEPTION = 9;
export const ZOLLHAUS_TABLE_COUNT = ZOLLHAUS_TABLE_NUMBERS.length;
/** One table stays empty as a buffer for last-minute moves. */
export const BUFFER_TABLE_COUNT = 1;
export const BUFFER_TABLE_INDEX = ZOLLHAUS_TABLE_COUNT - BUFFER_TABLE_COUNT;
export const ASSIGNABLE_TABLE_COUNT = ZOLLHAUS_TABLE_COUNT - BUFFER_TABLE_COUNT;

const ZOLLHAUS_TABLE_NUMBER_SET = new Set(ZOLLHAUS_TABLE_NUMBERS);

export function isZollhausTableNumber(tableNumber: number): boolean {
  return ZOLLHAUS_TABLE_NUMBER_SET.has(tableNumber);
}

export function getZollhausTableNumber(tableIndex: number): number {
  return ZOLLHAUS_TABLE_NUMBERS[tableIndex] ?? tableIndex + 1;
}

export function formatZollhausTableLabel(tableIndex: number): string {
  return `Tisch ${getZollhausTableNumber(tableIndex)}`;
}

export function isBufferTableIndex(tableIndex: number): boolean {
  return tableIndex === BUFFER_TABLE_INDEX;
}

export function getBufferTableNumber(): number {
  return getZollhausTableNumber(BUFFER_TABLE_INDEX);
}

export function getBaseVenueCapacity(): number {
  return ASSIGNABLE_TABLE_COUNT * TABLE_CAPACITY;
}

export function getMaxVenueCapacity(): number {
  return ASSIGNABLE_TABLE_COUNT * TABLE_CAPACITY_MAX_EXCEPTION;
}

export function getTableCapacityForDisplay(seatsUsed: number): number {
  return seatsUsed > TABLE_CAPACITY
    ? TABLE_CAPACITY_MAX_EXCEPTION
    : TABLE_CAPACITY;
}
