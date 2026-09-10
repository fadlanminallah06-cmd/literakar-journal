export type TreeStage = "small" | "young" | "big";

export const TREE_STAGE_META: Record<
  TreeStage,
  {
    label: string;
    range: string;
    mood: string;
    palette: { a: string; b: string; dark: string };
  }
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

export function getTreeStage(totalPages: number): TreeStage {
  if (totalPages >= 251) return "big";
  if (totalPages >= 51) return "young";
  return "small";
}

export const CANOPY_BLOB_PATH =
  "M40,92 C18,90 8,60 30,44 C24,18 56,8 76,24 C92,3 132,4 142,28 C168,22 182,54 160,74 C177,96 154,122 128,116 C118,137 78,141 64,120 C33,131 18,105 40,92 Z";

export function canopyTransform(stage: TreeStage, variant: "full" | "mini") {
  if (variant === "mini") {
    const scale = stage === "small" ? 0.92 : stage === "young" ? 1 : 1.08;
    return `translate(0,0) scale(${scale})`;
  }

  switch (stage) {
    case "small":
      return "translate(1,6) scale(0.9)";
    case "young":
      return "translate(0,4) scale(0.98)";
    case "big":
      return "translate(0,0) scale(1.05)";
    default:
      return "translate(0,0) scale(1)";
  }
}

export function TreeShareStyles({ scope }: { scope: "full" | "mini" }) {
  if (scope === "mini") {
    return (
      <style>{`
        @keyframes tree-idle-sway-mini {
          0%,100% { transform: rotate(-1.5deg) translateY(0); }
          50% { transform: rotate(1.5deg) translateY(-2px); }
        }
        .tree-idle-sway-mini { transform-origin: 50% 100%; animation: tree-idle-sway-mini 4s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .tree-idle-sway-mini { animation: none !important; } }
      `}</style>
    );
  }

  return (
    <style>{`
      @keyframes tree-idle-breathe {
        0%, 100% { transform: scale(1) rotate(0deg); }
        25% { transform: scale(1.02) rotate(-0.5deg); }
        75% { transform: scale(1.02) rotate(0.5deg); }
      }

      @keyframes tree-happy-jump {
        0% { transform: translateY(0) scale(1); }
        20% { transform: translateY(-25px) scale(1.05) rotate(-3deg); }
        40% { transform: translateY(0) scale(0.95) rotate(2deg); }
        60% { transform: translateY(-12px) scale(1.02) rotate(-1deg); }
        80% { transform: translateY(0) scale(1); }
        100% { transform: translateY(0) scale(1); }
      }

      @keyframes arm-wave-excited-left {
        0%, 100% { transform: rotate(0deg); }
        25% { transform: rotate(-35deg) translateY(-5px); }
        50% { transform: rotate(15deg); }
        75% { transform: rotate(-25deg) translateY(-3px); }
      }
      @keyframes arm-wave-excited-right {
        0%, 100% { transform: rotate(0deg); }
        25% { transform: rotate(30deg) translateY(-5px); }
        50% { transform: rotate(-12deg); }
        75% { transform: rotate(20deg) translateY(-3px); }
      }

      @keyframes book-fly-around {
        0% { transform: translate(0, 0) rotate(0deg); opacity: 0; }
        10% { opacity: 1; }
        25% { transform: translate(60px, -40px) rotate(90deg); }
        50% { transform: translate(0, -80px) rotate(180deg); }
        75% { transform: translate(-60px, -40px) rotate(270deg); }
        90% { opacity: 1; }
        100% { transform: translate(0, 0) rotate(360deg); opacity: 0; }
      }

      @keyframes butterfly-fly-1 {
        0%, 100% { transform: translate(0, 0) rotate(0deg); }
        25% { transform: translate(30px, -20px) rotate(15deg); }
        50% { transform: translate(60px, 0) rotate(0deg); }
        75% { transform: translate(30px, 20px) rotate(-15deg); }
      }
      @keyframes butterfly-fly-2 {
        0%, 100% { transform: translate(0, 0) rotate(0deg) scaleX(1); }
        50% { transform: translate(-40px, -30px) rotate(-20deg) scaleX(0.8); }
      }

      @keyframes bird-appear {
        0%, 90%, 100% { opacity: 0; transform: translateY(-10px); }
        92%, 98% { opacity: 1; transform: translateY(0); }
      }

      @keyframes leaf-fall-spin {
        0% { transform: translateY(-10px) rotate(0deg) scale(1); opacity: 0; }
        10% { opacity: 1; }
        100% { transform: translateY(180px) rotate(720deg) scale(0.5); opacity: 0; }
      }

      @keyframes sparkle-twinkle {
        0%, 100% { opacity: 0; transform: scale(0) rotate(0deg); }
        50% { opacity: 1; transform: scale(1) rotate(90deg); }
      }

      @keyframes blush-pulse {
        0%, 100% { opacity: 0.4; }
        50% { opacity: 0.7; }
      }

      .tree-idle-breathe {
        transform-origin: 50% 100%;
        animation: tree-idle-breathe 4s ease-in-out infinite;
      }
      .tree-happy-jump {
        transform-origin: 50% 100%;
        animation: tree-happy-jump 1s cubic-bezier(0.34,1.56,0.64,1);
      }
      .arm-left-excited {
        transform-origin: 78px 148px;
        animation: arm-wave-excited-left 1s ease-in-out;
      }
      .arm-right-excited {
        transform-origin: 122px 148px;
        animation: arm-wave-excited-right 1s ease-in-out;
      }
      .flying-book {
        animation: book-fly-around 4s linear infinite;
        transform-origin: center;
      }
      .butterfly-1 {
        animation: butterfly-fly-1 6s ease-in-out infinite;
      }
      .butterfly-2 {
        animation: butterfly-fly-2 5s ease-in-out infinite 1s;
      }
      .bird-perch {
        animation: bird-appear 8s ease-in-out infinite;
      }
      .leaf-spin {
        animation: leaf-fall-spin linear forwards;
      }
      .sparkle {
        animation: sparkle-twinkle 1.5s ease-in-out infinite;
      }
      .blush-active {
        animation: blush-pulse 2s ease-in-out infinite;
      }

      @media (prefers-reduced-motion: reduce) {
        .tree-idle-breathe, .tree-happy-jump, .arm-left-excited, .arm-right-excited,
        .flying-book, .butterfly-1, .butterfly-2, .bird-perch, .leaf-spin, .sparkle, .blush-active {
          animation: none !important;
        }
      }
    `}</style>
  );
}

export function CreatureFace({
  cx = 95,
  cy = 62,
  eyeGap = 26,
  eyeR = 11,
  blink = false,
  happy = false,
  stare = false,
  lookX = 0,
  lookY = 0,
  size = 1,
}: {
  cx?: number;
  cy?: number;
  eyeGap?: number;
  eyeR?: number;
  blink?: boolean;
  happy?: boolean;
  stare?: boolean;
  lookX?: number;
  lookY?: number;
  size?: number;
}) {
  const leftX = cx - eyeGap / 2;
  const rightX = cx + eyeGap / 2;
  const r = eyeR * size;
  const look = Math.max(-1, Math.min(1, lookX));
  const lookV = Math.max(-1, Math.min(1, lookY));

  return (
    <g>
      <ellipse
        cx={leftX - r * 1.4}
        cy={cy + r * 1.6}
        rx={r * (happy ? 1 : 0.8)}
        ry={r * (happy ? 0.7 : 0.55)}
        fill="#fda4af"
        opacity={happy ? 0.8 : 0.55}
        className={happy ? "blush-active" : ""}
      />
      <ellipse
        cx={rightX + r * 1.4}
        cy={cy + r * 1.6}
        rx={r * (happy ? 1 : 0.8)}
        ry={r * (happy ? 0.7 : 0.55)}
        fill="#fda4af"
        opacity={happy ? 0.8 : 0.55}
        className={happy ? "blush-active" : ""}
      />

      {blink ? (
        <>
          <path
            d={`M${leftX - r},${cy} Q${leftX},${cy + r * 0.8} ${leftX + r},${cy}`}
            stroke="#14532d"
            strokeWidth={r * 0.4}
            strokeLinecap="round"
            fill="none"
          />
          <path
            d={`M${rightX - r},${cy} Q${rightX},${cy + r * 0.8} ${rightX + r},${cy}`}
            stroke="#14532d"
            strokeWidth={r * 0.4}
            strokeLinecap="round"
            fill="none"
          />
        </>
      ) : stare ? (
        <>
          <path
            d={`M${leftX - r * 1.3},${cy - r * 1.5 - look * r * 0.3} Q${leftX},${cy - r * 2.3 - look * r * 0.3} ${leftX + r * 1.3},${cy - r * 1.6 - look * r * 0.3}`}
            stroke="#14532d"
            strokeWidth={r * 0.32}
            strokeLinecap="round"
            fill="none"
          />
          <path
            d={`M${rightX - r * 1.3},${cy - r * 1.6 - look * r * 0.3} Q${rightX},${cy - r * 2.3 - look * r * 0.3} ${rightX + r * 1.3},${cy - r * 1.5 - look * r * 0.3}`}
            stroke="#14532d"
            strokeWidth={r * 0.32}
            strokeLinecap="round"
            fill="none"
          />

          <ellipse cx={leftX} cy={cy} rx={r * 1.15} ry={r * 1.35} fill="#ffffff" stroke="#14532d" strokeWidth={r * 0.12} />
          <ellipse cx={rightX} cy={cy} rx={r * 1.15} ry={r * 1.35} fill="#ffffff" stroke="#14532d" strokeWidth={r * 0.12} />

          <circle cx={leftX + look * r * 0.55} cy={cy + r * 0.1 + lookV * r * 0.45} r={r * 0.62} fill="#3f6212" />
          <circle cx={rightX + look * r * 0.55} cy={cy + r * 0.1 + lookV * r * 0.45} r={r * 0.62} fill="#3f6212" />
          <circle cx={leftX + look * r * 0.55} cy={cy + r * 0.1 + lookV * r * 0.45} r={r * 0.3} fill="#14532d" />
          <circle cx={rightX + look * r * 0.55} cy={cy + r * 0.1 + lookV * r * 0.45} r={r * 0.3} fill="#14532d" />

          <circle cx={leftX + look * r * 0.55 - r * 0.28} cy={cy - r * 0.35 + lookV * r * 0.3} r={r * 0.18} fill="#ffffff" opacity="0.9" />
          <circle cx={rightX + look * r * 0.55 - r * 0.28} cy={cy - r * 0.35 + lookV * r * 0.3} r={r * 0.18} fill="#ffffff" opacity="0.9" />
        </>
      ) : (
        <>
          <circle cx={leftX} cy={cy} r={r} fill="#ffffff" />
          <circle cx={rightX} cy={cy} r={r} fill="#ffffff" />
          <circle cx={leftX + look * r * 0.3} cy={cy + r * 0.15} r={r * 0.65} fill="#14532d" />
          <circle cx={rightX + look * r * 0.3} cy={cy + r * 0.15} r={r * 0.65} fill="#14532d" />
          <circle cx={leftX + look * r * 0.3 - r * 0.25} cy={cy - r * 0.3} r={r * 0.25} fill="#ffffff" />
          <circle cx={rightX + look * r * 0.3 - r * 0.25} cy={cy - r * 0.3} r={r * 0.25} fill="#ffffff" />
        </>
      )}

      {stare ? (
        <ellipse cx={cx} cy={cy + r * 1.9} rx={r * 0.55} ry={r * 0.7} fill="#14532d" opacity="0.85" />
      ) : happy ? (
        <path
          d={`M${cx - r * 1.4},${cy + r * 1.5} Q${cx},${cy + r * 2.8} ${cx + r * 1.4},${cy + r * 1.5}`}
          stroke="#14532d"
          strokeWidth={r * 0.35}
          strokeLinecap="round"
          fill="none"
        />
      ) : (
        <path
          d={`M${cx - r * 1.1},${cy + r * 1.55} Q${cx},${cy + r * 2.55} ${cx + r * 1.1},${cy + r * 1.55}`}
          stroke="#14532d"
          strokeWidth={r * 0.3}
          strokeLinecap="round"
          fill="none"
        />
      )}
    </g>
  );
}

export function TreeCanopy({
  stage,
  gradId,
  showBuds = false,
  showFruit = false,
  showFace = true,
  blink = false,
  happy = false,
  stare = false,
  lookX = 0,
  lookY = 0,
}: {
  stage: TreeStage;
  gradId: string;
  showBuds?: boolean;
  showFruit?: boolean;
  showFace?: boolean;
  blink?: boolean;
  happy?: boolean;
  stare?: boolean;
  lookX?: number;
  lookY?: number;
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

      <path d={CANOPY_BLOB_PATH} transform="translate(6,10) scale(0.98)" fill={palette.dark} opacity={0.16} />
      <path d={CANOPY_BLOB_PATH} fill={`url(#${gradId})`} />
      <path d={CANOPY_BLOB_PATH} transform="translate(20,18) scale(0.55)" fill={palette.dark} opacity={0.22} />
      <ellipse cx="70" cy="35" rx="26" ry="14" fill="#ffffff" opacity={0.25} />

      {showBuds && (
        <>
          <circle cx="45" cy="98" r="4" fill="#fef08a" opacity={0.9} />
          <circle cx="140" cy="95" r="3.5" fill="#fef08a" opacity={0.9} />
          <circle cx="30" cy="70" r="3" fill="#fef9c3" opacity={0.9} />
        </>
      )}

      {showFruit && (
        <>
          <circle cx="35" cy="88" r="5" fill="#f97316" />
          <circle cx="100" cy="118" r="5" fill="#ef4444" />
          <circle cx="150" cy="70" r="4.5" fill="#f97316" />
          <circle cx="150" cy="100" r="4" fill="#ef4444" />
        </>
      )}

      {showFace && <CreatureFace blink={blink} happy={happy} stare={stare} lookX={lookX} lookY={lookY} />}
    </g>
  );
}
