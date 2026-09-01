"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Image from "next/image";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import { useRouter } from "next/navigation";
import {
  LogOut,
  Users,
  BookOpen,
  CheckCircle2,
  Clock,
  TrendingUp,
  Library,
  AlertTriangle,
  Download,
  Printer,
  X,
  Search,
  CalendarCheck,
  Pencil,
  Trash2,
  Flower2,
  Heart,
  Sparkles,
  Star,
  Sun,
  Crown,
  Undo2,
  LayoutGrid,
  Trophy,
  HeartHandshake,
  NotebookText,
  FileBarChart2,
  Settings2,
  ChevronRight,
  Mail,
  CheckSquare2,
  Square,
} from "lucide-react";

/**
 * Status jurnal sekarang ada 3 kemungkinan:
 * - "pending"   : baru dikirim, menunggu guru
 * - "revision"  : guru menandai perlu revisi (butuh alasan di teacherFeedback)
 * - "approved"  : sudah divalidasi guru
 *
 * Data lama yang hanya punya "approved" / string lain akan otomatis
 * dianggap "pending" oleh getStatusInfo() di bawah, jadi aman untuk data
 * existing di Firestore.
 */
type JournalStatus = "pending" | "revision" | "approved";

interface ProgressEntry {
  id: string;
  startPage: number;
  endPage: number;
  summary: string;
  timestamp: Date | string | number | { toDate?: () => Date } | null;
}

interface Journal {
  id: string;
  studentId?: string;
  studentName: string;
  bookTitle: string;
  author: string;
  startPage: number;
  endPage: number;
  characterValue?: string;
  characterValues?: string[];
  genre?: string;
  summary: string;
  status: string;
  teacherFeedback?: string;
  approvedBy?: string;
  progressLog?: ProgressEntry[];
  classCode: string;
  finished?: boolean;
  createdAt?: Date | string | number | { toDate?: () => Date } | null;
  updatedAt?: Date | string | number | { toDate?: () => Date } | null;
}

interface StudentSummary {
  name: string;
  classCode: string;
  gender?: "laki-laki" | "perempuan" | "";
  totalJournals: number;
  approvedCount: number;
  pendingCount: number;
  revisionCount: number;
  totalPagesRead: number;
  booksFinished: number;
  lastSubmission: Date | null;
  journals: Journal[];
}

interface FlaggedStudent extends StudentSummary {
  reasons: string[];
}

interface ClassSummary {
  classCode: string;
  totalStudents: number;
  activeStudents: number;
  totalJournals: number;
  approvedCount: number;
  pendingCount: number;
  revisionCount: number;
  totalPagesRead: number;
  booksFinished: number;
}

interface RosterStudent {
  uid: string;
  email: string;
  name: string;
  classCode: string;
  gender?: "laki-laki" | "perempuan" | "";
}

interface LeaderboardEntry {
  studentId: string;
  studentName: string;
  classCode: string;
  journalCount: number;
  booksFinished: number;
}

type TabKey = "ringkasan" | "leaderboard" | "pendampingan" | "jurnal" | "laporan" | "kelola";
type ReportView = "kelas" | "siswa";
type ReportPeriod = "all" | "month";
type LeaderboardSubTab = "semua" | "kelas";

function getCurrentMonthInput(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

const INACTIVITY_DAYS = 7;
const LOW_ACTIVITY_RATIO = 0.5;
const PENDING_BACKLOG_THRESHOLD = 3;

function toDateSafe(value: Date | string | number | { toDate?: () => Date } | null | undefined): Date | null {
  if (value == null) return null;
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

function formatGender(g?: string): string {
  if (g === "laki-laki") return "Laki-laki";
  if (g === "perempuan") return "Perempuan";
  return "-";
}

function getStartOfMonth(date: Date): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  start.setHours(0, 0, 0, 0);
  return start;
}

function getCharacterList(j: Journal): string[] {
  if (j.characterValues && j.characterValues.length > 0) return j.characterValues;
  if (j.characterValue) return [j.characterValue];
  return [];
}

/**
 * Satu sumber kebenaran untuk label & warna status jurnal, dipakai di semua
 * tempat (daftar jurnal, modal detail, laporan, CSV) supaya konsisten.
 * Status apa pun selain "revision"/"approved" dianggap "pending" — ini juga
 * membuat data lama (yang belum punya field status "revision") tetap aman.
 */
function getStatusInfo(status: string): {
  key: JournalStatus;
  badge: string; // label pendek untuk badge di kartu jurnal
  csv: string; // label untuk laporan / CSV / modal
  badgeClass: string;
  dotClass: string;
} {
  if (status === "approved") {
    return {
      key: "approved",
      badge: "Sudah Divalidasi",
      csv: "Tervalidasi",
      badgeClass: "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200",
      dotClass: "bg-emerald-500",
    };
  }
  if (status === "revision") {
    return {
      key: "revision",
      badge: "Perlu Revisi",
      csv: "Perlu Revisi",
      badgeClass: "bg-orange-100 text-orange-700 ring-1 ring-orange-200",
      dotClass: "bg-orange-500",
    };
  }
  return {
    key: "pending",
    badge: "Belum Divalidasi",
    csv: "Menunggu",
    badgeClass: "bg-yellow-100 text-yellow-700 ring-1 ring-yellow-200",
    dotClass: "bg-yellow-500",
  };
}

/* ------------------------------------------------------------------ */
/* Helper murni (bukan hook) untuk memfilter & meringkas jurnal.       */
/* ------------------------------------------------------------------ */

function filterJournalsByPeriod(
  journalsInput: Journal[],
  period: ReportPeriod,
  month: string
): Journal[] {
  if (period === "all") return journalsInput;
  if (!month) return journalsInput;
  return journalsInput.filter((j) => {
    const d = toDateSafe(j.createdAt);
    if (!d) return false;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return key === month;
  });
}

function buildStudentSummaries(journalsInput: Journal[], allStudents: RosterStudent[]): StudentSummary[] {
  const map = new Map<string, StudentSummary>();

  const genderByName = new Map<string, string>();
  allStudents.forEach((stu) => {
    if (stu.gender) genderByName.set(stu.name, stu.gender);
  });

  journalsInput.forEach((j) => {
    const key = j.studentName || "Tanpa Nama";
    if (!map.has(key)) {
      map.set(key, {
        name: key,
        classCode: j.classCode || "-",
        gender: (genderByName.get(key) as StudentSummary["gender"]) || "",
        totalJournals: 0,
        approvedCount: 0,
        pendingCount: 0,
        revisionCount: 0,
        totalPagesRead: 0,
        booksFinished: 0,
        lastSubmission: null,
        journals: [],
      });
    }
    const s = map.get(key)!;
    s.totalJournals += 1;
    const status = getStatusInfo(j.status).key;
    if (status === "approved") s.approvedCount += 1;
    else if (status === "revision") s.revisionCount += 1;
    else s.pendingCount += 1;
    const pages = Number(j.endPage) - Number(j.startPage);
    if (!Number.isNaN(pages) && pages > 0) s.totalPagesRead += pages;
    if (j.finished) s.booksFinished += 1;
    const d = toDateSafe(j.createdAt);
    if (d && (!s.lastSubmission || d > s.lastSubmission)) s.lastSubmission = d;
    s.journals.push(j);
  });

  map.forEach((s) => {
    const titles = new Set<string>();
    s.journals.forEach((j) => {
      if (j.finished && j.bookTitle) titles.add(j.bookTitle.trim().toLowerCase());
    });
    s.booksFinished = titles.size;
  });

  allStudents.forEach((stu) => {
    if (!map.has(stu.name)) {
      map.set(stu.name, {
        name: stu.name,
        classCode: stu.classCode,
        gender: stu.gender || "",
        totalJournals: 0,
        approvedCount: 0,
        pendingCount: 0,
        revisionCount: 0,
        totalPagesRead: 0,
        booksFinished: 0,
        lastSubmission: null,
        journals: [],
      });
    } else {
      const existing = map.get(stu.name)!;
      if (!existing.gender && stu.gender) {
        existing.gender = stu.gender;
      }
    }
  });

  return Array.from(map.values()).sort((a, b) => b.totalJournals - a.totalJournals);
}

function buildClassSummaries(
  journalsInPeriod: Journal[],
  allStudents: RosterStudent[],
  classFilter: string
): ClassSummary[] {
  const summaryByClass = new Map<string, ClassSummary>();
  const studentsByClass = new Map<string, Set<string>>();
  const activeStudentsByClass = new Map<string, Set<string>>();

  allStudents.forEach((student) => {
    const classCode = student.classCode || "-";
    if (!studentsByClass.has(classCode)) studentsByClass.set(classCode, new Set());
    studentsByClass.get(classCode)!.add(student.uid);
  });

  journalsInPeriod.forEach((journal) => {
    const classCode = journal.classCode || "-";
    if (!summaryByClass.has(classCode)) {
      summaryByClass.set(classCode, {
        classCode,
        totalStudents: 0,
        activeStudents: 0,
        totalJournals: 0,
        approvedCount: 0,
        pendingCount: 0,
        revisionCount: 0,
        totalPagesRead: 0,
        booksFinished: 0,
      });
    }
    const summary = summaryByClass.get(classCode)!;
    summary.totalJournals += 1;
    const status = getStatusInfo(journal.status).key;
    if (status === "approved") summary.approvedCount += 1;
    else if (status === "revision") summary.revisionCount += 1;
    else summary.pendingCount += 1;
    const pages = Number(journal.endPage) - Number(journal.startPage);
    if (!Number.isNaN(pages) && pages > 0) summary.totalPagesRead += pages;
    if (journal.studentName) {
      if (!activeStudentsByClass.has(classCode)) activeStudentsByClass.set(classCode, new Set());
      activeStudentsByClass.get(classCode)!.add(journal.studentId || journal.studentName);
    }
  });

  const finishedBooksByClass = new Map<string, Set<string>>();
  journalsInPeriod.forEach((journal) => {
    if (!journal.finished || !journal.bookTitle) return;
    const classCode = journal.classCode || "-";
    if (!finishedBooksByClass.has(classCode)) finishedBooksByClass.set(classCode, new Set());
    finishedBooksByClass.get(classCode)!.add(journal.bookTitle.trim().toLowerCase());
  });

  const classCodes = new Set([...studentsByClass.keys(), ...summaryByClass.keys()]);
  return Array.from(classCodes)
    .filter((classCode) => classFilter === "all" || classCode === classFilter)
    .map((classCode) => {
      const summary = summaryByClass.get(classCode) || {
        classCode,
        totalStudents: 0,
        activeStudents: 0,
        totalJournals: 0,
        approvedCount: 0,
        pendingCount: 0,
        revisionCount: 0,
        totalPagesRead: 0,
        booksFinished: 0,
      };
      summary.totalStudents = studentsByClass.get(classCode)?.size || 0;
      summary.activeStudents = activeStudentsByClass.get(classCode)?.size || 0;
      summary.booksFinished = finishedBooksByClass.get(classCode)?.size || 0;
      return summary;
    })
    .sort((a, b) => a.classCode.localeCompare(b.classCode));
}

/**
 * Ranking buku & nilai karakter berdasarkan JUMLAH SISWA UNIK, bukan jumlah
 * jurnal. Jika satu siswa mengirim beberapa jurnal untuk buku/nilai yang
 * sama, itu tetap dihitung 1 siswa saja — jadi angka mencerminkan "buku
 * paling sering dibaca oleh siswa" dan "nilai karakter paling sering
 * disebutkan oleh siswa", bukan sekadar jumlah entri jurnal.
 */
function getTopBooks(journalsInput: Journal[], limit = 10): [string, number][] {
  const bookStudents = new Map<string, Set<string>>();
  journalsInput.forEach((j) => {
    if (!j.bookTitle?.trim()) return;
    const title = j.bookTitle.trim();
    const student = j.studentName || "Tanpa Nama";
    if (!bookStudents.has(title)) bookStudents.set(title, new Set());
    bookStudents.get(title)!.add(student);
  });
  return Array.from(bookStudents.entries())
    .map(([title, students]) => [title, students.size] as [string, number])
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

function getTopCharacters(journalsInput: Journal[], limit = 10): [string, number][] {
  const charStudents = new Map<string, Set<string>>();
  journalsInput.forEach((j) => {
    const student = j.studentName || "Tanpa Nama";
    getCharacterList(j).forEach((c) => {
      const val = c.trim();
      if (!val) return;
      if (!charStudents.has(val)) charStudents.set(val, new Set());
      charStudents.get(val)!.add(student);
    });
  });
  return Array.from(charStudents.entries())
    .map(([val, students]) => [val, students.size] as [string, number])
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

/**
 * Header kolom untuk laporan CSV yang detail (dipakai untuk Rekapan Per Kelas
 * maupun Rekapan Per Siswa). Satu baris = satu buku/jurnal. Siswa yang belum
 * punya jurnal pada periode terpilih tetap dimasukkan sebagai satu baris agar
 * jumlah siswa pada laporan selalu sinkron dengan daftar siswa aktif di roster.
 */
const DETAILED_HEADERS = [
  "Nama Siswa",
  "Kelas",
  "Gender",
  "Jumlah Buku Selesai",
  "Total Jurnal",
  "Judul Buku",
  "Penulis",
  "Genre",
  "Halaman",
  "Nilai Karakter",
  "Status Validasi",
  "Umpan Balik / Alasan Revisi Guru",
  "Divalidasi Oleh",
  "Tanggal Upload",
  "Terakhir Diperbarui",
];

function buildDetailedRows(students: StudentSummary[]): (string | number)[][] {
  const rows: (string | number)[][] = [];

  students.forEach((s) => {
    if (s.journals.length === 0) {
      // Siswa belum pernah mengirim jurnal pada periode ini — tetap tampil
      // supaya jumlah baris siswa match dengan total siswa aktif.
      rows.push([
        s.name,
        s.classCode,
        formatGender(s.gender),
        s.booksFinished,
        s.totalJournals,
        "-",
        "-",
        "-",
        "-",
        "-",
        "-",
        "-",
        "-",
        "-",
        "-",
      ]);
      return;
    }

    s.journals
      .slice()
      .sort(
        (a, b) =>
          (toDateSafe(b.updatedAt ?? b.createdAt)?.getTime() || 0) -
          (toDateSafe(a.updatedAt ?? a.createdAt)?.getTime() || 0)
      )
      .forEach((j) => {
        rows.push([
          s.name,
          s.classCode,
          formatGender(s.gender),
          s.booksFinished,
          s.totalJournals,
          j.bookTitle,
          j.author,
          j.genre || "-",
          `${j.startPage}-${j.endPage}`,
          getCharacterList(j).join(", ") || "-",
          getStatusInfo(j.status).csv,
          j.teacherFeedback || "-",
          j.approvedBy || "-",
          formatTanggal(toDateSafe(j.createdAt)),
          formatTanggal(toDateSafe(j.updatedAt || j.createdAt)),
        ]);
      });
  });

  return rows;
}

/* ------------------------------------------------------------------ */

const STAT_COLOR_MAP: Record<
  "emerald" | "orange" | "blue" | "yellow" | "slate",
  { chip: string; ring: string; icon: string; glow: string }
> = {
  emerald: {
    chip: "bg-emerald-100 text-emerald-700",
    ring: "ring-emerald-100",
    icon: "text-emerald-600",
    glow: "from-emerald-200/50",
  },
  orange: {
    chip: "bg-orange-100 text-orange-600",
    ring: "ring-orange-100",
    icon: "text-orange-600",
    glow: "from-orange-200/50",
  },
  blue: {
    chip: "bg-blue-100 text-blue-700",
    ring: "ring-blue-100",
    icon: "text-blue-600",
    glow: "from-blue-200/50",
  },
  yellow: {
    chip: "bg-yellow-100 text-yellow-700",
    ring: "ring-yellow-100",
    icon: "text-yellow-600",
    glow: "from-yellow-200/50",
  },
  slate: {
    chip: "bg-slate-100 text-slate-600",
    ring: "ring-slate-100",
    icon: "text-slate-600",
    glow: "from-slate-200/50",
  },
};

function StatCard({
  label,
  value,
  sub,
  icon,
  color = "emerald",
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon?: React.ReactNode;
  color?: "emerald" | "orange" | "blue" | "yellow" | "slate";
}) {
  const c = STAT_COLOR_MAP[color];
  return (
    <div
      className={`group relative overflow-hidden bg-white/85 backdrop-blur-sm p-4 rounded-2xl ring-1 ${c.ring} shadow-[0_1px_2px_rgba(6,95,70,0.04),0_8px_20px_-12px_rgba(6,95,70,0.15)] transition-all hover:shadow-[0_1px_2px_rgba(6,95,70,0.04),0_14px_28px_-14px_rgba(6,95,70,0.22)] hover:-translate-y-0.5 flex flex-col gap-1.5`}
    >
      <div
        className={`pointer-events-none absolute -right-6 -top-6 w-20 h-20 rounded-full bg-gradient-to-br ${c.glow} to-transparent blur-xl`}
      />
      {icon && (
        <div className={`relative w-8 h-8 rounded-xl ${c.chip} flex items-center justify-center`}>
          {icon}
        </div>
      )}
      <span className="relative text-xl sm:text-2xl font-bold text-emerald-900 tabular-nums leading-tight">
        {value}
      </span>
      <span className="relative text-[11px] sm:text-xs font-medium text-emerald-700/70 leading-snug">
        {label}
      </span>
      {sub && <span className="relative text-[10px] sm:text-xs text-emerald-700/50">{sub}</span>}
    </div>
  );
}

/** Simple pure-SVG line chart for daily reading progress (pages) */
function DailyProgressChart({ journals }: { journals: Journal[] }) {
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

  const areaPoints = `${pad},${pad + innerH} ${points} ${w - pad},${pad + innerH}`;

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full max-w-full h-40">
        <defs>
          <linearGradient id="dailyProgressFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#059669" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#059669" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = pad + innerH - t * innerH;
          return (
            <line
              key={t}
              x1={pad}
              y1={y}
              x2={w - pad}
              y2={y}
              stroke="#d1fae5"
              strokeWidth="1"
            />
          );
        })}
        <polygon points={areaPoints} fill="url(#dailyProgressFill)" stroke="none" />
        <polyline
          fill="none"
          stroke="#059669"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          points={points}
        />
        {data.map((d, i) => {
          const x = pad + (i / Math.max(data.length - 1, 1)) * innerW;
          const y = pad + innerH - (d.pages / max) * innerH;
          return (
            <g key={d.date}>
              <circle cx={x} cy={y} r="3.5" fill="#059669" />
              {i % 2 === 0 && (
                <text
                  x={x}
                  y={h - 6}
                  textAnchor="middle"
                  className="fill-emerald-700/60"
                  fontSize="9"
                >
                  {d.date.slice(8)}
                </text>
              )}
            </g>
          );
        })}
        <text x={pad} y={14} className="fill-emerald-700/50" fontSize="10">
          Halaman / hari (14 hari terakhir)
        </text>
      </svg>
    </div>
  );
}

function CuteBackground({ mouse }: { mouse: { x: number; y: number } }) {
  const dx = (mouse.x - 0.5) * 26;
  const dy = (mouse.y - 0.5) * 26;

  const floaters: {
    Icon: typeof Flower2;
    top: string;
    left: string;
    size: number;
    depth: number;
    color: string;
    duration: string;
    delay: string;
  }[] = [
    { Icon: Flower2, top: "8%", left: "6%", size: 26, depth: 0.6, color: "text-pink-300/70", duration: "7s", delay: "0s" },
    { Icon: Heart, top: "18%", left: "88%", size: 18, depth: 1.1, color: "text-rose-300/70", duration: "6s", delay: "0.4s" },
    { Icon: Sparkles, top: "42%", left: "4%", size: 22, depth: 0.9, color: "text-amber-300/70", duration: "8s", delay: "1s" },
    { Icon: BookOpen, top: "72%", left: "91%", size: 24, depth: 0.7, color: "text-teal-300/70", duration: "9s", delay: "0.6s" },
    { Icon: Star, top: "86%", left: "9%", size: 16, depth: 1.3, color: "text-yellow-300/70", duration: "6.5s", delay: "1.4s" },
    { Icon: Flower2, top: "60%", left: "81%", size: 18, depth: 0.8, color: "text-fuchsia-300/60", duration: "7.5s", delay: "0.8s" },
    { Icon: Sun, top: "6%", left: "48%", size: 26, depth: 0.4, color: "text-orange-200/70", duration: "10s", delay: "0s" },
    { Icon: Heart, top: "93%", left: "58%", size: 14, depth: 1.2, color: "text-pink-300/60", duration: "5.5s", delay: "1.8s" },
  ];

  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden print:hidden">
      <style>{`
        @keyframes cute-float {
          0%, 100% { transform: translateY(0px) rotate(-4deg); }
          50% { transform: translateY(-14px) rotate(4deg); }
        }
        .cute-float-item { animation-name: cute-float; animation-timing-function: ease-in-out; animation-iteration-count: infinite; }
        @media (prefers-reduced-motion: reduce) {
          .cute-float-item { animation: none !important; }
        }
        @media (max-width: 640px) {
          .cute-float-item svg { opacity: 0.55; }
        }
      `}</style>

      <div
        className="absolute -top-24 -left-24 w-72 h-72 bg-pink-200/40 rounded-full blur-3xl transition-transform duration-700 ease-out"
        style={{ transform: `translate(${dx * 0.3}px, ${dy * 0.3}px)` }}
      />
      <div
        className="absolute -bottom-24 -right-24 w-72 h-72 bg-teal-200/40 rounded-full blur-3xl transition-transform duration-700 ease-out"
        style={{ transform: `translate(${-dx * 0.3}px, ${-dy * 0.3}px)` }}
      />
      <div
        className="absolute top-1/3 right-1/4 w-56 h-56 bg-amber-100/40 rounded-full blur-3xl transition-transform duration-700 ease-out"
        style={{ transform: `translate(${dx * 0.2}px, ${-dy * 0.2}px)` }}
      />

      {floaters.map(({ Icon, top, left, size, depth, color, duration, delay }, i) => (
        <div
          key={i}
          className="absolute transition-transform duration-500 ease-out hidden xs:block"
          style={{ top, left, transform: `translate(${dx * depth}px, ${dy * depth}px)` }}
        >
          <div
            className="cute-float-item"
            style={{ animationDuration: duration, animationDelay: delay }}
          >
            <Icon
              className={color}
              width={size}
              height={size}
              strokeWidth={1.5}
              fill="currentColor"
              fillOpacity={0.15}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Kartu ringkas untuk 1 baris ClassSummary — dipakai di tampilan mobile
 * sebagai pengganti tabel supaya tidak perlu scroll horizontal. */
function ClassSummaryCard({ summary }: { summary: ClassSummary }) {
  return (
    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-3.5">
      <div className="flex items-center justify-between mb-2.5">
        <span className="inline-flex items-center gap-1.5 text-sm font-bold text-emerald-900">
          <span className="w-6 h-6 rounded-lg bg-emerald-600 text-white text-xs flex items-center justify-center">
            {summary.classCode.slice(0, 2)}
          </span>
          Kelas {summary.classCode}
        </span>
        <span className="text-[11px] text-emerald-700/60">
          {summary.activeStudents}/{summary.totalStudents} aktif
        </span>
      </div>
      <div className="grid grid-cols-4 gap-2 text-center">
        <div>
          <p className="text-sm font-bold text-emerald-900">{summary.totalJournals}</p>
          <p className="text-[10px] text-emerald-700/60">Jurnal</p>
        </div>
        <div>
          <p className="text-sm font-bold text-emerald-700">{summary.approvedCount}</p>
          <p className="text-[10px] text-emerald-700/60">Valid</p>
        </div>
        <div>
          <p className="text-sm font-bold text-orange-600">{summary.revisionCount}</p>
          <p className="text-[10px] text-emerald-700/60">Revisi</p>
        </div>
        <div>
          <p className="text-sm font-bold text-yellow-600">{summary.pendingCount}</p>
          <p className="text-[10px] text-emerald-700/60">Tunggu</p>
        </div>
      </div>
      <p className="text-[11px] text-emerald-700/60 mt-2.5 border-t border-emerald-100 pt-2">
        {summary.totalPagesRead} halaman dibaca{" "}
        {"booksFinished" in summary ? `· ${summary.booksFinished} buku selesai` : ""}
      </p>
    </div>
  );
}

/** Kartu ringkas per siswa untuk pratinjau laporan "Semua siswa" di mobile. */
function StudentSummaryCard({ s, onOpen }: { s: StudentSummary; onOpen?: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={!onOpen}
      className="w-full text-left rounded-2xl border border-emerald-100 bg-emerald-50/60 p-3.5 disabled:cursor-default"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-emerald-900 truncate">{s.name}</p>
          <p className="text-[11px] text-emerald-700/60">
            Kelas {s.classCode}
            {s.gender ? ` · ${formatGender(s.gender)}` : ""}
          </p>
        </div>
        {onOpen && <ChevronRight className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />}
      </div>
      <div className="grid grid-cols-4 gap-2 text-center">
        <div>
          <p className="text-sm font-bold text-emerald-900">{s.totalJournals}</p>
          <p className="text-[10px] text-emerald-700/60">Jurnal</p>
        </div>
        <div>
          <p className="text-sm font-bold text-emerald-700">{s.approvedCount}</p>
          <p className="text-[10px] text-emerald-700/60">Valid</p>
        </div>
        <div>
          <p className="text-sm font-bold text-blue-700">{s.totalPagesRead}</p>
          <p className="text-[10px] text-emerald-700/60">Hlm.</p>
        </div>
        <div>
          <p className="text-sm font-bold text-orange-600">{s.booksFinished}</p>
          <p className="text-[10px] text-emerald-700/60">Buku</p>
        </div>
      </div>
    </button>
  );
}

export default function TeacherDashboard() {
  const { user, userProfile, logout, loading } = useAuth();
  const router = useRouter();
  const [journals, setJournals] = useState<Journal[]>([]);
  const [allStudents, setAllStudents] = useState<RosterStudent[]>([]);
  const [feedbackInput, setFeedbackInput] = useState<{ [key: string]: string }>({});
  const [activeTab, setActiveTab] = useState<TabKey>("ringkasan");
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [classFilter, setClassFilter] = useState<string>("all");
  const [reportView, setReportView] = useState<ReportView>("kelas");
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>("all");
  const [reportMonth, setReportMonth] = useState(getCurrentMonthInput());
  const [reportClass, setReportClass] = useState("all");
  const [reportStudent, setReportStudent] = useState<string>("all");
  const [classSummaryMonth, setClassSummaryMonth] = useState(getCurrentMonthInput());
  const [classSummaryClass, setClassSummaryClass] = useState("all");
  const [editingStudent, setEditingStudent] = useState<RosterStudent | null>(null);
  const [studentForm, setStudentForm] = useState({ name: "", classCode: "", gender: "", email: "" });
  const [selectedStudentsForDelete, setSelectedStudentsForDelete] = useState<Set<string>>(new Set());
  const [managementStudentSearch, setManagementStudentSearch] = useState("");
  const [managementClassFilter, setManagementClassFilter] = useState("all");
  const [managementMessage, setManagementMessage] = useState("");
  const [managementError, setManagementError] = useState("");
  const [managementLoading, setManagementLoading] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0.5, y: 0.5 });
  // id jurnal yang sedang diproses (approve/revisi/batalkan) -> mencegah klik ganda
  const [journalActionLoading, setJournalActionLoading] = useState<string | null>(null);
  // id jurnal yang sedang dihapus -> mencegah klik ganda dan memberi feedback visual
  const [deleteJournalLoading, setDeleteJournalLoading] = useState<string | null>(null);
  const [leaderboardSubTab, setLeaderboardSubTab] = useState<LeaderboardSubTab>("semua");
  const [selectedLeaderboardClass, setSelectedLeaderboardClass] = useState("");

  const fetchClassJournals = useCallback(async () => {
    const journalQuery = query(collection(db, "journals"), orderBy("createdAt", "desc"));
    const querySnapshot = await getDocs(journalQuery);
    const docs: Journal[] = [];
    querySnapshot.forEach((d) => docs.push({ id: d.id, ...d.data() } as Journal));
    docs.sort(
      (a, b) =>
        (toDateSafe(b.updatedAt ?? b.createdAt)?.getTime() ?? 0) -
        (toDateSafe(a.updatedAt ?? a.createdAt)?.getTime() ?? 0)
    );
    setJournals(docs);
  }, []);

  const fetchAllStudents = useCallback(async () => {
    const q = query(collection(db, "users"), where("role", "==", "student"));
    const querySnapshot = await getDocs(q);
    const list: RosterStudent[] = [];
    querySnapshot.forEach((d) => {
      const data = d.data();
      list.push({
        uid: d.id,
        email: data.email || "",
        name: data.name || "Tanpa Nama",
        classCode: data.classCode || "-",
        gender: data.gender || "",
      });
    });
    setAllStudents(list);
  }, []);

  const loadDashboardData = useCallback(async () => {
    await Promise.all([fetchClassJournals(), fetchAllStudents()]);
  }, [fetchClassJournals, fetchAllStudents]);

  useEffect(() => {
    if (!loading && (!user || !["teacher", "admin"].includes(userProfile?.role || ""))) {
      router.push("/login");
    } else if (user && ["teacher", "admin"].includes(userProfile?.role || "")) {
      // Firestore data fetch is intentional external synchronization; the async callback updates local state after data arrives.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadDashboardData();
    }
  }, [user, userProfile, loading, router, loadDashboardData]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePos({
        x: e.clientX / window.innerWidth,
        y: e.clientY / window.innerHeight,
      });
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  /**
   * Mengganti status sebuah jurnal ke "approved" | "revision" | "pending".
   * - "approved"  -> menandai approvedBy dengan nama guru saat ini.
   * - "revision"  -> WAJIB ada alasan di kolom umpan balik (feedbackInput).
   * - "pending"   -> dipakai untuk "Batalkan Validasi" (approvedBy dikosongkan).
   */
  const handleApprove = async (journalId: string) => {
    try {
      await handleUpdateJournalStatus(journalId, "approved");
    } catch {
      setManagementError("Validasi jurnal gagal diperbarui. Periksa koneksi/izin dan coba lagi.");
    }
  };

  const handleUpdateJournalStatus = async (journalId: string, newStatus: JournalStatus) => {
    const journal = journals.find((item) => item.id === journalId);
    if (!journal) return;

    const currentStatus = getStatusInfo(journal.status).key;
    if (currentStatus === newStatus) return;
    if (journalActionLoading === journalId || deleteJournalLoading === journalId) return;

    const feedback = (feedbackInput[journalId] ?? journal.teacherFeedback ?? "").trim();

    if (newStatus === "revision" && !feedback) {
      setManagementError(
        "Tulis alasan revisi di kolom umpan balik jurnal ini sebelum menandainya Perlu Revisi."
      );
      return;
    }

    setManagementError("");
    const teacherName = userProfile?.name || "Guru";
    const updatePayload: {
      status: JournalStatus;
      teacherFeedback: string;
      approvedBy: string;
      updatedAt: ReturnType<typeof serverTimestamp>;
    } = {
      status: newStatus,
      teacherFeedback: feedback,
      approvedBy: newStatus === "approved" ? teacherName : "",
      updatedAt: serverTimestamp(),
    };

    setJournalActionLoading(journalId);
    try {
      await updateDoc(doc(db, "journals", journalId), updatePayload);
      await fetchClassJournals();
    } catch {
      setManagementError("Status jurnal gagal diperbarui. Periksa koneksi/izin dan coba lagi.");
      return;
    } finally {
      setJournalActionLoading(null);
    }
  };

  const handleCancelApproval = (journalId: string) => {
    if (!window.confirm("Batalkan validasi jurnal ini? Statusnya akan kembali menjadi Menunggu.")) {
      return;
    }
    void handleUpdateJournalStatus(journalId, "pending");
  };

  const handleDeleteJournal = async (journalId: string) => {
    if (!window.confirm("Hapus jurnal ini secara permanen?")) return;
    if (deleteJournalLoading === journalId || journalActionLoading === journalId) return;

    setManagementError("");
    setDeleteJournalLoading(journalId);
    try {
      await deleteDoc(doc(db, "journals", journalId));
      setJournals((current) => current.filter((journal) => journal.id !== journalId));
    } catch {
      setManagementError("Jurnal gagal dihapus. Periksa izin Firebase dan coba lagi.");
    } finally {
      setDeleteJournalLoading(null);
    }
  };

  const startEditingStudent = (student: RosterStudent) => {
    setEditingStudent(student);
    setStudentForm({ name: student.name, classCode: student.classCode, gender: student.gender || "", email: student.email });
    setManagementMessage("");
    setManagementError("");
  };

  const handleUpdateStudent = async () => {
    if (!editingStudent || !studentForm.name.trim() || !studentForm.classCode.trim()) {
      setManagementError("Nama dan kelas siswa wajib diisi.");
      return;
    }
    setManagementLoading(true);
    setManagementError("");
    try {
      // Update Firestore user document
      const userUpdateData: Record<string, string> = {
        name: studentForm.name.trim(),
        classCode: studentForm.classCode.trim().toUpperCase(),
        gender: studentForm.gender,
      };

      // Update email di Firestore jika berubah
      if (studentForm.email.trim() && studentForm.email !== editingStudent.email) {
        userUpdateData.email = studentForm.email.trim();
      }

      await updateDoc(doc(db, "users", editingStudent.uid), userUpdateData);

      // Update journal documents yang terkait
      const journalQuery = query(collection(db, "journals"), where("studentId", "==", editingStudent.uid));
      const journalSnapshot = await getDocs(journalQuery);
      await Promise.all(
        journalSnapshot.docs.map((journal) =>
          updateDoc(doc(db, "journals", journal.id), {
            studentName: studentForm.name.trim(),
            classCode: studentForm.classCode.trim().toUpperCase(),
          })
        )
      );

      setEditingStudent(null);
      setStudentForm({ name: "", classCode: "", gender: "", email: "" });
      setManagementMessage("Profil siswa berhasil diperbarui.");
      await Promise.all([fetchAllStudents(), fetchClassJournals()]);
    } catch (error) {
      console.error(error);
      setManagementError("Profil siswa gagal diperbarui. Coba lagi.");
    } finally {
      setManagementLoading(false);
    }
  };

  const handleDeleteStudent = async (student: RosterStudent) => {
    if (!window.confirm(`Hapus profil ${student.name} dan semua jurnalnya?`)) return;
    setManagementLoading(true);
    setManagementError("");
    try {
      const journalQuery = query(collection(db, "journals"), where("studentId", "==", student.uid));
      const journalSnapshot = await getDocs(journalQuery);
      await Promise.all(journalSnapshot.docs.map((journal) => deleteDoc(doc(db, "journals", journal.id))));
      await deleteDoc(doc(db, "users", student.uid));
      setManagementMessage(`Profil ${student.name} dan semua jurnal berhasil dihapus.`);
      await Promise.all([fetchAllStudents(), fetchClassJournals()]);
    } catch {
      setManagementError("Profil siswa gagal dihapus. Coba lagi.");
    } finally {
      setManagementLoading(false);
    }
  };

  const handleToggleSelectStudent = (uid: string) => {
    setSelectedStudentsForDelete((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(uid)) {
        newSet.delete(uid);
      } else {
        newSet.add(uid);
      }
      return newSet;
    });
  };

  const handleSelectAllInClass = (classCode: string, students: RosterStudent[]) => {
    const classStudentIds = students.map((s) => s.uid);
    setSelectedStudentsForDelete((prev) => {
      const newSet = new Set(prev);
      const allSelected = classStudentIds.every((id) => newSet.has(id));
      if (allSelected) {
        classStudentIds.forEach((id) => newSet.delete(id));
      } else {
        classStudentIds.forEach((id) => newSet.add(id));
      }
      return newSet;
    });
  };

  const handleDeleteSelectedStudents = async () => {
    if (selectedStudentsForDelete.size === 0) {
      setManagementError("Pilih minimal 1 siswa untuk dihapus.");
      return;
    }
    const count = selectedStudentsForDelete.size;
    if (!window.confirm(`Hapus ${count} siswa dan semua jurnal mereka? Tindakan ini tidak bisa dibatalkan.`)) return;

    setManagementLoading(true);
    setManagementError("");
    try {
      await Promise.all(
        Array.from(selectedStudentsForDelete).map(async (uid) => {
          const journalQuery = query(collection(db, "journals"), where("studentId", "==", uid));
          const journalSnapshot = await getDocs(journalQuery);
          await Promise.all(journalSnapshot.docs.map((journal) => deleteDoc(doc(db, "journals", journal.id))));
          await deleteDoc(doc(db, "users", uid));
        })
      );
      setSelectedStudentsForDelete(new Set());
      setManagementMessage(`${count} siswa dan semua jurnal mereka berhasil dihapus.`);
      await Promise.all([fetchAllStudents(), fetchClassJournals()]);
    } catch {
      setManagementError("Gagal menghapus siswa. Coba lagi.");
    } finally {
      setManagementLoading(false);
    }
  };

  // Ringkasan per siswa, sepanjang waktu (dipakai di tab Ringkasan & Pendampingan).
  const studentSummaries: StudentSummary[] = useMemo(
    () => buildStudentSummaries(journals, allStudents),
    [journals, allStudents]
  );

  const availableClasses = useMemo(() => {
    const set = new Set<string>();
    journals.forEach((j) => {
      if (j.classCode) set.add(j.classCode);
    });
    allStudents.forEach((s) => {
      if (s.classCode && s.classCode !== "-") set.add(s.classCode);
    });
    return Array.from(set).sort();
  }, [journals, allStudents]);

  // Rangkuman kelas per bulan (tab Ringkasan)
  const classSummaries: ClassSummary[] = useMemo(
    () => buildClassSummaries(filterJournalsByPeriod(journals, "month", classSummaryMonth), allStudents, classSummaryClass),
    [journals, allStudents, classSummaryMonth, classSummaryClass]
  );

  const filteredStudents = useMemo(() => {
    return studentSummaries.filter((s) => {
      const matchClass = classFilter === "all" || s.classCode === classFilter;
      const matchSearch =
        !searchQuery.trim() ||
        s.name.toLowerCase().includes(searchQuery.trim().toLowerCase());
      return matchClass && matchSearch;
    });
  }, [studentSummaries, classFilter, searchQuery]);

  // Grouping students by class untuk tab Kelola Data
  const managementAvailableClasses = useMemo(() => {
    const classSet = new Set<string>();
    allStudents.forEach((s) => {
      if (s.classCode && s.classCode !== "-") {
        classSet.add(s.classCode);
      }
    });

    // Sort classes: extract grade (7,8,9) and letter (A-H), sort numerically then alphabetically
    return Array.from(classSet).sort((a, b) => {
      const gradeA = parseInt(a[0], 10);
      const gradeB = parseInt(b[0], 10);
      if (gradeA !== gradeB) return gradeA - gradeB;
      return a.localeCompare(b, "id");
    });
  }, [allStudents]);

  const groupedStudentsByClass = useMemo(() => {
    const searchQ = managementStudentSearch.trim().toLowerCase();
    let filtered = allStudents.filter((s) => !searchQ || s.name.toLowerCase().includes(searchQ));
    
    // Apply class filter
    if (managementClassFilter !== "all") {
      filtered = filtered.filter((s) => s.classCode === managementClassFilter);
    }
    
    const grouped = new Map<string, RosterStudent[]>();
    filtered.forEach((s) => {
      const classCode = s.classCode || "Tanpa Kelas";
      if (!grouped.has(classCode)) {
        grouped.set(classCode, []);
      }
      grouped.get(classCode)!.push(s);
    });

    // Sort by class code (7A-7H, 8A-8H, 9A-9H), siswa dalam setiap kelas juga di-sort by nama
    const sorted = Array.from(grouped.entries())
      .sort(([a], [b]) => {
        const gradeA = parseInt(a[0], 10);
        const gradeB = parseInt(b[0], 10);
        if (gradeA !== gradeB) return gradeA - gradeB;
        return a.localeCompare(b, "id");
      })
      .map(([classCode, students]) => ({
        classCode,
        students: students.sort((a, b) => a.name.localeCompare(b.name, "id")),
      }));

    return sorted;
  }, [allStudents, managementStudentSearch, managementClassFilter]);

  const classStats = useMemo(() => {
    const totalSiswa = studentSummaries.length;
    const totalJurnal = journals.length;
    const totalTervalidasi = journals.filter((j) => getStatusInfo(j.status).key === "approved").length;
    const totalRevisi = journals.filter((j) => getStatusInfo(j.status).key === "revision").length;
    const totalMenunggu = totalJurnal - totalTervalidasi - totalRevisi;
    const rataRata = totalSiswa > 0 ? totalJurnal / totalSiswa : 0;
    const totalHalaman = studentSummaries.reduce((acc, s) => acc + s.totalPagesRead, 0);
    const totalBukuSelesai = studentSummaries.reduce((acc, s) => acc + s.booksFinished, 0);

    const startOfMonth = getStartOfMonth(new Date());
    const jurnalBulanIni = journals.filter((j) => {
      const d = toDateSafe(j.createdAt);
      return d ? d >= startOfMonth : false;
    }).length;

    const topBooks = getTopBooks(journals, 5);
    const topCharacters = getTopCharacters(journals, 5);

    return {
      totalSiswa,
      totalJurnal,
      totalTervalidasi,
      totalRevisi,
      totalMenunggu,
      rataRata,
      totalHalaman,
      totalBukuSelesai,
      jurnalBulanIni,
      topBooks,
      topCharacters,
      bukuTerpopuler: topBooks[0] || null,
      nilaiKarakterTerbanyak: topCharacters[0] || null,
    };
  }, [journals, studentSummaries]);

  const leaderboard = useMemo(() => buildLeaderboard(journals), [journals]);
  const leaderboardClasses = useMemo(
    () => Array.from(new Set(leaderboard.map((entry) => entry.classCode).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [leaderboard]
  );
  const effectiveLeaderboardClass = selectedLeaderboardClass && leaderboardClasses.includes(selectedLeaderboardClass)
    ? selectedLeaderboardClass
    : leaderboardClasses[0] || "";
  const classLeaderboard = useMemo(
    () => buildLeaderboard(journals.filter((journal) => journal.classCode === effectiveLeaderboardClass), Number.MAX_SAFE_INTEGER),
    [journals, effectiveLeaderboardClass]
  );

  const studentsNeedingAttention: FlaggedStudent[] = useMemo(() => {
    if (studentSummaries.length === 0) return [];
    const avg = classStats.rataRata;
    const now = new Date();
    return studentSummaries
      .map((s) => {
        const reasons: string[] = [];
        if (s.totalJournals === 0) {
          reasons.push("Belum pernah mengirim jurnal / membaca buku sama sekali");
        } else {
          if (avg > 0 && s.totalJournals < avg * LOW_ACTIVITY_RATIO) {
            reasons.push(
              `Jumlah jurnal (${s.totalJournals}) jauh di bawah rata-rata kelas (${avg.toFixed(1)})`
            );
          }
          if (s.lastSubmission) {
            const days = Math.floor((now.getTime() - s.lastSubmission.getTime()) / 86400000);
            if (days > INACTIVITY_DAYS) {
              reasons.push(`Belum mengirim jurnal baru selama ${days} hari terakhir`);
            }
          }
          if (s.pendingCount + s.revisionCount >= PENDING_BACKLOG_THRESHOLD) {
            reasons.push(
              `Ada ${s.pendingCount + s.revisionCount} jurnal yang menumpuk belum divalidasi/masih revisi`
            );
          }
        }
        return { ...s, reasons };
      })
      .filter((s) => s.reasons.length > 0);
  }, [studentSummaries, classStats]);

  const selectedStudentData = useMemo(
    () => studentSummaries.find((s) => s.name === selectedStudent) || null,
    [studentSummaries, selectedStudent]
  );

  /* ---- Data khusus tab Laporan ---- */

  const reportPeriodJournals = useMemo(
    () => filterJournalsByPeriod(journals, reportPeriod, reportMonth),
    [journals, reportPeriod, reportMonth]
  );

  const reportClassSummaries: ClassSummary[] = useMemo(
    () => buildClassSummaries(reportPeriodJournals, allStudents, reportClass),
    [reportPeriodJournals, allStudents, reportClass]
  );

  // Ringkasan per siswa untuk periode laporan — otomatis memuat SELURUH siswa
  // di roster (allStudents), bukan cuma yang punya jurnal, jadi jumlahnya
  // selalu sinkron dengan total siswa aktif di website.
  const reportStudentSummaries: StudentSummary[] = useMemo(
    () =>
      buildStudentSummaries(reportPeriodJournals, allStudents).sort(
        (a, b) =>
          (b.lastSubmission?.getTime() ?? 0) - (a.lastSubmission?.getTime() ?? 0) ||
          a.name.localeCompare(b.name, "id")
      ),
    [reportPeriodJournals, allStudents]
  );

  const reportSelectedStudentSummary: StudentSummary | null = useMemo(
    () => (reportStudent === "all" ? null : reportStudentSummaries.find((s) => s.name === reportStudent) || null),
    [reportStudentSummaries, reportStudent]
  );

  const reportStudentSummariesForExport = useMemo(
    () =>
      reportStudent === "all"
        ? reportStudentSummaries
        : reportStudentSummaries.filter((s) => s.name === reportStudent),
    [reportStudentSummaries, reportStudent]
  );

  // Daftar siswa untuk laporan Per Kelas — sama-sama bersumber dari
  // reportStudentSummaries (seluruh roster) agar tiap siswa di kelas
  // terpilih ikut muncul walau belum pernah kirim jurnal.
  const reportClassStudentSummaries = useMemo(
    () =>
      reportClass === "all"
        ? reportStudentSummaries
        : reportStudentSummaries.filter((s) => s.classCode === reportClass),
    [reportStudentSummaries, reportClass]
  );

  const printableStudents = reportView === "siswa"
    ? reportStudentSummariesForExport
    : reportClassStudentSummaries;
  const printableRows = useMemo(
    () => buildDetailedRows(printableStudents),
    [printableStudents]
  );

  // Statistik Buku & Karakter khusus untuk periode laporan (berdasarkan
  // jumlah siswa unik — lihat getTopBooks / getTopCharacters).
  const reportTopBooks = useMemo(() => getTopBooks(reportPeriodJournals, 10), [reportPeriodJournals]);
  const reportTopCharacters = useMemo(() => getTopCharacters(reportPeriodJournals, 10), [reportPeriodJournals]);

  const reportPeriodLabel = reportPeriod === "all" ? "sepanjang waktu" : `bulan ${reportMonth || "-"}`;

  const downloadCSV = (headers: string[], rows: (string | number)[][], filename: string) => {
    const csvContent = [headers, ...rows]
      .map((r) => r.map((field) => `"${String(field ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Export CSV utama untuk tab Laporan — selalu detail per buku, baik untuk
  // Rekapan Per Kelas maupun Rekapan Per Siswa.
  const handleExportCSV = () => {
    const todayStr = new Date().toISOString().slice(0, 10);

    if (reportView === "siswa") {
      if (reportStudent !== "all" && reportSelectedStudentSummary) {
        // Laporan personal: rincian jurnal siswa itu pada periode terpilih.
        const rows = buildDetailedRows([reportSelectedStudentSummary]);
        downloadCSV(
          DETAILED_HEADERS,
          rows,
          `laporan-personal-${reportStudent}-${reportPeriod === "all" ? "semua" : reportMonth}-${todayStr}.csv`
        );
      } else {
        // Semua siswa: satu baris per buku, ditambah baris untuk siswa yang
        // belum kirim jurnal sama sekali (tetap tercatat).
        const rows = buildDetailedRows(reportStudentSummariesForExport);
        downloadCSV(
          DETAILED_HEADERS,
          rows,
          `laporan-persiswa-detail-${reportPeriod === "all" ? "semua" : reportMonth}-${todayStr}.csv`
        );
      }
    } else {
      // Rekapan Per Kelas: detail per siswa & per buku di kelas terpilih
      // (atau seluruh kelas jika "Semua kelas" dipilih).
      const rows = buildDetailedRows(reportClassStudentSummaries);
      downloadCSV(
        DETAILED_HEADERS,
        rows,
        `laporan-perkelas-detail-${reportClass}-${reportPeriod === "all" ? "semua" : reportMonth}-${todayStr}.csv`
      );
    }
  };

  /** Export khusus daftar Buku & Nilai Karakter pada periode terpilih */
  const handleExportBooksAndCharacters = () => {
    const bookHeaders = ["Peringkat", "Judul Buku", "Nama Siswa", "Jumlah Siswa Membaca", "Tanggal Upload", "Divalidasi Oleh"];
    const bookRows = reportTopBooks.map(([title, count], idx) => {
      const matchingJournals = reportPeriodJournals.filter(
        (journal) => journal.bookTitle.trim().toLowerCase() === title.trim().toLowerCase()
      );
      const studentNames = Array.from(
        new Set(matchingJournals.map((journal) => journal.studentName || "Tanpa Nama"))
      ).sort((a, b) => a.localeCompare(b, "id"));
      const relevantJournal = matchingJournals[0];
      return [
        idx + 1,
        title,
        studentNames.join("; ") || "-",
        count,
        formatTanggal(toDateSafe(relevantJournal?.createdAt)),
        relevantJournal?.approvedBy || "-",
      ];
    });

    const charHeaders = ["Peringkat", "Nilai Karakter", "Nama Siswa", "Jumlah Siswa Menyebutkan", "Tanggal Upload", "Divalidasi Oleh"];
    const charRows = reportTopCharacters.map(([val, count], idx) => {
      const matchingJournals = reportPeriodJournals.filter((journal) =>
        getCharacterList(journal).some((character) => character.trim().toLowerCase() === val.trim().toLowerCase())
      );
      const studentNames = Array.from(
        new Set(matchingJournals.map((journal) => journal.studentName || "Tanpa Nama"))
      ).sort((a, b) => a.localeCompare(b, "id"));
      const relevantJournal = matchingJournals[0];
      return [
        idx + 1,
        val,
        studentNames.join("; ") || "-",
        count,
        formatTanggal(toDateSafe(relevantJournal?.createdAt)),
        relevantJournal?.approvedBy || "-",
      ];
    });

    // Gabungkan jadi satu file dengan separator section
    const lines: string[] = [];
    lines.push("=== DAFTAR BUKU TERPOPULER (BERDASARKAN JUMLAH SISWA) ===");
    lines.push(bookHeaders.map((h) => `"${h}"`).join(","));
    bookRows.forEach((r) => lines.push(r.map((f) => `"${String(f ?? "").replace(/"/g, '""')}"`).join(",")));
    lines.push("");
    lines.push("=== DAFTAR NILAI KARAKTER TERBANYAK (BERDASARKAN JUMLAH SISWA) ===");
    lines.push(charHeaders.map((h) => `"${h}"`).join(","));
    charRows.forEach((r) => lines.push(r.map((f) => `"${String(f ?? "").replace(/"/g, '""')}"`).join(",")));

    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `laporan-buku-dan-karakter-${reportPeriod === "all" ? "semua" : reportMonth}-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-green-50 to-teal-100">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-[3px] border-emerald-200 border-t-emerald-600 animate-spin" />
          <p className="text-emerald-700 text-sm font-medium">Memuat dashboard...</p>
        </div>
      </div>
    );
  }

  const teacherName = userProfile?.name || "Guru";
  const tabs: { key: TabKey; label: string; shortLabel: string; icon: React.ReactNode }[] = [
    { key: "ringkasan", label: "Rekap Seluruh Siswa", shortLabel: "Rekap", icon: <LayoutGrid className="w-4 h-4" /> },
    { key: "leaderboard", label: "Leaderboard", shortLabel: "Papan Skor", icon: <Trophy className="w-4 h-4" /> },
    {
      key: "pendampingan",
      label: `Perlu Pendampingan${studentsNeedingAttention.length ? ` (${studentsNeedingAttention.length})` : ""}`,
      shortLabel: "Pendampingan",
      icon: <HeartHandshake className="w-4 h-4" />,
    },
    { key: "jurnal", label: "Daftar Jurnal", shortLabel: "Jurnal", icon: <NotebookText className="w-4 h-4" /> },
    { key: "laporan", label: "Laporan", shortLabel: "Laporan", icon: <FileBarChart2 className="w-4 h-4" /> },
    { key: "kelola", label: "Kelola Data", shortLabel: "Kelola", icon: <Settings2 className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-gradient-to-br from-emerald-50 via-green-50 to-teal-100 relative print:bg-white print:p-0">
      <CuteBackground mouse={mousePos} />

      <div className="relative w-full max-w-6xl mx-auto px-3 sm:px-6 py-4 sm:py-6 box-border print:hidden">
        {/* ---- Header ---- */}
        <header className="sticky top-2 z-30 w-full flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4 mb-4 sm:mb-6 bg-white/90 backdrop-blur-md p-3.5 sm:p-4 rounded-2xl sm:rounded-3xl shadow-[0_4px_24px_-8px_rgba(6,95,70,0.18)] ring-1 ring-white">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <div className="relative shrink-0">
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-white/10 flex items-center justify-center shadow-md ring-4 ring-emerald-100 overflow-hidden">
                <Image src="/asset/literakarmascot.png" alt="Literakar Mascot" width={48} height={48} className="w-10 h-10 sm:w-12 sm:h-12 object-cover" />
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-emerald-500 ring-2 ring-white" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-[15px] sm:text-xl font-bold text-emerald-900 leading-tight break-words sm:truncate">
                Selamat Datang Guru, {teacherName}!
              </h1>
              <p className="text-[11px] sm:text-xs text-emerald-700/60 mt-0.5 leading-relaxed">
                Semoga Hari Ini Lancar Yaa!
                {availableClasses.length > 0 ? ` · ${availableClasses.length} kelas aktif` : ""}
              </p>
            </div>
          </div>
          <button
            onClick={logout}
            className="w-full sm:w-auto shrink-0 flex items-center justify-center gap-2 px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-xl text-sm font-semibold hover:bg-red-100 active:scale-[0.98] transition"
          >
            <LogOut className="w-4 h-4" />
            Keluar
          </button>
        </header>

        <nav className="mb-5 sm:mb-6 w-full max-w-full overflow-x-auto rounded-2xl bg-white/80 backdrop-blur-sm p-1.5 shadow-sm shadow-emerald-900/5 border border-white [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex min-w-max gap-1.5">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`shrink-0 whitespace-nowrap flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold tracking-wide transition ${
                  activeTab === t.key
                    ? "bg-emerald-600 text-white shadow-sm shadow-emerald-900/20"
                    : "text-emerald-800/70 hover:bg-emerald-50"
                }`}
              >
                {t.icon}
                <span className="sm:hidden">{t.shortLabel}</span>
                <span className="hidden sm:inline">{t.label}</span>
              </button>
            ))}
          </div>
        </nav>

        {/* Pesan error global untuk aksi jurnal/siswa (approve, revisi, batalkan, hapus, dll) */}
        {managementError && activeTab !== "kelola" && (
          <p className="mb-4 flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            {managementError}
          </p>
        )}

        {/* ---- Tab: Rekap Kelas ---- */}
        {activeTab === "ringkasan" && (
          <div className="space-y-5 sm:space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
              <StatCard
                label="Total Siswa"
                value={classStats.totalSiswa}
                icon={<Users className="w-4 h-4" />}
                color="blue"
              />
              <StatCard
                label="Jurnal Bulan Ini"
                value={classStats.jurnalBulanIni}
                icon={<CalendarCheck className="w-4 h-4" />}
                color="yellow"
              />
              <StatCard
                label="Total Halaman Dibaca"
                value={classStats.totalHalaman}
                icon={<Library className="w-4 h-4" />}
                color="emerald"
              />
              <StatCard
                label="Total Buku Selesai"
                value={classStats.totalBukuSelesai}
                icon={<BookOpen className="w-4 h-4" />}
                color="orange"
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
              <StatCard
                label="Total Jurnal"
                value={classStats.totalJurnal}
                icon={<BookOpen className="w-4 h-4" />}
                color="emerald"
              />
              <StatCard
                label="Sudah Divalidasi"
                value={classStats.totalTervalidasi}
                icon={<CheckCircle2 className="w-4 h-4" />}
                color="emerald"
              />
              <StatCard
                label="Perlu Revisi"
                value={classStats.totalRevisi}
                icon={<AlertTriangle className="w-4 h-4" />}
                color="orange"
              />
              <StatCard
                label="Menunggu Validasi"
                value={classStats.totalMenunggu}
                icon={<Clock className="w-4 h-4" />}
                color="yellow"
              />
              <StatCard
                label="Rata-rata Jurnal/Siswa"
                value={classStats.rataRata.toFixed(1)}
                icon={<TrendingUp className="w-4 h-4" />}
                color="blue"
              />
            </div>

            {/* Top Buku & Nilai Karakter */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white/85 backdrop-blur-sm p-4 sm:p-5 rounded-2xl sm:rounded-3xl shadow-[0_1px_2px_rgba(6,95,70,0.04),0_8px_20px_-12px_rgba(6,95,70,0.15)] ring-1 ring-emerald-100/70">
                <h3 className="text-sm font-semibold text-emerald-700/70 mb-3">Top 5 Buku Terpopuler</h3>
                {classStats.topBooks.length === 0 ? (
                  <p className="text-sm text-emerald-700/50">Belum ada data buku.</p>
                ) : (
                  <ul className="space-y-2">
                    {classStats.topBooks.map(([title, count], idx) => (
                      <li key={title} className="flex items-center justify-between gap-2 text-sm">
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                          <span className="font-medium text-emerald-900 truncate">{title}</span>
                        </span>
                        <span className="text-xs text-emerald-700/60 shrink-0">{count} siswa</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="bg-white/85 backdrop-blur-sm p-4 sm:p-5 rounded-2xl sm:rounded-3xl shadow-[0_1px_2px_rgba(6,95,70,0.04),0_8px_20px_-12px_rgba(6,95,70,0.15)] ring-1 ring-emerald-100/70">
                <h3 className="text-sm font-semibold text-emerald-700/70 mb-3">
                  Top 5 Nilai Karakter
                </h3>
                {classStats.topCharacters.length === 0 ? (
                  <p className="text-sm text-emerald-700/50">Belum ada data nilai karakter.</p>
                ) : (
                  <ul className="space-y-2">
                    {classStats.topCharacters.map(([val, count], idx) => (
                      <li key={val} className="flex items-center justify-between gap-2 text-sm">
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                          <span className="font-medium text-emerald-900 truncate">{val}</span>
                        </span>
                        <span className="text-xs text-emerald-700/60 shrink-0">{count} siswa</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="bg-white/85 backdrop-blur-sm p-4 sm:p-6 rounded-2xl sm:rounded-3xl shadow-[0_1px_2px_rgba(6,95,70,0.04),0_8px_20px_-12px_rgba(6,95,70,0.15)] ring-1 ring-emerald-100/70">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-emerald-900">Rangkuman Kelas Per Bulan</h2>
                  <p className="text-xs text-emerald-700/60 mt-1">
                    Siswa aktif adalah siswa yang mengirim jurnal pada bulan terpilih.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <div>
                    <label className="text-xs text-emerald-700/70 mb-1 block">Bulan rekap</label>
                    <input
                      type="month"
                      value={classSummaryMonth}
                      onChange={(e) => setClassSummaryMonth(e.target.value)}
                      className="w-full p-2 text-sm bg-emerald-50/50 border border-emerald-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-400"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-emerald-700/70 mb-1 block">Pilih kelas</label>
                    <select
                      value={classSummaryClass}
                      onChange={(e) => setClassSummaryClass(e.target.value)}
                      className="w-full p-2 text-sm bg-emerald-50/50 border border-emerald-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-400"
                    >
                      <option value="all">Semua kelas</option>
                      {availableClasses.map((classCode) => (
                        <option key={classCode} value={classCode}>{classCode}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              {classSummaries.length === 0 ? (
                <p className="text-sm text-emerald-700/60">Belum ada data siswa untuk kelas atau bulan ini.</p>
              ) : (
                <>
                  {/* Mobile: kartu ringkas per kelas */}
                  <div className="grid grid-cols-1 xs:grid-cols-2 gap-2.5 md:hidden">
                    {classSummaries.map((summary) => (
                      <ClassSummaryCard key={summary.classCode} summary={summary} />
                    ))}
                  </div>
                  {/* Desktop: tabel */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-emerald-700/60 border-b border-emerald-100">
                          <th className="py-2 pr-3">Kelas</th>
                          <th className="py-2 pr-3">Total Siswa</th>
                          <th className="py-2 pr-3">Siswa Aktif</th>
                          <th className="py-2 pr-3">Total Jurnal</th>
                          <th className="py-2 pr-3">Tervalidasi</th>
                          <th className="py-2 pr-3">Perlu Revisi</th>
                          <th className="py-2 pr-3">Menunggu</th>
                          <th className="py-2">Halaman</th>
                        </tr>
                      </thead>
                      <tbody>
                        {classSummaries.map((summary) => (
                          <tr key={summary.classCode} className="border-b border-emerald-50 last:border-0 hover:bg-emerald-50/40 transition-colors">
                            <td className="py-2 pr-3 font-semibold text-emerald-900">{summary.classCode}</td>
                            <td className="py-2 pr-3 text-emerald-800/80">{summary.totalStudents}</td>
                            <td className="py-2 pr-3 text-emerald-800/80">{summary.activeStudents}</td>
                            <td className="py-2 pr-3 text-emerald-800/80">{summary.totalJournals}</td>
                            <td className="py-2 pr-3 text-emerald-800/80">{summary.approvedCount}</td>
                            <td className="py-2 pr-3 text-emerald-800/80">{summary.revisionCount}</td>
                            <td className="py-2 pr-3 text-emerald-800/80">{summary.pendingCount}</td>
                            <td className="py-2 text-emerald-800/80">{summary.totalPagesRead}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            {/* Daftar siswa */}
            <div className="bg-white/85 backdrop-blur-sm p-4 sm:p-6 rounded-2xl sm:rounded-3xl shadow-[0_1px_2px_rgba(6,95,70,0.04),0_8px_20px_-12px_rgba(6,95,70,0.15)] ring-1 ring-emerald-100/70">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <h2 className="text-base sm:text-lg font-bold text-emerald-900">Aktivitas per Siswa</h2>
                <div className="flex flex-col sm:flex-row gap-2">
                  <select
                    value={classFilter}
                    onChange={(e) => setClassFilter(e.target.value)}
                    className="px-3 py-2 text-sm bg-emerald-50/50 border border-emerald-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-400"
                  >
                    <option value="all">Semua Kelas</option>
                    {availableClasses.map((c) => (
                      <option key={c} value={c}>
                        Kelas {c}
                      </option>
                    ))}
                  </select>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500" />
                    <input
                      type="text"
                      placeholder="Cari nama siswa..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 pr-3 py-2 text-sm bg-emerald-50/50 border border-emerald-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-400 w-full sm:w-52"
                    />
                  </div>
                </div>
              </div>
              <p className="text-xs text-emerald-700/50 mb-3">
                Klik nama siswa untuk melihat detail lengkap & grafik perkembangan.
              </p>
              {filteredStudents.length === 0 ? (
                <p className="text-emerald-700/60 text-sm">
                  Tidak ada siswa yang cocok dengan filter/pencarian.
                </p>
              ) : (
                <div className="space-y-2">
                  {filteredStudents.map((s) => (
                    <button
                      key={s.name}
                      onClick={() => setSelectedStudent(s.name)}
                      className="w-full flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 p-3 rounded-xl bg-emerald-50/70 hover:bg-emerald-100/70 active:scale-[0.99] transition text-left"
                    >
                      <div className="min-w-0">
                        <span className="font-semibold text-emerald-900">{s.name}</span>
                        <span className="text-xs text-emerald-700/50 ml-2">
                          Kelas {s.classCode}
                          {s.gender ? ` · ${formatGender(s.gender)}` : ""}
                        </span>
                      </div>
                      <span className="text-xs text-emerald-700/70 shrink-0">
                        {s.totalJournals} jurnal · {s.totalPagesRead} hlm · {s.booksFinished} buku
                        selesai
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ---- Tab: Leaderboard ---- */}
        {activeTab === "leaderboard" && (
          <div className="bg-white/85 backdrop-blur-sm p-4 sm:p-6 rounded-2xl sm:rounded-3xl shadow-[0_1px_2px_rgba(6,95,70,0.04),0_8px_20px_-12px_rgba(6,95,70,0.15)] ring-1 ring-emerald-100/70">
            <div className="mb-4">
              <h2 className="text-base sm:text-lg font-bold text-emerald-900 flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-500" />
                Leaderboard Pembaca Terajin
              </h2>
              <p className="text-xs text-emerald-700/60 mt-1">
                Ranking ini menggunakan data jurnal yang sama dengan leaderboard dashboard siswa.
              </p>
            </div>

            <div className="flex gap-2 mb-4 p-1 rounded-xl bg-emerald-900/5 w-full sm:w-fit">
              {(["semua", "kelas"] as LeaderboardSubTab[]).map((view) => (
                <button
                  key={view}
                  type="button"
                  onClick={() => setLeaderboardSubTab(view)}
                  className={`flex-1 sm:flex-none px-4 py-1.5 rounded-lg text-xs font-semibold transition ${
                    leaderboardSubTab === view
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "text-emerald-800/70 hover:bg-emerald-50"
                  }`}
                >
                  {view === "semua" ? "Semua Siswa" : "Per Kelas"}
                </button>
              ))}
            </div>

            {leaderboardSubTab === "kelas" && leaderboardClasses.length > 0 && (
              <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-2">
                <label htmlFor="teacher-leaderboard-class" className="text-xs font-semibold text-emerald-700/70">
                  Pilih Kelas
                </label>
                <select
                  id="teacher-leaderboard-class"
                  value={effectiveLeaderboardClass}
                  onChange={(event) => setSelectedLeaderboardClass(event.target.value)}
                  className="w-full sm:w-48 px-3 py-2 text-sm bg-emerald-50/50 border border-emerald-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-400"
                >
                  {leaderboardClasses.map((classCode) => (
                    <option key={classCode} value={classCode}>Kelas {classCode}</option>
                  ))}
                </select>
              </div>
            )}

            {(leaderboardSubTab === "semua" ? leaderboard : classLeaderboard).length === 0 ? (
              <p className="text-sm text-emerald-700/60">Belum ada data jurnal siswa.</p>
            ) : (
              <div className="space-y-2">
                {(leaderboardSubTab === "semua" ? leaderboard : classLeaderboard).map((entry, index) => (
                  <div
                    key={entry.studentId}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                      index === 0
                        ? "border-amber-200 bg-gradient-to-r from-amber-50 to-emerald-50/50"
                        : "border-emerald-100 bg-emerald-50/50"
                    }`}
                  >
                    <div className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center font-bold text-sm ${
                      index === 0
                        ? "bg-gradient-to-br from-yellow-300 via-amber-400 to-orange-500 text-white"
                        : index === 1
                        ? "bg-gradient-to-br from-slate-300 to-slate-500 text-white"
                        : index === 2
                        ? "bg-gradient-to-br from-amber-500 to-orange-600 text-white"
                        : "bg-emerald-200 text-emerald-800"
                    }`}>
                      {index < 3 ? <Crown className="w-4 h-4" /> : index + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-emerald-900 truncate">{entry.studentName}</p>
                      <p className="text-xs text-emerald-700/60">Kelas {entry.classCode}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-emerald-900">{entry.journalCount} jurnal</p>
                      <p className="text-xs text-emerald-700/60">{entry.booksFinished} buku selesai</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ---- Tab: Perlu Pendampingan ---- */}
        {activeTab === "pendampingan" && (
          <div className="bg-white/85 backdrop-blur-sm p-4 sm:p-6 rounded-2xl sm:rounded-3xl shadow-[0_1px_2px_rgba(6,95,70,0.04),0_8px_20px_-12px_rgba(6,95,70,0.15)] ring-1 ring-emerald-100/70">
            <h2 className="text-base sm:text-lg font-bold mb-1 text-emerald-900 flex items-center gap-2">
              <HeartHandshake className="w-5 h-5 text-orange-500" />
              Siswa yang Perlu Pendampingan
            </h2>
            <p className="text-xs text-emerald-700/50 mb-4">
              Termasuk siswa yang tidak aktif membaca, belum pernah mengirim jurnal sama sekali,
              jumlah jurnal jauh di bawah rata-rata, atau tumpukan jurnal belum divalidasi/masih
              perlu revisi.
            </p>
            {studentsNeedingAttention.length === 0 ? (
              <p className="text-emerald-700 text-sm bg-emerald-50 p-3 rounded-xl flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                Semua siswa menunjukkan aktivitas membaca yang stabil. Tidak ada yang perlu
                perhatian khusus saat ini.
              </p>
            ) : (
              <div className="space-y-3">
                {studentsNeedingAttention.map((s) => (
                  <div key={s.name} className="border border-orange-200 bg-orange-50/80 p-3 sm:p-4 rounded-2xl">
                    <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:justify-between sm:items-start sm:gap-4">
                      <div className="flex gap-3">
                        <div className="w-8 h-8 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center shrink-0">
                          <AlertTriangle className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-slate-800 break-words">
                            {s.name}{" "}
                            <span className="font-normal text-slate-500 text-xs">
                              · Kelas {s.classCode}
                              {s.gender ? ` · ${formatGender(s.gender)}` : ""}
                            </span>
                          </p>
                          <ul className="list-disc list-inside text-xs text-slate-600 mt-1 space-y-0.5">
                            {s.reasons.map((r, i) => (
                              <li key={i}>{r}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                      <button
                        onClick={() => setSelectedStudent(s.name)}
                        className="w-full sm:w-auto shrink-0 px-3 py-2 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 active:scale-[0.98] transition"
                      >
                        Lihat Detail
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-emerald-700/50 mt-4">
              Catatan: daftar &quot;belum pernah mengirim jurnal&quot; diambil dari akun bertipe
              &quot;student&quot; di koleksi <code>users</code>. Pencocokan masih berdasarkan nama
              (bukan ID akun) — pastikan nama di jurnal sama persis dengan nama saat mendaftar.
            </p>
          </div>
        )}

        {/* ---- Tab: Daftar Jurnal ---- */}
        {activeTab === "jurnal" && (
          <div className="bg-white/85 backdrop-blur-sm p-4 sm:p-6 rounded-2xl sm:rounded-3xl shadow-[0_1px_2px_rgba(6,95,70,0.04),0_8px_20px_-12px_rgba(6,95,70,0.15)] ring-1 ring-emerald-100/70">
            <h2 className="text-base sm:text-lg font-bold mb-1 text-emerald-900 flex items-center gap-2">
              <NotebookText className="w-5 h-5 text-emerald-600" />
              Daftar Jurnal Siswa
            </h2>
            <p className="text-xs text-emerald-700/50 mb-4">
              Untuk menandai jurnal &quot;Perlu Revisi&quot;, isi dulu kolom umpan balik dengan
              alasannya (misalnya typo atau ringkasan kurang lengkap), baru klik tombol Perlu
              Revisi.
            </p>
            {journals.length === 0 ? (
              <p className="text-emerald-700/60 text-sm">Belum ada jurnal dari siswa manapun.</p>
            ) : (
              <div className="space-y-4 sm:space-y-6">
                {[...journals]
                  .sort(
                    (a, b) =>
                      (toDateSafe(b.updatedAt ?? b.createdAt)?.getTime() ?? 0) -
                      (toDateSafe(a.updatedAt ?? a.createdAt)?.getTime() ?? 0)
                  )
                  .map((j) => {
                  const statusInfo = getStatusInfo(j.status);
                  const isBusy = journalActionLoading === j.id;
                  return (
                    <div
                      key={j.id}
                      className="border border-emerald-100 p-3 sm:p-4 rounded-2xl bg-emerald-50/50 flex flex-col gap-2.5 relative overflow-hidden"
                    >
                      <span className={`absolute left-0 top-0 bottom-0 w-1 ${statusInfo.dotClass}`} />
                      <div className="flex flex-col items-start gap-2 sm:flex-row sm:justify-between sm:items-center pl-1">
                        <button
                          onClick={() => setSelectedStudent(j.studentName)}
                          className="max-w-full text-left font-bold text-emerald-900 hover:underline break-words"
                        >
                          {j.studentName}
                          {j.classCode && (
                            <span className="ml-2 text-xs font-normal text-emerald-700/50">
                              · Kelas {j.classCode}
                            </span>
                          )}
                        </button>
                        <span
                          className={`text-xs px-2 py-1 rounded-lg font-semibold ${statusInfo.badgeClass}`}
                        >
                          {statusInfo.badge}
                        </span>
                      </div>

                      <div className="grid gap-1 text-xs text-emerald-700/70 sm:grid-cols-2 pl-1">
                        <p>
                          <strong>Upload:</strong> {formatTanggal(toDateSafe(j.createdAt))}
                        </p>
                        <p>
                          <strong>Validator:</strong>{" "}
                          {j.approvedBy ? (
                            <span className="font-semibold text-emerald-800">{j.approvedBy}</span>
                          ) : (
                            <span className="text-slate-500">Belum divalidasi</span>
                          )}
                        </p>
                      </div>

                      {(statusInfo.key === "approved" || statusInfo.key === "revision") && (
                        <p className="text-xs text-emerald-700/60 pl-1">
                          <strong>Terakhir diubah:</strong>{" "}
                          <span className="font-semibold text-emerald-800">
                            {formatTanggal(toDateSafe(j.updatedAt || j.createdAt))}
                          </span>
                        </p>
                      )}

                      {statusInfo.key === "revision" && (
                        <p className="text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-2 py-1.5 ml-1">
                          <strong>Alasan revisi:</strong> {j.teacherFeedback || "-"}
                        </p>
                      )}

                      <p className="text-xs sm:text-sm text-emerald-800/80 break-words pl-1">
                        <strong>Buku:</strong> {j.bookTitle} ({j.author})
                        {j.genre ? ` · ${j.genre}` : ""} — Hal. {j.startPage}-{j.endPage}
                        {j.finished ? " · ✅ Selesai dibaca" : ""}
                      </p>
                      <p className="text-xs sm:text-sm text-emerald-800/80 break-words pl-1">
                        <strong>Nilai Karakter:</strong> {getCharacterList(j).join(", ") || "-"}
                      </p>
                      <p className="text-xs sm:text-sm text-emerald-700/70 italic break-words pl-1">&quot;{j.summary}&quot;</p>
                      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center pl-1">
                        <input
                          type="text"
                          placeholder="Umpan balik / alasan revisi..."
                          className="min-w-0 w-full flex-1 p-2 text-sm bg-white border border-emerald-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 transition"
                          value={feedbackInput[j.id] ?? j.teacherFeedback ?? ""}
                          onChange={(e) =>
                            setFeedbackInput({ ...feedbackInput, [j.id]: e.target.value })
                          }
                        />
                        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
                          <button
                            onClick={() => void handleApprove(j.id)}
                            disabled={statusInfo.key === "approved" || isBusy || deleteJournalLoading === j.id}
                            className="min-w-0 px-2 py-2 bg-emerald-600 text-white text-xs sm:text-sm font-semibold rounded-xl hover:bg-emerald-700 active:scale-[0.98] transition disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:active:scale-100"
                          >
                            {isBusy ? "Memproses..." : statusInfo.key === "approved" ? "Sudah Valid" : "Validasi"}
                          </button>
                          <button
                            onClick={() => void handleUpdateJournalStatus(j.id, "revision")}
                            disabled={statusInfo.key === "revision" || isBusy}
                            className="min-w-0 px-2 py-2 bg-orange-500 text-white text-xs sm:text-sm font-semibold rounded-xl hover:bg-orange-600 active:scale-[0.98] transition disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:active:scale-100"
                          >
                            Perlu Revisi
                          </button>
                          {statusInfo.key === "approved" && (
                            <button
                              onClick={() => void handleCancelApproval(j.id)}
                              disabled={isBusy}
                              className="flex min-w-0 items-center justify-center gap-1.5 px-2 py-2 border border-emerald-300 text-emerald-700 bg-white text-xs sm:text-sm font-semibold rounded-xl hover:bg-emerald-50 active:scale-[0.98] transition disabled:opacity-50"
                            >
                              <Undo2 className="w-4 h-4" />
                              Batalkan Validasi
                            </button>
                          )}
                          <button
                            onClick={() => void handleDeleteJournal(j.id)}
                            disabled={deleteJournalLoading === j.id || journalActionLoading === j.id}
                            aria-label={`Hapus jurnal ${j.bookTitle}`}
                            className="flex items-center justify-center px-3 py-2 text-red-600 border border-red-200 bg-red-50 rounded-xl hover:bg-red-100 transition disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-red-50"
                          >
                            {deleteJournalLoading === j.id ? "..." : <Trash2 className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ---- Tab: Kelola Data ---- */}
        {activeTab === "kelola" && (
          <div className="space-y-4">
            <div className="bg-white/85 backdrop-blur-sm p-4 sm:p-6 rounded-2xl sm:rounded-3xl shadow-[0_1px_2px_rgba(6,95,70,0.04),0_8px_20px_-12px_rgba(6,95,70,0.15)] ring-1 ring-emerald-100/70">
              <h2 className="text-base sm:text-lg font-bold text-emerald-900 flex items-center gap-2">
                <Settings2 className="w-5 h-5 text-emerald-600" />
                Kelola Data Siswa
              </h2>
              <p className="text-xs text-emerald-700/60 mt-1">
                Ubah profil siswa atau hapus data profil beserta seluruh jurnalnya.
                Penghapusan akun login Firebase memerlukan backend Admin SDK.
              </p>
              {managementError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mt-4">
                  {managementError}
                </p>
              )}
              {managementMessage && (
                <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 mt-4">
                  {managementMessage}
                </p>
              )}
            </div>



            <div className="bg-white/85 backdrop-blur-sm p-4 sm:p-6 rounded-2xl sm:rounded-3xl shadow-[0_1px_2px_rgba(6,95,70,0.04),0_8px_20px_-12px_rgba(6,95,70,0.15)] ring-1 ring-emerald-100/70">
              <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <Search className="w-5 h-5 text-emerald-700/60 shrink-0" />
                <input
                  type="text"
                  placeholder="Cari nama siswa..."
                  value={managementStudentSearch}
                  onChange={(e) => setManagementStudentSearch(e.target.value)}
                  className="flex-1 px-4 py-2 text-sm border border-emerald-200 rounded-xl bg-emerald-50/50 outline-none focus:ring-2 focus:ring-emerald-400"
                />
              </div>

              {/* Filter Kelas */}
              <div className="mb-4 pb-4 border-b border-emerald-100">
                <p className="text-xs sm:text-sm font-semibold text-emerald-700/70 mb-2.5">Filter Kelas</p>
                <div className="flex flex-wrap gap-1.5 sm:gap-2">
                  <button
                    onClick={() => setManagementClassFilter("all")}
                    className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-md sm:rounded-lg text-xs font-semibold transition ${
                      managementClassFilter === "all"
                        ? "bg-emerald-600 text-white shadow-sm"
                        : "bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100"
                    }`}
                  >
                    Semua Kelas
                  </button>
                  {managementAvailableClasses.map((classCode) => (
                    <button
                      key={classCode}
                      onClick={() => setManagementClassFilter(classCode)}
                      className={`px-2 sm:px-3 py-0.5 sm:py-1.5 rounded-md sm:rounded-lg text-xs font-semibold transition ${
                        managementClassFilter === classCode
                          ? "bg-emerald-600 text-white shadow-sm"
                          : "bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100"
                      }`}
                    >
                      {classCode}
                    </button>
                  ))}
                </div>
              </div>

              {/* Bulk Delete Section */}
              {selectedStudentsForDelete.size > 0 && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-red-800">
                    {selectedStudentsForDelete.size} siswa dipilih untuk dihapus
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSelectedStudentsForDelete(new Set())}
                      className="px-3 py-1.5 text-sm font-semibold text-red-700 border border-red-200 bg-white rounded-lg hover:bg-red-50 transition"
                    >
                      Batal Hapus
                    </button>
                    <button
                      onClick={handleDeleteSelectedStudents}
                      disabled={managementLoading}
                      className="px-3 py-1.5 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 transition"
                    >
                      {managementLoading ? "Menghapus..." : `Hapus ${selectedStudentsForDelete.size} Siswa`}
                    </button>
                  </div>
                </div>
              )}

              {allStudents.length === 0 ? (
                <p className="text-sm text-emerald-700/60">Belum ada akun siswa.</p>
              ) : groupedStudentsByClass.length === 0 ? (
                <p className="text-sm text-emerald-700/60">Tidak ada siswa yang cocok dengan pencarian &quot;{managementStudentSearch}&quot;.</p>
              ) : (
                <div className="space-y-6">
                  {groupedStudentsByClass.map(({ classCode, students }) => {
                    const allSelectedInClass = students.every((s) => selectedStudentsForDelete.has(s.uid));
                    const someSelectedInClass = students.some((s) => selectedStudentsForDelete.has(s.uid)) && !allSelectedInClass;
                    
                    return (
                      <div key={classCode} className="border border-emerald-200 rounded-2xl overflow-hidden">
                        <div className="bg-gradient-to-r from-emerald-600 to-emerald-500 px-4 py-3 sm:py-4 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleSelectAllInClass(classCode, students)}
                              aria-label={`${allSelectedInClass ? "Deselect" : "Select"} all students in ${classCode}`}
                              className="p-1 hover:bg-emerald-500/30 rounded transition"
                            >
                              {allSelectedInClass ? (
                                <CheckSquare2 className="w-5 h-5 text-white" />
                              ) : someSelectedInClass ? (
                                <div className="w-5 h-5 border-2 border-white rounded bg-emerald-600 flex items-center justify-center">
                                  <span className="text-white text-xs font-bold">-</span>
                                </div>
                              ) : (
                                <Square className="w-5 h-5 text-white opacity-60" />
                              )}
                            </button>
                            <h4 className="text-sm sm:text-base font-bold text-white">
                              Kelas {classCode} ({students.length} siswa)
                            </h4>
                          </div>
                        </div>
                        <div className="divide-y divide-emerald-100 bg-emerald-50/40">
                          {students.map((student) => {
                            const isEditingThis = editingStudent?.uid === student.uid;
                            return (
                              <>
                                <div key={student.uid} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 sm:p-4">
                              <div className="flex items-start gap-3 min-w-0 flex-1">
                                <button
                                  onClick={() => handleToggleSelectStudent(student.uid)}
                                  aria-label={`${selectedStudentsForDelete.has(student.uid) ? "Deselect" : "Select"} ${student.name}`}
                                  className="mt-0.5 p-1 hover:bg-emerald-100 rounded transition shrink-0"
                                >
                                  {selectedStudentsForDelete.has(student.uid) ? (
                                    <CheckSquare2 className="w-5 h-5 text-emerald-600" />
                                  ) : (
                                    <Square className="w-5 h-5 text-emerald-600 opacity-40" />
                                  )}
                                </button>
                                <div className="min-w-0 flex-1">
                                  <p className="font-semibold text-emerald-900 truncate">{student.name}</p>
                                  <p className="text-xs text-emerald-700/60 flex items-center gap-1 flex-wrap mt-0.5">
                                    <Mail className="w-3 h-3 shrink-0" />
                                    <span className="truncate">{student.email || "Email tidak tersedia"}</span>
                                    {student.gender ? <span>· {formatGender(student.gender)}</span> : ""}
                                  </p>
                                </div>
                              </div>
                              <div className="flex gap-2 shrink-0 flex-wrap">
                                <button
                                  onClick={() => startEditingStudent(student)}
                                  aria-label={`Ubah profil ${student.name}`}
                                  className="flex items-center gap-1.5 px-3 py-1.5 text-emerald-700 border border-emerald-200 bg-white rounded-lg text-xs font-semibold hover:bg-emerald-50 transition"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                  Ubah
                                </button>
                                <button
                                  onClick={() => void handleDeleteStudent(student)}
                                  disabled={managementLoading}
                                  aria-label={`Hapus data ${student.name}`}
                                  className="flex items-center gap-1.5 px-3 py-1.5 text-red-600 border border-red-200 bg-red-50 rounded-lg text-xs font-semibold hover:bg-red-100 disabled:opacity-50 transition"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  Hapus Data
                                </button>
                              </div>
                            </div>
                            {isEditingThis && (
                              <div className="bg-emerald-100/40 border-t-2 border-emerald-200 p-4 sm:p-5">
                                <h3 className="text-sm font-semibold text-emerald-800 mb-3">Ubah Profil Siswa: {student.name}</h3>
                                <div className="space-y-3">
                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <input
                                      value={studentForm.name}
                                      onChange={(e) => setStudentForm({ ...studentForm, name: e.target.value })}
                                      placeholder="Nama lengkap"
                                      className="p-2 text-sm bg-white border border-emerald-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-400"
                                    />
                                    <input
                                      value={studentForm.classCode}
                                      onChange={(e) => setStudentForm({ ...studentForm, classCode: e.target.value })}
                                      placeholder="Kelas, contoh 7A"
                                      className="p-2 text-sm bg-white border border-emerald-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-400"
                                    />
                                    <select
                                      value={studentForm.gender}
                                      onChange={(e) => setStudentForm({ ...studentForm, gender: e.target.value })}
                                      className="p-2 text-sm bg-white border border-emerald-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-400"
                                    >
                                      <option value="">Gender belum dipilih</option>
                                      <option value="laki-laki">Laki-laki</option>
                                      <option value="perempuan">Perempuan</option>
                                    </select>
                                  </div>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <input
                                      type="email"
                                      value={studentForm.email}
                                      onChange={(e) => setStudentForm({ ...studentForm, email: e.target.value })}
                                      placeholder="Email"
                                      className="p-2 text-sm bg-white border border-emerald-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-400"
                                    />
                                  </div>
                                </div>
                                <div className="flex gap-2 mt-3">
                                  <button
                                    onClick={handleUpdateStudent}
                                    disabled={managementLoading}
                                    className="px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition"
                                  >
                                    {managementLoading ? "Menyimpan..." : "Simpan Perubahan"}
                                  </button>
                                  <button
                                    onClick={() => setEditingStudent(null)}
                                    className="px-4 py-2 border border-emerald-200 text-emerald-800 text-sm font-semibold rounded-xl hover:bg-emerald-50 transition"
                                  >
                                    Batal
                                  </button>
                                </div>
                              </div>
                            )}
                              </>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ---- Tab: Laporan ---- */}
        {activeTab === "laporan" && (
          <div className="bg-white/85 backdrop-blur-sm p-4 sm:p-6 rounded-2xl sm:rounded-3xl shadow-[0_1px_2px_rgba(6,95,70,0.04),0_8px_20px_-12px_rgba(6,95,70,0.15)] ring-1 ring-emerald-100/70 space-y-4">
            <h2 className="text-base sm:text-lg font-bold text-emerald-900 flex items-center gap-2">
              <FileBarChart2 className="w-5 h-5 text-emerald-600" />
              Laporan
            </h2>
            <p className="text-sm text-emerald-700/70">
              Pilih jenis rekapan lalu unduh sebagai CSV / Excel, atau cetak ringkasan. File CSV
              yang diunduh berisi rincian per buku: nama siswa, kelas, jumlah buku, judul buku,
              penulis, genre, halaman, dan nilai karakter.
            </p>

            <div className="flex flex-wrap gap-2">
              {(
                [
                  { key: "kelas", label: "Rekapan Per Kelas" },
                  { key: "siswa", label: "Rekapan Per Siswa" },
                ] as { key: ReportView; label: string }[]
              ).map((r) => (
                <button
                  key={r.key}
                  onClick={() => setReportView(r.key)}
                  className={`px-3 py-1.5 rounded-xl text-sm font-semibold transition ${
                    reportView === r.key
                      ? "bg-emerald-600 text-white"
                      : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-emerald-50/50 border border-emerald-100 rounded-2xl p-3">
              {reportView === "kelas" && (
                <div>
                  <label className="text-xs text-emerald-700/70 mb-1 block">Kelas laporan</label>
                  <select
                    value={reportClass}
                    onChange={(e) => setReportClass(e.target.value)}
                    className="w-full p-2 text-sm bg-white border border-emerald-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-400"
                  >
                    <option value="all">Semua kelas</option>
                    {availableClasses.map((classCode) => (
                      <option key={classCode} value={classCode}>{classCode}</option>
                    ))}
                  </select>
                  <p className="text-[11px] text-emerald-700/50 mt-1">
                    CSV akan berisi tiap siswa di kelas ini beserta rincian buku yang mereka baca.
                  </p>
                </div>
              )}

              {reportView === "siswa" && (
                <div>
                  <label className="text-xs text-emerald-700/70 mb-1 block">Laporan Siswa</label>
                  <select
                    value={reportStudent}
                    onChange={(e) => setReportStudent(e.target.value)}
                    className="w-full p-2 text-sm bg-white border border-emerald-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-400"
                  >
                    <option value="all">Semua siswa</option>
                    {studentSummaries
                      .slice()
                      .sort((a, b) => a.name.localeCompare(b.name, "id"))
                      .map((s) => (
                        <option key={s.name} value={s.name}>
                          {s.name} (Kelas {s.classCode})
                        </option>
                      ))}
                  </select>
                  <p className="text-[11px] text-emerald-700/50 mt-1">
                    Daftar ini mencakup seluruh siswa terdaftar (termasuk yang belum pernah kirim
                    jurnal). Pilih satu siswa untuk laporan personal, atau &quot;Semua siswa&quot;
                    untuk laporan gabungan seluruh siswa aktif.
                  </p>
                </div>
              )}

              <div>
                <label className="text-xs text-emerald-700/70 mb-1 block">Periode</label>
                <select
                  value={reportPeriod}
                  onChange={(e) => setReportPeriod(e.target.value as ReportPeriod)}
                  className="w-full p-2 text-sm bg-white border border-emerald-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-400"
                >
                  <option value="all">Semua waktu (all time)</option>
                  <option value="month">Bulanan</option>
                </select>
              </div>

              {reportPeriod === "month" && (
                <div>
                  <label className="text-xs text-emerald-700/70 mb-1 block">Pilih bulan</label>
                  <input
                    type="month"
                    value={reportMonth}
                    onChange={(e) => setReportMonth(e.target.value)}
                    className="w-full p-2 text-sm bg-white border border-emerald-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                </div>
              )}
            </div>

            <p className="text-xs text-emerald-700/60">
              {reportView === "siswa"
                ? reportStudent === "all"
                  ? `Menampilkan ${reportStudentSummariesForExport.length} siswa (${reportPeriodLabel}).`
                  : `Laporan personal ${reportStudent} (${reportPeriodLabel}) · ${
                      reportSelectedStudentSummary?.totalJournals ?? 0
                    } jurnal.`
                : `Menampilkan ${reportClassStudentSummaries.length} siswa untuk ${
                    reportClass === "all" ? "semua kelas" : `kelas ${reportClass}`
                  } (${reportPeriodLabel}).`}
            </p>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleExportCSV}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 active:scale-[0.98] transition"
              >
                <Download className="w-4 h-4" />
                Unduh CSV / Excel (Detail)
              </button>
              <button
                onClick={handleExportBooksAndCharacters}
                className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 active:scale-[0.98] transition"
              >
                <Download className="w-4 h-4" />
                Unduh Buku & Karakter
              </button>
              <button
                onClick={handlePrint}
                className="flex items-center gap-2 px-4 py-2 border border-emerald-200 text-emerald-800 text-sm font-semibold rounded-xl hover:bg-emerald-50 active:scale-[0.98] transition"
              >
                <Printer className="w-4 h-4" />
                Cetak
              </button>
            </div>

            {/* Section khusus Buku & Nilai Karakter */}
            <div className="border border-emerald-100 rounded-2xl p-4 bg-emerald-50/30">
              <h3 className="text-sm font-semibold text-emerald-800 mb-3">
                Buku & Nilai Karakter ({reportPeriodLabel})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="text-xs font-semibold text-emerald-700/70 mb-2">
                    Top 10 Buku Paling Banyak Dibaca (Siswa)
                  </h4>
                  {reportTopBooks.length === 0 ? (
                    <p className="text-sm text-emerald-700/50">Belum ada data buku pada periode ini.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {reportTopBooks.map(([title, count], idx) => (
                        <li key={title} className="flex items-center justify-between gap-2 text-sm">
                          <span className="flex items-center gap-2 min-w-0">
                            <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center justify-center shrink-0">
                              {idx + 1}
                            </span>
                            <span className="font-medium text-emerald-900 truncate">{title}</span>
                          </span>
                          <span className="text-xs text-emerald-700/60 shrink-0">{count} siswa</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-emerald-700/70 mb-2">
                    Top 10 Nilai Karakter Paling Sering Disebut (Siswa)
                  </h4>
                  {reportTopCharacters.length === 0 ? (
                    <p className="text-sm text-emerald-700/50">Belum ada data nilai karakter pada periode ini.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {reportTopCharacters.map(([val, count], idx) => (
                        <li key={val} className="flex items-center justify-between gap-2 text-sm">
                          <span className="flex items-center gap-2 min-w-0">
                            <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold flex items-center justify-center shrink-0">
                              {idx + 1}
                            </span>
                            <span className="font-medium text-emerald-900 truncate">{val}</span>
                          </span>
                          <span className="text-xs text-emerald-700/60 shrink-0">{count} siswa</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>

            <div className="border-t border-emerald-100 pt-4">
              <h3 className="text-sm font-semibold text-emerald-800 mb-2">Pratinjau</h3>

              {/* ---- Pratinjau: Rekapan Per Kelas ---- */}
              {reportView === "kelas" && (
                <div>
                  {reportClassSummaries.length === 0 ? (
                    <p className="text-sm text-emerald-700/60">Belum ada data untuk periode ini.</p>
                  ) : (
                    <>
                      {/* Mobile: kartu */}
                      <div className="grid grid-cols-1 xs:grid-cols-2 gap-2.5 md:hidden">
                        {reportClassSummaries.map((summary) => (
                          <ClassSummaryCard key={summary.classCode} summary={summary} />
                        ))}
                      </div>
                      {/* Desktop: tabel */}
                      <div className="hidden md:block overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-emerald-700/60 border-b border-emerald-100">
                              <th className="py-2 pr-2">Kelas</th>
                              <th className="py-2 pr-2">Total Siswa</th>
                              <th className="py-2 pr-2">Siswa Aktif</th>
                              <th className="py-2 pr-2">Total Jurnal</th>
                              <th className="py-2 pr-2">Tervalidasi</th>
                              <th className="py-2 pr-2">Perlu Revisi</th>
                              <th className="py-2 pr-2">Menunggu</th>
                              <th className="py-2 pr-2">Halaman</th>
                              <th className="py-2">Buku Selesai</th>
                            </tr>
                          </thead>
                          <tbody>
                            {reportClassSummaries.map((summary) => (
                              <tr key={summary.classCode} className="border-b border-emerald-50 last:border-0 hover:bg-emerald-50/40 transition-colors">
                                <td className="py-2 pr-2 font-semibold text-emerald-900">{summary.classCode}</td>
                                <td className="py-2 pr-2 text-emerald-800/80">{summary.totalStudents}</td>
                                <td className="py-2 pr-2 text-emerald-800/80">{summary.activeStudents}</td>
                                <td className="py-2 pr-2 text-emerald-800/80">{summary.totalJournals}</td>
                                <td className="py-2 pr-2 text-emerald-800/80">{summary.approvedCount}</td>
                                <td className="py-2 pr-2 text-emerald-800/80">{summary.revisionCount}</td>
                                <td className="py-2 pr-2 text-emerald-800/80">{summary.pendingCount}</td>
                                <td className="py-2 pr-2 text-emerald-800/80">{summary.totalPagesRead}</td>
                                <td className="py-2 text-emerald-800/80">{summary.booksFinished}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                  <p className="text-[11px] text-emerald-700/50 mt-2">
                    Pratinjau di atas ringkasan per kelas. File CSV yang diunduh akan lebih rinci —
                    per siswa dan per buku.
                  </p>
                </div>
              )}

              {/* ---- Pratinjau: Rekapan Per Siswa ---- */}
              {reportView === "siswa" &&
                (reportStudent === "all" ? (
                  <div>
                    {reportStudentSummariesForExport.length === 0 ? (
                      <p className="text-sm text-emerald-700/60">Belum ada data untuk periode ini.</p>
                    ) : (
                      <>
                        {/* Mobile: kartu */}
                        <div className="grid grid-cols-1 xs:grid-cols-2 gap-2.5 md:hidden">
                          {reportStudentSummariesForExport.map((s) => (
                            <StudentSummaryCard key={s.name} s={s} />
                          ))}
                        </div>
                        {/* Desktop: tabel */}
                        <div className="hidden md:block overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left text-emerald-700/60 border-b border-emerald-100">
                                <th className="py-2">Nama Siswa</th>
                                <th className="py-2">Kelas</th>
                                <th className="py-2">Gender</th>
                                <th className="py-2">Total Jurnal</th>
                                <th className="py-2">Tervalidasi</th>
                                <th className="py-2">Perlu Revisi</th>
                                <th className="py-2">Menunggu</th>
                                <th className="py-2">Halaman</th>
                                <th className="py-2">Buku Selesai</th>
                              </tr>
                            </thead>
                            <tbody>
                              {reportStudentSummariesForExport.map((s) => (
                                <tr key={s.name} className="border-b border-emerald-50 last:border-0 hover:bg-emerald-50/40 transition-colors">
                                  <td className="py-2 font-medium text-emerald-900">{s.name}</td>
                                  <td className="py-2 text-emerald-800/80">{s.classCode}</td>
                                  <td className="py-2 text-emerald-800/80">{formatGender(s.gender)}</td>
                                  <td className="py-2 text-emerald-800/80">{s.totalJournals}</td>
                                  <td className="py-2 text-emerald-800/80">{s.approvedCount}</td>
                                  <td className="py-2 text-emerald-800/80">{s.revisionCount}</td>
                                  <td className="py-2 text-emerald-800/80">{s.pendingCount}</td>
                                  <td className="py-2 text-emerald-800/80">{s.totalPagesRead}</td>
                                  <td className="py-2 text-emerald-800/80">{s.booksFinished}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                    <p className="text-[11px] text-emerald-700/50 mt-2">
                      Pratinjau di atas ringkasan per siswa. File CSV yang diunduh akan lebih rinci —
                      per buku, lengkap dengan judul, penulis, genre, halaman, dan nilai karakter.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {!reportSelectedStudentSummary || reportSelectedStudentSummary.totalJournals === 0 ? (
                      <p className="text-sm text-emerald-700/60">
                        Belum ada jurnal dari {reportStudent} pada periode ini.
                      </p>
                    ) : (
                      <>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-base font-bold text-emerald-900">
                              {reportSelectedStudentSummary.name}
                            </p>
                            <p className="text-xs text-emerald-700/60">
                              Kelas {reportSelectedStudentSummary.classCode}
                              {reportSelectedStudentSummary.gender
                                ? ` · ${formatGender(reportSelectedStudentSummary.gender)}`
                                : ""}
                            </p>
                          </div>
                          <p className="text-xs text-emerald-700/50">
                            Kirim jurnal terakhir: {formatTanggal(reportSelectedStudentSummary.lastSubmission)}
                          </p>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <StatCard
                            label="Total Jurnal"
                            value={reportSelectedStudentSummary.totalJournals}
                            icon={<BookOpen className="w-4 h-4" />}
                            color="emerald"
                          />
                          <StatCard
                            label="Halaman Dibaca"
                            value={reportSelectedStudentSummary.totalPagesRead}
                            icon={<Library className="w-4 h-4" />}
                            color="blue"
                          />
                          <StatCard
                            label="Buku Selesai"
                            value={reportSelectedStudentSummary.booksFinished}
                            icon={<CheckCircle2 className="w-4 h-4" />}
                            color="orange"
                          />
                          <StatCard
                            label="Perlu Revisi / Menunggu"
                            value={reportSelectedStudentSummary.revisionCount + reportSelectedStudentSummary.pendingCount}
                            icon={<Clock className="w-4 h-4" />}
                            color="yellow"
                          />
                        </div>

                        <div>
                          <h4 className="text-xs font-semibold text-emerald-700/70 mb-2">
                            Rincian Jurnal ({reportPeriodLabel})
                          </h4>
                          <div className="space-y-2">
                            {reportSelectedStudentSummary.journals
                              .slice()
                              .sort(
                                (a, b) =>
                                  (toDateSafe(b.createdAt)?.getTime() || 0) -
                                  (toDateSafe(a.createdAt)?.getTime() || 0)
                              )
                              .map((j) => {
                                const statusInfo = getStatusInfo(j.status);
                                return (
                                  <div key={j.id} className="border border-emerald-100 p-3 rounded-xl bg-emerald-50/50">
                                    <div className="flex justify-between items-center mb-1">
                                      <p className="text-sm font-semibold text-emerald-900">
                                        {j.bookTitle}{" "}
                                        <span className="font-normal text-emerald-700/60">({j.author})</span>
                                      </p>
                                      <span
                                        className={`text-xs px-2 py-0.5 rounded-lg font-semibold ${statusInfo.badgeClass}`}
                                      >
                                        {statusInfo.csv}
                                      </span>
                                    </div>
                                    <p className="text-xs text-emerald-700/60">
                                      Hal. {j.startPage}-{j.endPage}
                                      {j.finished ? " · Selesai dibaca" : ""} ·{" "}
                                      {formatTanggal(toDateSafe(j.createdAt))}
                                    </p>
                                    <p className="text-xs text-emerald-700/60 mt-0.5">
                                      <strong>Nilai Karakter:</strong> {getCharacterList(j).join(", ") || "-"}
                                    </p>
                                    <p className="text-xs text-emerald-700/60 mt-0.5">
                                      <strong>Upload:</strong> {formatTanggal(toDateSafe(j.createdAt))}
                                    </p>
                                    {j.approvedBy ? (
                                      <p className="text-xs text-emerald-700/60 mt-0.5">
                                        <strong>Validator:</strong> <span className="font-medium">{j.approvedBy}</span>
                                      </p>
                                    ) : (
                                      <p className="text-xs text-emerald-700/60 mt-0.5">
                                        <strong>Validator:</strong> Belum divalidasi
                                      </p>
                                    )}
                                    {(j.updatedAt || j.createdAt) && (
                                      <p className="text-xs text-emerald-700/60 mt-0.5">
                                        <strong>Terakhir diperbarui:</strong>{" "}
                                        {formatTanggal(toDateSafe(j.updatedAt || j.createdAt))}
                                      </p>
                                    )}
                                    {j.teacherFeedback && (
                                      <p className="text-xs text-emerald-800 mt-1">
                                        <strong>
                                          {statusInfo.key === "revision" ? "Alasan revisi" : "Umpan balik"}:
                                        </strong>{" "}
                                        {j.teacherFeedback}
                                      </p>
                                    )}
                                  </div>
                                );
                              })}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                ))}
            </div>

            <div className="border-t border-emerald-100 pt-4">
              <h3 className="text-sm font-semibold text-emerald-800 mb-2">
                Pratinjau Detail Rekapan
              </h3>
              <p className="text-[11px] text-emerald-700/50 mb-2 md:hidden">
                Geser ke kanan untuk melihat semua kolom.
              </p>
              <div className="overflow-x-auto rounded-xl ring-1 ring-emerald-100">
                <table className="w-full min-w-[1200px] text-xs text-slate-700">
                  <thead>
                    <tr className="text-left text-slate-700 border-b border-emerald-100 bg-emerald-50/70">
                      {DETAILED_HEADERS.map((header) => (
                        <th key={header} className="py-2 pr-3 pl-2 align-top first:pl-3 text-slate-700">{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="text-slate-700">
                    {printableRows.map((row, rowIndex) => (
                      <tr key={`${String(row[0])}-${rowIndex}`} className="border-b border-emerald-50 odd:bg-white even:bg-emerald-50/30 text-slate-700">
                        {row.map((field, fieldIndex) => (
                          <td key={`${rowIndex}-${fieldIndex}`} className="py-2 pr-3 pl-2 align-top first:pl-3 text-slate-700">{field}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ---- Versi cetak ---- */}
      <div className="hidden print:block p-6 text-black">
        <h1 className="text-xl font-bold mb-1">
          {reportView === "siswa" ? "Laporan Per Siswa" : "Laporan Per Kelas"}
        </h1>
        <p className="text-sm mb-1">
          {reportView === "siswa"
            ? reportStudent === "all" ? "Semua siswa" : `Siswa: ${reportStudent}`
            : reportClass === "all" ? "Semua kelas" : `Kelas: ${reportClass}`}
        </p>
        <p className="text-sm mb-4">Periode: {reportPeriodLabel} · Dicetak pada {formatTanggal(new Date())}</p>
        <table className="w-full text-[9px] border-collapse">
          <thead>
            <tr className="text-left border-b border-black">
              {DETAILED_HEADERS.map((header) => (
                <th key={header} className="py-1 pr-2 align-top">{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {printableRows.map((row, rowIndex) => (
              <tr key={`${String(row[0])}-${rowIndex}`} className="border-b border-slate-300">
                {row.map((field, fieldIndex) => (
                  <td key={`${rowIndex}-${fieldIndex}`} className="py-1 pr-2 align-top">{field}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ---- Modal Detail Siswa ---- */}
      {selectedStudentData && (
        <div
          className="fixed inset-0 bg-emerald-950/40 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 sm:p-4 print:hidden"
          onClick={() => setSelectedStudent(null)}
        >
          <div
            className="bg-white rounded-t-3xl sm:rounded-2xl shadow-xl max-w-2xl w-full max-h-[92vh] sm:max-h-[90vh] overflow-y-auto p-5 sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-emerald-100 sm:hidden" />
            <div className="flex justify-between items-start mb-4">
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-emerald-900 truncate">{selectedStudentData.name}</h2>
                <p className="text-sm text-emerald-700/70">
                  Kelas {selectedStudentData.classCode}
                  {selectedStudentData.gender
                    ? ` · ${formatGender(selectedStudentData.gender)}`
                    : ""}
                </p>
                <p className="text-xs text-emerald-700/50 mt-0.5">
                  Kirim jurnal terakhir: {formatTanggal(selectedStudentData.lastSubmission)}
                </p>
              </div>
              <button
                onClick={() => setSelectedStudent(null)}
                className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50 transition"
                aria-label="Tutup"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
              <StatCard
                label="Total Jurnal"
                value={selectedStudentData.totalJournals}
                icon={<BookOpen className="w-4 h-4" />}
                color="emerald"
              />
              <StatCard
                label="Total Halaman"
                value={selectedStudentData.totalPagesRead}
                icon={<Library className="w-4 h-4" />}
                color="blue"
              />
              <StatCard
                label="Buku Selesai"
                value={selectedStudentData.booksFinished}
                icon={<CheckCircle2 className="w-4 h-4" />}
                color="orange"
              />
              <StatCard
                label="Perlu Revisi / Menunggu"
                value={selectedStudentData.revisionCount + selectedStudentData.pendingCount}
                icon={<Clock className="w-4 h-4" />}
                color="yellow"
              />
            </div>

            <div className="mb-5 bg-emerald-50/50 rounded-2xl p-3 border border-emerald-100">
              <h3 className="text-sm font-semibold text-emerald-800 mb-2">
                Grafik Perkembangan Membaca (Harian)
              </h3>
              <DailyProgressChart journals={selectedStudentData.journals} />
            </div>

            <h3 className="text-sm font-semibold text-emerald-800 mb-2">Riwayat Jurnal</h3>
            <div className="space-y-3">
              {selectedStudentData.journals.length === 0 ? (
                <p className="text-sm text-emerald-700/60">Belum ada jurnal.</p>
              ) : (
                selectedStudentData.journals.map((j) => {
                  const statusInfo = getStatusInfo(j.status);
                  return (
                    <div
                      key={j.id}
                      className="border border-emerald-100 p-3 rounded-xl bg-emerald-50/50"
                    >
                      <div className="flex justify-between items-center mb-1">
                        <p className="text-sm font-semibold text-emerald-900">
                          {j.bookTitle}{" "}
                          <span className="font-normal text-emerald-700/60">({j.author})</span>
                        </p>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-lg font-semibold ${statusInfo.badgeClass}`}
                        >
                          {statusInfo.csv}
                        </span>
                      </div>
                      <p className="text-xs text-emerald-700/60 mb-1">
                        Hal. {j.startPage}-{j.endPage}
                        {j.finished ? " · Selesai dibaca" : ""} · Nilai Karakter:{" "}
                        {getCharacterList(j).join(", ") || "-"}
                      </p>
                      {statusInfo.key === "approved" && j.approvedBy && (
                        <p className="text-xs text-emerald-700/60 mb-1">
                          Divalidasi oleh: <span className="font-medium">{j.approvedBy}</span>
                        </p>
                      )}
                      <p className="text-xs text-emerald-800/70 italic">&quot;{j.summary}&quot;</p>
                      {j.approvedBy ? (
                        <p className="text-xs text-emerald-700/60 mt-1">
                          <strong>Validator:</strong> <span className="font-medium">{j.approvedBy}</span>
                        </p>
                      ) : (
                        <p className="text-xs text-emerald-700/60 mt-1">
                          <strong>Validator:</strong> Belum divalidasi
                        </p>
                      )}

                      {/* Progress Log — tampil riwayat membaca bertahap jika ada */}
                      {j.progressLog && j.progressLog.length > 0 && (
                        <div className="mt-2 text-xs rounded-lg bg-blue-50 border border-blue-200 p-2">
                          <strong className="block text-blue-900 mb-1">📚 Log Progres Membaca:</strong>
                          <div className="space-y-1">
                            {j.progressLog
                              .slice()
                              .sort(
                                (a, b) =>
                                  (toDateSafe(b.timestamp)?.getTime() ?? 0) -
                                  (toDateSafe(a.timestamp)?.getTime() ?? 0)
                              )
                              .map((progress, idx) => (
                                <div key={progress.id} className="text-blue-800">
                                  <span className="font-medium">#{j.progressLog!.length - idx}.</span> Hal.{" "}
                                  {progress.startPage}-{progress.endPage} ({progress.endPage - progress.startPage} hal.)
                                  {progress.timestamp && (
                                    <span className="text-blue-700 ml-1">
                                      • {formatTanggal(toDateSafe(progress.timestamp))}
                                    </span>
                                  )}
                                  <br />
                                  <span className="italic text-blue-700">&quot;{progress.summary}&quot;</span>
                                </div>
                              ))}
                          </div>
                        </div>
                      )}

                      {j.teacherFeedback && (
                        <p className="text-xs text-emerald-800 mt-1">
                          <strong>{statusInfo.key === "revision" ? "Alasan revisi" : "Umpan balik"}:</strong>{" "}
                          {j.teacherFeedback}
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function buildLeaderboard(journalsInput: Journal[], limit = 10): LeaderboardEntry[] {
  const statsByStudent = new Map<
    string,
    { studentName: string; classCode: string; journalCount: number; finishedTitles: Set<string> }
  >();

  journalsInput.forEach((journal) => {
    if (!journal.studentId) return;
    const stats = statsByStudent.get(journal.studentId) || {
      studentName: journal.studentName || "Siswa",
      classCode: journal.classCode || "-",
      journalCount: 0,
      finishedTitles: new Set<string>(),
    };
    stats.journalCount += 1;
    if (journal.finished && journal.bookTitle) {
      stats.finishedTitles.add(journal.bookTitle.trim().toLowerCase());
    }
    statsByStudent.set(journal.studentId, stats);
  });

  return Array.from(statsByStudent.entries())
    .map(([studentId, stats]) => ({
      studentId,
      studentName: stats.studentName,
      classCode: stats.classCode,
      journalCount: stats.journalCount,
      booksFinished: stats.finishedTitles.size,
    }))
    .sort((a, b) => b.journalCount - a.journalCount || b.booksFinished - a.booksFinished)
    .slice(0, limit);
}