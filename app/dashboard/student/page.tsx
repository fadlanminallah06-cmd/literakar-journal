"use client";

import { useState, useEffect, useMemo, useId, useCallback, useRef, type CSSProperties } from "react";
import { useAuth } from "@/context/AuthContext";
import Avatar from "@/lib/AvatarComponent";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { useRouter } from "next/navigation";
import {
  LogOut,
  RefreshCw,
  BookOpen,
  Flame,
  CalendarCheck,
  Library,
  Award,
  LockKeyhole,
  Medal,
  Trophy,
  Users,
  Search,
  Trash2,
  Moon,
  Sun,
  Target,
  AlertTriangle,
  Sparkles,
  Save,
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
  ArrowUp,
  Cloud,
  CloudRain,
  CloudSun,
  CloudLightning,
  Droplets,
} from "lucide-react";

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
  approvedBy?: string;
  createdAt?: Date | string | number | { toDate?: () => Date } | null;
  updatedAt?: Date | string | number | { toDate?: () => Date } | null;
}

/** Baris agregat leaderboard: statistik gabungan seorang siswa dari SEMUA jurnalnya,
 *  dihitung lintas siswa (bukan hanya milik siswa yang sedang login). */
interface LeaderboardEntry {
  studentId: string;
  studentName: string;
  classCode: string;
  gender?: string;
  journalCount: number;
  totalPagesRead: number;
  booksFinished: number;
}

interface ClassLeaderboardEntry {
  classCode: string;
  activeStudents: number;
  journalCount: number;
  totalPagesRead: number;
  booksFinished: number;
}

type TabKey = "beranda" | "jurnal" | "pohon" | "badge" | "leaderboard" | "riwayat";
type BadgeFilter = "semua" | "terkunci" | "didapat";
type RiwayatStatusFilter = "semua" | "pending" | "revision" | "approved";
type NormalizedStatus = "pending" | "revision" | "approved";
type LeaderboardSubTab = "semua" | "kelas" | "kelas-terajin";

type TreeStage = "small" | "young" | "big";

interface WeatherData {
  temperature: number;
  apparentTemperature: number;
  humidity: number;
  precipitation: number;
  windSpeed: number;
  windDirection: string;
  visibility: string;
  weatherCode: number;
  hourly: WeatherHour[];
}

interface WeatherHour {
  time: string;
  temperature: number;
  weatherCode: number;
  description: string;
  humidity: number;
  precipitation: number;
}

function getWeatherInfo(code: number): { label: string; Icon: typeof Sun; color: string } {
  if (code === 0 || code === 1) return { label: "Cerah", Icon: Sun, color: "text-amber-500" };
  if (code === 2) return { label: "Cerah Berawan", Icon: CloudSun, color: "text-sky-500" };
  if (code === 3) return { label: "Berawan", Icon: Cloud, color: "text-slate-400" };
  if (code >= 60 && code <= 69) return { label: "Hujan", Icon: CloudRain, color: "text-sky-600" };
  if (code >= 95) return { label: "Badai Petir", Icon: CloudLightning, color: "text-amber-500" };
  return { label: "Berawan", Icon: Cloud, color: "text-slate-400" };
}

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

interface BookRecommendation {
  title: string;
  author: string;
}

/** Rekomendasi buku statis berdasarkan judul yang paling sering dicatat
 *  siswa — "karena kamu sering baca buku ini, coba juga buku-buku ini".
 *  Kunci memakai judul huruf kecil supaya cocok dengan input bebas-teks
 *  siswa di form jurnal (yang di-lowercase saat dibandingkan). */
const BOOK_RECOMMENDATIONS: Record<string, BookRecommendation[]> = {
  "laskar pelangi": [
    { title: "Sang Pemimpi", author: "Andrea Hirata" },
    { title: "Edensor", author: "Andrea Hirata" },
    { title: "Negeri 5 Menara", author: "Ahmad Fuadi" },
  ],
  "bumi manusia": [
    { title: "Anak Semua Bangsa", author: "Pramoedya Ananta Toer" },
    { title: "Jejak Langkah", author: "Pramoedya Ananta Toer" },
    { title: "Gadis Pantai", author: "Pramoedya Ananta Toer" },
  ],
  "negeri 5 menara": [
    { title: "Ranah 3 Warna", author: "Ahmad Fuadi" },
    { title: "Rantau 1 Muara", author: "Ahmad Fuadi" },
    { title: "Laskar Pelangi", author: "Andrea Hirata" },
  ],
  "bumi": [
    { title: "Bulan", author: "Tere Liye" },
    { title: "Matahari", author: "Tere Liye" },
    { title: "Bintang", author: "Tere Liye" },
  ],
  "matahari": [
    { title: "Bumi", author: "Tere Liye" },
    { title: "Bulan", author: "Tere Liye" },
    { title: "Ceros dan Batozar", author: "Tere Liye" },
  ],
  "si anak kuat": [
    { title: "Si Anak Pintar", author: "Tere Liye" },
    { title: "Si Anak Cahaya", author: "Tere Liye" },
    { title: "Si Anak Spesial", author: "Tere Liye" },
  ],
  "habibie & ainun": [
    { title: "Sang Pencerah", author: "Akmal Nasery Basral" },
    { title: "Chairul Tanjung Si Anak Singkong", author: "Tjahja Gunawan Diredja" },
  ],
  "sang pencerah": [
    { title: "Habibie & Ainun", author: "B.J. Habibie" },
    { title: "Gajah Mada", author: "Langit Kresna Hariadi" },
  ],
  "supernova: ksatria, puteri, dan bintang jatuh": [
    { title: "Supernova: Akar", author: "Dee Lestari" },
    { title: "Supernova: Petir", author: "Dee Lestari" },
    { title: "Perahu Kertas", author: "Dee Lestari" },
  ],
  "atomic habits": [
    { title: "Filosofi Teras", author: "Henry Manampiring" },
    { title: "Sapiens: Riwayat Singkat Umat Manusia", author: "Yuval Noah Harari" },
  ],
  "sapiens: riwayat singkat umat manusia": [
    { title: "Homo Deus", author: "Yuval Noah Harari" },
    { title: "Atomic Habits", author: "James Clear" },
  ],
  "gajah mada": [
    { title: "Arus Balik", author: "Pramoedya Ananta Toer" },
    { title: "Sang Pencerah", author: "Akmal Nasery Basral" },
  ],
};

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

function getJakartaDateParts(date: Date): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const values: Record<string, string> = {};
  parts.forEach((part) => {
    if (part.type !== "literal") values[part.type] = part.value;
  });

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

function toJakartaDateKey(date: Date): string {
  const parts = getJakartaDateParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function formatTanggal(d: Date | null): string {
  if (!d) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
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

/** Satu sumber kebenaran untuk urutan leaderboard: jumlah jurnal terbanyak dulu,
 *  lalu halaman terbanyak dibaca, lalu jumlah buku selesai. Dipakai untuk
 *  leaderboard global maupun per kelas supaya hasilnya konsisten. */
function sortLeaderboardEntries(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  return [...entries].sort((a, b) => {
    if (b.journalCount !== a.journalCount) return b.journalCount - a.journalCount;
    if (b.totalPagesRead !== a.totalPagesRead) return b.totalPagesRead - a.totalPagesRead;
    return b.booksFinished - a.booksFinished;
  });
}

function getRankLabel(rank: number): string {
  if (rank === 1) return "Juara I";
  if (rank === 2) return "Juara II";
  if (rank === 3) return "Juara III";
  return `Peringkat ${rank}`;
}

function getRankBadgeStyle(rank: number, dark: boolean): string {
  if (rank === 1) {
    return dark
      ? "bg-gradient-to-br from-yellow-300 via-amber-400 to-orange-500 text-white shadow-inner shadow-black/10"
      : "bg-gradient-to-br from-yellow-300 via-amber-400 to-orange-500 text-white shadow-inner shadow-black/10";
  }
  if (rank === 2) {
    return dark
      ? "bg-gradient-to-br from-slate-300 to-slate-500 text-white shadow-inner shadow-black/10"
      : "bg-gradient-to-br from-slate-300 to-slate-500 text-white shadow-inner shadow-black/10";
  }
  if (rank === 3) {
    return dark
      ? "bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-inner shadow-black/10"
      : "bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-inner shadow-black/10";
  }
  return dark ? "bg-slate-600 text-emerald-100" : "bg-emerald-200 text-emerald-800";
}

function getJakartaWeekdayIndex(date: Date): number {
  const parts = getJakartaDateParts(date);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
}

function getLatestMondaySnapshotCutoff(now = new Date()): Date {
  const parts = getJakartaDateParts(now);
  const weekday = getJakartaWeekdayIndex(now);
  const daysSinceMonday = (weekday + 6) % 7;
  const currentMondayUtcMs = Date.UTC(parts.year, parts.month - 1, parts.day - daysSinceMonday, 8, 0, 0, 0);
  const currentMondayAtEight = new Date(currentMondayUtcMs - 7 * 60 * 60 * 1000);

  if (now.getTime() < currentMondayAtEight.getTime()) {
    const previousMondayUtcMs = Date.UTC(parts.year, parts.month - 1, parts.day - daysSinceMonday - 7, 8, 0, 0, 0);
    return new Date(previousMondayUtcMs - 7 * 60 * 60 * 1000);
  }

  return currentMondayAtEight;
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
  | "nightOwl"
  | "uniqueBooks"
  | "maxDailyPages"
  | "nightOwlCount"
  | "genreFocus"
  | "legendCombo";

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

const CATEGORY_ORDER = [
  "Jumlah Buku",
  "Konsistensi",
  "Halaman & Maraton",
  "Eksplorasi & Kebiasaan",
  "Koleksi & Spesialisasi",
];

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

  { key: "kolektor", title: "Kolektor Buku", description: "Kumpulkan 20 judul buku berbeda", category: "Koleksi & Spesialisasi", tier: "gold", target: 20, metric: "uniqueBooks", icon: "library" },
  { key: "speed", title: "Speed Reader", description: "Baca 100+ halaman dalam satu hari", category: "Halaman & Maraton", tier: "silver", target: 100, metric: "maxDailyPages", icon: "zap" },
  { key: "nightowl", title: "Pembaca Malam", description: "10 kali baca setelah jam 9 malam", category: "Eksplorasi & Kebiasaan", tier: "gold", target: 10, metric: "nightOwlCount", icon: "moon" },
  { key: "genrefocus", title: "Spesialis Genre", description: "Baca 5 kali dari genre yang sama", category: "Koleksi & Spesialisasi", tier: "silver", target: 5, metric: "genreFocus", icon: "target" },
  { key: "legenda", title: "Legenda Literasi", description: "15 buku + 5000 halaman + streak 14 hari", category: "Konsistensi", tier: "gold", target: 1, metric: "legendCombo", icon: "crown" },
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
    case "target":
      return <Target className={className} />;
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

/**
 * Wajah lucu Literakar (mata besar + pipi merona + senyum) yang ditumpangkan
 * di atas kanopi, terinspirasi dari maskot pohon-buku. Dipakai bersama oleh
 * kanopi besar (tab Pohon Literasi), ikon mini (Beranda), dan maskot modal
 * perayaan supaya karakternya konsisten di semua tempat.
 * `blink` membuat mata menutup sesaat (dipicu saat pohon disentuh) supaya
 * terasa hidup dan menyenangkan buat siswa.
 */
function CreatureFace({
  cx = 95,
  cy = 62,
  eyeGap = 26,
  eyeR = 11,
  blink = false,
  happy = false,
  size = 1,
}: {
  cx?: number;
  cy?: number;
  eyeGap?: number;
  eyeR?: number;
  blink?: boolean;
  happy?: boolean;
  size?: number;
}) {
  const leftX = cx - eyeGap / 2;
  const rightX = cx + eyeGap / 2;
  const r = eyeR * size;

  return (
    <g>
      {/* Blush/Merona - lebih tebal saat happy */}
      <ellipse
        cx={leftX - r * 1.4}
        cy={cy + r * 1.6}
        rx={r * (happy ? 1 : 0.8)}
        ry={r * (happy ? 0.7 : 0.55)}
        fill="#fda4af"
        opacity={happy ? 0.8 : 0.55}
        className={happy ? "blush-active" : ""}
      />
      <ellipse
        cx={rightX + r * 1.4}
        cy={cy + r * 1.6}
        rx={r * (happy ? 1 : 0.8)}
        ry={r * (happy ? 0.7 : 0.55)}
        fill="#fda4af"
        opacity={happy ? 0.8 : 0.55}
        className={happy ? "blush-active" : ""}
      />

      {blink ? (
        <>
          <path
            d={`M${leftX - r},${cy} Q${leftX},${cy + r * 0.8} ${leftX + r},${cy}`}
            stroke="#14532d"
            strokeWidth={r * 0.4}
            strokeLinecap="round"
            fill="none"
          />
          <path
            d={`M${rightX - r},${cy} Q${rightX},${cy + r * 0.8} ${rightX + r},${cy}`}
            stroke="#14532d"
            strokeWidth={r * 0.4}
            strokeLinecap="round"
            fill="none"
          />
        </>
      ) : happy ? (
        <>
          <path
            d={`M${leftX - r},${cy + r * 0.3} Q${leftX},${cy - r * 0.8} ${leftX + r},${cy + r * 0.3}`}
            stroke="#14532d"
            strokeWidth={r * 0.35}
            strokeLinecap="round"
            fill="none"
          />
          <path
            d={`M${rightX - r},${cy + r * 0.3} Q${rightX},${cy - r * 0.8} ${rightX + r},${cy + r * 0.3}`}
            stroke="#14532d"
            strokeWidth={r * 0.35}
            strokeLinecap="round"
            fill="none"
          />
          <circle cx={leftX - r * 0.3} cy={cy - r * 0.2} r={r * 0.15} fill="#fff" opacity="0.8" />
          <circle cx={rightX - r * 0.3} cy={cy - r * 0.2} r={r * 0.15} fill="#fff" opacity="0.8" />
        </>
      ) : (
        <>
          <circle cx={leftX} cy={cy} r={r} fill="#ffffff" />
          <circle cx={rightX} cy={cy} r={r} fill="#ffffff" />
          <circle cx={leftX} cy={cy + r * 0.15} r={r * 0.65} fill="#14532d" />
          <circle cx={rightX} cy={cy + r * 0.15} r={r * 0.65} fill="#14532d" />
          <circle cx={leftX - r * 0.25} cy={cy - r * 0.3} r={r * 0.25} fill="#ffffff" />
          <circle cx={rightX - r * 0.25} cy={cy - r * 0.3} r={r * 0.25} fill="#ffffff" />
        </>
      )}

      {happy ? (
        <path
          d={`M${cx - r * 1.4},${cy + r * 1.5} Q${cx},${cy + r * 2.8} ${cx + r * 1.4},${cy + r * 1.5}`}
          stroke="#14532d"
          strokeWidth={r * 0.35}
          strokeLinecap="round"
          fill="none"
        />
      ) : (
        <path
          d={`M${cx - r * 1.1},${cy + r * 1.55} Q${cx},${cy + r * 2.55} ${cx + r * 1.1},${cy + r * 1.55}`}
          stroke="#14532d"
          strokeWidth={r * 0.3}
          strokeLinecap="round"
          fill="none"
        />
      )}
    </g>
  );
}

function TreeCanopy({
  stage,
  gradId,
  showBuds = false,
  showFruit = false,
  showFace = true,
  blink = false,
  happy = false,
}: {
  stage: TreeStage;
  gradId: string;
  showBuds?: boolean;
  showFruit?: boolean;
  showFace?: boolean;
  blink?: boolean;
  happy?: boolean;
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

      {/* Bayangan lembut di belakang kanopi */}
      <path d={CANOPY_BLOB_PATH} transform="translate(6,10) scale(0.98)" fill={palette.dark} opacity={0.16} />
      {/* Kanopi utama */}
      <path d={CANOPY_BLOB_PATH} fill={`url(#${gradId})`} />
      {/* Lapisan dalam untuk kedalaman */}
      <path d={CANOPY_BLOB_PATH} transform="translate(20,18) scale(0.55)" fill={palette.dark} opacity={0.22} />
      {/* Highlight cahaya */}
      <ellipse cx="70" cy="35" rx="26" ry="14" fill="#ffffff" opacity={0.25} />

      {showBuds && (
        <>
          <circle cx="45" cy="98" r="4" fill="#fef08a" opacity={0.9} />
          <circle cx="140" cy="95" r="3.5" fill="#fef08a" opacity={0.9} />
          <circle cx="30" cy="70" r="3" fill="#fef9c3" opacity={0.9} />
        </>
      )}

      {showFruit && (
        <>
          <circle cx="35" cy="88" r="5" fill="#f97316" />
          <circle cx="100" cy="118" r="5" fill="#ef4444" />
          <circle cx="150" cy="70" r="4.5" fill="#f97316" />
          <circle cx="150" cy="100" r="4" fill="#ef4444" />
        </>
      )}

      {showFace && <CreatureFace blink={blink} happy={happy} />}
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
  if (scope === "mini") {
    return (
      <style>{`
        @keyframes tree-idle-sway-mini { 
          0%,100% { transform: rotate(-1.5deg) translateY(0); } 
          50% { transform: rotate(1.5deg) translateY(-2px); } 
        }
        .tree-idle-sway-mini { transform-origin: 50% 100%; animation: tree-idle-sway-mini 4s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .tree-idle-sway-mini { animation: none !important; } }
      `}</style>
    );
  }
  return (
    <style>{`
      /* Idle Animation - Breathing effect */
      @keyframes tree-idle-breathe {
        0%, 100% { transform: scale(1) rotate(0deg); }
        25% { transform: scale(1.02) rotate(-0.5deg); }
        75% { transform: scale(1.02) rotate(0.5deg); }
      }
      
      /* Happy Jump Animation - saat disentuh */
      @keyframes tree-happy-jump {
        0% { transform: translateY(0) scale(1); }
        20% { transform: translateY(-25px) scale(1.05) rotate(-3deg); }
        40% { transform: translateY(0) scale(0.95) rotate(2deg); }
        60% { transform: translateY(-12px) scale(1.02) rotate(-1deg); }
        80% { transform: translateY(0) scale(1); }
        100% { transform: translateY(0) scale(1); }
      }
      
      /* Arms waving lebih ekspresif */
      @keyframes arm-wave-excited-left {
        0%, 100% { transform: rotate(0deg); }
        25% { transform: rotate(-35deg) translateY(-5px); }
        50% { transform: rotate(15deg); }
        75% { transform: rotate(-25deg) translateY(-3px); }
      }
      @keyframes arm-wave-excited-right {
        0%, 100% { transform: rotate(0deg); }
        25% { transform: rotate(30deg) translateY(-5px); }
        50% { transform: rotate(-12deg); }
        75% { transform: rotate(20deg) translateY(-3px); }
      }
      
      /* Flying Book Animation - mengelilingi pohon */
      @keyframes book-fly-around {
        0% { transform: translate(0, 0) rotate(0deg); opacity: 0; }
        10% { opacity: 1; }
        25% { transform: translate(60px, -40px) rotate(90deg); }
        50% { transform: translate(0, -80px) rotate(180deg); }
        75% { transform: translate(-60px, -40px) rotate(270deg); }
        90% { opacity: 1; }
        100% { transform: translate(0, 0) rotate(360deg); opacity: 0; }
      }
      
      /* Butterfly Flying */
      @keyframes butterfly-fly-1 {
        0%, 100% { transform: translate(0, 0) rotate(0deg); }
        25% { transform: translate(30px, -20px) rotate(15deg); }
        50% { transform: translate(60px, 0) rotate(0deg); }
        75% { transform: translate(30px, 20px) rotate(-15deg); }
      }
      @keyframes butterfly-fly-2 {
        0%, 100% { transform: translate(0, 0) rotate(0deg) scaleX(1); }
        50% { transform: translate(-40px, -30px) rotate(-20deg) scaleX(0.8); }
      }
      
      /* Bird Perch - muncul sesekali */
      @keyframes bird-appear {
        0%, 90%, 100% { opacity: 0; transform: translateY(-10px); }
        92%, 98% { opacity: 1; transform: translateY(0); }
      }
      
      /* Enhanced Leaf Fall */
      @keyframes leaf-fall-spin {
        0% { transform: translateY(-10px) rotate(0deg) scale(1); opacity: 0; }
        10% { opacity: 1; }
        100% { transform: translateY(180px) rotate(720deg) scale(0.5); opacity: 0; }
      }
      
      /* Sparkle Effect */
      @keyframes sparkle-twinkle {
        0%, 100% { opacity: 0; transform: scale(0) rotate(0deg); }
        50% { opacity: 1; transform: scale(1) rotate(90deg); }
      }
      
      /* Face blush animation */
      @keyframes blush-pulse {
        0%, 100% { opacity: 0.4; }
        50% { opacity: 0.7; }
      }

      /* Class implementations */
      .tree-idle-breathe { 
        transform-origin: 50% 100%; 
        animation: tree-idle-breathe 4s ease-in-out infinite; 
      }
      .tree-happy-jump { 
        transform-origin: 50% 100%; 
        animation: tree-happy-jump 1s cubic-bezier(0.34,1.56,0.64,1); 
      }
      .arm-left-excited { 
        transform-origin: 78px 148px; 
        animation: arm-wave-excited-left 1s ease-in-out; 
      }
      .arm-right-excited { 
        transform-origin: 122px 148px; 
        animation: arm-wave-excited-right 1s ease-in-out; 
      }
      .flying-book { 
        animation: book-fly-around 4s linear infinite; 
        transform-origin: center;
      }
      .butterfly-1 { 
        animation: butterfly-fly-1 6s ease-in-out infinite; 
      }
      .butterfly-2 { 
        animation: butterfly-fly-2 5s ease-in-out infinite 1s; 
      }
      .bird-perch { 
        animation: bird-appear 8s ease-in-out infinite; 
      }
      .leaf-spin { 
        animation: leaf-fall-spin linear forwards; 
      }
      .sparkle { 
        animation: sparkle-twinkle 1.5s ease-in-out infinite; 
      }
      .blush-active { 
        animation: blush-pulse 2s ease-in-out infinite; 
      }
      
      @media (prefers-reduced-motion: reduce) {
        .tree-idle-breathe, .tree-happy-jump, .arm-left-excited, .arm-right-excited,
        .flying-book, .butterfly-1, .butterfly-2, .bird-perch, .leaf-spin, .sparkle, .blush-active { 
          animation: none !important; 
        }
      }
    `}</style>
  );
}

function TreeGrowth({ totalPages, dark }: { totalPages: number; dark: boolean }) {
  const uid = useId();
  const [isSwaying, setIsSwaying] = useState(false);
  const [isBlinking, setIsBlinking] = useState(false);
  const [isHappy, setIsHappy] = useState(false);
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

  useEffect(() => {
    const blinkInterval = window.setInterval(() => {
      setIsBlinking(true);
      window.setTimeout(() => setIsBlinking(false), 200);
    }, 3000 + Math.random() * 2000);

    return () => window.clearInterval(blinkInterval);
  }, []);

  const shakeTree = () => {
    setIsSwaying(true);
    setIsHappy(true);

    window.setTimeout(() => setIsSwaying(false), 1000);
    window.setTimeout(() => setIsHappy(false), 2000);

    setIsBlinking(true);
    window.setTimeout(() => setIsBlinking(false), 300);

    const emojis = ["🍃", "🌿", "🍀", "✨", "💚", "🌸", "⭐"];
    const burst = Array.from({ length: 15 }).map((_, i) => ({
      id: Date.now() + i,
      left: 10 + Math.random() * 80,
      delay: Math.random() * 0.3,
      duration: 1.5 + Math.random() * 0.8,
      rotate: Math.random() * 720,
      emoji: emojis[Math.floor(Math.random() * emojis.length)],
    }));
    setLeaves(burst);
    window.setTimeout(() => setLeaves([]), 2500);
  };

  return (
    <div className={`relative overflow-hidden rounded-3xl shadow-xl border transition-all duration-300 ${
      dark 
        ? "bg-slate-800/80 border-slate-700 shadow-black/20" 
        : "bg-white/90 backdrop-blur-sm shadow-emerald-900/[0.06] border-white"
    }`}>
      <TreeShareStyles scope="full" />

      <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-3xl">
        <div className={`absolute -top-20 -right-20 w-64 h-64 rounded-full blur-3xl opacity-20 ${
          dark ? "bg-emerald-500" : "bg-emerald-300"
        }`} />
        <div className={`absolute -bottom-20 -left-20 w-64 h-64 rounded-full blur-3xl opacity-20 ${
          dark ? "bg-teal-500" : "bg-teal-300"
        }`} />
      </div>

      <div className="relative p-4 sm:p-6 lg:p-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-6 sm:mb-8">
          <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-lg ${
            dark 
              ? "bg-gradient-to-br from-emerald-900 to-emerald-800 text-emerald-300 shadow-emerald-900/50" 
              : "bg-gradient-to-br from-emerald-100 to-emerald-50 text-emerald-700 shadow-emerald-200/50"
          }`}>
            <Library className="w-6 h-6 sm:w-7 sm:h-7" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h2 className={`text-xl sm:text-2xl font-bold tracking-tight ${dark ? "text-emerald-100" : "text-emerald-900"}`}>
                Pohon Literasi
              </h2>
              <span className={`text-[10px] px-2 py-1 rounded-full font-bold uppercase tracking-wider ${
                dark 
                  ? "bg-emerald-900/50 text-emerald-300 border border-emerald-700" 
                  : "bg-emerald-100 text-emerald-700 border border-emerald-200"
              }`}>
                {stageMeta.label}
              </span>
            </div>
            <p className={`text-sm ${dark ? "text-emerald-300/70" : "text-emerald-700/70"}`}>
              Kenalan sama Literakar, sahabat baca yang tumbuh bareng kamu!
            </p>
            <div className={`mt-2 inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full ${
              dark ? "bg-slate-700/50 text-emerald-300/80" : "bg-emerald-50 text-emerald-700/80"
            }`}>
              <CalendarDays className="w-3 h-3" />
              <span>Update tiap Senin 08.00 WIB</span>
            </div>
          </div>
        </div>

        <div className={`relative rounded-2xl sm:rounded-3xl overflow-hidden ring-1 ring-black/5 ${
          dark 
            ? "bg-gradient-to-b from-slate-900 via-emerald-950/50 to-slate-900" 
            : "bg-gradient-to-b from-sky-100 via-emerald-50 to-lime-100"
        }`}>
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-amber-200/30 blur-2xl" />
            <div className="absolute top-6 right-8 w-12 h-12 rounded-full bg-gradient-to-br from-yellow-200 to-amber-300 opacity-60 blur-sm animate-pulse" />
            <div className="absolute bottom-10 left-4 w-16 h-16 rounded-full bg-emerald-300/20 blur-xl" />
          </div>

          <div className="relative p-4 sm:p-6 text-center">
            <div className="inline-flex flex-col items-center justify-center mb-4 sm:mb-6">
              <p className={`text-xs font-medium uppercase tracking-wider ${dark ? "text-emerald-400/70" : "text-emerald-700/60"}`}>
                Total Halaman Dibaca
              </p>
              <div className="flex items-baseline gap-1 mt-1">
                <span className={`text-3xl sm:text-4xl font-bold tracking-tight ${dark ? "text-emerald-100" : "text-emerald-900"}`}>
                  {totalPages}
                </span>
                <span className={`text-sm font-medium ${dark ? "text-emerald-300/60" : "text-emerald-700/60"}`}>
                  halaman
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={shakeTree}
              aria-label="Sentuh Literakar supaya bergoyang senang"
              className="relative mx-auto block w-full max-w-[280px] sm:max-w-xs h-64 sm:h-72 group focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded-3xl transition-transform duration-300 hover:scale-[1.02] active:scale-[0.98]"
            >
              {leaves.map((leaf) => (
                <span
                  key={leaf.id}
                  className="leaf-spin absolute text-lg sm:text-xl pointer-events-none z-20"
                  style={
                    {
                      left: `${leaf.left}%`,
                      top: "30%",
                      animationDelay: `${leaf.delay}s`,
                      animationDuration: `${leaf.duration}s`,
                      ["--leaf-rot" as string]: `${leaf.rotate}deg`,
                    } as CSSProperties
                  }
                >
                  {leaf.emoji}
                </span>
              ))}

              {isHappy && (
                <>
                  <span className="sparkle absolute top-10 left-10 text-yellow-400 text-xl">✨</span>
                  <span className="sparkle absolute top-20 right-10 text-yellow-400 text-lg" style={{ animationDelay: "0.2s" }}>⭐</span>
                  <span className="sparkle absolute bottom-20 left-16 text-yellow-300 text-lg" style={{ animationDelay: "0.4s" }}>✨</span>
                </>
              )}

              <svg viewBox="0 0 200 40" className="absolute bottom-0 left-1/2 -translate-x-1/2 w-48 sm:w-56 opacity-80" aria-hidden="true">
                <ellipse cx="100" cy="20" rx="95" ry="14" fill={dark ? "#064e3b" : "#bbf7d0"} opacity={dark ? 0.6 : 0.7} />
                <circle cx="60" cy="16" r="3.5" fill="#facc15" opacity={0.6} />
                <circle cx="140" cy="22" r="3.5" fill="#f9a8d4" opacity={0.5} />
                <circle cx="30" cy="22" r="2.5" fill="#a7f3d0" opacity={0.7} />
              </svg>

              <svg
                viewBox="0 0 200 220"
                className={`absolute bottom-2 left-1/2 -translate-x-1/2 h-full transition-transform duration-500 ${
                  isSwaying ? "tree-happy-jump" : "tree-idle-breathe"
                }`}
              >
                <defs>
                  <linearGradient id={`${uid}-trunk`} x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#92400e" />
                    <stop offset="100%" stopColor="#c2793a" />
                  </linearGradient>
                </defs>

                <path
                  d="M70,210 C55,205 40,208 28,200 M78,212 C68,206 58,209 48,215 M100,214 C100,205 100,198 100,192 M122,212 C132,206 142,209 152,215 M130,210 C145,205 160,208 172,200"
                  stroke="#92400e"
                  strokeWidth="6"
                  strokeLinecap="round"
                  fill="none"
                  opacity={0.85}
                />

                <path d="M92,192 C90,175 90,165 96,150 L104,150 C110,165 110,175 108,192 Z" fill={`url(#${uid}-trunk)`} />

                <g transform={canopyTransform(stage, "full")}>
                  <TreeCanopy
                    stage={stage}
                    gradId={`${uid}-canopy`}
                    showBuds={stage === "young"}
                    showFruit={stage === "big"}
                    showFace
                    blink={isBlinking}
                    happy={isHappy}
                  />
                </g>

                <g className={isSwaying ? "arm-left-excited" : ""}>
                  <path d="M80,150 C55,148 40,135 34,115" stroke="#92400e" strokeWidth="7" strokeLinecap="round" fill="none" />
                  <g transform="translate(14,92) rotate(-14)">
                    <rect x="0" y="0" width="30" height="21" rx="3" fill="#fde68a" stroke="#b45309" strokeWidth="1.5" />
                    <line x1="15" y1="2" x2="15" y2="19" stroke="#b45309" strokeWidth="1.5" />
                  </g>
                </g>

                <g className={isSwaying ? "arm-right-excited" : ""}>
                  <path d="M120,150 C145,148 160,135 166,115" stroke="#92400e" strokeWidth="7" strokeLinecap="round" fill="none" />
                  <circle cx="168" cy="110" r="6" fill="#92400e" />
                </g>

                {stage === "big" && (
                  <g className="flying-book" style={{ transformOrigin: "100px 100px" }}>
                    <g transform="translate(160, 80) rotate(15)">
                      <rect x="0" y="0" width="20" height="14" rx="2" fill="#fde68a" stroke="#b45309" strokeWidth="1" opacity="0.9" />
                      <line x1="10" y1="1" x2="10" y2="13" stroke="#b45309" strokeWidth="1" />
                    </g>
                  </g>
                )}

                {stage !== "small" && (
                  <>
                    <g className="butterfly-1" style={{ transformOrigin: "60px 80px" }}>
                      <circle cx="60" cy="80" r="3" fill="#f472b6" opacity="0.8" />
                      <ellipse cx="58" cy="78" rx="4" ry="2" fill="#fbbf24" opacity="0.6" transform="rotate(-30 58 78)" />
                    </g>
                    <g className="butterfly-2" style={{ transformOrigin: "140px 90px" }}>
                      <circle cx="140" cy="90" r="2.5" fill="#60a5fa" opacity="0.8" />
                      <ellipse cx="142" cy="88" rx="3" ry="1.5" fill="#93c5fd" opacity="0.6" transform="rotate(30 142 88)" />
                    </g>
                  </>
                )}

                {stage === "big" && (
                  <g className="bird-perch">
                    <g transform="translate(150, 60)">
                      <ellipse cx="0" cy="0" rx="8" ry="5" fill="#64748b" />
                      <circle cx="6" cy="-3" r="3" fill="#64748b" />
                      <circle cx="7" cy="-3" r="1" fill="#fff" />
                      <path d="M-2,2 L-2,6 M2,2 L2,6" stroke="#92400e" strokeWidth="1" />
                    </g>
                  </g>
                )}
              </svg>

              <div className={`absolute -bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[10px] font-medium whitespace-nowrap transition-all duration-300 ${
                dark ? "bg-slate-800/80 text-emerald-300" : "bg-white/80 text-emerald-700"
              } backdrop-blur-sm border ${dark ? "border-slate-600" : "border-emerald-200"} ${
                isHappy ? "opacity-0" : "opacity-0 group-hover:opacity-100"
              }`}>
                👆 Sentuh aku!
              </div>
            </button>

            <div className="mt-6 sm:mt-8">
              <h3 className={`text-xl sm:text-2xl font-bold tracking-tight ${dark ? "text-emerald-100" : "text-emerald-900"}`}>
                {stageMeta.label} <span className="ml-1">{stageMeta.mood}</span>
              </h3>
              <p className={`text-sm font-semibold mt-1 ${dark ? "text-emerald-300" : "text-emerald-700"}`}>
                ({stageMeta.range})
              </p>
            </div>

            <div className="max-w-md mx-auto mt-6 sm:mt-8">
              <div className="flex gap-2 sm:gap-3">
                {segments.map((seg) => (
                  <div key={seg.key} className="flex-1 group cursor-default">
                    <div className={`h-2.5 sm:h-3 rounded-full overflow-hidden transition-all duration-300 ${
                      dark ? "bg-slate-700/50" : "bg-emerald-900/10"
                    }`}>
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${
                          seg.key === stage 
                            ? "bg-gradient-to-r from-lime-400 to-emerald-600 shadow-sm shadow-emerald-500/30" 
                            : "bg-emerald-400/50"
                        }`}
                        style={{ width: `${seg.pct}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between mt-2 px-0.5">
                      <span className={`text-[10px] sm:text-xs font-medium flex items-center gap-1 ${
                        seg.key === stage 
                          ? dark ? "text-emerald-300" : "text-emerald-800" 
                          : dark ? "text-slate-500" : "text-emerald-700/40"
                      }`}>
                        <span className="text-sm sm:text-base">{seg.icon}</span>
                        <span className="hidden xs:inline">{seg.label}</span>
                      </span>
                      {seg.key === stage && (
                        <span className={`text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                          dark ? "bg-emerald-900/50 text-emerald-300" : "bg-emerald-100 text-emerald-700"
                        }`}>
                          {Math.round(seg.pct)}%
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              
              <p className={`text-xs sm:text-sm mt-4 font-medium ${dark ? "text-emerald-300/70" : "text-emerald-700/70"}`}>
                {totalPages >= 500
                  ? "🌟 Literakar tumbuh subur! Terus membaca untuk menjaganya bahagia."
                  : `🎯 Menuju tahap berikutnya: ${remaining} halaman lagi`}
              </p>
            </div>
          </div>
        </div>

        <div className={`mt-4 sm:mt-6 p-3 sm:p-4 rounded-2xl border flex items-start gap-3 ${
          dark 
            ? "bg-slate-700/30 border-slate-600/50" 
            : "bg-emerald-50/50 border-emerald-100"
        }`}>
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
            dark ? "bg-emerald-900/50 text-emerald-300" : "bg-emerald-100 text-emerald-700"
          }`}>
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-xs sm:text-sm font-semibold ${dark ? "text-emerald-200" : "text-emerald-800"}`}>
              Tips Hari Ini
            </p>
            <p className={`text-[11px] sm:text-xs mt-1 leading-relaxed ${dark ? "text-emerald-300/60" : "text-emerald-700/60"}`}>
              Baca 10-20 menit sebelum tidur membantu memperkuat memori dan membuat Literakar tumbuh lebih subur!
            </p>
          </div>
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
          <TreeCanopy stage={stage} gradId={`${uid}-canopy-mini`} showBuds={stage === "young"} showFruit={stage === "big"} showFace />
        </g>
      </svg>
      <div className="min-w-0">
        <p className={`text-xs ${dark ? "text-emerald-300/60" : "text-emerald-700/60"}`}>Literakar-mu saat ini</p>
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
      map.set(toJakartaDateKey(d), 0);
    }
    journals.forEach((j) => {
      const d = toDateSafe(j.createdAt);
      if (!d) return;
      const key = toJakartaDateKey(d);
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
    <div className={`p-3 sm:p-5 rounded-2xl shadow-md border ${dark ? "bg-slate-800/80 border-slate-700 shadow-black/20" : "bg-white/90 backdrop-blur-sm shadow-emerald-900/[0.06] border-white"}`}>
      <h3 className={`text-sm font-semibold mb-2 ${dark ? "text-emerald-200/80" : "text-emerald-800/70"}`}>
        Progres Membacamu (14 hari terakhir)
      </h3>
      <div className="w-full overflow-x-auto">
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full min-w-[300px] sm:min-w-0 max-w-full h-32 sm:h-40">
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
        className="mascot-breathe"
      />
      <ellipse cx="75" cy="90" rx="20" ry="12" fill="#ffffff" opacity={0.25} />

      {/* wajah — mata besar berbinar khas Literakar */}
      <ellipse cx="80" cy="112" rx="11" ry="12" fill="#ffffff" />
      <ellipse cx="120" cy="112" rx="11" ry="12" fill="#ffffff" />
      <circle cx="81" cy="115" r="6.5" fill="#14532d" />
      <circle cx="119" cy="115" r="6.5" fill="#14532d" />
      <circle cx="78" cy="110" r="2.4" fill="#ffffff" />
      <circle cx="116" cy="110" r="2.4" fill="#ffffff" />
      <path d="M78,136 Q100,153 122,136" stroke="#14532d" strokeWidth="4" fill="none" strokeLinecap="round" />
      <circle cx="63" cy="128" r="7" fill="#fca5a5" opacity={0.6} />
      <circle cx="137" cy="128" r="7" fill="#fca5a5" opacity={0.6} />

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

      {/* kilau bintang di sekitar kepala — kesan gembira */}
      <g className="mascot-sparkle-a">
        <path d="M35,55 l2.4,5.6 5.6,2.4 -5.6,2.4 -2.4,5.6 -2.4,-5.6 -5.6,-2.4 5.6,-2.4 Z" fill="#fde047" />
      </g>
      <g className="mascot-sparkle-b">
        <path d="M168,50 l2,4.6 4.6,2 -4.6,2 -2,4.6 -2,-4.6 -4.6,-2 4.6,-2 Z" fill="#fde047" />
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
        0%, 100% { transform: translateY(0) scale(1); }
        50% { transform: translateY(-9px) scale(1.015); }
      }
      @keyframes mascot-breathe-scale {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.03); }
      }
      @keyframes mascot-sparkle-twinkle-a {
        0%, 100% { opacity: 0.2; transform: scale(0.7) rotate(0deg); }
        50% { opacity: 1; transform: scale(1.15) rotate(20deg); }
      }
      @keyframes mascot-sparkle-twinkle-b {
        0%, 100% { opacity: 1; transform: scale(1.1) rotate(0deg); }
        50% { opacity: 0.25; transform: scale(0.7) rotate(-20deg); }
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
      .mascot-pop { animation: mascot-pop-in 0.6s cubic-bezier(0.34,1.56,0.64,1) both, mascot-bounce-idle 2.2s ease-in-out 0.6s infinite; transform-origin: 50% 100%; }
      .mascot-wave { animation: mascot-wave-arm 0.9s ease-in-out 0.6s infinite; transform-origin: 45px 120px; }
      .mascot-breathe { animation: mascot-breathe-scale 2.2s ease-in-out 0.6s infinite; transform-origin: 100px 130px; }
      .mascot-sparkle-a { animation: mascot-sparkle-twinkle-a 1.6s ease-in-out 0.2s infinite; transform-origin: 37px 60px; }
      .mascot-sparkle-b { animation: mascot-sparkle-twinkle-b 1.6s ease-in-out 0.6s infinite; transform-origin: 170px 55px; }
      .confetti-piece { animation: confetti-pop-fall linear forwards; }
      .celebration-overlay { animation: celebration-fade-in 0.25s ease-out both; }
      .celebration-card { animation: celebration-card-in 0.35s cubic-bezier(0.34,1.56,0.64,1) 0.05s both; }
      @media (prefers-reduced-motion: reduce) {
        .mascot-pop, .mascot-wave, .mascot-breathe, .mascot-sparkle-a, .mascot-sparkle-b, .confetti-piece, .celebration-overlay, .celebration-card { animation: none !important; }
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
  const [editingFeedback, setEditingFeedback] = useState<string>("");

  // Fitur #1: hapus jurnal milik sendiri (selama belum divalidasi guru)
  const [deleteLoadingId, setDeleteLoadingId] = useState<string | null>(null);

  // Fitur #2: pencarian & filter status di Riwayat Jurnal
  const [riwayatSearch, setRiwayatSearch] = useState("");
  const [riwayatStatus, setRiwayatStatus] = useState<RiwayatStatusFilter>("semua");
  const [expandedJournalId, setExpandedJournalId] = useState<string | null>(null);

  // Fitur #9: target membaca harian personal (disimpan per-siswa di perangkat ini)
  const [dailyGoal, setDailyGoal] = useState<number>(50);
  const [goalDraft, setGoalDraft] = useState<string>("50");
  const [targetLocked, setTargetLocked] = useState<boolean>(true);

  // Fitur: modal perayaan maskot Literakar saat target harian tercapai
  const [showGoalCelebration, setShowGoalCelebration] = useState(false);

  // Fitur: Leaderboard pembaca terajin (lintas semua siswa), dengan sub-tab
  // "Semua Kelas" (global) dan "Per Kelas". `leaderboard` menyimpan SELURUH
  // entri (bukan hanya top 10) supaya leaderboard per kelas bisa dihitung
  // dari data yang sama tanpa fetch ulang.
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState("");
  const [totalActiveStudents, setTotalActiveStudents] = useState(0);
  const leaderboardLoaded = useRef(false);
  const [leaderboardSubTab, setLeaderboardSubTab] = useState<LeaderboardSubTab>("semua");
  const [weeklyWindowKey, setWeeklyWindowKey] = useState<string>(() => new Date().toISOString());

  // Fitur #10: mode gelap
  const [darkMode, setDarkMode] = useState(false);
  const [isRefreshingData, setIsRefreshingData] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(true);
  const swipeStartX = useRef<number | null>(null);

  const handleSwipeStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (!window.matchMedia("(hover: none) and (pointer: coarse)").matches) return;
    const target = event.target as HTMLElement;
    if (target.closest("nav, button, input, textarea, select, a")) return;
    if (target.closest("[data-weather-scroll='true']")) return;
    swipeStartX.current = event.touches[0]?.clientX ?? null;
  };

  const handleSwipeEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("[data-weather-scroll='true']")) {
      swipeStartX.current = null;
      return;
    }
    const startX = swipeStartX.current;
    swipeStartX.current = null;
    if (startX === null) return;
    const endX = event.changedTouches[0]?.clientX;
    if (endX === undefined || Math.abs(endX - startX) < 70) return;

    const tabKeys: TabKey[] = ["beranda", "jurnal", "pohon", "badge", "leaderboard", "riwayat"];
    const currentIndex = tabKeys.indexOf(activeTab);
    const nextIndex = endX < startX ? currentIndex + 1 : currentIndex - 1;
    if (nextIndex >= 0 && nextIndex < tabKeys.length) setActiveTab(tabKeys[nextIndex]);
  };

  useEffect(() => {
    document.querySelector<HTMLElement>(`[data-dashboard-tab="${activeTab}"]`)?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [activeTab]);

  useEffect(() => {
    const controller = new AbortController();
    const loadWeather = async () => {
      try {
        const response = await fetch("https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4=31.75.02.1001", { signal: controller.signal });
        if (!response.ok) throw new Error("Weather request failed");

        const data = await response.json();
        const forecast = (data.data?.[0]?.cuaca ?? []).flat().map((item: {
          local_datetime: string;
          t: number;
          weather: number;
          weather_desc: string;
          hu: number;
          tp: number;
        }) => ({
          time: item.local_datetime,
          temperature: Number(item.t),
          weatherCode: Number(item.weather),
          description: item.weather_desc,
          humidity: Number(item.hu),
          precipitation: Number(item.tp),
        }));
        const now = Date.now();
        const current = forecast.find((item: WeatherHour) => new Date(item.time.replace(" ", "T") + "+07:00").getTime() >= now) ?? forecast[0];
        if (!current) throw new Error("No weather forecast available");

        setWeather({
          temperature: current.temperature,
          apparentTemperature: current.temperature,
          humidity: current.humidity,
          precipitation: current.precipitation,
          windSpeed: Number(data.data?.[0]?.cuaca?.[0]?.[0]?.ws ?? 0),
          windDirection: data.data?.[0]?.cuaca?.[0]?.[0]?.wd ?? "-",
          visibility: data.data?.[0]?.cuaca?.[0]?.[0]?.vs_text ?? "-",
          weatherCode: current.weatherCode,
          hourly: forecast.filter((item: WeatherHour) => new Date(item.time.replace(" ", "T") + "+07:00").getTime() >= now).slice(0, 12),
        });
      } catch (error) {
        if (!controller.signal.aborted) console.error("Gagal memuat cuaca Rawamangun", error);
      } finally {
        if (!controller.signal.aborted) setWeatherLoading(false);
      }
    };

    void loadWeather();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const handleScroll = () => setShowScrollTop(window.scrollY > 400);

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleScrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

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
      const snapshotCutoff = getLatestMondaySnapshotCutoff();
      const querySnapshot = await getDocs(collection(db, "journals"));
      const statsMap = new Map<
        string,
        { studentName: string; classCode: string; journalCount: number; totalPagesRead: number; finishedTitles: Set<string> }
      >();
      const activeStudentIds = new Set<string>();

      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data() as Journal;
        if (!data.studentId || normalizeStatus(data.status) !== "approved") return;

        const createdAt = toDateSafe(data.createdAt);
        if (!createdAt || createdAt > snapshotCutoff) return;

        activeStudentIds.add(String(data.studentId));

        const existing = statsMap.get(data.studentId) || {
          studentName: data.studentName || "Siswa",
          classCode: data.classCode || "-",
          journalCount: 0,
          totalPagesRead: 0,
          finishedTitles: new Set<string>(),
        };
        existing.journalCount += 1;
        const pages = Math.max(0, Number(data.endPage) - Number(data.startPage));
        if (pages > 0) existing.totalPagesRead += pages;
        if (data.finished && data.bookTitle) {
          existing.finishedTitles.add(data.bookTitle.trim().toLowerCase());
        }
        statsMap.set(data.studentId, existing);
      });

      const entries: LeaderboardEntry[] = Array.from(statsMap.entries()).map(([studentId, stats]) => ({
        studentId,
        studentName: stats.studentName,
        classCode: stats.classCode,
        gender: "",
        journalCount: stats.journalCount,
        totalPagesRead: stats.totalPagesRead,
        booksFinished: stats.finishedTitles.size,
      }));

      // Data leaderboard dihitung dari snapshot Senin 08.00 WIB terakhir dan
      // hanya berubah ketika snapshot berikutnya dibuka pada Senin depan.
      setLeaderboard(sortLeaderboardEntries(entries));
      setTotalActiveStudents(activeStudentIds.size);
    } catch {
      setLeaderboardError("Gagal memuat leaderboard. Silakan coba lagi.");
    } finally {
      setLeaderboardLoading(false);
    }
  }, []);

  const handleManualRefresh = useCallback(async () => {
    if (isRefreshingData) return;
    setIsRefreshingData(true);
    setFormError("");
    try {
      await Promise.all([fetchMyJournals(), fetchLeaderboard()]);
      setWeeklyWindowKey(new Date().toISOString());
    } catch {
      setFormError("Gagal memuat ulang data. Periksa koneksi dan coba lagi.");
    } finally {
      setIsRefreshingData(false);
    }
  }, [fetchLeaderboard, fetchMyJournals, isRefreshingData]);

  useEffect(() => {
    if (!loading && (!user || userProfile?.role !== "student")) {
      router.push("/login");
      return;
    }

    if (!user) return;

    let timeoutId: number | undefined;
    const scheduleWeeklyRefresh = () => {
      const now = new Date();
      const jakartaParts = getJakartaDateParts(now);
      const weekday = getJakartaWeekdayIndex(now);
      const daysUntilMonday = weekday === 1 ? 0 : (8 - weekday) % 7;
      const nextMondayAtEight = new Date(
        Date.UTC(jakartaParts.year, jakartaParts.month - 1, jakartaParts.day + daysUntilMonday, 8, 0, 0, 0) - 7 * 60 * 60 * 1000
      );

      if (weekday === 1 && now.getTime() >= nextMondayAtEight.getTime()) {
        nextMondayAtEight.setUTCDate(nextMondayAtEight.getUTCDate() + 7);
      }

      timeoutId = window.setTimeout(() => {
        setWeeklyWindowKey(new Date().toISOString());
        void fetchLeaderboard();
        scheduleWeeklyRefresh();
      }, Math.max(nextMondayAtEight.getTime() - now.getTime(), 0));
    };

    scheduleWeeklyRefresh();
    return () => {
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [fetchLeaderboard, loading, router, user, userProfile?.role]);

  useEffect(() => {
    if (!loading && (!user || userProfile?.role !== "student")) {
      router.push("/login");
      return;
    }

    if (!user) return;

    const unsubscribe = onSnapshot(
      query(collection(db, "journals"), where("studentId", "==", user.uid)),
      (snapshot) => {
        const docs: Journal[] = [];
        snapshot.forEach((journalDoc) => docs.push({ id: journalDoc.id, ...journalDoc.data() } as Journal));
        docs.sort((a, b) => (toDateSafe(b.createdAt)?.getTime() || 0) - (toDateSafe(a.createdAt)?.getTime() || 0));
        setJournals(docs);
      },
      () => setFormError("Gagal menyinkronkan riwayat jurnal secara realtime.")
    );

    return unsubscribe;
  }, [user, userProfile, loading, router]);

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
    const reference = weeklyWindowKey ? new Date(weeklyWindowKey) : new Date();
    const snapshotCutoff = getLatestMondaySnapshotCutoff(reference);

    return journals.reduce((acc, journal) => {
      if (normalizeStatus(journal.status) !== "approved") return acc;
      const createdAt = toDateSafe(journal.createdAt);
      if (!createdAt || createdAt > snapshotCutoff) return acc; // ✅ kumulatif s.d. cutoff, skip yang setelahnya

      const pages = Number(journal.endPage) - Number(journal.startPage);
      return acc + (Number.isNaN(pages) || pages < 0 ? 0 : pages);
    }, 0);
  }, [journals, weeklyWindowKey]);

  const badgeJournals = useMemo(() => {
    const reference = weeklyWindowKey ? new Date(weeklyWindowKey) : new Date();
    const snapshotCutoff = getLatestMondaySnapshotCutoff(reference);
    return journals.filter((journal) => {
      const createdAt = toDateSafe(journal.createdAt);
      return normalizeStatus(journal.status) === "approved" && Boolean(createdAt) && createdAt! <= snapshotCutoff;
    });
  }, [journals, weeklyWindowKey]);

  const totalBooksFinished = useMemo(() => {
    const finishedTitles = new Set<string>();
    journals.forEach((j) => {
      if (j.finished && j.bookTitle) finishedTitles.add(j.bookTitle.trim().toLowerCase());
    });
    return finishedTitles.size;
  }, [journals]);

  // Streak harian, real-time (BUKAN dibekukan mingguan) — dihitung dari
  // SEMUA jurnal (status apapun, tidak perlu menunggu validasi guru).
  // Kalau hari ini belum kirim jurnal, tetap cek dari kemarin dulu (supaya
  // tidak langsung ke-0 di tengah hari sebelum sempat isi jurnal). Tapi
  // begitu ada 1 hari kalender yang benar-benar bolong, streak putus total
  // dan mulai dari 0 lagi — bukan menyambung dari streak lama.
  const readingStreak = useMemo(() => {
    const dates = new Set<string>();
    journals.forEach((j) => {
      const d = toDateSafe(j.createdAt);
      if (d) dates.add(toJakartaDateKey(d));
    });
    if (dates.size === 0) return 0;

    const nowParts = getJakartaDateParts(new Date());
    let cursorDay = nowParts.day;
    const keyFor = (day: number) => toJakartaDateKey(new Date(Date.UTC(nowParts.year, nowParts.month - 1, day, 12)));

    if (!dates.has(keyFor(cursorDay))) {
      cursorDay -= 1;
    }

    let streak = 0;
    while (dates.has(keyFor(cursorDay))) {
      streak += 1;
      cursorDay -= 1;
    }
    return streak;
  }, [journals]);

  // Jumlah hari unik dengan jurnal sejak Senin minggu berjalan (real-time,
  // timezone Jakarta) — dipakai untuk badge "Rajin Mingguan".
  const weeklyDaysCount = useMemo(() => {
    const nowParts = getJakartaDateParts(new Date());
    const weekday = getJakartaWeekdayIndex(new Date());
    const daysSinceMonday = (weekday + 6) % 7;

    const dates = new Set<string>();
    journals.forEach((j) => {
      const d = toDateSafe(j.createdAt);
      if (d) dates.add(toJakartaDateKey(d));
    });

    let count = 0;
    for (let offset = 0; offset <= daysSinceMonday; offset += 1) {
      const key = toJakartaDateKey(new Date(Date.UTC(nowParts.year, nowParts.month - 1, nowParts.day - daysSinceMonday + offset, 12)));
      if (dates.has(key)) count += 1;
    }
    return count;
  }, [journals]);

  const genreCount = useMemo(() => {
    const set = new Set<string>();
    journals.forEach((j) => {
      if (j.genre && j.genre.trim()) set.add(j.genre.trim().toLowerCase());
    });
    return set.size;
  }, [journals]);

  // Judul buku yang paling sering muncul di jurnal siswa (dihitung dari jumlah
  // entri jurnal per judul, bukan sekadar sekali muncul) — dipakai sebagai
  // dasar "karena kamu sering baca buku ini" untuk rekomendasi berikutnya.
  const favoriteBookInfo = useMemo<{ key: string; label: string; count: number } | null>(() => {
    const counts = new Map<string, { label: string; count: number }>();
    journals.forEach((j) => {
      const raw = j.bookTitle?.trim();
      if (!raw) return;
      const key = raw.toLowerCase();
      const existing = counts.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        counts.set(key, { label: raw, count: 1 });
      }
    });
    if (counts.size === 0) return null;

    let best: { key: string; label: string; count: number } | null = null;
    counts.forEach((value, key) => {
      if (!best || value.count > best.count) {
        best = { key, label: value.label, count: value.count };
      }
    });
    return best;
  }, [journals]);

  // Rekomendasi buku dari judul favorit, dikurangi buku yang sudah pernah
  // dicatat siswa (dicocokkan dari judul, tanpa memandang huruf besar/kecil).
  const recommendedBooks = useMemo<BookRecommendation[]>(() => {
    if (!favoriteBookInfo) return [];
    const pool = BOOK_RECOMMENDATIONS[favoriteBookInfo.key] || [];
    const readTitles = new Set(journals.map((j) => j.bookTitle.trim().toLowerCase()));
    return pool.filter((book) => !readTitles.has(book.title.trim().toLowerCase())).slice(0, 3);
  }, [favoriteBookInfo, journals]);

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

  // Fitur #9: target harian membaca dihitung dari semua jurnal yang dikirim siswa
  // hari ini, tanpa menunggu validasi guru. Validasi tetap berlaku untuk statistik
  // approved dan pohon literasi, tetapi tidak menghambat pencapaian target harian.
  const todayPages = useMemo(() => {
    const todayStr = new Date().toDateString();
    return journals.reduce((acc, j) => {
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

  // Daftar badge/achievement lengkap dengan progres dari snapshot jurnal tervalidasi.
  const badges: BadgeComputed[] = useMemo(() => {
    const finishedTitles = new Set<string>();
    const uniqueTitles = new Set<string>();
    const totalPagesApproved = badgeJournals.reduce((total, journal) => {
      if (journal.finished && journal.bookTitle) finishedTitles.add(journal.bookTitle.trim().toLowerCase());
      if (journal.bookTitle) uniqueTitles.add(journal.bookTitle.trim().toLowerCase());
      const pages = Number(journal.endPage) - Number(journal.startPage);
      return total + (Number.isNaN(pages) || pages < 0 ? 0 : pages);
    }, 0);

    const genres = new Set<string>();
    const characters = new Set<string>();
    const genreCounts = new Map<string, number>();
    let maxPages = 0;
    let earlyBird = false;
    let nightOwl = false;
    let nightOwlCount = 0;
    const dailyPages = new Map<string, number>();

    badgeJournals.forEach((journal) => {
      if (journal.genre?.trim()) {
        const g = journal.genre.trim().toLowerCase();
        genres.add(g);
        genreCounts.set(g, (genreCounts.get(g) || 0) + 1);
      }

      (journal.characterValues || []).forEach((value) => {
        if (value.trim()) characters.add(value.trim().toLowerCase());
      });

      const pages = Number(journal.endPage) - Number(journal.startPage);
      if (!Number.isNaN(pages) && pages > maxPages) maxPages = pages;

      const date = toDateSafe(journal.createdAt);
      if (date && !Number.isNaN(pages) && pages > 0) {
        const dateKey = toJakartaDateKey(date);
        dailyPages.set(dateKey, (dailyPages.get(dateKey) || 0) + pages);
      }

      if (date) {
        const parts = getJakartaDateParts(date);
        earlyBird ||= parts.hour < 7;
        if (parts.hour >= 21) {
          nightOwl = true;
          nightOwlCount++;
        }
      }
    });

    let maxDailyPages = 0;
    dailyPages.forEach((pages) => {
      if (pages > maxDailyPages) maxDailyPages = pages;
    });

    let maxGenreCount = 0;
    genreCounts.forEach((count) => {
      if (count > maxGenreCount) maxGenreCount = count;
    });

    const isLegend = finishedTitles.size >= 15 && totalPagesApproved >= 5000 && readingStreak >= 14;

    const metrics: Record<BadgeMetricKey, number> = {
      booksFinished: finishedTitles.size,
      streak: readingStreak,
      weeklyDays: weeklyDaysCount,
      totalPages: totalPagesApproved,
      maxSinglePages: maxPages,
      journalCount: badgeJournals.length,
      genreCount: genres.size,
      characterVarietyCount: characters.size,
      earlyBird: earlyBird ? 1 : 0,
      nightOwl: nightOwl ? 1 : 0,
      uniqueBooks: uniqueTitles.size,
      maxDailyPages,
      nightOwlCount,
      genreFocus: maxGenreCount,
      legendCombo: isLegend ? 1 : 0,
    };

    return BADGE_DEFS.map((def) => {
      const raw = metrics[def.metric] ?? 0;
      const current = Math.min(raw, def.target);
      const earned = raw >= def.target;
      const percent = def.target > 0 ? Math.min(100, (raw / def.target) * 100) : 0;
      return { ...def, current, earned, percent };
    });
  }, [badgeJournals, readingStreak, weeklyDaysCount]);

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

  // Leaderboard global (top 100 lintas semua kelas). `leaderboard` sudah terurut
  // dari fetchLeaderboard, jadi cukup ambil 100 teratas.
  const globalLeaderboard = useMemo(() => leaderboard.slice(0, 100), [leaderboard]);

  // Siswa hanya boleh melihat kelasnya sendiri di mode "Per Kelas".
  const studentClassCode = userProfile?.classCode || "";

  // Leaderboard untuk kelas siswa saat ini (semua siswa dalam kelas itu, bukan dipotong 10).
  const classLeaderboard = useMemo(() => {
    if (!studentClassCode) return [];
    return sortLeaderboardEntries(leaderboard.filter((e) => e.classCode === studentClassCode));
  }, [leaderboard, studentClassCode]);

  const classLeaderboardRanking = useMemo<ClassLeaderboardEntry[]>(() => {
    const statsByClass = new Map<string, ClassLeaderboardEntry>();

    leaderboard.forEach((entry) => {
      const existing = statsByClass.get(entry.classCode) || {
        classCode: entry.classCode,
        activeStudents: 0,
        journalCount: 0,
        totalPagesRead: 0,
        booksFinished: 0,
      };

      existing.activeStudents += 1;
      existing.journalCount += entry.journalCount;
      existing.totalPagesRead += entry.totalPagesRead;
      existing.booksFinished += entry.booksFinished;
      statsByClass.set(entry.classCode, existing);
    });

    return Array.from(statsByClass.values()).sort((a, b) => {
      if (b.journalCount !== a.journalCount) return b.journalCount - a.journalCount;
      if (b.totalPagesRead !== a.totalPagesRead) return b.totalPagesRead - a.totalPagesRead;
      if (b.booksFinished !== a.booksFinished) return b.booksFinished - a.booksFinished;
      return a.classCode.localeCompare(b.classCode);
    });
  }, [leaderboard]);

  const myLeaderboardPosition = useMemo(() => {
    const entries = leaderboardSubTab === "semua" ? leaderboard : classLeaderboard;
    const rankIndex = entries.findIndex((entry) => entry.studentId === user?.uid);
    if (rankIndex === -1) return null;
    return {
      rank: rankIndex + 1,
      total: entries.length,
      isVisible: leaderboardSubTab === "kelas" || rankIndex < 100,
    };
  }, [classLeaderboard, leaderboard, leaderboardSubTab, user]);

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
  const weatherInfo = weather ? getWeatherInfo(weather.weatherCode) : null;

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
    setEditingFeedback(journal.teacherFeedback?.trim() || "");
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
        setEditingFeedback("");
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
          createdAt: serverTimestamp(),
        });
        setSuccessMessage("Jurnal berhasil disimpan! Menunggu validasi dari guru.");
      }

      setForm(EMPTY_FORM);
      setSelectedCharacters(new Set());
      setCustomCharacter("");
      setEditingJournalId(null);
      setEditingFeedback("");
      setActiveTab("riwayat");
      if (user) {
        try {
          localStorage.removeItem(`literasi_jurnal_draft_${user.uid}`);
        } catch {
          // abaikan
        }
      }
      void fetchMyJournals();
    } catch {
      setFormError(editingJournalId ? "Gagal memperbarui jurnal. Silakan coba lagi." : "Gagal menyimpan jurnal. Silakan coba lagi.");
    } finally {
      setSaving(false);
    }
  };

  const handleClearForm = () => {
    setForm(EMPTY_FORM);
    setSelectedCharacters(new Set());
    setCustomCharacter("");
    setFormError("");
    setSuccessMessage("");
    if (user) {
      try {
        localStorage.removeItem(`literasi_jurnal_draft_${user.uid}`);
      } catch {
        // abaikan
      }
    }
  };

  // Fitur baru: auto-isi halaman awal dari halaman akhir jurnal sebelumnya
  // untuk judul buku yang sama, supaya siswa tidak perlu input manual dan
  // mengurangi kemungkinan overlapWarning karena salah ketik.
  const handleBookTitleBlur = () => {
    if (editingJournalId) return;
    const title = form.bookTitle.trim().toLowerCase();
    if (!title || form.startPage !== "") return;

    const maxEndPage = journals.reduce((max, j) => {
      if (j.bookTitle.trim().toLowerCase() !== title) return max;
      return Math.max(max, Number(j.endPage) || 0);
    }, 0);

    if (maxEndPage > 0) {
      setForm((prev) => ({ ...prev, startPage: String(maxEndPage + 1) }));
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
    { key: "jurnal", label: "Isi Jurnal Membaca", icon: <NotebookPen className="w-4 h-4" /> },
    { key: "pohon", label: "Pohon Literasi", icon: <TreeDeciduous className="w-4 h-4" /> },
    { key: "badge", label: "Badge Saya", icon: <Award className="w-4 h-4" /> },
    { key: "leaderboard", label: "Leaderboard", icon: <Trophy className="w-4 h-4" /> },
    { key: "riwayat", label: "Riwayat Jurnal", icon: <History className="w-4 h-4" />, badgeCount: revisionCount },
  ];

  return (
    <div
      className={`min-h-screen p-2 sm:p-4 md:p-6 relative ${theme.pageBg}`}
      onTouchStart={handleSwipeStart}
      onTouchEnd={handleSwipeEnd}
    >
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

      <div className="relative w-full max-w-6xl xl:max-w-7xl 2xl:max-w-[96rem] mx-auto lg:px-2">
        <header className={`relative overflow-hidden flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-4 lg:gap-5 mb-4 sm:mb-6 p-3.5 sm:p-4 lg:p-5 rounded-2xl shadow-md border backdrop-blur-sm ${theme.panel}`}>
          <div className={`pointer-events-none absolute inset-x-0 top-0 h-0.5 ${darkMode ? "bg-gradient-to-r from-emerald-500 via-teal-400 to-amber-400" : "bg-gradient-to-r from-emerald-500 via-teal-400 to-amber-300"}`} />
          <div className="flex items-start gap-2.5 sm:gap-3 min-w-0 w-full sm:flex-1">
            <div className={`flex w-10 h-10 sm:w-11 sm:h-11 rounded-2xl items-center justify-center shrink-0 overflow-hidden ${darkMode ? "bg-emerald-900/60" : "bg-emerald-100"}`}>
              <Avatar
                gender={userProfile?.gender}
                name={displayName}
                className="w-full h-full"
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className={`text-base sm:text-xl font-bold tracking-tight truncate ${theme.headingText}`}>Dashboard Murid</h1>
                <span className={`text-[9px] sm:text-[10px] uppercase tracking-[0.14em] font-bold px-1.5 py-0.5 rounded-full border ${darkMode ? "border-emerald-700 bg-emerald-900/40 text-emerald-300" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
                  Literakar
                </span>
              </div>
              <p className={`text-xs sm:text-sm mt-0.5 ${theme.bodyText}`}>
                Kelas: {userProfile?.classCode}
                {genderLabel && <span className="ml-2">· {genderLabel}</span>}
              </p>
              <p className={`mt-1 max-w-xl text-xs font-medium leading-relaxed sm:text-sm ${theme.bodyText}`}>
                Setiap halaman yang kamu baca menumbuhkan cerita, karakter, dan masa depan bersama Literakar.
              </p>
              <div data-weather-scroll="true" className={`mt-2 flex w-full max-w-xl items-center justify-between gap-3 rounded-2xl border px-3 py-2.5 shadow-sm backdrop-blur-sm lg:max-w-2xl lg:px-4 lg:py-2 ${
                darkMode ? "border-cyan-700/70 bg-gradient-to-r from-cyan-950/70 via-slate-900/60 to-amber-950/40 shadow-cyan-950/30" : "border-cyan-200 bg-gradient-to-r from-cyan-50 via-white to-amber-50 shadow-cyan-900/10"
              }`}>
                {weatherLoading ? (
                  <div className={`flex min-w-0 items-center gap-2.5 text-xs ${theme.bodyText}`}>
                    <CloudSun className="h-5 w-5 shrink-0 animate-pulse text-sky-500" />
                    <span>Memuat cuaca Rawamangun...</span>
                  </div>
                ) : weather && weatherInfo ? (
                  <>
                    <div className="flex min-w-0 items-center gap-2.5">
                      <weatherInfo.Icon className={`h-7 w-7 shrink-0 ${weatherInfo.color}`} aria-hidden="true" />
                      <div className="min-w-0">
                        <p className={`truncate text-[10px] font-semibold uppercase tracking-[0.1em] ${theme.mutedText}`}>
                          Cuaca BMKG · Pulo Gadung
                        </p>
                        <p className={`mt-0.5 truncate text-xs font-semibold sm:text-sm ${theme.headingText}`}>
                          {weatherInfo.label} · Rawamangun
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2.5 text-right">
                      <div>
                        <p className={`text-xl font-bold leading-none sm:text-2xl ${theme.headingText}`}>{Math.round(weather.temperature)}°</p>
                        <p className={`mt-1 text-[10px] ${theme.mutedText}`}>Kelembapan {weather.humidity}%</p>
                      </div>
                      <div className={`hidden items-center gap-1 text-[10px] sm:flex sm:text-xs ${theme.mutedText}`}>
                        <Droplets className="h-3.5 w-3.5" aria-hidden="true" />
                        {weather.precipitation} mm
                      </div>
                    </div>
                  </>
                ) : (
                  <div className={`flex min-w-0 items-center gap-2 text-xs ${theme.mutedText}`}>
                    <Cloud className="h-5 w-5 shrink-0 text-sky-500" aria-hidden="true" />
                    <span>Cuaca Rawamangun belum tersedia.</span>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 shrink-0 w-full sm:w-auto sm:self-start lg:pt-0.5">
            <button
              type="button"
              onClick={() => void handleManualRefresh()}
              disabled={isRefreshingData}
              aria-label="Muat ulang data"
              title="Muat ulang data"
              className={`flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-xl border transition active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:cursor-not-allowed disabled:opacity-50 ${
                darkMode
                  ? "bg-slate-700 border-slate-600 text-emerald-300 hover:bg-slate-600"
                  : "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"
              }`}
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshingData ? "animate-spin" : ""}`} />
            </button>
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
              className="flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-xl text-sm font-semibold hover:bg-red-100 active:scale-[0.98] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
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
                data-dashboard-tab={t.key}
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

        {/* ---- Tab: Beranda (Enhanced UI) ---- */}
        {activeTab === "beranda" && (
          <div className="space-y-4 sm:space-y-6 animate-in fade-in duration-500">
            {/* Header Section dengan Glassmorphism */}
            <div className="relative overflow-hidden rounded-3xl bg-white/40 backdrop-blur-md border border-white/60 shadow-[0_8px_30px_-12px_rgba(6,95,70,0.15)] p-4 sm:p-6">
              <div className="absolute -top-24 -right-24 w-64 h-64 bg-emerald-200/30 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-teal-200/30 rounded-full blur-3xl pointer-events-none" />
              
              <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl sm:text-2xl font-bold text-emerald-900 tracking-tight">
                    Halo, {displayName} 👋
                  </h2>
                  <p className="text-sm text-emerald-700/70 mt-1">
                    Satu halaman hari ini, satu langkah lebih dekat menuju versi terbaik dirimu.
                  </p>
                </div>
                <div className="w-full sm:w-auto shrink-0">
                  <TreeProgressIcon totalPages={approvedTotalPages} dark={darkMode} />
                </div>
              </div>
            </div>

            {/* Indikator: peringkat siswa di kelasnya sendiri */}
            {myClassRank && (
              <div className="relative overflow-hidden rounded-2xl bg-white/40 backdrop-blur-md border border-white/60 shadow-[0_8px_30px_-12px_rgba(6,95,70,0.15)] p-4 sm:p-5">
                <div className="absolute -right-12 -top-12 w-40 h-40 bg-amber-200/30 rounded-full blur-3xl pointer-events-none" />
                <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-lg ${
                        myClassRank.rank <= 3
                          ? "bg-gradient-to-br from-yellow-300 via-amber-400 to-orange-500 text-white"
                          : darkMode
                          ? "bg-slate-700 text-emerald-200"
                          : "bg-emerald-100 text-emerald-700"
                      }`}
                    >
                      <Crown className="w-6 h-6" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-emerald-900">
                        Peringkat kamu di kelas: <span className="text-amber-600 font-bold">#{myClassRank.rank}</span> dari {myClassRank.total} murid
                      </p>
                      <p className="text-xs text-emerald-700/60 mt-0.5">
                        Berdasarkan jumlah jurnal terbanyak di Kelas {userProfile?.classCode}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab("leaderboard");
                      setLeaderboardSubTab("kelas");
                    }}
                    className="shrink-0 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 active:scale-[0.98] transition shadow-md shadow-emerald-600/20 w-full sm:w-auto"
                  >
                    <span>Lihat Leaderboard</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Reminder Streak - Enhanced */}
            {!dailyGoalReached && !hasJournalToday && (
              <div
                className={`relative overflow-hidden rounded-2xl border-2 p-4 sm:p-5 ${
                  readingStreak > 0
                    ? "bg-gradient-to-br from-orange-50 to-amber-50 border-orange-200"
                    : "bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-200"
                }`}
              >
                <div className={`absolute -right-8 -top-8 w-32 h-32 rounded-full blur-2xl opacity-50 ${
                  readingStreak > 0 ? "bg-orange-200" : "bg-emerald-200"
                }`} />
                <div className="relative flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                    readingStreak > 0 ? "bg-orange-100 text-orange-600" : "bg-emerald-100 text-emerald-600"
                  }`}>
                    {readingStreak > 0 ? <Flame className="w-6 h-6" /> : <Sparkles className="w-6 h-6" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className={`text-base font-bold ${readingStreak > 0 ? "text-orange-900" : "text-emerald-900"}`}>
                      {readingStreak > 0
                        ? `Streak ${readingStreak} harimu akan terputus!`
                        : "Yuk mulai streak membaca hari ini!"}
                    </h3>
                    <p className={`text-sm mt-1 ${readingStreak > 0 ? "text-orange-700/70" : "text-emerald-700/70"}`}>
                      {readingStreak > 0
                        ? "Isi jurnal sekarang untuk menjaga konsistensimu"
                        : "Mulai perjalanan literasimu dengan satu jurnal hari ini"}
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveTab("jurnal")}
                    className={`shrink-0 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition active:scale-[0.98] shadow-md w-full sm:w-auto ${
                      readingStreak > 0 
                        ? "bg-orange-500 hover:bg-orange-600 shadow-orange-500/25" 
                        : "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/25"
                    }`}
                  >
                    Isi Jurnal Sekarang
                  </button>
                </div>
              </div>
            )}

            {/* Stats Grid - Mobile Optimized */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
              <StatCard label="Buku Selesai Bulan Ini" value={monthlyStats.finishedBooks} icon={<Library className="w-4 h-4" />} color="blue" dark={darkMode} />
              <StatCard label="Halaman Bulan Ini" value={monthlyStats.pages} icon={<BookOpen className="w-4 h-4" />} color="emerald" dark={darkMode} />
              <StatCard label="Streak Bulan Ini" value={`${monthlyStats.streak} hari`} icon={<Flame className="w-4 h-4" />} color="orange" dark={darkMode} />
              <StatCard label="Jurnal Bulan Ini" value={monthlyStats.journals} icon={<CalendarCheck className="w-4 h-4" />} color="yellow" dark={darkMode} />
            </div>

            {/* Target Membaca Harian - Enhanced Card */}
            <div className="relative overflow-hidden rounded-3xl bg-white/40 backdrop-blur-md border border-white/60 shadow-[0_8px_30px_-12px_rgba(6,95,70,0.15)]">
              <div className="absolute -left-20 -top-20 w-64 h-64 bg-emerald-200/20 rounded-full blur-3xl pointer-events-none" />
              
              <div className="relative p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      darkMode ? "bg-emerald-900/50 text-emerald-300" : "bg-emerald-100 text-emerald-700"
                    }`}>
                      <Target className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className={`text-base font-bold ${darkMode ? "text-emerald-100" : "text-emerald-900"}`}>
                        Target Membaca Harian
                      </h3>
                      <p className={`text-xs ${darkMode ? "text-emerald-300/60" : "text-emerald-700/60"}`}>
                        {dailyGoal} halaman per hari
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] px-3 py-1.5 rounded-full font-semibold ${
                        targetLocked
                          ? darkMode
                            ? "bg-emerald-900/50 text-emerald-200 border border-emerald-700"
                            : "bg-emerald-100 text-emerald-700 border border-emerald-200"
                          : darkMode
                          ? "bg-slate-700 text-emerald-200 border border-slate-600"
                          : "bg-slate-100 text-slate-600 border border-slate-200"
                      }`}
                    >
                      {targetLocked ? "🎯 Target Aktif" : "✏️ Belum Disimpan"}
                    </span>
                    {targetLocked && (
                      <button
                        type="button"
                        onClick={() => setTargetLocked(false)}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition ${
                          darkMode
                            ? "border-emerald-700/70 bg-emerald-900/30 text-emerald-200 hover:bg-emerald-900/50"
                            : "border-emerald-200 bg-white/80 text-emerald-700 hover:bg-emerald-50"
                        }`}
                      >
                        Ubah
                      </button>
                    )}
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="mb-4">
                  <div className="flex justify-between items-end mb-2">
                    <div>
                      <span className={`text-2xl font-bold ${darkMode ? "text-emerald-100" : "text-emerald-900"}`}>
                        {todayPages}
                      </span>
                      <span className={`text-sm ${darkMode ? "text-emerald-300/60" : "text-emerald-700/60"}`}>
                        / {dailyGoal} halaman
                      </span>
                    </div>
                    <span className={`text-sm font-bold ${dailyGoalReached ? "text-amber-600" : darkMode ? "text-emerald-300" : "text-emerald-700"}`}>
                      {Math.round(goalPct)}%
                    </span>
                  </div>
                  <div className={`h-3 rounded-full overflow-hidden ${darkMode ? "bg-slate-700" : "bg-emerald-900/10"}`}>
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${
                        dailyGoalReached 
                          ? "bg-gradient-to-r from-amber-400 to-yellow-500" 
                          : "bg-gradient-to-r from-lime-400 to-emerald-600"
                      }`}
                      style={{ width: `${goalPct}%` }}
                    />
                  </div>
                </div>

                {/* Input Target */}
                {!targetLocked && (
                  <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
                    <div className="flex-1 w-full">
                      <label className={`text-xs mb-1 block ${darkMode ? "text-emerald-300/70" : "text-emerald-700/70"}`}>
                        Target halaman per hari (1-50)
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          min={1}
                          max={50}
                          value={goalDraft}
                          onChange={(e) => setGoalDraft(e.target.value)}
                          className={`flex-1 p-2.5 text-sm border rounded-xl outline-none focus:ring-2 transition ${theme.input}`}
                        />
                        <button
                          onClick={saveDailyGoal}
                          className="px-5 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 active:scale-[0.98] transition shadow-md shadow-emerald-600/20"
                        >
                          Simpan
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Warning */}
                {!dailyGoalReached && yesterdayGoalMissed && (
                  <div className="mt-4 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
                    <div className="text-sm text-orange-800">
                      <span className="font-semibold">Target kemarin belum selesai!</span> Kamu membaca {yesterdayPages} dari {dailyGoal} halaman. Ayo baca lagi hari ini!
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Rekomendasi Buku */}
            {favoriteBookInfo && recommendedBooks.length > 0 && (
              <div className="relative overflow-hidden rounded-3xl bg-white/40 backdrop-blur-md border border-white/60 shadow-[0_8px_30px_-12px_rgba(6,95,70,0.15)] p-4 sm:p-6">
                <div className="absolute -right-20 -bottom-20 w-64 h-64 bg-amber-200/20 rounded-full blur-3xl pointer-events-none" />
                
                <div className="relative">
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      darkMode ? "bg-amber-900/50 text-amber-300" : "bg-amber-100 text-amber-600"
                    }`}>
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className={`text-base font-bold ${darkMode ? "text-emerald-100" : "text-emerald-900"}`}>
                        Rekomendasi Buku Untukmu
                      </h3>
                      <p className={`text-xs ${darkMode ? "text-emerald-300/60" : "text-emerald-700/60"}`}>
                        Karena kamu sering baca: <span className="font-semibold">{favoriteBookInfo.label}</span>
                      </p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {recommendedBooks.map((book) => (
                      <div
                        key={book.title}
                        className={`group p-4 rounded-2xl border transition-all duration-300 hover:-translate-y-1 hover:shadow-md ${
                          darkMode 
                            ? "border-slate-700 bg-slate-700/40 hover:bg-slate-700/60" 
                            : "border-emerald-100 bg-emerald-50/50 hover:bg-emerald-100/50"
                        }`}
                      >
                        <BookOpen className={`w-5 h-5 mb-2 ${darkMode ? "text-emerald-300" : "text-emerald-600"}`} />
                        <p className={`text-sm font-semibold leading-snug ${darkMode ? "text-emerald-100" : "text-emerald-900"}`}>
                          {book.title}
                        </p>
                        <p className={`text-xs mt-1 ${darkMode ? "text-emerald-300/60" : "text-emerald-700/60"}`}>
                          {book.author}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Grafik Progres */}
            <MyProgressChart journals={journals} dark={darkMode} />

            {/* Jurnal Terbaru - Enhanced List */}
            <div className="relative overflow-hidden rounded-3xl bg-white/40 backdrop-blur-md border border-white/60 shadow-[0_8px_30px_-12px_rgba(6,95,70,0.15)]">
              <div className="p-4 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className={`text-base font-bold ${darkMode ? "text-emerald-100" : "text-emerald-900"}`}>
                    Jurnal Terbaru
                  </h3>
                  <button
                    onClick={() => setActiveTab("riwayat")}
                    className={`text-xs font-semibold flex items-center gap-1 ${
                      darkMode ? "text-emerald-300 hover:text-emerald-200" : "text-emerald-600 hover:text-emerald-700"
                    }`}
                  >
                    Lihat Semua
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
                
                {journals.length === 0 ? (
                  <div className={`text-center py-8 rounded-2xl border-2 border-dashed ${
                    darkMode ? "border-slate-700 bg-slate-800/30" : "border-emerald-200 bg-emerald-50/30"
                  }`}>
                    <NotebookPen className={`w-10 h-10 mx-auto mb-3 ${darkMode ? "text-slate-600" : "text-emerald-300"}`} />
                    <p className={`text-sm ${darkMode ? "text-emerald-300/70" : "text-emerald-700/60"}`}>
                      Belum ada jurnal. Yuk mulai isi jurnal pertamamu!
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
                    {journals.slice(0, 3).map((j, idx) => (
                      <div 
                        key={j.id} 
                        className={`group flex justify-between items-center gap-3 p-4 rounded-2xl border transition-all duration-300 hover:shadow-md ${
                          darkMode 
                            ? "border-slate-700 bg-slate-700/40 hover:bg-slate-700/60" 
                            : "border-emerald-100 bg-emerald-50/50 hover:bg-emerald-100/50"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                            darkMode ? "bg-emerald-900/50 text-emerald-300" : "bg-emerald-100 text-emerald-700"
                          }`}>
                            <BookOpen className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                            <p className={`text-sm font-semibold truncate ${darkMode ? "text-emerald-100" : "text-emerald-900"}`}>
                              {j.bookTitle}
                            </p>
                            <p className={`text-xs ${darkMode ? "text-emerald-300/60" : "text-emerald-700/60"}`}>
                              {formatTanggal(toDateSafe(j.createdAt))}
                            </p>
                          </div>
                        </div>
                        <span className={`text-xs px-2.5 py-1 rounded-full font-medium shrink-0 ${
                          normalizeStatus(j.status) === "approved"
                            ? "bg-emerald-100 text-emerald-700"
                            : normalizeStatus(j.status) === "revision"
                            ? "bg-orange-100 text-orange-700"
                            : "bg-yellow-100 text-yellow-700"
                        }`}>
                          {normalizeStatus(j.status) === "approved" ? "Tervalidasi" :
                           normalizeStatus(j.status) === "revision" ? "Revisi" : "Menunggu"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ---- Tab: Badge Saya ---- */}
        {activeTab === "badge" && (
          <div
            className={`relative overflow-hidden rounded-3xl shadow-xl border transition-all duration-300 ${
              darkMode
                ? "bg-slate-800/80 border-slate-700 shadow-black/20"
                : "bg-white/90 backdrop-blur-sm shadow-emerald-900/[0.06] border-white"
            }`}
          >
            <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-3xl">
              <div
                className={`absolute -top-20 -right-20 w-64 h-64 rounded-full blur-3xl opacity-20 ${
                  darkMode ? "bg-amber-500" : "bg-amber-300"
                }`}
              />
              <div
                className={`absolute -bottom-20 -left-20 w-64 h-64 rounded-full blur-3xl opacity-20 ${
                  darkMode ? "bg-emerald-500" : "bg-emerald-300"
                }`}
              />
            </div>

            <div className="relative p-4 sm:p-6 lg:p-8 space-y-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div
                    className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg ${
                      darkMode
                        ? "bg-gradient-to-br from-amber-900 to-amber-800 text-amber-300 shadow-amber-900/50"
                        : "bg-gradient-to-br from-amber-100 to-amber-50 text-amber-700 shadow-amber-200/50"
                    }`}
                  >
                    <Award className="w-7 h-7" />
                  </div>
                  <div>
                    <h2 className={`text-2xl font-bold tracking-tight ${darkMode ? "text-emerald-100" : "text-emerald-900"}`}>
                      Badge Saya
                    </h2>
                    <p className={`text-sm ${darkMode ? "text-emerald-300/70" : "text-emerald-700/70"}`}>
                      Kumpulkan pencapaian dari kebiasaan membaca
                    </p>
                  </div>
                </div>

                <div
                  className={`shrink-0 px-5 py-3 rounded-2xl border text-center ${
                    darkMode ? "bg-slate-700/50 border-slate-600" : "bg-emerald-50 border-emerald-200"
                  }`}
                >
                  <p className={`text-2xl font-bold ${darkMode ? "text-emerald-100" : "text-emerald-900"}`}>
                    {earnedCount}/{totalCount}
                  </p>
                  <p
                    className={`text-[10px] uppercase tracking-wider font-semibold ${
                      darkMode ? "text-emerald-400" : "text-emerald-600"
                    }`}
                  >
                    Badge Didapat
                  </p>
                </div>
              </div>

              <div
                className={`rounded-2xl border p-4 ${
                  darkMode
                    ? "bg-gradient-to-r from-emerald-900/30 to-teal-900/20 border-emerald-500/20"
                    : "bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-200/60"
                }`}
              >
                <div className="flex items-start gap-3">
                  <CalendarDays className={`w-5 h-5 shrink-0 mt-0.5 ${darkMode ? "text-emerald-400" : "text-emerald-600"}`} />
                  <div className="text-xs sm:text-sm">
                    <p className={`font-semibold ${darkMode ? "text-emerald-200" : "text-emerald-800"}`}>
                      Sistem Update Badge
                    </p>
                    <p className={`mt-1 ${darkMode ? "text-emerald-300/70" : "text-emerald-700/70"}`}>
                      Badge Jumlah Buku, Halaman &amp; Eksplorasi diperbarui tiap Senin 08.00 WIB. Badge Konsistensi
                      (streak) update real-time setiap hari.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-xs sm:text-sm">
                  <span className={`font-medium ${darkMode ? "text-emerald-300" : "text-emerald-700"}`}>
                    Progress Total
                  </span>
                  <span className={`font-bold ${darkMode ? "text-emerald-100" : "text-emerald-900"}`}>
                    {Math.round((earnedCount / totalCount) * 100)}%
                  </span>
                </div>
                <div className={`h-3 rounded-full overflow-hidden ${darkMode ? "bg-slate-700" : "bg-emerald-900/10"}`}>
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-400 via-orange-500 to-emerald-600 transition-all duration-1000 shadow-sm"
                    style={{ width: `${totalCount > 0 ? (earnedCount / totalCount) * 100 : 0}%` }}
                  />
                </div>
              </div>

              {nearestBadge && (
                <div
                  className={`relative overflow-hidden rounded-2xl border-2 p-4 ${
                    darkMode
                      ? "bg-gradient-to-br from-orange-900/30 to-amber-900/20 border-orange-500/30"
                      : "bg-gradient-to-br from-orange-50 to-amber-50 border-orange-200"
                  }`}
                >
                  <div className="absolute -right-4 -top-4 w-24 h-24 bg-orange-400/20 rounded-full blur-2xl" />
                  <div className="relative flex items-center gap-4">
                    <div
                      className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                        darkMode ? "bg-orange-500/20 text-orange-300" : "bg-orange-100 text-orange-600"
                      }`}
                    >
                      <Target className="w-6 h-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-bold uppercase tracking-wider ${darkMode ? "text-orange-300" : "text-orange-600"}`}>
                        Sedikit Lagi!
                      </p>
                      <p className={`text-sm sm:text-base font-bold truncate ${darkMode ? "text-orange-100" : "text-orange-900"}`}>
                        {nearestBadge.title}
                      </p>
                      <div className="flex items-center gap-3 mt-2">
                        <div className={`flex-1 h-2 rounded-full overflow-hidden ${darkMode ? "bg-slate-700" : "bg-orange-900/10"}`}>
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-orange-400 to-amber-500 transition-all duration-700"
                            style={{ width: `${nearestBadge.percent}%` }}
                          />
                        </div>
                        <span className={`text-xs font-bold ${darkMode ? "text-orange-300" : "text-orange-700"}`}>
                          {nearestBadge.current}/{nearestBadge.target}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div
                className={`flex gap-2 border-b pb-4 overflow-x-auto ${
                  darkMode ? "border-slate-700" : "border-emerald-100"
                }`}
              >
                {([
                  ["semua", "Semua", totalCount],
                  ["terkunci", "Terkunci", totalCount - earnedCount],
                  ["didapat", "Didapat", earnedCount],
                ] as [BadgeFilter, string, number][]).map(([filter, label, count]) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setBadgeFilter(filter)}
                    className={`shrink-0 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 flex items-center gap-2 ${
                      badgeFilter === filter
                        ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/25"
                        : darkMode
                        ? "bg-slate-700 text-emerald-200 hover:bg-slate-600"
                        : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                    }`}
                  >
                    <span>{label}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                        badgeFilter === filter
                          ? "bg-white/20 text-white"
                          : darkMode
                          ? "bg-slate-600 text-slate-300"
                          : "bg-emerald-200 text-emerald-700"
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                ))}
              </div>

              {visibleBadges.length === 0 ? (
                <div
                  className={`text-center py-12 rounded-2xl border-2 border-dashed ${
                    darkMode ? "border-slate-700 bg-slate-800/30" : "border-emerald-200 bg-emerald-50/30"
                  }`}
                >
                  <Award className={`w-12 h-12 mx-auto mb-3 ${darkMode ? "text-slate-600" : "text-emerald-300"}`} />
                  <p className={`text-sm font-medium ${darkMode ? "text-emerald-300/70" : "text-emerald-700/60"}`}>
                    Tidak ada badge pada filter ini
                  </p>
                </div>
              ) : (
                <div className="space-y-8">
                  {CATEGORY_ORDER.map((category) => {
                    const list = visibleBadges.filter((b) => b.category === category);
                    if (list.length === 0) return null;
                    return (
                      <div key={category}>
                        <div className="flex items-center gap-2 mb-4">
                          <div className={`w-1 h-5 rounded-full ${darkMode ? "bg-emerald-500" : "bg-emerald-400"}`} />
                          <h4
                            className={`text-xs font-bold uppercase tracking-widest ${
                              darkMode ? "text-emerald-400" : "text-emerald-600"
                            }`}
                          >
                            {category}
                          </h4>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full ${
                              darkMode ? "bg-slate-700 text-slate-300" : "bg-emerald-100 text-emerald-600"
                            }`}
                          >
                            {list.length}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                          {list.map((badge) => (
                            <BadgeCard
                              key={`${badge.category}-${badge.title}`}
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
          </div>
        )}

        {/* ---- Tab: Pohon Literasi ---- */}
        {activeTab === "pohon" && <TreeGrowth totalPages={approvedTotalPages} dark={darkMode} />}

        {/* ---- Tab: Leaderboard ---- */}
        {activeTab === "leaderboard" && (
          <div className={`p-3 sm:p-6 lg:p-7 rounded-3xl shadow-md border backdrop-blur-sm ${theme.panel}`}>
            {/* Header Section */}
            <div className="flex flex-col gap-3 sm:gap-4 mb-4 sm:mb-6">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2.5 sm:gap-3 mb-2 sm:mb-3">
                  <div className={`w-9 h-9 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0 ${
                    darkMode 
                      ? "bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30" 
                      : "bg-gradient-to-br from-amber-100 to-orange-100 border border-amber-200"
                  }`}>
                    <Trophy className={`w-4 h-4 sm:w-6 sm:h-6 ${darkMode ? "text-amber-400" : "text-amber-600"}`} />
                  </div>
                  <div className="min-w-0">
                    <h2 className={`text-base sm:text-xl font-bold tracking-tight truncate ${theme.headingText}`}>
                      Leaderboard Penakluk Literasi
                    </h2>
                    <p className={`text-[11px] sm:text-xs mt-0.5 truncate ${theme.mutedText}`}>
                      {leaderboardSubTab === "semua" 
                        ? "Top 100 Murid Terajin Membaca" 
                        : leaderboardSubTab === "kelas" 
                        ? `Kelas ${studentClassCode || "-"}` 
                        : "Kelas terajin membaca"}
                    </p>
                  </div>
                </div>

                {/* Info Banner - Mobile Optimized */}
                <div className={`rounded-xl sm:rounded-2xl border p-2.5 sm:p-4 ${
                  darkMode 
                    ? "bg-gradient-to-r from-amber-900/20 via-orange-900/10 to-emerald-900/20 border-amber-500/20" 
                    : "bg-gradient-to-r from-amber-50 via-orange-50/50 to-emerald-50 border-amber-200/60"
                }`}>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 sm:gap-x-4 sm:gap-y-2">
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <Users className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${darkMode ? "text-amber-400" : "text-amber-600"}`} />
                      <span className={`text-xs sm:text-sm font-semibold ${theme.headingText}`}>
                        {totalActiveStudents} <span className={`font-normal ${theme.mutedText}`}>Murid Aktif</span>
                      </span>
                    </div>
                    <div className={`hidden sm:block w-px h-4 ${darkMode ? "bg-slate-600" : "bg-emerald-200"}`} />
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <CalendarDays className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${darkMode ? "text-emerald-400" : "text-emerald-600"}`} />
                      <span className={`text-[10px] sm:text-xs ${theme.mutedText}`}>
                        Update Senin 08:00
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Sub-tab Navigation - Mobile: Horizontal Scroll */}
            <div className={`mb-4 sm:mb-6 p-1 sm:p-1.5 rounded-xl sm:rounded-2xl overflow-x-auto ${
              darkMode ? "bg-slate-900/50 border border-slate-700/50" : "bg-emerald-900/5 border border-emerald-100"
            }`}>
              <div className="flex gap-1 min-w-max sm:min-w-0 sm:grid sm:grid-cols-3">
                {([
                  ["semua", "Murid Rajin", "Top 100"],
                  ["kelas", "Kelas Saya", studentClassCode || "-"],
                  ["kelas-terajin", "Kelas Rajin", "Antar kelas"]
                ] as [LeaderboardSubTab, string, string][]).map(([key, label, desc]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setLeaderboardSubTab(key)}
                    className={`flex-1 px-3 sm:px-4 py-2 sm:py-3 rounded-lg sm:rounded-xl text-center transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 min-w-[100px] sm:min-w-0 ${
                      leaderboardSubTab === key
                        ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/25"
                        : darkMode
                        ? "text-emerald-300/70 hover:bg-slate-800 hover:text-emerald-200"
                        : "text-emerald-800/70 hover:bg-white hover:text-emerald-900"
                    }`}
                  >
                    <span className="block text-xs sm:text-sm font-bold truncate">{label}</span>
                    <span className={`hidden sm:block text-[10px] sm:text-[11px] mt-0.5 truncate ${
                      leaderboardSubTab === key ? "text-emerald-100/80" : theme.mutedText
                    }`}>
                      {desc}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* My Position Card - Mobile Optimized */}
            {myLeaderboardPosition && (
              myLeaderboardPosition.isVisible ? (
                <button
                  type="button"
                  onClick={() => {
                    document.getElementById(`leaderboard-student-${user?.uid}`)?.scrollIntoView({ 
                      behavior: "smooth", 
                      block: "center" 
                    });
                  }}
                  className={`mb-4 sm:mb-6 w-full text-left rounded-xl sm:rounded-2xl border-2 p-3 sm:p-4 transition-all duration-200 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                    darkMode 
                      ? "border-emerald-500/50 bg-gradient-to-r from-emerald-900/40 to-teal-900/30 hover:border-emerald-400" 
                      : "border-emerald-300 bg-gradient-to-r from-emerald-50 to-teal-50 hover:border-emerald-400"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 sm:gap-4 min-w-0">
                      <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center shrink-0 ${
                        darkMode ? "bg-emerald-500/20 text-emerald-300" : "bg-emerald-100 text-emerald-700"
                      }`}>
                        <Trophy className="w-5 h-5 sm:w-6 sm:h-6" />
                      </div>
                      <div className="min-w-0">
                        <p className={`text-[10px] sm:text-xs font-bold uppercase tracking-wider ${darkMode ? "text-emerald-400" : "text-emerald-600"}`}>
                          Posisi Kamu
                        </p>
                        <p className={`text-base sm:text-lg font-bold truncate ${theme.headingText}`}>
                          #{myLeaderboardPosition.rank} 
                          <span className={`text-xs sm:text-sm font-normal ${theme.mutedText}`}> dari {myLeaderboardPosition.total}</span>
                        </p>
                      </div>
                    </div>
                    <ChevronRight className={`w-4 h-4 sm:w-5 sm:h-5 shrink-0 ${darkMode ? "text-emerald-400" : "text-emerald-600"}`} />
                  </div>
                </button>
              ) : (
                <div className={`mb-4 sm:mb-6 rounded-xl sm:rounded-2xl border p-3 sm:p-4 ${
                  darkMode ? "border-amber-500/30 bg-amber-900/10" : "border-amber-200 bg-amber-50"
                }`}>
                  <div className="flex items-center gap-2.5 sm:gap-3">
                    <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl flex items-center justify-center shrink-0 ${
                      darkMode ? "bg-amber-500/20 text-amber-400" : "bg-amber-100 text-amber-600"
                    }`}>
                      <Award className="w-4 h-4 sm:w-5 sm:h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className={`text-sm font-bold truncate ${theme.headingText}`}>
                        Peringkat #{myLeaderboardPosition.rank}
                      </p>
                      <p className={`text-[11px] sm:text-xs truncate ${theme.mutedText}`}>
                        Belum masuk Top 100. Terus semangat! 📚
                      </p>
                    </div>
                  </div>
                </div>
              )
            )}

            {/* Error State */}
            {leaderboardError && (
              <div className="mb-3 sm:mb-4 text-xs sm:text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg sm:rounded-xl px-3 py-2 sm:px-4 sm:py-3 flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                <span className="line-clamp-2">{leaderboardError}</span>
              </div>
            )}

            {/* Content */}
            {leaderboardLoading ? (
              <div className="space-y-2 sm:space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className={`h-16 sm:h-20 rounded-xl sm:rounded-2xl animate-pulse ${
                    darkMode ? "bg-slate-700/50" : "bg-emerald-100/50"
                  }`} />
                ))}
              </div>
            ) : leaderboardSubTab === "kelas-terajin" ? (
              /* Class Leaderboard - Mobile Optimized */
              classLeaderboardRanking.length === 0 ? (
                <div className={`text-center py-8 sm:py-12 rounded-xl sm:rounded-2xl border-2 border-dashed ${
                  darkMode ? "border-slate-700" : "border-emerald-200"
                }`}>
                  <Library className={`w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-2 sm:mb-3 ${darkMode ? "text-slate-600" : "text-emerald-300"}`} />
                  <p className={`text-xs sm:text-sm font-medium px-4 ${theme.mutedText}`}>Belum ada data kelas yang membaca buku</p>
                </div>
              ) : (
                <div className="space-y-2 sm:space-y-3">
                  {classLeaderboardRanking.map((entry, idx) => {
                    const rank = idx + 1;
                    const isMyClass = entry.classCode === studentClassCode;
                    const isTop3 = rank <= 3;
                    
                    return (
                      <div
                        key={entry.classCode}
                        className={`relative overflow-hidden rounded-xl sm:rounded-2xl border p-3 sm:p-4 transition-all duration-200 hover:shadow-md ${
                          isMyClass
                            ? darkMode
                              ? "bg-gradient-to-r from-emerald-900/50 to-teal-900/30 border-emerald-500/50 shadow-lg shadow-emerald-900/20"
                              : "bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-300 shadow-md shadow-emerald-100"
                            : darkMode
                            ? "bg-slate-800/50 border-slate-700 hover:border-slate-600"
                            : "bg-white/60 border-emerald-100 hover:border-emerald-200"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 sm:gap-4">
                          {/* Rank Badge - Smaller on mobile */}
                          <div className={`relative shrink-0 ${isTop3 ? "w-11 h-11 sm:w-14 sm:h-14" : "w-9 h-9 sm:w-12 sm:h-12"}`}>
                            {isTop3 && (
                              <div className={`absolute inset-0 rounded-xl sm:rounded-2xl blur-md sm:blur-lg opacity-30 sm:opacity-40 ${
                                rank === 1 ? "bg-yellow-400" : rank === 2 ? "bg-slate-400" : "bg-amber-500"
                              }`} />
                            )}
                            <div className={`relative w-full h-full rounded-xl sm:rounded-2xl flex flex-col items-center justify-center font-bold ${
                              rank === 1 
                                ? "bg-gradient-to-br from-yellow-300 to-amber-500 text-white shadow-md sm:shadow-lg" 
                                : rank === 2 
                                ? "bg-gradient-to-br from-slate-300 to-slate-500 text-white shadow-md sm:shadow-lg"
                                : rank === 3
                                ? "bg-gradient-to-br from-amber-400 to-orange-600 text-white shadow-md sm:shadow-lg"
                                : darkMode ? "bg-slate-700 text-slate-300" : "bg-emerald-100 text-emerald-700"
                            }`}>
                              {isTop3 ? (
                                <>
                                  <Crown className="w-3.5 h-3.5 sm:w-5 sm:h-5 mb-0.5" />
                                  <span className="text-[9px] sm:text-[10px] font-bold">{rank}</span>
                                </>
                              ) : (
                                <span className="text-sm sm:text-base sm:text-lg">{rank}</span>
                              )}
                            </div>
                          </div>

                          {/* Info - Flexible */}
                          <div className="flex-1 min-w-0 py-0.5 sm:py-1">
                            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                              <h3 className={`text-sm sm:text-base font-bold truncate ${theme.headingText}`}>
                                Kelas {entry.classCode}
                              </h3>
                              {isMyClass && (
                                <span className={`text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 rounded-full font-bold shrink-0 ${
                                  darkMode ? "bg-emerald-500/20 text-emerald-300" : "bg-emerald-100 text-emerald-700"
                                }`}>
                                  Kelasmu
                                </span>
                              )}
                            </div>
                            <p className={`text-[11px] sm:text-xs mt-0.5 sm:mt-1 ${theme.mutedText}`}>
                              {entry.activeStudents} Murid Aktif
                            </p>
                          </div>

                          {/* Stats - Stack on very small screens */}
                          <div className="text-right shrink-0 py-0.5 sm:py-1">
                            <p className={`text-base sm:text-lg font-bold ${theme.headingText}`}>
                              {entry.journalCount}
                              <span className={`text-[10px] sm:text-xs font-normal ml-0.5 sm:ml-1 ${theme.mutedText}`}>jurnal</span>
                            </p>
                            <div className={`flex items-center justify-end gap-1.5 sm:gap-3 mt-0.5 sm:mt-1 text-[10px] sm:text-[11px] ${theme.mutedText}`}>
                              <span className="whitespace-nowrap">{entry.totalPagesRead} hlm</span>
                              <span className="hidden xs:inline">•</span>
                              <span className="whitespace-nowrap">{entry.booksFinished} buku</span>
                            </div>
                          </div>
                        </div>

                        {/* Progress bar for top 3 */}
                        {isTop3 && (
                          <div className={`mt-2 sm:mt-3 h-1 sm:h-1.5 rounded-full overflow-hidden ${
                            darkMode ? "bg-slate-700" : "bg-emerald-100"
                          }`}>
                            <div 
                              className={`h-full rounded-full ${
                                rank === 1 ? "bg-gradient-to-r from-yellow-400 to-amber-500" :
                                rank === 2 ? "bg-gradient-to-r from-slate-400 to-slate-500" :
                                "bg-gradient-to-r from-amber-400 to-orange-500"
                              }`}
                              style={{ width: `${Math.min(100, (entry.journalCount / Math.max(classLeaderboardRanking[0]?.journalCount || 1, 1)) * 100)}%` }}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )
            ) : (
              /* Student Leaderboard - Mobile Optimized */
              (leaderboardSubTab === "semua" ? globalLeaderboard : classLeaderboard).length === 0 ? (
                <div className={`text-center py-8 sm:py-12 rounded-xl sm:rounded-2xl border-2 border-dashed ${
                  darkMode ? "border-slate-700" : "border-emerald-200"
                }`}>
                  <BookOpen className={`w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-2 sm:mb-3 ${darkMode ? "text-slate-600" : "text-emerald-300"}`} />
                  <p className={`text-xs sm:text-sm font-medium px-4 ${theme.mutedText}`}>
                    {leaderboardSubTab === "semua" 
                      ? "Belum ada data jurnal dari murid manapun"
                      : "Belum ada data jurnal untuk kelas ini"}
                  </p>
                </div>
              ) : (
                <div className="space-y-2 sm:space-y-3">
                  {(leaderboardSubTab === "semua" ? globalLeaderboard : classLeaderboard).map((entry, idx) => {
                    const rank = idx + 1;
                    const isMe = entry.studentId === user?.uid;
                    const isTop3 = rank <= 3;
                    
                    return (
                      <div
                        key={entry.studentId}
                        id={`leaderboard-student-${entry.studentId}`}
                        className={`relative rounded-xl sm:rounded-2xl border p-2.5 sm:p-4 transition-all duration-200 hover:shadow-md ${
                          isMe
                            ? darkMode
                              ? "bg-gradient-to-r from-emerald-900/50 to-teal-900/30 border-emerald-500/50 shadow-lg shadow-emerald-900/20"
                              : "bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-300 shadow-md shadow-emerald-100"
                            : isTop3
                            ? darkMode
                              ? "bg-slate-800/80 border-slate-700 hover:border-slate-600"
                              : "bg-white border-emerald-100 hover:border-emerald-200"
                            : darkMode
                            ? "bg-slate-800/50 border-slate-700/50 hover:border-slate-600"
                            : "bg-white/60 border-emerald-100/80 hover:border-emerald-200"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 sm:gap-4">
                          {/* Rank - Smaller on mobile */}
                          <div className={`relative shrink-0 ${isTop3 ? "w-11 h-11 sm:w-14 sm:h-14" : "w-9 h-9 sm:w-11 sm:h-11"}`}>
                            {isTop3 && (
                              <div className={`absolute inset-0 rounded-xl sm:rounded-2xl blur-md sm:blur-lg opacity-30 sm:opacity-40 ${
                                rank === 1 ? "bg-yellow-400" : rank === 2 ? "bg-slate-400" : "bg-amber-500"
                              }`} />
                            )}
                            <div className={`relative w-full h-full rounded-xl sm:rounded-2xl flex flex-col items-center justify-center font-bold ${
                              rank === 1 
                                ? "bg-gradient-to-br from-yellow-300 to-amber-500 text-white shadow-md sm:shadow-lg" 
                                : rank === 2 
                                ? "bg-gradient-to-br from-slate-300 to-slate-500 text-white shadow-md sm:shadow-lg"
                                : rank === 3
                                ? "bg-gradient-to-br from-amber-400 to-orange-600 text-white shadow-md sm:shadow-lg"
                                : darkMode ? "bg-slate-700 text-slate-300" : "bg-emerald-100 text-emerald-700"
                            }`}>
                              {isTop3 ? (
                                <>
                                  <Crown className="w-3.5 h-3.5 sm:w-5 sm:h-5 mb-0.5" />
                                  <span className="text-[9px] sm:text-[10px] font-bold">{rank}</span>
                                </>
                              ) : (
                                <span className="text-sm sm:text-base">{rank}</span>
                              )}
                            </div>
                          </div>

                          {/* Avatar & Info - Flexible */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 sm:gap-2.5">
                              {/* Avatar */}
                              <Avatar
                                gender={entry.gender}
                                name={entry.studentName}
                                className={`w-8 h-8 sm:w-10 sm:h-10 ${isMe ? "ring-2 ring-emerald-400/80" : ""}`}
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 sm:gap-2">
                                  <h3 className={`text-xs sm:text-sm font-bold truncate ${theme.headingText}`}>
                                    {entry.studentName}
                                  </h3>
                                  {isMe && (
                                    <span className={`text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 rounded-full font-bold shrink-0 ${
                                      darkMode ? "bg-emerald-500/20 text-emerald-300" : "bg-emerald-100 text-emerald-700"
                                    }`}>
                                      Kamu
                                    </span>
                                  )}
                                </div>
                                <p className={`text-[10px] sm:text-xs mt-0.5 truncate ${theme.mutedText}`}>
                                  Kelas {entry.classCode}
                                </p>
                              </div>
                            </div>
                          </div>

                          {/* Stats - Compact on mobile */}
                          <div className="text-right shrink-0">
                            <p className={`text-sm sm:text-lg font-bold ${theme.headingText}`}>
                              {entry.journalCount}
                              <span className={`text-[10px] sm:text-xs font-normal ml-0.5 sm:ml-1 ${theme.mutedText}`}>jurnal</span>
                            </p>
                            <div className={`flex items-center justify-end gap-1 sm:gap-2 mt-0.5 text-[9px] sm:text-[11px] ${theme.mutedText}`}>
                              <span className="whitespace-nowrap">{entry.totalPagesRead} hlm</span>
                              <span className="hidden xs:inline">•</span>
                              <span className="whitespace-nowrap">{entry.booksFinished} buku</span>
                            </div>
                          </div>
                        </div>

                        {/* Highlight bar for current user */}
                        {isMe && (
                          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 sm:w-1 h-8 sm:h-12 rounded-r-full bg-emerald-500" />
                        )}
                      </div>
                    );
                  })}
                </div>
              )
            )}
          </div>
        )}

        {/* ---- Tab: Isi Jurnal Membaca (Enhanced) ---- */}
        {activeTab === "jurnal" && (
          <div className={`relative overflow-hidden rounded-3xl shadow-xl border backdrop-blur-sm ${theme.panel}`}>
            {/* Decorative background elements */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-3xl">
              <div className={`absolute -top-32 -right-32 w-64 h-64 rounded-full blur-3xl opacity-20 ${darkMode ? "bg-emerald-500" : "bg-emerald-300"}`} />
              <div className={`absolute -bottom-32 -left-32 w-64 h-64 rounded-full blur-3xl opacity-20 ${darkMode ? "bg-teal-500" : "bg-teal-300"}`} />
            </div>

            <div className="relative p-4 sm:p-6 lg:p-8 space-y-6">
              {/* Header Section with Icon */}
              <div className={`flex flex-col sm:flex-row sm:items-center gap-4 pb-6 border-b border-dashed ${darkMode ? "border-slate-700" : "border-emerald-200"}`}>
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg shrink-0 ${
                  darkMode
                    ? "bg-gradient-to-br from-emerald-900 to-emerald-800 text-emerald-300 shadow-emerald-900/50"
                    : "bg-gradient-to-br from-emerald-100 to-emerald-50 text-emerald-700 shadow-emerald-200/50"
                }`}>
                  <NotebookPen className="w-7 h-7" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className={`text-xl sm:text-2xl font-bold tracking-tight ${theme.headingText}`}>
                      {editingJournalId ? "Edit & Kirim Ulang Jurnal" : "Isi Jurnal Membaca"}
                    </h2>
                    {editingJournalId && (
                      <span className={`text-[10px] px-2 py-1 rounded-full font-bold uppercase tracking-wider ${
                        darkMode ? "bg-orange-900/50 text-orange-300 border border-orange-700" : "bg-orange-100 text-orange-700 border border-orange-200"
                      }`}>
                        Mode Edit
                      </span>
                    )}
                  </div>
                  <p className={`text-sm mt-1 ${theme.bodyText}`}>
                    {editingJournalId
                      ? "Perbaiki isi jurnal ini lalu kirim ulang agar status kembali menunggu validasi guru."
                      : "Catat progres bacaanmu hari ini, lalu simpan untuk divalidasi guru."}
                  </p>
                </div>
              </div>

              {/* Feedback Alert from Teacher */}
              {editingJournalId && editingFeedback && (
                <div className={`relative overflow-hidden rounded-2xl border-2 p-4 ${
                  darkMode ? "border-orange-500/30 bg-gradient-to-br from-orange-900/20 to-orange-800/10" : "border-orange-200 bg-gradient-to-br from-orange-50 to-amber-50"
                }`}>
                  <div className="absolute -right-4 -top-4 w-24 h-24 bg-orange-400/20 rounded-full blur-2xl" />
                  <div className="relative flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      darkMode ? "bg-orange-500/20 text-orange-400" : "bg-orange-100 text-orange-600"
                    }`}>
                      <AlertTriangle className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-bold ${darkMode ? "text-orange-300" : "text-orange-800"}`}>
                        Alasan Revisi dari Guru
                      </p>
                      <p className={`text-sm mt-1 leading-relaxed ${darkMode ? "text-orange-200/80" : "text-orange-700/90"}`}>
                        {editingFeedback}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Error/Success Messages */}
              {formError && (
                <div className="flex items-center gap-3 p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 animate-in fade-in slide-in-from-top-2">
                  <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-4 h-4 text-red-600" />
                  </div>
                  <p className="text-sm font-medium">{formError}</p>
                </div>
              )}

              {successMessage && (
                <div className="flex items-center gap-3 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 animate-in fade-in slide-in-from-top-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
                    <Sparkles className="w-4 h-4 text-emerald-600" />
                  </div>
                  <p className="text-sm font-medium">{successMessage}</p>
                </div>
              )}

              {/* Form Sections */}
              <div className="space-y-6">
                {/* Section 1: Informasi Buku */}
                <div className={`rounded-2xl border ${darkMode ? "border-slate-700 bg-slate-800/40" : "border-emerald-100 bg-emerald-50/30"} overflow-hidden`}>
                  <div className={`px-4 py-3 border-b ${darkMode ? "border-slate-700 bg-slate-800/60" : "border-emerald-100 bg-emerald-50/50"}`}>
                    <div className="flex items-center gap-2">
                      <BookOpen className={`w-4 h-4 ${darkMode ? "text-emerald-400" : "text-emerald-600"}`} />
                      <h3 className={`text-sm font-bold ${darkMode ? "text-emerald-200" : "text-emerald-800"}`}>Informasi Buku</h3>
                    </div>
                  </div>
                  <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <label className={`text-xs font-semibold uppercase tracking-wider ${theme.mutedText}`}>Judul Buku *</label>
                      <input
                        type="text"
                        value={form.bookTitle}
                        onChange={(e) => setForm({ ...form, bookTitle: e.target.value })}
                        onBlur={handleBookTitleBlur}
                        placeholder="cth. Laskar Pelangi"
                        className={`w-full p-3 text-sm border rounded-xl outline-none focus:ring-2 transition-all duration-200 ${theme.input} hover:border-emerald-300 focus:scale-[1.01]`}
                      />
                      <p className={`text-[10px] ${theme.mutedText}`}>Judul buku yang sedang kamu baca</p>
                    </div>
                    <div className="space-y-1.5">
                      <label className={`text-xs font-semibold uppercase tracking-wider ${theme.mutedText}`}>Penulis *</label>
                      <input
                        type="text"
                        value={form.author}
                        onChange={(e) => setForm({ ...form, author: e.target.value })}
                        placeholder="cth. Andrea Hirata"
                        className={`w-full p-3 text-sm border rounded-xl outline-none focus:ring-2 transition-all duration-200 ${theme.input} hover:border-emerald-300 focus:scale-[1.01]`}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className={`text-xs font-semibold uppercase tracking-wider ${theme.mutedText}`}>Genre</label>
                      <input
                        type="text"
                        list="genre-options"
                        value={form.genre}
                        onChange={(e) => setForm({ ...form, genre: e.target.value })}
                        placeholder="cth. Fiksi"
                        className={`w-full p-3 text-sm border rounded-xl outline-none focus:ring-2 transition-all duration-200 ${theme.input} hover:border-emerald-300 focus:scale-[1.01]`}
                      />
                      <datalist id="genre-options">
                        {GENRE_SUGGESTIONS.map((g) => (
                          <option key={g} value={g} />
                        ))}
                      </datalist>
                    </div>
                  </div>
                </div>

                {/* Section 2: Progress Membaca */}
                <div className={`rounded-2xl border ${darkMode ? "border-slate-700 bg-slate-800/40" : "border-emerald-100 bg-emerald-50/30"} overflow-hidden`}>
                  <div className={`px-4 py-3 border-b ${darkMode ? "border-slate-700 bg-slate-800/60" : "border-emerald-100 bg-emerald-50/50"}`}>
                    <div className="flex items-center gap-2">
                      <Target className={`w-4 h-4 ${darkMode ? "text-emerald-400" : "text-emerald-600"}`} />
                      <h3 className={`text-sm font-bold ${darkMode ? "text-emerald-200" : "text-emerald-800"}`}>Progress Membaca</h3>
                    </div>
                  </div>
                  <div className="p-4 space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 items-end">
                      <div className="space-y-1.5">
                        <label className={`text-xs font-semibold uppercase tracking-wider ${theme.mutedText}`}>Hal. Awal *</label>
                        <input
                          type="number"
                          min={1}
                          value={form.startPage}
                          onChange={(e) => setForm({ ...form, startPage: e.target.value })}
                          placeholder="1"
                          className={`w-full p-3 text-sm border rounded-xl outline-none focus:ring-2 transition-all duration-200 text-center font-bold ${theme.input} hover:border-emerald-300`}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className={`text-xs font-semibold uppercase tracking-wider ${theme.mutedText}`}>Hal. Akhir *</label>
                        <input
                          type="number"
                          min={1}
                          value={form.endPage}
                          onChange={(e) => setForm({ ...form, endPage: e.target.value })}
                          placeholder="20"
                          className={`w-full p-3 text-sm border rounded-xl outline-none focus:ring-2 transition-all duration-200 text-center font-bold ${theme.input} hover:border-emerald-300`}
                        />
                      </div>
                      <div className="col-span-2 md:col-span-1 flex items-center justify-center md:justify-start pb-1">
                        {pagesReadPreview > 0 ? (
                          <div className={`px-4 py-2 rounded-xl text-sm font-bold ${
                            darkMode ? "bg-emerald-900/50 text-emerald-300 border border-emerald-700" : "bg-emerald-100 text-emerald-700 border border-emerald-200"
                          }`}>
                            📖 {pagesReadPreview} halaman dibaca
                          </div>
                        ) : (
                          <span className={`text-xs ${theme.mutedText}`}>Isi halaman untuk melihat total</span>
                        )}
                      </div>
                    </div>

                    {/* Overlap Warning */}
                    {overlapWarning && (
                      <div className="flex items-start gap-3 p-3 rounded-xl bg-orange-50 border border-orange-200 text-orange-800 text-xs animate-in fade-in">
                        <AlertTriangle className="w-4 h-4 text-orange-600 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-semibold">Perhatian: Rentang Halaman Tumpang Tindih</p>
                          <p className="mt-0.5 opacity-90">{overlapWarning}</p>
                        </div>
                      </div>
                    )}

                    {/* Finished Checkbox - Enhanced */}
                    <div className={`flex items-start gap-3 p-4 rounded-xl border-2 transition-all cursor-pointer ${
                      form.finished
                        ? darkMode ? "border-emerald-600 bg-emerald-900/30" : "border-emerald-400 bg-emerald-50"
                        : darkMode ? "border-slate-600 bg-slate-700/30 hover:border-slate-500" : "border-slate-200 bg-white hover:border-emerald-300"
                    }`}>
                      <input
                        type="checkbox"
                        checked={form.finished}
                        onChange={(e) => setForm({ ...form, finished: e.target.checked })}
                        className="w-5 h-5 accent-emerald-600 mt-0.5 cursor-pointer"
                        id="finished-checkbox"
                      />
                      <label htmlFor="finished-checkbox" className="flex-1 cursor-pointer">
                        <span className={`block text-sm font-bold ${form.finished ? (darkMode ? "text-emerald-300" : "text-emerald-800") : theme.headingText}`}>
                          Buku ini sudah selesai dibaca 🎉
                        </span>
                        <span className={`block text-xs mt-1 ${theme.mutedText}`}>
                          Centang jika kamu sudah menyelesaikan buku ini sampai halaman terakhir
                        </span>
                      </label>
                    </div>

                    {/* Duplicate Warning */}
                    {duplicateFinishedWarning && (
                      <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs animate-in fade-in">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <p>{duplicateFinishedWarning}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Section 3: Ringkasan */}
                <div className={`rounded-2xl border ${darkMode ? "border-slate-700 bg-slate-800/40" : "border-emerald-100 bg-emerald-50/30"} overflow-hidden`}>
                  <div className={`px-4 py-3 border-b ${darkMode ? "border-slate-700 bg-slate-800/60" : "border-emerald-100 bg-emerald-50/50"}`}>
                    <div className="flex items-center gap-2">
                      <NotebookPen className={`w-4 h-4 ${darkMode ? "text-emerald-400" : "text-emerald-600"}`} />
                      <h3 className={`text-sm font-bold ${darkMode ? "text-emerald-200" : "text-emerald-800"}`}>Ringkasan Bacaan *</h3>
                    </div>
                  </div>
                  <div className="p-4">
                    <textarea
                      value={form.summary}
                      onChange={(e) => setForm({ ...form, summary: e.target.value })}
                      placeholder="Ceritakan apa yang kamu baca hari ini. Apa bagian yang paling menarik? Apa yang kamu pelajari dari buku ini?"
                      rows={5}
                      className={`w-full p-4 text-sm border rounded-xl outline-none focus:ring-2 transition resize-y min-h-[120px] leading-relaxed ${theme.input} hover:border-emerald-300`}
                    />
                    <div className="flex justify-between items-center mt-2">
                      <p className={`text-[10px] ${theme.mutedText}`}>Minimal 1 kalimat tentang isi buku</p>
                      {form.summary.length > 0 && (
                        <span className={`text-[10px] font-medium ${form.summary.length < 10 ? "text-orange-500" : "text-emerald-600"}`}>
                          {form.summary.length} karakter
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Section 4: Nilai Karakter */}
                <div className={`rounded-2xl border ${darkMode ? "border-slate-700 bg-slate-800/40" : "border-emerald-100 bg-emerald-50/30"} overflow-hidden`}>
                  <div className={`px-4 py-3 border-b ${darkMode ? "border-slate-700 bg-slate-800/60" : "border-emerald-100 bg-emerald-50/50"}`}>
                    <div className="flex items-center gap-2">
                      <Heart className={`w-4 h-4 ${darkMode ? "text-emerald-400" : "text-emerald-600"}`} />
                      <h3 className={`text-sm font-bold ${darkMode ? "text-emerald-200" : "text-emerald-800"}`}>Nilai Karakter yang Ditemukan</h3>
                    </div>
                    <p className={`text-xs mt-1 ${theme.mutedText}`}>Pilih nilai karakter yang kamu temukan dalam bacaan ini (bisa pilih lebih dari satu)</p>
                  </div>
                  <div className="p-4 space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                      {CHARACTER_OPTIONS.map((c) => {
                        const isSelected = selectedCharacters.has(c);
                        return (
                          <button
                            key={c}
                            type="button"
                            onClick={() => toggleCharacter(c)}
                            className={`relative p-3 rounded-xl border-2 text-sm font-medium transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] ${
                              isSelected
                                ? darkMode
                                  ? "bg-emerald-900/50 border-emerald-600 text-emerald-100 shadow-md shadow-emerald-900/20"
                                  : "bg-emerald-100 border-emerald-400 text-emerald-900 shadow-md shadow-emerald-100"
                                : darkMode
                                ? "bg-slate-700/30 border-slate-600 text-emerald-300/70 hover:bg-slate-700/50 hover:border-slate-500"
                                : "bg-white border-slate-200 text-emerald-700/70 hover:bg-emerald-50 hover:border-emerald-300"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                                isSelected
                                  ? "bg-emerald-500 border-emerald-500"
                                  : darkMode ? "border-slate-500" : "border-slate-300"
                              }`}>
                                {isSelected && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>}
                              </div>
                              <span className="truncate">{c}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    <div className={`p-4 rounded-xl border-2 border-dashed ${darkMode ? "border-slate-600 bg-slate-700/20" : "border-emerald-200 bg-emerald-50/50"}`}>
                      <label className={`block text-xs font-semibold mb-2 ${darkMode ? "text-emerald-300" : "text-emerald-700"}`}>
                        ✨ Nilai karakter lainnya (opsional)
                      </label>
                      <textarea
                        value={customCharacter}
                        onChange={(e) => setCustomCharacter(e.target.value)}
                        placeholder="Tuliskan nilai karakter lain yang kamu temukan..."
                        rows={2}
                        className={`w-full p-3 text-sm border rounded-xl outline-none focus:ring-2 transition resize-none ${theme.input}`}
                      />
                    </div>
                  </div>
                </div>

                {/* Draft Indicator */}
                {!editingJournalId && (form.bookTitle || form.author || form.summary) && (
                  <div className={`flex items-center gap-2 text-xs ${theme.mutedText} animate-pulse`}>
                    <div className={`w-2 h-2 rounded-full ${darkMode ? "bg-emerald-400" : "bg-emerald-500"}`} />
                    <span>Draf disimpan otomatis di perangkat ini</span>
                  </div>
                )}

                {/* Action Buttons */}
                <div className={`flex flex-col-reverse sm:flex-row gap-3 pt-4 border-t ${darkMode ? "border-slate-700" : "border-emerald-100"}`}>
                  {editingJournalId ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingJournalId(null);
                          setEditingFeedback("");
                          setForm(EMPTY_FORM);
                          setSelectedCharacters(new Set());
                          setCustomCharacter("");
                          setFormError("");
                        }}
                        className={`flex-1 sm:flex-none px-6 py-3 border-2 text-sm font-bold rounded-xl transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] ${
                          darkMode
                            ? "border-slate-600 text-emerald-200 bg-slate-800 hover:bg-slate-700"
                            : "border-emerald-200 text-emerald-700 bg-white hover:bg-emerald-50"
                        }`}
                      >
                        Batal Edit
                      </button>
                      <button
                        onClick={handleSaveJournal}
                        disabled={saving}
                        className="flex-[2] sm:flex-none px-8 py-3 bg-gradient-to-r from-emerald-600 to-emerald-700 text-white text-sm font-bold rounded-xl shadow-lg shadow-emerald-600/25 hover:from-emerald-700 hover:to-emerald-800 active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center gap-2"
                      >
                        {saving ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            Menyimpan...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4" />
                            Edit & Kirim Ulang
                          </>
                        )}
                      </button>
                    </>
                  ) : (
                    <>
                      {(form.bookTitle || form.author || form.genre || form.startPage || form.endPage || form.summary || selectedCharacters.size > 0 || customCharacter) && (
                        <button
                          type="button"
                          onClick={handleClearForm}
                          className={`flex-1 sm:flex-none px-6 py-3 border-2 text-sm font-bold rounded-xl transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] ${
                            darkMode
                              ? "border-slate-600 text-red-300 bg-slate-800 hover:bg-slate-700"
                              : "border-red-200 text-red-600 bg-white hover:bg-red-50"
                          }`}
                        >
                          Bersihkan Form
                        </button>
                      )}
                      <button
                        onClick={handleSaveJournal}
                        disabled={saving}
                        className="flex-[2] sm:flex-none px-8 py-3 bg-gradient-to-r from-emerald-600 to-emerald-700 text-white text-sm font-bold rounded-xl shadow-lg shadow-emerald-600/25 hover:from-emerald-700 hover:to-emerald-800 active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center gap-2"
                      >
                        {saving ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            Menyimpan...
                          </>
                        ) : (
                          <>
                            <Save className="w-4 h-4" />
                            Simpan Jurnal
                          </>
                        )}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ---- Tab: Riwayat Jurnal ---- */}
        {activeTab === "riwayat" && (
          <div className={`p-4 sm:p-6 lg:p-7 rounded-3xl shadow-md border backdrop-blur-sm ${theme.panel}`}>
            {successMessage && (
              <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 mb-4">
                {successMessage}
              </p>
            )}

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
              <div className="space-y-4 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0 lg:items-start">
                {filteredRiwayat.map((j) => {
                  const statusBadge = getStatusBadge(j.status);
                  const journalStatus = normalizeStatus(j.status);
                  const teacherFeedback = j.teacherFeedback?.trim();
                  const showTeacherFeedback = (journalStatus === "revision" || journalStatus === "approved") && Boolean(teacherFeedback);
                  const teacherFeedbackLabel = journalStatus === "revision" ? "Alasan revisi" : "Feedback validasi";
                  const canDelete = normalizeStatus(j.status) !== "approved";
                  const isExpanded = expandedJournalId === j.id;

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

                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <p className={`text-xs ${theme.mutedText}`}>
                          {j.genre ? `${j.genre} · ` : ""}Hal. {j.startPage}-{j.endPage}
                          {j.finished ? " · Selesai dibaca" : ""}
                        </p>
                        <button
                          type="button"
                          onClick={() => setExpandedJournalId(isExpanded ? null : j.id)}
                          className="self-start text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 underline-offset-2 hover:underline"
                        >
                          {isExpanded ? "Sembunyikan detail" : "Lihat detail jurnal"}
                        </button>
                      </div>

                      {isExpanded && (
                        <div className={`mt-3 rounded-2xl border p-3 sm:p-4 ${darkMode ? "border-slate-600 bg-slate-800/40" : "border-emerald-100 bg-white/60"}`}>
                          <div className="mb-2 flex items-center gap-2">
                            <span className={`inline-flex h-2 w-2 rounded-full ${normalizeStatus(j.status) === "approved" ? "bg-emerald-500" : normalizeStatus(j.status) === "revision" ? "bg-orange-500" : "bg-amber-500"}`} />
                            <p className={`text-xs font-semibold ${theme.headingText}`}>Detail jurnal</p>
                          </div>

                          <div className={`grid grid-cols-1 gap-2 text-[11px] sm:grid-cols-2 ${theme.mutedText}`}>
                            <div className="rounded-xl border border-emerald-100 bg-white/60 px-2.5 py-2 leading-tight">
                              <span className="block font-semibold text-emerald-700/80 mb-0.5">Upload jurnal</span>
                              <span className="break-words">{formatTanggal(toDateSafe(j.createdAt))}</span>
                            </div>
                            <div className="rounded-xl border border-emerald-100 bg-white/60 px-2.5 py-2 leading-tight">
                              <span className="block font-semibold text-emerald-700/80 mb-0.5">Perubahan terakhir</span>
                              <span className="break-words">{formatTanggal(toDateSafe(j.updatedAt || j.createdAt))}</span>
                            </div>
                            <div className="rounded-xl border border-emerald-100 bg-white/60 px-2.5 py-2 leading-tight">
                              <span className="block font-semibold text-emerald-700/80 mb-0.5">Guru validator</span>
                              <span className="break-words">{j.approvedBy || "Belum divalidasi"}</span>
                            </div>
                            <div className="rounded-xl border border-emerald-100 bg-white/60 px-2.5 py-2 leading-tight">
                              <span className="block font-semibold text-emerald-700/80 mb-0.5">Nilai karakter</span>
                              <span className="break-words">{j.characterValues && j.characterValues.length > 0 ? j.characterValues.join(", ") : "-"}</span>
                            </div>
                          </div>

                          <p className={`text-sm italic mt-3 mb-2 ${darkMode ? "text-emerald-200/80" : "text-emerald-800/80"}`}>&quot;{j.summary}&quot;</p>

                          {!showTeacherFeedback && journalStatus === "approved" && (
                            <p className={`text-[11px] mt-2 ${darkMode ? "text-emerald-300" : "text-emerald-700"}`}>
                              Jurnal sudah divalidasi guru dan tidak ada revisi.
                            </p>
                          )}
                          {showTeacherFeedback && (
                            <div className={`mt-2 rounded-xl border p-2.5 text-xs ${journalStatus === "revision" ? "border-orange-200 bg-orange-50 text-orange-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
                              <strong className={`block mb-0.5 ${journalStatus === "revision" ? "text-orange-900" : "text-emerald-900"}`}>{teacherFeedbackLabel}:</strong>
                              <span>{teacherFeedback}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {!isExpanded && j.characterValues && j.characterValues.length > 0 && (
                        <p className={`text-xs mt-3 ${theme.mutedText}`}>Nilai karakter: {j.characterValues.join(", ")}</p>
                      )}

                      {!isExpanded && !showTeacherFeedback && journalStatus === "approved" && (
                        <p className={`text-[11px] mt-2 ${darkMode ? "text-emerald-300" : "text-emerald-700"}`}>
                          Jurnal sudah divalidasi guru dan tidak ada revisi.
                        </p>
                      )}
                      {!isExpanded && showTeacherFeedback && (
                        <div className={`mt-2 rounded-xl border p-2.5 text-xs ${journalStatus === "revision" ? "border-orange-200 bg-orange-50 text-orange-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
                          <strong className={`block mb-0.5 ${journalStatus === "revision" ? "text-orange-900" : "text-emerald-900"}`}>{teacherFeedbackLabel}:</strong>
                          <span>{teacherFeedback}</span>
                        </div>
                      )}

                      <div className="mt-3 flex flex-wrap justify-end gap-2">
                        {j.status === "revision" && (
                          <button
                            type="button"
                            onClick={() => startEditJournal(j)}
                            className="flex-1 sm:flex-none px-3 py-2 bg-orange-500 text-white text-xs font-semibold rounded-xl hover:bg-orange-600 active:scale-[0.98] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
                          >
                            Edit &amp; Kirim Ulang
                          </button>
                        )}
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

          </div>
        )}

        {/* Credit di bagian bawah dashboard */}
        <p className={`text-center text-xs font-medium tracking-wide mt-8 mb-2 ${darkMode ? "text-emerald-400/40" : "text-emerald-700/50"}`}>
          © PPG Bahasa Indonesia UNJ 2026
        </p>
      </div>

      {showScrollTop && (
        <button
          type="button"
          onClick={handleScrollToTop}
          aria-label="Kembali ke atas"
          title="Kembali ke atas"
          className={`fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-40 flex h-12 w-12 touch-manipulation select-none items-center justify-center rounded-2xl border shadow-lg transition duration-200 hover:-translate-y-0.5 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 motion-reduce:transition-none sm:bottom-7 sm:right-7 sm:h-11 sm:w-11 sm:rounded-full ${
            darkMode
              ? "border-emerald-700 bg-slate-800 text-emerald-300 shadow-black/30 hover:bg-slate-700"
              : "border-emerald-200 bg-white text-emerald-700 shadow-emerald-900/15 hover:bg-emerald-50"
          }`}
        >
          <ArrowUp className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}