"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Footer } from "@/components/footer";

const SUITS = ["♠", "♥", "♦", "♣"];

type SeatingEntry = {
  id: string;
  vorname: string;
  nachname: string;
  sitzwunsch: string | null;
};

type ViewState = "name" | "form" | "success";

export default function SitzplatzPage() {
  const [view, setView] = useState<ViewState>("name");
  const [vorname, setVorname] = useState("");
  const [nachname, setNachname] = useState("");
  const [sitzwunsch, setSitzwunsch] = useState("");
  const [entry, setEntry] = useState<SeatingEntry | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleNameSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setNameError(null);

      const vn = vorname.trim();
      const nn = nachname.trim();

      if (!vn || !nn) {
        setNameError("Bitte Vor- und Nachname eingeben.");
        return;
      }

      setIsChecking(true);
      try {
        const { data, error } = await supabase
          .from("entries")
          .select("id, vorname, nachname, sitzwunsch")
          .ilike("vorname", vn)
          .ilike("nachname", nn)
          .maybeSingle();

        if (error) throw error;

        if (!data) {
          setNameError(
            "Du bist noch nicht angemeldet. Melde dich zuerst unter der Hauptseite an."
          );
          return;
        }

        setEntry(data as SeatingEntry);
        setSitzwunsch(data.sitzwunsch ?? "");
        setView("form");
      } catch {
        setNameError("Ein Fehler ist aufgetreten. Bitte versuche es erneut.");
      } finally {
        setIsChecking(false);
      }
    },
    [vorname, nachname]
  );

  const handleSitzwunschSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setSubmitError(null);

      const trimmed = sitzwunsch.trim();
      if (!trimmed) {
        setSubmitError("Bitte gib deinen Sitzwunsch an.");
        return;
      }

      setIsSubmitting(true);
      try {
        const res = await fetch("/api/sitzwunsch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            vorname: vorname.trim(),
            nachname: nachname.trim(),
            sitzwunsch: trimmed,
          }),
        });

        const json = await res.json();
        if (!res.ok) {
          setSubmitError(json.error ?? "Speichern fehlgeschlagen.");
          return;
        }

        setEntry(json.entry as SeatingEntry);
        setSitzwunsch(trimmed);
        setView("success");
      } catch {
        setSubmitError("Ein Fehler ist aufgetreten. Bitte versuche es erneut.");
      } finally {
        setIsSubmitting(false);
      }
    },
    [vorname, nachname, sitzwunsch]
  );

  const hasExistingWunsch = Boolean(entry?.sitzwunsch?.trim());

  return (
    <div className="min-h-screen flex flex-col bg-surface relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none">
        <div
          className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[700px] h-[500px] rounded-full"
          style={{
            background:
              "radial-gradient(ellipse, rgba(201,162,39,0.07) 0%, transparent 70%)",
          }}
        />
        <div
          className="absolute bottom-0 right-0 w-[400px] h-[300px] rounded-full"
          style={{
            background:
              "radial-gradient(ellipse, rgba(201,162,39,0.04) 0%, transparent 70%)",
          }}
        />
      </div>
      <span className="suit-watermark text-gold" style={{ top: "8%", right: "-2%" }}>
        ♣
      </span>
      <span className="suit-watermark text-gold" style={{ top: "55%", left: "-2%" }}>
        ♥
      </span>

      <main className="flex-1 flex flex-col items-center px-4 py-10 relative z-10">
        {/* Hero */}
        <div className="text-center mb-8 select-none w-full max-w-md">
          <div className="flex justify-center gap-4 text-gold/60 text-xl mb-4">
            {SUITS.map((s) => (
              <span key={s}>{s}</span>
            ))}
          </div>
          <h1 className="font-serif font-bold text-4xl sm:text-5xl text-cream mb-2 leading-tight">
            Sitzplatz&shy;wunsch
          </h1>
          <p className="text-cream-muted font-sans text-sm tracking-wide">
            Cabisino 2026
          </p>
          <div
            className="mt-3 mx-auto w-24 h-px"
            style={{
              background: "linear-gradient(90deg, transparent, #C9A227, transparent)",
            }}
          />
        </div>

        {/* Name lookup */}
        {view === "name" && (
          <div className="w-full max-w-md animate-fade-up">
            <div className="felt-card rounded-2xl p-6">
              <p className="text-cream-muted text-xs font-sans text-center mb-5 tracking-wider uppercase">
                Anmeldung prüfen
              </p>
              <form onSubmit={handleNameSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-cream-muted text-xs font-sans mb-1.5 tracking-wide uppercase">
                      Vorname <span className="text-gold">*</span>
                    </label>
                    <input
                      type="text"
                      value={vorname}
                      onChange={(e) => setVorname(e.target.value)}
                      placeholder="Max"
                      className="input-dark w-full rounded-lg px-3 py-2.5 text-sm font-sans outline-none transition-all"
                      autoCapitalize="words"
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
                      placeholder="Mustermann"
                      className="input-dark w-full rounded-lg px-3 py-2.5 text-sm font-sans outline-none transition-all"
                      autoCapitalize="words"
                      required
                    />
                  </div>
                </div>

                {nameError && (
                  <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-400 text-sm font-sans">
                    {nameError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isChecking}
                  className="w-full py-3.5 rounded-xl gold-gradient text-[#0a0a0f] font-sans font-bold text-base tracking-wide hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 shadow-lg"
                  style={{ boxShadow: "0 4px 24px rgba(201,162,39,0.25)" }}
                >
                  {isChecking ? "Wird geprüft…" : "Weiter →"}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Seating preference form */}
        {view === "form" && entry && (
          <div className="w-full max-w-md animate-fade-up">
            <div className="text-center mb-5">
              <h2 className="font-serif text-2xl text-cream">
                Hallo, {entry.vorname}!
              </h2>
              <p className="text-cream-muted text-sm font-sans mt-1">
                Mit wem möchtest du am Tisch sitzen?
              </p>
            </div>

            <div className="felt-card rounded-2xl p-6">
              {hasExistingWunsch && (
                <div className="rounded-lg border border-gold/25 bg-gold/5 px-4 py-3 mb-4">
                  <p className="text-cream-muted text-xs font-sans uppercase tracking-wide mb-1">
                    Aktueller Sitzwunsch
                  </p>
                  <p className="text-cream text-sm font-sans whitespace-pre-wrap">
                    {entry.sitzwunsch}
                  </p>
                  <p className="text-cream-muted/70 text-xs font-sans mt-2">
                    Du kannst deinen Wunsch unten anpassen und erneut speichern.
                  </p>
                </div>
              )}

              <form onSubmit={handleSitzwunschSubmit} className="space-y-4">
                <div>
                  <label className="block text-cream-muted text-xs font-sans mb-1.5 tracking-wide uppercase">
                    Sitzwunsch <span className="text-gold">*</span>
                  </label>
                  <textarea
                    value={sitzwunsch}
                    onChange={(e) => setSitzwunsch(e.target.value)}
                    placeholder="z.B. Max Mustermann, Lena Müller"
                    rows={4}
                    className="input-dark w-full rounded-lg px-3 py-2.5 text-sm font-sans outline-none transition-all resize-y min-h-[100px]"
                  />
                  <p className="text-cream-muted/70 text-xs font-sans mt-2 leading-relaxed">
                    Wir versuchen Sitzwünsche zu berücksichtigen. Tische haben 8
                    Plätze.
                  </p>
                </div>

                {submitError && (
                  <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-400 text-sm font-sans">
                    {submitError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3.5 rounded-xl gold-gradient text-[#0a0a0f] font-sans font-bold text-base tracking-wide hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 shadow-lg"
                  style={{ boxShadow: "0 4px 24px rgba(201,162,39,0.25)" }}
                >
                  {isSubmitting
                    ? "Wird gespeichert…"
                    : hasExistingWunsch
                      ? "Sitzwunsch aktualisieren →"
                      : "Sitzwunsch speichern →"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setView("name");
                    setSubmitError(null);
                  }}
                  className="w-full py-2 text-cream-muted text-sm font-sans hover:text-cream transition-colors"
                >
                  ← Zurück
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Success */}
        {view === "success" && entry && (
          <div className="w-full max-w-md animate-deal-in">
            <div className="felt-card rounded-2xl p-6 text-center space-y-4">
              <div className="flex justify-center gap-3 text-gold text-lg">
                {SUITS.map((s) => (
                  <span key={s}>{s}</span>
                ))}
              </div>
              <h2 className="font-serif text-3xl text-cream">Gespeichert!</h2>
              <p className="text-cream-muted text-sm font-sans">
                Dein Sitzwunsch wurde hinterlegt. Wir versuchen, ihn zu
                berücksichtigen.
              </p>
              <div className="rounded-xl border border-gold/20 bg-black/20 p-4 text-left">
                <p className="text-cream-muted text-xs font-sans uppercase tracking-wide mb-2">
                  Dein Sitzwunsch
                </p>
                <p className="text-cream text-sm font-sans whitespace-pre-wrap">
                  {sitzwunsch}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setView("form")}
                className="w-full py-2.5 rounded-lg border border-gold/30 text-gold font-sans text-sm hover:bg-gold/5 transition-all"
              >
                Sitzwunsch bearbeiten
              </button>
              <Link
                href="/"
                className="block w-full py-2 text-cream-muted text-sm font-sans hover:text-cream transition-colors"
              >
                Zur Anmeldung
              </Link>
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
