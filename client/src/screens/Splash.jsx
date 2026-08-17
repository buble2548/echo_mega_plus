import { clickSound } from "../audio";

// หน้าที่ 1: Title / Splash — ภาพปกเวอร์ชันปัจจุบัน (แตะที่รูปภาพเพื่อไปหน้าตั้งชื่อ/เลือกลำดับผู้เล่น)
export default function Splash({ onEnter }) {
  const start = () => {
    clickSound();
    onEnter();
  };

  return (
    <div className="relative min-h-screen overflow-hidden select-none bg-black grid place-items-center">
      <button
        onClick={start}
        className="relative w-full h-screen cursor-pointer group"
        aria-label="แตะเพื่อเริ่ม"
      >
        <img
          src="/image/splash-defualt.png"
          alt="ECHO"
          className="absolute inset-0 w-full h-full object-contain sm:object-cover transition group-hover:brightness-110"
        />
        {/* คำใบ้ */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white/70 text-sm animate-pulse drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
          แตะที่รูปภาพเพื่อเริ่ม
        </div>
        <div className="absolute bottom-8 right-4 text-white font-bold text-sm drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
          เวอร์ชัน 3.0 beta
        </div>
      </button>
    </div>
  );
}
