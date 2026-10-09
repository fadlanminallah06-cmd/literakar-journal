"use client";

import { CalendarDays, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { formatMonthLabel, type LeaderboardPeriod } from "@/lib/leaderboard";

export default function LeaderboardPeriodPicker({
  period,
  month,
  months,
  onPeriodChange,
  onMonthChange,
  dark = false,
}: {
  period: LeaderboardPeriod;
  month: string;
  months: string[];
  onPeriodChange: (p: LeaderboardPeriod) => void;
  onMonthChange: (m: string) => void;
  dark?: boolean;
}) {
  const options: { key: LeaderboardPeriod; label: string; Icon: typeof Clock }[] = [
    { key: "month", label: "Bulanan", Icon: CalendarDays },
    { key: "all", label: "Sepanjang Waktu", Icon: Clock },
  ];

  const index = months.indexOf(month);
  const olderMonth = index >= 0 ? months[index + 1] : undefined;
  const newerMonth = index > 0 ? months[index - 1] : undefined;

  const arrowBtn = `flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:cursor-not-allowed disabled:opacity-30 ${
    dark
      ? "border-slate-600 bg-slate-800/60 text-emerald-300 hover:bg-slate-700"
      : "border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50"
  }`;

  return (
    <div className={`mb-4 w-full rounded-2xl border p-2.5 sm:mb-6 sm:p-3 ${
      dark ? "border-slate-700 bg-slate-900/50" : "border-emerald-100 bg-white/80"
    }`}>
      <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
        <div
          role="group"
          aria-label="Periode leaderboard"
          className={`grid w-full grid-cols-2 gap-1 rounded-xl p-1 lg:max-w-md ${
            dark ? "bg-slate-800/60" : "bg-emerald-900/5"
          }`}
        >
          {options.map(({ key, label, Icon }) => {
            const active = period === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onPeriodChange(key)}
                aria-pressed={active}
                className={`flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-lg px-2 text-[11px] font-bold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 sm:gap-2 sm:px-3 sm:text-sm ${
                  active
                    ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/25"
                    : dark
                    ? "text-emerald-300/70 hover:bg-slate-700 hover:text-emerald-200"
                    : "text-emerald-800/70 hover:bg-white hover:text-emerald-900"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{label}</span>
              </button>
            );
          })}
        </div>

        {period === "month" && (
          <div className="flex w-full items-center gap-2 lg:max-w-md">
            <button
              type="button"
              onClick={() => olderMonth && onMonthChange(olderMonth)}
              disabled={!olderMonth}
              aria-label="Bulan sebelumnya"
              title="Bulan sebelumnya"
              className={arrowBtn}
            >
              <ChevronLeft className="h-5 w-5" />
            </button>

            <select
              value={month}
              onChange={(event) => onMonthChange(event.target.value)}
              aria-label="Pilih bulan leaderboard"
              className={`h-11 min-w-0 flex-1 rounded-xl border px-3 text-center text-sm font-bold capitalize outline-none transition focus:ring-2 focus:ring-emerald-400 ${
                dark ? "border-slate-600 bg-slate-800/60 text-emerald-100" : "border-emerald-200 bg-white text-emerald-900"
              }`}
            >
              {months.map((value, monthIndex) => (
                <option key={value} value={value}>
                  {formatMonthLabel(value)}{monthIndex === 0 ? " (bulan ini)" : ""}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => newerMonth && onMonthChange(newerMonth)}
              disabled={!newerMonth}
              aria-label="Bulan berikutnya"
              title="Bulan berikutnya"
              className={arrowBtn}
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        )}
      </div>

      <p className={`mt-2.5 text-center text-[11px] lg:text-left ${dark ? "text-emerald-300/60" : "text-emerald-700/60"}`}>
        {period === "all"
          ? "Peringkat akumulasi dari seluruh jurnal tervalidasi."
          : `Peringkat khusus ${formatMonthLabel(month)}, dihitung ulang tiap bulan.`}{" "}
        Update Senin 08.00 WIB.
      </p>
    </div>
  );
}
