import { useMemo } from "react";
import { clickSound } from "../audio";

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function GoldVeins({ level = 3, seed = 7 }) {
  const { veins, nodes } = useMemo(() => {
    const rnd = seeded(seed * 97 + level * 13);
    const trunkCount = 2 + level;
    const veins = [];
    const nodes = [];

    for (let t = 0; t < trunkCount; t++) {
      const side = t % 4;
      let x = side === 0 ? 0 : side === 1 ? 100 : rnd() * 100;
      let y = side === 2 ? 0 : side === 3 ? 100 : rnd() * 100;
      let d = `M ${x.toFixed(1)} ${y.toFixed(1)}`;
      const segments = 3 + Math.floor(rnd() * 3);

      for (let s = 0; s < segments; s++) {
        const towardX = x + (50 - x) * (0.22 + rnd() * 0.3);
        const towardY = y + (50 - y) * (0.22 + rnd() * 0.3);
        const nx = Math.max(-4, Math.min(104, towardX + (rnd() - 0.5) * 26));
        const ny = Math.max(-4, Math.min(104, towardY + (rnd() - 0.5) * 26));
        const cx = (x + nx) / 2 + (rnd() - 0.5) * 20;
        const cy = (y + ny) / 2 + (rnd() - 0.5) * 20;
        d += ` Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${nx.toFixed(1)} ${ny.toFixed(1)}`;

        if (s > 0 && nodes.length < level * 2 && rnd() < 0.5) {
          nodes.push({ x: nx, y: ny, delay: rnd() * 3 });
          const bx = nx + (rnd() - 0.5) * 30;
          const by = ny + (rnd() - 0.5) * 30;
          veins.push({
            d: `M ${nx.toFixed(1)} ${ny.toFixed(1)} Q ${((nx + bx) / 2).toFixed(1)} ${((ny + by) / 2).toFixed(1)} ${bx.toFixed(1)} ${by.toFixed(1)}`,
            thin: true,
            dur: 8 + rnd() * 9,
            delay: rnd() * 6,
          });
        }
        x = nx;
        y = ny;
      }

      veins.push({ d, thin: false, bright: rnd() < 0.25, dur: 11 + rnd() * 12, delay: rnd() * 8 });
    }
    return { veins, nodes };
  }, [level, seed]);

  return (
    <div className="av-veins" aria-hidden="true">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none">
        {veins.map((v, i) => (
          <path
            key={i}
            d={v.d}
            vectorEffect="non-scaling-stroke"
            className={`av-vein${v.thin ? " av-vein-thin" : ""}${v.bright ? " av-vein-bright" : ""}`}
            style={{ animationDuration: `${v.dur}s`, animationDelay: `-${v.delay}s` }}
          />
        ))}
      </svg>
      {nodes.map((n, i) => (
        <span key={i} className="av-node-dot" style={{ left: `${n.x}%`, top: `${n.y}%`, animationDelay: `-${n.delay}s` }} />
      ))}
    </div>
  );
}

export function Motes({ level = 3 }) {
  const gold = useMemo(() => {
    const rnd = seeded(level * 31 + 5);
    return Array.from({ length: 4 + level * 2 }, () => ({
      left: rnd() * 100,
      dur: 13 + rnd() * 13,
      delay: rnd() * 22,
      size: 2 + rnd() * 3,
    }));
  }, [level]);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0" aria-hidden="true">
      {gold.map((m, i) => (
        <span
          key={i}
          className="av-mote"
          style={{
            left: `${m.left}%`,
            width: m.size,
            height: m.size,
            animationDuration: `${m.dur}s`,
            animationDelay: `-${m.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

const VINES = [
  {
    stem: "M 4 118 C 18 104 26 86 24 66 C 22 46 34 30 54 24 C 70 19 84 26 92 38",
    branches: ["M 24 66 C 34 62 44 66 50 74", "M 54 24 C 52 12 58 4 66 1"],
    leaves: [{ x: 24, y: 66, r: -34 }, { x: 50, y: 74, r: 26 }, { x: 34, y: 34, r: -66 }, { x: 66, y: 21, r: 8 }],
    blossoms: [{ x: 92, y: 38, s: 1 }, { x: 66, y: 1, s: 0.7 }],
  },
  {
    stem: "M 60 120 C 54 100 68 86 62 64 C 56 44 70 30 88 24",
    branches: ["M 62 64 C 48 60 40 48 42 34", "M 66 94 C 80 90 90 78 88 66"],
    leaves: [{ x: 62, y: 64, r: -52 }, { x: 42, y: 34, r: -88 }, { x: 88, y: 66, r: 34 }, { x: 74, y: 40, r: -14 }],
    blossoms: [{ x: 88, y: 24, s: 1 }, { x: 42, y: 34, s: 0.62 }],
  },
  {
    stem: "M 0 62 C 22 54 38 66 58 58 C 78 50 94 60 114 48",
    branches: ["M 38 62 C 36 46 44 34 58 30", "M 78 54 C 82 70 94 78 106 78"],
    leaves: [{ x: 38, y: 62, r: -70 }, { x: 78, y: 54, r: 58 }, { x: 58, y: 30, r: -20 }, { x: 106, y: 78, r: 24 }],
    blossoms: [{ x: 114, y: 48, s: 0.9 }, { x: 58, y: 30, s: 0.66 }],
  },
];

const VINE_ANCHORS = [
  { left: "-6vw", bottom: "-7vh", rot: 0, order: 0 },
  { right: "-6vw", top: "-7vh", rot: 180, order: 1 },
  { left: "-6vw", top: "-6vh", rot: 92, order: 2 },
  { right: "-6vw", bottom: "-6vh", rot: -92, order: 0 },
  { left: "16%", bottom: "-12vh", rot: -14, order: 1 },
  { right: "14%", top: "-12vh", rot: 166, order: 2 },
  { left: "-10vw", top: "36%", rot: 42, order: 1 },
];

const LEAF_D = "M0 0 C 5 -7 15 -8 22 0 C 15 8 5 7 0 0 Z";

function Blossom({ x, y, s, delay }) {
  const petals = [0, 72, 144, 216, 288];
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <g className="av-blossom" style={{ animationDelay: `${delay}s` }}>
        {petals.map((a) => (
          <ellipse key={a} className="av-blossom-petal" cx="0" cy="-4.4" rx="2.1" ry="4.4" transform={`rotate(${a})`} />
        ))}
        <circle className="av-blossom-core" r="1.7" />
      </g>
    </g>
  );
}

function Vine({ tpl, anchor, size, delay, seed }) {
  return (
    <svg
      className="av-vine"
      viewBox="0 0 120 120"
      width={size}
      height={size}
      style={{
        left: anchor.left,
        right: anchor.right,
        top: anchor.top,
        bottom: anchor.bottom,
        "--vr": `${anchor.rot}deg`,
        animationDelay: `-${seed % 7}s`,
      }}
      aria-hidden="true"
    >
      <path className="av-vine-stem" d={tpl.stem} style={{ "--len": 420, animationDelay: `${delay}s` }} />
      {tpl.branches.map((b, i) => (
        <path
          key={i}
          className="av-vine-stem av-vine-stem-thin"
          d={b}
          style={{ "--len": 180, animationDelay: `${delay + 0.7 + i * 0.25}s` }}
        />
      ))}
      {tpl.leaves.map((l, i) => (
        <g key={i} transform={`translate(${l.x} ${l.y}) rotate(${l.r}) scale(0.52)`}>
          <path className="av-leaf" d={LEAF_D} style={{ animationDelay: `${delay + 1 + i * 0.18}s` }} />
        </g>
      ))}
      {tpl.blossoms.map((b, i) => (
        <Blossom key={i} x={b.x} y={b.y} s={b.s} delay={delay + 1.5 + i * 0.3} />
      ))}
    </svg>
  );
}

export function FaeGrowth({ level = 3, seed = 5 }) {
  const { vines, moths } = useMemo(() => {
    const rnd = seeded(seed * 41 + level * 17);
    const count = Math.min(VINE_ANCHORS.length, level + 2);
    const vines = VINE_ANCHORS.slice(0, count).map((a, i) => ({
      anchor: a,
      tpl: VINES[(i + a.order) % VINES.length],
      size: (11 + level * 2.6) * (0.85 + rnd() * 0.4),
      delay: rnd() * 1.2,
      seed: Math.floor(rnd() * 100),
      key: i,
    }));
    const moths = Array.from({ length: Math.max(0, Math.min(3, level - 1)) }, () => ({
      top: 12 + rnd() * 70,
      dur: 26 + rnd() * 20,
      delay: rnd() * 30,
    }));
    return { vines, moths };
  }, [level, seed]);

  return (
    <div className="av-fae" aria-hidden="true">
      {vines.map((v) => (
        <Vine key={v.key} tpl={v.tpl} anchor={v.anchor} size={`${v.size}vw`} delay={v.delay} seed={v.seed} />
      ))}
      {moths.map((m, i) => (
        <span
          key={i}
          className="av-moth"
          style={{ top: `${m.top}%`, left: "-4vw", animationDuration: `${m.dur}s`, animationDelay: `-${m.delay}s` }}
        />
      ))}
    </div>
  );
}

export function Sigil({ level = 3, className = "", style, runes = 12 }) {
  const eaten = 0.12 + level * 0.15;
  const C = 2 * Math.PI * 46;
  const runeMarks = Array.from({ length: runes }, (_, i) => {
    const a = (i / runes) * Math.PI * 2 - Math.PI / 2;
    return { x: 50 + Math.cos(a) * 41, y: 50 + Math.sin(a) * 41, gold: i / runes < eaten };
  });

  return (
    <svg className={`av-sigil ${className}`} style={style} viewBox="0 0 100 100" aria-hidden="true">
      <g className="av-sig-spin">
        <circle className="av-sig-ring" cx="50" cy="50" r="48" strokeWidth="0.4" opacity="0.5" />
        <circle className="av-sig-ring" cx="50" cy="50" r="46" strokeWidth="2.4" strokeDasharray="0.8 3.2" opacity="0.55" />
        <circle
          className="av-sig-ring av-sig-gold"
          cx="50"
          cy="50"
          r="46"
          strokeWidth="2.8"
          strokeDasharray={`${(C * eaten).toFixed(1)} ${C.toFixed(1)}`}
        />
      </g>
      <g className="av-sig-spin-rev">
        <circle className="av-sig-ring" cx="50" cy="50" r="38" strokeWidth="0.7" strokeDasharray="5 4" opacity="0.7" />
        {runeMarks.map((r, i) => (
          <rect
            key={i}
            x={r.x - 1.4}
            y={r.y - 1.4}
            width="2.8"
            height="2.8"
            transform={`rotate(45 ${r.x} ${r.y})`}
            className={r.gold ? "av-sig-gold" : ""}
            fill="currentColor"
            opacity={r.gold ? 1 : 0.55}
          />
        ))}
      </g>
      <g className="av-sig-spin-fast">
        <circle className="av-sig-ring" cx="50" cy="50" r="27" strokeWidth="0.6" opacity="0.6" />
        <rect className="av-sig-ring" x="32" y="32" width="36" height="36" strokeWidth="0.6" opacity="0.45" />
        <rect className="av-sig-ring" x="32" y="32" width="36" height="36" strokeWidth="0.6" opacity="0.45" transform="rotate(45 50 50)" />
      </g>
      <circle className="av-sig-ring av-sig-gold" cx="50" cy="50" r="15" strokeWidth="0.9" opacity="0.8" />
    </svg>
  );
}

export function Crystals({ level = 3, seed = 3 }) {
  const spots = useMemo(() => {
    const rnd = seeded(seed * 61 + level * 7);
    const n = Math.max(1, level - 1);
    return Array.from({ length: n }, () => {
      const edge = Math.floor(rnd() * 4);
      const along = 10 + rnd() * 80;
      const size = 9 + rnd() * 15;
      const pos =
        edge === 0
          ? { top: -size * 0.5, left: `${along}%` }
          : edge === 1
          ? { bottom: -size * 0.5, left: `${along}%` }
          : edge === 2
          ? { left: -size * 0.5, top: `${along}%` }
          : { right: -size * 0.5, top: `${along}%` };
      return { ...pos, width: size, height: size, rot: rnd() * 360, delay: rnd() * 4 };
    });
  }, [level, seed]);

  return spots.map((s, i) => (
    <span
      key={i}
      className="av-crystal"
      style={{
        top: s.top,
        left: s.left,
        right: s.right,
        bottom: s.bottom,
        width: s.width,
        height: s.height,
        "--cr": `${s.rot}deg`,
        animationDelay: `-${s.delay}s`,
      }}
    />
  ));
}

export function AvScene({ level = 3, className = "", veins = true, motes = true, fae = true, seed = 7, children }) {
  return (
    <div className={`av ${className}`} data-corrupt={level}>
      {veins && <GoldVeins level={level} seed={seed} />}
      {motes && <Motes level={level} />}
      {fae && <FaeGrowth level={level} seed={seed} />}
      {children}
    </div>
  );
}

export function AvRule({ children, className = "" }) {
  return (
    <div className={`av-rule ${className}`}>
      {children ? <span className="av-label whitespace-nowrap">{children}</span> : <span className="av-rule-diamond" />}
    </div>
  );
}

export function AvButton({ variant = "gold", className = "", onClick, children, silent = false, ...rest }) {
  const variantCls =
    variant === "royal" ? "av-btn-royal" : variant === "ghost" ? "av-btn-ghost" : variant === "blood" ? "av-btn-blood" : "";
  const handle = (e) => {
    if (!silent) clickSound();
    onClick && onClick(e);
  };
  return (
    <button className={`av-btn ${variantCls} ${className}`} onClick={handle} {...rest}>
      {children}
    </button>
  );
}

export function SealButton({ ready = true, label = "ยืนยัน", className = "", onClick, ...rest }) {
  return (
    <button
      className={`av-seal-btn ${className}`}
      data-ready={ready ? "true" : "false"}
      disabled={!ready}
      onClick={(e) => {
        clickSound();
        onClick && onClick(e);
      }}
      {...rest}
    >
      <span>{label}</span>
    </button>
  );
}

export function Medallion({ on = false, disabled = false, size = 96, className = "", onClick, children, ...rest }) {
  return (
    <button
      className={`av-medallion ${className}`}
      data-on={on ? "true" : "false"}
      disabled={disabled}
      style={{ width: size, height: size }}
      onClick={(e) => {
        if (disabled) return;
        clickSound();
        onClick && onClick(e);
      }}
      {...rest}
    >
      <span className="av-medallion-ring" />
      <span className="av-medallion-face" />
      {children}
    </button>
  );
}

export function Crest({ children, color = "var(--av-purple)", className = "", style }) {
  return (
    <span className={`av-crest ${className}`} style={{ background: color, ...style }}>
      {children}
    </span>
  );
}

export function AvModal({ label, title, right, onClose, children, width = "min(56rem, 94vw)", bodyClass = "" }) {
  return (
    <div className="av-modal-veil" onClick={onClose}>
      <div className="av-modal" style={{ width }} onClick={(e) => e.stopPropagation()}>
        <div className="av-modal-head">
          <div className="min-w-0">
            {label && <div className="av-label">{label}</div>}
            <div className="av-heading text-2xl text-white truncate">{title}</div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {right}
            <button
              className="av-modal-x"
              onClick={() => {
                clickSound();
                onClose && onClose();
              }}
              aria-label="ปิด"
            >
              ✕
            </button>
          </div>
        </div>
        <div className={`av-modal-body av-scroll ${bodyClass}`}>{children}</div>
      </div>
    </div>
  );
}
