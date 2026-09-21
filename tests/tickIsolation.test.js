const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const clientSrc = path.join(__dirname, "..", "client", "src");

function readAll(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...readAll(p));
    else if (/\.jsx?$/.test(entry.name)) out.push([path.relative(clientSrc, p), fs.readFileSync(p, "utf8")]);
  }
  return out;
}

// server ยิง tick ทุกวินาที ถ้าค่านั้นไปอยู่ใน state ก้อนกระดาน React ต้อง reconcile ทั้งจอใหม่
// ทุกวินาที (Game.jsx มีคอมโพเนนต์เกือบ 90 ตัว ไม่มี memo เลย) = อาการกระตุกเป็นจังหวะ
// เวลาต้องไหลผ่าน tickStore เท่านั้น ให้เฉพาะตัวที่โชว์ตัวเลขวินาที re-render
test("the per-second countdown never re-enters the board state", () => {
  const app = fs.readFileSync(path.join(clientSrc, "App.jsx"), "utf8");
  const onTick = /const onTick = ([^;]*);/.exec(app);
  assert.ok(onTick, "หา onTick ใน App.jsx ไม่เจอ");
  assert.ok(!/setState/.test(onTick[1]), "onTick ต้องไม่เรียก setState — ส่งเข้า tickStore เท่านั้น");
  assert.ok(/publishTick/.test(onTick[1]), "onTick ต้องส่งค่าเข้า tickStore");
});

test("no screen reads the countdown off the board state", () => {
  const offenders = readAll(clientSrc)
    .filter(([f]) => f !== path.join("App.jsx"))
    .filter(([, src]) => /state\.timeLeft/.test(src))
    .map(([f]) => f);
  assert.deepStrictEqual(offenders, [], "ไฟล์เหล่านี้ยังอ่าน state.timeLeft แทน useTick()");
});
