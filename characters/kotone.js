// ============================================================
//  ฟุจิตะ โคโตเนะ (patch 1.9.1 / rework 2.1.3 / 2.2.2) — Part-time (กระปุกออมสิน) / สกิลรอง (เพลงฝึกซ้อม) /
//  Sleeping time (สกิลรอง 2 กลางคืน) / [โหมงานหนัก] / ท่านประธานเซนะจัง / Sekai ichi kawaii watashi (ท่าไม้ตาย)
//  ย้ายออกมาจาก server.js — ดู characters/index.js สำหรับไฟล์มัดรวม
//  หมายเหตุ: `maybeWakeKotone(t)` ใน server.js เป็นฟังก์ชันที่ไม่ทำอะไรแล้ว (no-op ถาวรตาม comment เดิม
//  "คงฟังก์ชัน/จุดเรียกไว้เผื่อใช้ในอนาคต") — จงใจไม่ย้าย/ไม่ลบ เพราะมีตัวละครอื่นอีก ~9 จุดเรียกผ่าน
//  engine.maybeWakeKotone(...) เป็นส่วนหนึ่งของ post-damage hook chain มาตรฐาน (maybeBeatSave/Mode/Eva3/
//  WakeKotone) — ลบออกจะกระทบไฟล์ตัวละครอื่นที่แยกไปแล้วหลายตัว ความเสี่ยงไม่คุ้มกับการลบโค้ดที่ตายไปแล้ว
//  หมายเหตุ 2: `p.overworkNext` มีแค่จุดอ่าน/เคลียร์ (ตอนต้นเทิร์น + ตอนใช้ Sleeping time) แต่ไม่มีจุดไหนตั้งเป็น
//  true เลยในโค้ดปัจจุบัน — ดูเหมือนกลไกที่เคยตั้งค่านี้ถูกถอดออกไปแล้วในแพตช์ก่อนหน้า (โค้ดกำพร้า) — ย้ายมาตามเดิม
//  โดยไม่แก้ พฤติกรรมเดิม (ไม่เคยทำงาน) ยังคงเหมือนเดิมทุกประการ ไม่ได้ "ซ่อม" ให้ระหว่างการแยกไฟล์นี้
// ============================================================

const KOTONE_COIN_MAX = 6;         // กระปุกออมสินน้องหมูน้อย เก็บ coin ได้สูงสุด
const KOTONE_COIN_PER_DMG = 2;     // 2 coin = +1 ความเสียหายตอนโจมตี (มีสำเนาใน server.js สำหรับ doAttack's shared damage-sum)
const KOTONE_SENA_BASE = 0.1;      // โอกาสเจอท่านประธานเซนะจังเมื่อใช้สกิลใดๆ (ฐาน 10%)
const KOTONE_SENA_PER_COIN = 0.05; // เพิ่มอีก 5% ทุกๆ 1 coin ที่มีอยู่ในกระปุก
const KOTONE_STUN_CHANCE = 0.1;    // [โหมงานหนัก]: โอกาสสุ่มสตั้นต่อเทิร์น
const KOTONE_KAWAII_DMG = 3;       // ท่าไม้ตาย: ความเสียหายใส่ทุกคน (ยกเว้นตัวเอง)
const KOTONE_KAWAII_STUN_TURNS = 2; // ท่าไม้ตาย: ทุกคนติดสตั้น
const KOTONE_COIN_GAIN_MAX = 3;    // Part-time: ได้ coin แบบสุ่ม 1-3 เหรียญต่อครั้ง
const KOTONE_DANCE_COIN_COST = 3;  // สกิลรอง: ต้องมี coin อย่างน้อยเท่านี้ถึงใช้ได้ — หักเท่านี้ตอนใช้
const KOTONE_DANCE_ATK_BONUS = 2;  // สกิลรอง: บัฟพลังโจมตีพื้นฐาน +2 ในการโจมตีครั้งถัดไป
const KOTONE_PIERCE_BURDEN_TURNS = 2; // สกิลรอง: ภาระเวท (แต้มสกิล +1) มีผลเทิร์นถัดไปเทิร์นเดียว
const KOTONE_KSLEEP_TURNS = 3;     // Sleeping time: หลับนิ่ง 3 เทิร์นตายตัว
const KOTONE_KSLEEP_HEAL = 2;      // Sleeping time: ฮีลตัวเองทันทีตอนใช้สกิล (ครั้งเดียว)
const KOTONE_KSLEEP_SEAL_TURNS = 1; // Sleeping time: ศัตรูไม่สามารถโจมตี(เลือกเป็นเป้าหมาย)ได้ 1 เทิร์นแรกของการหลับ

module.exports = {
  id: "kotone",

  // ดาเมจ contribution (เพลงฝึกซ้อม +2 / กระปุกออมสิน 2 coin=+1 / [โหมงานหนัก] ล้าง pigDmg) — เรียกจาก computeAttackBase()
  damageBonus(engine, attacker, target, ctx) {
    const kotoneAtk = (attacker.statuses.kotoneAtk || 0) > 0;
    const kotoneExhausted = this.overworkActive(attacker) && !engine.isNightRound(engine.roundNumber);
    let pigDmg = Math.floor((attacker.coins || 0) / KOTONE_COIN_PER_DMG);
    if (kotoneExhausted) pigDmg = 0;
    ctx.kotoneAtk = kotoneAtk;
    ctx.kotoneExhausted = kotoneExhausted;
    ctx.pigDmg = pigDmg;
    return (kotoneAtk ? KOTONE_DANCE_ATK_BONUS : 0) + pigDmg;
  },

  // [โหมงานหนัก] ทำงานอยู่ไหม (คงอยู่จนกว่าจะใช้ Sleeping time ตอนกลางคืน) — เรียกผ่าน server.js's overworkActive(p) wrapper
  overworkActive(p) {
    return !!p && ((p.statuses && p.statuses.overwork) || 0) > 0;
  },

  // โอกาสเจอท่านประธานเซนะจัง: ฐาน 10% + 5% ทุกๆ 1 coin — เรียกผ่าน server.js's kotoneSenaChance(p) wrapper
  senaChance(p) {
    return KOTONE_SENA_BASE + KOTONE_SENA_PER_COIN * (p.coins || 0);
  },

  // เรียกจาก dealRound() ต้นเทิร์น — [โหมงานหนัก] ติดสถานะ (จุดอ่าน p.overworkNext — ดูหมายเหตุด้านบนเรื่องโค้ดกำพร้า)
  onRoundStartOverworkTrigger(engine, p) {
    if (!p.overworkNext) return;
    p.overworkNext = false;
    p.statuses.overwork = 2; // คงอยู่ 2 เทิร์น — Sleeping time ลบก่อนได้
    p.shield = 0;
    engine.log(`🥵 ${p.name} ติดสถานะ [โหมงานหนัก] 2 เทิร์น — โล่พังทั้งหมด ฟื้นโล่ไม่ได้ ใช้แต้มสกิลเพิ่ม 1 และเสี่ยงสตั้น 10% ทุกเทิร์น`);
  },

  // เรียกจาก dealRound() ต้นเทิร์น — Sleeping time / [เช้าที่สดใส] / ท่านประธานเซนะจัง / [โหมงานหนัก] สุ่มสตั้น
  onRoundStartTick(engine, p) {
    if ((p.statuses.ksleep || 0) > 0) {
      p.locked = true;
      engine.log(`😴 ${p.name} หลับพักผ่อนอยู่ (เหลืออีก ${p.statuses.ksleep} เทิร์น)`);
    }
    if ((p.statuses.fresh || 0) > 0) {
      engine.addSkill(p, 1);
      if (!this.overworkActive(p)) {
        p.shield += 1;
        engine.log(`🌅 ${p.name} เช้าที่สดใส — แต้มสกิล +1 และโล่ +1`);
      } else {
        engine.log(`🌅 ${p.name} เช้าที่สดใส — แต้มสกิล +1 (โล่ฟื้นไม่ได้เพราะ [โหมงานหนัก])`);
      }
    }
    if (p.senaNext) {
      p.senaNext = false;
      p.statuses.sena = 1;
      p.locked = true;
      engine.log(`🏃‍♀️ ${p.name} มัวแต่หลบหนีท่านประธานเซนะจัง — ทำอะไรไม่ได้เลยทั้งเทิร์น!`);
    }
    if (this.overworkActive(p) && !p.locked && Math.random() < KOTONE_STUN_CHANCE) {
      if (engine.applyDebuff(p, "stun", null, 1)) {
        p.locked = true;
        engine.log(`😵 ${p.name} หมดแรงจาก [โหมงานหนัก] — สตั้น ขยับไม่ได้ทั้งเทิร์น!`);
      } else {
        engine.log(`😵🛡️ ${p.name} หมดแรงจาก [โหมงานหนัก] แต่ต้านสถานะผิดปกติไว้ได้ — ไม่ติดสตั้น`);
      }
    }
  },

  // เรียกจาก useSkill() ในส่วน effect — Part-time: เสียเลือด 1 (ไม่ตาย) ได้ coin สุ่ม 1-3 คืน flashSuffix
  applyPartTimeEffect(engine, p) {
    if (p.hp > 1 || (p.tempHp || 0) > 0) engine.loseHp(p);
    const roll = 1 + Math.floor(Math.random() * KOTONE_COIN_GAIN_MAX);
    const gained = Math.min(KOTONE_COIN_MAX, (p.coins || 0) + roll) - (p.coins || 0);
    p.coins = (p.coins || 0) + gained;
    engine.log(`🐷 ${p.name} Part-time — เสียพลังชีวิต 1 หน่วย ได้ coin +${gained} (สุ่มได้ ${roll} · สะสม ${p.coins}/${KOTONE_COIN_MAX})`);
    return ` — coin +${gained} (มี ${p.coins}/${KOTONE_COIN_MAX})`;
  },

  // เรียกจาก useSkill() ในส่วน effect — สกิลรอง: หัก coin 3 เหรียญ -> บัฟพลังโจมตีพื้นฐาน +2 ในการโจมตีครั้งถัดไป + ภาระเวท
  applyDanceEffect(engine, p) {
    p.coins = Math.max(0, (p.coins || 0) - KOTONE_DANCE_COIN_COST);
    p.statuses.kotoneAtk = 1; // คงอยู่จนกว่าจะได้โจมตี (ไม่ลดเทิร์น — เหมือน empower)
    p.statusAmt = p.statusAmt || {};
    p.statuses.spellburden = Math.max(p.statuses.spellburden || 0, KOTONE_PIERCE_BURDEN_TURNS);
    p.statusAmt.spellburden = Math.min(engine.SPELLBURDEN_MAX, (p.statusAmt.spellburden || 0) + 1);
    engine.log(`💃 ${p.name} ใช้ coin ${KOTONE_DANCE_COIN_COST} เหรียญฝึกซ้อม — การโจมตีครั้งถัดไปพลังโจมตี +${KOTONE_DANCE_ATK_BONUS} (เทิร์นถัดไปใช้แต้มสกิลเพิ่ม +1 — เหลือ coin ${p.coins})`);
  },

  // เรียกจาก useSkill() ในส่วน effect — Sleeping time: หลับนิ่ง 3 เทิร์นตายตัว + ลบ [โหมงานหนัก] + ฮีลตัวเองทันที + กันถูกเลือกโจมตี
  applyKSleepEffect(engine, p) {
    p.statuses.ksleep = KOTONE_KSLEEP_TURNS;
    p.statuses.seal = Math.max(p.statuses.seal || 0, KOTONE_KSLEEP_SEAL_TURNS); // ศัตรูไม่สามารถโจมตีได้ 1 เทิร์น
    p.nightWork = 0;
    p.overworkNext = false;
    if (this.overworkActive(p)) {
      delete p.statuses.overwork;
      engine.log(`😌 ${p.name} ได้นอนพักเสียที — สถานะ [โหมงานหนัก] หายไป`);
    }
    const heal = engine.healHp(p, KOTONE_KSLEEP_HEAL);
    engine.log(`😴 ${p.name} Sleeping time — หลับ ${KOTONE_KSLEEP_TURNS} เทิร์น ฟื้นพลังชีวิต +${heal} และศัตรูไม่สามารถเลือกโจมตีได้ 1 เทิร์นแรก (ตื่นแล้วรับ [เช้าที่สดใส])`);
  },

  // เรียกจาก useSkill() ในส่วน effect (ทุกครั้งที่ใช้สกิลไม่ว่าตัวไหน) — ข้อเสียโคโตเนะ: โอกาสเจอท่านประธานเซนะจัง
  maybeTriggerSena(engine, p) {
    if (Math.random() >= this.senaChance(p)) return;
    p.senaNext = true;
    engine.log(`😱 ${p.name} เจอท่านประธานเซนะจัง!! — หลบหนีสุดชีวิต เทิร์นถัดไปจะทำอะไรไม่ได้เลย`);
    if (!p.cutsceneShown.kotoneSena) {
      p.cutsceneShown.kotoneSena = true;
      engine.queueCutscene(p, "kotoneSena");
      engine.pausePlayingForCutscene(); // เล่นวีดีโอทันทีช่วงจั่วการ์ด (แบบ MonsterLive)
    } else {
      engine.notifyTransform(p, "kotoneSena");
    }
  },

  // เรียกจาก afterResolve()'s afterReveal-activation loop — Sekai ichi kawaii watashi (ท่าไม้ตาย): ตีหมู่ทุกคน + สตั้น
  activateKawaii(engine, p) {
    engine.log(`💖 Sekai ichi kawaii watashi! ${p.name} ขึ้นไลฟ์สุดน่ารักใส่ทุกคน!`);
    for (const t of engine.alivePlayers()) {
      if (t.id === p.id) continue;
      engine.dealMixed(t, KOTONE_KAWAII_DMG);
      engine.maybeBeatSave(t); engine.maybeBeatMode(t); engine.maybeEva3(t);
      t.wasAttacked = true;
      let stunMsg = "";
      if (t.alive) {
        if (engine.resistActive(t)) {
          engine.log(`🛡️ ${t.name} ต้านสถานะผิดปกติ — ไม่ติดสตั้น`);
        } else {
          t.statuses.stun = Math.max(t.statuses.stun || 0, KOTONE_KAWAII_STUN_TURNS);
          stunMsg = ` และสตั้น ${KOTONE_KAWAII_STUN_TURNS} เทิร์น`;
        }
      }
      engine.log(`💖 ${t.name} โดนไลฟ์ -${KOTONE_KAWAII_DMG}${stunMsg}`);
      if (t.alive && t.hp <= 0) {
        engine.instantDeath(t);
        if (!t.alive) engine.log(`💀 ${t.name} เลือดจริงหมด ตกรอบ!`);
      }
    }
  },

  // เรียกจาก doAttack() หลังคำนวณดาเมจ — สกิลรอง: บัฟพลังโจมตีพื้นฐาน +2 ใช้แล้วหมดไปทันทีเมื่อได้โจมตี
  onAttackConsumeDanceBuff(engine, attacker) {
    if (!((attacker.statuses.kotoneAtk || 0) > 0)) return;
    delete attacker.statuses.kotoneAtk;
    engine.log(`💃 ${attacker.name} เพลงฝึกซ้อม — การโจมตีนี้ +${KOTONE_DANCE_ATK_BONUS} (บัฟหมดลง)`);
  },

  // เรียกจาก doAttack() — กระปุกออมสินน้องหมูน้อย: ทุบกระปุกจ่ายเป็นดาเมจ (pigDmg คำนวณใน shared damage-sum แล้ว)
  onAttackConsumeCoins(engine, attacker, pigDmg) {
    if (!(pigDmg > 0)) return;
    attacker.coins -= pigDmg * KOTONE_COIN_PER_DMG;
    engine.log(`🐷 ${attacker.name} ทุบกระปุกออมสินน้องหมูน้อย — ใช้ ${pigDmg * KOTONE_COIN_PER_DMG} coin เพิ่มความเสียหาย +${pigDmg} (เหลือ ${attacker.coins})`);
  },

  // เรียกจาก endTurn() — [โหมงานหนัก]: โล่พังทั้งหมดตอนจบเทิร์น (ฟื้นไม่ได้)
  onEndTurnOverworkShieldWipe(p) {
    if (this.overworkActive(p)) p.shield = 0;
  },

  // เรียกจาก status-decay loop's expiry handler — Sleeping time ตื่นเอง -> รับ [เช้าที่สดใส] 3 เทิร์น
  onSleepExpire(p) {
    p.statuses.fresh = 3;
  },
};
