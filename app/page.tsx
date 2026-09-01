import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { BookOpen, Sparkles, Leaf } from "lucide-react";

export const metadata: Metadata = {
  title: "Jurnal Literasi & Karakter Siswa - Platform Membaca Digital",
  description: "Platform pencatatan jurnal membaca interaktif untuk membangun kebiasaan membaca, memantau perkembangan literasi, dan menanamkan nilai-nilai karakter positif.",
  openGraph: {
    title: "Jurnal Literasi & Karakter Siswa",
    description: "Platform pencatatan jurnal membaca interaktif untuk siswa dan guru",
    url: "/",
    type: "website",
    images: [
      {
        url: "/asset/logo3.png",
        width: 1200,
        height: 630,
        alt: "Logo Jurnal Literasi & Karakter Siswa",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Jurnal Literasi & Karakter Siswa",
    description: "Platform pencatatan jurnal membaca interaktif untuk siswa dan guru",
    images: ["/asset/logo3.png"],
  },
};

export default function HomePage() {
  return (
    <main className="min-h-screen relative flex flex-col items-center justify-center p-6 text-center bg-gradient-to-br from-emerald-50 via-green-50 to-teal-100 overflow-hidden">
      {/* Soft decorative blobs — konsisten dengan halaman lain */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-24 -left-24 w-72 h-72 bg-emerald-200/40 rounded-full blur-3xl" />
        <div className="absolute -bottom-24 -right-24 w-72 h-72 bg-teal-200/40 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-2xl flex flex-col items-center">
        {/* Logo */}
        <div className="relative w-64 md:w-80 aspect-video mb-6 drop-shadow-lg">
          <Image
            src="/asset/logo3.png"
            alt="Logo Jurnal Literasi & Karakter Siswa"
            fill
            className="object-contain"
            priority
            sizes="(max-width: 448px) 100vw, 448px"
          />
        </div>

        <span className="inline-flex items-center gap-1.5 bg-emerald-100 text-emerald-700 text-xs font-semibold px-3 py-1 rounded-full mb-5">
          <Leaf className="w-3.5 h-3.5" />
          Tumbuh lewat kebiasaan membaca
        </span>

        <p className="text-lg text-emerald-700/70 max-w-2xl mb-8">
          Platform pencatatan jurnal membaca interaktif untuk membangun kebiasaan
          membaca, memantau perkembangan literasi, dan menanamkan nilai-nilai
          karakter positif.
        </p>

        <div className="flex flex-wrap justify-center gap-4 mb-10">
          <Link
            href="/login"
            className="px-6 py-3 bg-emerald-600 text-white font-semibold rounded-xl shadow-sm shadow-emerald-900/10 hover:bg-emerald-700 active:scale-[0.98] transition"
          >
            Masuk Akun
          </Link>
          <Link
            href="/register"
            className="px-6 py-3 bg-white/80 backdrop-blur-sm text-emerald-700 border border-emerald-200 font-semibold rounded-xl shadow-sm shadow-emerald-900/5 hover:bg-emerald-50 active:scale-[0.98] transition"
          >
            Daftar Baru
          </Link>
        </div>

        {/* Highlight singkat */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full mb-8">
          <div className="bg-white/80 backdrop-blur-sm p-4 rounded-2xl shadow-sm shadow-emerald-900/5 border border-white flex items-center gap-3 text-left">
            <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
              <BookOpen className="w-4 h-4" />
            </div>
            <p className="text-sm text-emerald-800/80">
              Catat progres bacaan dan ringkasan setiap hari
            </p>
          </div>
          <div className="bg-white/80 backdrop-blur-sm p-4 rounded-2xl shadow-sm shadow-emerald-900/5 border border-white flex items-center gap-3 text-left">
            <div className="w-9 h-9 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <p className="text-sm text-emerald-800/80">
              Nilai karakter tervalidasi langsung oleh guru
            </p>
          </div>
        </div>

        {/* Credit di bawah highlight */}
        <p className="text-xs text-emerald-700/50 font-medium tracking-wide">
          © PPG Bahasa Indonesia UNJ 2026
        </p>
      </div>
    </main>
  );
}