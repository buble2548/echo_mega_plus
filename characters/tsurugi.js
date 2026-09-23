// ============================================================
//  คามิชิโร่ ซึรุงิ (patch 4.5 new) — CAST OFF / Clock Up / Rider Slash
//    · สกิลติดตัว   Zect               -> ดู characters/_zect.js (ใช้ร่วมกับไรเดอร์อีกสามคน)
//    · สกิลพื้นฐาน  CAST OFF / PUT ON  -> สลับโหมด ฟรี (กดระหว่าง Clock Up ไม่ได้)
//    · สกิลรอง     Clock Up / Over    -> หยุดเวลาทั้งสนาม ฟรี (ต้องอยู่ใน CAST OFF)
//    · ท่าไม้ตาย    Rider Slash        -> ดาบสองจังหวะ: ฟันลบบัฟ แล้วแทงซ้ำฝังพิษ
//
//  ต่างจากอีกสามคนตรงที่ท่าไม้ตายไม่ได้บวกเข้าหมัดเดียว แต่ "แบ่งหมัดออกเป็นสอง"
//  จังหวะแรกคือดาเมจปกติที่ปาดบัฟล่าสุดทิ้ง จังหวะสองคือแผลเล็กๆ ที่ทิ้งพิษไว้
//
//  ⚠️ จังหวะสองต้องได้ตีเสมอ "แม้จังหวะแรกจะถูกหลบ" — ทางหลบทุกทางใน doAttack จะ return
//  ตั้งแต่ด่านหลบ ไม่ผ่าน postAttackFollowup เลย ตัวต่อจังหวะจึงต้องแขวนไว้ที่ endTurn()
//  ซึ่งเป็นปลายทางร่วมของทุกกรณี (โดน/ถูกหลบ/ถูกสะท้อน/ถูกลบล้าง) — แพทเทิร์นเดียวกับ
//  cayenne.continueBarrage และ kotarou.continueClaw
// ============================================================

const Z = require("./_zect");

const ID = "tsurugi";

// ---------- ท่าไม้ตาย Rider Slash ----------
const SLASH_HITS = 2;         // ฟันสองจังหวะต่อการอาร์มหนึ่งครั้ง
const SLASH2_DMG = 1;         // จังหวะสอง: ความเสียหายตายตัว (ลดเกราะก่อนตามปกติ)
const SLASH_POISON_TURNS = 3; // "พิษร้าย" (Universal): ดาเมจ 1/เทิร์น + พลังโจมตี -1

const IMG = {
  base: "/characters/tsurugi/tsurugi.jpg",
  putOn: "/characters/tsurugi/tsurugi_put_on.png",
  cassOff: "/characters/tsurugi/tsurugi_cass_off.jpg",
  skill1: "/characters/tsurugi/tsurugi_skill1.webp",
  skill2: "/characters/tsurugi/tsurugi_skill2.jpg",
  skill3: "/characters/tsurugi/tsurugi_skill3.jpg",
};
const VIDEO = {
  intro: "/characters/tsurugi/tsurugi.mp4",
  cassOff: "/characters/tsurugi/tsurugi_skill1.mp4",
  clockUp: "/characters/tsurugi/tsurugi_skill2.mp4",
  slashFirst: "/characters/tsurugi/tsurugi_skill3_first.mp4",
  slashFinal: "/characters/tsurugi/tsurugi_skill3_final.mp4",
};

function isTsurugi(p) { return !!p && p.characterId === ID; }
function slashArmed(p) { return isTsurugi(p) && !!p.tsurugiSlash; }
// จังหวะที่ฟันไปแล้ว: 0 = ยังไม่ออกดาบ · 1 = ฟันจังหวะแรกไปแล้ว รอจังหวะสอง
function slashStep(p) { return isTsurugi(p) ? (p.tsurugiSlashStep || 0) : 0; }
// หมัดที่กำลังจะลงคือจังหวะสองไหม (doAttack อ่านตัวนี้เพื่อบังคับดาเมจตายตัว)
function slashSecondHit(p) { return slashArmed(p) && slashStep(p) >= 1; }

module.exports = {
  id: ID,
  IMG,
  VIDEO,
  SLASH_HITS,
  SLASH2_DMG,
  SLASH_POISON_TURNS,
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
  slashArmed,
  slashStep,
  slashSecondHit,

  resetCombat(p) {
    Z.resetCombat(p);
    p.tsurugiSlash = false;   // "ไรเดอร์สแลช" อาร์มค้างอยู่ไหม (ค้างข้ามเทิร์นจนกว่าจะได้ตี)
    p.tsurugiSlashStep = 0;   // ฟันไปแล้วกี่จังหวะของชุดนี้
  },

  displayImg(p) {
    if (!isTsurugi(p)) return null;
    return Z.cassOff(p) ? IMG.cassOff : IMG.putOn;
  },

  maybeQueueIntro(engine) {
    let queued = false;
    for (const p of engine.alivePlayers()) {
      if (!isTsurugi(p)) continue;
      engine.queueCutscene(p, "tsurugiIntro");
      queued = true;
    }
    return queued;
  },

  // ห้ามลืมด่าน id ตัวเอง — server.js เรียกฮุคของไรเดอร์ "ทุกคน" กับผู้เล่นทุกคน
  onRoundStartTick(engine, p) {
    if (!isTsurugi(p)) return;
    Z.onRoundStartTick(engine, p, (e, q, on, why) => this.setClockUp(e, q, on, why));
  },

  tryDodge(engine, p, what) { return Z.tryDodge(engine, p, what); },

  tryAttackDodge(engine, attacker, target) {
    if (!isTsurugi(target)) return false;
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

  //  จังหวะแรกใช้ดาเมจปกติ (โบนัส CAST OFF/Zect คิดตามปกติ) — จังหวะสองถูก doAttack บังคับเป็น 1 ตายตัว
  damageBonus(engine, attacker, target, ctx) {
    if (!isTsurugi(attacker)) return 0;
    if (ctx) ctx.tsurugiSlash = slashArmed(attacker);
    return Z.sharedDamageBonus(attacker, target, ctx);
  },

  // ---------- Rider Slash: ก่อนดาเมจของแต่ละจังหวะ ----------
  //  คิววีดีโอประจำจังหวะ แล้วจังหวะแรกปาดบัฟล่าสุดของเป้าหมายทิ้ง
  //  คืนชื่อบัฟที่ถูกลบ (null = ไม่มีอะไรให้ลบ / เป็นจังหวะสอง)
  prepareSlashOnAttack(engine, attacker, target) {
    if (!slashArmed(attacker)) return null;
    const second = slashStep(attacker) >= 1;
    engine.queueCutscene(attacker, second ? "tsurugiSlashFinal" : "tsurugiSlashFirst");
    if (second) {
      engine.log(`🗡️ ${attacker.name} RIDER SLASH — จังหวะที่ ${SLASH_HITS}: แทงซ้ำรอยเดิม`);
      return null;
    }
    const stripped = target && target.alive ? engine.stripLatestBuff(target) : null;
    engine.log(stripped
      ? `🗡️ ${attacker.name} RIDER SLASH! — ดาบปาด "${stripped.label}" ของ ${target.name} หลุดไปพร้อมรอยฟัน`
      : `🗡️ ${attacker.name} RIDER SLASH! — ดาบปาดผ่าน ${target ? target.name : "เป้าหมาย"} แต่ไม่มีบัฟให้ปาดทิ้ง`);
    return stripped;
  },

  // เรียกหลังดาเมจลง — จังหวะสองฝังพิษแล้วปิดชุด
  resolveSlashOnAttack(engine, attacker, target) {
    if (!slashArmed(attacker)) return null;
    if (slashStep(attacker) < 1) {
      attacker.tsurugiSlashStep = 1; // จบจังหวะแรก รอ endTurn เปิดเฟสโจมตีให้อีกครั้ง
      return { hit: 1 };
    }
    attacker.tsurugiSlash = false;
    attacker.tsurugiSlashStep = 0;
    if (!target || !target.alive) return { hit: SLASH_HITS, poisoned: false };
    const poisoned = engine.applyPoison(target, SLASH_POISON_TURNS);
    engine.log(poisoned
      ? `🧪 ${target.name} ติด "พิษร้าย" ${SLASH_POISON_TURNS} เทิร์น — เสียเลือด 1 ต่อเทิร์น และพลังโจมตี -1`
      : `🛡️ ${target.name} ต้านสถานะผิดปกติ — ไม่ติดพิษร้าย`);
    return { hit: SLASH_HITS, poisoned };
  },

  // ---------- ต่อจังหวะสอง (เรียกจากบนสุดของ endTurn) ----------
  //  ต้องอยู่ที่ endTurn ไม่ใช่ postAttackFollowup เพราะหมัดที่ "ถูกหลบ" จะ return ตั้งแต่ด่านหลบ
  //  สเปกบอกว่าถูกหลบแล้วยังต้องได้ตีจังหวะสอง ปลายทางร่วมจึงมีแต่ endTurn
  //  คืน true = เปิดเฟสโจมตีใหม่แล้ว ผู้เรียกต้อง return ทันที
  continueSlash(engine) {
    for (const p of Object.values(engine.players)) {
      if (!isTsurugi(p) || slashStep(p) < 1 || !slashArmed(p)) continue;
      const stop = () => { p.tsurugiSlash = false; p.tsurugiSlashStep = 0; };
      if (!p.alive) { stop(); continue; }
      if (!engine.attackableTargets(p.id).length) { stop(); continue; }
      engine.log(`🗡️ ${p.name} RIDER SLASH — ดาบยังไม่จบ! เลือกโจมตีได้อีกครั้ง (จังหวะที่ ${SLASH_HITS}/${SLASH_HITS})`);
      engine.setAttackerId(p.id);
      engine.setGameState("ATTACK");
      engine.startPhaseTimer(engine.ATTACK_TIME, () => {
        const t = engine.attackableTargets(engine.attackerId);
        if (!t.length) { engine.endTurn(); return; }
        engine.doAttack(engine.attackerId, t[Math.floor(Math.random() * t.length)].id);
      });
      engine.broadcastState();
      return true;
    }
    return false;
  },

  // ---------- useSkill ----------
  canUseSkill(engine, p, tier) {
    if (!isTsurugi(p)) return true;
    if (tier === "basic") return !Z.clockUpOn(p);
    if (!Z.cassOff(p)) return false;                                   // รอง/ท่าไม้ตายต้องอยู่ใน CAST OFF
    if (tier === "secondary" && !Z.canToggleClockUp(p)) return false;  // แต้มไม่พอจ่ายค่าต่อเทิร์น = เปิดไม่ได้
    if (tier === "ultimate" && slashArmed(p)) return false;            // อาร์มค้างอยู่กดซ้ำไม่ได้
    return true;
  },

  applyInstantSkill(engine, p, tier) {
    if (!isTsurugi(p)) return "";
    if (tier === "basic") return this.toggleCass(engine, p);
    if (tier === "secondary") return this.setClockUp(engine, p, !Z.clockUpOn(p));
    if (tier === "ultimate") return this.armSlash(engine, p);
    return "";
  },

  toggleCass(engine, p) {
    const on = !Z.cassOff(p);
    p.zectCassOff = on;
    p.zectPutOnTurns = 0;
    p.transformAt = engine.nextTransformCounter();
    if (on) {
      engine.triggerCutscene(p, "tsurugiCassOff"); // คลิปถอดเกราะ เล่นครั้งเดียวต่อเกม
      engine.log(`⚡ ${p.name} CAST OFF! — เกราะถูกปลดทิ้ง พลังโจมตีพื้นฐาน +${Z.CASS_OFF_ATK} แต่เกราะจะไม่ฟื้นอีกจนกว่าจะ PUT ON`);
      return " — CAST OFF";
    }
    engine.notifyTransform(p, "tsurugiPutOn");
    engine.log(`🛡️ ${p.name} PUT ON — สวมเกราะกลับ เกราะฟื้นได้ตามปกติ และฟื้นพลังชีวิต +${Z.PUT_ON_HEAL} ทุก ${Z.PUT_ON_EVERY} เทิร์น`);
    return " — PUT ON";
  },

  setClockUp(engine, p, on, why) {
    if (!isTsurugi(p) || on === Z.clockUpOn(p)) return "";
    p.zectClockUp = !!on;
    p.transformAt = engine.nextTransformCounter();
    if (on) {
      engine.queueCutscene(p, "tsurugiClockUp"); // เล่นทุกครั้งที่กดเปิด — ห้ามใช้ triggerCutscene
      engine.log(`⏱️ ${p.name} CLOCK UP — โลกหยุดนิ่ง ทุกคนขยับไม่ได้จนกว่าเขาจะเปิดไพ่ (แต้มสกิล -${Z.CLOCK_UP_DRAIN}/เทิร์น)`);
      return " — CLOCK UP";
    }
    engine.notifyTransform(p, "tsurugiClockOver");
    engine.log(`⏱️ ${p.name} CLOCK OVER — เวลากลับมาเดินตามปกติ${why ? ` (${why})` : ""}`);
    return " — CLOCK OVER";
  },

  cancelClockUpForChase(engine) {
    let any = false;
    for (const h of Z.clockUpHosts(engine)) {
      if (!isTsurugi(h)) continue;
      this.setClockUp(engine, h, false, "ถูกการไล่ล่าตัดจังหวะ");
      any = true;
    }
    return any;
  },

  armSlash(engine, p) {
    p.tsurugiSlash = true;
    p.tsurugiSlashStep = 0;
    engine.log(`🗡️ ${p.name} RIDER SLASH — ดาบพร้อมแล้ว: การโจมตีปกติครั้งถัดไปจะฟันสองจังหวะ — จังหวะแรกปาดบัฟล่าสุดของเป้าหมายทิ้ง จังหวะสองลง ${SLASH2_DMG} หน่วยพร้อม "พิษร้าย" ${SLASH_POISON_TURNS} เทิร์น`);
    return " — ดาบพร้อม";
  },

  publicState(p) {
    if (!isTsurugi(p)) return undefined;
    return {
      cassOff: Z.cassOff(p),
      clockUp: Z.clockUpOn(p),
      slash: slashArmed(p),
      slashStep: slashStep(p),
      slashHits: SLASH_HITS,
      putOnTurns: Z.cassOff(p) ? 0 : (p.zectPutOnTurns || 0),
      putOnEvery: Z.PUT_ON_EVERY,
      dodge: Z.dodgeChance(p),
    };
  },
};
