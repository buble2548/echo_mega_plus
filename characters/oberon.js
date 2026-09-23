// ============================================================
//  โอเบรอน ราชาแห่งภูติ (rework 3 / patch 4.2)
//    · สกิลติดตัว  จอมหลอกลวง        -> ปลอมเปลือกนอกเป็นตัวละครอื่นจนกว่าจะเข้ากลางคืนครั้งแรก
//    · สกิลพื้นฐาน  ม่านแห่งราตรี      -> บัฟหมู่ + ยามฟ้าสาง (ไม่เปลี่ยนจากเดิม)
//    · สกิลรองกลางวัน รุ่งอรุณแห่งวันใหม่ -> ฮีล 5 + ต้านสถานะ 2 เทิร์น แล้วเทิร์นถัดไปเด้งกลับ 2 ทะลุเกราะ
//    · สกิลรองกลางคืน ฝันร้ายยามค่ำคืน   -> (ย้ายผล Lie Like Vortigern เดิมมาทั้งชุด) กล่อมคนติดยามฟ้าสางให้หลับ
//    · ท่าไม้ตายกลางวัน จุดจบของความฝัน  -> ยืมพลังโจมตี 4 หน่วยให้ใครก็ได้ 1 เทิร์น แลกกับสตั้น 3 เทิร์น (คูลดาวน์ 5)
//    · ท่าไม้ตายกลางคืน Lie Like Vortigern -> ร่างฝูงแมลง "ล่มสลาย" (ต้องอยู่ระหว่างฝันร้ายยามค่ำคืน)
//
//  เส้นเรื่อง: กลางวันเขาตีไม่เข้าเลย (พลังโจมตี 0) ได้แต่แปะ "ยามฟ้าสาง" สะสมไว้
//  พอตกกลางคืนจึงเก็บเกี่ยว — ฝันร้ายยามค่ำคืนกล่อมทุกคนหลับตามจำนวนยามฟ้าสางที่สะสมมา
//  แล้วท่าไม้ตาย 2 คือการทิ้งไพ่ใบสุดท้าย: แลกความสามารถทุกอย่างของตัวเองกับการกลืนกินทั้งสนาม
//
//  ⚠️ กติกาที่พลาดง่าย 3 ข้อ:
//   1. พลังโจมตี -1 มีผล "เฉพาะกลางวัน" — ร่างกลางคืนตีได้เต็มปกติ (ดู damageBonus)
//   2. คูลดาวน์เก็บเป็น "เลขรอบ" ไม่ใช่ตัวนับ จึงเดินต่อเองระหว่างอยู่ในร่างฝูงแมลง (แพทเทิร์นเดียวกับอิปโป/ชิโด)
//   3. ร่างฝูงแมลงคือ toggle — กดท่าไม้ตาย 2 ซ้ำเพื่อยกเลิก ฟรีและไม่ติดคูลดาวน์
// ============================================================

const { CHARACTERS } = require("../characters");

const ID = "oberon";

// ---------- ยามฟ้าสาง / ม่านแห่งราตรี ----------
const DAWN_MAX = 5;            // ยามฟ้าสางสะสมได้สูงสุด 5 หน่วย -> หลับได้สูงสุด 5 เทิร์นตรงตัว
const VEIL_TURNS = 2;          // ม่านแห่งราตรี: พลังโจมตี +1 คงอยู่ 2 เทิร์น

// ---------- รุ่งอรุณแห่งวันใหม่ (สกิลรองกลางวัน) ----------
const SUNRISE_HEAL = 5;        // ฟื้นพลังชีวิตทันที
const SUNRISE_BACKLASH = 2;    // เทิร์นถัดไปเด้งกลับ 2 หน่วยรวดเดียว ทะลุเกราะ (ไม่ถึงตาย)
const SUNRISE_RESIST = 2;      // ต้านสถานะผิดปกติ 2 เทิร์น (ให้ตั้งแต่เทิร์นที่กด)

// ---------- จุดจบของความฝัน (ท่าไม้ตายกลางวัน) ----------
const DREAMEND_ATK = 4;        // พลังโจมตีที่ยืมให้ (1 เทิร์น)
const DREAMEND_STUN = 3;       // ราคา: สตั้น 3 เทิร์น เริ่มมีผลเทิร์นถัดไป
const DREAMEND_COOLDOWN = 5;   // คูลดาวน์ 5 เทิร์น (โชว์เป็นเลขบนการ์ดสกิล)

// ---------- Lie Like Vortigern (ท่าไม้ตายกลางคืน — ร่างฝูงแมลง) ----------
const SWARM_CURSE_TURNS = 3;   // ทุกคนยกเว้นตัวเองติด "คำสาป" 3 เทิร์น
const SWARM_TICK_DMG = 1;      // ทุกเทิร์นหลังเฟสโจมตี: กัดคนเลือดน้อยสุด 1 หน่วย (ลดเกราะก่อน · ฆ่าได้)
const SWARM_DRAIN_EVERY = 2;   // ทุก 2 เทิร์น โอเบรอนเสียพลังชีวิต 1 หน่วยแบบไม่สนเกราะ
const SWARM_FRAGILE_TURNS = 2; // "เปราะบาง" ต่ออายุใหม่ทุกต้นเทิร์นที่ยังอยู่ในร่าง — สั้นๆ ไว้เสมอ
                               //  (ห้ามใส่เลขยาวๆ แทนความถาวร ป้ายสถานะจะขึ้นเลขนั้นให้ผู้เล่นเห็น)
const SWARM_MIN_HP = 1;        // เลือดเหลือเท่านี้ -> ร่างฝูงแมลงปิดตัวเองอัตโนมัติ

const MORNING_IMG = "/characters/oberon/oberon_morning.jpg";
const NIGHT_IMG = "/characters/oberon/oberon_night.jpg";

function isOberon(p) { return !!p && p.characterId === ID; }
function nightmareOn(p) { return isOberon(p) && !!p.oberonNightmare; }
function swarmOn(p) { return isOberon(p) && !!p.oberonSwarm; }

// มีโอเบรอนคนไหนอยู่ในร่างฝูงแมลงไหม (ใช้เปิดฉาก "ล่มสลาย" + กติกาสนาม)
function swarmHost(engine) {
  for (const p of engine.alivePlayers()) if (swarmOn(p)) return p;
  return null;
}

module.exports = {
  id: ID,
  DAWN_MAX,
  VEIL_TURNS,
  SUNRISE_HEAL,
  SUNRISE_BACKLASH,
  SUNRISE_RESIST,
  DREAMEND_ATK,
  DREAMEND_STUN,
  DREAMEND_COOLDOWN,
  SWARM_CURSE_TURNS,
  SWARM_TICK_DMG,
  SWARM_DRAIN_EVERY,
  SWARM_FRAGILE_TURNS,
  SWARM_MIN_HP,
  MORNING_IMG,
  NIGHT_IMG,
  nightmareOn,
  swarmOn,
  swarmHost,

  // ---------- ฟิลด์เฉพาะตัวละคร: ล้างทุกแมตช์ใหม่ (เรียกจาก resetCombat ของ server.js) ----------
  resetCombat(p) {
    p.oberonCd = {};                 // คูลดาวน์รายสกิล: { ultimate } = เลขรอบที่กดได้อีกครั้ง
    p.oberonNightmare = false;       // ฝันร้ายยามค่ำคืนเปิดอยู่ไหม (หายเองเมื่อเข้าเช้า)
    p.oberonSwarm = false;           // ร่างฝูงแมลง (ท่าไม้ตาย 2) เปิดอยู่ไหม
    p.oberonSwarmSince = 0;          // เลขรอบที่เข้าร่างฝูงแมลง — ใช้นับ "ทุก 2 เทิร์นเสียเลือด 1"
    p.oberonMask = null;             // จอมหลอกลวง: id ตัวละครที่ยืมเปลือกมาใช้ (null = ไม่ได้ปลอม)
    p.oberonUnmasked = false;        // ปลอมตัวหลุดแล้ว (เข้ากลางคืนครั้งแรก) — ไม่กลับมาปลอมอีก
    p.oberonSunriseHit = 0;          // รุ่งอรุณแห่งวันใหม่: เลขรอบที่แรงสะท้อนจะลง (0 = ไม่มีค้าง)
    p.oberonDreamStun = 0;           // จุดจบของความฝัน: สตั้นที่รอลงต้นเทิร์นถัดไป
    p.oberonSwarmFragile = false;    // ติด "เปราะบาง" จากร่างฝูงแมลงอยู่ไหม (ใช้ถอนคืนตอนยกเลิกท่า)
  },

  // ---------- คูลดาวน์ (เก็บเป็น "เลขรอบ" — ไม่ได้อยู่ใน p.statuses จึงไม่มีใครลดให้ และเดินต่อเองระหว่างร่างฝูงแมลง) ----------
  cooldownLeft(engine, p, tier) {
    if (!isOberon(p)) return 0;
    const until = (p.oberonCd && p.oberonCd[tier]) || 0;
    return Math.max(0, until - engine.roundNumber + 1);
  },
  //  turns - 1: กดเทิร์น N ด้วยคูลดาวน์ 5 -> กดได้อีกทีเทิร์น N+5 พอดี
  //  และเลขที่โชว์บนการ์ดทันทีหลังกดคือ 5 ตรงตามสเปก (ไม่ใช่ 6)
  setCooldown(engine, p, tier, turns) {
    p.oberonCd = p.oberonCd || {};
    p.oberonCd[tier] = engine.roundNumber + turns - 1;
  },

  // ============================================================
  //  สกิลติดตัว จอมหลอกลวง
  //   เปลือกนอก (ชื่อ + รูป + การ์ดสกิลทั้งชุด) ถูกยืมมาจากตัวละครที่ "ไม่ได้ลงสนามแมตช์นี้"
  //   ตัวโอเบรอนเองเห็นของจริงเสมอ — คนอื่นเห็นของปลอมล้วน (ดู buildStateFor/displayImg ใน server.js)
  //   หมดผลถาวรเมื่อเข้ากลางคืนครั้งแรก (onDayNightTransition) เพราะร่างกลางคืนคือการเปิดตัวจริง
  // ============================================================
  assignMasks(engine) {
    const inMatch = new Set(Object.values(engine.players).map((p) => p.characterId));
    for (const p of Object.values(engine.players)) {
      if (!isOberon(p)) continue;
      // ยืมได้เฉพาะตัวที่ไม่อยู่ในสนาม — ไม่งั้นจะมีชื่อซ้ำกับคนที่นั่งอยู่จริง แล้วแตกทันที
      const pool = CHARACTERS.filter((c) => c.id !== ID && !c.locked && !inMatch.has(c.id));
      p.oberonMask = pool.length ? pool[Math.floor(Math.random() * pool.length)].id : null;
      p.oberonUnmasked = false;
    }
  },
  // ปลอมตัวอยู่ไหม (ใช้ทั้งฝั่ง state, ฝั่งภาพ และฝั่ง log)
  disguised(p) { return isOberon(p) && !!p.oberonMask && !p.oberonUnmasked; },
  maskId(p) { return this.disguised(p) ? p.oberonMask : null; },
  // ระหว่างปลอมตัว: กดสกิลแล้วไม่มีแบนเนอร์เด้งเลย (ท่อเดียวกับสกิลเงียบของชิโด)
  //  แบนเนอร์คือเบาะแสที่ใหญ่ที่สุด — ชื่อสกิลบอกทันทีว่าเป็นโอเบรอน จึงต้องเงียบทั้งก้อน
  //  (รวม roundSkills ด้วย — หลักสูตร "พิเศษ" ของไบเลธอ่านรายการนั้นแล้วเดาได้)
  silentSkill(p) { return this.disguised(p); },
  // ชื่อสกิลที่จะโผล่ใน log ระหว่างปลอมตัว — ยืมชื่อช่องเดียวกันของตัวปลอม
  //  (lastLog เป็นก้อนเดียวส่งให้ทุกคน จึงปลอมให้ทุกคนเห็นเหมือนกัน รวมทั้งเจ้าตัว)
  maskedSkillName(p, tier, real) {
    const m = this.maskId(p);
    if (!m) return real;
    const ch = CHARACTERS.find((c) => c.id === m);
    const sk = ch && ch[tier];
    return (sk && sk.name) || real;
  },

  // ---------- ดาเมจ contribution ----------
  //  การหลับไหลอันไม่สิ้นสุด: พลังโจมตีพื้นฐาน 0 — **เฉพาะร่างกลางวัน** (rework 3)
  //  เคียวยมทูตถูกถอดออกพร้อมการย้ายผลไปฝันร้ายยามค่ำคืน จึงไม่มีโบนัส +2 อีกแล้ว
  damageBonus(engine, attacker) {
    if (!isOberon(attacker)) return 0;
    return engine.isNightRound(engine.roundNumber) ? 0 : -1;
  },

  // ============================================================
  //  สกิลพื้นฐาน ม่านแห่งราตรี (ไม่เปลี่ยนจากเดิม)
  // ============================================================
  applyBasicVeil(engine, p) {
    for (const o of engine.alivePlayers()) {
      o.statuses.veil = Math.max(o.statuses.veil || 0, VEIL_TURNS); // พลังโจมตี +1 (รวมตัวเอง)
      engine.healHp(o, 1);
      engine.healArmor(o, 1);
      // ยามฟ้าสาง +2 ถาวร — คนที่กำลังหลับไหลไม่รับเพิ่ม · ต้านสถานะผิดปกติกันสแตคใหม่ได้ (สแตคเดิมไม่หาย)
      if (o.id !== p.id && !((o.statuses.sleep || 0) > 0) && !engine.resistActive(o)) {
        o.statuses.dawn = Math.min(DAWN_MAX, (o.statuses.dawn || 0) + 2);
      }
    }
    engine.log(`🌙 ${p.name} ${this.maskedSkillName(p, "basic", "ม่านแห่งราตรี")} — ทุกคนพลังโจมตี +1 (${VEIL_TURNS} เทิร์น) ฟื้นเลือด/เกราะ +1 และติดยามฟ้าสาง +2 (ยกเว้นผู้ใช้/คนหลับ)`);
  },

  // ============================================================
  //  สกิลรองกลางวัน รุ่งอรุณแห่งวันใหม่
  //   ฮีล 5 ทันที + ต้านสถานะ 2 เทิร์น แล้ว "ต้นเทิร์นถัดไป" เด้งกลับ 2 หน่วยรวดเดียว ทะลุเกราะ ไม่ถึงตาย
  //   ลำดับสำคัญ: แปะยามฟ้าสางก่อน แล้วค่อยให้ต้านสถานะ — ไม่งั้นต้านสถานะของสกิลเองจะกันยามฟ้าสางของสกิลเอง
  // ============================================================
  prepareSunriseTarget(engine, targets) {
    const tgs = Array.isArray(targets) ? [...new Set(targets)] : [];
    const t = tgs.length === 1 ? engine.players[tgs[0]] : null;
    if (!t || !t.alive) return null;
    return t;
  },

  applySunriseEffect(engine, p, sunriseTarget, skillName) {
    const shown = this.maskedSkillName(p, "secondary", skillName);
    if (engine.satoruOnTargeted(sunriseTarget, p, `สกิล ${shown} `).negated) return " — ถูกลบล้าง";
    const t = sunriseTarget;
    engine.healHp(t, SUNRISE_HEAL);
    t.oberonSunriseHit = engine.roundNumber + 1; // แรงสะท้อนลงต้นเทิร์นถัดไป (ดู onRoundStartTick)
    // ยามฟ้าสาง +1 — ไม่ติดถ้าใช้กับตัวเอง / เป้าหมายกำลังหลับ / ต้านสถานะอยู่ก่อนแล้ว
    const dawnEligible = t.id !== p.id && !((t.statuses.sleep || 0) > 0);
    const dawnGiven = dawnEligible && !engine.resistActive(t);
    if (dawnGiven) t.statuses.dawn = Math.min(DAWN_MAX, (t.statuses.dawn || 0) + 1);
    // ...แล้วค่อยมอบต้านสถานะ (มีผลตั้งแต่เทิร์นนี้)
    engine.applyBuff(t, "resist", null, SUNRISE_RESIST);
    engine.log(`🌄 ${p.name} ${shown} — ฟื้นพลังชีวิต ${t.name} +${SUNRISE_HEAL} และมอบ "ต้านสถานะผิดปกติ" ${SUNRISE_RESIST} เทิร์น · ต้นเทิร์นหน้าจะเด้งกลับ -${SUNRISE_BACKLASH} ทะลุเกราะ${dawnGiven ? " · ติดยามฟ้าสาง +1" : ""}`);
    return ` — ใส่ ${t.name}`;
  },

  // ============================================================
  //  สกิลรองกลางคืน ฝันร้ายยามค่ำคืน (ย้ายผล Lie Like Vortigern เดิมมาทั้งชุด)
  //   เกราะราตรี "นับตามเวลาหลับของแต่ละคน" (rework 3 — เดิมเป็น 3 เทิร์นตายตัวจนไม่ตรงกับเวลาหลับ)
  //   คนที่ไม่ติดยามฟ้าสางเลย = ไม่หลับ และไม่ได้เกราะราตรีด้วย (เกราะผูกกับการหลับ ไม่ใช่ของแจกฟรี)
  // ============================================================
  applyNightmare(engine, p) {
    p.oberonNightmare = true;
    p.transformAt = engine.nextTransformCounter();
    for (const o of engine.alivePlayers()) {
      if (o.id === p.id) continue;
      const dawn = Math.min(DAWN_MAX, o.statuses.dawn || 0);
      if (dawn > 0 && engine.resistActive(o)) {
        engine.log(`🛡️ ${o.name} ต้านสถานะผิดปกติ — ไม่หลับไหลจากคำลวงของราชาภูติ`);
        continue;
      }
      if (dawn <= 0) continue; // ไม่มียามฟ้าสาง = ไม่หลับ และไม่ได้เกราะราตรี
      o.statuses.sleep = dawn;
      o.sleepFresh = true; // เทิร์นที่เพิ่งโดนกล่อมยังไม่เริ่มนับ
      o.statuses.vortarmor = dawn; // เกราะราตรีอยู่เท่ากับเวลาที่หลับพอดี
      engine.healArmor(o, 1);
      engine.log(`💤 ${o.name} ต้องคำลวงของราชาภูติ — หลับไหล ${dawn} เทิร์น (เพดานเกราะ +1 ตลอดเวลาที่หลับ)`);
    }
    for (const o of Object.values(engine.players)) delete o.statuses.dawn; // ล้างยามฟ้าสางให้ทุกคน
    engine.setOberonDevour(engine.nextTransformCounter()); // ราตรีกลืนกิน: ฉากหลัง + เพลงประจำตัว
    engine.extendNight(); // ราตรีเริ่มนับใหม่เต็มรอบจากเทิร์นนี้
    // วีดีโอประจำท่าย้ายตามผลมาด้วยทั้งคู่ — เล่นเรียงกันตามลำดับเดิมของ Vortigern:
    //  oberon_final_night.mp4 (ตัวท่า) แล้วต่อด้วย oberon_changefill.mp4 (ราตรีกลืนกิน)
    //  ส่วนวีดีโอใหม่ oberon_skill3.2_update.mp4 เป็นของท่าไม้ตาย 2 เท่านั้น ห้ามมาปนตรงนี้
    engine.triggerCutscene(p, "oberonNightmare");
    engine.triggerCutscene(p, "oberonChange");
    engine.log(`🌘 ${p.name} ${this.maskedSkillName(p, "secondary", "ฝันร้ายยามค่ำคืน")} — ราตรีกลืนกิน และราตรีจะดำเนินต่อไปจนกว่าจะถึงเช้า`);
  },

  // ============================================================
  //  ท่าไม้ตายกลางวัน จุดจบของความฝัน
  //   ยืมพลังโจมตี 4 หน่วยให้ใครก็ได้ (เลือกตัวเองได้) 1 เทิร์น — จบเทิร์นแล้วเป้าหมายติดสตั้น 3 เทิร์น
  //   ตัวโอเบรอนกลางวันตี 0 อยู่แล้ว เลือกตัวเอง = ได้ตีจริง 4 หน่วยครั้งเดียวแล้วนอนยาว
  // ============================================================
  prepareDreamEndTarget(engine, targets) {
    const tgs = Array.isArray(targets) ? [...new Set(targets)] : [];
    const t = tgs.length === 1 ? engine.players[tgs[0]] : null;
    if (!t || !t.alive) return null;
    return t;
  },

  applyDreamEnd(engine, p, target, skillName) {
    const shown = this.maskedSkillName(p, "ultimate", skillName);
    if (engine.satoruOnTargeted(target, p, `สกิล ${shown} `).negated) return " — ถูกลบล้าง";
    this.setCooldown(engine, p, "ultimate", DREAMEND_COOLDOWN);
    engine.applyBuff(target, "might", DREAMEND_ATK, 1); // +4 ดาเมจ เฉพาะเทิร์นนี้ (หมดอายุตอนจบเทิร์น)
    target.oberonDreamStun = DREAMEND_STUN;             // ราคา: ลงต้นเทิร์นถัดไป (ดู applyPendingStun)
    engine.log(`💫 ${p.name} ${shown} — ${target.name} พลังโจมตี +${DREAMEND_ATK} เทิร์นนี้ แลกกับ "สตั้น" ${DREAMEND_STUN} เทิร์นตั้งแต่เทิร์นหน้า (คูลดาวน์ ${DREAMEND_COOLDOWN} เทิร์น)`);
    return ` — ใส่ ${target.name}`;
  },

  // ต้นเทิร์น: สตั้นที่ "จุดจบของความฝัน" ตั้งไว้เมื่อเทิร์นก่อน เริ่มมีผลตอนนี้
  //  ต้องเรียก "ก่อน" บล็อกเช็คสตั้นของ startRound() ไม่งั้นสตั้นจะเลื่อนไปอีกเทิร์น (เหมือน Uper Cut ของอิปโป)
  applyPendingStun(engine, p) {
    if (!p.oberonDreamStun) return;
    const turns = p.oberonDreamStun;
    p.oberonDreamStun = 0;
    if (engine.applyDebuff(p, "stun", null, turns)) engine.log(`😵 ${p.name} ความฝันจบลงแล้ว — ติดสถานะสตั้น ${turns} เทิร์น!`);
    else engine.log(`🛡️ ${p.name} ต้านผลของจุดจบของความฝันไว้ได้ — ไม่ติดสตั้น`);
  },

  // ============================================================
  //  ท่าไม้ตายกลางคืน Lie Like Vortigern — ร่างฝูงแมลง "ล่มสลาย"
  //   toggle: กดครั้งแรกเข้าร่าง · กดซ้ำยกเลิก (ฟรี ไม่ติดคูลดาวน์)
  //   ใช้ได้เฉพาะระหว่างฝันร้ายยามค่ำคืนเปิดอยู่ — เข้าร่างแล้วฝันร้ายถูกปิดและทุกคนตื่นทันที
  // ============================================================
  applySwarm(engine, p) {
    if (swarmOn(p)) return this.cancelSwarm(engine, p, "กดยกเลิกเอง");
    p.oberonSwarm = true;
    p.oberonSwarmSince = engine.roundNumber;
    p.oberonNightmare = false; // ฝันร้ายถูกปิด
    p.transformAt = engine.nextTransformCounter();
    for (const o of engine.alivePlayers()) {
      if (o.id === p.id) continue;
      // ทุกคนตื่นขึ้น
      if ((o.statuses.sleep || 0) > 0) { delete o.statuses.sleep; o.sleepFresh = false; }
      delete o.statuses.vortarmor;
      if (engine.applyCurse(o, SWARM_CURSE_TURNS)) {
        engine.log(`🕸️ ${o.name} ติด "คำสาป" ${SWARM_CURSE_TURNS} เทิร์น — กดสกิลเมื่อไหร่เสียพลังชีวิต 1 หน่วย`);
      } else {
        engine.log(`🛡️ ${o.name} ต้านสถานะผิดปกติ — ไม่ติดคำสาป`);
      }
      this.applySwarmFragile(engine, o);
    }
    engine.setOberonDevour(engine.nextTransformCounter());
    // ท่านี้ toggle ได้ฟรี — ใช้ triggerCutscene (คลิปเต็มครั้งแรก ครั้งถัดไปเป็นการ์ดแจ้งเตือนเล็ก)
    //  ไม่งั้นกดเปิด-ปิดสลับกันจะยิงคลิป 17 วิใส่ทุกคนซ้ำได้ไม่จำกัด
    engine.triggerCutscene(p, "oberonSwarm");
    engine.log(`🐝 ${p.name} LIE LIKE VORTIGERN — กลายร่างเป็นฝูงแมลงและกลืนกินสนาม! ทุกคนตื่นขึ้น · สนามเข้าสู่ยุค "ล่มสลาย"`);
    engine.log(`🐝 ${p.name} จั่ว/โจมตี/กดสกิลอื่น/ใช้ไอเทมไม่ได้ (ซื้อของยังได้) และยังโดนการโจมตีปกติได้ (แต่สกิล/อาวุธเล็งไม่ได้) — กดท่าไม้ตายซ้ำเพื่อคืนร่าง`);
    return " — ร่างฝูงแมลง";
  },

  // "เปราะบาง" คงอยู่จนกว่าโอเบรอนจะคืนร่าง — ทำด้วยการ "ต่ออายุสั้นๆ ทุกต้นเทิร์น" (ดู onRoundStartTick)
  //  ⚠️ ห้ามใส่เลขเทิร์นยาวๆ แทนความถาวร (เคยใช้ 99) — ป้ายสถานะบนกระดานอ่านค่านี้ตรงๆ
  //  แล้วขึ้นเป็น "99" ให้ผู้เล่นเห็น ซึ่งไม่ใช่จำนวนเทิร์นจริงและทำให้เข้าใจผิด
  //  applyDebuff ใช้ Math.max อยู่แล้ว การต่ออายุจึงไม่ไปตัดเวลา fragile ที่ยาวกว่าจากแหล่งอื่น (เช่นคีตกวี)
  applySwarmFragile(engine, o) {
    if (engine.resistActive(o)) return false;
    engine.applyDebuff(o, "fragile", 1, SWARM_FRAGILE_TURNS);
    o.oberonSwarmFragile = true;
    return true;
  },

  cancelSwarm(engine, p, why) {
    if (!swarmOn(p)) return "";
    p.oberonSwarm = false;
    p.oberonSwarmSince = 0;
    for (const o of Object.values(engine.players)) {
      if (!o.oberonSwarmFragile) continue;
      o.oberonSwarmFragile = false;
      //  เปราะบางที่ยาวกว่าที่ฝูงแมลงต่ออายุไว้ = มาจากแหล่งอื่น (เช่นคีตกวี) — ปล่อยให้เดินต่อเอง
      if ((o.statuses.fragile || 0) > SWARM_FRAGILE_TURNS) continue;
      delete o.statuses.fragile;
      if (o.statusAmt) delete o.statusAmt.fragile;
    }
    engine.setOberonDevour(0);
    engine.log(`🌫️ ${p.name} คืนร่างจากฝูงแมลง (${why}) — ยุคล่มสลายสิ้นสุดลง "เปราะบาง" ของทุกคนหายไป`);
    return " — คืนร่าง";
  },

  // ต้นเทิร์นของทุกคน — แรงสะท้อนรุ่งอรุณ · ค่าเสียเลือดของร่างฝูงแมลง · แปะเปราะบางซ้ำ
  onRoundStartTick(engine, p) {
    // ---------- รุ่งอรุณแห่งวันใหม่: แรงสะท้อน 2 หน่วยรวดเดียว ทะลุเกราะ ไม่ถึงตาย ----------
    if (p.oberonSunriseHit && engine.roundNumber >= p.oberonSunriseHit) {
      p.oberonSunriseHit = 0;
      const take = Math.max(0, Math.min(SUNRISE_BACKLASH, p.hp - 1)); // ค้างที่ 1 เสมอ
      if (take > 0) {
        p.hp -= take;
        p.dmgHp += take;
        engine.log(`🌄 ${p.name} แสงรุ่งอรุณจางลง — พลังชีวิต -${take} (ทะลุเกราะ ไม่ถึงตาย)`);
      } else {
        engine.log(`🌄 ${p.name} แสงรุ่งอรุณจางลง — พลังชีวิตเหลือน้อยเกินกว่าจะเสียต่อ`);
      }
    }
    if (!swarmOn(p)) return;
    // ---------- ร่างฝูงแมลง: ทุก 2 เทิร์นเสียพลังชีวิต 1 หน่วยแบบไม่สนเกราะ ----------
    const elapsed = engine.roundNumber - (p.oberonSwarmSince || 0);
    if (elapsed > 0 && elapsed % SWARM_DRAIN_EVERY === 0 && p.hp > SWARM_MIN_HP) {
      p.hp -= 1;
      p.dmgHp += 1;
      engine.log(`🐝 ${p.name} ร่างฝูงแมลงกัดกินตัวเอง — พลังชีวิต -1 (เหลือ ${p.hp})`);
    }
    // เลือดเหลือ 1 -> ปิดตัวเองอัตโนมัติ
    if (p.hp <= SWARM_MIN_HP) { this.cancelSwarm(engine, p, "พลังชีวิตเหลือ 1 หน่วย"); return; }
    // "เปราะบาง" ต่ออายุใหม่ทุกต้นเทิร์น — นี่คือกลไกที่ทำให้มัน "คงอยู่จนกว่าโอเบรอนจะคืนร่าง"
    //  โดยไม่ต้องใส่เลขเทิร์นยาวๆ ที่จะโผล่บนป้ายสถานะ · ล็อกไว้เฉพาะตอนที่เพิ่งหลุดไปจริงๆ
    for (const o of engine.alivePlayers()) {
      if (o.id === p.id) continue;
      const had = (o.statuses.fragile || 0) > 0;
      if (this.applySwarmFragile(engine, o) && !had) {
        engine.log(`🐝 ${o.name} ถูกฝูงแมลงรุมอีกครั้ง — ติด "เปราะบาง" ซ้ำ`);
      }
    }
  },

  // หลังเฟสโจมตีของทุกเทิร์น (เรียกจาก endTurn ของ server.js)
  //  ฝูงแมลงกัดคน "เลือดน้อยสุด" 1 หน่วย — ลดเกราะก่อน · คิดเปราะบางที่ติดอยู่ด้วย · ฆ่าได้
  swarmBite(engine) {
    const host = swarmHost(engine);
    if (!host) return;
    const pool = engine.alivePlayers().filter((o) => o.id !== host.id);
    if (!pool.length) return;
    const lowest = Math.min(...pool.map((o) => o.hp));
    const tied = pool.filter((o) => o.hp === lowest);
    const victim = tied[Math.floor(Math.random() * tied.length)]; // เลือดเท่ากันหลายคน -> สุ่มในกลุ่มนั้น
    // "เปราะบาง" ถูกคิดในท่อการโจมตีปกติเท่านั้น (doAttack) — dealMixed ไม่คิดให้
    //  หมัดนี้จึงต้องบวกเองตามสเปก ("การโจมตีนี้คิดความเสียหายเพิ่มจากเปราะบางที่ติดได้")
    const dmg = SWARM_TICK_DMG + engine.statusAmtOf(victim, "fragile");
    engine.dealMixed(victim, dmg);
    engine.log(`🐝 ฝูงแมลงรุมกัด ${victim.name} — เสียหาย -${dmg} (ลดเกราะก่อน · รวมเปราะบางแล้ว)`);
    engine.maybeBeatSave(victim);
    engine.maybeBeatMode(victim);
    engine.maybeWakeKotone(victim);
    if (victim.alive && victim.hp <= 0) {
      engine.instantDeath(victim);
      if (!victim.alive) engine.log(`💀 ${victim.name} ถูกฝูงแมลงกลืนกินจนหมด ตกรอบ!`);
    }
  },

  // ---------- ด่านเงื่อนไขก่อนหักแต้ม (เรียกจาก useSkill) ----------
  canUseSkill(engine, p, tier) {
    if (!isOberon(p)) return true;
    const night = engine.isNightRound(engine.roundNumber);
    // ร่างฝูงแมลง: กดได้เฉพาะท่าไม้ตาย (เพื่อยกเลิก) เท่านั้น
    if (swarmOn(p)) return tier === "ultimate";
    if (tier === "basic" && (p.statuses.veil || 0) > 0) return false;        // ม่านแห่งราตรียังมีผล
    if (tier === "secondary" && night && nightmareOn(p)) return false;       // ฝันร้ายยังมีผล -> disable
    if (tier === "ultimate") {
      if (night) return nightmareOn(p);                                       // ท่าไม้ตาย 2 ต้องอยู่ระหว่างฝันร้าย
      if (this.cooldownLeft(engine, p, "ultimate") > 0) return false;          // จุดจบของความฝัน: คูลดาวน์ 5
    }
    return true;
  },

  // ---------- ยกเลิกร่างฝูงแมลงไม่เสียแต้มสกิล (useSkill ถามก่อนหักแต้ม) ----------
  ultimateIsFree(p) { return swarmOn(p); },

  // ============================================================
  //  สลับกลางวัน/กลางคืน
  // ============================================================
  onDayNightTransition(engine, night, roundNumber, prevNight) {
    if (!night && engine.oberonDevour && !swarmHost(engine)) {
      engine.setOberonDevour(0); // ราตรีกลืนกินหายไปเมื่อหมดกลางคืน (ร่างฝูงแมลงคงฉากไว้เอง)
      engine.log("🌄 ราตรีกลืนกินจางหายไปพร้อมแสงแรกของวัน");
    }
    if (!night && prevNight) {
      // เข้าสู่เช้า: ผลหลับไหล + ฝันร้ายยามค่ำคืนหายไปทันที
      for (const o of Object.values(engine.players)) {
        if ((o.statuses.sleep || 0) > 0) delete o.statuses.sleep;
        o.sleepFresh = false;
        if (isOberon(o)) o.oberonNightmare = false;
      }
    }
    if (night) {
      // จอมหลอกลวง: เข้ากลางคืนครั้งแรก = เปลือกหลุด ถาวร
      for (const o of engine.alivePlayers()) {
        if (!isOberon(o) || o.oberonUnmasked || !o.oberonMask) continue;
        o.oberonUnmasked = true;
        engine.log(`🎭 เปลือกที่ยืมมาแตกสลายพร้อมแสงสุดท้ายของวัน — ${o.name} คือ โอเบรอน ราชาแห่งภูติ`);
      }
    }
    if (roundNumber > 1 && night !== prevNight) {
      for (const p of engine.alivePlayers()) {
        if (p.characterId !== ID) continue;
        if (swarmOn(p)) continue; // ร่างฝูงแมลงค้างร่างกลางคืนไว้ ไม่สลับตามเวลา
        //  queueCutscene ไม่ใช่ triggerCutscene — การสลับร่างคือเหตุการณ์ของสนาม ไม่ใช่ท่าที่กดเอง
        //  คืนที่ 2 เป็นต้นไปจึงต้องเห็นการเปลี่ยนร่างเหมือนกัน (คลิป 6 วิ)
        if (night) engine.queueCutscene(p, "oberonNight");
        else engine.notifyTransform(p, "oberonDay");
      }
    }
  },
};
