// ============================================================
//  ชเรด เอลัน (patch พิเศษ) — เชิญรับฟัง / แสงจันทร์ส่องวิญญาณ / รวมร่างทำนองเพลง (ท่าไม้ตาย 1: ร่างอควาเรียน สปาด้า) /
//  แด่เพื่อนรักของฉัน (ท่าไม้ตาย 2: ชาร์จแล้วระเบิดใส่ทุกคน)
//  ย้ายออกมาจาก server.js — ดู characters/index.js สำหรับไฟล์มัดรวม
//  หมายเหตุ: `shradeBgActive()`/`shradeCharging(p)`/`maybeMoonBurst(p)` ใน server.js ตอนนี้เป็นแค่ wrapper บางๆ
//  ที่เรียกเข้ามาที่นี่ (เหมือน riddheAllied) — เรียกจากที่เดิมได้เหมือนเดิมทุกจุด ไม่ต้องแก้ call site
//  `isNightRound`/`dayCycleIndex`/`morningBonusActive`/`bardDimCycle` (ระบบกลางวัน-กลางคืน) ยังอยู่ server.js
//  เพราะเป็น shared infra ที่ทุกตัวละครใช้ร่วมกัน — ชเรดแค่ *อ่าน* ผ่าน engine.isNightRound
//  บล็อก "แด่เพื่อนรักของฉัน" ปลดปล่อยระเบิด (snapshot ก่อนลูปลดสถานะ + resolve หลัง endTurn's death-check)
//  ยังอยู่ server.js เหมือนกับกลไก fourth/evaBlasts ของ eva13.js (ดู eva13.js — ไม่ย้าย pattern แบบนี้)
// ============================================================

const SHRADE_MELODY_MAX = 5;    // ท่วงทำนอง สะสมได้สูงสุด (ครบ 5 ถึงใช้ท่าไม้ตาย 1 ได้)
const SHRADE_ATK_BONUS = 2;     // ร่างอควาเรียน สปาด้า: พลังโจมตีพื้นฐาน +2 (เฉพาะกลางคืน)
const SHRADE_CHARGE_TURNS = 3;  // แด่เพื่อนรักของฉัน: ชาร์จ 3 เทิร์น (เสียเลือดเทิร์นละ 1)
const SHRADE_SPADA_NAME = "อควาเรียน สปาด้า";

module.exports = {
  id: "shrade_elan",

  // ดาเมจ contribution (ร่างอควาเรียน สปาด้า +2 กลางคืน) — เรียกจาก computeAttackBase()
  damageBonus(engine, attacker, target, ctx) {
    const shradeAtk = (attacker.shradeForm && engine.isNightRound(engine.roundNumber)) ? SHRADE_ATK_BONUS : 0;
    ctx.shradeAtk = shradeAtk;
    return shradeAtk;
  },

  // กำลังชาร์จแด่เพื่อนรักของฉันอยู่ไหม (จั่วเพิ่ม/ใช้สกิลอื่นไม่ได้ แต่ชนะจั่วยังตีได้) — เรียกผ่าน server.js's shradeCharging(p) wrapper
  charging(p) {
    return !!p && ((p.statuses && p.statuses.shradecharge) || 0) > 0;
  },

  // กลางคืน + มีชเรดร่างสปาด้ายังมีชีวิต = ฉากหลังราตรีของชเรด — เรียกผ่าน server.js's shradeBgActive() wrapper
  bgActive(engine) {
    return engine.isNightRound(engine.roundNumber) && Object.values(engine.players).some((p) => p.alive && p.shradeForm);
  },

  // แสงจันทร์ส่องวิญญาณ ร่างสปาด้า: เป้าหมายที่ถูกส่องแล้วไพ่แตกในเทิร์นนี้ -> รับความเสียหาย 1 หน่วยทันที — เรียกผ่าน server.js's maybeMoonBurst(p) wrapper
  maybeMoonBurst(engine, p) {
    if (!p || !p.alive) return;
    if (((p.statuses && p.statuses.moonmark) || 0) <= 0) return;
    if (!engine.bustedOf(p)) return;
    delete p.statuses.moonmark;
    engine.dealMixed(p, 1);
    engine.maybeBeatSave(p); engine.maybeBeatMode(p); engine.maybeEva3(p); engine.maybeWakeKotone(p);
    p.wasAttacked = true;
    engine.log(`🌕💥 แสงจันทร์ส่องวิญญาณ — ${p.name} ไพ่แตก! รับความเสียหาย -1 ทันที`);
    if (p.alive && p.hp <= 0) {
      engine.instantDeath(p);
      if (!p.alive) engine.log(`💀 ${p.name} เลือดจริงหมด ตกรอบ!`);
    }
  },

  // เรียกจาก dealRound() ตอนสลับเป็นกลางคืน — เสียงไพเราะที่กึกก้อง: เข้ากลางคืนพร้อมท่วงทำนองครบ 5 -> เล่นวีดีโอเปิดตัว
  onNightStart(engine) {
    for (const p of engine.alivePlayers()) {
      if (p.characterId !== "shrade_elan" || p.shradeForm) continue;
      if ((p.statuses.melody || 0) >= SHRADE_MELODY_MAX) engine.triggerCutscene(p, "shradePassive");
      engine.log(`🎻 ${p.name} เสียงไพเราะที่กึกก้อง — ราตรีปลดล็อกท่าไม้ตาย รวมร่างทำนองเพลง`);
    }
  },

  // เรียกจาก useSkill()'s gate — เตรียมเป้าหมาย แสงจันทร์ส่องวิญญาณ (คนอื่นเท่านั้น)
  prepareMoonTarget(engine, p, targets) {
    const tgs = Array.isArray(targets) ? [...new Set(targets)] : [];
    const t = tgs.length === 1 ? engine.players[tgs[0]] : null;
    if (!t || !t.alive || t.id === p.id) return null;
    return t;
  },

  // เรียกจาก useSkill() ในส่วน effect — เชิญรับฟัง: ฟื้นเลือด 1 + เกราะ 1 (+ท่วงทำนอง +1 เฉพาะร่างปกติ) คืน flashSuffix
  applyBasicEffect(engine, p) {
    engine.healHp(p, 1);
    if (p.shradeForm) {
      engine.log(`🎻 ${p.name} เชิญรับฟัง — ฟื้นพลังชีวิต +1`);
      return undefined;
    }
    engine.healArmor(p, 1);
    p.statuses.melody = Math.min(SHRADE_MELODY_MAX, (p.statuses.melody || 0) + 1);
    engine.log(`🎻 ${p.name} เชิญรับฟัง — ฟื้นพลังชีวิต +1 เกราะ +1 และท่วงทำนอง +1 (สะสม ${p.statuses.melody}/${SHRADE_MELODY_MAX})`);
    return ` — ท่วงทำนอง ${p.statuses.melody}/${SHRADE_MELODY_MAX}`;
  },

  // เรียกจาก useSkill() ในส่วน effect — แสงจันทร์ส่องวิญญาณ: เปิดแต้มการ์ดเป้าหมายให้ทุกคนเห็น (ร่างปกติ: ท่วงทำนอง +2 / ร่างสปาด้า: moonmark) คืน flashSuffix
  applyMoonEffect(engine, p, t, skillName) {
    if (engine.satoruOnTargeted(t, p, `สกิล ${skillName} `).negated) return " — ถูกลบล้าง";
    const resisted = engine.resistActive(t);
    if (!resisted) t.statuses.promo = 1; // กลไกเดียวกับใบโปรโมทสินค้า: ทุกคนเห็นแต้มการ์ดตลอดเทิร์นนี้
    if (!p.shradeForm) {
      p.statuses.melody = Math.min(SHRADE_MELODY_MAX, (p.statuses.melody || 0) + 2);
      engine.log(resisted
        ? `🛡️ ${t.name} ต้านสถานะผิดปกติ — ไม่ถูกเปิดแต้มการ์ด — ${p.name} ยังได้ท่วงทำนอง +2 (สะสม ${p.statuses.melody}/${SHRADE_MELODY_MAX})`
        : `🌕 ${p.name} แสงจันทร์ส่องวิญญาณ — เปิดแต้มการ์ดของ ${t.name} ให้ทุกคนเห็น และท่วงทำนอง +2 (สะสม ${p.statuses.melody}/${SHRADE_MELODY_MAX})`);
    } else {
      if (!resisted) t.statuses.moonmark = 1; // แตกเมื่อไหร่ เจ็บ 1 ทันที (หมดผลตอนจบเทิร์น)
      engine.log(resisted
        ? `🛡️ ${t.name} ต้านสถานะผิดปกติ — แสงจันทร์ส่องวิญญาณ (สปาด้า) ไม่มีผล`
        : `🌕 ${p.name} แสงจันทร์ส่องวิญญาณ (สปาด้า) — เปิดแต้มการ์ดของ ${t.name} ให้ทุกคนเห็น หากไพ่แตกในเทิร์นนี้จะรับความเสียหาย 1 หน่วยทันที`);
    }
    engine.triggerCutscene(p, "shradeMoon"); // ครั้งแรกเล่นวีดีโอ shrade_skill2.mp4 / ครั้งถัดไปแจ้งเตือนเล็กๆ
    if (engine.hasQueuedCutscene()) engine.pausePlayingForCutscene();
    return ` — ส่องวิญญาณ ${t.name}`;
  },

  // เรียกจาก useSkill() ในส่วน effect — รวมร่างทำนองเพลง (ท่าไม้ตาย 1): ร่างอควาเรียน สปาด้า ถาวร + รีเซ็ตกลางคืนใหม่ 3 เทิร์น
  activateForm(engine, p) {
    p.shradeForm = true;
    engine.setNightResetPending(true); // ราตรีเริ่มนับใหม่ เหลืออีก 3 เทิร์นนับจากเทิร์นถัดไป (แบบ Vortigern)
    delete p.statuses.melody; // ท่วงทำนองถูกหลอมรวมเป็นบทเพลง
    p.transformAt = engine.nextTransformCounter();
    engine.log(`🎼 ${p.name} รวมร่างทำนองเพลง — กลายเป็น ${SHRADE_SPADA_NAME}! พลังโจมตีพื้นฐาน +${SHRADE_ATK_BONUS} (เฉพาะกลางคืน) และราตรีเริ่มนับใหม่ 3 เทิร์น`);
    engine.triggerCutscene(p, "shradeForm");
    if (engine.hasQueuedCutscene()) engine.pausePlayingForCutscene();
    return ` — ${SHRADE_SPADA_NAME}`;
  },

  // เรียกจาก useSkill() ในส่วน effect — แด่เพื่อนรักของฉัน (ท่าไม้ตาย 2): เริ่มชาร์จ 3 เทิร์น
  activateFinal(engine, p) {
    // ต้านสถานะผิดปกติของตัวเอง (ถ้ามีติดอยู่ตอนกด) จะกันชาร์จท่าไม้ตายนี้ไม่ให้เริ่มด้วย — ตามกฎเดียวกับดีบัฟทุกตัวในเกม
    if (engine.resistActive(p)) {
      engine.log(`🛡️ ${p.name} ต้านสถานะผิดปกติของตัวเอง — แด่เพื่อนรักของฉัน เริ่มชาร์จไม่ได้`);
      return;
    }
    p.statuses.shradecharge = SHRADE_CHARGE_TURNS + 1; // +1 ชดเชยการลดสถานะตอนจบเทิร์น
    p.transformAt = engine.nextTransformCounter();
    engine.log(`🎻 ${p.name} แด่เพื่อนรักของฉัน — เริ่มบรรเลงบทเพลงสุดท้าย! อีก ${SHRADE_CHARGE_TURNS} เทิร์นจะปลดปล่อย (ระหว่างนี้จั่ว/ใช้สกิลไม่ได้)`);
    engine.triggerCutscene(p, "shradeCharge"); // เล่นวีดีโอ shrade_final2.1.mp4 ทันที
    if (engine.hasQueuedCutscene()) engine.pausePlayingForCutscene();
  },
};
