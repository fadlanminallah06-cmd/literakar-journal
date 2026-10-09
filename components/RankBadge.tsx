"use client";

import { Award, Crown, Medal, Sparkles } from "lucide-react";

const TOP = {
  1: {
    Icon: Crown, label: "Juara 1",
    grad: "from-yellow-200 via-amber-400 to-orange-500",
    glow: "bg-yellow-400", ring: "ring-yellow-300", chip: "bg-amber-500 text-white",
    box: "h-14 w-14 sm:h-[4.25rem] sm:w-[4.25rem]", icon: "h-7 w-7 sm:h-9 sm:w-9",
  },
  2: {
    Icon: Medal, label: "Juara 2",
    grad: "from-slate-100 via-slate-300 to-slate-500",
    glow: "bg-slate-300", ring: "ring-slate-200", chip: "bg-slate-500 text-white",
    box: "h-12 w-12 sm:h-[3.75rem] sm:w-[3.75rem]", icon: "h-6 w-6 sm:h-8 sm:w-8",
  },
  3: {
    Icon: Award, label: "Juara 3",
    grad: "from-orange-200 via-amber-600 to-orange-800",
    glow: "bg-orange-500", ring: "ring-orange-300", chip: "bg-orange-700 text-white",
    box: "h-12 w-12 sm:h-[3.75rem] sm:w-[3.75rem]", icon: "h-6 w-6 sm:h-8 sm:w-8",
  },
} as const;

export default function RankBadge({ rank, dark = false }: { rank: number; dark?: boolean }) {
  if (rank > 3) {
    return (
      <div
        aria-label={`Peringkat ${rank}`}
        className={`flex h-10 min-w-[2.5rem] shrink-0 items-center justify-center rounded-xl px-2 font-bold sm:h-12 sm:min-w-[3rem] ${
          rank >= 100 ? "text-xs sm:text-sm" : "text-sm sm:text-base"
        } ${dark ? "bg-slate-700 text-slate-300" : "bg-emerald-100 text-emerald-700"}`}
      >
        {rank}
      </div>
    );
  }

  const t = TOP[rank as 1 | 2 | 3];
  const Icon = t.Icon;

  return (
    <div className={`relative shrink-0 ${t.box} ${rank === 1 ? "rank-bob" : ""}`} role="img" aria-label={t.label}>
      <span className={`rank-glow absolute inset-0 rounded-2xl blur-lg ${t.glow}`} aria-hidden="true" />

      <div
        className={`relative flex h-full w-full items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br shadow-lg ring-2 ${t.grad} ${t.ring}`}
      >
        <span
          className="rank-shine pointer-events-none absolute inset-y-0 left-0 w-1/3 blur-[2px]"
          style={{ background: "rgba(255,255,255,0.5)" }}
          aria-hidden="true"
        />
        <span
          className="pointer-events-none absolute inset-x-0 top-0 h-1/2"
          style={{ background: "linear-gradient(to bottom, rgba(255,255,255,0.35), transparent)" }}
          aria-hidden="true"
        />
        <Icon
          className={`relative ${t.icon} text-white drop-shadow-[0_2px_2px_rgba(0,0,0,0.35)]`}
          strokeWidth={2}
          fill="currentColor"
          fillOpacity={0.18}
        />
      </div>

      <span
        className={`absolute -bottom-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-extrabold shadow-md ring-2 sm:h-6 sm:w-6 sm:text-xs ${t.chip} ${
          dark ? "ring-slate-900" : "ring-white"
        }`}
        aria-hidden="true"
      >
        {rank}
      </span>

      {rank === 1 && (
        <>
          <Sparkles className="rank-twinkle absolute -right-2 -top-2 h-4 w-4 text-yellow-400 sm:h-5 sm:w-5" aria-hidden="true" />
          <Sparkles className="rank-twinkle absolute -left-2 bottom-1 h-3 w-3 text-amber-300" style={{ animationDelay: "0.9s" }} aria-hidden="true" />
        </>
      )}
    </div>
  );
}

/** Warna border + shadow eksklusif untuk baris top 3. */
export function getTopRowAccent(rank: number, dark = false): string {
  if (rank === 1) return dark ? "border-yellow-500/50 shadow-lg shadow-yellow-900/20" : "border-yellow-300 shadow-md shadow-yellow-100";
  if (rank === 2) return dark ? "border-slate-400/50" : "border-slate-300";
  if (rank === 3) return dark ? "border-orange-500/40" : "border-orange-300";
  return "";
}
