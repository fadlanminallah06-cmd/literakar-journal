import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Jurnal Literasi & Karakter Siswa",
  description: "Platform jurnal membaca digital untuk siswa dan guru",
  icons: {
    icon: [
      { url: "/asset/logo1.png", type: "image/png" },
    ],
    shortcut: "/asset/logo1.png",
    apple: "/asset/logo1.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body className="bg-slate-50 text-slate-900 antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}