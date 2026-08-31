"use client";

import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, doc, updateDoc, deleteDoc } from "firebase/firestore";
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
  UserCircle2,
  Pencil,
  Trash2,
  Flower2,
  Heart,
  Sparkles,
  Star,
  Sun,
  Undo2,
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
  classCode: string;
  finished?: boolean;
  createdAt?: any;
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

type TabKey = "ringkasan" | "pendampingan" | "jurnal" | "laporan" | "kelola";
type ReportView = "kelas" | "siswa";
type ReportPeriod = "all" | "month";

function getCurrentMonthInput(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

const INACTIVITY_DAYS = 7;
const LOW_ACTIVITY_RATIO = 0.5;
const PENDING_BACKLOG_THRESHOLD = 3;

function toDateSafe(value: any): Date | null {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
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

function getStartOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
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
} {
  if (status === "approved") {
    return {
      key: "approved",
      badge: "Sudah Divalidasi",
      csv: "Tervalidasi",
      badgeClass: "bg-emerald-100 text-emerald-700",
    };
  }
  if (status === "revision") {
    return {
      key: "revision",
      badge: "Perlu Revisi",
      csv: "Perlu Revisi",
      badgeClass: "bg-orange-100 text-orange-700",
    };
  }
  return {
    key: "pending",
    badge: "Belum Divalidasi",
    csv: "Menunggu",
    badgeClass: "bg-yellow-100 text-yellow-700",
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
  "Tanggal",
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
      ]);
      return;
    }

    s.journals
      .slice()
      .sort(
        (a, b) =>
          (toDateSafe(b.createdAt)?.getTime() || 0) - (toDateSafe(a.createdAt)?.getTime() || 0)
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
        ]);
      });
  });

  return rows;
}

/* ------------------------------------------------------------------ */

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
  const colorMap: Record<string, { bg: string; text: string }> = {
    emerald: { bg: "bg-emerald-100", text: "text-emerald-700" },
    orange: { bg: "bg-orange-100", text: "text-orange-600" },
    blue: { bg: "bg-blue-100", text: "text-blue-700" },
    yellow: { bg: "bg-yellow-100", text: "text-yellow-700" },
    slate: { bg: "bg-slate-100", text: "text-slate-600" },
  };
  const c = colorMap[color];
  return (
    <div className="bg-white/80 backdrop-blur-sm p-4 rounded-2xl shadow-sm shadow-emerald-900/5 border border-emerald-100 flex flex-col gap-2">
      {icon && (
        <div className={`w-8 h-8 rounded-lg ${c.bg} ${c.text} flex items-center justify-center`}>
          {icon}
        </div>
      )}
      <span className="text-2xl font-bold text-emerald-900">{value}</span>
      <span className="text-xs font-medium text-emerald-700/70">{label}</span>
      {sub && <span className="text-xs text-emerald-700/50">{sub}</span>}
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

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full max-w-full h-40">
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
          className="absolute transition-transform duration-500 ease-out"
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
  const [studentForm, setStudentForm] = useState({ name: "", classCode: "", gender: "" });
  const [managementMessage, setManagementMessage] = useState("");
  const [managementError, setManagementError] = useState("");
  const [managementLoading, setManagementLoading] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0.5, y: 0.5 });
  // id jurnal yang sedang diproses (approve/revisi/batalkan) -> mencegah klik ganda
  const [journalActionLoading, setJournalActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && (!user || !["teacher", "admin"].includes(userProfile?.role || ""))) {
      router.push("/login");
    } else if (user && ["teacher", "admin"].includes(userProfile?.role || "")) {
      fetchClassJournals();
      fetchAllStudents();
    }
  }, [user, userProfile, loading]);

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

  const fetchClassJournals = async () => {
    const querySnapshot = await getDocs(collection(db, "journals"));
    const docs: Journal[] = [];
    querySnapshot.forEach((d) => docs.push({ id: d.id, ...d.data() } as Journal));
    setJournals(docs);
  };

  const fetchAllStudents = async () => {
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
  };

  /**
   * Mengganti status sebuah jurnal ke "approved" | "revision" | "pending".
   * - "approved"  -> menandai approvedBy dengan nama guru saat ini.
   * - "revision"  -> WAJIB ada alasan di kolom umpan balik (feedbackInput).
   * - "pending"   -> dipakai untuk "Batalkan Validasi" (approvedBy dikosongkan).
   */
  const handleUpdateJournalStatus = async (journalId: string, newStatus: JournalStatus) => {
    const journal = journals.find((item) => item.id === journalId);
    if (!journal) return;

    const currentStatus = getStatusInfo(journal.status).key;
    if (currentStatus === newStatus) return;

    const feedback = (feedbackInput[journalId] ?? journal.teacherFeedback ?? "").trim();

    if (newStatus === "revision" && !feedback) {
      setManagementError(
        "Tulis alasan revisi di kolom umpan balik jurnal ini sebelum menandainya Perlu Revisi."
      );
      return;
    }

    setManagementError("");
    const teacherName = userProfile?.name || "Guru";
    const updatePayload: Record<string, any> = {
      status: newStatus,
      teacherFeedback: feedback,
      approvedBy: newStatus === "approved" ? teacherName : "",
    };

    setJournalActionLoading(journalId);
    try {
      await updateDoc(doc(db, "journals", journalId), updatePayload);
      await fetchClassJournals();
    } catch {
      setManagementError("Status jurnal gagal diperbarui. Periksa koneksi/izin dan coba lagi.");
    } finally {
      setJournalActionLoading(null);
    }
  };

  const handleCancelApproval = (journalId: string) => {
    if (!window.confirm("Batalkan validasi jurnal ini? Statusnya akan kembali menjadi Menunggu.")) {
      return;
    }
    handleUpdateJournalStatus(journalId, "pending");
  };

  const handleDeleteJournal = async (journalId: string) => {
    if (!window.confirm("Hapus jurnal ini secara permanen?")) return;
    setManagementError("");
    try {
      await deleteDoc(doc(db, "journals", journalId));
      setJournals((current) => current.filter((journal) => journal.id !== journalId));
    } catch {
      setManagementError("Jurnal gagal dihapus. Periksa izin Firebase dan coba lagi.");
    }
  };

  const startEditingStudent = (student: RosterStudent) => {
    setEditingStudent(student);
    setStudentForm({ name: student.name, classCode: student.classCode, gender: student.gender || "" });
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
      await updateDoc(doc(db, "users", editingStudent.uid), {
        name: studentForm.name.trim(),
        classCode: studentForm.classCode.trim().toUpperCase(),
        gender: studentForm.gender,
      });

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
      setManagementMessage("Profil siswa berhasil diperbarui.");
      await Promise.all([fetchAllStudents(), fetchClassJournals()]);
    } catch {
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
      setManagementMessage(`Data ${student.name} berhasil dihapus.`);
      await Promise.all([fetchAllStudents(), fetchClassJournals()]);
    } catch {
      setManagementError("Data siswa gagal dihapus. Coba lagi.");
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
    () => buildStudentSummaries(reportPeriodJournals, allStudents),
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
    const bookHeaders = ["Peringkat", "Judul Buku", "Jumlah Siswa Membaca"];
    const bookRows = reportTopBooks.map(([title, count], idx) => [idx + 1, title, count]);

    const charHeaders = ["Peringkat", "Nilai Karakter", "Jumlah Siswa Menyebutkan"];
    const charRows = reportTopCharacters.map(([val, count], idx) => [idx + 1, val, count]);

    // Gabungkan jadi satu file dengan separator section
    const lines: string[] = [];
    lines.push("=== DAFTAR BUKU TERPOPULER (BERDASARKAN JUMLAH SISWA) ===");
    lines.push(bookHeaders.map((h) => `"${h}"`).join(","));
    bookRows.forEach((r) => lines.push(r.map((f) => `"${String(f).replace(/"/g, '""')}"`).join(",")));
    lines.push("");
    lines.push("=== DAFTAR NILAI KARAKTER TERBANYAK (BERDASARKAN JUMLAH SISWA) ===");
    lines.push(charHeaders.map((h) => `"${h}"`).join(","));
    charRows.forEach((r) => lines.push(r.map((f) => `"${String(f).replace(/"/g, '""')}"`).join(",")));

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
        <p className="text-emerald-700 text-sm font-medium">Memuat...</p>
      </div>
    );
  }

  const teacherName = userProfile?.name || "Guru";
  const tabs: { key: TabKey; label: string }[] = [
    { key: "ringkasan", label: "Rekap Seluruh Siswa" },
    {
      key: "pendampingan",
      label: `Perlu Pendampingan${studentsNeedingAttention.length ? ` (${studentsNeedingAttention.length})` : ""}`,
    },
    { key: "jurnal", label: "Daftar Jurnal" },
    { key: "laporan", label: "Laporan" },
    { key: "kelola", label: "Kelola Data" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-green-50 to-teal-100 p-4 md:p-6 relative print:bg-white print:p-0">
      <CuteBackground mouse={mousePos} />

      <div className="relative max-w-6xl mx-auto print:hidden">
        {/* ---- Header ---- */}
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 bg-white/80 backdrop-blur-sm p-4 rounded-2xl shadow-sm shadow-emerald-900/5 border border-white">
          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-md ring-4 ring-emerald-100">
                <UserCircle2 className="w-9 h-9 text-white" strokeWidth={1.5} />
              </div>
            </div>
            <div>
              <h1 className="text-xl font-bold text-emerald-900">
                Selamat Datang Guru, {teacherName}!
              </h1>
              <p className="text-xs text-emerald-700/60 mt-0.5">
                Semoga Hari Ini Lancar Yaa!
                {availableClasses.length > 0 ? ` · ${availableClasses.length} kelas aktif` : ""}
              </p>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-xl text-sm font-semibold hover:bg-red-100 active:scale-[0.98] transition"
          >
            <LogOut className="w-4 h-4" />
            Keluar
          </button>
        </header>

        <nav className="mb-6 w-full overflow-x-auto rounded-2xl bg-white/80 p-2 shadow-sm shadow-emerald-900/5 border border-white">
          <div className="flex min-w-max gap-2">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`shrink-0 whitespace-nowrap px-3 py-2 rounded-xl text-sm font-semibold transition sm:px-4 ${
                  activeTab === t.key
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-emerald-800/70 hover:bg-emerald-50"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </nav>

        {/* Pesan error global untuk aksi jurnal/siswa (approve, revisi, batalkan, hapus, dll) */}
        {managementError && activeTab !== "kelola" && (
          <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            {managementError}
          </p>
        )}

        {/* ---- Tab: Rekap Kelas ---- */}
        {activeTab === "ringkasan" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
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

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
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
              <div className="bg-white/80 backdrop-blur-sm p-5 rounded-2xl shadow-sm shadow-emerald-900/5 border border-white">
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
              <div className="bg-white/80 backdrop-blur-sm p-5 rounded-2xl shadow-sm shadow-emerald-900/5 border border-white">
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

            <div className="bg-white/80 backdrop-blur-sm p-6 rounded-2xl shadow-sm shadow-emerald-900/5 border border-white">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-lg font-bold text-emerald-900">Rangkuman Kelas Per Bulan</h2>
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
                      className="p-2 text-sm bg-emerald-50/50 border border-emerald-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-400"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-emerald-700/70 mb-1 block">Pilih kelas</label>
                    <select
                      value={classSummaryClass}
                      onChange={(e) => setClassSummaryClass(e.target.value)}
                      className="p-2 text-sm bg-emerald-50/50 border border-emerald-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-400"
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
                <div className="overflow-x-auto">
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
                        <tr key={summary.classCode} className="border-b border-emerald-50 last:border-0">
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
              )}
            </div>

            {/* Daftar siswa */}
            <div className="bg-white/80 backdrop-blur-sm p-6 rounded-2xl shadow-sm shadow-emerald-900/5 border border-white">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <h2 className="text-lg font-bold text-emerald-900">Aktivitas per Siswa</h2>
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
                      className="w-full flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 p-3 rounded-xl bg-emerald-50/70 hover:bg-emerald-100/70 transition text-left"
                    >
                      <div>
                        <span className="font-semibold text-emerald-900">{s.name}</span>
                        <span className="text-xs text-emerald-700/50 ml-2">
                          Kelas {s.classCode}
                          {s.gender ? ` · ${formatGender(s.gender)}` : ""}
                        </span>
                      </div>
                      <span className="text-xs text-emerald-700/70">
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

        {/* ---- Tab: Perlu Pendampingan ---- */}
        {activeTab === "pendampingan" && (
          <div className="bg-white/80 backdrop-blur-sm p-6 rounded-2xl shadow-sm shadow-emerald-900/5 border border-white">
            <h2 className="text-lg font-bold mb-1 text-emerald-900">Siswa yang Perlu Pendampingan</h2>
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
                  <div key={s.name} className="border border-orange-200 bg-orange-50 p-4 rounded-xl">
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex gap-3">
                        <div className="w-8 h-8 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center shrink-0">
                          <AlertTriangle className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="font-bold text-slate-800">
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
                        className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 transition whitespace-nowrap"
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
          <div className="bg-white/80 backdrop-blur-sm p-6 rounded-2xl shadow-sm shadow-emerald-900/5 border border-white">
            <h2 className="text-lg font-bold mb-1 text-emerald-900">Daftar Jurnal Siswa</h2>
            <p className="text-xs text-emerald-700/50 mb-4">
              Untuk menandai jurnal &quot;Perlu Revisi&quot;, isi dulu kolom umpan balik dengan
              alasannya (misalnya typo atau ringkasan kurang lengkap), baru klik tombol Perlu
              Revisi.
            </p>
            {journals.length === 0 ? (
              <p className="text-emerald-700/60 text-sm">Belum ada jurnal dari siswa manapun.</p>
            ) : (
              <div className="space-y-6">
                {journals.map((j) => {
                  const statusInfo = getStatusInfo(j.status);
                  const isBusy = journalActionLoading === j.id;
                  return (
                    <div
                      key={j.id}
                      className="border border-emerald-100 p-4 rounded-xl bg-emerald-50/50 flex flex-col gap-2"
                    >
                      <div className="flex justify-between items-center">
                        <button
                          onClick={() => setSelectedStudent(j.studentName)}
                          className="font-bold text-emerald-900 hover:underline"
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

                      {statusInfo.key === "approved" && j.approvedBy && (
                        <p className="text-xs text-emerald-700/60">
                          Divalidasi oleh:{" "}
                          <span className="font-semibold text-emerald-800">{j.approvedBy}</span>
                        </p>
                      )}

                      {statusInfo.key === "revision" && (
                        <p className="text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-2 py-1.5">
                          <strong>Alasan revisi:</strong> {j.teacherFeedback || "-"}
                        </p>
                      )}

                      <p className="text-sm text-emerald-800/80">
                        <strong>Buku:</strong> {j.bookTitle} ({j.author})
                        {j.genre ? ` · ${j.genre}` : ""} — Hal. {j.startPage}-{j.endPage}
                        {j.finished ? " · ✅ Selesai dibaca" : ""}
                      </p>
                      <p className="text-sm text-emerald-800/80">
                        <strong>Nilai Karakter:</strong> {getCharacterList(j).join(", ") || "-"}
                      </p>
                      <p className="text-sm text-emerald-700/70 italic">&quot;{j.summary}&quot;</p>
                      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                        <input
                          type="text"
                          placeholder="Tulis umpan balik / alasan revisi..."
                          className="min-w-0 w-full flex-1 p-2 text-sm bg-white border border-emerald-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 transition"
                          value={feedbackInput[j.id] ?? j.teacherFeedback ?? ""}
                          onChange={(e) =>
                            setFeedbackInput({ ...feedbackInput, [j.id]: e.target.value })
                          }
                        />
                        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                          <button
                            onClick={() => handleUpdateJournalStatus(j.id, "approved")}
                            disabled={statusInfo.key === "approved" || isBusy}
                            className="flex-1 whitespace-nowrap px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 active:scale-[0.98] transition disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:active:scale-100"
                          >
                            {statusInfo.key === "approved" ? "Sudah Valid" : "Validasi"}
                          </button>
                          <button
                            onClick={() => handleUpdateJournalStatus(j.id, "revision")}
                            disabled={statusInfo.key === "revision" || isBusy}
                            className="flex-1 whitespace-nowrap px-4 py-2 bg-orange-500 text-white text-sm font-semibold rounded-xl hover:bg-orange-600 active:scale-[0.98] transition disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:active:scale-100"
                          >
                            Perlu Revisi
                          </button>
                          {statusInfo.key === "approved" && (
                            <button
                              onClick={() => handleCancelApproval(j.id)}
                              disabled={isBusy}
                              className="flex items-center justify-center gap-1.5 whitespace-nowrap px-3 py-2 border border-emerald-300 text-emerald-700 bg-white text-sm font-semibold rounded-xl hover:bg-emerald-50 active:scale-[0.98] transition disabled:opacity-50"
                            >
                              <Undo2 className="w-4 h-4" />
                              Batalkan Validasi
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteJournal(j.id)}
                            aria-label={`Hapus jurnal ${j.bookTitle}`}
                            className="flex items-center justify-center px-3 py-2 text-red-600 border border-red-200 bg-red-50 rounded-xl hover:bg-red-100 transition"
                          >
                            <Trash2 className="w-4 h-4" />
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
            <div className="bg-white/80 backdrop-blur-sm p-6 rounded-2xl shadow-sm shadow-emerald-900/5 border border-white">
              <h2 className="text-lg font-bold text-emerald-900">Kelola Data Siswa</h2>
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

            {editingStudent && (
              <div className="bg-white/80 backdrop-blur-sm p-6 rounded-2xl shadow-sm shadow-emerald-900/5 border border-white">
                <h3 className="text-sm font-semibold text-emerald-800 mb-3">Ubah Profil Siswa</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <input
                    value={studentForm.name}
                    onChange={(e) => setStudentForm({ ...studentForm, name: e.target.value })}
                    placeholder="Nama lengkap"
                    className="p-2 text-sm bg-emerald-50/50 border border-emerald-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                  <input
                    value={studentForm.classCode}
                    onChange={(e) => setStudentForm({ ...studentForm, classCode: e.target.value })}
                    placeholder="Kelas, contoh 7A"
                    className="p-2 text-sm bg-emerald-50/50 border border-emerald-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                  <select
                    value={studentForm.gender}
                    onChange={(e) => setStudentForm({ ...studentForm, gender: e.target.value })}
                    className="p-2 text-sm bg-emerald-50/50 border border-emerald-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-400"
                  >
                    <option value="">Gender belum dipilih</option>
                    <option value="laki-laki">Laki-laki</option>
                    <option value="perempuan">Perempuan</option>
                  </select>
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

            <div className="bg-white/80 backdrop-blur-sm p-6 rounded-2xl shadow-sm shadow-emerald-900/5 border border-white">
              <div className="space-y-2">
                {allStudents.length === 0 ? (
                  <p className="text-sm text-emerald-700/60">Belum ada akun siswa.</p>
                ) : (
                  allStudents.map((student) => (
                    <div key={student.uid} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-emerald-50/70">
                      <div>
                        <p className="font-semibold text-emerald-900">{student.name}</p>
                        <p className="text-xs text-emerald-700/60">
                          {student.email || "Email tidak tersedia"} · Kelas {student.classCode}
                          {student.gender ? ` · ${formatGender(student.gender)}` : ""}
                        </p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => startEditingStudent(student)}
                          aria-label={`Ubah profil ${student.name}`}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-emerald-700 border border-emerald-200 bg-white rounded-lg text-xs font-semibold hover:bg-emerald-50 transition"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          Ubah
                        </button>
                        <button
                          onClick={() => handleDeleteStudent(student)}
                          disabled={managementLoading}
                          aria-label={`Hapus data ${student.name}`}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-red-600 border border-red-200 bg-red-50 rounded-lg text-xs font-semibold hover:bg-red-100 disabled:opacity-50 transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Hapus Data
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* ---- Tab: Laporan ---- */}
        {activeTab === "laporan" && (
          <div className="bg-white/80 backdrop-blur-sm p-6 rounded-2xl shadow-sm shadow-emerald-900/5 border border-white space-y-4">
            <h2 className="text-lg font-bold text-emerald-900">Laporan</h2>
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

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-emerald-50/50 border border-emerald-100 rounded-xl p-3">
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
            <div className="border border-emerald-100 rounded-xl p-4 bg-emerald-50/30">
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
                <div className="overflow-x-auto">
                  {reportClassSummaries.length === 0 ? (
                    <p className="text-sm text-emerald-700/60">Belum ada data untuk periode ini.</p>
                  ) : (
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
                          <tr key={summary.classCode} className="border-b border-emerald-50 last:border-0">
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
                  <div className="overflow-x-auto">
                    {reportStudentSummariesForExport.length === 0 ? (
                      <p className="text-sm text-emerald-700/60">Belum ada data untuk periode ini.</p>
                    ) : (
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
                            <tr key={s.name} className="border-b border-emerald-50 last:border-0">
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
          </div>
        )}
      </div>

      {/* ---- Versi cetak ---- */}
      <div className="hidden print:block p-8 text-black">
        <h1 className="text-xl font-bold mb-1">Laporan Semua Kelas</h1>
        <p className="text-sm mb-4">Dicetak pada {formatTanggal(new Date())}</p>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left border-b border-black">
              <th className="py-1 pr-2">Nama Siswa</th>
              <th className="py-1 pr-2">Kelas</th>
              <th className="py-1 pr-2">Gender</th>
              <th className="py-1 pr-2">Total Jurnal</th>
              <th className="py-1 pr-2">Tervalidasi</th>
              <th className="py-1 pr-2">Perlu Revisi</th>
              <th className="py-1 pr-2">Menunggu</th>
              <th className="py-1 pr-2">Halaman Dibaca</th>
              <th className="py-1 pr-2">Buku Selesai</th>
            </tr>
          </thead>
          <tbody>
            {studentSummaries.map((s) => (
              <tr key={s.name} className="border-b border-slate-300">
                <td className="py-1 pr-2">{s.name}</td>
                <td className="py-1 pr-2">{s.classCode}</td>
                <td className="py-1 pr-2">{formatGender(s.gender)}</td>
                <td className="py-1 pr-2">{s.totalJournals}</td>
                <td className="py-1 pr-2">{s.approvedCount}</td>
                <td className="py-1 pr-2">{s.revisionCount}</td>
                <td className="py-1 pr-2">{s.pendingCount}</td>
                <td className="py-1 pr-2">{s.totalPagesRead}</td>
                <td className="py-1 pr-2">{s.booksFinished}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ---- Modal Detail Siswa ---- */}
      {selectedStudentData && (
        <div
          className="fixed inset-0 bg-emerald-950/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 print:hidden"
          onClick={() => setSelectedStudent(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-lg font-bold text-emerald-900">{selectedStudentData.name}</h2>
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
                className="text-emerald-400 hover:text-emerald-600 transition"
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

            <div className="mb-5 bg-emerald-50/50 rounded-xl p-3 border border-emerald-100">
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