// ============================================================
//  คากามิ อาราตะ (patch 4.4 new) — CAST OFF / Clock Up / Rider Kick
//    · สกิลติดตัว   Zect               -> ดู characters/_zect.js (ใช้ร่วมกับไดสุเกะ/ยากุรุมะ)
//    · สกิลพื้นฐาน  CAST OFF / PUT ON  -> สลับโหมด ฟรี (กดระหว่าง Clock Up ไม่ได้)
//    · สกิลรอง     Clock Up / Over    -> หยุดเวลาทั้งสนาม ฟรี (ต้องอยู่ใน CAST OFF)
//    · ท่าไม้ตาย    Rider Kick         -> ชาร์จ 3 ขั้น (1/1/3 แต้ม) แล้วหมัดถัดไปฝังไฟฟ้า
//
//  ต่างจากอีกสองคนตรงที่ท่าไม้ตาย "ไม่ได้อาร์มทันที" — ต้องกดสะสมสามครั้งก่อน
//  แลกกับผลที่หนักกว่า: ช็อต 5 เทิร์น + ชา 3 เทิร์น พร้อมกัน
//  และมีทางออกให้เป้าหมายที่ต้านสถานะไว้ได้ — แลกดีบัฟทั้งชุดเป็นหมัดทะลุเกราะเพดาน 3 แทน
// ============================================================

const Z = require("./_zect");

const ID = "kagami";

// ---------- ท่าไม้ตาย Rider Kick ----------
const KICK_STEPS = 3;                  // ชาร์จครบกี่ขั้นถึงจะอาร์ม
const KICK_STEP_COST = [1, 1, 3];      // ราคาของขั้นที่ 1 / 2 / 3 ตามลำดับ
const KICK_ATK = 1;                    // พลังโจมตีพื้นฐาน +1 ของหมัดนั้น
const KICK_SHOCK_TURNS = 5;            // "ช็อต" (Universal): ต้นเทิร์นมีโอกาสติดสตั้น
const KICK_CHAA_TURNS = 3;             // "ชา" (Universal): จั่ว 1 ครั้งได้ไพ่ 2 ใบ
const KICK_PIERCE_CAP = 3;             // เป้าหมายต้านสถานะไว้ -> หมัดทะลุเกราะแทน เพดานรวม 3 หน่วย

const IMG = {
  base: "/characters/kagami/kagami.jpeg",
  putOn: "/characters/kagami/kagami_put_on.webp",
  cassOff: "/characters/kagami/kagami_cass_off.jpg",
  skill1: "/characters/kagami/kagami_skill1.webp",
  skill2: "/characters/kagami/kagami_skill2.jpg",
  skill3: "/characters/kagami/kagami_skill3.jpg",
};
const VIDEO = {
  intro: "/characters/kagami/kagami.mp4",
  cassOff: "/characters/kagami/kagami_skill1.mp4",
  clockUp: "/characters/kagami/kagami_skill2.mp4",
  kickOne: "/characters/kagami/kagami_skill3_one.mp4",
  kickThree: "/characters/kagami/kagami_skill3_three.mp4",
  kickFinal: "/characters/kagami/kagami_skill3_final.mp4",
};

function isKagami(p) { return !!p && p.characterId === ID; }
function chargeOf(p) { return isKagami(p) ? (p.kagamiCharge || 0) : 0; }
function kickArmed(p) { return isKagami(p) && !!p.kagamiKick; }
// ราคาของ "ขั้นถัดไป" — ชาร์จครบแล้วไม่มีขั้นถัดไป คืนราคาขั้นสุดท้ายไว้โชว์เฉยๆ
function nextStepCost(p) {
  const step = chargeOf(p);
  return KICK_STEP_COST[Math.min(step, KICK_STEPS - 1)];
}

module.exports = {
  id: ID,
  IMG,
  VIDEO,
  KICK_STEPS,
  KICK_STEP_COST,
  KICK_ATK,
  KICK_SHOCK_TURNS,
  KICK_CHAA_TURNS,
  KICK_PIERCE_CAP,
  CASS_OFF_ATK: Z.CASS_OFF_ATK,
  PUT_ON_HEAL: Z.PUT_ON_HEAL,
  PUT_ON_EVERY: Z.PUT_ON_EVERY,
  CLOCK_UP_DRAIN: Z.CLOCK_UP_DRAIN,
  CLOCK_UP_CARD_TIME: Z.CLOCK_UP_CARD_TIME,
  CLOCK_UP_SAFETY: Z.CLOCK_UP_SAFETY,
  ZECT_DODGE: Z.ZECT_DODGE,
  ZECT_MIRROR_ATK: Z.ZECT_MIRROR_ATK,
  cassOff: Z.cassOff,
  clockUpOn: Z.clockUpOn,
  clockUpHosts: Z.clockUpHosts,
  freezeHosts: Z.freezeHosts,
  canToggleClockUp: Z.canToggleClockUp,
  actionBlocked: Z.actionBlocked,
  skillBlocked: Z.skillBlocked,
  cardPhaseSeconds: Z.cardPhaseSeconds,
  onHostLockIn: Z.onHostLockIn,
  blocksArmorRegen: Z.blocksArmorRegen,
  dodgeChance: Z.dodgeChance,
  skipsTurnQuota: Z.skipsTurnQuota,
  chargeOf,
  kickArmed,
  nextStepCost,

  resetCombat(p) {
    Z.resetCombat(p);
    p.kagamiCharge = 0;   // ชาร์จ Rider Kick ไปแล้วกี่ขั้น (0-3) — ค้างข้ามเทิร์นได้
    p.kagamiKick = false; // ชาร์จครบแล้ว รอออกหมัด
  },

  displayImg(p) {
    if (!isKagami(p)) return null;
    return Z.cassOff(p) ? IMG.cassOff : IMG.putOn;
  },

  maybeQueueIntro(engine) {
    let queued = false;
    for (const p of engine.alivePlayers()) {
      if (!isKagami(p)) continue;
      engine.queueCutscene(p, "kagamiIntro");
      queued = true;
    }
    return queued;
  },

  // ห้ามลืมด่าน id ตัวเอง — server.js เรียกฮุคของไรเดอร์ "ทุกคน" กับผู้เล่นทุกคน
  //  แกน Zect มองแค่ว่า "เป็นไรเดอร์ไหม" ถ้าไม่กันตรงนี้ ค่า Clock Up จะถูกหักซ้ำหลายรอบ
  onRoundStartTick(engine, p) {
    if (!isKagami(p)) return;
    Z.onRoundStartTick(engine, p, (e, q, on, why) => this.setClockUp(e, q, on, why));
  },

  tryDodge(engine, p, what) { return Z.tryDodge(engine, p, what); },

  tryAttackDodge(engine, attacker, target) {
    if (!isKagami(target)) return false;
    if (!Z.tryDodge(engine, target, `การโจมตีของ ${attacker.name}`)) return false;
    target.wasAttacked = true;
    engine.setLastAttack({
      byName: attacker.name, byImg: engine.displayImg(attacker), byColor: engine.POSITION_COLORS[attacker.position] || "#888",
      byDoomWeapon: attacker.characterId === "doomguy" ? attacker.doomWeapon : undefined,
      targetName: target.name, targetImg: engine.displayImg(target), targetColor: engine.POSITION_COLORS[target.position] || "#888",
      dmg: 0, dodge: true,
      skills: [{ name: `Zect (${Z.ZECT_DODGE}%)`, img: IMG.cassOff, by: target.name, color: engine.POSITION_COLORS[target.position] || "#888", side: "def" }],
    });
    engine.runCutsceneQueue(() => {
      engine.setGameState("ATTACKING");
      engine.startPhaseTimer(engine.ATTACKFX_TIME, engine.endTurn);
      engine.broadcastState();
    });
    return true;
  },

  // Rider Kick แรงขึ้น +1 เหมือนท่าไม้ตายของอีกสองคน
  damageBonus(engine, attacker, target, ctx) {
    if (!isKagami(attacker)) return 0;
    const kick = kickArmed(attacker);
    if (ctx) ctx.kagamiKick = kick;
    return Z.sharedDamageBonus(attacker, target, ctx) + (kick ? KICK_ATK : 0);
  },

  // ---------- Rider Kick: ตัดสินรูปแบบหมัด + เล่นวีดีโอ (เรียกก่อนลงดาเมจ) ----------
  //  เป้าหมายกาง "ต้านสถานะผิดปกติ" ไว้ = ช็อต/ชา ติดไม่ได้อยู่แล้ว จึงแลกเป็นหมัดทะลุเกราะ
  //  เพดาน 3 หน่วยแทน (ค่าตอบแทนที่แน่นอน แทนดีบัฟที่จะโดนกันทิ้งเปล่าๆ)
  //  คืน true = หมัดนี้เป็นแบบทะลุเกราะ ผู้เรียกต้องตัดดาเมจที่ KICK_PIERCE_CAP เอง
  prepareKickOnAttack(engine, attacker, target) {
    if (!kickArmed(attacker) || !target || !target.alive) return false;
    engine.queueCutscene(attacker, "kagamiKickFinal"); // เล่นทุกครั้งที่ออกหมัด
    const resisted = engine.resistActive(target);
    engine.log(resisted
      ? `🦵 ${attacker.name} RIDER KICK! — ${target.name} กาง "ต้านสถานะผิดปกติ" ไว้ ไฟฟ้าจึงอัดเป็นแรงกระแทกทะลุเกราะแทน (สูงสุด ${KICK_PIERCE_CAP} หน่วย)`
      : `🦵 ${attacker.name} RIDER KICK! — ส้นเท้าพลังไฟฟ้าอัดเต็มตัว ${target.name}`);
    return resisted;
  },

  // เรียกหลังดาเมจลง — ฝังดีบัฟแล้วล้างสถานะไรเดอร์คิ๊กทิ้ง
  //  pierced = หมัดนี้แลกเป็นทะลุเกราะไปแล้ว จึงไม่ฝังดีบัฟซ้ำ
  resolveKickOnAttack(engine, attacker, target, pierced) {
    if (!kickArmed(attacker)) return null;
    attacker.kagamiKick = false;
    attacker.kagamiCharge = 0; // ใช้แล้วต้องชาร์จใหม่ตั้งแต่ขั้นที่ 1
    if (pierced || !target || !target.alive) return { shocked: false, numbed: false };
    const shocked = engine.applyShock(target, KICK_SHOCK_TURNS);
    engine.log(shocked
      ? `⚡ ${target.name} ติด "ช็อต" ${KICK_SHOCK_TURNS} เทิร์น — ทุกต้นเทิร์นมีโอกาสติดสตั้น`
      : `🛡️ ${target.name} ต้านสถานะผิดปกติ — ไม่ติดช็อต`);
    const numbed = engine.applyDebuff(target, "chaa", null, KICK_CHAA_TURNS);
    engine.log(numbed
      ? `🌀 ${target.name} ติด "ชา" ${KICK_CHAA_TURNS} เทิร์น — จั่ว 1 ครั้งได้ไพ่ 2 ใบ`
      : `🛡️ ${target.name} ต้านสถานะผิดปกติ — ไม่ติดชา`);
    return { shocked, numbed };
  },

  // ---------- useSkill ----------
  //  ราคาท่าไม้ตายไม่คงที่ — server.js แทนราคาฐานด้วยค่านี้ก่อนตัวปรับทุกตัว
  ultimateCost(p) { return isKagami(p) ? nextStepCost(p) : 0; },

  canUseSkill(engine, p, tier) {
    if (!isKagami(p)) return true;
    if (tier === "basic") return !Z.clockUpOn(p);
    if (!Z.cassOff(p)) return false;                                   // รอง/ท่าไม้ตายต้องอยู่ใน CAST OFF
    if (tier === "secondary" && !Z.canToggleClockUp(p)) return false;  // แต้มไม่พอจ่ายค่าต่อเทิร์น = เปิดไม่ได้
    if (tier === "ultimate" && kickArmed(p)) return false;             // ชาร์จครบแล้ว รอออกหมัดอย่างเดียว
    return true;
  },

  applyInstantSkill(engine, p, tier) {
    if (!isKagami(p)) return "";
    if (tier === "basic") return this.toggleCass(engine, p);
    if (tier === "secondary") return this.setClockUp(engine, p, !Z.clockUpOn(p));
    if (tier === "ultimate") return this.chargeKick(engine, p);
    return "";
  },

  toggleCass(engine, p) {
    const on = !Z.cassOff(p);
    p.zectCassOff = on;
    p.zectPutOnTurns = 0;
    p.transformAt = engine.nextTransformCounter();
    if (on) {
      engine.triggerCutscene(p, "kagamiCassOff"); // คลิปถอดเกราะ เล่นครั้งเดียวต่อเกม
      engine.log(`⚡ ${p.name} CAST OFF! — เกราะถูกปลดทิ้ง พลังโจมตีพื้นฐาน +${Z.CASS_OFF_ATK} แต่เกราะจะไม่ฟื้นอีกจนกว่าจะ PUT ON`);
      return " — CAST OFF";
    }
    engine.notifyTransform(p, "kagamiPutOn");
    engine.log(`🛡️ ${p.name} PUT ON — สวมเกราะกลับ เกราะฟื้นได้ตามปกติ และฟื้นพลังชีวิต +${Z.PUT_ON_HEAL} ทุก ${Z.PUT_ON_EVERY} เทิร์น`);
    return " — PUT ON";
  },

  setClockUp(engine, p, on, why) {
    if (!isKagami(p) || on === Z.clockUpOn(p)) return "";
    p.zectClockUp = !!on;
    p.transformAt = engine.nextTransformCounter();
    if (on) {
      engine.queueCutscene(p, "kagamiClockUp"); // เล่นทุกครั้งที่กดเปิด — ห้ามใช้ triggerCutscene
      engine.log(`⏱️ ${p.name} CLOCK UP — โลกหยุดนิ่ง ทุกคนขยับไม่ได้จนกว่าเขาจะเปิดไพ่ (แต้มสกิล -${Z.CLOCK_UP_DRAIN}/เทิร์น)`);
      return " — CLOCK UP";
    }
    engine.notifyTransform(p, "kagamiClockOver");
    engine.log(`⏱️ ${p.name} CLOCK OVER — เวลากลับมาเดินตามปกติ${why ? ` (${why})` : ""}`);
    return " — CLOCK OVER";
  },

  cancelClockUpForChase(engine) {
    let any = false;
    for (const h of Z.clockUpHosts(engine)) {
      if (!isKagami(h)) continue;
      this.setClockUp(engine, h, false, "ถูกการไล่ล่าตัดจังหวะ");
      any = true;
    }
    return any;
  },

  // ---------- ชาร์จ Rider Kick ทีละขั้น ----------
  //  ขั้น 1 วีดีโอสั้น · ขั้น 2 แจ้งเตือนเฉยๆ · ขั้น 3 วีดีโอ + ได้สถานะ "ไรเดอร์คิ๊ก"
  //  การชาร์จไม่กินโควตาสกิลของเทิร์น (ดู Z.skipsTurnQuota) จึงกดรวดเดียวจบในเทิร์นเดียวได้
  chargeKick(engine, p) {
    const step = Math.min(KICK_STEPS, chargeOf(p) + 1);
    p.kagamiCharge = step;
    p.transformAt = engine.nextTransformCounter();
    if (step >= KICK_STEPS) {
      p.kagamiKick = true;
      engine.queueCutscene(p, "kagamiKickThree");
      engine.log(`🦵 ${p.name} RIDER KICK — ชาร์จครบ ${KICK_STEPS}/${KICK_STEPS}! หมัดถัดไปแรงขึ้น +${KICK_ATK} และฝัง "ช็อต" ${KICK_SHOCK_TURNS} เทิร์น + "ชา" ${KICK_CHAA_TURNS} เทิร์น`);
      return ` — ชาร์จครบ ${KICK_STEPS}/${KICK_STEPS}`;
    }
    if (step === 1) engine.queueCutscene(p, "kagamiKickOne");
    else engine.notifyTransform(p, "kagamiKickTwo");
    engine.log(`🦵 ${p.name} RIDER KICK — ชาร์จ ${step}/${KICK_STEPS} (ขั้นถัดไปใช้ ${nextStepCost(p)} แต้ม)`);
    return ` — ชาร์จ ${step}/${KICK_STEPS}`;
  },

  publicState(p) {
    if (!isKagami(p)) return undefined;
    return {
      cassOff: Z.cassOff(p),
      clockUp: Z.clockUpOn(p),
      charge: chargeOf(p),
      chargeMax: KICK_STEPS,
      nextCost: nextStepCost(p),
      kick: kickArmed(p),
      putOnTurns: Z.cassOff(p) ? 0 : (p.zectPutOnTurns || 0),
      putOnEvery: Z.PUT_ON_EVERY,
      dodge: Z.dodgeChance(p),
    };
  },
};
