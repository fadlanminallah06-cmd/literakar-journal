"use client";

import { useState, useEffect, useMemo, useId } from "react";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, addDoc, serverTimestamp } from "firebase/firestore";
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
  status: string; // "pending" | "approved"
  teacherFeedback?: string;
  createdAt?: any; // Firestore Timestamp
}

type TabKey = "beranda" | "jurnal" | "riwayat" | "badge" | "pohon";
type BadgeFilter = "semua" | "terkunci" | "didapat";

type UserRole = "student" | "teacher" | "admin";

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

function BadgeIcon({ name, earned }: { name: string; earned: boolean }) {
  const className = `w-8 h-8 ${earned ? "text-white" : "text-slate-400"}`;
  if (name === "Konsisten 7 Hari") return <Flame className={className} />;
  if (name === "Pembaca Andal") return <Trophy className={className} />;
  if (name === "Pembaca Berbuah") return <Medal className={className} />;
  return <BookOpen className={className} />;
}

function BadgeCard({
  title,
  description,
  earned,
}: {
  title: string;
  description: string;
  earned: boolean;
}) {
  return (
    <div className={`flex items-center gap-4 p-4 rounded-2xl border transition ${
      earned
        ? "bg-white border-emerald-200 shadow-sm shadow-emerald-900/5"
        : "bg-slate-50/80 border-slate-200"
    }`}>
      <div className={`w-16 h-16 rounded-full flex items-center justify-center shrink-0 ${
        earned ? "bg-gradient-to-br from-amber-400 to-orange-500" : "bg-slate-200"
      }`}>
        <BadgeIcon name={title} earned={earned} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className={`font-bold ${earned ? "text-emerald-900" : "text-slate-500"}`}>{title}</h3>
          {!earned && <LockKeyhole className="w-4 h-4 text-slate-400" />}
          {earned && <Award className="w-4 h-4 text-amber-500" />}
        </div>
        <p className={`text-xs mt-1 ${earned ? "text-emerald-700/70" : "text-slate-400"}`}>{description}</p>
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

function TreeGrowth({ totalPages }: { totalPages: number }) {
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
    <div className="bg-white/80 backdrop-blur-sm p-6 rounded-2xl shadow-sm shadow-emerald-900/5 border border-white">
      <TreeShareStyles scope="full" />

      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
          <Library className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-emerald-900">Pohon Literasi</h2>
          <p className="text-xs text-emerald-700/60">Setiap halaman yang kamu baca membantu pohonmu tumbuh.</p>
        </div>
      </div>

      <div className="relative rounded-2xl bg-gradient-to-b from-sky-100 via-emerald-50 to-lime-100 p-5 text-center overflow-hidden">
        {/* matahari samar */}
        <div className="pointer-events-none absolute -top-8 -right-8 w-28 h-28 rounded-full bg-amber-200/50 blur-2xl" />
        <div className="pointer-events-none absolute top-4 right-6 w-10 h-10 rounded-full bg-gradient-to-br from-yellow-200 to-amber-300 opacity-80" />

        <p className="relative text-xs font-medium text-emerald-700/70">Total halaman yang dibaca</p>
        <p className="relative text-3xl font-bold text-emerald-900 mt-1">{totalPages} halaman</p>

        <button
          type="button"
          onClick={shakeTree}
          aria-label="Sentuh pohon literasi"
          className="relative mx-auto mt-3 block w-full max-w-xs h-64 group"
        >
          {/* daun berjatuhan saat disentuh */}
          {leaves.map((leaf) => (
            <span
              key={leaf.id}
              className="leaf-particle absolute text-lg pointer-events-none"
              style={{
                left: `${leaf.left}%`,
                top: "35%",
                animationDelay: `${leaf.delay}s`,
                animationDuration: `${leaf.duration}s`,
                ["--leaf-rot" as any]: `${leaf.rotate}deg`,
              }}
            >
              {leaf.emoji}
            </span>
          ))}

          {/* tanah / rumput */}
          <svg viewBox="0 0 200 40" className="absolute bottom-0 left-1/2 -translate-x-1/2 w-56" aria-hidden="true">
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
        <h3 className="relative text-xl font-bold text-emerald-900 mt-3">{stageMeta.label}</h3>
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
                className={`text-[11px] font-medium flex items-center gap-1 ${
                  seg.key === stage ? "text-emerald-800" : "text-emerald-700/40"
                }`}
              >
                <span>{seg.icon}</span>
                {seg.label}
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

function TreeProgressIcon({ totalPages }: { totalPages: number }) {
  const uid = useId();
  const stage = getTreeStage(totalPages);
  const stageMeta = TREE_STAGE_META[stage];

  return (
    <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-br from-emerald-50 to-lime-50 border border-emerald-100 px-4 py-3 shrink-0">
      <TreeShareStyles scope="mini" />
      <svg viewBox="0 0 200 200" className="w-14 h-14 tree-idle-sway-mini" aria-hidden="true">
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
      <div>
        <p className="text-xs text-emerald-700/60">Pohonmu saat ini</p>
        <p className="text-sm font-bold text-emerald-900">{stageMeta.label}</p>
        <p className="text-xs text-emerald-700/70">{totalPages} halaman</p>
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
  const [customCharacter, setCustomCharacter] = useState("");
  const [formError, setFormError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [badgeFilter, setBadgeFilter] = useState<BadgeFilter>("semua");

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

  const badges = useMemo(() => [
    { title: "Pembaca Pemula", description: "Baca 1 buku", earned: totalBooksFinished >= 1 },
    { title: "Pembaca Aktif", description: "Baca 5 buku", earned: totalBooksFinished >= 5 },
    {
      title: "Konsisten 7 Hari",
      description: "Mengirim jurnal 7 hari berturut-turut",
      earned: readingStreak >= 7,
    },
    { title: "Pembaca Andal", description: "Baca 10 buku", earned: totalBooksFinished >= 10 },
    { title: "Pembaca Berbuah", description: "Membaca 1000 halaman", earned: totalPages >= 1000 },
  ], [totalBooksFinished, readingStreak, totalPages]);

  const visibleBadges = badges.filter((badge) => {
    if (badgeFilter === "terkunci") return !badge.earned;
    if (badgeFilter === "didapat") return badge.earned;
    return true;
  });

  const displayName = userProfile?.name || "Siswa";
  const genderLabel = formatGender(userProfile?.gender);

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
        characterValues: [
          ...Array.from(selectedCharacters),
          ...(customCharacter.trim() ? [customCharacter.trim()] : []),
        ],
        finished: form.finished,
        status: "pending",
        teacherFeedback: "",
        createdAt: serverTimestamp(),
      });

      setSuccessMessage("Jurnal berhasil disimpan! Menunggu validasi dari guru.");
      setForm(EMPTY_FORM);
      setSelectedCharacters(new Set());
      setCustomCharacter("");
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
    { key: "badge", label: "Badge Saya" },
    { key: "pohon", label: "Pohon Literasi" },
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
            <p className="text-sm text-emerald-700/70">
              Kelas: {userProfile?.classCode}
              {genderLabel && <span className="ml-2">· {genderLabel}</span>}
            </p>
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

        {/* ---- Tab: Beranda ---- */}
        {activeTab === "beranda" && (
          <div className="space-y-6">
            <div className="bg-white/80 backdrop-blur-sm p-6 rounded-2xl shadow-sm shadow-emerald-900/5 border border-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-emerald-900">Halo, {displayName} 👋</h2>
                <p className="text-sm text-emerald-700/70 mt-1">Semangat membaca hari ini!</p>
              </div>
              <TreeProgressIcon totalPages={totalPages} />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Buku Selesai Bulan Ini" value={monthlyStats.finishedBooks} icon={<Library className="w-4 h-4" />} color="blue" />
              <StatCard label="Halaman Bulan Ini" value={monthlyStats.pages} icon={<BookOpen className="w-4 h-4" />} color="emerald" />
              <StatCard label="Streak Bulan Ini" value={`${monthlyStats.streak} hari`} icon={<Flame className="w-4 h-4" />} color="orange" />
              <StatCard label="Jurnal Bulan Ini" value={monthlyStats.journals} icon={<CalendarCheck className="w-4 h-4" />} color="yellow" />
            </div>

            <div className="bg-white/80 backdrop-blur-sm p-6 rounded-2xl shadow-sm shadow-emerald-900/5 border border-white">
              <h3 className="text-sm font-semibold text-emerald-800/70 mb-3">Jurnal Terbaru</h3>
              {journals.length === 0 ? (
                <p className="text-emerald-700/60 text-sm">
                  Kamu belum punya jurnal. Yuk mulai isi jurnal pertamamu di tab &quot;Isi Jurnal Membaca&quot;!
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

        {/* ---- Tab: Badge Saya ---- */}
        {activeTab === "badge" && (
          <div className="bg-white/80 backdrop-blur-sm p-6 rounded-2xl shadow-sm shadow-emerald-900/5 border border-white space-y-5">
            <div>
              <h2 className="text-lg font-bold text-emerald-900">Badge Saya</h2>
              <p className="text-xs text-emerald-700/60 mt-1">
                Kumpulkan pencapaian dari kebiasaan membaca dan jurnalmu.
              </p>
            </div>

            <div className="flex gap-2 border-b border-emerald-100 pb-3">
              {([
                ["semua", "Semua"],
                ["terkunci", "Terkunci"],
                ["didapat", "Didapat"],
              ] as [BadgeFilter, string][]).map(([filter, label]) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setBadgeFilter(filter)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                    badgeFilter === filter
                      ? "bg-emerald-600 text-white"
                      : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {visibleBadges.length === 0 ? (
              <p className="text-sm text-emerald-700/60 py-4">
                Belum ada badge pada filter ini.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {visibleBadges.map((badge) => (
                  <BadgeCard key={badge.title} {...badge} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ---- Tab: Pohon Literasi ---- */}
        {activeTab === "pohon" && <TreeGrowth totalPages={totalPages} />}

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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
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
                <label className="flex flex-col gap-2 p-2 rounded-xl border border-emerald-200 text-sm text-emerald-700/70 sm:col-span-2 lg:col-span-3">
                  <span className="font-medium text-emerald-800">Nilai karakter lainnya</span>
                  <textarea
                    value={customCharacter}
                    onChange={(e) => setCustomCharacter(e.target.value)}
                    placeholder="Tuliskan nilai karakter lain yang kamu temukan..."
                    rows={2}
                    className="w-full p-2 text-sm bg-white border border-emerald-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 transition"
                  />
                </label>
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
                    <p className="text-sm text-emerald-800/80 italic mb-1">&quot;{j.summary}&quot;</p>
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

        {/* Credit di bagian bawah dashboard */}
        <p className="text-center text-xs text-emerald-700/50 font-medium tracking-wide mt-8 mb-2">
          © PPG Bahasa Indonesia UNJ 2026
        </p>
      </div>
    </div>
  );
}