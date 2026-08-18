// ============================================================
//  ผู้สังหารจอมมหาเวทย์ (mageslayer) — Witch Mark (ตราล่าเวท) / Mana Rupture (ระเบิดมานา) /
//  Mana Burden (ภาระเวท) / Song's Curse (คำสาปบรรเลงทำนอง — พาสซีฟถาวร)
//  ดู characters/index.js สำหรับไฟล์มัดรวม, server.js's useSkill()/doAttack()/afterResolve() สำหรับจุดเรียก
//  หมายเหตุ: Song's Curse ห้ามฟื้นพลังงานปกติทุกทาง — hardcode เช็คตรงใน server.js's addSkill() (ไม่ใช่สถานะ
//  ต้านไม่ได้) การขโมยพลังงาน (Witch Mark) และ +2 ของ Mana Rupture ใช้ direct assignment ตรงๆ จึงทะลุข้อจำกัดนี้
//  โดยธรรมชาติ (ไม่เรียกผ่าน engine.addSkill เลย)
// ============================================================

const MS_FURY_MAX = 3;         // Fury: สะสมสูงสุด 3 สต็อก
const MS_FURY_CHANCE = 0.35;   // Fury: โอกาสสะสมเมื่อแตก/แต้มต่ำสุด (อิสระต่อกันทั้งสอง trigger)
const MS_MARK_STEAL_CHANCE = 0.35; // ตราล่าเวท: โอกาสขโมยพลังงานเมื่อเป้าหมายที่มาร์กใช้สกิลใดๆ
const MS_SEAL_TURNS = 2;       // ผนึกพลังงาน: เป้าหมายพลังงาน 0 (โจมตีปกติ / ใช้สกิลไม่มีให้ขโมย)
const MS_RUPTURE_ENERGY_BACK = 2; // Mana Rupture: คืนพลังงานให้ผู้ใช้ (ทะลุ Song's Curse เสมอ)

module.exports = {
  id: "mageslayer",

  // ดาเมจ contribution (Song's Curse +1 ใส่เป้าหมายพลังงานมากกว่า / Fury stack ใช้หมดพร้อมกัน) — เรียกจาก computeAttackBase()
  damageBonus(engine, attacker, target) {
    if (attacker.characterId !== "mageslayer") return 0;
    const songBonus = (target.skillPoints || 0) > (attacker.skillPoints || 0) ? 1 : 0;
    const furyStacks = attacker.statuses.mageslayerFury || 0;
    return songBonus + furyStacks;
  },

  // ---------- Witch Mark (ตราล่าเวท) ----------
  // เรียกจาก useSkill()'s gate — เตรียมเป้าหมาย 1 คน (คนอื่นเท่านั้น)
  prepareWitchMarkTarget(engine, p, targets) {
    const tgs = Array.isArray(targets) ? [...new Set(targets)] : [];
    const t = tgs.length === 1 ? engine.players[tgs[0]] : null;
    if (!t || !t.alive || t.id === p.id) return null;
    return t;
  },

  // เรียกจาก useSkill() ในส่วน effect — มาร์กเป้าหมาย (ย้ายมาร์กจากเป้าหมายเดิมถ้ามี)
  applyWitchMark(engine, p, target) {
    if (p.mageslayerMarkedId) {
      const old = engine.players[p.mageslayerMarkedId];
      if (old) { delete old.statuses.mageslayerMark; if (old.statusAmt) delete old.statusAmt.mageslayerMark; }
      p.mageslayerMarkedId = null;
    }
    if (!engine.applyDebuff(target, "mageslayerMark", null, 999)) {
      engine.log(`🛡️ ${target.name} ต้านสถานะผิดปกติ — ตราล่าเวทไม่ติด`);
      return " — ต้านสถานะผิดปกติ";
    }
    p.mageslayerMarkedId = target.id;
    p.mageslayerHasMarked = true;
    engine.triggerCutscene(p, "mageslayerWitchMark");
    engine.log(`🎯 ${p.name} Witch Mark — มาร์ก ${target.name} ด้วยตราล่าเวท (เคลื่อนย้ายได้ ถาวรจนกว่าจะย้าย/ถูกล้าง)`);
    return ` — มาร์ก ${target.name}`;
  },

  // ขโมยพลังงาน n หน่วย (ต่ำสุด 0 สูงสุดเท่าที่เป้าหมายมี) — direct assignment ทะลุ Song's Curse เสมอ — คืนจำนวนที่ขโมยได้จริง
  stealEnergy(engine, attacker, target, n) {
    const stolen = Math.max(0, Math.min(n, target.skillPoints || 0));
    if (stolen <= 0) return 0;
    target.skillPoints -= stolen;
    attacker.skillPoints = Math.min(engine.maxSkillOf(attacker), attacker.skillPoints + stolen);
    return stolen;
  },

  // เรียกจาก doAttack() หลังคำนวณดาเมจ (เฉพาะการโจมตีปกติของผู้สังหารจอมมหาเวทย์) — ขโมยพลังงาน(min1/max4) /
  //  ผนึกพลังงานถ้าเป้าหมายพลังงาน 0 ก่อนขโมย / เคลียร์ Fury stack ที่เพิ่งใช้ไปพร้อมดูดเลือด
  onAttackPostDamage(engine, attacker, target, dmg) {
    if (attacker.characterId !== "mageslayer") return;
    const targetEnergyBefore = target.skillPoints || 0; // เช็คก่อน Witch Mark ลดมันลง
    const wantSteal = Math.max(1, Math.min(4, dmg));
    const stolen = this.stealEnergy(engine, attacker, target, wantSteal);
    if (stolen > 0) engine.log(`🔮 ${attacker.name} Witch Mark — ขโมยพลังงาน ${target.name} ${stolen} หน่วย (ดาเมจ ${dmg} → min1/max4)`);
    if (targetEnergyBefore <= 0 && target.alive) {
      if (engine.applyDebuff(target, "manaSeal", null, MS_SEAL_TURNS)) {
        engine.log(`⛔ ${attacker.name} — ${target.name} พลังงาน 0 ตอนโดนโจมตีปกติ ติดผนึกพลังงาน ${MS_SEAL_TURNS} เทิร์น`);
      } else {
        engine.log(`🛡️ ${target.name} ต้านสถานะผิดปกติ — ไม่ติดผนึกพลังงาน`);
      }
    }
    const fury = attacker.statuses.mageslayerFury || 0;
    if (fury > 0) {
      const heal = engine.healHp(attacker, fury);
      delete attacker.statuses.mageslayerFury;
      if (attacker.statusAmt) delete attacker.statusAmt.mageslayerFury;
      engine.log(`😤 ${attacker.name} Fury — ใช้สต็อกโกรธ ${fury} หมดพร้อมกัน (ดาเมจ +${fury} ฟื้นเลือด +${heal}) แล้วเคลียร์สต็อก`);
    }
  },

  // เรียกจาก doAttack()'s evade branch — เป้าหมายหลบหลีกได้ยังถูกขโมยพลังงาน 1 หน่วยเสมอ
  onAttackDodgeSteal(engine, attacker, target) {
    if (attacker.characterId !== "mageslayer") return;
    const stolen = this.stealEnergy(engine, attacker, target, 1);
    if (stolen > 0) engine.log(`🔮 ${attacker.name} Witch Mark — ${target.name} หลบหลีกได้ แต่ยังถูกขโมยพลังงาน ${stolen} หน่วย`);
  },

  // เรียกจาก useSkill() ท้าย effect (ทุกครั้งที่มีผู้เล่นคนใดใช้สกิลสำเร็จ) — เป้าหมายที่ถูกมาร์กอยู่: 35% ขโมย 1 หน่วย
  //  หรือถ้าเป้าหมายเหลือ 0 หน่วยพอดี มอบผนึกพลังงานแทน
  onTargetUsedSkill(engine, p) {
    for (const ms of engine.alivePlayers()) {
      if (ms.characterId !== "mageslayer" || ms.id === p.id) continue;
      if (ms.mageslayerMarkedId !== p.id || !((p.statuses.mageslayerMark || 0) > 0)) continue;
      if (Math.random() >= MS_MARK_STEAL_CHANCE) continue;
      if ((p.skillPoints || 0) <= 0) {
        if (engine.applyDebuff(p, "manaSeal", null, MS_SEAL_TURNS)) {
          engine.log(`⛔ ${ms.name} ตราล่าเวท — ${p.name} ใช้สกิลแต่ไม่มีพลังงานให้ขโมย ติดผนึกพลังงาน ${MS_SEAL_TURNS} เทิร์นแทน`);
        }
        continue;
      }
      const stolen = this.stealEnergy(engine, ms, p, 1);
      if (stolen > 0) engine.log(`🔮 ${ms.name} ตราล่าเวท (35%) — ${p.name} ใช้สกิล โดนขโมยพลังงาน ${stolen} หน่วย`);
    }
  },

  // เรียกจาก server.js's bust/แต้มต่ำสุด trigger — Fury: 35% สะสมพลังโกรธ (สูงสุด 3) อิสระต่อกันทั้งสอง trigger
  onBustOrLoseRoll(engine, p) {
    if (p.characterId !== "mageslayer") return;
    if (Math.random() >= MS_FURY_CHANCE) return;
    p.statuses.mageslayerFury = Math.min(MS_FURY_MAX, (p.statuses.mageslayerFury || 0) + 1);
    engine.log(`😤 ${p.name} Fury — สะสมพลังโกรธ +1 (${p.statuses.mageslayerFury}/${MS_FURY_MAX})`);
  },

  // ---------- Mana Rupture (สกิลรอง — ทำงานหลังเปิดการ์ด) ----------
  prepareRuptureTarget(engine, p, targets) {
    const tgs = Array.isArray(targets) ? [...new Set(targets)] : [];
    const t = tgs.length === 1 ? engine.players[tgs[0]] : null;
    if (!t || !t.alive || t.id === p.id) return null;
    return t;
  },

  // เรียกจาก useSkill() ในส่วน effect — เล็งเป้าหมายไว้ก่อน (ผลทำงานหลังเปิดไพ่)
  applyRuptureEffect(engine, p, target, skillName) {
    if (engine.satoruOnTargeted(target, p, `สกิล ${skillName} `).negated) return " — ถูกลบล้าง";
    p.mageslayerRuptureTargetId = target.id;
    engine.log(`💥 ${p.name} Mana Rupture — เล็งเป้าหมาย ${target.name} ไว้ (ผลจะทำงานหลังทุกคนเปิดไพ่)`);
    return ` — เลือกเป้าหมาย ${target.name} (ผลจะทราบหลังเปิดไพ่)`;
  },

  // ตัดสินผล Mana Rupture ตามพลังงานเป้าหมาย ณ ตอนเปิดไพ่ (แยกฟังก์ชันเพื่อเทสต์ได้ตรงๆ)
  resolveManaRupture(engine, caster, target) {
    const e = target.skillPoints || 0;
    let dmg = 0, stunTurns = 0;
    if (e >= 7 && e <= 8) dmg = 1;
    else if (e >= 3 && e <= 6) dmg = 3;
    else if (e >= 1 && e <= 2) dmg = 5;
    else if (e === 0) { dmg = 5; stunTurns = target.characterId === "bard" ? 2 : 1; }
    engine.dealMixed(target, dmg, true);
    engine.maybeBeatSave(target); engine.maybeBeatMode(target); engine.maybeEva3(target); engine.maybeWakeKotone(target);
    target.wasAttacked = true;
    if (target.alive && target.hp <= 0) {
      engine.instantDeath(target);
      if (!target.alive) engine.log(`💀 ${target.name} เลือดจริงหมด ตกรอบ!`);
    }
    if (stunTurns > 0 && target.alive) {
      if (engine.applyDebuff(target, "stun", null, stunTurns)) {
        engine.log(`💥😵 ${caster.name} Mana Rupture — ${target.name} พลังงาน 0 รับดาเมจ -${dmg} และสตั้น ${stunTurns} เทิร์น${target.characterId === "bard" ? " (คีตกวี — สตั้นพิเศษ 2 เทิร์น)" : ""}`);
      } else {
        engine.log(`💥🛡️ ${caster.name} Mana Rupture — ${target.name} รับดาเมจ -${dmg} แต่ต้านสถานะผิดปกติ ไม่ติดสตั้น`);
      }
    } else {
      engine.log(`💥 ${caster.name} Mana Rupture — ${target.name} (พลังงาน ${e}) รับดาเมจ -${dmg}`);
    }
    caster.skillPoints = Math.min(engine.maxSkillOf(caster), caster.skillPoints + MS_RUPTURE_ENERGY_BACK); // ทะลุ Song's Curse เสมอ — ไม่ผ่าน addSkill
    engine.log(`🔋 ${caster.name} Mana Rupture — คืนพลังงาน +${MS_RUPTURE_ENERGY_BACK} (ทะลุ Song's Curse)`);
  },

  // เรียกจาก afterResolve() — ทำงานทุกคนที่เล็งเป้าหมายไว้ (ไพ่แตก = ใช้งานไม่ได้)
  resolveAllRuptures(engine) {
    for (const p of engine.alivePlayers()) {
      if (!p.mageslayerRuptureTargetId) continue;
      const t = engine.players[p.mageslayerRuptureTargetId];
      p.mageslayerRuptureTargetId = null;
      if (engine.bustedOf(p)) {
        engine.log(`💥 ${p.name} ไพ่แตก! Mana Rupture ใช้งานไม่ได้ — แต้มสกิลเสียฟรี`);
        continue;
      }
      if (!t || !t.alive) continue;
      this.resolveManaRupture(engine, p, t);
    }
  },

  // ---------- Mana Burden (ท่าไม้ตาย) ----------
  // เรียกจาก useSkill() ในส่วน effect — ทุกคน (รวมตัวเอง) ติดภาระเวท +1 (5 เทิร์น) — Bard ที่ติดตราล่าเวทอยู่ล้างไม่ได้แม้ต้านสถานะ
  applyManaBurden(engine, p) {
    for (const t of engine.alivePlayers()) {
      if (engine.resistActive(t)) {
        engine.log(`🛡️ ${t.name} ต้านสถานะผิดปกติ — ไม่ติดภาระเวทจาก Mana Burden`);
        continue;
      }
      t.statuses.spellburden = Math.max(t.statuses.spellburden || 0, 5);
      t.statusAmt = t.statusAmt || {};
      t.statusAmt.spellburden = Math.min(engine.SPELLBURDEN_MAX, (t.statusAmt.spellburden || 0) + 1);
      if (t.characterId === "bard" && (t.statuses.mageslayerMark || 0) > 0) {
        t.mageslayerLockedBurden = true;
        engine.log(`⛓️🔒 ${t.name} ติดตราล่าเวทอยู่ — ภาระเวทครั้งนี้ล้างไม่ได้แม้ต้านสถานะ`);
      }
      engine.log(`⛓️ ${p.name} Mana Burden — ${t.name} ติดภาระเวท +1 (สะสม ${t.statusAmt.spellburden}, 5 เทิร์น)`);
    }
  },
};
