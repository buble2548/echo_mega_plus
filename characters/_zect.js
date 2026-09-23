// ============================================================
//  ZECT — แกนร่วมของไรเดอร์ตระกูล Kabuto (คาซามะ ไดสุเกะ · โซ ยากุรุมะ)
//  ทั้งคู่ใช้ CAST OFF/PUT ON · Clock Up/Clock Over · สกิลติดตัว Zect เหมือนกันเป๊ะ
//  ต่างกันแค่ท่าไม้ตายกับไฟล์สื่อ จึงรวมพฤติกรรมไว้ที่นี่ที่เดียว
//  (เคยเขียนซ้ำสองไฟล์มาก่อน แล้วพอสเปก Zect เปลี่ยน ต้องไล่แก้สองที่และลืมที่หนึ่งได้ง่ายมาก)
//
//  ⚠️ ฟิลด์ทั้งหมดขึ้นต้นด้วย zect* โดยตั้งใจ ไม่ใช่ชื่อตัวละคร — เพราะกติกาสนามของ Clock Up
//  ต้องมองเห็น "ไรเดอร์ทุกคน" พร้อมกัน (ไดสุเกะเปิด Clock Up แล้วยากุรุมะต้องนับเป็นคนถูกแช่ด้วย
//  และตอนมีสองคนเปิดพร้อมกันต้องรอกันเปิดไพ่ให้ครบ) ถ้าแยกฟิลด์ตามตัวละครจะมองข้ามกันทันที
// ============================================================

// ตัวละครที่ใช้แกนนี้ — เพิ่มไรเดอร์ตัวใหม่ต้องมาต่อที่นี่ด้วย
const ZECT_IDS = new Set(["daisuke", "yaguruma", "kagami"]);
// ไรเดอร์ที่ท่าไม้ตายเป็น "การชาร์จหลายขั้น" — ต้องกดซ้ำได้ในเทิร์นเดียว ช่องท่าไม้ตายจึงไม่กินโควตาสกิลด้วย
const ZECT_CHARGE_IDS = new Set(["kagami"]);

// ---------- CAST OFF / PUT ON ----------
const CASS_OFF_ATK = 1;      // CAST OFF: พลังโจมตีพื้นฐาน +1 (เกราะไม่ฟื้นระหว่างนี้)
const PUT_ON_HEAL = 2;       // PUT ON: ฟื้นพลังชีวิต 2 หน่วย
const PUT_ON_EVERY = 3;      // ...ทุก 3 เทิร์นที่อยู่ในโหมดนี้ติดกัน

// ---------- Clock Up / Clock Over ----------
const CLOCK_UP_DRAIN = 2;      // แต้มสกิลที่เสียต่อเทิร์นระหว่าง Clock Up (จ่ายไม่ไหว = ปิดเอง)
const CLOCK_UP_CARD_TIME = 10; // เจ้าของท่าเปิดไพ่ครบทุกคนแล้ว คนอื่นเหลือเวลาเท่านี้
const CLOCK_UP_SAFETY = 90;    // ตาข่ายกันห้องค้าง: ถ้าไม่มีใครกดอะไรเลย เฟสจบเองเมื่อครบ
                               //  ยาวกว่าเวลาจั่วปกติมากจนไม่รบกวนการเล่นจริง และ client ไม่โชว์เป็นนาฬิกา

// ---------- สกิลติดตัว Zect ----------
const ZECT_DODGE = 25;       // % หลบหลีกระหว่าง Clock Up
const ZECT_MIRROR_ATK = 1;   // ตีไรเดอร์อีกคนที่ Clock Up อยู่ด้วยกัน -> แรงขึ้นอีก 1

function isZect(p) { return !!p && ZECT_IDS.has(p.characterId); }
function cassOff(p) { return isZect(p) && !!p.zectCassOff; }
function clockUpOn(p) { return isZect(p) && !!p.zectClockUp; }

// ไรเดอร์ทุกคนที่เปิด Clock Up อยู่ตอนนี้ — หัวใจของกติกาสนามทั้งหมด
function clockUpHosts(engine) {
  return engine.alivePlayers().filter((p) => clockUpOn(p));
}

// ล้างฟิลด์ทุกแมตช์ใหม่
function resetCombat(p) {
  p.zectCassOff = false;   // เริ่มเกมที่ PUT ON เสมอ
  p.zectClockUp = false;   // Clock Up เปิดอยู่ไหม
  p.zectPutOnTurns = 0;    // นับเทิร์นที่อยู่ใน PUT ON ติดกัน -> ครบ 3 ฟื้นเลือด
}

// ---------- กติกาสนามของ Clock Up ----------
//  "ทุกคนกดอะไรไม่ได้ มีแค่ผู้ใช้ที่ยังกดได้" — แพทเทิร์นเดียวกับ conner/brian
//  มีไรเดอร์เปิดพร้อมกันหลายคน = ทุกคนที่เปิดอยู่ขยับได้หมด คนที่เหลือถูกแช่
// ไรเดอร์ที่ "ยังแช่สนามอยู่" = เปิด Clock Up และยังไม่ได้กดเปิดไพ่
//  ⭐ หัวใจของสกิล: การแช่เป็นของ "รายเทิร์น" ไม่ใช่ของตัวโทกเกิล
//  พอเจ้าของท่ากดเปิดไพ่ ทุกคนต้องขยับได้ทันทีในเทิร์นนั้น (เหลือเวลา 10 วิ)
//  แล้วค่อยไปแช่ใหม่ตอนขึ้นเทิร์นใหม่ (startRound รีเซ็ต p.locked = false ให้เอง)
function freezeHosts(engine) {
  return clockUpHosts(engine).filter((p) => !p.locked);
}

function actionBlocked(engine, p) {
  const hosts = freezeHosts(engine);
  if (!hosts.length || !p) return false;
  return !hosts.some((h) => h.id === p.id);
}

// ด่านกดสกิลแยกจาก actionBlocked — สกิลติดตัว Zect ข้อ 3:
//  ถูกแช่จาก Clock Up ของคนอื่นอยู่ ก็ยังกดสกิลรองของตัวเองได้ ถ้าอยู่ใน CAST OFF และมีแต้มพอจ่าย
function skillBlocked(engine, p, tier) {
  if (!actionBlocked(engine, p)) return false;
  if (tier === "secondary" && cassOff(p) && (p.skillPoints || 0) >= CLOCK_UP_DRAIN) return false;
  return true;
}

// เวลาเฟสจั่วไพ่ระหว่าง Clock Up (0 = ไม่แตะ ใช้ค่าปกติของเกม)
function cardPhaseSeconds(engine) {
  return freezeHosts(engine).length ? CLOCK_UP_SAFETY : 0;
}

// กดเปิด Clock Up ได้ไหม — ต้องมีแต้มพอจ่ายค่าต่อเทิร์นก่อน (กดปิดทำได้เสมอ)
function canToggleClockUp(p) {
  if (clockUpOn(p)) return true;               // กดปิดไม่มีเงื่อนไข
  return (p.skillPoints || 0) >= CLOCK_UP_DRAIN;
}

// เจ้าของท่ากดเปิดไพ่ — คืน true เมื่อ "ครบทุกคนแล้ว" เท่านั้น ผู้เรียกจึงตั้งเวลาใหม่
//  มีไรเดอร์เปิด Clock Up หลายคน: คนแรกกดเปิดไพ่แล้วเวลายังไม่เดิน ต้องรอให้ครบทุกคนก่อน
function onHostLockIn(engine, p) {
  if (!clockUpOn(p)) return false;
  const waiting = clockUpHosts(engine).filter((h) => !h.locked);
  if (waiting.length) {
    engine.log(`⏱️ ${p.name} เปิดไพ่แล้ว — แต่เวลายังไม่เดิน รออีก ${waiting.length} คนที่ยังอยู่ใน Clock Up`);
    return false;
  }
  engine.log(`⏱️ Clock Up คลายออก — เวลากลับมาเดิน เหลือ ${CLOCK_UP_CARD_TIME} วินาทีสำหรับทุกคน`);
  return true;
}

// ---------- ต้นเทิร์น ----------
function onRoundStartTick(engine, p, setClockUp) {
  if (!isZect(p) || !p.alive) return;
  if (clockUpOn(p)) {
    if ((p.skillPoints || 0) < CLOCK_UP_DRAIN) {
      setClockUp(engine, p, false, "แต้มสกิลไม่พอหล่อเลี้ยง");
    } else {
      p.skillPoints -= CLOCK_UP_DRAIN;
      engine.log(`⏱️ ${p.name} Clock Up — เสียแต้มสกิล ${CLOCK_UP_DRAIN} หน่วย (เหลือ ${p.skillPoints})`);
    }
  }
  if (!cassOff(p)) {
    p.zectPutOnTurns = (p.zectPutOnTurns || 0) + 1;
    if (p.zectPutOnTurns >= PUT_ON_EVERY) {
      p.zectPutOnTurns = 0;
      const got = engine.healHp(p, PUT_ON_HEAL);
      if (got > 0) engine.log(`🛡️ ${p.name} PUT ON — ระบบซ่อมแซมทำงาน ฟื้นพลังชีวิต +${got}`);
    }
  } else {
    p.zectPutOnTurns = 0; // ออกจาก PUT ON = เริ่มนับใหม่
  }
}

// CAST OFF: เกราะไม่ฟื้น (เสียบข้างๆ bat_ben.blocksArmorRegen)
function blocksArmorRegen(p) { return cassOff(p); }

// ---------- สกิลติดตัว Zect ----------
function dodgeChance(p) { return clockUpOn(p) && p.alive ? ZECT_DODGE : 0; }

function tryDodge(engine, p, what) {
  const pct = dodgeChance(p);
  if (pct <= 0) return false;
  if (Math.random() * 100 >= pct) return false;
  engine.log(`💨 Zect! ${p.name} หลบ${what ? ` ${what}` : "การโจมตี"}ได้ด้วยความเร็วของ Clock Up (${pct}%)`);
  return true;
}

// ดาเมจ contribution ส่วนที่ใช้ร่วมกัน: CAST OFF +1 · ตีไรเดอร์ที่ Clock Up ด้วยกัน +1
function sharedDamageBonus(attacker, target, ctx) {
  if (!isZect(attacker)) return 0;
  const off = cassOff(attacker);
  // Zect ข้อ 2: ทั้งคู่อยู่ใน Clock Up = ต่างคนต่างเห็นกันในความเร็วเดียวกัน หมัดจึงเข้าเต็ม
  const mirror = clockUpOn(attacker) && clockUpOn(target);
  if (ctx) { ctx.zectCassOff = off; ctx.zectMirror = mirror; }
  return (off ? CASS_OFF_ATK : 0) + (mirror ? ZECT_MIRROR_ATK : 0);
}

// สองสกิลแรกเป็น "สวิตช์" ไม่กินโควตาสกิลของเทิร์น — กดแล้วยังต่อท่าไม้ตายได้
function skipsTurnQuota(p, tier) {
  if (!isZect(p)) return false;
  if (tier === "basic" || tier === "secondary") return true;
  return tier === "ultimate" && ZECT_CHARGE_IDS.has(p.characterId);
}

module.exports = {
  ZECT_IDS,
  ZECT_CHARGE_IDS,
  CASS_OFF_ATK,
  PUT_ON_HEAL,
  PUT_ON_EVERY,
  CLOCK_UP_DRAIN,
  CLOCK_UP_CARD_TIME,
  CLOCK_UP_SAFETY,
  ZECT_DODGE,
  ZECT_MIRROR_ATK,
  isZect,
  cassOff,
  clockUpOn,
  clockUpHosts,
  freezeHosts,
  canToggleClockUp,
  resetCombat,
  actionBlocked,
  skillBlocked,
  cardPhaseSeconds,
  onHostLockIn,
  onRoundStartTick,
  blocksArmorRegen,
  dodgeChance,
  tryDodge,
  sharedDamageBonus,
  skipsTurnQuota,
};
