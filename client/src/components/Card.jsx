// การ์ดเลข 1-10 มีสี (แดง/ฟ้า/เขียว/เหลือง) + การ์ดพิเศษ (ราชา/ราชินี/โจ๊กเกอร์) — back = คว่ำ
const COLOR_STYLES = {
  red:    "from-red-500 to-red-700 text-white border-red-300",
  blue:   "from-sky-400 to-blue-700 text-white border-sky-200",
  green:  "from-emerald-400 to-green-700 text-white border-emerald-200",
  yellow: "from-yellow-300 to-amber-500 text-gray-900 border-yellow-100",
};
const SPECIAL_LABEL = { king: "K", queen: "Q", joker: "🃏" };

export default function Card({ value, color, special, back, size = "md" }) {
  const dim = size === "sm" ? "w-9 h-12" : size === "lg" ? "w-20 h-28" : "w-12 h-16";
  const valueText = size === "lg" ? "text-4xl" : "text-2xl";
  const cornerText = size === "lg" ? "text-xs" : "text-[10px]";
  if (back) {
    return (
      <div className={`card-deal inline-grid place-items-center ${dim} m-1 rounded-lg text-2xl text-echo-purplelight bg-gradient-to-br from-echo-purple to-echo-navy shadow-lg border border-white/20`}>
        ✦
      </div>
    );
  }
  if (special) {
    const label = SPECIAL_LABEL[special] || "?";
    return (
      <div className={`card-deal relative inline-grid place-items-center ${dim} m-1 rounded-lg bg-gradient-to-br from-gray-800 to-black text-echo-purplelight shadow-lg border-2 border-echo-gold`}>
        <span className={`${valueText} font-black`}>{label}</span>
        <span className={`absolute top-0.5 left-1 ${cornerText} font-bold text-echo-gold`}>{label}</span>
        <span className={`absolute bottom-0.5 right-1 ${cornerText} font-bold text-echo-gold rotate-180`}>{label}</span>
      </div>
    );
  }
  const cls = COLOR_STYLES[color] || "from-white to-gray-200 text-gray-900 border-echo-purple/50";
  return (
    <div className={`card-deal relative inline-grid place-items-center ${dim} m-1 rounded-lg bg-gradient-to-br ${cls} shadow-lg border-2`}>
      <span className={`${valueText} font-black`}>{value}</span>
      <span className={`absolute top-0.5 left-1 ${cornerText} font-bold opacity-80`}>{value}</span>
      <span className={`absolute bottom-0.5 right-1 ${cornerText} font-bold opacity-80 rotate-180`}>{value}</span>
    </div>
  );
}
