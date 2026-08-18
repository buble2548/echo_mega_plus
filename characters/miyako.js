// ============================================================
//  อาริมะ มิยาโกะ (patch 2.2.0) — พี่จ๋าอยู่ไหน / เพลงหมัด อาริมะ (คอมโบ) / หนูจะทำให้พี่ตาสว่างเอง (ท่าไม้ตาย: ไม่ยอมให้ฆ่าใครอีกแล้ว / ย๊ากก!)
//  ย้ายออกมาจาก server.js — ดู characters/index.js สำหรับไฟล์มัดรวม
//  หมายเหตุ: `miyakoKillChance`/`miyakoSurvivedKillAttempt`/`killSealed`/`hasKillCapability` ยังอยู่ server.js
//  เพราะเป็น shared infra ที่โทโนะ/นานายะ/ชิกิเรียกใช้ก่อนสังหารทันทีของตัวเอง (นั่นพี่จ๋าหรอ? ลดโอกาสถูกสังหาร)
//  MIYAKO_ATK_BONUS มีสำเนาที่นี่ (ใช้แค่ log) กับใน server.js (ใช้จริงใน doAttack's shared damage-sum — นอกขอบเขต Phase 1)
// ============================================================

const MIYAKO_HEAL_AMOUNT = 1;         // พี่จ๋าอยู่ไหน: ฟื้นพลังชีวิต +1 ทุกครั้งที่โจมตีปกติ
const MIYAKO_COMBO_CHANCE = [1, 1, 0.5, 0.25]; // เพลงหมัด อาริมะ: ครั้งที่ 1 ตีแน่นอน / ครั้งที่ 2 100% / ครั้งที่ 3 50% / ครั้งที่ 4 25%
const MIYAKO_FORCE_SCORE = 20;        // หนูจะทำให้พี่ตาสว่างเอง: บังคับแต้มการจั่วเป็น 20 ทันที (ไม่มีผลถ้ามีแต้ม 21 อยู่แล้ว)
const MIYAKO_SEAL_TURNS = 3;          // ไม่ยอมให้ฆ่าใครอีกแล้ว: ปิดใช้งานความสามารถสังหารทันทีของเป้าหมาย 3 เทิร์น
const MIYAKO_ATK_BONUS = 1;           // ย๊ากก!: เป้าหมายไม่มีความสามารถสังหาร -> พลังโจมตีถาวร +1 (ได้ครั้งเดียว ไม่สะสม — ใช้แค่ log ที่นี่)
// ย๊ากก!: เป้าหมายไม่มีความสามารถสังหาร -> ติดผุพัง (เกราะไม่ฟื้น) 5 เทิร์น — เดิมแยกเป็น armorSeal(5)+decay(3) สองสถานะซ้อนกัน
//  ทั้งคู่บล็อกเกราะฟื้นเหมือนกันเป๊ะ รวมเป็น decay ตัวเดียว ใช้ค่าที่ยาวกว่า (5) คงความแรงเดิมของท่าไม้ตายไว้
const MIYAKO_ULT_DECAY_TURNS = 5;

module.exports = {
  id: "miyako",

  // ดาเมจ contribution (ย๊ากก! +1 ระหว่างคอมโบ) — เรียกจาก computeAttackBase()
  damageBonus(engine, attacker, target, ctx) {
    const miyakoUltAtk = (attacker.statuses.miyakoUlt || 0) > 0;
    const miyakoAtkBonusOn = (attacker.statuses.yaak || 0) > 0 || miyakoUltAtk;
    ctx.miyakoUltAtk = miyakoUltAtk;
    ctx.miyakoAtkBonusOn = miyakoAtkBonusOn;
    return miyakoAtkBonusOn ? MIYAKO_ATK_BONUS : 0;
  },

  // เรียกจาก startMatch() — เจอ โทโนะ ชิกิ หรือ นานายะ ชิกิ ในเกมเดียวกัน -> เข้าคิว cutscene arimaShiki คืน true ถ้าเข้าคิวสำเร็จ
  maybeQueueRivalIntro(engine) {
    const miyako = Object.values(engine.players).find((p) => p.characterId === "miyako");
    const hasShikiRival = miyako && Object.values(engine.players).some((p) => p.id !== miyako.id && (p.characterId === "tohno" || p.characterId === "nanaya"));
    if (!hasShikiRival) return false;
    engine.queueCutscene(miyako, "arimaShiki");
    return true;
  },

  // เรียกจาก useSkill() ในส่วน effect — พี่จ๋าอยู่ไหน: การโจมตีปกติครั้งถัดไปฟื้นเลือด +1 (คงอยู่จนกว่าจะได้โจมตี)
  activateHeal(engine, p) {
    engine.log(`💗 ${p.name} พี่จ๋าอยู่ไหน — การโจมตีปกติครั้งถัดไปจะฟื้นพลังชีวิต +${MIYAKO_HEAL_AMOUNT}`);
  },

  // เรียกจาก useSkill() ในส่วน effect — เพลงหมัด อาริมะ: การโจมตีปกติครั้งถัดไปต่อคอมโบได้สูงสุด 4 ครั้ง
  activateCombo(engine, p) {
    p.miyakoComboHits = 1;
    engine.log(`🥊 ${p.name} เพลงหมัด อาริมะ — การโจมตีปกติครั้งถัดไปต่อคอมโบได้สูงสุด 4 ครั้ง (100%/75%/50%/25%)`);
  },

  // เรียกจาก useSkill() ในส่วน effect — หนูจะทำให้พี่ตาสว่างเอง (ท่าไม้ตาย): บังคับแต้มการจั่วเป็น 20 ทันที
  activateUlt(engine, p) {
    if (engine.calculateScore(p.cards) < MIYAKO_FORCE_SCORE) {
      engine.drawToScore(p, MIYAKO_FORCE_SCORE);
      engine.log(`🎯 ${p.name} หนูจะทำให้พี่ตาสว่างเอง — จั่วการ์ดจากกองกลางจนแต้มถึง ${MIYAKO_FORCE_SCORE} (ได้ ${engine.calculateScore(p.cards)} แต้ม${p.busted ? " — แตก!" : ""})`);
    } else {
      engine.log(`🎯 ${p.name} หนูจะทำให้พี่ตาสว่างเอง — แต้ม ${engine.calculateScore(p.cards)} อยู่แล้ว ไม่มีผลกับแต้มการจั่ว`);
    }
  },

  // เรียกจาก postAttackFollowup() (universal dispatcher) — เพลงหมัด อาริมะ: ต่อคอมโบตามโอกาสที่ลดหลั่นลงไป
  //  คืน true ถ้าเริ่มโจมตีต่อสำเร็จ (ผู้เรียกต้อง return ทันที), false ถ้าคอมโบขาดตอน/จบแล้ว (ผู้เรียกไปต่อ endTurn ตามปกติ)
  startComboReattack(engine, attacker) {
    if (!((attacker.statuses.miyakoCombo || 0) > 0)) return false;
    const hitsSoFar = attacker.miyakoComboHits || 1; // จำนวนครั้งที่ตีไปแล้ว (เริ่มที่ 1 หลังโจมตีครั้งแรก)
    if (hitsSoFar < MIYAKO_COMBO_CHANCE.length) {
      const chance = MIYAKO_COMBO_CHANCE[hitsSoFar]; // โอกาสของครั้งถัดไป
      if (Math.random() < chance) {
        const targets = engine.attackableTargets(attacker.id);
        if (targets.length > 0) {
          attacker.miyakoComboHits = hitsSoFar + 1;
          engine.log(`🥊 ${attacker.name} เพลงหมัด อาริมะ — ต่อคอมโบสำเร็จ! โจมตีต่อได้อีกครั้ง (ครั้งที่ ${hitsSoFar + 1} โอกาส ${Math.round(chance * 100)}%)`);
          engine.setAttackerId(attacker.id);
          engine.setGameState("ATTACK");
          engine.startPhaseTimer(engine.ATTACK_TIME, () => {
            delete attacker.statuses.miyakoCombo;
            delete attacker.statuses.miyakoHeal;
            delete attacker.statuses.yaak;
            attacker.miyakoComboHits = 0;
            engine.endTurn();
          });
          engine.broadcastState();
          return true;
        }
      } else {
        engine.log(`🥊 ${attacker.name} เพลงหมัด อาริมะ — คอมโบขาดตอน (โอกาส ${Math.round(chance * 100)}%)`);
      }
    }
    delete attacker.statuses.miyakoCombo;
    attacker.miyakoComboHits = 0;
    return false;
  },

  // เรียกจาก doAttack() — หนูจะทำให้พี่ตาสว่างเอง (ท่าไม้ตาย) โจมตีติด: เป้าหมายมีความสามารถสังหาร -> ปิดใช้งาน / ไม่มี -> ย๊ากก!
  resolveUltHit(engine, attacker, target) {
    engine.triggerCutscene(attacker, "miyakoUlt");
    delete attacker.statuses.miyakoUlt;
    if (!target.alive) return;
    const resisted = engine.resistActive(target);
    if (engine.hasKillCapability(target)) {
      if (resisted) {
        engine.log(`🛡️ ${target.name} ต้านสถานะผิดปกติ — ไม่ยอมให้ฆ่าใครอีกแล้วไม่มีผล`);
      } else {
        target.statuses.miyakoSeal = Math.max(target.statuses.miyakoSeal || 0, MIYAKO_SEAL_TURNS);
        engine.log(`🥊 ${attacker.name} ไม่ยอมให้ฆ่าใครอีกแล้ว — สั่งปิดใช้งานความสามารถในการสังหารทันทีของ ${target.name} เป็นเวลา ${MIYAKO_SEAL_TURNS} เทิร์น!`);
      }
    } else {
      if (!resisted) target.statuses.decay = Math.max(target.statuses.decay || 0, MIYAKO_ULT_DECAY_TURNS);
      attacker.statuses.yaak = 1;
      engine.log(resisted
        ? `🥊 ${attacker.name} ย๊ากก! — ${target.name} ต้านสถานะผิดปกติ ไม่ติดผุพัง แต่พลังโจมตี +${MIYAKO_ATK_BONUS} ยังคงมีผล (ตลอดคอมโบนี้ถ้ากำลังต่อเพลงหมัดอาริมะอยู่)`
        : `🥊 ${attacker.name} ย๊ากก! — ${target.name} ไม่มีความสามารถในการสังหารทันที พลังโจมตี +${MIYAKO_ATK_BONUS} (ตลอดคอมโบนี้ถ้ากำลังต่อเพลงหมัดอาริมะอยู่) และเกราะของ ${target.name} จะไม่ฟื้น ${MIYAKO_ULT_DECAY_TURNS} เทิร์น!`);
    }
  },

  // เรียกจาก doAttack() หลังคำนวณดาเมจแล้ว — พี่จ๋าอยู่ไหน: การโจมตีปกติฟื้นเลือดตัวเอง +1 ทุกครั้ง (รวมทุกครั้งของคอมโบ)
  applyHealOnHit(engine, attacker) {
    const heal = engine.healHp(attacker, MIYAKO_HEAL_AMOUNT);
    if (heal > 0) engine.log(`💗 ${attacker.name} พี่จ๋าอยู่ไหน — ฟื้นพลังชีวิต +${heal}`);
  },
};
