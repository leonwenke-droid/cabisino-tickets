"use client";

import { useState, useCallback, useRef } from "react";
import { supabase, type Entry } from "@/lib/supabase";
import { isAllowed } from "@/lib/allowed-names";
import { Footer } from "@/components/footer";
import { CasinoTicket, downloadCasinoTicket } from "@/components/casino-ticket";

const PRICE_PER_PERSON = 64;
const SUITS = ["♠", "♥", "♦", "♣"];

// Verkaufstermine — mark past ones as done
const VERKAUFSTERMINE = [
  { date: "01.06.", done: true },
  { date: "11.06.", done: false },
  { date: "15.06.", done: false },
  { date: "17.06.", done: false },
];

type ViewState = "name" | "guests" | "duplicate" | "confirmation";

export default function RegistrationPage() {
  const [view, setView] = useState<ViewState>("name");
  const [isChecking, setIsChecking] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [vorname, setVorname] = useState("");
  const [nachname, setNachname] = useState("");
  const [guests, setGuests] = useState<string[]>([]);
  const [confirmedEntry, setConfirmedEntry] = useState<Entry | null>(null);

  const ticketRef = useRef<HTMLDivElement>(null);

  const totalPersons = 1 + guests.length;
  const totalPrice = totalPersons * PRICE_PER_PERSON;

  const addGuest = () => setGuests((g) => [...g, ""]);
  const removeGuest = (i: number) => setGuests((g) => g.filter((_, idx) => idx !== i));
  const updateGuest = (i: number, val: string) =>
    setGuests((g) => g.map((g2, idx) => (idx === i ? val : g2)));

  // Step 1: validate name
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

      if (!isAllowed(vn, nn)) {
        setNameError("Dein Name wurde nicht gefunden. Wende dich an Leon.");
        return;
      }

      setIsChecking(true);
      try {
        const { data: existing } = await supabase
          .from("entries")
          .select("*")
          .ilike("vorname", vn)
          .ilike("nachname", nn)
          .maybeSingle();

        if (existing) {
          setConfirmedEntry(existing as Entry);
          setView("duplicate");
        } else {
          setView("guests");
        }
      } catch {
        setNameError("Ein Fehler ist aufgetreten. Bitte versuche es erneut.");
      } finally {
        setIsChecking(false);
      }
    },
    [vorname, nachname]
  );

  // Step 2: submit with guests
  const handleGuestsSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setSubmitError(null);
      setIsSubmitting(true);

      const filteredGuests = guests.map((g) => g.trim()).filter(Boolean);

      try {
        const { data, error: insertError } = await supabase
          .from("entries")
          .insert({
            vorname: vorname.trim(),
            nachname: nachname.trim(),
            guests: filteredGuests.length > 0 ? filteredGuests : null,
            total_persons: totalPersons,
            total_price: totalPrice,
          })
          .select()
          .single();

        if (insertError) throw insertError;
        setConfirmedEntry(data as Entry);
        setView("confirmation");
      } catch {
        setSubmitError("Ein Fehler ist aufgetreten. Bitte versuche es erneut.");
      } finally {
        setIsSubmitting(false);
      }
    },
    [vorname, nachname, guests, totalPersons, totalPrice]
  );

  const handleDownload = useCallback(async () => {
    if (!ticketRef.current || !confirmedEntry) return;
    await downloadCasinoTicket(confirmedEntry, ticketRef.current);
  }, [confirmedEntry]);

  return (
    <div className="min-h-screen flex flex-col bg-surface relative overflow-hidden">
      {/* Ambient glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[700px] h-[500px] rounded-full"
          style={{ background: "radial-gradient(ellipse, rgba(201,162,39,0.07) 0%, transparent 70%)" }} />
        <div className="absolute bottom-0 left-0 w-[400px] h-[300px] rounded-full"
          style={{ background: "radial-gradient(ellipse, rgba(201,162,39,0.04) 0%, transparent 70%)" }} />
      </div>
      <span className="suit-watermark text-gold" style={{ top: "5%", left: "-2%" }}>♠</span>
      <span className="suit-watermark text-gold" style={{ top: "50%", right: "-2%" }}>♦</span>

      <main className="flex-1 flex flex-col items-center px-4 py-10 relative z-10">

        {/* ── NAME STEP ── */}
        {view === "name" && (
          <div className="w-full max-w-md animate-fade-up">
            {/* Hero */}
            <div className="text-center mb-8 select-none">
              <div className="flex justify-center gap-4 text-gold/60 text-xl mb-4">
                {SUITS.map((s) => <span key={s}>{s}</span>)}
              </div>
              <h1
                className="font-serif font-bold leading-none mb-2"
                style={{
                  fontSize: "clamp(3rem, 14vw, 5.5rem)",
                  background: "linear-gradient(135deg, #b8891e 0%, #C9A227 35%, #e8c84a 55%, #C9A227 80%, #b8891e 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                  letterSpacing: "-0.01em",
                }}
              >
                Cabisino
              </h1>
              <p className="text-cream-muted font-sans text-sm tracking-wide">
                13 Jahre Pokern für den Jackpot
              </p>
              <div className="mt-3 mx-auto w-24 h-px"
                style={{ background: "linear-gradient(90deg, transparent, #C9A227, transparent)" }} />
            </div>

            {/* Verkaufstermine */}
            <div className="mb-6">
              <p className="text-cream-muted text-xs font-sans text-center tracking-widest uppercase mb-3">
                Ticketverkauf
              </p>
              <div className="flex justify-center gap-2 flex-wrap">
                {VERKAUFSTERMINE.map(({ date, done }) => (
                  <span
                    key={date}
                    className={`px-3 py-1.5 rounded-full text-sm font-sans border transition-all ${
                      done
                        ? "border-gold/10 text-cream-muted/30 line-through bg-black/10"
                        : "border-gold/30 text-gold bg-gold/10"
                    }`}
                  >
                    {date}
                  </span>
                ))}
              </div>
            </div>

            {/* Name form */}
            <div className="felt-card rounded-2xl p-6">
              <p className="text-cream-muted text-xs font-sans text-center mb-5 tracking-wider uppercase">
                Voranmeldung
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

        {/* ── GUESTS STEP ── */}
        {view === "guests" && (
          <div className="w-full max-w-md animate-fade-up">
            <div className="text-center mb-7 select-none">
              <p className="text-gold/60 text-lg mb-1">♠ ♣</p>
              <h2 className="font-serif text-3xl text-cream mb-1">
                Hallo, {vorname}!
              </h2>
              <p className="text-cream-muted text-sm font-sans">
                Trägst du Begleitpersonen ein?
              </p>
            </div>

            <div className="felt-card rounded-2xl p-6">
              <form onSubmit={handleGuestsSubmit} className="space-y-4">
                {/* Guests */}
                <div className="space-y-2.5">
                  <label className="block text-cream-muted text-xs font-sans tracking-wide uppercase">
                    Begleitpersonen
                  </label>
                  {guests.map((guest, i) => (
                    <div key={i} className="flex gap-2 animate-fade-in">
                      <input
                        type="text"
                        value={guest}
                        onChange={(e) => updateGuest(i, e.target.value)}
                        placeholder={`Begleitperson ${i + 1}`}
                        className="input-dark flex-1 rounded-lg px-3 py-2.5 text-sm font-sans outline-none transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => removeGuest(i)}
                        className="w-9 h-10 flex-shrink-0 rounded-lg border border-red-500/25 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all text-base flex items-center justify-center"
                      >
                        ×
                      </button>
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

                {/* Price */}
                <div className="rounded-xl border border-gold/20 bg-black/20 p-4 space-y-2">
                  <div className="flex justify-between text-sm font-sans">
                    <span className="text-cream-muted">{vorname}</span>
                    <span className="text-cream">{PRICE_PER_PERSON} €</span>
                  </div>
                  {guests.map((g, i) => (
                    <div key={i} className="flex justify-between text-sm font-sans">
                      <span className="text-cream-muted">{g.trim() || `Begleitperson ${i + 1}`}</span>
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
                  {isSubmitting ? "Wird gespeichert…" : "Jetzt anmelden →"}
                </button>

                <button
                  type="button"
                  onClick={() => setView("name")}
                  className="w-full py-2 text-cream-muted text-sm font-sans hover:text-cream transition-colors"
                >
                  ← Zurück
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ── DUPLICATE VIEW ── */}
        {view === "duplicate" && confirmedEntry && (
          <div className="w-full max-w-sm animate-fade-up">
            <div className="text-center mb-6">
              <span className="text-3xl">⚠</span>
              <h2 className="font-serif text-2xl text-cream mt-2">Bereits eingetragen</h2>
              <p className="text-cream-muted text-sm font-sans mt-1">
                Du bist bereits registriert. Hier ist dein Code.
              </p>
            </div>
            <CasinoTicket entry={confirmedEntry} ticketRef={ticketRef} />
            <DownloadButton onClick={handleDownload} />
          </div>
        )}

        {/* ── CONFIRMATION VIEW ── */}
        {view === "confirmation" && confirmedEntry && (
          <div className="w-full max-w-sm animate-deal-in">
            <div className="text-center mb-6">
              <div className="flex justify-center gap-3 text-gold text-lg mb-3">
                {SUITS.map((s) => <span key={s} className="animate-fade-in">{s}</span>)}
              </div>
              <h2 className="font-serif text-3xl text-cream mb-1">Jackpot!</h2>
              <p className="text-cream-muted text-sm font-sans">
                Deine Anmeldung ist vollständig.
              </p>
            </div>
            <CasinoTicket entry={confirmedEntry} ticketRef={ticketRef} />
            <DownloadButton onClick={handleDownload} />
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}

function DownloadButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full mt-4 py-3 rounded-xl border border-gold/30 text-gold hover:border-gold/60 hover:bg-gold/5 font-sans text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2"
    >
      <span>↓</span> Ticket als Bild speichern
    </button>
  );
}
