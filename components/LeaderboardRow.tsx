"use client";

import type { ReactNode } from "react";
import RankBadge, { getTopRowAccent } from "@/components/RankBadge";

export default function LeaderboardRow({
  id,
  rank,
  title,
  subtitle,
  avatar,
  tag,
  highlight = false,
  journals,
  pages,
  books,
  progress,
  dark = false,
}: {
  id?: string;
  rank: number;
  title: string;
  subtitle?: string;
  avatar?: ReactNode;
  tag?: string;
  highlight?: boolean;
  journals: number;
  pages: number;
  books: number;
  progress?: number;
  dark?: boolean;
}) {
  const isTop3 = rank <= 3;

  const surface = highlight
    ? dark
      ? "bg-gradient-to-r from-emerald-900/50 to-teal-900/30 border-emerald-500/50 shadow-lg shadow-emerald-900/20"
      : "bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-300 shadow-md shadow-emerald-100"
    : `${dark ? "bg-slate-800/60" : "bg-white/80"} ${
        isTop3
          ? getTopRowAccent(rank, dark)
          : dark
          ? "border-slate-700 hover:border-slate-600"
          : "border-emerald-100 hover:border-emerald-200"
      }`;

  const muted = dark ? "text-emerald-300/75" : "text-emerald-700/75";
  const strong = dark ? "text-emerald-100" : "text-emerald-900";

  const stats = [
    { label: "Jurnal", value: journals },
    { label: "Halaman", value: pages },
    { label: "Buku", value: books },
  ];

  return (
    <div
      id={id}
      className={`relative rounded-2xl border px-3 py-3 transition-all duration-200 hover:shadow-md sm:px-5 sm:py-4 ${surface}`}
    >
      {highlight && (
        <span className="absolute left-0 top-1/2 h-10 w-1 -translate-y-1/2 rounded-r-full bg-emerald-500" aria-hidden="true" />
      )}

      <div className="flex items-center gap-2.5 sm:gap-4">
        <div className="flex w-14 shrink-0 justify-center sm:w-20">
          <RankBadge rank={rank} dark={dark} />
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-2.5 sm:gap-3.5">
          {avatar}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <h3 className={`truncate text-sm font-bold text-balance sm:text-base ${strong}`}>{title}</h3>
              {tag && (
                <span
                  className={`shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-bold sm:px-2 ${
                    dark ? "bg-emerald-500/20 text-emerald-300" : "bg-emerald-100 text-emerald-700"
                  }`}
                >
                  {tag}
                </span>
              )}
            </div>
            {subtitle && <p className={`mt-0.5 truncate text-[11px] sm:text-xs ${muted}`}>{subtitle}</p>}
          </div>
        </div>

        <div className="shrink-0 text-right sm:hidden">
          <p className={`text-base font-bold leading-none tabular-nums ${strong}`}>
            {journals}
            <span className={`ml-0.5 text-[11px] font-normal ${muted}`}>jurnal</span>
          </p>
          <p className={`mt-1 whitespace-nowrap text-[11px] ${muted}`}>
            {pages} hlm · {books} buku
          </p>
        </div>

        <dl className="hidden shrink-0 grid-cols-3 gap-2 sm:grid sm:w-60 lg:w-72">
          {stats.map((stat) => (
            <div key={stat.label} className="text-center">
              <dd className={`text-lg font-bold leading-none tabular-nums ${strong}`}>{stat.value}</dd>
              <dt className={`mt-1 text-[10px] font-semibold uppercase tracking-wider ${muted}`}>{stat.label}</dt>
            </div>
          ))}
        </dl>
      </div>

      {progress !== undefined && (
        <div className={`mt-2.5 h-1 overflow-hidden rounded-full sm:mt-3 sm:h-1.5 ${dark ? "bg-slate-700" : "bg-emerald-100"}`}>
          <div
            className={`h-full rounded-full ${
              rank === 1
                ? "bg-gradient-to-r from-yellow-400 to-amber-500"
                : rank === 2
                ? "bg-gradient-to-r from-slate-400 to-slate-500"
                : "bg-gradient-to-r from-amber-400 to-orange-500"
            }`}
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      )}
    </div>
  );
}
