import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import type { Metadata } from "next";
import { Josefin_Sans } from "next/font/google";

const josefinSans = Josefin_Sans({
  subsets: ["latin"],
  variable: "--font-josefin-sans",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
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
      <body className={`${josefinSans.variable} bg-slate-50 text-slate-900 antialiased`}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}