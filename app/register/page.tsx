"use client";

import { useState } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
  KeySquare,
  GraduationCap,
  ShieldCheck,
  BookOpen,
  Sprout,
  ChevronDown,
  Users,
} from "lucide-react";

// Daftar kelas yang bisa dipilih siswa: 7A-7H, 8A-8H, 9A-9H
const GRADE_LEVELS = [7, 8, 9];
const SECTIONS = ["A", "B", "C", "D", "E", "F", "G", "H"];
const TEACHER_ACCESS_CODE = atob("TElURVJBS0FSLUdVUlU");

// Menerjemahkan kode error Firebase Auth ke pesan berbahasa Indonesia
function getAuthErrorMessage(code: string): string {
  switch (code) {
    case "auth/email-already-in-use":
      return "Email ini sudah terdaftar. Silakan masuk atau gunakan email lain.";
    case "auth/invalid-email":
      return "Format email tidak valid.";
    case "auth/weak-password":
      return "Password terlalu lemah. Gunakan minimal 6 karakter.";
    case "auth/network-request-failed":
      return "Koneksi bermasalah. Periksa internet kamu dan coba lagi.";
    default:
      return "Gagal mendaftar. Silakan coba lagi.";
  }
}

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<"student" | "teacher">("student");
  const [classCode, setClassCode] = useState("");
  const [gender, setGender] = useState<"laki-laki" | "perempuan" | "">("");
  const [teacherCode, setTeacherCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (role === "student" && !classCode) {
      setError("Silakan pilih kelas kamu terlebih dahulu.");
      return;
    }

    if (role === "student" && !gender) {
      setError("Silakan pilih gender kamu terlebih dahulu.");
      return;
    }

    if (role === "teacher" && teacherCode.trim().toUpperCase() !== TEACHER_ACCESS_CODE) {
      setError("Kode rahasia guru tidak valid.");
      return;
    }

    setLoading(true);

    let createdUser = null;

    try {
      // 1. Buat akun di Firebase Authentication
      const res = await createUserWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );
      createdUser = res.user;

      // 2. Buat profil di Firestore
      try {
        await setDoc(doc(db, "users", createdUser.uid), {
          uid: createdUser.uid,
          name: name.trim(),
          email: email.trim(),
          role,
          ...(role === "student" ? { classCode, gender } : {}),
          createdAt: serverTimestamp(),
        });
      } catch {
        // PENTING: kalau gagal simpan profil, hapus lagi akun Auth-nya
        // supaya tidak ada akun "zombie" (bisa login tapi tanpa profil).
        await createdUser.delete().catch(() => {});
        throw new Error(
          "Gagal menyimpan profil akun. Silakan coba daftar ulang."
        );
      }

      router.push(role === "teacher" ? "/dashboard/teacher" : "/dashboard/student");
    } catch (err: unknown) {
      const errorCode =
        typeof err === "object" && err !== null && "code" in err && typeof err.code === "string"
          ? err.code
          : undefined;
      const errorMessage = err instanceof Error ? err.message : undefined;
      setError(errorCode ? getAuthErrorMessage(errorCode) : errorMessage || "Gagal mendaftar.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-green-50 to-teal-100 flex items-center justify-center p-4 sm:p-6 relative">
      {/* Soft decorative blobs — konsisten dengan dashboard */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-24 -left-24 w-72 h-72 sm:w-96 sm:h-96 bg-emerald-200/40 rounded-full blur-3xl" />
        <div className="absolute -bottom-24 -right-24 w-72 h-72 sm:w-96 sm:h-96 bg-teal-200/40 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="bg-white/80 backdrop-blur-sm p-6 sm:p-8 rounded-2xl shadow-sm shadow-emerald-900/5 border border-white w-full">
          {/* Header */}
          <div className="flex flex-col items-center mb-6">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mb-3">
              <Sprout className="w-6 h-6" />
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-center text-emerald-900">
              Daftar Akun Baru
            </h2>
            <p className="text-sm text-emerald-700/60 text-center mt-1">
              Mulai catat perjalanan membacamu
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 mb-4">
              <svg className="w-4 h-4 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleRegister} className="space-y-4">
            {/* Nama */}
            <div>
              <label className="text-xs font-medium text-emerald-700/70 mb-1.5 block">
                Nama Lengkap
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className="w-4 h-4 text-emerald-600" />
                </span>
                <input
                  type="text"
                  required
                  placeholder="Nama sesuai identitas"
                  className="w-full pl-10 pr-3 py-2.5 text-sm text-slate-800 bg-emerald-50/50 border border-emerald-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 focus:bg-white transition placeholder:text-emerald-700/30"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="text-xs font-medium text-emerald-700/70 mb-1.5 block">Email</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="w-4 h-4 text-blue-600" />
                </span>
                <input
                  type="email"
                  required
                  placeholder="nama@email.com"
                  className="w-full pl-10 pr-3 py-2.5 text-sm text-slate-800 bg-emerald-50/50 border border-emerald-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 focus:bg-white transition placeholder:text-emerald-700/30"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="text-xs font-medium text-emerald-700/70 mb-1.5 block">Password</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="w-4 h-4 text-orange-500" />
                </span>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={6}
                  placeholder="Minimal 6 karakter"
                  className="w-full pl-10 pr-10 py-2.5 text-sm text-slate-800 bg-emerald-50/50 border border-emerald-200 rounded-xl outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400 focus:bg-white transition placeholder:text-emerald-700/30"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-emerald-700/40 hover:text-emerald-700/70 transition-colors"
                  aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Peran Pengguna */}
            <div>
              <label className="text-xs font-medium text-emerald-700/70 mb-1.5 block">
                Peran Pengguna
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setRole("student")}
                  className={`flex flex-col items-center gap-1.5 rounded-xl border py-3 px-2 transition active:scale-[0.98] ${
                    role === "student"
                      ? "bg-emerald-100 border-emerald-300 text-emerald-900 shadow-sm shadow-emerald-200/50"
                      : "border-emerald-200 text-emerald-700/60 hover:bg-emerald-50 hover:border-emerald-300"
                  }`}
                >
                  <BookOpen className="w-5 h-5" />
                  <span className="text-sm font-semibold">Murid</span>
                </button>
                <button
                  type="button"
                  onClick={() => setRole("teacher")}
                  className={`flex flex-col items-center gap-1.5 rounded-xl border py-3 px-2 transition active:scale-[0.98] ${
                    role === "teacher"
                      ? "bg-blue-100 border-blue-300 text-blue-700 shadow-sm shadow-blue-200/50"
                      : "border-emerald-200 text-emerald-700/60 hover:bg-emerald-50 hover:border-emerald-300"
                  }`}
                >
                  <GraduationCap className="w-5 h-5" />
                  <span className="text-sm font-semibold">Guru</span>
                </button>
              </div>
              {role === "teacher" && (
                <div className="flex items-start gap-2 text-xs text-blue-700/70 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5 mt-2">
                  <ShieldCheck className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>Masukkan kode rahasia dari admin sekolah untuk membuat akun guru.</span>
                </div>
              )}
            </div>

            {role === "teacher" && (
              <div>
                <label className="text-xs font-medium text-emerald-700/70 mb-1.5 block">Kode Rahasia Guru</label>
                <div className="relative">
                  <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-600" />
                  <input
                    type="password"
                    required
                    value={teacherCode}
                    onChange={(e) => setTeacherCode(e.target.value)}
                    placeholder="Masukkan kode rahasia"
                    className="w-full pl-10 pr-3 py-2.5 text-sm text-slate-800 bg-emerald-50/50 border border-emerald-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 focus:bg-white transition placeholder:text-emerald-700/30"
                  />
                </div>
              </div>
            )}

            {/* Pilih Kelas — hanya untuk siswa */}
            {role === "student" && (
              <div>
                <label className="text-xs font-medium text-emerald-700/70 mb-1.5 block">Pilih Kelas</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <KeySquare className="w-4 h-4 text-yellow-600" />
                  </span>
                  <select
                    required
                    value={classCode}
                    onChange={(e) => setClassCode(e.target.value)}
                    className="w-full pl-10 pr-8 py-2.5 text-sm text-slate-800 bg-emerald-50/50 border border-emerald-200 rounded-xl outline-none focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 focus:bg-white transition appearance-none cursor-pointer"
                  >
                    <option value="" disabled>
                      Pilih kelas kamu
                    </option>
                    {GRADE_LEVELS.map((grade) => (
                      <optgroup key={grade} label={`Kelas ${grade}`}>
                        {SECTIONS.map((section) => {
                          const code = `${grade}${section}`;
                          return (
                            <option key={code} value={code}>
                              {code}
                            </option>
                          );
                        })}
                      </optgroup>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute inset-y-0 right-0 pr-3 flex items-center">
                    <ChevronDown className="w-4 h-4 text-emerald-600" />
                  </span>
                </div>
              </div>
            )}

            {/* Gender — hanya untuk siswa */}
            {role === "student" && (
              <div>
                <label className="text-xs font-medium text-emerald-700/70 mb-1.5 block">
                  Gender
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setGender("laki-laki")}
                    className={`flex items-center justify-center gap-2 rounded-xl border py-2.5 px-2 transition active:scale-[0.98] ${
                      gender === "laki-laki"
                        ? "bg-emerald-100 border-emerald-300 text-emerald-900 shadow-sm shadow-emerald-200/50"
                        : "border-emerald-200 text-emerald-700/60 hover:bg-emerald-50 hover:border-emerald-300"
                    }`}
                  >
                    <Users className="w-4 h-4" />
                    <span className="text-sm font-semibold">Laki-laki</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setGender("perempuan")}
                    className={`flex items-center justify-center gap-2 rounded-xl border py-2.5 px-2 transition active:scale-[0.98] ${
                      gender === "perempuan"
                        ? "bg-pink-100 border-pink-300 text-pink-800 shadow-sm shadow-pink-200/50"
                        : "border-emerald-200 text-emerald-700/60 hover:bg-emerald-50 hover:border-emerald-300"
                    }`}
                  >
                    <Users className="w-4 h-4" />
                    <span className="text-sm font-semibold">Perempuan</span>
                  </button>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 active:scale-[0.98] transition disabled:opacity-50 disabled:active:scale-100 shadow-sm shadow-emerald-600/20 mt-2"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Mendaftarkan...
                </span>
              ) : (
                "Daftar Akun"
              )}
            </button>
          </form>

          <p className="text-center text-sm text-emerald-700/70 mt-5">
            Sudah punya akun?{" "}
            <Link
              href="/login"
              className="text-emerald-700 font-semibold hover:text-emerald-800 hover:underline transition-colors"
            >
              Masuk
            </Link>
          </p>

          {/* Credit di bawah link Masuk */}
          <p className="text-center text-xs text-emerald-700/50 font-medium tracking-wide mt-4">
            © PPG Bahasa Indonesia UNJ 2026
          </p>
        </div>
      </div>
    </div>
  );
}