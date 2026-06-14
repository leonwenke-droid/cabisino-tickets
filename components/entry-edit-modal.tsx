"use client";

import { useState, useCallback, useEffect } from "react";
import type { Entry } from "@/lib/supabase";
import {
  type GuestName,
  guestStringsToRows,
  resolveGuestNames,
  formatGuestName,
} from "@/lib/guest-names";

const PRICE_PER_PERSON = 64;

function adminHeaders() {
  return {
    "Content-Type": "application/json",
    "x-admin-token": sessionStorage.getItem("admin_auth_token") ?? "",
  };
}

export function EntryEditModal({
  entry,
  onClose,
  onSaved,
}: {
  entry: Entry;
  onClose: () => void;
  onSaved: (updated: Entry) => void;
}) {
  const [vorname, setVorname] = useState(entry.vorname);
  const [nachname, setNachname] = useState(entry.nachname);
  const [guests, setGuests] = useState<GuestName[]>(() =>
    guestStringsToRows(entry.guests)
  );
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const completeGuests = guests.filter(
    (g) => g.vorname.trim() && g.nachname.trim()
  );
  const totalPersons = 1 + completeGuests.length;
  const totalPrice = totalPersons * PRICE_PER_PERSON;

  const addGuest = () => setGuests((g) => [...g, { vorname: "", nachname: "" }]);
  const removeGuest = (i: number) => setGuests((g) => g.filter((_, idx) => idx !== i));
  const updateGuest = (i: number, field: keyof GuestName, val: string) =>
    setGuests((g) =>
      g.map((g2, idx) => (idx === i ? { ...g2, [field]: val } : g2))
    );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      if (!vorname.trim() || !nachname.trim()) {
        setError("Bitte Vor- und Nachname ausfüllen.");
        return;
      }

      const { names: filteredGuests, error: guestError } = resolveGuestNames(guests);
      if (guestError) {
        setError(guestError);
        return;
      }

      setIsSaving(true);
      try {
        const res = await fetch("/api/entries", {
          method: "PATCH",
          headers: adminHeaders(),
          body: JSON.stringify({
            id: entry.id,
            vorname: vorname.trim(),
            nachname: nachname.trim(),
            guests: filteredGuests,
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error ?? "Speichern fehlgeschlagen.");
          return;
        }
        onSaved(json.entry as Entry);
        onClose();
      } catch {
        setError("Ein Fehler ist aufgetreten. Bitte erneut versuchen.");
      } finally {
        setIsSaving(false);
      }
    },
    [entry.id, vorname, nachname, guests, onClose, onSaved]
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-entry-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Schließen"
      />

      <div className="relative z-10 w-full max-w-md max-h-[92vh] overflow-y-auto animate-fade-up sm:rounded-2xl">
        <div className="felt-card rounded-t-2xl sm:rounded-2xl p-6">
          <div className="flex items-start justify-between gap-3 mb-6">
            <div>
              <p className="text-gold/60 text-sm mb-1">♠ ♣</p>
              <h2 id="edit-entry-title" className="font-serif text-2xl text-cream">
                Anmeldung bearbeiten
              </h2>
              <p className="text-cream-muted text-xs font-sans mt-1">
                Korrekturen speichern — QR-Code bleibt gleich
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-lg border border-gold/25 text-cream-muted hover:text-cream hover:border-gold/50 transition-all text-lg leading-none flex-shrink-0"
            >
              ×
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-cream-muted text-xs font-sans mb-1.5 tracking-wide uppercase">
                  Vorname <span className="text-gold">*</span>
                </label>
                <input
                  type="text"
                  value={vorname}
                  onChange={(e) => setVorname(e.target.value)}
                  className="input-dark w-full rounded-lg px-3 py-2.5 text-sm font-sans outline-none transition-all"
                  required
                />
              </div>
              <div>
                <label className="block text-cream-muted text-xs font-sans mb-1.5 tracking-wide uppercase">
                  Nachname <span className="text-gold">*</span>
                </label>
                <input
                  type="text"
                  value={nachname}
                  onChange={(e) => setNachname(e.target.value)}
                  className="input-dark w-full rounded-lg px-3 py-2.5 text-sm font-sans outline-none transition-all"
                  required
                />
              </div>
            </div>

            <div className="flex items-center gap-3 py-1">
              <div className="flex-1 h-px" style={{ background: "rgba(201,162,39,0.15)" }} />
              <span className="text-gold/50 text-sm">♦</span>
              <div className="flex-1 h-px" style={{ background: "rgba(201,162,39,0.15)" }} />
            </div>

            <div className="space-y-2.5">
              <label className="block text-cream-muted text-xs font-sans tracking-wide uppercase">
                Begleitpersonen
              </label>
              {guests.map((guest, i) => (
                <div key={i} className="space-y-2">
                  <p className="text-cream-muted/70 text-xs font-sans">
                    Begleitperson {i + 1}
                  </p>
                  <div className="flex gap-2">
                    <div className="grid grid-cols-2 gap-2 flex-1">
                      <input
                        type="text"
                        value={guest.vorname}
                        onChange={(e) => updateGuest(i, "vorname", e.target.value)}
                        placeholder="Vorname"
                        className="input-dark w-full rounded-lg px-3 py-2.5 text-sm font-sans outline-none transition-all"
                        autoCapitalize="words"
                      />
                      <input
                        type="text"
                        value={guest.nachname}
                        onChange={(e) => updateGuest(i, "nachname", e.target.value)}
                        placeholder="Nachname"
                        className="input-dark w-full rounded-lg px-3 py-2.5 text-sm font-sans outline-none transition-all"
                        autoCapitalize="words"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeGuest(i)}
                      className="w-9 h-10 flex-shrink-0 rounded-lg border border-red-500/25 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all text-base flex items-center justify-center self-end"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={addGuest}
                className="w-full py-2.5 rounded-lg border border-dashed border-gold/25 text-gold/80 text-sm font-sans hover:border-gold/50 hover:text-gold hover:bg-gold/5 transition-all flex items-center justify-center gap-2"
              >
                <span className="text-lg leading-none">+</span> Begleitperson hinzufügen
              </button>
            </div>

            <div className="rounded-xl border border-gold/20 bg-black/20 p-4 space-y-2">
              <div className="flex justify-between text-sm font-sans">
                <span className="text-cream-muted">{vorname || "Hauptperson"}</span>
                <span className="text-cream">{PRICE_PER_PERSON} €</span>
              </div>
              {completeGuests.map((g, i) => (
                <div key={i} className="flex justify-between text-sm font-sans">
                  <span className="text-cream-muted">{formatGuestName(g)}</span>
                  <span className="text-cream">{PRICE_PER_PERSON} €</span>
                </div>
              ))}
              <div className="pt-2 border-t border-gold/15 flex justify-between items-center">
                <span className="text-cream-muted text-sm font-sans">
                  Gesamt · {totalPersons} {totalPersons === 1 ? "Person" : "Personen"}
                </span>
                <span className="font-serif text-2xl text-gold font-semibold">{totalPrice} €</span>
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-400 text-sm font-sans">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isSaving}
              className="w-full py-3.5 rounded-xl gold-gradient text-[#0a0a0f] font-sans font-bold text-base tracking-wide hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50"
              style={{ boxShadow: "0 4px 24px rgba(201,162,39,0.25)" }}
            >
              {isSaving ? "Wird gespeichert…" : "Änderungen speichern"}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-full py-2 text-cream-muted text-sm font-sans hover:text-cream transition-colors"
            >
              Abbrechen
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
