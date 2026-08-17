// ============================================================
//  เอวานเกเลี่ยน หมายเลข 13 (patch 2.2 alpha) — หอกแห่งแคสเซียส / สกิลติดตัว 2-3 / RS-Hopper / หอกลองกินัส / Fourth Impact
//  ย้ายออกมาจาก server.js — ดู characters/index.js สำหรับไฟล์มัดรวม
//  หมายเหตุ: eva3Active/maybeEva3/evaLossImmune/RS-Hopper block ทั้งสองแบบ ถูกเรียกจาก ~30 จุดทั่ว server.js
//  (choke point เดียวกับ maybeBeatSave/maybeBeatMode) — server.js เก็บชื่อฟังก์ชันเดิมไว้เป็น thin wrapper
//  ที่ delegate เข้ามาที่นี่ทั้งหมด จุดเรียกทั้ง ~30 จุดจึงไม่ต้องแก้
// ============================================================

const EVA13_HP_THRESHOLD = 4;          // อย่าให้ฉันทำแบบนี้เลย / RS-Hopper: เกณฑ์พลังชีวิต
const EVA13_ARMOR_HEAL = 2;            // อย่าให้ฉันทำแบบนี้เลย: ฟื้นเกราะทันที
const EVA13_SPEAR_CHANCE = 0.5;        // หอกลองกินัส: โอกาสล็อกสกิลเป้าหมาย (คงที่ 50/50 เสมอ)
const EVA13_SPEAR_LOCK_TURNS = 2;      // หอกลองกินัส: ล็อกสกิลเป้าหมาย 2 เทิร์น
const EVA13_FOURTH_TURNS = 5;          // Fourth Impact: คงอยู่ 5 เทิร์น
const EVA13_FOURTH_ATK = 2;            // Fourth Impact: พลังโจมตีปกติ +2
const EVA13_RSHOPPER_MAX = 3;          // RS-Hopper: ชาร์จสูงสุด (เริ่มเกมเต็ม)
const EVA13_RSHOPPER_REGEN_TURNS = 3;  // RS-Hopper: ฟื้น 1 ชาร์จทุกๆ 3 เทิร์น

module.exports = {
  id: "eva13",

  // ดาเมจ contribution (หอกลองกินัส +1 / Fourth Impact +2) — เรียกจาก computeAttackBase()
  damageBonus(engine, attacker, target, ctx) {
    const spearAtk = (attacker.statuses.spear || 0) > 0;
    const fourthAtk = (attacker.statuses.fourth || 0) > 0 ? EVA13_FOURTH_ATK : 0;
    ctx.spearAtk = spearAtk;
    ctx.fourthAtk = fourthAtk;
    return (spearAtk ? 1 : 0) + fourthAtk;
  },

  // เรียกจาก useSkill() ในส่วน effect (isCassius === true) — แจ้งเตือนว่าการโจมตีปกติครั้งถัดไปจะฟื้นเลือด
  applyBasicCassius(p, log) {
    log(`🗡️ ${p.name} หอกแห่งแคสเซียส — การโจมตีปกติครั้งถัดไปจะฟื้นพลังชีวิตตามความเสียหายที่ทำได้`);
  },

  // เรียกจาก doAttack() หลังคำนวณดาเมจแล้ว — คืน heal amount ถ้าทำงาน (ใช้แล้วหมดไป) หรือ 0
  onAttackConsumeCassius(engine, attacker, dmg) {
    if (!((attacker.statuses.cassius || 0) > 0)) return 0;
    delete attacker.statuses.cassius;
    const heal = engine.healHp(attacker, dmg);
    if (heal > 0) engine.log(`🗡️ ${attacker.name} หอกแห่งแคสเซียส — ฟื้นพลังชีวิตตามความเสียหายที่ทำได้ +${heal}`);
    return heal;
  },

  // เรียกจาก server.js — สกิลติดตัว 3 อย่าให้ฉันทำแบบนี้เลย: เลือด <= 4 = ทำงาน (เฉพาะเอวา 13 เท่านั้น — เดิมเช็คผ่าน wrapper eva3Active(p) ใน server.js ย้ายมาการ์ดที่นี่แทน)
  isEva3Active(engine, p) {
    return !!p && p.alive && p.characterId === "eva13" && p.hp > 0 && p.hp <= EVA13_HP_THRESHOLD && !engine.passiveSealed(p);
  },

  // เรียกจาก server.js — เข้าสกิลติดตัว 3 ครั้งแรก: เล่นวีดีโอ + ฟื้นเกราะทันที (เดิมเช็คผ่าน wrapper maybeEva3(p))
  maybeEnterEva3(engine, p) {
    if (!this.isEva3Active(engine, p)) return;
    if (p.seen && p.seen.eva3) return; // เข้าแล้วครั้งเดียวพอ (ผลเปิด/ปิดตามเลือดจริง)
    p.seen.eva3 = true;
    engine.healArmor(p, EVA13_ARMOR_HEAL);
    engine.triggerCutscene(p, "eva3");
    engine.log(`🗡️ ${p.name} อย่าให้ฉันทำแแบบนี้เลย — เพดานเกราะ +1 และฟื้นเกราะ +${EVA13_ARMOR_HEAL}!`);
  },

  // เรียกจาก server.js — สกิลติดตัว 2 ทุกอย่างไร้ความหมาย: ไม่รับดาเมจแพ้จั่ว/แตก (เฉพาะเอวา 13 — เดิมเช็คผ่าน wrapper evaLossImmune(p))
  //  fourth impact อยู่ = บังคับทำงาน | สกิลติดตัว 3 ทำงานอยู่ (เลือด <= 4) = สกิลติดตัว 2 ไม่ทำงาน
  isLossImmune(engine, p) {
    if (!p || p.characterId !== "eva13") return false;
    if ((p.statuses.fourth || 0) > 0) return true;
    return !this.isEva3Active(engine, p);
  },

  // เรียกจาก dealDirect()/dealMixed() — สกิล/เลือกเป้าหมาย (ไม่ใช่โจมตีปกติ) -> กันความเสียหายเต็ม 100% (เฉพาะเอวา 13 — เดิมเช็คผ่าน wrapper eva13RsHopperBlock(p))
  rsHopperBlock(engine, p) {
    if (!p || !p.alive || p.characterId !== "eva13") return false;
    if ((p.statuses.fourth || 0) > 0) return false;
    if ((p.statuses.rsHopper || 0) <= 0) return false;
    p.statuses.rsHopper--;
    engine.triggerCutscene(p, "eva13RsHopper");
    engine.log(`🦘 ${p.name} RS-HOPPER — ป้องกันความเสียหายจากสกิลได้ทั้งหมด! (เหลือ ${p.statuses.rsHopper}/${EVA13_RSHOPPER_MAX} ชาร์จ)`);
    return true;
  },

  // เรียกจาก dealDirect()/dealMixed() — การโจมตีปกติ: ตรึงพลังชีวิตไว้ที่ EVA13_HP_THRESHOLD (เฉพาะเอวา 13 — เดิมเช็คผ่าน wrapper eva13NormalAttackFloor(p,n))
  normalAttackFloor(engine, p, n) {
    if (!p || !p.alive || p.characterId !== "eva13") return false;
    if ((p.statuses.fourth || 0) > 0) return false;
    if ((p.statuses.rsHopper || 0) <= 0) return false;
    if (p.hp - n > EVA13_HP_THRESHOLD) return false;
    p.statuses.rsHopper--;
    p.hp = EVA13_HP_THRESHOLD;
    engine.triggerCutscene(p, "eva13ExRsHopper");
    engine.log(`🦘 ${p.name} RS-HOPPER (พิเศษ) — ตรึงพลังชีวิตไว้ที่ ${EVA13_HP_THRESHOLD} หน่วย! (เหลือ ${p.statuses.rsHopper}/${EVA13_RSHOPPER_MAX} ชาร์จ)`);
    return true;
  },

  // เรียกจาก useSkill() ในส่วน effect (st === "fourth") — Fourth Impact: แปลงร่างทันทีก่อนเปิดไพ่ทั้งหมด
  applyFourthEffect(engine, p) {
    p.seen.fourth = true;
    p.transformAt = engine.nextTransformCounter();
    engine.triggerCutscene(p, "fourth");
    engine.log(`☄️ ${p.name} Fourth Impact — พลังโจมตีปกติ +${EVA13_FOURTH_ATK} คงอยู่ ${EVA13_FOURTH_TURNS} เทิร์น`);
  },

  // เรียกจาก doAttack() หลังคำนวณดาเมจแล้ว (spearAtk === true) — หอกลองกินัส: โอกาสล็อกสกิลเป้าหมาย ใช้แล้วหมดไป
  onAttackConsumeSpear(engine, attacker, target) {
    delete attacker.statuses.spear;
    if (!target.alive) return;
    const spearChance = (this.isEva3Active(engine, attacker) || (attacker.statuses.fourth || 0) > 0) ? 1 : EVA13_SPEAR_CHANCE;
    if (Math.random() < spearChance) {
      if (engine.resistActive(target)) {
        engine.log(`🛡️ ${target.name} ต้านสถานะผิดปกติ — หอกลองกินัสไม่มีผล`);
      } else {
        target.noSkillNext = Math.max(target.noSkillNext || 0, EVA13_SPEAR_LOCK_TURNS);
        engine.log(`🗡️ หอกลองกินัสปักเป้า! ${target.name} ใช้สกิลไม่ได้ ${EVA13_SPEAR_LOCK_TURNS} เทิร์น`);
      }
    } else {
      engine.log(`🗡️ หอกลองกินัสพลาด — ${target.name} ยังใช้สกิลได้ตามปกติ`);
    }
  },

  // เรียกจาก dealRound() ต้นเทิร์น — RS-Hopper: ฟื้น 1 ชาร์จทุกๆ 3 เทิร์น (สูงสุด 3)
  onRoundStartRegen(engine, p) {
    if ((p.statuses.rsHopper || 0) >= EVA13_RSHOPPER_MAX) return;
    p.rsHopperRegenTimer = (p.rsHopperRegenTimer || 0) + 1;
    if (p.rsHopperRegenTimer >= EVA13_RSHOPPER_REGEN_TURNS) {
      p.rsHopperRegenTimer = 0;
      p.statuses.rsHopper = Math.min(EVA13_RSHOPPER_MAX, (p.statuses.rsHopper || 0) + 1);
      engine.log(`🦘 ${p.name} RS-HOPPER — ฟื้นชาร์จ +1 (${p.statuses.rsHopper}/${EVA13_RSHOPPER_MAX})`);
    }
  },
};
