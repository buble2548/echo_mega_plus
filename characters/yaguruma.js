// ============================================================
//  โซ ยากุรุมะ (patch 4.3 new) — CAST OFF / Clock Up / Rider Sting
//    · สกิลติดตัว   Zect               -> ดู characters/_zect.js (ใช้ร่วมกับคาซามะ ไดสุเกะ)
//    · สกิลพื้นฐาน  CAST OFF / PUT ON  -> สลับโหมด ฟรี (กดระหว่าง Clock Up ไม่ได้)
//    · สกิลรอง     Clock Up / Over    -> หยุดเวลาทั้งสนาม ฟรี (ต้องอยู่ใน CAST OFF)
//    · ท่าไม้ตาย    Rider Sting        -> หมัดถัดไปล้าง "ต้านสถานะ" แล้วฝังพิษร้าย + ผุพัง
//
//  ต่างจากไดสุเกะที่ท่าไม้ตาย: ไดสุเกะเจาะ "เกราะ" ส่วนยากุรุมะเจาะ "การป้องกันสถานะ"
//  แล้วทิ้งดีบัฟยาวไว้ — เป็นเข็มพิษ ไม่ใช่หมัดตรง
// ============================================================

const Z = require("./_zect");

const ID = "yaguruma";

// ---------- ท่าไม้ตาย Rider Sting ----------
const STING_ATK = 1;          // พลังโจมตีพื้นฐาน +1 ของหมัดนั้น
const STING_POISON_TURNS = 3; // "พิษร้าย" (Universal): ดาเมจ 1/เทิร์น + พลังโจมตี -1
const STING_DECAY_TURNS = 2;  // "ผุพัง": เกราะฟื้นไม่ได้

const IMG = {
  base: "/characters/yaguruma/yaguruma.webp",
  putOn: "/characters/yaguruma/yaguruma_put_on.jpg",
  cassOff: "/characters/yaguruma/yaguruma_cass_off.jpg",
  skill1: "/characters/yaguruma/yaguruma_skill1.webp",
  skill2: "/characters/yaguruma/yaguruma_skill2.jpg",
  skill3: "/characters/yaguruma/yaguruma_skill3.webp",
};
const VIDEO = {
  intro: "/characters/yaguruma/yaguruma.mp4",
  cassOff: "/characters/yaguruma/yaguruma_skill1.mp4",
  clockUp: "/characters/yaguruma/yaguruma_skill2.mp4",
  sting: "/characters/yaguruma/yaguruma_skill3.mp4",
};

function isYaguruma(p) { return !!p && p.characterId === ID; }
function stingArmed(p) { return isYaguruma(p) && !!p.yagurumaSting; }

module.exports = {
  id: ID,
  IMG,
  VIDEO,
  STING_ATK,
  STING_POISON_TURNS,
  STING_DECAY_TURNS,
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
  stingArmed,

  resetCombat(p) {
    Z.resetCombat(p);
    p.yagurumaSting = false; // Rider Sting อาร์มไว้แล้วไหม (ใช้หมดเมื่อออกหมัด)
  },

  displayImg(p) {
    if (!isYaguruma(p)) return null;
    return Z.cassOff(p) ? IMG.cassOff : IMG.putOn;
  },

  maybeQueueIntro(engine) {
    let queued = false;
    for (const p of engine.alivePlayers()) {
      if (!isYaguruma(p)) continue;
      engine.queueCutscene(p, "yagurumaIntro");
      queued = true;
    }
    return queued;
  },

  onRoundStartTick(engine, p) {
    Z.onRoundStartTick(engine, p, (e, q, on, why) => this.setClockUp(e, q, on, why));
  },

  tryDodge(engine, p, what) { return Z.tryDodge(engine, p, what); },

  tryAttackDodge(engine, attacker, target) {
    if (!isYaguruma(target)) return false;
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

  // Rider Sting แรงขึ้น +1 เหมือน Rider Shooting — บวกดีบัฟที่ทิ้งไว้
  damageBonus(engine, attacker, target, ctx) {
    if (!isYaguruma(attacker)) return 0;
    const sting = stingArmed(attacker);
    if (ctx) ctx.yagurumaSting = sting;
    return Z.sharedDamageBonus(attacker, target, ctx) + (sting ? STING_ATK : 0);
  },

  // ---------- Rider Sting: ล้าง "ต้านสถานะ" ก่อนดาเมจ ----------
  //  ต้องล้างก่อน ไม่งั้นพิษร้าย/ผุพังที่ตามมาทีหลังจะถูกต้านสถานะเดิมกันไว้หมด
  //  วีดีโอเล่นทุกครั้งที่ออกหมัด (queueCutscene ไม่ใช่ triggerCutscene)
  stripResistOnAttack(engine, attacker, target) {
    if (!stingArmed(attacker) || !target || !target.alive) return false;
    const had = (target.statuses.resist || 0) > 0;
    if (had) {
      delete target.statuses.resist;
      if (target.statusAmt) delete target.statusAmt.resist;
    }
    engine.queueCutscene(attacker, "yagurumaSting");
    engine.log(had
      ? `🦂 ${attacker.name} RIDER STING! — เข็มพิษเจาะทะลุ "ต้านสถานะผิดปกติ" ของ ${target.name} จนแตกก่อนหมัดจะลง`
      : `🦂 ${attacker.name} RIDER STING! — ${target.name} ไม่มีเกราะสถานะให้เจาะ เข็มพิษลงเต็มๆ ทันที`);
    return had;
  },

  // เรียกหลังดาเมจลง — ฝังดีบัฟแล้วใช้โควตาหมด
  resolveStingOnAttack(engine, attacker, target) {
    if (!stingArmed(attacker)) return null;
    attacker.yagurumaSting = false;
    if (!target || !target.alive) return null;
    const poisoned = engine.applyPoison(target, STING_POISON_TURNS);
    engine.log(poisoned
      ? `🧪 ${target.name} ติด "พิษร้าย" ${STING_POISON_TURNS} เทิร์น — เสียเลือด 1 ต่อเทิร์น และพลังโจมตี -1`
      : `🛡️ ${target.name} ต้านสถานะผิดปกติ — ไม่ติดพิษร้าย`);
    const decayed = engine.applyDebuff(target, "decay", null, STING_DECAY_TURNS);
    engine.log(decayed
      ? `🕸️ ${target.name} ติด "ผุพัง" ${STING_DECAY_TURNS} เทิร์น — เกราะฟื้นไม่ได้`
      : `🛡️ ${target.name} ต้านสถานะผิดปกติ — ไม่ติดผุพัง`);
    return { poisoned, decayed };
  },

  // ---------- useSkill ----------
  canUseSkill(engine, p, tier) {
    if (!isYaguruma(p)) return true;
    if (tier === "basic") return !Z.clockUpOn(p);
    if (!Z.cassOff(p)) return false;
    if (tier === "secondary" && !Z.canToggleClockUp(p)) return false; // แต้มไม่พอจ่ายค่าต่อเทิร์น = เปิดไม่ได้
    if (tier === "ultimate" && stingArmed(p)) return false;
    return true;
  },

  applyInstantSkill(engine, p, tier) {
    if (!isYaguruma(p)) return "";
    if (tier === "basic") return this.toggleCass(engine, p);
    if (tier === "secondary") return this.setClockUp(engine, p, !Z.clockUpOn(p));
    if (tier === "ultimate") return this.armSting(engine, p);
    return "";
  },

  toggleCass(engine, p) {
    const on = !Z.cassOff(p);
    p.zectCassOff = on;
    p.zectPutOnTurns = 0;
    p.transformAt = engine.nextTransformCounter();
    if (on) {
      engine.triggerCutscene(p, "yagurumaCassOff");
      engine.log(`⚡ ${p.name} CAST OFF! — เกราะถูกปลดทิ้ง พลังโจมตีพื้นฐาน +${Z.CASS_OFF_ATK} แต่เกราะจะไม่ฟื้นอีกจนกว่าจะ PUT ON`);
      return " — CAST OFF";
    }
    engine.notifyTransform(p, "yagurumaPutOn");
    engine.log(`🛡️ ${p.name} PUT ON — สวมเกราะกลับ เกราะฟื้นได้ตามปกติ และฟื้นพลังชีวิต +${Z.PUT_ON_HEAL} ทุก ${Z.PUT_ON_EVERY} เทิร์น`);
    return " — PUT ON";
  },

  setClockUp(engine, p, on, why) {
    if (!isYaguruma(p) || on === Z.clockUpOn(p)) return "";
    p.zectClockUp = !!on;
    p.transformAt = engine.nextTransformCounter();
    if (on) {
      engine.queueCutscene(p, "yagurumaClockUp"); // เล่นทุกครั้งที่กดเปิด — ห้ามใช้ triggerCutscene เพราะมันเล่นคลิปเต็มแค่ครั้งแรกต่อเกม
      engine.log(`⏱️ ${p.name} CLOCK UP — โลกหยุดนิ่ง ทุกคนขยับไม่ได้จนกว่าเขาจะเปิดไพ่ (แต้มสกิล -${Z.CLOCK_UP_DRAIN}/เทิร์น)`);
      return " — CLOCK UP";
    }
    engine.notifyTransform(p, "yagurumaClockOver");
    engine.log(`⏱️ ${p.name} CLOCK OVER — เวลากลับมาเดินตามปกติ${why ? ` (${why})` : ""}`);
    return " — CLOCK OVER";
  },

  cancelClockUpForChase(engine) {
    let any = false;
    for (const h of Z.clockUpHosts(engine)) {
      if (!isYaguruma(h)) continue;
      this.setClockUp(engine, h, false, "ถูกการไล่ล่าตัดจังหวะ");
      any = true;
    }
    return any;
  },

  armSting(engine, p) {
    p.yagurumaSting = true;
    engine.log(`🦂 ${p.name} RIDER STING — เข็มพิษพร้อมแล้ว: หมัดถัดไปแรงขึ้น +${STING_ATK} และจะเจาะ "ต้านสถานะผิดปกติ" ของเป้าหมาย แล้วฝัง "พิษร้าย" ${STING_POISON_TURNS} เทิร์น + "ผุพัง" ${STING_DECAY_TURNS} เทิร์น`);
    return " — เข็มพิษพร้อม";
  },

  publicState(p) {
    if (!isYaguruma(p)) return undefined;
    return {
      cassOff: Z.cassOff(p),
      clockUp: Z.clockUpOn(p),
      sting: stingArmed(p),
      putOnTurns: Z.cassOff(p) ? 0 : (p.zectPutOnTurns || 0),
      putOnEvery: Z.PUT_ON_EVERY,
      dodge: Z.dodgeChance(p),
    };
  },
};
