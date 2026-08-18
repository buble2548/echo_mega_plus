// ============================================================
//  ECHO — Blackjack Skill Battle : เซิร์ฟเวอร์ + เอนจินเกม
//  - การ์ดสุ่มเลข 1-10 (ไม่ซ้ำในมือเดียวกัน) รวมแต้มใกล้ 21 สุดโดยไม่เกิน
//  - 1 รอบ: ไพ่ -> [CUTSCENE] -> สรุปผล -> โจมตี -> แบนเนอร์รอบ
//  - ระบบแปลงร่าง/cutscene/เพลงสกิลแบบ generic (Ginga / NewType Paradise / NT-D)
// ============================================================

// ตาข่ายสำรองชั้นสุดท้าย — ทุก socket handler ควรมี try/catch ของตัวเองแล้ว (ดู safeOn/onPlayerEvent)
//  นี่ป้องกันเผื่อโค้ดจุดอื่น (เช่น setTimeout/setInterval callback) โยน error ที่ไม่มีใครจับ ไม่ให้ process ทั้งตัว crash
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException] เซิร์ฟเวอร์เจอข้อผิดพลาดที่ไม่ได้ถูกจับ — ทำงานต่อแทนที่จะปิดตัว:", err);
});
process.on("unhandledRejection", (err) => {
  console.error("[unhandledRejection] Promise ถูกปฏิเสธโดยไม่มีใครจับ:", err);
});

const express = require("express");
const http = require("http");
const crypto = require("crypto");
const { Server } = require("socket.io");
const path = require("path");
const fs = require("fs");
const { CHARACTERS, CHAR_BY_ID, POSITION_COLORS, publicRoster } = require("./characters");
// ไฟล์มัดรวมสคริปต์ตัวละครที่แยกออกมาจากไฟล์นี้ (โฟลเดอร์ characters/ — คนละอันกับ characters.js ด้านบน)
const CHAR_HOOKS = require("./characters/index");
// ระบบสถานะ universal (buff/debuff กลาง) — ดู characters/_universal_status.js
const {
  SPELLBURDEN_MAX,
  statusAmtOf,
  applyBuff,
  applyDebuff,
  resistActive,
  BASIC_DEBUFF_CLEAR,
  SOFT_DEBUFF_STEP,
  cleanseDebuffs,
  noHealActive,
  invertActive,
  tickBurn,
  EVADE_STACK_MAX,
  EVADE_STACK_TURNS,
  grantEvadeStack,
  consumeEvadeStack,
  tickEvadeStacks,
} = require("./characters/_universal_status");
// ยูนะ — ไอดอลเอฟเฟกต์สนาม (ไม่ใช่ตัวละครที่เล่นได้ ไม่อยู่ใน CHARACTERS/CHAR_HOOKS — require ตรงๆ เหมือน _universal_status)
const YunaMod = require("./characters/yuna");

const app = express();
const server = http.createServer(app);
// จำกัด origin ที่เชื่อมต่อ socket.io ได้ — ตั้ง ALLOWED_ORIGIN เป็นโดเมนจริงตอน deploy (เช่น
//  https://your-app.onrender.com) กัน third-party เว็บอื่นฝัง script มาเชื่อมต่อ/join เกมได้
//  ไม่ตั้งค่านี้ = ไม่จำกัด origin (ค่าเริ่มต้นเดิม) — เหมาะกับ dev ในเครื่องที่ยังไม่รู้โดเมนจริง
//  (dev ผ่าน Vite proxy ที่ :5173 อยู่แล้วไม่ต้องพึ่งค่านี้ เพราะ browser มองว่าเป็น same-origin)
const io = new Server(server, {
  // Socket events use small payloads; reject oversized packets before parsing.
  maxHttpBufferSize: 64 * 1024,
  cors: process.env.ALLOWED_ORIGIN ? { origin: process.env.ALLOWED_ORIGIN } : undefined,
});

const clientDist = path.join(__dirname, "client", "dist");
const useReact = fs.existsSync(path.join(clientDist, "index.html"));
const staticDir = useReact ? clientDist : path.join(__dirname, "public");

// ไฟล์ตัวละคร (รูป/วิดีโอ/เพลง) ย้ายไปเก็บบน Cloudflare R2 แล้ว — ตั้ง ASSET_BASE_URL ไว้ค่อย redirect
// ไปที่นั่นแทนการเสิร์ฟจากเครื่องเอง (R2 ไม่คิดค่า egress ต่างจาก bandwidth ของ server หลักที่มีโควตา)
// ไม่ตั้งค่านี้ = fallback เสิร์ฟจากไฟล์ในเครื่องตามเดิม (เช่นตอน dev ในเครื่อง)
const ASSET_BASE_URL = process.env.ASSET_BASE_URL; // เช่น https://pub-xxxx.r2.dev
if (ASSET_BASE_URL) {
  app.get("/characters/*", (req, res) => res.redirect(302, ASSET_BASE_URL + req.path));
}

app.use(express.static(staticDir, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith(".html")) {
      // app shell ต้องเช็คของใหม่ทุกครั้ง ไม่งั้น deploy ใหม่แล้ว client ยังใช้โค้ดเก่าค้าง
      res.setHeader("Cache-Control", "no-cache");
    } else if (path.basename(path.dirname(filePath)) === "assets") {
      // ไฟล์ js/css ของ vite มี hash ในชื่อไฟล์อยู่แล้ว เปลี่ยนเนื้อหา = เปลี่ยนชื่อไฟล์ แคชยาวสุดได้เลย
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    } else {
      // รูป/วิดีโอ/เพลงตัวละคร (ไฟล์ใหญ่ ชื่อไฟล์ไม่มี hash) แคช 30 วัน ลด bandwidth การโหลดซ้ำ
      res.setHeader("Cache-Control", "public, max-age=2592000");
    }
  },
}));
app.get(/^\/(?!socket\.io).*/, (req, res) => res.sendFile(path.join(staticDir, "index.html")));


// ---------- ค่าคงที่ ----------
const MAX_PLAYERS = 6;
const CARD_TIME = 60;
const SUMMARY_TIME = 5;
const ATTACK_TIME = 15;
const TRANSITION_TIME = 3;
const RECONNECT_GRACE_MS = Math.max(100, Number(process.env.RECONNECT_GRACE_MS) || 60_000);
const RESERVATION_TTL_MS = 120_000;
const ATTACKFX_TIME = 3;  // อนิเมชันบอกว่าใครตีใคร

const MAX_HP = 7;       // เลือดจริงพื้นฐาน (patch พิเศษ — เดิม 5)
const MAX_ARMOR = 3;    // เกราะเริ่มต้น (patch พิเศษ — เดิม 2)
const MAX_SKILL = 8;
const BEAM_AMMO = 2;    // กระสุน Beam Magnum ต่อเกม (บานาจ)
// ---------- ร้านค้ามายา + เศรษฐกิจเหรียญ (patch 2.2 full) ----------
const GOLD_MAX = 30;             // เพดานเหรียญต่อผู้เล่น
const GOLD_PER_TURN = 1;         // เหรียญที่ได้ทุกจบเทิร์น (ทุกคน)
const GOLD_WIN_BONUS = 1;        // เหรียญเพิ่มเมื่อชนะการจั่วไพ่
const SHOP_INTERVAL_TURNS = 5;   // ร้านค้าเปิดทุกๆ 5 เทิร์น
const SHOP_MAX_ITEMS = 9;        // จำนวนสินค้าสูงสุดต่อรอบร้านค้า (เดิม 6)
const SHOP_CARD_COLOR_PRICE = 5; // ยาเปลี่ยนสีการ์ด: เลือกการ์ด 1 ใบในมือ เปลี่ยนเป็นสีที่ต้องการ
const SHOP_FORTUNE_PRICE = 5;
const SHOP_FORTUNE_AMOUNT = 2;   // ยาโชคลาภ: ได้โชคลาภ +2 หน่วยเมื่อใช้
const SHOP_RESIST_PRICE = 5;
const SHOP_RESIST_TURNS = 3;     // ยาต้านสถานะ: ต้านสถานะผิดปกติ 3 เทิร์น
const SHOP_ARMOR_PRICE = 3;
const SHOP_ARMOR_AMOUNT = 1;     // ยาฟื้นเกราะ: ฟื้นเกราะ +1 หน่วย
const SHOP_CARD_REMOVE_PRICE = 5; // ยาลดไพ่: ลดไพ่ใบล่าสุดของตัวเองออก 1 ใบ (กันแตกได้)
const SHOP_SKILL_SIZES = [
  { size: "small", amount: 1, price: 2 },
  { size: "medium", amount: 4, price: 6 },
  { size: "large", amount: 6, price: 10 },
];
// ---------- DoomGuy (patch 2.2 full) ----------
const DOOM_BASE = "/characters/doomguy";
const DOOM_WEAPONS = {
  shotgun:      { id: "shotgun", name: "Combat Shotgun", img: `${DOOM_BASE}/สกิลรอง/Combat shotgun.webp`, cost: 2, weight: 17, atk: 2, pierce: false, effect: "explode" },
  heavy:        { id: "heavy", name: "Heavy Cannon", img: `${DOOM_BASE}/สกิลรอง/Heavy Cannon.webp`, cost: 2, weight: 17, atk: 2, pierce: true, effect: "lockon" },
  plasma:       { id: "plasma", name: "Plasma Rifle", img: `${DOOM_BASE}/สกิลรอง/Plasma Rifle.webp`, cost: 2, weight: 17, atk: 1, pierce: true, effect: "drain" },
  chaingun:     { id: "chaingun", name: "Chaingun", img: `${DOOM_BASE}/สกิลรอง/Chaingun.webp`, cost: 2, weight: 17, atk: 2, pierce: false, effect: "shield" },
  rocket:       { id: "rocket", name: "Rocket Launcher", img: `${DOOM_BASE}/สกิลรอง/Rocket Launcher.webp`, cost: 5, weight: 10, atk: 3, pierce: false, splash: true, effect: "bonusdmg" },
  supershotgun: { id: "supershotgun", name: "Super Shotgun", img: `${DOOM_BASE}/สกิลรอง/Super shotgun.webp`, cost: 4, weight: 10, atk: 3, pierce: false, effect: "stun" },
  ballista:     { id: "ballista", name: "Ballista", img: `${DOOM_BASE}/สกิลรอง/Ballista.webp`, cost: 5, weight: 10, atk: 3, pierce: true, effect: "bonusdmg2" },
  bfg:          { id: "bfg", name: "BFG 9000", img: `${DOOM_BASE}/สกิลรอง/BFG9000.webp`, cost: 8, weight: 2, atk: 6, pierce: false, effect: null },
};
const DOOM_WEAPON_IDS = Object.keys(DOOM_WEAPONS);
const DOOM_STARTING_WEAPON = "shotgun";
const DOOM_LOCKON_CHANCE = 1; // patch: เอาทอย 40% ออก ติดสถานะ [ล็อคเป้า] แน่นอนเสมอ
const DOOM_EXPLODE_DMG = 1;
const DOOM_EXPLODE_TARGETS = 2;
const DOOM_LOCKON_BONUS = 1;
const DOOM_ROCKET_BONUS_DMG = 2;
const DOOM_BALLISTA_TARGET_DMG = 2; // Ballista (patch): เปลี่ยนจาก aoe ทุกคน 1 -> เลือกเป้าหมาย 1 คนโดนดาเมจเพิ่มเติม 2 (โครงเดียวกับ Rocket's bonusdmg)
const DOOM_DRAIN_DMG = 1;    // [โดนดูด] (Plasma Rifle): ดาเมจ 1/เทิร์น ผ่านเกราะก่อน
const DOOM_DRAIN_TURNS = 3;  // [โดนดูด]: คงอยู่ 3 เทิร์น
const DOOM_CRUCIBLE_ATK = 7;
const DOOM_CRUCIBLE_CHARGE_NEED = 5;
const DOOM_HEAL_ON_ATK = 1;
const DOOM_SHIELD_ON_ATK = 1; // patch: พาสซีฟเพิ่มโล่ +1 ทุกครั้งที่โจมตีโดน (นอกเหนือจากฮีล)
const DOOM_CHARGE_CHANCE = 0.35; // patch 2.2 new: 10% -> 25% -> 35%
const DOOM_TIE_ATTACK_CHANCE = 0.75; // patch: 50% -> 60% -> 75% (ชนะมากขึ้น)
const DOOM_FORTUNE_CHANCE = 0.2; // patch: ทุกต้นเทิร์นมีโอกาส 20% ได้ [โชคลาภ] +1 สแตค
const DOOM_CRUCIBLE_BUST_DMG = 2; // Crucible: บังคับทุกคนแตก -> รับความเสียหายเหมือนแพ้จั่ว/ไพ่แตก
const DOOM_CRUCIBLE_BUST_DRAWS = 2; // Crucible (patch 2.2.4): บังคับจั่วเพิ่ม 2 ใบ (แบบเดียวกับ Ashen Trail โอกูริ)
const DOOM_CRUCIBLE_BUST_BONUS = 8; // Crucible (patch 2.2.4): บวกแต้มการ์ดตรงๆ +8 การันตีแตกจริง แม้เปิดไพ่/ล็อกไปแล้ว
// ---------- สึงาชิ ทาคุโตะ (patch 2.2 new) ----------
// ค่าคงที่ของทาคุโตะส่วนใหญ่ย้ายไปอยู่ characters/takuto.js แล้ว — เหลือแค่ที่ shared damage-sum/decay loop ในไฟล์นี้ยังใช้อยู่
const TAKUTO_STAR_NEED = 5;           // ดวงดาวสะสมครบ 5 -> ฉันคว้ามันได้แล้ว (Apprivoise!) ทันที (ใช้ใน log ตอน apprivoise หมดเวลา)
const TAKUTO_APPRIVOISE_TURNS = 10;   // ฉันคว้ามันได้แล้ว: คงอยู่ 10 เทิร์น หมดแล้วกลับเป็นทาคุโตะปกติ ต้องเก็บดวงดาวใหม่ (patch 2.2.3 — เดิมถาวร)
const TAKUTO_LANCE_DMG = 5;           // หอกผู้พิชิต: การโจมตีปกติดาเมจคงที่ 5 หน่วย (คำนวณใน doAttack()'s shared damage-sum — นอกขอบเขต Phase 1)
// ---------- เทเปา (ชิกิ) — ค่าคงที่/ตรรกะทั้งหมดย้ายไปอยู่ characters/tepeu.js แล้ว ----------
// สุ่มอาวุธถัดไปแบบถ่วงน้ำหนัก (ไม่สุ่มซ้ำกระบอกเดิม)
function rollDoomWeapon(excludeId) {
  const total = DOOM_WEAPON_IDS.reduce((n, id) => n + (id === excludeId ? 0 : DOOM_WEAPONS[id].weight), 0);
  let r = Math.random() * total;
  for (const id of DOOM_WEAPON_IDS) {
    if (id === excludeId) continue;
    r -= DOOM_WEAPONS[id].weight;
    if (r <= 0) return id;
  }
  return DOOM_WEAPON_IDS.find((id) => id !== excludeId) || DOOM_WEAPON_IDS[0];
}
// ---------- บานาจ ลิงก์ — ลิงก์ Rework (patch 2.1.2) ----------
// Absorb shield/Full Assault ย้ายไปอยู่ characters/banagher.js แล้ว (แยกได้บางส่วน — NT-D/unibeam2 รอ characters/riddhe.js)
const BANAGHER_SHIELD_AMT = 2;   // Absorb shield: โล่ที่มอบให้เป้าหมาย (มีสำเนาใน banagher.js สำหรับ log — ค่านี้ใช้ฟื้นโล่ต้นเทิร์นที่ยังมีผลใน server.js)
const BANAGHER_ULT2_SPLASH_DMG = 3; // แสงที่ไม่อยู่เพียงลำพัง: ตีหมู่ผู้เล่นอื่นที่เหลือ (ยกเว้นริดดี้พันธมิตร)
const BANAGHER_ULT2_ALLY_COST = 8; // แสงที่ไม่อยู่เพียงลำพัง: หักแต้มสกิลริดดี้พันธมิตรด้วย 8 แต้ม (รวมคอสจริง 16 — ของตัวเอง 8 + พันธมิตร 8)
const BANAGHER_BASE_IMG = "/characters/banagher/banagher_update/unicorn_new.png"; // ภาพเริ่มเกม (ลงสนามแล้ว) — หน้าเลือกตัวละครยังใช้ภาพเดิม
const GAMBLER_USES = 3; // วอสก้าหน่อยน้อง ใช้ได้ต่อเกม (แกมเบลอร์)
const TEMP_HP_TURNS = 2; // เลือดชั่วคราว (แกมเบลอร์) หายเองภายใน 2 เทิร์น
const EVA_BLAST_DMG = 8; // ระเบิด fourth impact (เอวา 13) ใส่ทุกคนในสนาม (patch 2.2 alpha — เดิม 5)
// ---------- คุวากาตะโอเจอร์ (patch 2.2 alpha) ----------
// ---------- เอวานเกเลี่ยน หมายเลข 13 (patch 2.2 alpha) ----------
const EVA13_RSHOPPER_MAX = 3;          // RS-Hopper: ชาร์จสูงสุด (ใช้ตอน resetCombat/join init — ยังอยู่ server.js)


// ---------- ไรโด ฮิคารุ / อุลตร้าแมนกิงกะ (rework patch 2.1.3) ----------
//  สกิลพื้นฐาน 1 MonsterLive: เพดานเกราะ+2 ฟื้นเกราะทันที+2 คงอยู่ 3 เทิร์น — เกราะลด = ฟื้นเลือดตามเกราะที่เสีย
//    + ดาเมจที่ได้รับจากการโจมตี -1 (ใช้ terms เดิมของสถานะ monster) — ใช้สกิลรอง 1 ไม่ได้ระหว่างนี้
//  สกิลพื้นฐาน 2 UPG!: แทนสกิลพื้นฐาน 1 ระหว่างร่าง Ginga — เพดานแต้มจั่วไพ่ 20 (เดิม 16/19)
//  สกิลรอง 1 Ultlive Ultraman Ginga: ก่อนเปิดการ์ด แปลงร่าง Ginga 5 เทิร์น ตีหมู่ — เปลี่ยนสกิลพื้นฐานเป็น UPG!
//  สกิลรอง 2 ลำแสงสโตเรียม: แทนสกิลรอง 1 ระหว่างร่าง Ginga Strium — ดาเมจ = โจมตีปกติ(สูงสุด 4)+ลุกไหม้ที่เหลือ รวมไม่เกิน 8
//  ท่าไม้ตาย Ginga Strium: ต้องอยู่ในร่าง Ginga ตอนกลางวันเท่านั้น — แปลงร่าง 5 เทิร์น โจมตี+1 ลุกไหม้ตัวเอง 5
//    โจมตีโดนเป้าหมาย = ลุกไหม้เป้าหมาย +2 — เปลี่ยนสกิลรองเป็นลำแสงสโตเรียม
//  สกิลติดตัว 2 หัวใจที่ลุกไหม้: ระหว่างร่าง Ginga Strium ลุกไหม้ที่เกิดกับตัวเองรักษาแทนสร้างความเสียหาย
// ค่าคงที่ของฮิคารุส่วนใหญ่ย้ายไปอยู่ characters/hikaru.js แล้ว — เหลือแค่ที่ shared infra ในไฟล์นี้ยังใช้อยู่
const HIKARU_MONSTER_ARMOR_BONUS = 2; // MonsterLive: เพดานเกราะ +2 (maxArmorOf)
const HIKARU_STORIUM_ATK_CAP = 4;     // ลำแสงสโตเรียม: นับดาเมจจากการโจมตีปกติสูงสุด 4 (doAttack's shared damage-sum — นอกขอบเขต Phase 1)
const HIKARU_STORIUM_TOTAL_CAP = 8;   // ลำแสงสโตเรียม: ดาเมจรวมสูงสุด 8 (doAttack's shared damage-sum — นอกขอบเขต Phase 1)
const HIKARU_STRIUM_IMG = "/characters/hikaru/hikaru_update/ginga_strium.jpg"; // โปรไฟล์ระหว่างร่าง Ginga Strium (displayImg/TRANSFORMS)

// ---------- ฟุจิตะ โคโตเนะ (patch 1.9.1 / rework 2.1.3) ----------
// ค่าคงที่ของโคโตเนะส่วนใหญ่ย้ายไปอยู่ characters/kotone.js แล้ว — เหลือแค่ที่ shared infra ในไฟล์นี้ยังใช้อยู่
const KOTONE_DANCE_COIN_COST = 3; // สกิลรอง: ต้องมี coin อย่างน้อยเท่านี้ถึงใช้ได้ (useSkill's gate)
const KOTONE_DANCE_ATK_BONUS = 2; // สกิลรอง: บัฟพลังโจมตีพื้นฐาน +2 (fx log เท่านั้น — มีสำเนาใน kotone.js สำหรับผลจริง)
// [โหมงานหนัก] ทำงานอยู่ไหม (ฟุจิตะ โคโตเนะ, characters/kotone.js) — wrapper รอบ CHAR_HOOKS.kotone.overworkActive
// Sleeping time (patch 2.2.2): ถูกโจมตีระหว่างหลับจะไม่ปลุกโคโตเนะอีกต่อไป — หลับยาว 3 เทิร์นเต็มโดยไม่สะดุ้งตื่น
// (คงฟังก์ชัน/จุดเรียกไว้เผื่อใช้ในอนาคต — ตอนนี้ไม่มีผลอะไรแล้ว)
function maybeWakeKotone(t) {
  return;
}

// แสงจันทร์ส่องวิญญาณ ร่างสปาด้า (ชเรด เอลัน, characters/shrade_elan.js) — wrapper รอบ CHAR_HOOKS.shrade_elan.maybeMoonBurst
function maybeMoonBurst(p) {
  CHAR_HOOKS.shrade_elan.maybeMoonBurst(engine, p);
}

// ============================================================
//  Bard : คีตกวี — ระบบประพันธ์เพลง / บรรเลงทำนอง / มิติมายาบรรเลง
// ============================================================
// ครบ 3 โน้ต -> หาบทเพลงตามลำดับโน้ต — ต้องเลือกเป้าหมายก่อนเสมอ (patch 2.0.5: ทุกบทเพลงมีเป้าหมาย)
function bardCompose(p, live) {
  const pattern = (p.bardNotes || []).join("");
  p.bardNotes = [];
  const song = BARD_SONGS[pattern];
  if (!song) return;
  if (song.need > 0) {
    // เป้าหมายที่เลือกได้มีพอดี/น้อยกว่าที่ต้องการ -> บทเพลงเลือกให้เองทันที ไม่ต้องรอ (กันเกมค้าง)
    const pool = alivePlayers().filter((o) => song.allowSelf || o.id !== p.id);
    if (pool.length <= song.need) {
      const picked = pool.slice(0, song.need).map((o) => o.id);
      lastLog.push(`🎼 ${p.name} ประพันธ์เพลง ${song.name} สำเร็จ — เป้าหมายมีเพียงพอดี บทเพลงเลือกให้อัตโนมัติ`);
      bardPerform(p, pattern, picked, live);
      return;
    }
    p.bardPending = { pattern, name: song.name, need: song.need, allowSelf: !!song.allowSelf };
    lastLog.push(`🎼 ${p.name} ประพันธ์เพลง ${song.name} สำเร็จ — กำลังเลือกเป้าหมาย (ไม่เลือกก่อนเปิดไพ่ = สุ่มเป้าหมาย)`);
    io.emit("skillFlash", { name: `🎼 ${song.name} — กำลังเลือกเป้าหมาย`, img: song.song === "crimson" ? BARD_CRIMSON_IMG : BARD_JADE_IMG, by: p.name, color: POSITION_COLORS[p.position] || "#9B4F96" });
    return;
  }
  bardPerform(p, pattern, [], live);
}
// บรรเลงทำนอง: ใช้ผลบทเพลง + ท่อนทำนองตามสาย + พลังงาน +1
//  live = บรรเลงระหว่างช่วงจั่วการ์ด (เปิดมิติแล้วพักเกมเล่นวีดีโอได้) / false = บรรเลงตอนเปิดไพ่ (สุ่มเป้า)
function bardPerform(p, pattern, targets, live) {
  const song = BARD_SONGS[pattern];
  if (!song || !p.alive) return;
  const isCrimson = song.song === "crimson";
  CHAR_HOOKS.bard.applyBardSong(engine, p, pattern, targets);
  if (isCrimson) p.bloodSection = Math.min(BARD_SECTION_MAX, (p.bloodSection || 0) + 1);
  else p.soulSection = Math.min(BARD_SECTION_MAX, (p.soulSection || 0) + 1);
  addSkill(p, 1); // บรรเลงทำนองสำเร็จ ได้รับพลังงาน +1
  // เสียงบรรเลง: สาย Crimson = 01 / สาย Jade = 02
  io.emit("bardSfx", { kind: "perform", sound: isCrimson ? 1 : 2 });
  io.emit("skillFlash", { name: `🎼 บรรเลงทำนอง — ${song.name}`, img: isCrimson ? BARD_CRIMSON_IMG : BARD_JADE_IMG, by: p.name, color: POSITION_COLORS[p.position] || "#9B4F96" });
  lastLog.push(`🎼 ${p.name} บรรเลงทำนอง ${song.name}! พลังงาน +1 (โลหิต ${p.bloodSection || 0}/${BARD_SECTION_MAX} · วิญญาณ ${p.soulSection || 0}/${BARD_SECTION_MAX})`);
  // มิติมายาบรรเลงวิญญาณ (patch 2.0.6): ทุกครั้งที่เกิดการบรรเลงทำนอง
  //  — คีตกวีทำดาเมจ 1 แบบสุ่มกับผู้เล่น 2 คน จนกว่ามิติจะสิ้นสุด
  if ((p.statuses.soulDim || 0) > 0) {
    const pool = alivePlayers().filter((t) => t.id !== p.id);
    const hits = [];
    while (hits.length < BARD_SOUL_TARGETS && pool.length) {
      hits.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    }
    for (const t of hits) {
      dealMixed(t, BARD_SOUL_PERFORM_DMG);
      if (t.alive && t.hp <= 0) t.hp = 1; // มิติวิญญาณ: เป้าหมายไม่สามารถถูกฆ่าได้จากเอฟเฟกต์นี้ (เลือดค้างที่ 1)
      maybeBeatSave(t);
      maybeBeatMode(t);
      maybeEva3(t);
      maybeWakeKotone(t);
      t.wasAttacked = true;
    }
    if (hits.length) lastLog.push(`💚🌑 มิติมายาบรรเลงวิญญาณ — ทำนองของ ${p.name} บาดวิญญาณ ${hits.map((t) => t.name).join(", ")} -${BARD_SOUL_PERFORM_DMG} (ตายไม่ได้จากเอฟเฟกต์นี้)`);
  }
  CHAR_HOOKS.bard.maybeBardDim(engine, p, live);
}
// ผลของบทเพลงแต่ละแบบ / มิติมายาบรรเลง — ย้าย body ไป characters/bard.js แล้ว (ดู CHAR_HOOKS.bard)

// ---------- เจ้าแห่งเน็ตบ้าน (patch 1.9) ----------
//  ระบบสัญญา: ท่าไม้ตายยื่นข้อเสนอ -> เป้าหมายตอบรับ = เป็นคู่สัญญา (เกราะ +1 / โจมตี +1 ตลอดสัญญา)
//  คู่สัญญาใช้งานครบทุก 3 เทิร์น -> ถามต่อสัญญา (จ่าย 4 แต้มคืนให้เจ้าของ / ปฏิเสธ = เจ็บ 2 ไม่สนเกราะ)
const CONTRACT_FEE = 4;        // ค่าต่อสัญญา (แต้มสกิล) ส่งกลับให้เจ้าแห่งเน็ตบ้าน
const CONTRACT_CYCLE = 3;      // ถามต่อสัญญาทุกๆ N เทิร์นของการใช้งาน
const CONTRACT_ARMOR_BONUS = 1; // คู่สัญญา: เพดานเกราะ +1 (ฟื้นให้ทันทีตอนตอบรับ) — patch 1.9.1 ลดจาก 3
const FIBER_CAP = 19;          // เสือนอนกิน: คู่สัญญาจั่วไม่แตก แต่แต้มไม่เกิน 19
// บัฟที่ "กระชากสายแลน" ถอดออกชั่วคราว 1 เทิร์น (คืนให้ตอนจบเทิร์น — เทิร์นถัดไปกลับมามีผลต่อ)
const UNPLUG_BUFFS = ["upg", "monster", "ginga", "gingastrium", "storium", "absorb", "beam", "paradise", "ohger", "rachan",
  "song", "golden", "spear", "seal", "veil", "chill", "awaken", "vortarmor", "fourth", "fiber", "tiger", "fresh",
  "fullassault", "bshield", // patch 2.1.2: บานาจ ลิงก์ — Full Assault / Absorb shield
  "phenexReflect", "phenexNtd"]; // patch 2.1.6: ริต้า เบอร์นัล — ฝันไปเถอะ / ฝืนใช้งาน NTD-Sytem

// คู่สัญญาของเจ้าแห่งเน็ตบ้านคนนี้ / เจ้าแห่งเน็ตบ้านที่ผู้เล่นคนนี้ทำสัญญาด้วย / บัฟคู่สัญญาทำงานอยู่ไหม
//  — ย้าย body ไป characters/broadband_man.js แล้ว (ดู CHAR_HOOKS.broadband_man)
// เลือดจริงสูงสุดของผู้เล่น — Locacaca fruit (ซาโตรุ patch 2.0.8.2) ลด Max HP ได้ (ต่ำสุด 1)
//  คิชินามิ ฮาคุโนะ (patch 2.2.1): เพดานเลือดจริงคงที่ตามเพศ (ไม่ใช้ MAX_HP ปกติ) — ชาย 6 / หญิง 5
function maxHpOf(p) {
  if (p && p.characterId === "hakuno") {
    const base = p.hakunoGender === "female" ? HAKUNO_FEMALE_MAX_HP : HAKUNO_MALE_MAX_HP;
    return Math.max(1, base - ((p.maxHpPenalty) || 0));
  }
  return Math.max(1, MAX_HP - ((p && p.maxHpPenalty) || 0));
}
// ฟื้นเลือดจริงแบบเคารพสถานะ "ไม่ใช้งานต่อ" / "ไร้ทางเยียวยา" — คืนจำนวนที่ฟื้นได้จริง
// เชื่อมผล (patch 2.0.8): การเพิ่ม HP ถูกแชร์ให้คู่เชื่อมเท่ากันด้วย
// ผกผัน (patch 2.2.1): การฟื้นเลือดกลับกลายเป็นเสียเลือดแทน (ไม่สนเกราะ)
function healHp(p, amount) {
  if (invertActive(p)) {
    dealDirect(p, amount);
    lastLog.push(`🔄 ${p.name} ผกผัน — พลังชีวิตที่ควรฟื้น +${amount} กลับกลายเป็นเสียพลังชีวิต -${amount} แทน (ไม่สนเกราะ)`);
    if (p.alive && p.hp <= 0) { instantDeath(p); if (!p.alive) lastLog.push(`💀 ${p.name} เลือดจริงหมด ตกรอบ!`); }
    return 0;
  }
  if (noHealActive(p)) return 0;
  const heal = Math.min(maxHpOf(p) - p.hp, amount);
  if (heal > 0) p.hp += heal;
  if (heal > 0 && !linkMirror) {
    const b = linkedBuddyOf(p) || CHAR_HOOKS.kai.kaiLinkedBuddyOf(engine, p);
    if (b) {
      linkMirror = true;
      const bh = healHp(b, heal);
      linkMirror = false;
      if (bh > 0) lastLog.push(`🔗 เชื่อมผล — ${b.name} ฟื้นพลังชีวิตตาม ${p.name} +${bh}`);
    }
  }
  return heal;
}
// ฟื้นเกราะแบบเคารพเพดาน — คืนจำนวนที่ฟื้นได้จริง
// เชื่อมผล (patch 2.1.1): การฟื้นเกราะถูกแชร์ให้คู่เชื่อมเท่ากันด้วย
// ผกผัน (patch 2.2.1): การฟื้นเกราะกลับกลายเป็นเสียเกราะแทน
function healArmor(p, amount) {
  if (invertActive(p)) {
    const lost = Math.max(0, Math.min(p.armor, amount));
    if (lost > 0) {
      p.armor -= lost;
      lastLog.push(`🔄 ${p.name} ผกผัน — เกราะที่ควรฟื้น +${amount} กลับกลายเป็นเสียเกราะ -${lost} แทน`);
    }
    return 0;
  }
  const heal = Math.max(0, Math.min(maxArmorOf(p) - p.armor, amount));
  if (heal > 0) p.armor += heal;
  if (heal > 0 && !linkMirror) {
    const b = linkedBuddyOf(p) || CHAR_HOOKS.kai.kaiLinkedBuddyOf(engine, p);
    if (b) {
      linkMirror = true;
      const bh = healArmor(b, heal);
      linkMirror = false;
      if (bh > 0) lastLog.push(`🔗 เชื่อมผล — ${b.name} ฟื้นเกราะตาม ${p.name} +${bh}`);
    }
  }
  return heal;
}

// ---------- ระบบกลางวัน/กลางคืน (patch 1.7 / ปรับเวลา+โบนัส patch 2.1.7) ----------
//  เริ่มเกมเป็นกลางวันเสมอ สลับทุก 5 เทิร์น: รอบ 1-5 กลางวัน, 6-10 กลางคืน, 11-15 กลางวัน, ...
//  จบเทิร์นกลางวัน = ทุกคนได้แต้มสกิลเพิ่ม +1 แต่แจกเฉพาะเช้าที่ 2, 4, 6, ... (เช้าที่ 1, 3, 5, ... ไม่มีโบนัส — ดู morningBonusActive)
//  กลางคืน = สุ่มสกิลพื้นฐาน/สกิลรองของแต่ละคนแพงขึ้น +1 ทุกเทิร์น (ดู nightTaxTier) — เกราะฟื้นทุก 2 เทิร์นเหมือนกันทั้งวัน/คืน
//  cycleShift: Lie Like Vortigern รีเซ็ตเวลากลางคืนให้เหลืออีก 5 เทิร์น — เลื่อนวงจรทั้งเกมไปข้างหน้า
const CYCLE_TURNS = 5;
let cycleShift = 0;
let nightResetPending = false; // ตั้งตอนกดท่าไม้ตาย 2 -> เริ่มนับกลางคืนใหม่ตั้งแต่เทิร์นถัดไป
// แสงสว่างที่สรรค์สร้าง (อควาเรียน patch 2.0): บังคับกลางวันจนถึงรอบที่กำหนด (เขียนทับวงจรปกติชั่วคราว)
let dayForceUntil = 0;
// เสียงไพเราะที่กึกก้อง (ชเรด เอลัน patch พิเศษ): ใช้ท่าไม้ตาย 1 -> รีเซ็ตกลางคืนใหม่ 3 เทิร์น (แบบ Vortigern)
//  และตราบใดที่มีชเรดร่างสปาด้ายังมีชีวิต ทุกค่ำคืน ฉากหลังจะเป็นราตรีของชเรด (change_fill.jpg)
function isNightRound(n) {
  // มิติมายาบรรเลง (Bard): โลหิต = นับเป็นตอนเช้า / วิญญาณ = นับเป็นตอนกลางคืน (อยู่เหนือทุกวงจร)
  const bardCycle = CHAR_HOOKS.bard.dimCycle(engine);
  if (bardCycle) return bardCycle === "night";
  if (n <= dayForceUntil) return false;
  const m = n - cycleShift;
  return m > 0 && Math.floor((m - 1) / CYCLE_TURNS) % 2 === 1;
}
// patch 2.1.7: เช้าที่กี่ (1 = เช้าแรกของเกม, 2 = เช้าที่สอง, ...) — ใช้กำหนดว่าเช้าไหนแจกแต้มสกิลโบนัส
function dayCycleIndex(n) {
  const m = n - cycleShift;
  const block = m > 0 ? Math.floor((m - 1) / CYCLE_TURNS) : 0;
  return Math.floor(block / 2) + 1;
}
// patch 2.1.7: แต้มสกิลโบนัสตอนเช้า — แจกเฉพาะเช้าที่ 2, 4, 6, ... (เช้าที่ 1, 3, 5, ... ไม่มีโบนัส)
function morningBonusActive(n) {
  const bardCycle = CHAR_HOOKS.bard.dimCycle(engine);
  if (bardCycle) return bardCycle === "day"; // มิติมายาบรรเลงอยู่เหนือทุกวงจร ไม่นับเช้าคู่/คี่
  if (n <= dayForceUntil) return true;       // บังคับกลางวันชั่วคราว (โอเบรอน) — ให้โบนัสตามปกติ
  if (isNightRound(n)) return false;
  return dayCycleIndex(n) % 2 === 0;
}

// ---------- ชเรด เอลัน (patch พิเศษ) ----------
const SHRADE_MELODY_MAX = 5;    // ท่วงทำนอง สะสมได้สูงสุด (ครบ 5 ถึงใช้ท่าไม้ตาย 1 ได้)
const SHRADE_BLAST_DMG = 8;     // แด่เพื่อนรักของฉัน: ความเสียหายใส่ทุกคนบนสนามเมื่อครบกำหนด (patch 2.0.8.4 — เพิ่มจาก 5)
const SHRADE_SPADA_IMG = "/characters/shrade_elan/profile/spada.webp"; // ร่างสปาด้า (ถาวร)
const SHRADE_SPADA_NAME = "อควาเรียน สปาด้า";
// กำลังชาร์จแด่เพื่อนรักของฉันอยู่ไหม (ชเรด เอลัน, characters/shrade_elan.js) — wrapper รอบ CHAR_HOOKS.shrade_elan.charging

// ---------- Bard : คีตกวี (patch 2.2) ----------
// "โลหิตคือทำนอง วิญญาณคือบทกวี และทุกชีวิตล้วนเป็นเพียงโน้ตตัวหนึ่งในบทเพลงอันนิรันด์"
const BARD_MAX_SKILL = 9;         // Crescendo: พลังงานสูงสุด 9 (ตัวอื่น 8)
const BARD_NOTES_PER_TURN = 2;    // จำกัด 2 โน้ตต่อเทิร์น (patch 2.0.5)
const BARD_DIM_NOTES_PER_TURN = 6; // ระหว่างมิติมายาบรรเลง (โลหิต/วิญญาณ patch 2.0.8): ไม่ติดลิมิต 2 — กดสกิลได้สูงสุด 6 ครั้งต่อเทิร์น
const BARD_NOTE_COST = 1;         // ค่าใช้พลังงานต่อโน้ต (patch 2.0.5 — ลดจาก 2)
const BARD_NOTE_FREE_CHANCE = 0.15; // โอกาส 15% ที่จะไม่เสียพลังงานเมื่อใช้โน้ต (patch 2.0.6 — ลดจาก 20%)
const BARD_DIM_FORTUNE = 1;         // มิติมายาบรรเลง (patch 2.0.8): คีตกวีได้โชคลาภ 1 ครั้ง (ทั้งสองมิติ)
const BARD_DIM_EVADE = 1;           // มิติมายาบรรเลง (patch 2.0.8): คีตกวีได้หลบหลีก 1 ครั้ง (ทั้งสองมิติ)
const BARD_DIM_RESIST_TURNS = 3;    // มิติมายาบรรเลง (patch 2.0.8): คีตกวีได้ต้านสถานะผิดปกติ 3 เทิร์น
const BARD_BLOOD_FRAGILE = 1;       // มิติโลหิต (patch 2.0.8): ทุกคน (ยกเว้นคีตกวี) ติดเปราะบาง +1 ดาเมจ 3 เทิร์น
const BARD_FORTUNE_MAX = 3;         // โชคลาภ ซ้อนทับได้สูงสุด 3 ครั้ง (patch 2.0.6.1)
// โชคลาภ (patch 2.2 new — ปรับใหม่): จั่วปุ๊ป ถ้ามีบัฟสะสมอยู่ ใช้ 1 หน่วยทันทีแล้วหายไป
//  ปรับไพ่ที่จั่วให้แต้มรวมตกอยู่ 19-21 (ดู fortuneTargetList) — ไม่มีเงื่อนไขโอกาส/แต้มเริ่มต้นแล้ว
const BARD_SOUL_TARGETS = 2;        // มิติวิญญาณ: ทุกการบรรเลง ตีสุ่มผู้เล่น 2 คน (patch 2.0.6 — เดิมตีทุกคน)
const BARD_SECTION_MAX = 5;       // ท่อนทำนองสะสมครบ 5 ชั้น -> เปิดมิติมายาบรรเลง
const BARD_DIM_TURNS = 3;         // มิติมายาบรรเลงคงอยู่ 3 เทิร์น
const BARD_SOUL_PERFORM_DMG = 1;  // มิติวิญญาณ (patch 2.0.5): ทุกการบรรเลง Bard ตีทุกคน 1 หน่วย
const BARD_PROFILE_IMG = "/characters/bard/bard_new.jpg"; // patch 2.1.1: เปลี่ยนรูปประจำตัวคีตกวี
const BARD_CRIMSON_IMG = "/characters/bard/bard_crimson.png";
const BARD_JADE_IMG = "/characters/bard/bard_jade.png";
// บทเพลงทั้ง 8 (R = ❤️ Crimson, J = 💚 Jade) — need = จำนวนเป้าหมาย, allowSelf = เลือกตัวเองได้
// (patch 2.0.5: สลับผังบทเพลงใหม่ — สายเพลงนับจากโน้ตเสียงข้างมาก)
const BARD_SONGS = {
  RRR: { name: "Encore", song: "crimson", need: 1, allowSelf: true },           // หลบหลีก +100% โดนโจมตี 1 ครั้งถัดไป
  RRJ: { name: "Silent Cadence", song: "crimson", need: 1, allowSelf: false },  // ใบ้สกิล 1 เทิร์น + ขโมยพลังงาน 1
  RJR: { name: "Fate's Prelude", song: "crimson", need: 1, allowSelf: true },   // โชคลาภในการจั่วครั้งถัดไป
  JRR: { name: "Rejuvenation", song: "crimson", need: 1, allowSelf: true },     // HP +1 / เกราะ +1 / พลังงาน +1
  JJJ: { name: "Sanctuary Hymn", song: "jade", need: 1, allowSelf: true },      // ต้านสถานะผิดปกติ 3 เทิร์น
  JJR: { name: "Resonance", song: "jade", need: 2, allowSelf: true },           // เชื่อมผล 3 เทิร์น
  JRJ: { name: "Discord", song: "jade", need: 1, allowSelf: false },            // ขัดแย้ง +1 ดาเมจ 3 เทิร์น
  RJJ: { name: "Harmony", song: "jade", need: 1, allowSelf: true },             // คุ้มครอง -1 ดาเมจ 3 เทิร์น
};
// พลังงานสูงสุดของผู้เล่น (Bard = 9)
function maxSkillOf(p) {
  return (p && p.characterId === "bard") ? BARD_MAX_SKILL : MAX_SKILL;
}
// มิติมายาบรรเลงที่เปิดอยู่บนสนาม: "day" (โลหิต) | "night" (วิญญาณ) | null — ย้าย body ไป characters/bard.js

// ============================================================
//  บัฟ & ดีบัฟพื้นฐาน (universal) — ย้าย body ไป characters/_universal_status.js แล้ว
//  (resistActive/applyDebuff/applyBuff/statusAmtOf/cleanseDebuffs/noHealActive/invertActive/
//   SPELLBURDEN_MAX/BASIC_DEBUFF_CLEAR/SOFT_DEBUFF_STEP — require() ไว้ด้านบนไฟล์นี้แล้ว)
// ============================================================
// เชื่อมผล (linked): คู่เชื่อมที่ยังมีผลอยู่ทั้งสองฝั่ง (การเพิ่ม-ลด HP แชร์เท่ากัน)
let linkMirror = false; // กันสะท้อนวนไม่รู้จบระหว่างคู่เชื่อม
function linkedBuddyOf(p) {
  if (!p || ((p.statuses && p.statuses.linked) || 0) <= 0 || !p.linkedWith) return null;
  const b = players[p.linkedWith];
  return (b && b.alive && b.id !== p.id && (b.statuses.linked || 0) > 0) ? b : null;
}
// ---------- ไค ชิซากิ (kai) ----------
//  "เชื่อมต่อ" (kaiLink) — โค้ดแยกอิสระจาก linkedBuddyOf ของ Bard ข้างบนโดยสิ้นเชิง (ดู characters/kai.js)
//  kaiOverhaulSlots: เกมมีห้องเดียว ไม่มีระบบ multi-room (grep แล้วไม่พบ rooms[) — module-level array
//  [{ playerId, status: "kaiCreation"|"kaiPunishment" }] สูงสุด 2 — ครบ 2 = ปลดล็อกปุ่ม Overhaul
let kaiOverhaulSlots = [];
// ---------- เรียวกิ ชิกิ (patch 2.0.5 / rework 2.0.6) ----------
// ค่าคงที่ของชิกิเองส่วนใหญ่ย้ายไปอยู่ characters/shiki.js แล้ว — เหลือแค่ที่ shared infra ในไฟล์นี้ยังใช้อยู่
const SHIKI_DEATHLINE_MAX = 6;   // เส้นชีวิตสะสมถึง 6 -> โจมตีปกติระหว่างท่าไม้ตาย 1 = สังหารทันที (ใช้เป็น gate ก่อนเรียก CHAR_HOOKS.shiki)
const SHIKI_WITHER_PASSIVE_CAP = 2; // โหมดท่าไม้ตาย 2: สกิลติดตัว/สกิลรอง ให้เส้นชีวิตได้สูงสุด 2 หน่วย (ใช้ใน shikiGiveLifeline — shared กับ tepeu/phenex)
const SHIKI_WITHER_ATK_CAP = 5;  // ความตายที่โรยรา: เส้นชีวิตแปรเป็นดาเมจเสริมการโจมตีปกติ — พลังโจมตีรวมสูงสุด 5 ต่อครั้ง (คำนวณใน doAttack()'s shared damage-sum — นอกขอบเขต Phase 1)
const SHIKI_PROFILE_IMG = "/characters/shiki/shiki.jpg";
const SHIKI_DEATH_IMG = "/characters/shiki/shiki_death.jpg"; // ร่างระหว่างท่าไม้ตาย ฉันมองเห็นมันแล้ว
const SHIKI_WITHER_IMG = "/characters/shiki/shiki2.jpg";     // ร่างระหว่างท่าไม้ตาย 2 ความตายที่โรยรา
// ---------- โทโนะ ชิกิ (patch 2.1.7) ----------
// ค่าคงที่/logic ส่วนใหญ่ย้ายไปอยู่ characters/tohno.js แล้ว — เหลือแค่ภาพที่โค้ดส่วนกลาง (TRANSFORMS/displayImg) ยังใช้อยู่
const TOHNO_DEATH_IMG = CHAR_HOOKS.tohno.DEATH_IMG; // ร่างระหว่างสกิลติดตัวเปิดใช้งาน (ระดับ 2 ขึ้นไป)
// ---------- นานายะ ชิกิ (patch 2.1.9) ----------
// ค่าคงที่/logic ทั้งหมดย้ายไปอยู่ characters/nanaya.js แล้ว
// สกิลติดตัวถูก "อันนี้ของนายรึเปล่า" หรือ MOON*CELL (คิชินามิ ฮาคุโนะ) ปิดใช้งานอยู่ไหม
//  (ใช้เช็คก่อนให้สกิลติดตัวของตัวละครอื่นทำงาน — MOON*CELL มีผลกับทุกคนยกเว้นเจ้าของท่าเอง)
function passiveSealed(p) {
  if (!p) return false;
  if (moonCellActive() && !((p.statuses && p.statuses.moonCell) > 0)) return true;
  return ((p.statuses && p.statuses.nanayaSeal) || 0) > 0;
}
// ---------- อาริมะ มิยาโกะ (patch 2.2.0) ----------
// ค่าคงที่ของมิยาโกะส่วนใหญ่ย้ายไปอยู่ characters/miyako.js แล้ว — เหลือแค่ที่ shared infra ในไฟล์นี้ยังใช้อยู่
const MIYAKO_KILL_REDUCE = 0.40;      // นั่นพี่จ๋าหรอ?: ลดโอกาสถูกสังหารทันทีลง 40% ทุกครั้งที่รอด (สะสม — ใช้ใน miyakoKillChance shared infra)
// ความสามารถสังหารทันทีถูก "หนูจะทำให้พี่ตาสว่างเอง" ปิดใช้งานอยู่ไหม (อาริมะ มิยาโกะ)
function killSealed(p) {
  return !!p && ((p.statuses && p.statuses.miyakoSeal) || 0) > 0;
}
// ตัวละครนี้ "มี" ความสามารถสังหารทันทีติดตัวไหม (โทโนะ ชิกิ / นานายะ ชิกิ: นับแม้กำลังปิดสกิลติดตัวไว้อยู่ — ป้องกันเปิดกลับมาใช้ทีหลัง
//  หลังโดนปิดใช้งานจากหนูจะทำให้พี่ตาสว่างเอง / เรียวกิ ชิกิ: ต้องมีท่าไม้ตายสังหารทันทีเปิดใช้งานอยู่จริงเท่านั้น เพราะเป็นทรัพยากรที่ต้องเสียแต้มเปิดใหม่)
function hasKillCapability(p) {
  if (!p || !p.alive) return false;
  if (p.characterId === "tohno") return true;
  if (p.characterId === "nanaya") return true;
  if (p.characterId === "shiki" && (((p.statuses.deatheye || 0) > 0) || ((p.statuses.wither || 0) > 0))) return true;
  return false;
}
// Apple guy: หลบหลีกสำเร็จระหว่างชิวๆครับน้องๆ สามารถรอดพ้นจากสกิลประเภท "สังหารทันที" ได้ด้วย
//  (universal-dispatcher wrapper — ตรรกะจริงอยู่ characters/appleguy.js — ตัวละครสังหารทันทีอื่นเรียกผ่าน engine.appleGuyDodgesKill)
function appleGuyDodgesKill(attacker, target) {
  return CHAR_HOOKS.appleguy.tryDodgeKill(engine, attacker, target);
}
// นั่นพี่จ๋าหรอ? (สกิลติดตัว): ลดโอกาสถูกสังหารทันทีของอาริมะ มิยาโกะ ตามจำนวนครั้งที่เคยรอด (สะสม 40%/ครั้ง)
function miyakoKillChance(target, baseChance) {
  if (!target || target.characterId !== "miyako") return baseChance;
  const resist = target.miyakoKillResist || 0;
  return Math.max(0, baseChance * (1 - MIYAKO_KILL_REDUCE * resist));
}
// เรียกเมื่ออาริมะ มิยาโกะ รอดจากการถูกสังหารทันที (การสังหารพลาด/ไม่เกิดขึ้น) — สะสมสกิลติดตัวเพิ่ม +1 ชั้น เสียพลังชีวิต 1 หน่วยไม่สนเกราะ
function miyakoSurvivedKillAttempt(target) {
  if (!target || target.characterId !== "miyako" || !target.alive) return;
  target.miyakoKillResist = (target.miyakoKillResist || 0) + 1;
  lastLog.push(`🥊 ${target.name} นั่นพี่จ๋าหรอ? — รอดจากการถูกสังหารทันที! โอกาสถูกสังหารทันทีในอนาคตลดลงอีก 40% (สะสม ${target.miyakoKillResist} ชั้น) เสียพลังชีวิต 1 หน่วย (ไม่สนเกราะ)`);
  dealDirect(target, 1);
  if (target.alive && target.hp <= 0) { instantDeath(target); if (!target.alive) lastLog.push(`💀 ${target.name} เลือดจริงหมด ตกรอบ!`); }
}
// ---------- คิชินามิ ฮาคุโนะ (patch 2.2.1) ----------
// ค่าคงที่ของฮาคุโนะส่วนใหญ่ย้ายไปอยู่ characters/hakuno.js แล้ว — เหลือแค่ที่ shared infra ในไฟล์นี้ยังใช้อยู่
const HAKUNO_MALE_ARMOR_CAP = 4;      // ร่างชาย: เพดานเกราะคงที่ 4 หน่วย (maxArmorOf)
const HAKUNO_FEMALE_ARMOR_CAP = 5;    // ร่างหญิง: เพดานเกราะคงที่ 5 หน่วย (maxArmorOf)
const HAKUNO_MALE_MAX_HP = 6;         // ร่างชาย: เพดานเลือดจริงคงที่ 6 หน่วย (maxHpOf)
const HAKUNO_FEMALE_MAX_HP = 5;       // ร่างหญิง: เพดานเลือดจริงคงที่ 5 หน่วย (maxHpOf)
const HAKUNO_NORECOVER_TURNS = 3;     // ข้าขอบัญชา (หญิง) / MOON*CELL: ติดไร้ทางเยียวยา 3 เทิร์น (ใช้ใน MOON*CELL-end restore loop ที่ยังอยู่ server.js)
const HAKUNO_DRAW_LOW_VALUES = [2, 3]; // ข้าขอบัญชา (หญิง): จั่วเพิ่มระหว่างนี้ได้แค่ 2 หรือ 3 แต้ม (drawCardFor)
const HAKUNO_MOONCELL_NEED = 3;       // MOON*CELL: ต้องมีแต้มคำสาปแห่งดวงจันทร์ครบ 3 ต่อการเปิด 1 ครั้ง (useSkill's gate)
const HAKUNO_COMMAND_USES = 3;        // อาคมบัญชาระดับ EX+: ใช้ได้ 3 ครั้งต่อเกม (player factory + buildStateFor)
// สกิลติดตัว/ท่าไม้ตายถูก MOON*CELL ปิดใช้งานอยู่ไหม (มีผลกับทุกคนยกเว้นฮาคุโนะเจ้าของท่า)
function moonCellActive() {
  return Object.values(players).some((pp) => (pp.statuses && pp.statuses.moonCell) > 0);
}
// ทาคุมิ ฟุจิวาระ: ถึงจะมองไม่เห็น แต่ฉันยังอยู่ — ท่าไม้ตายทำงานอยู่ไหม (บังตากระดานทั้งหมด — แบบเดียวกับ moonCellActive)
function takumiBlackoutActive() {
  return Object.values(players).some((pp) => (pp.statuses && pp.statuses.takumiBlackout) > 0);
}
// DoomGuy: มี [ระเบิด]/[ล็อคเป้า] ค้างอยู่บนใครสักคนไหม (Combat Shotgun/Heavy Cannon) — ค้างอยู่ระหว่างนี้กด Quick Swap สุ่มปืนใหม่ไม่ได้ จนกว่าจะโดนใช้ (โดนโจมตี)
function doomWeaponMarkPending() {
  return Object.values(players).some((pp) => (pp.statuses && (pp.statuses.doomExplode > 0 || pp.statuses.doomLockon > 0)));
}
// ยูนะ — Break Beat Bark! ทำงานอยู่ไหม (บัฟทั้งสนาม ไม่ใช่สถานะผู้เล่นคนเดียว เหมือน moonCellActive)
function yunaBeatBarkActive() {
  return yunaEffect === "beatbark" && roundNumber <= yunaWindowEnd;
}
// ท่าไม้ตายที่ยกเลิกย้อนหลังได้ (เจ้าของท่ามาตีชิกิระหว่างถือชาร์จ) — สถานะท่าไม้ตายที่กำลังมีผลอยู่
const SHIKI_CANCELABLE_ULTS = ["gingastrium", "rachan", "paradise", "golden", "fourth", "chill",
  "kawaii", "lai", "vortigern", "deatheye", "wither", "shradecharge",
  "anata",                  // patch 2.0.8: เพิ่ม ANATA WAAAAAAAA (เทมาริ) — ครอบคลุมท่าไม้ตายทุกตัวละครที่เก็บเป็นสถานะ
  "bloodDim", "soulDim",    // patch 2.0.8.1: มิติมายาบรรเลงทั้งสอง (คีตกวี) นับเป็นท่าไม้ตาย — ยกเลิกย้อนหลังได้
  "victorybeat", "ashen",   // patch 2.0.8.1: ท่าไม้ตายโอกูริ แคป ทั้งสองท่า
  "riddhentd", "riddheguard", // patch 2.0.9: ท่าไม้ตายริดดี้ มาร์เซนาส ทั้งสองท่า
  "phenexNtd", "phenexTaunt"]; // patch 2.1.6: ท่าไม้ตายริต้า เบอร์นัล ทั้งสองท่า
// ชื่อท่าไม้ตายจาก status (ใช้ตอนยกเลิกย้อนหลัง — บางท่าไม่มีใน TRANSFORMS/ข้อมูลสกิล)
function shikiUltNameOf(p, key) {
  if (key === "shradecharge") return "แด่เพื่อนรักของฉัน";
  if (key === "wither") return "ความตายที่โรยรา";
  if (key === "deatheye") return "ฉันมองเห็นมันแล้ว";
  if (key === "chill") return "ชิวๆครับน้องๆ";
  if (key === "bloodDim") return "มิติมายาบรรเลงโลหิต";
  if (key === "soulDim") return "มิติมายาบรรเลงวิญญาณ";
  if (key === "ashen") return "Ashen Trail: Cinderella Gray";
  if (key === "riddhentd") return "แกไม่มีสิทธิ์มาสั่งสอนฉัน";
  if (key === "riddheguard") return "ฉันจะไม่ยอมสูญเสียใครไปอีก";
  const t = TRANSFORMS[key];
  if (t && t.title) return t.title;
  const s = skillByStatus(p, key);
  return s ? s.name : key;
}
// จบความตายที่โรยรา (สังหารสำเร็จ/หมดเวลา/ถูกยกเลิก): ลบเส้นชีวิตส่วนที่ท่าไม้ตายแจกไปออกจากทุกคน
function clearWitherLines() {
  for (const o of Object.values(players)) {
    const added = o.witherAdded || 0;
    if (added > 0) {
      const cur = o.statuses.deathline || 0;
      const next = Math.max(0, cur - added);
      if (next > 0) o.statuses.deathline = next;
      else delete o.statuses.deathline;
    }
    o.witherAdded = 0;
  }
}
// มอบเส้นชีวิตจากสกิลติดตัว/สกิลรอง (โหมดท่าไม้ตาย 2: +1/ครั้ง และแหล่งปกติให้ได้ไม่เกิน 3)
function shikiGiveLifeline(shiki, target, amount) {
  if (resistActive(target)) return 0; // ต้านสถานะผิดปกติ: ไม่ได้เส้นชีวิตเพิ่ม (สแตคเดิมที่มีอยู่ก่อนหน้าไม่หาย)
  const cur = target.statuses.deathline || 0;
  if ((shiki.shikiUlt || "deatheye") === "wither") {
    if (cur >= SHIKI_WITHER_PASSIVE_CAP) return 0;
    const next = Math.min(SHIKI_WITHER_PASSIVE_CAP, cur + 1);
    target.statuses.deathline = next;
    return next - cur;
  }
  target.statuses.deathline = cur + amount;
  return amount;
}
// เทเปา: นายเป็นคนทำตัวเองนะ — ตรรกะย้ายไปอยู่ characters/tepeu.js ทั้งหมดแล้ว (ดู resolveAllKills)

// ---------- โอกูริ แคป (patch 2.0.8.1) ----------
//  ระบบ Stamina: เริ่มเกมได้ 8 แต้ม (สะสมสูงสุด 16) — ใช้เป็นทรัพยากรของสกิลรอง/ท่าไม้ตาย
//  ยุคทอง (goldenera): พลังโจมตี +1 / เพดานเกราะ +1 — สะสม 2 แต้ม อยู่ 3 เทิร์น หายเมื่อฝึกฝนล้มเหลว
//  ครบ 2 แต้ม -> เข้าร่าง Zone (GrayBeast: Stamina +1/เทิร์น, แต้มสกิล +1 ทุก 2 เทิร์น)
//  Stamina หมด + ไม่มียุคทอง -> ร่างหมดแรง (Burnout: ใช้ได้แค่ A Big Meal)
// ---------- โอกูริ แคป (Rework): Energy (ทรัพยากรของสกิล) + Stamina ชาร์จ (ทรัพยากรท่าไม้ตาย แยกกัน) ----------
const OGURI_ENERGY_START = 8;      // Energy: เริ่มเกมได้รับ 8 แต้ม
const OGURI_ENERGY_MAX = 16;       // Energy สะสมสูงสุด
const OGURI_CHARGE_BASE_CAP = 52;  // Stamina ชาร์จ: ความจุพื้นฐาน
const OGURI_CHARGE_CAP_MAX_BONUS = 48; // Training: เพิ่มความจุได้สูงสุดสะสม +48 (รวมเพดานสูงสุด 100)
const OGURI_CHARGE_GAIN_MIN = 6;   // Stamina ชาร์จ: ได้รับทุกเทิร์น 6-12 หน่วย (สุ่ม) — Rework: เดิม 8-16 (ค่าจริงที่ใช้คำนวณอยู่ใน characters/oguri.js)
const OGURI_CHARGE_GAIN_MAX = 12;
const OGURI_GOLD_MAX = 3;          // ยุคทอง สะสมสูงสุด (Rework: เดิม 2 -> 3)
const OGURI_GOLD_TURNS = 6;        // ยุคทอง อยู่ 6 เทิร์น (รีเฟรชเมื่อได้แต้มใหม่)
const OGURI_GOLD_ATK_PER = 1;      // ยุคทอง: พลังโจมตีพื้นฐาน +1 ทุกๆแต้มที่ติดอยู่บนตัว
const OGURI_GOLD_ATK_CAP = 2;      // ยุคทอง: พลังโจมตีบวกได้ไม่เกิน 2 หน่วย (Rework)
const OGURI_GOLD_ARMOR_AT = 2;     // ยุคทอง: ครบ 2 แต้มขึ้นไป ได้เพดานเกราะ +1 (Rework — เดิมแค่มียุคทองก็ได้แล้ว)
const OGURI_GRAYBEAST_SP_TURNS = 2; // GrayBeast: แต้มสกิล +1 ทุก 2 เทิร์น (Energy +1 ได้ทุกเทิร์น)
const OGURI_BURNOUT_TURNS = 2;     // Burnout: คงอยู่ 2 เทิร์น (ไม่ใช่ถาวรแบบเดิมแล้ว)
const OGURI_BURNOUT_ENERGY_PENALTY = 2; // Burnout: Breakfast ได้ Energy ลดลง -2
const OGURI_BURNOUT_DECAY_TURNS = 2; // Burnout: มอบสถานะผุพัง 2 เทิร์น
const OGURI_BREAKFAST_HEAL = 1;    // Breakfast: ฟื้นเลือด 1
const OGURI_BREAKFAST_ENERGY = 4;  // Breakfast: Energy +4 ปกติ (Burnout ลดเหลือ +2)
const OGURI_TRAIN_ENERGY_COST = 4; // Training: หัก Energy 4 (เดิมหัก Stamina)
const OGURI_TRAIN_CAP_GAIN_MIN = 3; // Training: เพิ่มความจุ Stamina ชาร์จ 3-7 หน่วย (สุ่ม) — Rework: เดิม 4-8 (ค่าจริงที่ใช้คำนวณอยู่ใน characters/oguri.js)
const OGURI_TRAIN_CAP_GAIN_MAX = 7;
const OGURI_TRAIN_BASE = 0.6;      // โอกาสฝึกฝนสำเร็จพื้นฐาน 60%
const OGURI_TRAIN_BONUS_RATE = 0.8; // บัฟ Bonus ทำงานอยู่: โอกาสสำเร็จเพิ่มเป็น 80%
const OGURI_TRAIN_FAIL_DMG = 1;    // ฝึกฝนล้มเหลว: ดาเมจ 1 หน่วยไม่สนเกราะ
const OGURI_TRAIN_EXTRA_ROLL = 0.25; // ฝึกฝนสำเร็จ: โอกาส 25% ได้บัฟเสริมเพิ่มอีก 1 อัน
const OGURI_TRAIN_FLOW_W = 0.40;   // บัฟเสริม 3 แบบ (สุ่มถ่วงน้ำหนัก): Flow 40%
const OGURI_TRAIN_BONUS_W = 0.40;  // Bonus 40%
const OGURI_TRAIN_SUNNY_W = 0.20;  // Sunny Day 20%
const OGURI_FLOW_TURNS = 3;        // Flow: อยู่ 3 เทิร์น หรือจนกว่าจะถูกโจมตี
const OGURI_FLOW_DODGE = 0.5;      // Flow: โอกาสหลบการโจมตี 50%
const OGURI_BONUS_TURNS = 3;       // Bonus: อยู่ 3 เทิร์น
const OGURI_SUNNY_TURNS = 3;       // Sunny Day: อยู่ 3 เทิร์น
const OGURI_SUNNY_FORTUNE = 1;     // Sunny Day: ได้โชคลาภ +1 ทุกเทิร์นที่มีบัฟนี้
const OGURI_ULT_CHARGE_COST = 35;  // The Beat of Victory: Stamina ชาร์จ 35
const OGURI_ULT_ATK_BONUS = 2;     // ชนะ: พลังโจมตีพื้นฐาน +2 (ซ้อนทับกับยุคทองได้)
const OGURI_ULT_NOREGEN_TURNS = 2; // เป้าหมาย: เกินเยียวยา 2 เทิร์น
const OGURI_ULT_STAGGER_TURNS = 2; // เป้าหมาย: ชะงัก 2 เทิร์น (ฟื้นฟูแต้มสกิลไม่ได้)
const OGURI_ULT2_CHARGE_COST = 80; // Ashen Trail: Stamina ชาร์จ 80 (ต้องมียุคทองครบด้วย) — Rework: เดิม 75
const OGURI_ASHEN_DRAWS = 2;     // Ashen Trail: บังคับทุกคนจั่วเพิ่ม 2 ใบ
const OGURI_ASHEN_DMG = 2;       // Ashen Trail: โจมตีทุกคนที่ไพ่แตกหลังเปิดไพ่
const OGURI_ASHEN_CARD_BONUS = 8; // Ashen Trail: คู่ต่อสู้ทุกคนบวกแต้มการ์ด +8
const OGURI_ZONE_IMG = "/characters/oguri/zone_form.jpg";
// แต้มยุคทองปัจจุบัน (เก็บจำนวนใน statusAmt คู่กับเวลาใน statuses)
function oguriGoldStacks(p) {
  return ((p.statuses && p.statuses.goldenera) || 0) > 0 ? ((p.statusAmt && p.statusAmt.goldenera) || 0) : 0;
}
// ความจุ Stamina ชาร์จปัจจุบัน (พื้นฐาน 52 + ที่เพิ่มจาก Training สะสมสูงสุด +48 = เพดาน 100)
function oguriChargeCapOf(p) {
  return OGURI_CHARGE_BASE_CAP + Math.min(OGURI_CHARGE_CAP_MAX_BONUS, p.oguriChargeCapBonus || 0);
}
// ยุคทองครบ + Stamina ชาร์จพอ -> ปลดล็อกท่าไม้ตาย 2 Ashen Trail แทนท่าไม้ตาย 1
function oguriAshenReady(p) {
  return oguriGoldStacks(p) >= OGURI_GOLD_MAX && (p.stamina || 0) >= OGURI_ULT2_CHARGE_COST;
}
// เพิ่ม/ลด Energy (0..16) — ทรัพยากรของ Breakfast/Training/GrayBeast
function oguriAddEnergy(p, n) {
  p.oguriEnergy = Math.max(0, Math.min(OGURI_ENERGY_MAX, (p.oguriEnergy || 0) + n));
}
// เพิ่ม/ลด Stamina ชาร์จ (0..ความจุปัจจุบัน) — ทรัพยากรของท่าไม้ตาย ได้รับอัตโนมัติทุกเทิร์น
function oguriAddCharge(p, n) {
  p.stamina = Math.max(0, Math.min(oguriChargeCapOf(p), (p.stamina || 0) + n));
}

// ---------- ซาโตรุ อาเคฟุ (universal-wrapper — ตรรกะจริงอยู่ characters/satoru.js) ----------
//  satoruOnTargeted() ถูกเรียกจากตัวละครอื่นแทบทุกตัวในเกม (engine.satoruOnTargeted) ก่อนใส่ผลสกิล/
//  ดาเมจใส่เป้าหมาย เพื่อให้สกิลติดตัวซาโตรุทำงานได้แม้ผู้เรียกไม่รู้จักซาโตรุเลย — ห้ามลบ wrapper นี้
const SATORU_PROFILE_IMG = "/characters/satoru/satoru.jpg";
function satoruOnTargeted(t, by, what) {
  if (!t || t.characterId !== "satoru") return { negated: false };
  return CHAR_HOOKS.satoru.onTargeted(engine, t, by, what);
}

// ---------- ริดดี้ มาร์เซนาส (patch 2.0.9) ----------
// ตรรกะ/ค่าคงที่ส่วนใหญ่ย้ายไปอยู่ characters/riddhe.js แล้ว — เหลือแค่ที่ shared infra (maxArmorOf/displayImg/
// buildStateFor/TRANSFORMS/socket-handler ข้อเสนอพันธมิตร) ในไฟล์นี้ยังใช้อยู่
const RIDDHE_ABSORB_ARMOR = 2;     // Absorb Shield: เพดานเกราะ + ฟื้นชั่วคราว +2 (maxArmorOf — มีสำเนาใน riddhe.js สำหรับ log)
const RIDDHE_BANSHEE_IMG = "/characters/riddhe/profile/banshee.png";   // ภาพปกเริ่มเกม (ค่าเริ่มต้น)
const RIDDHE_NTD_IMG = "/characters/riddhe/profile/banshee_ntd.png";   // ระหว่าง NT-D (ท่าไม้ตาย 1)
const RIDDHE_NTD2_IMG = "/characters/riddhe/profile/banshee_ntd2.jpg"; // ระหว่างท่าไม้ตาย 2 / หลังสกิลติดตัว 3 (ถาวร)
// ---------- ริต้า เบอร์นัล / ฟีนิกซ์ (patch 2.1.6) ----------
// ค่าคงที่ของฟีนิกซ์ส่วนใหญ่ย้ายไปอยู่ characters/phenex.js แล้ว — เหลือแค่ที่ shared infra ในไฟล์นี้ยังใช้อยู่
const PHENEX_BAN_ULT_TURNS = 3;   // อย่าอยู่เลย แกน่ะ!: ไม่มีท่าไม้ตายให้ลบ -> แบนท่าไม้ตายเป้าหมาย 3 เทิร์นแทน (purge resolution — ยังอยู่ server.js เพราะเรียก shiki's shared infra)
const PHENEX_BASE_IMG = "/characters/rita/profile/phenex.png";     // ภาพเริ่มเกม (ลงสนามแล้ว) ปกติ (displayImg/TRANSFORMS)
const PHENEX_NTD_IMG = "/characters/rita/profile/phenex_ntd.png";  // ระหว่างฝืนใช้งาน NTD-Sytem (displayImg/TRANSFORMS/fx)
// คู่พันธมิตรที่ยังมีผลอยู่ (characters/riddhe.js — wrapper รอบ CHAR_HOOKS.riddhe.allied)
function riddheAllied(p) {
  return CHAR_HOOKS.riddhe.allied(engine, p);
}
// กันตาย (ท่าไม้ตาย 2, characters/riddhe.js) — wrapper รอบ CHAR_HOOKS.riddhe.guardProtects
// ยกเลิกพันธมิตร (characters/riddhe.js) — wrapper รอบ CHAR_HOOKS.riddhe.breakAlliance


// ร่างกลางวัน/กลางคืนของโอเบรอน (สลับอัตโนมัติตามช่วงเวลา)
const OBERON_MORNING_IMG = "/characters/oberon/oberon_morning.jpg";
const OBERON_NIGHT_IMG = "/characters/oberon/oberon_night.jpg";

// รูปร่างโอเจอร์ (ใช้ทั้งท่าไม้ตายสวมเกราะราชัน และ Beat Mode)
const OHGER_FORM = "/characters/kuwagata/kuwakata_ohger_form.jpg";

// การแปลงร่าง/cutscene ต่อสถานะ — ตาราง data ล้วนๆ ~160 บรรทัด ย้ายไป characters/_transforms.js แล้ว
//  (factory function รับ path รูปที่ server.js ใช้ร่วมกับที่อื่นด้วย กันประกาศ path ซ้ำสองที่)
const TRANSFORMS = require("./characters/_transforms")({
  HIKARU_STRIUM_IMG, OBERON_NIGHT_IMG, OBERON_MORNING_IMG, SHRADE_SPADA_IMG, BARD_PROFILE_IMG,
  SHIKI_DEATH_IMG, SHIKI_PROFILE_IMG, SHIKI_WITHER_IMG, TOHNO_DEATH_IMG, OGURI_ZONE_IMG,
  RIDDHE_BANSHEE_IMG, RIDDHE_NTD_IMG, RIDDHE_NTD2_IMG, PHENEX_NTD_IMG, PHENEX_BASE_IMG, OHGER_FORM,
});


// ---------- สถานะเกมส่วนกลาง ----------
let players = {};
let gameState = "LOBBY"; // LOBBY | PLAYING | CUTSCENE | SUMMARY | ATTACK | TRANSITION | GAMEOVER
let timeLeft = 0;
let phaseTimerId = null;
let attackerId = null;
let roundWinnerId = null;
let roundTiedWin = false;  // ผู้ชนะได้จากการเสมอแต้ม -> ไม่มีเทิร์นโจมตีรอบนี้
let roundNumber = 0;
let centralDeck = []; // กองกลาง 43 ใบ (สับใหม่ทุกรอบใน dealRound())
let lastLog = [];
let reservations = {};
// playerId is independent from socket.id so a reconnect can reclaim the same player.
const sessions = new Map();          // sessionToken -> playerId
const socketPlayerIds = new Map();   // socket.id -> playerId
const disconnectTimers = new Map();  // playerId -> timeout
const reservationTimers = new Map(); // socket.id -> timeout
let cutsceneQueue = [];
let cutsceneInfo = null;
let cutsceneSeq = 0;      // id ต่อ cutscene (ให้ client remount วีดีโอ กันจอดำ)
let attackSeq = 0;        // id ต่อ lastAttack (ให้ client remount ฉากโจมตี กันแอนิเมชันไม่เล่นซ้ำเวลาตี/เป้าหมาย/ดาเมจซ้ำกัน)
let transformCounter = 0; // ลำดับการเปิดร่าง (ใช้เลือกเพลงตอนสวนท่ากัน)
let anataMusicSeq = 0;    // เพลง ANATA WAAAAAAAA เล่นระหว่างช่วงจั่วการ์ด จบเมื่อทุกคนเปิดไพ่
let oberonDevour = 0;     // ราตรีกลืนกิน: เปิดเมื่อโอเบรอนใช้ท่าไม้ตาย 2 (Vortigern) — หายไปเมื่อหมดกลางคืน (0 = ปิด)
let lastAttack = null;    // ข้อมูลการโจมตีล่าสุด (อนิเมชันใครตีใคร)
let roundSkills = [];     // สกิลที่ใช้ในรอบ (เก็บประวัติ — instant เด้งตอนใช้ / หลังเปิดไพ่โชว์ตอนโจมตี)
let allyWinFlag = false;  // ริดดี้ (patch 2.0.9): จบเกมแบบชนะทั้งคู่ (คงพันธมิตรตอนเหลือแค่คู่พันธมิตร)
let shopItems = [];       // ร้านค้ามายา (patch 2.2 full): สินค้าส่วนกลางของรอบปัจจุบัน (สูงสุด 9 ชิ้น เปิดทุก 5 เทิร์น)
let shopRoundSeq = 0;     // ลำดับรอบร้านค้า (ใช้สร้าง id สินค้าไม่ให้ซ้ำกันข้ามรอบ)

// ---------- ยูนะ ไอดอลประจำสนาม (characters/yuna.js — ไม่ใช่ตัวละครที่เล่นได้ ไม่มี p เป็นของตัวเอง) ----------
const YUNA_IMG = "/characters/yuna/yuna.png";
const YUNA_COLOR = "#c9a7ff";
let yunaLongingUsed = false; // เพลง Longing ใช้ไปแล้วหรือยัง (ครั้งเดียวต่อเกม)
let yunaWindowEnd = 0;       // roundNumber ที่เอฟเฟกต์ปัจจุบันหมดผล (0 = ไม่มีเอฟเฟกต์ทำงานอยู่)
let yunaEffect = null;       // "longing" | "delete" | "smile" | "beatbark" | null
let yunaTargetId = null;     // เป้าหมาย delete/smile/longing — null สำหรับ beatbark (ทั้งสนาม)
let yunaMusicSeq = 0;        // เพิ่มทุกครั้งที่ยูนะ trigger ใหม่ -> client รีสตาร์ทเพลงจากต้น
let yunaLongingPendingId = null; // ตายในเทิร์น 1-10 แล้วรอฟื้นด้วย Longing — รอฉากโจมตีจบก่อน (ดู endTurn())
let yunaPity = 0;            // ระบบกันดวงซวย: หน้าต่างไหนไม่ติด +5% สะสมไปเรื่อยๆ ติดแล้วรีเซ็ตกลับ 0 (ดู characters/yuna.js's rollWindow)

function clearPhaseTimer() {
  if (phaseTimerId) clearInterval(phaseTimerId);
  phaseTimerId = null;
}
// เก็บ callback ของเฟสปัจจุบันไว้ (นอกเหนือจาก timeLeft) — ใช้ตอนต้อง "แทรก" คัตซีนแบบ async นอกรอบ
//  ปกติ (เช่น ริต้า เบอร์นัล ตอบคำถามปลดปล่อยความเจ็บปวดช้ากว่ารอบที่ตายจริง) แล้วต้องกลับมาที่เฟส/ตัวจับเวลาเดิมให้ถูกต้อง
let currentPhaseOnExpire = null;
function startPhaseTimer(seconds, onExpire) {
  clearPhaseTimer();
  timeLeft = seconds;
  currentPhaseOnExpire = onExpire;
  phaseTimerId = setInterval(() => {
    timeLeft--;
    if (timeLeft <= 0) { clearPhaseTimer(); onExpire(); }
    else broadcastState();
  }, 1000);
}


// ============================================================
//  การ์ด — กองกลางร่วม 43 ใบ (เลข 1-10 x 4 สี = 40 + King/Queen/Joker อย่างละ 1)
// ============================================================
const CARD_COLORS = ["red", "blue", "green", "yellow"];
// รายชื่อการ์ดทั้ง 43 ใบแบบไม่สับ (ลำดับคงที่) — ใช้เป็นแม่แบบแสดงสมุดการ์ด (deckLedger) และเทียบว่าใบไหนถูกจั่วไปแล้ว
function canonicalDeckCards() {
  const deck = [];
  for (let v = 1; v <= 10; v++) for (const color of CARD_COLORS) deck.push({ value: v, color });
  deck.push({ special: "king" }, { special: "queen" }, { special: "joker" });
  return deck;
}
function cardKey(c) { return c.special || `${c.value}-${c.color}`; }
function buildCentralDeck() {
  const deck = canonicalDeckCards();
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
// สุ่มดึง 1 ใบออกจาก centralDeck จริง โดยเลือกจาก index ที่ผ่าน predicate เท่านั้น (คืน null ถ้าไม่มีใบให้จั่ว)
function drawFromCentralDeck(predicate) {
  const idxPool = [];
  for (let i = 0; i < centralDeck.length; i++) if (!predicate || predicate(centralDeck[i])) idxPool.push(i);
  if (!idxPool.length) return null;
  const idx = idxPool[Math.floor(Math.random() * idxPool.length)];
  return centralDeck.splice(idx, 1)[0];
}
function drawCardFor(p) {
  // ข้าขอบัญชา (หญิง คิชินามิ ฮาคุโนะ patch 2.2.1): จั่วเพิ่มระหว่างนี้ได้แค่ 2 หรือ 3 แต้มเท่านั้น (ถ้ายังเหลือในกองกลาง)
  if (p.hakunoLowDraw) {
    const c = drawFromCentralDeck((card) => !card.special && HAKUNO_DRAW_LOW_VALUES.includes(card.value));
    if (c) return c;
  }
  return drawFromCentralDeck(null);
}
// แจกเริ่มรอบ: จั่วจากกองกลางเหมือนกัน แต่ห้ามได้การ์ดพิเศษ (King/Queen/Joker)
function drawInitialCard(p) {
  return drawFromCentralDeck((card) => !card.special);
}
// สกิล "บังคับแต้มพุ่งขึ้น" (ฮาคุโนะ/ทาคุโตะ/มิยาโกะ/ฟีนิกซ์ ฯลฯ): ต้องจั่วการ์ดจริงจากกองกลางไปเรื่อยๆ
//  จนกว่าแต้มจะถึงเป้าหมาย ไม่ใช่บวก cardBonus ลอยๆ — ไม่การันตีว่าจะหยุดที่เป้าเป๊ะเพราะการ์ด 1 ใบมีค่าแค่ 1-10
//  จั่วเกินจนแตกได้จริงถ้าดวงไม่ดี และหยุดเองถ้ากองกลางหมดพอดี
function drawToScore(p, target) {
  while (calculateScore(p.cards) < target) {
    const c = drawCardFor(p);
    if (!c) break;
    p.cards.push(c);
    onCardDrawn(p, c);
  }
  p.busted = bustedOf(p);
}
function calculateScore(cards) {
  let base = 0, hasJoker = false;
  for (const c of cards) {
    if (c.special === "joker") { hasJoker = true; continue; }
    if (c.special) continue; // King/Queen ไม่เพิ่มแต้ม
    base += c.value;
  }
  if (hasJoker) base += Math.min(12, Math.max(0, 21 - base)); // โจ๊กเกอร์: ดันแต้มไปให้ใกล้ 21 ที่สุด (สูงสุด +12)
  return base;
}
const YELLOW_CARD_SKILL_BONUS = 2; // ไพ่เหลืองครบ 3 ใบ 1 ชุด = แต้มสกิล +2 (เดิม +1)
// สีการ์ดครบ 3 ใบ: บลูทำงานทันที (ต้านสถานะผิดปกติ), แดง/เขียว/เหลืองทำงานตอนเปิดไพ่ (ดู applyLockColorTriggers)
function checkBlueTrigger(p) {
  const blueCount = p.cards.filter((c) => c.color === "blue").length;
  const shouldHave = Math.floor(blueCount / 3);
  while (p.colorTrigger.blue < shouldHave) {
    p.colorTrigger.blue++;
    applyBuff(p, "resist", 1, 1);
    lastLog.push(`🔵 ${p.name} ครบไพ่ฟ้า 3 ใบ — ได้รับต้านสถานะผิดปกติทันที!`);
  }
}
// การ์ดพิเศษ: ทำงานทันทีตอนจั่วได้ (King/Queen) — Joker ทำงานตอนคิดคะแนนใน calculateScore
function applySpecialCardEffect(p, card) {
  if (!card || !card.special) return;
  if (card.special === "king") {
    p.gold = Math.min(GOLD_MAX, (p.gold || 0) + 10);
    lastLog.push(`👑 ${p.name} จั่วได้การ์ดราชา — ได้เหรียญ +10!`);
  } else if (card.special === "queen") {
    p.statuses.freecast = 1; // ใช้สกิลครั้งถัดไปไม่เสียแต้ม — หายเมื่อจบเทิร์นถ้าไม่ได้ใช้
    lastLog.push(`👸 ${p.name} จั่วได้การ์ดราชินี — ใช้สกิลได้ฟรี 1 ครั้งในเทิร์นนี้!`);
  }
}
// เรียกทุกครั้งที่มีการ์ดถูกเพิ่มเข้ามือ (แจกเริ่มรอบ / hit / บังคับจั่ว) เพื่อเช็คทริกเกอร์ที่ทำงานทันที
function onCardDrawn(p, card) {
  checkBlueTrigger(p);
  applySpecialCardEffect(p, card);
}
// แดง/เขียว/เหลือง ครบ 3 ใบ: ประเมินครั้งเดียวตอนเปิดไพ่ (lock) จากมือสุดท้ายทั้งหมด
function applyLockColorTriggers(p) {
  for (const color of ["red", "green", "yellow"]) {
    const n = Math.floor(p.cards.filter((c) => c.color === color).length / 3);
    if (n <= 0) continue;
    if (color === "red") {
      p.statusAmt.cardAtkBonus = (p.statusAmt.cardAtkBonus || 0) + n;
      lastLog.push(`🔴 ${p.name} ครบไพ่แดง 3 ใบ — พลังโจมตีรอบนี้ +${n}`);
    } else if (color === "green") {
      for (let i = 0; i < n; i++) {
        const h = healHp(p, 1);
        if (h > 0) lastLog.push(`🟢 ${p.name} ครบไพ่เขียว 3 ใบ — ฟื้นพลังชีวิต +${h}`);
      }
    } else if (color === "yellow") {
      const gain = n * YELLOW_CARD_SKILL_BONUS;
      addSkill(p, gain);
      lastLog.push(`🟡 ${p.name} ครบไพ่เหลือง 3 ใบ — แต้มสกิล +${gain}`);
    }
  }
}
// โชคลาภ (patch 2.2 new): เลือกลำดับแต้มเป้าหมาย (19/20/21) ที่จะพยายามปรับไพ่ที่จั่วให้ไปถึง โดยอิงจากแต้มรวมปัจจุบัน
//  คืนเป็นลิสต์เรียงลำดับ (ตัวที่สุ่มได้ก่อน แล้วค่อยลองตัวที่เหลือ) — ถ้าตัวแรกไม่มีไพ่ให้จั่วพอดี จะลองตัวถัดไปก่อนค่อยยอมแตก
function fortuneTargetList(currentScore) {
  if (currentScore === 20) return [21]; // ใกล้สุดแล้ว มีบัฟ = ไป 21 แน่นอน
  if (currentScore === 19) return Math.random() < 0.5 ? [21, 20] : [20, 21]; // ถึง 19 อยู่แล้ว สุ่ม 50/50 ว่าจะลองอันไหนก่อน
  const roll = Math.random();
  const primary = roll < 0.4 ? 19 : roll < 0.7 ? 20 : 21; // ปกติ: 19 = 40% / 20 = 30% / 21 = 30%
  return [primary, ...[19, 20, 21].filter((v) => v !== primary)];
}
// เพดานแต้มขณะ UPG! (ฮิคารุ, characters/hikaru.js) — wrapper รอบ CHAR_HOOKS.hikaru.upgCap
function scoreCap(p) {
  // แต้มสูงสุดที่รับได้ก่อนล็อกไพ่อัตโนมัติ (UPG! = เพดานของมัน, เสือนอนกิน (fiber) = 19, ปกติ = 21)
  if (p.statuses && p.statuses.upg) return CHAR_HOOKS.hikaru.upgCap(p);
  if (p.statuses && p.statuses.fiber) return FIBER_CAP;
  return 21;
}
function scoreOf(p) {
  const raw = calculateScore(p.cards) + (p.cardBonus || 0);
  if (p.statuses && p.statuses.upg) return Math.min(raw, CHAR_HOOKS.hikaru.upgCap(p));
  if (p.statuses && p.statuses.fiber) return Math.min(raw, FIBER_CAP);
  return raw;
}
function bustedOf(p) {
  if (p.statuses && (p.statuses.upg || p.statuses.fiber)) return false;
  return calculateScore(p.cards) + (p.cardBonus || 0) > 21;
}


// ============================================================
//  ต่อสู้ + เอฟเฟกต์สกิล
// ============================================================
function alivePlayers() { return Object.values(players).filter((p) => p.alive); }

// Song for you (เทมาริ patch 2.0.6): บัฟพลังขิงที่ล็อกไว้ตอนใช้สกิล (2 ชาม = +1)
function songActive(p) {
  return !!p && ((p.statuses && p.statuses.song) || 0) > 0;
}
// ---------- เทมาริ (patch 2.0.6) ----------
const TEMARI_ANATA_DRAWS = 3;    // ANATA WAAAAAAAA: บังคับจั่วเพิ่ม 3 ใบ (เพิ่มจาก 2)
// สถานะผิดปกติที่ Song for you ล้างออกได้ทั้งหมด (patch 2.0.8: เพิ่มดีบัฟพื้นฐานใหม่
//  และแยก ยามฟ้าสาง/เส้นชีวิต ออกไปลดทีละ 1 แทน — ดูใน st === "song")
const DEBUFF_KEYS = ["discord", "sleep", "stun", "nodraw", "noskill", "sena",
  "energy", "nohealing", "moonmark", "overwork", "unplug", "weak", "fragile", "spellburden",
  "oblada", "calamity", "hburn", "phenexBanUlt", "nanayaSeal", "miyakoSeal", "invert", "manaSeal"];
// เกราะสูงสุดของผู้เล่น: ปกติ 2 — ระหว่างสวมเกราะราชัน (ท่าไม้ตายคุวากาตะ) เพิ่ม +3 เป็น 5
// ระหว่างสกิลติดตัว 3 เอวา 13 (เลือด <= 3) เพิ่ม +1
// ระหว่าง Lie Like Vortigern (โอเบรอน) เป้าหมายได้เพดานเกราะ +1
// ระหว่างเป็นคู่สัญญาเจ้าแห่งเน็ตบ้าน (สนใจใช้บริการเราไหม) เพิ่ม +3
function maxArmorOf(p) {
  // คิชินามิ ฮาคุโนะ (patch 2.2.1): เพดานเกราะคงที่ตามเพศ (แทน MAX_ARMOR ปกติ) — ชาย 2 / หญิง 3
  // เอวานเกเลี่ยน หมายเลข 13 (patch 2.2 alpha): ไม่มีเกราะเลยตามปกติ (เพดาน 0) — ได้เพดาน +1 เฉพาะช่วงสกิลติดตัว 3 ทำงาน (ด้านล่าง)
  const armorBase = (p && p.characterId === "hakuno")
    ? (p.hakunoGender === "female" ? HAKUNO_FEMALE_ARMOR_CAP : HAKUNO_MALE_ARMOR_CAP)
    : (p && p.characterId === "eva13") ? 0
    : MAX_ARMOR;
  return armorBase
    + ((((p.statuses && p.statuses.vortarmor) || 0) > 0) ? 1 : 0)
    + (oguriGoldStacks(p) >= OGURI_GOLD_ARMOR_AT ? 1 : 0) // ยุคทอง (โอกูริ Rework): ครบ 2 แต้มขึ้นไป เพดานเกราะ +1
    + ((p.characterId === "hikaru" && ((p.statuses && p.statuses.monster) || 0) > 0) ? HIKARU_MONSTER_ARMOR_BONUS : 0) // MonsterLive (ฮิคารุ patch 2.1.3): เพดานเกราะ +2
    // ริดดี้ (patch 2.0.9): Absorb Shield +2 (1 เทิร์น) / ท่าไม้ตาย 2 +2 ทั้งริดดี้ (riddheguard) และบานาจ (riddheward)
    + ((((p.statuses && p.statuses.absorbplus) || 0) > 0) ? RIDDHE_ABSORB_ARMOR : 0)
    + ((((p.statuses && p.statuses.riddheguard) || 0) > 0 || ((p.statuses && p.statuses.riddheward) || 0) > 0) ? 2 : 0)
    + (CHAR_HOOKS.broadband_man.contractBuffActive(engine, p) ? CONTRACT_ARMOR_BONUS : 0)
    + (CHAR_HOOKS.eva13.isEva3Active(engine, p) ? 1 : 0);
}
// เรจูอาคมบัญชา คำสั่ง 1 (ฟุจิมารุ): อมตะ 1 เทิร์น — ไม่รับความเสียหายใดๆ
function sealActive(p) {
  return !!p && ((p.statuses && p.statuses.seal) || 0) > 0;
}
// Beat Mode (universal dispatcher — เรียกกลับเข้า characters/<id>.js ของแต่ละตัวละครที่มีกลไกนี้)
//  ตอนนี้มี kuwagata (ประกายเขี้ยวปฏิปักษ์) และ takuto (ฉันยัง...มองเห็นอยู่!!!) — ดู characters/kuwagata.js, characters/takuto.js
function beatActive(p) {
  const mod = CHAR_HOOKS[p && p.characterId];
  return !!(mod && mod.isBeatActive && mod.isBeatActive(engine, p));
}
function maybeBeatMode(p) {
  const mod = CHAR_HOOKS[p && p.characterId];
  if (mod && mod.maybeEnterBeatMode) mod.maybeEnterBeatMode(engine, p);
}
// กันตายทันทีเมื่อความเสียหายถึงตาย (ครั้งเดียวต่อเกม — ค้างที่ 1 หน่วย)
function maybeBeatSave(p) {
  if (!p || !p.alive || passiveSealed(p)) return false;
  if (p.beatSaved || p.hp >= 1) return false;
  const mod = CHAR_HOOKS[p.characterId];
  return !!(mod && mod.tryDeathSave && mod.tryDeathSave(engine, p));
}
// ---------- ริต้า เบอร์นัล / ฟีนิกซ์ (patch 2.1.6) ----------
// สกิลติดตัว 1 ถ้าเลือกได้ อยากเกิดเป็นอะไรหรอ?: ตายครั้งแรกในเกม -> เกิดใหม่ด้วยพลังชีวิต/เกราะเต็ม (ครั้งเดียวต่อเกม)
//  เปิด NTD-System ถาวรฟรี (ไม่เสียเลือด) + พลังโจมตีพื้นฐานถาวร +1 — ท่าไม้ตายเปลี่ยนเป็นท่า 2 / สกิลรองเปลี่ยนเป็นสกิลรอง 2 ถาวร
// ริต้า เบอร์นัล (characters/phenex.js) — wrapper รอบ CHAR_HOOKS.phenex.resolveRelease
// ตายกลางเทิร์น (เลือดหมดจากสกิล/ผลสถานะ): ตกรอบทันที
function instantDeath(p) {
  // ริต้า เบอร์นัล (สกิลติดตัว 1 patch 2.1.6, characters/phenex.js): ตายครั้งแรก -> เกิดใหม่แทนที่จะตกรอบ (ครั้งเดียวต่อเกม)
  if (p.characterId === "phenex" && CHAR_HOOKS.phenex.tryRebirth(engine, p)) return;
  // ริต้า เบอร์นัล (สกิลติดตัว 2 patch 2.1.7, characters/phenex.js): ตกรอบจริงขณะท่าไม้ตาย 2 ยังทำงานอยู่ -> ปลดปล่อยความเจ็บปวดที่สะสมทั้งหมดก่อนตาย
  if (p.characterId === "phenex") CHAR_HOOKS.phenex.maybeReleasePainOnDeath(engine, p);
  p.hp = 0; p.alive = false; p.result = "dead"; p.locked = true;
  CHAR_HOOKS.kai.pruneOverhaulSlots(engine); // ไค ชิซากิ: ผู้ถือรังสรรค์/ลงทัณฑ์ตกรอบ -> ลบออกจาก Overhaul tracker
  // ยูนะ: เป้าหมายที่ได้รับพร (Delete/Smile for You/Longing) ตาย/หมดสภาพ -> เพลง+บัฟยูนะปิดลงทันที
  //  ยกเว้น Break Beat Bark เพราะมีผลทั้งสนาม ไม่ผูกกับผู้เล่นคนใดคนหนึ่งโดยเฉพาะ
  if (yunaEffect && yunaEffect !== "beatbark" && yunaTargetId === p.id) {
    yunaEffect = null; yunaTargetId = null; yunaWindowEnd = 0;
    delete p.statuses.yunaDelete; delete p.statuses.yunaSmile; delete p.statuses.yunaLonging;
  }
  // ยูนะ (เพลง Longing): คนแรกที่ตายระหว่างเทิร์น 1-10 -> ทำเครื่องหมายไว้ก่อน (ครั้งเดียวต่อเกม)
  //  ยังไม่ฟื้นคืนชีพทันที — ต้องรอให้ฉากโจมตี(ถ้ามี)จบก่อน แล้วค่อยฟื้น+ขึ้นวีดีโอ (ดู endTurn() จุดที่ตั้งค่า yunaLongingPendingId)
  if (!yunaLongingUsed && roundNumber >= 1 && roundNumber <= 10) {
    yunaLongingUsed = true;
    yunaLongingPendingId = p.id;
  }
}

// ---------- เอวานเกเลี่ยน หมายเลข 13 (universal-dispatcher wrappers — ตรรกะจริงอยู่ characters/eva13.js) ----------
function maybeEva3(p) {
  if (!p || !p.alive || p.characterId !== "eva13") return;
  CHAR_HOOKS.eva13.maybeEnterEva3(engine, p);
}

// ฮีลพร้อมล้น: เลือดจริง -> เกราะ -> เลือดชั่วคราว (หายเองใน 2 เทิร์น / หมดเมื่อรับดาเมจ)
//  คืนรายละเอียดว่าฮีลครั้งนี้ลงช่องไหนเท่าไหร่ (ใช้แจ้งผลใน log ให้ชัด)
function healOverflow(p, amount) {
  let left = amount;
  const toHp = healHp(p, left); // "ไม่ใช้งานต่อ" = ฟื้นเลือดจริงไม่ได้ (ล้นไปเกราะ/เลือดชั่วคราวได้ตามปกติ)
  left -= toHp;
  let toArmor = 0;
  if (left > 0) {
    toArmor = Math.min(left, Math.max(0, maxArmorOf(p) - p.armor));
    p.armor += toArmor; left -= toArmor;
  }
  if (left > 0) {
    p.tempHp = (p.tempHp || 0) + left;
    p.tempHpTurns = TEMP_HP_TURNS;
  }
  return { toHp, toArmor, toTemp: left };
}

function releaseReservation(socketId) {
  delete reservations[socketId];
  const timer = reservationTimers.get(socketId);
  if (timer) clearTimeout(timer);
  reservationTimers.delete(socketId);
}
function reservePosition(socketId, position) {
  releaseReservation(socketId);
  reservations[socketId] = position;
  reservationTimers.set(socketId, setTimeout(() => {
    releaseReservation(socketId);
    broadcastPositions();
  }, RESERVATION_TTL_MS));
}
function joinedPositions() { return Object.values(players).map((p) => p.position); }
function positionsFor(sid) {
  const joined = joinedPositions();
  const reserved = Object.entries(reservations).filter(([id]) => id !== sid).map(([, p]) => p);
  return [...new Set([...joined, ...reserved])];
}
function positionUsedByOther(pos, sid) {
  return joinedPositions().includes(pos) ||
    Object.entries(reservations).some(([id, p]) => id !== sid && p === pos);
}

// รูปที่แสดง: Beat Mode (ถาวรจนตาย) > ร่างสุดท้ายฟุจิมารุ (จนตาย) > Paradise (เหนือกว่าสกิลติดตัว NT-D)
//  > NT-D คงอยู่จนแก้แค้น > ไคจู Black King > Ginga > สวมเกราะราชัน
function displayImg(p) {
  // โอเบรอน: ร่างสลับตามช่วงเวลากลางวัน/กลางคืนเสมอ
  if (p.characterId === "oberon") return isNightRound(roundNumber) ? OBERON_NIGHT_IMG : OBERON_MORNING_IMG;
  // ชเรด เอลัน: รวมร่างทำนองเพลงแล้ว = ร่างอควาเรียน สปาด้า ถาวร
  if (p.characterId === "shrade_elan" && p.shradeForm) return SHRADE_SPADA_IMG;
  // เรียวกิ ชิกิ: ระหว่างท่าไม้ตาย ฉันมองเห็นมันแล้ว / ความตายที่โรยรา = ภาพสถานะท่าไม้ตาย
  if (p.characterId === "shiki" && (p.statuses.wither || 0) > 0) return SHIKI_WITHER_IMG;
  if (p.characterId === "shiki" && (p.statuses.deatheye || 0) > 0) return SHIKI_DEATH_IMG;
  // โทโนะ ชิกิ: มีดพับประจำตระกูล ระดับ 2 ขึ้นไป (เปิดใช้งานสกิลติดตัว) = ภาพ tohno_death
  if (p.characterId === "tohno" && (p.tohnoLevel || 1) >= 2) return TOHNO_DEATH_IMG;
  // คิชินามิ ฮาคุโนะ: ล็อบบี้ = hakuno.webp — ลงสนามเปลี่ยนภาพตามเพศปัจจุบัน
  if (p.characterId === "hakuno") {
    if (gameState === "LOBBY") return p.img;
    return p.hakunoGender === "female" ? "/characters/hakuno/profile/hakuno_female.webp" : "/characters/hakuno/profile/hakuno_male.png";
  }
  // โอกูริ แคป: ระหว่างร่าง Zone (GrayBeast) = ภาพ zone_form
  if (p.characterId === "oguri" && (p.statuses.graybeast || 0) > 0) return OGURI_ZONE_IMG;
  // ผู้สังหารจอมมหาเวทย์: เคยใช้ Witch Mark ไปแล้ว (ถาวร) = MS02.png แทน MS01.png ปกติ
  if (p.characterId === "mageslayer") return p.mageslayerHasMarked ? "/characters/mageslayer/MS02.png" : "/characters/mageslayer/MS01.png";
  // ทาคุมิ ฟุจิวาระ: ภาพเปลี่ยนตามเกียร์ธรรมดา — เกียร์ 1-2: takumi1.webp / เกียร์ 3-5: takumi3.jpg / เกียร์ 6: takumi6.jpg
  if (p.characterId === "takumi") {
    const gear = p.takumiGear || 1;
    if (gear >= 6) return "/characters/takumi/takumi6.jpg";
    if (gear >= 3) return "/characters/takumi/takumi3.jpg";
    return "/characters/takumi/takumi1.webp";
  }
  // ริดดี้ มาร์เซนาส: ล็อบบี้ = riddhe.jpg — ลงสนามเป็นบันชี / NT-D (ท่าไม้ตาย 1) / ร่างดำมืด (ท่าไม้ตาย 2 หรือถาวรหลังสกิลติดตัว 3)
  if (p.characterId === "riddhe") {
    if (gameState === "LOBBY") return p.img;
    if ((p.statuses.riddheguard || 0) > 0 || p.riddheAvenger) return RIDDHE_NTD2_IMG;
    if ((p.statuses.riddhentd || 0) > 0) return RIDDHE_NTD_IMG;
    return RIDDHE_BANSHEE_IMG;
  }
  // ริต้า เบอร์นัล: ล็อบบี้ = rita.png — ลงสนามเป็น phenex.png ปกติ / phenex_ntd.png ระหว่างฝืนใช้งาน NTD-Sytem (ชั่วคราวหรือถาวร)
  if (p.characterId === "phenex") {
    if (gameState === "LOBBY") return p.img;
    if ((p.statuses.phenexNtd || 0) > 0 || p.phenexNtdPermanent) return PHENEX_NTD_IMG;
    return PHENEX_BASE_IMG;
  }
  if (p.seen && p.seen.beat) return OHGER_FORM;
  // สึงาชิ ทาคุโตะ (patch 2.2.5): สกิลติดตัว 1 กันตายทำงานไปแล้วสักครั้ง — ระหว่างที่ยังอยู่ในร่างฉันคว้ามันได้แล้ว ใช้ภาพ tauburn_un.jpg แทน tauburn.jpg ปกติ
  if (p.characterId === "takuto" && p.beatSaved && (p.statuses.apprivoise || 0) > 0) return TRANSFORMS.takutoAwaken.img;
  // เอวา 13: Fourth Impact (ท่าไม้ตาย) > สกิลติดตัว 3 (เลือด <= 3)
  if (p.seen && p.seen.fourth && (p.statuses.fourth || 0) > 0) return TRANSFORMS.fourth.img;
  if (p.seen && p.seen.eva3 && CHAR_HOOKS.eva13.isEva3Active(engine, p)) return TRANSFORMS.eva3.img;
  // NewType Paradise อยู่เหนือกว่าสกิลติดตัว NT-D — ระหว่างร่าง Paradise คงภาพ Paradise ไว้
  if (p.seen && p.seen.paradise && (p.statuses.paradise || 0) > 0) return TRANSFORMS.paradise.img;
  // บานาจ (patch 2.1.2): NT-D System (สกิลติดตัว 1) หรือฉันไม่อยากให้เราต้องมาสู้กัน (สกิลติดตัว 2) ทำงานอยู่ — ภาพร่าง NT-D
  if ((p.ntdTarget || p.ntdRivalId) && p.seen && (p.seen.ntd || p.seen.banagherPassive2)) return TRANSFORMS.ntd.img;
  // ไรโด ฮิคารุ (patch 2.1.3): Ginga Strium อยู่เหนือกว่า Ginga (สกิลรอง 1)
  if (p.characterId === "hikaru" && p.seen && p.seen.gingastrium && (p.statuses.gingastrium || 0) > 0) return HIKARU_STRIUM_IMG;
  // ไรโด ฮิคารุ (patch 2.1.6): แก้บั๊ก — MonsterLive (ไคจู Black King) เคยเปลี่ยนภาพได้ก่อน patch 2.1.3 แล้วหายไป คืนให้กลับมาเปลี่ยนภาพอีกครั้ง
  //  ลำดับความสำคัญ: Ginga Strium > ไคจู Black King > Ginga (ตามที่ระบุไว้ในคอมเมนต์ด้านบนฟังก์ชันนี้)
  if (p.characterId === "hikaru" && (p.statuses.monster || 0) > 0) return TRANSFORMS.monster.img;
  for (const key of ["ginga", "rachan", "golden", "apprivoise"]) {
    if (p.seen && p.seen[key] && (p.statuses[key] || 0) > 0) return TRANSFORMS[key].img;
  }
  // บานาจ ลิงก์ (patch 2.1.2): หน้าเลือกตัวละคร/ล็อบบี้ใช้ p.img เดิม — ลงสนามแล้วเปลี่ยนเป็น unicorn_new.png
  if (p.characterId === "banagher" && gameState !== "LOBBY") return BANAGHER_BASE_IMG;
  return p.img;
}
// เพลงสกิล: Beat Mode (ex_guts) ทับทุกเพลงจนผู้ใช้ตาย > คนที่เปิดร่างล่าสุด
//  คืน { music, at } — at = ลำดับการเปิดร่าง ให้ client รู้ว่าเป็น "การเปิดครั้งใหม่"
//  (เปิดท่าซ้ำ / คนอื่นเปิดท่าเพลงเดียวกันทับ) -> เพลงต้องเริ่มใหม่จากต้น
function activeSkillMusic() {
  let bestBeat = null;
  for (const p of alivePlayers()) {
    if (p.seen && p.seen.beat) {
      if (!bestBeat || (p.beatAt || 0) > bestBeat.at) bestBeat = { music: "ex_guts", at: p.beatAt || 0 };
    }
  }
  if (bestBeat) return bestBeat;
  // ทาคุมิ ฟุจิวาระ: ถึงจะมองไม่เห็น แต่ฉันยังอยู่ ทำงานอยู่ — เพลง forever เล่นค้าง (priority สูงกว่าเพลงตามเกียร์ ต่ำกว่า Beat Mode)
  let bestTakumiBlackout = null;
  for (const p of alivePlayers()) {
    if (p.characterId === "takumi" && (p.statuses.takumiBlackout || 0) > 0) {
      if (!bestTakumiBlackout || (p.transformAt || 0) > bestTakumiBlackout.at) bestTakumiBlackout = { music: "forever", at: p.transformAt || 0 };
    }
  }
  if (bestTakumiBlackout) return bestTakumiBlackout;
  // สึงาชิ ทาคุโตะ (patch 2.2.5): สกิลติดตัว 1 กันตายทำงานไปแล้วสักครั้ง — ระหว่างที่ยังอยู่ในร่างฉันคว้ามันได้แล้ว เพลง takuto2 เล่นแทน takuto ปกติ
  let bestTakutoAwaken = null;
  for (const p of alivePlayers()) {
    if (p.characterId === "takuto" && p.beatSaved && (p.statuses.apprivoise || 0) > 0) {
      if (!bestTakutoAwaken || (p.takutoAwakenAt || 0) > bestTakutoAwaken.at) bestTakutoAwaken = { music: "takuto2", at: p.takutoAwakenAt || 0 };
    }
  }
  if (bestTakutoAwaken) return bestTakutoAwaken;
  // แด่เพื่อนรักของฉัน (ชเรด เอลัน): เพลง shrade_theme เล่นค้างตลอดช่วงชาร์จ (รองจาก Beat Mode)
  let bestShrade = null;
  for (const p of alivePlayers()) {
    if (CHAR_HOOKS.shrade_elan.charging(p)) {
      if (!bestShrade || (p.transformAt || 0) > bestShrade.at) bestShrade = { music: "shrade", at: p.transformAt || 0 };
    }
  }
  if (bestShrade) return bestShrade;
  // มิติมายาบรรเลง (Bard): BGM มิติเล่นวนตลอด 3 เทิร์นที่มิติเปิดอยู่
  let bestBard = null;
  for (const p of alivePlayers()) {
    if (p.characterId === "bard" && ((p.statuses.bloodDim || 0) > 0 || (p.statuses.soulDim || 0) > 0)) {
      if (!bestBard || (p.transformAt || 0) > bestBard.at) bestBard = { music: "bard_dim", at: p.transformAt || 0 };
    }
  }
  if (bestBard) return bestBard;
  // ฉันมองเห็นมันแล้ว / ความตายที่โรยรา (ชิกิ): เพลงประจำท่าเล่นค้างระหว่างท่าไม้ตายทำงาน
  let bestShiki = null;
  for (const p of alivePlayers()) {
    if (p.characterId !== "shiki") continue;
    if ((p.statuses.wither || 0) > 0) {
      if (!bestShiki || (p.transformAt || 0) > bestShiki.at) bestShiki = { music: "shiki2", at: p.transformAt || 0 };
    } else if ((p.statuses.deatheye || 0) > 0) {
      if (!bestShiki || (p.transformAt || 0) > bestShiki.at) bestShiki = { music: "shiki", at: p.transformAt || 0 };
    }
  }
  if (bestShiki) return bestShiki;
  // มีดพับประจำตระกูล (โทโนะ ชิกิ patch 2.1.7): เพลง tohno_theme เล่นค้างระหว่างสกิลติดตัวเปิดใช้งาน (ระดับ 2 ขึ้นไป)
  let bestTohno = null;
  for (const p of alivePlayers()) {
    if (p.characterId === "tohno" && (p.tohnoLevel || 1) >= 2) {
      if (!bestTohno || (p.transformAt || 0) > bestTohno.at) bestTohno = { music: "tohno", at: p.transformAt || 0 };
    }
  }
  if (bestTohno) return bestTohno;
  // Mystic eye of death perception (นานายะ ชิกิ patch 2.1.9): เพลง nanaya_theme เล่นค้างระหว่างเปิดใช้งาน — ปิดพร้อมกับปิดสกิลติดตัว
  let bestNanaya = null;
  for (const p of alivePlayers()) {
    if (p.characterId === "nanaya" && p.nanayaEyeOn) {
      if (!bestNanaya || (p.transformAt || 0) > bestNanaya.at) bestNanaya = { music: "nanaya", at: p.transformAt || 0 };
    }
  }
  if (bestNanaya) return bestNanaya;
  // นายเป็นคนทำตัวเองนะ (เทเปา ชิกิ): เพลง tepeu_theme เล่นค้างช่วงฉากหลังซ้อนแบบโทโนะ ชิกิ หลังท่าไม้ตายจบ
  let bestTepeu = null;
  for (const p of alivePlayers()) {
    if (p.characterId === "tepeu" && (p.tepeuEyeTurns || 0) > 0) {
      if (!bestTepeu || (p.transformAt || 0) > bestTepeu.at) bestTepeu = { music: "tepeu", at: p.transformAt || 0 };
    }
  }
  if (bestTepeu) return bestTepeu;
  // Mana Burden (ผู้สังหารจอมมหาเวทย์): เพลง mageslayer_ult เล่นค้างตราบใดที่ตัวเองยังมีภาระเวทติดตัวอยู่ (ผูกอายุกับ spellburden 5 เทิร์นของตัวเอง)
  let bestMageslayer = null;
  for (const p of alivePlayers()) {
    if (p.characterId === "mageslayer" && (p.statuses.spellburden || 0) > 0) {
      if (!bestMageslayer || (p.transformAt || 0) > bestMageslayer.at) bestMageslayer = { music: "mageslayer_ult", at: p.transformAt || 0 };
    }
  }
  if (bestMageslayer) return bestMageslayer;
  // ทาคุมิ ฟุจิวาระ: เพลงประจำตัวตามเกียร์ธรรมดา — เกียร์ 3-5: all_around / เกียร์ 6: secret_love (เกียร์ 1-2 ไม่มีเพลงพิเศษ)
  let bestTakumiGear = null;
  for (const p of alivePlayers()) {
    if (p.characterId !== "takumi") continue;
    const gear = p.takumiGear || 1;
    const gearMusic = gear >= 6 ? "secret_love" : gear >= 3 ? "all_around" : null;
    if (!gearMusic) continue;
    if (!bestTakumiGear || (p.transformAt || 0) > bestTakumiGear.at) bestTakumiGear = { music: gearMusic, at: p.transformAt || 0 };
  }
  if (bestTakumiGear) return bestTakumiGear;
  // MOON*CELL (คิชินามิ ฮาคุโนะ patch 2.2.1): เพลง hakuno_theme เล่นค้างระหว่างท่าไม้ตายทำงาน
  let bestHakuno = null;
  for (const p of alivePlayers()) {
    if (p.characterId === "hakuno" && (p.statuses.moonCell || 0) > 0) {
      if (!bestHakuno || (p.transformAt || 0) > bestHakuno.at) bestHakuno = { music: "hakuno", at: p.transformAt || 0 };
    }
  }
  if (bestHakuno) return bestHakuno;
  // Wonder of U (ซาโตรุ patch 2.0.8.2): เพลงเล่นค้างตราบใดที่ยังมีผู้เล่นติด [Calamity] อยู่บนสนาม
  let bestWou = null;
  for (const p of alivePlayers()) {
    if (p.characterId !== "satoru") continue;
    if (!Object.values(players).some((o) => o.alive && (o.statuses.calamity || 0) > 0)) continue;
    if (!bestWou || (p.transformAt || 0) > bestWou.at) bestWou = { music: "wonderofu", at: p.transformAt || 0 };
  }
  if (bestWou) return bestWou;
  let best = null;
  for (const key of ["ginga", "gingastrium", "paradise", "rachan", "golden", "fourth", "graybeast", "doomCrucible", "apprivoise"]) {
    const t = TRANSFORMS[key];
    if (!t.music) continue;
    for (const p of alivePlayers()) {
      if (p.seen && p.seen[key] && (p.statuses[key] || 0) > 0) {
        if (!best || (p.transformAt || 0) > best.at) best = { music: t.music, at: p.transformAt || 0 };
      }
    }
  }
  return best;
}

// เลือดจริงลด 1 หน่วย — เลือดชั่วคราว (แกมเบลอร์) รับแทนก่อนเสมอ (หมดไปเพราะได้รับความเสียหาย)
// เชื่อมผล (patch 2.0.8): การลด HP จริงถูกแชร์ให้คู่เชื่อมเท่ากันด้วย (อมตะกันไว้ได้)
function loseHp(p) {
  if ((p.tempHp || 0) > 0) { p.tempHp--; return; }
  // ฉันจะไม่ยอมสูญเสียใครไปอีก (ริดดี้ patch 2.1.1): ริดดี้เองตายไม่ได้ — เลือดค้างที่ 1
  if (p.hp <= 1 && CHAR_HOOKS.riddhe.guardProtects(p)) {
    if (p.riddheSaveLoggedRound !== roundNumber) {
      p.riddheSaveLoggedRound = roundNumber;
      lastLog.push(`🛡️🤝 บันชีปกป้องตัวเอง ${p.name} — ฉันจะไม่ยอมสูญเสียใครไปอีก! เลือดค้างที่ 1 (ตายไม่ได้ระหว่างท่าไม้ตายทำงาน)`);
    }
    return;
  }
  p.hp--; p.dmgHp++;
  // ไม่อยากให้ใครต้องเจ็บปวด (ริต้า เบอร์นัล, characters/phenex.js): ระหว่างล่อเป้า สะสม "ความเจ็บปวด" +1 ทุกๆ 1 หน่วยเลือดจริงที่เสียไป
  CHAR_HOOKS.phenex.onHpLost(p);
  if (!linkMirror) {
    const b = linkedBuddyOf(p) || CHAR_HOOKS.kai.kaiLinkedBuddyOf(engine, p);
    if (b && !sealActive(b)) {
      linkMirror = true;
      loseHp(b);
      linkMirror = false;
    }
  }
}
// เชื่อมผล (patch 2.1.1): เกราะที่เสียจริงถูกแชร์ให้คู่เชื่อมเท่ากันด้วย (คนละช่องกับ HP)
function loseArmor(p) {
  p.armor--; p.dmgArmor++;
  // MonsterLive (ฮิคารุ, characters/hikaru.js): เกราะลดลง -> ฟื้นพลังชีวิตตามเกราะที่เสียไป
  CHAR_HOOKS.hikaru.onArmorLost(engine, p);
  // ไม่อยากให้ใครต้องเจ็บปวด (ริต้า เบอร์นัล, characters/phenex.js): ระหว่างล่อเป้า สะสม "ความเจ็บปวด" +1 ทุกๆ 1 หน่วยเกราะที่เสียไป
  CHAR_HOOKS.phenex.onArmorLost(p);
  if (!linkMirror) {
    const b = linkedBuddyOf(p) || CHAR_HOOKS.kai.kaiLinkedBuddyOf(engine, p);
    if (b && !sealActive(b) && b.armor > 0) {
      linkMirror = true;
      loseArmor(b);
      linkMirror = false;
    }
  }
}
// เรจูอาคมบัญชา (อมตะ): ไม่รับความเสียหายใดๆ ตลอดเทิร์น — กันไว้กลางทางทุกช่องทางดาเมจ
function damageSoft(p) {
  if (!p.alive || sealActive(p)) return;
  if (p.shield > 0) { p.shield--; return; }
  if (p.armor > 0) loseArmor(p);
  else loseHp(p);
}
// ระเบิด Fourth Impact (เอวา 13 patch 2.2 alpha): เคารพ "หลบหลีก" ของเป้าหมาย (เดิมทะลุหลบหลีกเสมอ) — คืน true ถ้าหลบพ้น
function evaBlastEvade(o, e) {
  if ((o.statuses.evade || 0) <= 0) return false;
  const evadePct = statusAmtOf(o, "evade") || 100;
  consumeEvadeStack(o);
  if (Math.random() * 100 < evadePct) {
    lastLog.push(`💨 หลบหลีก! ${o.name} หลบแรงระเบิดของ ${e.name} ได้ (${evadePct}%)`);
    return true;
  }
  lastLog.push(`💨 ${o.name} พยายามหลบแรงระเบิดของ ${e.name} แต่ไม่พ้น (${evadePct}%)`);
  return false;
}
// RS-Hopper ทั้งสองแบบ (universal-dispatcher wrappers — ตรรกะจริงอยู่ characters/eva13.js)
// isNormalAttack: true เฉพาะที่ doAttack() เรียก (การโจมตีจากการเลือกเป้าหมายในเทิร์นปกติ ไม่ว่าจะมีบัฟเสริมพลังหรือไม่)
function dealDirect(p, n, isNormalAttack) {
  if (sealActive(p)) return;
  if (isNormalAttack) { if (CHAR_HOOKS.eva13.normalAttackFloor(engine, p, n)) return; }
  else if (CHAR_HOOKS.eva13.rsHopperBlock(engine, p)) return;
  for (let i = 0; i < n; i++) {
    if (!p.alive) return;
    if (p.shield > 0) { p.shield--; continue; }
    loseHp(p);
  }
}
function dealArmorOnly(p, n) {
  if (sealActive(p)) return;
  for (let i = 0; i < n; i++) {
    if (p.shield > 0) { p.shield--; continue; }
    if (p.armor > 0) loseArmor(p);
  }
}
function dealMixed(p, n, isNormalAttack) { // เกราะก่อนแล้วเลือด (สำหรับ NT-D)
  if (sealActive(p)) return;
  if (isNormalAttack) { if (CHAR_HOOKS.eva13.normalAttackFloor(engine, p, n)) return; }
  else if (CHAR_HOOKS.eva13.rsHopperBlock(engine, p)) return;
  for (let i = 0; i < n; i++) {
    if (!p.alive) return;
    if (p.shield > 0) { p.shield--; continue; }
    if (p.armor > 0) loseArmor(p);
    else loseHp(p);
  }
}
function addSkill(p, n) {
  // ชะงัก (โอกูริ Rework): ฟื้นฟูแต้มสกิลไม่ได้ทุกช่องทาง ระหว่างติดสถานะนี้
  if (((p.statuses && p.statuses.stagger) || 0) > 0) return;
  if (((p.statuses && p.statuses.manaSeal) || 0) > 0) return; // ผนึกพลังงาน (Universal): ฟื้นฟูแต้มสกิลไม่ได้ทุกช่องทาง
  if (p.characterId === "mageslayer") return; // Song's Curse: ถาวร ไม่ใช่สถานะ ไม่ต้านได้ — การขโมย/Mana Rupture ทะลุผ่านเพราะไม่เรียก addSkill
  const before = p.skillPoints;
  p.skillPoints = Math.min(maxSkillOf(p), p.skillPoints + n); // Bard: เพดานพลังงาน 9
  p.gainedSkill += p.skillPoints - before;
}

function applyEffect(p, effect) {
  if (!effect) return;
  if (Array.isArray(effect)) return effect.forEach((e) => applyOne(p, e));
  applyOne(p, effect);
}
function applyOne(p, e) {
  switch (e.type) {
    case "heal": healHp(p, e.amount); break;
    case "armor": healArmor(p, e.amount); break;
    case "points": addSkill(p, e.amount); break;
    case "shield": p.shield += e.amount || 1; break;
    case "draw": for (let i = 0; i < (e.amount || 1); i++) { const c = drawCardFor(p); if (c) { p.cards.push(c); onCardDrawn(p, c); } } break;
    case "redraw": {
      p.cards = [];
      for (let i = 0; i < 2; i++) { const c = drawCardFor(p); if (c) { p.cards.push(c); onCardDrawn(p, c); } }
      break;
    }
    case "status": p.statuses[e.status] = e.turns || 1; break;
  }
}
function firePassive(p, trigger) {
  const ch = CHAR_BY_ID[p.characterId];
  if (ch && ch.passive && ch.passive.trigger === trigger) applyEffect(p, ch.passive.effect);
}
// หาข้อมูลสกิล (ชื่อ+รูป) จาก status ที่กำลังมีผล — ใช้โชว์ตอนอนิเมชันโจมตี ว่าดาเมจ/การป้องกันมาจากสกิลไหนของใคร
function skillByStatus(p, status) {
  const ch = CHAR_BY_ID[p.characterId];
  if (!ch) return null;
  for (const tier of ["basic", "secondary", "secondary2", "secondaryNight", "ultimate", "ultimate2", "ultimateNight"]) {
    const s = ch[tier];
    if (s && s.effect && !Array.isArray(s.effect) && s.effect.type === "status" && s.effect.status === status) {
      return { name: s.name, img: s.img || null, by: p.name, color: POSITION_COLORS[p.position] || "#888" };
    }
  }
  return null;
}
// นายมีฝีมือแค่ไหนหรอ? (ชิกิ patch 2.0.6): มีชิกิที่ถือชาร์จยกเลิกท่าไม้ตาย (godslay) อยู่บนสนาม
//  -> ท่าไม้ตายของผู้เล่นอื่นถูกยกเลิก (แต้มสกิลเสียฟรี — ไม่คืน)
//  วีดีโอเล่นเฉพาะ "ครั้งแรกของเจ้าของท่าคนนั้น" — โดนยกเลิกครั้งถัดไปเป็นแค่การแจ้งเตือน
//  คืนค่า true = มีวีดีโอเข้าคิว (ผู้เรียกต้องพัก/เล่นคิวเอง)
function shikiCancelUltimate(slayer, victim, skillName, skillImg) {
  delete slayer.statuses.godslay; // ใช้ได้ 1 ครั้งต่อการชาร์จ (สะสมไม่ได้)
  const t = TRANSFORMS.shikiSeal;
  lastLog.push(`👁️🗡️ ${slayer.name} นายมีฝีมือแค่ไหนหรอ? — ยกเลิกท่าไม้ตาย ${skillName} ของ ${victim.name}! (แต้มสกิลเสียฟรี)`);
  if (!victim.cutsceneShown.shikiSeal) {
    victim.cutsceneShown.shikiSeal = true; // ครั้งแรกของเจ้าของท่าคนนี้ = เล่นวีดีโอเต็ม
    cutsceneQueue.push({
      seconds: t.seconds,
      info: {
        playerId: victim.id, name: victim.name,
        img: skillImg || displayImg(victim), // ภาพสกิลท่าไม้ตายที่โดนยกเลิก
        img2: displayImg(victim),            // ภาพเจ้าของท่าที่โดน
        color: POSITION_COLORS[slayer.position] || "#9B4F96",
        video: t.video, title: t.title, label: `ถูก ${slayer.name} ยกเลิกท่าไม้ตาย`,
      },
    });
    return true;
  }
  // เคยโดนยกเลิกแล้ว: แจ้งเตือนเล็กๆ ว่าชิกิยกเลิกท่าไม้ตายของใคร ไม่หยุดเกม
  io.emit("transformNotice", {
    playerId: victim.id, name: slayer.name,
    img: skillImg || SHIKI_PROFILE_IMG, color: POSITION_COLORS[slayer.position] || "#9B4F96",
    title: t.title, label: `ยกเลิกท่าไม้ตาย ${skillName} ของ ${victim.name}`,
  });
  return false;
}

// ไพ่แตกก่อนเปิดไพ่ = ท่าไม้ตายที่เพิ่งกดในเทิร์นนี้ใช้งานไม่ได้ (แต้มสกิลที่จ่ายไปเสียฟรี)
function voidUltimateOnBust(p) {
  for (const key of Object.keys(TRANSFORMS)) {
    if (!TRANSFORMS[key].afterReveal) continue; // เฉพาะท่าไม้ตาย (ginga / paradise)
    if ((p.statuses[key] || 0) > 0 && !p.seen[key]) {
      delete p.statuses[key];
      lastLog.push(`💥 ${p.name} ไพ่แตก! ท่าไม้ตาย ${TRANSFORMS[key].title} ใช้งานไม่ได้ — แต้มสกิลเสียฟรี`);
    }
  }
  // ANATA WAAAAAAAA (เทมาริ): ผู้ใช้ไพ่แตกเอง = ท่าไม้ตายเป็นโมฆะ
  if ((p.statuses.anata || 0) > 0 && p.anataTargets) {
    delete p.statuses.anata;
    p.anataTargets = null;
    anataMusicSeq = 0;
    lastLog.push(`💥 ${p.name} ไพ่แตก! ท่าไม้ตาย ANATA WAAAAAAAA ใช้งานไม่ได้ — แต้มสกิลเสียฟรี`);
  }
}

function resetRoundDisplay(p) {
  p.dmgHp = 0; p.dmgArmor = 0; p.gainedSkill = 0;
  p.wasAttacked = false; p.isWinner = false; p.isLoser = false;
}
function resetCombat(p) {
  p.ready = false; // ห้องรอ: ต้องกดพร้อมใหม่ทุกครั้งที่กลับมาห้องรอ/เริ่มแมตช์ใหม่
  p.skillPoints = 0; p.alive = true; p.shield = 0;
  p.statuses = {}; p.seen = {}; p.ntdTarget = null; p.transformAt = 0; p.beatAt = 0;
  // ---------- บานาจ ลิงก์ (patch 2.1.2) ----------
  p.ntdRivalId = null;      // สกิลติดตัว 2: เป้าแก้แค้นพิเศษใส่ริดดี้ (ไม่ใช่พันธมิตร)
  p.bshieldOwnerId = null;  // Absorb shield: เจ้าของสกิลที่จะได้รับการฟื้นเลือดเมื่อโล่แตก
  p.riddheNtdLinked = null; // (ริดดี้) id บานาจที่มอบ NT-D System ให้ฟรีจาก NewType Paradise — ผูกอายุ
  p.statusAmt = {};      // จำนวน (amount) ของบัฟ/ดีบัฟพื้นฐาน (patch 2.0.8) — คู่กับ p.statuses
  p.armorLocked = false; // Beat Mode: กันตายแล้วเกราะจะไม่ฟื้นคืน
  p.beatSaved = false;   // Beat Mode: กันตายได้ครั้งเดียวต่อเกม (คล้าย Focus Sash)
  p.skillUsedRound = false; // ใช้สกิลได้ 1 อันต่อเทิร์น
  p.beamAmmo = BEAM_AMMO; // กระสุน Beam Magnum รีเซ็ตต้นเกม
  p.puddingCount = 0; // Rainbow Pudding: จำนวนครั้งที่กินสะสม (ไม่จำกัดจำนวนครั้ง — ครบทุกๆ 3 ครั้งจะอิ่ม)
  p.rsHopperRegenTimer = 0; // RS-Hopper (เอวา 13): นับเทิร์นสำหรับฟื้นชาร์จ (ครบ 3 = ฟื้น 1 ชาร์จ)
  if (p.characterId === "eva13") p.statuses.rsHopper = EVA13_RSHOPPER_MAX; // RS-Hopper: เริ่มเกมเต็ม 3 ชาร์จ
  // ---------- ร้านค้ามายา + เศรษฐกิจเหรียญ (patch 2.2 full) ----------
  p.gold = 0;        // เหรียญสะสม (เพดาน 30)
  p.inventory = [];  // ของที่ซื้อจากร้านค้ามายา รอใช้
  // ---------- DoomGuy (patch 2.2 full) ----------
  if (p.characterId === "doomguy") p.doomWeapon = DOOM_STARTING_WEAPON; // เริ่มเกมได้ Combat Shotgun เสมอ
  p.doomQuickSwapUsed = false; // Quick Swap: 1 ครั้งต่อเทิร์น
  p.doomCharge = 0;            // ชาร์จสำหรับปลดล็อก Crucible (ครบ 5)
  p.doomChaingunShieldUsed = false; // Chaingun's [ใช้ได้ครั้งเดียว]: รีเซ็ตทุกครั้งที่เปลี่ยนอาวุธ
  // ---------- สึงาชิ ทาคุโตะ (patch 2.2 new) ----------
  p.takutoComboReady = false; // Saphir+Emeraude ร่วมกัน: รอ postAttackFollowup อ่านเพื่อโจมตีเพิ่มอีกครั้ง (patch 2.2.3 — เดิมเก็บเป็นโอกาส 50/50)
  p.takutoUlt2VideoPending = false; // อย่างนายน่ะ จะไปเข้าใจอะไร: รอโจมตีจริงครั้งถัดไปแล้วค่อยเล่นวีดีโอ
  p.takutoAwakenAt = 0;          // สกิลติดตัว 1 กันตายทำงานแล้ว: ลำดับสำหรับเพลง/ภาพซ้อนทับ (ถ้ามีทาคุโตะหลายคน)
  p.tonkatsu = 0;         // เทมาริ: ชามทงคัสสึที่กินสะสม (สูงสุด 3 — Song for you ล้างตอนใช้)
  p.songAtk = 0;          // Song for you: พลังขิงที่ล็อกไว้ตอนใช้สกิล (สูงสุด 2)
  p.noDrawNext = 0;       // จำนวนเทิร์นที่จั่วเพิ่มไม่ได้ เริ่มเทิร์นถัดไป (ทงคัสสึ / กำไรเท่าตัวโว้ย)
  p.noSkillNext = 0;      // จำนวนเทิร์นที่ใช้สกิลไม่ได้ เริ่มเทิร์นถัดไป (หอกลองกินัส เอวา 13)
  p.gamblerUses = GAMBLER_USES; // แกมเบลอร์: วอสก้าหน่อยน้อง 3 ครั้งต่อเกม (เวลาทองรีเซ็ตให้เต็ม)
  p.profit = 0;           // แกมเบลอร์: บัฟกำไรเท่าตัวโว้ย (+โจมตี, ทะลุเกราะ) สะสมจนกว่าจะได้ตี
  p.tempHp = 0;           // แกมเบลอร์: เลือดชั่วคราวจากฮีลล้น
  p.tempHpTurns = 0;      // เลือดชั่วคราวหายเองเมื่อครบ 2 เทิร์น
  p.anataTargets = null;  // เป้าหมาย ANATA WAAAAAAAA (ลับจนกว่าจะเปิดไพ่)
  p.sunriseDrop = 0; // โอเบรอน: จำนวนเทิร์นที่พลังชีวิตจะลดลงเทิร์นละ 1 อัตโนมัติ (หลังโดนฮีล 5)
  p.sleepFresh = false; // หลับไหล: เทิร์นที่เพิ่งโดนกล่อมยังไม่เริ่มนับ/ยังโจมตีได้
  p.appleItem = "drink"; // Apple guy: ของส่งมอบที่เลือกอยู่ (ค่าเริ่มต้น เครื่องดื่มชูกำลัง)
  p.appleAtkBuffs = [];  // Apple guy: บัฟพลังโจมตีจากการมอบของ — 1 หน่วย/ครั้ง (สูงสุด 2 หน่วย) นับถอยหลังแยกกัน 5 เทิร์น/หน่วย
  p.chillDodge = 100;    // Apple guy: อัตราหลบขณะชิวๆครับน้องๆ (%) — รีเซ็ตเมื่อเปิดท่าไม้ตายใหม่
  p.appleGiveUses = CHAR_HOOKS.appleguy.GIVE_USES; // Apple guy: จำนวนใช้ เอาไปสิ (เติมจากสกิลติดตัวเมื่อหลบสำเร็จ — ไม่สามารถซ้อนทับได้ เกินเพดานตัดทิ้ง)
  // ---------- ฟุจิตะ โคโตเนะ (patch 1.9.1) ----------
  p.coins = 0;            // กระปุกออมสินน้องหมูน้อย: coin สะสม (สูงสุด 6)
  p.nightWork = 0;        // จำนวนครั้งที่ทำงาน Part-time ในเฟสกลางคืนนี้ (>1 = โหมงานหนัก)
  p.overworkNext = false; // ติด [โหมงานหนัก] ตอนเริ่มเทิร์นถัดไป
  p.senaNext = false;     // เจอท่านประธานเซนะจัง -> เทิร์นถัดไปทำอะไรไม่ได้เลย
  // ---------- เจ้าแห่งเน็ตบ้าน (patch 1.9) ----------
  p.contractPartner = null; // เจ้าแห่งเน็ตบ้าน: id คู่สัญญาปัจจุบัน (มีได้ 1 คน)
  p.contractWith = null;    // ฝั่งคู่สัญญา: id เจ้าแห่งเน็ตบ้านที่ทำสัญญาด้วย
  p.contractOffer = null;   // ข้อเสนอที่ยื่นไว้ รอเป้าหมายตอบ (id เป้าหมาย)
  p.contractTurns = 0;      // จำนวนเทิร์นที่คู่สัญญาใช้งานมาแล้ว (ครบทุก 3 = ถามต่อสัญญา)
  p.renewPending = false;   // ฝั่งคู่สัญญา: กำลังถูกถามต่อสัญญาในเทิร์นนี้
  p.skillDrain = 0;         // โดนปฏิเสธค่าปรับ: แต้มสกิลจบเทิร์นลด 1 (จำนวนเทิร์นที่เหลือ)
  p.skillDrainPending = 0;  // ค่าปรับเริ่มนับเทิร์นถัดไป (ย้ายเข้า skillDrain ตอนเริ่มเทิร์นใหม่)
  p.healNextTurn = 0;       // เสือนอนกิน: ฟื้นเลือด 1 หน่วยในเทิร์นถัดไป (กรณีไม่มีคู่สัญญา)
  p.unplugHold = null;      // กระชากสายแลน: บัฟที่ถูกถอดชั่วคราว (คืนให้ตอนจบเทิร์น)
  // ---------- ชเรด เอลัน (patch พิเศษ) ----------
  p.shradeForm = false;     // รวมร่างทำนองเพลงแล้ว (อควาเรียน สปาด้า — ถาวร โจมตี +2)
  // (patch พิเศษ: ราตรีของชเรดไม่ถาวรแล้ว — ใช้ nightResetPending รีเซ็ตกลางคืน 3 เทิร์นแทน)
  // ---------- Bard : คีตกวี (patch 2.2) ----------
  p.bardNotes = [];         // โน้ตในช่องประพันธ์เพลง (["R","J",...] สูงสุด 3 — ครบแล้วบรรเลงทันที)
  p.bardNotesUsed = 0;      // จำนวนโน้ตที่เติมในเทิร์นนี้ (จำกัด 2 — มิติโลหิตไม่จำกัด)
  p.bardPending = null;     // บทเพลงที่รอเลือกเป้าหมาย { pattern, name, need, allowSelf }
  p.bloodSection = 0;       // ท่อนทำนองแห่งโลหิต (ครบ 5 = มิติมายาบรรเลงโลหิต)
  p.soulSection = 0;        // ท่อนทำนองแห่งวิญญาณ (ครบ 5 = มิติมายาบรรเลงวิญญาณ)
  p.linkedWith = null;      // Resonance: id ผู้เล่นที่ถูกเชื่อมผลด้วย
  // ---------- ไค ชิซากิ (kai) ----------
  p.kaiLinkWith = null;     // เชื่อมต่อ (Overhaul#1): id คู่เชื่อม (มิเรอร์กัน — แยกจาก linkedWith ของ Bard)
  p.kaiRivalId = null;      // โทสะระงับด้วยโทสะ (Overhaul#3): id คู่ปรับที่ถูกบังคับโจมตี
  p.kaiSkillUsesRound = 0;   // มือซ้ายแห่งการรังสรรค์/มือขวาแห่งการลงทัณฑ์: งบรวม 2 ครั้งต่อเทิร์น ผสมกันได้อิสระ (เช่น รังสรรค์ 2 ครั้ง, หรือ 1+1)
  // ---------- ผู้สังหารจอมมหาเวทย์ (mageslayer) ----------
  p.mageslayerMarkedId = null;      // ตราล่าเวท: id เป้าหมายที่มาร์กอยู่ (เคลื่อนย้ายได้)
  p.mageslayerHasMarked = false;    // เคยใช้ Witch Mark หรือยัง (ถาวร — ขับเคลื่อนภาพโปรไฟล์ MS01→MS02)
  p.mageslayerRuptureTargetId = null; // Mana Rupture: เป้าหมายที่เล็งไว้ (ผลทำงานหลังเปิดไพ่)
  p.mageslayerLockedBurden = false; // Mana Burden: Bard ที่ติดตราล่าเวทตอนโดน — ล้าง spellburden ไม่ได้แม้ต้านสถานะ
  // ---------- ทาคุมิ ฟุจิวาระ (takumi) ----------
  p.takumiGear = 1;             // เกียร์ธรรมดา: 1-6 เริ่มเกม 1
  p.takumiSkillUsesRound = 0;   // งบสกิลรวม 5 ครั้ง/เทิร์น (พื้นฐาน/รอง/ท่าไม้ตาย ผสมกันได้อิสระ)
  p.takumiBlackoutFired = false; // ถึงจะมองไม่เห็น แต่ฉันยังอยู่: กันยิงซ้ำระหว่างสถานะเดียวกันยังทำงานอยู่
  // ---------- เรียวกิ ชิกิ (patch 2.0.6) ----------
  //  p.shikiUlt คงไว้ตามที่เลือกตอนเข้าห้อง (deatheye | wither) — ไม่รีเซ็ตระหว่างแมตช์
  p.witherAdded = 0;        // เส้นชีวิตที่ความตายที่โรยราแจกให้คนนี้ (สูงสุด 3 — จบท่าแล้วลบออกคืน)
  // ---------- โอกูริ แคป (Rework) ----------
  p.oguriEnergy = OGURI_ENERGY_START; // Energy: เริ่มเกมได้รับ 8 แต้ม (สะสมสูงสุด 16)
  p.stamina = 0;             // Stamina ชาร์จ: เริ่มเกม 0 หน่วย ได้รับอัตโนมัติทุกเทิร์น
  p.oguriChargeCapBonus = 0; // ความจุ Stamina ชาร์จที่เพิ่มจาก Training (สะสมสูงสุด +48)
  p.oguriZoneTurns = 0;     // นับเทิร์นระหว่างร่าง Zone (แต้มสกิล +1 ทุก 2 เทิร์น)
  p.staggerNext = 0;        // ติดชะงักตอนเริ่มเทิร์นถัดไป (จาก The Beat of Victory)
  // ---------- ซาโตรุ อาเคฟุ (patch 2.0.8.2) ----------
  p.maxHpPenalty = 0;       // Locacaca fruit: Max HP ที่ถูกลดถาวร (ของทุกคน — โดนผลไม้ได้)
  p.wouGuardCd = 0;         // สกิลติดตัวลบล้าง — คูลดาวน์ 2 เทิร์นต่อการใช้ (patch 2.0.8.3)
  p.calamityDraw = 0;       // [Calamity]: จำนวนไพ่ที่ถูกบังคับจั่วตอนเริ่มเทิร์นถัดไป
  p.locaOffer = null;       // ข้อเสนอผลโลกากากาที่ยื่นไว้ รอเป้าหมายตอบ (id เป้าหมาย)
  // ---------- ริดดี้ มาร์เซนาส (patch 2.0.9) ----------
  p.allyPrompt = false;      // Event เริ่มเกม: รอริดดี้เลือกยื่นข้อเสนอพันธมิตร/เดินเส้นทางเดี่ยว
  p.allyOffer = null;        // ข้อเสนอพันธมิตรที่ยื่นไว้ รอบานาจตอบ (id เป้าหมาย)
  p.allyId = null;           // พันธมิตรบันชี × ยูนิคอร์น (ลิงก์ทั้งสองฝั่ง — ฝั่งริดดี้และฝั่งบานาจ)
  p.allyBreakAsk = null;     // ถูกคู่พันธมิตรตี -> รอเลือกยกเลิกพันธมิตรไหม { by, hp, armor }
  p.allyFinalAsk = false;    // เหลือแค่คู่พันธมิตรบนสนาม -> ริดดี้เลือกชนะทั้งคู่/สู้ต่อ
  p.riddheGrudge = 0;        // สกิลติดตัว 1: นับเทิร์นที่บานาจไม่โจมตีเรา (ครบ 3 = NT-D ฟรี)
  p.riddhePassiveUsed = false; // สกิลติดตัว 1: ท่าไม้ตายฟรีใช้ไปแล้ว (1 ครั้งต่อเกม)
  p.riddheAvenger = false;   // สกิลติดตัว 3 ทริกเกอร์แล้ว (ถาวร: โจมตี +1 / สกิลติดตัว 1 ใช้กับทุกคน / ร่างดำมืด / ท่า 1 ไม่เติมกระสุน)
  p.riddheGuardArmorLost = 0; // ท่าไม้ตาย 2: เกราะที่เสียสะสม (เรา+บานาจ) ระหว่างท่าทำงาน
  p.riddheGuardHealed = false; // ท่าไม้ตาย 2: ฟื้นเกราะ+วีดีโอพิเศษทำงานแล้ว (ครั้งเดียวต่อการเปิด)
  p.riddheSaveLoggedRound = 0; // กันตายบานาจ: log แจ้งครั้งเดียวต่อเทิร์น
  // ---------- ริต้า เบอร์นัล / ฟีนิกซ์ (patch 2.1.6) ----------
  p.phenexPain = 0;             // ไม่อยากให้ใครต้องเจ็บปวด: ความเจ็บปวดสะสม (ปลดปล่อยตอนตกรอบจริง)
  p.phenexReborn = false;       // ถ้าเลือกได้ อยากเกิดเป็นอะไรหรอ?: เกิดใหม่ไปแล้วหรือยัง (1 ครั้งต่อเกม)
  p.phenexNtdPermanent = false; // เปิด NTD-Sytem ถาวรฟรีจากสกิลติดตัว 1 (แทนสถานะนับเทิร์นปกติ)
  p.phenexLastHitBy = null;     // id ผู้โจมตีล่าสุดที่ทำให้เสียเลือด/เกราะ — ใช้เลือกเป้าปลดปล่อยความเจ็บปวด
  p.phenexReleaseAsk = null;    // ขอแค่ได้พบกันอีก: รอเลือกเป้าหมายปลดปล่อยความเจ็บปวด { pain, options: [id] }
  p.phenexTauntGrace = false;   // ไม่อยากให้ใครต้องเจ็บปวด: ตายเทิร์นที่ท่าไม้ตายหมดเวลาพอดี ยังนับว่าตายขณะทำงาน (patch 2.1.7)
  p.nightTaxTier = null;        // กลางคืน (patch 2.1.7): สกิลที่สุ่มโดนคืนนี้ใช้แต้มมากขึ้น +1 ("basic" | "secondary" | null)
  p.evadeStacks = [];            // หลบหลีก (สถานะ Universal): แต่ละสแตคมีอายุ EVADE_STACK_TURNS เทิร์นของตัวเอง
  p.fortuneIdle = 0;             // โชคลาภ (Bard patch 2.1.7): นับเทิร์นที่ไม่ได้ใช้ (ครบ 3 = หมดฤทธิ์เอง)
  p.tohnoLevel = 1;              // โทโนะ ชิกิ (patch 2.1.7): ระดับมีดพับประจำตระกูล 1-5 (1 = ปิดสกิลติดตัว, ค่าเริ่มต้น)
  // ---------- นานายะ ชิกิ (patch 2.1.9) ----------
  p.nanayaEyeOn = false;          // Mystic eye of death perception: เปิด/ปิดได้ระหว่างเกม (ค่าเริ่มต้นปิด)
  p.nanayaToggleUsed = false;     // เปิด/ปิดได้แค่ 1 ครั้งต่อเทิร์น (รีเซ็ตทุกเทิร์นใหม่)
  p.nanayaMissedThisAttack = false; // ใช้ภายในการโจมตีปัจจุบัน: เนตรมารพลาด -> เปิดโอกาสหัวใจฆาตกร
  p.nanayaReattackReady = false;  // หัวใจฆาตกร: กำลังรอเลือกโจมตีซ้ำ/ยกเลิกอยู่
  p.nanayaRestTurn = 0;           // พักผ่อนสักครู่: นับเทิร์น (ครบ 2 = ฟื้นเลือด)
  // ---------- เทเปา (ชิกิ) (patch 2.2 new) ----------
  p.tepeuCookTurns = 0;   // วันนี้อากาศดีจัง: นับถอยหลังทำอาหาร (0 = ไม่ได้ทำอยู่ กดใช้ได้)
  p.tepeuPonderTurns = 0; // เป็นแบบนี้นี่เอง: นับถอยหลังครุ่นคิด (0 = ไม่ได้ครุ่นคิดอยู่ กดใช้ได้/จั่วไพ่ได้)
  p.tepeuEyeTurns = 0;    // นายเป็นคนทำตัวเองนะ: ฉากหลัง/เพลงจบ (แบบโทโนะ ชิกิ) คงอยู่กี่เทิร์น
  p.tepeuLoseStreak = 0;  // แพ้ติดกันกี่เทิร์นแล้ว (ครบเกิน 3 = เส้นชีวิตลด 1 — รีเซ็ตทุกครั้งที่ชนะ)
  p.tepeuKillTargetId = null; // นายเป็นคนทำตัวเองนะ: เป้าหมายที่เล็งไว้ รอผลหลังเปิดไพ่ (afterResolve)
  // ---------- อาริมะ มิยาโกะ (patch 2.2.0) ----------
  p.miyakoComboHits = 0;          // เพลงหมัด อาริมะ: จำนวนครั้งที่ตีไปแล้วในคอมโบปัจจุบัน
  p.miyakoKillResist = 0;         // นั่นพี่จ๋าหรอ?: จำนวนชั้นที่สะสม (ลดโอกาสถูกสังหารทันที 40%/ชั้น)
  // ---------- คิชินามิ ฮาคุโนะ (patch 2.2.1) ----------
  p.hakunoGender = "male";        // เธอ/นาย คือฉันหรอ?: เพศปัจจุบัน (male | female — เริ่มเกมเป็นชายเสมอ)
  p.hakunoGenderSwitched = false; // สลับเพศได้อีก 1 ครั้งในเทิร์นนี้หรือยัง
  p.hakunoRestTurn = 0;           // ร่างชาย: นับเทิร์น (ครบ 2 = ฟื้นเลือด)
  p.hakunoMoonPoints = 0;         // แต้มคำสาปแห่งดวงจันทร์ สะสม (ครบ 3 = เปิด MOON*CELL ได้)
  p.hakunoLowDraw = false;        // ข้าขอบัญชา (หญิง): จั่วเพิ่มเทิร์นนี้ได้แค่ 2/3 แต้ม
  p.hakunoCommandUses = HAKUNO_COMMAND_USES; // อาคมบัญชาระดับ EX+: ใช้ได้ 3 ครั้งต่อเกม
  p.moonCellBackup = null;        // MOON*CELL: บัฟ/ดีบัฟที่ถูกล้างไว้ชั่วคราวของผู้เล่นอื่น (คืนให้ตอนหมดฤทธิ์)
  p.cutsceneShown = {}; // เล่นวีดีโอครั้งเดียวต่อเกม (per match)
  // เลือด/เกราะเริ่มเกม: คำนวณหลังรีเซ็ต statuses/maxHpPenalty/hakunoGender แล้วเท่านั้น
  // (maxHpOf/maxArmorOf อ่านค่าพวกนี้ — คำนวณก่อนหน้านั้นจะติดค่าเก่าจากแมตช์ที่แล้ว)
  p.hp = maxHpOf(p);
  p.armor = maxArmorOf(p);
}


// ============================================================
//  ส่งสถานะ
// ============================================================
// สถานะที่ผู้เล่นคนอื่นเห็นได้ระหว่างช่วงจั่วการ์ด (patch 1.7.1): โชว์ให้ดูของกันและกันได้
//  ยกเว้นสกิลหลังเปิดไพ่ที่เพิ่งกดรอไว้ในเทิร์นนี้ — เปิดเผยเมื่อทำงานแล้วเท่านั้น (กันสปอยล์)
const HIDDEN_UNTIL_REVEAL = ["beam", "ohger", "absorb", "spear", "nightmare", "beamplus", "unibeam2"];
function publicStatuses(p) {
  const out = {};
  for (const [k, v] of Object.entries(p.statuses || {})) {
    if (TRANSFORMS[k] && TRANSFORMS[k].afterReveal && !(p.seen && p.seen[k])) continue;
    if (HIDDEN_UNTIL_REVEAL.includes(k)) continue;
    out[k] = v;
  }
  if (p.ntdTarget || p.ntdRivalId) out.ntd = 1;
  return out;
}
function buildStateFor(viewerId) {
  const revealAll = gameState !== "PLAYING" && gameState !== "LOBBY";
  // เพลง ANATA WAAAAAAAA ทับทุกเพลงระหว่างช่วงจั่วการ์ด — จบลงเมื่อทุกคนพร้อมเปิดไพ่แล้ว
  const nightNow = isNightRound(roundNumber);
  // ราตรีกลืนกิน: เปิดเมื่อโอเบรอนใช้ท่าไม้ตาย 2 (Lie Like Vortigern) — ฉากหลังกลางคืนกลายเป็น
  //  วีดีโอ oberon_background.mp4 + เพลงประจำตัวเล่นค้าง และหายไปเมื่อหมดกลางคืน
  const oberonBg = nightNow && oberonDevour > 0;
  // ราตรีถาวรของชเรด เอลัน: ฉากหลังกลายเป็น change_fill.jpg จนกว่าชเรดจะหมดสภาพต่อสู้
  const shradeBg = CHAR_HOOKS.shrade_elan.bgActive(engine); // กลางคืน + มีชเรดร่างสปาด้า = ฉากหลังราตรีของชเรด
  // MOON*CELL (คิชินามิ ฮาคุโนะ patch 2.2.1): ฉากหลังกลายเป็น hakuno_fill.jpg ระหว่างท่าไม้ตายทำงาน
  const hakunoBg = Object.values(players).some((p) => p.characterId === "hakuno" && (p.statuses.moonCell || 0) > 0);
  // ฉันมองเห็นมันแล้ว (ชิกิ): ภาพ shiki_fill.png ซ้อนทับฉากหลัง | ความตายที่โรยรา: ฉากหลังวีดีโอ shiki_fill2.mp4
  //  โทโนะ ชิกิ (patch 2.1.7): มีดพับประจำตระกูล ระดับ 2 ขึ้นไป — ใช้ภาพซ้อนทับเดียวกับ "eye" (shiki_fill.png)
  //  นานายะ ชิกิ (patch 2.1.9): Mystic eye of death perception เปิดใช้งาน — ใช้ภาพซ้อนทับเดียวกัน (shiki_fill.png)
  const shikiBg = Object.values(players).some((p) => p.alive && p.characterId === "shiki" && (p.statuses.wither || 0) > 0)
    ? "wither"
    : Object.values(players).some((p) => p.alive && (
        (p.characterId === "shiki" && (p.statuses.deatheye || 0) > 0) ||
        (p.characterId === "tohno" && (p.tohnoLevel || 1) >= 2) ||
        (p.characterId === "nanaya" && p.nanayaEyeOn) ||
        (p.characterId === "tepeu" && (p.tepeuEyeTurns || 0) > 0)
      ))
      ? "eye" : null;
  // มิติมายาบรรเลง (Bard): ฉากหลังเปลี่ยนตามสายมิติ "blood" | "soul" | null
  const bardCycleNow = CHAR_HOOKS.bard.dimCycle(engine);
  const bardBg = bardCycleNow === "day" ? "blood" : bardCycleNow === "night" ? "soul" : null;
  // ยูนะ: เพลงล็อกทั้งสนาม ชนะทุกอย่างรวมถึง ANATA WAAAAAAAA ตลอด "ทุกเฟส" ของรอบ (จั่วไพ่/สรุปคะแนน/โจมตี) จนกว่าจะหมดเวลา
  //  ไม่ผูกกับ gameState==="PLAYING" เหมือน anata เพราะเอฟเฟกต์ยูนะไม่ได้จำกัดแค่ช่วงจั่วไพ่ — ตอน CUTSCENE ฝั่ง client เงียบเพลงเองอยู่แล้วไม่ต้องกันซ้ำที่นี่
  let sm = (yunaEffect && roundNumber <= yunaWindowEnd)
    ? { music: YunaMod.YUNA_MUSIC[yunaEffect], at: yunaMusicSeq }
    : (gameState === "PLAYING" && anataMusicSeq)
      ? { music: "temari_final_theme", at: anataMusicSeq }
      : activeSkillMusic();
  if (!sm && oberonBg) sm = { music: "oberon", at: oberonDevour }; // เพลงสกิล/ท่าไม้ตายอื่นยังทับได้
  // ข้อเสนอ/คำถามต่อสัญญา (เจ้าแห่งเน็ตบ้าน) ที่รอ "ผู้ชม state คนนี้" ตอบ — โชว์เฉพาะช่วงจั่วการ์ด
  const viewer = players[viewerId];
  let contractOffer = null;
  let renewAsk = null;
  let locaOffer = null;
  if (gameState === "PLAYING" && viewer && viewer.alive) {
    const offerer = Object.values(players).find((o) => o.alive && o.contractOffer === viewerId);
    if (offerer) contractOffer = { from: offerer.name, color: POSITION_COLORS[offerer.position] || "#9B4F96", img: "/characters/broadband_man/broadband_man_skill3.jpg" };
    if (viewer.renewPending) {
      const boss = CHAR_HOOKS.broadband_man.contractBoss(engine, viewer);
      if (boss) renewAsk = { from: boss.name, fee: CONTRACT_FEE, color: POSITION_COLORS[boss.position] || "#9B4F96", img: "/characters/broadband_man/broadband_man.jpg" };
    }
    // Locacaca fruit (ซาโตรุ patch 2.0.8.2): ข้อเสนอผลไม้ที่รอผู้ชม state คนนี้ตอบ
    const locaFrom = Object.values(players).find((o) => o.alive && o.locaOffer === viewerId);
    if (locaFrom) locaOffer = { from: locaFrom.name, steal: CHAR_HOOKS.satoru.LOCA_STEAL, color: POSITION_COLORS[locaFrom.position] || "#9B4F96", img: "/characters/satoru/locaca.png" };
  }
  // ริต้า เบอร์นัล: ขอแค่ได้พบกันอีก — เลือกเป้าหมายปลดปล่อยความเจ็บปวด (ใช้ได้แม้ตกรอบไปแล้ว/ทุกเฟส)
  let phenexReleaseAsk = null;
  if (viewer && viewer.phenexReleaseAsk) {
    const options = viewer.phenexReleaseAsk.options
      .map((id) => players[id])
      .filter((o) => o && o.alive)
      .map((o) => ({ id: o.id, name: o.name, color: POSITION_COLORS[o.position] || "#9B4F96", img: displayImg(o) }));
    if (options.length) phenexReleaseAsk = { pain: viewer.phenexReleaseAsk.pain, options };
  }
  // สมุดการ์ดกองกลาง: การ์ดทั้ง 43 ใบตามลำดับคงที่ + ใบไหนถูกจั่วไปแล้วในรอบนี้ (centralDeck สับใหม่ทุกรอบ — สมุดนี้จึงนับเฉพาะรอบปัจจุบัน)
  const remainingCardKeys = new Set(centralDeck.map(cardKey));
  const deckLedger = canonicalDeckCards().map((c) => ({ ...c, drawn: !remainingCardKeys.has(cardKey(c)) }));
  // ---------- ริดดี้ มาร์เซนาส (patch 2.0.9): popup ระบบพันธมิตร (ดู characters/riddhe.js's buildViewerState) ----------
  let allyChoices = null, allyOfferAsk = null, allyBreakAskUi = null, allyFinalAskUi = null;
  if (gameState === "PLAYING" && viewer && viewer.alive) {
    ({ allyChoices, allyOfferAsk, allyBreakAsk: allyBreakAskUi, allyFinalAsk: allyFinalAskUi } =
      CHAR_HOOKS.riddhe.buildViewerState(engine, viewer, RIDDHE_BANSHEE_IMG));
  }
  return {
    allyChoices,   // ริดดี้: รายชื่อบานาจให้เลือกยื่นข้อเสนอพันธมิตร
    allyOfferAsk,  // บานาจ: ข้อเสนอพันธมิตรที่รอเราตอบ
    allyBreakAsk: allyBreakAskUi, // ฝ่ายถูกคู่พันธมิตรตี: เลือกยกเลิกพันธมิตรไหม
    allyFinalAsk: allyFinalAskUi, // ริดดี้: เหลือแค่คู่พันธมิตร — คงพันธมิตร = ชนะทั้งคู่
    allyWin: allyWinFlag,         // จบเกมแบบชนะทั้งคู่ (สกิลติดตัว 2 ริดดี้)
    contractOffer, // ข้อเสนอสัญญาที่รอเราตอบ (สนใจใช้บริการเราไหม)
    renewAsk,      // คำถามต่อสัญญาที่รอเราตอบ (ชำระค่าบริการ)
    locaOffer,     // ข้อเสนอผลโลกากากาที่รอเราตอบ (ซาโตรุ)
    phenexReleaseAsk, // ริต้า เบอร์นัล: เลือกเป้าหมายปลดปล่อยความเจ็บปวด (ขอแค่ได้พบกันอีก)
    // นานายะ ชิกิ (patch 2.1.9): หัวใจฆาตกร — กำลังรอเลือกโจมตีซ้ำ/ยกเลิกอยู่ (เฉพาะผู้เล่นที่เป็นเจ้าของสิทธิ์นี้)
    nanayaReattack: !!(viewer && viewer.nanayaReattackReady && gameState === "ATTACK" && attackerId === viewer.id),
    gameState,
    timeLeft,
    roundNumber,
    cycle: nightNow ? "night" : "day", // กลางวัน/กลางคืน (สลับทุก 3 เทิร์น)
    oberonBg,
    shradeBg, // ราตรีของชเรด เอลัน (ฉากหลัง change_fill.jpg — ทุกค่ำคืนที่ยังอยู่ในร่างสปาด้า)
    hakunoBg, // MOON*CELL (คิชินามิ ฮาคุโนะ): ฉากหลัง hakuno_fill.jpg ระหว่างท่าไม้ตายทำงาน
    bardBg,   // มิติมายาบรรเลง (Bard): "blood" | "soul" | null
    shikiBg,  // ฉันมองเห็นมันแล้ว (ชิกิ): ซ้อน shiki_fill.png ทับฉากหลังปัจจุบัน
    maxPlayers: MAX_PLAYERS,
    youId: viewerId,
    attackerId: gameState === "ATTACK" ? attackerId : null,
    winnerId: (gameState === "SUMMARY" || gameState === "ATTACK") ? roundWinnerId : null,
    skillMusic: sm ? sm.music : null,
    skillMusicSeq: sm ? sm.at : 0, // เปลี่ยน = การเปิดร่างครั้งใหม่ -> client เริ่มเพลงใหม่
    yunaFieldFx: (yunaEffect === "beatbark" && roundNumber <= yunaWindowEnd) ? "beatbark" : null, // Break Beat Bark!: ออร่าขอบจอแดงทั้งสนาม
    cutscene: gameState === "CUTSCENE" ? cutsceneInfo : null,
    attack: gameState === "ATTACKING" ? lastAttack : null,
    log: (gameState === "SUMMARY" || gameState === "TRANSITION" || gameState === "GAMEOVER") ? lastLog : [],
    shop: shopItems, // ร้านค้ามายา (patch 2.2 full): สินค้าส่วนกลาง เห็นเหมือนกันทุกคน
    deckLedger, // สมุดการ์ด 43 ใบ + สถานะจั่วแล้ว/ยัง (ของรอบปัจจุบัน) — กดที่กองการ์ดกลางเพื่อดู
    players: Object.values(players).map((p) => {
      const mine = p.id === viewerId;
      const show = mine || revealAll;
      // ทาคุมิ ฟุจิวาระ: ถึงจะมองไม่เห็น แต่ฉันยังอยู่ ทำงานอยู่ — บังตากระดานทั้งหมด (score/cards/hp/armor/shield ของทุกคนรวมตัวเอง, แต้มสกิลของทุกคนยกเว้นตัวเอง)
      const takumiBlackout = takumiBlackoutActive();
      // ใบโปรโมทสินค้า (Apple guy): แต้มการ์ดของคนติดสถานะถูกเปิดเผยให้ทุกคนเห็น (1 เทิร์น)
      const promoShow = (p.statuses.promo || 0) > 0;
      // นายยังมีอนาคตอีกยาวไกล (ริดดี้ patch 2.0.9): คู่พันธมิตรเห็นแต้มการ์ดของกันและกันได้ตลอด
      const allyShow = !!(viewer && viewer.alive && p.alive && p.allyId === viewer.id && viewer.allyId === p.id);
      const ch = CHAR_BY_ID[p.characterId] || {};
      const pub = (s) => (s ? { name: s.name, desc: s.desc, cost: s.cost, img: s.img, ammo: s.ammo } : null);
      // สกิลพื้นฐานสลับกลางคืน (โคโตเนะ) + Apple guy: ปกสกิลพื้นฐานเปลี่ยนตามของส่งมอบที่เลือกอยู่
      let basicPub = pub(nightNow && ch.basicNight ? ch.basicNight : ch.basic);
      if (basicPub && p.characterId === "appleguy") basicPub.img = (CHAR_HOOKS.appleguy.ITEMS[p.appleItem] || CHAR_HOOKS.appleguy.ITEMS.drink).img;
      let secondaryPub = pub(nightNow && ch.secondaryNight ? ch.secondaryNight : ch.secondary);
      let ultimatePub = pub(nightNow && ch.ultimateNight ? ch.ultimateNight : ch.ultimate);
      // ชเรด เอลัน: หลังรวมร่าง — สกิลพื้นฐาน/รองเปลี่ยนเป็นเวอร์ชันสปาด้า และปุ่มท่าไม้ตายเป็น แด่เพื่อนรักของฉัน
      if (ch.id === "shrade_elan" && p.shradeForm) {
        basicPub = pub(ch.basic2);
        secondaryPub = pub(ch.secondary2);
        ultimatePub = pub(ch.ultimate2);
      }
      // เรียวกิ ชิกิ: ท่าไม้ตายตามที่เลือกไว้ตอนเลือกตัว + ระหว่างความตายที่โรยรา ปกสกิล 1 เปลี่ยน
      if (ch.id === "shiki") {
        ultimatePub = pub((p.shikiUlt || "deatheye") === "wither" ? ch.ultimate2 : ch.ultimate);
        if (basicPub && (p.statuses.wither || 0) > 0) basicPub.img = "/characters/shiki/shiki_skill1.2.webp";
      }
      // คิชินามิ ฮาคุโนะ (patch 2.2.1): สกิลรองสลับตามเพศ + ปกสกิลพื้นฐาน (เธอ/นาย คือฉันหรอ?) โชว์ภาพเพศตรงข้ามเสมอ
      if (ch.id === "hakuno") {
        secondaryPub = pub(p.hakunoGender === "female" ? ch.secondary2 : ch.secondary);
        if (basicPub) basicPub.img = p.hakunoGender === "female" ? "/characters/hakuno/profile/hakuno_male.png" : "/characters/hakuno/profile/hakuno_female.webp";
      }
      // ไรโด ฮิคารุ (patch 2.1.3): ระหว่างร่าง Ginga — สกิลพื้นฐานเปลี่ยนเป็น UPG! / ระหว่างร่าง Ginga Strium — สกิลรองเปลี่ยนเป็นลำแสงสโตเรียม
      if (ch.id === "hikaru") {
        basicPub = pub(((p.statuses.ginga || 0) > 0 || (p.statuses.gingastrium || 0) > 0) ? ch.basic2 : ch.basic);
        secondaryPub = pub((p.statuses.gingastrium || 0) > 0 ? ch.secondary2 : ch.secondary);
      }
      // โอกูริ แคป (Rework): ยุคทองครบ 3 + Stamina ชาร์จ 75 ขึ้นไป — ท่าไม้ตายกลายเป็น Ashen Trail
      if (ch.id === "oguri") {
        ultimatePub = pub(oguriAshenReady(p) ? ch.ultimate2 : ch.ultimate);
      }
      // สึงาชิ ทาคุโตะ (patch 2.2 new): Apprivoise! ทำงานแล้ว — สกิลพื้นฐานเปลี่ยนเป็น Star Sword Emeraude ถาวร
      // patch 2.2.5: กันตาย (สกิลติดตัว 1) เคยทำงานไปแล้ว — ท่าไม้ตายเปลี่ยนเป็นร่วมเดินทางไปกับฉันเถอะถาวร (แทนพิชิตแสงดาว)
      if (ch.id === "takuto") {
        if ((p.statuses.apprivoise || 0) > 0) basicPub = pub(ch.basic2);
        ultimatePub = pub(p.beatSaved ? ch.ultimate2 : ch.ultimate);
      }
      // ริดดี้ มาร์เซนาส (patch 2.0.9): ระหว่างเป็นพันธมิตร — ท่าไม้ตายเปลี่ยนเป็นท่า 2 ฉันจะไม่ยอมสูญเสียใครไปอีก
      if (ch.id === "riddhe") {
        ultimatePub = pub(riddheAllied(p) ? ch.ultimate2 : ch.ultimate);
      }
      // บานาจ ลิงก์ (patch 2.1.2): ระหว่างร่าง NewType Paradise — สกิลรอง 1 เปลี่ยนเป็น Beam Magnum เสมอ
      //  ท่าไม้ตายเปลี่ยนเป็นแสงที่ไม่อยู่เพียงลำพัง เฉพาะตอนมีริดดี้เป็นพันธมิตรอยู่ด้วย
      if (ch.id === "banagher") {
        const banagherTransformed = (p.statuses.paradise || 0) > 0;
        secondaryPub = pub(banagherTransformed ? ch.secondary2 : ch.secondary);
        ultimatePub = pub((banagherTransformed && riddheAllied(p)) ? ch.ultimate2 : ch.ultimate);
      }
      // ริต้า เบอร์นัล (patch 2.1.6): ระหว่างฝืนใช้งาน NTD-Sytem — สกิลรองเปลี่ยนเป็นสกิลรอง 2 / เกิดใหม่แล้ว — ท่าไม้ตายเปลี่ยนเป็นท่าไม้ตาย 2 ถาวร
      if (ch.id === "phenex") {
        const ntdOn = (p.statuses.phenexNtd || 0) > 0 || p.phenexNtdPermanent;
        secondaryPub = pub(ntdOn ? ch.secondary2 : ch.secondary);
        ultimatePub = pub(p.phenexReborn ? ch.ultimate2 : ch.ultimate);
      }
      // DoomGuy (patch 2.2 full): สกิลรอง "Weapon" โชว์ชื่อ/ราคา/ภาพตามอาวุธที่ถืออยู่จริง
      if (ch.id === "doomguy") {
        const w = DOOM_WEAPONS[p.doomWeapon] || DOOM_WEAPONS.shotgun;
        const effDesc = {
          explode: "เลือกเป้าหมาย 1 คน ติดสถานะ [ระเบิด] — โดนโจมตีเมื่อไหร่จะระเบิดใส่คนอื่นสุ่ม 2 คน -1",
          lockon: `เลือกเป้าหมาย 1 คน ติด [ล็อคเป้า] แน่นอน — โดนโจมตีครั้งถัดไปแรงขึ้น +${DOOM_LOCKON_BONUS}`,
          drain: `เลือกเป้าหมาย 1 คน ติดสถานะ [โดนดูด] — ดาเมจ ${DOOM_DRAIN_DMG} หน่วยทุกเทิร์น ${DOOM_DRAIN_TURNS} เทิร์น (เจาะเกราะก่อน)`,
          shield: "เพิ่มโล่ของตัวเอง +1 (ใช้ได้ครั้งเดียวต่อการถืออาวุธนี้)",
          bonusdmg: `เลือกเป้าหมาย 1 คน โดนดาเมจเพิ่มเติมทันที -${DOOM_ROCKET_BONUS_DMG}`,
          stun: "เลือกเป้าหมาย 1 คน สตั้น 1 เทิร์น",
          bonusdmg2: `เลือกเป้าหมาย 1 คน โดนดาเมจเพิ่มเติมทันที -${DOOM_BALLISTA_TARGET_DMG}`,
        }[w.effect] || "ไม่มีความสามารถพิเศษ";
        secondaryPub = { name: `Weapon: ${w.name}`, desc: `ถือ ${w.name} อยู่ — โจมตีปกติ${w.pierce ? "เจาะเกราะ" : ""} ${w.atk} หน่วย. ${effDesc}`, cost: w.cost, img: w.img };
      }
      // กระแสเวท/ภาระเวท (สถานะ Universal): ราคาที่โชว์บนปุ่มสกิลต้องตรงกับที่ useSkill() คิดจริง — ไม่งั้นจะโชว์ราคาเก่าทับกับผลกลางคืนไม่ถูกต้อง
      const spellflowAmt = statusAmtOf(p, "spellflow");
      const spellburdenAmt = Math.min(SPELLBURDEN_MAX, statusAmtOf(p, "spellburden"));
      if (basicPub) basicPub.cost = Math.max(0, basicPub.cost - spellflowAmt) + spellburdenAmt;
      if (secondaryPub) secondaryPub.cost = Math.max(0, secondaryPub.cost - spellflowAmt) + spellburdenAmt;
      // กลางคืน (patch 2.1.7): สุ่มแล้วให้สกิลพื้นฐานหรือสกิลรอง (อย่างใดอย่างหนึ่ง) ใช้แต้มมากขึ้น +1 — ไม่เกิน 8 แต้ม ไม่มีผลกับท่าไม้ตาย
      //  ต้องซ้อนทับกับกระแสเวท/ภาระเวทข้างบนได้ (คิดต่อจากราคาที่ปรับแล้ว ไม่ใช่ราคาเดิม)
      if (p.nightTaxTier === "basic" && basicPub && basicPub.cost < 8) basicPub.cost += 1;
      if (p.nightTaxTier === "secondary" && secondaryPub && secondaryPub.cost < 8) secondaryPub.cost += 1;
      return {
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        img: displayImg(p),
        position: p.position,
        color: POSITION_COLORS[p.position] || "#888",
        locked: p.locked,
        busted: (show || promoShow || allyShow) ? bustedOf(p) : false,
        result: p.result,
        cardCount: p.cards.length,
        cards: takumiBlackout ? null : (mine ? p.cards : null),
        score: takumiBlackout ? null : ((show || promoShow || allyShow) ? scoreOf(p) : null),
        hp: takumiBlackout ? null : p.hp, maxHp: takumiBlackout ? null : maxHpOf(p), // Locacaca (ซาโตรุ): Max HP ลดถาวรได้ / ทาคุมิ: บังตาระหว่างท่าไม้ตายทำงาน
        armor: takumiBlackout ? null : p.armor, maxArmor: takumiBlackout ? null : maxArmorOf(p),
        shield: takumiBlackout ? null : p.shield,
        tempHp: p.tempHp || 0, // เลือดชั่วคราว (แกมเบลอร์)
        // เอฟเฟครอบการ์ด (เห็นทุกคน): เขี้ยวปฏิปักษ์สีเขียว (ถาวร) / เกราะราชันสีแดง (ตอนสวม)
        beat: !!(p.seen && p.seen.beat),
        beatSaved: !!p.beatSaved,
        rachan: !!(p.seen && p.seen.rachan) && (p.statuses.rachan || 0) > 0,
        // ยูนะ: ออร่าเฉพาะเป้าหมาย (Longing สีทอง / Delete สีม่วง / Smile for You สีเขียว-ฟ้า) — beatbark ไม่มีเป้าหมายเดี่ยว ดู yunaFieldFx
        fieldAura: (p.id === yunaTargetId && roundNumber <= yunaWindowEnd) ? yunaEffect : null,
        // ซาโตรุ (patch 2.0.8.2): แต้มสกิลถูกซ่อนจากผู้เล่นอื่นเสมอ (-1 = ซ่อน) / ทาคุมิ: บังตาแต้มสกิลของทุกคนยกเว้นตัวเองระหว่างท่าไม้ตายทำงาน (sentinel -1 แบบเดียวกัน กลับด้าน)
        skillPoints: (takumiBlackout && !mine) ? -1 : ((p.characterId === "satoru" && !mine && !passiveSealed(p)) ? -1 : p.skillPoints),
        maxSkill: maxSkillOf(p), // Bard: เพดานพลังงาน 9
        beamAmmo: p.beamAmmo,
        puddingCount: p.puddingCount || 0,
        gold: p.gold || 0, // ร้านค้ามายา (patch 2.2 full): เหรียญสะสม — ทุกคนเห็นของกันและกันได้
        inventory: mine ? (p.inventory || []) : null, // ของในคลัง — เห็นแค่ของตัวเอง
        doomWeapon: p.doomWeapon || null, // DoomGuy: อาวุธที่ถืออยู่
        doomCharge: p.characterId === "doomguy" ? (p.doomCharge || 0) : undefined, // DoomGuy: ชาร์จ Crucible (เต็ม 5)
        doomWeaponHasEffect: p.characterId === "doomguy" ? !!(DOOM_WEAPONS[p.doomWeapon] || DOOM_WEAPONS.shotgun).effect : undefined, // DoomGuy: ปืนกระบอกนี้กดใช้ความสามารถพิเศษได้ไหม (Plasma Rifle/BFG 9000 ไม่มี)
        doomQuickSwapUsed: p.characterId === "doomguy" ? !!p.doomQuickSwapUsed : undefined, // DoomGuy: Quick Swap ใช้ไปแล้วในเทิร์นนี้หรือยัง (1 ครั้ง/เทิร์น)
        doomWeaponMarkPending: p.characterId === "doomguy" ? doomWeaponMarkPending() : undefined, // DoomGuy: [ระเบิด]/[ล็อคเป้า] ค้างอยู่ — สุ่มปืนใหม่ (Quick Swap) ไม่ได้จนกว่าจะโดนใช้
        gamblerUses: p.gamblerUses, // แกมเบลอร์: จำนวนวอสก้าหน่อยน้องคงเหลือ
        profit: p.profit || 0,      // แกมเบลอร์: บัฟกำไรเท่าตัวโว้ยสะสม
        sunriseDrop: p.sunriseDrop || 0, // โอเบรอน: จำนวนเทิร์นที่จะเสียเลือด 1/เทิร์นจากรุ่งอรุณแห่งวันใหม่
        appleItem: p.appleItem || "drink", // Apple guy: ของส่งมอบที่เลือกอยู่
        appleAtk: p.appleAtkBuffs ? p.appleAtkBuffs.length : 0, // Apple guy: บัฟพลังโจมตีจากการมอบของ (ซ้อนทับได้สูงสุด 2 หน่วย)
        appleGiveUses: p.appleGiveUses != null ? p.appleGiveUses : CHAR_HOOKS.appleguy.GIVE_USES, // Apple guy: จำนวนใช้ เอาไปสิ คงเหลือ
        tepeuCookTurns: p.tepeuCookTurns || 0,     // เทเปา: วันนี้อากาศดีจัง — เทิร์นที่เหลือก่อนได้ "มื้อที่สุข" (0 = กดใช้ได้)
        tepeuPonderTurns: p.tepeuPonderTurns || 0, // เทเปา: เป็นแบบนี้นี่เอง — ครุ่นคิดเหลือกี่เทิร์น (0 = กดใช้ได้/จั่วไพ่ได้)
        coins: p.coins || 0,               // โคโตเนะ: coin ในกระปุกออมสิน (สูงสุด 6)
        shradeForm: !!p.shradeForm,        // ชเรด เอลัน: รวมร่างทำนองเพลงแล้ว (อควาเรียน สปาด้า — ถาวร)
        bardNotes: p.bardNotes || [],      // Bard: โน้ตในช่องประพันธ์เพลง (ทุกคนเห็นได้)
        bardNotesUsed: p.bardNotesUsed || 0, // Bard: โน้ตที่เติมไปแล้วเทิร์นนี้ (จำกัด 2)
        bloodSection: p.bloodSection || 0, // Bard: ท่อนทำนองแห่งโลหิต (ครบ 5 = มิติโลหิต)
        soulSection: p.soulSection || 0,   // Bard: ท่อนทำนองแห่งวิญญาณ (ครบ 5 = มิติวิญญาณ)
        bardPending: p.bardPending ? { name: p.bardPending.name, need: p.bardPending.need, allowSelf: p.bardPending.allowSelf } : null, // Bard: บทเพลงรอเลือกเป้าหมาย
        // ไค ชิซากิ: สรุป Overhaul tracker (ชื่อผู้ถือ+ประเภทสถานะ) — เฉพาะผู้เล่นไคเท่านั้น (ตัวอื่นเห็น undefined)
        kaiOverhaulSlots: p.characterId === "kai" ? kaiOverhaulSlots.map((s) => ({ playerId: s.playerId, name: (players[s.playerId] && players[s.playerId].name) || "", status: s.status, img: players[s.playerId] ? displayImg(players[s.playerId]) : null })) : undefined,
        mageslayerHasMarked: p.characterId === "mageslayer" ? !!p.mageslayerHasMarked : undefined, // ผู้สังหารจอมมหาเวทย์: เคยใช้ Witch Mark หรือยัง
        kaiRivalId: mine ? (p.kaiRivalId || null) : undefined, // ไค ชิซากิ: คู่ปรับที่ถูกบังคับโจมตี (เห็นแค่ตัวเอง — ฝั่งอื่นเช็คจาก statuses.kaiRival1/2 ได้)
        kaiSkillUsesRound: p.characterId === "kai" ? (p.kaiSkillUsesRound || 0) : undefined, // ไค: งบสกิล 2 ครั้งต่อเทิร์น ใช้ไปแล้วกี่ครั้ง
        takumiGear: p.characterId === "takumi" ? (p.takumiGear || 1) : undefined, // ทาคุมิ: เกียร์ธรรมดาปัจจุบัน (1-6)
        takumiSkillUsesRound: p.characterId === "takumi" ? (p.takumiSkillUsesRound || 0) : undefined, // ทาคุมิ: งบสกิล 5 ครั้งต่อเทิร์น ใช้ไปแล้วกี่ครั้ง
        shikiUlt: p.shikiUlt || "deatheye", // ชิกิ: ท่าไม้ตายที่เลือกตอนเข้าห้อง (deatheye | wither)
        stamina: p.stamina || 0,           // โอกูริ แคป: Stamina ชาร์จสะสม (ทรัพยากรท่าไม้ตาย)
        oguriEnergy: p.oguriEnergy || 0,   // โอกูริ แคป: Energy สะสม (สูงสุด 16 — ทรัพยากร Breakfast/Training)
        oguriChargeCap: p.characterId === "oguri" ? oguriChargeCapOf(p) : undefined, // โอกูริ แคป: ความจุ Stamina ชาร์จปัจจุบัน
        contractPartnerId: p.contractPartner || null, // เจ้าแห่งเน็ตบ้าน: คู่สัญญาปัจจุบัน
        contractWithId: p.contractWith || null,       // คู่สัญญา: ทำสัญญากับเจ้าแห่งเน็ตบ้านคนไหน
        allyId: p.allyId || null,                     // ริดดี้ (patch 2.0.9): คู่พันธมิตรบันชี × ยูนิคอร์น
        contractTurns: p.contractTurns || 0,          // จำนวนเทิร์นที่ใช้บริการมาแล้ว (ครบทุก 3 = ถามต่อสัญญา)
        skillDrain: p.skillDrain || 0,                // ค่าปรับปฏิเสธข้อเสนอ: แต้มจบเทิร์นลด 1 (เทิร์นที่เหลือ)
        chillDodge: p.chillDodge != null ? p.chillDodge : 100, // Apple guy: อัตราหลบปัจจุบัน (%)
        tonkatsu: p.tonkatsu || 0, // เทมาริ: ชามทงคัสสึสะสม (UI สะสมชาม)
        phenexPain: p.phenexPain || 0, // ริต้า เบอร์นัล: ความเจ็บปวดสะสม (ไม่อยากให้ใครต้องเจ็บปวด — ปลดปล่อยตอนตกรอบจริง)
        tohnoLevel: p.tohnoLevel || 1, // โทโนะ ชิกิ: ระดับมีดพับประจำตระกูลที่เลือกอยู่ (1-5)
        nanayaEyeOn: !!p.nanayaEyeOn,           // นานายะ ชิกิ: Mystic eye of death perception เปิดอยู่ไหม
        nanayaToggleUsed: !!p.nanayaToggleUsed, // นานายะ ชิกิ: เปิด/ปิดไปแล้วในเทิร์นนี้หรือยัง
        hakunoGender: p.hakunoGender || "male",         // คิชินามิ ฮาคุโนะ: เพศปัจจุบัน
        hakunoGenderSwitched: !!p.hakunoGenderSwitched, // คิชินามิ ฮาคุโนะ: สลับเพศไปแล้วในเทิร์นนี้หรือยัง
        hakunoMoonPoints: p.hakunoMoonPoints || 0,      // คิชินามิ ฮาคุโนะ: แต้มคำสาปแห่งดวงจันทร์สะสม
        hakunoCommandUses: p.hakunoCommandUses != null ? p.hakunoCommandUses : HAKUNO_COMMAND_USES, // อาคมบัญชาระดับ EX+ คงเหลือ
        atCap: scoreOf(p) >= scoreCap(p), // แต้มเต็มเพดาน (21/UPG) -> ปิดปุ่มจั่ว รอเปิดไพ่เอง
        skillUsed: !!p.skillUsedRound,    // ใช้สกิลไปแล้วในเทิร์นนี้ (1 อันต่อเทิร์น)
        ready: !!p.ready,                 // ห้องรอ: กดพร้อมแล้วหรือยัง
        connected: p.connected !== false,
        alive: p.alive,
        statuses: show ? { ...p.statuses, ...((p.ntdTarget || p.ntdRivalId) ? { ntd: 1 } : {}) } : publicStatuses(p),
        statusAmt: p.statusAmt || {}, // จำนวน (amount) ของบัฟ/ดีบัฟพื้นฐาน (patch 2.0.8)
        character: {
          // โอเบรอน: กลางคืนสลับชื่อ + สกิลรอง/ท่าไม้ตายเป็นเวอร์ชันกลางคืน (ฝันร้ายยามค่ำคืน / Lie Like Vortigern)
          id: ch.id,
          name: ch.id === "shrade_elan" && p.shradeForm ? SHRADE_SPADA_NAME
            : nightNow && ch.nightName ? ch.nightName : ch.name,
          passive: ch.passive ? { name: ch.passive.name, desc: ch.passive.desc } : null,
          // บานาจ ลิงก์ (patch 2.1.2): สกิลติดตัว 2 ฉันไม่อยากให้เราต้องมาสู้กัน — ตัวอื่นเป็น null
          passive2: ch.passive2 ? { name: ch.passive2.name, desc: ch.passive2.desc } : null,
          // นานายะ ชิกิ (patch 2.1.9): สกิลติดตัว 3 พักผ่อนสักครู่ — ตัวอื่นเป็น null
          passive3: ch.passive3 ? { name: ch.passive3.name, desc: ch.passive3.desc } : null,
          basic: basicPub,
          secondary: secondaryPub,
          ultimate: ultimatePub,
        },
        dmgHp: p.dmgHp, dmgArmor: p.dmgArmor, gainedSkill: p.gainedSkill,
        wasAttacked: p.wasAttacked, isWinner: p.isWinner, isLoser: p.isLoser,
      };
    }),
  };
}
function broadcastState() {
  CHAR_HOOKS.kai.pruneOverhaulSlots(engine); // เผื่อสถานะรังสรรค์/ลงทัณฑ์หายไปนอกช่องทาง Overhaul (เช่นถูกล้าง)
  for (const id of Object.keys(players)) io.to(id).emit("state", buildStateFor(id));
}
function broadcastPositions() {
  for (const [sid, sock] of io.sockets.sockets) sock.emit("positions", positionsFor(sid));
}


// ============================================================
//  cutscene
// ============================================================
// ครั้งแรกต่อเกม/ต่อคน = เล่นวีดีโอเต็ม (หยุดกระดาน), ครั้งต่อไป = แค่การ์ดแจ้งเตือนเล็กๆ ไม่หยุดเกม
function triggerCutscene(p, key) {
  if (p.cutsceneShown[key]) notifyTransform(p, key);
  else { p.cutsceneShown[key] = true; queueCutscene(p, key); }
}
function queueCutscene(p, key) {
  const t = TRANSFORMS[key];
  if (!t) return;
  cutsceneQueue.push({
    seconds: t.seconds,
    info: {
      playerId: p.id, name: p.name,
      img: t.img, color: POSITION_COLORS[p.position] || "#9B4F96",
      video: t.video, title: t.title, label: t.label, voice: t.voice || null,
    },
  });
}
// การ์ดแจ้งเตือนเล็กๆ (ครั้งที่ 2 เป็นต้นไป): ส่งทันทีแบบเดียวกับ skillFlash — ไม่ตัดเข้าเฟส CUTSCENE
// ไม่หยุดเวลา/กระดาน แค่บอกว่าใครใช้ท่าอะไรซ้ำ
function notifyTransform(p, key) {
  const t = TRANSFORMS[key];
  if (!t) return;
  io.emit("transformNotice", {
    playerId: p.id, name: p.name,
    img: t.img, color: POSITION_COLORS[p.position] || "#9B4F96",
    title: t.title, label: t.label,
  });
}
// ประกาศเปลี่ยนร่าง (เอฟเฟกต์ระเบิด + ชื่อ + เสียงพากย์) — ต่อจากวีดีโอ ก่อนขึ้นสรุปผล/คนอื่น
//  seconds ≈ ความยาวเสียงพากย์ เพื่อให้เสียงเล่นจบก่อนขึ้นฉากถัดไป (ไม่ทับวีดีโอคนอื่น)
function queueTransformAnnounce(p, kind) {
  const t = TRANSFORMS[kind];
  if (!t) return;
  cutsceneQueue.push({
    seconds: kind === "beat" ? 9 : 7,
    info: {
      playerId: p.id, name: p.name,
      img: OHGER_FORM, color: POSITION_COLORS[p.position] || "#9B4F96",
      title: t.title, voice: t.voice || null, kind, announce: true,
    },
  });
}
// พักช่วงจั่วการ์ดไว้ เล่น cutscene ให้จบ แล้วกลับมาจั่วต่อด้วยเวลาที่เหลือ
// (ใช้กับสกิลที่แปลงร่างทันทีก่อนเปิดไพ่ เช่น MonsterLive)
function pausePlayingForCutscene() {
  const remain = Math.max(3, timeLeft);
  clearPhaseTimer();
  runCutsceneQueue(() => {
    gameState = "PLAYING";
    startPhaseTimer(remain, resolveRound);
    broadcastState();
    checkAllLocked();
  });
}
function runCutsceneQueue(onDone) {
  if (cutsceneQueue.length === 0) { cutsceneInfo = null; onDone(); return; }
  const c = cutsceneQueue.shift();
  cutsceneInfo = { ...c.info, id: ++cutsceneSeq }; // id ใหม่ทุกครั้ง -> client remount วีดีโอ
  gameState = "CUTSCENE";
  startPhaseTimer(c.seconds, () => runCutsceneQueue(onDone));
  broadcastState();
}


// ============================================================
//  วงจรรอบ
// ============================================================
// ห้องรอ: ทุกคนกดพร้อมครบ (อย่างน้อย 2 คน) -> เริ่มเกมทันที ไม่ต้องกดปุ่มเริ่มเกมเอง
function checkLobbyReady() {
  if (gameState !== "LOBBY") return;
  const list = Object.values(players);
  if (list.length >= 2 && list.every((p) => p.ready)) startMatch();
}
function startMatch() {
  for (const p of Object.values(players)) resetCombat(p);
  roundNumber = 0;
  cycleShift = 0;
  nightResetPending = false;
  oberonDevour = 0;
  dayForceUntil = 0;
  yunaLongingUsed = false; yunaWindowEnd = 0; yunaEffect = null; yunaTargetId = null; yunaMusicSeq = 0; yunaLongingPendingId = null; yunaPity = 0;
  allyWinFlag = false;
  kaiOverhaulSlots = []; // ไค ชิซากิ: ล้าง tracker Overhaul ทุกครั้งที่เริ่มแมตช์ใหม่
  // อาริมะ มิยาโกะ (characters/miyako.js): เจอ โทโนะ ชิกิ หรือ นานายะ ชิกิ ในเกมเดียวกัน -> เล่นวีดีโอ arima_shiki.mp4 ก่อนเริ่มเทิร์นแรก
  cutsceneQueue = [];
  if (CHAR_HOOKS.miyako.maybeQueueRivalIntro(engine)) {
    runCutsceneQueue(dealRound);
  } else {
    dealRound();
  }
}

// ---------- ร้านค้ามายา (patch 2.2 full) ----------
// สุ่มสินค้า 1 ชิ้น ตามน้ำหนัก: เปลี่ยนสีการ์ด 20% / โชคลาภ 5% (หายากสุด) / ต้านสถานะ 20% / ยาลดไพ่ 15% (ทั่วไป แต่ไม่หายากเท่าโชคลาภ) / ฟื้นแต้มสกิล 20% (สุ่มขนาดย่อยอีกที) / ฟื้นเกราะ 20%
function rollShopItem() {
  const roll = Math.random();
  if (roll < 0.20) return { type: "cardColor", price: SHOP_CARD_COLOR_PRICE };
  if (roll < 0.25) return { type: "fortune", price: SHOP_FORTUNE_PRICE };
  if (roll < 0.45) return { type: "resist", price: SHOP_RESIST_PRICE };
  if (roll < 0.60) return { type: "cardRemove", price: SHOP_CARD_REMOVE_PRICE };
  if (roll < 0.80) {
    const s = SHOP_SKILL_SIZES[Math.floor(Math.random() * SHOP_SKILL_SIZES.length)];
    return { type: "skillPoint", size: s.size, value: s.amount, price: s.price };
  }
  return { type: "armor", value: SHOP_ARMOR_AMOUNT, price: SHOP_ARMOR_PRICE };
}
function shopItemName(item) {
  if (item.type === "cardColor") return "ยาเปลี่ยนสีการ์ด";
  if (item.type === "fortune") return "ยาโชคลาภ";
  if (item.type === "resist") return "ยาต้านสถานะ";
  if (item.type === "cardRemove") return "ยาลดไพ่";
  if (item.type === "skillPoint") return `ยาฟื้นแต้มสกิล +${item.value}`;
  if (item.type === "armor") return `ยาฟื้นเกราะ +${item.value}`;
  return "สินค้า";
}
// เปิดร้านค้ามายา: สุ่มสินค้าใหม่ทั้งหมด (สูงสุด 9 ชิ้น สินค้าประเภทเดียวกันขึ้นซ้ำได้)
function openShop() {
  shopRoundSeq++;
  shopItems = [];
  for (let i = 0; i < SHOP_MAX_ITEMS; i++) {
    shopItems.push({ id: `shop_${shopRoundSeq}_${i}`, ...rollShopItem(), sold: false, soldTo: null });
  }
  lastLog.push(`🏪 ร้านค้ามายาเปิดแล้ว! มีสินค้า ${shopItems.length} ชิ้น: ${shopItems.map(shopItemName).join(", ")}`);
}
// ซื้อสินค้า: ใครกดก่อนได้ก่อน (Node เป็น single-thread — ประมวลผลทีละ event จึงไม่มี race condition จริง)
function buyShopItem(id, itemId) {
  const p = players[id];
  if (!p || !p.alive) return;
  const item = shopItems.find((it) => it.id === itemId);
  if (!item || item.sold) return;
  if ((p.gold || 0) < item.price) return;
  item.sold = true;
  item.soldTo = p.id;
  p.gold -= item.price;
  p.inventory = p.inventory || [];
  p.inventory.push({ uid: `${item.id}_${p.inventory.length}_${Date.now()}`, type: item.type, value: item.value, size: item.size });
  lastLog.push(`🛍️ ${p.name} ซื้อ ${shopItemName(item)} จากร้านค้ามายา (-${item.price} เหรียญ)`);
  broadcastState();
}
// ใช้ของในคลัง
const CARD_COLOR_NAME = { red: "แดง", blue: "ฟ้า", green: "เขียว", yellow: "เหลือง" };
function cardLabel(c) {
  if (!c) return "?";
  if (c.special) return { king: "ราชา", queen: "ราชินี", joker: "โจ๊กเกอร์" }[c.special] || c.special;
  return String(c.value);
}
function useInventoryItem(id, uid, opts = {}) {
  const p = players[id];
  if (!p || !p.alive) return;
  const idx = (p.inventory || []).findIndex((it) => it.uid === uid);
  if (idx < 0) return;
  const item = p.inventory[idx];
  if (item.type === "cardColor") {
    if (gameState !== "PLAYING" || p.locked) return; // ใช้ได้เฉพาะช่วงกำลังจั่วไพ่อยู่เท่านั้น
    const cardIndex = Number(opts.cardIndex);
    const color = opts.color;
    const target = Number.isInteger(cardIndex) ? p.cards[cardIndex] : null;
    if (!target || target.special || !CARD_COLORS.includes(color)) return; // ต้องเลือกการ์ดเลข (ไม่ใช่การ์ดพิเศษ) + สีที่ถูกต้อง
    const oldColor = target.color;
    target.color = color;
    checkBlueTrigger(p); // เผื่อเปลี่ยนสีแล้วครบฟ้า 3 ใบพอดี
    lastLog.push(`🎨 ${p.name} ใช้ยาเปลี่ยนสีการ์ด — เปลี่ยนไพ่ ${cardLabel(target)} จาก${CARD_COLOR_NAME[oldColor]}เป็น${CARD_COLOR_NAME[color]}`);
  } else if (item.type === "fortune") {
    p.statuses.fortune = Math.min(BARD_FORTUNE_MAX, (p.statuses.fortune || 0) + SHOP_FORTUNE_AMOUNT);
    p.fortuneIdle = 0;
    lastLog.push(`🍀 ${p.name} ใช้ยาโชคลาภ — ได้โชคลาภ +${SHOP_FORTUNE_AMOUNT} จากคลัง`);
  } else if (item.type === "resist") {
    p.statuses.resist = Math.max(p.statuses.resist || 0, SHOP_RESIST_TURNS);
    lastLog.push(`🛡️ ${p.name} ใช้ยาต้านสถานะ — ต้านสถานะผิดปกติ ${SHOP_RESIST_TURNS} เทิร์น จากคลัง`);
  } else if (item.type === "cardRemove") {
    if (gameState !== "PLAYING" || p.locked || !p.cards || p.cards.length === 0) return;
    const removed = p.cards.pop();
    centralDeck.push(removed); // คืนไพ่ที่ลดออกกลับเข้ากองกลาง ให้คนอื่นจั่วได้อีก
    p.busted = bustedOf(p);
    lastLog.push(`✂️ ${p.name} ใช้ยาลดไพ่ — ลดไพ่ใบล่าสุด (${cardLabel(removed)}) ออก คืนเข้ากองกลาง${p.busted ? "" : " — ไพ่ไม่แตกแล้ว!"}`);
  } else if (item.type === "skillPoint") {
    addSkill(p, item.value);
    lastLog.push(`⚡ ${p.name} ใช้ยาฟื้นแต้มสกิล +${item.value} จากคลัง (เพดาน ${maxSkillOf(p)})`);
  } else if (item.type === "armor") {
    const healed = healArmor(p, item.value);
    lastLog.push(`🔧 ${p.name} ใช้ยาฟื้นเกราะ +${healed} จากคลัง`);
  } else if (item.type === "tepeuMeal") {
    const healed = healHp(p, item.value);
    lastLog.push(`🍲 ${p.name} ใช้ "มื้อที่สุข" — ฟื้นพลังชีวิต +${healed} จากคลัง`);
  } else {
    return;
  }
  p.inventory.splice(idx, 1);
  broadcastState();
}

function dealRound() {
  clearPhaseTimer();
  roundNumber++;
  centralDeck = buildCentralDeck(); // กองกลาง 43 ใบ สับใหม่ทุกรอบ
  lastLog = [];
  attackerId = null;
  roundWinnerId = null;
  roundTiedWin = false;
  cutsceneQueue = []; // ล้างคิวเก่าก่อนเสมอ — ต้องอยู่ก่อน rollWindow/CHAR_HOOKS ด้านล่างทั้งหมด ไม่งั้นคัตซีนที่เพิ่งคิวไว้จะโดนล้างทิ้งไปด้วย
  cutsceneInfo = null;
  lastAttack = null;
  roundSkills = [];
  anataMusicSeq = 0;
  // ร้านค้ามายา (patch 2.2 full): เปิดทุกๆ 5 เทิร์น ตอนเริ่มเทิร์นใหม่
  if (roundNumber % SHOP_INTERVAL_TURNS === 0) openShop();
  // ยูนะ ไอดอลประจำสนาม: ม้วนลูกเต๋าทุกๆ 5 เทิร์น เริ่มจากเทิร์นที่ 16 (16, 21, 26, ...)
  if (roundNumber >= 16 && (roundNumber - 16) % 5 === 0) YunaMod.rollWindow(engine, roundNumber);
  // รีเซ็ตเวลากลางคืน (Lie Like Vortigern): นับกลางคืนใหม่ — เทิร์นนี้เป็นคืนที่ 1 จาก 3
  const prevNight = isNightRound(roundNumber - 1); // เช็คด้วยวงจรเดิมก่อนเลื่อน (กันแบนเนอร์สลับเวลาเด้งผิด)
  if (nightResetPending) {
    nightResetPending = false;
    cycleShift = roundNumber - (CYCLE_TURNS + 1); // ให้เทิร์นนี้ตรงกับคืนแรกของวงจร
  }

  for (const p of Object.values(players)) {
    resetRoundDisplay(p);
    p.shield = 0;
    // บานาจ (patch 2.1.2): Absorb shield — โล่ฟื้นให้ทุกต้นเทิร์นที่ผลยังอยู่ (คงอยู่ 2 เทิร์นตามสถานะ bshield)
    if ((p.statuses.bshield || 0) > 0) p.shield += BANAGHER_SHIELD_AMT;
    p.skillUsedRound = false; // เทิร์นใหม่ ใช้สกิลได้อีก 1 อัน
    // DoomGuy (patch 2.2 full): Quick Swap ใช้ได้อีก 1 ครั้งต่อเทิร์น
    if (p.characterId === "doomguy") p.doomQuickSwapUsed = false;
    if ((p.wouGuardCd || 0) > 0) p.wouGuardCd--; // ซาโตรุ (patch 2.0.8.3): คูลดาวน์ลบล้างลดลงทุกต้นเทิร์น (2 เทิร์นต่อการใช้)
    // Apple guy (characters/appleguy.js): บัฟพลังโจมตีแต่ละหน่วยนับถอยหลังแยกกัน — หมดอายุเองเมื่อครบ
    if (p.characterId === "appleguy") CHAR_HOOKS.appleguy.onRoundStartDecay(p);
    // เทเปา (patch 2.2 new): ทำอาหาร/ครุ่นคิด/ฉากหลังไม้ตาย นับถอยหลังที่ endTurn() แทน (ต้องอ่านค่าก่อนลดเพื่อรู้ "เทิร์นสุดท้าย" ให้ตรง)
    p.bardNotesUsed = 0;      // Bard: นับโน้ตใหม่ทุกเทิร์น (จำกัด 2 — มิติวิญญาณไม่จำกัด)
    p.kaiSkillUsesRound = 0;  // ไค: งบสกิล 2 ครั้ง (รังสรรค์/ลงทัณฑ์ ผสมกันได้อิสระ) เต็มใหม่ทุกเทิร์น
    p.takumiSkillUsesRound = 0; // ทาคุมิ: งบสกิลรวม 5 ครั้งต่อเทิร์น (พื้นฐาน/รอง/ท่าไม้ตาย ผสมกันได้อิสระ) เต็มใหม่ทุกเทิร์น
    CHAR_HOOKS.doomguy.onRoundStartFortuneRoll(engine, p); // DoomGuy: ทุกต้นเทิร์นมีโอกาส 20% ได้ [โชคลาภ] +1 สแตค
    p.anataTargets = null;
    p.hakunoLowDraw = false; // ข้าขอบัญชา (หญิง คิชินามิ ฮาคุโนะ): จำกัดจั่ว 2/3 แต้ม เฉพาะเทิร์นที่ใช้เท่านั้น
    // ห้ามจั่วการ์ดเพิ่มที่ตั้งไว้จากเทิร์นก่อน (ทงคัสสึ / กำไรเท่าตัวโว้ย) — noDrawNext เป็นจำนวนเทิร์น
    if (p.noDrawNext) {
      p.statuses.nodraw = Math.max(p.statuses.nodraw || 0, Number(p.noDrawNext) || 1);
      p.noDrawNext = 0;
    }
    // ห้ามใช้สกิลที่ตั้งไว้จากเทิร์นก่อน (หอกลองกินัส เอวา 13)
    if (p.noSkillNext) {
      p.statuses.noskill = Math.max(p.statuses.noskill || 0, Number(p.noSkillNext) || 1);
      p.noSkillNext = 0;
    }
    // ชะงัก (The Beat of Victory โอกูริ patch 2.0.8.1): ติดจากการถูกโจมตีเทิร์นก่อน — เริ่มมีผลเทิร์นนี้
    if (p.staggerNext) {
      p.statuses.stagger = Math.max(p.statuses.stagger || 0, Number(p.staggerNext) || 1);
      p.staggerNext = 0;
    }
    // ค่าปรับปฏิเสธข้อเสนอ (เจ้าแห่งเน็ตบ้าน): แต้มจบเทิร์นลด 1 — เริ่มนับเทิร์นถัดไปจากที่ปฏิเสธ
    if (p.skillDrainPending) {
      p.skillDrain = Math.max(p.skillDrain || 0, p.skillDrainPending);
      p.skillDrainPending = 0;
    }
    if (!p.alive) { p.cards = []; p.locked = true; p.busted = false; continue; }

    // กลางคืน (patch 2.1.7): สุ่มใหม่ทุกเทิร์นว่าสกิลพื้นฐานหรือสกิลรอง (อย่างใดอย่างหนึ่ง) จะใช้แต้มมากขึ้น — ไม่มีผลกับท่าไม้ตาย
    if (isNightRound(roundNumber)) {
      const ch0 = CHAR_BY_ID[p.characterId];
      const taxCandidates = [];
      if (ch0 && ch0.basic) taxCandidates.push("basic");
      if (ch0 && ch0.secondary) taxCandidates.push("secondary");
      p.nightTaxTier = taxCandidates.length ? taxCandidates[Math.floor(Math.random() * taxCandidates.length)] : null;
    } else {
      p.nightTaxTier = null;
    }
    p.phenexTauntGrace = false; // ไม่อยากให้ใครต้องเจ็บปวด (ริต้า เบอร์นัล): ผ่านเทิร์นที่หมดเวลาพอดีไปแล้ว ล้างค่านี้ทิ้ง

    // ---------- นานายะ ชิกิ (characters/nanaya.js) ----------
    p.nanayaToggleUsed = false; // Mystic eye of death perception: เปิด/ปิดได้อีก 1 ครั้งในเทิร์นใหม่นี้
    if (p.characterId === "nanaya") CHAR_HOOKS.nanaya.onRoundStartRest(engine, p);

    // ---------- คิชินามิ ฮาคุโนะ (patch 2.2.1, characters/hakuno.js) ----------
    p.hakunoGenderSwitched = false; // เธอ/นาย คือฉันหรอ?: สลับเพศได้อีก 1 ครั้งในเทิร์นใหม่นี้
    CHAR_HOOKS.hakuno.onRoundStartRest(engine, p);

    // [โหมงานหนัก] (ฟุจิตะ โคโตเนะ, characters/kotone.js): ติดสถานะตอนเริ่มเทิร์นถัดจากที่โหมงานกะดึก
    CHAR_HOOKS.kotone.onRoundStartOverworkTrigger(engine, p);

    // รุ่งอรุณแห่งวันใหม่ (โอเบรอน): เสียพลังชีวิตเทิร์นละ 1 หน่วยแบบไม่สนเกราะ (รวม 2 เทิร์น)
    //  ผลด้านลบจากสกิลหักเลือดได้เรื่อยๆ แต่ห้ามตาย — ค้างที่พลังชีวิต 1 หน่วย
    if ((p.sunriseDrop || 0) > 0) {
      p.sunriseDrop--;
      if (p.hp > 1 || (p.tempHp || 0) > 0) {
        loseHp(p);
        lastLog.push(`🌄 ${p.name} ผลรุ่งอรุณแห่งวันใหม่จางลง — พลังชีวิต -1${p.sunriseDrop > 0 ? ` (เหลืออีก ${p.sunriseDrop} เทิร์น)` : ""}`);
      } else {
        lastLog.push(`🌄 ${p.name} ผลรุ่งอรุณแห่งวันใหม่จางลง — พลังชีวิตเหลือ 1 จึงไม่ลดต่อ`);
      }
    }

    // ---------- ซาโตรุ อาเคฟุ (patch 2.0.8.2): ดาเมจต่อเนื่องทุก 2 เทิร์น ----------
    //  สิ่งแปลกปลอม (Obla Di, Obla Da): ดาเมจ 1 / [Calamity]: ดาเมจตามเลเวล — ทำงานตอนเวลาคงเหลือเป็นเลขคี่
    {
      let dotDmg = 0;
      const dotFrom = [];
      if ((p.statuses.oblada || 0) > 0 && p.statuses.oblada % 2 === 1) { dotDmg += 1; dotFrom.push("สิ่งแปลกปลอม"); }
      if ((p.statuses.calamity || 0) > 0 && p.statuses.calamity % 2 === 1) {
        const lv = Math.max(1, (p.statusAmt && p.statusAmt.calamity) || 1);
        dotDmg += lv;
        dotFrom.push(`Calamity Lv${lv}`);
      }
      if (dotDmg > 0) {
        dealMixed(p, dotDmg);
        maybeBeatSave(p);
        maybeBeatMode(p);
        maybeEva3(p);
        p.wasAttacked = true;
        lastLog.push(`🌩️ ${p.name} ถูกหายนะกัดกิน (${dotFrom.join(" + ")}) — รับความเสียหาย -${dotDmg}`);
        if (p.alive && p.hp <= 0) {
          instantDeath(p);
          if (!p.alive) lastLog.push(`💀 ${p.name} เลือดจริงหมด ตกรอบ!`);
          p.cards = [];
          p.locked = true;
          p.busted = false;
          continue;
        }
      }
    }

    // แด่เพื่อนรักของฉัน (ชเรด เอลัน): ระหว่างชาร์จไม่เสียเลือดแล้ว (patch พิเศษ) — แจ้งนับถอยหลังอย่างเดียว
    if (CHAR_HOOKS.shrade_elan.charging(p)) {
      lastLog.push(`🎻 ${p.name} บรรเลงบทเพลงสุดท้าย — เหลืออีก ${p.statuses.shradecharge} เทิร์นจะปลดปล่อย`);
    }

    // เครื่องดื่มชูกำลัง (Apple guy): เพิ่มแต้มสกิล 1 แต่เสียพลัง 1 หน่วยต่อเทิร์น
    //  ความเสียหายธรรมดา (โดนโล่/เกราะก่อน ไม่เจาะเกราะ) และไม่ถึงตาย — เลือดค้างที่ 1
    if ((p.statuses.energy || 0) > 0) {
      addSkill(p, 1);
      if (p.shield > 0 || p.armor > 0 || (p.tempHp || 0) > 0 || p.hp > 1) {
        damageSoft(p);
        lastLog.push(`🥤 ${p.name} เครื่องดื่มชูกำลังออกฤทธิ์ — แต้มสกิล +1 เสียพลัง 1 หน่วย (เกราะก่อน)`);
      } else {
        lastLog.push(`🥤 ${p.name} เครื่องดื่มชูกำลังออกฤทธิ์ — แต้มสกิล +1 (พลังชีวิตเหลือ 1 จึงไม่ลด)`);
      }
    }

    // เกราะฟื้น 1 หน่วยทุก 2 เทิร์น (รอบเลขคู่) — เหมือนกันทั้งกลางวัน/กลางคืน (ยกเลิกโบนัสฟื้นทุกเทิร์นตอนกลางคืน patch 2.1.7)
    // Beat Mode: หลังกันตายทำงาน เกราะจะไม่ฟื้นคืน
    // หนูจะทำให้พี่ตาสว่างเอง (อาริมะ มิยาโกะ patch 2.2.0): เกราะไม่ฟื้นตามจำนวนเทิร์นที่เหลือ
    // MOON*CELL (คิชินามิ ฮาคุโนะ patch 2.2.1): เกราะไม่ฟื้นเลยระหว่างท่าไม้ตายทำงาน รวมถึงตัวเอง
    // [โหมงานหนัก] (โคโตเนะ patch 2.2.2): เปลี่ยนไปพังโล่แทนเกราะแล้ว — เกราะฟื้นได้ตามปกติ
    // ผุพัง (สถานะ Universal patch 2.2 beta — ไวท์เล็น "ฉันขอรับไปนะคะ"): เกราะไม่ฟื้นระหว่างมีผล
    if (!p.armorLocked && !((p.statuses.decay || 0) > 0) && !moonCellActive() && roundNumber % 2 === 0) {
      healArmor(p, 1);
    }
    // เสือนอนกิน (เจ้าแห่งเน็ตบ้าน): ฟื้นพลังชีวิต 1 หน่วยในเทิร์นถัดไป (กรณีไม่มีคู่สัญญา)
    if ((p.healNextTurn || 0) > 0) {
      const heal = healHp(p, p.healNextTurn);
      if (heal > 0) lastLog.push(`🐯 ${p.name} เสือนอนกิน — ฟื้นพลังชีวิต +${heal}`);
      p.healNextTurn = 0;
    }
    // การตื่นขึ้น (Lai Rhyme Goodfellow โอเบรอน): ฟื้นพลังชีวิตเทิร์นละ 1 หน่วย
    if ((p.statuses.awaken || 0) > 0 && healHp(p, 1) > 0) {
      lastLog.push(`⏰ ${p.name} การตื่นขึ้น — ฟื้นพลังชีวิต +1`);
    }
    firePassive(p, "roundStart");

    // ---------- โอกูริ แคป (Rework): Stamina ชาร์จ / ยุคทอง / Zone (GrayBeast) / หมดแรง (Burnout) / Sunny Day — เช็คตอนเริ่มเทิร์น ----------
    CHAR_HOOKS.oguri.onRoundStartTick(engine, p);

    // ---------- ลุกไหม้ (hburn, สถานะ Universal): ดาเมจ 1/เทิร์น สะสมสูงสุด 6 — ย้าย body ไป characters/_universal_status.js แล้ว ----------
    tickBurn(engine, p);
    // ---------- [โดนดูด] (doomDrain, Plasma Rifle — DoomGuy): ดาเมจ 1/เทิร์น 3 เทิร์น เจาะเกราะก่อน ----------
    CHAR_HOOKS.doomguy.tickDrain(engine, p);
    // ---------- บานาจ (patch 2.1.2, characters/banagher.js): Full Assault — ตีหมู่ทุกคนต่อเนื่องทุกต้นเทิร์นที่ผลยังอยู่ ----------
    CHAR_HOOKS.banagher.onRoundStartFullAssaultTick(engine, p);
    p.cards = [];
    p.cardBonus = 0; // แต้มการ์ดโบนัส (Ashen Trail โอกูริ patch 2.1.1) — รีเซ็ตทุกเทิร์น
    p.colorTrigger = { red: 0, blue: 0, green: 0, yellow: 0 }; // นับจำนวนครั้งที่ทริกเกอร์สีนั้นทำงานไปแล้วในรอบนี้
    p.statusAmt.cardAtkBonus = 0; // พลังโจมตีจากการ์ดแดง — รีเซ็ตทุกรอบ
    { const c = drawInitialCard(p); if (c) { p.cards.push(c); onCardDrawn(p, c); } }
    p.locked = false;
    p.busted = false;
    p.result = null;

    // [Calamity] (ซาโตรุ patch 2.0.8.2): ถูกบังคับจั่วไพ่เพิ่มตามเลเวล ตอนเริ่มเทิร์นถัดจากที่โดน
    if ((p.calamityDraw || 0) > 0) {
      const n = p.calamityDraw;
      p.calamityDraw = 0;
      for (let i = 0; i < n; i++) { const c = drawCardFor(p); if (c) { p.cards.push(c); onCardDrawn(p, c); } }
      p.busted = bustedOf(p);
      lastLog.push(`🌩️ [Calamity] บังคับ ${p.name} จั่วไพ่เพิ่ม ${n} ใบ${p.busted ? " — ไพ่แตกตั้งแต่ต้นเทิร์น!" : ""}`);
      if (p.busted) {
        voidUltimateOnBust(p);
        maybeMoonBurst(p);
      }
    }

    // หลับไหล (Lie Like Vortigern โอเบรอน): ออกการกระทำใดๆ ไม่ได้ทั้งเทิร์น
    // และเสียพลังชีวิตแบบไม่สนเกราะเทิร์นละ 1 หน่วย — หักได้เรื่อยๆ แต่ห้ามตาย (ค้างที่ 1 หน่วย)
    if ((p.statuses.sleep || 0) > 0) {
      p.locked = true;
      if (p.hp > 1) { p.hp--; p.dmgHp++; }
      lastLog.push(`💤 ${p.name} หลับไหลจากคำลวงของราชาภูติ — ขยับไม่ได้ (เหลืออีก ${p.statuses.sleep} เทิร์น)`);
    }

    // ---------- ฟุจิตะ โคโตเนะ (characters/kotone.js): Sleeping time / [เช้าที่สดใส] / ท่านประธานเซนะจัง / [โหมงานหนัก] สุ่มสตั้น ----------
    CHAR_HOOKS.kotone.onRoundStartTick(engine, p);
    // สตั้น (สถานะพื้นฐาน patch 2.0.8): ทำอะไรไม่ได้จนจบเทิร์นหรือจนกว่าดีบัฟจะหมดเวลา
    if ((p.statuses.stun || 0) > 0) {
      p.locked = true;
      lastLog.push(`😵 ${p.name} ติดสถานะสตั้น — ขยับไม่ได้ทั้งเทิร์น! (เหลืออีก ${p.statuses.stun} เทิร์น)`);
    }

    // Bard (characters/bard.js): ถูกขัดจังหวะการประพันธ์ (หลับ/สตั้น/ใบ้สกิล ฯลฯ) -> โน้ตทั้งหมดถูกรีเซ็ต
    CHAR_HOOKS.bard.onRoundStartInterruptCheck(engine, p);
  }

  // ความตายที่โรยรา (ชิกิ patch 2.0.8, characters/shiki.js): ทุกเทิร์นที่ท่าไม้ตายยังทำงาน มอบเส้นชีวิต +1 ให้ทุกคนยกเว้นตัวเอง
  CHAR_HOOKS.shiki.onRoundStartWitherTick(engine);

  // ---------- ริดดี้ มาร์เซนาส (patch 2.0.9, characters/riddhe.js): Event เริ่มเกม + สกิลติดตัว 1 ----------
  CHAR_HOOKS.riddhe.onRoundStartAlert(engine);
  CHAR_HOOKS.riddhe.onRoundStartGrudgeTick(engine);

  // ชำระค่าบริการ (เจ้าแห่งเน็ตบ้าน, characters/broadband_man.js)
  CHAR_HOOKS.broadband_man.onRoundStartBillTick(engine);

  // สลับช่วงเวลากลางวัน/กลางคืน (ทุก 3 เทิร์น): โอเบรอนสลับร่างอัตโนมัติ (characters/oberon.js)
  const night = isNightRound(roundNumber);
  CHAR_HOOKS.oberon.onDayNightTransition(engine, night, roundNumber, prevNight);
  if (roundNumber > 1 && night !== prevNight) {
    lastLog.push(night ? "🌙 ราตรีมาเยือน — สุ่มสกิลพื้นฐาน/สกิลรองแพงขึ้น +1 ทุกเทิร์น" : "☀️ ฟ้าสางแล้ว — จบเทิร์นได้แต้มสกิลเพิ่ม +1");
    // เสียงไพเราะที่กึกก้อง (ชเรด เอลัน, characters/shrade_elan.js): เข้ากลางคืนพร้อมท่วงทำนองครบ 5 -> เล่นวีดีโอเปิดตัว
    if (night) CHAR_HOOKS.shrade_elan.onNightStart(engine);
  }

  gameState = "PLAYING";
  startPhaseTimer(CARD_TIME, resolveRound);
  if (cutsceneQueue.length) { pausePlayingForCutscene(); return; } // วีดีโอสลับร่างโอเบรอนตอนเข้ากลางคืน
  broadcastState();
  checkAllLocked();
}

function hit(id) {
  const p = players[id];
  if (gameState !== "PLAYING" || !p || !p.alive || p.locked) return;
  if ((p.statuses.nodraw || 0) > 0) return; // อิ่มทงคัสสึเกิน: เทิร์นนี้จั่วเพิ่มไม่ได้
  if (CHAR_HOOKS.shrade_elan.charging(p)) return; // แด่เพื่อนรักของฉัน: ระหว่างชาร์จจั่วการ์ดเพิ่มไม่ได้
  if ((p.statuses.riddheguard || 0) > 0) return; // ฉันจะไม่ยอมสูญเสียใครไปอีก (ริดดี้): จั่วการ์ดเพิ่มไม่ได้
  if ((p.statuses.phenexTaunt || 0) > 0) return; // ไม่อยากให้ใครต้องเจ็บปวด (ริต้า เบอร์นัล): ระหว่างล่อเป้าจั่วการ์ดเพิ่มไม่ได้
  if ((p.tepeuPonderTurns || 0) > 0) return; // ครุ่นคิด (เทเปา): จั่วไพ่ไม่ได้ระหว่างนี้ (ยังโจมตีได้ถ้าชนะ)
  if (scoreOf(p) >= scoreCap(p)) return; // แต้มเต็มเพดาน (เช่น 21 พอดี) = จั่วไม่ได้ รอผู้ใช้ใช้สกิล/เปิดไพ่เอง
  // โชคลาภ (patch 2.2 new): จั่วปุ๊ป ถ้ามีบัฟสะสมอยู่ ใช้ 1 หน่วยทันทีแล้วหน่วยนั้นหายไป
  //  ปรับไพ่ที่จั่วให้แต้มรวมตกอยู่ 19-21 (สุ่มถ่วงน้ำหนัก มีเคสพิเศษถ้าแต้มปัจจุบันเป็น 19/20 อยู่แล้ว)
  //  ถ้าเป้าที่สุ่มได้ไม่มีไพ่ให้จั่วพอดี จะลองเป้าที่เหลือก่อน — ไม่มีไพ่ให้ตรงเป้าไหนเลยจริงๆ ค่อยจั่วแบบสุ่มตามปกติ (แตกได้ตามปกติ)
  let drawn = null;
  if ((p.statuses.fortune || 0) > 0) {
    p.statuses.fortune--;
    p.fortuneIdle = 0;
    if (p.statuses.fortune <= 0) delete p.statuses.fortune;
    const cur = calculateScore(p.cards);
    let picked = null;
    for (const target of fortuneTargetList(cur)) {
      const need = target - cur;
      if (need < 1 || need > 10) continue;
      const c = drawFromCentralDeck((card) => !card.special && card.value === need);
      if (c) { picked = { target, card: c }; break; }
    }
    if (picked) {
      drawn = picked.card;
      p.cards.push(drawn);
      lastLog.push(`🍀 ${p.name} โชคลาภทำงาน — ได้ไพ่ที่ทำให้แต้มรวมเป็น ${picked.target}!`);
    } else {
      drawn = drawCardFor(p);
      if (drawn) p.cards.push(drawn);
      lastLog.push(`🍀 ${p.name} โชคลาภทำงาน แต่ไม่มีไพ่ที่ทำให้ถึงเป้าไหนได้เลย — จั่วแบบสุ่มตามปกติ`);
    }
  } else {
    drawn = drawCardFor(p);
    if (drawn) p.cards.push(drawn);
  }
  if (drawn) onCardDrawn(p, drawn);
  p.busted = bustedOf(p);
  if (p.busted) { voidUltimateOnBust(p); maybeMoonBurst(p); CHAR_HOOKS.mageslayer.onBustOrLoseRoll(engine, p); }
  // ไพ่แตก: ไม่ล็อกอัตโนมัติ — ยังกดสกิล/ใช้ไอเทมได้ต่อไป จนกว่าจะกดเปิดไพ่เอง หรือทุกคนเปิดไพ่ครบ
  broadcastState();
  checkAllLocked();
}
function lock(id) {
  const p = players[id];
  if (gameState !== "PLAYING" || !p || !p.alive || p.locked) return;
  applyLockColorTriggers(p);
  p.locked = true;
  broadcastState();
  checkAllLocked();
}
// นานายะ ชิกิ: เปิด/ปิด Mystic eye of death perception (characters/nanaya.js)
function nanayaToggleEye(id) {
  const p = players[id];
  if (gameState !== "PLAYING" || !p || !p.alive || p.locked) return;
  if (p.characterId !== "nanaya") return;
  if (!CHAR_HOOKS.nanaya.toggleEye(engine, p)) return;
  io.emit("skillFlash", {
    name: `Mystic eye of death perception — ${p.nanayaEyeOn ? "เปิดใช้งาน" : "ปิดใช้งาน"}`,
    img: "/characters/nanaya/nanaya.png", by: p.name, color: POSITION_COLORS[p.position] || "#9B4F96",
  });
  broadcastState();
}
function useSkill(id, tier, targets, item) {
  const p = players[id];
  if (!p || !p.alive) return;
  if (gameState !== "PLAYING" || p.locked) return;
  if (!["basic", "secondary", "ultimate"].includes(tier)) return;
  // MOON*CELL (คิชินามิ ฮาคุโนะ): สกิลทั้งหมดของทุกคนใช้ไม่ได้เลย (รวมของฮาคุโนะเจ้าของท่าเองด้วย — เหลือแค่สกิลติดตัว)
  if (moonCellActive()) return;
  if (CHAR_HOOKS.shrade_elan.charging(p)) return; // แด่เพื่อนรักของฉัน: ระหว่างชาร์จใช้สกิลอื่นไม่ได้
  if ((p.statuses.riddheguard || 0) > 0) return; // ฉันจะไม่ยอมสูญเสียใครไปอีก (ริดดี้): ระหว่างทำงานกดสกิลไม่ได้
  if ((p.statuses.phenexTaunt || 0) > 0) return; // ไม่อยากให้ใครต้องเจ็บปวด (ริต้า เบอร์นัล): ระหว่างล่อเป้ากดสกิลไม่ได้เลย
  if (tier === "ultimate" && (p.statuses.phenexBanUlt || 0) > 0) return; // อย่าอยู่เลย แกน่ะ! (ริต้า เบอร์นัล): ถูกแบนท่าไม้ตายชั่วคราว
  // ---------- Bard : คีตกวี — เติมโน้ตประพันธ์เพลง (ช่องที่ 3 ไม่ใช่สกิล กดใช้ไม่ได้) ----------
  if (p.characterId === "bard") {
    if (tier === "ultimate") return; // ช่องประพันธ์เพลง — ไม่ใช่ปุ่มสกิล
    if ((p.statuses.noskill || 0) > 0) return;
    if (p.bardPending) return; // ต้องเลือกเป้าหมายบทเพลงที่ค้างอยู่ก่อน
    // จำกัด 2 โน้ตต่อเทิร์น (patch 2.0.5) — ระหว่างมิติมายาบรรเลง (โลหิต/วิญญาณ) ไม่ติดลิมิต 2
    //  แต่กดสกิลได้สูงสุด 6 ครั้งต่อเทิร์น (patch 2.0.8)
    const dimOn = (p.statuses.soulDim || 0) > 0 || (p.statuses.bloodDim || 0) > 0;
    if ((p.bardNotesUsed || 0) >= (dimOn ? BARD_DIM_NOTES_PER_TURN : BARD_NOTES_PER_TURN)) return;
    // กระแสเวท / ภาระเวท (patch 2.0.8) มีผลกับค่าโน้ตด้วย
    const noteCost = Math.max(0, BARD_NOTE_COST - statusAmtOf(p, "spellflow")) + Math.min(SPELLBURDEN_MAX, statusAmtOf(p, "spellburden"));
    const noteBless = noteCost > 0 && (p.statuses.freecast || 0) > 0; // การ์ดราชินี: ใช้สกิลไม่เสียแต้ม 1 ครั้ง
    if (!noteBless && p.skillPoints < noteCost) return;
    const lucky = Math.random() < BARD_NOTE_FREE_CHANCE; // 15% ไม่เสียพลังงาน (พรสวรรค์)
    let free = lucky || noteCost === 0;
    if (!free) {
      if (noteBless) {
        p.statuses.freecast--;
        if (p.statuses.freecast <= 0) delete p.statuses.freecast;
        lastLog.push(`👸 ${p.name} การ์ดราชินี — เติมโน้ตนี้โดยไม่เสียพลังงาน`);
        free = true;
      } else {
        p.skillPoints -= noteCost;
      }
    }
    p.bardNotesUsed = (p.bardNotesUsed || 0) + 1;
    const note = tier === "basic" ? "R" : "J";
    p.bardNotes = p.bardNotes || [];
    p.bardNotes.push(note);
    io.emit("bardSfx", { kind: "note", idx: p.bardNotes.length }); // เสียงเติมโน๊ตตามช่องที่ 1-3
    io.emit("skillFlash", {
      name: `${note === "R" ? "Crimson ❤️" : "Jade 💚"} — โน้ตช่องที่ ${p.bardNotes.length}/3${dimOn ? " (มิติมายาบรรเลง)" : ""}${free ? " (พรสวรรค์ ไม่เสียพลังงาน)" : ""}`,
      img: note === "R" ? BARD_CRIMSON_IMG : BARD_JADE_IMG,
      by: p.name, color: POSITION_COLORS[p.position] || "#9B4F96",
    });
    lastLog.push(`🎼 ${p.name} เติมโน้ต${note === "R" ? "ทำนองแห่งโลหิต ❤️" : "ทำนองแห่งวิญญาณ 💚"} (ช่องที่ ${p.bardNotes.length}/3)${free ? " — ไม่เสียพลังงาน" : ""}`);
    if (p.bardNotes.length >= 3) bardCompose(p, true);
    // วีดีโอสวนกลับที่ค้างคิว (Wonder of U ซาโตรุ — บทเพลงเล็งใส่ซาโตรุ) เล่นทันทีช่วงจั่วการ์ด
    if (gameState === "PLAYING" && cutsceneQueue.length) pausePlayingForCutscene();
    broadcastState();
    checkAllLocked();
    return;
  }
  const ch = CHAR_BY_ID[p.characterId];
  let skill = ch && ch[tier];
  // ชเรด เอลัน: หลังรวมร่าง — สกิลพื้นฐานเปลี่ยนเป็นเวอร์ชันสปาด้า (4 แต้ม ฟื้นเลือดอย่างเดียว)
  //  และปุ่มท่าไม้ตายถูกแทนที่ด้วย แด่เพื่อนรักของฉัน
  if (ch && ch.id === "shrade_elan") {
    if (tier === "basic" && p.shradeForm) skill = ch.basic2;
    if (tier === "secondary" && p.shradeForm) skill = ch.secondary2;
    if (tier === "ultimate") skill = p.shradeForm ? ch.ultimate2 : ch.ultimate;
  }
  // เรียวกิ ชิกิ: ท่าไม้ตายตามที่เลือกไว้ตอนเลือกตัวละคร (ฉันมองเห็นมันแล้ว / ความตายที่โรยรา)
  if (ch && ch.id === "shiki" && tier === "ultimate") {
    skill = (p.shikiUlt === "wither") ? ch.ultimate2 : ch.ultimate;
  }
  // ริดดี้ มาร์เซนาส (patch 2.0.9): ระหว่างเป็นพันธมิตรกับบานาจ — ท่าไม้ตายเปลี่ยนเป็นท่า 2
  if (ch && ch.id === "riddhe" && tier === "ultimate") {
    skill = riddheAllied(p) ? ch.ultimate2 : ch.ultimate;
  }
  // บานาจ ลิงก์ (patch 2.1.2): ระหว่างร่าง NewType Paradise — สกิลรอง 1 เปลี่ยนเป็น Beam Magnum เสมอ
  //  ท่าไม้ตายเปลี่ยนเป็นแสงที่ไม่อยู่เพียงลำพัง เฉพาะตอนมีริดดี้เป็นพันธมิตรอยู่ด้วย
  if (ch && ch.id === "banagher") {
    const banagherTransformed = (p.statuses.paradise || 0) > 0;
    if (tier === "secondary") skill = banagherTransformed ? ch.secondary2 : ch.secondary;
    if (tier === "ultimate") skill = (banagherTransformed && riddheAllied(p)) ? ch.ultimate2 : ch.ultimate;
  }
  // ริต้า เบอร์นัล (patch 2.1.6): ระหว่างฝืนใช้งาน NTD-Sytem (ชั่วคราวหรือถาวรหลังสกิลติดตัว 1) — สกิลรองเปลี่ยนเป็นสกิลรอง 2
  //  หลังเกิดใหม่ (สกิลติดตัว 1 ทำงานแล้ว) — ท่าไม้ตายเปลี่ยนเป็นท่าไม้ตาย 2 ถาวร
  if (ch && ch.id === "phenex") {
    const ntdOn = (p.statuses.phenexNtd || 0) > 0 || p.phenexNtdPermanent;
    if (tier === "secondary") skill = ntdOn ? ch.secondary2 : ch.secondary;
    if (tier === "ultimate") skill = p.phenexReborn ? ch.ultimate2 : ch.ultimate;
  }
  // คิชินามิ ฮาคุโนะ (patch 2.2.1): สกิลรองสลับตามเพศ — ชาย = ข้าขอบัญชา (ผกผัน) / หญิง = ข้าขอบัญชา (ไร้ทางเยียวยา)
  if (ch && ch.id === "hakuno" && tier === "secondary") {
    skill = p.hakunoGender === "female" ? ch.secondary2 : ch.secondary;
  }
  // ไรโด ฮิคารุ (patch 2.1.3): ระหว่างร่าง Ginga หรือ Ginga Strium — สกิลพื้นฐานเปลี่ยนเป็น UPG! (basic2)
  //  ระหว่างร่าง Ginga Strium (ท่าไม้ตาย) — สกิลรองเปลี่ยนเป็นลำแสงสโตเรียม (secondary2)
  if (ch && ch.id === "hikaru") {
    if (tier === "basic") skill = ((p.statuses.ginga || 0) > 0 || (p.statuses.gingastrium || 0) > 0) ? ch.basic2 : ch.basic;
    if (tier === "secondary") skill = (p.statuses.gingastrium || 0) > 0 ? ch.secondary2 : ch.secondary;
  }
  // โอกูริ แคป (Rework): ยุคทองครบ 3 + Stamina ชาร์จ 75 ขึ้นไป = ท่าไม้ตายกลายเป็น Ashen Trail: Cinderella Gray
  if (ch && ch.id === "oguri") {
    if (tier === "ultimate") skill = oguriAshenReady(p) ? ch.ultimate2 : ch.ultimate;
  }
  // สึงาชิ ทาคุโตะ (patch 2.2 new): Apprivoise! ทำงานแล้ว — สกิลพื้นฐานเปลี่ยนเป็น Star Sword Emeraude ถาวร
  if (ch && ch.id === "takuto" && tier === "basic" && (p.statuses.apprivoise || 0) > 0) skill = ch.basic2;
  // patch 2.2.5: กันตาย (สกิลติดตัว 1) เคยทำงานไปแล้ว — ท่าไม้ตายเปลี่ยนเป็นร่วมเดินทางไปกับฉันเถอะถาวร (แทนพิชิตแสงดาว)
  if (ch && ch.id === "takuto" && tier === "ultimate" && p.beatSaved) skill = ch.ultimate2;
  if (!skill) return;
  // โอเบรอน/โคโตเนะ: สกิลสลับตามช่วงเวลา — กลางคืนใช้เวอร์ชันกลางคืนแทน
  if (tier === "ultimate" && ch.ultimateNight && isNightRound(roundNumber)) skill = ch.ultimateNight;
  if (tier === "secondary" && ch.secondaryNight && isNightRound(roundNumber)) skill = ch.secondaryNight;
  if (tier === "basic" && ch.basicNight && isNightRound(roundNumber)) skill = ch.basicNight;
  if ((p.statuses.noskill || 0) > 0) return; // โดนหอกลองกินัสปัก: เทิร์นนี้ใช้สกิลไม่ได้

  // เวลาทอง (แกมเบลอร์): แต้มที่ใช้ของสกิลพื้นฐาน/สกิลรองลดครึ่งหนึ่ง
  const isGambler = p.characterId === "gambler";
  const goldenOn = (p.statuses.golden || 0) > 0;
  let cost = skill.cost;
  if (isGambler && goldenOn && (tier === "basic" || tier === "secondary")) cost = Math.ceil(cost / 2);
  // กลางคืน (patch 2.1.7): สกิลที่สุ่มโดนคืนนี้ (พื้นฐาน/รอง อย่างใดอย่างหนึ่ง) ใช้แต้มมากขึ้น +1 — ไม่เกิน 8 ไม่มีผลกับท่าไม้ตาย
  if (p.nightTaxTier === tier && cost < 8) cost += 1;
  // [โหมงานหนัก] (โคโตเนะ): ใช้แต้มสกิลเพิ่มขึ้น 1 แต้มทุกสกิล
  if (p.characterId === "kotone" && CHAR_HOOKS.kotone.overworkActive(p)) cost += 1;
  // ---------- โอกูริ แคป (Rework): เงื่อนไข Energy / Stamina ชาร์จ ----------
  const isOguri = p.characterId === "oguri";
  const isBreakfast = isOguri && tier === "basic";
  const isOguriTrain = isOguri && tier === "secondary";
  const isAshenTrail = isOguri && tier === "ultimate" && oguriAshenReady(p);
  const isVictoryBeat = isOguri && tier === "ultimate" && !isAshenTrail;
  if (isOguriTrain && (p.oguriEnergy || 0) < OGURI_TRAIN_ENERGY_COST) return; // Energy ไม่พอ
  if (isVictoryBeat && (p.stamina || 0) < OGURI_ULT_CHARGE_COST) return;  // Stamina ชาร์จไม่พอ
  // ยุคทองครบ 3 แต้ม: Training ใช้แต้มสกิลลดลง -1 (ใช้งานได้บ่อยขึ้น)
  if (isOguriTrain && oguriGoldStacks(p) >= OGURI_GOLD_MAX) cost = Math.max(0, cost - 1);
  // ---------- ซาโตรุ อาเคฟุ (characters/satoru.js) ----------
  const isSatoru = p.characterId === "satoru";
  if (isSatoru && tier === "ultimate") return; // Wonder of U ทำงานอัตโนมัติ — กดเองไม่ได้
  const isOblada = isSatoru && tier === "basic";     // Obla Di, Obla Da: เลือกเป้าหมาย 1 คน (คนอื่นเท่านั้น)
  let obladaTarget = null;
  if (isOblada) {
    obladaTarget = CHAR_HOOKS.satoru.prepareObladaTarget(engine, p, targets);
    if (!obladaTarget) return;
  }
  const isLoca = isSatoru && tier === "secondary";   // Locacaca fruit: เลือกตัวเอง หรือยื่นให้คนอื่น
  let locaTarget = null;
  if (isLoca) {
    locaTarget = CHAR_HOOKS.satoru.prepareLocaTarget(engine, p, targets);
    if (!locaTarget) return;
  }
  // กระแสเวท / ภาระเวท (สถานะพื้นฐาน patch 2.0.8): ใช้พลังงานลดลง/เพิ่มขึ้นตามจำนวนที่ระบุ
  cost = Math.max(0, cost - statusAmtOf(p, "spellflow"));
  cost += Math.min(SPELLBURDEN_MAX, statusAmtOf(p, "spellburden"));
  // การ์ดราชินี: ใช้สกิลไม่เสียแต้ม 1 ครั้ง — ใช้กับสกิลที่มีค่าใช้จ่ายเท่านั้น
  const blessFree = cost > 0 && (p.statuses.freecast || 0) > 0;
  if (blessFree) cost = 0;
  if (p.skillPoints < cost) return;

  const st = skill.effect && !Array.isArray(skill.effect) && skill.effect.type === "status" ? skill.effect.status : null;

  // เวลาทอง (แกมเบลอร์): กดสกิลพื้นฐานซ้ำในเทิร์นเดียวได้ จนกว่าจำนวนใช้/แต้มจะหมด
  const isGamble = isGambler && tier === "basic";
  const gambleRepeat = isGamble && goldenOn;
  // เอาแบบนี้ได้ไหม (Apple guy สกิลพื้นฐาน): เลือกของส่งมอบ — ไม่นับเป็นการใช้สกิลของเทิร์น
  //  (ใช้แล้วยังเลือกใช้สกิลอื่นได้อีก 1 ครั้ง)
  const isApplePick = p.characterId === "appleguy" && tier === "basic";
  if (isApplePick && !CHAR_HOOKS.appleguy.validateBasicItem(item)) return; // ต้องเลือกของที่มีจริงเท่านั้น (characters/appleguy.js)
  // มีดพับประจำตระกูล (โทโนะ ชิกิ สกิลพื้นฐาน): เลือกระดับ 1-5 — ไม่นับเป็นการใช้สกิลของเทิร์น (กดเปลี่ยนกี่ครั้งก็ได้)
  const isTohnoPick = p.characterId === "tohno" && tier === "basic";
  if (isTohnoPick && !CHAR_HOOKS.tohno.validateBasicItem(item)) return; // ต้องเลือกระดับ 1-5 เท่านั้น (characters/tohno.js)
  // เธอ/นาย คือฉันหรอ? (คิชินามิ ฮาคุโนะ สกิลพื้นฐาน): สลับเพศ — ไม่นับเป็นการใช้สกิลของเทิร์น แต่กดสลับได้แค่ 1 ครั้งต่อเทิร์น
  const isHakunoGender = p.characterId === "hakuno" && tier === "basic";
  if (isHakunoGender && p.hakunoGenderSwitched) return;
  // DoomGuy (patch 2.2 full): สกิลติดตัว "ไม่ติดคูลดาวน์การใช้สกิล" — Quick Swap (พื้นฐาน) และ Weapon (รอง)
  //  ไม่นับเป็นการใช้สกิลของเทิร์น กดได้ทั้งคู่ในเทิร์นเดียวกัน (Quick Swap เองยังจำกัด 1 ครั้ง/เทิร์นแยกต่างหาก)
  const isDoomguyPick = p.characterId === "doomguy" && (tier === "basic" || tier === "secondary");
  // ไค ชิซากิ: มือซ้ายแห่งการรังสรรค์ (พื้นฐาน) + มือขวาแห่งการลงทัณฑ์ (รอง) ไม่นับเป็นการใช้สกิลของเทิร์นร่วมกัน
  //  งบรวม 2 ครั้งต่อเทิร์น ผสมกันได้อิสระ (เช่น รังสรรค์ 2 ครั้งใส่คนละเป้า, หรือ 1 รังสรรค์ + 1 ลงทัณฑ์)
  const isKaiPick = p.characterId === "kai" && (tier === "basic" || tier === "secondary");
  if (isKaiPick && (p.kaiSkillUsesRound || 0) >= 2) return;
  // ทาคุมิ ฟุจิวาระ: ขึ้นเกียร์ (พื้นฐาน) / ลงเกียร์ (รอง) / ถึงจะมองไม่เห็น แต่ฉันยังอยู่ (ท่าไม้ตาย) ไม่นับเป็นการใช้สกิลของเทิร์นร่วมกัน
  //  งบรวม 5 ครั้งต่อเทิร์น ผสมกันได้อิสระ (แพทเทิร์นเดียวกับไค กว้างขึ้นครอบคลุมท่าไม้ตายด้วย) — ท่าไม้ตายกดซ้ำไม่ได้ผ่านเช็คทั่วไปด้านล่าง (takumiBlackout บล็อกเอง)
  const isTakumiPick = p.characterId === "takumi" && (tier === "basic" || tier === "secondary" || tier === "ultimate");
  if (isTakumiPick && (p.takumiSkillUsesRound || 0) >= 5) return;
  const isTakumiGearUp = p.characterId === "takumi" && tier === "basic";
  const isTakumiGearDown = p.characterId === "takumi" && tier === "secondary";
  const isTakumiBlackout = p.characterId === "takumi" && tier === "ultimate";
  if (p.skillUsedRound && !gambleRepeat && !isApplePick && !isTohnoPick && !isHakunoGender && !isDoomguyPick && !isKaiPick && !isTakumiPick) return; // ใช้สกิลได้เพียง 1 อันต่อเทิร์น (ซ้ำ/ซ้อนไม่ได้)
  // MOON*CELL (คิชินามิ ฮาคุโนะ): ต้องมีแต้มคำสาปแห่งดวงจันทร์ครบ 3 เท่านั้น
  if (st === "moonCell" && (p.hakunoMoonPoints || 0) < HAKUNO_MOONCELL_NEED) return;
  // ข้าขอบัญชา (ชาย/หญิง คิชินามิ ฮาคุโนะ): กดซ้ำไม่ได้จนกว่าผลเดิมจะหมด
  if (st === "hakunoInvertReady" && (p.statuses.hakunoInvertReady || 0) > 0) return;
  if (st === "hakunoNoRegenReady" && (p.statuses.hakunoNoRegenReady || 0) > 0) return;
  // Beat Mode (ประกายเขี้ยว): ท่าไม้ตายใช้ไม่ได้เสมอ / สกิลพื้นฐานใช้ไม่ได้เฉพาะหลังกันตายทำงานแล้ว (patch 2.2 alpha)
  if (tier === "ultimate" && beatActive(p)) return;
  if (tier === "basic" && p.characterId === "kuwagata" && beatActive(p) && p.beatSaved) return;
  // ท่าไม้ตาย: กดซ้ำไม่ได้จนกว่าผลจะหมดเวลา (สวมเกราะราชันคงอยู่ถาวร = กดซ้ำไม่ได้อีกเลยตลอดเกม)
  if (tier === "ultimate" && st && (p.statuses[st] || 0) > 0) return;
  // เวลาทอง (แกมเบลอร์): ระหว่างบัฟยังอยู่ กดท่าไม้ตายซ้ำไม่ได้
  if (tier === "ultimate" && isGambler && goldenOn) return;
  // ---------- ไรโด ฮิคารุ / อุลตร้าแมนกิงกะ (rework patch 2.1.3) ----------
  // Ultlive Ultraman Ginga (สกิลรอง 1): ใช้ไม่ได้ระหว่างติด MonsterLive และกดซ้ำไม่ได้จนกว่าผลจะหมด
  const isHikaruGinga = p.characterId === "hikaru" && skill === ch.secondary;
  if (isHikaruGinga && (p.statuses.monster || 0) > 0) return;
  if (isHikaruGinga && (p.statuses.ginga || 0) > 0) return;
  // Ginga Strium (ท่าไม้ตาย): ต้องอยู่ในร่าง Ginga (สกิลรอง 1 ยังไม่หมดเวลา) และต้องเป็นตอนกลางวันเท่านั้นถึงใช้ได้
  if (tier === "ultimate" && p.characterId === "hikaru" && (!((p.statuses.ginga || 0) > 0) || isNightRound(roundNumber))) return;
  // Rainbow Pudding (คุวากาตะ): ไม่จำกัดจำนวนครั้งต่อเกม (patch 2.2 alpha)
  const isPudding = p.characterId === "kuwagata" && tier === "basic";
  // วอสก้าหน่อยน้อง (แกมเบลอร์): ใช้ได้ 3 ครั้งต่อเกม (เวลาทองรีเซ็ตให้เต็ม)
  if (isGamble && (p.gamblerUses || 0) <= 0) return;
  // หอกแห่งแคสเซียส (เอวา 13 patch 2.2 alpha): กดซ้ำไม่ได้จนกว่าจะได้โจมตี
  const isCassius = p.characterId === "eva13" && tier === "basic";
  if (isCassius && (p.statuses.cassius || 0) > 0) return;
  // หอกลองกินัส (เอวา 13 patch 2.2 alpha): กดซ้ำไม่ได้จนกว่าจะได้โจมตี
  if (p.characterId === "eva13" && tier === "secondary" && (p.statuses.spear || 0) > 0) return;
  // Fourth Impact (เอวา 13): ใช้ได้เมื่อสกิลติดตัว 3 (เลือด <= 4) ทำงานอยู่เท่านั้น
  if (st === "fourth" && !CHAR_HOOKS.eva13.isEva3Active(engine, p)) return;
  // Crucible (DoomGuy patch 2.2 full): ใช้ได้เมื่อชาร์จครบ 5 เท่านั้น
  if (st === "doomCrucible" && (p.doomCharge || 0) < DOOM_CRUCIBLE_CHARGE_NEED) return;
  // ม่านแห่งราตรี (โอเบรอน): กดซ้ำไม่ได้จนกว่าผลเพิ่มพลังโจมตีจะหมด
  const isVeil = p.characterId === "oberon" && tier === "basic";
  if (isVeil && (p.statuses.veil || 0) > 0) return;
  // พี่จ๋าอยู่ไหน (อาริมะ มิยาโกะ): กดซ้ำไม่ได้จนกว่าจะได้โจมตี
  if (p.characterId === "miyako" && tier === "basic" && (p.statuses.miyakoHeal || 0) > 0) return;
  // เพลงหมัด อาริมะ (อาริมะ มิยาโกะ): กดซ้ำไม่ได้จนกว่าจะได้โจมตี
  if (p.characterId === "miyako" && tier === "secondary" && (p.statuses.miyakoCombo || 0) > 0) return;
  // รุ่งอรุณแห่งวันใหม่ (โอเบรอน สกิลรองกลางวัน, characters/oberon.js)
  const isSunrise = p.characterId === "oberon" && tier === "secondary" && !isNightRound(roundNumber);
  let sunriseTarget = null;
  if (isSunrise) {
    sunriseTarget = CHAR_HOOKS.oberon.prepareSunriseTarget(engine, targets);
    if (!sunriseTarget) return;
  }
  // ฝันร้ายยามค่ำคืน (โอเบรอน สกิลรองกลางคืน, characters/oberon.js): self-buff ไม่มีเป้าหมาย — กดซ้ำไม่ได้ระหว่างมีผล
  const isNightmare = p.characterId === "oberon" && tier === "secondary" && isNightRound(roundNumber);
  if (isNightmare && (p.statuses.oberonSickle || 0) > 0) return;
  // เอาไปสิ (Apple guy สกิลรอง, characters/appleguy.js): เลือกผู้เล่น 1 คน (คนอื่นเท่านั้น) มอบของที่เลือกไว้ทันทีก่อนเปิดการ์ด
  const isAppleGive = p.characterId === "appleguy" && tier === "secondary";
  let appleTarget = null;
  if (isAppleGive) {
    appleTarget = CHAR_HOOKS.appleguy.prepareGiveTarget(engine, p, targets);
    if (!appleTarget) return;
  }
  // ---------- ฟุจิตะ โคโตเนะ (patch 1.9.1 / rework 2.1.3) ----------
  const isKotone = p.characterId === "kotone";
  const kotoneNight = isNightRound(roundNumber);
  const isPartTime = isKotone && tier === "basic";                    // Part-time (กลางวัน/กะดึก)
  const isDance = isKotone && tier === "secondary" && !kotoneNight;   // สกิลรอง (คอส coin ล้วน — แทน Dance Lession เดิม)
  const isKSleep = isKotone && tier === "secondary" && kotoneNight;   // สกิลรอง 2 — Sleeping time
  const isKawaii = isKotone && tier === "ultimate";                   // Sekai ichi kawaii watashi
  if (isPartTime && CHAR_HOOKS.kotone.overworkActive(p)) return;                        // โหมงานหนัก: Part-time ใช้ไม่ได้
  if (isDance && CHAR_HOOKS.kotone.overworkActive(p)) return;                           // โหมงานหนัก: สกิลรอง ใช้ไม่ได้
  if (isDance && (p.coins || 0) < KOTONE_DANCE_COIN_COST) return;    // สกิลรอง (patch 2.2.2): ต้องมี coin อย่างน้อย 3 เหรียญ
  if (isKawaii && (CHAR_HOOKS.kotone.overworkActive(p) || kotoneNight)) return;         // ท่าไม้ตาย: ใช้ไม่ได้ตอนกลางคืน/โหมงานหนัก
  if (isKSleep && (p.statuses.ksleep || 0) > 0) return;               // หลับอยู่แล้ว กดซ้ำไม่ได้
  // Sekai ichi kawaii watashi (โคโตเนะ patch 2.2.2): ตีหมู่ทุกคนแล้ว ไม่ต้องเลือกเป้าหมายอีกต่อไป
  // Dance Lession (patch พิเศษ): ใช้ใส่ตัวเองเท่านั้น — ไม่ต้องเลือกเป้าหมายอีกต่อไป
  // ---------- ชเรด เอลัน (patch พิเศษ) ----------
  const isShrade = p.characterId === "shrade_elan";
  const isShradeBasic = isShrade && tier === "basic";                        // เชิญรับฟัง
  const isShradeMoon = isShrade && tier === "secondary";                     // แสงจันทร์ส่องวิญญาณ
  const isShradeForm = isShrade && tier === "ultimate" && !p.shradeForm;     // รวมร่างทำนองเพลง
  const isShradeFinal = isShrade && tier === "ultimate" && p.shradeForm;     // แด่เพื่อนรักของฉัน
  if (isShradeForm) {
    if (!isNightRound(roundNumber)) return;                     // ปลดล็อกเฉพาะช่วงกลางคืน (สกิลติดตัว)
    if ((p.statuses.melody || 0) < SHRADE_MELODY_MAX) return;   // ต้องมีท่วงทำนองครบ 5
  }
  let shradeMoonTarget = null;
  if (isShradeMoon) {
    shradeMoonTarget = CHAR_HOOKS.shrade_elan.prepareMoonTarget(engine, p, targets);
    if (!shradeMoonTarget) return;
  }
  // ---------- เรียวกิ ชิกิ (patch 2.0.6, characters/shiki.js) ----------
  const isShikiLifeline = p.characterId === "shiki" && tier === "secondary"; // นายมีฝีมือแค่ไหนหรอ?
  let shikiLifelineTarget = null;
  if (isShikiLifeline) {
    shikiLifelineTarget = CHAR_HOOKS.shiki.prepareLifelineTarget(engine, p, targets);
    if (!shikiLifelineTarget) return;
  }
  // ---------- บานาจ ลิงก์ (patch 2.1.2, characters/banagher.js): Absorb shield — เลือกเป้าหมาย 1 คน (เลือกตัวเองได้) ----------
  const isBanagherShield = p.characterId === "banagher" && tier === "basic";
  let banagherShieldTarget = null;
  if (isBanagherShield) {
    banagherShieldTarget = CHAR_HOOKS.banagher.prepareShieldTarget(engine, p, targets);
    if (!banagherShieldTarget) return;
  }
  // ---------- DoomGuy (patch 2.2 full): Quick Swap (สกิลพื้นฐาน) 1 ครั้งต่อเทิร์น / Weapon (สกิลรอง) แปรตามอาวุธที่ถืออยู่ ----------
  const isDoomSwap = p.characterId === "doomguy" && tier === "basic";
  if (isDoomSwap && p.doomQuickSwapUsed) return; // ใช้ได้ 1 ครั้งต่อเทิร์น
  if (isDoomSwap && doomWeaponMarkPending()) return; // Combat Shotgun/Heavy Cannon: [ระเบิด]/[ล็อคเป้า] ยังค้างอยู่ — สุ่มปืนใหม่ไม่ได้จนกว่าจะโดนใช้
  const isDoomWeapon = p.characterId === "doomguy" && tier === "secondary";
  const doomW = isDoomWeapon ? (DOOM_WEAPONS[p.doomWeapon] || DOOM_WEAPONS.shotgun) : null;
  if (isDoomWeapon) cost = doomW.cost;
  if (isDoomWeapon && !doomW.effect) return; // ปืนบางกระบอกไม่มีความสามารถพิเศษให้กด (BFG 9000)
  let doomTarget = null;
  if (isDoomWeapon && ["explode", "lockon", "stun", "bonusdmg", "bonusdmg2", "drain"].includes(doomW.effect)) {
    doomTarget = CHAR_HOOKS.doomguy.resolveWeaponTarget(engine, p, targets);
    if (!doomTarget) return;
  }
  // ---------- สึงาชิ ทาคุโตะ (patch 2.2 new / 2.2.5) ----------
  const takutoApprivoiseOn = p.characterId === "takuto" && (p.statuses.apprivoise || 0) > 0;
  // patch 2.2.5: มีหอกผู้พิชิตอยู่ = ถือว่าดาบทั้ง 2 อันทำงานอยู่ กดซ้ำไม่ได้เหมือนกัน (แสดงเป็น disable)
  const isTakutoEmeraude = p.characterId === "takuto" && tier === "basic" && takutoApprivoiseOn;
  if (isTakutoEmeraude && ((p.statuses.emeraude || 0) > 0 || (p.statuses.lance || 0) > 0)) return; // ยังไม่ถูกใช้ กดซ้ำไม่ได้
  const isTakutoSaphir = p.characterId === "takuto" && tier === "secondary";
  if (isTakutoSaphir && !takutoApprivoiseOn) return; // ต้องอยู่ในสถานะ Apprivoise! ก่อนเท่านั้น
  if (isTakutoSaphir && ((p.statuses.saphir || 0) > 0 || (p.statuses.lance || 0) > 0)) return; // ยังไม่ถูกใช้ กดซ้ำไม่ได้
  // patch 2.2.4: ท่าไม้ตาย 1 "อย่างนายน่ะ จะไปเข้าใจอะไร" (พิชิตแสงดาว) — ใช้ได้เฉพาะก่อนกันตายทำงาน ต้องมีดาบทั้ง 2 อันพร้อมกันเท่านั้น
  const isTakutoUlt2 = p.characterId === "takuto" && tier === "ultimate" && !p.beatSaved;
  if (isTakutoUlt2 && !((p.statuses.emeraude || 0) > 0 && (p.statuses.saphir || 0) > 0)) return;
  if (isTakutoUlt2 && (p.statuses.takutoThirdAtk || 0) > 0) return; // มีโอกาสค้างอยู่แล้ว กดซ้ำไม่ได้จนกว่าจะได้ใช้ผล
  // patch 2.2.5: ท่าไม้ตาย 2 "ร่วมเดินทางไปกับฉันเถอะ" — แทนท่าไม้ตาย 1 ถาวรหลังกันตายทำงานแล้ว ไม่ต้องมีดาบก็กดได้
  const isTakutoUlt3 = p.characterId === "takuto" && tier === "ultimate" && p.beatSaved;
  if (isTakutoUlt3 && !takutoApprivoiseOn) return; // ต้องอยู่ในสถานะฉันคว้ามันได้แล้วก่อนเท่านั้น
  // ---------- เจ้าแห่งเน็ตบ้าน (patch 1.9) ----------
  const isTiger = p.characterId === "broadband_man" && tier === "basic";     // เสือนอนกิน
  const isLan = p.characterId === "broadband_man" && tier === "secondary";   // กระชากสายแลน
  const isOffer = p.characterId === "broadband_man" && tier === "ultimate";  // สนใจใช้บริการเราไหม
  // กระชากสายแลน: ใช้ได้ก็ต่อเมื่อมีคู่สัญญาแล้ว
  if (isLan && !CHAR_HOOKS.broadband_man.contractPartnerOf(engine, p)) return;
  // สนใจใช้บริการเราไหม: ใช้ไม่ได้ระหว่างมีคู่สัญญา/มีข้อเสนอค้าง — เลือกเป้าหมาย 1 คน (คนอื่นเท่านั้น)
  let offerTarget = null;
  if (isOffer) {
    if (CHAR_HOOKS.broadband_man.contractPartnerOf(engine, p) || p.contractOffer) return;
    offerTarget = CHAR_HOOKS.broadband_man.prepareOfferTarget(engine, p, targets);
    if (!offerTarget) return;
  }
  // ---------- นานายะ ชิกิ: อันนี้ของนายรึเปล่า (characters/nanaya.js) ----------
  const isNanayaSilence = p.characterId === "nanaya" && tier === "basic";
  let nanayaSilenceTarget = null;
  if (isNanayaSilence) {
    nanayaSilenceTarget = CHAR_HOOKS.nanaya.prepareSilenceTarget(engine, p, targets);
    if (!nanayaSilenceTarget) return;
  }
  // ---------- เทเปา (ชิกิ): วันนี้อากาศดีจัง / เป็นแบบนี้นี่เอง / นายเป็นคนทำตัวเองนะ ----------
  // patch 2.2.6: ระหว่างทำอาหารหรือครุ่นคิดอยู่ฝั่งใดฝั่งหนึ่ง ใช้สกิลอื่นไม่ได้เลย (รวมกดอีกฝั่งด้วย) จนกว่าฝั่งที่ทำอยู่จะหมดเวลา
  if (p.characterId === "tepeu" && ((p.tepeuCookTurns || 0) > 0 || (p.tepeuPonderTurns || 0) > 0)) return;
  const isTepeuCook = p.characterId === "tepeu" && tier === "basic";
  const isTepeuPonder = p.characterId === "tepeu" && tier === "secondary";
  const isTepeuKill = p.characterId === "tepeu" && tier === "ultimate";
  let tepeuKillTarget = null;
  if (isTepeuKill) {
    tepeuKillTarget = CHAR_HOOKS.tepeu.prepareKillTarget(engine, p, targets);
    if (!tepeuKillTarget) return;
  }
  // ---------- ไค ชิซากิ (characters/kai.js): มือซ้ายแห่งการรังสรรค์ / มือขวาแห่งการลงทัณฑ์ — Overhaul ไม่ผ่านช่องนี้ (ดู kaiOverhaul()) ----------
  if (p.characterId === "kai" && tier === "ultimate") return; // Overhaul ไม่ใช่ปุ่มสกิลปกติ — กดเองไม่ได้
  const isKaiCreation = p.characterId === "kai" && tier === "basic";
  const isKaiPunishment = p.characterId === "kai" && tier === "secondary";
  let kaiMarkTarget = null;
  if (isKaiCreation || isKaiPunishment) {
    kaiMarkTarget = CHAR_HOOKS.kai.prepareMarkTarget(engine, p, targets);
    if (!kaiMarkTarget) return;
  }
  // ---------- ผู้สังหารจอมมหาเวทย์ (characters/mageslayer.js): Witch Mark / Mana Rupture / Mana Burden ----------
  const isMsWitchMark = p.characterId === "mageslayer" && tier === "basic";
  let msWitchMarkTarget = null;
  if (isMsWitchMark) {
    msWitchMarkTarget = CHAR_HOOKS.mageslayer.prepareWitchMarkTarget(engine, p, targets);
    if (!msWitchMarkTarget) return;
  }
  const isMsRupture = p.characterId === "mageslayer" && tier === "ultimate";
  let msRuptureTarget = null;
  if (isMsRupture) {
    msRuptureTarget = CHAR_HOOKS.mageslayer.prepareRuptureTarget(engine, p, targets);
    if (!msRuptureTarget) return;
  }
  const isMsBurden = p.characterId === "mageslayer" && tier === "secondary";

  if (st === "beam" && (p.beamAmmo || 0) <= 0) return; // Beam Magnum กระสุนหมด ใช้ไม่ได้
  if (st === "beamplus" && (p.beamAmmo || 0) <= 0) return; // Beam Magnum Plus (ริดดี้) กระสุนหมด ใช้ไม่ได้
  // บานาจ (patch 2.1.2): Full Assault กดซ้ำไม่ได้จนกว่าผลจะหมด
  if (st === "fullassault" && (p.statuses.fullassault || 0) > 0) return;
  // บานาจ (patch 2.1.2.3): แสงที่ไม่อยู่เพียงลำพัง — ต้องมีกระสุน Beam Magnum เหลืออย่างน้อย 1 นัดทั้งคู่ (ตัวเอง + ริดดี้พันธมิตร)
  //  และริดดี้พันธมิตรต้องมีแต้มสกิลเหลืออย่างน้อย 8 แต้มด้วย (คอสจริงรวม 16 — ของตัวเอง 8 + พันธมิตร 8)
  if (st === "unibeam2") {
    const rAlly = riddheAllied(p);
    if (!rAlly || (p.beamAmmo || 0) <= 0 || (rAlly.beamAmmo || 0) <= 0 || rAlly.skillPoints < BANAGHER_ULT2_ALLY_COST) return;
  }
  // Ohger Finish (patch 2.2 alpha): ใช้ได้โดยไม่มีเงื่อนไขแล้ว — กดซ้ำไม่ได้จนกว่าจะได้โจมตี
  if (st === "ohger" && (p.statuses.ohger || 0) > 0) return;

  // ANATA WAAAAAAAA (เทมาริ): ต้องเลือกเป้าหมาย 1 คนก่อนใช้ (characters/temari.js)
  let anataTargets = null;
  if (st === "anata") {
    anataTargets = CHAR_HOOKS.temari.prepareAnataTargets(engine, p, targets);
    if (!anataTargets) return;
  }

  p.skillPoints -= cost;
  if (blessFree) {
    p.statuses.freecast--;
    if (p.statuses.freecast <= 0) delete p.statuses.freecast;
    lastLog.push(`👸 ${p.name} การ์ดราชินี — ใช้สกิลนี้โดยไม่เสียแต้มสกิล`);
  }
  if (!isApplePick && !isTohnoPick && !isHakunoGender && !isDoomguyPick && !isKaiPick && !isTakumiPick) p.skillUsedRound = true; // เอาแบบนี้ได้ไหม / มีดพับประจำตระกูล / เธอ/นาย คือฉันหรอ? / Quick Swap-Weapon (DoomGuy) / รังสรรค์-ลงทัณฑ์ (ไค) / ขึ้น-ลงเกียร์+ท่าไม้ตาย (ทาคุมิ)
  if (isKaiPick) p.kaiSkillUsesRound = (p.kaiSkillUsesRound || 0) + 1;
  if (isTakumiPick) p.takumiSkillUsesRound = (p.takumiSkillUsesRound || 0) + 1;

  // ---------- นายมีฝีมือแค่ไหนหรอ? (ชิกิ patch 2.0.6): ยกเลิกท่าไม้ตายทันทีที่มีผู้เล่นอื่นกด ----------
  //  มีชิกิถือชาร์จ godslay อยู่บนสนาม -> ท่าไม้ตายของผู้เล่นอื่นที่เพิ่งกดถูกยกเลิกทันที
  //  ไม่ว่าท่าจะทำงานก่อนหรือหลังเปิดการ์ด — แต้มสกิลที่จ่ายไปเสียฟรี (ไม่คืน) และเล่นวีดีโอแทนที่
  if (tier === "ultimate") {
    const slayer = alivePlayers().find(
      (s) => s.id !== p.id && s.characterId === "shiki" && (s.statuses.godslay || 0) > 0
    );
    if (slayer) {
      const hasVideo = shikiCancelUltimate(slayer, p, skill.name, skill.img);
      if (hasVideo) pausePlayingForCutscene();
      else { broadcastState(); checkAllLocked(); }
      return;
    }
  }

  // Rainbow Pudding (คุวากาตะ patch 2.2 alpha): characters/kuwagata.js
  if (isPudding) CHAR_HOOKS.kuwagata.applyBasicPudding(engine, p);

  // ---------- Gambler the gambling (characters/gambler.js) ----------
  let flashSuffix = ""; // ต่อท้ายชื่อสกิลบนป้ายเด้ง เพื่อบอกผลเสี่ยงโชคให้ทุกคนเห็น
  if (isGambler) flashSuffix = CHAR_HOOKS.gambler.resolveSkill(engine, p, tier) || "";
  // ---------- เอวา 13: หอกแห่งแคสเซียส (characters/eva13.js) ----------
  if (isCassius) CHAR_HOOKS.eva13.applyBasicCassius(p, engine.log);
  // ---------- โอเบรอน: ม่านแห่งราตรี (characters/oberon.js) ----------
  if (isVeil) CHAR_HOOKS.oberon.applyBasicVeil(engine, p);
  // ---------- โอเบรอน: รุ่งอรุณแห่งวันใหม่ / ฝันร้ายยามค่ำคืน (characters/oberon.js) ----------
  if (isSunrise && sunriseTarget) {
    const r = CHAR_HOOKS.oberon.applySunriseEffect(engine, p, sunriseTarget, skill.name);
    if (r) flashSuffix = r;
  }
  if (isNightmare) CHAR_HOOKS.oberon.activateNightmare(engine, p);
  // ---------- โทโนะ ชิกิ: มีดพับประจำตระกูล — เลือกระดับสกิลติดตัว 1-5 (กดเปลี่ยนกี่ครั้งก็ได้) (characters/tohno.js) ----------
  if (isTohnoPick) {
    flashSuffix = CHAR_HOOKS.tohno.applyBasicPick(engine, p, item);
  }
  // ---------- คิชินามิ ฮาคุโนะ (characters/hakuno.js): เธอ/นาย คือฉันหรอ? — สลับเพศ (กดได้แค่ 1 ครั้งต่อเทิร์น) ----------
  if (isHakunoGender) flashSuffix = CHAR_HOOKS.hakuno.applyGenderSwitch(engine, p);
  // ---------- Apple guy: เอาแบบนี้ได้ไหม / เอาไปสิ (characters/appleguy.js) ----------
  if (isApplePick) {
    flashSuffix = CHAR_HOOKS.appleguy.applyBasicPick(p, item, engine.log);
  }
  if (isAppleGive && appleTarget) {
    flashSuffix = CHAR_HOOKS.appleguy.applyGiveEffect(engine, p, appleTarget, skill.name);
  }
  // ---------- ฟุจิตะ โคโตเนะ (characters/kotone.js) ----------
  if (isPartTime) flashSuffix = CHAR_HOOKS.kotone.applyPartTimeEffect(engine, p);
  if (isDance) CHAR_HOOKS.kotone.applyDanceEffect(engine, p);
  if (isKSleep) CHAR_HOOKS.kotone.applyKSleepEffect(engine, p);
  // ---------- ชเรด เอลัน (characters/shrade_elan.js) ----------
  if (isShradeBasic) flashSuffix = CHAR_HOOKS.shrade_elan.applyBasicEffect(engine, p);
  if (isShradeMoon && shradeMoonTarget) flashSuffix = CHAR_HOOKS.shrade_elan.applyMoonEffect(engine, p, shradeMoonTarget, skill.name);
  if (isShradeForm) flashSuffix = CHAR_HOOKS.shrade_elan.activateForm(engine, p);
  if (isShradeFinal) CHAR_HOOKS.shrade_elan.activateFinal(engine, p);
  // ---------- เจ้าแห่งเน็ตบ้าน (characters/broadband_man.js): เสือนอนกิน / กระชากสายแลน / สนใจใช้บริการเราไหม ----------
  if (isTiger) flashSuffix = CHAR_HOOKS.broadband_man.applyTigerEffect(engine, p);
  if (isLan) flashSuffix = CHAR_HOOKS.broadband_man.applyUnplugEffect(engine, p, skill.name);
  if (isOffer && offerTarget) flashSuffix = CHAR_HOOKS.broadband_man.castOffer(engine, p, offerTarget, skill.name);
  // ---------- นานายะ ชิกิ: อันนี้ของนายรึเปล่า (characters/nanaya.js) ----------
  if (isNanayaSilence && nanayaSilenceTarget) {
    flashSuffix = CHAR_HOOKS.nanaya.applySilenceEffect(engine, p, nanayaSilenceTarget, skill.name);
  }
  // ---------- Apple guy: ชิวๆครับน้องๆ — รีเซ็ตอัตราหลบเป็น 100% ----------
  if (st === "chill") {
    p.chillDodge = 100;
    lastLog.push(`🏖️ ${p.name} ชิวๆครับน้องๆ — หลบหนีอย่างสบายใจ (จบเทิร์นได้แต้มสกิล +1 จนกว่าจะถูกโจมตี)`);
  }
  // ---------- ชิกิ: นายมีฝีมือแค่ไหนหรอ? (patch 2.0.6, characters/shiki.js) — เส้นชีวิต +1 + ชาร์จยกเลิกท่าไม้ตาย ----------
  if (isShikiLifeline && shikiLifelineTarget) {
    flashSuffix = CHAR_HOOKS.shiki.applyLifelineEffect(engine, p, shikiLifelineTarget, skill.name);
  }
  // ---------- เทเปา (characters/tepeu.js) ----------
  if (isTepeuCook) CHAR_HOOKS.tepeu.applyCookEffect(engine, p);
  if (isTepeuPonder) CHAR_HOOKS.tepeu.applyPonderEffect(engine, p);
  if (isTepeuKill && tepeuKillTarget) flashSuffix = CHAR_HOOKS.tepeu.applyKillEffect(engine, p, tepeuKillTarget, skill.name);
  // ---------- ไค ชิซากิ (characters/kai.js) ----------
  if (isKaiCreation && kaiMarkTarget) flashSuffix = CHAR_HOOKS.kai.applyMark(engine, p, kaiMarkTarget, "kaiCreation", "รังสรรค์");
  if (isKaiPunishment && kaiMarkTarget) flashSuffix = CHAR_HOOKS.kai.applyMark(engine, p, kaiMarkTarget, "kaiPunishment", "ลงทัณฑ์");
  // ---------- ผู้สังหารจอมมหาเวทย์ (characters/mageslayer.js) ----------
  if (isMsWitchMark && msWitchMarkTarget) flashSuffix = CHAR_HOOKS.mageslayer.applyWitchMark(engine, p, msWitchMarkTarget);
  if (isMsRupture && msRuptureTarget) flashSuffix = CHAR_HOOKS.mageslayer.applyRuptureEffect(engine, p, msRuptureTarget, skill.name);
  if (isMsBurden) {
    p.transformAt = ++transformCounter; // Mana Burden: BGM mageslayer_ult ใช้ลำดับนี้ตัดสินว่าใครล่าสุด
    CHAR_HOOKS.mageslayer.applyManaBurden(engine, p);
  }
  // ---------- ทาคุมิ ฟุจิวาระ (characters/takumi.js) ----------
  if (isTakumiGearUp) flashSuffix = CHAR_HOOKS.takumi.applyGearUp(engine, p);
  if (isTakumiGearDown) flashSuffix = CHAR_HOOKS.takumi.applyGearDown(engine, p);
  if (isTakumiBlackout) CHAR_HOOKS.takumi.activateBlackout(engine, p);
  // ---------- โอกูริ แคป (Rework, characters/oguri.js) ----------
  if (isBreakfast) flashSuffix = CHAR_HOOKS.oguri.applyBreakfast(engine, p);
  if (isOguriTrain) flashSuffix = CHAR_HOOKS.oguri.applyTraining(engine, p);
  if (isVictoryBeat) CHAR_HOOKS.oguri.activateVictory(engine, p);
  if (isAshenTrail) CHAR_HOOKS.oguri.activateAshenTrail(engine, p);

  // ---------- ซาโตรุ อาเคฟุ (characters/satoru.js) ----------
  if (isOblada && obladaTarget) {
    flashSuffix = CHAR_HOOKS.satoru.applyObladaEffect(engine, p, obladaTarget, skill.name);
  }
  if (isLoca && locaTarget) {
    flashSuffix = CHAR_HOOKS.satoru.applyLocaEffect(engine, p, locaTarget);
  }

  // ---------- ชิกิ: ท่าไม้ตายทั้งสอง (characters/shiki.js) — เปิดเนตรมารแห่งความมรณะ / ความตายที่โรยรา ----------
  if (st === "deatheye") CHAR_HOOKS.shiki.activateDeatheye(engine, p);
  if (st === "wither") CHAR_HOOKS.shiki.activateWither(engine, p);

  // ทงคัสสึ 3 มื้อ (เทมาริ patch 2.0.6): นับชามสะสม (characters/temari.js)
  if (p.characterId === "temari" && tier === "basic") CHAR_HOOKS.temari.applyBasicTonkatsu(p);
  applyEffect(p, skill.effect);

  // ---------- บานาจ ลิงก์ (patch 2.1.2, characters/banagher.js) ----------
  if (isBanagherShield && banagherShieldTarget) CHAR_HOOKS.banagher.applyShieldEffect(engine, p, banagherShieldTarget);
  // ---------- DoomGuy (patch 2.2 full, characters/doomguy.js) ----------
  if (isDoomSwap) CHAR_HOOKS.doomguy.applyQuickSwap(engine, p);
  if (isDoomWeapon) {
    io.emit("skillFlash", { name: `🔫 ${doomW.name}`, img: doomW.img, by: p.name, color: POSITION_COLORS[p.position] || "#888", doomWeapon: p.doomWeapon }); // เสียงสกิลอาวุธ (เฉพาะฝั่ง client แปลว่าเสียงตามอาวุธ)
    CHAR_HOOKS.doomguy.applyWeaponEffect(engine, p, doomW, doomTarget);
  }
  // ---------- สึงาชิ ทาคุโตะ (patch 2.2 new, characters/takuto.js) ----------
  if (p.characterId === "takuto" && tier === "basic" && !takutoApprivoiseOn) CHAR_HOOKS.takuto.applyBasicStar(engine, p);
  if (isTakutoEmeraude) CHAR_HOOKS.takuto.applyEmeraude(engine, p);
  if (isTakutoSaphir) CHAR_HOOKS.takuto.applySaphir(engine, p);
  // ---------- สึงาชิ ทาคุโตะ ท่าไม้ตาย 1 (patch 2.2.4): อย่างนายน่ะ จะไปเข้าใจอะไร (พิชิตแสงดาว) — แทน Tau Missile เดิม ----------
  //  เงื่อนไข: ต้องมีดาบทั้ง 2 อัน (Emeraude+Saphir) พร้อมกันเท่านั้นถึงจะใช้ได้ (เช็คที่ gate ด้านบนแล้ว) — ใช้ได้เฉพาะก่อนกันตายทำงาน
  if (isTakutoUlt2) CHAR_HOOKS.takuto.activateUlt2(engine, p);
  // ---------- สึงาชิ ทาคุโตะ ท่าไม้ตาย 2 ใหม่ (patch 2.2.5): ร่วมเดินทางไปกับฉันเถอะ — แทนท่าไม้ตาย 1 ถาวรหลังกันตายทำงานแล้ว ----------
  if (isTakutoUlt3) CHAR_HOOKS.takuto.activateUlt3(engine, p);
  // Full Assault (characters/banagher.js): ตีหมู่ทุกคนทันที 1 หน่วย (เทิร์นถัดไปอีก 2 ครั้งผ่าน dealRound) แล้วเล่นวีดีโอ
  if (st === "fullassault") CHAR_HOOKS.banagher.activateFullAssault(engine, p);
  // NewType Paradise / แสงที่ไม่อยู่เพียงลำพัง (characters/banagher.js) — ทำงานก่อนเปิดการ์ด
  if (st === "paradise") CHAR_HOOKS.banagher.activateParadise(engine, p);
  if (st === "unibeam2") CHAR_HOOKS.banagher.activateUnibeam2(engine, p, cost);

  // ---------- ริดดี้ มาร์เซนาส (patch 2.0.9, characters/riddhe.js) ----------
  if (st === "absorbplus") CHAR_HOOKS.riddhe.activateAbsorbShield(engine, p);
  if (st === "riddhentd") CHAR_HOOKS.riddhe.activateNtd(engine, p);
  if (st === "riddheguard") CHAR_HOOKS.riddhe.activateGuard(engine, p);

  // Song for you (เทมาริ patch 2.0.6.1): ล้างสถานะผิดปกติทั้งหมดของตัวเอง แล้วนำชามทงคัสสึมาบัฟตัวเอง
  //  1 ชาม = +1 พลังขิง — ใช้แล้วล้างชามทั้งหมด
  if (st === "song") {
    const bowls = p.tonkatsu || 0;
    const atk = bowls;
    p.songAtk = atk;
    p.tonkatsu = 0;
    // ล้างสถานะผิดปกติทั้งหมด (patch 2.0.8: ยามฟ้าสาง/เส้นชีวิต เป็นดีบัฟที่ยังไม่เกิดผลทันที — ลดลงทีละ 1 แทน)
    const cleansed = [];
    for (const k of DEBUFF_KEYS) {
      if ((p.statuses[k] || 0) > 0) {
        delete p.statuses[k];
        if (p.statusAmt) delete p.statusAmt[k];
        cleansed.push(k);
      }
    }
    for (const k of SOFT_DEBUFF_STEP) {
      if ((p.statuses[k] || 0) > 0) {
        p.statuses[k]--;
        if (p.statuses[k] <= 0) delete p.statuses[k];
        cleansed.push(k);
      }
    }
    if ((p.sunriseDrop || 0) > 0) { p.sunriseDrop = 0; cleansed.push("sunriseDrop"); }
    lastLog.push(`🎵 ${p.name} Song for you — ใช้ทงคัสสึ ${bowls} ชาม: พลังขิง +${atk} (ล้างชามทั้งหมด)${cleansed.length ? ` และล้างสถานะผิดปกติ ${cleansed.length} อย่าง` : ""}`);
  }

  // ANATA WAAAAAAAA (characters/temari.js): เก็บเป้าหมายไว้เป็นความลับ + เปิดเพลงจนกว่าทุกคนจะเปิดไพ่
  if (st === "anata") {
    p.anataTargets = CHAR_HOOKS.temari.applyUltimateEffect(engine, p, anataTargets, skill.name);
    anataMusicSeq = engine.nextTransformCounter();
  }

  // ---------- ไรโด ฮิคารุ (characters/hikaru.js) ----------
  if (st === "monster") CHAR_HOOKS.hikaru.activateMonster(engine, p);
  if (st === "ginga") CHAR_HOOKS.hikaru.activateGinga(engine, p);
  if (st === "gingastrium") CHAR_HOOKS.hikaru.activateGingaStrium(engine, p);

  // ---------- ริต้า เบอร์นัล / ฟีนิกซ์ (characters/phenex.js) ----------
  if (st === "phenexIgnite") CHAR_HOOKS.phenex.activateIgnite(engine, p);
  if (st === "phenexReflect") CHAR_HOOKS.phenex.activateReflect(engine, p);
  if (st === "phenexNtd") CHAR_HOOKS.phenex.activateNtd(engine, p);
  if (st === "phenexTaunt") CHAR_HOOKS.phenex.activateTaunt(engine, p);
  if (st === "phenexPurge") CHAR_HOOKS.phenex.activatePurge(engine, p);
  // ---------- อาริมะ มิยาโกะ (patch 2.2.0, characters/miyako.js) ----------
  if (st === "miyakoHeal") CHAR_HOOKS.miyako.activateHeal(engine, p);
  if (st === "miyakoCombo") CHAR_HOOKS.miyako.activateCombo(engine, p);
  if (st === "miyakoUlt") CHAR_HOOKS.miyako.activateUlt(engine, p);
  // ---------- คุวากาตะโอเจอร์: สวมเกราะราชัน (characters/kuwagata.js) ----------
  if (st === "rachan") {
    CHAR_HOOKS.kuwagata.applyRachanEffect(engine, p);
  }
  // ---------- เอวานเกเลี่ยน หมายเลข 13: Fourth Impact (characters/eva13.js) ----------
  if (st === "fourth") CHAR_HOOKS.eva13.applyFourthEffect(engine, p);
  // ---------- DoomGuy (characters/doomguy.js) — Crucible: แปลงร่างทันทีก่อนเปิดไพ่ทั้งหมด + บังคับทุกคนอื่นแตกทันที ----------
  if (st === "doomCrucible") CHAR_HOOKS.doomguy.activateCrucible(engine, p);
  // ---------- คิชินามิ ฮาคุโนะ (characters/hakuno.js) ----------
  if (st === "hakunoInvertReady") CHAR_HOOKS.hakuno.applyInvertCharge(engine, p);
  if (st === "hakunoNoRegenReady") CHAR_HOOKS.hakuno.applyNoRegenCharge(engine, p);
  if (st === "moonCell") CHAR_HOOKS.hakuno.applyMoonCellCast(engine, p);
  // ---------- โอเบรอน: Lie Like Vortigern (Rework 2 — ทำงานทันทีก่อนเปิดการ์ด, characters/oberon.js) ----------
  if (st === "vortigern") CHAR_HOOKS.oberon.applyVortigernEffect(engine, p);

  // ข้อเสียโคโตเนะ (characters/kotone.js): 40% เมื่อใช้สกิลใดๆ จะเจอท่านประธานเซนะจัง -> เทิร์นถัดไปทำอะไรไม่ได้เลย
  if (isKotone) CHAR_HOOKS.kotone.maybeTriggerSena(engine, p);

  // ผู้สังหารจอมมหาเวทย์ (characters/mageslayer.js): ทุกครั้งที่ผู้เล่นคนใดใช้สกิลสำเร็จ — เช็คว่าถูกตราล่าเวทมาร์กอยู่ไหม
  CHAR_HOOKS.mageslayer.onTargetUsedSkill(engine, p);

  // สกิลช่วงจั่วการ์ด (instant): เด้งโชว์ทันทีบนกระดานของทุกคน ไม่ต้องรอเปิดไพ่/ไม่ตัดจอดำ
  if (skill.instant) {
    // Apple guy: ป้ายเด้งของสกิลพื้นฐานโชว์รูปของที่เลือก
    const flashImg = isApplePick ? CHAR_HOOKS.appleguy.ITEMS[item].img
      : (skill.img || null);
    // เทเปา (ชิกิ): กดสกิลพื้นฐาน/สกิลรอง ให้เล่นเสียง tepeu_skill1_2 ก่อนเสมอ
    const flashSound = (isTepeuCook || isTepeuPonder) ? "tepeu_skill1_2" : null;
    io.emit("skillFlash", { name: skill.name + flashSuffix, img: flashImg, by: p.name, color: POSITION_COLORS[p.position] || "#9B4F96", sound: flashSound });
  }
  // จำสกิลที่ใช้ในรอบ (ท่าไม้ตายมี cutscene ของตัวเอง / สกิลหลังเปิดไพ่ไปโชว์ตอนโจมตี)
  roundSkills.push({ playerId: id, name: skill.name, img: skill.img || null, status: st });

  p.busted = bustedOf(p);
  if (p.busted) { voidUltimateOnBust(p); maybeMoonBurst(p); CHAR_HOOKS.mageslayer.onBustOrLoseRoll(engine, p); }
  // ไพ่แตก/ถึงเพดานพอดี: ไม่ล็อกอัตโนมัติ — ยังกดสกิล/ใช้ไอเทมได้ต่อไป จนกว่าจะกดเปิดไพ่เอง หรือทุกคนเปิดไพ่ครบ

  // วีดีโอสวนกลับที่ค้างคิว (Wonder of U ซาโตรุ) — เล่นทันทีช่วงจั่วการ์ด
  if (gameState === "PLAYING" && cutsceneQueue.length) pausePlayingForCutscene();
  broadcastState();
  checkAllLocked();
}
// สกิลติดตัว อาคมบัญชาระดับ EX+ (คิชินามิ ฮาคุโนะ patch 2.2.1): เลือกใช้ได้ 3 ครั้งต่อเกม กดได้กี่ครั้งก็ได้ใน 1 เทิร์นจนกว่าจะหมด
function hakunoCommandSpell(id, command) {
  const p = players[id];
  if (gameState !== "PLAYING" || !p || !p.alive || p.locked) return;
  if (p.characterId !== "hakuno") return;
  const cmd = Number(command);
  if (![1, 2, 3].includes(cmd)) return;
  if ((p.hakunoCommandUses || 0) <= 0) return;
  p.hakunoCommandUses--;

  const what = CHAR_HOOKS.hakuno.applyCommandSpell(engine, p, cmd);
  const usesImg = p.hakunoCommandUses <= 0 ? "lost" : p.hakunoCommandUses === 1 ? "1left" : p.hakunoCommandUses === 2 ? "2left" : "full";
  io.emit("skillFlash", {
    name: `อาคมบัญชาระดับ EX+ — ${what}`,
    img: `/characters/hakuno/passive/${usesImg}.png`,
    by: p.name, color: POSITION_COLORS[p.position] || "#9B4F96",
  });
  broadcastState();
}
// ---- ระบบสัญญา (เจ้าแห่งเน็ตบ้าน patch 1.9) ----
// ตอบข้อเสนอสัญญา (สนใจใช้บริการเราไหม): ตอบรับ = เป็นคู่สัญญา / ปฏิเสธ (หรือไม่ตอบก่อนเปิดไพ่) = โดนค่าปรับ
function resolveOffer(b, t, accept, timeout) {
  if (!b) return;
  b.contractOffer = null;
  if (!t || !t.alive) return;
  if (accept && b.alive) {
    b.contractPartner = t.id;
    t.contractWith = b.id;
    b.contractTurns = 0;
    // เพดานเกราะ +3 (ผ่าน contractBuffActive) พร้อมฟื้นเกราะให้ 3 หน่วยทันที
    healArmor(t, CONTRACT_ARMOR_BONUS);
    lastLog.push(`📶 ${t.name} ตอบรับข้อเสนอของ ${b.name} — เป็นคู่สัญญา! เกราะ +${CONTRACT_ARMOR_BONUS} และพลังโจมตี +1 ตลอดสัญญา`);
    io.emit("skillFlash", { name: `สนใจใช้บริการเราไหม — ${t.name} ตอบรับสัญญา!`, img: "/characters/broadband_man/broadband_man_skill3.jpg", by: b.name, color: POSITION_COLORS[b.position] || "#9B4F96" });
  } else {
    // ปฏิเสธ: เสียเลือด 1 ไม่สนเกราะ + แต้มสกิลจบเทิร์นลด 1 เป็นเวลา 3 เทิร์น (นับเทิร์นถัดไป)
    dealDirect(t, 1);
    maybeBeatSave(t);
    maybeBeatMode(t);
    maybeEva3(t);
    t.skillDrainPending = 3;
    lastLog.push(`📵 ${t.name} ${timeout ? "ไม่ตอบข้อเสนอ" : "ปฏิเสธข้อเสนอ"}ของ ${b.name} — เสียเลือด 1 ไม่สนเกราะ และแต้มสกิลจบเทิร์นลด 1 (3 เทิร์นถัดไป)`);
    io.emit("skillFlash", { name: `สนใจใช้บริการเราไหม — ${t.name} ปฏิเสธ`, img: "/characters/broadband_man/broadband_man_skill3.jpg", by: b.name, color: POSITION_COLORS[b.position] || "#9B4F96" });
    if (t.alive && t.hp <= 0) {
      instantDeath(t);
      if (!t.alive) lastLog.push(`💀 ${t.name} เลือดจริงหมด ตกรอบ!`);
    }
  }
}
// ตอบคำถามต่อสัญญา (ชำระค่าบริการ): ต่อ = จ่าย 4 แต้มคืนเจ้าของ (ขาดเท่าไหร่รับความเสียหายแทน — สนใจเกราะ)
//  ปฏิเสธ (หรือไม่ตอบก่อนเปิดไพ่) = เสียเลือด 2 ไม่สนเกราะ + "ไม่ใช้งานต่อ" ฟื้นเลือดตัวเองไม่ได้ 1 เทิร์น + สัญญาสิ้นสุด
function resolveRenew(t, accept, timeout) {
  if (!t) return;
  t.renewPending = false;
  const b = CHAR_HOOKS.broadband_man.contractBoss(engine, t);
  if (!b) return; // เจ้าของสัญญาตาย/หายไปแล้ว
  if (accept) {
    const pay = Math.min(CONTRACT_FEE, t.skillPoints);
    const shortfall = CONTRACT_FEE - pay;
    t.skillPoints -= pay;
    if (pay > 0) addSkill(b, pay);
    if (shortfall > 0) {
      dealMixed(t, shortfall);
      maybeBeatSave(t);
      maybeBeatMode(t);
      maybeEva3(t);
    }
    lastLog.push(`📶 ${t.name} ต่อสัญญากับ ${b.name} — จ่ายแต้มสกิล ${pay} แต้ม${shortfall > 0 ? ` (ขาดอีก ${shortfall} รับเป็นความเสียหายแทน)` : ""}`);
    io.emit("skillFlash", { name: `ชำระค่าบริการ — ${t.name} ต่อสัญญา (จ่าย ${pay} แต้ม)`, img: "/characters/broadband_man/broadband_man.jpg", by: b.name, color: POSITION_COLORS[b.position] || "#9B4F96" });
  } else {
    dealDirect(t, 2);
    maybeBeatSave(t);
    maybeBeatMode(t);
    maybeEva3(t);
    if (!resistActive(t)) t.statuses.nohealing = Math.max(t.statuses.nohealing || 0, 1);
    b.contractPartner = null;
    b.contractTurns = 0;
    t.contractWith = null;
    lastLog.push(`📵 ${t.name} ${timeout ? "ไม่ตอบ" : "ปฏิเสธ"}การต่อสัญญากับ ${b.name} — เสียเลือด 2 ไม่สนเกราะ${resistActive(t) ? " (ต้านสถานะผิดปกติ — ไม่ติดไร้ทางเยียวยา)" : " ติด \"ไร้ทางเยียวยา\" (ฟื้นเลือดตัวเองไม่ได้ 1 เทิร์น)"} และสัญญาสิ้นสุด`);
    io.emit("skillFlash", { name: `ชำระค่าบริการ — ${t.name} ยกเลิกสัญญา`, img: "/characters/broadband_man/broadband_man.jpg", by: b.name, color: POSITION_COLORS[b.position] || "#9B4F96" });
  }
  if (t.alive && t.hp <= 0) {
    instantDeath(t);
    if (!t.alive) lastLog.push(`💀 ${t.name} เลือดจริงหมด ตกรอบ!`);
  }
}
// ---- Locacaca fruit (ซาโตรุ patch 2.0.8.2) ----
// เป้าหมายตอบรับ = ฮีลเต็ม แลก Max HP -1 และจ่ายแต้มสกิล 4 ให้ซาโตรุ / ปฏิเสธ (หรือไม่ตอบ) = ไม่มีอะไรเกิดขึ้น
function resolveLoca(s, t, accept, timeout) {
  if (!s) return;
  s.locaOffer = null;
  if (!t || !t.alive) return;
  if (accept && s.alive) {
    t.maxHpPenalty = (t.maxHpPenalty || 0) + 1;
    t.hp = Math.min(t.hp, maxHpOf(t));
    const heal = healHp(t, MAX_HP);
    const pay = Math.min(CHAR_HOOKS.satoru.LOCA_STEAL, t.skillPoints);
    t.skillPoints -= pay;
    if (pay > 0) addSkill(s, pay);
    lastLog.push(`🍑 ${t.name} รับผลโลกากากาจาก ${s.name} — ฟื้นเลือดจนเต็ม +${heal} แลกกับ Max HP ลดถาวร 1 (เหลือ ${maxHpOf(t)}) และจ่ายแต้มสกิล ${pay} ให้ ${s.name}`);
    io.emit("skillFlash", { name: `Locacaca fruit — ${t.name} รับผลไม้!`, img: "/characters/satoru/locaca.png", by: s.name, color: POSITION_COLORS[s.position] || "#9B4F96" });
  } else {
    lastLog.push(`🍑 ${t.name} ${timeout ? "ไม่ตอบ" : "ปฏิเสธ"}ผลโลกากากาของ ${s.name} — ไม่มีอะไรเกิดขึ้น`);
    io.emit("skillFlash", { name: `Locacaca fruit — ${t.name} ปฏิเสธ`, img: "/characters/satoru/locaca.png", by: s.name, color: POSITION_COLORS[s.position] || "#9B4F96" });
  }
}
function answerLoca(id, accept) {
  const t = players[id];
  if (gameState !== "PLAYING" || !t || !t.alive) return;
  const s = Object.values(players).find((o) => o.alive && o.locaOffer === id);
  if (!s) return;
  resolveLoca(s, t, accept, false);
  broadcastState();
  checkAllLocked();
}
// รับคำตอบจากเป้าหมาย (ตอบได้ระหว่างช่วงจั่วการ์ด แม้จะเปิดไพ่ไปแล้ว)
function answerContract(id, accept) {
  const p = players[id];
  if (gameState !== "PLAYING" || !p || !p.alive) return;
  if (p.renewPending) {
    resolveRenew(p, accept, false);
    broadcastState();
    checkAllLocked();
    return;
  }
  const b = Object.values(players).find((o) => o.alive && o.contractOffer === id);
  if (!b) return;
  resolveOffer(b, p, accept, false);
  broadcastState();
  checkAllLocked();
}
// ---- ระบบพันธมิตรบันชี × ยูนิคอร์น (ริดดี้ มาร์เซนาส patch 2.0.9) ----
// Event เริ่มเกม: ริดดี้เลือกบานาจที่จะยื่นข้อเสนอ (targetId) หรือปฏิเสธ (ไม่ส่ง targetId) = เดินเส้นทางเดี่ยว
function riddheChooseAlly(id, targetId) {
  const p = players[id];
  if (gameState !== "PLAYING" || !p || !p.alive || p.characterId !== "riddhe" || !p.allyPrompt) return;
  p.allyPrompt = false;
  const t = targetId ? players[targetId] : null;
  if (!t || !t.alive || t.characterId !== "banagher" || t.id === p.id) {
    lastLog.push(`🤖 ${p.name} เลือกเดินเส้นทางเดี่ยว — ไม่จับมือกับยูนิคอร์น`);
    broadcastState();
    checkAllLocked();
    return;
  }
  p.allyOffer = t.id;
  lastLog.push(`🤝 ${p.name} ยื่นข้อเสนอเป็นพันธมิตรให้ ${t.name} (ไม่ตอบก่อนเปิดไพ่ = ปฏิเสธ)`);
  io.emit("skillFlash", { name: "🤝 ข้อเสนอพันธมิตรบันชี", img: RIDDHE_BANSHEE_IMG, by: p.name, color: POSITION_COLORS[p.position] || "#9B4F96" });
  broadcastState();
  checkAllLocked();
}
// บานาจตอบข้อเสนอพันธมิตร: ตอบรับ = จับมือเป็นพันธมิตร / ปฏิเสธ (หรือไม่ตอบก่อนเปิดไพ่) = ริดดี้เดินเส้นทางเดี่ยว
function resolveAllyOffer(r, t, accept, timeout) {
  if (!r) return;
  r.allyOffer = null;
  if (!t || !t.alive) return;
  if (accept && r.alive) {
    r.allyId = t.id;
    t.allyId = r.id;
    lastLog.push(`🤝 ${t.name} ตอบรับข้อเสนอของ ${r.name} — บันชีและยูนิคอร์นเป็นพันธมิตรกัน! (เห็นแต้มการ์ดของกันและกัน · ท่าไม้ตายริดดี้เปลี่ยนเป็น "ฉันจะไม่ยอมสูญเสียใครไปอีก")`);
    io.emit("skillFlash", { name: "🤝 พันธมิตรบันชี × ยูนิคอร์น", img: RIDDHE_BANSHEE_IMG, by: r.name, color: POSITION_COLORS[r.position] || "#9B4F96" });
  } else {
    lastLog.push(`🤝💔 ${t.name} ${timeout ? "ไม่ตอบ" : "ปฏิเสธ"}ข้อเสนอพันธมิตรของ ${r.name} — ริดดี้เดินเส้นทางเดี่ยว`);
    io.emit("skillFlash", { name: "ข้อเสนอพันธมิตร — ถูกปฏิเสธ", img: RIDDHE_BANSHEE_IMG, by: r.name, color: POSITION_COLORS[r.position] || "#9B4F96" });
  }
}
function answerAllyOffer(id, accept) {
  const t = players[id];
  if (gameState !== "PLAYING" || !t || !t.alive) return;
  const r = Object.values(players).find((o) => o.alive && o.characterId === "riddhe" && o.allyOffer === id);
  if (!r) return;
  resolveAllyOffer(r, t, accept, false);
  broadcastState();
  checkAllLocked();
}
// คู่พันธมิตรตีกันเอง: ฝ่ายที่ถูกตีเลือกยกเลิกพันธมิตรไหม — ยกเลิก = ฟื้นเลือด/เกราะที่เสียจากการโดนคู่ตีคืน
function answerAllyBreak(id, cancel) {
  const t = players[id];
  if (gameState !== "PLAYING" || !t || !t.alive || !t.allyBreakAsk) return;
  const ask = t.allyBreakAsk;
  t.allyBreakAsk = null;
  const o = players[ask.by];
  if (!cancel) {
    lastLog.push(`🤝 ${t.name} เลือกให้อภัย — พันธมิตรยังคงอยู่`);
    io.emit("skillFlash", { name: "🤝 พันธมิตรยังคงอยู่", img: RIDDHE_BANSHEE_IMG, by: t.name, color: POSITION_COLORS[t.position] || "#9B4F96" });
  } else {
    if ((ask.hp || 0) > 0) healHp(t, ask.hp);
    if ((ask.armor || 0) > 0) healArmor(t, ask.armor);
    lastLog.push(`💔 ${t.name} ยกเลิกพันธมิตร! ฟื้นสิ่งที่เสียไปจากการโดนคู่ตีคืน (เลือด +${ask.hp || 0} เกราะ +${ask.armor || 0})`);
    const r = t.characterId === "riddhe" ? t : (o && o.characterId === "riddhe" ? o : null);
    const b = t.characterId === "banagher" ? t : (o && o.characterId === "banagher" ? o : null);
    CHAR_HOOKS.riddhe.breakAlliance(engine, r, b);
    io.emit("skillFlash", { name: "💔 ยกเลิกพันธมิตร", img: RIDDHE_BANSHEE_IMG, by: t.name, color: POSITION_COLORS[t.position] || "#9B4F96" });
  }
  broadcastState();
  checkAllLocked();
}
// สกิลติดตัว 2 (นายยังมีอนาคตอีกยาวไกล): เหลือแค่คู่พันธมิตรบนสนาม — คงพันธมิตร = จบเกมชนะทั้งคู่ / ยกเลิก = สู้กันต่อ
function answerAllyFinal(id, keep) {
  const r = players[id];
  if (gameState !== "PLAYING" || !r || !r.alive || !r.allyFinalAsk) return;
  r.allyFinalAsk = false;
  const b = riddheAllied(r);
  if (!b) { broadcastState(); return; }
  if (keep) {
    allyWinFlag = true;
    lastLog.push(`🤝👑 ${r.name} และ ${b.name} เลือกยืนหยัดเคียงข้างกันจนถึงที่สุด — ชนะทั้งคู่!`);
    clearPhaseTimer();
    gameState = "GAMEOVER";
    timeLeft = 0;
    broadcastState();
  } else {
    CHAR_HOOKS.riddhe.breakAlliance(engine, r, b);
    io.emit("skillFlash", { name: "💔 ยกเลิกพันธมิตร — การต่อสู้ครั้งสุดท้ายเริ่มขึ้น", img: RIDDHE_BANSHEE_IMG, by: r.name, color: POSITION_COLORS[r.position] || "#9B4F96" });
    broadcastState();
    checkAllLocked();
  }
}
// Bard: รับเป้าหมายบทเพลงที่ประพันธ์เสร็จ (เลือกได้ระหว่างช่วงจั่วการ์ด แม้เปิดไพ่ไปแล้ว)
function bardTarget(id, targets) {
  const p = players[id];
  if (gameState !== "PLAYING" || !p || !p.alive || !p.bardPending) return;
  const song = p.bardPending;
  const tgs = Array.isArray(targets) ? [...new Set(targets)] : [];
  const valid = tgs.filter((tid) => {
    const t = players[tid];
    return t && t.alive && (song.allowSelf || tid !== p.id);
  });
  if (valid.length !== song.need) return;
  p.bardPending = null;
  bardPerform(p, song.pattern, valid, true);
  // วีดีโอสวนกลับที่ค้างคิว (Wonder of U ซาโตรุ) — เล่นทันทีช่วงจั่วการ์ด
  if (gameState === "PLAYING" && cutsceneQueue.length) pausePlayingForCutscene();
  broadcastState();
  checkAllLocked();
}
// ไค ชิซากิ (characters/kai.js): กดปุ่ม Overhaul — ต้องมีมาร์กรังสรรค์/ลงทัณฑ์ครบ 2 หน่วยบนกระดานก่อนถึงกดได้
function kaiOverhaul(id) {
  const p = players[id];
  if (!p || !p.alive || p.characterId !== "kai") return;
  if (gameState !== "PLAYING" || p.locked) return;
  if (kaiOverhaulSlots.length < 2) return;
  const [a, b] = kaiOverhaulSlots.slice(0, 2);
  const holderA = players[a.playerId];
  const holderB = players[b.playerId];
  if (!holderA || !holderA.alive || !holderB || !holderB.alive) return;
  CHAR_HOOKS.kai.resolveOverhaul(engine, holderA, a.status, holderB, b.status, p);
  kaiOverhaulSlots = [];
  for (const player of Object.values(players)) {
    delete player.statuses.kaiCreation; delete player.statuses.kaiPunishment;
    if (player.statusAmt) { delete player.statusAmt.kaiCreation; delete player.statusAmt.kaiPunishment; }
  }
  p.transformAt = ++transformCounter;
  io.emit("skillFlash", { name: "Overhaul", img: displayImg(p), by: p.name, color: POSITION_COLORS[p.position] || "#9B4F96" });
  broadcastState();
  checkAllLocked();
}
function checkAllLocked() {
  if (gameState !== "PLAYING") return;
  const c = alivePlayers();
  // รอคำตอบข้อเสนอ/ต่อสัญญา (เจ้าแห่งเน็ตบ้าน) / เป้าหมายบทเพลง (Bard) ก่อนเปิดไพ่อัตโนมัติ
  //  — หมดเวลาเฟสไพ่ = ถือว่าปฏิเสธ / สุ่มเป้าหมาย
  const pendingAnswer =
    c.some((p) => p.renewPending && CHAR_HOOKS.broadband_man.contractBoss(engine, p)) ||
    c.some((p) => p.contractOffer && players[p.contractOffer] && players[p.contractOffer].alive) ||
    c.some((p) => p.locaOffer && players[p.locaOffer] && players[p.locaOffer].alive) || // Locacaca (ซาโตรุ)
    c.some((p) => p.bardPending) ||
    // ระบบพันธมิตร (ริดดี้ patch 2.0.9): รอเลือก/ตอบข้อเสนอ/ตอบยกเลิกพันธมิตร ก่อนเปิดไพ่อัตโนมัติ
    c.some((p) => p.allyPrompt && c.some((o) => o.id !== p.id && o.characterId === "banagher")) ||
    c.some((p) => p.allyOffer && players[p.allyOffer] && players[p.allyOffer].alive) ||
    c.some((p) => p.allyBreakAsk) ||
    c.some((p) => p.allyFinalAsk);
  // ถ้าไม่เหลือใครรอดเลย (เช่น ทาคุโตะระเบิดใส่ทุกคนตายหมดรวมถึงตัวเอง) ก็ต้องสรุปผลด้วยเช่นกัน ไม่งั้นเกมค้าง
  if (c.every((p) => p.locked) && !pendingAnswer) resolveRound();
}

// ---- สรุปผล ----
function resolveRound() {
  clearPhaseTimer();
  for (const p of alivePlayers()) p.locked = true;
  anataMusicSeq = 0; // เพลง ANATA WAAAAAAAA จบลงเมื่อทุกคนพร้อมเปิดไพ่แล้ว

  // ข้อเสนอ/คำถามต่อสัญญา (เจ้าแห่งเน็ตบ้าน) ที่ยังไม่ตอบเมื่อถึงเวลาเปิดไพ่ = ถือว่าปฏิเสธ
  for (const p of Object.values(players)) {
    if (p.contractOffer) {
      if (p.alive) resolveOffer(p, players[p.contractOffer], false, true);
      else p.contractOffer = null;
    }
    if (p.renewPending) {
      if (p.alive) resolveRenew(p, false, true);
      else p.renewPending = false;
    }
    // Locacaca fruit (ซาโตรุ): ไม่ตอบก่อนเปิดไพ่ = ถือว่าปฏิเสธ
    if (p.locaOffer) {
      if (p.alive) resolveLoca(p, players[p.locaOffer], false, true);
      else p.locaOffer = null;
    }
    // ริต้า เบอร์นัล: ขอแค่ได้พบกันอีก — ยังไม่เลือกเป้าหมายก่อนเปิดไพ่รอบถัดไป = สุ่มให้
    if (p.phenexReleaseAsk) {
      const ask = p.phenexReleaseAsk;
      p.phenexReleaseAsk = null;
      const options = ask.options.map((id) => players[id]).filter((o) => o && o.alive);
      const target = options.length ? options[Math.floor(Math.random() * options.length)] : null;
      CHAR_HOOKS.phenex.resolveRelease(engine, p, target, ask.pain);
    }
    // ---------- ริดดี้ มาร์เซนาส (patch 2.0.9): คำถามพันธมิตรที่ยังไม่ตอบเมื่อถึงเวลาเปิดไพ่ ----------
    if (p.allyPrompt) {
      p.allyPrompt = false;
      if (p.alive) lastLog.push(`🤖 ${p.name} ไม่ตัดสินใจ — เดินเส้นทางเดี่ยว`);
    }
    if (p.allyOffer) {
      if (p.alive) resolveAllyOffer(p, players[p.allyOffer], false, true);
      else p.allyOffer = null;
    }
    if (p.allyBreakAsk) {
      if (p.alive) lastLog.push(`🤝 ${p.name} ไม่ตอบ — คงพันธมิตรต่อไป`);
      p.allyBreakAsk = null;
    }
    p.allyFinalAsk = false; // ไม่ตอบ = ยังไม่ตัดสินใจ (จะถูกถามใหม่ตอนจบเทิร์นถ้ายังเหลือแค่คู่พันธมิตร)
  }

  // Bard: บทเพลงที่ยังไม่ได้เลือกเป้าหมายเมื่อถึงเวลาเปิดไพ่ = สุ่มเป้าหมายอัตโนมัติ (บทเพลงไม่สูญเปล่า)
  for (const p of alivePlayers()) {
    if (!p.bardPending) continue;
    const song = p.bardPending;
    p.bardPending = null;
    const pool = alivePlayers().filter((o) => song.allowSelf || o.id !== p.id);
    const picked = [];
    while (picked.length < song.need && pool.length) {
      picked.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0].id);
    }
    if (picked.length === song.need) {
      lastLog.push(`🎼 ${p.name} ไม่ได้เลือกเป้าหมาย ${song.name} — บทเพลงเลือกเป้าหมายเอง`);
      bardPerform(p, song.pattern, picked, false);
    }
  }

  // ANATA WAAAAAAAA (เทมาริ): เปิดเผยเป้าหมาย + บังคับจั่วเพิ่ม 2 ใบหลังเปิดไพ่
  // ทำงานก่อนท่าไม้ตายอื่นเสมอ — ถ้าเป้าหมายแตกจากการบังคับจั่ว ท่าไม้ตายที่เพิ่งกดจะเป็นโมฆะ
  const anataProcs = [];
  for (const u of alivePlayers()) {
    if (!u.anataTargets || !u.anataTargets.length) continue;
    if (bustedOf(u)) { u.anataTargets = null; continue; } // ผู้ใช้แตกเอง (โมฆะไปแล้วใน voidUltimateOnBust)
    for (const tid of u.anataTargets) {
      const t = players[tid];
      if (!t || !t.alive) continue;
      for (let i = 0; i < TEMARI_ANATA_DRAWS; i++) { const c = drawCardFor(t); if (c) { t.cards.push(c); onCardDrawn(t, c); } } // patch 2.0.6: จั่วเพิ่ม 3 ใบ
      t.busted = bustedOf(t);
      lastLog.push(`🎤 ANATA WAAAAAAAA! ${u.name} บังคับ ${t.name} จั่วเพิ่ม ${TEMARI_ANATA_DRAWS} ใบ${t.busted ? " — ไพ่แตก!" : ""}`);
      if (t.busted) { voidUltimateOnBust(t); maybeMoonBurst(t); }
      anataProcs.push({ u, t });
    }
    u.anataTargets = null;
  }

  const combatants = alivePlayers();
  roundWinnerId = null;

  if (combatants.length < 2) {
    lastLog.push("รอบนี้ไม่มีการต่อสู้ (ผู้เล่นไม่พอ)");
    afterResolve();
    return;
  }

  const val = (p) => (bustedOf(p) ? -1 : scoreOf(p));
  const best = Math.max(...combatants.map(val));
  const worst = Math.min(...combatants.map(val));

  if (best >= 0) {
    const tied = combatants.filter((p) => val(p) === best);
    const w = tied[Math.floor(Math.random() * tied.length)];
    roundWinnerId = w.id;
    roundTiedWin = tied.length > 1; // เสมอแต้มกัน -> ยังได้แต้มสกิล/ท่าไม้ตายทำงานปกติ แต่ไม่มีเทิร์นโจมตี
    w.isWinner = true;
    w.result = "win";
    // เทเปา (characters/tepeu.js): รีเซ็ตเคาน์เตอร์แพ้ติดกัน + สมองอันชาญฉลาด
    CHAR_HOOKS.tepeu.onRoundWin(engine, w, combatants);
    // ระบบเหรียญ (patch 2.2 full): ชนะการจั่วได้เหรียญเพิ่ม +1 (เพดาน 30)
    if ((w.gold || 0) < GOLD_MAX) w.gold = Math.min(GOLD_MAX, (w.gold || 0) + GOLD_WIN_BONUS);
    // patch 2.1.3.5: ชนะจั่วการ์ดไม่ได้แต้มสกิลอีกต่อไป
    firePassive(w, "win");
    if (tied.length > 1) lastLog.push(`เสมอที่ ${best} แต้ม — สุ่มผู้ชนะได้ ${w.name} (เสมอ ไม่มีเทิร์นโจมตี)`);
  }

  if (best !== worst) {
    for (const l of combatants.filter((p) => val(p) === worst && p.id !== roundWinnerId)) {
      l.isLoser = true;
      l.result = "lose";
      if (sealActive(l)) {
        // เรจูอาคมบัญชา (อมตะ): ไม่รับความเสียหายใดๆ เทิร์นนี้
        addSkill(l, 1);
        firePassive(l, "lose");
        lastLog.push(`📜 ${l.name} อาคมบัญชาคุ้มครอง — ไม่รับความเสียหายจากการแพ้`);
        continue;
      }
      if (l.beatSaved) {
        // หลังกันตายทำงานแล้ว: ความเสียหายจากการแพ้ตอนจั่วการ์ดไม่มีผล ไม่ว่าห่าง 21 แค่ไหน
        addSkill(l, 1);
        firePassive(l, "lose");
        lastLog.push(`⚡ ${l.name} ประกายเขี้ยวปฏิปักษ์ — ไม่รับความเสียหายจากการแพ้`);
        continue;
      }
      if ((l.statuses.monster || 0) > 0) {
        // ร่างไคจู (MonsterLive): แพ้เพราะแต้มน้อยสุด/ไพ่แตก รับความเสียหายน้อยลง 1 หน่วย (1 -> 0)
        addSkill(l, 1);
        firePassive(l, "lose");
        lastLog.push(`🦖 ${l.name} ร่างไคจู — ไม่รับความเสียหายจากการแพ้`);
        continue;
      }
      if (CHAR_HOOKS.eva13.isLossImmune(engine, l)) {
        // สกิลติดตัว 2 เอวา 13 (ทุกอย่างไร้ความหมาย): ไม่รับดาเมจแพ้จั่ว/แตก
        //  — นอก fourth impact ทำงานเสมอ ยกเว้นสกิลติดตัว 3 (เลือด <= 3) ทำงานอยู่ | fourth impact = บังคับทำงาน
        addSkill(l, 1);
        firePassive(l, "lose");
        lastLog.push(`🌑 ${l.name} ทุกอย่างไร้ความหมาย — ไม่รับความเสียหายจากการแพ้`);
        continue;
      }
      const armorBefore = l.armor;
      let lossDmg = 1;
      // เต็มอิ่ม (Breakfast โอกูริ patch 2.0.8.1): ดาเมจที่ได้รับ -1 (รวมดาเมจแพ้จั่ว/แตก)
      if ((l.statuses.fullbelly || 0) > 0 && lossDmg > 0) {
        lossDmg = Math.max(0, lossDmg - 1);
        lastLog.push(`🥖 ${l.name} เต็มอิ่ม — ดาเมจจากการแพ้ลดลง 1`);
      }
      for (let i = 0; i < lossDmg; i++) damageSoft(l);
      // Absorb shield (บานาจ) / Absorb Shield (ริดดี้): ผู้แพ้เสียเกราะ -> แปลงเกราะที่เสียกลับเป็นพลังชีวิต
      const armorLost = armorBefore - l.armor;
      if (((l.statuses.absorb || 0) > 0 || (l.statuses.absorbplus || 0) > 0) && armorLost > 0) {
        const heal = healHp(l, armorLost);
        if (heal > 0) lastLog.push(`🛡️ ${l.name} Absorb shield แปลงเกราะที่เสีย ${armorLost} → พลังชีวิต +${heal}`);
      }
      // Beat Mode กันตาย: ทำงานทันทีแม้ความเสียหายถึงตายมาจากการแพ้จั่ว/แตก
      maybeBeatSave(l);
      addSkill(l, 1); // โดนความเสียหายเพราะแต้มห่างจาก 21 มากที่สุด +1
      CHAR_HOOKS.mageslayer.onBustOrLoseRoll(engine, l);
      firePassive(l, "lose");
      lastLog.push(`${l.name} แต้มน้อยสุด รับความเสียหาย -${lossDmg}`);
    }
  }
  for (const p of combatants) if (!p.result) p.result = "safe";

  // เทเปา (characters/tepeu.js): มีเทเปายังอยู่ในสนาม -> ใครแพ้ติดกันเกิน 3 เทิร์น เส้นชีวิตลดลง 1 หน่วย
  CHAR_HOOKS.tepeu.onRoundLoseStreak(engine, combatants);

  // สกิลติดตัว เนตรมารแห่งความมรณะ (ชิกิ, characters/shiki.js): เปิดไพ่แล้วแต้มเท่ากับผู้เล่นอื่น -> ติดเส้นชีวิตถาวร
  CHAR_HOOKS.shiki.onScoreTiePassive(engine, combatants);

  // สกิลติดตัว หิวอะโปรดิวเซอร์ (เทมาริ patch 1.7.6): เป้าหมาย ANATA WAAAAAAAA แพ้หรือไพ่แตก
  // -> โดนขิงจนช้ำ รับความเสียหายตามโบนัส Song for you เท่านั้น (ไม่นับพลังโจมตีปกติ — สูงสุด 2)
  // ต่อให้เทมาริไม่ชนะ/แพ้ในตานั้นก็ตาม — และฉากของสกิลนี้ขึ้นก่อนทุกท่าไม้ตาย
  let anataFinalShown = false;
  for (const { u, t } of anataProcs) {
    if (!t.alive || !(bustedOf(t) || t.isLoser)) continue;
    let dmg = songActive(u) ? (u.songAtk || 0) : 0;
    dealDirect(t, dmg); // patch 2.0.6: การขิงทำดาเมจแบบไม่สนเกราะ
    maybeBeatSave(t); // กันตายทำงานทันทีถ้าโดนขิงจนถึงตาย
    t.wasAttacked = true;
    addSkill(t, 1);
    lastLog.push(`🎤 หิวอะโปรดิวเซอร์! ${t.name} โดนขิงจนช้ำ -${dmg}`);
    if (!anataFinalShown) {
      anataFinalShown = true;
      triggerCutscene(u, "anataFinal"); // เข้าคิวก่อน afterResolve -> ขึ้นก่อนท่าไม้ตายอื่นเสมอ
    }
  }

  // สกิลติดตัว 1 เอวา 13: เลือดหมดตั้งแต่ช่วงสรุปผล (แพ้จั่ว/แตก/โดนขิง) ขณะ Fourth Impact ยังอยู่
  //  -> ตกรอบและระเบิดทันที ไม่ต้องรอจบเทิร์น (เลือดเหลือ 0 แล้ว ไม่ควรรอโดนตีอีกรอบ)
  for (const e of combatants) {
    if (!(e.alive && e.hp <= 0 && e.characterId === "eva13" && (e.statuses.fourth || 0) > 0)) continue;
    instantDeath(e);
    if (!e.alive) lastLog.push(`💀 ${e.name} เลือดจริงหมด ตกรอบ!`);
    lastLog.push(`💥 ${e.name} ไม่สามารถแก้ไขอะไรได้อีกแล้ว — ทุกสิ่งทุกอย่างไร้ความหมาย! ระเบิดใส่ทุกคน -${EVA_BLAST_DMG}`);
    for (const o of alivePlayers()) {
      if (o.id === e.id) continue;
      if (!evaBlastEvade(o, e)) dealMixed(o, EVA_BLAST_DMG);
      maybeBeatSave(o);
      maybeBeatMode(o);
      maybeEva3(o);
      maybeWakeKotone(o);
      o.wasAttacked = true;
    }
    triggerCutscene(e, "evaboom");
    // คนที่โดนแรงระเบิดจนเลือดหมด ตกรอบทันทีเช่นกัน
    for (const o of Object.values(players)) {
      if (o.alive && o.hp <= 0) {
        instantDeath(o);
        if (!o.alive) lastLog.push(`💀 ${o.name} เลือดจริงหมด ตกรอบ!`);
      }
    }
  }

  afterResolve();
}

// เปิดร่างท่าไม้ตาย (หลังเปิดไพ่) -> cutscene ก่อนสรุปผล (สรุปผลไว้ท้ายสุดเสมอ)
//  หมายเหตุ: สกิลทั่วไปไม่มีแบนเนอร์ก่อนสรุปผลแล้ว — instant เด้งตอนใช้ / หลังเปิดไพ่ไปโชว์ตอนโจมตี
function afterResolve() {
  // ---------- เทเปา (characters/tepeu.js): นายเป็นคนทำตัวเองนะ — ผลสังหาร/พลาดทำงานหลังเปิดไพ่ทุกคน ----------
  CHAR_HOOKS.tepeu.resolveAllKills(engine);
  // ---------- Ashen Trail: Cinderella Gray (โอกูริ, characters/oguri.js): หลังเปิดไพ่ — โจมตีทุกคนที่ไพ่แตก ----------
  CHAR_HOOKS.oguri.onAfterResolveAshenTrail(engine);
  // ---------- ผู้สังหารจอมมหาเวทย์ (characters/mageslayer.js): Mana Rupture — ผลทำงานหลังเปิดไพ่ทุกคน ----------
  CHAR_HOOKS.mageslayer.resolveAllRuptures(engine);
  // ---------- ทาคุมิ ฟุจิวาระ (characters/takumi.js): ถึงจะมองไม่เห็น แต่ฉันยังอยู่ — คนแรกที่ไพ่แตกระหว่างบัฟยังทำงาน ----------
  CHAR_HOOKS.takumi.tryBustTrigger(engine);

  const activated = [];
  for (const p of alivePlayers()) {
    const pBusted = bustedOf(p); // ไพ่แตก = ท่าไม้ตายไม่ทำงาน (กันหลุดกรณีเพิ่งกดแล้วแตก)
    for (const key of Object.keys(TRANSFORMS)) {
      if (!TRANSFORMS[key].afterReveal) continue;
      if (pBusted) continue;
      if ((p.statuses[key] || 0) > 0 && !p.seen[key]) {
        p.seen[key] = true;
        p.transformAt = ++transformCounter;
        // สวมเกราะราชัน: เพิ่มแค่เพดานเกราะ +3 (ไม่ฟื้นเกราะให้ — เกราะที่มีคงเดิม รอฟื้นฟูเองต้นรอบ)
        // Sekai ichi kawaii watashi (โคโตเนะ patch 2.2.2): ตีหมู่ทุกคน (ยกเว้นตัวเอง) ดาเมจ 3 หน่วย + สตั้น 2 เทิร์น
        //  ไม่ใช้ coin แล้ว (เดิมต้องมี 3 coin + หักตอนกด)
        if (key === "kawaii") CHAR_HOOKS.kotone.activateKawaii(engine, p);
        // Lai Rhyme Goodfellow (โอเบรอน, characters/oberon.js) — Lie Like Vortigern ย้ายไปทำงานทันทีก่อนเปิดการ์ดแล้ว (ดู useSkill()'s st === "vortigern")
        if (key === "lai") CHAR_HOOKS.oberon.applyLaiEffect(engine, p);
        {
          const firstTime = !p.cutsceneShown[key];
          triggerCutscene(p, key);
          // ครั้งแรก (เล่นวีดีโอ): ต่อด้วยฉากประกาศเปลี่ยนร่าง (ระเบิด + เสียงพากย์) ก่อนขึ้นคนอื่น/สรุปผล
          if (firstTime && key === "rachan") queueTransformAnnounce(p, "rachan");
        }
        lastLog.push(`✨ ${p.name} ${TRANSFORMS[key].label} ${TRANSFORMS[key].title}!`);
        activated.push(p);
      }
    }
  }
  // สวนท่าไม้ตายกัน: เอาเพลงของผู้ชนะ (ถ้าไม่มีผู้ชนะ = คนที่เปิดหลังสุด ซึ่ง transformAt สูงสุดอยู่แล้ว)
  if (activated.length > 1) {
    const winner = activated.find((p) => p.id === roundWinnerId);
    if (winner) winner.transformAt = ++transformCounter;
  }
  // Beat Mode: ถ้าใครเลือดตกต่ำกว่า 3 จากการแพ้รอบนี้ -> เข้าประกายเขี้ยวปฏิปักษ์
  for (const p of alivePlayers()) maybeBeatMode(p);
  // สกิลติดตัว 3 เอวา 13: เลือดตกถึง <= 3 -> อย่าให้ฉันทำแแบบนี้เลย
  for (const p of alivePlayers()) maybeEva3(p);
  runCutsceneQueue(goSummary);
}

function goSummary() {
  gameState = "SUMMARY";
  startPhaseTimer(SUMMARY_TIME, afterSummary);
  broadcastState();
}

// ---- โจมตี ----
// เรจูอาคมบัญชา (อมตะ): ไม่ถูกเลือกเป็นเป้าโจมตีตลอดเทิร์น
function attackableTargets(atkId) {
  return alivePlayers().filter((p) => p.id !== atkId && !sealActive(p));
}
function afterSummary() {
  const winner = players[roundWinnerId];
  // หลับไหล (Lie Like Vortigern): ผู้ชนะที่ยังหลับอยู่ ออกการกระทำไม่ได้ -> ไม่มีเทิร์นโจมตี
  //  (เทิร์นที่เพิ่งโดนกล่อม sleepFresh ยังโจมตีได้ — การหลับเริ่มเทิร์นถัดไป)
  if (winner && winner.alive && (winner.statuses.sleep || 0) > 0 && !winner.sleepFresh) {
    lastLog.push(`💤 ${winner.name} ยังหลับไหลอยู่ — ไม่มีเทิร์นโจมตี`);
    endTurn();
    return;
  }
  // โคโตเนะ: หลับพักผ่อน (Sleeping time) / สตั้นจากโหมงานหนัก / หนีท่านประธานเซนะ — ไม่มีเทิร์นโจมตี
  if (winner && winner.alive && (
    (winner.statuses.ksleep || 0) > 0 ||
    (winner.statuses.stun || 0) > 0 || // สตั้น (สถานะพื้นฐาน patch 2.0.8) — รวม kstun (โคโตเนะ [โหมงานหนัก]) เข้ามาแล้ว
    (winner.statuses.sena || 0) > 0 ||
    (winner.statuses.riddheguard || 0) > 0 // ฉันจะไม่ยอมสูญเสียใครไปอีก (ริดดี้): แม้ชนะการจั่วก็ตีไม่ได้
  )) {
    lastLog.push(`💤 ${winner.name} ไม่อยู่ในสภาพจะโจมตีใคร — ไม่มีเทิร์นโจมตี`);
    endTurn();
    return;
  }
  // ซาโตรุ อาเคฟุ (patch 2.0.8.2): สกิลติดตัว — โจมตีธรรมดาไม่ได้เลย (ยกเว้นระหว่าง MOON*CELL ของคิชินามิ ฮาคุโนะ)
  if (winner && winner.alive && winner.characterId === "satoru" && !moonCellActive()) {
    lastLog.push(`🩺 ${winner.name} ไม่เคยลงมือไล่ล่าใครด้วยตัวเอง — ไม่มีเทิร์นโจมตี (สกิลติดตัว)`);
    endTurn();
    return;
  }
  // DoomGuy (characters/doomguy.js) สกิลติดตัว: ปกติเสมอแต้มจะไม่มีเทิร์นโจมตี — มีโอกาส 60% ที่จะยังได้โจมตี
  const doomTieOverride = winner && winner.alive && roundTiedWin ? CHAR_HOOKS.doomguy.tryTieAttack(engine, winner) : false;
  if (winner && winner.alive && (!roundTiedWin || doomTieOverride)) {
    const targets = attackableTargets(winner.id);
    if (targets.length > 0) {
      attackerId = winner.id;
      gameState = "ATTACK";
      startPhaseTimer(ATTACK_TIME, () => {
        const t = attackableTargets(attackerId);
        if (t.length) doAttack(attackerId, t[Math.floor(Math.random() * t.length)].id);
        else endTurn();
      });
      broadcastState();
      return;
    }
  }
  endTurn();
}

// หัวใจฆาตกร (นานายะ ชิกิ สกิลติดตัว 2, characters/nanaya.js): เนตรมารพลาดสังหาร -> เปิดโอกาสโจมตีซ้ำทันที
//  (เปลี่ยนเป้าหมายได้ ไม่ต้องรอเทิร์นถัดไป — กดยกเลิกได้ผ่าน nanayaCancelReattack)
// เพลงหมัด อาริมะ (อาริมะ มิยาโกะ สกิลรอง patch 2.2.0): โจมตีต่อได้อีกหลายครั้ง โอกาสลดลงเป็นขั้น (100/75/50/25% สูงสุด 4 ครั้ง)
function postAttackFollowup(attacker) {
  if (attacker && attacker.alive && attacker.characterId === "nanaya") {
    if (CHAR_HOOKS.nanaya.startReattack(engine, attacker)) return;
  }
  // เพลงหมัด อาริมะ (characters/miyako.js): ต่อคอมโบตามโอกาสที่ลดหลั่นลงไป
  if (attacker && attacker.alive && attacker.characterId === "miyako") {
    if (CHAR_HOOKS.miyako.startComboReattack(engine, attacker)) return;
  }
  // สึงาชิ ทาคุโตะ (characters/takuto.js): Star Sword Saphir + Emeraude ร่วมกัน — โจมตีเพิ่มอีก 1 ครั้งทันที (การันตี)
  if (attacker && attacker.alive && attacker.characterId === "takuto") {
    if (CHAR_HOOKS.takuto.startComboReattack(engine, attacker)) return;
  }
  // สึงาชิ ทาคุโตะ (characters/takuto.js): อย่างนายน่ะ จะไปเข้าใจอะไร (พิชิตแสงดาว) — หลังคอมโบ Saphir+Emeraude โอกาส 50% ได้โจมตีต่อเป็นครั้งที่ 3
  if (attacker && attacker.alive && attacker.characterId === "takuto") {
    if (CHAR_HOOKS.takuto.startThirdAttack(engine, attacker)) return;
  }
  if (attacker) { delete attacker.statuses.miyakoHeal; delete attacker.statuses.yaak; }
  endTurn();
}
// ยกเลิกการโจมตีซ้ำของหัวใจฆาตกร (characters/nanaya.js) — จบเทิร์นตามปกติ
function nanayaCancelReattack(id) {
  const p = players[id];
  if (!p || !p.alive || p.characterId !== "nanaya") return;
  CHAR_HOOKS.nanaya.cancelReattack(engine, p);
}

// สูตรคำนวณพลังโจมตีพื้นฐาน — ดึงออกมาจาก doAttack() ให้ทดสอบแยกได้ (ดู tests/computeAttackBase.test.js)
// ตัวละครที่ย้าย contribution มาไว้ที่ characters/<id>.js's damageBonus()/attackBaseOverride() แล้ว:
// oberon, broadband_man, eva13, kuwagata, appleguy, kotone, shrade_elan, phenex, takuto, hakuno,
// doomguy, gambler, oguri, riddhe, banagher, miyako, hikaru — ที่เหลือ (ungated/flag-only) ยังอยู่ที่นี่
function computeAttackBase(engine, attacker, target) {
  const hookCtx = {};
  const hook = engine.CHAR_HOOKS && engine.CHAR_HOOKS[attacker.characterId];
  const baseHook = (hook && hook.attackBaseOverride) ? hook.attackBaseOverride(engine, attacker, target, hookCtx) : 1;
  const hookBonus = (hook && hook.damageBonus) ? (hook.damageBonus(engine, attacker, target, hookCtx) || 0) : 0;

  const storiumAtk = attacker.characterId === "hikaru" && (attacker.statuses.storium || 0) > 0;
  const paradiseAtk = (attacker.statuses.paradise || 0) > 0;
  // veilAtk/partnerAtk: ungated ตั้งใจ (แจกให้ผู้เล่นอื่นได้ ไม่ผูกกับตัวละครเจ้าของสกิล) — อยู่ที่นี่ ไม่ใช่ hook
  const veilAtk = (attacker.statuses.veil || 0) > 0;
  const partnerAtk = CHAR_HOOKS.broadband_man.contractBuffActive(engine, attacker);
  const isRevenge = attacker.characterId === "banagher" && attacker.ntdTarget && attacker.ntdTarget === target.id;
  const isRival = attacker.characterId === "banagher" && attacker.ntdRivalId && attacker.ntdRivalId === target.id;
  const ntdBonus = (isRevenge || isRival || paradiseAtk) ? 1 : 0;
  const empowerAtk = (attacker.statuses.empower || 0) > 0;
  const oberonDayAtk = attacker.characterId === "oberon" && !engine.isNightRound(engine.roundNumber);
  const shradeDayOff = attacker.characterId === "shrade_elan" && attacker.shradeForm && !engine.isNightRound(engine.roundNumber);
  const phenexPurgeAtk = attacker.characterId === "phenex" && (attacker.statuses.phenexPurge || 0) > 0;
  const hakunoInvertAtk = attacker.characterId === "hakuno" && (attacker.statuses.hakunoInvertReady || 0) > 0;
  const hakunoNoRegenAtk = attacker.characterId === "hakuno" && (attacker.statuses.hakunoNoRegenReady || 0) > 0;
  const cardAtkBonus = attacker.statusAmt.cardAtkBonus || 0; // การ์ดแดงครบ 3 ใบตอนเปิดไพ่ (ดู applyLockColorTriggers)

  const base = baseHook + hookBonus + (veilAtk ? 1 : 0) + (empowerAtk ? 1 : 0) + (partnerAtk ? 1 : 0) + cardAtkBonus;
  return {
    base,
    storiumAtk, paradiseAtk, isRevenge, isRival, ntdBonus, veilAtk, empowerAtk, partnerAtk, cardAtkBonus,
    oberonDayAtk, shradeDayOff, phenexPurgeAtk, hakunoInvertAtk, hakunoNoRegenAtk,
    ...hookCtx,
  };
}

function doAttack(byId, targetId) {
  if (gameState !== "ATTACK" || byId !== attackerId) return;
  const attacker = players[byId];
  let target = players[targetId];
  if (!attacker || !target || !target.alive || target.id === attacker.id) return;
  if (sealActive(target)) return; // เรจูอาคมบัญชา (อมตะ): เลือกโจมตีไม่ได้
  if (attacker.characterId === "satoru" && !moonCellActive()) return; // ซาโตรุ (patch 2.0.8.2): โจมตีธรรมดาไม่ได้เลย (ยกเว้นระหว่าง MOON*CELL)
  // ไค ชิซากิ: โทสะระงับด้วยโทสะ — มีคู่ปรับ (kaiRival1/kaiRival2 ยังไม่หมด) บังคับเป้าหมายมีแค่คู่ปรับเท่านั้น
  if (attacker.kaiRivalId && ((attacker.statuses.kaiRival1 || 0) > 0 || (attacker.statuses.kaiRival2 || 0) > 0) && target.id !== attacker.kaiRivalId) return;
  clearPhaseTimer();
  attacker.nanayaReattackReady = false; // หัวใจฆาตกร (นานายะ ชิกิ): กำลังใช้โอกาสโจมตีซ้ำนี้อยู่ (หรือไม่เกี่ยวข้องกับตัวละครนี้)

  // ---------- ริดดี้: Absorb Shield — ล่อเป้า: การโจมตีของผู้เล่นทุกคนถูกดึงมาที่ริดดี้ (ผลเกิดหลังเปิดไพ่) ----------
  let riddheTaunted = false;
  {
    const taunter = CHAR_HOOKS.riddhe.findTaunter(engine, attacker);
    if (taunter && target.id !== taunter.id) {
      lastLog.push(`🧲 Absorb Shield — ${taunter.name} ล่อเป้า! การโจมตีของ ${attacker.name} ถูกดึงจาก ${target.name} มาที่ตัวเอง`);
      target = taunter;
      riddheTaunted = true;
    }
  }

  // ---------- ริต้า เบอร์นัล: ไม่อยากให้ใครต้องเจ็บปวด — ล่อเป้าการโจมตีของทุกคนมาที่ตัวเอง 3 เทิร์น ----------
  let phenexTaunted = false;
  {
    const phenexTaunter = CHAR_HOOKS.phenex.findTaunter(engine, attacker);
    if (phenexTaunter && target.id !== phenexTaunter.id) {
      lastLog.push(`🥺 ไม่อยากให้ใครต้องเจ็บปวด — ${phenexTaunter.name} ล่อเป้า! การโจมตีของ ${attacker.name} ถูกดึงจาก ${target.name} มาที่ตัวเอง`);
      target = phenexTaunter;
      phenexTaunted = true;
    }
  }

  // ---------- ชิกิ: นายมีฝีมือแค่ไหนหรอ? — ยกเลิกท่าไม้ตายแบบย้อนหลัง (patch 2.0.6.1) ----------
  //  ท่าไม้ตายที่มีผลอยู่ก่อนชิกิได้ชาร์จ จะยกเลิกตอนกดไม่ได้ — แต่ถ้าเจ้าของท่ามาตีชิกิที่ถือชาร์จอยู่
  //  ชิกิจะยกเลิกท่าไม้ตายนั้นย้อนหลังทันที (ก่อนคำนวณดาเมจ — โบนัสจากท่านั้นไม่ทำงาน)
  //  patch 2.0.8: ย้ายมาเช็คก่อนการหลบหลีก/สังหารทุกกรณี — การเลือกตีชิกิถือว่า "มาตี" แล้ว ยกเลิกได้เสมอ
  if (target.characterId === "shiki" && (target.statuses.godslay || 0) > 0) {
    const ultKey = SHIKI_CANCELABLE_ULTS.find((k) => (attacker.statuses[k] || 0) > 0);
    if (ultKey) {
      const isBardDim = ultKey === "bloodDim" || ultKey === "soulDim";
      const ultName = shikiUltNameOf(attacker, ultKey);
      const ultImg = (TRANSFORMS[ultKey] && TRANSFORMS[ultKey].img)
        || (isBardDim ? TRANSFORMS.bardDim.img : ultKey === "ashen" ? TRANSFORMS.oguriAshen.img : displayImg(attacker));
      delete attacker.statuses[ultKey];
      if (ultKey === "wither") clearWitherLines();                   // ลบเส้นชีวิตที่ท่าแจกไว้ออกด้วย
      if (ultKey === "anata") { attacker.anataTargets = null; anataMusicSeq = 0; } // ANATA WAAAAAAAA (patch 2.0.8)
      if (ultKey === "riddheguard") { const rb = riddheAllied(attacker); if (rb) delete rb.statuses.riddheward; } // ริดดี้ ท่า 2: ถอดเกราะฝั่งบานาจด้วย
      // มิติมายาบรรเลง (patch 2.0.8.1): มิติปิดลง — ท่อนทำนองทั้งหมดถูกรีเซ็ต (แบบเดียวกับมิติจบเอง)
      if (isBardDim) { attacker.bloodSection = 0; attacker.soulSection = 0; }
      lastLog.push(`👁️ ${target.name} มองขาดทุกการเคลื่อนไหว — ยกเลิก ${ultName} ของ ${attacker.name} แบบย้อนหลัง!`);
      shikiCancelUltimate(target, attacker, ultName, ultImg);
    }
  }

  // หลบหลีก (Encore / มิติมายาบรรเลง — Bard / สถานะพื้นฐาน patch 2.0.8): หลบการโดนโจมตีตาม % ที่ระบุ
  //  (ไม่ระบุ = 100%) — ซ้อนทับได้ หมดไปทีละ 1 ครั้งเมื่อถูกเลือกโจมตี ไม่ว่าหลบพ้นหรือไม่
  if ((target.statuses.evade || 0) > 0) {
    const evadePct = statusAmtOf(target, "evade") || 100;
    consumeEvadeStack(target);
    if (Math.random() * 100 < evadePct) {
      // patch 2.1.3.5: ถูกโจมตีไม่ได้แต้มสกิลอีกต่อไป (แม้หลบพ้น)
      target.wasAttacked = true;
      CHAR_HOOKS.mageslayer.onAttackDodgeSteal(engine, attacker, target); // ตราล่าเวท: หลบหลีกได้ยังถูกขโมยพลังงาน 1 หน่วยเสมอ
      lastLog.push(`💨 หลบหลีก! ${target.name} หลบการโจมตีของ ${attacker.name} ได้ (${evadePct}%) — เหลือหลบหลีกอีก ${target.statuses.evade || 0} ครั้ง`);
      lastAttack = {
        id: ++attackSeq,
        byName: attacker.name, byImg: displayImg(attacker), byColor: POSITION_COLORS[attacker.position] || "#888",
        byDoomWeapon: attacker.characterId === "doomguy" ? attacker.doomWeapon : undefined, // DoomGuy: อาวุธที่ใช้ยิงตอนนี้ (เสียงยิงฝั่ง client)
        byAttackSound: attacker.characterId === "mageslayer" ? "mageslayer_attack" : undefined, // ผู้สังหารจอมมหาเวทย์: เสียงโจมตีปกติเฉพาะตัว (BA.mp3)
        targetName: target.name, targetImg: displayImg(target), targetColor: POSITION_COLORS[target.position] || "#888",
        dmg: 0, dodge: true, fxMs: ATTACKFX_TIME * 1000,
        skills: [{ name: `หลบหลีก (${evadePct}%)`, img: BARD_CRIMSON_IMG, by: target.name, color: POSITION_COLORS[target.position] || "#888", side: "def" }],
      };
      gameState = "ATTACKING";
      startPhaseTimer(ATTACKFX_TIME, () => runCutsceneQueue(endTurn));
      broadcastState();
      return;
    }
    lastLog.push(`💨 ${target.name} พยายามหลบ (${evadePct}%) แต่ไม่พ้น — การโจมตีดำเนินต่อ (เหลือหลบหลีกอีก ${target.statuses.evade || 0} ครั้ง)`);
  }

  // ---------- ชิกิ: ฉันมองเห็นมันแล้ว (characters/shiki.js) — เป้าหมายเส้นตายครบ 6 = สังหารทันที (บังคับตาย) ----------
  const shikiEye = attacker.characterId === "shiki" && (attacker.statuses.deatheye || 0) > 0;
  if (shikiEye && !killSealed(attacker) && (target.statuses.deathline || 0) >= SHIKI_DEATHLINE_MAX) {
    if (CHAR_HOOKS.shiki.onAttackDeatheye(engine, attacker, target)) return;
  }

  // ---------- ชิกิ: ความตายที่โรยรา (characters/shiki.js) — ท่าไม้ตาย 2 (rework patch 2.0.8) ----------
  //  เส้นชีวิตไม่ใช่โอกาสสังหารอีกต่อไป — แปรเป็นดาเมจเสริมการโจมตีปกติแทน (คำนวณต่อในส่วนดาเมจด้านล่าง)
  //  ยังคงมีโอกาสสังหารทันที 1% คงที่ (เพิ่มไม่ได้)
  const shikiWither = attacker.characterId === "shiki" && (attacker.statuses.wither || 0) > 0;
  const witherLines = shikiWither ? (target.statuses.deathline || 0) : 0;
  if (shikiWither && !killSealed(attacker)) {
    if (CHAR_HOOKS.shiki.onAttackWither(engine, attacker, target)) return;
  }

  // ---------- โทโนะ ชิกิ: Mystic eye of death perception (patch 2.1.7) — ย้ายไป characters/tohno.js ----------
  if (attacker.characterId === "tohno") {
    if (CHAR_HOOKS.tohno.onAttack(engine, attacker, target)) return;
  }

  // ---------- นานายะ ชิกิ: Mystic eye of death perception (characters/nanaya.js) ----------
  attacker.nanayaMissedThisAttack = false;
  if (attacker.characterId === "nanaya") {
    if (CHAR_HOOKS.nanaya.onAttack(engine, attacker, target)) return;
  }

  // สกิลติดตัว Apple guy (ชิวๆ ไม่โดนหรอกครับ, characters/appleguy.js): ขณะชิวๆครับน้องๆ ทำงาน มีโอกาสหลบการถูกเลือกโจมตี
  if (CHAR_HOOKS.appleguy.onAttackTryDodge(engine, attacker, target)) return;

  // โอกูริ แคป (Rework, characters/oguri.js — Training บัฟเสริม Flow): โอกาสหลบการโจมตี 50%
  if (CHAR_HOOKS.oguri.tryFlowDodge(engine, attacker, target)) return;

  // ---------- ซาโตรุ อาเคฟุ (patch 2.0.8.2): สกิลติดตัวลบล้างการโจมตี + Wonder of U สวนกลับ ----------
  if (target.characterId === "satoru") {
    const r = satoruOnTargeted(target, attacker, "การโจมตี");
    if (r.negated) {
      // patch 2.1.3.5: ถูกโจมตีไม่ได้แต้มสกิลอีกต่อไป
      target.wasAttacked = true;
      lastAttack = {
        id: ++attackSeq,
        byName: attacker.name, byImg: displayImg(attacker), byColor: POSITION_COLORS[attacker.position] || "#888",
        byDoomWeapon: attacker.characterId === "doomguy" ? attacker.doomWeapon : undefined, // DoomGuy: อาวุธที่ใช้ยิงตอนนี้ (เสียงยิงฝั่ง client)
        byAttackSound: attacker.characterId === "mageslayer" ? "mageslayer_attack" : undefined, // ผู้สังหารจอมมหาเวทย์: เสียงโจมตีปกติเฉพาะตัว (BA.mp3)
        targetName: target.name, targetImg: displayImg(target), targetColor: POSITION_COLORS[target.position] || "#888",
        dmg: 0, dodge: true, fxMs: ATTACKFX_TIME * 1000,
        skills: [{ name: "อย่าได้ไล่ตามหัวหน้า (การโจมตีถูกลบล้าง)", img: SATORU_PROFILE_IMG, by: target.name, color: POSITION_COLORS[target.position] || "#888", side: "def" }],
      };
      runCutsceneQueue(() => { // วีดีโอ Wonder of U (ถ้าเพิ่งสวนกลับ) เล่นก่อนจบเทิร์น
        gameState = "ATTACKING";
        startPhaseTimer(ATTACKFX_TIME, endTurn);
        broadcastState();
      });
      return;
    }
    // ลบล้างติดคูลดาวน์อยู่ — การโจมตีดำเนินต่อ (Wonder of U อาจสวนกลับไปแล้วใน satoruOnTargeted)
  }

  // สูตรพลังโจมตีพื้นฐาน — ย้าย body ไป computeAttackBase() แล้ว (ดูก่อนหน้า doAttack ในไฟล์นี้)
  let {
    base,
    gingastriumAtk, ginga, storiumAtk, beam, paradiseAtk, ohger, spearAtk, profitAtk,
    isRevenge, isRival, ntdBonus, unibeam2Atk, lastStanding, veilAtk, empowerAtk, oberonZero,
    oberonDayAtk, appleAtk, tigerAtk, partnerAtk, pigDmg, kotoneExhausted, kotoneAtk, shradeAtk,
    shradeDayOff, oguriGoldAtk, victoryAtk, beamPlusAtk, riddheNtdOn, riddheUltBonus, riddheP1Atk,
    riddheAvAtk, phenexPurgeAtk, miyakoUltAtk, hakunoInvertAtk, hakunoNoRegenAtk,
    rachanAtk, fourthAtk, doomLockonAtk, cardAtkBonus,
  } = computeAttackBase(engine, attacker, target);
  // ผกผัน (สถานะ Universal patch 2.2.1): โบนัสพลังโจมตีที่ควรได้ กลับกลายเป็นลดพลังโจมตีแทน (คำนวณรอบเพดานฐาน 1 หน่วย)
  if (invertActive(attacker)) base = Math.max(0, 1 - (base - 1));
  if (kotoneExhausted) base = 0;
  let dmg = base + (kotoneExhausted ? 0 : ntdBonus);
  // เสริมพลัง / อ่อนแอ (สถานะพื้นฐาน patch 2.0.8): เพิ่ม/ลดดาเมจที่ทำได้ตามจำนวนที่ระบุ
  const mightAtk = statusAmtOf(attacker, "might");
  if (mightAtk > 0) dmg += mightAtk;
  // ยูนะ: Longing (บัฟผู้ถูกฟื้นคืนชีพ +1 ถาวร 5 เทิร์น) / Break Beat Bark! (ทุกคน +1 เฉพาะโจมตีปกติ ไม่ใช่สกิล)
  const yunaLongingAtk = statusAmtOf(attacker, "yunaLonging");
  if (yunaLongingAtk > 0) dmg += yunaLongingAtk;
  const yunaBeatBark = yunaBeatBarkActive();
  if (yunaBeatBark) dmg += 1;
  const weakAtk = statusAmtOf(attacker, "weak");
  if (weakAtk > 0) dmg = Math.max(0, dmg - weakAtk);
  // ความตายที่โรยรา (ชิกิ patch 2.0.8): เส้นชีวิตของเป้าหมายแปรเป็นดาเมจเสริม +1 ต่อเส้น
  //  แต่พลังโจมตีรวมฝั่งผู้โจมตีไม่เกิน 5 หน่วยต่อการโจมตี
  if (shikiWither && witherLines > 0) {
    const before = dmg;
    dmg = Math.min(SHIKI_WITHER_ATK_CAP, dmg + witherLines);
    lastLog.push(`🥀 ความตายที่โรยรา — เส้นชีวิตของ ${target.name} แปรเป็นดาเมจเสริม +${Math.max(0, dmg - before)} (พลังโจมตีรวมสูงสุด ${SHIKI_WITHER_ATK_CAP})`);
  } else if (shikiWither) {
    dmg = Math.min(SHIKI_WITHER_ATK_CAP, dmg); // เพดานพลังโจมตีระหว่างท่าไม้ตาย 2 คงที่ 5
  }
  // ลำแสงสโตเรียม (ฮิคารุ patch 2.1.3): แทนที่ดาเมจทั้งหมดด้วยสูตรเฉพาะ — โจมตีปกติ(สูงสุด 4) + ลุกไหม้ที่เหลือของเป้าหมาย รวมไม่เกิน 8
  let storiumAtkPart = 0, storiumBurnPart = 0;
  if (storiumAtk) {
    storiumAtkPart = Math.min(HIKARU_STORIUM_ATK_CAP, dmg);
    storiumBurnPart = target.statuses.hburn || 0;
    dmg = Math.min(HIKARU_STORIUM_TOTAL_CAP, storiumAtkPart + storiumBurnPart);
    delete attacker.statuses.storium;
  }
  CHAR_HOOKS.kotone.onAttackConsumeCoins(engine, attacker, pigDmg);
  if (kotoneExhausted) lastLog.push(`🥱 ${attacker.name} พักผ่อนไม่พอจาก [โหมงานหนัก] — พลังโจมตีช่วงเช้าเหลือ 0`);
  // ชำระค่าบริการ (สกิลติดตัวเจ้าแห่งเน็ตบ้าน): คู่สัญญาโจมตีใส่ตัวละครนี้ ความเสียหายลด 1
  const contractGuard = target.characterId === "broadband_man" && target.contractPartner === attacker.id && attacker.contractWith === target.id;
  if (contractGuard) dmg = Math.max(0, dmg - 1);
  // คุ้มครอง (Harmony / สถานะพื้นฐาน): ความเสียหายที่ได้รับลดลงตามจำนวนที่ระบุ (ไม่ระบุ = 1)
  const bardGuard = (target.statuses.guard || 0) > 0;
  const guardAmt = bardGuard ? (statusAmtOf(target, "guard") || 1) : 0;
  if (guardAmt > 0) dmg = Math.max(0, dmg - guardAmt);
  // Discord (Bard): เป้าหมายติดขัดแย้ง — ความเสียหายที่ได้รับ +1
  const bardDiscord = (target.statuses.discord || 0) > 0;
  if (bardDiscord) dmg += 1;
  // เปราะบาง (สถานะพื้นฐาน patch 2.0.8): ความเสียหายที่ได้รับเพิ่มตามจำนวนที่ระบุ
  const fragileAmt = statusAmtOf(target, "fragile");
  if (fragileAmt > 0) dmg += fragileAmt;
  // ยูนะ: Delete (+1 ดาเมจที่ได้รับ) / Smile for You (-1 ดาเมจที่ได้รับ) — ต้าน/ลบไม่ได้ ซ้อนกับเปราะบางได้
  const yunaDeleteAmt = statusAmtOf(target, "yunaDelete");
  if (yunaDeleteAmt > 0) dmg += yunaDeleteAmt;
  const yunaSmileAmt = statusAmtOf(target, "yunaSmile");
  if (yunaSmileAmt > 0) dmg = Math.max(0, dmg - yunaSmileAmt);
  // เต็มอิ่ม (Breakfast โอกูริ patch 2.0.8.1): ดาเมจที่ได้รับ -1 (หมดหลังจบเทิร์นที่กดใช้)
  const fullBelly = (target.statuses.fullbelly || 0) > 0;
  if (fullBelly) dmg = Math.max(0, dmg - 1);
  // MOON*CELL (คิชินามิ ฮาคุโนะ patch 2.2.1): ทุกคนยกเว้นเจ้าของท่า โจมตีด้วยพลังโจมตีพื้นฐาน 1 หน่วยเท่านั้น
  //  ไม่ว่าจะเสริมแกร่งอะไรมา (ทับค่าที่คำนวณไว้ทั้งหมดข้างบน — สกิลติดตัว/บัฟถาวรที่ไม่ใช่สถานะก็โดนด้วย)
  if (moonCellActive() && attacker.characterId !== "hakuno") dmg = 1;
  // หอกผู้พิชิต (สึงาชิ ทาคุโตะ patch 2.2.5): ทับดาเมจทั้งหมดด้วยค่าคงที่ 5 หน่วย (เหนือกว่าทุกโบนัส/ดีบัฟที่คำนวณมาข้างบน)
  const takutoLanceAtk = attacker.characterId === "takuto" && (attacker.statuses.lance || 0) > 0;
  if (takutoLanceAtk) dmg = TAKUTO_LANCE_DMG;

  // ---------- ริต้า เบอร์นัล (characters/phenex.js): ฝันไปเถอะ — ตั้งรับ สะท้อนความเสียหายทั้งหมดกลับผู้โจมตีแทนที่จะรับเอง ----------
  if (CHAR_HOOKS.phenex.tryReflectHit(engine, attacker, target, dmg)) return;

  // ลำแสงสโตเรียม (ฮิคารุ patch 2.1.3): เล่นวีดีโอก่อนสรุปผลความเสียหาย
  if (storiumAtk) {
    triggerCutscene(attacker, "hikaruStorium");
    lastLog.push(`🌟 ${attacker.name} ลำแสงสโตเรียม — โจมตีปกติ ${storiumAtkPart} + ลุกไหม้ที่เหลือของ ${target.name} ${storiumBurnPart} = ${dmg} หน่วย (สูงสุด ${HIKARU_STORIUM_TOTAL_CAP})`);
  }
  // Beam Magnum: หักกระสุน 1 นัดเมื่อได้โจมตีจริงเท่านั้น (ไม่นับถ้าเลือกแล้วไม่ได้ตี/แตกในเทิร์น)
  if (beam && (attacker.beamAmmo || 0) > 0) attacker.beamAmmo--;
  // บานาจ (patch 2.1.2): Beam Magnum (สกิลรอง 2 ระหว่างร่าง Paradise) — เล่นวีดีโอก่อนสรุปผล
  if (beam && attacker.characterId === "banagher") triggerCutscene(attacker, "banagherBeamAtk");
  // Beam Magnum Plus (ริดดี้): หักกระสุนเมื่อได้โจมตีจริง + เล่นวีดีโอ (ชนะแล้วโจมตีสำเร็จ)
  if (beamPlusAtk) {
    if ((attacker.beamAmmo || 0) > 0) attacker.beamAmmo--;
    triggerCutscene(attacker, "riddheBeam"); // ครั้งแรกเล่นวีดีโอเต็ม / ครั้งถัดไปแจ้งเตือนเล็กๆ
  }
  // แสงที่ไม่อยู่เพียงลำพัง (ท่าไม้ตาย 2 patch 2.1.2): หักกระสุน Beam Magnum ของทั้งคู่คนละ 1 นัด + เล่นวีดีโอ
  let unibeam2Ally = null;
  if (unibeam2Atk) {
    unibeam2Ally = riddheAllied(attacker);
    if ((attacker.beamAmmo || 0) > 0) attacker.beamAmmo--;
    if (unibeam2Ally && (unibeam2Ally.beamAmmo || 0) > 0) unibeam2Ally.beamAmmo--;
    triggerCutscene(attacker, "unibeam2");
  }

  const attackerBeat = beatActive(attacker); // Beat Mode: การโจมตีเป็นความเสียหายจริง ไม่สนเกราะ
  const hpBefore = target.hp;
  const armorBefore = target.armor;
  const shieldBefore = target.shield;
  // เชื่อมผล (patch 2.0.8): HP ที่เป้าหมายเสียจริงจะแชร์ให้คู่เชื่อมเท่ากันผ่าน loseHp — เก็บค่าก่อนตีไว้โชว์ผล
  const linkedBuddy = linkedBuddyOf(target);
  const buddyHpBefore = linkedBuddy ? linkedBuddy.hp : 0;
  // RS-Hopper (เอวา 13 patch 2.2.1 alpha): "การโจมตีปกติ" = การโจมตีจากการเลือกเป้าหมายในระบบเทิร์นปกติ (doAttack นี้เสมอ)
  //  ไม่ว่าจะมีบัฟเสริมพลังโจมตีติดตัวหรือไม่ — กันเต็มไม่ได้ กันได้แค่ไม่ให้ต่ำกว่า 4 หน่วย (RS-Hopper พิเศษ ดูใน loseHp)
  //  ส่วนความเสียหายจากสกิลประเภทโจมตี/เลือกเป้าหมายที่ไม่ผ่าน doAttack (เช่น ปลดปล่อยความเจ็บปวดของริต้า) กันเต็มได้ทันที
  // DoomGuy (patch 2.2 full): บางอาวุธ (Heavy Cannon / Plasma Rifle / Ballista) ดาเมจเจาะเกราะ — ทะลุเกราะเข้าเลือดจริงเสมอ
  const doomPierceAtk = attacker.characterId === "doomguy" && !((attacker.statuses.doomCrucible || 0) > 0) &&
    !!(DOOM_WEAPONS[attacker.doomWeapon] || DOOM_WEAPONS.shotgun).pierce;
  if (attackerBeat || profitAtk > 0 || phenexPurgeAtk || doomPierceAtk) dealDirect(target, dmg, true); // ประกายเขี้ยวปฏิปักษ์ / กำไรเท่าตัวโว้ย / อย่าอยู่เลย แกน่ะ!: ทะลุเกราะเข้าเลือดจริง
  else dealMixed(target, dmg, true);               // กฎปกติ: ลดเกราะก่อน ถ้าไม่มีเกราะจึงเข้าเลือดจริง
  // ผู้สังหารจอมมหาเวทย์ (characters/mageslayer.js): ขโมยพลังงาน (min1/max4) / ผนึกพลังงานถ้าเป้าหมายพลังงาน 0 / เคลียร์ Fury stack
  CHAR_HOOKS.mageslayer.onAttackPostDamage(engine, attacker, target, dmg);
  // สกิลรอง (ฟุจิตะ โคโตเนะ, characters/kotone.js): บัฟพลังโจมตีพื้นฐาน +2 ใช้แล้วหมดไปทันทีเมื่อได้โจมตี
  CHAR_HOOKS.kotone.onAttackConsumeDanceBuff(engine, attacker);
  // Ginga Strium (ฮิคารุ, characters/hikaru.js): โจมตีโดนเป้าหมาย -> ติดลุกไหม้ให้เป้าหมาย / ถูกโจมตีขณะอยู่ในร่างนี้ -> ผู้โจมตีติดลุกไหม้สวนกลับ
  CHAR_HOOKS.hikaru.onAttackBurnApply(engine, attacker, target);
  // ริต้า เบอร์นัล: อย่าอยู่เลย แกน่ะ! — เล่นวีดีโอก่อนสรุปผล + ลบ/แบนท่าไม้ตายเป้าหมาย (นับมิติมายาบรรเลงของคีตกวีด้วย)
  if (phenexPurgeAtk) {
    triggerCutscene(attacker, "phenexPurge");
    if (target.alive) {
      const purgeKey = SHIKI_CANCELABLE_ULTS.find((k) => (target.statuses[k] || 0) > 0);
      if (purgeKey) {
        const isBardDim = purgeKey === "bloodDim" || purgeKey === "soulDim";
        const ultName = shikiUltNameOf(target, purgeKey);
        delete target.statuses[purgeKey];
        if (target.statusAmt) delete target.statusAmt[purgeKey];
        if (purgeKey === "wither") clearWitherLines();
        if (purgeKey === "anata") { target.anataTargets = null; anataMusicSeq = 0; }
        if (purgeKey === "riddheguard") { const rb = riddheAllied(target); if (rb) delete rb.statuses.riddheward; }
        if (isBardDim) { target.bloodSection = 0; target.soulSection = 0; }
        lastLog.push(`🚫 ${attacker.name} อย่าอยู่เลย แกน่ะ! — ลบและปิดการใช้งาน ${ultName} ของ ${target.name} ทันที!`);
      } else if (resistActive(target)) {
        lastLog.push(`🛡️ ${target.name} ต้านสถานะผิดปกติ — อย่าอยู่เลย แกน่ะ! ไม่มีผล`);
      } else {
        target.statuses.phenexBanUlt = Math.max(target.statuses.phenexBanUlt || 0, PHENEX_BAN_ULT_TURNS);
        lastLog.push(`🚫 ${attacker.name} อย่าอยู่เลย แกน่ะ! — ${target.name} ไม่มีท่าไม้ตายทำงานอยู่ บังคับห้ามใช้ท่าไม้ตาย ${PHENEX_BAN_ULT_TURNS} เทิร์นแทน`);
      }
    }
  }
  // หนูจะทำให้พี่ตาสว่างเอง (อาริมะ มิยาโกะ): เล่นวีดีโอก่อนสรุปผล — เป้าหมายมีความสามารถสังหารทันทีติดตัวไหม
  //  มี -> ปิดใช้งานความสามารถนั้น 3 เทิร์น | ไม่มี -> "ย๊ากก!" พลังโจมตี +1 ลงหมัดนี้ทันที (ผ่าน miyakoAtkBonusOn ด้านบน)
  //  และตั้งสถานะ yaak ต่อไว้ให้ — ถ้ากำลังต่อคอมโบเพลงหมัดอาริมะอยู่ (miyakoCombo) yaak จะไม่ถูกล้างจนกว่าคอมโบจะจบ
  //  ทำให้ทุกหมัดที่เหลือในคอมโบเดียวกันได้โบนัสด้วย (นับทั้งคอมโบเป็นการโจมตีครั้งเดียวตามที่ตั้งใจไว้) — ไม่ใช่คอมโบก็เคลียร์ทิ้งหลังหมัดนี้ตามปกติ
  //  + เป้าหมายเกราะไม่ฟื้น 5 เทิร์น
  if (miyakoUltAtk) CHAR_HOOKS.miyako.resolveUltHit(engine, attacker, target);
  // โอเจอร์ชาร์จ (คุวากาตะ Ohger Finish, characters/kuwagata.js): โจมตีปกติ +1 แล้วมอบผุพังให้เป้าหมาย — ใช้แล้วหมดไป
  if (ohger) CHAR_HOOKS.kuwagata.onAttackConsumeOhger(engine, attacker, target);
  // ข้าขอบัญชา (คิชินามิ ฮาคุโนะ, characters/hakuno.js): โจมตีปกติติดผกผัน (ชาย) / เกราะไม่ฟื้น+ไร้ทางเยียวยา (หญิง) ให้เป้าหมาย
  if (hakunoInvertAtk) CHAR_HOOKS.hakuno.onAttackConsumeInvert(engine, attacker, target);
  if (hakunoNoRegenAtk) CHAR_HOOKS.hakuno.onAttackConsumeNoRegen(engine, attacker, target);
  CHAR_HOOKS.gambler.onAttackConsumeProfit(engine, attacker, profitAtk);
  // เสริมพลัง (Rejuvenation): ใช้แล้วหมดไปทันทีเมื่อได้โจมตี
  if (empowerAtk) {
    delete attacker.statuses.empower;
    lastLog.push(`💪 ${attacker.name} เสริมพลังจาก Rejuvenation — การโจมตีนี้ +1 (บัฟหมดลง)`);
  }
  // The Beat of Victory (โอกูริ Rework, characters/oguri.js): เป้าหมายที่ถูกโจมตีติด "เกินเยียวยา" + "ชะงัก"
  if (victoryAtk) {
    CHAR_HOOKS.oguri.applyVictoryEffect(engine, target);
  }
  // หอกลองกินัส (characters/eva13.js): โจมตีโดนเป้าหมาย -> โอกาสล็อกสกิลเป้าหมาย ใช้แล้วหมดไป
  if (spearAtk) CHAR_HOOKS.eva13.onAttackConsumeSpear(engine, attacker, target);
  // Beat Mode กันตาย (ครั้งเดียวต่อเกม): ทำงานทันทีเมื่อความเสียหายถึงตาย — ไม่ต้องอยู่ใน Beat Mode ก่อน
  //  หลังกันตายทำงาน -> เกราะจะไม่ฟื้นคืน + ภูมิดาเมจจากการแพ้ (แต่ครั้งต่อไปจะตายปกติ)
  const beatSaveFired = maybeBeatSave(target);
  maybeWakeKotone(target); // โคโตเนะหลับอยู่โดนโจมตี = สะดุ้งตื่น + ติด [โหมงานหนัก]
  // เชื่อมผล (Resonance patch 2.0.8): HP ที่เป้าหมายเสียจริงถูกแชร์ให้คู่เชื่อมเท่ากันแล้ว (ผ่าน loseHp)
  //  — ตรวจผลเพื่อแจ้งเตือน/กันตาย/ผลต่อเนื่องของคู่เชื่อม
  let linkedHit = null;
  if (linkedBuddy && linkedBuddy.hp < buddyHpBefore) {
    const shared = buddyHpBefore - linkedBuddy.hp;
    maybeBeatSave(linkedBuddy);
    maybeBeatMode(linkedBuddy);
    maybeEva3(linkedBuddy);
    maybeWakeKotone(linkedBuddy);
    linkedBuddy.wasAttacked = true;
    linkedHit = linkedBuddy;
    lastLog.push(`🔗 เชื่อมผล! ${linkedBuddy.name} รับความเสียหายตาม ${target.name} -${shared}`);
  }
  target.wasAttacked = true;
  target.phenexLastHitBy = attacker.id; // ริต้า เบอร์นัล: จำผู้โจมตีล่าสุด — ใช้เลือกเป้าปลดปล่อยความเจ็บปวดตอนตกรอบจริง
  // patch 2.1.3.5: ถูกโจมตีไม่ได้แต้มสกิลอีกต่อไป
  // Absorb shield (บานาจ) / Absorb Shield (ริดดี้): เกราะที่เสียไปจากการถูกโจมตี แปลงกลับเป็นพลังชีวิต
  const armorLost = armorBefore - target.armor;
  if (((target.statuses.absorb || 0) > 0 || (target.statuses.absorbplus || 0) > 0) && armorLost > 0) {
    const heal = healHp(target, armorLost);
    if (heal > 0) lastLog.push(`🛡️ ${target.name} Absorb shield แปลงเกราะที่เสีย ${armorLost} → พลังชีวิต +${heal}`);
  }
  // บานาจ (patch 2.1.2): Absorb shield — โล่ของเป้าหมายแตกระหว่างมีผล -> ฟื้นเลือดให้เจ้าของสกิล
  const bshieldLost = shieldBefore - target.shield;
  if ((target.statuses.bshield || 0) > 0 && target.bshieldOwnerId && bshieldLost > 0) {
    const owner = players[target.bshieldOwnerId];
    if (owner && owner.alive) {
      const heal = healHp(owner, bshieldLost);
      if (heal > 0) lastLog.push(`🛡️ Absorb shield — โล่ของ ${target.name} เสีย ${bshieldLost} → ฟื้นพลังชีวิตให้ ${owner.name} +${heal}`);
    }
  }
  // Beat Mode: ถ้าการโจมตีทำให้เลือดเหลือ < 3 -> เข้าประกายเขี้ยวปฏิปักษ์
  maybeBeatMode(target);
  // สกิลติดตัว 3 เอวา 13: ถ้าการโจมตีทำให้เลือดเหลือ <= 3
  maybeEva3(target);
  // มีดพก (ชิกิ, characters/shiki.js): การโจมตีปกติฟื้นเลือดให้ตัวเอง (คงอยู่ 2 เทิร์น)
  const knifeAtk = attacker.characterId === "shiki" && (attacker.statuses.knife || 0) > 0;
  const knifeHeal = knifeAtk ? CHAR_HOOKS.shiki.applyKnifeHeal(engine, attacker) : 0;
  // พี่จ๋าอยู่ไหน (อาริมะ มิยาโกะ): การโจมตีปกติฟื้นเลือดตัวเอง +1 ทุกครั้ง (คงอยู่จนกว่าจะได้ตี — รวมทุกครั้งของคอมโบ)
  const miyakoHealAtk = attacker.characterId === "miyako" && (attacker.statuses.miyakoHeal || 0) > 0;
  if (miyakoHealAtk) CHAR_HOOKS.miyako.applyHealOnHit(engine, attacker);
  // เทเปา (characters/tepeu.js): การโจมตีปกติมอบสถานะ "เส้นชีวิต" ให้เป้าหมาย +1 เสมอ (ไม่ต้องติดครุ่นคิดก็ได้)
  CHAR_HOOKS.tepeu.grantDeathlineOnAttack(engine, attacker, target);
  // หอกแห่งแคสเซียส (เอวา 13 patch 2.2 alpha, characters/eva13.js): การโจมตีปกติฟื้นเลือดตามความเสียหายที่ทำได้ — ใช้แล้วหมดไป
  CHAR_HOOKS.eva13.onAttackConsumeCassius(engine, attacker, dmg);
  // ย๊ากก! (อาริมะ มิยาโกะ patch 2.2.1 alpha): พลังโจมตี +1 ต่อการโจมตี — ถ้าใช้ร่วมกับเพลงหมัดอาริมะ
  //  นับทั้งคอมโบเป็นการโจมตีครั้งเดียว จึงยังไม่ลบตรงนี้ (ให้บวก +1 ทุกหมัดในคอมโบ) — ลบจริงตอนคอมโบจบใน postAttackFollowup()
  // ---------- DoomGuy (characters/doomguy.js) ----------
  if (attacker.characterId === "doomguy") CHAR_HOOKS.doomguy.onAttackPostDamage(engine, attacker, target, dmg, doomLockonAtk);
  // ---------- สึงาชิ ทาคุโตะ (characters/takuto.js) ----------
  const takutoUlt2VideoQueued = attacker.characterId === "takuto" ? CHAR_HOOKS.takuto.onAttackPostDamage(engine, attacker, dmg) : false;
  // เนตรมารแห่งความมรณะ (ชิกิ, characters/shiki.js): โจมตีปกติระหว่างท่าไม้ตายทำงาน (แต่เส้นตายยังไม่ถึง 6) -> รีเซ็ตเส้นตายเป้าหมาย
  const deathlineReset = CHAR_HOOKS.shiki.resetDeathlineOnHit(engine, attacker, target);
  if (isRival) {
    attacker.ntdRivalId = null;
    if (!attacker.ntdTarget) delete attacker.seen.banagherPassive2;
    lastLog.push(`🥺⚡ ${attacker.name} ฉันไม่อยากให้เราต้องมาสู้กัน — แก้แค้น ${target.name} ด้วย NT-D +1 -${dmg} (ลดเกราะก่อน) — สงบลง`);
  }
  if (isRevenge) {
    attacker.ntdTarget = null;
    delete attacker.seen.ntd;
    lastLog.push(`⚡ ${attacker.name} แก้แค้น ${target.name} ด้วย NT-D +1 -${dmg} (ลดเกราะก่อน) — NT-D สงบลง`);
  } else if (!isRival) {
    lastLog.push(`${attacker.name} โจมตี ${target.name} -${dmg} (ลดเกราะก่อน)`);
  }

  // Ginga / ลำแสงสโตเรียม (ฮิคารุ, characters/hikaru.js): ตีหมู่ผู้เล่นอื่นที่ไม่ใช่เป้าหมาย
  CHAR_HOOKS.hikaru.onAttackGingaSplash(engine, attacker, target, ginga);
  CHAR_HOOKS.hikaru.onAttackStoriumSplash(engine, attacker, target, storiumAtk);
  // Beam Magnum Plus (ริดดี้): เปลี่ยนการโจมตีปกติเป็นตีหมู่ — คนที่ไม่ใช่เป้าหมายเสียเกราะ 1 หน่วย
  if (beamPlusAtk) {
    const splashHit = [];
    for (const o of alivePlayers()) {
      if (o.id === attacker.id || o.id === target.id) continue;
      dealArmorOnly(o, 1);
      o.wasAttacked = true;
      splashHit.push(o);
    }
    if (splashHit.length) lastLog.push(`🔫 Beam Magnum Plus! ${attacker.name} ตีหมู่ — ผู้เล่นอื่นเสียเกราะ -1`);
  }
  // แสงที่ไม่อยู่เพียงลำพัง (ท่าไม้ตาย 2 patch 2.1.2): ซ้ำเข้าไปอีก 3 หน่วย ตีหมู่ทุกคนที่เหลือ (ยกเว้นริดดี้พันธมิตร)
  if (unibeam2Atk) {
    const splashHit = [];
    for (const o of alivePlayers()) {
      if (o.id === attacker.id || o.id === target.id) continue;
      if (unibeam2Ally && o.id === unibeam2Ally.id) continue;
      dealMixed(o, BANAGHER_ULT2_SPLASH_DMG);
      maybeBeatSave(o);
      maybeBeatMode(o);
      maybeEva3(o);
      maybeWakeKotone(o);
      o.wasAttacked = true;
      splashHit.push(o);
    }
    if (splashHit.length) lastLog.push(`💫 แสงที่ไม่อยู่เพียงลำพัง! ${attacker.name} ตีหมู่ — ${splashHit.map((o) => o.name).join(", ")} รับความเสียหาย -${BANAGHER_ULT2_SPLASH_DMG}`);
  }

  // การหลับไหลอันไม่สิ้นสุด (โอเบรอน patch 1.7.6): ยามกลางวัน การโจมตีปกติติด "ยามฟ้าสาง" +1 แก่เป้าหมาย
  //  (สะสมสูงสุด 5 — คนที่กำลังหลับไหลไม่ติดเพิ่ม — เดิมค้างเพดานเก่า 3 จากตอนแก้จุดอื่นเป็น 5 แล้วไม่ครบ)
  let dawnApplied = false;
  if (oberonDayAtk && target.alive && !((target.statuses.sleep || 0) > 0) && !resistActive(target)) {
    target.statuses.dawn = Math.min(5, (target.statuses.dawn || 0) + 1);
    dawnApplied = true;
    lastLog.push(`🌅 การหลับไหลอันไม่สิ้นสุด: ${target.name} ติดยามฟ้าสาง +1`);
  }

  // Ginga no Uta (ฮิคารุ, characters/hikaru.js): กำจัดเป้าหมายได้ขณะอยู่ในร่าง Ginga Strium -> ต่ออายุ +1 เทิร์น
  CHAR_HOOKS.hikaru.onAttackExtendOnKill(engine, attacker, target, hpBefore, gingastriumAtk);

  // NT-D (บานาจเป็นเป้า): ตั้งบัฟแก้แค้น "คนล่าสุด" — แสดงฉากเมื่อเปลี่ยนเป้าเท่านั้น
  if (target.characterId === "banagher" && attacker.alive) {
    const changed = target.ntdTarget !== attacker.id;
    target.ntdTarget = attacker.id;
    target.seen.ntd = true;
    if (changed) triggerCutscene(target, "ntd");
    // ฉันไม่อยากให้เราต้องมาสู้กัน (สกิลติดตัว 2 patch 2.1.2): เปลี่ยนร่างเป็น NT-D + ริดดี้ไม่ใช่พันธมิตร -> ล็อกเป้าแก้แค้นใส่ริดดี้เพิ่มอีกทาง
    if (changed) {
      const rival = alivePlayers().find((o) => o.characterId === "riddhe" && !riddheAllied(o));
      if (rival && target.ntdRivalId !== rival.id) {
        target.ntdRivalId = rival.id;
        target.seen.banagherPassive2 = true;
        triggerCutscene(target, "banagherPassive2");
        lastLog.push(`🥺 ${target.name} ฉันไม่อยากให้เราต้องมาสู้กัน — ล็อกเป้าแก้แค้นใส่ ${rival.name} เพิ่มอีกทาง (แรง +1 หน่วยเหมือน NT-D System)`);
      }
    }
  }

  // ---------- ริดดี้ (characters/riddhe.js): สกิลติดตัว 1 บานาจโจมตีใส่เรา -> ท่าไม้ตาย 1 ฟรี / คู่พันธมิตรโจมตีกันเอง ----------
  CHAR_HOOKS.riddhe.onAttackedByBanagher(engine, target);
  CHAR_HOOKS.riddhe.checkAllyFriendlyFire(engine, attacker, target, hpBefore, armorBefore);

  // สกิลที่มีผลกับการโจมตีครั้งนี้ (โชว์ใต้อนิเมชัน แยกฝั่งชัดเจน: atk = ฝั่งโจมตี | def = ฝั่งป้องกัน)
  const fxSkills = [];
  const addFx = (x, side) => { if (x) fxSkills.push({ ...x, side }); };
  if (beam) addFx(skillByStatus(attacker, "beam"), "atk");
  if (ohger) addFx(skillByStatus(attacker, "ohger"), "atk");
  if (rachanAtk) addFx({ name: `คิงโอเจอร์ +${rachanAtk}`, img: OHGER_FORM, by: attacker.name, color: POSITION_COLORS[attacker.position] || "#888" }, "atk");
  if (fourthAtk) addFx({ name: `Fourth Impact +${fourthAtk}`, img: TRANSFORMS.fourth.img, by: attacker.name, color: POSITION_COLORS[attacker.position] || "#888" }, "atk");
  if (ginga) addFx(skillByStatus(attacker, "ginga"), "atk");
  if (gingastriumAtk) addFx({ name: `Ginga Strium${lastStanding ? " +1 (คู่ต่อสู้คนเดียว)" : ""}`, img: HIKARU_STRIUM_IMG, by: attacker.name, color: POSITION_COLORS[attacker.position] || "#888" }, "atk");
  if (spearAtk) addFx(skillByStatus(attacker, "spear"), "atk");
  if (veilAtk) addFx({ name: "ม่านแห่งราตรี +1", img: "/characters/oberon/oberon_skill1.jpg", by: attacker.name, color: POSITION_COLORS[attacker.position] || "#888" }, "atk");
  if (empowerAtk) addFx({ name: "Rejuvenation — เสริมพลัง +1", img: BARD_CRIMSON_IMG, by: attacker.name, color: POSITION_COLORS[attacker.position] || "#888" }, "atk");
  if (oberonZero < 0 && !veilAtk) addFx({ name: "การหลับไหลอันไม่สิ้นสุด (พลังโจมตี 0)", img: displayImg(attacker), by: attacker.name, color: POSITION_COLORS[attacker.position] || "#888" }, "atk");
  if (dawnApplied) addFx({ name: "การหลับไหลอันไม่สิ้นสุด (ยามฟ้าสาง +1)", img: displayImg(attacker), by: attacker.name, color: POSITION_COLORS[attacker.position] || "#888" }, "atk");
  if (profitAtk > 0) addFx({ name: `กำไรเท่าตัวโว้ย +${profitAtk} (ทะลุเกราะ)`, img: "/characters/gambler/gambler_skill2.jpg", by: attacker.name, color: POSITION_COLORS[attacker.position] || "#888" }, "atk");
  if (appleAtk > 0) addFx({ name: `เอาไปสิ +${appleAtk} (บัฟมอบของ)`, img: "/characters/appleguy/appleguy_skill2.jpg", by: attacker.name, color: POSITION_COLORS[attacker.position] || "#888" }, "atk");
  if (tigerAtk) addFx({ name: "เสือนอนกิน +1", img: "/characters/broadband_man/broadband_man_skill1.jpg", by: attacker.name, color: POSITION_COLORS[attacker.position] || "#888" }, "atk");
  if (pigDmg > 0) addFx({ name: `กระปุกออมสินน้องหมูน้อย +${pigDmg}`, img: "/characters/kotone/kotone.jpg", by: attacker.name, color: POSITION_COLORS[attacker.position] || "#888" }, "atk");
  if (kotoneAtk) addFx({ name: `เพลงฝึกซ้อม +${KOTONE_DANCE_ATK_BONUS}`, img: "/characters/kotone/kotone_skill2.jpg", by: attacker.name, color: POSITION_COLORS[attacker.position] || "#888" }, "atk");
  if (kotoneExhausted) addFx({ name: "โหมงานหนัก (พลังโจมตี 0)", img: "/characters/kotone/kotone.jpg", by: attacker.name, color: POSITION_COLORS[attacker.position] || "#888" }, "atk");
  if (partnerAtk) addFx({ name: "คู่สัญญา +1 (สนใจใช้บริการเราไหม)", img: "/characters/broadband_man/broadband_man_skill3.jpg", by: attacker.name, color: POSITION_COLORS[attacker.position] || "#888" }, "atk");
  if (contractGuard) addFx({ name: "ชำระค่าบริการ (ความเสียหายลด 1)", img: "/characters/broadband_man/broadband_man.jpg", by: target.name, color: POSITION_COLORS[target.position] || "#888" }, "def");
  if (paradiseAtk && !isRevenge) addFx(skillByStatus(attacker, "paradise"), "atk");
  if (isRevenge) addFx({ name: "NT-D System แก้แค้น +1", img: TRANSFORMS.ntd.img, by: attacker.name, color: POSITION_COLORS[attacker.position] || "#888" }, "atk");
  if (isRival) addFx({ name: "ฉันไม่อยากให้เราต้องมาสู้กัน +1", img: TRANSFORMS.ntd.img, by: attacker.name, color: POSITION_COLORS[attacker.position] || "#888" }, "atk");
  if (unibeam2Atk) addFx(skillByStatus(attacker, "unibeam2"), "atk");
  if (attackerBeat) addFx({ name: "ประกายเขี้ยวปฏิปักษ์ (ทะลุเกราะ)", img: OHGER_FORM, by: attacker.name, color: POSITION_COLORS[attacker.position] || "#888" }, "atk");
  if (shieldBefore > target.shield) addFx({ name: "โล่ป้องกัน (กันความเสียหาย)", img: null, by: target.name, color: POSITION_COLORS[target.position] || "#888" }, "def");
  if ((target.statuses.absorb || 0) > 0 && armorLost > 0) addFx(skillByStatus(target, "absorb"), "def");
  if (beatSaveFired) {
    // maybeBeatSave ใช้ร่วมกันทั้งคุวากาตะ (ประกายเขี้ยวปฏิปักษ์) และทาคุโตะ (ฉันยัง...มองเห็นอยู่!!!) — เลือกชื่อ/ภาพให้ตรงตัวละคร
    const takutoSaveFired = target.characterId === "takuto";
    addFx({ name: takutoSaveFired ? "ฉันยัง...มองเห็นอยู่!!! (กันตาย)" : "ประกายเขี้ยวปฏิปักษ์ (กันตาย)", img: takutoSaveFired ? displayImg(target) : OHGER_FORM, by: target.name, color: POSITION_COLORS[target.position] || "#888" }, "def");
  }
  if ((target.statuses.absorbplus || 0) > 0 && armorLost > 0) addFx(skillByStatus(target, "absorbplus"), "def");
  if (shradeAtk > 0) addFx({ name: `รวมร่างทำนองเพลง +${shradeAtk}`, img: SHRADE_SPADA_IMG, by: attacker.name, color: POSITION_COLORS[attacker.position] || "#888" }, "atk");
  if (shradeDayOff) addFx({ name: "รวมร่างทำนองเพลง (ตอนเช้า — โบนัสโจมตีไม่ทำงาน)", img: SHRADE_SPADA_IMG, by: attacker.name, color: POSITION_COLORS[attacker.position] || "#888" }, "atk");
  // เรียวกิ ชิกิ
  if (knifeAtk) addFx({ name: `มีดพก (ฟื้นเลือด +${knifeHeal})`, img: "/characters/shiki/shiki_skill1.webp", by: attacker.name, color: POSITION_COLORS[attacker.position] || "#888" }, "atk");
  if (deathlineReset) addFx({ name: "เนตรมารแห่งความมรณะ (เส้นชีวิตถูกรีเซ็ต)", img: SHIKI_DEATH_IMG, by: attacker.name, color: POSITION_COLORS[attacker.position] || "#888" }, "atk");
  // Bard: คุ้มครอง / ขัดแย้ง / เชื่อมผล
  if (guardAmt > 0) addFx({ name: `คุ้มครอง (ความเสียหายลด ${guardAmt})`, img: BARD_CRIMSON_IMG, by: target.name, color: POSITION_COLORS[target.position] || "#888" }, "def");
  if (bardDiscord) addFx({ name: "Discord — ขัดแย้ง (+1 ดาเมจ)", img: BARD_JADE_IMG, by: target.name, color: POSITION_COLORS[target.position] || "#888" }, "atk");
  if (linkedHit) addFx({ name: `เชื่อมผล (${linkedHit.name} -${buddyHpBefore - linkedHit.hp})`, img: BARD_JADE_IMG, by: target.name, color: POSITION_COLORS[target.position] || "#888" }, "def");
  // โอกูริ แคป (Rework)
  if (oguriGoldAtk > 0) addFx({ name: `ยุคทอง +${oguriGoldAtk}`, img: displayImg(attacker), by: attacker.name, color: POSITION_COLORS[attacker.position] || "#888" }, "atk");
  if (victoryAtk) addFx({ name: `The Beat of Victory +${OGURI_ULT_ATK_BONUS} (เป้าหมายติดเกินเยียวยา+ชะงัก)`, img: TRANSFORMS.victorybeat.img, by: attacker.name, color: POSITION_COLORS[attacker.position] || "#888" }, "atk");
  if (fullBelly) addFx({ name: "เต็มอิ่ม (ดาเมจ -1)", img: displayImg(target), by: target.name, color: POSITION_COLORS[target.position] || "#888" }, "def");
  // การ์ดแดงครบ 3 ใบตอนเปิดไพ่ (ระบบกองการ์ดกลาง)
  if (cardAtkBonus > 0) addFx({ name: `การ์ดแดงครบ 3 ใบ +${cardAtkBonus}`, img: displayImg(attacker), by: attacker.name, color: POSITION_COLORS[attacker.position] || "#888" }, "atk");
  // สถานะพื้นฐาน patch 2.0.8
  if (mightAtk > 0) addFx({ name: `เสริมพลัง +${mightAtk}`, img: displayImg(attacker), by: attacker.name, color: POSITION_COLORS[attacker.position] || "#888" }, "atk");
  if (weakAtk > 0) addFx({ name: `อ่อนแอ -${weakAtk}`, img: displayImg(attacker), by: attacker.name, color: POSITION_COLORS[attacker.position] || "#888" }, "atk");
  // ยูนะ
  if (yunaLongingAtk > 0) addFx({ name: `Longing (ยูนะ) +${yunaLongingAtk}`, img: YUNA_IMG, by: attacker.name, color: YUNA_COLOR }, "atk");
  if (yunaBeatBark) addFx({ name: "Break Beat Bark! (ยูนะ) +1", img: YUNA_IMG, by: attacker.name, color: YUNA_COLOR }, "atk");
  if (fragileAmt > 0) addFx({ name: `เปราะบาง (+${fragileAmt} ดาเมจ)`, img: displayImg(target), by: target.name, color: POSITION_COLORS[target.position] || "#888" }, "def");
  if (yunaDeleteAmt > 0) addFx({ name: `Delete (ยูนะ) +${yunaDeleteAmt}`, img: YUNA_IMG, by: target.name, color: YUNA_COLOR }, "def");
  if (yunaSmileAmt > 0) addFx({ name: `Smile for You (ยูนะ) -${yunaSmileAmt}`, img: YUNA_IMG, by: target.name, color: YUNA_COLOR }, "def");
  if (shikiWither && witherLines > 0) addFx({ name: `ความตายที่โรยรา — เส้นชีวิตแปรเป็นดาเมจ (สูงสุดรวม ${SHIKI_WITHER_ATK_CAP})`, img: SHIKI_WITHER_IMG, by: attacker.name, color: POSITION_COLORS[attacker.position] || "#888" }, "atk");
  // ริดดี้ มาร์เซนาส (patch 2.0.9)
  if (riddheUltBonus > 0) addFx({
    name: beamPlusAtk && riddheNtdOn ? "Beam Magnum Plus + NT-D (+1 ตีหมู่)" : beamPlusAtk ? "Beam Magnum Plus +1 (ตีหมู่)" : "NT-D System +1",
    img: beamPlusAtk ? "/characters/riddhe/skill2/banshee_skill2.jpg" : RIDDHE_NTD_IMG,
    by: attacker.name, color: POSITION_COLORS[attacker.position] || "#888",
  }, "atk");
  if (riddheP1Atk) addFx({ name: "จะทำให้ฉันหน้าสมเพชอีกนานแค่ไหน +1", img: displayImg(attacker), by: attacker.name, color: POSITION_COLORS[attacker.position] || "#888" }, "atk");
  if (riddheAvAtk) addFx({ name: "อย่าทิ้งฉันไป +1 (ถาวร)", img: RIDDHE_NTD2_IMG, by: attacker.name, color: POSITION_COLORS[attacker.position] || "#888" }, "atk");
  if (riddheTaunted) addFx({ name: "Absorb Shield (ล่อเป้ามาที่ตัวเอง)", img: "/characters/riddhe/skill1/banshee_skill1.webp", by: target.name, color: POSITION_COLORS[target.position] || "#888" }, "def");
  if (phenexTaunted) addFx({ name: "ไม่อยากให้ใครต้องเจ็บปวด (ล่อเป้ามาที่ตัวเอง)", img: PHENEX_NTD_IMG, by: target.name, color: POSITION_COLORS[target.position] || "#888" }, "def");

  // อนิเมชันบอกว่าใครตีใคร
  lastAttack = {
    id: ++attackSeq,
    byName: attacker.name, byImg: displayImg(attacker), byColor: POSITION_COLORS[attacker.position] || "#888",
        byDoomWeapon: attacker.characterId === "doomguy" ? attacker.doomWeapon : undefined, // DoomGuy: อาวุธที่ใช้ยิงตอนนี้ (เสียงยิงฝั่ง client)
        byAttackSound: attacker.characterId === "mageslayer" ? "mageslayer_attack" : undefined, // ผู้สังหารจอมมหาเวทย์: เสียงโจมตีปกติเฉพาะตัว (BA.mp3)
    targetName: target.name, targetImg: displayImg(target), targetColor: POSITION_COLORS[target.position] || "#888",
    dmg, aoe: ginga || beamPlusAtk || unibeam2Atk || storiumAtk, revenge: isRevenge, skills: fxSkills,
    fxMs: (fxSkills.length ? ATTACKFX_TIME + 2 : ATTACKFX_TIME) * 1000,
  };
  const showAttackFx = () => {
    gameState = "ATTACKING";
    // มีข้อมูลสกิลให้อ่าน -> ยืดเวลาอนิเมชันให้อ่านทัน
    // หัวใจฆาตกร (นานายะ ชิกิ): เนตรมารพลาดสังหาร -> เปิดโอกาสโจมตีซ้ำแทนการจบเทิร์นตรงๆ
    startPhaseTimer(fxSkills.length ? ATTACKFX_TIME + 2 : ATTACKFX_TIME, () => runCutsceneQueue(() => postAttackFollowup(attacker)));
    broadcastState();
  };
  // Beam Magnum Plus (ริดดี้ patch 2.1.1) / Beam Magnum + แสงที่ไม่อยู่เพียงลำพัง (บานาจ patch 2.1.2) / ลำแสงสโตเรียม (ฮิคารุ patch 2.1.3)
  //  / อย่าอยู่เลย แกน่ะ! (ริต้า เบอร์นัล patch 2.1.6) / ฉันยัง...มองเห็นอยู่!!! กันตาย + อย่างนายน่ะ จะไปเข้าใจอะไร (สึงาชิ ทาคุโตะ patch 2.2.4):
  //  เล่นวีดีโอที่ค้างคิวก่อน แล้วค่อยขึ้นสรุปความเสียหาย
  //  (ปกติทุกท่าอื่นจะขึ้นสรุปความเสียหายก่อนแล้วค่อยเล่นวีดีโอค้างคิวตอนจบ — ท่าเหล่านี้กลับลำดับเฉพาะตัว)
  if ((beamPlusAtk || (beam && attacker.characterId === "banagher") || unibeam2Atk || storiumAtk || phenexPurgeAtk || miyakoUltAtk || (beatSaveFired && target.characterId === "takuto") || takutoUlt2VideoQueued) && cutsceneQueue.length) runCutsceneQueue(showAttackFx);
  else showAttackFx();
}

// ---- ปิดรอบ ----
function endTurn() {
  clearPhaseTimer();
  attackerId = null;

  // สกิลติดตัว 1 เอวา 13 (ไม่สามารถแก้ไขอะไรได้อีกแล้ว): กำลังจะถูกกำจัดขณะ fourth impact ยังอยู่
  //  -> เช็คก่อนลดเทิร์นสถานะ (ดาเมจถึงตายเกิดตอน fourth ยังไม่หมดอายุ)
  const evaBlasts = Object.values(players).filter(
    (p) => p.alive && p.hp <= 0 && p.characterId === "eva13" && (p.statuses.fourth || 0) > 0
  );

  // แด่เพื่อนรักของฉัน (ชเรด เอลัน): ชาร์จจะครบกำหนดเมื่อจบเทิร์นนี้ (เหลือ 1 ก่อนลดสถานะ)
  //  — เก็บไว้ก่อนลูปลดเทิร์นสถานะ แล้วปลดปล่อยหลังเช็คคนตายรอบแรก (ตายก่อนปลดปล่อย = ไม่ระเบิด)
  const shradeBlasts = Object.values(players).filter(
    (p) => p.alive && p.characterId === "shrade_elan" && (p.statuses.shradecharge || 0) === 1
  );

  // กระชากสายแลน (เจ้าแห่งเน็ตบ้าน): คืนบัฟที่ถูกถอดไว้ชั่วคราว — เทิร์นถัดไปกลับมามีผลต่อ
  //  (คืนก่อนลูปลดเทิร์นสถานะ = บัฟถูกนับเวลาเทิร์นนี้ไปด้วยตามสเปค "นับเทิร์นนี้")
  CHAR_HOOKS.broadband_man.onEndTurnUnplugRestore(engine);

  // ---------- ริดดี้ (characters/riddhe.js): ฉันจะไม่ยอมสูญเสียใครไปอีก — เกราะ (เรา+บานาจ) เสียรวมถึง 3 ระหว่างท่าทำงาน -> ฟื้นเกราะให้ทั้งคู่ +2 ----------
  CHAR_HOOKS.riddhe.onEndTurnGuardArmorTick(engine);

  // หลบหลีก (สถานะ Universal): แต่ละสแตคหมดอายุเองตามเทิร์นของตัวเอง / โชคลาภ (Bard): ไม่ได้ใช้ 3 เทิร์นติดกัน = หมดฤทธิ์
  for (const p of Object.values(players)) {
    tickEvadeStacks(engine, p);
    CHAR_HOOKS.bard.onEndTurnIdleDecay(engine, p);
    // RS-Hopper (characters/eva13.js): ฟื้น 1 ชาร์จทุกๆ 3 เทิร์น (สูงสุด 3)
    if (p.characterId === "eva13") CHAR_HOOKS.eva13.onRoundStartRegen(engine, p);
    // DoomGuy (characters/doomguy.js): Weapon — จบเทิร์น บังคับสลับอาวุธใหม่ทันที — ไม่ทำงานระหว่างถือ Crucible
    CHAR_HOOKS.doomguy.onRoundStartWeaponCycle(engine, p);
  }

  let moonCellEndedBy = null; // MOON*CELL (คิชินามิ ฮาคุโนะ): หมดเวลาแล้ว — คืนบัฟ/ดีบัฟหลังลูปนี้จบ (กันคืนแล้วโดนลดเทิร์นซ้ำในลูปเดียวกัน)
  for (const p of Object.values(players)) {
    for (const k of Object.keys(p.statuses || {})) {
      if (k === "dawn") continue;   // ยามฟ้าสาง (โอเบรอน): สแตคถาวร จนกว่า Vortigern จะล้าง
      if (k === "chill") continue;  // ชิวๆครับน้องๆ (Apple guy): คงอยู่จนกว่าจะถูกโจมตี ไม่ลดเทิร์น
      // โหมงานหนัก (โคโตเนะ patch พิเศษ): คงอยู่ 3 เทิร์นแล้วหมดเอง (หรือลบก่อนด้วย Sleeping time ตอนกลางคืน)
      // ksleep (Sleeping time patch 2.1.3): นับถอยหลังตามปกติ 2 เทิร์นตายตัว — ตื่นเองแล้วรับ [เช้าที่สดใส] (ดูด้านล่าง)
      if (k === "hburn") continue;   // ลุกไหม้ (ฮิคารุ patch 2.1.3): ลดลงเองในตอนต้นเทิร์นหลังสร้างผล (ดูด้านล่าง) ไม่ลดซ้ำที่นี่
      if (k === "melody") continue;  // ท่วงทำนอง (ชเรด เอลัน): สแตคถาวร สะสมจนครบ 5 เพื่อรวมร่าง
      if (k === "star") continue;    // ดวงดาว (สึงาชิ ทาคุโตะ): สแตคถาวร สะสมจนครบ 5 เพื่อฉันคว้ามันได้แล้ว
      if (k === "emeraude" || k === "saphir" || k === "lance") continue; // Star Sword / หอกผู้พิชิต (สึงาชิ ทาคุโตะ): คงอยู่จนกว่าจะได้โจมตี (ไม่ลดเทิร์น)
      if (k === "takutoThirdAtk") continue; // พิชิตแสงดาว (สึงาชิ ทาคุโตะ): คงอยู่จนกว่าจะได้ลุ้นโจมตีครั้งที่ 3 (ไม่ลดเทิร์น)
      if (k === "doomCrucible") continue; // Crucible (ดูมกาย patch 2.2 new): คงอยู่จนกว่าจะได้โจมตี 1 ครั้ง (ไม่ลดเทิร์น)
      if (k === "doomDrain") continue; // [โดนดูด] (ดูมกาย, Plasma Rifle): tickDrain() นับถอยหลัง/ลบเองแล้ว ไม่ให้ลูปนี้ลดซ้ำ
      if (k === "fortune") continue; // โชคลาภ (Bard): คงอยู่จนกว่าจะจั่วไพ่ครั้งถัดไป (หมดอายุเองถ้าไม่ใช้ 3 เทิร์น — ดูด้านบน)
      if (k === "rsHopper") continue; // RS-Hopper (เอวา 13): สแตคชาร์จ ไม่ใช่ตัวนับเทิร์น — ฟื้นเองทุก 3 เทิร์น (ดูด้านบน)
      if (k === "cassius") continue; // หอกแห่งแคสเซียส (เอวา 13): คงอยู่จนกว่าจะได้โจมตี (ไม่ลดเทิร์น)
      if (k === "yaak") continue;    // ย๊ากก! (อาริมะ มิยาโกะ): คงอยู่จนกว่าจะได้โจมตี (ไม่ลดเทิร์น)
      if (k === "spear") continue;   // หอกลองกินัส (เอวา 13 patch 2.2 alpha): คงอยู่จนกว่าจะได้โจมตี (ไม่ลดเทิร์น)
      if (k === "ohger") continue;   // โอเจอร์ชาร์จ (คุวากาตะ patch 2.2 alpha): คงอยู่จนกว่าจะได้โจมตี (ไม่ลดเทิร์น)
      if (k === "evade") continue;   // หลบหลีก (สถานะ Universal): p.statuses.evade เป็นแค่ mirror ของ p.evadeStacks.length — ตัวจริงหมดอายุผ่าน tickEvadeStacks (ดูด้านบน)
      if (k === "empower") continue; // เสริมพลัง (Rejuvenation): คงอยู่จนกว่าจะได้โจมตี (ไม่ซ้อนทับ)
      if (k === "miyakoHeal" || k === "miyakoCombo" || k === "miyakoUlt") continue; // อาริมะ มิยาโกะ: คงอยู่จนกว่าจะได้โจมตี (ไม่ลดเทิร์น) — miyakoUlt เดิมหลุดหายไปเองหลัง 1 เทิร์นถ้ายังไม่ได้โจมตี (บัค)
      if (k === "hakunoInvertReady" || k === "hakunoNoRegenReady") continue; // คิชินามิ ฮาคุโนะ: คงอยู่จนกว่าจะได้โจมตี (ไม่ลดเทิร์น)
      if (k === "kotoneAtk") continue; // โคโตเนะ: คงอยู่จนกว่าจะได้โจมตี (ไม่ลดเทิร์น — เหมือน empower)
      if (k === "deathline") continue; // เส้นตาย (ชิกิ): สแตคถาวร จนกว่าจะถูกชิกิโจมตีปกติระหว่างท่าไม้ตาย
      if (k === "tepeuCook" || k === "tepeuPonder") continue; // เทเปา: ป้ายสถานะแสดงผลเฉยๆ — engine ลบเองตาม tepeuCookTurns/tepeuPonderTurns (ดูด้านล่าง)
      // ---------- ไค ชิซากิ (kai) ----------
      if (k === "kaiCreation" || k === "kaiPunishment") continue; // รังสรรค์/ลงทัณฑ์: มาร์กถาวร ไม่ลดเทิร์น — หายเฉพาะผ่าน Overhaul หรือถูกล้าง
      // ---------- ผู้สังหารจอมมหาเวทย์ (mageslayer) ----------
      if (k === "mageslayerMark") continue; // ตราล่าเวท: ถาวรจนกว่าจะย้าย/ถูกล้าง
      if (k === "mageslayerFury") continue; // Fury: สแตคพลังโกรธ ไม่ใช่ตัวนับเทิร์น — ใช้หมดพร้อมกันตอนโจมตี
      // ---------- โอกูริ แคป (patch 2.0.8.1) ----------
      if (k === "graybeast") continue;  // ร่าง Zone: ถาวรจนกว่าจะเข้าร่างหมดแรง
      // burnout (ร่างหมดแรง): เดิมถูกยกเว้นไม่ลดเทิร์นตรงนี้ แต่ไม่มีจุดไหนในโค้ดเคลียร์ทิ้งเองเลย (ไม่มี delete p.statuses.burnout ที่ไหนทั้งไฟล์)
      //  ผลคือติดแล้วค้างถาวรทั้งแมตช์ ทั้งที่ตั้งใจให้เป็นดีบัฟ 2 เทิร์นตายตัว (ดู OGURI_BURNOUT_TURNS, characters/oguri.js) — เอาข้อยกเว้นออก ให้ลดเทิร์นตามปกติ
      if (k === "grit") continue;       // เวลากัดฟันทน: สแตค หายเมื่อฝึกฝนสำเร็จ
      if (k === "healthfull") continue; // Healthfull: สแตค ใช้ลบ Overweight เมื่อครบ 2
      if (k === "overweight") continue; // Overweight: คงอยู่จนกว่าจะถูกลบด้วย Healthfull
      // หลับไหล: เทิร์นที่เพิ่งโดนกล่อม ยังไม่เริ่มนับ (เริ่มหลับจริงเทิร์นถัดไป ครบตามจำนวนยามฟ้าสาง)
      if (k === "sleep" && p.sleepFresh) { p.sleepFresh = false; continue; }
      p.statuses[k]--;
      if (p.statuses[k] <= 0) {
        delete p.statuses[k];
        if (p.statusAmt) delete p.statusAmt[k]; // ล้างจำนวน (amount) ของสถานะพื้นฐานที่หมดอายุ (patch 2.0.8)
        // มิติมายาบรรเลงสิ้นสุด (Bard, characters/bard.js): รีเซ็ตท่อนทำนองทั้งหมด — ฉากหลัง/เพลงกลับสู่ปกติ
        if ((k === "bloodDim" || k === "soulDim") && p.characterId === "bard") {
          CHAR_HOOKS.bard.onDimExpire(engine, p);
        }
        // เชื่อมผลจบลง (Resonance): ตัดลิงก์ทั้งสองฝั่ง
        if (k === "linked") p.linkedWith = null;
        // ไค ชิซากิ: เชื่อมต่อ/คู่ปรับ หมดอายุ -> ล้าง mirror ทั้งสองฝั่ง (โค้ดแยกจาก Resonance ของ Bard)
        if (k === "kaiLink") CHAR_HOOKS.kai.onExpireKaiLink(p);
        if (k === "kaiRival1" || k === "kaiRival2") CHAR_HOOKS.kai.onExpireKaiRival(p);
        // ผู้สังหารจอมมหาเวทย์: ภาระเวทหมดอายุตามธรรมชาติ -> ล้างล็อก Mana Burden (ถ้ามี)
        if (k === "spellburden") delete p.mageslayerLockedBurden;
        // ทาคุมิ ฟุจิวาระ: ถึงจะมองไม่เห็น แต่ฉันยังอยู่ หมดเวลาเองตามธรรมชาติ (ไม่มีใครไพ่แตกใน 5 เทิร์น) -> รีเซ็ต guard ให้ใช้ท่าไม้ตายรอบหน้าได้ปกติ
        if (k === "takumiBlackout") {
          p.takumiBlackoutFired = false;
          lastLog.push(`🌑 ${p.name} ถึงจะมองไม่เห็น แต่ฉันยังอยู่ หมดเวลาเอง — กลับมามองเห็นกันได้ตามปกติ`);
        }
        // ไม่อยากให้ใครต้องเจ็บปวด (ริต้า เบอร์นัล patch 2.1.7): หมดเวลาพอดีเทิร์นนี้ — ยังนับว่า "ตายขณะท่าไม้ตายทำงาน"
        //  ต่อไปอีก 1 จังหวะจบเทิร์น เผื่อตายจากผลติกท้ายเทิร์นเดียวกัน (ล้างค่านี้ทิ้งตอนเริ่มเทิร์นถัดไปใน dealRound)
        if (k === "phenexTaunt") p.phenexTauntGrace = true;
        // Sleeping time หมดเวลาเอง (โคโตเนะ patch 2.1.3): ตื่นนอนอย่างสดชื่น รับ [เช้าที่สดใส] 3 เทิร์น
        if (k === "ksleep" && p.characterId === "kotone") {
          CHAR_HOOKS.kotone.onSleepExpire(p);
          lastLog.push(`🌅 ${p.name} ตื่นนอนอย่างสดชื่น — ได้รับ [เช้าที่สดใส] 3 เทิร์น (แต้มสกิล +1 และโล่ +1 ทุกเทิร์น)`);
        }
        // ความตายที่โรยราหมดเวลา (ชิกิ patch 2.0.6.1): ลบเส้นชีวิตส่วนที่ท่าไม้ตายแจกไปออกจากทุกคน
        if (k === "wither" && p.characterId === "shiki") {
          clearWitherLines();
          lastLog.push(`🥀 ${p.name} ความตายที่โรยราหมดเวลา — เส้นชีวิตที่สะสมช่วงท่าไม้ตายถูกลบออกให้ทุกคน`);
        }
        // MOON*CELL หมดเวลา (คิชินามิ ฮาคุโนะ patch 2.2.1): คืนบัฟ/ดีบัฟที่ล้างไว้ทั้งหมด หลังลูปนี้จบ (ดูด้านล่าง)
        if (k === "moonCell" && p.characterId === "hakuno") moonCellEndedBy = p;
        // ฉันคว้ามันได้แล้ว หมดเวลา (สึงาชิ ทาคุโตะ patch 2.2.3): กลับเป็นทาคุโตะปกติ — ล้างดาบที่ค้างอยู่ ต้องเก็บดวงดาวใหม่ให้ครบ 5 อีกครั้ง
        if (k === "apprivoise" && p.characterId === "takuto") {
          delete p.statuses.emeraude;
          delete p.statuses.saphir;
          delete p.statuses.lance;
          delete p.statuses.takutoThirdAtk;
          p.takutoComboReady = false;
          p.takutoUlt2VideoPending = false;
          lastLog.push(`🌠 ${p.name} ฉันคว้ามันได้แล้วหมดเวลา — กลับเป็นทาคุโตะปกติ ต้องเก็บดวงดาวให้ครบ ${TAKUTO_STAR_NEED} อีกครั้งเพื่อแปลงร่าง`);
        }
      }
    }
    for (const k of Object.keys(p.seen || {})) {
      if (k === "ntd" || k === "beat" || k === "eva3") continue; // NT-D คงอยู่จนแก้แค้น / Beat Mode ถาวร / eva3 เปิดปิดตามเลือด
      if (k === "banagherPassive2") continue; // บานาจ (patch 2.1.2): เป้าแก้แค้นพิเศษใส่ริดดี้ คงอยู่จนแก้แค้นสำเร็จ (ไม่ผูกกับ p.statuses)
      if (!(p.statuses[k] > 0)) delete p.seen[k];
    }
    // เลือดชั่วคราว (แกมเบลอร์): หายเองเมื่อครบ 2 เทิร์น
    if ((p.tempHp || 0) > 0) {
      p.tempHpTurns--;
      if (p.tempHpTurns <= 0) { p.tempHp = 0; p.tempHpTurns = 0; }
    }
    // [โหมงานหนัก] (โคโตเนะ patch 2.2.2): โล่พังและฟื้นไม่ได้ — ล้างโล่ที่ได้มาระหว่างเทิร์นทิ้ง (เดิมเป็นเกราะ)
    CHAR_HOOKS.kotone.onEndTurnOverworkShieldWipe(p);
    p.armor = Math.min(p.armor, maxArmorOf(p)); // กันเกราะเกินเพดาน
  }
  // MOON*CELL หมดเวลา (คิชินามิ ฮาคุโนะ): คืนบัฟ/ดีบัฟที่ล้างไว้ทั้งหมดให้ทุกคน (ยกเว้นตัวเอง) + ติดไร้ทางเยียวยา 3 เทิร์น
  //  ทำหลังลูปลดเทิร์นสถานะทั้งหมดจบแล้ว กันไม่ให้สถานะที่เพิ่งคืนกลับมาโดนลดเทิร์นซ้ำในเทิร์นเดียวกัน
  if (moonCellEndedBy) {
    for (const o of Object.values(players)) {
      if (o.id === moonCellEndedBy.id) continue;
      if (o.moonCellBackup) {
        o.statuses = { ...o.moonCellBackup.statuses };
        o.statusAmt = { ...o.moonCellBackup.statusAmt };
        delete o.moonCellBackup;
      }
      if (o.alive && !resistActive(o)) o.statuses.nohealing = Math.max(o.statuses.nohealing || 0, HAKUNO_NORECOVER_TURNS);
    }
    lastLog.push(`🌙 ${moonCellEndedBy.name} คำสาปแห่งดวงจันทร์ MOON*CELL สิ้นสุดลง — คืนบัฟ/ดีบัฟที่ถูกล้างไว้ทั้งหมด และทุกคน (ยกเว้น ${moonCellEndedBy.name}) ติดสถานะ "ไร้ทางเยียวยา" ${HAKUNO_NORECOVER_TURNS} เทิร์น`);
  }

  // จบเทิร์นรอบนั้น +1 — ช่วงกลางวันได้แต้มสกิลเพิ่มอีก +1 (ระบบกลางวัน/กลางคืน)
  const dayBonus = morningBonusActive(roundNumber); // patch 2.1.7: แจกเฉพาะเช้าที่ 2, 4, 6, ...
  for (const p of alivePlayers()) {
    let gain = dayBonus ? 2 : 1;
    // ซาโตรุ อาเคฟุ (patch 2.0.8.2): สกิลติดตัว — รีเจนแต้มสกิลเพิ่ม +1 ทุกเทิร์น (ปิดได้ เช่น MOON*CELL)
    if (p.characterId === "satoru" && !passiveSealed(p)) gain += 1;
    // คิชินามิ ฮาคุโนะ (patch 2.2.1): ร่างหญิง — แต้มสกิลฟื้นเพิ่ม +1 ทุกเทิร์น
    if (p.characterId === "hakuno" && p.hakunoGender === "female") gain += 1;
    // ค่าปรับปฏิเสธข้อเสนอ (เจ้าแห่งเน็ตบ้าน): แต้มสกิลหลังจบเทิร์นลด 1
    if ((p.skillDrain || 0) > 0) {
      gain = Math.max(0, gain - 1);
      p.skillDrain--;
      lastLog.push(`📵 ${p.name} ค่าปรับปฏิเสธข้อเสนอ — แต้มสกิลจบเทิร์นลด 1${p.skillDrain > 0 ? ` (เหลืออีก ${p.skillDrain} เทิร์น)` : ""}`);
    }
    addSkill(p, gain);
  }
  if (dayBonus) lastLog.push("☀️ จบเทิร์นช่วงกลางวัน — ทุกคนได้แต้มสกิลเพิ่ม +1");
  // ระบบเหรียญ (patch 2.2 full): จบเทิร์น +1 เหรียญให้ทุกคน (เพดาน 30 — เต็มแล้วไม่ได้เพิ่มจน spending ลดลง)
  for (const p of alivePlayers()) {
    if ((p.gold || 0) < GOLD_MAX) p.gold = Math.min(GOLD_MAX, (p.gold || 0) + GOLD_PER_TURN);
  }

  // ชิวๆครับน้องๆ (Apple guy): จบเทิร์นได้แต้มสกิลเพิ่ม +1 จนกว่าจะถูกโจมตี
  for (const p of alivePlayers()) {
    if ((p.statuses.chill || 0) > 0) {
      addSkill(p, 1);
      lastLog.push(`🏖️ ${p.name} ชิวๆครับน้องๆ — จบเทิร์นได้แต้มสกิลเพิ่ม +1`);
    }
  }

  // เทเปา (characters/tepeu.js): ครุ่นคิด (+แต้มสกิล) / ทำอาหาร (ส่ง "มื้อที่สุข" เข้าคลังเมื่อครบ) / ฉากหลังท่าไม้ตายนับถอยหลัง
  CHAR_HOOKS.tepeu.onTurnEndTick(engine);

  for (const p of Object.values(players)) {
    if (p.alive && p.hp <= 0) {
      // patch 2.1.6.3: เรียกผ่าน instantDeath() แทนการตั้ง alive=false ตรงๆ — กันบั๊กริต้าไม่เกิดใหม่
      //  (จุดนี้เคย bypass สกิลติดตัว 1 ริต้า เบอร์นัล เพราะไม่ได้เรียก instantDeath ที่มีตรรกะเกิดใหม่)
      instantDeath(p);
      if (!p.alive) lastLog.push(`💀 ${p.name} เลือดจริงหมด ตกรอบ!`);
    }
  }
  // ระเบิด fourth impact: เอวา 13 ตายขณะสถานะยังอยู่ -> ทุกคนในสนามรับ 5 หน่วย (เกราะก่อนแล้วเลือด)
  if (evaBlasts.length) {
    for (const e of evaBlasts) {
      lastLog.push(`💥 ${e.name} ไม่สามารถแก้ไขอะไรได้อีกแล้ว — ทุกสิ่งทุกอย่างไร้ความหมาย! ระเบิดใส่ทุกคน -${EVA_BLAST_DMG}`);
      for (const o of alivePlayers()) {
        if (o.id === e.id) continue;
        if (!evaBlastEvade(o, e)) dealMixed(o, EVA_BLAST_DMG);
        maybeBeatSave(o);
        maybeBeatMode(o);
        maybeEva3(o);
        o.wasAttacked = true;
      }
      triggerCutscene(e, "evaboom");
    }
    // เช็คคนตายจากแรงระเบิดอีกรอบ
    for (const p of Object.values(players)) {
      if (p.alive && p.hp <= 0) {
        instantDeath(p);
        if (!p.alive) lastLog.push(`💀 ${p.name} เลือดจริงหมด ตกรอบ!`);
      }
    }
  }
  // แด่เพื่อนรักของฉัน (ชเรด เอลัน): ครบ 3 เทิร์น — เล่นวีดีโอสุดท้าย แล้วระเบิดใส่ทุกคนบนสนาม 8 หน่วย
  //  จากนั้นชเรดจบชีวิตลงตามไป — หากทุกคนตายเพราะท่านี้หมดก่อน ชเรดถือว่าเป็นผู้ชนะ (ไม่ตายตาม)
  for (const s of shradeBlasts) {
    if (!s.alive) continue; // ตายไปก่อนจะได้ปลดปล่อย = ท่าไม้ตายไม่ระเบิด
    lastLog.push(`🎻💥 ${s.name} แด่เพื่อนรักของฉัน — บทเพลงบรรเลงจบ! ระเบิดใส่ทุกคนบนสนาม -${SHRADE_BLAST_DMG}`);
    triggerCutscene(s, "shradeBlast");
    for (const o of alivePlayers()) {
      if (o.id === s.id) continue;
      dealMixed(o, SHRADE_BLAST_DMG);
      maybeBeatSave(o);
      maybeBeatMode(o);
      maybeEva3(o);
      maybeWakeKotone(o);
      o.wasAttacked = true;
    }
    // คนที่โดนบทเพลงจนเลือดหมด ตกรอบทันที
    for (const o of Object.values(players)) {
      if (o.alive && o.hp <= 0) {
        instantDeath(o);
        if (!o.alive) lastLog.push(`💀 ${o.name} เลือดจริงหมด ตกรอบ!`);
      }
    }
    const othersLeft = alivePlayers().filter((o) => o.id !== s.id);
    if (othersLeft.length === 0) {
      lastLog.push(`👑 ${s.name} บทเพลงกวาดล้างทุกคนบนสนาม — ชเรดคือผู้ชนะ!`);
    } else if (s.alive) {
      instantDeath(s);
      if (!s.alive) lastLog.push(`🎻 ${s.name} จบชีวิตลงพร้อมบทเพลงสุดท้าย... ลาก่อนเพื่อนรัก`);
    }
  }
  // ---------- ริดดี้ (characters/riddhe.js): สกิลติดตัว 3 อย่าทิ้งฉันไป (บานาจพันธมิตรตาย) / พันธมิตร-ข้อเสนอที่หลุดเกม -> ล้างทิ้ง ----------
  CHAR_HOOKS.riddhe.onEndTurnAvengerSweep(engine);
  CHAR_HOOKS.riddhe.onEndTurnOrphanCleanup(engine);

  // ถ้าเป้าแก้แค้นตาย/หายไป -> NT-D สงบ
  for (const p of Object.values(players)) {
    if (p.ntdTarget && (!players[p.ntdTarget] || !players[p.ntdTarget].alive)) {
      p.ntdTarget = null;
      delete p.seen.ntd;
    }
  }
  // บานาจ (characters/banagher.js): เป้าแก้แค้นพิเศษ (สกิลติดตัว 2) ตาย/หายไป/กลายเป็นพันธมิตร -> สงบลง
  CHAR_HOOKS.banagher.onEndTurnRivalCleanup(engine);
  // ริดดี้ (characters/riddhe.js): ที่ได้ NT-D System ไปฟรีจาก NewType Paradise — หมดพร้อมกัน (เว้นแต่กดแยกเองแล้ว)
  CHAR_HOOKS.riddhe.onEndTurnNtdLinkExpiry(engine);
  // บานาจ (patch 2.1.2): Absorb shield หมดผล -> ตัดการผูกเจ้าของสกิล
  for (const p of Object.values(players)) {
    if (p.bshieldOwnerId && !((p.statuses.bshield || 0) > 0)) p.bshieldOwnerId = null;
  }
  // สัญญา (เจ้าแห่งเน็ตบ้าน): ฝ่ายใดฝ่ายหนึ่งตาย/หายไป -> สัญญาสิ้นสุด รอทำใหม่ได้
  for (const p of Object.values(players)) {
    if (p.contractPartner) {
      const t = players[p.contractPartner];
      if (!p.alive || !t || !t.alive || t.contractWith !== p.id) {
        if (t && t.contractWith === p.id) { t.contractWith = null; t.renewPending = false; }
        p.contractPartner = null;
        p.contractTurns = 0;
        if (p.alive || (t && t.alive)) lastLog.push(`📴 สัญญาของ ${p.name} สิ้นสุดลง`);
      }
    }
    if (p.contractOffer && (!p.alive || !players[p.contractOffer] || !players[p.contractOffer].alive)) p.contractOffer = null;
    if (p.contractWith && (!players[p.contractWith] || !players[p.contractWith].alive)) { p.contractWith = null; p.renewPending = false; }
    // Locacaca fruit (ซาโตรุ): ฝ่ายใดฝ่ายหนึ่งตาย -> ข้อเสนอตกไป
    if (p.locaOffer && (!p.alive || !players[p.locaOffer] || !players[p.locaOffer].alive)) p.locaOffer = null;
  }

  // ยูนะ (เพลง Longing): มีคนตายรอฟื้นอยู่ไหม — ฉากโจมตี(ถ้ามี)จบไปแล้วตอนนี้แน่นอน ค่อยฟื้นคืนชีพ+คิววีดีโอตอนนี้
  //  ให้ทันเข้าคิวก่อน runCutsceneQueue ด้านล่างจะดึงไปเล่น (วีดีโอเล่นจบ -> เพลงล็อกเริ่มพร้อมเทิร์นถัดไปทันที)
  if (yunaLongingPendingId) {
    const revived = players[yunaLongingPendingId];
    yunaLongingPendingId = null;
    if (revived) YunaMod.reviveWithLonging(engine, revived);
  }
  // เล่นฉากระเบิด/ยูนะ (ถ้ามี) ให้จบก่อน แล้วค่อยสรุปจบเกม/ขึ้นรอบถัดไป
  runCutsceneQueue(() => {
    const stillAlive = alivePlayers();
    const total = Object.keys(players).length;

    // สกิลติดตัว 2 ริดดี้ (characters/riddhe.js): เหลือแค่คู่พันธมิตรบันชี × ยูนิคอร์นบนสนาม -> ถามจะคงพันธมิตรจนจบเกมไหม
    CHAR_HOOKS.riddhe.maybeAskFinalAlliance(engine, stillAlive);

    if (total >= 2 && stillAlive.length <= 1) {
      if (stillAlive.length === 1) lastLog.push(`🏆 ${stillAlive[0].name} คือผู้ชนะคนสุดท้าย!`);
      else lastLog.push("ไม่มีผู้รอด — เสมอ");
      gameState = "GAMEOVER";
      timeLeft = 0;
      broadcastState();
    } else {
      gameState = "TRANSITION";
      startPhaseTimer(TRANSITION_TIME, dealRound);
      broadcastState();
    }
  });
}

function backToLobby() {
  gameState = "LOBBY";
  clearPhaseTimer();
  timeLeft = 0;
  attackerId = null;
  roundWinnerId = null;
  roundNumber = 0;
  allyWinFlag = false;
  cycleShift = 0;
  nightResetPending = false;
  oberonDevour = 0;
  dayForceUntil = 0;
  yunaLongingUsed = false; yunaWindowEnd = 0; yunaEffect = null; yunaTargetId = null; yunaMusicSeq = 0; yunaLongingPendingId = null; yunaPity = 0;
  kaiOverhaulSlots = []; // ไค ชิซากิ: ล้าง tracker Overhaul เมื่อกลับล็อบบี้
  lastLog = [];
  cutsceneQueue = [];
  cutsceneInfo = null;
  for (const p of Object.values(players)) {
    p.cards = []; p.locked = false; p.busted = false; p.result = null;
    resetRoundDisplay(p);
    resetCombat(p);
    if (!p.connected) scheduleDisconnectedRemoval(p.id);
  }
  broadcastState();
}


// ============================================================
//  Socket.io
// ============================================================
function consumeEventQuota(socket, event, limit, windowMs = 1000) {
  const now = Date.now();
  const rates = socket.data.eventRates || (socket.data.eventRates = new Map());
  let bucket = rates.get(event);
  if (!bucket || now - bucket.startedAt >= windowMs) {
    bucket = { startedAt: now, count: 0 };
    rates.set(event, bucket);
  }
  bucket.count++;
  if (bucket.count <= limit) return true;
  if (bucket.count === limit + 1) socket.emit('rateLimited', { event });
  return false;
}

function playerIdFor(socket) {
  const id = socketPlayerIds.get(socket.id);
  const p = id && players[id];
  return p && p.socketId === socket.id ? id : null;
}

function bindPlayerSocket(socket, playerId) {
  const p = players[playerId];
  if (!p) return false;
  const timer = disconnectTimers.get(playerId);
  if (timer) clearTimeout(timer);
  disconnectTimers.delete(playerId);
  p.connected = true;
  p.socketId = socket.id;
  socketPlayerIds.set(socket.id, playerId);
  socket.join(playerId);
  return true;
}

function forgetPlayerSession(p) {
  if (p && p.sessionToken) sessions.delete(p.sessionToken);
}

function scheduleDisconnectedRemoval(playerId) {
  const oldTimer = disconnectTimers.get(playerId);
  if (oldTimer) clearTimeout(oldTimer);
  disconnectTimers.set(playerId, setTimeout(() => removeDisconnectedPlayer(playerId), RECONNECT_GRACE_MS));
}

function removeDisconnectedPlayer(playerId) {
  const p = players[playerId];
  if (!p || p.connected) return;
  const wasAttacker = attackerId === playerId;
  const wasLobby = gameState === 'LOBBY';
  forgetPlayerSession(p);
  delete players[playerId];
  disconnectTimers.delete(playerId);

  if (Object.keys(players).length === 0) {
    gameState = 'LOBBY';
    clearPhaseTimer();
    attackerId = null;
    broadcastPositions();
    return;
  }
  if (wasLobby) for (const o of Object.values(players)) o.ready = false;
  if (gameState === 'ATTACK' && wasAttacker) endTurn();
  else if (gameState === 'PLAYING') { checkAllLocked(); broadcastState(); }
  else broadcastState();
  broadcastPositions();
}

// ห่อ handler ของ socket event ด้วย try/catch — payload ผิดรูปแบบ/บั๊กในโค้ดตัวละครจุดเดียว
//  ไม่ควรทำให้ process ทั้งตัว crash (ตัดผู้เล่นทุกคนออกจากเกมพร้อมกัน) แค่ event นั้นไม่ทำงานพอ
function safeOn(socket, event, handler) {
  socket.on(event, (...args) => {
    try {
      handler(...args);
    } catch (err) {
      console.error(`[socket:${event}] handler เกิดข้อผิดพลาด (ไม่กระทบผู้เล่นคนอื่น):`, err);
    }
  });
}

function onPlayerEvent(socket, event, handler, limit = 20) {
  safeOn(socket, event, (payload) => {
    if (!consumeEventQuota(socket, event, limit)) return;
    const playerId = playerIdFor(socket);
    if (!playerId) return;
    handler(playerId, payload);
  });
}

io.on('connection', (socket) => {
  socket.emit("roster", publicRoster());
  socket.emit("positions", positionsFor(socket.id));

  safeOn(socket, 'reconnectSession', ({ sessionToken } = {}) => {
    if (!consumeEventQuota(socket, 'reconnectSession', 3, 10_000)) return;
    if (typeof sessionToken !== 'string' || sessionToken.length > 128) return;
    const playerId = sessions.get(sessionToken);
    const p = playerId && players[playerId];
    if (!p || p.sessionToken !== sessionToken) { socket.emit('sessionExpired'); return; }
    if (p.connected && p.socketId !== socket.id && io.sockets.sockets.has(p.socketId)) {
      socket.emit('sessionInUse');
      return;
    }
    if (!bindPlayerSocket(socket, playerId)) { socket.emit('sessionExpired'); return; }
    socket.emit('reconnected', { sessionToken });
    broadcastState();
    broadcastPositions();
  });

  safeOn(socket, "reserve", ({ position } = {}) => {
    if (!consumeEventQuota(socket, 'reserve', 8, 10_000) || playerIdFor(socket)) return;
    const pos = Number(position);
    if (!pos) { releaseReservation(socket.id); broadcastPositions(); return; }
    if (pos < 1 || pos > 6 || positionUsedByOther(pos, socket.id)) return;
    reservePosition(socket.id, pos);
    broadcastPositions();
  });

  safeOn(socket, "join", ({ name, position, characterId, shikiUlt } = {}) => {
    if (!consumeEventQuota(socket, 'join', 3, 10_000) || playerIdFor(socket)) return;
    if (Object.keys(players).length >= MAX_PLAYERS) { socket.emit("full"); return; }
    if (gameState !== "LOBBY") { socket.emit("inProgress"); return; }
    const pos = Number(position);
    if (!pos || pos < 1 || pos > 6 || positionUsedByOther(pos, socket.id)) { socket.emit("positionTaken"); return; }
    releaseReservation(socket.id);
    let ch = CHAR_BY_ID[characterId];
    if (!ch || ch.locked) ch = CHARACTERS.find((c) => !c.locked) || CHARACTERS[0];

    const playerId = crypto.randomUUID();
    const sessionToken = crypto.randomBytes(32).toString('base64url');
    players[playerId] = {
      id: playerId,
      sessionToken,
      socketId: socket.id,
      connected: true,
      ready: false, // ห้องรอ: ต้องกดพร้อมก่อนเกมถึงจะเริ่มได้ (ครบทุกคน = เริ่มอัตโนมัติ)
      name: (name || "ผู้เล่น").toString().slice(0, 12),
      position: pos, characterId: ch.id, avatar: ch.avatar, img: ch.img,
      cards: [], locked: false, busted: false, result: null,
      hp: MAX_HP, armor: ch.id === "eva13" ? 0 : MAX_ARMOR, skillPoints: 0, alive: true, shield: 0,
      statuses: ch.id === "eva13" ? { rsHopper: EVA13_RSHOPPER_MAX } : {}, statusAmt: {},
      seen: {}, ntdTarget: null, transformAt: 0, cutsceneShown: {},
      armorLocked: false, beatSaved: false, skillUsedRound: false,
      beamAmmo: BEAM_AMMO, puddingCount: 0, rsHopperRegenTimer: 0,
      gold: 0, inventory: [],
      doomWeapon: ch.id === "doomguy" ? DOOM_STARTING_WEAPON : null, doomQuickSwapUsed: false, doomCharge: 0,
      doomChaingunShieldUsed: false,
      takumiGear: 1, takumiSkillUsesRound: 0, takumiBlackoutFired: false,
      takutoComboReady: false, takutoUlt2VideoPending: false, takutoAwakenAt: 0,
      tonkatsu: 0, songAtk: 0, noDrawNext: 0, anataTargets: null,
      gamblerUses: GAMBLER_USES, profit: 0, tempHp: 0, tempHpTurns: 0, noSkillNext: 0,
      sunriseDrop: 0, sleepFresh: false,
      appleItem: "drink", appleAtkBuffs: [], chillDodge: 100, appleGiveUses: CHAR_HOOKS.appleguy.GIVE_USES,
      tepeuCookTurns: 0, tepeuPonderTurns: 0, tepeuEyeTurns: 0, tepeuLoseStreak: 0, tepeuKillTargetId: null,
      coins: 0, nightWork: 0, overworkNext: false, senaNext: false,
      contractPartner: null, contractWith: null, contractOffer: null,
      contractTurns: 0, renewPending: false, skillDrain: 0, skillDrainPending: 0,
      healNextTurn: 0, unplugHold: null,
      shradeForm: false,
      bardNotes: [], bardNotesUsed: 0, bardPending: null,
      bloodSection: 0, soulSection: 0, linkedWith: null,
      kaiLinkWith: null, kaiRivalId: null,
      mageslayerMarkedId: null, mageslayerHasMarked: false, mageslayerRuptureTargetId: null, mageslayerLockedBurden: false,
      shikiUlt: shikiUlt === "wither" ? "wither" : "deatheye", witherAdded: 0,
      oguriEnergy: OGURI_ENERGY_START, stamina: 0, oguriChargeCapBonus: 0, oguriZoneTurns: 0, staggerNext: 0,
      maxHpPenalty: 0, wouGuardCd: 0, calamityDraw: 0, locaOffer: null,
      allyPrompt: false, allyOffer: null, allyId: null, allyBreakAsk: null, allyFinalAsk: false,
      riddheGrudge: 0, riddhePassiveUsed: false, riddheAvenger: false,
      riddheGuardArmorLost: 0, riddheGuardHealed: false, riddheSaveLoggedRound: 0,
      dmgHp: 0, dmgArmor: 0, gainedSkill: 0,
      wasAttacked: false, isWinner: false, isLoser: false,
      phenexPain: 0, phenexReborn: false, phenexNtdPermanent: false, phenexLastHitBy: null,
      tohnoLevel: 1,
    };
    sessions.set(sessionToken, playerId);
    bindPlayerSocket(socket, playerId);
    socket.emit('joined', { sessionToken });
    broadcastState();
    broadcastPositions();
  });

  onPlayerEvent(socket, 'startGame', () => {
    // This button is for solo testing; multiplayer starts only after everyone is ready.
    if (gameState === 'LOBBY' && Object.keys(players).length === 1) startMatch();
  }, 2);
  // ห้องรอ: กดพร้อม/ยกเลิกพร้อม — ครบทุกคน (อย่างน้อย 2 คน) เริ่มเกมอัตโนมัติ
  onPlayerEvent(socket, 'toggleReady', (playerId) => {
    if (gameState !== "LOBBY") return;
    const p = players[playerId];
    if (!p) return;
    p.ready = !p.ready;
    broadcastState();
    checkLobbyReady();
  });

  onPlayerEvent(socket, 'hit', (id) => hit(id), 8);
  onPlayerEvent(socket, 'lock', (id) => lock(id), 4);
  onPlayerEvent(socket, 'useSkill', (id, { tier, targets, item } = {}) => useSkill(id, tier, targets, item), 12);
  onPlayerEvent(socket, 'buyShopItem', (id, { itemId } = {}) => buyShopItem(id, itemId), 8);
  onPlayerEvent(socket, 'useInventoryItem', (id, { uid, cardIndex, color } = {}) => useInventoryItem(id, uid, { cardIndex, color }), 8);
  onPlayerEvent(socket, 'hakunoCommandSpell', (id, { command } = {}) => hakunoCommandSpell(id, command), 6);
  onPlayerEvent(socket, 'locaAnswer', (id, { accept } = {}) => answerLoca(id, !!accept), 4);
  onPlayerEvent(socket, 'riddheAlly', (id, { targetId } = {}) => riddheChooseAlly(id, targetId), 4);
  // ริต้า เบอร์นัล: ขอแค่ได้พบกันอีก — เลือกเป้าหมายปลดปล่อยความเจ็บปวด (ใช้ได้แม้ตกรอบไปแล้ว)
  onPlayerEvent(socket, 'phenexRelease', (playerId, { targetId } = {}) => {
    const p = players[playerId];
    if (!p || !p.phenexReleaseAsk) return;
    const ask = p.phenexReleaseAsk;
    p.phenexReleaseAsk = null;
    const options = ask.options.map((id) => players[id]).filter((o) => o && o.alive);
    const target = options.find((o) => o.id === targetId) || null;
    CHAR_HOOKS.phenex.resolveRelease(engine, p, target, ask.pain);
    // คำตอบนี้มาแบบ async นอกรอบ resolveRound ปกติ (ตอบช้ากว่ารอบที่ตายจริงก็ได้ — "ใช้ได้แม้ตกรอบไปแล้ว/ทุกเฟส")
    //  ต้องเล่นวีดีโอที่ค้างคิว (ถ้ามี) โดยไม่ทำลาย gameState/ตัวจับเวลาของเฟสที่กำลังทำงานอยู่ตอนนี้
    //  (บั๊กเดิม: เรียก runCutsceneQueue(() => broadcastState()) ตรงๆ ทำให้ gameState ค้างที่ "CUTSCENE"
    //   แบบไม่มีตัวจับเวลาใดๆ ทำงานต่อ — เกมค้างถาวรถ้าคำตอบมาถึงตอนไม่ใช่เฟส PLAYING พอดี)
    if (cutsceneQueue.length) {
      const resumeState = gameState;
      const resumeSeconds = Math.max(3, timeLeft);
      const resumeOnExpire = currentPhaseOnExpire;
      runCutsceneQueue(() => {
        gameState = resumeState;
        if (resumeOnExpire) startPhaseTimer(resumeSeconds, resumeOnExpire);
        broadcastState();
      });
    } else {
      broadcastState();
    }
  });
  onPlayerEvent(socket, 'allyAnswer', (id, { accept } = {}) => answerAllyOffer(id, !!accept), 4);
  onPlayerEvent(socket, 'allyBreakAnswer', (id, { cancel } = {}) => answerAllyBreak(id, !!cancel), 4);
  onPlayerEvent(socket, 'allyFinalAnswer', (id, { keep } = {}) => answerAllyFinal(id, !!keep), 4);
  onPlayerEvent(socket, 'bardTarget', (id, { targets } = {}) => bardTarget(id, targets), 8);
  onPlayerEvent(socket, 'kaiOverhaul', (id) => kaiOverhaul(id), 4);
  onPlayerEvent(socket, 'contractAnswer', (id, { accept } = {}) => answerContract(id, !!accept), 4);
  onPlayerEvent(socket, 'attack', (id, { targetId } = {}) => doAttack(id, targetId), 6);
  onPlayerEvent(socket, 'nanayaToggleEye', (id) => nanayaToggleEye(id), 4);
  onPlayerEvent(socket, 'nanayaCancelReattack', (id) => nanayaCancelReattack(id), 4);
  onPlayerEvent(socket, 'backToLobby', () => { if (gameState === 'GAMEOVER') backToLobby(); }, 2);

  safeOn(socket, "leave", () => {
    if (!consumeEventQuota(socket, 'leave', 2, 10_000)) return;
    if (gameState !== "LOBBY") return;
    const playerId = playerIdFor(socket);
    const p = playerId && players[playerId];
    if (!p) return;
    reservePosition(socket.id, p.position);
    forgetPlayerSession(p);
    delete players[playerId];
    socketPlayerIds.delete(socket.id);
    // มีคนออกจากห้องรอ -> สถานะพร้อมของคนที่เหลือทั้งหมดรีเซ็ตกลับเป็นไม่พร้อม (กันเริ่มเกมด้วยรายชื่อที่เปลี่ยนไปแล้ว)
    for (const o of Object.values(players)) o.ready = false;
    broadcastState();
    broadcastPositions();
  });

  safeOn(socket, 'disconnect', () => {
    const playerId = socketPlayerIds.get(socket.id);
    socketPlayerIds.delete(socket.id);
    releaseReservation(socket.id);
    const p = playerId && players[playerId];
    if (p && p.socketId === socket.id) {
      p.connected = false;
      p.socketId = null;
      if (gameState === 'LOBBY') {
        for (const other of Object.values(players)) other.ready = false;
      }
      // During a match the player is parked indefinitely and may reclaim this
      // exact character/session whenever they return. Lobby slots still expire.
      if (gameState === 'LOBBY') scheduleDisconnectedRemoval(playerId);
      broadcastState();
    }
    broadcastPositions();
  });
});


// ============================================================
//  engine — context object ที่ให้ characters/*.js เรียกกลับเข้ามาใช้ state/ฟังก์ชันร่วมของ server.js
//  (ตัวแปร gameState/lastAttack ฯลฯ เป็น let ในไฟล์นี้ — ต้องผ่าน getter/setter เพราะ
//   ส่งค่า primitive ตรงๆ ออกไปจะไม่ live-update เวลาไฟล์นี้ reassign ตัวแปรนั้นทีหลัง)
// ============================================================
const engine = {
  players,
  CHAR_BY_ID,
  CHAR_HOOKS,
  POSITION_COLORS,
  ATTACKFX_TIME,
  ATTACK_TIME,
  BARD_FORTUNE_MAX,
  BARD_SECTION_MAX,
  BARD_DIM_TURNS,
  BARD_DIM_RESIST_TURNS,
  BARD_DIM_FORTUNE,
  BARD_DIM_EVADE,
  BARD_BLOOD_FRAGILE,
  BARD_DIM_NOTES_PER_TURN,
  BARD_SOUL_TARGETS,
  BARD_SOUL_PERFORM_DMG,
  BARD_SONGS,
  TRANSFORMS,
  shikiCancelUltimate,
  SPELLBURDEN_MAX,
  CONTRACT_FEE,
  CONTRACT_CYCLE,
  FIBER_CAP,
  UNPLUG_BUFFS,
  TAKUTO_APPRIVOISE_TURNS,
  DOOM_WEAPONS,
  rollDoomWeapon,
  DOOM_LOCKON_CHANCE,
  DOOM_EXPLODE_DMG,
  DOOM_EXPLODE_TARGETS,
  DOOM_LOCKON_BONUS,
  DOOM_CRUCIBLE_ATK,
  DOOM_ROCKET_BONUS_DMG,
  DOOM_BALLISTA_TARGET_DMG,
  DOOM_DRAIN_DMG,
  DOOM_DRAIN_TURNS,
  DOOM_SHIELD_ON_ATK,
  DOOM_FORTUNE_CHANCE,
  DOOM_CRUCIBLE_CHARGE_NEED,
  DOOM_HEAL_ON_ATK,
  DOOM_CHARGE_CHANCE,
  DOOM_TIE_ATTACK_CHANCE,
  DOOM_CRUCIBLE_BUST_DMG,
  DOOM_CRUCIBLE_BUST_DRAWS,
  DOOM_CRUCIBLE_BUST_BONUS,
  oguriGoldStacks,
  oguriChargeCapOf,
  oguriAshenReady,
  oguriAddEnergy,
  oguriAddCharge,
  OGURI_ENERGY_MAX,
  OGURI_GOLD_MAX,
  OGURI_ULT2_CHARGE_COST,
  MAX_HP,
  maxHpOf,
  maxArmorOf,
  maxSkillOf,
  addSkill,
  drawCardFor,
  onCardDrawn,
  drawToScore,
  get centralDeck() { return centralDeck; },
  setCentralDeck(v) { centralDeck = v; },
  get kaiOverhaulSlots() { return kaiOverhaulSlots; },
  setKaiOverhaulSlots(v) { kaiOverhaulSlots = v; },
  voidUltimateOnBust,
  maybeMoonBurst,
  sealActive,
  BEAM_AMMO,
  riddheAllied,
  riddheGrantFreeNtdToAlly(rAlly, byId) { return CHAR_HOOKS.riddhe.grantFreeNtdToAlly(engine, rAlly, byId); },
  hasQueuedCutscene() { return cutsceneQueue.length > 0; },
  takumiBlackoutActive,
  get gameState() { return gameState; },
  setGameState(v) { gameState = v; },
  get roundNumber() { return roundNumber; },
  get attackerId() { return attackerId; },
  setAttackerId(v) { attackerId = v; },
  get lastAttack() { return lastAttack; },
  setLastAttack(v) { lastAttack = v; },
  attackableTargets,
  get oberonDevour() { return oberonDevour; },
  setOberonDevour(v) { oberonDevour = v; },
  setNightResetPending(v) { nightResetPending = v; },
  // โอเบรอน Lie Like Vortigern (rework 2): ให้เทิร์นปัจจุบันกลายเป็นจุดเริ่มคืนใหม่เต็มรอบ (CYCLE_TURNS เทิร์น นับจากนี้)
  //  หมายเหตุ: เคยลองใช้ cycleShift += n (บวกคงที่) มาก่อน แต่สูตรนั้นพังถ้ากดกลางดึกที่ไม่ใช่เทิร์นแรกของคืน — ทำให้เกิดวันแทรกกลางคืนสั้นๆ แบบสุ่ม
  //  ใช้สูตรเดียวกับ nightResetPending เดิม (คำนวณ cycleShift ใหม่ตรงๆ) ซึ่งพิสูจน์แล้วว่าไม่มีรอยต่อเพี้ยน
  extendNight() { cycleShift = roundNumber - (CYCLE_TURNS + 1); },
  // ยูนะ ไอดอลประจำสนาม
  get yunaEffect() { return yunaEffect; },
  get yunaWindowEnd() { return yunaWindowEnd; },
  get yunaLongingUsed() { return yunaLongingUsed; },
  get yunaPity() { return yunaPity; },
  setYunaPity(v) { yunaPity = v; },
  setYunaTrigger({ effect, targetId, windowEnd }) { yunaEffect = effect; yunaTargetId = targetId; yunaWindowEnd = windowEnd; yunaMusicSeq++; },
  pushCutsceneRaw(entry) { cutsceneQueue.push(entry); },
  log(msg) { lastLog.push(msg); },
  nextTransformCounter() { return ++transformCounter; },
  endTurn,
  doAttack,
  alivePlayers,
  isNightRound,
  statusAmtOf,
  calculateScore,
  applyBuff,
  applyDebuff,
  cleanseDebuffs,
  BASIC_DEBUFF_CLEAR,
  SOFT_DEBUFF_STEP,
  noHealActive,
  invertActive,
  EVADE_STACK_MAX,
  EVADE_STACK_TURNS,
  grantEvadeStack,
  consumeEvadeStack,
  healHp,
  healArmor,
  healOverflow,
  loseHp,
  loseArmor,
  dealDirect,
  dealMixed,
  dealArmorOnly,
  instantDeath,
  displayImg,
  passiveSealed,
  killSealed,
  resistActive,
  maybeWakeKotone,
  maybeBeatSave,
  maybeBeatMode,
  maybeEva3,
  bustedOf,
  scoreOf,
  shikiGiveLifeline,
  clearWitherLines,
  hasKillCapability,
  miyakoKillChance,
  miyakoSurvivedKillAttempt,
  appleGuyDodgesKill,
  satoruOnTargeted,
  queueCutscene,
  triggerCutscene,
  notifyTransform,
  queueTransformAnnounce,
  runCutsceneQueue,
  pausePlayingForCutscene,
  startPhaseTimer,
  clearPhaseTimer,
  broadcastState,
  checkAllLocked,
};

// เผื่อ require() ไฟล์นี้จากเทสต์ (ดึง computeAttackBase ไปทดสอบตรงๆ ไม่ต้องบูตทั้งเซิร์ฟเวอร์)
//  — ฟังก์ชันอื่นที่เหลือยังเข้าถึงไม่ได้จากภายนอกโดยตั้งใจ ต้องเพิ่มเข้า export นี้เองถ้าจะทดสอบเพิ่ม
module.exports = { computeAttackBase, engine };

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => console.log("🃏 ECHO — Blackjack Skill Battle ทำงานที่พอร์ต " + PORT));
}
