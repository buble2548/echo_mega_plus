const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

function serverSeconds(name) {
  const src = fs.readFileSync(path.join(root, "server.js"), "utf8");
  const m = new RegExp(`const ${name}\\s*=\\s*(\\d+(?:\\.\\d+)?)`).exec(src);
  assert.ok(m, `หา ${name} ใน server.js ไม่เจอ`);
  return Number(m[1]);
}

function cssSeconds(selector, keyframe) {
  const src = fs.readFileSync(path.join(root, "client", "src", "arena.css"), "utf8");
  const block = new RegExp(`\\${selector}\\s*\\{[^}]*animation:\\s*${keyframe}\\s+(\\d+(?:\\.\\d+)?)s`).exec(src);
  assert.ok(block, `หา animation ของ ${selector} ใน arena.css ไม่เจอ`);
  return Number(block[1]);
}

// แบนเนอร์บอกเทิร์นแสดงตอน gameState === "TRANSITION" เท่านั้น และถูกถอดทิ้งทันทีที่เข้า PLAYING
// สั้นกว่า TRANSITION_TIME -> เกิดช่องว่างก่อนฉาก "เริ่มจั่วการ์ด" · ยาวกว่า -> โดนตัดกลางคัน
test("round banner runs exactly as long as the server's TRANSITION phase", () => {
  assert.strictEqual(cssSeconds(".rb-wash", "rbWash"), serverSeconds("TRANSITION_TIME"));
});

// ฉาก "เริ่มโจมตีได้" ต้องไม่ยาวกว่าเวลาที่ผู้ชนะมีให้เลือกเป้าหมาย
test("attack call is shorter than the attack phase", () => {
  const src = fs.readFileSync(path.join(root, "client", "src", "screens", "Game.jsx"), "utf8");
  const m = /setAttackCall\(0\), (\d+)\)/.exec(src);
  assert.ok(m, "หาเวลาปิดฉากเริ่มโจมตีใน Game.jsx ไม่เจอ");
  assert.ok(Number(m[1]) / 1000 < serverSeconds("ATTACK_TIME"), "ฉากเริ่มโจมตียาวกว่าเฟสโจมตีเอง");
});
