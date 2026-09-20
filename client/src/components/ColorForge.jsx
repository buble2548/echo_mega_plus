import { useCallback, useRef } from "react";
import { clickSound } from "../audio";

const V_MIN = 0.42;

export function hsvToHex(h, s, v) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const to = (n) => Math.round((n + m) * 255).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`.toUpperCase();
}

export function hexToHsv(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return { h: 292, s: 0.62, v: 0.7 };
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max ? d / max : 0, v: Math.max(V_MIN, max) };
}

const SWATCHES = (() => {
  const out = [];
  for (let row = 0; row < 3; row++) {
    const s = [1, 0.72, 0.45][row];
    const v = [0.95, 0.82, 1][row];
    for (let i = 0; i < 12; i++) out.push(hsvToHex((i * 30 + row * 10) % 360, s, v));
  }
  out.push("#FFFFFF", "#D8D3E4", "#9A93AD", "#E8BF5A");
  return out;
})();

export default function ColorForge({ hsv, onChange }) {
  const padRef = useRef(null);
  const dragging = useRef(false);

  const applyPad = useCallback(
    (e) => {
      const el = padRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
      onChange({ h: hsv.h, s: x, v: V_MIN + (1 - y) * (1 - V_MIN) });
    },
    [hsv.h, onChange]
  );

  const padY = 1 - (hsv.v - V_MIN) / (1 - V_MIN);
  const hueHex = hsvToHex(hsv.h, 1, 1);
  const hex = hsvToHex(hsv.h, hsv.s, hsv.v);

  return (
    <div className="flex flex-col gap-4 w-full">
      <div
        ref={padRef}
        className="av-pad"
        style={{
          background: `linear-gradient(to top, rgba(0,0,0,.72), rgba(0,0,0,0)), linear-gradient(to right, #fff, ${hueHex})`,
        }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          dragging.current = true;
          applyPad(e);
        }}
        onPointerMove={(e) => { if (dragging.current) applyPad(e); }}
        onPointerUp={() => { dragging.current = false; }}
        onPointerCancel={() => { dragging.current = false; }}
      >
        <span
          className="av-pad-dot"
          style={{ left: `${hsv.s * 100}%`, top: `${padY * 100}%`, background: hex }}
        />
      </div>

      <input
        type="range"
        min="0"
        max="359"
        step="1"
        value={Math.round(hsv.h)}
        onChange={(e) => onChange({ ...hsv, h: Number(e.target.value) })}
        className="av-hue"
        aria-label="เลือกเฉดสี"
      />

      <div className="flex flex-wrap gap-2 justify-center">
        {SWATCHES.map((c) => (
          <button
            key={c}
            className="av-swatch"
            data-on={c === hex ? "true" : "false"}
            style={{ background: c, color: c }}
            onClick={() => { clickSound(); onChange(hexToHsv(c)); }}
            aria-label={c}
          />
        ))}
      </div>
    </div>
  );
}
