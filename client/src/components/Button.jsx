import { clickSound } from "../audio";

const VARIANT_CLASS = {
  gold: "",
  ghost: "av-btn-ghost",
  danger: "av-btn-blood",
  cyan: "av-btn-royal",
  royal: "av-btn-royal",
};

export default function Button({ variant = "gold", className = "", children, onClick, ...props }) {
  const handle = (e) => {
    clickSound();
    onClick && onClick(e);
  };
  return (
    <button className={`av-btn ${VARIANT_CLASS[variant] || ""} ${className}`} onClick={handle} {...props}>
      {children}
    </button>
  );
}
