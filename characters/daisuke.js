// ============================================================
//  คาซามะ ไดสุเกะ (patch 4.3 new) — CASS OFF / Clock Up / Rider Shooting
//    · สกิลติดตัว   Zect               -> ระหว่าง Clock Up หลบหลีก 25%
//    · สกิลพื้นฐาน  CASS OFF / PUT ON  -> สลับโหมด ฟรี (กดระหว่าง Clock Up ไม่ได้)
//    · สกิลรอง     Clock Up / Over    -> หยุดเวลาทั้งสนาม ฟรี (ต้องอยู่ใน CASS OFF)
//    · ท่าไม้ตาย    Rider Shooting     -> หมัดถัดไปล้างเกราะแล้วตีแรงขึ้น (ต้องอยู่ใน CASS OFF)
//
//  แกนของตัวละครคือ "เปิดเกราะทิ้งเพื่อแลกความเร็ว": CASS OFF ปลดเกราะออก (ไม่ฟื้นอีกเลย)
//  แลกกับพลังโจมตี +1 และเป็นกุญแจปลดล็อกอีกสองสกิล — ส่วน PUT ON คือโหมดถอย ฟื้นเกราะ/เลือดตามปกติ
//
//  ⚠️ กติกาที่พลาดง่าย 4 ข้อ:
//   1. Clock Up **ห้ามแช่คนอื่นด้วย p.locked** — p.locked แปลว่า "เปิดไพ่แล้ว" ถ้าไปตั้งให้คนอื่น
//      checkAllLocked() จะนับว่าครบแล้วเปิดไพ่ทันที สวนทางกับตัวสกิล (ใช้ actionBlocked แทน
//      แบบเดียวกับการไล่ล่าของคอนเนอร์และการแข่งของไบรอัน)
//   2. "เวลาหยุด" ทำด้วยการตั้งตัวจับเวลายาว CLOCK_UP_SAFETY แล้วให้ฝั่ง client ไม่โชว์เป็นนาฬิกา
//      (แพทเทิร์นเดียวกับ SERAPH_PLACE_SAFETY_SECONDS) — ห้าม clearPhaseTimer() ทิ้งเฉยๆ
//      ไม่งั้นถ้าไดสุเกะหลุดเน็ตกลางคัน ห้องจะค้างถาวรโดยไม่มีอะไรมาปลด
//   3. Clock Up/Clock Over และ CASS OFF/PUT ON ไม่กินโควตาสกิลของเทิร์น (กดท่าไม้ตายต่อได้ทันที)
//   4. Rider Shooting ล้างเกราะ "ก่อน" ดาเมจปกติ แล้วดาเมจที่เหลือยังคิดเกราะที่เหลือตามปกติ
//      (ไม่ใช่การเจาะเกราะ — ดู stripArmorOnAttack)
// ============================================================

const ID = "daisuke";

// ---------- สกิลพื้นฐาน CASS OFF / PUT ON ----------
const CASS_OFF_ATK = 1;      // CASS OFF: พลังโจมตีพื้นฐาน +1 (เกราะไม่ฟื้นระหว่างนี้)
const PUT_ON_HEAL = 2;       // PUT ON: ฟื้นพลังชีวิต 2 หน่วย
const PUT_ON_EVERY = 3;      // ...ทุก 3 เทิร์นที่อยู่ในโหมดนี้

// ---------- สกิลรอง Clock Up / Clock Over ----------
const CLOCK_UP_DRAIN = 2;    // แต้มสกิลลดลงต่อเทิร์นระหว่าง Clock Up (ไม่พอจ่าย = ปิดเอง)
const CLOCK_UP_CARD_TIME = 10; // กดเปิดไพ่แล้วคนอื่นเหลือเวลาเท่านี้
const CLOCK_UP_SAFETY = 90;  // ตาข่ายกันห้องค้าง: ถ้าไดสุเกะไม่กดอะไรเลย เฟสจะจบเองเมื่อครบ
                             //  ยาวกว่าเวลาจั่วปกติมากจนไม่รบกวนการเล่นจริง และ client ไม่โชว์เป็นนาฬิกา

// ---------- ท่าไม้ตาย Rider Shooting ----------
const RIDER_COST_ATK = 1;    // พลังโจมตีพื้นฐาน +1 ของหมัดนั้น
const RIDER_STRIP = 1;       // ล้างเกราะเป้าหมายได้สูงสุดกี่หน่วยก่อนลงดาเมจ

// ---------- สกิลติดตัว Zect ----------
const ZECT_DODGE = 25;       // % หลบหลีกระหว่าง Clock Up

const IMG = {
  base: "/characters/daisuke/daisuke.webp",       // หน้าเลือกตัว + ฉากเปิดตัว
  putOn: "/characters/daisuke/drake_put_on.jpg",  // ร่างบนสนาม โหมด PUT ON (ค่าเริ่มต้น)
  cassOff: "/characters/daisuke/daisuke_cass_off.jpg",
  skill1: "/characters/daisuke/daisuke_skill1.png",
  skill2: "/characters/daisuke/daisuke_skill2.jpg",
  skill3: "/characters/daisuke/daisuke_skill3.jpg",
};
const VIDEO = {
  intro: "/characters/daisuke/daisuke.mp4",        // เล่นครั้งเดียวตอนเริ่มแมตช์
  cassOff: "/characters/daisuke/daisuke_skill1.mp4", // เล่นครั้งเดียวต่อเกม ตอนเข้า CASS OFF ครั้งแรก
  clockUp: "/characters/daisuke/daisuke_skill2.mp4", // เล่นทุกครั้งที่เปิด Clock Up
  rider: "/characters/daisuke/daisuke_skill3.mp4",   // เล่นตอนออกหมัด Rider Shooting
};

function isDaisuke(p) { return !!p && p.characterId === ID; }
function cassOff(p) { return isDaisuke(p) && !!p.daisukeCassOff; }
function clockUpOn(p) { return isDaisuke(p) && !!p.daisukeClockUp; }
function riderArmed(p) { return isDaisuke(p) && !!p.daisukeRider; }

// ไดสุเกะคนที่เปิด Clock Up อยู่ (null = ไม่มีใครเปิด) — หัวใจของกติกาสนามทั้งหมดของสกิลนี้
function clockUpHost(engine) {
  for (const p of engine.alivePlayers()) if (clockUpOn(p)) return p;
  return null;
}

module.exports = {
  id: ID,
  IMG,
  VIDEO,
  CASS_OFF_ATK,
  PUT_ON_HEAL,
  PUT_ON_EVERY,
  CLOCK_UP_DRAIN,
  CLOCK_UP_CARD_TIME,
  CLOCK_UP_SAFETY,
  RIDER_COST_ATK,
  RIDER_STRIP,
  ZECT_DODGE,
  cassOff,
  clockUpOn,
  riderArmed,
  clockUpHost,

  // ---------- ฟิลด์เฉพาะตัวละคร: ล้างทุกแมตช์ใหม่ (เรียกจาก resetCombat ของ server.js) ----------
  resetCombat(p) {
    p.daisukeCassOff = false;  // เริ่มเกมที่ PUT ON เสมอ (ตามสเปก: ภาพบนสนามคือ drake_put_on)
    p.daisukeClockUp = false;  // Clock Up เปิดอยู่ไหม
    p.daisukePutOnTurns = 0;   // นับเทิร์นที่อยู่ใน PUT ON ติดกัน -> ครบ 3 ฟื้นเลือด 2
    p.daisukeRider = false;    // Rider Shooting อาร์มไว้แล้วไหม (ใช้หมดเมื่อออกหมัด)
  },

  // ---------- ภาพบนสนาม: สลับตามโหมด ----------
  displayImg(p) {
    if (!isDaisuke(p)) return null;
    return cassOff(p) ? IMG.cassOff : IMG.putOn;
  },

  // ---------- วีดีโอเปิดตัวตอนเริ่มแมตช์ (ไม่มีคำบรรยาย ตามสเปก) ----------
  maybeQueueIntro(engine) {
    let queued = false;
    for (const p of engine.alivePlayers()) {
      if (!isDaisuke(p)) continue;
      engine.queueCutscene(p, "daisukeIntro");
      queued = true;
    }
    return queued;
  },

  // ============================================================
  //  Clock Up — กติกาสนาม
  // ============================================================
  //  "ทุกคนกดอะไรไม่ได้ มีแค่ผู้ใช้ที่ยังกดได้" — แพทเทิร์นเดียวกับ conner.actionBlocked / brian.actionBlocked
  //  ครอบทั้งการจั่ว เปิดไพ่ กดสกิล ใช้ไอเทม และซื้อของ (เสียบที่ปากทางของแต่ละอันใน server.js)
  actionBlocked(engine, p) {
    const host = clockUpHost(engine);
    return !!host && !!p && p.id !== host.id;
  },

  // เวลาเฟสจั่วไพ่ระหว่าง Clock Up — ยาวมากโดยตั้งใจ (ตาข่ายกันห้องค้าง ไม่ใช่เวลาเล่นจริง)
  cardPhaseSeconds(engine) {
    return clockUpHost(engine) ? CLOCK_UP_SAFETY : 0;
  },

  // ไดสุเกะกดเปิดไพ่เอง -> เวลาเดินต่อ แต่เหลือให้คนอื่นแค่ CLOCK_UP_CARD_TIME วินาที
  //  คืน true = ผู้เรียกต้องตั้งตัวจับเวลาใหม่ (ดู lockIn ใน server.js)
  onHostLockIn(engine, p) {
    if (!clockUpOn(p)) return false;
    engine.log(`⏱️ ${p.name} เปิดไพ่ — เวลากลับมาเดิน เหลือ ${CLOCK_UP_CARD_TIME} วินาทีสำหรับทุกคน`);
    return true;
  },

  // ---------- ต้นเทิร์น: ค่าแต้มสกิลของ Clock Up + การฟื้นฟูของ PUT ON ----------
  onRoundStartTick(engine, p) {
    if (!isDaisuke(p) || !p.alive) return;
    // Clock Up: จ่ายแต้มสกิลทุกเทิร์น — ไม่พอจ่ายเมื่อไหร่ก็ปิดตัวเอง
    if (clockUpOn(p)) {
      if (p.skillPoints < CLOCK_UP_DRAIN) {
        this.setClockUp(engine, p, false, "แต้มสกิลไม่พอหล่อเลี้ยง");
      } else {
        p.skillPoints -= CLOCK_UP_DRAIN;
        engine.log(`⏱️ ${p.name} Clock Up — เสียแต้มสกิล ${CLOCK_UP_DRAIN} หน่วย (เหลือ ${p.skillPoints})`);
      }
    }
    // PUT ON: อยู่ครบ 3 เทิร์นติดกัน -> ฟื้นพลังชีวิต 2
    if (!cassOff(p)) {
      p.daisukePutOnTurns = (p.daisukePutOnTurns || 0) + 1;
      if (p.daisukePutOnTurns >= PUT_ON_EVERY) {
        p.daisukePutOnTurns = 0;
        const got = engine.healHp(p, PUT_ON_HEAL);
        if (got > 0) engine.log(`🛡️ ${p.name} PUT ON — ระบบซ่อมแซมทำงาน ฟื้นพลังชีวิต +${got}`);
      }
    } else {
      p.daisukePutOnTurns = 0; // ออกจาก PUT ON = เริ่มนับใหม่
    }
  },

  // ---------- CASS OFF: เกราะไม่ฟื้น ----------
  //  เสียบในด่านฟื้นเกราะกลางของ startRound (แพทเทิร์นเดียวกับ bat_ben.blocksArmorRegen)
  blocksArmorRegen(p) { return cassOff(p); },

  // ---------- สกิลติดตัว Zect: หลบหลีก 25% ระหว่าง Clock Up ----------
  dodgeChance(p) { return clockUpOn(p) && p.alive ? ZECT_DODGE : 0; },

  tryDodge(engine, p, what) {
    const pct = this.dodgeChance(p);
    if (pct <= 0) return false;
    if (Math.random() * 100 >= pct) return false;
    engine.log(`💨 Zect! ${p.name} หลบ${what ? ` ${what}` : "การโจมตี"}ได้ด้วยความเร็วของ Clock Up (${pct}%)`);
    return true;
  },

  // เรียกจาก doAttack() ก่อนคิดดาเมจ — คืน true ถ้าหลบพ้น (ผู้เรียกต้อง return ทันที)
  //  โครงเดียวกับเอจิ/อิปโป/โปรดิวเซอร์ เพื่อให้การ์ดสรุปการโจมตีหน้าตาเหมือนกันหมด
  tryAttackDodge(engine, attacker, target) {
    if (!isDaisuke(target)) return false;
    if (!this.tryDodge(engine, target, `การโจมตีของ ${attacker.name}`)) return false;
    target.wasAttacked = true;
    engine.setLastAttack({
      byName: attacker.name, byImg: engine.displayImg(attacker), byColor: engine.POSITION_COLORS[attacker.position] || "#888",
      byDoomWeapon: attacker.characterId === "doomguy" ? attacker.doomWeapon : undefined,
      targetName: target.name, targetImg: engine.displayImg(target), targetColor: engine.POSITION_COLORS[target.position] || "#888",
      dmg: 0, dodge: true,
      skills: [{ name: `Zect (${ZECT_DODGE}%)`, img: IMG.cassOff, by: target.name, color: engine.POSITION_COLORS[target.position] || "#888", side: "def" }],
    });
    engine.runCutsceneQueue(() => {
      engine.setGameState("ATTACKING");
      engine.startPhaseTimer(engine.ATTACKFX_TIME, engine.endTurn);
      engine.broadcastState();
    });
    return true;
  },

  // ---------- ดาเมจ contribution: CASS OFF +1 · Rider Shooting +1 ----------
  damageBonus(engine, attacker, target, ctx) {
    if (!isDaisuke(attacker)) return 0;
    const off = cassOff(attacker);
    const rider = riderArmed(attacker);
    if (ctx) { ctx.daisukeCassOff = off; ctx.daisukeRider = rider; }
    return (off ? CASS_OFF_ATK : 0) + (rider ? RIDER_COST_ATK : 0);
  },

  // ---------- Rider Shooting: ล้างเกราะก่อนดาเมจปกติ ----------
  //  เรียกจาก doAttack() "ก่อน" คิดดาเมจ — เกราะที่ล้างหายไปเฉยๆ ไม่ได้ซับดาเมจ
  //  แต่เกราะที่เหลือยังกันดาเมจตามปกติ (สเปก: "ล้างเกราะ แล้วจึงเกิดความเสียหายปกติ")
  //  ไม่มีเกราะให้ล้าง = ไม่เกิดอะไร เป็นการโจมตีปกติที่แรงขึ้น 1 หน่วยเฉยๆ
  stripArmorOnAttack(engine, attacker, target) {
    if (!riderArmed(attacker) || !target || !target.alive) return 0;
    const before = target.armor || 0;
    const strip = Math.min(RIDER_STRIP, before);
    for (let i = 0; i < strip; i++) engine.loseArmor(target);
    engine.queueCutscene(attacker, "daisukeRider");
    engine.log(strip > 0
      ? `🎯 ${attacker.name} RIDER SHOOTING! — เกราะของ ${target.name} ถูกล้างออก ${strip} หน่วยก่อนหมัดจะลง`
      : `🎯 ${attacker.name} RIDER SHOOTING! — ${target.name} ไม่มีเกราะให้ล้าง หมัดลงเต็มๆ ทันที`);
    return strip;
  },

  // ใช้โควตาไปแล้วเมื่อออกหมัด (เรียกหลังดาเมจลง — ธงหายไม่ว่าจะมีเกราะให้ล้างหรือไม่)
  consumeRiderOnAttack(engine, attacker) {
    if (!riderArmed(attacker)) return;
    attacker.daisukeRider = false;
    engine.log(`🎯 ${attacker.name} ไรเดอร์ชูตถูกใช้ไปแล้ว — ต้องกดท่าไม้ตายใหม่`);
  },

  // ============================================================
  //  useSkill: ด่านเงื่อนไขก่อนหักแต้ม
  // ============================================================
  canUseSkill(engine, p, tier) {
    if (!isDaisuke(p)) return true;
    // สกิลพื้นฐาน: กดสลับโหมดระหว่าง Clock Up ไม่ได้ (ต้อง Clock Over ก่อนถึงจะ PUT ON ได้)
    if (tier === "basic") return !clockUpOn(p);
    // สกิลรอง/ท่าไม้ตาย: ต้องอยู่ใน CASS OFF เท่านั้น
    if (!cassOff(p)) return false;
    // ท่าไม้ตาย: อาร์มค้างอยู่แล้วกดซ้ำไม่ได้
    if (tier === "ultimate" && riderArmed(p)) return false;
    // สกิลรอง: เปิด Clock Up ทับการแช่ของคนอื่นไม่ได้ (ใครเปิดก่อนได้ก่อน)
    if (tier === "secondary" && !clockUpOn(p) && engine.fieldFreezeByOther(p)) return false;
    return true;
  },

  // สองสกิลแรกเป็น "สวิตช์" ไม่กินโควตาสกิลของเทิร์น — กดแล้วยังต่อท่าไม้ตายได้ในเทิร์นเดียวกัน
  skipsTurnQuota(p, tier) { return isDaisuke(p) && (tier === "basic" || tier === "secondary"); },

  // ---------- ลงผลของสกิล ----------
  applyInstantSkill(engine, p, tier) {
    if (!isDaisuke(p)) return "";
    if (tier === "basic") return this.toggleCass(engine, p);
    if (tier === "secondary") return this.setClockUp(engine, p, !clockUpOn(p));
    if (tier === "ultimate") return this.armRider(engine, p);
    return "";
  },

  // ---------- สกิลพื้นฐาน: สลับ CASS OFF / PUT ON ----------
  toggleCass(engine, p) {
    const on = !cassOff(p);
    p.daisukeCassOff = on;
    p.daisukePutOnTurns = 0;
    p.transformAt = engine.nextTransformCounter();
    if (on) {
      // วีดีโอถอดเกราะ เล่นครั้งเดียวต่อเกม (ครั้งถัดไปเป็นการ์ดแจ้งเตือนเล็ก)
      engine.triggerCutscene(p, "daisukeCassOff");
      engine.log(`⚡ ${p.name} CAST OFF! — เกราะถูกปลดทิ้ง พลังโจมตีพื้นฐาน +${CASS_OFF_ATK} แต่เกราะจะไม่ฟื้นอีกจนกว่าจะ PUT ON`);
      return " — CAST OFF";
    }
    engine.notifyTransform(p, "daisukePutOn");
    engine.log(`🛡️ ${p.name} PUT ON — สวมเกราะกลับ เกราะฟื้นได้ตามปกติ และฟื้นพลังชีวิต +${PUT_ON_HEAL} ทุก ${PUT_ON_EVERY} เทิร์น`);
    return " — PUT ON";
  },

  // ---------- สกิลรอง: เปิด/ปิด Clock Up ----------
  //  why = เหตุผลตอนถูกปิดโดยระบบ (แต้มไม่พอ / โดนคอนเนอร์ตัดจังหวะ)
  setClockUp(engine, p, on, why) {
    if (!isDaisuke(p)) return "";
    if (on === clockUpOn(p)) return "";
    p.daisukeClockUp = !!on;
    p.transformAt = engine.nextTransformCounter();
    if (on) {
      engine.triggerCutscene(p, "daisukeClockUp"); // วีดีโอเล่นทุกครั้งที่เปิด
      engine.log(`⏱️ ${p.name} CLOCK UP — โลกหยุดนิ่ง ทุกคนขยับไม่ได้จนกว่าเขาจะเปิดไพ่ (แต้มสกิล -${CLOCK_UP_DRAIN}/เทิร์น)`);
      return " — CLOCK UP";
    }
    engine.notifyTransform(p, "daisukeClockOver");
    engine.log(`⏱️ ${p.name} CLOCK OVER — เวลากลับมาเดินตามปกติ${why ? ` (${why})` : ""}`);
    return " — CLOCK OVER";
  },

  // คอนเนอร์กดไล่ล่าสวนขึ้นมา -> Clock Up ถูกตัดจังหวะทันที (ตามสเปก C2)
  cancelClockUpForChase(engine) {
    const host = clockUpHost(engine);
    if (!host) return false;
    this.setClockUp(engine, host, false, "ถูกการไล่ล่าตัดจังหวะ");
    return true;
  },

  // ---------- ท่าไม้ตาย: อาร์ม Rider Shooting ----------
  armRider(engine, p) {
    p.daisukeRider = true;
    engine.log(`🎯 ${p.name} RIDER SHOOTING — เล็งไว้แล้ว: หมัดถัดไปแรงขึ้น +${RIDER_COST_ATK} และล้างเกราะเป้าหมาย ${RIDER_STRIP} หน่วยก่อนลงหมัด`);
    return " — เล็งไว้แล้ว";
  },

  // ---------- ข้อมูลสนาม (ทุกคนเห็นได้) ----------
  publicState(p) {
    if (!isDaisuke(p)) return undefined;
    return {
      cassOff: cassOff(p),
      clockUp: clockUpOn(p),
      rider: riderArmed(p),
      putOnTurns: cassOff(p) ? 0 : (p.daisukePutOnTurns || 0),
      putOnEvery: PUT_ON_EVERY,
      dodge: this.dodgeChance(p),
    };
  },
};
