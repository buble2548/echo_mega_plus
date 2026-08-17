// ============================================================
//  โทโนะ ชิกิ (patch 2.1.7) — Mystic eye of death perception
//  ย้ายออกมาจาก server.js (เดิมอยู่ใน useSkill()/doAttack()) เพื่อไม่ให้ตัวละคร
//  ทุกตัวรวมกันเป็นไฟล์เดียวหลายพันบรรทัด — ดู characters/index.js สำหรับไฟล์มัดรวม
// ============================================================

const TOHNO_DEATH_IMG = "/characters/tohno/tohno_death.jpg"; // ร่างระหว่างสกิลติดตัวเปิดใช้งาน (ระดับ 2 ขึ้นไป)
const TOHNO_KNIFE_HEAL = 2;      // ระดับ 1 (ปิดสกิลติดตัว): โจมตีปกติฟื้นเลือดให้ตัวเอง +2 ทุกครั้ง
const TOHNO_KILL_CHANCE = { 2: 0.05, 3: 0.10, 4: 0.20, 5: 0.50 }; // โอกาสสังหารทันทีตามระดับ
const TOHNO_MISS_DMG = { 2: 1, 3: 2, 4: 4, 5: 6 }; // สังหารพลาด — เสียพลังชีวิตไม่สนเกราะตามระดับ
const TOHNO_LEVEL_NAME = {
  1: "ปิดใช้งานสกิลติดตัว (ฟื้นเลือด +2 ทุกครั้งที่โจมตี)",
  2: "เปิดใช้งานสกิลติดตัว (โอกาสสังหาร 5%)",
  3: "เพิ่มโอกาสสังหารเป็น 10%",
  4: "เพิ่มโอกาสสังหารเป็น 20%",
  5: "เพิ่มโอกาสสังหารเป็น 50%",
};

module.exports = {
  id: "tohno",
  DEATH_IMG: TOHNO_DEATH_IMG,

  // เรียกจาก useSkill(): item ของสกิลพื้นฐาน (มีดพับประจำตระกูล) ต้องเป็นระดับ 1-5 เท่านั้น
  validateBasicItem(item) {
    const level = Number(item);
    return level >= 1 && level <= 5;
  },

  // เรียกจาก useSkill() หลังหักแต้มสกิลแล้ว (isTohnoPick === true) — คืนค่า flashSuffix
  applyBasicPick(engine, p, item) {
    const levelPick = Number(item);
    p.tohnoLevel = levelPick;
    const flashSuffix = ` — ${TOHNO_LEVEL_NAME[levelPick]}`;
    engine.log(`🔪 ${p.name} มีดพับประจำตระกูล — ${TOHNO_LEVEL_NAME[levelPick]}`);
    if (levelPick >= 2) {
      p.transformAt = engine.nextTransformCounter(); // เพลง/ภาพซ้อนทับใช้ลำดับล่าสุด (กรณีมีโทโนะหลายคน)
      engine.triggerCutscene(p, "tohnoSkill1"); // ครั้งแรกที่เข้าระดับ 2 ขึ้นไป = วีดีโอเต็ม, ครั้งต่อไป = แจ้งเตือนเฉยๆ
    } else {
      engine.notifyTransform(p, "tohnoSkill1"); // ปิดใช้งาน (กลับระดับ 1) = แจ้งเตือนเฉยๆ เสมอ
    }
    return flashSuffix;
  },

  // เรียกจาก doAttack() ตอนโจมตีปกติ — คืน true ถ้าฟังก์ชันหลักต้อง return ทันที (สังหารทันทีทำงาน)
  onAttack(engine, attacker, target) {
    const tohnoLevel = attacker.tohnoLevel || 1;
    if (tohnoLevel === 1) {
      const heal = engine.healHp(attacker, TOHNO_KNIFE_HEAL);
      if (heal > 0) engine.log(`🔪 ${attacker.name} มีดพับประจำตระกูล — ฟื้นพลังชีวิต +${heal}`);
      return false;
    }
    if (engine.passiveSealed(attacker) || engine.killSealed(attacker)) return false;
    const chance = engine.miyakoKillChance(target, TOHNO_KILL_CHANCE[tohnoLevel]);
    if (Math.random() < chance) {
      if (engine.appleGuyDodgesKill(attacker, target)) return true; // Apple guy: หลบสังหารทันทีได้ (patch 2.2 new)
      engine.queueCutscene(attacker, "tohnoKill"); // เล่นวีดีโอก่อนสังหารทุกครั้ง
      engine.instantDeath(target);
      target.wasAttacked = true;
      if (!target.alive) engine.log(`👁️💀 Mystic eye of death perception — ${attacker.name} มองเห็นเส้นความตายของ ${target.name} (โอกาส ${Math.round(chance * 100)}%) — สังหารทันที!`);
      else engine.log(`👁️💀 Mystic eye of death perception — ${attacker.name} มองเห็นเส้นความตายของ ${target.name} — แต่ ${target.name} เกิดใหม่หนีความตายไปได้!`);
      engine.setLastAttack({
        byName: attacker.name, byImg: engine.displayImg(attacker), byColor: engine.POSITION_COLORS[attacker.position] || "#888",
        byDoomWeapon: attacker.characterId === "doomguy" ? attacker.doomWeapon : undefined, // DoomGuy: อาวุธที่ใช้ยิงตอนนี้ (เสียงยิงฝั่ง client)
        targetName: target.name, targetImg: engine.displayImg(target), targetColor: engine.POSITION_COLORS[target.position] || "#888",
        dmg: 0, kill: !target.alive,
        skills: [{ name: "Mystic eye of death perception — สังหารทันที", img: TOHNO_DEATH_IMG, by: attacker.name, color: engine.POSITION_COLORS[attacker.position] || "#888", side: "atk" }],
      });
      engine.runCutsceneQueue(() => {
        engine.setGameState("ATTACKING");
        engine.startPhaseTimer(engine.ATTACKFX_TIME + 2, engine.endTurn);
        engine.broadcastState();
      });
      return true;
    }
    const missDmg = TOHNO_MISS_DMG[tohnoLevel];
    engine.dealDirect(attacker, missDmg);
    engine.log(`👁️💢 Mystic eye of death perception พลาด — ${attacker.name} เสียพลังชีวิต ${missDmg} หน่วย (ไม่สนเกราะ)`);
    if (attacker.alive && attacker.hp <= 0) {
      engine.instantDeath(attacker);
      if (!attacker.alive) engine.log(`💀 ${attacker.name} เลือดจริงหมด ตกรอบ!`);
    }
    engine.miyakoSurvivedKillAttempt(target);
    return false;
  },
};
