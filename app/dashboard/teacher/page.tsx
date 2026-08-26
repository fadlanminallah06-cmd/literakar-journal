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
} from "lucide-react";

interface Journal {
  id: string;
  studentName: string;
  bookTitle: string;
  author: string;
  startPage: number;
  endPage: number;
  characterValue?: string; // format lama (satu nilai karakter)
  characterValues?: string[]; // format baru dari dashboard siswa (checklist, bisa lebih dari satu)
  genre?: string;
  summary: string;
  status: string;
  teacherFeedback?: string;
  classCode: string;
  createdAt?: any; // Firestore Timestamp, jika ada di skema Anda
}

interface StudentSummary {
  name: string;
  totalJournals: number;
  approvedCount: number;
  pendingCount: number;
  totalPagesRead: number;
  lastSubmission: Date | null;
  journals: Journal[];
}

interface FlaggedStudent extends StudentSummary {
  reasons: string[];
}

type TabKey = "ringkasan" | "pendampingan" | "jurnal" | "laporan";

// Ambang batas yang bisa disesuaikan sesuai kebijakan sekolah/kelas
const INACTIVITY_DAYS = 7; // dianggap "tidak aktif" jika tidak kirim jurnal > 7 hari
const LOW_ACTIVITY_RATIO = 0.5; // ditandai jika jumlah jurnal < 50% rata-rata kelas
const PENDING_BACKLOG_THRESHOLD = 3; // ditandai jika ada >= 3 jurnal menumpuk belum divalidasi

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

export default function TeacherDashboard() {
  const { user, userProfile, logout, loading } = useAuth();
  const router = useRouter();

  const [journals, setJournals] = useState<Journal[]>([]);
  const [feedbackInput, setFeedbackInput] = useState<{ [key: string]: string }>({});
  const [activeTab, setActiveTab] = useState<TabKey>("ringkasan");
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && (!user || userProfile?.role !== "teacher")) {
      router.push("/login");
    } else if (user && userProfile?.classCode) {
      fetchClassJournals();
    }
  }, [user, userProfile, loading]);

  const fetchClassJournals = async () => {
    if (!userProfile?.classCode) return;
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

  // ---- Agregasi per siswa (dipakai oleh Rekap, Pendampingan, Detail, Laporan) ----
  const studentSummaries: StudentSummary[] = useMemo(() => {
    const map = new Map<string, StudentSummary>();
    journals.forEach((j) => {
      const key = j.studentName || "Tanpa Nama";
      if (!map.has(key)) {
        map.set(key, {
          name: key,
          totalJournals: 0,
          approvedCount: 0,
          pendingCount: 0,
          totalPagesRead: 0,
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
      const d = toDateSafe(j.createdAt);
      if (d && (!s.lastSubmission || d > s.lastSubmission)) s.lastSubmission = d;
      s.journals.push(j);
    });
    return Array.from(map.values()).sort((a, b) => b.totalJournals - a.totalJournals);
  }, [journals]);

  const classStats = useMemo(() => {
    const totalSiswa = studentSummaries.length;
    const totalJurnal = journals.length;
    const totalTervalidasi = journals.filter((j) => j.status === "approved").length;
    const totalMenunggu = totalJurnal - totalTervalidasi;
    const rataRata = totalSiswa > 0 ? totalJurnal / totalSiswa : 0;
    const totalHalaman = studentSummaries.reduce((acc, s) => acc + s.totalPagesRead, 0);

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
        return { ...s, reasons };
      })
      .filter((s) => s.reasons.length > 0);
  }, [studentSummaries, classStats]);

  const selectedStudentData = useMemo(
    () => studentSummaries.find((s) => s.name === selectedStudent) || null,
    [studentSummaries, selectedStudent]
  );

  const handleExportCSV = () => {
    const headers = ["Nama Siswa", "Judul Buku", "Penulis", "Genre", "Halaman", "Nilai Karakter", "Status", "Umpan Balik Guru"];
    const rows = journals.map((j) => [
      j.studentName,
      j.bookTitle,
      j.author,
      j.genre || "",
      `${j.startPage}-${j.endPage}`,
      getCharacterList(j).join(", "),
      j.status === "approved" ? "Tervalidasi" : "Menunggu",
      j.teacherFeedback || "",
    ]);
    const csvContent = [headers, ...rows]
      .map((r) => r.map((field) => `"${String(field ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `laporan-kelas-${userProfile?.classCode || "kelas"}-${new Date().toISOString().slice(0, 10)}.csv`;
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
      {/* Soft decorative blobs — pure CSS, ringan di mobile, hilang saat print */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden print:hidden">
        <div className="absolute -top-24 -left-24 w-72 h-72 bg-emerald-200/40 rounded-full blur-3xl" />
        <div className="absolute -bottom-24 -right-24 w-72 h-72 bg-teal-200/40 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-6xl mx-auto print:hidden">
        <header className="flex justify-between items-center mb-6 bg-white/80 backdrop-blur-sm p-4 rounded-2xl shadow-sm shadow-emerald-900/5 border border-white">
          <div>
            <h1 className="text-xl font-bold text-emerald-900">Dashboard Guru</h1>
            <p className="text-sm text-emerald-700/70">Memantau Kelas: {userProfile?.classCode}</p>
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

        {/* ---- Tab: Rekap Kelas ---- */}
        {activeTab === "ringkasan" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <StatCard label="Siswa Aktif" value={classStats.totalSiswa} icon={<Users className="w-4 h-4" />} color="blue" />
              <StatCard label="Total Jurnal" value={classStats.totalJurnal} icon={<BookOpen className="w-4 h-4" />} color="emerald" />
              <StatCard label="Sudah Divalidasi" value={classStats.totalTervalidasi} icon={<CheckCircle2 className="w-4 h-4" />} color="emerald" />
              <StatCard label="Menunggu Validasi" value={classStats.totalMenunggu} icon={<Clock className="w-4 h-4" />} color="yellow" />
              <StatCard label="Rata-rata Jurnal/Siswa" value={classStats.rataRata.toFixed(1)} icon={<TrendingUp className="w-4 h-4" />} color="blue" />
              <StatCard label="Total Halaman Dibaca" value={classStats.totalHalaman} icon={<Library className="w-4 h-4" />} color="emerald" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white/80 backdrop-blur-sm p-5 rounded-2xl shadow-sm shadow-emerald-900/5 border border-white">
                <h3 className="text-sm font-semibold text-emerald-700/70 mb-2">Buku Terpopuler</h3>
                <p className="text-lg font-bold text-emerald-900">
                  {classStats.bukuTerpopuler ? classStats.bukuTerpopuler[0] : "-"}
                </p>
                {classStats.bukuTerpopuler && (
                  <p className="text-xs text-emerald-700/50">Dibaca dalam {classStats.bukuTerpopuler[1]} jurnal</p>
                )}
              </div>
              <div className="bg-white/80 backdrop-blur-sm p-5 rounded-2xl shadow-sm shadow-emerald-900/5 border border-white">
                <h3 className="text-sm font-semibold text-emerald-700/70 mb-2">Nilai Karakter Terbanyak</h3>
                <p className="text-lg font-bold text-emerald-900">
                  {classStats.nilaiKarakterTerbanyak ? classStats.nilaiKarakterTerbanyak[0] : "-"}
                </p>
                {classStats.nilaiKarakterTerbanyak && (
                  <p className="text-xs text-emerald-700/50">Muncul di {classStats.nilaiKarakterTerbanyak[1]} jurnal</p>
                )}
              </div>
            </div>

            <div className="bg-white/80 backdrop-blur-sm p-6 rounded-2xl shadow-sm shadow-emerald-900/5 border border-white">
              <h2 className="text-lg font-bold mb-4 text-emerald-900">Aktivitas per Siswa</h2>
              <p className="text-xs text-emerald-700/50 mb-3">Klik nama siswa untuk melihat detail lengkap.</p>
              {studentSummaries.length === 0 ? (
                <p className="text-emerald-700/60 text-sm">Belum ada data siswa di kelas ini.</p>
              ) : (
                <div className="space-y-2">
                  {studentSummaries.map((s) => (
                    <button
                      key={s.name}
                      onClick={() => setSelectedStudent(s.name)}
                      className="w-full flex justify-between items-center p-3 rounded-xl bg-emerald-50/70 hover:bg-emerald-100/70 transition text-left"
                    >
                      <span className="font-semibold text-emerald-900">{s.name}</span>
                      <span className="text-xs text-emerald-700/60">
                        {s.totalJournals} jurnal · {s.approvedCount} tervalidasi
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
              Terdeteksi otomatis dari aktivitas jurnal: jumlah jurnal rendah, tidak ada kiriman baru dalam{" "}
              {INACTIVITY_DAYS} hari terakhir, atau tumpukan jurnal yang belum divalidasi.
            </p>
            {studentsNeedingAttention.length === 0 ? (
              <p className="text-emerald-700 text-sm bg-emerald-50 p-3 rounded-xl flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                Semua siswa menunjukkan aktivitas membaca yang stabil. Tidak ada yang perlu perhatian khusus saat ini.
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
                          <p className="font-bold text-slate-800">{s.name}</p>
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
              Catatan: daftar ini hanya mempertimbangkan siswa yang sudah pernah mengirim jurnal. Siswa yang belum
              pernah mengirim jurnal sama sekali tidak dapat dideteksi dari sini tanpa daftar roster siswa terdaftar.
            </p>
          </div>
        )}

        {/* ---- Tab: Daftar Jurnal (fungsi validasi tetap sama seperti sebelumnya) ---- */}
        {activeTab === "jurnal" && (
          <div className="bg-white/80 backdrop-blur-sm p-6 rounded-2xl shadow-sm shadow-emerald-900/5 border border-white">
            <h2 className="text-lg font-bold mb-4 text-emerald-900">Daftar Jurnal Siswa</h2>
            {journals.length === 0 ? (
              <p className="text-emerald-700/60 text-sm">Belum ada jurnal dari siswa di kelas ini.</p>
            ) : (
              <div className="space-y-6">
                {journals.map((j) => (
                  <div key={j.id} className="border border-emerald-100 p-4 rounded-xl bg-emerald-50/50 flex flex-col gap-2">
                    <div className="flex justify-between items-center">
                      <button
                        onClick={() => setSelectedStudent(j.studentName)}
                        className="font-bold text-emerald-900 hover:underline"
                      >
                        {j.studentName}
                      </button>
                      <span
                        className={`text-xs px-2 py-1 rounded-lg font-semibold ${
                          j.status === "approved" ? "bg-emerald-100 text-emerald-700" : "bg-yellow-100 text-yellow-700"
                        }`}
                      >
                        {j.status === "approved" ? "Sudah Divalidasi" : "Belum Divalidasi"}
                      </span>
                    </div>
                    <p className="text-sm text-emerald-800/80">
                      <strong>Buku:</strong> {j.bookTitle} ({j.author})
                      {j.genre ? ` · ${j.genre}` : ""} — Hal. {j.startPage}-{j.endPage}
                    </p>
                    <p className="text-sm text-emerald-800/80">
                      <strong>Nilai Karakter:</strong> {getCharacterList(j).join(", ") || "-"}
                    </p>
                    <p className="text-sm text-emerald-700/70 italic">"{j.summary}"</p>

                    <div className="mt-2 flex gap-2">
                      <input
                        type="text"
                        placeholder="Tulis umpan balik / pujian..."
                        className="flex-1 p-2 text-sm bg-white border border-emerald-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 transition"
                        value={feedbackInput[j.id] || j.teacherFeedback || ""}
                        onChange={(e) => setFeedbackInput({ ...feedbackInput, [j.id]: e.target.value })}
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
            <h2 className="text-lg font-bold text-emerald-900">Laporan Kelas</h2>
            <p className="text-sm text-emerald-700/70">
              Unduh data jurnal kelas ini sebagai file CSV, atau cetak ringkasan kelas untuk dibagikan/diarsipkan.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleExportCSV}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 active:scale-[0.98] transition"
              >
                <Download className="w-4 h-4" />
                Unduh Laporan (CSV)
              </button>
              <button
                onClick={handlePrint}
                className="flex items-center gap-2 px-4 py-2 border border-emerald-200 text-emerald-800 text-sm font-semibold rounded-xl hover:bg-emerald-50 active:scale-[0.98] transition"
              >
                <Printer className="w-4 h-4" />
                Cetak Ringkasan Kelas
              </button>
            </div>

            <div className="border-t border-emerald-100 pt-4">
              <h3 className="text-sm font-semibold text-emerald-800 mb-2">Pratinjau Ringkasan</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-emerald-700/60 border-b border-emerald-100">
                    <th className="py-2">Nama Siswa</th>
                    <th className="py-2">Total Jurnal</th>
                    <th className="py-2">Tervalidasi</th>
                    <th className="py-2">Menunggu</th>
                    <th className="py-2">Halaman Dibaca</th>
                  </tr>
                </thead>
                <tbody>
                  {studentSummaries.map((s) => (
                    <tr key={s.name} className="border-b border-emerald-50 last:border-0">
                      <td className="py-2 font-medium text-emerald-900">{s.name}</td>
                      <td className="py-2 text-emerald-800/80">{s.totalJournals}</td>
                      <td className="py-2 text-emerald-800/80">{s.approvedCount}</td>
                      <td className="py-2 text-emerald-800/80">{s.pendingCount}</td>
                      <td className="py-2 text-emerald-800/80">{s.totalPagesRead}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ---- Versi cetak: hanya muncul saat window.print() dipanggil ---- */}
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
            className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-lg font-bold text-emerald-900">{selectedStudentData.name}</h2>
                <p className="text-xs text-emerald-700/50">
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

            <div className="grid grid-cols-4 gap-3 mb-5">
              <StatCard label="Total Jurnal" value={selectedStudentData.totalJournals} icon={<BookOpen className="w-4 h-4" />} color="emerald" />
              <StatCard label="Tervalidasi" value={selectedStudentData.approvedCount} icon={<CheckCircle2 className="w-4 h-4" />} color="emerald" />
              <StatCard label="Menunggu" value={selectedStudentData.pendingCount} icon={<Clock className="w-4 h-4" />} color="yellow" />
              <StatCard label="Halaman Dibaca" value={selectedStudentData.totalPagesRead} icon={<Library className="w-4 h-4" />} color="blue" />
            </div>

            <h3 className="text-sm font-semibold text-emerald-800 mb-2">Riwayat Jurnal</h3>
            <div className="space-y-3">
              {selectedStudentData.journals.map((j) => (
                <div key={j.id} className="border border-emerald-100 p-3 rounded-xl bg-emerald-50/50">
                  <div className="flex justify-between items-center mb-1">
                    <p className="text-sm font-semibold text-emerald-900">
                      {j.bookTitle} <span className="font-normal text-emerald-700/60">({j.author})</span>
                    </p>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-lg font-semibold ${
                        j.status === "approved" ? "bg-emerald-100 text-emerald-700" : "bg-yellow-100 text-yellow-700"
                      }`}
                    >
                      {j.status === "approved" ? "Tervalidasi" : "Menunggu"}
                    </span>
                  </div>
                  <p className="text-xs text-emerald-700/60 mb-1">
                    Hal. {j.startPage}-{j.endPage} · Nilai Karakter: {getCharacterList(j).join(", ") || "-"}
                  </p>
                  <p className="text-xs text-emerald-800/70 italic">"{j.summary}"</p>
                  {j.teacherFeedback && (
                    <p className="text-xs text-emerald-800 mt-1">
                      <strong>Umpan balik:</strong> {j.teacherFeedback}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}