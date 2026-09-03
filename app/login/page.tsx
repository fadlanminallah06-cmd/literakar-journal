"use client";

import { useEffect, useState } from "react";
import {
  browserLocalPersistence,
  browserSessionPersistence,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Mail, Lock, Eye, EyeOff, Loader2 } from "lucide-react";

// Key localStorage untuk menyimpan email yang diingat. Hanya email yang
// disimpan — password TIDAK PERNAH disimpan di localStorage; pengisian
// otomatis untuk password diserahkan ke password manager browser lewat
// atribut autoComplete.
const REMEMBERED_EMAIL_KEY = "literasi_remembered_email";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState("");
  const [resetMessage, setResetMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const router = useRouter();

  // Muat email yang pernah diingat (kalau ada) saat halaman pertama dibuka,
  // supaya pengguna tidak perlu mengetik ulang emailnya.
  useEffect(() => {
    try {
      const savedEmail = localStorage.getItem(REMEMBERED_EMAIL_KEY);
      if (savedEmail) {
        queueMicrotask(() => {
          setEmail(savedEmail);
          setRememberMe(true);
        });
      } else {
        queueMicrotask(() => setRememberMe(false));
      }
    } catch {
      // localStorage tidak tersedia (mis. SSR/privasi browser) — abaikan, form tetap kosong.
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setResetMessage("");
    setLoading(true);

    try {
      // "Ingat saya" dicentang -> sesi bertahan lintas sesi browser (persist ke disk).
      // Tidak dicentang -> sesi hanya bertahan selama tab ini terbuka, cocok untuk
      // komputer bersama (mis. lab sekolah) supaya tidak ada jejak login tertinggal.
      await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);

      const res = await signInWithEmailAndPassword(auth, email, password);

      let userDoc;
      try {
        userDoc = await getDoc(doc(db, "users", res.user.uid));
      } catch (profileErr: unknown) {
        // Login Auth berhasil, tapi baca profil Firestore gagal
        // (misal permission-denied karena dokumen belum ada, atau rules bermasalah).
        await signOut(auth);
        const profileErrorCode =
          typeof profileErr === "object" && profileErr !== null && "code" in profileErr
            ? profileErr.code
            : undefined;
        if (profileErrorCode === "permission-denied") {
          setError(
            "Profil akun bermasalah (akses ditolak). Hubungi admin untuk memperbaiki akun ini."
          );
        } else {
          setError("Gagal memuat profil akun. Silakan coba lagi.");
        }
        return;
      }

      if (userDoc.exists()) {
        const role = userDoc.data().role;
        if (role === "teacher" || role === "admin") {
          persistRememberedEmail();
          router.push("/dashboard/teacher");
        } else if (role === "student") {
          if (
            userDoc.data().requestedRole === "teacher" &&
            userDoc.data().approvalStatus === "pending"
          ) {
            await signOut(auth);
            setError("Pendaftaran guru masih menunggu persetujuan admin.");
          } else {
            persistRememberedEmail();
            router.push("/dashboard/student");
          }
        } else {
          await signOut(auth);
          setError("Profil akun tidak memiliki role yang valid. Hubungi admin.");
        }
      } else {
        // Akun Auth ada tapi dokumen Firestore-nya tidak ada (akun "zombie").
        await signOut(auth);
        setError("Profil akun tidak ditemukan. Hubungi admin untuk mendaftarkan ulang profil kamu.");
      }
    } catch {
      setError("Email atau password salah.");
    } finally {
      setLoading(false);
    }
  };

  // Simpan atau hapus email yang diingat sesuai status checkbox "Ingat saya",
  // dipanggil hanya setelah login benar-benar berhasil.
  const persistRememberedEmail = () => {
    try {
      if (rememberMe) {
        localStorage.setItem(REMEMBERED_EMAIL_KEY, email.trim());
      } else {
        localStorage.removeItem(REMEMBERED_EMAIL_KEY);
      }
    } catch {
      // abaikan jika localStorage tidak tersedia
    }
  };

  const handlePasswordReset = async () => {
    setError("");
    setResetMessage("");

    if (!email.trim()) {
      setError("Masukkan email terlebih dahulu untuk mengatur ulang password.");
      return;
    }

    setResetLoading(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setResetMessage("Tautan reset password sudah dikirim. Periksa kotak masuk email kamu.");
    } catch {
      setError("Email tidak ditemukan atau gagal mengirim tautan reset password.");
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-emerald-50 via-green-50 to-teal-100">
      {/* Soft decorative blobs — pure CSS, no images, ringan di mobile */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-24 -left-24 w-72 h-72 bg-emerald-200/40 rounded-full blur-3xl" />
        <div className="absolute -bottom-24 -right-24 w-72 h-72 bg-teal-200/40 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md bg-white/80 backdrop-blur-sm p-8 rounded-3xl shadow-xl shadow-emerald-900/10 border border-white">
        <div className="relative w-full aspect-video mb-4">
          <Image
            src="/asset/logo3.png"
            alt="Logo"
            fill
            className="object-contain"
            priority
            sizes="(max-width: 448px) 100vw, 448px"
          />
        </div>

        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-emerald-900">Yuk Membaca</h2>
          <p className="text-sm text-emerald-700/70 mt-1">Masuk untuk melanjutkan perjalanan membacamu</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-xl text-sm mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-emerald-900 mb-1">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500" />
              <input
                type="email"
                required
                autoComplete="email"
                placeholder="nama@email.com"
                className="w-full pl-10 pr-3 py-2.5 bg-emerald-50/50 border border-emerald-200 rounded-xl text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-emerald-900 mb-1">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500" />
              <input
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                className="w-full pl-10 pr-10 py-2.5 bg-emerald-50/50 border border-emerald-200 rounded-xl text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500 hover:text-emerald-700"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Fitur "Ingat saya": saat dicentang, email disimpan untuk pengisian
              otomatis di kunjungan berikutnya, dan sesi login dibuat bertahan
              lebih lama (persist ke disk, bukan hanya selama tab terbuka). */}
          <label className="flex items-center gap-2 text-sm text-emerald-800 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="w-4 h-4 accent-emerald-600"
            />
            Ingat saya di perangkat ini
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 active:scale-[0.98] transition disabled:opacity-60 disabled:active:scale-100 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? "Memproses..." : "Masuk"}
          </button>
        </form>

        <button
          type="button"
          onClick={handlePasswordReset}
          disabled={loading || resetLoading}
          className="w-full mt-3 text-sm font-semibold text-emerald-700 hover:text-emerald-900 hover:underline disabled:opacity-50"
        >
          {resetLoading ? "Mengirim tautan..." : "Lupa kata sandi?"}
        </button>

        {resetMessage && (
          <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 mt-3">
            {resetMessage}
          </p>
        )}

        <p className="text-center text-sm text-slate-600 mt-6">
          Belum punya akun?{" "}
          <Link href="/register" className="text-emerald-700 font-semibold hover:underline">
            Daftar
          </Link>
        </p>

        {/* Credit di bawah link Daftar */}
        <p className="text-center text-xs text-emerald-700/50 font-medium tracking-wide mt-4">
          © PPG Bahasa Indonesia UNJ 2026
        </p>
      </div>
    </div>
  );
}