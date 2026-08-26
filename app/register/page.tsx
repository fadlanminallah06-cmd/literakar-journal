"use client";

import { useState } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
      <div className="bg-white p-8 rounded-xl shadow-md w-full max-w-md">
        <h2 className="text-2xl font-bold text-center text-slate-800 mb-6">Daftar Akun Baru</h2>
        {error && <div className="bg-red-100 text-red-600 p-3 rounded text-sm mb-4">{error}</div>}
        
        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">Nama Lengkap</label>
            <input
              type="text"
              required
              className="w-full mt-1 p-2 border border-slate-300 rounded outline-none focus:ring-2 focus:ring-blue-500"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Email</label>
            <input
              type="email"
              required
              className="w-full mt-1 p-2 border border-slate-300 rounded outline-none focus:ring-2 focus:ring-blue-500"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Password</label>
            <input
              type="password"
              required
              minLength={6}
              className="w-full mt-1 p-2 border border-slate-300 rounded outline-none focus:ring-2 focus:ring-blue-500"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Peran Pengguna</label>
            <select
              className="w-full mt-1 p-2 border border-slate-300 rounded outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              value={role}
              onChange={(e) => setRole(e.target.value as "student" | "teacher")}
            >
              <option value="student">Siswa</option>
              <option value="teacher">Guru</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Kode Kelas</label>
            <input
              type="text"
              placeholder="Contoh: KLS-7A"
              required
              className="w-full mt-1 p-2 border border-slate-300 rounded outline-none focus:ring-2 focus:ring-blue-500"
              value={classCode}
              onChange={(e) => setClassCode(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700 transition"
          >
            {loading ? "Mendaftarkan..." : "Daftar Akun"}
          </button>
        </form>

        <p className="text-center text-sm text-slate-600 mt-4">
          Sudah punya akun? <Link href="/login" className="text-blue-600 font-semibold hover:underline">Masuk</Link>
        </p>
      </div>
    </div>
  );
}