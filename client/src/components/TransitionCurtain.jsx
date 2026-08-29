import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";

// ลำดับ "ความลึก" ของแต่ละหน้า ใช้เทียบว่ากดไปหน้าถัดไป (forward) หรือย้อนกลับ (back)
export const SCREEN_ORDER = { splash: 0, setup: 1, character: 2, connecting: 2.5, lobby: 3, gameintro: 3.5, game: 4 };

// ม่านเปลี่ยนฉาก: แถบเฉียง 3 สีกวาดปิดจอตอนสลับหน้า (ทิศทางสลับตาม forward/back)
// สามทางเข้าใช้ (ทั้งหมดผ่าน ref):
//  1) preTrigger(targetKey) — สลับหน้าทันที (local, ไม่ต้องรอ server): กวาดปิด-เปิดจบในตัวรอบเดียว
//     ผู้เรียก (App) หน่วงเวลาสลับ state จริงไว้จนกว่าม่านจะปิดสนิทก่อน
//  2) holdCover() / release() — ใช้ตอนต้องรอ server ตอบ (เช่น กดยืนยันตัวละคร -> รอ join ห้อง):
//     ม่านกวาดปิดแล้ว "ค้างปิดสนิท" ไว้จนกว่า release() จะถูกเรียก (ไม่ทายเวลาล่วงหน้า)
//  3) ตรวจจับเองอัตโนมัติเมื่อ screenKey เปลี่ยนโดยไม่มีใครสั่งล่วงหน้า (เผื่อกรณีอื่นๆ ที่ไม่ทันเรียก)
const TransitionCurtain = forwardRef(function TransitionCurtain({ screenKey }, ref) {
  const [state, setState] = useState({ visible: false, mode: "sweep", phase: null, direction: "forward", playId: 0 });
  const stateRef = useRef(state);
  stateRef.current = state;

  const prevKey = useRef(screenKey);
  const prevOrder = useRef(SCREEN_ORDER[screenKey] ?? 0);
  const firstRun = useRef(true);
  const timers = useRef([]);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  // โหมดกวาดจบในตัว (sweep): ปิด -> ค้างสั้นๆ -> เปิด ในอนิเมชันเดียวยาว 0.72s (ดู .p-curtain-bar)
  const playSweep = (dir) => {
    clearTimers();
    setState((s) => ({ visible: true, mode: "sweep", phase: null, direction: dir, playId: s.playId + 1 }));
    timers.current.push(setTimeout(() => setState((s) => ({ ...s, visible: false })), 850));
  };

  // โหมดค้างปิด (hold): ปิด -> ค้างสนิทไม่มีกำหนด -> ปล่อยเปิดตอนเรียก releaseHold()
  const startHold = (dir) => {
    clearTimers();
    setState((s) => ({ visible: true, mode: "hold", phase: "in", direction: dir, playId: s.playId + 1 }));
    timers.current.push(setTimeout(() => {
      setState((s) => (s.mode === "hold" && s.phase === "in" ? { ...s, phase: "held" } : s));
    }, 340));
    // กันเหนียว: เผื่อ server ไม่ตอบกลับเลย ไม่ให้จอมืดค้างตลอดไป
    timers.current.push(setTimeout(() => releaseHold(), 6000));
  };

  const releaseHold = () => {
    const cur = stateRef.current;
    if (cur.mode !== "hold" || cur.phase === "out" || !cur.visible) return;
    clearTimers();
    setState((s) => ({ ...s, phase: "out" }));
    timers.current.push(setTimeout(() => setState((s) => ({ ...s, visible: false })), 400));
  };

  useImperativeHandle(ref, () => ({
    preTrigger(targetKey) {
      const order = SCREEN_ORDER[targetKey] ?? 0;
      const dir = order >= prevOrder.current ? "forward" : "back";
      prevKey.current = targetKey;
      prevOrder.current = order;
      playSweep(dir);
    },
    holdCover(dir = "forward") {
      startHold(dir);
    },
    release() {
      releaseHold();
    },
  }));

  // useLayoutEffect (ไม่ใช่ useEffect ธรรมดา): ต้องซิงค์ให้ทันก่อนเบราว์เซอร์วาดเฟรมแรก
  // ไม่งั้นจะเห็นหน้าใหม่โผล่ก่อน แล้วม่านค่อยตามมาทีหลัง (กระพริบให้เห็นรอยต่อ)
  useLayoutEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      prevKey.current = screenKey;
      prevOrder.current = SCREEN_ORDER[screenKey] ?? 0;
      return;
    }
    if (screenKey === prevKey.current) return; // ถูกจัดการล่วงหน้าไปแล้ว หรือไม่มีการเปลี่ยนจริง
    const order = SCREEN_ORDER[screenKey] ?? 0;
    const dir = order >= prevOrder.current ? "forward" : "back";
    prevKey.current = screenKey;
    prevOrder.current = order;

    const holding = stateRef.current.mode === "hold" && stateRef.current.visible;
    if (holding) {
      // กำลังค้างปิดจออยู่แล้ว (มาจาก holdCover ก่อนหน้า) — ข้ามสถานะกลาง "connecting" ไว้ก่อน
      // แล้วค่อยปล่อยม่านเปิดตอนถึงหน้าจริง (lobby/game) เพื่อไม่ให้เห็นข้อความ "กำลังเชื่อมต่อ..." โผล่แทรก
      if (screenKey !== "connecting") releaseHold();
    } else {
      playSweep(dir);
    }
  }, [screenKey]);

  if (!state.visible) return null;

  const backCls = state.direction === "back" ? "p-curtain-back" : "";
  const holdCls =
    state.mode === "hold"
      ? state.phase === "in"
        ? "p-curtain-hold-in"
        : state.phase === "held"
        ? "p-curtain-held"
        : "p-curtain-hold-out"
      : "";
  const logoShow = state.mode === "sweep" || state.phase !== "out";

  return (
    <div key={state.playId} className="p-curtain" aria-hidden="true">
      <span className={`p-curtain-bar p-curtain-bar-a ${backCls} ${holdCls}`} />
      <span className={`p-curtain-bar p-curtain-bar-b ${backCls} ${holdCls}`} />
      <span className={`p-curtain-bar p-curtain-bar-c ${backCls} ${holdCls}`} />
      <span className={`p-curtain-logo ${state.mode === "hold" ? "p-curtain-logo-hold" : ""} ${state.mode === "hold" && logoShow ? "show" : ""}`}>
        <img src="/image/logo_current.webp" alt="" />
      </span>
    </div>
  );
});

export default TransitionCurtain;
