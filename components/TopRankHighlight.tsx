"use client";

import { ChevronRight, Minus, Sparkles, Trophy } from "lucide-react";
import RankBadge from "@/components/RankBadge";

export interface TopRankItem {
  scope: "month" | "all";
  rank: number | null;
  total: number;
  periodLabel: string;
  journalGap?: number;
}

const RANK_TITLE: Record<number, string> = { 1: "Juara 1", 2: "Juara 2", 3: "Juara 3" };

function ScopeChip({ scope, label, dark }: { scope: "month" | "all"; label: string; dark: boolean }) {
  return (
    <span
      className={`inline-block max-w-full truncate rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
        scope === "month"
          ? dark ? "bg-emerald-500/20 text-emerald-300" : "bg-emerald-100 text-emerald-700"
          : dark ? "bg-amber-500/20 text-amber-300" : "bg-amber-100 text-amber-700"
      }`}
    >
      {label}
    </span>
  );
}

export default function TopRankHighlight({
  items,
  snapshotLabel,
  dark = false,
  onOpen,
}: {
  items: TopRankItem[];
  snapshotLabel: string;
  dark?: boolean;
  onOpen: (scope: "month" | "all") => void;
}) {
  if (items.length === 0) return null;

  const ranked = items.filter((item): item is TopRankItem & { rank: number } => item.rank !== null);
  const best = ranked.length ? Math.min(...ranked.map((item) => item.rank)) : null;
  const hasTop3 = best !== null && best <= 3;
  const single = items.length === 1;

  const wrapper = hasTop3
    ? best === 1
      ? dark ? "border-2 border-yellow-500/40 from-yellow-900/30 via-amber-900/20 to-orange-900/20" : "border-2 border-yellow-300 from-yellow-50 via-amber-50 to-orange-50"
      : best === 2
      ? dark ? "border-2 border-slate-400/40 from-slate-800/60 via-slate-700/40 to-slate-800/60" : "border-2 border-slate-300 from-slate-50 via-white to-slate-100"
      : dark ? "border-2 border-orange-500/40 from-orange-900/30 via-amber-900/20 to-orange-900/20" : "border-2 border-orange-300 from-orange-50 via-amber-50 to-orange-100"
    : dark ? "border border-slate-700 from-slate-800/70 to-slate-800/40" : "border border-emerald-100 from-white to-emerald-50/60";

  const noteColor = hasTop3
    ? dark ? "text-amber-200/60" : "text-amber-800/60"
    : dark ? "text-emerald-300/50" : "text-emerald-700/50";

  const cardBase = dark
    ? "border-slate-600/60 bg-slate-900/40 hover:bg-slate-900/60"
    : "border-white/80 bg-white/70 hover:bg-white";
  const plainCard = dark
    ? "border-slate-700 bg-slate-900/40 hover:bg-slate-900/60"
    : "border-emerald-100 bg-white hover:bg-emerald-50/60";

  const Cta = ({ show }: { show: boolean }) => (
    <>
      {show && (
        <span className={`hidden items-center gap-1 text-xs font-semibold sm:flex ${dark ? "text-emerald-300" : "text-emerald-700"}`}>
          Lihat leaderboard
        </span>
      )}
      <ChevronRight className={`h-5 w-5 shrink-0 transition group-hover:translate-x-0.5 ${dark ? "text-emerald-300" : "text-emerald-600"}`} />
    </>
  );

  return (
    <section
      aria-label="Peringkat kamu"
      className={`relative overflow-hidden rounded-3xl bg-gradient-to-br p-4 sm:p-6 ${hasTop3 ? "shadow-lg" : "shadow-sm"} ${wrapper}`}
    >
      {hasTop3 && <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-yellow-300/25 blur-3xl" />}

      <div className="relative mb-3 flex items-center justify-between gap-3 sm:mb-4">
        <div className="flex min-w-0 items-center gap-2">
          {hasTop3 ? (
            <Sparkles className={`h-4 w-4 shrink-0 ${dark ? "text-amber-300" : "text-amber-600"}`} />
          ) : (
            <Trophy className={`h-4 w-4 shrink-0 ${dark ? "text-emerald-300" : "text-emerald-600"}`} />
          )}
          <h3 className={`truncate text-sm font-bold sm:text-base ${
            hasTop3 ? (dark ? "text-amber-100" : "text-amber-900") : dark ? "text-emerald-100" : "text-emerald-900"
          }`}>
            {hasTop3 ? "Selamat! Kamu masuk 3 besar 🎉" : "Peringkat Kamu"}
          </h3>
        </div>
        <p className={`hidden shrink-0 text-[11px] sm:block ${noteColor}`}>
          Data per {snapshotLabel} · update Senin 08.00 WIB
        </p>
      </div>

      <div className={`relative grid gap-3 sm:gap-4 ${single ? "" : "lg:grid-cols-2"}`}>
        {items.map((item) => {
          if (item.rank === null) {
            return (
              <div
                key={item.scope}
                className={`flex items-center gap-3 rounded-2xl border border-dashed p-3.5 sm:gap-4 sm:px-6 sm:py-4 ${
                  dark ? "border-slate-600 bg-slate-900/30" : "border-emerald-200 bg-white/50"
                }`}
              >
                <div className="flex w-16 shrink-0 justify-center sm:w-20">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${
                    dark ? "bg-slate-700 text-slate-400" : "bg-slate-100 text-slate-400"
                  }`}>
                    <Minus className="h-5 w-5" />
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <ScopeChip scope={item.scope} label={item.periodLabel} dark={dark} />
                  <p className={`mt-1 text-sm font-semibold ${dark ? "text-emerald-100" : "text-emerald-900"}`}>Belum masuk peringkat</p>
                  <p className={`text-xs ${dark ? "text-emerald-300/60" : "text-emerald-700/60"}`}>
                    Belum ada jurnal tervalidasi pada periode ini.
                  </p>
                </div>
              </div>
            );
          }

          if (item.rank <= 3) {
            return (
              <button
                key={item.scope}
                type="button"
                onClick={() => onOpen(item.scope)}
                className={`group flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left transition hover:shadow-md active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 sm:gap-4 sm:px-6 sm:py-5 ${cardBase}`}
              >
                <div className="flex w-16 shrink-0 justify-center sm:w-20">
                  <RankBadge rank={item.rank} dark={dark} />
                </div>
                <div className="min-w-0 flex-1">
                  <ScopeChip scope={item.scope} label={item.periodLabel} dark={dark} />
                  <p className={`mt-1 text-lg font-extrabold leading-tight sm:text-2xl ${dark ? "text-emerald-50" : "text-emerald-900"}`}>
                    {RANK_TITLE[item.rank]}
                  </p>
                  <p className={`text-xs sm:text-sm ${dark ? "text-emerald-300/70" : "text-emerald-700/70"}`}>
                    Peringkat #{item.rank} dari {item.total} murid
                  </p>
                </div>
                <Cta show={single} />
              </button>
            );
          }

          return (
            <button
              key={item.scope}
              type="button"
              onClick={() => onOpen(item.scope)}
              className={`group flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left transition hover:shadow-sm active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 sm:gap-4 sm:px-6 sm:py-4 ${plainCard}`}
            >
              <div className="flex w-16 shrink-0 justify-center sm:w-20">
                <div
                  aria-label={`Peringkat ${item.rank}`}
                  className={`flex h-12 min-w-[3.25rem] items-center justify-center rounded-xl px-2 font-bold ${
                    item.rank >= 100 ? "text-sm" : "text-base"
                  } ${dark ? "bg-slate-700 text-emerald-200" : "bg-emerald-100 text-emerald-700"}`}
                >
                  #{item.rank}
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <ScopeChip scope={item.scope} label={item.periodLabel} dark={dark} />
                <p className={`mt-1 text-sm font-semibold sm:text-base ${dark ? "text-emerald-100" : "text-emerald-900"}`}>
                  Peringkat {item.rank} dari {item.total} murid
                </p>
                {!!item.journalGap && item.journalGap > 0 && (
                  <p className={`text-xs ${dark ? "text-emerald-300/60" : "text-emerald-700/60"}`}>
                    {item.journalGap} jurnal lagi untuk menyamai peringkat 3
                  </p>
                )}
              </div>
              <Cta show={single} />
            </button>
          );
        })}
      </div>

      <p className={`relative mt-3 text-[11px] sm:hidden ${noteColor}`}>
        Data per {snapshotLabel}. Diperbarui tiap Senin 08.00 WIB.
      </p>
    </section>
  );
}
