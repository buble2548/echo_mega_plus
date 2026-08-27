// ============================================================
//  แบทแมน (เบน แอฟเฟล็ก) (patch 2.2.7) — เร้นเงา / นายลืมของน่ะ / เข้ามาเลย / อัศวินรัตติกาล
//  เขียนแยกไฟล์ตั้งแต่ต้น (ไม่เคยอยู่ใน server.js) — ดู characters/index.js สำหรับไฟล์มัดรวม
//
//  หมายเหตุ: กลไก 2 อย่างของตัวนี้เกาะกับ shared infra ของ server.js จึงมี call site อยู่ที่นั่นด้วย
//    1) เร้นเงาหมดเวลาเอง -> onStealthExpire() ถูกเรียกจากลูปลดเทิร์นสถานะใน endTurn()
//       (แพทเทิร์นเดียวกับ "wither" ของเรียวกิ ชิกิ)
//    2) กรรมถึงตัว (batKarma) รอเลือกเป้าหมายส่งต่อความเสียหาย -> p.batKarmaAsk + socket handler
//       'batKarmaSend' ยังอยู่ server.js (แพทเทิร์นเดียวกับ phenexReleaseAsk ของริต้า เบอร์นัล)
//
//  patch 2.2.7.1: เร้นเงาไม่มีข้อเสียเมื่อโดนความเสียหายอีกแล้ว — เดิมโดนตีทีเดียวสถานะสลายทันที
//  (กับดักไม่ทำงาน + ฮีลหยุด) ตอนนี้อยู่ครบ 3 เทิร์นเสมอ ฮีล +1 ทุกเทิร์นไม่มีเงื่อนไข และจบด้วยกับดักเสมอ
//  จึงไม่มี onDamaged() แล้ว (เอา hook ออกจาก loseHp()/loseArmor() ใน server.js ด้วย)
// ============================================================

const BAT_STEALTH_TURNS = 3;          // เร้นเงา: คงอยู่ 3 เทิร์น
const BAT_STEALTH_HEAL = 1;           // เร้นเงา: ฟื้นพลังชีวิต +1 ต่อเทิร์น (ไม่มีเงื่อนไข — โดนตีก็ยังฟื้น)
const BAT_STEALTH_BURST_DMG = 1;      // เร้นเงาหมดเวลาเอง: ความเสียหาย 1 หน่วยใส่ผู้เล่นทุกคน (รวมตัวเอง)
const BAT_STEALTH_SILENCE_TURNS = 3;  // เร้นเงาหมดเวลาเอง: [ห้ามใช้สกิล] 3 เทิร์น ให้ทุกคนยกเว้นตัวเอง
const BAT_KARMA_TURNS = 2;            // กรรมถึงตัว: คงอยู่ 2 เทิร์น (ทำงานได้ 1 ครั้งแล้วหายไป · ราคา 4 แต้ม)
const BAT_KARMA_ULT_BONUS = 1;        // กรรมถึงตัว + เข้ามาเลย: ความเสียหายที่ส่งต่อ +1
const BAT_TAUNT_TURNS = 5;            // เข้ามาเลย: ล่อเป้าทุกคน 5 เทิร์น
const BAT_TAUNT_HEAL = 1;             // เข้ามาเลย: ฟื้นพลังชีวิต +1 ต่อเทิร์น
const BAT_NIGHT_GOLD = 1;             // อัศวินรัตติกาล: กลางคืนได้เหรียญ +1 ต่อเทิร์น
const BAT_NIGHT_ATK = 1;              // อัศวินรัตติกาล: กลางคืนพลังโจมตี +1
const BAT_PROFILE_IMG = "/characters/bat_ben/bat_ben.webp";
const BAT_SKILL2_IMG = "/characters/bat_ben/bat_ben_skill2.jpg";

module.exports = {
  id: "bat_ben",
  STEALTH_TURNS: BAT_STEALTH_TURNS,
  KARMA_TURNS: BAT_KARMA_TURNS,
  TAUNT_TURNS: BAT_TAUNT_TURNS,
  PROFILE_IMG: BAT_PROFILE_IMG,

  // ดาเมจ contribution — เรียกจาก computeAttackBase(): อัศวินรัตติกาล กลางคืนพลังโจมตี +1
  damageBonus(engine, attacker, target, ctx) {
    const batNightAtk = attacker.characterId === "bat_ben" &&
      engine.isNightRound(engine.roundNumber) && !engine.passiveSealed(attacker);
    ctx.batNightAtk = batNightAtk;
    return batNightAtk ? BAT_NIGHT_ATK : 0;
  },

  // ---------- สกิลติดตัว อัศวินรัตติกาล ----------
  // กันตายตอนกลางคืน 1 ครั้งต่อ "1 รอบกลางคืน" (รีใหม่เมื่อเข้ากลางคืนรอบถัดไป) — เรียกผ่าน maybeBeatSave()
  //  ตั้งใจไม่เซ็ต p.beatSaved (ต่างจากตัวละครอื่น) เพราะ beatSaved เป็นแฟลก "ครั้งเดียวต่อเกม" ที่จะปิดการกันตายถาวร
  tryDeathSave(engine, p) {
    if (p.characterId !== "bat_ben") return false;
    if (!engine.isNightRound(engine.roundNumber)) return false;
    const night = engine.nightCycleIndex(engine.roundNumber);
    if (p.batNightSaveUsedAt === night) return false; // คืนนี้ใช้ไปแล้ว — รอคืนถัดไป
    p.batNightSaveUsedAt = night;
    p.hp = 1;
    engine.log(`🦇🌙 ${p.name} อัศวินรัตติกาล — ราตรีปกป้องไว้! รอดจากความเสียหายถึงตาย เลือดค้างที่ 1 (กันตาย 1 ครั้งต่อ 1 คืน · คืนถัดไปกันได้อีก)`);
    return true;
  },

  // ต้นเทิร์น: เหรียญกลางคืน / ฟื้นเลือดจากเร้นเงา / ฟื้นเลือดจากเข้ามาเลย — เรียกจาก dealRound()
  onRoundStartTick(engine, p) {
    if (p.characterId !== "bat_ben" || !p.alive) return;
    // อัศวินรัตติกาล: กลางคืนได้เหรียญ +1 ต่อเทิร์น
    if (engine.isNightRound(engine.roundNumber) && !engine.passiveSealed(p)) {
      const before = p.gold || 0;
      engine.addGold(p, BAT_NIGHT_GOLD);
      if (p.gold > before) engine.log(`🦇🌙 ${p.name} อัศวินรัตติกาล — ราตรีคือถิ่นของเขา เหรียญ +${p.gold - before} (มี ${p.gold})`);
    }
    // เร้นเงา: ฟื้นพลังชีวิต +1 ทุกเทิร์นที่ยังซ่อนอยู่ (patch 2.2.7.1: ไม่มีเงื่อนไข "ต้องไม่โดนตี" แล้ว)
    if ((p.statuses.batStealth || 0) > 0) {
      const heal = engine.healHp(p, BAT_STEALTH_HEAL);
      engine.log(`🌑 ${p.name} เร้นเงา — พรางตัวอยู่ในความมืด ฟื้นพลังชีวิต +${heal} (เหลืออีก ${p.statuses.batStealth} เทิร์น · โจมตีไม่ได้ระหว่างนี้)`);
    }
    // เข้ามาเลย: ฟื้นพลังชีวิต +1 ต่อเทิร์นตลอดที่ล่อเป้าอยู่
    if ((p.statuses.batTaunt || 0) > 0) {
      const heal = engine.healHp(p, BAT_TAUNT_HEAL);
      engine.log(`🦇 ${p.name} เข้ามาเลย — ยิ่งเจ็บยิ่งแกร่ง ฟื้นพลังชีวิต +${heal} (เหลืออีก ${p.statuses.batTaunt} เทิร์น)`);
    }
  },

  // ---------- สกิลพื้นฐาน เร้นเงา ----------
  // เรียกจาก useSkill()'s gate — เร้นเงายังทำงานอยู่ กดซ้ำไม่ได้ (ไม่งั้นต่ออายุหนีการระเบิดได้เรื่อยๆ)
  canCastStealth(p) {
    return !((p.statuses.batStealth || 0) > 0);
  },

  // เรียกจาก useSkill() ในส่วน effect (สถานะ batStealth ถูก applyEffect ตั้งให้แล้ว) — แถมหลบหลีก 1 สแตค
  activateStealth(engine, p) {
    const got = engine.grantEvadeStack(p);
    engine.log(`🌑 ${p.name} เร้นเงา — หายเข้าไปในความมืด ${BAT_STEALTH_TURNS} เทิร์น! ${got ? `ได้รับหลบหลีก +1 · ` : `(หลบหลีกเต็มเพดานแล้ว) · `}ฟื้นพลังชีวิต +${BAT_STEALTH_HEAL} ต่อเทิร์น (โดนโจมตีก็ไม่หลุด) — โจมตีไม่ได้ระหว่างนี้ และเมื่อหมดเวลาจะออกจากเงามืดพร้อมกับดักเสมอ`);
  },

  // เรียกจากลูปลดเทิร์นสถานะใน endTurn() ตอน batStealth หมดเวลา
  //  -> เล่นวีดีโอ แล้วระเบิด 1 หน่วยใส่ทุกคน + [ห้ามใช้สกิล] 3 เทิร์นให้ทุกคนยกเว้นตัวเอง
  //  patch 2.2.7.1: ทำงานเสมอเมื่อครบ 3 เทิร์น — ไม่มีทางถูกยกเลิกด้วยการโดนโจมตีอีกแล้ว
  onStealthExpire(engine, p) {
    if (p.characterId !== "bat_ben") return;
    engine.triggerCutscene(p, "batStealthBurst"); // bat_ben_skill1.mp4
    engine.log(`🌑💥 ${p.name} เร้นเงาหมดเวลา — ออกจากเงามืดพร้อมกับดัก! ความเสียหาย ${BAT_STEALTH_BURST_DMG} หน่วยใส่ผู้เล่นทุกคน`);
    for (const o of engine.alivePlayers()) {
      engine.dealMixed(o, BAT_STEALTH_BURST_DMG); // ลดเกราะก่อน ถ้าไม่มีเกราะจึงเข้าเลือดจริง (โดนตัวเองด้วย)
      o.wasAttacked = true;
      engine.maybeBeatSave(o); engine.maybeBeatMode(o); engine.maybeEva3(o); engine.maybeWakeKotone(o);
      if (o.id === p.id) continue;
      if (engine.resistActive(o)) {
        engine.log(`🛡️ ${o.name} ต้านสถานะผิดปกติ — ไม่ติด [ห้ามใช้สกิล] จากกับดักของ ${p.name}`);
        continue;
      }
      o.statuses.noskill = Math.max(o.statuses.noskill || 0, BAT_STEALTH_SILENCE_TURNS);
      engine.log(`🚫 ${o.name} ติด [ห้ามใช้สกิล] ${BAT_STEALTH_SILENCE_TURNS} เทิร์น จากกับดักของ ${p.name}`);
    }
    for (const o of Object.values(engine.players)) {
      if (o.alive && o.hp <= 0) {
        engine.instantDeath(o);
        if (!o.alive) engine.log(`💀 ${o.name} เลือดจริงหมด ตกรอบ!`);
      }
    }
  },

  // ---------- สกิลรอง นายลืมของน่ะ ----------
  // เรียกจาก useSkill()'s gate — ยังมีกรรมถึงตัวค้างอยู่/ยังรอเลือกเป้าหมายส่งต่อ = กดซ้ำไม่ได้
  canCastKarma(p) {
    return !((p.statuses.batKarma || 0) > 0) && !p.batKarmaAsk;
  },

  // เรียกจาก useSkill() ในส่วน effect (สถานะ batKarma ถูก applyEffect ตั้งให้แล้ว)
  activateKarma(engine, p) {
    engine.log(`🎁 ${p.name} นายลืมของน่ะ — ตั้งรับ ${BAT_KARMA_TURNS} เทิร์น: ความเสียหายจากการถูกโจมตีครั้งถัดไปจะไม่เข้าตัวเอง แต่เลือกส่งต่อให้ผู้เล่น 1 คนแทน (ทำงานได้ 1 ครั้งแล้วหายไป)`);
  },

  // เรียกจาก doAttack() หลังคำนวณดาเมจ ก่อนลงความเสียหายจริง — คืน true ถ้าดูดซับไว้แล้ว (ผู้เรียกต้อง return ทันที)
  tryKarmaAbsorb(engine, attacker, target, dmg) {
    if (!(target.characterId === "bat_ben" && (target.statuses.batKarma || 0) > 0 && target.alive && attacker.id !== target.id)) return false;
    delete target.statuses.batKarma; // ทำงานได้ครั้งเดียวต่อการกด — ดูดซับแล้วหายทันที
    if (target.statusAmt) delete target.statusAmt.batKarma;
    const tauntOn = (target.statuses.batTaunt || 0) > 0;
    const carried = Math.max(0, dmg) + (tauntOn ? BAT_KARMA_ULT_BONUS : 0);
    const pool = engine.alivePlayers().filter((o) => o.id !== target.id);
    target.wasAttacked = true;
    attacker.wasAttacked = true; // ผู้โจมตีลงมือไปแล้ว — เข้ามาเลยจะไม่สะท้อนซ้ำ (ความเสียหายถูกยกไปทั้งก้อน)
    engine.log(`🎁 ${target.name} นายลืมของน่ะ — รับความเสียหาย ${dmg} หน่วยจาก ${attacker.name} ไว้เต็มๆ แต่ไม่เข้าตัวเอง${tauntOn ? ` (เข้ามาเลยทำงานอยู่ — ส่งต่อ +${BAT_KARMA_ULT_BONUS})` : ""} เตรียมส่งคืน ${carried} หน่วย`);
    if (!pool.length || carried <= 0) {
      engine.log(`🎁 ${target.name} นายลืมของน่ะ — ไม่มีใครให้ส่งต่อ ความเสียหายสลายไปเฉยๆ`);
    } else {
      target.batKarmaAsk = { dmg: carried, from: attacker.id, options: pool.map((o) => o.id) };
    }
    engine.setLastAttack({
      byName: attacker.name, byImg: engine.displayImg(attacker), byColor: engine.POSITION_COLORS[attacker.position] || "#888",
      byDoomWeapon: attacker.characterId === "doomguy" ? attacker.doomWeapon : undefined,
      targetName: target.name, targetImg: engine.displayImg(target), targetColor: engine.POSITION_COLORS[target.position] || "#888",
      dmg: 0, reflect: true,
      skills: [{ name: `นายลืมของน่ะ — รับไว้ ${carried} หน่วย`, img: BAT_SKILL2_IMG, by: target.name, color: engine.POSITION_COLORS[target.position] || "#888", side: "def" }],
    });
    engine.runCutsceneQueue(() => {
      engine.setGameState("ATTACKING");
      engine.startPhaseTimer(engine.ATTACKFX_TIME, () => engine.runCutsceneQueue(engine.endTurn));
      engine.broadcastState();
    });
    return true;
  },

  // ส่งความเสียหายที่รับไว้ต่อให้เป้าหมายที่เลือก — เรียกจาก socket handler 'batKarmaSend' และจาก
  //  auto-resolve ตอนเปิดไพ่รอบถัดไป (ไม่ตอบ = สุ่มให้) ทั้งคู่อยู่ใน server.js
  resolveKarmaSend(engine, p, target, dmg) {
    if (!target || !target.alive || dmg <= 0) {
      engine.log(`🎁 ${p.name} นายลืมของน่ะ — ไม่มีเป้าหมายให้ส่งต่อ ความเสียหาย ${dmg} หน่วยสลายไป`);
      return;
    }
    engine.triggerCutscene(p, "batKarmaSend"); // bat_ben_skill2.mp4 — เล่นก่อนความเสียหายเกิดขึ้น
    engine.dealMixed(target, dmg); // ไม่ผ่านระบบหลบหลีกปกติ — ของที่ลืมไว้ต้องถึงมือเจ้าตัวเสมอ (ยังลดเกราะก่อน)
    target.wasAttacked = true;
    engine.maybeBeatSave(target); engine.maybeBeatMode(target); engine.maybeEva3(target); engine.maybeWakeKotone(target);
    engine.log(`🎁💥 ${p.name} นายลืมของน่ะ — ส่งความเสียหาย ${dmg} หน่วยคืนให้ ${target.name} (ไม่สนการหลบหลีก)!`);
    if (target.alive && target.hp <= 0) {
      engine.instantDeath(target);
      if (!target.alive) engine.log(`💀 ${target.name} เลือดจริงหมด ตกรอบ!`);
    }
  },

  // ---------- ท่าไม้ตาย เข้ามาเลย ----------
  // เรียกจาก useSkill() ในส่วน effect (สถานะ batTaunt ถูก applyEffect ตั้งให้แล้ว)
  activateTaunt(engine, p) {
    p.transformAt = engine.nextTransformCounter(); // เพลง bat_ben_theme ใช้ลำดับล่าสุด (กรณีมีแบทแมนหลายคน)
    engine.triggerCutscene(p, "batTaunt"); // bat_ben_skill3.mp4 -> เพลง bat_ben_theme เล่นค้าง
    engine.log(`🦇 ${p.name} เข้ามาเลย — ล่อเป้าหมายการโจมตีของทุกคนมาที่ตัวเอง ${BAT_TAUNT_TURNS} เทิร์น! ความเสียหายที่โดนจะเกิดกับผู้โจมตีด้วยเท่ากัน · ฟื้นพลังชีวิต +${BAT_TAUNT_HEAL} ต่อเทิร์น · ใช้คู่กับนายลืมของน่ะ ความเสียหายที่ส่งต่อ +${BAT_KARMA_ULT_BONUS}`);
  },

  // เรียกจาก doAttack() ตอนเลือกเป้าหมาย — หาผู้ล่อเป้า คืน player หรือ null (แพทเทิร์นเดียวกับริดดี้/ริต้า)
  findTaunter(engine, attacker) {
    return this.findTaunters(engine, attacker)[0] || null;
  },
  findTaunters(engine, attacker) {
    return engine.alivePlayers().filter(
      (r) => r.id !== attacker.id && r.characterId === "bat_ben" && (r.statuses.batTaunt || 0) > 0 && !engine.sealActive(r)
    );
  },

  // เรียกจาก doAttack() หลังลงความเสียหายกับแบทแมนแล้ว — ความเสียหายเท่ากันเกิดกับผู้โจมตีด้วย
  //  (ต่างจาก "ฝันไปเถอะ" ของริต้า: อันนั้นย้ายความเสียหายไปทั้งก้อน อันนี้เกิดกับทั้งสองฝ่าย)
  applyTauntReflect(engine, attacker, target, dmg) {
    if (!(target.characterId === "bat_ben" && (target.statuses.batTaunt || 0) > 0 && attacker.id !== target.id)) return 0;
    if (dmg <= 0 || !attacker.alive) return 0;
    engine.dealMixed(attacker, dmg);
    attacker.wasAttacked = true;
    engine.maybeBeatSave(attacker); engine.maybeBeatMode(attacker); engine.maybeEva3(attacker); engine.maybeWakeKotone(attacker);
    engine.log(`🦇⚡ ${target.name} เข้ามาเลย — ความเสียหาย ${dmg} หน่วยที่ ${attacker.name} ลงมือ เกิดขึ้นกับ ${attacker.name} เองด้วย!`);
    if (attacker.alive && attacker.hp <= 0) {
      engine.instantDeath(attacker);
      if (!attacker.alive) engine.log(`💀 ${attacker.name} เลือดจริงหมด ตกรอบ!`);
    }
    return dmg;
  },

  // เรียกจาก afterSummary()/doAttack() — เร้นเงาทำงานอยู่ = โจมตีไม่ได้ (ยังชนะการจั่วได้ แต่ไม่มีเทิร์นโจมตี)
  cannotAttack(p) {
    return p.characterId === "bat_ben" && (p.statuses.batStealth || 0) > 0;
  },
};
