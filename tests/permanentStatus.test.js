const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const { NO_TICK_STATUS } = require("../characters/_universal_status.js");

// ฝั่ง client ตัดสินว่าสถานะไหนเป็น "สแตค/ธงถาวร" กับ "ตัวนับเทิร์น" จากรายชื่อของตัวเอง
// ถ้าสองฝั่งหลุดจากกัน UI จะโชว์ "เหลือ N เทิร์น" ทั้งที่ค่านั้นคือสแตค (เคยหลุดมาแล้ว 27 สถานะ)
function clientKeys() {
  const src = fs.readFileSync(path.join(__dirname, "..", "client", "src", "data", "permanentStatus.js"), "utf8");
  const body = /new Set\(\[([\s\S]*?)\]\)/.exec(src);
  assert.ok(body, "หา PERMANENT_STATUS_KEYS ในฝั่ง client ไม่เจอ");
  return new Set([...body[1].matchAll(/"([A-Za-z0-9_]+)"/g)].map((m) => m[1]));
}

test("client permanent-status list covers every server NO_TICK_STATUS key", () => {
  const client = clientKeys();
  const missing = [...NO_TICK_STATUS].filter((k) => !client.has(k));
  assert.deepStrictEqual(missing, [], `client/src/data/permanentStatus.js ขาด: ${missing.join(", ")}`);
});

test("client permanent-status list has no unknown keys", () => {
  const client = clientKeys();
  // อนุญาตเฉพาะคีย์ที่ฝั่ง client ดูแลเอง (สถานะที่ server ไม่ได้เก็บใน statuses ตรงๆ)
  const clientOnly = new Set(["hakunoInvertReady", "hakunoNoRegenReady", "ippoDempsey"]);
  const unknown = [...client].filter((k) => !NO_TICK_STATUS.has(k) && !clientOnly.has(k));
  assert.deepStrictEqual(unknown, [], `มีคีย์เกินในฝั่ง client: ${unknown.join(", ")}`);
});
