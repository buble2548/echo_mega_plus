const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const clientSrc = path.join(__dirname, "..", "client", "src");
const game = fs.readFileSync(path.join(clientSrc, "screens", "Game.jsx"), "utf8");
const css = ["arena.css", "index.css"]
  .map((f) => fs.readFileSync(path.join(clientSrc, f), "utf8"))
  .join("\n");

// ฉากประกาศแต่ละอันกินจอเต็มใบ เดิมต่างคนต่างตั้งเวลาของตัวเอง จึงเล่นทับกันได้
//  (ที่ชนบ่อยที่สุด: กลางวัน-กลางคืนสลับทุก 3 เทิร์น เด้งพร้อม "เริ่มจั่วการ์ด" ที่ต้นเทิร์นพอดี)
//  ทั้งหมดต้องไหลผ่านคิวเดียว ซึ่งเล่นทีละอันเสมอ
const SCENE_PREFIX = { cycle: "cy", draw: "dc", atk: "ac", shop: "sh" };

function sceneDurations() {
  const m = /const SCENE_MS = \{([^}]*)\}/.exec(game);
  assert.ok(m, "หา SCENE_MS ใน Game.jsx ไม่เจอ");
  return Object.fromEntries(
    [...m[1].matchAll(/(\w+):\s*(\d+)/g)].map(([, k, v]) => [k, Number(v)]),
  );
}

// ความยาวอนิเมชันที่ยาวที่สุดของฉากนั้น (วินาที)
function longestAnimation(prefix) {
  let longest = 0;
  for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!selector.includes(`.${prefix}-`)) continue;
    for (const [, dur] of body.matchAll(/animation:[^;]*?(\d+(?:\.\d+)?)s/g)) {
      longest = Math.max(longest, Number(dur));
    }
  }
  return longest;
}

test("ทุกฉากประกาศเล่นผ่านคิวเดียว ไม่มีใครมีตัวตั้งเวลาของตัวเอง", () => {
  assert.match(game, /const \[sceneQ, setSceneQ\] = useState\(\[\]\)/, "ไม่พบคิวฉาก");
  assert.match(game, /const scene = sceneQ\[0\] \|\| null;/, "คิวต้องเล่นทีละอันจากหัวคิว");
  for (const stale of ["setCycleFx", "setShopHerald", "setAttackCall", "setDrawCall"]) {
    assert.ok(!game.includes(stale), `${stale} ยังอยู่ — ฉากนั้นยังตั้งเวลาเองนอกคิว`);
  }
});

test("แต่ละฉากถูกเรนเดอร์จากหัวคิวเท่านั้น และครบทั้งสองกระดาน", () => {
  const lines = game.split("\n");
  const desktopAt = lines.findIndex((l) => l.includes("จอคอม/แท็บเล็ต: กระดานเดิม"));
  assert.ok(desktopAt > 0, "หาจุดเริ่มกระดานจอคอมไม่เจอ");
  for (const kind of ["draw", "atk", "shop"]) {
    const at = lines.reduce((acc, l, i) => (l.includes(`scene?.kind === "${kind}"`) ? [...acc, i] : acc), []);
    assert.equal(at.length, 2, `ฉาก ${kind} ถูกเรนเดอร์ ${at.length} จุด (ต้องเป็น 2: มือถือ + จอคอม)`);
    assert.ok(at.some((i) => i < desktopAt) && at.some((i) => i > desktopAt), `ฉาก ${kind} ขาดไปกระดานหนึ่ง`);
  }
});

test("เวลาในคิวยาวพอให้อนิเมชันของฉากนั้นเล่นจบ", () => {
  const ms = sceneDurations();
  for (const [kind, prefix] of Object.entries(SCENE_PREFIX)) {
    const cssSec = longestAnimation(prefix);
    assert.ok(cssSec > 0, `หาอนิเมชันของฉาก ${kind} (.${prefix}-*) ใน css ไม่เจอ`);
    assert.ok(ms[kind], `SCENE_MS ไม่มีฉาก ${kind}`);
    assert.ok(
      ms[kind] >= cssSec * 1000,
      `ฉาก ${kind} ถูกถอดออกที่ ${ms[kind]}ms แต่อนิเมชันยาว ${cssSec}s — ฉากถัดไปจะเด้งมาทับตอนอันเก่ายังจางไม่หมด`,
    );
  }
});

// แบนเนอร์เปลี่ยนเทิร์นไม่ได้เข้าคิว (ผูกกับเฟส TRANSITION โดยตรง) จึงต้องกั้นคิวไว้แทน
test("แบนเนอร์เปลี่ยนเทิร์นและคัตซีนกั้นคิวไว้ ไม่ให้ฉากอื่นเล่นทับ", () => {
  assert.match(
    game,
    /const sceneBlocked = phase === "TRANSITION" \|\| phase === "CUTSCENE";/,
    "คิวต้องหยุดระหว่างแบนเนอร์เปลี่ยนเทิร์นและคัตซีน",
  );
});
