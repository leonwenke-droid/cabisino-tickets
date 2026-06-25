"use client";

import { useCallback, useMemo, useState } from "react";
import { PublicFloorplan } from "@/components/public-floorplan";

type SeatMatch = {
  entryId: string;
  registrantName: string;
  tableNumber: number;
  groupNames: string[];
};

type FindSeatResponse =
  | { matches: SeatMatch[]; published_at?: string | null }
  | { error: string };

export default function FindenPage() {
  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matches, setMatches] = useState<SeatMatch[] | null>(null);
  const [selected, setSelected] = useState<SeatMatch | null>(null);

  const normalizedQuery = useMemo(
    () => query.trim().replace(/\s+/g, " "),
    [query]
  );

  const reset = useCallback(() => {
    setError(null);
    setMatches(null);
    setSelected(null);
    setIsSearching(false);
  }, []);

  const submitSearch = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      setError(null);
      setSelected(null);
      setMatches(null);

      const q = normalizedQuery;
      if (q.length < 2) {
        setError("Bitte gib mindestens 2 Zeichen ein.");
        return;
      }

      setIsSearching(true);
      try {
        const res = await fetch("/api/find-seat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: q }),
        });
        const json = (await res.json()) as FindSeatResponse;
        if (!res.ok || "error" in json) {
          setError("error" in json ? json.error : "Suche fehlgeschlagen.");
          return;
        }

        const found = (json.matches ?? []).filter(
          (m) => Number.isFinite(m.tableNumber) && m.tableNumber > 0
        );

        if (found.length === 0) {
          setMatches([]);
          return;
        }

        if (found.length === 1) {
          setSelected(found[0] ?? null);
        } else {
          setMatches(found);
        }
      } catch {
        setError("Suche fehlgeschlagen.");
      } finally {
        setIsSearching(false);
      }
    },
    [normalizedQuery]
  );

  return (
    <div className="min-h-screen flex flex-col bg-surface">
      <div className="fixed inset-0 pointer-events-none">
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[340px] rounded-full"
          style={{
            background:
              "radial-gradient(ellipse, rgba(201,162,39,0.06) 0%, transparent 70%)",
          }}
        />
      </div>

      <main className="flex-1 w-full max-w-lg mx-auto px-4 py-6 relative z-10">
        <div className="text-center mb-6">
          <p className="text-gold/60 text-2xl mb-2">♠ ♦</p>
          <h1 className="font-serif text-3xl text-cream">Sitzplatz finden</h1>
          <p className="text-cream-muted text-sm font-sans mt-1">
            Gib deinen Namen ein, um deinen Tisch zu sehen.
          </p>
        </div>

        {!selected && (
          <div className="felt-card rounded-2xl p-5 border border-gold/20">
            <form onSubmit={submitSearch} className="space-y-3">
              <label className="block text-cream-muted text-xs font-sans mb-1.5 tracking-wide uppercase">
                Wie heißt du?
              </label>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Vorname, Nachname oder beides"
                className="input-dark w-full rounded-xl px-4 py-3 text-base font-sans outline-none transition-all"
                autoComplete="name"
                inputMode="text"
              />

              {error && (
                <p className="text-red-300 text-sm font-sans leading-snug">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={isSearching}
                className="w-full py-3.5 rounded-xl gold-gradient text-[#0a0a0f] font-sans font-bold tracking-wide hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50"
                style={{ boxShadow: "0 4px 20px rgba(201,162,39,0.2)" }}
              >
                {isSearching ? "Sucht…" : "Tisch anzeigen"}
              </button>
            </form>
          </div>
        )}

        {matches && matches.length > 1 && !selected && (
          <div className="felt-card rounded-2xl p-5 border border-gold/20 mt-4">
            <h2 className="font-serif text-lg text-gold mb-3">Meinst du …?</h2>
            <div className="space-y-2">
              {matches.map((m) => (
                <button
                  key={m.entryId}
                  type="button"
                  onClick={() => setSelected(m)}
                  className="w-full text-left rounded-xl border border-gold/15 bg-black/20 px-4 py-3 hover:border-gold/35 hover:bg-black/30 transition-all"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-cream font-sans font-semibold truncate">
                      {m.registrantName}
                    </span>
                    <span className="text-gold font-serif font-bold tabular-nums">
                      Tisch {m.tableNumber}
                    </span>
                  </div>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={reset}
              className="w-full mt-4 py-2.5 rounded-xl border border-gold/20 text-cream-muted text-sm font-sans hover:text-cream hover:border-gold/40 transition-all"
            >
              Zurück zur Suche
            </button>
          </div>
        )}

        {matches && matches.length === 0 && !selected && (
          <div className="felt-card rounded-2xl p-6 border border-gold/15 text-center mt-4">
            <h2 className="font-serif text-xl text-red-300 mb-2">
              Name nicht gefunden
            </h2>
            <p className="text-cream-muted text-sm font-sans">
              Frag bitte am Eingang nach.
            </p>
            <button
              type="button"
              onClick={reset}
              className="w-full mt-4 py-3 rounded-xl border border-gold/20 text-gold text-sm font-sans hover:bg-gold/5 transition-all"
            >
              Nochmal suchen
            </button>
          </div>
        )}

        {selected && (
          <div className="space-y-4 animate-fade-in">
            <div className="felt-card rounded-2xl p-5 border border-gold/25">
              <p className="text-cream-muted text-xs font-sans uppercase tracking-wide">
                Dein Tisch
              </p>
              <h2 className="font-serif text-3xl text-gold mt-1">
                Du sitzt an Tisch {selected.tableNumber}
              </h2>
              <p className="text-cream-muted text-sm font-sans mt-2">
                Wenn das nicht stimmt: bitte am Eingang kurz nachfragen.
              </p>
            </div>

            <PublicFloorplan highlightTableNumber={selected.tableNumber} />

            <div className="felt-card rounded-2xl p-5 border border-gold/15">
              <h3 className="font-serif text-lg text-cream mb-2">
                Deine Gruppe am Tisch
              </h3>
              <ul className="space-y-1.5">
                {selected.groupNames.map((name, idx) => (
                  <li
                    key={`${name}-${idx}`}
                    className="text-cream-muted text-sm font-sans"
                  >
                    {name}
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={reset}
                className="w-full mt-4 py-3 rounded-xl border border-gold/20 text-gold text-sm font-sans hover:bg-gold/5 transition-all"
              >
                Neue Suche
              </button>
            </div>
          </div>
        )}
      </main>

      <footer className="w-full py-6 text-center border-t border-gold/10 mt-auto relative z-10">
        <p className="text-cream-muted text-sm font-sans">
          Cabisino 2026 · Powered by{" "}
          <a
            href="https://lyniqmedia.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gold hover:text-gold-light transition-colors duration-200 font-medium"
          >
            LYNIQ Media
          </a>
        </p>
      </footer>
    </div>
  );
}

