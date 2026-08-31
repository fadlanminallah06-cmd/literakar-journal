"use client";

import { useState, useEffect, useMemo, useId, useCallback, useRef, type CSSProperties } from "react";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { useRouter } from "next/navigation";
import {
  LogOut,
  BookOpen,
  Flame,
  CalendarCheck,
  Library,
  Award,
  LockKeyhole,
  Medal,
  Trophy,
  Search,
  Trash2,
  Moon,
  Sun,
  Target,
  AlertTriangle,
  Sparkles,
  Crown,
  Zap,
  CalendarDays,
  Gem,
  Rocket,
  Star,
  Compass,
  Heart,
  Sunrise,
  Home,
  NotebookPen,
  History,
  TreeDeciduous,
  ChevronRight,
} from "lucide-react";

interface ProgressEntry {
  id: string;
  startPage: number;
  endPage: number;
  summary: string;
  timestamp: Date | string | number | { toDate?: () => Date } | null;
}

interface Journal {
  id: string;
  studentId: string;
  studentName: string;
  classCode: string;
  bookTitle: string;
  author: string;
  genre?: string;
  startPage: number;
  endPage: number;
  summary: string;
  characterValues: string[];
  finished?: boolean;
  status: string; // "pending" | "revision" | "approved"
  teacherFeedback?: string;
  progressLog?: ProgressEntry[];
  createdAt?: Date | string | number | { toDate?: () => Date } | null;
  updatedAt?: Date | string | number | { toDate?: () => Date } | null;
}

/** Baris agregat leaderboard: statistik gabungan seorang siswa dari SEMUA jurnalnya,
 *  dihitung lintas siswa (bukan hanya milik siswa yang sedang login). */
interface LeaderboardEntry {
  studentId: string;
  studentName: string;
  classCode: string;
  journalCount: number;
  booksFinished: number;
}

type TabKey = "beranda" | "jurnal" | "riwayat" | "badge" | "pohon" | "leaderboard";
type BadgeFilter = "semua" | "terkunci" | "didapat";
type RiwayatStatusFilter = "semua" | "pending" | "revision" | "approved";
type NormalizedStatus = "pending" | "revision" | "approved";
type LeaderboardSubTab = "semua" | "kelas";

type TreeStage = "small" | "young" | "big";

const CHARACTER_OPTIONS = [
  "Religius",
  "Nasionalisme",
  "Bijaksana",
  "Kreatif",
  "Kerja Sama",
  "Tanggung Jawab",
  "Pola Hidup Sehat",
  "Pandai Berkomunikasi",
];

const GENRE_SUGGESTIONS = ["Fiksi", "Non-Fiksi", "Petualangan", "Fantasi", "Biografi", "Sains", "Sejarah"];

function toDateSafe(
  value: Date | string | number | { toDate?: () => Date } | null | undefined
): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "object" && typeof value.toDate === "function") return value.toDate();
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function formatTanggal(d: Date | null): string {
  if (!d) return "-";
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

function getStartOfMonth(date: Date): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  start.setHours(0, 0, 0, 0);
  return start;
}

function formatGender(g?: string): string {
  if (g === "laki-laki") return "Laki-laki";
  if (g === "perempuan") return "Perempuan";
  return "";
}

/** Satu sumber kebenaran untuk status jurnal, dipakai di seluruh dashboard siswa
 *  (filter riwayat, badge tab, warna badge) supaya konsisten dengan dashboard guru. */
function normalizeStatus(status: string): NormalizedStatus {
  if (status === "approved") return "approved";
  if (status === "revision") return "revision";
  return "pending";
}

/** Satu sumber kebenaran untuk urutan leaderboard: jumlah jurnal terbanyak dulu
 *  (indikator kerajinan), lalu jumlah buku selesai. Dipakai untuk leaderboard
 *  global maupun leaderboard per kelas supaya hasilnya konsisten. */
function sortLeaderboardEntries(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  return [...entries].sort((a, b) => {
    if (b.journalCount !== a.journalCount) return b.journalCount - a.journalCount;
    return b.booksFinished - a.booksFinished;
  });
}

/* ------------------------------------------------------------------ */
/* Badge / Achievement — daftar pencapaian, tier warna, dan progress.  */
/* ------------------------------------------------------------------ */

type BadgeTier = "bronze" | "silver" | "gold";
type BadgeMetricKey =
  | "booksFinished"
  | "streak"
  | "weeklyDays"
  | "totalPages"
  | "maxSinglePages"
  | "journalCount"
  | "genreCount"
  | "characterVarietyCount"
  | "earlyBird"
  | "nightOwl";

interface BadgeDef {
  key: string;
  title: string;
  description: string;
  category: string;
  tier: BadgeTier;
  target: number;
  metric: BadgeMetricKey;
  icon: string;
}

interface BadgeComputed extends BadgeDef {
  current: number;
  earned: boolean;
  percent: number;
}

const CATEGORY_ORDER = ["Jumlah Buku", "Konsistensi", "Halaman & Maraton", "Eksplorasi & Kebiasaan"];

const BADGE_DEFS: BadgeDef[] = [
  { key: "pemula", title: "Pembaca Pemula", description: "Baca 1 buku", category: "Jumlah Buku", tier: "bronze", target: 1, metric: "booksFinished", icon: "book" },
  { key: "aktif", title: "Pembaca Aktif", description: "Baca 3 buku", category: "Jumlah Buku", tier: "bronze", target: 3, metric: "booksFinished", icon: "library" },
  { key: "andal", title: "Pembaca Andal", description: "Baca 5 buku", category: "Jumlah Buku", tier: "silver", target: 5, metric: "booksFinished", icon: "trophy" },
  { key: "maestro", title: "Pembaca Maestro", description: "Baca 10 buku", category: "Jumlah Buku", tier: "gold", target: 10, metric: "booksFinished", icon: "crown" },

  { key: "konsisten7", title: "Konsisten 7 Hari", description: "Kirim jurnal 7 hari berturut-turut", category: "Konsistensi", tier: "silver", target: 7, metric: "streak", icon: "flame" },
  { key: "konsisten30", title: "Konsisten 30 Hari", description: "Kirim jurnal 30 hari berturut-turut", category: "Konsistensi", tier: "gold", target: 30, metric: "streak", icon: "zap" },
  { key: "mingguan", title: "Rajin Mingguan", description: "Isi jurnal 5 hari dalam minggu ini", category: "Konsistensi", tier: "bronze", target: 5, metric: "weeklyDays", icon: "calendar" },

  { key: "berbuah", title: "Pembaca Berbuah", description: "Membaca 1000 halaman", category: "Halaman & Maraton", tier: "silver", target: 1000, metric: "totalPages", icon: "medal" },
  { key: "kutubuku", title: "Kutu Buku Sejati", description: "Membaca 2500 halaman", category: "Halaman & Maraton", tier: "gold", target: 2500, metric: "totalPages", icon: "gem" },
  { key: "maraton", title: "Maraton Sehari", description: "Baca 50+ halaman dalam satu jurnal", category: "Halaman & Maraton", tier: "bronze", target: 50, metric: "maxSinglePages", icon: "rocket" },

  { key: "jurnalpertama", title: "Jurnal Pertama", description: "Kirim jurnal pertamamu", category: "Eksplorasi & Kebiasaan", tier: "bronze", target: 1, metric: "journalCount", icon: "star" },
  { key: "genre", title: "Jelajah Genre", description: "Baca 3 genre buku berbeda", category: "Eksplorasi & Kebiasaan", tier: "silver", target: 3, metric: "genreCount", icon: "compass" },
  { key: "nilai", title: "Pemburu Nilai", description: "Temukan 5 nilai karakter berbeda", category: "Eksplorasi & Kebiasaan", tier: "silver", target: 5, metric: "characterVarietyCount", icon: "heart" },
  { key: "pagi", title: "Si Rajin Pagi", description: "Isi jurnal sebelum jam 7 pagi", category: "Eksplorasi & Kebiasaan", tier: "bronze", target: 1, metric: "earlyBird", icon: "sunrise" },
  { key: "malam", title: "Burung Hantu Baca", description: "Isi jurnal setelah jam 9 malam", category: "Eksplorasi & Kebiasaan", tier: "bronze", target: 1, metric: "nightOwl", icon: "moon" },
];

const TIER_STYLES: Record<BadgeTier, { earnedBg: string; label: string }> = {
  bronze: { earnedBg: "bg-gradient-to-br from-amber-500 to-orange-600", label: "Perunggu" },
  silver: { earnedBg: "bg-gradient-to-br from-slate-300 to-slate-500", label: "Perak" },
  gold: { earnedBg: "bg-gradient-to-br from-yellow-300 via-amber-400 to-orange-500", label: "Emas" },
};

function BadgeIcon({ icon, earned }: { icon: string; earned: boolean }) {
  const className = `w-7 h-7 sm:w-8 sm:h-8 ${earned ? "text-white" : "text-slate-400"}`;
  switch (icon) {
    case "library":
      return <Library className={className} />;
    case "trophy":
      return <Trophy className={className} />;
    case "crown":
      return <Crown className={className} />;
    case "flame":
      return <Flame className={className} />;
    case "zap":
      return <Zap className={className} />;
    case "calendar":
      return <CalendarDays className={className} />;
    case "medal":
      return <Medal className={className} />;
    case "gem":
      return <Gem className={className} />;
    case "rocket":
      return <Rocket className={className} />;
    case "star":
      return <Star className={className} />;
    case "compass":
      return <Compass className={className} />;
    case "heart":
      return <Heart className={className} />;
    case "sunrise":
      return <Sunrise className={className} />;
    case "moon":
      return <Moon className={className} />;
    default:
      return <BookOpen className={className} />;
  }
}

function BadgeCard({
  title,
  description,
  earned,
  dark,
  tier,
  icon,
  current,
  target,
  isNew,
}: {
  title: string;
  description: string;
  earned: boolean;
  dark: boolean;
  tier: BadgeTier;
  icon: string;
  current: number;
  target: number;
  isNew?: boolean;
}) {
  const tierStyle = TIER_STYLES[tier];
  const showProgress = !earned && target > 1;
  const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0;

  return (
    <div
      className={`relative flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-2xl border transition-all duration-200 hover:-translate-y-0.5 ${
        earned
          ? dark
            ? "bg-slate-800 border-emerald-700/70 shadow-md shadow-black/20"
            : "bg-white border-emerald-200 shadow-md shadow-emerald-900/[0.06]"
          : dark
          ? "bg-slate-800/40 border-slate-700/70"
          : "bg-slate-50/80 border-slate-200/80"
      }`}
    >
      {isNew && (
        <span className="absolute -top-2 -right-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-500 text-white shadow-sm shadow-orange-900/20 animate-bounce">
          Baru!
        </span>
      )}
      <div
        className={`w-12 h-12 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center shrink-0 ${
          earned ? tierStyle.earnedBg + " shadow-inner shadow-black/10" : dark ? "bg-slate-700/70" : "bg-slate-200/80"
        }`}
      >
        <BadgeIcon icon={icon} earned={earned} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className={`text-sm sm:text-base font-bold ${earned ? (dark ? "text-emerald-100" : "text-emerald-900") : "text-slate-500"}`}>{title}</h3>
          {!earned && <LockKeyhole className="w-3.5 h-3.5 text-slate-400" />}
          {earned && <Award className="w-3.5 h-3.5 text-amber-500" />}
          {earned && (
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                dark ? "bg-slate-700 text-emerald-200" : "bg-emerald-50 text-emerald-700"
              }`}
            >
              {tierStyle.label}
            </span>
          )}
        </div>
        <p className={`text-xs mt-1 ${earned ? (dark ? "text-emerald-300/70" : "text-emerald-700/70") : "text-slate-400"}`}>{description}</p>
        {showProgress && (
          <div className="mt-2">
            <div className="h-1.5 rounded-full bg-slate-200/70 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-lime-400 to-emerald-600 transition-all duration-700"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              {current} / {target}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pohon Literasi — ilustrasi SVG organik yang dipakai bersama oleh    */
/* versi besar (tab Pohon Literasi) dan versi mini (kartu Beranda).    */
/* ------------------------------------------------------------------ */

const TREE_STAGE_META: Record<
  TreeStage,
  { label: string; range: string; mood: string; palette: { a: string; b: string; dark: string } }
> = {
  small: {
    label: "Pohon Kecil",
    range: "1 - 50 halaman",
    mood: "🌱",
    palette: { a: "#bef264", b: "#4ade80", dark: "#22c55e" },
  },
  young: {
    label: "Pohon Muda",
    range: "51 - 250 halaman",
    mood: "🙂",
    palette: { a: "#86efac", b: "#16a34a", dark: "#15803d" },
  },
  big: {
    label: "Pohon Besar",
    range: "251+ halaman",
    mood: "😊",
    palette: { a: "#4ade80", b: "#15803d", dark: "#14532d" },
  },
};

function getTreeStage(totalPages: number): TreeStage {
  if (totalPages >= 251) return "big";
  if (totalPages >= 51) return "young";
  return "small";
}

// Bentuk kanopi organik (blob), dipakai untuk semua tahap — hanya warna,
// ukuran dan hiasan (kuncup/buah) yang berbeda tiap tahap.
const CANOPY_BLOB_PATH =
  "M40,92 C18,90 8,60 30,44 C24,18 56,8 76,24 C92,3 132,4 142,28 C168,22 182,54 160,74 C177,96 154,122 128,116 C118,137 78,141 64,120 C33,131 18,105 40,92 Z";

function TreeCanopy({
  stage,
  gradId,
  showBuds = false,
  showFruit = false,
}: {
  stage: TreeStage;
  gradId: string;
  showBuds?: boolean;
  showFruit?: boolean;
}) {
  const palette = TREE_STAGE_META[stage].palette;

  return (
    <g>
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={palette.a} />
          <stop offset="100%" stopColor={palette.b} />
        </linearGradient>
      </defs>

      {/* bayangan lembut di belakang kanopi */}
      <path d={CANOPY_BLOB_PATH} transform="translate(6,10) scale(0.98)" fill={palette.dark} opacity={0.16} />
      {/* kanopi utama */}
      <path d={CANOPY_BLOB_PATH} fill={`url(#${gradId})`} />
      {/* lapisan dalam untuk kedalaman */}
      <path d={CANOPY_BLOB_PATH} transform="translate(20,18) scale(0.55)" fill={palette.dark} opacity={0.22} />
      {/* highlight cahaya */}
      <ellipse cx="70" cy="35" rx="26" ry="14" fill="#ffffff" opacity={0.25} />

      {showBuds && (
        <>
          <circle cx="60" cy="70" r="4" fill="#fef08a" opacity={0.9} />
          <circle cx="120" cy="55" r="3.5" fill="#fef08a" opacity={0.9} />
          <circle cx="95" cy="30" r="3" fill="#fef9c3" opacity={0.9} />
        </>
      )}

      {showFruit && (
        <>
          <circle cx="55" cy="75" r="5" fill="#f97316" />
          <circle cx="100" cy="95" r="5" fill="#ef4444" />
          <circle cx="128" cy="60" r="4.5" fill="#f97316" />
          <circle cx="80" cy="45" r="4" fill="#ef4444" />
          <circle cx="140" cy="90" r="4" fill="#fb923c" />
        </>
      )}
    </g>
  );
}

// Transformasi posisi/skala kanopi relatif terhadap batang, per tahap.
function canopyTransform(stage: TreeStage, variant: "full" | "mini") {
  if (variant === "mini") {
    if (stage === "big") return "translate(-25,-10) scale(1.1)";
    if (stage === "young") return "translate(-10,25) scale(0.9)";
    return "translate(10,60) scale(0.6)";
  }
  if (stage === "big") return "translate(-30,-15) scale(1.15)";
  if (stage === "young") return "translate(-15,20) scale(0.95)";
  return "translate(5,55) scale(0.65)";
}

function TreeShareStyles({ scope }: { scope: "full" | "mini" }) {
  // Style ambient (goyang pelan) + animasi tap/daun jatuh untuk versi penuh.
  if (scope === "mini") {
    return (
      <style>{`
        @keyframes tree-idle-sway-mini { 0%,100% { transform: rotate(-1.5deg); } 50% { transform: rotate(1.5deg); } }
        .tree-idle-sway-mini { transform-origin: 50% 100%; animation: tree-idle-sway-mini 5s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .tree-idle-sway-mini { animation: none !important; } }
      `}</style>
    );
  }
  return (
    <style>{`
      @keyframes tree-idle-sway { 0%,100% { transform: rotate(-1deg); } 50% { transform: rotate(1deg); } }
      @keyframes tree-tap-sway {
        0%,100% { transform: rotate(0deg); }
        20% { transform: rotate(-6deg); }
        40% { transform: rotate(5deg); }
        60% { transform: rotate(-3deg); }
        80% { transform: rotate(2deg); }
      }
      @keyframes leaf-fall {
        0% { transform: translateY(-10px) rotate(0deg); opacity: 0; }
        10% { opacity: 1; }
        100% { transform: translateY(160px) rotate(var(--leaf-rot)); opacity: 0; }
      }
      .tree-idle-sway { transform-origin: 50% 100%; animation: tree-idle-sway 4.5s ease-in-out infinite; }
      .tree-tap-sway { transform-origin: 50% 100%; animation: tree-tap-sway 0.9s ease-in-out; }
      .leaf-particle { animation: leaf-fall linear forwards; }
      @media (prefers-reduced-motion: reduce) {
        .tree-idle-sway, .tree-tap-sway, .leaf-particle { animation: none !important; }
      }
    `}</style>
  );
}

function TreeGrowth({ totalPages, dark }: { totalPages: number; dark: boolean }) {
  const uid = useId();
  const [isSwaying, setIsSwaying] = useState(false);
  const [leaves, setLeaves] = useState<
    { id: number; left: number; delay: number; duration: number; rotate: number; emoji: string }[]
  >([]);

  const stage = getTreeStage(totalPages);
  const stageMeta = TREE_STAGE_META[stage];

  const nextTarget = totalPages < 51 ? 51 : totalPages < 251 ? 251 : 500;
  const remaining = Math.max(0, nextTarget - totalPages);

  const segments: { key: TreeStage; label: string; icon: string; pct: number }[] = [
    { key: "small", label: "Kecil", icon: "🌱", pct: Math.min(100, (totalPages / 50) * 100) },
    {
      key: "young",
      label: "Muda",
      icon: "🌿",
      pct: totalPages <= 50 ? 0 : Math.min(100, ((totalPages - 50) / 200) * 100),
    },
    {
      key: "big",
      label: "Besar",
      icon: "🌳",
      pct: totalPages <= 250 ? 0 : Math.min(100, ((totalPages - 250) / 250) * 100),
    },
  ];

  const shakeTree = () => {
    setIsSwaying(true);
    window.setTimeout(() => setIsSwaying(false), 900);

    const emojis = ["🍃", "🌿", "🍀"];
    const burst = Array.from({ length: 9 }).map((_, i) => ({
      id: Date.now() + i,
      left: 15 + Math.random() * 70,
      delay: Math.random() * 0.25,
      duration: 1.2 + Math.random() * 0.7,
      rotate: Math.random() * 360,
      emoji: emojis[Math.floor(Math.random() * emojis.length)],
    }));
    setLeaves(burst);
    window.setTimeout(() => setLeaves([]), 2200);
  };

  return (
    <div className={`p-4 sm:p-6 rounded-3xl shadow-md border ${dark ? "bg-slate-800/80 border-slate-700 shadow-black/20" : "bg-white/90 backdrop-blur-sm shadow-emerald-900/[0.06] border-white"}`}>
      <TreeShareStyles scope="full" />

      <div className="flex items-center gap-3 mb-5">
        <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-2xl flex items-center justify-center shrink-0 ${dark ? "bg-emerald-900/60 text-emerald-300" : "bg-emerald-100 text-emerald-700"}`}>
          <Library className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <h2 className={`text-base sm:text-lg font-bold tracking-tight ${dark ? "text-emerald-100" : "text-emerald-900"}`}>Pohon Literasi</h2>
          <p className={`text-xs ${dark ? "text-emerald-300/60" : "text-emerald-700/60"}`}>Setiap halaman yang kamu baca membantu pohonmu tumbuh.</p>
        </div>
      </div>

      <div className="relative rounded-2xl bg-gradient-to-b from-sky-100 via-emerald-50 to-lime-100 p-4 sm:p-5 text-center overflow-hidden ring-1 ring-black/5">
        {/* matahari samar */}
        <div className="pointer-events-none absolute -top-8 -right-8 w-28 h-28 rounded-full bg-amber-200/50 blur-2xl" />
        <div className="pointer-events-none absolute top-4 right-6 w-10 h-10 rounded-full bg-gradient-to-br from-yellow-200 to-amber-300 opacity-80" />

        <p className="relative text-xs font-medium text-emerald-700/70">Total halaman yang dibaca</p>
        <p className="relative text-2xl sm:text-3xl font-bold text-emerald-900 mt-1 tracking-tight">{totalPages} halaman</p>

        <button
          type="button"
          onClick={shakeTree}
          aria-label="Sentuh pohon literasi"
          className="relative mx-auto mt-3 block w-full max-w-xs h-52 sm:h-64 group focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded-2xl"
        >
          {/* daun berjatuhan saat disentuh */}
          {leaves.map((leaf) => (
            <span
              key={leaf.id}
              className="leaf-particle absolute text-lg pointer-events-none"
              style={
                {
                  left: `${leaf.left}%`,
                  top: "35%",
                  animationDelay: `${leaf.delay}s`,
                  animationDuration: `${leaf.duration}s`,
                  ["--leaf-rot" as string]: `${leaf.rotate}deg`,
                } as CSSProperties
              }
            >
              {leaf.emoji}
            </span>
          ))}

          {/* tanah / rumput */}
          <svg viewBox="0 0 200 40" className="absolute bottom-0 left-1/2 -translate-x-1/2 w-48 sm:w-56" aria-hidden="true">
            <ellipse cx="100" cy="20" rx="95" ry="14" fill="#bbf7d0" opacity={0.7} />
            <circle cx="60" cy="16" r="3.5" fill="#facc15" opacity={0.7} />
            <circle cx="140" cy="22" r="3.5" fill="#f9a8d4" opacity={0.6} />
            <circle cx="30" cy="22" r="2.5" fill="#a7f3d0" opacity={0.8} />
          </svg>

          {/* pohon */}
          <svg
            viewBox="0 0 200 220"
            className={`absolute bottom-3 left-1/2 -translate-x-1/2 h-full transition-transform duration-300 group-hover:scale-[1.03] ${
              isSwaying ? "tree-tap-sway" : "tree-idle-sway"
            }`}
          >
            <defs>
              <linearGradient id={`${uid}-trunk`} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#92400e" />
                <stop offset="100%" stopColor="#c2793a" />
              </linearGradient>
            </defs>

            {/* batang */}
            <path d="M92,215 C90,180 90,150 96,120 L104,120 C110,150 110,180 108,215 Z" fill={`url(#${uid}-trunk)`} />
            <path d="M96,150 C85,145 75,148 68,140" stroke="#92400e" strokeWidth="5" strokeLinecap="round" fill="none" />
            <path d="M104,145 C115,140 122,142 130,133" stroke="#92400e" strokeWidth="5" strokeLinecap="round" fill="none" />

            {/* kanopi sesuai tahap */}
            <g transform={canopyTransform(stage, "full")}>
              <TreeCanopy
                stage={stage}
                gradId={`${uid}-canopy`}
                showBuds={stage === "young"}
                showFruit={stage === "big"}
              />
            </g>
          </svg>

          <span className="absolute top-2 left-1/2 -translate-x-1/2 text-xl">{stageMeta.mood}</span>
        </button>

        <p className="relative text-xs text-emerald-700/60 -mt-1">Sentuh pohon untuk membuatnya bergoyang!</p>
        <h3 className="relative text-lg sm:text-xl font-bold text-emerald-900 mt-3 tracking-tight">{stageMeta.label}</h3>
        <p className="relative text-sm font-semibold text-emerald-800">({stageMeta.range})</p>

        {/* progres bertahap: Kecil -> Muda -> Besar */}
        <div className="relative max-w-md mx-auto mt-5">
          <div className="flex gap-1.5">
            {segments.map((seg) => (
              <div key={seg.key} className="flex-1">
                <div className="h-2.5 rounded-full bg-emerald-900/10 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${
                      seg.key === stage ? "bg-gradient-to-r from-lime-400 to-emerald-600" : "bg-emerald-400/70"
                    }`}
                    style={{ width: `${seg.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-1.5">
            {segments.map((seg) => (
              <span
                key={seg.key}
                className={`text-[10px] sm:text-[11px] font-medium flex items-center gap-1 ${
                  seg.key === stage ? "text-emerald-800" : "text-emerald-700/40"
                }`}
              >
                <span>{seg.icon}</span>
                <span className="hidden xs:inline">{seg.label}</span>
              </span>
            ))}
          </div>
          <p className="text-xs text-emerald-700/60 mt-3">
            {totalPages >= 500
              ? "Pohon besar tumbuh subur! Terus membaca untuk menjaganya."
              : `Menuju tahap berikutnya: ${remaining} halaman lagi`}
          </p>
        </div>
      </div>
    </div>
  );
}

function TreeProgressIcon({ totalPages, dark }: { totalPages: number; dark: boolean }) {
  const uid = useId();
  const stage = getTreeStage(totalPages);
  const stageMeta = TREE_STAGE_META[stage];

  return (
    <div className={`flex items-center gap-3 rounded-2xl border px-3 sm:px-4 py-2.5 sm:py-3 shrink-0 w-full sm:w-auto ${dark ? "bg-gradient-to-br from-slate-800 to-slate-800 border-emerald-800" : "bg-gradient-to-br from-emerald-50 to-lime-50 border-emerald-100"}`}>
      <TreeShareStyles scope="mini" />
      <svg viewBox="0 0 200 200" className="w-12 h-12 sm:w-14 sm:h-14 tree-idle-sway-mini shrink-0" aria-hidden="true">
        <defs>
          <linearGradient id={`${uid}-trunk-mini`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#92400e" />
            <stop offset="100%" stopColor="#c2793a" />
          </linearGradient>
        </defs>
        <path d="M94,195 C92,165 92,140 97,115 L103,115 C108,140 108,165 106,195 Z" fill={`url(#${uid}-trunk-mini)`} />
        <g transform={canopyTransform(stage, "mini")}>
          <TreeCanopy stage={stage} gradId={`${uid}-canopy-mini`} showBuds={stage === "young"} showFruit={stage === "big"} />
        </g>
      </svg>
      <div className="min-w-0">
        <p className={`text-xs ${dark ? "text-emerald-300/60" : "text-emerald-700/60"}`}>Pohonmu saat ini</p>
        <p className={`text-sm font-bold truncate ${dark ? "text-emerald-100" : "text-emerald-900"}`}>{stageMeta.label}</p>
        <p className={`text-xs ${dark ? "text-emerald-300/70" : "text-emerald-700/70"}`}>{totalPages} halaman</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function StatCard({
  label,
  value,
  icon,
  color = "emerald",
  dark = false,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color?: "emerald" | "orange" | "blue" | "yellow";
  dark?: boolean;
}) {
  const colorMap: Record<string, { bg: string; text: string; bgDark: string; textDark: string }> = {
    emerald: { bg: "bg-emerald-100", text: "text-emerald-700", bgDark: "bg-emerald-900/50", textDark: "text-emerald-300" },
    orange: { bg: "bg-orange-100", text: "text-orange-600", bgDark: "bg-orange-900/40", textDark: "text-orange-300" },
    blue: { bg: "bg-blue-100", text: "text-blue-700", bgDark: "bg-blue-900/40", textDark: "text-blue-300" },
    yellow: { bg: "bg-yellow-100", text: "text-yellow-700", bgDark: "bg-yellow-900/40", textDark: "text-yellow-300" },
  };
  const c = colorMap[color];

  return (
    <div className={`p-3 sm:p-4 rounded-2xl shadow-md border flex flex-col gap-1.5 sm:gap-2 transition-transform duration-200 hover:-translate-y-0.5 ${dark ? "bg-slate-800/80 border-slate-700 shadow-black/20" : "bg-white/90 backdrop-blur-sm shadow-emerald-900/[0.06] border-emerald-100/80"}`}>
      <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center ${dark ? c.bgDark + " " + c.textDark : c.bg + " " + c.text}`}>
        {icon}
      </div>
      <span className={`text-xl sm:text-2xl font-bold tracking-tight ${dark ? "text-emerald-100" : "text-emerald-900"}`}>{value}</span>
      <span className={`text-[11px] sm:text-xs font-medium leading-snug ${dark ? "text-emerald-300/70" : "text-emerald-700/70"}`}>{label}</span>
    </div>
  );
}

/** Fitur #5: grafik SVG progres halaman harian milik siswa sendiri (14 hari terakhir). */
function MyProgressChart({ journals, dark }: { journals: Journal[]; dark: boolean }) {
  const data = useMemo(() => {
    const map = new Map<string, number>();
    const now = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      map.set(d.toISOString().slice(0, 10), 0);
    }
    journals.forEach((j) => {
      const d = toDateSafe(j.createdAt);
      if (!d) return;
      const key = d.toISOString().slice(0, 10);
      if (!map.has(key)) return;
      const pages = Number(j.endPage) - Number(j.startPage);
      if (!Number.isNaN(pages) && pages > 0) {
        map.set(key, (map.get(key) || 0) + pages);
      }
    });
    return Array.from(map.entries()).map(([date, pages]) => ({ date, pages }));
  }, [journals]);

  const max = Math.max(...data.map((d) => d.pages), 1);
  const w = 560;
  const h = 160;
  const pad = 28;
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;

  const points = data
    .map((d, i) => {
      const x = pad + (i / Math.max(data.length - 1, 1)) * innerW;
      const y = pad + innerH - (d.pages / max) * innerH;
      return `${x},${y}`;
    })
    .join(" ");

  const gridColor = dark ? "#134e4a" : "#d1fae5";
  const lineColor = dark ? "#34d399" : "#059669";
  const labelColor = dark ? "#6ee7b7" : "#047857";

  return (
    <div className={`p-4 sm:p-5 rounded-2xl shadow-md border ${dark ? "bg-slate-800/80 border-slate-700 shadow-black/20" : "bg-white/90 backdrop-blur-sm shadow-emerald-900/[0.06] border-white"}`}>
      <h3 className={`text-sm font-semibold mb-2 ${dark ? "text-emerald-200/80" : "text-emerald-800/70"}`}>
        Progres Membacamu (14 hari terakhir)
      </h3>
      <div className="w-full overflow-x-auto">
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full min-w-[420px] sm:min-w-0 max-w-full h-36 sm:h-40">
          {[0, 0.25, 0.5, 0.75, 1].map((t) => {
            const y = pad + innerH - t * innerH;
            return <line key={t} x1={pad} y1={y} x2={w - pad} y2={y} stroke={gridColor} strokeWidth="1" />;
          })}
          <polyline fill="none" stroke={lineColor} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" points={points} />
          {data.map((d, i) => {
            const x = pad + (i / Math.max(data.length - 1, 1)) * innerW;
            const y = pad + innerH - (d.pages / max) * innerH;
            return (
              <g key={d.date}>
                <circle cx={x} cy={y} r="3.5" fill={lineColor} />
                {i % 2 === 0 && (
                  <text x={x} y={h - 6} textAnchor="middle" fill={labelColor} fontSize="9">
                    {d.date.slice(8)}
                  </text>
                )}
              </g>
            );
          })}
          <text x={pad} y={14} fill={labelColor} fontSize="10">
            Halaman / hari
          </text>
        </svg>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Literakar — maskot pohon + buku untuk perayaan target harian.       */
/* ------------------------------------------------------------------ */

function LiterakarMascot() {
  return (
    <svg viewBox="0 0 200 220" className="w-28 h-32 sm:w-36 sm:h-40 mx-auto mascot-pop">
      <defs>
        <linearGradient id="literakar-leaf" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#86efac" />
          <stop offset="100%" stopColor="#16a34a" />
        </linearGradient>
        <linearGradient id="literakar-book" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fde68a" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>
      </defs>

      {/* bayangan tanah */}
      <ellipse cx="100" cy="205" rx="55" ry="8" fill="#15803d" opacity={0.15} />

      {/* kaki/batang kecil */}
      <rect x="90" y="165" width="20" height="35" rx="8" fill="#92400e" />

      {/* badan daun (blob) */}
      <path
        d="M100,60 C150,55 175,95 165,130 C175,165 140,185 100,180 C60,185 25,165 35,130 C25,95 50,55 100,60 Z"
        fill="url(#literakar-leaf)"
      />
      <ellipse cx="75" cy="90" rx="20" ry="12" fill="#ffffff" opacity={0.25} />

      {/* wajah */}
      <circle cx="80" cy="115" r="6" fill="#14532d" />
      <circle cx="120" cy="115" r="6" fill="#14532d" />
      <circle cx="82" cy="113" r="2" fill="#ffffff" />
      <circle cx="122" cy="113" r="2" fill="#ffffff" />
      <path d="M78,135 Q100,152 122,135" stroke="#14532d" strokeWidth="4" fill="none" strokeLinecap="round" />
      <circle cx="65" cy="128" r="6" fill="#fca5a5" opacity={0.6} />
      <circle cx="135" cy="128" r="6" fill="#fca5a5" opacity={0.6} />

      {/* lengan kiri melambai */}
      <path
        d="M45,120 C25,110 15,90 25,75"
        stroke="#16a34a"
        strokeWidth="10"
        strokeLinecap="round"
        fill="none"
        className="mascot-wave"
      />

      {/* lengan kanan memegang buku */}
      <path d="M155,125 C172,120 178,105 172,95" stroke="#16a34a" strokeWidth="10" strokeLinecap="round" fill="none" />
      <g transform="translate(150,72) rotate(18)">
        <rect x="0" y="0" width="34" height="24" rx="3" fill="url(#literakar-book)" stroke="#b45309" strokeWidth="1.5" />
        <line x1="17" y1="2" x2="17" y2="22" stroke="#b45309" strokeWidth="1.5" />
      </g>
    </svg>
  );
}

function MascotCelebrationStyles() {
  return (
    <style>{`
      @keyframes mascot-pop-in {
        0% { transform: scale(0) rotate(-8deg); opacity: 0; }
        60% { transform: scale(1.12) rotate(3deg); opacity: 1; }
        80% { transform: scale(0.96) rotate(-2deg); }
        100% { transform: scale(1) rotate(0deg); }
      }
      @keyframes mascot-wave-arm {
        0%, 100% { transform: rotate(0deg); }
        50% { transform: rotate(-18deg); }
      }
      @keyframes mascot-bounce-idle {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-6px); }
      }
      @keyframes confetti-pop-fall {
        0% { transform: translateY(-20px) rotate(0deg) scale(0.6); opacity: 0; }
        10% { opacity: 1; }
        100% { transform: translateY(220px) rotate(var(--c-rot)); opacity: 0; }
      }
      @keyframes celebration-fade-in {
        0% { opacity: 0; } 100% { opacity: 1; }
      }
      @keyframes celebration-card-in {
        0% { transform: translateY(24px) scale(0.94); opacity: 0; }
        100% { transform: translateY(0) scale(1); opacity: 1; }
      }
      .mascot-pop { animation: mascot-pop-in 0.6s cubic-bezier(0.34,1.56,0.64,1) both, mascot-bounce-idle 2.4s ease-in-out 0.6s infinite; transform-origin: 50% 100%; }
      .mascot-wave { animation: mascot-wave-arm 1s ease-in-out 0.6s infinite; transform-origin: 45px 120px; }
      .confetti-piece { animation: confetti-pop-fall linear forwards; }
      .celebration-overlay { animation: celebration-fade-in 0.25s ease-out both; }
      .celebration-card { animation: celebration-card-in 0.35s cubic-bezier(0.34,1.56,0.64,1) 0.05s both; }
      @media (prefers-reduced-motion: reduce) {
        .mascot-pop, .mascot-wave, .confetti-piece, .celebration-overlay, .celebration-card { animation: none !important; }
      }
    `}</style>
  );
}

function GoalCelebrationModal({
  show,
  onClose,
  todayPages,
  dailyGoal,
  dark,
}: {
  show: boolean;
  onClose: () => void;
  todayPages: number;
  dailyGoal: number;
  dark: boolean;
}) {
  const confetti = useMemo<
    { id: number; left: number; delay: number; duration: number; rotate: number; color: string; shape: "circle" | "square" }[]
  >(() => {
    if (!show) return [];
    const colors = ["#f59e0b", "#22c55e", "#ec4899", "#3b82f6", "#eab308"];
    return Array.from({ length: 20 }).map((_, i) => ({
      id: i,
      left: 4 + ((i * 17) % 88),
      delay: (i % 5) * 0.1,
      duration: 1.6 + (i % 4) * 0.2,
      rotate: 180 + ((i * 23) % 180),
      color: colors[i % colors.length],
      shape: i % 2 === 0 ? "circle" : "square",
    }));
  }, [show]);

  if (!show) return null;

  return (
    <div
      className="celebration-overlay fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Target harian tercapai"
    >
      <MascotCelebrationStyles />
      <div
        className={`celebration-card relative w-full max-w-sm rounded-3xl p-5 sm:p-6 text-center overflow-hidden shadow-2xl border max-h-[90vh] overflow-y-auto ${
          dark ? "bg-slate-800 border-emerald-700" : "bg-white border-emerald-100"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* confetti */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {confetti.map((c) => (
            <span
              key={c.id}
              className={`confetti-piece absolute top-0 ${c.shape === "circle" ? "rounded-full" : "rounded-sm"}`}
              style={
                {
                  left: `${c.left}%`,
                  width: "8px",
                  height: "8px",
                  backgroundColor: c.color,
                  animationDelay: `${c.delay}s`,
                  animationDuration: `${c.duration}s`,
                  ["--c-rot" as string]: `${c.rotate}deg`,
                } as CSSProperties
              }
            />
          ))}
        </div>

        <div className="relative">
          <LiterakarMascot />

          <h3 className={`text-lg sm:text-xl font-extrabold mt-2 tracking-tight ${dark ? "text-emerald-100" : "text-emerald-900"}`}>
            Horeee, Target Tercapai! 🎉
          </h3>
          <p className={`text-sm mt-2 ${dark ? "text-emerald-300/80" : "text-emerald-700/80"}`}>
            Kamu sudah membaca <strong>{todayPages} dari {dailyGoal}</strong> halaman hari ini. Literakar bangga sama kamu, terus semangat membaca ya!
          </p>

          <button
            type="button"
            onClick={onClose}
            className="mt-5 px-6 py-2.5 bg-emerald-600 text-white text-sm font-bold rounded-xl shadow-sm shadow-emerald-900/20 hover:bg-emerald-700 active:scale-[0.98] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2"
          >
            Lanjut Membaca!
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

const EMPTY_FORM = {
  bookTitle: "",
  author: "",
  genre: "",
  startPage: "",
  endPage: "",
  summary: "",
  finished: false,
};

export default function StudentDashboard() {
  const { user, userProfile, logout, loading } = useAuth();
  const router = useRouter();

  const [journals, setJournals] = useState<Journal[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>("beranda");

  const [form, setForm] = useState(EMPTY_FORM);
  const [selectedCharacters, setSelectedCharacters] = useState<Set<string>>(new Set());
  const [customCharacter, setCustomCharacter] = useState("");
  const [formError, setFormError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [badgeFilter, setBadgeFilter] = useState<BadgeFilter>("semua");
  const [newBadgeTitles, setNewBadgeTitles] = useState<Set<string>>(new Set());
  const [editingJournalId, setEditingJournalId] = useState<string | null>(null);

  // Fitur #1: hapus jurnal milik sendiri (selama belum divalidasi guru)
  const [deleteLoadingId, setDeleteLoadingId] = useState<string | null>(null);

  // Fitur #2: pencarian & filter status di Riwayat Jurnal
  const [riwayatSearch, setRiwayatSearch] = useState("");
  const [riwayatStatus, setRiwayatStatus] = useState<RiwayatStatusFilter>("semua");

  // Fitur: Add Progress ke jurnal yang sudah ada (multi-hari)
  const [addProgressTo, setAddProgressTo] = useState<string | null>(null);
  const [addProgressForm, setAddProgressForm] = useState({ startPage: "", endPage: "", summary: "" });
  const [addProgressError, setAddProgressError] = useState("");
  const [addProgressSaving, setAddProgressSaving] = useState(false);

  // Fitur #9: target membaca harian personal (disimpan per-siswa di perangkat ini)
  const [dailyGoal, setDailyGoal] = useState<number>(50);
  const [goalDraft, setGoalDraft] = useState<string>("50");
  const [targetLocked, setTargetLocked] = useState<boolean>(true);

  // Fitur: modal perayaan maskot Literakar saat target harian tercapai (sekali per hari)
  const [showGoalCelebration, setShowGoalCelebration] = useState(false);

  // Fitur: Leaderboard pembaca terajin (lintas semua siswa), dengan sub-tab
  // "Semua Kelas" (global) dan "Per Kelas". `leaderboard` menyimpan SELURUH
  // entri (bukan hanya top 10) supaya leaderboard per kelas bisa dihitung
  // dari data yang sama tanpa fetch ulang.
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState("");
  const leaderboardLoaded = useRef(false);
  const [leaderboardSubTab, setLeaderboardSubTab] = useState<LeaderboardSubTab>("semua");
  const [selectedClassCode, setSelectedClassCode] = useState<string>("");

  // Fitur #10: mode gelap
  const [darkMode, setDarkMode] = useState(false);

  const fetchMyJournals = useCallback(async () => {
    if (!user) return;
    const q = query(collection(db, "journals"), where("studentId", "==", user.uid));
    const querySnapshot = await getDocs(q);
    const docs: Journal[] = [];
    querySnapshot.forEach((d) => docs.push({ id: d.id, ...d.data() } as Journal));
    docs.sort((a, b) => (toDateSafe(b.createdAt)?.getTime() || 0) - (toDateSafe(a.createdAt)?.getTime() || 0));
    setJournals(docs);
  }, [user]);

  /**
   * Ambil & agregasi statistik SEMUA siswa (bukan hanya yang login) untuk leaderboard,
   * baik global maupun per kelas. Catatan: butuh Firestore rules yang mengizinkan
   * `read` koleksi "journals" untuk seluruh user yang login (siswa & guru), bukan
   * hanya pemilik dokumen.
   */
  const fetchLeaderboard = useCallback(async () => {
    setLeaderboardLoading(true);
    setLeaderboardError("");
    try {
      const querySnapshot = await getDocs(collection(db, "journals"));
      const statsMap = new Map<
        string,
        { studentName: string; classCode: string; journalCount: number; finishedTitles: Set<string> }
      >();

      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data() as Journal;
        if (!data.studentId) return;
        const existing = statsMap.get(data.studentId) || {
          studentName: data.studentName || "Siswa",
          classCode: data.classCode || "-",
          journalCount: 0,
          finishedTitles: new Set<string>(),
        };
        existing.journalCount += 1;
        if (data.finished && data.bookTitle) {
          existing.finishedTitles.add(data.bookTitle.trim().toLowerCase());
        }
        statsMap.set(data.studentId, existing);
      });

      const entries: LeaderboardEntry[] = Array.from(statsMap.entries()).map(([studentId, s]) => ({
        studentId,
        studentName: s.studentName,
        classCode: s.classCode,
        journalCount: s.journalCount,
        booksFinished: s.finishedTitles.size,
      }));

      // Simpan SEMUA entri (bukan dipotong ke 10) supaya leaderboard per kelas
      // punya data lengkap. Top 10 global dihitung dari sini via useMemo.
      setLeaderboard(sortLeaderboardEntries(entries));
    } catch {
      setLeaderboardError("Gagal memuat leaderboard. Silakan coba lagi.");
    } finally {
      setLeaderboardLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!loading && (!user || userProfile?.role !== "student")) {
      router.push("/login");
      return;
    }

    if (!user) return;

    const run = async () => {
      await fetchMyJournals();
    };

    queueMicrotask(run);
  }, [user, userProfile, loading, router, fetchMyJournals]);

  // Muat leaderboard sekali saat dashboard siap (bukan hanya saat tab Leaderboard
  // dibuka), karena kartu peringkat kelas di Beranda juga butuh data ini.
  useEffect(() => {
    if (!user) return;
    if (leaderboardLoaded.current) return;
    leaderboardLoaded.current = true;
    void fetchLeaderboard();
  }, [user, fetchLeaderboard]);

  // Muat preferensi tema, target harian, dan draf jurnal tersimpan dari perangkat ini.
  useEffect(() => {
    if (!user) return;

    const loadStoredPreferences = () => {
      try {
        const savedTheme = localStorage.getItem("literasi_dark_mode");
        if (savedTheme) setDarkMode(savedTheme === "1");

        const savedGoal = localStorage.getItem(`literasi_daily_goal_${user.uid}`);
        const savedLocked = localStorage.getItem(`literasi_daily_goal_locked_${user.uid}`);
        const goalFromStorage = savedGoal ? Number(savedGoal) : NaN;
        const normalizedGoal = Number.isFinite(goalFromStorage)
          ? Math.min(50, Math.max(1, goalFromStorage))
          : 50;
        const shouldLock = savedLocked === "1";

        setDailyGoal(normalizedGoal);
        setGoalDraft(String(normalizedGoal));
        setTargetLocked(shouldLock);

        if (!Number.isFinite(goalFromStorage) || goalFromStorage !== normalizedGoal) {
          localStorage.setItem(`literasi_daily_goal_${user.uid}`, String(normalizedGoal));
        }
        if (!shouldLock) {
          localStorage.setItem(`literasi_daily_goal_locked_${user.uid}`, "0");
        }

        const savedDraft = localStorage.getItem(`literasi_jurnal_draft_${user.uid}`);
        if (savedDraft) {
          const parsed = JSON.parse(savedDraft);
          if (parsed.form) setForm(parsed.form);
          if (Array.isArray(parsed.selectedCharacters)) setSelectedCharacters(new Set(parsed.selectedCharacters));
          if (typeof parsed.customCharacter === "string") setCustomCharacter(parsed.customCharacter);
        }
      } catch {
        // localStorage tidak tersedia (mis. SSR) — abaikan, form tetap kosong.
      }
    };

    queueMicrotask(loadStoredPreferences);
  }, [user]);

  // Fitur #8: autosave draf form jurnal ke localStorage setiap kali berubah,
  // supaya isian tidak hilang kalau koneksi terputus atau tab tertutup tanpa sengaja.
  useEffect(() => {
    if (!user || editingJournalId) return;
    const isEmpty =
      !form.bookTitle && !form.author && !form.genre && !form.startPage && !form.endPage &&
      !form.summary && selectedCharacters.size === 0 && !customCharacter;
    try {
      if (isEmpty) {
        localStorage.removeItem(`literasi_jurnal_draft_${user.uid}`);
      } else {
        localStorage.setItem(
          `literasi_jurnal_draft_${user.uid}`,
          JSON.stringify({ form, selectedCharacters: Array.from(selectedCharacters), customCharacter })
        );
      }
    } catch {
      // abaikan jika penyimpanan lokal gagal/tidak tersedia
    }
  }, [user, editingJournalId, form, selectedCharacters, customCharacter]);

  const toggleDarkMode = () => {
    setDarkMode((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("literasi_dark_mode", next ? "1" : "0");
      } catch {
        // abaikan
      }
      return next;
    });
  };

  const saveDailyGoal = () => {
    const value = Math.min(50, Math.max(1, Number(goalDraft) || 50));
    setDailyGoal(value);
    setGoalDraft(String(value));
    setTargetLocked(true);
    if (user) {
      try {
        localStorage.setItem(`literasi_daily_goal_${user.uid}`, String(value));
        localStorage.setItem(`literasi_daily_goal_locked_${user.uid}`, "1");
      } catch {
        // abaikan
      }
    }
  };

  const toggleCharacter = (value: string) => {
    setSelectedCharacters((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  const pagesReadPreview = useMemo(() => {
    const s = Number(form.startPage);
    const e = Number(form.endPage);
    if (Number.isNaN(s) || Number.isNaN(e) || e < s) return 0;
    return e - s;
  }, [form.startPage, form.endPage]);

  // Fitur #7: peringatan (non-blocking) kalau rentang halaman tumpang tindih
  // dengan jurnal lain untuk judul buku yang sama — mencegah halaman terhitung dua kali.
  const overlapWarning = useMemo(() => {
    const title = form.bookTitle.trim().toLowerCase();
    const s = Number(form.startPage);
    const e = Number(form.endPage);
    if (!title || Number.isNaN(s) || Number.isNaN(e) || e < s) return "";
    const overlap = journals.some((j) => {
      if (editingJournalId && j.id === editingJournalId) return false;
      if (j.bookTitle.trim().toLowerCase() !== title) return false;
      return s <= j.endPage && e >= j.startPage;
    });
    return overlap
      ? "Rentang halaman ini tumpang tindih dengan jurnal lain untuk buku yang sama. Periksa lagi supaya halaman tidak terhitung dua kali."
      : "";
  }, [form.bookTitle, form.startPage, form.endPage, journals, editingJournalId]);

  // Fitur #3: peringatan lembut kalau buku ini sudah pernah ditandai selesai sebelumnya.
  const duplicateFinishedWarning = useMemo(() => {
    if (!form.finished) return "";
    const title = form.bookTitle.trim().toLowerCase();
    if (!title) return "";
    const already = journals.some((j) => {
      if (editingJournalId && j.id === editingJournalId) return false;
      return Boolean(j.finished) && j.bookTitle.trim().toLowerCase() === title;
    });
    return already ? "Kamu sudah pernah menandai buku ini sebagai selesai dibaca sebelumnya." : "";
  }, [form.finished, form.bookTitle, journals, editingJournalId]);

  // ---- Statistik Beranda ----
  const totalPages = useMemo(() => {
    return journals.reduce((acc, j) => {
      const pages = Number(j.endPage) - Number(j.startPage);
      return acc + (Number.isNaN(pages) || pages < 0 ? 0 : pages);
    }, 0);
  }, [journals]);

  const approvedTotalPages = useMemo(() => {
    return journals.reduce((acc, journal) => {
      if (normalizeStatus(journal.status) !== "approved") return acc;
      const pages = Number(journal.endPage) - Number(journal.startPage);
      return acc + (Number.isNaN(pages) || pages < 0 ? 0 : pages);
    }, 0);
  }, [journals]);

  const totalBooksFinished = useMemo(() => {
    const finishedTitles = new Set<string>();
    journals.forEach((j) => {
      if (j.finished && j.bookTitle) finishedTitles.add(j.bookTitle.trim().toLowerCase());
    });
    return finishedTitles.size;
  }, [journals]);

  const readingStreak = useMemo(() => {
    const dates = new Set<string>();
    journals.forEach((j) => {
      const d = toDateSafe(j.createdAt);
      if (d) dates.add(d.toDateString());
    });
    if (dates.size === 0) return 0;

    let streak = 0;
    const cursor = new Date();
    cursor.setHours(0, 0, 0, 0);
    // Jika belum ada jurnal hari ini, cek dari kemarin supaya streak yang masih "hidup" tetap terhitung
    if (!dates.has(cursor.toDateString())) {
      cursor.setDate(cursor.getDate() - 1);
    }
    while (dates.has(cursor.toDateString())) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }, [journals]);

  // Statistik tambahan untuk badge/achievement (jumlah hari aktif minggu ini,
  // variasi genre & nilai karakter, halaman terbanyak dalam satu jurnal, jam kirim jurnal).
  const weeklyDaysCount = useMemo(() => {
    const now = new Date();
    const day = now.getDay();
    const diffToMonday = day === 0 ? 6 : day - 1;
    const monday = new Date(now);
    monday.setDate(now.getDate() - diffToMonday);
    monday.setHours(0, 0, 0, 0);
    const set = new Set<string>();
    journals.forEach((j) => {
      const d = toDateSafe(j.createdAt);
      if (d && d >= monday) set.add(d.toDateString());
    });
    return set.size;
  }, [journals]);

  const genreCount = useMemo(() => {
    const set = new Set<string>();
    journals.forEach((j) => {
      if (j.genre && j.genre.trim()) set.add(j.genre.trim().toLowerCase());
    });
    return set.size;
  }, [journals]);

  const characterVarietyCount = useMemo(() => {
    const set = new Set<string>();
    journals.forEach((j) => {
      (j.characterValues || []).forEach((v) => {
        if (v && v.trim()) set.add(v.trim().toLowerCase());
      });
    });
    return set.size;
  }, [journals]);

  const maxSinglePages = useMemo(() => {
    return journals.reduce((max, j) => {
      const pages = Number(j.endPage) - Number(j.startPage);
      return !Number.isNaN(pages) && pages > max ? pages : max;
    }, 0);
  }, [journals]);

  const earlyBirdEarned = useMemo(
    () =>
      journals.some((j) => {
        const d = toDateSafe(j.createdAt);
        return d ? d.getHours() < 7 : false;
      }),
    [journals]
  );

  const nightOwlEarned = useMemo(
    () =>
      journals.some((j) => {
        const d = toDateSafe(j.createdAt);
        return d ? d.getHours() >= 21 : false;
      }),
    [journals]
  );

  // Fitur #4: status "sudah isi jurnal hari ini atau belum", untuk reminder streak.
  const hasJournalToday = useMemo(() => {
    const todayStr = new Date().toDateString();
    return journals.some((j) => toDateSafe(j.createdAt)?.toDateString() === todayStr);
  }, [journals]);

  // Fitur #9: total halaman yang sudah divalidasi HARI INI, dibandingkan dengan target harian.
  // Hanya jurnal yang statusnya "approved" yang menghitung target membaca dan reward.
  const todayPages = useMemo(() => {
    const todayStr = new Date().toDateString();
    return journals.reduce((acc, j) => {
      if (normalizeStatus(j.status) !== "approved") return acc;
      const d = toDateSafe(j.createdAt);
      if (!d || d.toDateString() !== todayStr) return acc;
      const pages = Number(j.endPage) - Number(j.startPage);
      return acc + (Number.isNaN(pages) || pages < 0 ? 0 : pages);
    }, 0);
  }, [journals]);

  const yesterdayPages = useMemo(() => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = yesterday.toDateString();
    return journals.reduce((acc, j) => {
      if (normalizeStatus(j.status) !== "approved") return acc;
      const d = toDateSafe(j.createdAt);
      if (!d || d.toDateString() !== yesterdayKey) return acc;
      const pages = Number(j.endPage) - Number(j.startPage);
      return acc + (Number.isNaN(pages) || pages < 0 ? 0 : pages);
    }, 0);
  }, [journals]);

  const goalPct = dailyGoal > 0 ? Math.min(100, (todayPages / dailyGoal) * 100) : 0;
  const dailyGoalReached = todayPages >= dailyGoal;
  const yesterdayGoalMissed = yesterdayPages < dailyGoal;

  // Tampilkan modal perayaan Literakar saat target harian tercapai,
  // hanya sekali per hari per siswa (dilacak lewat localStorage).
  useEffect(() => {
    if (!user || !dailyGoalReached) return;
    const todayKey = new Date().toDateString();
    const storageKey = `literasi_goal_celebrated_${user.uid}`;
    try {
      const lastCelebrated = localStorage.getItem(storageKey);
      if (lastCelebrated !== todayKey) {
        window.setTimeout(() => {
          setShowGoalCelebration(true);
          localStorage.setItem(storageKey, todayKey);
        }, 0);
      }
    } catch {
      // abaikan jika localStorage tidak tersedia
    }
  }, [dailyGoalReached, user]);

  const monthlyStats = useMemo(() => {
    const startOfMonth = getStartOfMonth(new Date());
    const monthlyJournals = journals.filter((journal) => {
      const date = toDateSafe(journal.createdAt);
      return date ? date >= startOfMonth : false;
    });
    const monthlyPages = monthlyJournals.reduce((total, journal) => {
      const pages = Number(journal.endPage) - Number(journal.startPage);
      return total + (Number.isNaN(pages) || pages < 0 ? 0 : pages);
    }, 0);
    const monthlyFinishedBooks = new Set(
      monthlyJournals
        .filter((journal) => journal.finished && journal.bookTitle)
        .map((journal) => journal.bookTitle.trim().toLowerCase())
    );
    const monthlyDates = new Set<string>();
    monthlyJournals.forEach((journal) => {
      const date = toDateSafe(journal.createdAt);
      if (date) monthlyDates.add(date.toDateString());
    });

    let monthlyStreak = 0;
    const cursor = new Date();
    cursor.setHours(0, 0, 0, 0);
    while (cursor >= startOfMonth && monthlyDates.has(cursor.toDateString())) {
      monthlyStreak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }

    return {
      journals: monthlyJournals.length,
      pages: monthlyPages,
      finishedBooks: monthlyFinishedBooks.size,
      streak: monthlyStreak,
    };
  }, [journals]);

  // Daftar badge/achievement lengkap dengan progres, dihitung dari BADGE_DEFS + statistik siswa.
  const badges: BadgeComputed[] = useMemo(() => {
    const metrics: Record<BadgeMetricKey, number> = {
      booksFinished: totalBooksFinished,
      streak: readingStreak,
      weeklyDays: weeklyDaysCount,
      totalPages,
      maxSinglePages,
      journalCount: journals.length,
      genreCount,
      characterVarietyCount,
      earlyBird: earlyBirdEarned ? 1 : 0,
      nightOwl: nightOwlEarned ? 1 : 0,
    };
    return BADGE_DEFS.map((def) => {
      const raw = metrics[def.metric] ?? 0;
      const current = Math.min(raw, def.target);
      const earned = raw >= def.target;
      const percent = def.target > 0 ? Math.min(100, (raw / def.target) * 100) : 0;
      return { ...def, current, earned, percent };
    });
  }, [
    totalBooksFinished,
    readingStreak,
    weeklyDaysCount,
    totalPages,
    maxSinglePages,
    journals.length,
    genreCount,
    characterVarietyCount,
    earlyBirdEarned,
    nightOwlEarned,
  ]);

  const visibleBadges = badges.filter((badge) => {
    if (badgeFilter === "terkunci") return !badge.earned;
    if (badgeFilter === "didapat") return badge.earned;
    return true;
  });

  const earnedCount = useMemo(() => badges.filter((b) => b.earned).length, [badges]);
  const totalCount = badges.length;

  const nearestBadge = useMemo(() => {
    const locked = badges.filter((b) => !b.earned);
    if (locked.length === 0) return null;
    return locked.reduce((best, b) => (b.percent > best.percent ? b : best), locked[0]);
  }, [badges]);

  // Tandai badge yang baru saja didapat sejak kunjungan terakhir, supaya terasa seperti pencapaian nyata.
  useEffect(() => {
    if (!user || journals.length === 0) return;
    try {
      const key = `literasi_badges_seen_${user.uid}`;
      const stored = localStorage.getItem(key);
      const earnedTitles = badges.filter((b) => b.earned).map((b) => b.title);

      if (stored === null) {
        // Kunjungan pertama: simpan tanpa menandai apa pun sebagai "baru".
        localStorage.setItem(key, JSON.stringify(earnedTitles));
        return;
      }

      const storedSet = new Set<string>(JSON.parse(stored));
      const newlyEarned = earnedTitles.filter((t) => !storedSet.has(t));
      if (newlyEarned.length > 0) {
        window.setTimeout(() => setNewBadgeTitles(new Set(newlyEarned)), 0);
      }
      localStorage.setItem(key, JSON.stringify(earnedTitles));
    } catch {
      // abaikan jika localStorage tidak tersedia
    }
  }, [badges, user, journals.length]);

  // Fitur #2: daftar riwayat setelah pencarian judul/penulis & filter status.
  const filteredRiwayat = useMemo(() => {
    const q = riwayatSearch.trim().toLowerCase();
    return journals.filter((j) => {
      const matchSearch = !q || j.bookTitle.toLowerCase().includes(q) || j.author.toLowerCase().includes(q);
      const matchStatus = riwayatStatus === "semua" || normalizeStatus(j.status) === riwayatStatus;
      return matchSearch && matchStatus;
    });
  }, [journals, riwayatSearch, riwayatStatus]);

  // Fitur #6: jumlah jurnal berstatus "Perlu Revisi", ditampilkan sebagai badge pada tab.
  const revisionCount = useMemo(
    () => journals.filter((j) => normalizeStatus(j.status) === "revision").length,
    [journals]
  );

  // ---- Leaderboard: turunan data untuk sub-tab "Semua Kelas" & "Per Kelas" ----

  // Leaderboard global (top 10 lintas semua kelas). `leaderboard` sudah terurut
  // dari fetchLeaderboard, jadi cukup ambil 10 teratas.
  const globalLeaderboard = useMemo(() => leaderboard.slice(0, 10), [leaderboard]);

  // Daftar kode kelas unik yang punya data di leaderboard, untuk dropdown pemilih kelas.
  const classCodesAvailable = useMemo(() => {
    const set = new Set(leaderboard.map((e) => e.classCode).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [leaderboard]);

  // Default kelas diturunkan tanpa setState di dalam effect.
  const effectiveSelectedClassCode = selectedClassCode
    || (userProfile?.classCode && classCodesAvailable.includes(userProfile.classCode)
      ? userProfile.classCode
      : classCodesAvailable[0] || "");

  // Leaderboard untuk kelas yang sedang dipilih di dropdown (semua siswa di kelas itu, bukan dipotong 10).
  const classLeaderboard = useMemo(() => {
    if (!effectiveSelectedClassCode) return [];
    return sortLeaderboardEntries(leaderboard.filter((e) => e.classCode === effectiveSelectedClassCode));
  }, [leaderboard, effectiveSelectedClassCode]);

  // Peringkat siswa yang sedang login DI KELASNYA SENDIRI — dipakai untuk kartu
  // indikator "kamu peringkat ke-berapa di kelas" pada tab Beranda.
  const myClassRank = useMemo(() => {
    if (!user || !userProfile?.classCode) return null;
    const classEntries = sortLeaderboardEntries(leaderboard.filter((e) => e.classCode === userProfile.classCode));
    const idx = classEntries.findIndex((e) => e.studentId === user.uid);
    if (idx === -1) return null;
    return { rank: idx + 1, total: classEntries.length };
  }, [leaderboard, user, userProfile]);

  const displayName = userProfile?.name || "Siswa";
  const genderLabel = formatGender(userProfile?.gender);

  const getStatusBadge = (status: string) => {
    if (status === "approved") {
      return { label: "Tervalidasi", className: "bg-emerald-100 text-emerald-700" };
    }
    if (status === "revision") {
      return { label: "Perlu Revisi", className: "bg-orange-100 text-orange-700" };
    }
    return { label: "Menunggu Validasi", className: "bg-yellow-100 text-yellow-700" };
  };

  const startEditJournal = (journal: Journal) => {
    setEditingJournalId(journal.id);
    setForm({
      bookTitle: journal.bookTitle ?? "",
      author: journal.author ?? "",
      genre: journal.genre ?? "",
      startPage: String(journal.startPage ?? ""),
      endPage: String(journal.endPage ?? ""),
      summary: journal.summary ?? "",
      finished: Boolean(journal.finished),
    });
    setSelectedCharacters(new Set(journal.characterValues ?? []));
    setCustomCharacter("");
    setFormError("");
    setSuccessMessage("");
    setActiveTab("jurnal");
  };

  // Fitur #1: hapus jurnal milik sendiri. Hanya diizinkan selama jurnal belum
  // divalidasi guru ("approved") — jurnal yang sudah tervalidasi tidak bisa dihapus siswa.
  const handleDeleteJournal = async (journal: Journal) => {
    if (normalizeStatus(journal.status) === "approved") return;
    if (deleteLoadingId) return;
    if (!window.confirm(`Hapus jurnal "${journal.bookTitle}"? Tindakan ini tidak bisa dibatalkan.`)) return;

    setDeleteLoadingId(journal.id);
    try {
      await deleteDoc(doc(db, "journals", journal.id));
      setJournals((prev) => prev.filter((j) => j.id !== journal.id));
      if (editingJournalId === journal.id) {
        setEditingJournalId(null);
        setForm(EMPTY_FORM);
        setSelectedCharacters(new Set());
        setCustomCharacter("");
      }
    } catch {
      setFormError("Gagal menghapus jurnal. Silakan coba lagi.");
    } finally {
      setDeleteLoadingId(null);
    }
  };

  const handleSaveJournal = async () => {
    setFormError("");
    setSuccessMessage("");

    const startPage = Number(form.startPage);
    const endPage = Number(form.endPage);

    if (!form.bookTitle.trim() || !form.author.trim()) {
      setFormError("Judul buku dan penulis wajib diisi.");
      return;
    }
    if (form.startPage === "" || form.endPage === "") {
      setFormError("Halaman awal dan halaman akhir wajib diisi.");
      return;
    }
    if (Number.isNaN(startPage) || Number.isNaN(endPage) || startPage < 1 || endPage < startPage) {
      setFormError("Halaman akhir harus lebih besar atau sama dengan halaman awal.");
      return;
    }
    if (!form.summary.trim()) {
      setFormError("Ringkasan bacaan wajib diisi.");
      return;
    }
    if (!user || !userProfile?.classCode) {
      setFormError("Sesi login tidak valid. Silakan login ulang.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        studentId: user.uid,
        studentName: displayName,
        classCode: userProfile.classCode,
        bookTitle: form.bookTitle.trim(),
        author: form.author.trim(),
        genre: form.genre.trim(),
        startPage,
        endPage,
        summary: form.summary.trim(),
        characterValues: [
          ...Array.from(selectedCharacters),
          ...(customCharacter.trim() ? [customCharacter.trim()] : []),
        ],
        finished: form.finished,
        status: editingJournalId ? "pending" : "pending",
        teacherFeedback: "",
        updatedAt: serverTimestamp(),
      };

      if (editingJournalId) {
        await updateDoc(doc(db, "journals", editingJournalId), payload);
        setSuccessMessage("Jurnal berhasil diperbarui dan dikirim ulang. Menunggu validasi dari guru.");
      } else {
        await addDoc(collection(db, "journals"), {
          ...payload,
          progressLog: [],
          createdAt: serverTimestamp(),
        });
        setSuccessMessage("Jurnal berhasil disimpan! Menunggu validasi dari guru.");
      }

      setForm(EMPTY_FORM);
      setSelectedCharacters(new Set());
      setCustomCharacter("");
      setEditingJournalId(null);
      if (user) {
        try {
          localStorage.removeItem(`literasi_jurnal_draft_${user.uid}`);
        } catch {
          // abaikan
        }
      }
      void fetchMyJournals();
      // Segarkan juga leaderboard supaya peringkat kelas di Beranda ikut ter-update.
      void fetchLeaderboard();
    } catch {
      setFormError(editingJournalId ? "Gagal memperbarui jurnal. Silakan coba lagi." : "Gagal menyimpan jurnal. Silakan coba lagi.");
    } finally {
      setSaving(false);
    }
  };

  /**
   * Tambahkan progress membaca ke jurnal yang sudah ada (untuk buku yang belum selesai).
   * Ini memungkinkan siswa melanjutkan membaca di hari berikutnya tanpa membuat jurnal baru.
   */
  const handleAddProgress = async () => {
    setAddProgressError("");

    if (!addProgressTo) return;

    const journal = journals.find((j) => j.id === addProgressTo);
    if (!journal) return;

    const startPage = Number(addProgressForm.startPage);
    const endPage = Number(addProgressForm.endPage);

    if (addProgressForm.startPage === "" || addProgressForm.endPage === "") {
      setAddProgressError("Halaman awal dan halaman akhir wajib diisi.");
      return;
    }
    if (Number.isNaN(startPage) || Number.isNaN(endPage) || startPage < 1 || endPage < startPage) {
      setAddProgressError("Halaman akhir harus lebih besar atau sama dengan halaman awal.");
      return;
    }
    if (!addProgressForm.summary.trim()) {
      setAddProgressError("Ringkasan untuk progress ini wajib diisi.");
      return;
    }

    setAddProgressSaving(true);
    try {
      // Buat entry progress baru dengan timestamp sekarang
      const newProgressEntry: ProgressEntry = {
        id: Date.now().toString(),
        startPage,
        endPage,
        summary: addProgressForm.summary.trim(),
        timestamp: new Date(),
      };

      // Update journal dengan progress log yang ditambah.
      // Untuk jurnal yang sudah approved tapi belum selesai, kita simpan sebagai log lanjutan
      // tanpa langsung mengubah hitungan utama sampai guru memvalidasi ulang / menutup buku.
      const updatedProgressLog = [...(journal.progressLog || []), newProgressEntry];
      const isApprovedUnfinished = !journal.finished && normalizeStatus(journal.status) === "approved";

      const updatedPayload = {
        progressLog: updatedProgressLog,
        updatedAt: serverTimestamp(),
        ...(isApprovedUnfinished
          ? {}
          : {
              startPage: journal.startPage,
              endPage: Math.max(journal.endPage, endPage),
              summary: addProgressForm.summary.trim(),
              status: "pending",
              teacherFeedback: "",
            }),
      };

      await updateDoc(doc(db, "journals", addProgressTo), updatedPayload);

      setAddProgressForm({ startPage: "", endPage: "", summary: "" });
      setAddProgressTo(null);
      void fetchMyJournals();
      // Segarkan juga leaderboard supaya peringkat kelas di Beranda ikut ter-update.
      void fetchLeaderboard();
    } catch {
      setAddProgressError("Gagal menambah progress. Silakan coba lagi.");
    } finally {
      setAddProgressSaving(false);
    }
  };

  // ---- Tema (Fitur #10: mode gelap) ----
  const theme = darkMode
    ? {
        pageBg: "bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950",
        blobA: "bg-emerald-900/30",
        blobB: "bg-teal-900/30",
        panel: "bg-slate-800/80 border-slate-700 shadow-black/20",
        panelSoft: "bg-slate-700/50",
        headingText: "text-emerald-100",
        bodyText: "text-emerald-300/70",
        mutedText: "text-emerald-300/50",
        input: "bg-slate-700/50 border-slate-600 text-emerald-50 placeholder:text-emerald-400/40 focus:ring-emerald-500 focus:border-emerald-500",
        navActive: "bg-emerald-600 text-white shadow-sm",
        navInactive: "text-emerald-300/70 hover:bg-slate-700",
      }
    : {
        pageBg: "bg-gradient-to-br from-emerald-50 via-green-50 to-teal-100",
        blobA: "bg-emerald-200/40",
        blobB: "bg-teal-200/40",
        panel: "bg-white/80 border-white shadow-emerald-900/5",
        panelSoft: "bg-emerald-50/70",
        headingText: "text-emerald-900",
        bodyText: "text-emerald-700/70",
        mutedText: "text-emerald-700/50",
        input: "bg-emerald-50/50 border-emerald-200 text-emerald-900 placeholder:text-emerald-700/40 focus:ring-emerald-400 focus:border-emerald-400",
        navActive: "bg-emerald-600 text-white shadow-sm",
        navInactive: "text-emerald-800/70 hover:bg-emerald-50",
      };

  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${theme.pageBg}`}>
        <p className={darkMode ? "text-emerald-300 text-sm font-medium" : "text-emerald-700 text-sm font-medium"}>Memuat...</p>
      </div>
    );
  }

  const tabs: { key: TabKey; label: string; icon: React.ReactNode; badgeCount?: number }[] = [
    { key: "beranda", label: "Beranda", icon: <Home className="w-4 h-4" /> },
    { key: "badge", label: "Badge Saya", icon: <Award className="w-4 h-4" /> },
    { key: "pohon", label: "Pohon Literasi", icon: <TreeDeciduous className="w-4 h-4" /> },
    { key: "leaderboard", label: "Leaderboard", icon: <Trophy className="w-4 h-4" /> },
    { key: "jurnal", label: "Isi Jurnal Membaca", icon: <NotebookPen className="w-4 h-4" /> },
    { key: "riwayat", label: "Riwayat Jurnal", icon: <History className="w-4 h-4" />, badgeCount: revisionCount },
  ];

  return (
    <div className={`min-h-screen p-3 sm:p-4 md:p-6 relative ${theme.pageBg}`}>
      {/* Modal perayaan Literakar saat target harian tercapai */}
      <GoalCelebrationModal
        show={showGoalCelebration}
        onClose={() => setShowGoalCelebration(false)}
        todayPages={todayPages}
        dailyGoal={dailyGoal}
        dark={darkMode}
      />

      {/* Soft decorative blobs — pure CSS, ringan di mobile */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className={`absolute -top-24 -left-24 w-72 h-72 rounded-full blur-3xl ${theme.blobA}`} />
        <div className={`absolute -bottom-24 -right-24 w-72 h-72 rounded-full blur-3xl ${theme.blobB}`} />
      </div>

      <div className="relative max-w-5xl mx-auto">
        <header className={`flex flex-wrap justify-between items-center gap-3 mb-4 sm:mb-6 p-3 sm:p-4 rounded-2xl shadow-md border backdrop-blur-sm ${theme.panel}`}>
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className={`hidden sm:flex w-11 h-11 rounded-2xl items-center justify-center shrink-0 ${darkMode ? "bg-emerald-900/60 text-emerald-300" : "bg-emerald-100 text-emerald-700"}`}>
              <BookOpen className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h1 className={`text-base sm:text-xl font-bold tracking-tight truncate ${theme.headingText}`}>Dashboard Siswa</h1>
              <p className={`text-xs sm:text-sm ${theme.bodyText}`}>
                Kelas: {userProfile?.classCode}
                {genderLabel && <span className="ml-2">· {genderLabel}</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Fitur #10: tombol mode gelap */}
            <button
              onClick={toggleDarkMode}
              aria-label={darkMode ? "Aktifkan mode terang" : "Aktifkan mode gelap"}
              className={`flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-xl border transition active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                darkMode
                  ? "bg-slate-700 border-slate-600 text-amber-300 hover:bg-slate-600"
                  : "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"
              }`}
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              onClick={logout}
              className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-xl text-sm font-semibold hover:bg-red-100 active:scale-[0.98] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Keluar</span>
            </button>
          </div>
        </header>

        <nav className={`mb-4 sm:mb-6 w-full overflow-x-auto rounded-2xl p-1.5 shadow-md border backdrop-blur-sm ${theme.panel}`}>
          <div className="flex min-w-max gap-1">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`shrink-0 whitespace-nowrap px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-150 flex items-center gap-1.5 sm:gap-2 ${
                  activeTab === t.key ? theme.navActive : theme.navInactive
                }`}
              >
                {t.icon}
                {t.label}
                {!!t.badgeCount && (
                  <span
                    className={`inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full text-[11px] font-bold ${
                      activeTab === t.key ? "bg-white/25 text-white" : "bg-orange-500 text-white"
                    }`}
                  >
                    {t.badgeCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        </nav>

        {/* ---- Tab: Beranda ---- */}
        {activeTab === "beranda" && (
          <div className="space-y-4 sm:space-y-6">
            <div className={`p-4 sm:p-6 rounded-3xl shadow-md border backdrop-blur-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 ${theme.panel}`}>
              <div>
                <h2 className={`text-lg sm:text-xl font-bold tracking-tight ${theme.headingText}`}>Halo, {displayName} 👋</h2>
                <p className={`text-sm mt-1 ${theme.bodyText}`}>Semangat membaca hari ini!</p>
              </div>
              <TreeProgressIcon totalPages={approvedTotalPages} dark={darkMode} />
            </div>

            {/* Indikator: peringkat siswa di kelasnya sendiri, berdasarkan leaderboard */}
            {myClassRank && (
              <div className={`p-3.5 sm:p-4 rounded-2xl shadow-md border backdrop-blur-sm flex items-center gap-3 ${theme.panel}`}>
                <div
                  className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center shrink-0 ${
                    myClassRank.rank <= 3
                      ? "bg-gradient-to-br from-yellow-300 via-amber-400 to-orange-500 text-white shadow-inner shadow-black/10"
                      : darkMode
                      ? "bg-slate-700 text-emerald-200"
                      : "bg-emerald-100 text-emerald-700"
                  }`}
                >
                  <Crown className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs sm:text-sm font-semibold ${theme.headingText}`}>
                    Peringkat kamu di kelas: <span className="text-amber-500">#{myClassRank.rank}</span> dari {myClassRank.total} siswa
                  </p>
                  <p className={`text-[11px] sm:text-xs mt-0.5 ${theme.mutedText}`}>
                    Berdasarkan jumlah jurnal terbanyak di Kelas {userProfile?.classCode}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("leaderboard");
                    setLeaderboardSubTab("kelas");
                  }}
                  className="shrink-0 flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 active:scale-[0.98] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                >
                  <span className="hidden xs:inline">Lihat</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Fitur #4: reminder streak — muncul kalau siswa belum isi jurnal hari ini dan belum mencapai target hari ini */}
            {!dailyGoalReached && !hasJournalToday && (
              <div
                className={`p-3.5 sm:p-4 rounded-2xl border flex flex-wrap sm:flex-nowrap items-center gap-3 ${
                  readingStreak > 0
                    ? darkMode
                      ? "bg-orange-900/30 border-orange-800 text-orange-200"
                      : "bg-orange-50 border-orange-200 text-orange-800"
                    : darkMode
                    ? "bg-emerald-900/30 border-emerald-800 text-emerald-200"
                    : "bg-emerald-50 border-emerald-200 text-emerald-800"
                }`}
              >
                {readingStreak > 0 ? <Flame className="w-5 h-5 shrink-0" /> : <Sparkles className="w-5 h-5 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="text-xs sm:text-sm font-semibold">
                    {readingStreak > 0
                      ? `Streak ${readingStreak} harimu akan terputus kalau belum isi jurnal hari ini!`
                      : "Yuk mulai streak membaca hari ini!"}
                  </p>
                </div>
                <button
                  onClick={() => setActiveTab("jurnal")}
                  className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold transition active:scale-[0.98] focus:outline-none focus-visible:ring-2 w-full sm:w-auto ${
                    readingStreak > 0 ? "bg-orange-500 text-white hover:bg-orange-600 focus-visible:ring-orange-400" : "bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-400"
                  }`}
                >
                  Isi Jurnal
                </button>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
              <StatCard label="Buku Selesai Bulan Ini" value={monthlyStats.finishedBooks} icon={<Library className="w-4 h-4" />} color="blue" dark={darkMode} />
              <StatCard label="Halaman Bulan Ini" value={monthlyStats.pages} icon={<BookOpen className="w-4 h-4" />} color="emerald" dark={darkMode} />
              <StatCard label="Streak Bulan Ini" value={`${monthlyStats.streak} hari`} icon={<Flame className="w-4 h-4" />} color="orange" dark={darkMode} />
              <StatCard label="Jurnal Bulan Ini" value={monthlyStats.journals} icon={<CalendarCheck className="w-4 h-4" />} color="yellow" dark={darkMode} />
            </div>

            {/* Fitur #9: target membaca harian personal */}
            <div className={`p-4 sm:p-6 rounded-3xl shadow-md border backdrop-blur-sm ${theme.panel}`}>
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <Target className={`w-4 h-4 ${darkMode ? "text-emerald-300" : "text-emerald-700"}`} />
                  <h3 className={`text-sm font-semibold ${theme.headingText}`}>Target Membaca Harian</h3>
                </div>
                <span
                  className={`text-[10px] px-2 py-1 rounded-full font-semibold shrink-0 ${
                    targetLocked
                      ? darkMode
                        ? "bg-emerald-900/50 text-emerald-200 border border-emerald-700"
                        : "bg-emerald-100 text-emerald-700 border border-emerald-200"
                      : darkMode
                        ? "bg-slate-700 text-emerald-200 border border-slate-600"
                        : "bg-slate-100 text-slate-600 border border-slate-200"
                  }`}
                >
                  {targetLocked ? "Target aktif" : "Belum disimpan"}
                </span>
              </div>

              <div className={`mb-3 rounded-xl border px-3 py-2 text-xs ${darkMode ? "border-emerald-800 bg-emerald-900/20 text-emerald-200" : "border-emerald-200 bg-emerald-50/80 text-emerald-800"}`}>
                Target harian kamu adalah <strong>{dailyGoal} halaman per hari</strong>. Kamu bisa menjaga konsistensi membaca setiap hari untuk naik level.
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={goalDraft}
                    onChange={(e) => setGoalDraft(e.target.value)}
                    disabled={targetLocked}
                    className={`w-20 sm:w-24 p-2 text-sm border rounded-xl outline-none focus:ring-2 transition ${theme.input} ${targetLocked ? "opacity-60 cursor-not-allowed" : ""}`}
                  />
                  <span className={`text-xs ${theme.bodyText}`}>halaman / hari</span>
                  <button
                    onClick={saveDailyGoal}
                    disabled={targetLocked}
                    className="px-3 py-2 bg-emerald-600 text-white text-xs font-semibold rounded-xl hover:bg-emerald-700 active:scale-[0.98] transition disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:hover:bg-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                  >
                    Simpan Target
                  </button>
                </div>
              </div>

              {!dailyGoalReached && yesterdayGoalMissed && (
                <div className="mt-3 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-800">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>
                      Target kemarin belum selesai: <strong>{yesterdayPages} / {dailyGoal}</strong> halaman. Ayo baca lagi hari ini agar streak tetap kuat!
                    </span>
                  </div>
                </div>
              )}

              <div className="mt-3">
                <div className="flex justify-between text-xs mb-1">
                  <span className={theme.bodyText}>{todayPages} / {dailyGoal} halaman hari ini</span>
                  <span className={theme.bodyText}>{Math.round(goalPct)}%</span>
                </div>
                <div className={`h-2.5 rounded-full overflow-hidden ${darkMode ? "bg-slate-700" : "bg-emerald-900/10"}`}>
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${dailyGoalReached ? "bg-gradient-to-r from-amber-400 to-yellow-500" : "bg-gradient-to-r from-lime-400 to-emerald-600"}`}
                    style={{ width: `${goalPct}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Fitur #5: grafik progres membaca pribadi */}
            <MyProgressChart journals={journals} dark={darkMode} />

            <div className={`p-4 sm:p-6 rounded-3xl shadow-md border backdrop-blur-sm ${theme.panel}`}>
              <h3 className={`text-sm font-semibold mb-3 ${darkMode ? "text-emerald-300/80" : "text-emerald-800/70"}`}>Jurnal Terbaru</h3>
              {journals.length === 0 ? (
                <p className={`text-sm ${theme.bodyText}`}>
                  Kamu belum punya jurnal. Yuk mulai isi jurnal pertamamu di tab &quot;Isi Jurnal Membaca&quot;!
                </p>
              ) : (
                <div className="space-y-2">
                  {journals.slice(0, 3).map((j) => (
                    <div key={j.id} className={`flex justify-between items-center gap-2 p-3 rounded-xl transition-colors ${theme.panelSoft}`}>
                      <span className={`text-sm font-semibold truncate ${theme.headingText}`}>{j.bookTitle}</span>
                      <span className={`text-xs shrink-0 ${theme.mutedText}`}>{formatTanggal(toDateSafe(j.createdAt))}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ---- Tab: Badge Saya ---- */}
        {activeTab === "badge" && (
          <div className={`p-4 sm:p-6 rounded-3xl shadow-md border backdrop-blur-sm space-y-5 ${theme.panel}`}>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className={`text-lg font-bold tracking-tight ${theme.headingText}`}>Badge Saya</h2>
                <p className={`text-xs mt-1 ${theme.mutedText}`}>
                  Kumpulkan pencapaian dari kebiasaan membaca dan jurnalmu.
                </p>
              </div>
              <div
                className={`shrink-0 px-4 py-2 rounded-2xl border text-center self-start sm:self-auto ${
                  darkMode ? "bg-slate-700/50 border-slate-600" : "bg-emerald-50 border-emerald-200"
                }`}
              >
                <p className={`text-lg font-bold ${theme.headingText}`}>
                  {earnedCount}/{totalCount}
                </p>
                <p className={`text-[10px] ${theme.mutedText}`}>Badge didapat</p>
              </div>
            </div>

            <div className={`h-2.5 rounded-full overflow-hidden ${darkMode ? "bg-slate-700" : "bg-emerald-900/10"}`}>
              <div
                className="h-full rounded-full bg-gradient-to-r from-lime-400 to-emerald-600 transition-all duration-700"
                style={{ width: `${totalCount > 0 ? (earnedCount / totalCount) * 100 : 0}%` }}
              />
            </div>

            {/* Badge terdekat — memotivasi siswa dengan menunjukkan pencapaian yang paling dekat */}
            {nearestBadge && (
              <div
                className={`p-3.5 sm:p-4 rounded-2xl border flex items-center gap-3 ${
                  darkMode ? "bg-orange-900/20 border-orange-800" : "bg-orange-50 border-orange-200"
                }`}
              >
                <Target className={`w-5 h-5 shrink-0 ${darkMode ? "text-orange-300" : "text-orange-600"}`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-xs sm:text-sm font-semibold ${darkMode ? "text-orange-200" : "text-orange-800"}`}>
                    Sedikit lagi! Badge &quot;{nearestBadge.title}&quot; ({nearestBadge.current}/{nearestBadge.target})
                  </p>
                  <div className={`h-1.5 rounded-full overflow-hidden mt-1.5 ${darkMode ? "bg-slate-700" : "bg-orange-900/10"}`}>
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-orange-400 to-amber-500 transition-all duration-700"
                      style={{ width: `${nearestBadge.percent}%` }}
                    />
                  </div>
                </div>
              </div>
            )}

            <div className={`flex gap-2 border-b pb-3 overflow-x-auto ${darkMode ? "border-slate-700" : "border-emerald-100"}`}>
              {([
                ["semua", "Semua"],
                ["terkunci", "Terkunci"],
                ["didapat", "Didapat"],
              ] as [BadgeFilter, string][]).map(([filter, label]) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setBadgeFilter(filter)}
                  className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                    badgeFilter === filter
                      ? "bg-emerald-600 text-white"
                      : darkMode
                      ? "bg-slate-700 text-emerald-200 hover:bg-slate-600"
                      : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {visibleBadges.length === 0 ? (
              <p className={`text-sm py-4 ${theme.mutedText}`}>
                Belum ada badge pada filter ini.
              </p>
            ) : (
              <div className="space-y-6">
                {CATEGORY_ORDER.map((category) => {
                  const list = visibleBadges.filter((b) => b.category === category);
                  if (list.length === 0) return null;
                  return (
                    <div key={category}>
                      <h4 className={`text-xs font-bold uppercase tracking-wide mb-2 ${theme.mutedText}`}>{category}</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {list.map((badge) => (
                          <BadgeCard
                            key={badge.title}
                            title={badge.title}
                            description={badge.description}
                            earned={badge.earned}
                            dark={darkMode}
                            tier={badge.tier}
                            icon={badge.icon}
                            current={badge.current}
                            target={badge.target}
                            isNew={newBadgeTitles.has(badge.title)}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ---- Tab: Pohon Literasi ---- */}
        {activeTab === "pohon" && <TreeGrowth totalPages={approvedTotalPages} dark={darkMode} />}

        {/* ---- Tab: Leaderboard ---- */}
        {activeTab === "leaderboard" && (
          <div className={`p-4 sm:p-6 rounded-3xl shadow-md border backdrop-blur-sm ${theme.panel}`}>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <div>
                <h2 className={`text-base sm:text-lg font-bold tracking-tight flex items-center gap-2 ${theme.headingText}`}>
                  <Trophy className="w-5 h-5 text-amber-500 shrink-0" />
                  Leaderboard Pembaca Terajin
                </h2>
                <p className={`text-xs mt-1 ${theme.mutedText}`}>
                  {leaderboardSubTab === "semua"
                    ? "Top 10 siswa dengan jurnal terbanyak, dari semua kelas."
                    : "Peringkat siswa dengan jurnal terbanyak di kelas yang dipilih."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void fetchLeaderboard()}
                disabled={leaderboardLoading}
                className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold transition disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 self-start sm:self-auto ${
                  darkMode ? "bg-slate-700 text-emerald-200 hover:bg-slate-600" : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                }`}
              >
                {leaderboardLoading ? "Memuat..." : "Muat Ulang"}
              </button>
            </div>

            {/* Sub-tab: Semua Kelas vs Per Kelas */}
            <div className={`flex gap-2 mb-4 p-1 rounded-xl w-full sm:w-fit ${darkMode ? "bg-slate-900/40" : "bg-emerald-900/5"}`}>
              {([
                ["semua", "Semua Kelas"],
                ["kelas", "Per Kelas"],
              ] as [LeaderboardSubTab, string][]).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setLeaderboardSubTab(key)}
                  className={`flex-1 sm:flex-none px-4 py-1.5 rounded-lg text-xs font-semibold transition ${
                    leaderboardSubTab === key
                      ? "bg-emerald-600 text-white shadow-sm"
                      : darkMode
                      ? "text-emerald-300/70 hover:bg-slate-700"
                      : "text-emerald-800/70 hover:bg-emerald-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Pemilih kelas — hanya muncul di sub-tab Per Kelas */}
            {leaderboardSubTab === "kelas" && (
              <div className="mb-4">
                {classCodesAvailable.length === 0 ? (
                  <p className={`text-sm ${theme.bodyText}`}>Belum ada data kelas untuk ditampilkan.</p>
                ) : (
                  <div className="flex flex-col xs:flex-row xs:items-center gap-2">
                    <label className={`text-xs font-semibold shrink-0 ${theme.bodyText}`}>Pilih Kelas:</label>
                    <select
                      value={effectiveSelectedClassCode}
                      onChange={(e) => setSelectedClassCode(e.target.value)}
                      className={`px-3 py-2 text-sm border rounded-xl outline-none focus:ring-2 transition w-full sm:w-48 ${theme.input}`}
                    >
                      {classCodesAvailable.map((code) => (
                        <option key={code} value={code}>
                          Kelas {code}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            {leaderboardError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-3">{leaderboardError}</p>
            )}

            {leaderboardLoading ? (
              <p className={`text-sm ${theme.bodyText}`}>Memuat leaderboard...</p>
            ) : leaderboardSubTab === "semua" ? (
              globalLeaderboard.length === 0 ? (
                <p className={`text-sm ${theme.bodyText}`}>Belum ada data jurnal dari siswa manapun.</p>
              ) : (
                <div className="space-y-2">
                  {globalLeaderboard.map((entry, idx) => {
                    const rank = idx + 1;
                    const isMe = entry.studentId === user?.uid;
                    return (
                      <div
                        key={entry.studentId}
                        className={`flex items-center gap-2.5 sm:gap-3 p-2.5 sm:p-3 rounded-xl border transition-colors ${
                          isMe
                            ? darkMode
                              ? "bg-emerald-900/40 border-emerald-600"
                              : "bg-emerald-100 border-emerald-300"
                            : darkMode
                            ? "bg-slate-700/40 border-slate-700"
                            : "bg-emerald-50/50 border-emerald-100"
                        }`}
                      >
                        <div
                          className={`w-8 h-8 sm:w-9 sm:h-9 shrink-0 rounded-full flex items-center justify-center font-bold text-xs sm:text-sm ${
                            rank === 1
                              ? "bg-gradient-to-br from-yellow-300 via-amber-400 to-orange-500 text-white shadow-inner shadow-black/10"
                              : rank === 2
                              ? "bg-gradient-to-br from-slate-300 to-slate-500 text-white shadow-inner shadow-black/10"
                              : rank === 3
                              ? "bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-inner shadow-black/10"
                              : darkMode
                              ? "bg-slate-600 text-emerald-100"
                              : "bg-emerald-200 text-emerald-800"
                          }`}
                        >
                          {rank <= 3 ? <Crown className="w-4 h-4" /> : rank}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={`text-xs sm:text-sm font-bold truncate ${theme.headingText}`}>
                            {entry.studentName}
                            {isMe && <span className="ml-1.5 text-xs font-normal text-emerald-500">(Kamu)</span>}
                          </p>
                          <p className={`text-xs ${theme.mutedText}`}>Kelas {entry.classCode}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`text-xs sm:text-sm font-bold ${theme.headingText}`}>{entry.journalCount} jurnal</p>
                          <p className={`text-[10px] sm:text-xs ${theme.mutedText}`}>{entry.booksFinished} buku selesai</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : classLeaderboard.length === 0 ? (
              <p className={`text-sm ${theme.bodyText}`}>Belum ada data jurnal untuk kelas ini.</p>
            ) : (
              <div className="space-y-2">
                {classLeaderboard.map((entry, idx) => {
                  const rank = idx + 1;
                  const isMe = entry.studentId === user?.uid;
                  return (
                    <div
                      key={entry.studentId}
                      className={`flex items-center gap-2.5 sm:gap-3 p-2.5 sm:p-3 rounded-xl border transition-colors ${
                        isMe
                          ? darkMode
                            ? "bg-emerald-900/40 border-emerald-600"
                            : "bg-emerald-100 border-emerald-300"
                          : darkMode
                          ? "bg-slate-700/40 border-slate-700"
                          : "bg-emerald-50/50 border-emerald-100"
                      }`}
                    >
                      <div
                        className={`w-8 h-8 sm:w-9 sm:h-9 shrink-0 rounded-full flex items-center justify-center font-bold text-xs sm:text-sm ${
                          rank === 1
                            ? "bg-gradient-to-br from-yellow-300 via-amber-400 to-orange-500 text-white shadow-inner shadow-black/10"
                            : rank === 2
                            ? "bg-gradient-to-br from-slate-300 to-slate-500 text-white shadow-inner shadow-black/10"
                            : rank === 3
                            ? "bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-inner shadow-black/10"
                            : darkMode
                            ? "bg-slate-600 text-emerald-100"
                            : "bg-emerald-200 text-emerald-800"
                        }`}
                      >
                        {rank <= 3 ? <Crown className="w-4 h-4" /> : rank}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={`text-xs sm:text-sm font-bold truncate ${theme.headingText}`}>
                          {entry.studentName}
                          {isMe && <span className="ml-1.5 text-xs font-normal text-emerald-500">(Kamu)</span>}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-xs sm:text-sm font-bold ${theme.headingText}`}>{entry.journalCount} jurnal</p>
                        <p className={`text-[10px] sm:text-xs ${theme.mutedText}`}>{entry.booksFinished} buku selesai</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ---- Tab: Isi Jurnal Membaca ---- */}
        {activeTab === "jurnal" && (
          <div className={`p-4 sm:p-6 rounded-3xl shadow-md border backdrop-blur-sm space-y-6 ${theme.panel}`}>
            <div>
              <h2 className={`text-lg font-bold tracking-tight ${theme.headingText}`}>
                {editingJournalId ? "Edit & Kirim Ulang Jurnal" : "Isi Jurnal Membaca"}
              </h2>
              <p className={`text-xs mt-1 ${theme.mutedText}`}>
                {editingJournalId
                  ? "Perbaiki isi jurnal ini lalu kirim ulang agar status kembali menunggu validasi guru."
                  : "Catat progres bacaanmu hari ini, lalu simpan untuk divalidasi guru."}
              </p>
            </div>

            {formError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{formError}</p>
            )}
            {successMessage && (
              <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                {successMessage}
              </p>
            )}

            {/* Informasi Buku */}
            <div>
              <h3 className={`text-sm font-semibold mb-2 ${darkMode ? "text-emerald-200" : "text-emerald-800"}`}>Informasi Buku</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className={`text-xs mb-1 block ${theme.bodyText}`}>Judul Buku</label>
                  <input
                    type="text"
                    value={form.bookTitle}
                    onChange={(e) => setForm({ ...form, bookTitle: e.target.value })}
                    placeholder="cth. Laskar Pelangi"
                    className={`w-full p-2.5 sm:p-2 text-sm border rounded-xl outline-none focus:ring-2 transition ${theme.input}`}
                  />
                </div>
                <div>
                  <label className={`text-xs mb-1 block ${theme.bodyText}`}>Penulis</label>
                  <input
                    type="text"
                    value={form.author}
                    onChange={(e) => setForm({ ...form, author: e.target.value })}
                    placeholder="cth. Andrea Hirata"
                    className={`w-full p-2.5 sm:p-2 text-sm border rounded-xl outline-none focus:ring-2 transition ${theme.input}`}
                  />
                </div>
                <div>
                  <label className={`text-xs mb-1 block ${theme.bodyText}`}>Genre</label>
                  <input
                    type="text"
                    list="genre-options"
                    value={form.genre}
                    onChange={(e) => setForm({ ...form, genre: e.target.value })}
                    placeholder="cth. Fiksi"
                    className={`w-full p-2.5 sm:p-2 text-sm border rounded-xl outline-none focus:ring-2 transition ${theme.input}`}
                  />
                  <datalist id="genre-options">
                    {GENRE_SUGGESTIONS.map((g) => (
                      <option key={g} value={g} />
                    ))}
                  </datalist>
                </div>
              </div>
            </div>

            {/* Progress Membaca */}
            <div>
              <h3 className={`text-sm font-semibold mb-2 ${darkMode ? "text-emerald-200" : "text-emerald-800"}`}>Progress Membaca</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 items-end">
                <div>
                  <label className={`text-xs mb-1 block ${theme.bodyText}`}>Halaman Awal</label>
                  <input
                    type="number"
                    min={1}
                    value={form.startPage}
                    onChange={(e) => setForm({ ...form, startPage: e.target.value })}
                    placeholder="cth. 1"
                    className={`w-full p-2.5 sm:p-2 text-sm border rounded-xl outline-none focus:ring-2 transition ${theme.input}`}
                  />
                </div>
                <div>
                  <label className={`text-xs mb-1 block ${theme.bodyText}`}>Halaman Akhir</label>
                  <input
                    type="number"
                    min={1}
                    value={form.endPage}
                    onChange={(e) => setForm({ ...form, endPage: e.target.value })}
                    placeholder="cth. 20"
                    className={`w-full p-2.5 sm:p-2 text-sm border rounded-xl outline-none focus:ring-2 transition ${theme.input}`}
                  />
                </div>
                <p className={`text-xs pb-2 col-span-2 md:col-span-1 ${theme.mutedText}`}>
                  {pagesReadPreview > 0 ? `${pagesReadPreview} halaman dibaca` : ""}
                </p>
              </div>

              {/* Fitur #7: peringatan tumpang tindih halaman */}
              {overlapWarning && (
                <p className="mt-2 text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-xl px-3 py-2 flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  {overlapWarning}
                </p>
              )}

              <label className={`flex items-center gap-2 mt-3 text-sm ${darkMode ? "text-emerald-200" : "text-emerald-800"}`}>
                <input
                  type="checkbox"
                  checked={form.finished}
                  onChange={(e) => setForm({ ...form, finished: e.target.checked })}
                  className="w-4 h-4 accent-emerald-600 shrink-0"
                />
                Buku ini sudah selesai dibaca
              </label>

              {/* Fitur #3: peringatan duplikat buku selesai */}
              {duplicateFinishedWarning && (
                <p className="mt-2 text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-xl px-3 py-2 flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  {duplicateFinishedWarning}
                </p>
              )}
            </div>

            {/* Ringkasan */}
            <div>
              <label className={`text-sm font-semibold mb-2 block ${darkMode ? "text-emerald-200" : "text-emerald-800"}`}>Ringkasan Bacaan</label>
              <textarea
                value={form.summary}
                onChange={(e) => setForm({ ...form, summary: e.target.value })}
                placeholder="Ceritakan apa yang kamu baca hari ini..."
                rows={4}
                className={`w-full p-3 text-sm border rounded-xl outline-none focus:ring-2 transition ${theme.input}`}
              />
            </div>

            {/* Nilai Karakter */}
            <div>
              <label className={`text-sm font-semibold mb-2 block ${darkMode ? "text-emerald-200" : "text-emerald-800"}`}>Nilai Karakter yang Ditemukan</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {CHARACTER_OPTIONS.map((c) => (
                  <label
                    key={c}
                    className={`flex items-center gap-2 p-2.5 sm:p-2 rounded-xl border text-sm cursor-pointer transition ${
                      selectedCharacters.has(c)
                        ? darkMode
                          ? "bg-emerald-900/50 border-emerald-700 text-emerald-100"
                          : "bg-emerald-100 border-emerald-300 text-emerald-900"
                        : darkMode
                        ? "border-slate-600 text-emerald-300/70 hover:bg-slate-700"
                        : "border-emerald-200 text-emerald-700/70 hover:bg-emerald-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedCharacters.has(c)}
                      onChange={() => toggleCharacter(c)}
                      className="w-4 h-4 accent-emerald-600 shrink-0"
                    />
                    {c}
                  </label>
                ))}
                <label className={`flex flex-col gap-2 p-2.5 sm:p-2 rounded-xl border text-sm sm:col-span-2 lg:col-span-3 ${darkMode ? "border-slate-600 text-emerald-300/70" : "border-emerald-200 text-emerald-700/70"}`}>
                  <span className={`font-medium ${darkMode ? "text-emerald-200" : "text-emerald-800"}`}>Nilai karakter lainnya</span>
                  <textarea
                    value={customCharacter}
                    onChange={(e) => setCustomCharacter(e.target.value)}
                    placeholder="Tuliskan nilai karakter lain yang kamu temukan..."
                    rows={2}
                    className={`w-full p-2 text-sm border rounded-xl outline-none focus:ring-2 transition ${theme.input}`}
                  />
                </label>
              </div>
            </div>

            {/* Fitur #8: indikator draf tersimpan otomatis */}
            {!editingJournalId && (form.bookTitle || form.author || form.summary) && (
              <p className={`text-xs italic ${theme.mutedText}`}>Draf disimpan otomatis di perangkat ini.</p>
            )}

            <div className="flex flex-col sm:flex-row flex-wrap gap-2">
              {editingJournalId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingJournalId(null);
                    setForm(EMPTY_FORM);
                    setSelectedCharacters(new Set());
                    setCustomCharacter("");
                    setFormError("");
                  }}
                  className={`px-4 py-2.5 sm:py-2 border text-sm font-semibold rounded-xl transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                    darkMode ? "border-slate-600 text-emerald-200 bg-slate-800 hover:bg-slate-700" : "border-emerald-200 text-emerald-700 bg-white hover:bg-emerald-50"
                  }`}
                >
                  Batal Edit
                </button>
              )}
              <button
                onClick={handleSaveJournal}
                disabled={saving}
                className="px-5 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl shadow-sm shadow-emerald-900/20 hover:bg-emerald-700 active:scale-[0.98] transition disabled:opacity-50 disabled:active:scale-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2"
              >
                {saving ? "Menyimpan..." : editingJournalId ? "Edit & Kirim Ulang" : "Simpan Jurnal"}
              </button>
            </div>
          </div>
        )}

        {/* ---- Tab: Riwayat Jurnal ---- */}
        {activeTab === "riwayat" && (
          <div className={`p-4 sm:p-6 rounded-3xl shadow-md border backdrop-blur-sm ${theme.panel}`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <h2 className={`text-lg font-bold tracking-tight ${theme.headingText}`}>Riwayat Jurnal Saya</h2>
              {/* Fitur #2: pencarian & filter status */}
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative">
                  <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${darkMode ? "text-emerald-400" : "text-emerald-500"}`} />
                  <input
                    type="text"
                    placeholder="Cari judul atau penulis..."
                    value={riwayatSearch}
                    onChange={(e) => setRiwayatSearch(e.target.value)}
                    className={`pl-9 pr-3 py-2.5 sm:py-2 text-sm border rounded-xl outline-none focus:ring-2 transition w-full sm:w-56 ${theme.input}`}
                  />
                </div>
                <select
                  value={riwayatStatus}
                  onChange={(e) => setRiwayatStatus(e.target.value as RiwayatStatusFilter)}
                  className={`px-3 py-2.5 sm:py-2 text-sm border rounded-xl outline-none focus:ring-2 transition ${theme.input}`}
                >
                  <option value="semua">Semua Status</option>
                  <option value="pending">Menunggu Validasi</option>
                  <option value="revision">Perlu Revisi</option>
                  <option value="approved">Tervalidasi</option>
                </select>
              </div>
            </div>

            {journals.length === 0 ? (
              <p className={`text-sm ${theme.bodyText}`}>Kamu belum mengirim jurnal apa pun. Yuk mulai isi jurnal pertamamu!</p>
            ) : filteredRiwayat.length === 0 ? (
              <p className={`text-sm ${theme.bodyText}`}>Tidak ada jurnal yang cocok dengan pencarian/filter ini.</p>
            ) : (
              <div className="space-y-4">
                {filteredRiwayat.map((j) => {
                  const statusBadge = getStatusBadge(j.status);
                  const canDelete = normalizeStatus(j.status) !== "approved";
                  return (
                    <div key={j.id} className={`border p-3.5 sm:p-4 rounded-2xl transition-colors ${darkMode ? "border-slate-700 bg-slate-700/40" : "border-emerald-100 bg-emerald-50/50"}`}>
                      <div className="flex flex-wrap justify-between items-start mb-1 gap-2">
                        <p className={`font-bold text-sm sm:text-base ${theme.headingText}`}>
                          {j.bookTitle} <span className={`font-normal ${theme.mutedText}`}>({j.author})</span>
                        </p>
                        <span className={`text-xs px-2 py-1 rounded-lg font-semibold shrink-0 ${statusBadge.className}`}>
                          {statusBadge.label}
                        </span>
                      </div>
                      <p className={`text-xs mb-1 ${theme.mutedText}`}>
                        {j.genre ? `${j.genre} · ` : ""}Hal. {j.startPage}-{j.endPage} ·{" "}
                        {formatTanggal(toDateSafe(j.createdAt))}
                        {j.finished ? " · Selesai dibaca" : ""}
                      </p>
                      <p className={`text-sm italic mb-1 ${darkMode ? "text-emerald-200/80" : "text-emerald-800/80"}`}>&quot;{j.summary}&quot;</p>
                      {j.characterValues && j.characterValues.length > 0 && (
                        <p className={`text-xs ${theme.mutedText}`}>Nilai karakter: {j.characterValues.join(", ")}</p>
                      )}
                      {j.teacherFeedback && (
                        <div className="mt-2 rounded-xl border border-orange-200 bg-orange-50 p-2.5 text-xs text-orange-800">
                          <strong className="block mb-0.5 text-orange-900">Alasan revisi:</strong>
                          <span>{j.teacherFeedback}</span>
                        </div>
                      )}

                      {/* Progress Log — tampil log membaca bertahap jika ada */}
                      {j.progressLog && j.progressLog.length > 0 && (
                        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-2.5">
                          <strong className={`block mb-2 text-xs font-semibold ${darkMode ? "text-emerald-300" : "text-emerald-800"}`}>
                            📚 Log Progres Membaca:
                          </strong>
                          <div className="space-y-1.5">
                            {j.progressLog
                              .slice()
                              .sort(
                                (a, b) =>
                                  (toDateSafe(b.timestamp)?.getTime() ?? 0) - (toDateSafe(a.timestamp)?.getTime() ?? 0)
                              )
                              .map((progress, idx) => (
                                <div key={progress.id} className={`text-xs ${darkMode ? "text-emerald-700" : "text-emerald-700"}`}>
                                  <span className="font-semibold">
                                    #{j.progressLog!.length - idx}.
                                  </span>{" "}
                                  Hal. {progress.startPage}-{progress.endPage} ({progress.endPage - progress.startPage} hal.)
                                  <span className={`ml-1 ${darkMode ? "text-emerald-600" : "text-emerald-600"}`}>
                                    {progress.timestamp && ` • ${formatTanggal(toDateSafe(progress.timestamp))}`}
                                  </span>
                                  <br />
                                  <span className="italic">&quot;{progress.summary}&quot;</span>
                                </div>
                              ))}
                          </div>
                        </div>
                      )}

                      <div className="mt-3 flex flex-wrap justify-end gap-2">
                        {/* Add Progress — siswa bisa lanjut membaca selama buku belum selesai, termasuk yang sudah divalidasi guru */}
                        {!j.finished && (
                          <button
                            type="button"
                            onClick={() => setAddProgressTo(j.id)}
                            className="flex-1 sm:flex-none px-3 py-2 bg-emerald-500 text-white text-xs font-semibold rounded-xl hover:bg-emerald-600 active:scale-[0.98] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                          >
                            + Lanjut Membaca
                          </button>
                        )}
                        {j.status === "revision" && (
                          <button
                            type="button"
                            onClick={() => startEditJournal(j)}
                            className="flex-1 sm:flex-none px-3 py-2 bg-orange-500 text-white text-xs font-semibold rounded-xl hover:bg-orange-600 active:scale-[0.98] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
                          >
                            Edit &amp; Kirim Ulang
                          </button>
                        )}
                        {/* Fitur #1: hapus jurnal milik sendiri, selama belum tervalidasi */}
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => handleDeleteJournal(j)}
                            disabled={deleteLoadingId === j.id}
                            aria-label={`Hapus jurnal ${j.bookTitle}`}
                            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 text-red-600 border border-red-200 bg-red-50 text-xs font-semibold rounded-xl hover:bg-red-100 active:scale-[0.98] transition disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            {deleteLoadingId === j.id ? "Menghapus..." : "Hapus"}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Modal: Tambah Progress Membaca */}
            {addProgressTo && (
              <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                <div className={`max-w-md w-full p-5 sm:p-6 rounded-3xl shadow-2xl max-h-[90vh] overflow-y-auto ${darkMode ? "bg-slate-800 border-slate-700" : "bg-white border-white"} border`}>
                  <h3 className={`text-lg font-bold tracking-tight mb-1 ${theme.headingText}`}>Lanjut Membaca</h3>
                  <p className={`text-xs mb-2 ${theme.mutedText}`}>
                    Catat progres membacamu hari ini untuk buku &quot;{journals.find((j) => j.id === addProgressTo)?.bookTitle}&quot;
                  </p>
                  <div className={`mb-4 rounded-xl border px-3 py-2 text-[11px] ${darkMode ? "border-amber-700/50 bg-amber-900/20 text-amber-200" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
                    Catatan lanjutan ini bersifat log membaca. Progres akan dihitung setelah guru memvalidasi buku yang belum selesai.
                  </div>

                  {addProgressError && (
                    <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-3">
                      {addProgressError}
                    </p>
                  )}

                  <div className="space-y-3 mb-4">
                    <div>
                      <label className={`text-xs font-semibold block mb-1 ${theme.headingText}`}>Halaman Awal</label>
                      <input
                        type="number"
                        min="1"
                        value={addProgressForm.startPage}
                        onChange={(e) =>
                          setAddProgressForm((prev) => ({ ...prev, startPage: e.target.value }))
                        }
                        className={`w-full px-3 py-2.5 sm:py-2 border rounded-xl outline-none focus:ring-2 transition text-sm ${theme.input}`}
                      />
                    </div>
                    <div>
                      <label className={`text-xs font-semibold block mb-1 ${theme.headingText}`}>Halaman Akhir</label>
                      <input
                        type="number"
                        min="1"
                        value={addProgressForm.endPage}
                        onChange={(e) =>
                          setAddProgressForm((prev) => ({ ...prev, endPage: e.target.value }))
                        }
                        className={`w-full px-3 py-2.5 sm:py-2 border rounded-xl outline-none focus:ring-2 transition text-sm ${theme.input}`}
                      />
                    </div>
                    <div>
                      <label className={`text-xs font-semibold block mb-1 ${theme.headingText}`}>Ringkasan Bacaan Hari Ini</label>
                      <textarea
                        value={addProgressForm.summary}
                        onChange={(e) =>
                          setAddProgressForm((prev) => ({ ...prev, summary: e.target.value }))
                        }
                        className={`w-full px-3 py-2 border rounded-xl outline-none focus:ring-2 transition text-sm resize-none h-20 ${theme.input}`}
                        placeholder="Apa yang kamu pelajari dari membaca hari ini?"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setAddProgressTo(null);
                        setAddProgressForm({ startPage: "", endPage: "", summary: "" });
                        setAddProgressError("");
                      }}
                      className={`flex-1 px-3 py-2.5 sm:py-2 rounded-xl text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${darkMode ? "bg-slate-700 text-emerald-100 hover:bg-slate-600" : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100"}`}
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleAddProgress()}
                      disabled={addProgressSaving}
                      className={`flex-1 px-3 py-2.5 sm:py-2 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 active:scale-[0.98] transition disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2`}
                    >
                      {addProgressSaving ? "Menyimpan..." : "Simpan Progress"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Credit di bagian bawah dashboard */}
        <p className={`text-center text-xs font-medium tracking-wide mt-8 mb-2 ${darkMode ? "text-emerald-400/40" : "text-emerald-700/50"}`}>
          © PPG Bahasa Indonesia UNJ 2026
        </p>
      </div>
    </div>
  );
}