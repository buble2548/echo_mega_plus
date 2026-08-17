import { clickSound } from "../audio";

// ปุ่มสไตล์ ECHO — variant: gold (หลัก) | ghost (รอง) | danger
// ทรงตัดมุมเฉียงคม (.p-btn-cut) แทนปุ่มมนเรียบๆ เดิม ให้เข้าชุดกับป้าย/การ์ดสไตล์ Persona ทั้งเกม
export default function Button({ variant = "gold", className = "", children, onClick, ...props }) {
  const base =
    "p-btn-cut font-bold px-6 py-3 transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100";
  const styles = {
    gold: "bg-echo-gold text-gray-900 hover:brightness-110 shadow-lg shadow-echo-gold/20",
    ghost: "bg-white/10 text-white hover:bg-white/20 border border-white/15",
    danger: "bg-echo-magenta text-white hover:brightness-110",
    cyan: "bg-echo-cyan text-gray-900 hover:brightness-110",
  };
  const handle = (e) => {
    clickSound();
    onClick && onClick(e);
  };
  return (
    <button className={`${base} ${styles[variant]} ${className}`} onClick={handle} {...props}>
      {children}
    </button>
  );
}
