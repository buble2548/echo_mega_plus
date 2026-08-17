// ============================================================
//  โอเบรอน (patch 1.7) — ม่านแห่งราตรี / รุ่งอรุณแห่งวันใหม่ / ฝันร้ายยามค่ำคืน / Lai Rhyme Goodfellow / Lie Like Vortigern
//  ย้ายออกมาจาก server.js — ดู characters/index.js สำหรับไฟล์มัดรวม
// ============================================================

module.exports = {
  id: "oberon",

  // ดาเมจ contribution (การหลับไหลอันไม่สิ้นสุด -1 / เคียวยมทูต +2 ใส่เป้าหมายที่หลับไหล) — veilAtk ไม่รวมที่นี่ เพราะแจกคนอื่นได้ด้วย ยังอยู่ computeAttackBase()
  damageBonus(engine, attacker, target, ctx) {
    let bonus = -1;
    if ((attacker.statuses.oberonSickle || 0) > 0 && (target.statuses.sleep || 0) > 0) bonus += 2;
    return bonus;
  },

  // เรียกจาก useSkill() ในส่วน effect (isVeil === true) — บัฟหมู่ก่อนเปิดการ์ด
  applyBasicVeil(engine, p) {
    for (const o of engine.alivePlayers()) {
      o.statuses.veil = Math.max(o.statuses.veil || 0, 2); // พลังโจมตี +1 คงอยู่ 2 เทิร์น (รวมตัวเอง)
      engine.healHp(o, 1);   // ฟื้นพลังชีวิตทุกคน +1 (รวมตัวเอง)
      engine.healArmor(o, 1); // ฟื้นเกราะทุกคน +1 (รวมตัวเอง)
      // ยามฟ้าสาง +2 ถาวร (สะสมสูงสุด 5) — คนที่กำลังหลับไหลจะไม่รับเพิ่ม (ผลก่อนหน้ายังไม่หมด)
      if (o.id !== p.id && !((o.statuses.sleep || 0) > 0)) o.statuses.dawn = Math.min(5, (o.statuses.dawn || 0) + 2);
    }
    engine.log(`🌙 ${p.name} ม่านแห่งราตรี — ทุกคนพลังโจมตี +1 (2 เทิร์น) ฟื้นเลือด/เกราะ +1 และติดยามฟ้าสาง +2 (ยกเว้นผู้ใช้/คนหลับ)`);
  },

  // เรียกจาก useSkill() ตรวจ+เตรียมเป้าหมาย รุ่งอรุณแห่งวันใหม่ (สกิลรองกลางวัน — เลือกตัวเองได้ ไม่มีคูลดาวน์)
  prepareSunriseTarget(engine, targets) {
    const tgs = Array.isArray(targets) ? [...new Set(targets)] : [];
    const t = tgs.length === 1 ? engine.players[tgs[0]] : null;
    if (!t || !t.alive) return null;
    return t;
  },

  // เรียกจาก useSkill() ในส่วน effect — ฮีล 5 แลกกับเสียเลือด 1/เทิร์น 2 เทิร์น (ไม่สนเกราะ) คืน flashSuffix
  applySunriseEffect(engine, p, sunriseTarget, skillName) {
    if (engine.satoruOnTargeted(sunriseTarget, p, `สกิล ${skillName} `).negated) return " — ถูกลบล้าง";
    const t = sunriseTarget;
    engine.healHp(t, 5);
    t.sunriseDrop = 2; // หลังจากนั้นลดลงรวม 2 หน่วย — หักเทิร์นละ 1 แบบไม่สนเกราะ (ไม่ถึงตาย ค้างที่ 1)
    // ยามฟ้าสาง +1 — ไม่ติดถ้าใช้กับตัวเอง หรือเป้าหมายกำลังหลับไหล (ผลก่อนหน้ายังไม่หมด)
    if (t.id !== p.id && !((t.statuses.sleep || 0) > 0)) t.statuses.dawn = Math.min(5, (t.statuses.dawn || 0) + 1);
    engine.log(`🌄 ${p.name} รุ่งอรุณแห่งวันใหม่ — ฟื้นพลังชีวิต ${t.name} +5 (2 เทิร์นถัดมาเสียเลือดเทิร์นละ 1 ไม่สนเกราะ)${t.id !== p.id && !(t.statuses.sleep > 0) ? " และติดยามฟ้าสาง +1" : ""}`);
    return ` — ใส่ ${t.name}`;
  },

  // เรียกจาก useSkill() ในส่วน effect — ฝันร้ายยามค่ำคืน (rework): self-buff ไม่มีเป้าหมาย
  //  สถานะ "เคียวยมทูต" ถูกใส่ให้อัตโนมัติผ่าน skill.effect (server.js's applyEffect) — ฟังก์ชันนี้มีหน้าที่แค่ log
  //  ผลจริง (โจมตีปกติใส่เป้าหมายที่หลับไหลแรงขึ้น +2) อยู่ใน damageBonus() ด้านบน
  activateNightmare(engine, p) {
    engine.log(`🌘 ${p.name} ฝันร้ายยามค่ำคืน — ได้รับสถานะ "เคียวยมทูต" 2 เทิร์น (โจมตีปกติใส่เป้าหมายที่หลับไหลจะแรงขึ้น +2 หน่วย)`);
  },

  // เรียกจาก resolveRound()'s afterReveal sweep (key === "lai") — Lai Rhyme Goodfellow (กลางวัน): โจมตีทุกคนไม่สนเกราะ
  applyLaiEffect(engine, p) {
    for (const o of engine.alivePlayers()) {
      if (o.id === p.id) continue;
      engine.dealDirect(o, 1);
      engine.maybeBeatSave(o);
      engine.maybeWakeKotone(o);
      o.statuses.awaken = Math.max(o.statuses.awaken || 0, 2); // +1 ชดเชยการลดสถานะตอนจบเทิร์น
      if (!((o.statuses.sleep || 0) > 0)) o.statuses.dawn = Math.min(3, (o.statuses.dawn || 0) + 1);
      o.wasAttacked = true;
    }
    engine.log(`🌞 Lai Rhyme Goodfellow! ${p.name} โจมตีทุกคน -1 (ไม่สนเกราะ) มอบสถานะ "การตื่นขึ้น" และยามฟ้าสาง +1`);
  },

  // เรียกจาก resolveRound()'s afterReveal sweep (key === "vortigern") — Lie Like Vortigern (กลางคืน): เกราะหมู่ + กล่อมคนติดยามฟ้าสางให้หลับไหล
  applyVortigernEffect(engine, p) {
    for (const o of engine.alivePlayers()) {
      if (o.id === p.id) continue;
      o.statuses.vortarmor = 3; // เพดานเกราะ +1 คงอยู่ 3 เทิร์น
      engine.healArmor(o, 1);
      const dawn = Math.min(5, o.statuses.dawn || 0); // ยามฟ้าสางสะสมได้ไม่เกิน 5 -> หลับสูงสุด 5 เทิร์น
      if (dawn > 0 && engine.resistActive(o)) {
        engine.log(`🛡️ ${o.name} ต้านสถานะผิดปกติ — ไม่หลับไหลจากคำลวงของราชาภูติ`);
      } else if (dawn > 0) {
        // เก็บจำนวนเทิร์นหลับตามจริง — sleepFresh กันการนับถอยหลังในเทิร์นที่เพิ่งโดนกล่อม
        o.statuses.sleep = dawn;
        o.sleepFresh = true;
        engine.log(`💤 ${o.name} ต้องคำลวงของราชาภูติ — หลับไหล ${dawn} เทิร์น!`);
      }
    }
    for (const o of Object.values(engine.players)) delete o.statuses.dawn; // ล้างยามฟ้าสางให้ทุกคน
    // ราตรีกลืนกิน: ฉากหลังกลางคืนกลายเป็นวีดีโอ + เพลงประจำตัวโอเบรอน จนกว่าจะหมดกลางคืน
    engine.setOberonDevour(engine.nextTransformCounter());
    // สนามของโอเบรอน (Rework): ต่อเวลากลางคืนไปอีก 3 เทิร์น จากตำแหน่งปัจจุบัน — ไม่ใช่รีเซ็ตไปจุดเริ่มคืนแบบเดิม
    engine.extendNight(3);
    engine.log(`🌑 Lie Like Vortigern! ${p.name} มอบเกราะ +1 ให้ทุกคน (3 เทิร์น) — ราตรีกลืนกิน และต่อเวลากลางคืนไปอีก 3 เทิร์น`);
  },

  // เรียกจาก dealRound() ตอนสลับกลางวัน/กลางคืน — ล้างราตรีกลืนกิน + เล่นคัตซีนเปลี่ยนร่างของโอเบรอนทุกคนบนสนาม
  onDayNightTransition(engine, night, roundNumber, prevNight) {
    if (!night && engine.oberonDevour) {
      engine.setOberonDevour(0); // ราตรีกลืนกิน หายไปเมื่อหมดกลางคืน
      engine.log("🌄 ราตรีกลืนกินจางหายไปพร้อมแสงแรกของวัน");
    }
    if (!night && prevNight) {
      // เข้าสู่เช้า: ผลการหลับไหลที่ผู้เล่นได้รับ (Lie Like Vortigern) หายไปทันที
      for (const o of Object.values(engine.players)) {
        if ((o.statuses.sleep || 0) > 0) delete o.statuses.sleep;
        o.sleepFresh = false;
      }
    }
    if (roundNumber > 1 && night !== prevNight) {
      for (const p of engine.alivePlayers()) {
        if (p.characterId !== "oberon") continue;
        if (night) engine.triggerCutscene(p, "oberonNight"); // ครั้งแรกเล่นวีดีโอ morning_tonight.mp4 / ครั้งถัดไปแจ้งเตือนเล็กๆ
        else engine.notifyTransform(p, "oberonDay");         // กลับร่างกลางวัน = แจ้งปกติ ไม่มีวีดีโอ
      }
    }
  },
};
