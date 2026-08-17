import { useEffect, useState } from "react";
import { socket } from "../socket";
import { clickSound } from "../audio";
import { POSITIONS, POSITION_COLORS } from "../data/positions";

const P_DISPLAY = "var(--font-p-display)";

// หน้าที่ 2: ตั้งชื่อ + เลือกตำแหน่ง P1-P6
// เลย์เอาต์ใหม่: แบ่งจอเป็น 2 ฝั่ง — ซ้าย = โลโก้/แฟลเวอร์เท็กซ์ (คงที่),
// ขวา = ช่องกรอกชื่อ + การ์ดที่นั่งเอียง 3 มิติแบบเมนูตัวละคร Persona
//  taken = ตำแหน่งที่คนอื่นจอง/เข้าเล่นแล้ว (server ส่งมาแบบไม่รวมของเราเอง)
export default function Setup({ taken, initialName = "", initialPos = null, onNext }) {
  const [name, setName] = useState(initialName);
  const [pos, setPos] = useState(initialPos);

  useEffect(() => {
    if (pos && taken.includes(pos)) {
      setPos(null);
      alert("ตำแหน่งนี้เพิ่งถูกคนอื่นเลือกไป ลองเลือกใหม่นะ");
    }
  }, [taken, pos]);

  const pick = (n) => {
    clickSound();
    setPos(n);
    socket.emit("reserve", { position: n });
  };

  const submit = () => {
    clickSound();
    if (!name.trim()) return alert("กรุณาตั้งชื่อก่อนนะ");
    if (!pos) return alert("เลือกตำแหน่งผู้เล่นก่อนนะ");
    onNext(name.trim(), pos);
  };

  const ready = name.trim() && pos;

  return (
    <div className="p-bg relative min-h-screen overflow-hidden flex flex-col lg:flex-row">
      {/* อนุภาคลอยประดับฉาก */}
      {[10, 24, 38, 52, 66, 80, 92].map((l, i) => (
        <span
          key={l}
          className="p-particle"
          style={{ left: `${l}%`, animationDuration: `${9 + (i % 4) * 3}s`, animationDelay: `${i * 1.4}s` }}
        />
      ))}

      {/* ---------- ฝั่งซ้าย: แผงโลโก้ "พังทะลุ" เข้ามาในฝั่งขวา แบบกระจกแตกเรืองแสง ---------- */}
      <div className="relative z-10 shrink-0 w-full lg:w-[34%] h-40 lg:h-auto">
        <div
          className="p-intrusion absolute inset-0"
          style={{
            background: "linear-gradient(155deg,var(--color-p-accent-deep),var(--color-p-black) 65%)",
          }}
        />
        <div className="relative h-full flex flex-col justify-center px-6 lg:px-10 py-6">
          <span className="p-logo-wrap self-start">
            <span className="p-logo-glow" />
            <img
              src="/image/logo_current.png"
              alt="ECHO"
              className="p-logo-img h-20 sm:h-24 lg:h-32 w-auto"
            />
          </span>
          <div
            className="mt-3 h-1 w-16"
            style={{ background: "linear-gradient(90deg,var(--color-p-accent-bright),transparent)" }}
          />
          <p
            className="hidden lg:block mt-5 text-white/70 text-sm leading-relaxed max-w-xs"
            style={{ fontFamily: P_DISPLAY }}
          >
            By Phujim@ru
            <br />
            เวอร์ชัน 3.0
          </p>
        </div>
      </div>

      {/* ---------- เศษกระจกเรืองแสงที่ "กระเด็น" ข้ามแนวเขตเข้ามาฝั่งขวา (จอกว้างเท่านั้น)
          ขนาด/ตำแหน่งไม่สมมาตรตามระดับความลึกของรอยแหว่งแต่ละช่วง ---------- */}
      <span
        className="p-shard hidden lg:block"
        style={{ left: "19vw", top: "10%", width: 12, height: 12, clipPath: "polygon(50% 0,100% 50%,50% 100%,0 50%)", transform: "rotate(-18deg)", animationDelay: "0s" }}
      />
      <span
        className="p-shard hidden lg:block"
        style={{ left: "31vw", top: "16%", width: 9, height: 9, clipPath: "polygon(50% 0,100% 100%,0 100%)", transform: "rotate(30deg)", animationDelay: "0.3s" }}
      />
      <span
        className="p-shard hidden lg:block"
        style={{ left: "14vw", top: "40%", width: 34, height: 34, clipPath: "polygon(50% 0,100% 100%,0 100%)", transform: "rotate(22deg)", animationDelay: "0.6s" }}
      />
      <span
        className="p-shard hidden lg:block"
        style={{ left: "22vw", top: "45%", width: 16, height: 16, clipPath: "polygon(50% 0,100% 50%,50% 100%,0 50%)", transform: "rotate(-8deg)", animationDelay: "1.1s" }}
      />
      <span
        className="p-shard hidden lg:block"
        style={{ left: "33vw", top: "58%", width: 8, height: 8, clipPath: "polygon(50% 0,100% 100%,0 100%)", transform: "rotate(-35deg)", animationDelay: "1.5s" }}
      />
      <span
        className="p-shard hidden lg:block"
        style={{ left: "17vw", top: "74%", width: 28, height: 28, clipPath: "polygon(50% 0,100% 50%,50% 100%,0 50%)", transform: "rotate(14deg)", animationDelay: "0.2s" }}
      />
      <span
        className="p-shard hidden lg:block"
        style={{ left: "28vw", top: "80%", width: 13, height: 13, clipPath: "polygon(50% 0,100% 100%,0 100%)", transform: "rotate(-22deg)", animationDelay: "1.8s" }}
      />
      <span
        className="p-shard hidden lg:block"
        style={{ left: "12vw", top: "93%", width: 20, height: 20, clipPath: "polygon(50% 0,100% 100%,0 100%)", transform: "rotate(6deg)", animationDelay: "0.9s" }}
      />

      {/* ---------- ฝั่งขวา: ชื่อ + การ์ดที่นั่ง ---------- */}
      <div className="p-scroll relative z-10 flex-1 flex flex-col gap-8 px-5 sm:px-10 py-8 lg:py-14 overflow-y-auto">
        <div className="p-rise">
          <div className="p-chip text-sm text-white/70 mb-2">
            <span>กรุณาตั้งชื่อก่อนนะจ๊ะ</span>
          </div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={12}
            placeholder="กรอกชื่อของคุณ"
            className="bg-transparent border-b-2 border-white/25 focus:border-[var(--color-p-accent-bright)] text-3xl sm:text-4xl text-white placeholder-white/25 outline-none py-2 w-full max-w-md font-bold transition-colors"
            style={{ fontFamily: P_DISPLAY }}
          />
        </div>

        <div className="p-rise" style={{ animationDelay: "0.08s" }}>
          <div className="p-chip text-sm text-white/70 mb-4">
            <span>เลือกตำแหน่งที่ต้องการ</span>
          </div>
          <div className="flex flex-wrap gap-4 sm:gap-5">
            {POSITIONS.map((n, i) => {
              const selected = pos === n;
              const lockedByOther = taken.includes(n) && !selected;
              return (
                <button
                  key={n}
                  disabled={lockedByOther}
                  onClick={() => pick(n)}
                  className={`p-rise p-scan-hover group relative w-24 sm:w-28 rounded-lg pt-4 pb-3 px-2 border-2 text-center transition-all duration-200 ${
                    lockedByOther
                      ? "opacity-30 grayscale cursor-not-allowed border-white/10 bg-white/5"
                      : "border-white/15 bg-white/5 hover:-translate-y-2 hover:border-white/40"
                  } ${selected ? "-translate-y-2 border-white/70" : ""}`}
                  style={{
                    animationDelay: `${0.12 + i * 0.05}s`,
                    boxShadow: selected ? `0 14px 30px -8px ${POSITION_COLORS[n]}aa` : undefined,
                    transform: selected ? "translateY(-8px) rotateX(6deg)" : undefined,
                    transformStyle: "preserve-3d",
                  }}
                >
                  <div
                    className="mx-auto w-3 h-3 rounded-full mb-2"
                    style={{ background: POSITION_COLORS[n], boxShadow: `0 0 10px 2px ${POSITION_COLORS[n]}99` }}
                  />
                  <div
                    className="text-2xl sm:text-3xl font-black text-white"
                    style={{ fontFamily: P_DISPLAY }}
                  >
                    P{n}
                  </div>
                  <div
                    className={`mt-1 text-[11px] font-bold uppercase tracking-wide ${
                      selected ? "" : lockedByOther ? "text-white/35" : "text-white/55"
                    }`}
                    style={selected ? { color: "var(--color-p-accent-bright)" } : undefined}
                  >
                    {selected ? "เลือกแล้ว" : lockedByOther ? "ถูกจอง" : "ว่าง"}
                  </div>
                  {selected && (
                    <div
                      className="absolute -top-1 -right-1 w-5 h-5 grid place-items-center rounded-full text-[10px] font-black text-black"
                      style={{ background: "var(--color-p-accent-bright)" }}
                    >
                      ✓
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ---------- ปุ่มยืนยัน มุมขวาล่าง ---------- */}
      <button
        onClick={submit}
        disabled={!ready}
        className={`fixed bottom-0 right-0 w-56 h-24 sm:h-28 group z-20 transition-all duration-300 ${
          ready ? "translate-x-0 opacity-100" : "translate-x-full opacity-0 pointer-events-none"
        }`}
      >
        <div className="p-slash-btn absolute inset-0 transition group-hover:brightness-110" />
        <span
          className="absolute bottom-5 sm:bottom-6 right-6 sm:right-7 text-xl sm:text-2xl font-black text-white uppercase italic"
          style={{ fontFamily: P_DISPLAY }}
        >
          ยืนยัน →
        </span>
      </button>
    </div>
  );
}
