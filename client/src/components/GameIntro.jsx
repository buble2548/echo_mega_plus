import { useEffect, useMemo, useState } from "react";
import { AvScene } from "./avalon";

function IntroPortrait({ p, className, style, bare = false }) {
  const [broken, setBroken] = useState(false);
  const introImg = p.character?.img || p.img;
  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={bare ? style : { background: `linear-gradient(150deg, ${p.color}, var(--av-void))`, ...style }}
    >
      {introImg && !broken ? (
        <img src={introImg} alt="" decoding="async" className="absolute inset-0 w-full h-full object-cover" onError={() => setBroken(true)} />
      ) : (
        <span className="absolute inset-0 grid place-items-center text-7xl" style={{ fontFamily: "var(--font-av-display)", fontWeight: 900, color: "rgba(255,255,255,.72)" }}>
          {(p.name || "?").slice(0, 1).toUpperCase()}
        </span>
      )}
    </div>
  );
}

const EMBERS = Array.from({ length: 14 }, () => ({
  x: Math.random() * 100,
  s: 2 + Math.random() * 4,
  d: Math.random() * 2.4,
  t: 2.6 + Math.random() * 2.4,
}));

export default function GameIntro({ players, onDone }) {
  const ordered = useMemo(() => [...players].sort((a, b) => a.position - b.position), [players]);
  const [index, setIndex] = useState(-1);
  const [outro, setOutro] = useState(false);

  const perMs = Math.max(620, Math.min(1000, Math.round(4200 / Math.max(1, ordered.length))));
  const finaleMs = 2900;

  useEffect(() => {
    const timers = [];
    ordered.forEach((_, i) => {
      timers.push(setTimeout(() => setIndex(i), i * perMs));
    });
    timers.push(setTimeout(() => setIndex(ordered.length), ordered.length * perMs));
    timers.push(setTimeout(() => setOutro(true), ordered.length * perMs + finaleMs));
    timers.push(setTimeout(() => onDone && onDone(), ordered.length * perMs + finaleMs + 1000));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordered.length]);

  const current = index >= 0 && index < ordered.length ? ordered[index] : null;
  const isLineup = index === ordered.length;
  const fromLeft = index % 2 === 0;

  return (
    <AvScene level={3} seed={89} className={`av-intro${outro ? " av-intro-out" : ""}`} fae={false}>
      {current && (
        <div key={current.id} className="absolute inset-0">
          <span className="av-intro-halo" style={{ background: `radial-gradient(circle, ${current.color}44 0%, rgba(232,191,90,.16) 32%, transparent 62%)` }} />

          <span
            className="av-numeral av-intro-numeral absolute select-none"
            style={{
              [fromLeft ? "right" : "left"]: "6vw",
              top: "2vh",
              fontSize: "62vh",
              WebkitTextStroke: `4px ${current.color}55`,
            }}
          >
            {current.position}
          </span>

          <div
            className="av-intro-portrait absolute inset-y-0"
            style={{
              [fromLeft ? "left" : "right"]: "-5vw",
              width: "44vw",
              "--dx": fromLeft ? "-12vw" : "12vw",
              WebkitMaskImage: `linear-gradient(${fromLeft ? "100deg" : "260deg"}, #000 46%, rgba(0,0,0,.5) 72%, transparent 95%)`,
              maskImage: `linear-gradient(${fromLeft ? "100deg" : "260deg"}, #000 46%, rgba(0,0,0,.5) 72%, transparent 95%)`,
            }}
          >
            <IntroPortrait p={current} className="w-full h-full" />
          </div>

          <div
            className="absolute"
            style={{
              [fromLeft ? "left" : "right"]: "40vw",
              bottom: "26vh",
              textAlign: fromLeft ? "left" : "right",
              transform: `rotate(${fromLeft ? -3 : 3}deg)`,
            }}
          >
            <span className="av-chip av-chip-gold av-stamp">ผู้เล่นคนที่ {current.position}</span>
            <div className="av-title av-title-thai av-intro-name text-[5rem] av-ink whitespace-nowrap">
              {current.name}
            </div>
            {current.character?.name && (
              <div className="av-heading av-intro-name text-2xl" style={{ color: "rgba(232,196,239,.82)", animationDelay: "0.26s" }}>
                {current.character.name}
              </div>
            )}
            <span
              className="av-crack av-intro-rule block mt-3"
              style={{ position: "relative", width: "20vw", height: 2, marginLeft: fromLeft ? 0 : "auto", transformOrigin: fromLeft ? "left center" : "right center" }}
            />
          </div>
        </div>
      )}

      {outro && <span className="av-reveal-bloom" />}

      {isLineup && (
        <div className={`gi-finale absolute inset-0 overflow-hidden${outro ? " gi-finale-out" : ""}`}>
          {/* ลำแสงแผ่จากศูนย์กลาง — พื้นของฉากทั้งหมด */}
          <span className="gi-rays" aria-hidden="true" />

          {/* ตราพิธีวาดตัวเอง: วงนอกหมุนตามเข็ม วงในหมุนสวน เส้นถูกวาดด้วย stroke-dashoffset */}
          <svg className="gi-sigil" viewBox="0 0 400 400" aria-hidden="true">
            <g className="gi-sigil-spin">
              <circle className="gi-draw gi-draw-1" cx="200" cy="200" r="186" />
              <circle className="gi-ring-dash" cx="200" cy="200" r="172" />
            </g>
            <g className="gi-sigil-spin-rev">
              <circle className="gi-draw gi-draw-2" cx="200" cy="200" r="132" />
              <path className="gi-draw gi-draw-3" d="M200 74 309 263 91 263Z" />
              <path className="gi-draw gi-draw-4" d="M200 326 91 137 309 137Z" />
              {[0, 60, 120, 180, 240, 300].map((deg) => (
                <path
                  key={deg}
                  className="gi-rune"
                  d="M200 44 L208 56 200 68 192 56Z"
                  transform={`rotate(${deg} 200 200)`}
                />
              ))}
            </g>
          </svg>

          {/* แถวผู้ท้าชิง: ครึ่งตัวเรียงเป็นส่วนโค้ง ขอบละลายด้วย mask จึงไม่เป็นกล่องสักใบ */}
          <div className="gi-stage">
            {ordered.map((p, i) => {
              const n = ordered.length;
              const off = n === 1 ? 0 : i / (n - 1) - 0.5;
              const depth = 1 - Math.abs(off) * 0.82;
              return (
                <div
                  key={p.id}
                  className="gi-bust"
                  style={{
                    left: `calc(50% + ${off * 74}%)`,
                    zIndex: 10 + Math.round(depth * 40),
                    "--d": depth.toFixed(3),
                    "--tilt": `${off * 7}deg`,
                    "--lift": `${(0.5 - Math.abs(off)) * 7}vh`,
                    // ไล่ทีละคนตามลำดับที่นั่ง ไม่ใช่ตามระยะห่างจากกลาง — แบบเดิมคนริมสองข้างได้ delay
                    // ใกล้เคียงกันมาก ทุกคนเลยโผล่พร้อมกันเป็นกลุ่ม = เบราว์เซอร์ต้องวาดรูปใหญ่ทุกใบในเฟรมเดียว
                    animationDelay: `${(0.35 + i * 0.13).toFixed(2)}s`,
                  }}
                >
                  <span className="gi-beam" style={{ background: `linear-gradient(180deg, transparent, ${p.color}66 46%, transparent)` }} />
                  <span className="gi-bust-img">
                    <IntroPortrait bare p={p} className="w-full h-full" />
                  </span>
                  {/* เลขประจำตัวต้องอยู่ "หลัง" รูปใน DOM ไม่งั้นรูปวาดทับจนมองไม่เห็น */}
                  <span className="gi-ghost-no">{p.position}</span>
                  <span className="gi-bust-name" style={{ "--pc": p.color }}>{p.name}</span>
                </div>
              );
            })}
          </div>

          {/* คมดาบฟาดผ่านจอ แล้วคลื่นกระแทกแผ่ออกพร้อมชื่อฉาก */}
          <span className="gi-slash" aria-hidden="true" />
          <span className="gi-shock" aria-hidden="true" />

          <div className="gi-title-wrap">
            <svg className="gi-wing gi-wing-l" viewBox="0 0 120 26" aria-hidden="true">
              <path d="M118 13 H46" />
              <path d="M46 13 32 5" />
              <path d="M46 13 32 21" />
              <path d="M28 13 6 13" />
              <path d="M20 13 14 7 8 13 14 19Z" className="gi-wing-gem" />
            </svg>
            <div className="gi-title">เริ่มการประลอง</div>
            <svg className="gi-wing gi-wing-r" viewBox="0 0 120 26" aria-hidden="true">
              <path d="M2 13 H74" />
              <path d="M74 13 88 5" />
              <path d="M74 13 88 21" />
              <path d="M92 13 114 13" />
              <path d="M100 13 106 7 112 13 106 19Z" className="gi-wing-gem" />
            </svg>
          </div>
          <div className="gi-sub">ผู้ท้าชิง {ordered.length} คน ณ สนามประลองอาวาลอน</div>

          {/* ประกายทองลอยขึ้น */}
          {EMBERS.map((e, i) => (
            <span
              key={i}
              className="gi-ember"
              style={{ left: `${e.x}%`, width: e.s, height: e.s, animationDelay: `${e.d}s`, animationDuration: `${e.t}s` }}
            />
          ))}
        </div>
      )}
    </AvScene>
  );
}
