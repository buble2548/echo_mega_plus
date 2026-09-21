import { useEffect, useState } from "react";
import { getMasterVolume, setMasterVolume, onVolumeChange, clickSound } from "../audio";
import { AvButton } from "./avalon";

export default function VolumeControl() {
  const [open, setOpen] = useState(false);
  const [vol, setVol] = useState(getMasterVolume());

  // ค่าหลอดอาจถูกเปลี่ยนจากที่อื่น (หรือคืนค่าจาก localStorage) — ต้องตามให้ทัน
  useEffect(() => onVolumeChange(setVol), []);

  const change = (v) => { setVol(v); setMasterVolume(v); };
  const icon = vol === 0 ? "🔇" : vol < 0.5 ? "🔉" : "🔊";

  return (
    <div className="fixed top-4 right-4 z-[70] flex flex-col items-end gap-3">
      <button onClick={() => { clickSound(); setOpen((o) => !o); }} className="av-vol-btn" title="ปรับเสียง">
        {icon}
      </button>

      {open && (
        <div className="av-veil av-veil-gilded av-rise w-60 p-4" style={{ animationDuration: "0.28s" }}>
          <div className="flex items-center justify-between mb-3">
            <span className="av-label">ระดับเสียง</span>
            <span className="av-heading text-sm" style={{ color: "var(--av-gold-lit)" }}>{Math.round(vol * 100)}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={vol}
            onChange={(e) => change(parseFloat(e.target.value))}
            className="av-slider"
            style={{ "--fill": `${vol * 100}%` }}
          />
          <div className="flex gap-2 mt-4">
            <AvButton variant="ghost" className="flex-1 py-1.5 px-2 text-xs" onClick={() => change(0)}>ปิดเสียง</AvButton>
            <AvButton variant="ghost" className="flex-1 py-1.5 px-2 text-xs" onClick={() => change(0.8)}>ปกติ</AvButton>
          </div>
        </div>
      )}
    </div>
  );
}
