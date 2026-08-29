import { useEffect, useMemo, useState } from "react";

const P_DISPLAY = "var(--font-p-display)";

// ---------- ภาพผู้เล่น (มี fallback ตัวย่อชื่อ ถ้าไม่มีรูปตัวละคร) ----------
function IntroPortrait({ p, className }) {
  const [broken, setBroken] = useState(false);
  // ใช้ภาพประจำตัวละครเสมอ (ไม่ใช่ร่าง/แฝดที่กำลังคุมอยู่) — คู่แฝดฮิซากาว่าต้องขึ้นภาพคู่ ไม่ใช่คนใดคนหนึ่ง
  const introImg = p.character?.img || p.img;
  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{ background: `linear-gradient(150deg, ${p.color}, var(--color-p-black))` }}
    >
      {introImg && !broken ? (
        <img
          src={introImg}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          onError={() => setBroken(true)}
        />
      ) : (
        <span className="absolute inset-0 grid place-items-center text-5xl font-black text-white/80">
          {(p.name || "?").slice(0, 1).toUpperCase()}
        </span>
      )}
    </div>
  );
}

// ฉากเปิดตัวผู้เล่นตอนแมตช์เริ่ม — เผยผู้เล่นทีละคนสลับซ้าย/ขวาแบบพุ่งเข้าจอ
// แล้วปิดท้ายด้วยไลน์อัพรวมทุกคน ก่อนเรียก onDone() ให้สลับเข้าฉากสนามจริง
export default function GameIntro({ players, onDone }) {
  const ordered = useMemo(() => [...players].sort((a, b) => a.position - b.position), [players]);
  const [index, setIndex] = useState(-1); // -1 = ยังไม่เริ่ม, 0..n-1 = กำลังเผยคนที่ index, n = ไลน์อัพรวม
  const [flash, setFlash] = useState(0);

  const perMs = Math.max(500, Math.min(900, Math.round(3600 / Math.max(1, ordered.length))));
  const finaleMs = 1500;

  useEffect(() => {
    const timers = [];
    ordered.forEach((_, i) => {
      timers.push(setTimeout(() => { setIndex(i); setFlash((f) => f + 1); }, i * perMs));
    });
    timers.push(setTimeout(() => setIndex(ordered.length), ordered.length * perMs));
    timers.push(setTimeout(() => onDone && onDone(), ordered.length * perMs + finaleMs));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordered.length]);

  const current = index >= 0 && index < ordered.length ? ordered[index] : null;
  const isLineup = index === ordered.length;
  const dir = index % 2 === 0 ? "l" : "r";

  return (
    <div className="p-intro-stage">
      <div className="p-intro-burst" />

      {current && (
        <>
          <span className="p-intro-num" style={{ color: `${current.color}22` }}>
            P{current.position}
          </span>
          <div key={current.id} className={`absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 p-intro-card-${dir}`}>
            <div className="relative">
              <div
                className="absolute -inset-2 -z-10"
                style={{
                  background: `linear-gradient(135deg, ${current.color}, var(--color-p-accent-deep))`,
                  clipPath: "polygon(6% 0,100% 4%,94% 100%,0 96%)",
                }}
              />
              <IntroPortrait
                p={current}
                className="w-48 h-64 sm:w-60 sm:h-80 shadow-2xl border-2 border-black/60"
              />
            </div>
            <div className="text-center">
              <div
                className="p-chip inline-block text-sm sm:text-base px-4 py-1 text-white border border-black/40 rounded-full"
                style={{ background: current.color }}
              >
                <span>PLAYER {current.position}</span>
              </div>
              <div className="mt-2 text-3xl sm:text-4xl font-black text-white" style={{ fontFamily: P_DISPLAY }}>
                {current.name}
              </div>
              {current.character?.name && (
                <div className="mt-1 text-base sm:text-lg text-white/70" style={{ fontFamily: P_DISPLAY }}>
                  {current.character.name}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {isLineup && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 px-4">
          <div className="p-intro-title glitch-p text-3xl sm:text-4xl font-black italic" data-text="เริ่มการประลอง">
            เริ่มการประลอง
          </div>
          <div className="flex flex-wrap justify-center gap-4 sm:gap-6 max-w-4xl">
            {ordered.map((p, i) => (
              <div
                key={p.id}
                className="p-intro-lineup-item flex flex-col items-center gap-1.5"
                style={{ animationDelay: `${i * 0.08}s` }}
              >
                <IntroPortrait
                  p={p}
                  className="w-16 h-20 sm:w-20 sm:h-24 rounded-lg border-2"
                />
                <span
                  className="text-xs sm:text-sm font-bold px-2 py-0.5 rounded-full text-white"
                  style={{ background: p.color }}
                >
                  P{p.position}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {flash > 0 && <span key={flash} className="p-intro-flash" />}
    </div>
  );
}
