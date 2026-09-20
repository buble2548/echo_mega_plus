import { useEffect, useMemo, useState } from "react";
import { AvScene } from "./avalon";

function IntroPortrait({ p, className, style }) {
  const [broken, setBroken] = useState(false);
  const introImg = p.character?.img || p.img;
  return (
    <div className={`relative overflow-hidden ${className}`} style={{ background: `linear-gradient(150deg, ${p.color}, var(--av-void))`, ...style }}>
      {introImg && !broken ? (
        <img src={introImg} alt="" className="absolute inset-0 w-full h-full object-cover" onError={() => setBroken(true)} />
      ) : (
        <span className="absolute inset-0 grid place-items-center text-7xl" style={{ fontFamily: "var(--font-av-display)", fontWeight: 900, color: "rgba(255,255,255,.72)" }}>
          {(p.name || "?").slice(0, 1).toUpperCase()}
        </span>
      )}
    </div>
  );
}

export default function GameIntro({ players, onDone }) {
  const ordered = useMemo(() => [...players].sort((a, b) => a.position - b.position), [players]);
  const [index, setIndex] = useState(-1);
  const [outro, setOutro] = useState(false);

  const perMs = Math.max(620, Math.min(1000, Math.round(4200 / Math.max(1, ordered.length))));
  const finaleMs = 1800;

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
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-12 px-10">
          <span className="av-intro-halo" />
          <div className="av-title av-title-thai av-unfurl text-6xl" style={{ animationDuration: "0.9s" }}>
            เริ่มการประลอง
          </div>
          <div className="flex flex-wrap justify-center gap-8 max-w-6xl">
            {ordered.map((p, i) => (
              <div
                key={p.id}
                className={`flex flex-col items-center gap-3 ${outro ? "av-lineup-out" : "av-lineup-item"}`}
                style={{
                  animationDelay: outro ? `${i * 0.03}s` : `${i * 0.08}s`,
                  "--ox": `${(i - (ordered.length - 1) / 2) * 26}vw`,
                  "--oy": `${-18 - (i % 2) * 14}vh`,
                }}
              >
                <div className="relative" style={{ transform: `rotate(${(i % 2 ? 1 : -1) * 2.5}deg)` }}>
                  <span
                    className="av-portrait-plate"
                    style={{ background: `linear-gradient(135deg, var(--av-gold-mid), ${p.color} 50%, var(--av-royal))` }}
                  />
                  <IntroPortrait p={p} className="w-28 h-36 rounded-lg" />
                </div>
                <span className="av-chip av-chip-gold">P{p.position}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </AvScene>
  );
}
