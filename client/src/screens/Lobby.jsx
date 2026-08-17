import { useState } from "react";
import { socket } from "../socket";
import { clickSound } from "../audio";
import { POSITIONS } from "../data/positions";

const P_DISPLAY = "var(--font-p-display)";

// ตำแหน่งที่นั่งรอบโต๊ะ (วงรี 6 ที่นั่ง) — คีย์ตรงกับ POSITIONS 1-6
const SEAT_LAYOUT = {
  1: { left: "50%", top: "4%" },
  2: { left: "90%", top: "26%" },
  3: { left: "90%", top: "78%" },
  4: { left: "50%", top: "96%" },
  5: { left: "10%", top: "78%" },
  6: { left: "10%", top: "26%" },
};

// หน้าที่ 5: ห้องรอ — โต๊ะกลม ขนาดใหญ่ อยู่ในจอเดียว ไม่มีสกอลล์
// ปุ่มควบคุมทั้งหมดย้ายออกจากใต้โต๊ะ: โหมดประหยัด (ซ้ายบน) / ย้อนกลับ (ซ้ายล่างลอย) / พร้อม+ทดสอบ (กลางวงในโต๊ะ)
export default function Lobby({ state, onBack, lowQ, onToggleLowQ }) {
  const [showInfo, setShowInfo] = useState(false);
  const count = state.players.length;
  const me = state.players.find((p) => p.id === state.youId);
  const allReady = count >= 2 && state.players.every((p) => p.ready);
  const byPos = Object.fromEntries(state.players.map((p) => [p.position, p]));

  return (
    <div className="p-bg relative h-screen w-screen overflow-hidden flex items-center justify-center p-4">
      {[15, 35, 55, 75, 90].map((l, i) => (
        <span
          key={l}
          className="p-particle"
          style={{ left: `${l}%`, animationDuration: `${10 + (i % 3) * 3}s`, animationDelay: `${i * 1.6}s` }}
        />
      ))}

      {/* ---------- โหมดประหยัด: มุมซ้ายบน แบบย่อ + ไอคอน i อธิบายตอนชี้เมาส์ ---------- */}
      <div className="fixed z-30 top-4 left-4 flex items-center gap-2">
        <button
          onClick={() => { clickSound(); onToggleLowQ && onToggleLowQ(); }}
          className="p-float-back flex items-center gap-2 pl-3 pr-3.5 py-2 rounded-full text-xs sm:text-sm font-bold transition"
          style={lowQ ? { borderColor: "var(--color-p-accent-bright)", background: "rgba(155,79,150,.28)" } : undefined}
        >
          🎬 <span>{lowQ ? "ประหยัด: เปิด" : "ประหยัด: ปิด"}</span>
        </button>
        <div className="group relative">
          <button
            onClick={() => setShowInfo((v) => !v)}
            className="w-6 h-6 grid place-items-center rounded-full border border-white/30 bg-black/40 text-[11px] font-black cursor-help hover:border-white/60"
            aria-label="อธิบายโหมดประหยัด"
          >
            i
          </button>
          <div
            className={`absolute left-0 top-full mt-2 w-60 bg-black/95 border border-white/15 rounded-lg p-3 text-xs leading-snug shadow-2xl transition-opacity z-30 ${
              showInfo ? "opacity-100" : "opacity-0 pointer-events-none"
            } sm:group-hover:opacity-100 sm:group-hover:pointer-events-auto`}
          >
            ข้ามวีดีโอท่าไม้ตาย/ฉากคัตซีน — จะเห็นแค่การแจ้งเตือนว่าใครเปิดท่าไม้ตายแทน
            (แต่ยังต้องรอผู้เล่นคนอื่นดูวีดีโอให้จบอยู่ดี)
          </div>
        </div>
      </div>

      {/* ---------- โต๊ะกลม: ขยายใหญ่ ยึดตามพื้นที่จอที่เหลือ ไม่ทำให้เกิดสกอลล์ ---------- */}
      <div
        className="relative z-10 aspect-square shrink-0"
        style={{ width: "min(88vw, 82vh, 860px)" }}
      >
        {/* วงแหวนโต๊ะ */}
        <div
          className="absolute inset-[13%] rounded-full border-2 transition-colors"
          style={{
            borderColor: allReady ? "var(--color-p-accent-bright)" : "rgba(255,255,255,.12)",
            background: "radial-gradient(circle, rgba(155,79,150,0.14), transparent 70%)",
            boxShadow: allReady ? "0 0 60px 6px rgba(155,79,150,.35)" : undefined,
          }}
        />

        {/* ศูนย์กลาง: โลโก้ + จำนวนผู้เล่น + ปุ่มพร้อม/ทดสอบ */}
        <div className="absolute inset-0 grid place-items-center">
          <div className="text-center pointer-events-none">
            <span className="p-logo-wrap mx-auto">
              <span className="p-logo-glow" />
              <img src="/image/logo_current.png" alt="ECHO" className="p-logo-img h-12 sm:h-14 lg:h-16 w-auto" />
            </span>
            <p className="mt-1 text-sm sm:text-base text-white/70" style={{ fontFamily: P_DISPLAY }}>
              {count}/{state.maxPlayers} ที่นั่ง
            </p>

            {count >= 2 && (
              <button
                onClick={() => { clickSound(); socket.emit("toggleReady"); }}
                className={`pointer-events-auto mt-4 px-7 py-2.5 rounded-full font-black text-sm sm:text-base transition-all active:scale-95 ${
                  me?.ready
                    ? "bg-white/10 text-white/85 border border-white/25 hover:bg-white/20"
                    : "text-white animate-pulse hover:brightness-110"
                }`}
                style={
                  !me?.ready
                    ? { background: "linear-gradient(120deg,var(--color-p-accent),var(--color-p-accent-deep))", boxShadow: "0 10px 26px -6px rgba(155,79,150,.75)" }
                    : undefined
                }
              >
                {me?.ready ? "❌ ยกเลิกพร้อม" : "✅ พร้อมแล้ว"}
              </button>
            )}

            {count === 1 && (
              <button
                onClick={() => socket.emit("startGame")}
                className="pointer-events-auto mt-4 block mx-auto text-xs sm:text-sm text-white/50 hover:text-white/85 underline underline-offset-4 transition"
              >
                เล่นคนเดียว (ทดสอบ)
              </button>
            )}

            <p className="mt-3 text-[11px] sm:text-xs text-white/45 max-w-[14rem] mx-auto leading-snug">
              {count < 2
                ? "รอผู้เล่นคนอื่นเข้าห้องก่อนถึงจะกดพร้อมได้..."
                : !allReady
                ? "รอทุกคนกดพร้อม — เกมจะเริ่มเองทันทีที่ครบ"
                : "ทุกคนพร้อมแล้ว กำลังเริ่มเกม…"}
            </p>
          </div>
        </div>

        {/* ที่นั่งรอบวง */}
        {POSITIONS.map((n, i) => {
          const p = byPos[n];
          const pos = SEAT_LAYOUT[n];
          return (
            <div
              key={n}
              className="p-rise absolute -translate-x-1/2 -translate-y-1/2 w-24 sm:w-28 lg:w-32"
              style={{ left: pos.left, top: pos.top, animationDelay: `${i * 0.06}s` }}
            >
              {p ? (
                <div
                  className={`p-panel rounded-lg px-3 py-3 text-center ${p.ready ? "p-ring" : ""}`}
                  style={{ borderColor: p.color, borderWidth: 2 }}
                >
                  <div
                    className="mx-auto flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 lg:w-14 lg:h-14 rounded-full font-black text-base sm:text-lg text-white border-2 border-white/70"
                    style={{ background: p.color, fontFamily: P_DISPLAY }}
                  >
                    P{n}
                  </div>
                  <div className="font-bold mt-2 text-xs sm:text-sm truncate" style={{ fontFamily: P_DISPLAY }}>
                    {p.name}
                    {p.id === state.youId && (
                      <span style={{ color: "var(--color-p-accent-bright)" }}> (คุณ)</span>
                    )}
                  </div>
                  <div
                    className="text-[10px] sm:text-xs font-bold mt-1"
                    style={p.ready ? { color: "var(--color-p-accent-bright)" } : { opacity: 0.55 }}
                  >
                    {p.ready ? "✅ พร้อม" : "⏳ รอ"}
                  </div>
                  {!p.connected && (
                    <div className="text-[10px] font-bold mt-1 text-echo-hp">เชื่อมต่อใหม่…</div>
                  )}
                </div>
              ) : (
                <div className="rounded-lg border-2 border-dashed border-white/12 px-3 py-3 text-center opacity-40">
                  <div className="mx-auto w-11 h-11 sm:w-12 sm:h-12 lg:w-14 lg:h-14 rounded-full border-2 border-white/20 grid place-items-center text-xs font-bold">
                    P{n}
                  </div>
                  <div className="mt-2 text-[10px] sm:text-xs font-bold">ว่าง</div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ---------- ปุ่มย้อนกลับ ลอย โปร่งแสง มุมซ้ายล่าง ---------- */}
      <button
        onClick={() => { clickSound(); onBack && onBack(); }}
        className="p-float-back fixed z-30 bottom-5 left-5 px-5 py-2.5 font-bold transition rounded-full text-white/90"
      >
        ← ย้อนกลับ
      </button>
    </div>
  );
}
