"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { supabase, type Entry } from "@/lib/supabase";
import { Footer } from "@/components/footer";

const QrScanner = dynamic(() => import("@/components/qr-scanner"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-56 rounded-2xl border border-gold/20 bg-surface-2">
      <span className="text-cream-muted text-sm font-sans animate-pulse">Kamera wird geladen…</span>
    </div>
  ),
});

type ScanResult =
  | { type: "found"; entry: Entry }
  | { type: "already_paid"; entry: Entry }
  | { type: "not_found" }
  | { type: "error"; message: string }
  | null;

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState(false);
  const [activeTab, setActiveTab] = useState<"scanner" | "liste">("scanner");

  const [scanResult, setScanResult] = useState<ScanResult>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [scannerActive, setScannerActive] = useState(true);
  const lastScannedRef = useRef<string | null>(null);

  const [entries, setEntries] = useState<Entry[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (sessionStorage.getItem("admin_auth_token")) setIsAuthenticated(true);
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    fetch("/api/admin-auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    })
      .then((r) => r.json())
      .then(({ ok }) => {
        if (ok) { sessionStorage.setItem("admin_auth_token", password); setIsAuthenticated(true); setLoginError(false); }
        else setLoginError(true);
      })
      .catch(() => setLoginError(true));
  };

  const fetchEntries = useCallback(async () => {
    setIsLoadingList(true);
    const { data } = await supabase.from("entries").select("*").order("created_at", { ascending: false });
    setEntries((data as Entry[]) || []);
    setIsLoadingList(false);
  }, []);

  useEffect(() => {
    if (isAuthenticated && activeTab === "liste") fetchEntries();
  }, [isAuthenticated, activeTab, fetchEntries]);

  const handleScan = useCallback(async (uuid: string) => {
    const trimmed = uuid.trim();
    if (isFetching || trimmed === lastScannedRef.current) return;
    lastScannedRef.current = trimmed;
    setScannerActive(false);
    setIsFetching(true);
    setScanResult(null);

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(trimmed)) {
      setScanResult({ type: "not_found" });
      setIsFetching(false);
      return;
    }

    const { data, error } = await supabase.from("entries").select("*").eq("id", trimmed).maybeSingle();
    if (error || !data) setScanResult({ type: "not_found" });
    else {
      const entry = data as Entry;
      setScanResult(entry.bezahlt ? { type: "already_paid", entry } : { type: "found", entry });
    }
    setIsFetching(false);
  }, [isFetching]);

  const handleBezahlen = async (id: string) => {
    setIsConfirming(true);
    const res = await fetch("/api/bezahlen", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-token": sessionStorage.getItem("admin_auth_token") ?? "" },
      body: JSON.stringify({ id }),
    });
    const json = await res.json();
    if (json.success) setScanResult({ type: "already_paid", entry: json.entry });
    else setScanResult({ type: "error", message: "Fehler beim Bestätigen." });
    setIsConfirming(false);
  };

  const handleManualBezahlen = async (id: string) => {
    const res = await fetch("/api/bezahlen", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-token": sessionStorage.getItem("admin_auth_token") ?? "" },
      body: JSON.stringify({ id }),
    });
    const json = await res.json();
    if (json.success) {
      setEntries((prev) => prev.map((e) => e.id === id ? { ...e, bezahlt: true, bezahlt_at: json.entry.bezahlt_at } : e));
    }
  };

  const resetScanner = () => {
    setScanResult(null);
    lastScannedRef.current = null;
    setScannerActive(true);
  };

  const filtered = entries.filter((e) => {
    const q = searchQuery.toLowerCase();
    return e.vorname.toLowerCase().includes(q) || e.nachname.toLowerCase().includes(q);
  });

  const totalPersonsAll = entries.reduce((s, e) => s + e.total_persons, 0);
  const totalRevenue = entries.reduce((s, e) => s + e.total_price, 0);
  const totalReceived = entries.filter((e) => e.bezahlt).reduce((s, e) => s + e.total_price, 0);
  const bezahltCount = entries.filter((e) => e.bezahlt).length;

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex flex-col bg-surface">
        <div className="fixed inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full"
            style={{ background: "radial-gradient(ellipse, rgba(201,162,39,0.06) 0%, transparent 70%)" }} />
        </div>
        <main className="flex-1 flex items-center justify-center px-4 relative z-10">
          <div className="w-full max-w-xs animate-fade-up">
            <div className="text-center mb-8">
              <p className="text-gold/60 text-2xl mb-2">♠ ♣</p>
              <h1 className="font-serif text-3xl text-cream">Dealer&apos;s Table</h1>
              <p className="text-cream-muted text-sm font-sans mt-1">Nur für Kassierer</p>
            </div>
            <div className="felt-card rounded-2xl p-6">
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-cream-muted text-xs font-sans mb-1.5 tracking-wide uppercase">Passwort</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="input-dark w-full rounded-lg px-4 py-2.5 text-sm font-sans outline-none transition-all"
                    autoFocus
                  />
                </div>
                {loginError && <p className="text-red-400 text-sm font-sans">Falsches Passwort.</p>}
                <button
                  type="submit"
                  className="w-full py-3 rounded-xl gold-gradient text-[#0a0a0f] font-sans font-bold tracking-wide hover:opacity-90 active:scale-[0.98] transition-all"
                  style={{ boxShadow: "0 4px 20px rgba(201,162,39,0.2)" }}
                >
                  Einloggen
                </button>
              </form>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-surface">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full"
          style={{ background: "radial-gradient(ellipse, rgba(201,162,39,0.05) 0%, transparent 70%)" }} />
      </div>

      <main className="flex-1 flex flex-col px-4 py-6 relative z-10 max-w-lg mx-auto w-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-gold text-base">♠</span>
              <h1 className="font-serif text-xl text-cream">Dealer&apos;s Table</h1>
              <span className="text-gold text-base">♣</span>
            </div>
            <p className="text-cream-muted text-xs font-sans mt-0.5">Cabisino 2026 · Ticketkasse</p>
          </div>
          <button
            onClick={() => { sessionStorage.removeItem("admin_auth_token"); setIsAuthenticated(false); }}
            className="text-cream-muted text-xs font-sans hover:text-cream border border-gold/20 hover:border-gold/40 px-3 py-1.5 rounded-lg transition-all"
          >
            Ausloggen
          </button>
        </div>

        {/* Tabs */}
        <div className="flex rounded-xl border border-gold/20 bg-surface-2 p-1 mb-5">
          {(["scanner", "liste"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 rounded-lg text-sm font-sans font-medium transition-all duration-200 ${
                activeTab === tab
                  ? "gold-gradient text-[#0a0a0f] shadow"
                  : "text-cream-muted hover:text-cream"
              }`}
            >
              {tab === "scanner" ? "♦ Scannen" : "♥ Übersicht"}
            </button>
          ))}
        </div>

        {/* ── SCANNER TAB ── */}
        {activeTab === "scanner" && (
          <div className="space-y-4 animate-fade-in">
            {!scanResult && (
              <div className="felt-card rounded-2xl p-4">
                <QrScanner onScan={handleScan} active={scannerActive} />
                {isFetching && (
                  <p className="text-cream-muted text-sm text-center mt-3 font-sans animate-pulse">
                    Wird überprüft…
                  </p>
                )}
              </div>
            )}

            {scanResult && (
              <div className="animate-scale-in">
                {/* FOUND — ready to pay */}
                {scanResult.type === "found" && (
                  <div className="felt-card rounded-2xl p-5">
                    <div className="flex items-start gap-3 mb-4">
                      <div className="w-10 h-10 rounded-full bg-gold/15 border border-gold/40 flex items-center justify-center flex-shrink-0">
                        <span className="text-gold text-lg">♦</span>
                      </div>
                      <div>
                        <h3 className="font-serif text-xl text-cream">
                          {scanResult.entry.vorname} {scanResult.entry.nachname}
                        </h3>
                      </div>
                    </div>

                    <ScanDetails entry={scanResult.entry} />

                    <button
                      onClick={() => handleBezahlen(scanResult.entry.id)}
                      disabled={isConfirming}
                      className="w-full mt-4 py-4 rounded-xl gold-gradient text-[#0a0a0f] font-sans font-bold text-base tracking-wide hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 animate-pulse-gold"
                      style={{ boxShadow: "0 6px 30px rgba(201,162,39,0.3)" }}
                    >
                      {isConfirming ? "Wird bestätigt…" : `✓ Bezahlung bestätigen · ${scanResult.entry.total_price} €`}
                    </button>
                  </div>
                )}

                {/* ALREADY PAID */}
                {scanResult.type === "already_paid" && (
                  <div className="felt-card rounded-2xl p-5 border-emerald-500/30"
                    style={{ borderColor: "rgba(34,197,94,0.3)" }}>
                    <div className="flex items-start gap-3 mb-4">
                      <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center flex-shrink-0">
                        <span className="text-emerald-400 text-xl">✓</span>
                      </div>
                      <div>
                        <h3 className="font-serif text-xl text-emerald-400">Bereits bezahlt</h3>
                        <p className="text-cream-muted text-xs font-sans">
                          {scanResult.entry.vorname} {scanResult.entry.nachname}
                        </p>
                      </div>
                    </div>
                    <ScanDetails entry={scanResult.entry} />
                    {scanResult.entry.bezahlt_at && (
                      <p className="text-emerald-400/70 text-xs font-sans text-center mt-3">
                        Bezahlt um {new Date(scanResult.entry.bezahlt_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr
                      </p>
                    )}
                  </div>
                )}

                {/* NOT FOUND */}
                {scanResult.type === "not_found" && (
                  <div className="felt-card rounded-2xl p-6 text-center">
                    <div className="text-3xl mb-3">✗</div>
                    <h3 className="font-serif text-xl text-red-400 mb-1">Ungültiger Code</h3>
                    <p className="text-cream-muted text-sm font-sans">
                      Dieser QR-Code ist nicht in der Anmeldeliste.
                    </p>
                  </div>
                )}

                {scanResult.type === "error" && (
                  <div className="felt-card rounded-2xl p-5 text-center">
                    <p className="text-red-400 font-sans text-sm">{scanResult.message}</p>
                  </div>
                )}

                <button
                  onClick={resetScanner}
                  className="w-full mt-3 py-3 rounded-xl border border-gold/25 text-gold hover:border-gold/50 hover:bg-gold/5 font-sans text-sm font-medium transition-all"
                >
                  ♠ Nächsten scannen
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── ÜBERSICHT TAB ── */}
        {activeTab === "liste" && (
          <div className="space-y-3 animate-fade-in">
            {/* Stats row */}
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Anmeldungen", value: entries.length, suit: "♠" },
                { label: "Personen", value: totalPersonsAll, suit: "♣" },
                { label: "Bezahlt", value: `${bezahltCount} / ${entries.length}`, suit: "♥" },
                { label: "Einnahmen", value: `${totalReceived} €`, suit: "♦" },
              ].map((s) => (
                <div key={s.label} className="felt-card rounded-xl p-3 text-center">
                  <div className="text-gold/50 text-xs mb-0.5">{s.suit}</div>
                  <div className="font-serif text-lg text-gold font-semibold">{s.value}</div>
                  <div className="text-cream-muted text-xs font-sans">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Pending revenue */}
            <div className="felt-card rounded-xl px-4 py-2.5 flex justify-between items-center">
              <span className="text-cream-muted text-xs font-sans">Noch offen</span>
              <span className="text-gold font-serif font-semibold">{totalRevenue - totalReceived} €</span>
            </div>

            {/* Search */}
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Name oder Kurs suchen…"
                className="input-dark w-full rounded-xl px-4 py-2.5 text-sm font-sans outline-none pl-9 transition-all"
              />
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-cream-muted/60 text-sm">♦</span>
            </div>

            <button
              onClick={fetchEntries}
              disabled={isLoadingList}
              className="w-full py-2 rounded-xl border border-gold/20 text-gold text-xs font-sans hover:bg-gold/5 transition-all disabled:opacity-50"
            >
              {isLoadingList ? "Lädt…" : "↺ Aktualisieren"}
            </button>

            {/* Entries */}
            <div className="space-y-2 pb-4">
              {filtered.map((entry) => (
                <div
                  key={entry.id}
                  className={`felt-card rounded-xl p-3.5 transition-all ${
                    entry.bezahlt ? "border-emerald-500/25" : "border-gold/15"
                  }`}
                  style={{ borderColor: entry.bezahlt ? "rgba(34,197,94,0.25)" : undefined }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-sans font-semibold text-cream text-sm">
                          {entry.vorname} {entry.nachname}
                        </span>
                        {entry.bezahlt && (
                          <span className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-2 py-0.5 rounded-full">
                            ✓ Bezahlt
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs font-sans text-cream-muted">
                        <span>{entry.total_persons} {entry.total_persons === 1 ? "Person" : "Personen"}</span>
                        <span className="text-gold font-medium">{entry.total_price} €</span>
                      </div>
                      {entry.guests && entry.guests.length > 0 && (
                        <p className="mt-0.5 text-xs text-cream-muted font-sans truncate">
                          + {entry.guests.join(", ")}
                        </p>
                      )}
                    </div>
                    {!entry.bezahlt && (
                      <button
                        onClick={() => handleManualBezahlen(entry.id)}
                        className="flex-shrink-0 px-3 py-1.5 rounded-lg gold-gradient text-[#0a0a0f] text-xs font-sans font-bold hover:opacity-90 active:scale-95 transition-all"
                        style={{ boxShadow: "0 2px 10px rgba(201,162,39,0.2)" }}
                      >
                        Bezahlt
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {filtered.length === 0 && !isLoadingList && (
                <div className="text-center py-10 text-cream-muted text-sm font-sans">
                  {searchQuery ? "Keine Treffer." : "Noch keine Anmeldungen."}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}

function ScanDetails({ entry }: { entry: Entry }) {
  return (
    <div className="rounded-xl border border-gold/15 bg-black/20 p-3 space-y-2">
      {entry.guests && entry.guests.length > 0 && (
        <div className="flex justify-between text-xs font-sans">
          <span className="text-cream-muted">Begleitung</span>
          <span className="text-cream text-right max-w-[60%]">{entry.guests.join(", ")}</span>
        </div>
      )}
      <div className="flex justify-between text-xs font-sans">
        <span className="text-cream-muted">Personen</span>
        <span className="text-cream">{entry.total_persons}</span>
      </div>
      <div className="flex justify-between text-xs font-sans pt-1" style={{ borderTop: "1px solid rgba(201,162,39,0.15)" }}>
        <span className="text-cream-muted font-semibold">Betrag</span>
        <span className="text-gold font-serif text-base font-bold">{entry.total_price} €</span>
      </div>
    </div>
  );
}
