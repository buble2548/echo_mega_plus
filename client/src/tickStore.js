import { useSyncExternalStore } from "react";

// เซิร์ฟเวอร์ยิง tick ทุก 1 วินาที ถ้าเอาค่าไปแปะรวมใน state ก้อนเดียวกับกระดาน
// React ต้อง reconcile ทั้งจอใหม่ทุกวินาที (Game.jsx มีคอมโพเนนต์เกือบ 90 ตัว ไม่ได้ memo ไว้เลย)
// -> เห็นเป็นอาการกระตุกเป็นจังหวะตลอดเกม จึงแยกเวลาออกมาเป็น store เล็กๆ
//    ให้เฉพาะตัวที่โชว์ตัวเลขวินาทีเท่านั้นที่ re-render
let seconds = 0;
const listeners = new Set();

export function publishTick(t) {
  const n = Number(t) || 0;
  if (n === seconds) return;
  seconds = n;
  listeners.forEach((fn) => fn());
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function getSnapshot() {
  return seconds;
}

export function useTick() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

// ใช้แทรกในข้อความได้เลย เช่น ⏱️ <TickSeconds /> วิ
export function TickSeconds() {
  return useTick();
}
