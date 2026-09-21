// ============================================================
//  เท็นโนจิ โคทาโร่ (patch 4.1 new) — "เขียนทับ" (Rewrite)
//
//  ตัวละครที่เอา "อายุขัยของตัวเอง" ไปแลกทุกอย่าง — ทุกสกิลคือการสับรางทรัพยากร
//    · สกิลพื้นฐาน  เขียนทับใหม่  -> สับรางการฟื้นแต้มสกิล/เหรียญ ไปเข้าอีกช่องหนึ่ง
//    · สกิลรอง     แปรเปลี่ยน    -> เผาไอเทม 1 ชิ้น + เลือด 1 หน่วย เป็นอาวุธ
//    · ท่าไม้ตาย   เขียนทับ/เริ่มใหม่ -> ย้อนเทิร์น (ติดหนี้เลือด) หรือขายความจุเลือดถาวรเป็นพลังโจมตี
//    · สกิลติดตัว   rewrite      -> เกราะกลายเป็นเลือด · ฟื้นคืนชีพ 1 ครั้ง · ยิ่งความจุน้อยยิ่งหลบเก่ง
//
//  เส้นเรื่องของตัวละครคือ "ความจุพลังชีวิต" ที่ลดลงเรื่อยๆ:
//    ทุ่มสุดตัว 3 ครั้ง = ความจุ 7 -> 1 · พลังโจมตี +3 ถาวร · อัตราหลบ 30% (เพดานพอดี)
//    ตัวเลขถูกวางให้ชนเพดานพร้อมกันทั้งสามทาง จึงจบที่ "ตีหนักที่สุด หลบเก่งที่สุด และตายง่ายที่สุด"
//
//  หนี้เลือดของ "กลับไปแก้ไข" ตั้งใจให้ทบได้ (ดู collectDebt) — ย้อน 2 ครั้งในเทิร์นเดียว = หนี้ 6 หน่วย
//  จากความจุเต็ม 7 เขารอดมาที่ 1 หน่วยแบบเฉียดฉิว · ย้อนครั้งที่ 3 (หนี้ 9) ถึงจะตายแน่นอน
//  ซึ่งชนเพดานกันลูปที่ 3 ครั้งพอดี — นั่นคือความเสี่ยงที่ผู้เล่นเลือกเอง
//  (แล้ว "ฟื้นคืนชีพ" ของสกิลติดตัวจะรับไม้ต่อพอดี — ตายจากหนี้แล้วได้เล่นเทิร์นนั้นใหม่ 1 ครั้งต่อเกม)
// ============================================================

const ID = "kotarou";

// ---------- ความจุ/หลบหลีก ----------
const KOTAROU_MAX_HP = 7;        // ความจุพลังชีวิตพื้นฐาน (เท่า MAX_HP ปกติ — เขียนไว้ตรงนี้ให้สูตรหลบอ่านค่าเดียวกัน)
const DODGE_PER_CAPACITY = 5;    // ความจุที่หายไป 1 หน่วย -> อัตราหลบ +5%
const DODGE_MAX = 30;            // เพดานอัตราหลบ (= ความจุหาย 6 หน่วย = ทุ่มสุดตัวครบ 3 ครั้ง)
const LOW_HP_IMMUNE_AT = 3;      // เลือดเหลือเท่านี้หรือน้อยกว่า -> ไม่รับความเสียหายจากการแพ้จั่วอีกเลย

// ---------- สกิลพื้นฐาน เขียนทับใหม่ ----------
const MODE_LIFE = "life";        // สลับรากชีวิต: แต้มสกิลที่ควรฟื้น -> ไปฟื้นพลังชีวิตแทน
const MODE_ENERGY = "energy";    // สลับพลังงาน: เหรียญที่ควรได้ -> ไปเป็นแต้มสกิลแทน
const MODE_OFF = "off";

// ---------- สกิลรอง แปรเปลี่ยน ----------
const TRANSMUTE_HP_COST = 1;     // เสียพลังชีวิตทุกครั้งที่หลอมไอเทม
const SWORD_DMG_MAX = 4;         // ดาบแห่งจิตใจ: ดาเมจ = ราคาไอเทม แต่ไม่เกิน 4
const CLAW_ATTACKS = 2;          // กรงเล็บ: ได้เลือกโจมตี 2 ครั้ง
const CLAW_DMG_CAP = 3;          // กรงเล็บ: ดาเมจต่อครั้งไม่เกิน 3 (กันซ้อนกับพลังโจมตีถาวรจนบานปลาย)
const CLAW_BONUS_PRICE = 6;      // ไอเทมราคา >= 6 -> การโจมตีปกติ +1
const CLAW_PRICE_BONUS = 1;

// ---------- ท่าไม้ตาย ----------
const REWIND_HP_COST = 3;        // กลับไปแก้ไข: หนี้เลือดที่จะถูกเก็บตอนขึ้นเทิร์นถัดไป
const REWIND_MIN_HP = 5;         // "เหลือ 4 พอดีหรือน้อยกว่ากดไม่ได้" => ต้องมีมากกว่า 4
const OVERDRIVE_CAP_COST = 2;    // ทุ่มสุดตัว: ความจุพลังชีวิต -2 ถาวร
const OVERDRIVE_ATK = 1;         // ทุ่มสุดตัว: พลังโจมตี +1 ถาวร
const THEME_MUSIC = "kotarou_theme";

const IMG = {
  base: "/characters/kotarou/kotarou.jpg",
  skill1: "/characters/kotarou/skill1/kotarou_skill1.png",
  skill2: "/characters/kotarou/skill2/kotarou_skill2.jpg",
  skill3: "/characters/kotarou/skill3/kotarou_skill3.jpg",
};
const VIDEO = {
  rewind: "/characters/kotarou/skill3/kotarou_skill3.mp4",
  overdrive: "/characters/kotarou/skill3/kotarou_skill3_type2.mp4",
  overdriveLast: "/characters/kotarou/skill3/kotarou_skill3_type2_last.mp4",
};

function isKotarou(p) { return !!p && p.characterId === ID; }
function modeOf(p) { return isKotarou(p) ? (p.kotarouMode || MODE_OFF) : MODE_OFF; }
function powerOf(p) { return isKotarou(p) ? (p.kotarouPower || 0) : 0; }
function weaponOf(p) { return isKotarou(p) ? (p.kotarouWeapon || null) : null; }

// ความจุที่หายไปจากค่าพื้นฐาน — นับจาก maxHpOf จริง จึงรวมทุกแหล่ง ไม่ใช่แค่ maxHpPenalty ของทุ่มสุดตัว
function capacityLost(engine, p) {
  if (!isKotarou(p)) return 0;
  return Math.max(0, KOTAROU_MAX_HP - engine.maxHpOf(p));
}
function dodgeChance(engine, p) {
  if (!isKotarou(p) || !p.alive) return 0;
  return Math.min(DODGE_MAX, capacityLost(engine, p) * DODGE_PER_CAPACITY);
}

// ราคาไอเทมในกระเป๋า — ของที่ซื้อจากร้านเก็บ price ไว้แล้ว ส่วนของที่ได้มาฟรี (grantInventoryItem)
//  ไม่มีราคาจริง จึงคิดเป็น 0 = หลอมได้แต่ได้อาวุธอ่อนที่สุด (ตั้งใจ — ของฟรีไม่ควรแปลงเป็นดาบ 4 หน่วย)
function priceOfEntry(entry) {
  return Math.max(0, Number(entry && entry.price) || 0);
}

module.exports = {
  id: ID,
  IMG,
  VIDEO,
  KOTAROU_MAX_HP,
  DODGE_PER_CAPACITY,
  DODGE_MAX,
  LOW_HP_IMMUNE_AT,
  MODE_LIFE,
  MODE_ENERGY,
  MODE_OFF,
  TRANSMUTE_HP_COST,
  SWORD_DMG_MAX,
  CLAW_ATTACKS,
  CLAW_DMG_CAP,
  CLAW_BONUS_PRICE,
  CLAW_PRICE_BONUS,
  REWIND_HP_COST,
  REWIND_MIN_HP,
  OVERDRIVE_CAP_COST,
  OVERDRIVE_ATK,
  THEME_MUSIC,
  dodgeChance,
  capacityLost,
  modeOf,
  powerOf,
  weaponOf,
  priceOfEntry,
  isKotarou,

  // ---------- ล้างค่าตอนเริ่มแมตช์ ----------
  resetMatch(p) {
    if (!isKotarou(p)) return;
    p.kotarouMode = MODE_OFF;
    p.kotarouWeapon = null;
    p.kotarouClawLeft = 0;
    p.kotarouPower = 0;
    p.kotarouRewindArmed = false;
    p.kotarouDebt = 0;
    p.kotarouRewoundRound = 0;
    p.kotarouRevived = false;
    p.kotarouRevivePending = false;
    p.kotarouThemeRound = 0;
  },

  // ============================================================
  //  สกิลพื้นฐาน — เขียนทับใหม่ (สับรางทรัพยากร)
  // ============================================================
  //  "แต้มสกิลเหลือ 0 = ปิดการใช้งาน" ต้องเช็ค **ก่อน** สับราง ไม่งั้นโหมดสลับรากชีวิตจะล็อกตาย:
  //  แต้มสกิลไม่ฟื้นเพราะถูกสับรางไปเป็นเลือด แล้วก็ไม่มีวันมีแต้มพอจะปิดโหมดเองได้
  syncMode(engine, p) {
    if (!isKotarou(p)) return MODE_OFF;
    if (modeOf(p) !== MODE_OFF && (p.skillPoints || 0) <= 0) {
      p.kotarouMode = MODE_OFF;
      engine.log(`🩸 ${p.name} เขียนทับใหม่ — แต้มสกิลหมด รางที่สับไว้คลายกลับเป็นปกติ`);
    }
    return modeOf(p);
  },

  setMode(engine, p, mode) {
    if (!isKotarou(p)) return false;
    const next = [MODE_LIFE, MODE_ENERGY, MODE_OFF].includes(mode) ? mode : MODE_OFF;
    p.kotarouMode = next;
    if (next === MODE_LIFE) engine.log(`🔀 ${p.name} เขียนทับใหม่ · สลับรากชีวิต — แต้มสกิลที่ควรฟื้นจะไปเป็นพลังชีวิตแทน`);
    else if (next === MODE_ENERGY) engine.log(`🔀 ${p.name} เขียนทับใหม่ · สลับพลังงาน — เหรียญที่ควรได้จะไปเป็นแต้มสกิลแทน`);
    else engine.log(`🔀 ${p.name} เขียนทับใหม่ — ปิดการสับราง กลับไปรับทรัพยากรตามปกติ`);
    return true;
  },

  // เรียกจากลูปแจกแต้มสกิลท้ายเทิร์น — คืน true ถ้ากลืนแต้มไปทำเป็นเลือดแล้ว (ผู้เรียกต้องไม่ addSkill ต่อ)
  divertSkillRegen(engine, p, gain) {
    if (!isKotarou(p) || this.syncMode(engine, p) !== MODE_LIFE || !(gain > 0)) return false;
    const healed = engine.healHp(p, gain);
    if (healed > 0) engine.log(`🩸 ${p.name} สลับรากชีวิต — แต้มสกิล ${gain} หน่วยถูกสับรางไปฟื้นพลังชีวิต +${healed}`);
    else engine.log(`🩸 ${p.name} สลับรากชีวิต — แต้มสกิล ${gain} หน่วยถูกสับรางทิ้ง (พลังชีวิตเต็มแล้ว)`);
    return true;
  },

  // เรียกจากลูปแจกเหรียญท้ายเทิร์น — คืน true ถ้ากลืนเหรียญไปทำเป็นแต้มสกิลแล้ว
  divertGoldGain(engine, p, gold) {
    if (!isKotarou(p) || this.syncMode(engine, p) !== MODE_ENERGY || !(gold > 0)) return false;
    engine.addSkill(p, gold, "passive");
    engine.log(`⚡ ${p.name} สลับพลังงาน — เหรียญ ${gold} ถูกสับรางไปเป็นแต้มสกิลแทน`);
    return true;
  },

  // ============================================================
  //  สกิลติดตัว 1 — เกราะที่ระบบฟื้นให้ กลายเป็นเลือดแทน (เฉพาะตอนเลือดยังไม่เต็ม)
  // ============================================================
  divertArmorRegen(engine, p) {
    if (!isKotarou(p) || !p.alive) return false;
    if (p.hp >= engine.maxHpOf(p)) return false; // เลือดเต็มแล้ว -> ปล่อยให้ฟื้นเกราะตามปกติ
    const healed = engine.healHp(p, 1);
    // ฟื้นเลือดไม่ได้จริงๆ (ไร้ทางเยียวยา / ผกผัน / ถูกผนึก) -> ต้องคืนการฟื้นเกราะให้ระบบทำต่อ
    //  ไม่งั้นเขาจะเสียทั้งสองทาง: เลือดก็ไม่ขึ้น เกราะก็ถูกกลืนหายไปเฉยๆ
    if (healed <= 0) return false;
    engine.log(`🩹 ${p.name} rewrite — เกราะที่ควรฟื้นถูกเขียนทับเป็นพลังชีวิต +${healed}`);
    return true;
  },

  // ============================================================
  //  สกิลติดตัว 4 — เลือดต่ำแล้วไม่ตายเพราะแพ้จั่ว
  // ============================================================
  //  ตัวละครนี้จ่ายเลือดตลอดเวลา (หลอมอาวุธ · หนี้ย้อนเวลา · ขายความจุ) จนมักอยู่ในเขตเลือดต่ำเป็นปกติ
  //  ถ้ายังโดนดาเมจแพ้จั่วซ้ำอีก แผนระยะยาวทุกแบบของเขาจะถูกตัดจบด้วยเรื่องที่คุมไม่ได้เลย
  loseDamageImmune(engine, p) {
    return isKotarou(p) && p.alive && p.hp <= LOW_HP_IMMUNE_AT;
  },

  // ============================================================
  //  สกิลติดตัว 3 — หลบหลีกตามความจุที่หายไป
  // ============================================================
  tryDodge(engine, p, what) {
    if (!isKotarou(p) || !p.alive) return false;
    const pct = dodgeChance(engine, p);
    if (pct <= 0) return false;
    if (Math.random() * 100 >= pct) return false;
    engine.log(`💨 ${p.name} rewrite — ร่างที่เบาลงหลบ${what ? ` ${what}` : "การโจมตี"}ได้ (${pct}%)`);
    return true;
  },

  // เรียกจาก doAttack() ก่อนคิดดาเมจ — คืน true ถ้าหลบพ้น (ผู้เรียกต้อง return ทันที)
  tryAttackDodge(engine, attacker, target) {
    if (!isKotarou(target)) return false;
    if (!this.tryDodge(engine, target, `การโจมตีของ ${attacker.name}`)) return false;
    target.wasAttacked = true;
    engine.setLastAttack({
      byName: attacker.name, byImg: engine.displayImg(attacker), byColor: engine.POSITION_COLORS[attacker.position] || "#888",
      byDoomWeapon: attacker.characterId === "doomguy" ? attacker.doomWeapon : undefined,
      targetName: target.name, targetImg: engine.displayImg(target), targetColor: engine.POSITION_COLORS[target.position] || "#888",
      dmg: 0, dodge: true,
      skills: [{ name: `หลบหลีก (${dodgeChance(engine, target)}%)`, img: IMG.base, by: target.name, color: engine.POSITION_COLORS[target.position] || "#888", side: "def" }],
    });
    engine.runCutsceneQueue(() => {
      engine.setGameState("ATTACKING");
      engine.startPhaseTimer(engine.ATTACKFX_TIME, engine.endTurn);
      engine.broadcastState();
    });
    return true;
  },

  // ดาเมจจากสกิล (การโจมตีปกติกันที่ tryAttackDodge ไปแล้ว)
  adjustIncomingDamage(engine, p, n, isNormalAttack) {
    if (!isKotarou(p) || n <= 0) return n;
    if (!isNormalAttack && !p._statusDamage && this.tryDodge(engine, p, "ความเสียหายจากสกิล")) return 0;
    return n;
  },

  // ============================================================
  //  สกิลรอง — แปรเปลี่ยน (ไอเทม -> อาวุธ)
  // ============================================================
  //  ล็อกเมื่อความจุพลังชีวิตเหลือ 1: ทุ่มสุดตัวครบแล้วการโจมตีปกติแรงพอตัวอยู่แล้ว
  //  และการเสียเลือด 1 หน่วยตอนความจุเหลือ 1 คือการฆ่าตัวตายเปล่าๆ
  //  อาวุธที่หลอมไว้ "ค้างอยู่จนกว่าจะได้โจมตี" จึงหลอมซ้ำทับของเดิมไม่ได้
  //  (ไม่งั้นจ่ายเลือดใบละ 1 หน่วยเพื่ออัปเกรดดาบไปเรื่อยๆ ได้ในเทิร์นเดียว)
  canTransmute(engine, p) {
    return isKotarou(p) && p.alive && engine.maxHpOf(p) > 1 && !weaponOf(p) && (p.inventory || []).length > 0;
  },

  transmute(engine, p, uid, kind) {
    if (!this.canTransmute(engine, p)) return false;
    if (kind !== "sword" && kind !== "claw") return false;
    const list = p.inventory || [];
    const idx = list.findIndex((it) => it && it.uid === uid);
    if (idx < 0) return false;
    const entry = list[idx];
    const price = priceOfEntry(entry);
    list.splice(idx, 1); // ไอเทมถูกเผาทิ้ง ไม่ว่าอาวุธจะออกมาแรงแค่ไหน

    // ราคาที่ตัวเองจ่ายต้องจ่ายจริงเสมอ — ไม่งั้นด่านหลบหลีกของเขาเองจะกินมันไป (หลอมฟรีได้ถึง 30%)
    p._statusDamage = true;
    engine.dealDirect(p, TRANSMUTE_HP_COST);
    p._statusDamage = false;
    if (kind === "sword") {
      const dmg = Math.max(1, Math.min(SWORD_DMG_MAX, price));
      p.kotarouWeapon = { kind: "sword", price, dmg };
      engine.log(`🗡️ ${p.name} แปรเปลี่ยน · ดาบแห่งจิตใจ — หลอมของราคา ${price} เหรียญ ได้ดาบพลัง ${dmg} หน่วย (เสียพลังชีวิต ${TRANSMUTE_HP_COST})`);
    } else {
      const bonus = price >= CLAW_BONUS_PRICE ? CLAW_PRICE_BONUS : 0;
      p.kotarouWeapon = { kind: "claw", price, bonus };
      engine.log(`🐾 ${p.name} แปรเปลี่ยน · กรงเล็บ — หลอมของราคา ${price} เหรียญ โจมตีปกติได้ ${CLAW_ATTACKS} ครั้ง${bonus ? ` (ดาเมจ +${bonus})` : ""} (เสียพลังชีวิต ${TRANSMUTE_HP_COST})`);
    }
    engine.resolveDamageAftermath(p);
    return true;
  },

  // ---------- ดาเมจการโจมตีปกติ ----------
  //  ดาบแห่งจิตใจ "แทน" ดาเมจพื้นฐาน (ไม่บวกทับ) จึงคืนค่าที่ attackBaseOverride ไม่ใช่ damageBonus
  attackBaseOverride(engine, attacker) {
    const w = weaponOf(attacker);
    if (w && w.kind === "sword") return w.dmg;
    return 1;
  },
  //  พลังโจมตีถาวรจากทุ่มสุดตัว + โบนัสราคาของกรงเล็บ — บวกทับฐานเสมอ
  //  กรงเล็บมีเพดานต่อครั้งที่ CLAW_DMG_CAP จึงต้องหักส่วนเกินคืนตรงนี้ (ฐาน+โบนัสรวมกันห้ามเกิน)
  damageBonus(engine, attacker) {
    if (!isKotarou(attacker)) return 0;
    const w = weaponOf(attacker);
    const claw = w && w.kind === "claw";
    let bonus = powerOf(attacker) + (claw ? (w.bonus || 0) : 0);
    if (claw) {
      const total = 1 + bonus; // ฐานของกรงเล็บยังเป็น 1 (ไม่ได้ override)
      if (total > CLAW_DMG_CAP) bonus -= total - CLAW_DMG_CAP;
    }
    return Math.max(-1, bonus);
  },

  // ---------- อาวุธหมดอายุเมื่อได้โจมตีแล้ว ----------
  //  เรียกท้ายการโจมตีปกติ · กรงเล็บต้องครบโควตาก่อนถึงจะสลาย (2 ครั้งนับเป็นการโจมตีครั้งเดียว)
  consumeWeaponOnAttack(engine, p) {
    const w = weaponOf(p);
    if (!isKotarou(p) || !w) return;
    if (w.kind === "claw" && (p.kotarouClawLeft || 0) > 1) return; // ยังเหลือหมัดในโควตา
    p.kotarouWeapon = null;
    p.kotarouClawLeft = 0;
    engine.log(`⚔️ ${p.name} ${w.kind === "sword" ? "ดาบแห่งจิตใจ" : "กรงเล็บ"}สลายไปหลังลงมือแล้ว`);
  },

  // ---------- กรงเล็บ: โจมตีปกติครั้งที่ 2 ----------
  //  อาร์มตอนชนะการเปิดไพ่ (ไม่ใช่ตอนหลอม) เพราะโควตาเป็นของ "การโจมตีครั้งนี้" ไม่ใช่ของทั้งเกม
  armClawTurn(p) {
    const w = weaponOf(p);
    p.kotarouClawLeft = w && w.kind === "claw" ? CLAW_ATTACKS : 0;
  },
  // เรียกจาก endTurn() แบบเดียวกับชุดกระสุนของคาเยนน์ — ยังยิงไม่ครบ = เปิดเฟสโจมตีอีกครั้ง
  continueClaw(engine) {
    for (const p of Object.values(engine.players)) {
      if (!isKotarou(p) || !(p.kotarouClawLeft > 1)) continue;
      const stop = () => { p.kotarouClawLeft = 0; };
      if (!p.alive) { stop(); continue; }
      if (!engine.attackableTargets(p.id).length) { stop(); continue; }
      p.kotarouClawLeft -= 1;
      engine.log(`🐾 ${p.name} กรงเล็บ — เลือกโจมตีได้อีกครั้ง (เหลือ ${p.kotarouClawLeft}/${CLAW_ATTACKS})`);
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

  // ============================================================
  //  ท่าไม้ตาย 1 — กลับไปแก้ไข
  // ============================================================
  canRewind(engine, p) {
    return isKotarou(p) && p.alive && p.hp >= REWIND_MIN_HP;
  },
  armRewind(engine, p) {
    if (!this.canRewind(engine, p)) return false;
    p.kotarouRewindArmed = true;
    engine.log(`⏪ ${p.name} กลับไปแก้ไข — เขียนทับเทิร์นนี้ไว้แล้ว ถ้าไม่ชนะ เวลาจะย้อนกลับ`);
    return true;
  },
  // เรียกตอนสรุปผล: ชนะ = ยกเลิกฟรี (เสียแค่แต้มสกิล) · ไม่ชนะ = ย้อน
  //  คืนผู้เล่นที่ต้องย้อน หรือ null
  rewindCandidate(engine, winnerId) {
    for (const p of Object.values(engine.players)) {
      if (!isKotarou(p) || !p.kotarouRewindArmed) continue;
      p.kotarouRewindArmed = false;
      if (!p.alive) continue;
      if (winnerId && winnerId === p.id) {
        engine.log(`⏪ ${p.name} กลับไปแก้ไข — ชนะเทิร์นนี้อยู่แล้ว ท่าถูกยกเลิก (ไม่เสียพลังชีวิต)`);
        continue;
      }
      return p;
    }
    return null;
  },
  // เรียก "หลังวีดีโอย้อนเวลาเล่นจบ" — ลงหนี้เลือดไว้เก็บตอนขึ้นเทิร์นถัดไป
  onRewound(engine, p) {
    if (!isKotarou(p)) return;
    p.kotarouDebt = (p.kotarouDebt || 0) + REWIND_HP_COST;
    p.kotarouRewoundRound = engine.roundNumber;
    p.kotarouThemeRound = engine.roundNumber; // เพลงประจำตัวคลอตลอดเทิร์นที่ย้อนมา
    engine.log(`⏪ ${p.name} เขียนทับ/เริ่มใหม่ — เวลาย้อนกลับไปต้นเทิร์น (หนี้พลังชีวิตสะสม ${p.kotarouDebt} หน่วย จะถูกเก็บเมื่อขึ้นเทิร์นถัดไป)`);
  },
  // ชนะในเทิร์นที่ย้อนมา -> หนี้เลือดถูกลบทิ้ง ("เมื่อเริ่มเทิร์นถัดไปจะได้พลังชีวิตคืน")
  onRoundWon(engine, p) {
    if (!isKotarou(p)) return;
    if (p.kotarouRewoundRound === engine.roundNumber && (p.kotarouDebt || 0) > 0) {
      engine.log(`⏪ ${p.name} กลับไปแก้ไขสำเร็จ — ชนะในเทิร์นที่เขียนใหม่ หนี้พลังชีวิต ${p.kotarouDebt} หน่วยถูกลบทิ้ง`);
      p.kotarouDebt = 0;
    }
    this.armClawTurn(p);
  },
  // เก็บหนี้ตอนขึ้นเทิร์นใหม่ — ทบได้ ย้อน 2 ครั้ง = 8 หน่วย = เกินความจุ = ตาย (ความเสี่ยงที่ตั้งใจ)
  collectDebt(engine, p) {
    if (!isKotarou(p) || !p.alive || !((p.kotarouDebt || 0) > 0)) return;
    const owed = p.kotarouDebt;
    p.kotarouDebt = 0;
    p.kotarouRewoundRound = 0;
    engine.log(`⏪ ${p.name} ราคาของการเขียนทับ — เสียพลังชีวิต ${owed} หน่วย`);
    p._statusDamage = true; // หนี้ไม่ใช่การโจมตี ห้ามให้หลบ/กันด้วยด่านหลบหลีกของตัวเอง
    engine.dealDirect(p, owed);
    p._statusDamage = false;
    engine.resolveDamageAftermath(p);
  },

  // ============================================================
  //  ท่าไม้ตาย 2 — ทุ่มสุดตัว
  // ============================================================
  canOverdrive(engine, p) {
    return isKotarou(p) && p.alive && engine.maxHpOf(p) > 1;
  },
  // คลิปสุดท้าย = ครั้งที่กดตอนความจุเหลือ 3 (หลังกดจะเหลือ 1 = กดไม่ได้อีกแล้ว)
  overdriveVideoKey(engine, p) {
    return engine.maxHpOf(p) - OVERDRIVE_CAP_COST <= 1 ? "kotarouOverdriveLast" : "kotarouOverdrive";
  },
  overdrive(engine, p) {
    if (!this.canOverdrive(engine, p)) return false;
    const before = engine.maxHpOf(p);
    p.maxHpPenalty = (p.maxHpPenalty || 0) + OVERDRIVE_CAP_COST;
    p.kotarouPower = powerOf(p) + OVERDRIVE_ATK;
    const after = engine.maxHpOf(p);
    p.hp = Math.min(p.hp, after); // ความจุหดแล้วเลือดต้องหดตาม ไม่งั้นค้างเกินเพดาน
    engine.log(`🔥 ${p.name} ทุ่มสุดตัว — ความจุพลังชีวิต ${before} → ${after} · พลังโจมตี +${OVERDRIVE_ATK} (รวม +${p.kotarouPower}) · อัตราหลบ ${dodgeChance(engine, p)}%`);
    if (p.hp <= 0) { engine.instantDeath(p); return true; }
    engine.resolveDamageAftermath(p);
    return true;
  },

  // ============================================================
  //  สกิลติดตัว 2 — ฟื้นคืนชีพ (1 ครั้งต่อเกม) โดยเล่นเทิร์นนั้นใหม่
  // ============================================================
  //  แค่ "จอง" ไว้เฉยๆ ยังไม่กินโควตา — ถ้ามีคนอื่นชุบเขาก่อน (Longing ของยูนะ) สิทธิ์นี้ต้องยังอยู่
  //  โควตาถูกกินตอนที่ย้อนเทิร์นจริงเท่านั้น (ดู endTurn ใน server.js)
  onDeath(engine, p) {
    if (!isKotarou(p) || p.kotarouRevived || p.kotarouRevivePending) return false;
    p.kotarouRevivePending = true;
    engine.log(`💫 ${p.name} rewrite — ร่างที่ถูกเขียนทับไม่ยอมจบลงตรงนี้ เทิร์นนี้จะถูกเล่นใหม่`);
    return true;
  },
  // endTurn() ใช้ระงับเงื่อนไขจบเกมไว้ก่อน (โคทาโร่เพิ่งตาย แต่อีกครู่จะถูกย้อนกลับมา)
  revivePending(engine) {
    return Object.values(engine.players).some((p) => isKotarou(p) && p.kotarouRevivePending);
  },
  reviveTarget(engine) {
    return Object.values(engine.players).find((p) => isKotarou(p) && p.kotarouRevivePending) || null;
  },

  // ---------- เพลงประจำตัว ----------
  //  ดังเฉพาะเทิร์นที่ถูกย้อนกลับมา (ทั้งจากท่าไม้ตายและจากการฟื้นคืนชีพ)
  //  รูปแบบคืนค่าเป็น { music, at } เหมือนตัวละครอื่น — at เปลี่ยนเมื่อไหร่ client เริ่มเพลงใหม่
  activeMusic(engine) {
    for (const p of Object.values(engine.players)) {
      if (isKotarou(p) && p.alive && p.kotarouThemeRound === engine.roundNumber) {
        return { music: THEME_MUSIC, at: p.kotarouThemeRound };
      }
    }
    return null;
  },

  // ============================================================
  //  ด่านกด/ลงผลของสกิล (แพทเทิร์นเดียวกับตัวละครอื่น: canUseSkill -> applyInstantSkill)
  //  item = ตัวเลือกจากหน้าจอฝั่ง client
  //    basic     { mode: "life" | "energy" | "off" }
  //    secondary { kind: "sword" | "claw", uid: <ไอเทมในกระเป๋า> }
  //    ultimate  { mode: "rewind" | "overdrive" }
  // ============================================================
  canUseSkill(engine, p, tier, item) {
    if (!isKotarou(p) || !p.alive) return false;
    if (tier === "basic") {
      const mode = item && item.mode;
      if (![MODE_LIFE, MODE_ENERGY, MODE_OFF].includes(mode)) return false;
      return mode !== modeOf(p); // เลือกโหมดเดิมซ้ำ = ไม่มีอะไรเปลี่ยน ไม่ควรเสียแต้มฟรี
    }
    if (tier === "secondary") {
      if (!this.canTransmute(engine, p)) return false;
      if (!item || (item.kind !== "sword" && item.kind !== "claw")) return false;
      return (p.inventory || []).some((it) => it && it.uid === item.uid);
    }
    if (tier === "ultimate") {
      const mode = item && item.mode;
      if (mode === "rewind") return this.canRewind(engine, p) && !p.kotarouRewindArmed;
      if (mode === "overdrive") return this.canOverdrive(engine, p);
      return false;
    }
    return false;
  },

  applyInstantSkill(engine, p, tier, item) {
    if (tier === "basic") {
      this.setMode(engine, p, item && item.mode);
      const m = modeOf(p);
      return m === MODE_LIFE ? " · สลับรากชีวิต" : m === MODE_ENERGY ? " · สลับพลังงาน" : " · ปิดการสับราง";
    }
    if (tier === "secondary") {
      if (!this.transmute(engine, p, item && item.uid, item && item.kind)) return "";
      return item.kind === "sword" ? " · ดาบแห่งจิตใจ" : " · กรงเล็บ";
    }
    if (tier === "ultimate") {
      if (item && item.mode === "overdrive") {
        // วีดีโอต้องคิวก่อนลงผล เพราะคลิป "ครั้งสุดท้าย" ตัดสินจากความจุ "ก่อน" ลดลง
        engine.queueCutscene(p, this.overdriveVideoKey(engine, p));
        this.overdrive(engine, p);
        return " · ทุ่มสุดตัว";
      }
      this.armRewind(engine, p);
      return " · กลับไปแก้ไข";
    }
    return "";
  },

  // ---------- ข้อมูลที่ทุกคนบนกระดานเห็นได้ ----------
  //  อาวุธ/พลังโจมตีถาวร/อัตราหลบ เป็นข้อมูลสนาม (คนอื่นต้องวางแผนรับมือได้)
  //  ส่วนหนี้เลือดก็เปิดเผย เพราะมันคือ "เขาจะเสียเลือดเท่าไหร่ตอนขึ้นเทิร์นหน้า" ซึ่งเปลี่ยนการตัดสินใจของทุกคน
  publicState(engine, p) {
    if (!isKotarou(p)) return undefined;
    const w = weaponOf(p);
    return {
      mode: modeOf(p),
      power: powerOf(p),
      dodge: dodgeChance(engine, p),
      debt: p.kotarouDebt || 0,
      loseImmune: this.loseDamageImmune(engine, p),
      armed: !!p.kotarouRewindArmed,
      revived: !!p.kotarouRevived,
      clawLeft: p.kotarouClawLeft || 0,
      weapon: w ? { kind: w.kind, price: w.price, dmg: w.dmg || 0, bonus: w.bonus || 0 } : null,
      canTransmute: this.canTransmute(engine, p),
      canRewind: this.canRewind(engine, p),
      canOverdrive: this.canOverdrive(engine, p),
    };
  },

  // ---------- ล้างค่าที่ผูกกับเทิร์น ----------
  onRoundStart(engine, p) {
    if (!isKotarou(p)) return;
    p.kotarouRewindArmed = false;
    p.kotarouClawLeft = 0;
  },
};
