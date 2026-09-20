import { useMemo } from "react";

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function RoundBanner({ round }) {
  const sparks = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => {
        const a = (i / 18) * Math.PI * 2 + 0.4;
        const d = 26 + (i % 5) * 9;
        return {
          sx: `${(Math.cos(a) * d).toFixed(1)}vw`,
          sy: `${(Math.sin(a) * d * 0.9).toFixed(1)}vh`,
          size: 3 + (i % 3) * 2,
          delay: 0.12 + (i % 6) * 0.04,
        };
      }),
    []
  );

  return (
    <div className="rb">
      <div className="rb-wash" />
      <span className="rb-slash rb-slash-a" />
      <span className="rb-slash rb-slash-b" />

      <span className="rb-numeral">{round}</span>

      <div className="rb-title flex flex-col items-center gap-1">
        <span className="av-label" style={{ letterSpacing: "0.55em", fontSize: "1rem" }}>รอบที่</span>
        <span className="av-title av-title-thai text-8xl leading-none">{round}</span>
      </div>

      {sparks.map((s, i) => (
        <span
          key={i}
          className="rb-spark"
          style={{
            width: s.size,
            height: s.size,
            marginLeft: -s.size / 2,
            marginTop: -s.size / 2,
            "--sx": s.sx,
            "--sy": s.sy,
            animationDelay: `${s.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

function Bird({ scale = 1 }) {
  return (
    <svg width={22 * scale} height={12 * scale} viewBox="0 0 22 12" aria-hidden="true">
      <path d="M1 8 Q 5.5 1 11 7 Q 16.5 1 21 8" fill="none" stroke="#1a0f24" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function Moth({ scale = 1 }) {
  return (
    <svg width={18 * scale} height={14 * scale} viewBox="0 0 18 14" aria-hidden="true">
      <ellipse cx="5.4" cy="6" rx="4.6" ry="5.6" fill="#ffe9a8" opacity="0.9" transform="rotate(-18 5.4 6)" />
      <ellipse cx="12.6" cy="6" rx="4.6" ry="5.6" fill="#e8bf5a" opacity="0.9" transform="rotate(18 12.6 6)" />
      <rect x="8.4" y="3.4" width="1.3" height="7.4" rx="0.6" fill="#fff8e2" />
    </svg>
  );
}

export function CycleScene({ c }) {
  const night = c.cycle === "night";
  const accent = night ? "#aab4ff" : "#f6ad3c";
  const title = night ? (c.oberon ? "ราตรีกลืนกิน" : "ราตรีมาเยือน") : "รุ่งอรุณมาถึง";
  const sub = night
    ? c.oberon
      ? "ราชาแห่งการหลอกลวงครอบงำราตรี — จนกว่าฟ้าจะสาง"
      : "สุ่มสกิลพื้นฐาน/สกิลรองแพงขึ้น +1 ทุกเทิร์น"
    : "จบเทิร์นได้แต้มสกิลเพิ่ม +1";

  const flock = useMemo(() => {
    const rnd = seeded(night ? 8811 : 4422);
    return Array.from({ length: night ? 7 : 9 }, () => ({
      top: 14 + rnd() * 46,
      scale: 0.7 + rnd() * 0.9,
      dur: 1.9 + rnd() * 1.1,
      delay: rnd() * 0.9,
      fy: (rnd() - 0.65) * 26,
    }));
  }, [night]);

  return (
    <div className="cy">
      <div
        className="cy-wash"
        style={{
          background: night
            ? "radial-gradient(ellipse 90% 70% at 50% 68%, rgba(70,40,150,.5), transparent 70%), linear-gradient(180deg, rgba(6,4,20,.7), transparent 55%)"
            : "radial-gradient(ellipse 90% 70% at 50% 68%, rgba(246,173,60,.42), transparent 70%), linear-gradient(0deg, rgba(246,173,60,.3), transparent 55%)",
        }}
      />

      <div
        className="cy-orb"
        style={{
          top: "46%",
          background: night
            ? "radial-gradient(circle at 42% 38%, #ffffff, #dfe4ff 40%, rgba(143,157,255,0) 72%)"
            : "radial-gradient(circle at 42% 38%, #fffbe8, #ffd98a 42%, rgba(255,178,77,0) 74%)",
          boxShadow: `0 0 90px 30px ${night ? "rgba(170,180,255,.45)" : "rgba(246,173,60,.5)"}`,
          animationName: night ? "cyOrbRise" : "cyOrbRise",
        }}
      />

      <div className="cy-horizon" style={{ color: accent }} />

      {flock.map((f, i) => (
        <span
          key={i}
          className="cy-flock"
          style={{
            top: `${f.top}%`,
            left: 0,
            "--fy": `${f.fy}vh`,
            animationDuration: `${f.dur}s`,
            animationDelay: `${f.delay}s`,
          }}
        >
          {night ? <Moth scale={f.scale} /> : <Bird scale={f.scale} />}
        </span>
      ))}

      <div className="cy-text">
        <div className="av-label" style={{ letterSpacing: "0.5em", color: accent }}>
          {night ? "ค่ำคืน" : "รุ่งเช้า"}
        </div>
        <div
          className="av-title av-title-thai text-7xl leading-none"
          style={{ filter: `drop-shadow(0 0 30px ${accent})` }}
        >
          {title}
        </div>
        <div
          className="av-heading text-base px-5 py-1.5 rounded-full"
          style={{ background: "rgba(6,4,12,.62)", border: `1px solid ${accent}66`, color: "rgba(239,230,245,.9)" }}
        >
          {sub}
        </div>
      </div>
    </div>
  );
}
