import { useState } from "react";
import { getMasterVolume, setMasterVolume, clickSound } from "../audio";

// ปุ่มปรับเสียงหลัก (โผล่ทุกหน้า มุมขวาบน กดเปิด popup slider)
export default function VolumeControl() {
  const [open, setOpen] = useState(false);
  const [vol, setVol] = useState(getMasterVolume());

  const change = (v) => { setVol(v); setMasterVolume(v); };
  const icon = vol === 0 ? "🔇" : vol < 0.5 ? "🔉" : "🔊";

  return (
    <div className="fixed top-3 right-3 z-[60] flex flex-col items-end gap-2">
      <button
        onClick={() => { clickSound(); setOpen((o) => !o); }}
        className="w-11 h-11 grid place-items-center rounded-full bg-black/50 hover:bg-black/70 backdrop-blur text-xl shadow-lg border border-white/15"
        title="ปรับเสียง"
      >
        {icon}
      </button>

      {open && (
        <div className="bg-echo-navy/95 backdrop-blur rounded-2xl p-3 shadow-2xl border border-white/15 w-56">
          <div className="flex items-center justify-between mb-2">
            <span className="font-bold text-sm">เสียงหลัก</span>
            <span className="text-xs opacity-80">{Math.round(vol * 100)}%</span>
          </div>
          <input
            type="range"
            min="0" max="1" step="0.05"
            value={vol}
            onChange={(e) => change(parseFloat(e.target.value))}
            className="w-full accent-echo-gold"
          />
          <div className="flex justify-between gap-2 mt-2">
            <button onClick={() => change(0)} className="flex-1 text-xs rounded-lg bg-white/10 hover:bg-white/20 py-1">ปิดเสียง</button>
            <button onClick={() => change(0.8)} className="flex-1 text-xs rounded-lg bg-white/10 hover:bg-white/20 py-1">ปกติ</button>
          </div>
        </div>
      )}
    </div>
  );
}
