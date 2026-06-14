export type GuestName = {
  vorname: string;
  nachname: string;
};

/** Split stored "Vorname Nachname" back into fields (supports multi-word last names). */
export function parseGuestString(full: string): GuestName {
  const trimmed = full.trim();
  const idx = trimmed.indexOf(" ");
  if (idx === -1) return { vorname: trimmed, nachname: "" };
  return {
    vorname: trimmed.slice(0, idx),
    nachname: trimmed.slice(idx + 1).trim(),
  };
}

export function formatGuestName(guest: GuestName): string {
  return `${guest.vorname.trim()} ${guest.nachname.trim()}`;
}

export function validatePersonName(vorname: string, nachname: string): boolean {
  return vorname.trim().length > 0 && nachname.trim().length > 0;
}

export function isEmptyGuestRow(guest: GuestName): boolean {
  return !guest.vorname.trim() && !guest.nachname.trim();
}

export function hasEmptyGuestRows(guests: GuestName[]): boolean {
  return guests.some(isEmptyGuestRow);
}

/**
 * Validates guest rows: each non-empty row needs both vorname and nachname.
 * Returns formatted names for storage, or an error message.
 */
export function resolveGuestNames(guests: GuestName[]): {
  names: string[];
  error: string | null;
} {
  const names: string[] = [];

  for (let i = 0; i < guests.length; i++) {
    const vn = guests[i].vorname.trim();
    const nn = guests[i].nachname.trim();

    if (!vn && !nn) continue;

    if (!vn || !nn) {
      return {
        names: [],
        error: `Bitte Vor- und Nachname für Begleitperson ${i + 1} angeben.`,
      };
    }

    names.push(`${vn} ${nn}`);
  }

  return { names, error: null };
}

export function guestStringsToRows(guests: string[] | null): GuestName[] {
  if (!guests?.length) return [];
  return guests.map(parseGuestString);
}

/** Server-side validation for stored guest name strings. */
export function validateGuestStrings(guests: string[]): string | null {
  for (let i = 0; i < guests.length; i++) {
    const parsed = parseGuestString(guests[i]);
    if (!validatePersonName(parsed.vorname, parsed.nachname)) {
      return `Begleitperson ${i + 1}: Vor- und Nachname erforderlich.`;
    }
  }
  return null;
}
