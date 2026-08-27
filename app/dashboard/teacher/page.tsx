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
} from "lucide-react";

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
  totalPagesRead: number;
  booksFinished: number;
}

// Data ringkas siswa terdaftar, diambil dari koleksi "users" (role === "student").
interface RosterStudent {
  uid: string;
  email: string;
  name: string;
  classCode: string;
  gender?: "laki-laki" | "perempuan" | "";
}

type TabKey = "ringkasan" | "pendampingan" | "jurnal" | "laporan" | "kelola";
type ReportView = "kelas" | "siswa";
type ReportPeriod = "all" | "month" | "range";

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

/**
 * Latar belakang lucu & interaktif bertema "kebun literasi".
 * Bunga, hati, bintang, dan buku mengambang lembut, dan bergeser halus
 * mengikuti posisi kursor (parallax ringan) — dekorasi murni, tidak
 * mengganggu konten & dinonaktifkan otomatis jika reduced-motion aktif.
 */
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

      {/* gumpalan warna lembut, bergeser halus mengikuti kursor */}
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

      {/* elemen lucu yang mengambang & bereaksi lembut terhadap kursor */}
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
  const [reportMonth, setReportMonth] = useState("");
  const [reportStartDate, setReportStartDate] = useState("");
  const [reportEndDate, setReportEndDate] = useState("");
  const [reportClass, setReportClass] = useState("all");
  const [classSummaryMonth, setClassSummaryMonth] = useState(getCurrentMonthInput());
  const [classSummaryClass, setClassSummaryClass] = useState("all");
  const [editingStudent, setEditingStudent] = useState<RosterStudent | null>(null);
  const [studentForm, setStudentForm] = useState({ name: "", classCode: "", gender: "" });
  const [managementMessage, setManagementMessage] = useState("");
  const [managementError, setManagementError] = useState("");
  const [managementLoading, setManagementLoading] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0.5, y: 0.5 });

  useEffect(() => {
    if (!loading && (!user || !["teacher", "admin"].includes(userProfile?.role || ""))) {
      router.push("/login");
    } else if (user && ["teacher", "admin"].includes(userProfile?.role || "")) {
      fetchClassJournals();
      fetchAllStudents();
    }
  }, [user, userProfile, loading]);

  // Latar belakang lucu & interaktif: ikuti posisi kursor secara halus
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

  // Guru memantau SEMUA kelas
  const fetchClassJournals = async () => {
    const querySnapshot = await getDocs(collection(db, "journals"));
    const docs: Journal[] = [];
    querySnapshot.forEach((d) => docs.push({ id: d.id, ...d.data() } as Journal));
    setJournals(docs);
  };

  // Ambil roster siswa + gender dari koleksi "users"
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

  const handleApprove = async (journalId: string) => {
    const feedback = feedbackInput[journalId] || "";
    await updateDoc(doc(db, "journals", journalId), {
      status: "approved",
      teacherFeedback: feedback,
    });
    fetchClassJournals();
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

  // ---- Agregasi per siswa (termasuk gender dari roster) ----
  const studentSummaries: StudentSummary[] = useMemo(() => {
    const map = new Map<string, StudentSummary>();

    const genderByName = new Map<string, string>();
    allStudents.forEach((stu) => {
      if (stu.gender) genderByName.set(stu.name, stu.gender);
    });

    journals.forEach((j) => {
      const key = j.studentName || "Tanpa Nama";
      if (!map.has(key)) {
        map.set(key, {
          name: key,
          classCode: j.classCode || "-",
          gender: (genderByName.get(key) as StudentSummary["gender"]) || "",
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

    // Hitung buku selesai unik per siswa
    map.forEach((s) => {
      const titles = new Set<string>();
      s.journals.forEach((j) => {
        if (j.finished && j.bookTitle) titles.add(j.bookTitle.trim().toLowerCase());
      });
      s.booksFinished = titles.size;
    });

    // Siswa terdaftar yang belum pernah mengirim jurnal + pastikan gender terisi
    allStudents.forEach((stu) => {
      if (!map.has(stu.name)) {
        map.set(stu.name, {
          name: stu.name,
          classCode: stu.classCode,
          gender: stu.gender || "",
          totalJournals: 0,
          approvedCount: 0,
          pendingCount: 0,
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
  }, [journals, allStudents]);

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

  const classSummaries: ClassSummary[] = useMemo(() => {
    const summaryByClass = new Map<string, ClassSummary>();
    const studentsByClass = new Map<string, Set<string>>();
    const activeStudentsByClass = new Map<string, Set<string>>();

    allStudents.forEach((student) => {
      const classCode = student.classCode || "-";
      if (!studentsByClass.has(classCode)) studentsByClass.set(classCode, new Set());
      studentsByClass.get(classCode)!.add(student.uid);
    });

    const selectedMonthJournals = journals.filter((journal) => {
      const date = toDateSafe(journal.createdAt);
      if (!date || !classSummaryMonth) return false;
      const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      return month === classSummaryMonth;
    });

    selectedMonthJournals.forEach((journal) => {
      const classCode = journal.classCode || "-";
      if (!summaryByClass.has(classCode)) {
        summaryByClass.set(classCode, {
          classCode,
          totalStudents: 0,
          activeStudents: 0,
          totalJournals: 0,
          approvedCount: 0,
          pendingCount: 0,
          totalPagesRead: 0,
          booksFinished: 0,
        });
      }
      const summary = summaryByClass.get(classCode)!;
      summary.totalJournals += 1;
      if (journal.status === "approved") summary.approvedCount += 1;
      else summary.pendingCount += 1;
      const pages = Number(journal.endPage) - Number(journal.startPage);
      if (!Number.isNaN(pages) && pages > 0) summary.totalPagesRead += pages;
      if (journal.studentName) {
        if (!activeStudentsByClass.has(classCode)) activeStudentsByClass.set(classCode, new Set());
        activeStudentsByClass.get(classCode)!.add(journal.studentId || journal.studentName);
      }
    });

    const finishedBooksByClass = new Map<string, Set<string>>();
    selectedMonthJournals.forEach((journal) => {
      if (!journal.finished || !journal.bookTitle) return;
      const classCode = journal.classCode || "-";
      if (!finishedBooksByClass.has(classCode)) finishedBooksByClass.set(classCode, new Set());
      finishedBooksByClass.get(classCode)!.add(journal.bookTitle.trim().toLowerCase());
    });

    const classCodes = new Set([...studentsByClass.keys(), ...summaryByClass.keys()]);
    return Array.from(classCodes)
      .filter((classCode) => classSummaryClass === "all" || classCode === classSummaryClass)
      .map((classCode) => {
        const summary = summaryByClass.get(classCode) || {
          classCode,
          totalStudents: 0,
          activeStudents: 0,
          totalJournals: 0,
          approvedCount: 0,
          pendingCount: 0,
          totalPagesRead: 0,
          booksFinished: 0,
        };
        summary.totalStudents = studentsByClass.get(classCode)?.size || 0;
        summary.activeStudents = activeStudentsByClass.get(classCode)?.size || 0;
        summary.booksFinished = finishedBooksByClass.get(classCode)?.size || 0;
        return summary;
      })
      .sort((a, b) => a.classCode.localeCompare(b.classCode));
  }, [journals, allStudents, classSummaryMonth, classSummaryClass]);

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

    const startOfMonth = getStartOfMonth(new Date());
    const jurnalBulanIni = journals.filter((j) => {
      const d = toDateSafe(j.createdAt);
      return d ? d >= startOfMonth : false;
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
      jurnalBulanIni,
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

  const filteredReportJournals = useMemo(() => {
    return journals.filter((journal) => {
      if (reportClass !== "all" && journal.classCode !== reportClass) return false;
      const date = toDateSafe(journal.createdAt);
      if (reportPeriod === "all" || !date) return reportPeriod === "all";
      if (reportPeriod === "month") {
        if (!reportMonth) return true;
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}` === reportMonth;
      }
      const start = reportStartDate ? new Date(`${reportStartDate}T00:00:00`) : null;
      const end = reportEndDate ? new Date(`${reportEndDate}T23:59:59.999`) : null;
      if (start && date < start) return false;
      if (end && date > end) return false;
      return true;
    });
  }, [journals, reportClass, reportPeriod, reportMonth, reportStartDate, reportEndDate]);

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
        "Gender",
        "Total Jurnal",
        "Tervalidasi",
        "Menunggu",
        "Halaman Dibaca",
        "Buku Selesai",
      ];
      const rows = studentSummaries.map((s) => [
        s.name,
        s.classCode,
        formatGender(s.gender),
        s.totalJournals,
        s.approvedCount,
        s.pendingCount,
        s.totalPagesRead,
        s.booksFinished,
      ]);
      downloadCSV(headers, rows, `laporan-persiswa-semua-kelas-${new Date().toISOString().slice(0, 10)}.csv`);
    } else {
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
      const rows = filteredReportJournals.map((j) => [
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
      downloadCSV(headers, rows, `laporan-perkelas-${reportClass}-${new Date().toISOString().slice(0, 10)}.csv`);
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
                Memantau Semua Kelas
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
            <h2 className="text-lg font-bold mb-4 text-emerald-900">Daftar Jurnal Siswa</h2>
            {journals.length === 0 ? (
              <p className="text-emerald-700/60 text-sm">Belum ada jurnal dari siswa manapun.</p>
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
                        {j.classCode && (
                          <span className="ml-2 text-xs font-normal text-emerald-700/50">
                            · Kelas {j.classCode}
                          </span>
                        )}
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
                      <button
                        onClick={() => handleDeleteJournal(j.id)}
                        aria-label={`Hapus jurnal ${j.bookTitle}`}
                        className="flex items-center justify-center px-3 py-2 text-red-600 border border-red-200 bg-red-50 rounded-xl hover:bg-red-100 transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
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
              Pilih jenis rekapan lalu unduh sebagai CSV / Excel, atau cetak ringkasan.
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
              </div>
              <div>
                <label className="text-xs text-emerald-700/70 mb-1 block">Periode</label>
                <select
                  value={reportPeriod}
                  onChange={(e) => setReportPeriod(e.target.value as ReportPeriod)}
                  className="w-full p-2 text-sm bg-white border border-emerald-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-400"
                >
                  <option value="all">All time</option>
                  <option value="month">Per bulan</option>
                  <option value="range">Rentang tanggal</option>
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
              {reportPeriod === "range" && (
                <>
                  <div>
                    <label className="text-xs text-emerald-700/70 mb-1 block">Dari tanggal</label>
                    <input
                      type="date"
                      value={reportStartDate}
                      onChange={(e) => setReportStartDate(e.target.value)}
                      className="w-full p-2 text-sm bg-white border border-emerald-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-400"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-emerald-700/70 mb-1 block">Sampai tanggal</label>
                    <input
                      type="date"
                      value={reportEndDate}
                      onChange={(e) => setReportEndDate(e.target.value)}
                      className="w-full p-2 text-sm bg-white border border-emerald-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-400"
                    />
                  </div>
                </>
              )}
            </div>
            <p className="text-xs text-emerald-700/60">
              Menampilkan {filteredReportJournals.length} jurnal untuk {reportClass === "all" ? "semua kelas" : `kelas ${reportClass}`}.
            </p>

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
                      {filteredReportJournals.slice(0, 50).map((j) => (
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
                  {filteredReportJournals.length > 50 && (
                    <p className="text-xs text-emerald-600 mt-2">
                      Menampilkan 50 dari {filteredReportJournals.length} baris. Unduh CSV untuk data lengkap.
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
                        <th className="py-2">Gender</th>
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
                          <td className="py-2 text-emerald-800/80">{formatGender(s.gender)}</td>
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
                label="Menunggu"
                value={selectedStudentData.pendingCount}
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