import { useEffect, useRef, useState } from "react";
import { socket } from "../socket";
import { POSITIONS, POSITION_COLORS } from "../data/positions";
import { AvScene, Medallion, SealButton, AvButton, Crest, Crystals, AvRule } from "../components/avalon";
import ColorForge, { hexToHsv, hsvToHex } from "../components/ColorForge";
import { PATCH_NAME, PATCH_VERSION, AUTHOR } from "../data/patch";

const LEVEL = 2;
const N = POSITIONS.length;

function arcPlace(i) {
  const t = N > 1 ? i / (N - 1) : 0.5;
  return {
    left: `${8 + t * 76}%`,
    bottom: `${Math.sin(t * Math.PI) * 13}vh`,
    rotate: (t - 0.5) * 18,
  };
}

export default function Setup({ taken, initialName = "", initialPos = null, initialColor = null, onNext }) {
  const [name, setName] = useState(initialName);
  const [pos, setPos] = useState(initialPos);
  const [hsv, setHsv] = useState(() => hexToHsv(initialColor || POSITION_COLORS[initialPos] || "#9B4F96"));
  const [step, setStep] = useState(initialPos ? "name" : "seat");
  const [leaving, setLeaving] = useState(false);
  const stepTimer = useRef(null);
  const inputRef = useRef(null);

  const hex = hsvToHex(hsv.h, hsv.s, hsv.v);

  useEffect(() => {
    if (pos && taken.includes(pos)) {
      setPos(null);
      setStep("seat");
      setLeaving(false);
      alert("ที่นั่งนี้เพิ่งถูกคนอื่นเลือกไป ลองเลือกใหม่นะ");
    }
  }, [taken, pos]);

  useEffect(() => {
    if (step !== "name") return undefined;
    const t = setTimeout(() => inputRef.current?.focus(), 420);
    return () => clearTimeout(t);
  }, [step]);

  useEffect(() => () => clearTimeout(stepTimer.current), []);

  const advance = (next, delay) => {
    setLeaving(true);
    clearTimeout(stepTimer.current);
    stepTimer.current = setTimeout(() => {
      setStep(next);
      setLeaving(false);
    }, delay);
  };

  const pick = (n) => {
    if (leaving) return;
    setPos(n);
    setHsv(hexToHsv(POSITION_COLORS[n] || "#9B4F96"));
    socket.emit("reserve", { position: n });
    advance("color", 600);
  };

  const submit = () => {
    if (!name.trim()) return alert("กรุณาใส่ชื่อก่อนนะ");
    if (!pos) return alert("เลือกที่นั่งก่อนนะ");
    onNext(name.trim(), pos, hex);
  };

  const ready = !!(name.trim() && pos);

  return (
    <AvScene level={LEVEL} seed={23} className="h-screen w-screen overflow-hidden">
      <span
        className="av-numeral absolute select-none z-0"
        style={{
          right: "5vw",
          top: "8vh",
          fontSize: "42vh",
          opacity: step === "seat" ? 0.22 : 1,
          WebkitTextStroke: step === "seat" ? undefined : `3px ${hex}66`,
          transition: "opacity .6s ease",
        }}
      >
        {pos ? `0${pos}` : "00"}
      </span>

      <div className="av-content absolute top-8 left-10 flex items-center gap-5 z-30">
        <span className="av-logo-seal">
          <img src="/image/logo_current.webp" alt="ECHO" className="h-7 w-auto" />
        </span>
        <div>
          <div className="av-label av-label-en" style={{ fontSize: "0.58rem" }}>{PATCH_NAME}</div>
          <div className="av-heading text-xs" style={{ color: "rgba(232,196,239,.45)" }}>
            เวอร์ชัน {PATCH_VERSION} · {AUTHOR}
          </div>
        </div>
      </div>

      {step === "seat" && (
        <>
          <div className="av-content absolute inset-x-0 flex flex-col items-center gap-3 z-10" style={{ top: "22vh" }}>
            <h1 className="av-rise av-title av-title-thai text-5xl av-ink">เลือกที่นั่งของคุณ</h1>
            <AvRule className="av-rise w-[26rem]" />
          </div>

          <div className="av-content absolute inset-x-0 z-10" style={{ top: "34vh", height: "30vh" }}>
            {POSITIONS.map((n, i) => {
              const place = arcPlace(i);
              const selected = pos === n;
              const lockedByOther = taken.includes(n) && !selected;
              const inner = leaving ? (selected ? "av-seat-chosen" : "av-seat-scatter") : "av-rise av-seq";
              return (
                <div
                  key={n}
                  className="av-arc-item"
                  style={{
                    left: place.left,
                    bottom: place.bottom,
                    "--i": i + 1,
                    transform: `translateX(-50%) rotate(${place.rotate}deg)`,
                  }}
                >
                  <div className={`relative flex flex-col items-center gap-3 ${inner}`}>
                    <Medallion on={selected} disabled={lockedByOther} size={104} onClick={() => pick(n)}>
                      {selected && <Crystals level={5} seed={n} />}
                      <span
                        className="relative block w-3.5 h-3.5 mb-9 rounded-full"
                        style={{
                          background: "#fff",
                          boxShadow: selected
                            ? "0 0 20px 7px rgba(255,233,168,.9)"
                            : "0 0 16px 5px rgba(255,255,255,.7)",
                        }}
                      />
                      <span
                        className="absolute inset-x-0 text-3xl"
                        style={{
                          top: "50%",
                          fontFamily: "var(--font-av-display)",
                          fontWeight: 900,
                          color: selected ? "var(--av-gold-lit)" : "#fff",
                        }}
                      >
                        P{n}
                      </span>
                    </Medallion>
                    <span
                      className="av-heading text-xs"
                      style={{
                        color: selected
                          ? "var(--av-gold-lit)"
                          : lockedByOther
                          ? "rgba(239,230,245,.28)"
                          : "rgba(232,196,239,.6)",
                        letterSpacing: "0.08em",
                      }}
                    >
                      {selected ? "เลือกแล้ว" : lockedByOther ? "ถูกจอง" : "ว่าง"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {step === "color" && (
        <>
          <div className={`av-content absolute inset-0 flex flex-col items-center justify-center gap-7 z-10 px-10 ${leaving ? "av-step-out" : ""}`}>
            <h1 className="av-rise av-title av-title-thai text-5xl av-ink">เลือกสีประจำตัว</h1>

            <div className="av-plaque av-plaque-in flex items-center gap-10" style={{ width: "min(50rem, 80vw)" }}>
              <div className="flex flex-col items-center gap-3 shrink-0">
                <div className="av-seal-drop relative">
                  <Crest color={hex} className="text-2xl" style={{ width: "7rem", height: "7rem", transition: "background .18s linear" }}>
                    P{pos}
                  </Crest>
                  <Crystals level={4} seed={pos || 1} />
                </div>
                <span
                  className="av-heading text-sm px-4 py-1 rounded-full"
                  style={{ background: "rgba(6,4,12,.6)", border: `1px solid ${hex}`, color: hex }}
                >
                  {name.trim() || "ชื่อของคุณ"}
                </span>
                <span className="av-label" style={{ fontSize: "0.68rem", letterSpacing: "0.22em" }}>{hex}</span>
              </div>

              <div className="flex-1 min-w-0">
                <ColorForge hsv={hsv} onChange={setHsv} />
              </div>
            </div>

            <AvButton variant="ghost" className="py-2 px-6 text-sm" onClick={() => setStep("seat")}>
              ← เลือกที่นั่งใหม่
            </AvButton>
          </div>

          <div className="av-content fixed bottom-10 right-12 z-30">
            <SealButton ready label="ถัดไป" onClick={() => advance("name", 420)} />
          </div>
        </>
      )}

      {step === "name" && (
        <>
          <div className="av-content absolute inset-0 flex flex-col items-center justify-center gap-8 z-10 px-10">
            <h1 className="av-rise av-title av-title-thai text-5xl av-ink">ลงนามของคุณ</h1>

            <div className="av-plaque av-plaque-in flex items-center gap-8" style={{ width: "min(48rem, 78vw)" }}>
              <div className="av-seal-drop relative shrink-0">
                <Crest color={hex} className="text-2xl" style={{ width: "6rem", height: "6rem" }}>
                  P{pos}
                </Crest>
                <Crystals level={4} seed={pos || 1} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="av-label mb-1">กรุณาใส่ชื่อ</div>
                <div className="av-input-wrap">
                  <input
                    ref={inputRef}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && ready) submit(); }}
                    maxLength={12}
                    placeholder="ชื่อของคุณ"
                    className="av-input"
                    style={{ color: hex }}
                  />
                  <div className="av-input-line" />
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className="av-heading text-xs" style={{ color: "rgba(239,230,245,.4)" }}>
                    ยาวได้ไม่เกิน 12 ตัวอักษร
                  </span>
                  <span
                    className="av-heading text-xs"
                    style={{ color: name.length >= 12 ? "var(--av-gold-lit)" : "rgba(239,230,245,.4)" }}
                  >
                    {name.length} / 12
                  </span>
                </div>
              </div>
            </div>

            <AvButton variant="ghost" className="py-2 px-6 text-sm" onClick={() => setStep("color")}>
              ← เปลี่ยนสีประจำตัว
            </AvButton>
          </div>

          <div className="av-content fixed bottom-10 right-12 z-30">
            <SealButton ready={ready} label="ลงนาม" onClick={submit} />
          </div>
        </>
      )}
    </AvScene>
  );
}
