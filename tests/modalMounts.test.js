const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const src = fs.readFileSync(path.join(__dirname, "..", "client", "src", "screens", "Game.jsx"), "utf8");
const lines = src.split("\n");
const desktopAt = lines.findIndex((l) => l.includes("จอคอม/แท็บเล็ต: กระดานเดิม"));

// Game.jsx เรนเดอร์กระดานสองชุด (มือถือ < 768px แล้วค่อยจอคอม) โมดัลที่เสียบไว้ชุดเดียว
// จะหายไปเงียบๆ อีกชุดหนึ่ง — เคยพลาดมาแล้วทั้ง ShopHerald และหน้าต่างสกิลของโคทาโร่
// (สาเหตุเดิม: แก้ไฟล์ด้วยการ match ข้อความที่ย่อหน้าต่างกัน แล้วไปลงบล็อกผิด)
const MODALS = ["LumiIdolModal", "BrianKeyModal", "KotarouModal", "ConnorPredictModal", "YuiSongModal"];

test("โมดัลเลือกของทุกตัวถูกเสียบครบทั้งกระดานมือถือและกระดานจอคอม", () => {
  assert.ok(desktopAt > 0, "หาจุดเริ่มกระดานจอคอมใน Game.jsx ไม่เจอ");
  for (const name of MODALS) {
    const at = lines.reduce((acc, l, i) => (l.includes(`<${name} `) ? [...acc, i] : acc), []);
    assert.ok(at.some((i) => i < desktopAt), `${name} ไม่ได้ถูกเรนเดอร์ในกระดานมือถือ`);
    assert.ok(at.some((i) => i > desktopAt), `${name} ไม่ได้ถูกเรนเดอร์ในกระดานจอคอม`);
    assert.equal(at.length, 2, `${name} ถูกเสียบ ${at.length} จุด (ต้องเป็น 2: มือถือ + จอคอม)`);
  }
});
