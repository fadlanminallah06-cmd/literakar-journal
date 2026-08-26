import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-gradient-to-b from-blue-50 to-white">
      <h1 className="text-4xl md:text-6xl font-extrabold text-blue-900 mb-4">
        Jurnal Literasi & Karakter Siswa
      </h1>
      <p className="text-lg text-slate-600 max-w-2xl mb-8">
        Platform pencatatan jurnal membaca interaktif untuk membangun kebiasaan membaca, memantau perkembangan literasi, dan menanamkan nilai-nilai karakter positif.
      </p>
      <div className="flex gap-4">
        <Link
          href="/login"
          className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg shadow hover:bg-blue-700 transition"
        >
          Masuk Akun
        </Link>
        <Link
          href="/register"
          className="px-6 py-3 bg-white text-blue-600 border border-blue-600 font-semibold rounded-lg shadow hover:bg-blue-50 transition"
        >
          Daftar Baru
        </Link>
      </div>
    </main>
  );
}