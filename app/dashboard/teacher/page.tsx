"use client";

import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, doc, updateDoc } from "firebase/firestore";
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
} from "lucide-react";

interface Journal {
  id: string;
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
  classCode: string;
  finished?: boolean;
  createdAt?: any;
}

interface StudentSummary {
  name: string;
  classCode: string;
  totalJournals: number;
  approvedCount: number;
  pendingCount: number;
  totalPagesRead: number;
  booksFinished: number;
  lastSubmission: Date | null;
  journals: Journal[];
}

interface FlaggedStudent extends StudentSummary {
  reasons: string[];
}

type TabKey = "ringkasan" | "pendampingan" | "jurnal" | "laporan";
type ReportView = "kelas" | "siswa" | "bulanan";

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

function formatBulan(d: Date): string {
  return d.toLocaleDateString("id-ID", { month: "long", year: "numeric" });
}

function getStartOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getCharacterList(j: Journal): string[] {
  if (j.characterValues && j.characterValues.length > 0) return j.characterValues;
  if (j.characterValue) return [j.characterValue];
  return [];
}

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
    // last 14 days
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
        {/* grid lines */}
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

export default function TeacherDashboard() {
  const { user, userProfile, logout, loading } = useAuth();
  const router = useRouter();
  const [journals, setJournals] = useState<Journal[]>([]);
  const [feedbackInput, setFeedbackInput] = useState<{ [key: string]: string }>({});
  const [activeTab, setActiveTab] = useState<TabKey>("ringkasan");
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [classFilter, setClassFilter] = useState<string>("all");
  const [reportView, setReportView] = useState<ReportView>("kelas");

  useEffect(() => {
    if (!loading && (!user || userProfile?.role !== "teacher")) {
      router.push("/login");
    } else if (user && userProfile?.classCode) {
      fetchClassJournals();
    }
  }, [user, userProfile, loading]);

  const fetchClassJournals = async () => {
    if (!userProfile?.classCode) return;
    // Ambil jurnal kelas guru (bisa diperluas ke beberapa kelas jika ada array classCodes)
    const q = query(
      collection(db, "journals"),
      where("classCode", "==", userProfile.classCode)
    );
    const querySnapshot = await getDocs(q);
    const docs: Journal[] = [];
    querySnapshot.forEach((d) => docs.push({ id: d.id, ...d.data() } as Journal));
    setJournals(docs);
  };

  const handleApprove = async (journalId: string) => {
    const feedback = feedbackInput[journalId] || "";
    await updateDoc(doc(db, "journals", journalId), {
      status: "approved",
      teacherFeedback: feedback,
    });
    fetchClassJournals();
  };

  // ---- Agregasi per siswa ----
  const studentSummaries: StudentSummary[] = useMemo(() => {
    const map = new Map<string, StudentSummary>();
    journals.forEach((j) => {
      const key = j.studentName || "Tanpa Nama";
      if (!map.has(key)) {
        map.set(key, {
          name: key,
          classCode: j.classCode || userProfile?.classCode || "-",
          totalJournals: 0,
          approvedCount: 0,
          pendingCount: 0,
          totalPagesRead: 0,
          booksFinished: 0,
          lastSubmission: null,
          journals: [],
        });
      }
      const s = map.get(key)!;
      s.totalJournals += 1;
      if (j.status === "approved") s.approvedCount += 1;
      else s.pendingCount += 1;
      const pages = Number(j.endPage) - Number(j.startPage);
      if (!Number.isNaN(pages) && pages > 0) s.totalPagesRead += pages;
      if (j.finished) s.booksFinished += 1;
      const d = toDateSafe(j.createdAt);
      if (d && (!s.lastSubmission || d > s.lastSubmission)) s.lastSubmission = d;
      s.journals.push(j);
    });
    // Hitung buku selesai unik per siswa (lebih akurat)
    map.forEach((s) => {
      const titles = new Set<string>();
      s.journals.forEach((j) => {
        if (j.finished && j.bookTitle) titles.add(j.bookTitle.trim().toLowerCase());
      });
      s.booksFinished = titles.size;
    });
    return Array.from(map.values()).sort((a, b) => b.totalJournals - a.totalJournals);
  }, [journals, userProfile?.classCode]);

  const availableClasses = useMemo(() => {
    const set = new Set<string>();
    journals.forEach((j) => {
      if (j.classCode) set.add(j.classCode);
    });
    if (userProfile?.classCode) set.add(userProfile.classCode);
    return Array.from(set).sort();
  }, [journals, userProfile?.classCode]);

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
    const totalTervalidasi = journals.filter((j) => j.status === "approved").length;
    const totalMenunggu = totalJurnal - totalTervalidasi;
    const rataRata = totalSiswa > 0 ? totalJurnal / totalSiswa : 0;
    const totalHalaman = studentSummaries.reduce((acc, s) => acc + s.totalPagesRead, 0);
    const totalBukuSelesai = studentSummaries.reduce((acc, s) => acc + s.booksFinished, 0);

    const startOfWeek = getStartOfWeek(new Date());
    const jurnalMingguIni = journals.filter((j) => {
      const d = toDateSafe(j.createdAt);
      return d ? d >= startOfWeek : false;
    }).length;

    const bookCount = new Map<string, number>();
    const charCount = new Map<string, number>();
    journals.forEach((j) => {
      if (j.bookTitle) bookCount.set(j.bookTitle, (bookCount.get(j.bookTitle) || 0) + 1);
      getCharacterList(j).forEach((c) => charCount.set(c, (charCount.get(c) || 0) + 1));
    });
    const topEntry = (m: Map<string, number>): [string, number] | null => {
      let best: [string, number] | null = null;
      m.forEach((v, k) => {
        if (!best || v > best[1]) best = [k, v];
      });
      return best;
    };
    return {
      totalSiswa,
      totalJurnal,
      totalTervalidasi,
      totalMenunggu,
      rataRata,
      totalHalaman,
      totalBukuSelesai,
      jurnalMingguIni,
      bukuTerpopuler: topEntry(bookCount),
      nilaiKarakterTerbanyak: topEntry(charCount),
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
          if (s.pendingCount >= PENDING_BACKLOG_THRESHOLD) {
            reasons.push(`Ada ${s.pendingCount} jurnal yang menumpuk belum divalidasi`);
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

  // ---- Laporan bulanan ----
  const monthlySummary = useMemo(() => {
    const map = new Map<string, { bulan: string; jurnal: number; halaman: number; siswa: Set<string> }>();
    journals.forEach((j) => {
      const d = toDateSafe(j.createdAt);
      if (!d) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!map.has(key)) {
        map.set(key, { bulan: formatBulan(d), jurnal: 0, halaman: 0, siswa: new Set() });
      }
      const m = map.get(key)!;
      m.jurnal += 1;
      const pages = Number(j.endPage) - Number(j.startPage);
      if (!Number.isNaN(pages) && pages > 0) m.halaman += pages;
      if (j.studentName) m.siswa.add(j.studentName);
    });
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([, v]) => ({
        bulan: v.bulan,
        jurnal: v.jurnal,
        halaman: v.halaman,
        jumlahSiswa: v.siswa.size,
      }));
  }, [journals]);

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

  const handleExportCSV = () => {
    if (reportView === "siswa") {
      const headers = [
        "Nama Siswa",
        "Kelas",
        "Total Jurnal",
        "Tervalidasi",
        "Menunggu",
        "Halaman Dibaca",
        "Buku Selesai",
      ];
      const rows = studentSummaries.map((s) => [
        s.name,
        s.classCode,
        s.totalJournals,
        s.approvedCount,
        s.pendingCount,
        s.totalPagesRead,
        s.booksFinished,
      ]);
      downloadCSV(
        headers,
        rows,
        `laporan-persiswa-${userProfile?.classCode || "kelas"}-${new Date().toISOString().slice(0, 10)}.csv`
      );
    } else if (reportView === "bulanan") {
      const headers = ["Bulan", "Total Jurnal", "Total Halaman", "Jumlah Siswa Aktif"];
      const rows = monthlySummary.map((m) => [m.bulan, m.jurnal, m.halaman, m.jumlahSiswa]);
      downloadCSV(
        headers,
        rows,
        `laporan-bulanan-${userProfile?.classCode || "kelas"}-${new Date().toISOString().slice(0, 10)}.csv`
      );
    } else {
      // per kelas (detail jurnal)
      const headers = [
        "Nama Siswa",
        "Judul Buku",
        "Penulis",
        "Genre",
        "Halaman",
        "Nilai Karakter",
        "Status",
        "Umpan Balik Guru",
        "Tanggal",
      ];
      const rows = journals.map((j) => [
        j.studentName,
        j.bookTitle,
        j.author,
        j.genre || "",
        `${j.startPage}-${j.endPage}`,
        getCharacterList(j).join(", "),
        j.status === "approved" ? "Tervalidasi" : "Menunggu",
        j.teacherFeedback || "",
        formatTanggal(toDateSafe(j.createdAt)),
      ]);
      downloadCSV(
        headers,
        rows,
        `laporan-kelas-${userProfile?.classCode || "kelas"}-${new Date().toISOString().slice(0, 10)}.csv`
      );
    }
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
    { key: "ringkasan", label: "Rekap Kelas" },
    {
      key: "pendampingan",
      label: `Perlu Pendampingan${studentsNeedingAttention.length ? ` (${studentsNeedingAttention.length})` : ""}`,
    },
    { key: "jurnal", label: "Daftar Jurnal" },
    { key: "laporan", label: "Laporan" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-green-50 to-teal-100 p-4 md:p-6 relative print:bg-white print:p-0">
      <div className="pointer-events-none fixed inset-0 overflow-hidden print:hidden">
        <div className="absolute -top-24 -left-24 w-72 h-72 bg-emerald-200/40 rounded-full blur-3xl" />
        <div className="absolute -bottom-24 -right-24 w-72 h-72 bg-teal-200/40 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-6xl mx-auto print:hidden">
        {/* ---- Header dengan profil guru perempuan ---- */}
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 bg-white/80 backdrop-blur-sm p-4 rounded-2xl shadow-sm shadow-emerald-900/5 border border-white">
          <div className="flex items-center gap-4">
            {/* Ikon profil guru perempuan */}
            <div className="relative shrink-0">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-md ring-4 ring-emerald-100">
                <UserCircle2 className="w-9 h-9 text-white" strokeWidth={1.5} />
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-pink-400 rounded-full border-2 border-white flex items-center justify-center text-[10px]">
                👩
              </span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-emerald-900">
                Selamat datang, {teacherName}!
              </h1>
              <p className="text-sm text-emerald-700/80 font-medium">Guru Bahasa Indonesia</p>
              <p className="text-xs text-emerald-700/60 mt-0.5">
                Memantau Kelas: {userProfile?.classCode || "-"}
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

        <nav className="flex flex-wrap gap-2 mb-6 bg-white/80 backdrop-blur-sm p-2 rounded-2xl shadow-sm shadow-emerald-900/5 border border-white w-fit">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${
                activeTab === t.key
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-emerald-800/70 hover:bg-emerald-50"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {/* ---- Tab: Rekap Kelas (Beranda) ---- */}
        {activeTab === "ringkasan" && (
          <div className="space-y-6">
            {/* Statistik utama */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              <StatCard
                label="Siswa Aktif"
                value={classStats.totalSiswa}
                icon={<Users className="w-4 h-4" />}
                color="blue"
              />
              <StatCard
                label="Jurnal Minggu Ini"
                value={classStats.jurnalMingguIni}
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

            {/* Statistik tambahan */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white/80 backdrop-blur-sm p-5 rounded-2xl shadow-sm shadow-emerald-900/5 border border-white">
                <h3 className="text-sm font-semibold text-emerald-700/70 mb-2">Buku Terpopuler</h3>
                <p className="text-lg font-bold text-emerald-900">
                  {classStats.bukuTerpopuler ? classStats.bukuTerpopuler[0] : "-"}
                </p>
                {classStats.bukuTerpopuler && (
                  <p className="text-xs text-emerald-700/50">
                    Dibaca dalam {classStats.bukuTerpopuler[1]} jurnal
                  </p>
                )}
              </div>
              <div className="bg-white/80 backdrop-blur-sm p-5 rounded-2xl shadow-sm shadow-emerald-900/5 border border-white">
                <h3 className="text-sm font-semibold text-emerald-700/70 mb-2">
                  Nilai Karakter Terbanyak
                </h3>
                <p className="text-lg font-bold text-emerald-900">
                  {classStats.nilaiKarakterTerbanyak
                    ? classStats.nilaiKarakterTerbanyak[0]
                    : "-"}
                </p>
                {classStats.nilaiKarakterTerbanyak && (
                  <p className="text-xs text-emerald-700/50">
                    Muncul di {classStats.nilaiKarakterTerbanyak[1]} jurnal
                  </p>
                )}
              </div>
            </div>

            {/* Daftar siswa dengan filter & pencarian */}
            <div className="bg-white/80 backdrop-blur-sm p-6 rounded-2xl shadow-sm shadow-emerald-900/5 border border-white">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <h2 className="text-lg font-bold text-emerald-900">Aktivitas per Siswa</h2>
                <div className="flex flex-col sm:flex-row gap-2">
                  {/* Filter kelas */}
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
                  {/* Pencarian nama */}
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
                        <span className="text-xs text-emerald-700/50 ml-2">Kelas {s.classCode}</span>
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
              jumlah jurnal jauh di bawah rata-rata, atau tumpukan jurnal belum divalidasi.
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
              Catatan: siswa yang belum pernah mengirim jurnal hanya muncul jika sudah ada data
              roster / jurnal dari siswa lain di kelas yang sama. Idealnya sistem dilengkapi daftar
              siswa terdaftar.
            </p>
          </div>
        )}

        {/* ---- Tab: Daftar Jurnal ---- */}
        {activeTab === "jurnal" && (
          <div className="bg-white/80 backdrop-blur-sm p-6 rounded-2xl shadow-sm shadow-emerald-900/5 border border-white">
            <h2 className="text-lg font-bold mb-4 text-emerald-900">Daftar Jurnal Siswa</h2>
            {journals.length === 0 ? (
              <p className="text-emerald-700/60 text-sm">Belum ada jurnal dari siswa di kelas ini.</p>
            ) : (
              <div className="space-y-6">
                {journals.map((j) => (
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
                      </button>
                      <span
                        className={`text-xs px-2 py-1 rounded-lg font-semibold ${
                          j.status === "approved"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-yellow-100 text-yellow-700"
                        }`}
                      >
                        {j.status === "approved" ? "Sudah Divalidasi" : "Belum Divalidasi"}
                      </span>
                    </div>
                    <p className="text-sm text-emerald-800/80">
                      <strong>Buku:</strong> {j.bookTitle} ({j.author})
                      {j.genre ? ` · ${j.genre}` : ""} — Hal. {j.startPage}-{j.endPage}
                      {j.finished ? " · ✅ Selesai dibaca" : ""}
                    </p>
                    <p className="text-sm text-emerald-800/80">
                      <strong>Nilai Karakter:</strong> {getCharacterList(j).join(", ") || "-"}
                    </p>
                    <p className="text-sm text-emerald-700/70 italic">&quot;{j.summary}&quot;</p>
                    <div className="mt-2 flex gap-2">
                      <input
                        type="text"
                        placeholder="Tulis umpan balik / pujian..."
                        className="flex-1 p-2 text-sm bg-white border border-emerald-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 transition"
                        value={feedbackInput[j.id] || j.teacherFeedback || ""}
                        onChange={(e) =>
                          setFeedbackInput({ ...feedbackInput, [j.id]: e.target.value })
                        }
                      />
                      <button
                        onClick={() => handleApprove(j.id)}
                        className="px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 active:scale-[0.98] transition"
                      >
                        Validasi
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ---- Tab: Laporan ---- */}
        {activeTab === "laporan" && (
          <div className="bg-white/80 backdrop-blur-sm p-6 rounded-2xl shadow-sm shadow-emerald-900/5 border border-white space-y-4">
            <h2 className="text-lg font-bold text-emerald-900">Laporan</h2>
            <p className="text-sm text-emerald-700/70">
              Pilih jenis rekapan lalu unduh sebagai CSV / Excel, atau cetak ringkasan.
            </p>

            <div className="flex flex-wrap gap-2">
              {(
                [
                  { key: "kelas", label: "Rekapan Per Kelas" },
                  { key: "siswa", label: "Rekapan Per Siswa" },
                  { key: "bulanan", label: "Rekapan Bulanan" },
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

            <div className="flex gap-3">
              <button
                onClick={handleExportCSV}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 active:scale-[0.98] transition"
              >
                <Download className="w-4 h-4" />
                Unduh CSV / Excel
              </button>
              <button
                onClick={handlePrint}
                className="flex items-center gap-2 px-4 py-2 border border-emerald-200 text-emerald-800 text-sm font-semibold rounded-xl hover:bg-emerald-50 active:scale-[0.98] transition"
              >
                <Printer className="w-4 h-4" />
                Cetak
              </button>
            </div>

            <div className="border-t border-emerald-100 pt-4">
              <h3 className="text-sm font-semibold text-emerald-800 mb-2">Pratinjau</h3>

              {reportView === "kelas" && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-emerald-700/60 border-b border-emerald-100">
                        <th className="py-2 pr-2">Nama Siswa</th>
                        <th className="py-2 pr-2">Judul Buku</th>
                        <th className="py-2 pr-2">Halaman</th>
                        <th className="py-2 pr-2">Status</th>
                        <th className="py-2">Tanggal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {journals.slice(0, 50).map((j) => (
                        <tr key={j.id} className="border-b border-emerald-50">
                          <td className="py-2 pr-2 font-medium text-emerald-900">{j.studentName}</td>
                          <td className="py-2 pr-2 text-emerald-800/80">{j.bookTitle}</td>
                          <td className="py-2 pr-2 text-emerald-800/80">
                            {j.startPage}-{j.endPage}
                          </td>
                          <td className="py-2 pr-2 text-emerald-800/80">
                            {j.status === "approved" ? "Tervalidasi" : "Menunggu"}
                          </td>
                          <td className="py-2 text-emerald-800/80">
                            {formatTanggal(toDateSafe(j.createdAt))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {journals.length > 50 && (
                    <p className="text-xs text-emerald-600 mt-2">
                      Menampilkan 50 dari {journals.length} baris. Unduh CSV untuk data lengkap.
                    </p>
                  )}
                </div>
              )}

              {reportView === "siswa" && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-emerald-700/60 border-b border-emerald-100">
                        <th className="py-2">Nama Siswa</th>
                        <th className="py-2">Kelas</th>
                        <th className="py-2">Total Jurnal</th>
                        <th className="py-2">Tervalidasi</th>
                        <th className="py-2">Menunggu</th>
                        <th className="py-2">Halaman</th>
                        <th className="py-2">Buku Selesai</th>
                      </tr>
                    </thead>
                    <tbody>
                      {studentSummaries.map((s) => (
                        <tr key={s.name} className="border-b border-emerald-50 last:border-0">
                          <td className="py-2 font-medium text-emerald-900">{s.name}</td>
                          <td className="py-2 text-emerald-800/80">{s.classCode}</td>
                          <td className="py-2 text-emerald-800/80">{s.totalJournals}</td>
                          <td className="py-2 text-emerald-800/80">{s.approvedCount}</td>
                          <td className="py-2 text-emerald-800/80">{s.pendingCount}</td>
                          <td className="py-2 text-emerald-800/80">{s.totalPagesRead}</td>
                          <td className="py-2 text-emerald-800/80">{s.booksFinished}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {reportView === "bulanan" && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-emerald-700/60 border-b border-emerald-100">
                        <th className="py-2">Bulan</th>
                        <th className="py-2">Total Jurnal</th>
                        <th className="py-2">Total Halaman</th>
                        <th className="py-2">Siswa Aktif</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthlySummary.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-3 text-emerald-700/60">
                            Belum ada data bulanan.
                          </td>
                        </tr>
                      ) : (
                        monthlySummary.map((m) => (
                          <tr key={m.bulan} className="border-b border-emerald-50 last:border-0">
                            <td className="py-2 font-medium text-emerald-900">{m.bulan}</td>
                            <td className="py-2 text-emerald-800/80">{m.jurnal}</td>
                            <td className="py-2 text-emerald-800/80">{m.halaman}</td>
                            <td className="py-2 text-emerald-800/80">{m.jumlahSiswa}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ---- Versi cetak ---- */}
      <div className="hidden print:block p-8 text-black">
        <h1 className="text-xl font-bold mb-1">Laporan Kelas {userProfile?.classCode}</h1>
        <p className="text-sm mb-4">Dicetak pada {formatTanggal(new Date())}</p>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left border-b border-black">
              <th className="py-1 pr-2">Nama Siswa</th>
              <th className="py-1 pr-2">Total Jurnal</th>
              <th className="py-1 pr-2">Tervalidasi</th>
              <th className="py-1 pr-2">Menunggu</th>
              <th className="py-1 pr-2">Halaman Dibaca</th>
              <th className="py-1 pr-2">Buku Selesai</th>
            </tr>
          </thead>
          <tbody>
            {studentSummaries.map((s) => (
              <tr key={s.name} className="border-b border-slate-300">
                <td className="py-1 pr-2">{s.name}</td>
                <td className="py-1 pr-2">{s.totalJournals}</td>
                <td className="py-1 pr-2">{s.approvedCount}</td>
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
                label="Menunggu"
                value={selectedStudentData.pendingCount}
                icon={<Clock className="w-4 h-4" />}
                color="yellow"
              />
            </div>

            {/* Grafik line harian */}
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
                selectedStudentData.journals.map((j) => (
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
                        className={`text-xs px-2 py-0.5 rounded-lg font-semibold ${
                          j.status === "approved"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-yellow-100 text-yellow-700"
                        }`}
                      >
                        {j.status === "approved" ? "Tervalidasi" : "Menunggu"}
                      </span>
                    </div>
                    <p className="text-xs text-emerald-700/60 mb-1">
                      Hal. {j.startPage}-{j.endPage}
                      {j.finished ? " · Selesai dibaca" : ""} · Nilai Karakter:{" "}
                      {getCharacterList(j).join(", ") || "-"}
                    </p>
                    <p className="text-xs text-emerald-800/70 italic">&quot;{j.summary}&quot;</p>
                    {j.teacherFeedback && (
                      <p className="text-xs text-emerald-800 mt-1">
                        <strong>Umpan balik:</strong> {j.teacherFeedback}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}