// ============================================================
//  ยูนะ (patch 2.2.6) — ไอดอลเอฟเฟกต์สนาม
//  ไม่ใช่ตัวละครที่เล่นได้ ไม่มี p เป็นของตัวเอง ไม่อยู่ใน characters.js (หน้าเลือกตัวละคร)
//  และไม่อยู่ใน characters/index.js (CHAR_HOOKS dispatch ตาม characterId) — server.js require ตรงๆ
//  แบบเดียวกับ characters/_universal_status.js
//
//  เพลง Longing: อัตโนมัติ 100% ครั้งเดียวต่อเกม (ผู้เล่นคนแรกที่ตายระหว่างเทิร์น 1-10) — เรียกจาก instantDeath()
//  เพลง Delete / Smile for You / Break Beat Bark!: สุ่มทุกๆ 5 เทิร์น เริ่มเทิร์น 16 — เรียกจาก dealRound()
// ============================================================

const YUNA_NAME = "ยูนะ";
const YUNA_IMG = "/characters/yuna/yuna.png";
const YUNA_VIDEO = "/characters/yuna/YuNa_open.mp4";
const YUNA_COLOR = "#c9a7ff";
// วีดีโอจริงวัดแล้วยาว 10.21 วิ (ffprobe) + build-up ฝั่ง client 1.2 วิ ก่อนวีดีโอเริ่ม mount+เล่น = ต้องการอย่างน้อย ~11.4 วิ
//  ค่าเดิม 12 วิ เหลือ margin แค่ ~0.6 วิ (ยิ่งแคบลงอีกตอนที่วีดีโอโหลดจาก Cloudflare R2 แทน localhost — ดีเลย์เครือข่ายกินเข้าไปอีก)
//  เผื่อ margin ให้กว้างขึ้นเป็น ~1.5 วิ กัน CDN/decode latency ตัดวีดีโอสั้นก่อนจบจริง
const YUNA_INTRO_SECONDS = 13;

const YUNA_MUSIC = { longing: "yuna_longing", delete: "yuna_delete", smile: "yuna_smile", beatbark: "yuna_beatbark" };
const YUNA_CUTSCENE_TITLE = { longing: "Longing", delete: "Delete", smile: "Smile for You", beatbark: "Break Beat Bark!" };

const YUNA_WINDOW_TURNS = 5;
const YUNA_ROLL_CHANCE = 0.25;    // โอกาสมีเอฟเฟกต์เกิดขึ้นในแต่ละหน้าต่าง 5 เทิร์น (ฐานตั้งต้น — ดูระบบกันดวงซวยด้านล่าง)
const YUNA_PITY_STEP = 0.05;      // ระบบกันดวงซวย: หน้าต่างไหนไม่ติด โอกาสหน้าต่างถัดไป +5% สะสมไปเรื่อยๆ — ติดแล้วรีเซ็ตกลับฐานตั้งต้นทันที
const YUNA_LATE_TURN = 40;        // หลังเทิร์นนี้ น้ำหนักเพลงเปลี่ยน + Break Beat Bark! ปลดล็อก

function queueYunaCutscene(engine, kind) {
  engine.pushCutsceneRaw({
    seconds: YUNA_INTRO_SECONDS,
    info: {
      playerId: null, name: YUNA_NAME, img: YUNA_IMG, color: YUNA_COLOR,
      video: YUNA_VIDEO, title: YUNA_CUTSCENE_TITLE[kind], kind: "yuna",
    },
  });
}

// ผู้เล่นที่มีพลังชีวิต+เกราะรวมมากที่สุด/น้อยที่สุด (สุ่มถ้าเสมอ) — ใช้กับ Delete/Smile for You
function pickExtreme(engine, mode) {
  const alive = engine.alivePlayers();
  if (!alive.length) return null;
  const val = (p) => (p.hp || 0) + (p.armor || 0);
  let best = mode === "max" ? -Infinity : Infinity;
  for (const p of alive) {
    const v = val(p);
    if (mode === "max" ? v > best : v < best) best = v;
  }
  const tied = alive.filter((p) => val(p) === best);
  return tied[Math.floor(Math.random() * tied.length)];
}
function pickDeleteTarget(engine) { return pickExtreme(engine, "max"); }
function pickSmileTarget(engine) { return pickExtreme(engine, "min"); }

// เรียกจาก dealRound() ทุกๆ 5 เทิร์น เริ่มเทิร์นที่ 16 (16, 21, 26, ...)
function rollWindow(engine, roundNumber) {
  const chance = Math.min(1, YUNA_ROLL_CHANCE + (engine.yunaPity || 0));
  if (Math.random() >= chance) {
    // เอจิ สกิลติดตัว 2 (ฉันอยากเจอเธออีก): มีเอจิในสนาม -> สะสมเพิ่มอีก +5% ต่อหน้าต่างที่ไม่ติด
    const eijiBonus = engine.CHAR_HOOKS?.eiji ? engine.CHAR_HOOKS.eiji.yunaPityBonus(engine) : 0;
    engine.setYunaPity((engine.yunaPity || 0) + YUNA_PITY_STEP + eijiBonus); // ไม่ติด -> เพิ่มโอกาสหน้าต่างถัดไป
    return;
  }
  engine.setYunaPity(0); // ติดแล้ว -> รีเซ็ตกลับฐานตั้งต้น
  const late = roundNumber > YUNA_LATE_TURN;
  // น้ำหนัก: ก่อนเทิร์น 40 -> delete 50 / smile 50 / beatbark 0 | หลังเทิร์น 40 -> delete 30 / smile 30 / beatbark 40
  const roll = Math.random() * 100;
  const kind = late
    ? (roll < 30 ? "delete" : roll < 60 ? "smile" : "beatbark")
    : (roll < 50 ? "delete" : "smile");
  const windowEnd = roundNumber + YUNA_WINDOW_TURNS - 1;

  if (kind === "delete") {
    const target = pickDeleteTarget(engine);
    if (!target) return;
    // เอจิ (เอฟเฟกต์เฉพาะตัว): Delete ที่ลงเอจิเองอยู่แค่ 3 เทิร์น
    const deleteTurns = engine.CHAR_HOOKS?.eiji ? engine.CHAR_HOOKS.eiji.yunaDeleteTurns(target, YUNA_WINDOW_TURNS) : YUNA_WINDOW_TURNS;
    engine.applyBuff(target, "yunaDelete", 1, deleteTurns);
    engine.setYunaTrigger({ effect: "delete", targetId: target.id, windowEnd: roundNumber + deleteTurns - 1 });
    engine.log(`💜 ยูนะปรากฏตัว — Delete! ${target.name} (พลังชีวิต+เกราะรวมสูงสุด) จะรับดาเมจแรงขึ้น +1 เป็นเวลา ${deleteTurns} เทิร์น`);
  } else if (kind === "smile") {
    const target = pickSmileTarget(engine);
    if (!target) return;
    engine.applyBuff(target, "yunaSmile", 1, YUNA_WINDOW_TURNS);
    engine.setYunaTrigger({ effect: "smile", targetId: target.id, windowEnd });
    engine.log(`💚 ยูนะปรากฏตัว — Smile for You! ${target.name} (พลังชีวิต+เกราะรวมต่ำสุด) จะรับดาเมจน้อยลง -1 เป็นเวลา ${YUNA_WINDOW_TURNS} เทิร์น`);
  } else {
    engine.setYunaTrigger({ effect: "beatbark", targetId: null, windowEnd });
    engine.log(`❤️ ยูนะปรากฏตัว — Break Beat Bark! ทุกคนได้พลังโจมตีปกติ +1 เป็นเวลา ${YUNA_WINDOW_TURNS} เทิร์น (ไม่มีผลกับสกิล)`);
  }
  queueYunaCutscene(engine, kind);
}

// ผู้เล่นทั่วไปเรียกจาก endTurn() หลังฉากโจมตี ส่วนคู่แฝดเรียกทันทีเมื่อแฝดคนแรกล้ม
// เพื่อให้แฝดที่ล้มฟื้นกลับมา โดยอีกคนไม่ถูกนับว่าตายตามไปด้วย
function reviveWithLonging(engine, p) {
  const hisakawa = p.characterId === "hisakawa_sister" && engine.CHAR_HOOKS?.hisakawa_sister;
  if (hisakawa) {
    const revivedTwinKey = hisakawa.reviveFallenTwin(p, 3);
    if (!revivedTwinKey) return false;
    // Longing เป็นบัฟของคนที่ถูกชุบ จึงต้องเก็บไว้กับแฝดคนนั้น ไม่ใช่แฝดที่กำลังควบคุมอยู่
    hisakawa.applyBuffToTwin(p, revivedTwinKey, "yunaLonging", 1, YUNA_WINDOW_TURNS);
  } else {
    p.hp = 3;               // ตามสเปก: เกราะไม่ฟื้น ปล่อยตามที่เป็นตอนตาย
    p.alive = true;
    p.result = null;
    p.locked = false;
    engine.applyBuff(p, "yunaLonging", 1, YUNA_WINDOW_TURNS);
  }
  const windowEnd = engine.roundNumber + YUNA_WINDOW_TURNS;
  engine.setYunaTrigger({ effect: "longing", targetId: p.id, windowEnd });
  engine.log(`✨ ยูนะปรากฏตัว — Longing! ${p.name} ฟื้นคืนชีพด้วยพลังชีวิต 3 หน่วย (พลังโจมตี +1 เป็นเวลา ${YUNA_WINDOW_TURNS} เทิร์น เริ่มนับเทิร์นถัดไป)`);
  queueYunaCutscene(engine, "longing");
  // เอจิ (เอฟเฟกต์เฉพาะตัว): Longing ลงคนอื่น -> ต่อท้ายฉากด้วย eiji_passive_extra.mp4
  //  แล้วสวนใส่คนที่ฟื้นคืนชีพ 1 หน่วย พร้อมปิดบัฟ/เพลง Longing ทิ้ง
  if (engine.CHAR_HOOKS?.eiji) engine.CHAR_HOOKS.eiji.onYunaLonging(engine, p);
  return true;
}

module.exports = {
  YUNA_NAME,
  YUNA_MUSIC,
  rollWindow,
  reviveWithLonging,
  pickDeleteTarget,
  pickSmileTarget,
  queueYunaCutscene,
};
