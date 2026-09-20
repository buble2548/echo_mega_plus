import { memo, useEffect, useMemo, useState } from "react";

const W = 1000;
const H = 560;
export const BLOOM_MAX_ROUND = 40;

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const midY = (x) => 398 + 20 * Math.sin(x / 140 + 1.3) + 12 * Math.sin(x / 330);
const nearY = (x) => 470 + 16 * Math.sin(x / 100) + 9 * Math.sin(x / 240 + 2);

function ridgePath(fn) {
  let d = `M -20 ${fn(-20).toFixed(1)}`;
  for (let x = 0; x <= W + 20; x += 20) d += ` L ${x} ${fn(x).toFixed(1)}`;
  return `${d} L ${W + 20} ${H + 20} L -20 ${H + 20} Z`;
}

const MID_PATH_D = ridgePath(midY);
const NEAR_PATH_D = ridgePath(nearY);

const FAR_RIDGE =
  "M -20 338 L 40 300 L 96 322 L 150 268 L 196 246 L 244 292 L 296 262 L 352 308 L 410 272 L 452 300 L 510 250 L 566 288 L 620 258 L 684 304 L 742 268 L 800 296 L 856 258 L 910 300 L 962 276 L 1020 314 L 1020 580 L -20 580 Z";

const TOWERS = [
  { x: 806, w: 16, h: 84, spire: 26 },
  { x: 828, w: 24, h: 118, spire: 34 },
  { x: 858, w: 14, h: 70, spire: 22 },
  { x: 876, w: 20, h: 96, spire: 28 },
];

function Castle({ fill }) {
  return (
    <g fill={fill}>
      <rect x="796" y="284" width="106" height="22" />
      {TOWERS.map((t) => (
        <g key={t.x}>
          <rect x={t.x} y={296 - t.h} width={t.w} height={t.h} />
          <path d={`M ${t.x - 3} ${296 - t.h} L ${t.x + t.w / 2} ${296 - t.h - t.spire} L ${t.x + t.w + 3} ${296 - t.h} Z`} />
        </g>
      ))}
    </g>
  );
}

const FLOWER_POOL = (() => {
  const rnd = seeded(913377);
  const near = Array.from({ length: 30 }, () => {
    const x = 6 + rnd() * (W - 12);
    return { x, y: nearY(x) + 2, h: 12 + rnd() * 20, r: 3.4 + rnd() * 2.6, sway: 5 + rnd() * 5, delay: rnd() * 0.6 };
  });
  const mid = Array.from({ length: 14 }, () => {
    const x = 10 + rnd() * (W - 20);
    return { x, y: midY(x) + 2, h: 7 + rnd() * 11, r: 2.2 + rnd() * 1.8, sway: 6 + rnd() * 5, delay: rnd() * 0.6 };
  });
  const spires = Array.from({ length: 8 }, () => {
    const x = 20 + rnd() * (W - 40);
    return { x, y: nearY(x) + 2, h: 52 + rnd() * 78, lean: (rnd() - 0.5) * 14, buds: 3 + Math.floor(rnd() * 4), delay: rnd() * 0.7 };
  });
  return { near, mid, spires };
})();

const PETALS = [0, 72, 144, 216, 288];

function Flower({ f, glow }) {
  return (
    <g transform={`translate(${f.x.toFixed(1)} ${f.y.toFixed(1)})`}>
      <g className="ab-bloom" style={{ animationDelay: `${f.delay}s` }}>
        <g>
          <path d={`M 0 0 Q ${(f.r * 0.5).toFixed(1)} ${(-f.h * 0.55).toFixed(1)} 0 ${-f.h}`} stroke="#c9992f" strokeWidth="1.1" fill="none" opacity="0.85" />
          <g transform={`translate(0 ${-f.h})`}>
            {glow && <circle r={f.r * 2.4} fill="#ffe9a8" opacity="0.16" />}
            {PETALS.map((a) => (
              <ellipse key={a} cx="0" cy={-f.r * 0.82} rx={f.r * 0.44} ry={f.r * 0.86} fill="#ffe9a8" transform={`rotate(${a})`} />
            ))}
            <circle r={f.r * 0.34} fill="#fff8e2" />
          </g>
        </g>
      </g>
    </g>
  );
}

function Spire({ s, glow }) {
  const buds = Array.from({ length: s.buds }, (_, i) => (i + 1) / (s.buds + 1));
  return (
    <g transform={`translate(${s.x.toFixed(1)} ${s.y.toFixed(1)})`}>
      <g className="ab-spire" style={{ animationDelay: `${s.delay}s` }}>
        <g>
          <path
            d={`M 0 0 Q ${(s.lean * 1.6).toFixed(1)} ${(-s.h * 0.55).toFixed(1)} ${s.lean.toFixed(1)} ${-s.h}`}
            stroke="#c9992f"
            strokeWidth="1.6"
            fill="none"
            opacity="0.9"
          />
          {buds.map((t, i) => {
            const bx = s.lean * (1.6 * t * (1 - t) * 2 + t * t);
            const by = -s.h * t;
            const r = 2.6 + (1 - t) * 1.6;
            return (
              <g key={i} transform={`translate(${bx.toFixed(1)} ${by.toFixed(1)})`}>
                {glow && <circle r={r * 2.2} fill="#ffe9a8" opacity="0.14" />}
                <ellipse rx={r} ry={r * 1.5} fill="#e8bf5a" />
              </g>
            );
          })}
          <g transform={`translate(${s.lean.toFixed(1)} ${(-s.h).toFixed(1)})`}>
            {glow && <circle r="9" fill="#ffe9a8" opacity="0.2" />}
            {PETALS.map((a) => (
              <ellipse key={a} cx="0" cy="-3.4" rx="1.9" ry="3.6" fill="#ffe9a8" transform={`rotate(${a})`} />
            ))}
            <circle r="1.5" fill="#fff8e2" />
          </g>
        </g>
      </g>
    </g>
  );
}

function Blight({ bloom, glow }) {
  const nearN = Math.round(bloom * FLOWER_POOL.near.length);
  const midN = Math.round(bloom * FLOWER_POOL.mid.length);
  const spireN = Math.round(bloom * FLOWER_POOL.spires.length);
  return (
    <>
      <g className="ab-sway-band" style={{ animationDuration: "11s" }} opacity="0.72">
        {FLOWER_POOL.mid.slice(0, midN).map((f, i) => <Flower key={`m${i}`} f={f} glow={glow} />)}
      </g>
      <g className="ab-sway-band" style={{ animationDuration: "14s", animationDelay: "-3s" }}>
        {FLOWER_POOL.spires.slice(0, spireN).map((s, i) => <Spire key={`s${i}`} s={s} glow={glow} />)}
      </g>
      <g className="ab-sway-band" style={{ animationDuration: "9s", animationDelay: "-5s" }}>
        {FLOWER_POOL.near.slice(0, nearN).map((f, i) => <Flower key={`n${i}`} f={f} glow={glow} />)}
      </g>
    </>
  );
}

const STARS = (() => {
  const rnd = seeded(5150);
  return Array.from({ length: 34 }, () => ({
    x: rnd() * W,
    y: rnd() * 320,
    r: 0.6 + rnd() * 1.5,
    dur: 2 + rnd() * 4,
    delay: rnd() * 5,
  }));
})();

const DayScene = memo(function DayScene({ bloom }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="abDaySky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2a1240" />
          <stop offset="34%" stopColor="#6b3a72" />
          <stop offset="62%" stopColor="#c07a63" />
          <stop offset="82%" stopColor="#e8b15c" />
          <stop offset="100%" stopColor="#f6d79a" />
        </linearGradient>
        <radialGradient id="abSun">
          <stop offset="0%" stopColor="#fffbe8" />
          <stop offset="44%" stopColor="#ffd98a" />
          <stop offset="100%" stopColor="#ffb24d" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="abDayFar" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#5a2f66" />
          <stop offset="100%" stopColor="#3a1a4c" />
        </linearGradient>
        <linearGradient id="abDayMid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3d1c50" />
          <stop offset="100%" stopColor="#25102f" />
        </linearGradient>
        <linearGradient id="abDayNear" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1d0c28" />
          <stop offset="100%" stopColor="#0e0617" />
        </linearGradient>
      </defs>

      <rect width={W} height={H} fill="url(#abDaySky)" />
      <circle className="ab-orb" cx="742" cy="312" r="128" fill="url(#abSun)" />
      <circle className="ab-orb" cx="742" cy="312" r="34" fill="#fff6dc" opacity="0.95" />

      <g className="ab-ray" opacity="0.32">
        {[-46, -26, -8, 10, 30, 50].map((a, i) => (
          <path
            key={a}
            d={`M 742 312 L ${742 + Math.cos(((a - 90) * Math.PI) / 180) * 700 - 26} ${312 + Math.sin(((a - 90) * Math.PI) / 180) * 700} L ${742 + Math.cos(((a - 90) * Math.PI) / 180) * 700 + 26} ${312 + Math.sin(((a - 90) * Math.PI) / 180) * 700} Z`}
            fill="#ffe9a8"
            opacity={i % 2 ? 0.3 : 0.5}
          />
        ))}
      </g>

      <g className="ab-mist" style={{ animationDuration: "48s" }} opacity="0.3">
        <ellipse cx="300" cy="352" rx="330" ry="17" fill="#f6d79a" />
        <ellipse cx="760" cy="368" rx="280" ry="13" fill="#f6d79a" />
      </g>

      <path d={FAR_RIDGE} fill="url(#abDayFar)" />
      <Castle fill="#2e1145" />
      <path d={MID_PATH_D} fill="url(#abDayMid)" />
      <g className="ab-mist" style={{ animationDuration: "64s" }} opacity="0.22">
        <ellipse cx="520" cy="424" rx="420" ry="14" fill="#e8b15c" />
      </g>
      <path d={NEAR_PATH_D} fill="url(#abDayNear)" />
      <Blight bloom={bloom} glow={false} />
    </svg>
  );
});

const NightScene = memo(function NightScene({ bloom }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="abNightSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#04030c" />
          <stop offset="38%" stopColor="#14082a" />
          <stop offset="70%" stopColor="#2b1150" />
          <stop offset="100%" stopColor="#452063" />
        </linearGradient>
        <radialGradient id="abMoon">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="38%" stopColor="#dfe4ff" />
          <stop offset="100%" stopColor="#8f9dff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="abAur" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7cf5d8" stopOpacity="0" />
          <stop offset="46%" stopColor="#6fd8ff" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#b95fc4" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="abNightFar" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2a1348" />
          <stop offset="100%" stopColor="#170a2a" />
        </linearGradient>
        <linearGradient id="abNightMid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#190b2c" />
          <stop offset="100%" stopColor="#0d0619" />
        </linearGradient>
        <linearGradient id="abNightNear" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0c0518" />
          <stop offset="100%" stopColor="#05030c" />
        </linearGradient>
      </defs>

      <rect width={W} height={H} fill="url(#abNightSky)" />

      {STARS.map((s, i) => (
        <circle
          key={i}
          className={i % 3 === 0 ? "ab-star" : undefined}
          cx={s.x}
          cy={s.y}
          r={s.r}
          fill="#fff"
          style={{ animationDuration: `${s.dur}s`, animationDelay: `-${s.delay}s` }}
        />
      ))}

      <g className="ab-aurora">
        <path d="M -40 168 C 180 96 340 208 520 140 C 700 72 860 176 1040 116 L 1040 226 C 860 286 700 182 520 250 C 340 318 180 206 -40 278 Z" fill="url(#abAur)" />
      </g>

      <circle className="ab-orb" cx="256" cy="168" r="118" fill="url(#abMoon)" />
      <circle className="ab-orb" cx="256" cy="168" r="40" fill="#f2f4ff" />
      <circle cx="240" cy="156" r="8" fill="#cdd4f5" opacity="0.6" />
      <circle cx="268" cy="182" r="5.5" fill="#cdd4f5" opacity="0.5" />
      <circle cx="262" cy="150" r="3.5" fill="#cdd4f5" opacity="0.45" />

      <g className="ab-mist" style={{ animationDuration: "56s" }} opacity="0.2">
        <ellipse cx="420" cy="358" rx="360" ry="16" fill="#8f9dff" />
        <ellipse cx="820" cy="374" rx="250" ry="12" fill="#8f9dff" />
      </g>

      <path d={FAR_RIDGE} fill="url(#abNightFar)" />
      <Castle fill="#0f0722" />
      <g opacity="0.8">
        {TOWERS.map((t, i) => (
          <circle key={t.x} className="ab-star" cx={t.x + t.w / 2} cy={296 - t.h - t.spire * 0.4} r="1.8" fill="#ffe9a8" style={{ animationDuration: `${2.5 + i}s` }} />
        ))}
      </g>
      <path d={MID_PATH_D} fill="url(#abNightMid)" />
      <g className="ab-mist" style={{ animationDuration: "72s" }} opacity="0.18">
        <ellipse cx="540" cy="426" rx="430" ry="15" fill="#b95fc4" />
      </g>
      <path d={NEAR_PATH_D} fill="url(#abNightNear)" />
      <Blight bloom={bloom} glow />
    </svg>
  );
});

function ArenaBackdrop({ cycle, round = 0 }) {
  const night = cycle === "night";
  const bloom = Math.max(0, Math.min(1, (round || 0) / BLOOM_MAX_ROUND));
  // เลิกวาดฉากที่ไม่ได้ใช้ทิ้งไปเลยหลังเฟดจบ — ไม่งั้นทั้งสองฉากรันอนิเมชันพร้อมกันตลอดเวลา
  const [liveDay, setLiveDay] = useState(!night);
  const [liveNight, setLiveNight] = useState(night);
  useEffect(() => {
    if (night) setLiveNight(true);
    else setLiveDay(true);
    const t = setTimeout(() => (night ? setLiveDay(false) : setLiveNight(false)), 3200);
    return () => clearTimeout(t);
  }, [night]);

  const pollen = useMemo(() => {
    const rnd = seeded(2211);
    return Array.from({ length: 18 }, () => ({
      left: rnd() * 100,
      size: 1.6 + rnd() * 3.4,
      dur: 16 + rnd() * 18,
      delay: rnd() * 26,
      px: (rnd() - 0.4) * 140,
    }));
  }, []);

  return (
    <div className="ab">
      {liveDay && (
        <div className="ab-layer" style={{ opacity: night ? 0 : 1 }}>
          <DayScene bloom={bloom} />
        </div>
      )}
      {liveNight && (
        <div className="ab-layer" style={{ opacity: night ? 1 : 0 }}>
          <NightScene bloom={bloom} />
        </div>
      )}

      <div className="ab-gild" style={{ opacity: 0.1 + bloom * 0.6 }} />

      {pollen.map((p, i) => (
        <span
          key={i}
          className="ab-pollen"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size,
            background: night ? "#ffe9a8" : "#fff3d0",
            boxShadow: `0 0 ${6 + p.size * 2}px ${1 + p.size * 0.4}px rgba(232,191,90,${night ? 0.8 : 0.5})`,
            opacity: 0.25 + bloom * 0.6,
            "--px": `${p.px}px`,
            animationDuration: `${p.dur}s`,
            animationDelay: `-${p.delay}s`,
          }}
        />
      ))}

      <div className="ab-grade" />
    </div>
  );
}

export default memo(ArenaBackdrop);
