// ============================================================
//  ริดดี้ มาร์เซนาส (patch 2.0.9 / 2.1.1 / 2.1.2) — Absorb Shield / แกไม่มีสิทธิ์มาสั่งสอนฉัน (ท่าไม้ตาย 1: NT-D เดี่ยว) /
//  ฉันจะไม่ยอมสูญเสียใครไปอีก (ท่าไม้ตาย 2: พันธมิตร) / สกิลติดตัว 1 (grudge -> NT-D ฟรี) / 2 (คงพันธมิตรจนจบเกม) /
//  3 (อย่าทิ้งฉันไป — Avenger) / ระบบพันธมิตรกับบานาจ ลิงก์ (Alliance)
//  ย้ายออกมาจาก server.js — ดู characters/index.js สำหรับไฟล์มัดรวม, characters/banagher.js สำหรับฝั่งบานาจ
//  หมายเหตุ: `riddheAllied`/`riddheGuardProtects`/`riddheFreeNtd`/`breakAlliance` ใน server.js ตอนนี้เป็นแค่
//  wrapper บางๆ ที่เรียกเข้ามาที่นี่ (เหมือน satoruOnTargeted) — เรียกจากที่เดิมได้เหมือนเดิมทุกจุด ไม่ต้องแก้ call site
//  ระบบยื่นข้อเสนอพันธมิตร/ตอบรับ/ยกเลิก (riddheChooseAlly/resolveAllyOffer/answerAllyOffer/answerAllyBreak/
//  answerAllyFinal) ยังอยู่ server.js ทั้งหมด เพราะเป็น pattern เดียวกับข้อเสนออื่นๆ ในเกม (Locacaca fruit ของ
//  satoru, สัญญาของ broadband_man) ที่ resolveRound()/checkAllLocked() เช็ครวมกัน — ดู satoru.js's หมายเหตุ
// ============================================================

const RIDDHE_NTD_TURNS = 5;        // ท่าไม้ตาย 1: NT-D System คงอยู่ 5 เทิร์น
const RIDDHE_GUARD_TURNS = 3;      // ท่าไม้ตาย 2: คงอยู่ 3 เทิร์น
const RIDDHE_GRUDGE_TURNS = 3;     // สกิลติดตัว 1: บานาจไม่โจมตีเราครบ 3 เทิร์น -> ทริกเกอร์
const RIDDHE_GUARD_ARMOR_LOST = 3; // ท่าไม้ตาย 2: เกราะ (เรา+บานาจ) เสียรวมถึง 3 -> ฟื้น +2 + วีดีโอพิเศษ
const RIDDHE_ABSORB_ARMOR = 2;     // Absorb Shield: ฟื้นเกราะชั่วคราว +2 (มีสำเนาใน server.js สำหรับ maxArmorOf)

module.exports = {
  id: "riddhe",

  // ดาเมจ contribution (Beam Magnum +2 / Beam Magnum Plus หรือ NT-D +1 / สกิลติดตัว 1,3 +1) — เรียกจาก computeAttackBase()
  damageBonus(engine, attacker, target, ctx) {
    const beam = (attacker.statuses.beam || 0) > 0;
    const beamPlusAtk = (attacker.statuses.beamplus || 0) > 0;
    const riddheNtdOn = (attacker.statuses.riddhentd || 0) > 0;
    const riddheUltBonus = (beamPlusAtk || riddheNtdOn) ? 1 : 0;
    const riddheP1Atk = !riddheNtdOn &&
      (attacker.riddheAvenger || (!this.allied(engine, attacker) && target.characterId === "banagher"));
    const riddheAvAtk = !!attacker.riddheAvenger;
    ctx.beam = beam;
    ctx.beamPlusAtk = beamPlusAtk;
    ctx.riddheNtdOn = riddheNtdOn;
    ctx.riddheUltBonus = riddheUltBonus;
    ctx.riddheP1Atk = riddheP1Atk;
    ctx.riddheAvAtk = riddheAvAtk;
    return (beam ? 2 : 0) + riddheUltBonus + (riddheP1Atk ? 1 : 0) + (riddheAvAtk ? 1 : 0);
  },

  // คู่พันธมิตรที่ยังมีผลอยู่ (ทั้งสองฝั่งยังมีชีวิตและลิงก์ตรงกัน) — เรียกผ่าน server.js's riddheAllied(p) wrapper
  allied(engine, p) {
    if (!p || !p.allyId) return null;
    const o = engine.players[p.allyId];
    return (o && o.alive && o.allyId === p.id) ? o : null;
  },

  // กันตาย (ท่าไม้ตาย 2): ริดดี้เองตายไม่ได้ระหว่างเปิด "ฉันจะไม่ยอมสูญเสียใครไปอีก" — เรียกผ่าน server.js's riddheGuardProtects(p) wrapper
  guardProtects(p) {
    if (!p || !p.alive || p.characterId !== "riddhe") return false;
    return (p.statuses.riddheguard || 0) > 0;
  },

  // สกิลติดตัว 1: ทริกเกอร์ท่าไม้ตาย 1 ฟรี — บานาจตีเรา หรือบานาจไม่ตีเราครบ 3 เทิร์น (1 ครั้งต่อเกม) — เรียกผ่าน server.js's riddheFreeNtd(r, compensate) wrapper
  freeNtd(engine, r, compensate) {
    if (!r || !r.alive || r.riddhePassiveUsed) return;
    r.riddhePassiveUsed = true;
    r.riddheGrudge = 0;
    r.statuses.riddhentd = Math.max(r.statuses.riddhentd || 0, RIDDHE_NTD_TURNS + (compensate ? 1 : 0));
    if (!r.riddheAvenger) r.beamAmmo = Math.min(engine.BEAM_AMMO, (r.beamAmmo || 0) + 1);
    r.transformAt = engine.nextTransformCounter();
    engine.queueCutscene(r, "riddhePassive"); // เล่นวีดีโอ banshee_passive.mp4 แล้ว NT-D ทำงานทันที
    engine.log(`⚡ ${r.name} — จะทำให้ฉันหน้าสมเพชอีกนานแค่ไหน! NT-D System เปิดขึ้นทันทีฟรี (${RIDDHE_NTD_TURNS} เทิร์น · โจมตีพื้นฐาน +1${r.riddheAvenger ? "" : " · กระสุน Beam +1"})`);
  },

  // ยกเลิกพันธมิตร: ล้างลิงก์ทั้งสองฝั่ง + ผลท่าไม้ตาย 2 ที่ค้างอยู่ — เรียกผ่าน server.js's breakAlliance(r, b) wrapper
  breakAlliance(engine, r, b) {
    if (r) {
      r.allyId = null;
      delete r.statuses.riddheguard;
      r.allyFinalAsk = false;
      r.allyBreakAsk = null;
    }
    if (b) {
      b.allyId = null;
      delete b.statuses.riddheward;
      b.allyBreakAsk = null;
    }
    if (r || b) engine.log(`💔 พันธมิตรบันชี × ยูนิคอร์นสิ้นสุดลง — ${r ? r.name : "ริดดี้"} กลับสู่เส้นทางเดี่ยว (ท่าไม้ตาย 1 / สกิลติดตัว 1 กลับมา)`);
  },

  // เรียกจาก dealRound() ต้นเทิร์น (roundNumber===1) — เจอบานาจบนสนาม -> ถามว่าจะยื่นข้อเสนอพันธมิตรไหม
  onRoundStartAlert(engine) {
    if (engine.roundNumber !== 1) return;
    for (const r of engine.alivePlayers()) {
      if (r.characterId !== "riddhe") continue;
      const foes = engine.alivePlayers().filter((o) => o.id !== r.id && o.characterId === "banagher");
      if (!foes.length) continue;
      r.allyPrompt = true;
      engine.queueCutscene(r, "riddheAlert");
      engine.log(`⚠️ ${r.name} ตรวจพบยูนิคอร์นบนสนาม — เลือกได้ว่าจะยื่นข้อเสนอเป็นพันธมิตรกับบานาจ หรือเดินเส้นทางเดี่ยว`);
    }
  },

  // เรียกจาก dealRound() ต้นเทิร์น (roundNumber>=2) — สกิลติดตัว 1: บานาจไม่โจมตีเราครบ 3 เทิร์น -> ท่าไม้ตาย 1 ฟรี
  onRoundStartGrudgeTick(engine) {
    if (engine.roundNumber < 2) return;
    for (const r of engine.alivePlayers()) {
      if (r.characterId !== "riddhe" || r.riddhePassiveUsed || this.allied(engine, r) || r.allyPrompt || r.allyOffer) continue;
      const foe = engine.alivePlayers().some((o) => o.id !== r.id && o.characterId === "banagher");
      if (!foe) { r.riddheGrudge = 0; continue; }
      r.riddheGrudge = (r.riddheGrudge || 0) + 1;
      if (r.riddheGrudge >= RIDDHE_GRUDGE_TURNS) this.freeNtd(engine, r, false);
    }
  },

  // เรียกจาก useSkill() ในส่วน effect — Absorb Shield: เพดานเกราะ +2 (ผ่าน maxArmorOf, server.js) พร้อมฟื้นเกราะชั่วคราว 2 หน่วย
  activateAbsorbShield(engine, p) {
    engine.healArmor(p, RIDDHE_ABSORB_ARMOR);
    engine.log(`🛡️🧲 ${p.name} Absorb Shield — เพดานเกราะ +${RIDDHE_ABSORB_ARMOR} ฟื้นเกราะ +${RIDDHE_ABSORB_ARMOR} (1 เทิร์น) และล่อเป้าการโจมตีทุกคนมาที่ตัวเองหลังเปิดไพ่`);
  },

  // เรียกจาก useSkill() ในส่วน effect — ท่าไม้ตาย 1 แกไม่มีสิทธิ์มาสั่งสอนฉัน: NT-D System 5 เทิร์น + โจมตีพื้นฐาน +1 + เติมกระสุน Beam +1
  activateNtd(engine, p) {
    delete p.riddheNtdLinked; // กดเอง = ตัดการผูกกับ NewType Paradise ของบานาจ (นับเป็นท่าไม้ตายของริดดี้เองแยกต่างหาก)
    p.beamAmmo = Math.min(engine.BEAM_AMMO, (p.beamAmmo || 0) + 1);
    p.transformAt = engine.nextTransformCounter();
    engine.triggerCutscene(p, "riddheNtd"); // เล่นวีดีโอ banshee_skill3.mp4 ทันทีก่อนเปิดไพ่
    engine.log(`⚡ ${p.name} แกไม่มีสิทธิ์มาสั่งสอนฉัน — เปิด NT-D System ${RIDDHE_NTD_TURNS} เทิร์น! โจมตีพื้นฐาน +1 และกระสุน Beam +1`);
  },

  // เรียกจาก useSkill() ในส่วน effect — ท่าไม้ตาย 2 ฉันจะไม่ยอมสูญเสียใครไปอีก: เกราะ+ต้านสถานะให้ทั้งคู่ + กันตายริดดี้เอง
  activateGuard(engine, p) {
    const b = this.allied(engine, p);
    if (b) {
      b.statuses.riddheward = RIDDHE_GUARD_TURNS;
      engine.healArmor(b, 2);
      b.statuses.resist = Math.max(b.statuses.resist || 0, RIDDHE_GUARD_TURNS);
    }
    engine.healArmor(p, 2);
    p.statuses.resist = Math.max(p.statuses.resist || 0, RIDDHE_GUARD_TURNS);
    p.beamAmmo = Math.min(engine.BEAM_AMMO, (p.beamAmmo || 0) + 1);
    p.riddheGuardArmorLost = 0;
    p.riddheGuardHealed = false;
    p.transformAt = engine.nextTransformCounter();
    engine.triggerCutscene(p, "riddheGuard"); // เล่นวีดีโอ banshee_skill3.2.mp4 ทันทีก่อนเปิดไพ่
    engine.log(`🛡️🤝 ${p.name} ฉันจะไม่ยอมสูญเสียใครไปอีก — ${RIDDHE_GUARD_TURNS} เทิร์น! เกราะสูงสุด +2 ฟื้นเกราะ +2 และต้านสถานะผิดปกติให้${b ? ` ${b.name} และ` : ""}ตัวเอง กระสุน Beam +1 — ${p.name} จะตายไม่ได้ (HP ต่ำสุด 1) แต่ริดดี้จั่ว/ใช้สกิล/โจมตีไม่ได้ระหว่างนี้`);
  },

  // เรียกจาก useSkill() ในส่วน effect (banagher's NewType Paradise cast) — มอบท่าไม้ตาย 1 ให้ริดดี้พันธมิตรฟรี (ผูกอายุกับ Paradise)
  //  คืน true ถ้ามอบสำเร็จ (ยังไม่เคยเปิด NT-D อยู่ก่อน) — banagher.js เรียกเมื่อ this.allied(engine,p) เจอพันธมิตรที่ยังไม่มี NT-D
  grantFreeNtdToAlly(engine, rAlly, byId) {
    if ((rAlly.statuses.riddhentd || 0) > 0) return false;
    rAlly.statuses.riddhentd = RIDDHE_NTD_TURNS;
    rAlly.riddheNtdLinked = byId;
    rAlly.transformAt = engine.nextTransformCounter();
    // ไม่เล่นวีดีโอ riddheNtd ที่นี่ (ขึ้นแค่ 2 วีดีโอพอ: paradise + banagherAlly) — เก็บวีดีโอเต็มครั้งแรกของริดดี้ไว้ให้ตอนกดท่าไม้ตาย 1 เองแบบปกติ
    engine.notifyTransform(rAlly, "riddheNtd"); // แจ้งเตือนเล็กๆ ไม่หยุดเกม
    return true;
  },

  // เรียกจาก doAttack() ตอนเลือกเป้าหมาย — Absorb Shield: หาผู้ล่อเป้า (คงสถานะ absorbplus อยู่ ไม่ถูกปิดสกิลติดตัว) คืน player หรือ null
  findTaunter(engine, attacker) {
    return this.findTaunters(engine, attacker)[0] || null;
  },
  findTaunters(engine, attacker) {
    return engine.alivePlayers().filter(
      (r) => r.id !== attacker.id && r.characterId === "riddhe" && (r.statuses.absorbplus || 0) > 0 && !engine.sealActive(r)
    );
  },

  // เรียกจาก doAttack() หลังคำนวณดาเมจ — สกิลติดตัว 1: บานาจโจมตีใส่เรา -> ท่าไม้ตาย 1 ทำงานทันทีฟรี (1 ครั้งต่อเกม)
  onAttackedByBanagher(engine, target) {
    if (!(target.characterId === "riddhe" && target.alive && !this.allied(engine, target) && !target.riddhePassiveUsed)) return;
    this.freeNtd(engine, target, true); // เล่นวีดีโอ banshee_passive.mp4 แล้ว NT-D ทำงานทันที
  },

  // เรียกจาก doAttack() หลังคำนวณดาเมจ — คู่พันธมิตรโจมตีกันเอง: ฝ่ายที่ถูกตีจะถูกถามว่ายกเลิกพันธมิตรไหม (เทิร์นถัดไป)
  checkAllyFriendlyFire(engine, attacker, target, hpBefore, armorBefore) {
    if (!(attacker.alive && target.alive && attacker.allyId === target.id && target.allyId === attacker.id &&
      ((attacker.characterId === "riddhe" && target.characterId === "banagher") ||
       (attacker.characterId === "banagher" && target.characterId === "riddhe")))) return;
    target.allyBreakAsk = {
      by: attacker.id,
      hp: Math.max(0, hpBefore - target.hp),
      armor: Math.max(0, armorBefore - target.armor),
    };
    engine.log(`🤝💥 ${attacker.name} โจมตีคู่พันธมิตรของตัวเอง — ${target.name} จะได้เลือกว่ายกเลิกพันธมิตรไหมในเทิร์นถัดไป (ยกเลิก = ฟื้นสิ่งที่เสียคืน)`);
  },

  // เรียกจาก endTurn() — ฉันจะไม่ยอมสูญเสียใครไปอีก: เกราะ (เรา+บานาจ) เสียรวมถึง 3 ระหว่างท่าทำงาน -> ฟื้นเกราะให้ทั้งคู่ +2 พร้อมวีดีโอพิเศษ (ครั้งเดียวต่อการเปิดท่า)
  onEndTurnGuardArmorTick(engine) {
    for (const r of Object.values(engine.players)) {
      if (!r.alive || r.characterId !== "riddhe" || (r.statuses.riddheguard || 0) <= 0) continue;
      const b = this.allied(engine, r);
      r.riddheGuardArmorLost = (r.riddheGuardArmorLost || 0) + (r.dmgArmor || 0) + (b ? (b.dmgArmor || 0) : 0);
      if (!r.riddheGuardHealed && r.riddheGuardArmorLost >= RIDDHE_GUARD_ARMOR_LOST) {
        r.riddheGuardHealed = true;
        engine.healArmor(r, 2);
        if (b) engine.healArmor(b, 2);
        engine.queueCutscene(r, "riddheLastShield"); // เล่นวีดีโอเต็มทุกครั้งที่ทริกเกอร์
        engine.log(`🛡️💥 ฉันจะไม่ยอมสูญเสียใครไปอีก — เกราะที่เสียถึง ${RIDDHE_GUARD_ARMOR_LOST} หน่วย! ${r.name}${b ? ` และ ${b.name}` : ""} ฟื้นเกราะ +2`);
      }
    }
  },

  // เรียกจาก endTurn() — สกิลติดตัว 3 อย่าทิ้งฉันไป: บานาจพันธมิตรตายระหว่างเกม -> Avenger ถาวร
  onEndTurnAvengerSweep(engine) {
    for (const r of Object.values(engine.players)) {
      if (!r.alive || r.characterId !== "riddhe" || r.riddheAvenger || !r.allyId) continue;
      const b = engine.players[r.allyId];
      if (b && !b.alive && b.allyId === r.id && b.characterId === "banagher") {
        r.riddheAvenger = true;
        r.allyId = null;
        b.allyId = null;
        delete r.statuses.riddheguard;
        delete b.statuses.riddheward;
        r.allyFinalAsk = false;
        r.allyBreakAsk = null;
        r.transformAt = engine.nextTransformCounter();
        engine.queueCutscene(r, "riddhePassive3");
        engine.log(`🖤 ${r.name} — อย่าทิ้งฉันไป... ${b.name} จากไปต่อหน้าต่อตา! พลังโจมตีถาวร +1 สกิลติดตัว 1 กลับมา (ใช้กับผู้เล่นทุกคน) ท่าไม้ตาย 1 กลับมาใช้ได้ (แต่ไม่เติมกระสุน Beam) และร่างบันชีดำมืดลงถาวร`);
      }
    }
  },

  // เรียกจาก endTurn() — คู่พันธมิตร/ข้อเสนอที่อีกฝ่ายหลุดจากเกมไปแล้ว -> ล้างทิ้ง
  onEndTurnOrphanCleanup(engine) {
    for (const p of Object.values(engine.players)) {
      if (p.allyId && !engine.players[p.allyId]) {
        p.allyId = null;
        delete p.statuses.riddheguard;
        delete p.statuses.riddheward;
        p.allyFinalAsk = false;
        p.allyBreakAsk = null;
      }
      if (p.allyOffer && (!p.alive || !engine.players[p.allyOffer] || !engine.players[p.allyOffer].alive)) p.allyOffer = null;
      if (p.allyBreakAsk && (!p.alive || !engine.players[p.allyBreakAsk.by])) p.allyBreakAsk = null;
    }
  },

  // เรียกจาก endTurn() — ริดดี้ที่ได้ NT-D System ไปฟรีจาก NewType Paradise — หมดพร้อมกัน (เว้นแต่กดแยกเองแล้ว)
  onEndTurnNtdLinkExpiry(engine) {
    for (const r of Object.values(engine.players)) {
      if (!r.riddheNtdLinked) continue;
      const b = engine.players[r.riddheNtdLinked];
      if (!b || !b.alive || !((b.statuses.paradise || 0) > 0)) {
        delete r.statuses.riddhentd;
        delete r.riddheNtdLinked;
      }
    }
  },

  // เรียกจาก buildStateFor() — popup ระบบพันธมิตรทั้ง 4 แบบที่ต้องโชว์ให้ "ผู้ชม state คนนี้" (viewer) เท่านั้น
  //  คืน object ให้ server.js เอาไป merge เข้า state ตรงๆ (แทนบล็อก if ที่เคยฝังอยู่กลาง buildStateFor เอง)
  buildViewerState(engine, viewer, bansheeImg) {
    let allyChoices = null;   // ริดดี้: เลือกบานาจที่จะยื่นข้อเสนอ (Event เริ่มเกม)
    let allyOfferAsk = null;  // บานาจ: ข้อเสนอพันธมิตรที่รอเราตอบ
    let allyBreakAsk = null;  // ฝ่ายถูกคู่พันธมิตรตี: ยกเลิกพันธมิตรไหม
    let allyFinalAsk = null;  // ริดดี้: เหลือแค่คู่พันธมิตร — ชนะทั้งคู่หรือสู้ต่อ
    if (viewer.characterId === "riddhe" && viewer.allyPrompt) {
      const foes = engine.alivePlayers()
        .filter((o) => o.id !== viewer.id && o.characterId === "banagher")
        .map((o) => ({ id: o.id, name: o.name, color: engine.POSITION_COLORS[o.position] || "#9B4F96", img: engine.displayImg(o) }));
      if (foes.length) allyChoices = foes;
    }
    const inviter = Object.values(engine.players).find((o) => o.alive && o.characterId === "riddhe" && o.allyOffer === viewer.id);
    if (inviter) allyOfferAsk = { fromId: inviter.id, from: inviter.name, color: engine.POSITION_COLORS[inviter.position] || "#9B4F96", img: bansheeImg };
    if (viewer.allyBreakAsk) {
      const by = engine.players[viewer.allyBreakAsk.by];
      allyBreakAsk = {
        from: by ? by.name : "คู่พันธมิตร",
        color: by ? (engine.POSITION_COLORS[by.position] || "#9B4F96") : "#9B4F96",
        hp: viewer.allyBreakAsk.hp || 0,
        armor: viewer.allyBreakAsk.armor || 0,
        img: bansheeImg,
      };
    }
    if (viewer.allyFinalAsk) {
      const b = this.allied(engine, viewer);
      if (b) allyFinalAsk = { partner: b.name, color: engine.POSITION_COLORS[b.position] || "#9B4F96", img: bansheeImg };
    }
    return { allyChoices, allyOfferAsk, allyBreakAsk, allyFinalAsk };
  },

  // เรียกจาก resolveRound()'s cutscene-queue callback — สกิลติดตัว 2: เหลือแค่คู่พันธมิตรบนสนาม -> ถามจะคงพันธมิตรจนจบเกมไหม
  maybeAskFinalAlliance(engine, stillAlive) {
    if (stillAlive.length !== 2) return;
    const r = stillAlive.find((p) => p.characterId === "riddhe");
    const b = r ? this.allied(engine, r) : null;
    if (!(r && b && b.characterId === "banagher" && !r.allyFinalAsk)) return;
    r.allyFinalAsk = true;
    engine.log(`🤝 สนามเหลือเพียง ${r.name} กับ ${b.name} — ${r.name} ต้องเลือกว่าจะคงพันธมิตร (ชนะทั้งคู่) หรือยกเลิกเพื่อสู้กันต่อ`);
  },
};
