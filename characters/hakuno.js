// ============================================================
//  คิชินามิ ฮาคุโนะ (patch 2.2.1) — เธอ/นาย คือฉันหรอ? (สลับเพศ) / ร่างชาย (พักฟื้น) / ข้าขอบัญชา (ชาย: ผกผัน / หญิง: ไร้ทางเยียวยา) /
//  MOON*CELL (ท่าไม้ตาย) / อาคมบัญชาระดับ EX+ (สกิลติดตัว 3, กดเองผ่าน socket)
//  ย้ายออกมาจาก server.js — ดู characters/index.js สำหรับไฟล์มัดรวม
//  หมายเหตุ: `moonCellActive()`/`passiveSealed()` (MOON*CELL ปิดสกิลติดตัวตัวละครอื่นทั้งหมด) ยังอยู่ server.js
//  เพราะเป็น shared infra ที่ตัวละครอื่นทุกตัวเรียกใช้ — เช่นเดียวกับ MOON*CELL-end restore loop (คืนสถานะ
//  ที่ถูกล้างไว้ + ใส่ไร้ทางเยียวยาให้ทุกคน) ซึ่งฝังอยู่ใน status-decay loop ที่ตัวละครอื่นวิ่งผ่านด้วยเช่นกัน
//  `maxHpOf`/`maxArmorOf` สาขาฮาคุโนะยังอยู่ server.js — `hakunoCommandSpell(id, command)`
//  (socket handler validation + io.emit) ก็เช่นกัน มีแค่ effect body 3 แบบที่ย้ายมาที่นี่ (applyCommandSpell)
// ============================================================

const HAKUNO_MALE_REST_TURNS = 2;   // ร่างชาย: ทุกๆ 2 เทิร์น ฟื้นพลังชีวิต
const HAKUNO_MALE_REST_HEAL = 1;    // ร่างชาย: จำนวนพลังชีวิตที่ฟื้น
const HAKUNO_INVERT_TURNS = 3;      // ข้าขอบัญชา (ชาย): ติดผกผัน 3 เทิร์น
const HAKUNO_FORCE_SCORE_2 = 19;    // ข้าขอบัญชา (หญิง): บังคับแต้มการจั่วเป็น 19 ทันที
const HAKUNO_MOONCELL_NEED = 3;     // MOON*CELL: ต้องมีแต้มคำสาปแห่งดวงจันทร์ครบ 3 ต่อการเปิด 1 ครั้ง (ค่าเดิมยังอยู่ server.js สำหรับ gate + shared restore loop)
const HAKUNO_MOONCELL_TURNS = 5;    // MOON*CELL: คงอยู่ 5 เทิร์น
const HAKUNO_NORECOVER_TURNS = 3;   // ข้าขอบัญชา (หญิง): ติดไร้ทางเยียวยา 3 เทิร์น (ค่าเดิมยังอยู่ server.js สำหรับ MOON*CELL-end restore loop)
const HAKUNO_MALE_ATK_BONUS = 1;      // ร่างชาย: พลังโจมตีถาวร +1
const HAKUNO_MOONCELL_ATK_BONUS = 1;  // MOON*CELL: พลังโจมตีรวมสูงสุด 2 หน่วยเท่ากันทั้งสองร่าง

module.exports = {
  id: "hakuno",

  // ดาเมจ contribution (ร่างชาย +1 / MOON*CELL +1) — เรียกจาก computeAttackBase()
  damageBonus(engine, attacker, target, ctx) {
    const hakunoMoonOn = (attacker.statuses.moonCell || 0) > 0;
    const hakunoMaleAtk = (attacker.hakunoGender === "male" && !hakunoMoonOn) ? HAKUNO_MALE_ATK_BONUS : 0;
    const hakunoMoonAtk = hakunoMoonOn ? HAKUNO_MOONCELL_ATK_BONUS : 0;
    ctx.hakunoMaleAtk = hakunoMaleAtk;
    ctx.hakunoMoonAtk = hakunoMoonAtk;
    return hakunoMaleAtk + hakunoMoonAtk;
  },

  // เรียกจาก dealRound() ต้นเทิร์น — ร่างชาย: ทุกๆ 2 เทิร์น ฟื้นพลังชีวิต +1
  onRoundStartRest(engine, p) {
    if (!(p.characterId === "hakuno" && p.hakunoGender === "male")) return;
    p.hakunoRestTurn = (p.hakunoRestTurn || 0) + 1;
    if (p.hakunoRestTurn >= HAKUNO_MALE_REST_TURNS) {
      p.hakunoRestTurn = 0;
      const heal = engine.healHp(p, HAKUNO_MALE_REST_HEAL);
      if (heal > 0) engine.log(`💗 ${p.name} ร่างชาย — ฟื้นพลังชีวิต +${heal}`);
    }
  },

  // เรียกจาก useSkill() ในส่วน effect — เธอ/นาย คือฉันหรอ?: สลับเพศ (กดได้แค่ 1 ครั้งต่อเทิร์น) คืน flashSuffix
  applyGenderSwitch(engine, p) {
    p.hakunoGenderSwitched = true;
    const newGender = p.hakunoGender === "male" ? "female" : "male";
    p.hakunoGender = newGender;
    // จำพลังชีวิต/เกราะปัจจุบันไว้ แต่หักลงถ้าเพดานใหม่น้อยกว่า (ไม่มีการฟื้นคืนให้ถ้าเพดานใหม่มากกว่า)
    p.hp = Math.min(p.hp, engine.maxHpOf(p));
    p.armor = Math.min(p.armor, engine.maxArmorOf(p));
    p.transformAt = engine.nextTransformCounter();
    engine.log(`🌓 ${p.name} เธอ/นาย คือฉันหรอ? — เปลี่ยนเป็นร่าง${newGender === "male" ? "ชาย" : "หญิง"}`);
    return ` — เปลี่ยนเป็นคิชินามิ ฮาคุโนะ (${newGender === "male" ? "ชาย" : "หญิง"})`;
  },

  // เรียกจาก useSkill() ในส่วน effect — ข้าขอบัญชา (ชาย): ชาร์จผกผันให้เป้าหมายตอนโจมตีปกติครั้งถัดไป + แต้มคำสาปแห่งดวงจันทร์ +1
  applyInvertCharge(engine, p) {
    p.hakunoMoonPoints = (p.hakunoMoonPoints || 0) + 1;
    engine.log(`🌓 ${p.name} ข้าขอบัญชา — การโจมตีปกติครั้งถัดไปจะทำให้เป้าหมายติดผกผัน ${HAKUNO_INVERT_TURNS} เทิร์น (แต้มคำสาปแห่งดวงจันทร์ ${p.hakunoMoonPoints}/${HAKUNO_MOONCELL_NEED})`);
  },

  // เรียกจาก useSkill() ในส่วน effect — ข้าขอบัญชา (หญิง): บังคับแต้มการจั่วเป็น 19 + ชาร์จไร้ทางเยียวยาให้เป้าหมายตอนโจมตีปกติครั้งถัดไป
  applyNoRegenCharge(engine, p) {
    p.hakunoMoonPoints = (p.hakunoMoonPoints || 0) + 1;
    if (engine.calculateScore(p.cards) < HAKUNO_FORCE_SCORE_2) {
      engine.drawToScore(p, HAKUNO_FORCE_SCORE_2); // จั่วให้ถึงเป้าก่อน แล้วค่อยจำกัดจั่วครั้งถัดๆ ไป (ไม่งั้นการจั่วรอบนี้เองจะโดนจำกัดด้วย)
      p.hakunoLowDraw = true;
      engine.log(`🌕 ${p.name} ข้าขอบัญชา — จั่วการ์ดจากกองกลางจนแต้มถึง ${HAKUNO_FORCE_SCORE_2} (ได้ ${engine.calculateScore(p.cards)} แต้ม${p.busted ? " — แตก!" : ""}) (แต้มคำสาปแห่งดวงจันทร์ ${p.hakunoMoonPoints}/${HAKUNO_MOONCELL_NEED})`);
    } else {
      p.hakunoLowDraw = true;
      engine.log(`🌕 ${p.name} ข้าขอบัญชา — แต้ม ${engine.calculateScore(p.cards)} อยู่แล้ว (แต้มคำสาปแห่งดวงจันทร์ ${p.hakunoMoonPoints}/${HAKUNO_MOONCELL_NEED})`);
    }
  },

  // เรียกจาก useSkill() ในส่วน effect — MOON*CELL (ท่าไม้ตาย): ล้าง/ปิดใช้งานบัฟ-ดีบัฟ-สกิล-สกิลติดตัวของทุกคนยกเว้นตัวเอง
  applyMoonCellCast(engine, p) {
    p.hakunoMoonPoints -= HAKUNO_MOONCELL_NEED;
    p.statuses.moonCell = HAKUNO_MOONCELL_TURNS;
    p.transformAt = engine.nextTransformCounter();
    for (const o of engine.alivePlayers()) {
      if (o.id === p.id) continue;
      o.moonCellBackup = { statuses: { ...o.statuses }, statusAmt: { ...(o.statusAmt || {}) } };
      o.statuses = {};
      o.statusAmt = {};
    }
    engine.triggerCutscene(p, p.hakunoGender === "female" ? "hakunoUltFemale" : "hakunoUltMale");
    engine.log(`🌙 ${p.name} คำสาปแห่งดวงจันทร์ MOON*CELL — ล้างบัฟ/ดีบัฟและปิดสกิล/สกิลติดตัวของทุกคน (ยกเว้นตัวเอง) เป็นเวลา ${HAKUNO_MOONCELL_TURNS} เทิร์น! เกราะทุกคนจะไม่ฟื้นระหว่างนี้`);
  },

  // เรียกจาก server.js's hakunoCommandSpell(id, command) (socket handler, ยังอยู่ server.js) — คืนคำอธิบาย "what" สำหรับ skillFlash
  applyCommandSpell(engine, p, cmd) {
    if (cmd === 1) {
      p.skillPoints = engine.maxSkillOf(p);
      engine.log(`📜 ${p.name} อาคมบัญชาระดับ EX+ — เติมแต้มสกิลเต็ม ${engine.maxSkillOf(p)} แต้ม (เหลือ ${p.hakunoCommandUses})`);
      return "เติมแต้มสกิลเต็ม";
    }
    if (cmd === 2) {
      const heal = engine.healHp(p, engine.maxHpOf(p));
      engine.log(`📜 ${p.name} อาคมบัญชาระดับ EX+ — ฟื้นพลังชีวิตเต็ม${heal > 0 ? ` (+${heal})` : ""} (เหลือ ${p.hakunoCommandUses})`);
      return "ฟื้นพลังชีวิตเต็ม";
    }
    if (engine.calculateScore(p.cards) < 21) engine.drawToScore(p, 21);
    engine.log(`📜 ${p.name} อาคมบัญชาระดับ EX+ — จั่วการ์ดจากกองกลางจนแต้มถึง 21 (ได้ ${engine.calculateScore(p.cards)} แต้ม${p.busted ? " — แตก!" : ""}) (เหลือ ${p.hakunoCommandUses})`);
    return "บังคับแต้มการ์ดเป็น 21";
  },

  // เรียกจาก doAttack() — ข้าขอบัญชา (ชาย): โจมตีปกติติดผกผันให้เป้าหมาย — เป้าเดิมที่ติดผกผันอยู่แล้วไม่ต่อเวลา สกิลเสียเปล่า
  onAttackConsumeInvert(engine, attacker, target) {
    delete attacker.statuses.hakunoInvertReady;
    if (!target.alive) return;
    if ((target.statuses.invert || 0) > 0) {
      engine.log(`🌓 ${attacker.name} ข้าขอบัญชา — ${target.name} ติดผกผันอยู่แล้ว ระยะเวลาไม่เพิ่มขึ้น สกิลเสียเปล่า`);
    } else {
      target.statuses.invert = HAKUNO_INVERT_TURNS;
      engine.log(`🌓 ${attacker.name} ข้าขอบัญชา — ${target.name} ติดสถานะผกผัน ${HAKUNO_INVERT_TURNS} เทิร์น!`);
    }
  },

  // เรียกจาก doAttack() — ข้าขอบัญชา (หญิง): โจมตีปกติทำให้เป้าหมายเกราะไม่ฟื้น + ไร้ทางเยียวยา
  onAttackConsumeNoRegen(engine, attacker, target) {
    delete attacker.statuses.hakunoNoRegenReady;
    if (!target.alive) return;
    target.statuses.armorSeal = Math.max(target.statuses.armorSeal || 0, HAKUNO_NORECOVER_TURNS);
    target.statuses.nohealing = Math.max(target.statuses.nohealing || 0, HAKUNO_NORECOVER_TURNS);
    engine.log(`🌕 ${attacker.name} ข้าขอบัญชา — ${target.name} เกราะฟื้นไม่ได้ และติดสถานะไร้ทางเยียวยา ${HAKUNO_NORECOVER_TURNS} เทิร์น!`);
  },
};
