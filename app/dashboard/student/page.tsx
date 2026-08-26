"use client";

import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, addDoc, serverTimestamp } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { LogOut, BookOpen, Flame, CalendarCheck, Library } from "lucide-react";

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
  status: string; // "pending" | "approved"
  teacherFeedback?: string;
  createdAt?: any; // Firestore Timestamp
}

type TabKey = "beranda" | "jurnal" | "riwayat";

const CHARACTER_OPTIONS = ["Kerja Keras", "Pantang Menyerah", "Persahabatan", "Jujur", "Tanggung Jawab"];

const GENRE_SUGGESTIONS = ["Fiksi", "Non-Fiksi", "Petualangan", "Fantasi", "Biografi", "Sains", "Sejarah"];

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

function getStartOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Minggu, 1 = Senin, ...
  const diff = (day === 0 ? -6 : 1) - day; // mundur ke Senin terdekat
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function StatCard({
  label,
  value,
  icon,
  color = "emerald",
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color?: "emerald" | "orange" | "blue" | "yellow";
}) {
  const colorMap: Record<string, { bg: string; text: string }> = {
    emerald: { bg: "bg-emerald-100", text: "text-emerald-700" },
    orange: { bg: "bg-orange-100", text: "text-orange-600" },
    blue: { bg: "bg-blue-100", text: "text-blue-700" },
    yellow: { bg: "bg-yellow-100", text: "text-yellow-700" },
  };
  const c = colorMap[color];

  return (
    <div className="bg-white/80 backdrop-blur-sm p-4 rounded-2xl shadow-sm shadow-emerald-900/5 border border-emerald-100 flex flex-col gap-2">
      <div className={`w-8 h-8 rounded-lg ${c.bg} ${c.text} flex items-center justify-center`}>
        {icon}
      </div>
      <span className="text-2xl font-bold text-emerald-900">{value}</span>
      <span className="text-xs font-medium text-emerald-700/70">{label}</span>
    </div>
  );
}

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
  const [formError, setFormError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && (!user || userProfile?.role !== "student")) {
      router.push("/login");
    } else if (user) {
      fetchMyJournals();
    }
  }, [user, userProfile, loading]);

  const fetchMyJournals = async () => {
    if (!user) return;
    const q = query(collection(db, "journals"), where("studentId", "==", user.uid));
    const querySnapshot = await getDocs(q);
    const docs: Journal[] = [];
    querySnapshot.forEach((d) => docs.push({ id: d.id, ...d.data() } as Journal));
    docs.sort((a, b) => (toDateSafe(b.createdAt)?.getTime() || 0) - (toDateSafe(a.createdAt)?.getTime() || 0));
    setJournals(docs);
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

  // ---- Statistik Beranda ----
  const totalPages = useMemo(() => {
    return journals.reduce((acc, j) => {
      const pages = Number(j.endPage) - Number(j.startPage);
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

  const journalsThisWeek = useMemo(() => {
    const startOfWeek = getStartOfWeek(new Date());
    return journals.filter((j) => {
      const d = toDateSafe(j.createdAt);
      return d ? d >= startOfWeek : false;
    }).length;
  }, [journals]);

  const displayName = userProfile?.name || userProfile?.displayName || "Siswa";

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
      await addDoc(collection(db, "journals"), {
        studentId: user.uid,
        studentName: displayName,
        classCode: userProfile.classCode,
        bookTitle: form.bookTitle.trim(),
        author: form.author.trim(),
        genre: form.genre.trim(),
        startPage,
        endPage,
        summary: form.summary.trim(),
        characterValues: Array.from(selectedCharacters),
        finished: form.finished,
        status: "pending",
        teacherFeedback: "",
        createdAt: serverTimestamp(),
      });

      setSuccessMessage("Jurnal berhasil disimpan! Menunggu validasi dari guru.");
      setForm(EMPTY_FORM);
      setSelectedCharacters(new Set());
      fetchMyJournals();
    } catch (err) {
      setFormError("Gagal menyimpan jurnal. Silakan coba lagi.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-green-50 to-teal-100">
        <p className="text-emerald-700 text-sm font-medium">Memuat...</p>
      </div>
    );
  }

  const tabs: { key: TabKey; label: string }[] = [
    { key: "beranda", label: "Beranda" },
    { key: "jurnal", label: "Isi Jurnal Membaca" },
    { key: "riwayat", label: "Riwayat Jurnal" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-green-50 to-teal-100 p-4 md:p-6 relative">
      {/* Soft decorative blobs — pure CSS, ringan di mobile */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-24 -left-24 w-72 h-72 bg-emerald-200/40 rounded-full blur-3xl" />
        <div className="absolute -bottom-24 -right-24 w-72 h-72 bg-teal-200/40 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-5xl mx-auto">
        <header className="flex justify-between items-center mb-6 bg-white/80 backdrop-blur-sm p-4 rounded-2xl shadow-sm shadow-emerald-900/5 border border-white">
          <div>
            <h1 className="text-xl font-bold text-emerald-900">Dashboard Siswa</h1>
            <p className="text-sm text-emerald-700/70">Kelas: {userProfile?.classCode}</p>
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

        {/* ---- Tab: Beranda ---- */}
        {activeTab === "beranda" && (
          <div className="space-y-6">
            <div className="bg-white/80 backdrop-blur-sm p-6 rounded-2xl shadow-sm shadow-emerald-900/5 border border-white">
              <h2 className="text-xl font-bold text-emerald-900">Halo, {displayName} 👋</h2>
              <p className="text-sm text-emerald-700/70 mt-1">Semangat membaca hari ini!</p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Total Buku Selesai" value={totalBooksFinished} icon={<Library className="w-4 h-4" />} color="blue" />
              <StatCard label="Total Halaman" value={totalPages} icon={<BookOpen className="w-4 h-4" />} color="emerald" />
              <StatCard label="Streak Membaca" value={`${readingStreak} hari`} icon={<Flame className="w-4 h-4" />} color="orange" />
              <StatCard label="Jurnal Minggu Ini" value={journalsThisWeek} icon={<CalendarCheck className="w-4 h-4" />} color="yellow" />
            </div>

            <div className="bg-white/80 backdrop-blur-sm p-6 rounded-2xl shadow-sm shadow-emerald-900/5 border border-white">
              <h3 className="text-sm font-semibold text-emerald-800/70 mb-3">Jurnal Terbaru</h3>
              {journals.length === 0 ? (
                <p className="text-emerald-700/60 text-sm">
                  Kamu belum punya jurnal. Yuk mulai isi jurnal pertamamu di tab "Isi Jurnal Membaca"!
                </p>
              ) : (
                <div className="space-y-2">
                  {journals.slice(0, 3).map((j) => (
                    <div key={j.id} className="flex justify-between items-center p-3 rounded-xl bg-emerald-50/70">
                      <span className="text-sm font-semibold text-emerald-900">{j.bookTitle}</span>
                      <span className="text-xs text-emerald-700/60">{formatTanggal(toDateSafe(j.createdAt))}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ---- Tab: Isi Jurnal Membaca ---- */}
        {activeTab === "jurnal" && (
          <div className="bg-white/80 backdrop-blur-sm p-6 rounded-2xl shadow-sm shadow-emerald-900/5 border border-white space-y-6">
            <div>
              <h2 className="text-lg font-bold text-emerald-900">Isi Jurnal Membaca</h2>
              <p className="text-xs text-emerald-700/60 mt-1">
                Catat progres bacaanmu hari ini, lalu simpan untuk divalidasi guru.
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
              <h3 className="text-sm font-semibold text-emerald-800 mb-2">Informasi Buku</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-emerald-700/70 mb-1 block">Judul Buku</label>
                  <input
                    type="text"
                    value={form.bookTitle}
                    onChange={(e) => setForm({ ...form, bookTitle: e.target.value })}
                    placeholder="cth. Laskar Pelangi"
                    className="w-full p-2 text-sm bg-emerald-50/50 border border-emerald-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 transition"
                  />
                </div>
                <div>
                  <label className="text-xs text-emerald-700/70 mb-1 block">Penulis</label>
                  <input
                    type="text"
                    value={form.author}
                    onChange={(e) => setForm({ ...form, author: e.target.value })}
                    placeholder="cth. Andrea Hirata"
                    className="w-full p-2 text-sm bg-emerald-50/50 border border-emerald-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 transition"
                  />
                </div>
                <div>
                  <label className="text-xs text-emerald-700/70 mb-1 block">Genre</label>
                  <input
                    type="text"
                    list="genre-options"
                    value={form.genre}
                    onChange={(e) => setForm({ ...form, genre: e.target.value })}
                    placeholder="cth. Fiksi"
                    className="w-full p-2 text-sm bg-emerald-50/50 border border-emerald-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 transition"
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
              <h3 className="text-sm font-semibold text-emerald-800 mb-2">Progress Membaca</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 items-end">
                <div>
                  <label className="text-xs text-emerald-700/70 mb-1 block">Halaman Awal</label>
                  <input
                    type="number"
                    min={1}
                    value={form.startPage}
                    onChange={(e) => setForm({ ...form, startPage: e.target.value })}
                    placeholder="cth. 1"
                    className="w-full p-2 text-sm bg-emerald-50/50 border border-emerald-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 transition"
                  />
                </div>
                <div>
                  <label className="text-xs text-emerald-700/70 mb-1 block">Halaman Akhir</label>
                  <input
                    type="number"
                    min={1}
                    value={form.endPage}
                    onChange={(e) => setForm({ ...form, endPage: e.target.value })}
                    placeholder="cth. 20"
                    className="w-full p-2 text-sm bg-emerald-50/50 border border-emerald-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 transition"
                  />
                </div>
                <p className="text-xs text-emerald-700/60 pb-2">
                  {pagesReadPreview > 0 ? `${pagesReadPreview} halaman dibaca` : ""}
                </p>
              </div>

              <label className="flex items-center gap-2 mt-3 text-sm text-emerald-800">
                <input
                  type="checkbox"
                  checked={form.finished}
                  onChange={(e) => setForm({ ...form, finished: e.target.checked })}
                  className="w-4 h-4 accent-emerald-600"
                />
                Buku ini sudah selesai dibaca
              </label>
            </div>

            {/* Ringkasan */}
            <div>
              <label className="text-sm font-semibold text-emerald-800 mb-2 block">Ringkasan Bacaan</label>
              <textarea
                value={form.summary}
                onChange={(e) => setForm({ ...form, summary: e.target.value })}
                placeholder="Ceritakan apa yang kamu baca hari ini..."
                rows={4}
                className="w-full p-3 text-sm bg-emerald-50/50 border border-emerald-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 transition"
              />
            </div>

            {/* Nilai Karakter */}
            <div>
              <label className="text-sm font-semibold text-emerald-800 mb-2 block">Nilai Karakter yang Ditemukan</label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {CHARACTER_OPTIONS.map((c) => (
                  <label
                    key={c}
                    className={`flex items-center gap-2 p-2 rounded-xl border text-sm cursor-pointer transition ${
                      selectedCharacters.has(c)
                        ? "bg-emerald-100 border-emerald-300 text-emerald-900"
                        : "border-emerald-200 text-emerald-700/70 hover:bg-emerald-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedCharacters.has(c)}
                      onChange={() => toggleCharacter(c)}
                      className="w-4 h-4 accent-emerald-600"
                    />
                    {c}
                  </label>
                ))}
              </div>
            </div>

            <button
              onClick={handleSaveJournal}
              disabled={saving}
              className="px-5 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 active:scale-[0.98] transition disabled:opacity-50 disabled:active:scale-100"
            >
              {saving ? "Menyimpan..." : "Simpan Jurnal"}
            </button>
          </div>
        )}

        {/* ---- Tab: Riwayat Jurnal ---- */}
        {activeTab === "riwayat" && (
          <div className="bg-white/80 backdrop-blur-sm p-6 rounded-2xl shadow-sm shadow-emerald-900/5 border border-white">
            <h2 className="text-lg font-bold mb-4 text-emerald-900">Riwayat Jurnal Saya</h2>
            {journals.length === 0 ? (
              <p className="text-emerald-700/60 text-sm">Kamu belum mengirim jurnal apa pun. Yuk mulai isi jurnal pertamamu!</p>
            ) : (
              <div className="space-y-4">
                {journals.map((j) => (
                  <div key={j.id} className="border border-emerald-100 p-4 rounded-xl bg-emerald-50/50">
                    <div className="flex justify-between items-center mb-1">
                      <p className="font-bold text-emerald-900">
                        {j.bookTitle} <span className="font-normal text-emerald-700/60">({j.author})</span>
                      </p>
                      <span
                        className={`text-xs px-2 py-1 rounded-lg font-semibold ${
                          j.status === "approved" ? "bg-emerald-100 text-emerald-700" : "bg-yellow-100 text-yellow-700"
                        }`}
                      >
                        {j.status === "approved" ? "Tervalidasi" : "Menunggu Validasi"}
                      </span>
                    </div>
                    <p className="text-xs text-emerald-700/60 mb-1">
                      {j.genre ? `${j.genre} · ` : ""}Hal. {j.startPage}-{j.endPage} ·{" "}
                      {formatTanggal(toDateSafe(j.createdAt))}
                      {j.finished ? " · Selesai dibaca" : ""}
                    </p>
                    <p className="text-sm text-emerald-800/80 italic mb-1">"{j.summary}"</p>
                    {j.characterValues && j.characterValues.length > 0 && (
                      <p className="text-xs text-emerald-700/60">Nilai karakter: {j.characterValues.join(", ")}</p>
                    )}
                    {j.teacherFeedback && (
                      <p className="text-xs text-emerald-800 mt-2 bg-emerald-100/60 rounded-lg p-2">
                        <strong>Umpan balik guru:</strong> {j.teacherFeedback}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}