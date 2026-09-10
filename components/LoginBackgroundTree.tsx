"use client";

import { useEffect, useState } from "react";
import {
  TreeShareStyles,
  TreeCanopy,
  TREE_STAGE_META,
  CANOPY_BLOB_PATH,
  canopyTransform,
  type TreeStage,
} from "@/components/TreeGrowth";

interface LoginBackgroundTreeProps {
  isPeeking: boolean;
  focusSide: "email" | "password";
}

export default function LoginBackgroundTree({ isPeeking, focusSide }: LoginBackgroundTreeProps) {
  const uid = "login-tree";
  const [isBlinking, setIsBlinking] = useState(false);
  const [isHappy, setIsHappy] = useState(false);
  const [hasJumped, setHasJumped] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const stage: TreeStage = "big";

  // Deteksi mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Auto-blink
  useEffect(() => {
    const blinkInterval = setInterval(() => {
      setIsBlinking(true);
      setTimeout(() => setIsBlinking(false), 200);
    }, 3000 + Math.random() * 2000);
    return () => clearInterval(blinkInterval);
  }, []);

  // Jump animation trigger
  useEffect(() => {
    if (isPeeking && !hasJumped) {
      setIsHappy(true);
      setHasJumped(true);
      const timer = setTimeout(() => setIsHappy(false), 2000);
      return () => clearTimeout(timer);
    }
    if (!isPeeking) setHasJumped(false);
  }, [isPeeking, hasJumped]);

  // Ukuran pohon berdasarkan device
  const treeSize = isMobile
    ? { width: 200, height: 240 }
    : { width: 280, height: 320 };

  return (
    <>
      <TreeShareStyles scope="full" />

      {/*
        IDLE: Pojok kanan bawah, blur, transparan.
        PEEK: Pindah ke atas tengah (di atas card), sharp, jelas.
      */}
      <div
        className={`fixed pointer-events-none z-[60] transition-all duration-1000 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
          isMobile
            ? isPeeking
              ? "top-0 left-1/2 -translate-x-1/2 blur-0 opacity-100"
              : "top-0 left-1/2 -translate-x-1/2 blur-[3px] opacity-60"
            : "top-1/2 left-1/2 " + (isPeeking ? "blur-0 opacity-100" : "blur-[3px] opacity-70")
        }`}
        style={
          isMobile
            ? {
                width: 170,
                height: 200,
                marginTop: isPeeking ? 4 : -60,
                transform: isPeeking ? "scale(1)" : "scale(0.8)",
              }
            : {
                width: 280,
                height: 320,
                transform: isPeeking
                  ? "translate(calc(min(50vw - 16px, 224px) + 30px), -55%)"
                  : "translate(calc(min(50vw - 16px, 224px) - 60px), calc(-50% + 120px)) scale(0.9)",
              }
        }
      >
        <svg
          viewBox="0 0 200 220"
          className={`w-full h-full drop-shadow-lg ${isHappy ? "tree-happy-jump" : "tree-idle-breathe"}`}
          style={{ transformOrigin: "50% 100%" }}
        >
          <defs>
            <linearGradient id={`${uid}-trunk`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#92400e" />
              <stop offset="100%" stopColor="#c2793a" />
            </linearGradient>
          </defs>

          <g className={isPeeking ? "arm-left-excited" : ""} style={{ transformOrigin: "80px 150px" }}>
            <path
              d="M85,150 C60,145 45,135 35,120"
              stroke="#92400e"
              strokeWidth="9"
              strokeLinecap="round"
              fill="none"
            />
            <path
              d="M50,135 C40,130 30,125 25,115"
              stroke="#92400e"
              strokeWidth="6"
              strokeLinecap="round"
              fill="none"
            />
            <ellipse cx="25" cy="110" rx="12" ry="6" fill="#22c55e" transform="rotate(-30 25 110)" />
            <ellipse cx="35" cy="118" rx="10" ry="5" fill="#16a34a" transform="rotate(-15 35 118)" />
            <g transform="translate(15,95) rotate(-20)">
              <rect x="0" y="0" width="28" height="20" rx="3" fill="#fde68a" stroke="#b45309" strokeWidth="2" />
              <line x1="14" y1="2" x2="14" y2="18" stroke="#b45309" strokeWidth="2" />
              <line x1="4" y1="6" x2="10" y2="6" stroke="#b45309" strokeWidth="1" />
              <line x1="4" y1="10" x2="10" y2="10" stroke="#b45309" strokeWidth="1" />
            </g>
          </g>

          <g className={isPeeking ? "arm-right-excited" : ""} style={{ transformOrigin: "120px 150px" }}>
            <path
              d="M115,150 C140,145 155,135 165,120"
              stroke="#92400e"
              strokeWidth="9"
              strokeLinecap="round"
              fill="none"
            />
            <path
              d="M150,135 C160,130 170,125 175,115"
              stroke="#92400e"
              strokeWidth="6"
              strokeLinecap="round"
              fill="none"
            />
            <ellipse cx="175" cy="110" rx="12" ry="6" fill="#22c55e" transform="rotate(30 175 110)" />
            <ellipse cx="165" cy="118" rx="10" ry="5" fill="#16a34a" transform="rotate(15 165 118)" />
            <g transform="translate(165,95) rotate(20)">
              <rect x="0" y="0" width="28" height="20" rx="3" fill="#fde68a" stroke="#b45309" strokeWidth="2" />
              <line x1="14" y1="2" x2="14" y2="18" stroke="#b45309" strokeWidth="2" />
            </g>
          </g>

          <path d="M92,192 C90,175 90,165 96,150 L104,150 C110,165 110,175 108,192 Z" fill={`url(#${uid}-trunk)`} />

          <path
            d="M70,210 C55,205 40,208 28,200 M78,212 C68,206 58,209 48,215 M100,214 C100,205 100,198 100,192 M122,212 C132,206 142,209 152,215 M130,210 C145,205 160,208 172,200"
            stroke="#92400e"
            strokeWidth="6"
            strokeLinecap="round"
            fill="none"
            opacity={0.85}
          />

          <g transform={canopyTransform(stage, "full")}>
            <TreeCanopy
              stage={stage}
              gradId={`${uid}-canopy`}
              showBuds={false}
              showFruit={true}
              showFace={true}
              blink={isBlinking}
              stare={isPeeking}
              lookX={isMobile ? (focusSide === "email" ? -0.4 : 0.4) : (focusSide === "email" ? -1 : 1)}
              lookY={isMobile ? 1 : 0}
            />
          </g>

          <g className="flying-book" style={{ transformOrigin: "100px 100px" }}>
            <g transform="translate(160, 80) rotate(15)">
              <rect x="0" y="0" width="20" height="14" rx="2" fill="#fde68a" stroke="#b45309" strokeWidth="1" opacity="0.9" />
              <line x1="10" y1="1" x2="10" y2="13" stroke="#b45309" strokeWidth="1" />
            </g>
          </g>

          <g className="butterfly-1" style={{ transformOrigin: "60px 80px" }}>
            <circle cx="60" cy="80" r="3" fill="#f472b6" opacity="0.8" />
            <ellipse cx="58" cy="78" rx="4" ry="2" fill="#fbbf24" opacity="0.6" transform="rotate(-30 58 78)" />
          </g>
          <g className="butterfly-2" style={{ transformOrigin: "140px 90px" }}>
            <circle cx="140" cy="90" r="2.5" fill="#60a5fa" opacity="0.8" />
            <ellipse cx="142" cy="88" rx="3" ry="1.5" fill="#93c5fd" opacity="0.6" transform="rotate(30 142 88)" />
          </g>

          <g className="bird-perch">
            <g transform="translate(150, 60)">
              <ellipse cx="0" cy="0" rx="8" ry="5" fill="#64748b" />
              <circle cx="6" cy="-3" r="3" fill="#64748b" />
              <circle cx="7" cy="-3" r="1" fill="#fff" />
              <path d="M-2,2 L-2,6 M2,2 L2,6" stroke="#92400e" strokeWidth="1" />
            </g>
          </g>
        </svg>
      </div>
    </>
  );
}
