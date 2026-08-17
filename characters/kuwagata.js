// ============================================================
//  คุวากาตะโอเจอร์ (patch 2.2 alpha) — Rainbow Pudding + Beat Mode
//  ย้ายออกมาจาก server.js — ดู characters/index.js สำหรับไฟล์มัดรวม
//  หมายเหตุ: maybeBeatSave() ใน server.js เป็น universal dispatcher ที่เรียกกลับเข้ามาที่
//  tryDeathSave() ของทุกตัวละครที่มีกลไกกันตาย (ตอนนี้มี kuwagata + takuto — ดู characters/takuto.js)
// ============================================================

const KUWAGATA_PUDDING_FULL_AT = 3;      // Rainbow Pudding: กินครบทุกๆ 3 ครั้ง = อิ่ม
const KUWAGATA_PUDDING_NODRAW_TURNS = 2; // อิ่ม: จั่วการ์ดเพิ่มไม่ได้ 2 เทิร์น
const KUWAGATA_BEAT_FORTUNE = 3;         // Beat Mode กันตายทำงาน: มอบโชคลาภ 3 หน่วย
const KUWAGATA_RACHAN_TURNS = 5;         // สวมเกราะราชัน: คงอยู่ 5 เทิร์น (เดิมถาวร)
const KUWAGATA_RACHAN_ATK = 1;           // สวมเกราะราชัน (คิงโอเจอร์): พลังโจมตีปกติ +1
const KUWAGATA_RACHAN_FORTUNE = 2;       // สวมเกราะราชัน: มอบโชคลาภ 2 หน่วย
const KUWAGATA_OHGER_DECAY_TURNS = 3;    // Ohger Finish: โจมตีโดนเป้าหมาย -> ติดผุพัง 3 เทิร์น

module.exports = {
  id: "kuwagata",

  // ดาเมจ contribution (สวมเกราะราชัน/คิงโอเจอร์ +1 / Ohger Finish +1) — เรียกจาก computeAttackBase()
  damageBonus(engine, attacker, target, ctx) {
    const rachanAtk = (attacker.statuses.rachan || 0) > 0 ? KUWAGATA_RACHAN_ATK : 0;
    const ohger = (attacker.statuses.ohger || 0) > 0;
    ctx.rachanAtk = rachanAtk;
    ctx.ohger = ohger;
    ctx.ohgerBonus = ohger ? 1 : 0;
    return rachanAtk + (ohger ? 1 : 0);
  },

  // เรียกจาก useSkill() ในส่วน effect (isPudding === true — สกิลพื้นฐาน กินได้ไม่จำกัดจำนวนครั้ง)
  applyBasicPudding(p, log) {
    p.puddingCount = (p.puddingCount || 0) + 1;
    if (p.puddingCount % KUWAGATA_PUDDING_FULL_AT === 0) {
      p.statuses.nodraw = Math.max(p.statuses.nodraw || 0, KUWAGATA_PUDDING_NODRAW_TURNS);
      p.noDrawNext = Math.max(p.noDrawNext || 0, KUWAGATA_PUDDING_NODRAW_TURNS);
      log(`🍮 ${p.name} กิน Rainbow Pudding ครบ ${p.puddingCount} ชิ้น — อิ่ม! จั่วการ์ดเพิ่มไม่ได้ ${KUWAGATA_PUDDING_NODRAW_TURNS} เทิร์น`);
    }
  },

  // เรียกจาก server.js's beatActive(p) — พลังชีวิต < 3 = อยู่ในประกายเขี้ยวปฏิปักษ์ (ปิดใช้งานได้ด้วย nanaya's seal)
  isBeatActive(engine, p) {
    return !!p && p.alive && p.hp < 3 && !engine.passiveSealed(p);
  },

  // เรียกจาก server.js's maybeBeatMode(p) — เข้าสู่ Beat Mode ครั้งแรก (เล่นวีดีโอ passive + ตั้งร่างถาวรจนตาย)
  maybeEnterBeatMode(engine, p) {
    if (!p || !p.alive) return;
    if (p.hp < 1 || p.hp >= 3) return;      // ต้องเหลือ 1-2 หน่วย (0 = กำลังจะตาย)
    if (p.seen && p.seen.beat) return;       // เข้าแล้วครั้งเดียวพอ (ถาวรจนตาย)
    p.seen.beat = true;
    p.transformAt = engine.nextTransformCounter();
    p.beatAt = p.transformAt; // ล็อกลำดับตอนเข้า Beat (ให้เพลง ex_guts ไม่รีสตาร์ทตอนแปลงร่างอื่นทีหลัง)
    const firstTime = !p.cutsceneShown.beat;
    engine.triggerCutscene(p, "beat");
    if (firstTime) engine.queueTransformAnnounce(p, "beat"); // วีดีโอ -> ประกาศเปลี่ยนร่าง (ระเบิดเขียว + เสียงพากย์)
    engine.log(`⚡ ${p.name} เข้าสู่ประกายเขี้ยวปฏิปักษ์ (Beat Mode)!`);
  },

  // เรียกจาก server.js's maybeBeatSave(p) (universal dispatcher) — ทำงานทันทีเมื่อความเสียหายถึงตาย ครั้งเดียวต่อเกม
  tryDeathSave(engine, p) {
    p.hp = 1;
    p.beatSaved = true;
    p.armorLocked = true;
    p.statuses.fortune = Math.min(engine.BARD_FORTUNE_MAX, (p.statuses.fortune || 0) + KUWAGATA_BEAT_FORTUNE);
    p.fortuneIdle = 0;
    engine.log(`🛡️⚡ ${p.name} ประกายเขี้ยวปฏิปักษ์ — รอดจากความเสียหายถึงตาย! (กันตายได้ครั้งเดียว) ได้รับโชคลาภ +${KUWAGATA_BEAT_FORTUNE}`);
    return true;
  },

  // เรียกจาก useSkill() ในส่วน effect (st === "rachan") — สวมเกราะราชัน: แปลงร่างคิงโอเจอร์ทันทีก่อนเปิดไพ่ + โชคลาภ
  applyRachanEffect(engine, p) {
    // แปลงร่างคิงโอเจอร์ทันทีก่อนเปิดไพ่ทั้งหมด (patch 2.2.1 alpha — วีดีโอ/ภาพ/เพลง/ลำดับความสำคัญ)
    //  เดิมทั้งหมดนี้ผูกกับ p.seen.rachan ซึ่งเคยถูกตั้งค่าใน afterResolve() sweep หลังเปิดไพ่เท่านั้น
    const rachanFirstTime = !p.cutsceneShown.rachan;
    p.seen.rachan = true;
    p.transformAt = engine.nextTransformCounter();
    engine.triggerCutscene(p, "rachan");
    if (rachanFirstTime) engine.queueTransformAnnounce(p, "rachan");
    p.statuses.fortune = Math.min(engine.BARD_FORTUNE_MAX, (p.statuses.fortune || 0) + KUWAGATA_RACHAN_FORTUNE);
    p.fortuneIdle = 0;
    engine.log(`👑 ${p.name} สวมเกราะราชัน — เปลี่ยนร่างเป็นคิงโอเจอร์ ${KUWAGATA_RACHAN_TURNS} เทิร์น พลังโจมตีปกติ +${KUWAGATA_RACHAN_ATK} และได้รับโชคลาภ +${KUWAGATA_RACHAN_FORTUNE}`);
  },

  // เรียกจาก doAttack() หลังคำนวณดาเมจแล้ว (ohger === true) — โอเจอร์ชาร์จ: มอบผุพังให้เป้าหมาย ใช้แล้วหมดไป
  onAttackConsumeOhger(engine, attacker, target) {
    delete attacker.statuses.ohger;
    if (!target.alive) return;
    target.statuses.decay = Math.max(target.statuses.decay || 0, KUWAGATA_OHGER_DECAY_TURNS);
    engine.log(`👑 ${attacker.name} โอเจอร์ชาร์จ — โจมตี +1 และมอบผุพังให้ ${target.name} ${KUWAGATA_OHGER_DECAY_TURNS} เทิร์น (เกราะไม่ฟื้น)!`);
  },
};
