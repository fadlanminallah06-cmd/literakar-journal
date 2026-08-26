"use client";

import { useState } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
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
  BookOpen,
  Sprout,
} from "lucide-react";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<"student" | "teacher">("student");
  const [classCode, setClassCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await createUserWithEmailAndPassword(auth, email, password);

      await setDoc(doc(db, "users", res.user.uid), {
        uid: res.user.uid,
        name,
        email,
        role,
        classCode: classCode.toUpperCase(),
        createdAt: new Date(),
      });

      if (role === "teacher") {
        router.push("/dashboard/teacher");
      } else {
        router.push("/dashboard/student");
      }
    } catch (err: any) {
      setError(err.message || "Gagal mendaftar.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-green-50 to-teal-100 flex items-center justify-center p-4 relative">
      {/* Soft decorative blobs — konsisten dengan dashboard */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-24 -left-24 w-72 h-72 bg-emerald-200/40 rounded-full blur-3xl" />
        <div className="absolute -bottom-24 -right-24 w-72 h-72 bg-teal-200/40 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="bg-white/80 backdrop-blur-sm p-8 rounded-2xl shadow-sm shadow-emerald-900/5 border border-white w-full">
          {/* Header */}
          <div className="flex flex-col items-center mb-6">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mb-3">
              <Sprout className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-center text-emerald-900">
              Daftar Akun Baru
            </h2>
            <p className="text-sm text-emerald-700/60 text-center mt-1">
              Mulai catat perjalanan membacamu
            </p>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-4">
              {error}
            </p>
          )}

          <form onSubmit={handleRegister} className="space-y-4">
            {/* Nama */}
            <div>
              <label className="text-xs text-emerald-700/70 mb-1 block">
                Nama Lengkap
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center">
                  <User className="w-4 h-4 text-emerald-600" />
                </span>
                <input
                  type="text"
                  required
                  placeholder="Nama sesuai identitas"
                  className="w-full pl-10 pr-3 p-2 text-sm bg-emerald-50/50 border border-emerald-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 transition"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="text-xs text-emerald-700/70 mb-1 block">Email</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center">
                  <Mail className="w-4 h-4 text-blue-600" />
                </span>
                <input
                  type="email"
                  required
                  placeholder="nama@email.com"
                  className="w-full pl-10 pr-3 p-2 text-sm bg-emerald-50/50 border border-emerald-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 transition"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="text-xs text-emerald-700/70 mb-1 block">Password</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center">
                  <Lock className="w-4 h-4 text-orange-500" />
                </span>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={6}
                  placeholder="Minimal 6 karakter"
                  className="w-full pl-10 pr-10 p-2 text-sm bg-emerald-50/50 border border-emerald-200 rounded-xl outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400 transition"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-emerald-700/40 hover:text-emerald-700/70"
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
              <label className="text-xs text-emerald-700/70 mb-1.5 block">
                Peran Pengguna
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setRole("student")}
                  className={`flex flex-col items-center gap-1.5 rounded-xl border py-3 px-2 transition ${
                    role === "student"
                      ? "bg-emerald-100 border-emerald-300 text-emerald-900"
                      : "border-emerald-200 text-emerald-700/60 hover:bg-emerald-50"
                  }`}
                >
                  <BookOpen className="w-5 h-5" />
                  <span className="text-sm font-semibold">Siswa</span>
                </button>

                <button
                  type="button"
                  onClick={() => setRole("teacher")}
                  className={`flex flex-col items-center gap-1.5 rounded-xl border py-3 px-2 transition ${
                    role === "teacher"
                      ? "bg-blue-100 border-blue-300 text-blue-700"
                      : "border-emerald-200 text-emerald-700/60 hover:bg-emerald-50"
                  }`}
                >
                  <GraduationCap className="w-5 h-5" />
                  <span className="text-sm font-semibold">Guru</span>
                </button>
              </div>
            </div>

            {/* Kode Kelas */}
            <div>
              <label className="text-xs text-emerald-700/70 mb-1 block">Kode Kelas</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center">
                  <KeySquare className="w-4 h-4 text-yellow-600" />
                </span>
                <input
                  type="text"
                  placeholder="Contoh: KLS-7A"
                  required
                  className="w-full pl-10 pr-3 p-2 text-sm bg-emerald-50/50 border border-emerald-200 rounded-xl outline-none focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 transition uppercase placeholder:normal-case"
                  value={classCode}
                  onChange={(e) => setClassCode(e.target.value)}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 active:scale-[0.98] transition disabled:opacity-50 disabled:active:scale-100"
            >
              {loading ? "Mendaftarkan..." : "Daftar Akun"}
            </button>
          </form>

          <p className="text-center text-sm text-emerald-700/70 mt-5">
            Sudah punya akun?{" "}
            <Link
              href="/login"
              className="text-emerald-700 font-semibold hover:text-emerald-800 hover:underline"
            >
              Masuk
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}