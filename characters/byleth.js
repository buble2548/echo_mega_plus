// ============================================================
//  อาจารย์ ไบเลธ (patch 2.6 new) — ทบทวนบทเรียน / ดาบต้องสาป / หลักสูตรการสอน
//  + สกิลติดตัว "ภูมิปัญญา" และ "sothis"
//
//  แกนกลางของตัวละครคือทรัพยากรเฉพาะตัว "ความรู้" (p.bylethKnowledge สูงสุด 20 หน่วย)
//    · สกิลพื้นฐาน = แหล่งความรู้เดียวของเธอ (+1 ต่อครั้ง) พร้อมพนัน 50/50 ว่าไพ่ใบถัดไปจะ "บวก" หรือ "ลบ" แต้ม
//    · สกิลรอง = จ่ายความรู้ 4 หน่วย (ไม่ใช้แต้มสกิล) เลือกได้ว่าจะฟาดทันที 2 หน่วย หรือเก็บดาบไว้เสริมหมัดถัดไป +2
//    · ท่าไม้ตาย = สวิตช์เปิด/ปิด เลือก 1 ใน 3 หลักสูตรที่เปลี่ยนกติกาทั้งสนาม แลกกับความรู้ 1 หน่วยต่อเทิร์น
//
//  เพราะสกิลทุกอันไม่กินโควตา "1 สกิลต่อเทิร์น" (สกิลติดตัวภูมิปัญญาให้ 5 ครั้งต่อเทิร์นแทน) ลำดับการกดจึงสำคัญ:
//  ทบทวนบทเรียนก่อนจั่ว -> จั่ว -> ทบทวนซ้ำเพื่อกลับทิศแต้มของใบถัดไป เป็นคอมโบหลักของตัวละครนี้
// ============================================================

const ID = "byleth";

// ---------- สกิลติดตัว ภูมิปัญญา ----------
const KNOWLEDGE_MAX = 20;        // เก็บ "ความรู้" ไว้ที่ตัวเองได้สูงสุด 20 หน่วย
const SKILL_USES_PER_TURN = 5;   // ใน 1 เทิร์นกดสกิลต่างๆ รวมกันได้สูงสุด 5 ครั้ง (ไม่กินโควตาสกิลปกติของเทิร์น)

// ---------- ทบทวนบทเรียน (สกิลพื้นฐาน) ----------
const BASIC_KNOWLEDGE_GAIN = 1;  // ได้ความรู้ +1 ทุกครั้งที่กด
const BASIC_STUDY_CHANCE = 0.5;  // 50/50 ระหว่าง "ศึกษาเพิ่ม" (บวก) กับ "พักผ่อน" (ลบ)
const BASIC_STUDY_HEAL = 1;      // ศึกษาเพิ่ม: ฟื้นพลังชีวิต 1 หน่วยตอนไพ่ใบถัดไปลง

// ---------- ดาบต้องสาป (สกิลรอง) ----------
const SWORD_KNOWLEDGE_COST = 4;  // ลดความรู้ 4 หน่วย (ไม่ใช้แต้มสกิล)
const SWORD_STRIKE_DMG = 2;      // แบบที่ 1: ฟาดใส่เป้าหมายทันที 2 หน่วย
const SWORD_STRIKE_PER_TURN = 1; // แบบที่ 1: ใช้ได้ 1 ครั้งต่อเทิร์น
const SWORD_ATK_BONUS = 2;       // แบบที่ 2: พลังโจมตีปกติ +2
const SWORD_TURNS = 3;           // แบบที่ 2: ใช้โจมตีได้ 1 ครั้งภายใน 3 เทิร์น
const HIT_SOUND = "byleth_hit";  // hit_sound.mp3 — เสียงโจมตีเฉพาะของดาบต้องสาป

// ---------- หลักสูตรการสอน (ท่าไม้ตาย) ----------
const ULT_KNOWLEDGE_NEED = 4;    // ต้องมีความรู้อย่างน้อย 4 แต้มถึงจะเปิดได้
const ULT_DRAIN_PER_TURN = 1;    // เปิดค้างไว้ = ความรู้ลดลง 1 หน่วยต่อเทิร์น (หมด = ปิดเอง)
const END_DRAW_TIME_CUT = 2;     // จบการศึกษา: ทุกการจั่วของ "ทุกคน" บีบเวลาเฟสจั่วลง 2 วินาที
const END_COST_CUT = 1;          // จบการศึกษา: สกิลรอง/ท่าไม้ตายของทุกคนถูกลง 1 แต้ม
const END_DMG_REDUCE = 1;        // จบการศึกษา: ไบเลธรับความเสียหายน้อยลง 1 หน่วย

// 3 หลักสูตร — key ใช้เป็น item ที่ client ส่งมาตอนกดท่าไม้ตาย
const COURSES = {
  normal: {
    key: "normal",
    name: "หลักสูตร มาตราฐาน",
    icon: "📗",
    desc: "ผู้ชนะของเทิร์นนี้จะติดสถานะ \"สตั้น\" 1 เทิร์นในเทิร์นหน้า (ยกเว้นไบเลธ) · ผู้แพ้ของเทิร์นได้แต้มสกิลฟื้นเพิ่มอีก 1 หน่วย (ทุกคน) · คนที่ไพ่แตกจะไม่รับความเสียหายจากการที่แต้มเกิน 21 (ทุกคน)",
    music: { day: "byleth_normal_day", night: "byleth_normal_night" },
  },
  ex: {
    key: "ex",
    name: "หลักสูตร พิเศษ",
    icon: "📕",
    desc: "มีผลกับทุกคนยกเว้นไบเลธ — คนที่กดสกิลรองในเทิร์นนี้จะโจมตีไม่ได้ · คนที่กดท่าไม้ตายในเทิร์นนี้รับความเสียหาย 1 หน่วย · คนที่กดสกิลพื้นฐานในเทิร์นนี้จะกดสกิลพื้นฐานไม่ได้ 1 เทิร์นในเทิร์นหน้า",
    music: { day: "byleth_ex_day", night: "byleth_ex_night" },
  },
  end: {
    key: "end",
    name: "หลักสูตร จบการศึกษา",
    icon: "📘",
    desc: `การจั่วการ์ดของทุกคนบีบเวลาของเฟสจั่วลงครั้งละ ${END_DRAW_TIME_CUT} วินาที · แต้มสกิลที่ต้องใช้ของสกิลรองและท่าไม้ตายลดลง ${END_COST_CUT} แต้ม (ทุกคน) · ถ้าไบเลธแต้มน้อยที่สุดของเทิร์นแบบไพ่ไม่แตก แล้วผู้ชนะเลือกตีไบเลธ ไบเลธจะได้โจมตีตอบทันทีในเทิร์นเดียวกัน · ระหว่างนี้ไบเลธรับความเสียหายน้อยลง ${END_DMG_REDUCE} หน่วย`,
    music: { day: "byleth_end_day", night: "byleth_end_night" },
  },
};

const IMG = {
  base: "/characters/byleth/byleth.jpg",
  skill1: "/characters/byleth/byleth_skill1.jpg",
  skill2: "/characters/byleth/byleth_skill2.png",
  skill3: "/characters/byleth/byleth_skill3.webp",
};

function isByleth(p) { return !!p && p.characterId === ID; }
function knowledgeOf(p) { return isByleth(p) ? (p.bylethKnowledge || 0) : 0; }
function courseOf(p) { return isByleth(p) && p.alive ? (p.bylethCourse || null) : null; }
function swordOn(p) { return isByleth(p) && ((p.statuses && p.statuses.bylethSword) || 0) > 0; }

// ผู้เล่นไบเลธที่ยังอยู่และเปิดหลักสูตร key นี้ค้างไว้ (คืนคนแรกที่เจอ — สนามเดียวมีไบเลธได้คนเดียวต่อ id อยู่แล้ว)
function courseOwner(engine, key) {
  return engine.alivePlayers().find((o) => courseOf(o) === key && !engine.passiveSealed(o)) || null;
}

// โหมดทีม: ผลด้านลบของไบเลธต้องไม่ลงเพื่อนร่วมทีมตัวเอง (คอนเวนชันเดียวกับเอสคานอร์/บานาจ)
//  ยืมเกตกลางของ engine มาใช้แทนการเช็ค teamId เอง -> เคารพ teamModeActive/กติกาทีมชุดเดียวกันทั้งเกม
//  จำเป็นต้องห่อ withEffectSource เพราะ friendlyEffectBlocked อ่านจาก effectSourceId ซึ่งจุดที่เรียก
//  ฮุคเหล่านี้ (resolveRound / afterSummary) ไม่ได้ห่อไว้ให้
function friendlyTo(engine, owner, other) {
  if (!owner || !other || owner.id === other.id) return false;
  if (typeof engine.withEffectSource !== "function" || typeof engine.friendlyEffectBlocked !== "function") return false;
  return !!engine.withEffectSource(owner, () => engine.friendlyEffectBlocked(other));
}

module.exports = {
  id: ID,
  IMG,
  COURSES,
  KNOWLEDGE_MAX,
  SKILL_USES_PER_TURN,
  ULT_KNOWLEDGE_NEED,
  SWORD_KNOWLEDGE_COST,
  knowledgeOf,
  courseOf,
  swordActive: swordOn,
  courseOwner,

  // ---------- ความรู้: จุดเดียวที่เพิ่ม/ลดค่านี้ (เคารพเพดาน 20 เสมอ) ----------
  addKnowledge(p, n) {
    if (!isByleth(p)) return 0;
    const before = p.bylethKnowledge || 0;
    p.bylethKnowledge = Math.max(0, Math.min(KNOWLEDGE_MAX, before + n));
    return p.bylethKnowledge - before;
  },

  // ---------- เงื่อนไขการกด — เรียกจาก useSkill() ก่อนหักแต้ม ----------
  //  โควตารวม 5 ครั้ง/เทิร์นเช็คแยกที่ useSkill() (แพทเทิร์นเดียวกับทาคุมิ) — ที่นี่คือเงื่อนไขเฉพาะท่า
  canUseSkill(engine, p, tier, item) {
    if (tier === "basic") {
      if (p.bylethCourse) return false;                       // ระหว่างท่าไม้ตายเปิดอยู่ กดทบทวนบทเรียนไม่ได้
      if ((p.statuses.bylethNoBasic || 0) > 0) return false;   // โดนหลักสูตรพิเศษของไบเลธอีกคนสั่งห้าม
      return true;
    }
    if (tier === "secondary") {
      if (knowledgeOf(p) < SWORD_KNOWLEDGE_COST) return false;
      if (item === "buff") return !swordOn(p);                 // แบบที่ 2: ดาบต้องสาปยังอยู่ = กดซ้ำไม่ได้
      if (item === "strike") return (p.bylethStrikeUses || 0) < SWORD_STRIKE_PER_TURN; // แบบที่ 1: 1 ครั้ง/เทิร์น
      return false;                                           // ต้องเลือกแบบเสมอ
    }
    if (tier === "ultimate") {
      if (item === "off") return !!p.bylethCourse;            // ปิดใช้งาน
      if (!COURSES[item]) return false;                       // ต้องเลือกหลักสูตร 1 ใน 3 ทุกครั้งที่กด
      if (p.bylethCourse === item) return false;              // หลักสูตรเดิม = ไม่มีอะไรเปลี่ยน
      if (p.bylethCourse) return true;                        // สลับหลักสูตรระหว่างเปิดอยู่ ไม่ต้องเช็คความรู้ซ้ำ
      return knowledgeOf(p) >= ULT_KNOWLEDGE_NEED;
    }
    return true;
  },

  // เป้าหมายของดาบต้องสาปแบบที่ 1 (ฟาดทันที) — เลือกผู้เล่นอื่น 1 คนเท่านั้น
  prepareStrikeTarget(engine, p, targets) {
    const tgs = Array.isArray(targets) ? [...new Set(targets)] : [];
    const t = tgs.length === 1 ? engine.players[tgs[0]] : null;
    if (!t || !t.alive || t.id === p.id) return null;
    // โหมดทีม: เดิมเลือกเพื่อนร่วมทีมได้ ดาเมจถูกเกตกลางกันไว้จริง แต่ความรู้ 4 หน่วยถูกหักทิ้งฟรี
    if (friendlyTo(engine, p, t)) return null;
    return t;
  },

  // ---------- ผลของสกิลที่ทำงานทันที (instant) — เรียกจาก useSkill() ในส่วน effect ----------
  applyInstantSkill(engine, p, tier, item, target) {
    p.bylethSkillUsesRound = (p.bylethSkillUsesRound || 0) + 1;
    if (tier === "basic") return this.applyReview(engine, p);
    if (tier === "secondary") return this.applyCursedSword(engine, p, item, target);
    if (tier === "ultimate") return this.applyTeaching(engine, p, item);
    return "";
  },

  // ทบทวนบทเรียน: ความรู้ +1 แล้วพนัน 50/50 ว่าไพ่ใบถัดไปจะบวกหรือลบกับแต้มปัจจุบัน
  applyReview(engine, p) {
    const got = this.addKnowledge(p, BASIC_KNOWLEDGE_GAIN);
    const study = Math.random() < BASIC_STUDY_CHANCE;
    p.bylethNextDraw = study ? "study" : "rest";
    const left = Math.max(0, SKILL_USES_PER_TURN - (p.bylethSkillUsesRound || 0));
    const tail = ` (ความรู้ ${knowledgeOf(p)}/${KNOWLEDGE_MAX} · เหลือกดสกิลได้อีก ${left} ครั้งในเทิร์นนี้)`;
    if (study) {
      engine.log(`📖 ${p.name} ทบทวนบทเรียน — ความรู้ +${got} · ได้ "ศึกษาเพิ่ม": ไพ่ใบถัดไปจะนำแต้มมา "บวก" กับแต้มปัจจุบัน และฟื้นพลังชีวิต +${BASIC_STUDY_HEAL}${tail}`);
      return " — ศึกษาเพิ่ม";
    }
    engine.log(`📖 ${p.name} ทบทวนบทเรียน — ความรู้ +${got} · ได้ "พักผ่อน": ไพ่ใบถัดไปจะนำแต้มมา "ลบ" ออกจากแต้มปัจจุบัน${tail}`);
    return " — พักผ่อน";
  },

  // ดาบต้องสาป: จ่ายความรู้ 4 หน่วย เลือกฟาดทันที (strike) หรือเสริมพลังหมัดถัดไป (buff)
  applyCursedSword(engine, p, item, target) {
    this.addKnowledge(p, -SWORD_KNOWLEDGE_COST);
    if (item === "strike") {
      p.bylethStrikeUses = (p.bylethStrikeUses || 0) + 1;
      if (!target || !target.alive) {
        engine.log(`🗡️ ${p.name} ดาบต้องสาป — ไม่มีเป้าหมายให้ฟาด (ความรู้ -${SWORD_KNOWLEDGE_COST})`);
        return " — พลาดเป้า";
      }
      engine.skillFlash({ name: `ดาบต้องสาป → ${target.name}`, img: IMG.skill2, by: p.name, color: engine.colorOf(p), sound: HIT_SOUND });
      engine.dealMixed(target, SWORD_STRIKE_DMG);
      target.wasAttacked = true;
      engine.maybeBeatSave(target); engine.maybeBeatMode(target); engine.maybeEva3(target); engine.maybeWakeKotone(target);
      engine.log(`🗡️ ${p.name} ดาบต้องสาป — ฟาดใส่ ${target.name} ทันที -${SWORD_STRIKE_DMG} (ความรู้ -${SWORD_KNOWLEDGE_COST} เหลือ ${knowledgeOf(p)})`);
      if (target.alive && target.hp <= 0) {
        engine.instantDeath(target);
        if (!target.alive) engine.log(`💀 ${target.name} เลือดจริงหมด ตกรอบ!`);
      }
      return ` — ฟาด ${target.name} -${SWORD_STRIKE_DMG}`;
    }
    p.statuses.bylethSword = SWORD_TURNS;
    engine.log(`🗡️ ${p.name} ดาบต้องสาป — เสริมพลังให้ตัวเอง: พลังโจมตีปกติ +${SWORD_ATK_BONUS} ใช้ได้ 1 ครั้งภายใน ${SWORD_TURNS} เทิร์น (ความรู้ -${SWORD_KNOWLEDGE_COST} เหลือ ${knowledgeOf(p)})`);
    return ` — ดาบต้องสาป +${SWORD_ATK_BONUS}`;
  },

  // หลักสูตรการสอน: สวิตช์เปิด/ปิด — เปิดค้างจนความรู้หมดหรือกดปิดเอง
  applyTeaching(engine, p, item) {
    if (item === "off") {
      const old = COURSES[p.bylethCourse];
      p.bylethCourse = null;
      engine.log(`🎓 ${p.name} ปิด "${old ? old.name : "หลักสูตรการสอน"}" — สนามกลับสู่กติกาปกติ (ความรู้เหลือ ${knowledgeOf(p)})`);
      return " — ปิดหลักสูตร";
    }
    const course = COURSES[item];
    const switching = !!p.bylethCourse;
    p.bylethCourse = item;
    p.transformAt = engine.nextTransformCounter(); // เพลงประจำหลักสูตรใช้ลำดับนี้ตัดสินว่าใครล่าสุด
    engine.log(`🎓 ${p.name} หลักสูตรการสอน — ${switching ? "เปลี่ยนไปใช้" : "เปิด"} "${course.name}" (ความรู้ ${knowledgeOf(p)}/${KNOWLEDGE_MAX} · ลดลง ${ULT_DRAIN_PER_TURN} หน่วยต่อเทิร์นจนกว่าจะหมดหรือกดปิด)`);
    engine.log(`${course.icon} ${course.desc}`);
    return ` — ${course.name}`;
  },

  // ---------- ไพ่ใบถัดไปหลังทบทวนบทเรียน — เรียกจาก onCardDrawn() ของ server ----------
  //  การ์ดพิเศษ (King/Queen/Joker) ไม่มี "แต้มล่าสุดที่จั่วได้" -> ข้ามไป ผลยังค้างรอไพ่ใบถัดไป
  onCardDraw(engine, p, card) {
    if (!isByleth(p) || !p.bylethNextDraw || !card || card.special) return;
    const mode = p.bylethNextDraw;
    p.bylethNextDraw = null;
    const v = card.value || 0;
    if (mode === "study") {
      const heal = engine.healHp(p, BASIC_STUDY_HEAL);
      engine.log(`📖 ${p.name} ศึกษาเพิ่ม — ไพ่ ${v} แต้มถูกบวกเข้ากับแต้มปัจจุบันตามปกติ (แต้มรวม ${engine.scoreOf(p)})${heal > 0 ? ` · ฟื้นพลังชีวิต +${heal}` : ""}`);
      return;
    }
    // พักผ่อน: หักแต้มใบนี้ออกแทนที่จะบวก -> ต้องลบ 2 เท่า เพราะ calculateScore บวกไพ่ใบนี้ไปแล้ว
    //  แต้มมีพื้นล่างที่ 0 เสมอ: ถ้าลบแล้วจะติดลบ ให้หักแค่พอดีจนเหลือ 0 (ไม่สะสมค่าติดลบไว้ใน cardBonus
    //  ไม่งั้นไพ่ใบถัดๆ ไปจะถูกกินแต้มไปด้วยทั้งที่ผลของ "พักผ่อน" ใช้ไปแล้ว)
    const before = engine.scoreOf(p);
    p.cardBonus = (p.cardBonus || 0) - Math.min(v * 2, Math.max(0, before));
    engine.log(`💤 ${p.name} พักผ่อน — ไพ่ ${v} แต้มถูกนำไป "ลบ" ออกจากแต้มปัจจุบันแทน (แต้มรวม ${engine.scoreOf(p)}${before - v * 2 < 0 ? " · ต่ำสุดที่ 0" : ""})`);
  },

  // ---------- หลักสูตรจบการศึกษา: ทุกการจั่วของทุกคนบีบเวลาเฟสจั่ว ----------
  onAnyCardDraw(engine, drawer) {
    const owner = courseOwner(engine, "end");
    if (!owner || !drawer) return;
    const left = engine.reduceCardTimer(END_DRAW_TIME_CUT);
    engine.log(`⏳ ${drawer.name} จั่วการ์ดระหว่าง "${COURSES.end.name}" — เวลาของเฟสจั่วลดลง ${END_DRAW_TIME_CUT} วินาที (เหลือ ${left} วิ)`);
  },

  // ---------- หลักสูตรจบการศึกษา: สกิลรอง/ท่าไม้ตายของทุกคนถูกลง 1 แต้ม ----------
  //  ใช้ทั้งที่ useSkill() (หักจริง) และ publicState() (ราคาบนปุ่ม) — ต้องเป็นสูตรเดียวกันเป๊ะ
  costDiscount(engine, tier) {
    if (tier !== "secondary" && tier !== "ultimate") return 0;
    return courseOwner(engine, "end") ? END_COST_CUT : 0;
  },

  // ---------- ดาบต้องสาป: พลังโจมตีปกติ +2 (เรียกจาก computeAttackBase) ----------
  damageBonus(engine, attacker) {
    return swordOn(attacker) ? SWORD_ATK_BONUS : 0;
  },

  // ---------- หลักสูตรจบการศึกษา: ไบเลธรับความเสียหายน้อยลง 1 หน่วย ----------
  adjustIncomingDamage(engine, p, n) {
    if (!isByleth(p) || courseOf(p) !== "end" || engine.passiveSealed(p)) return n;
    if (!(n > 0)) return n;
    return Math.max(0, n - END_DMG_REDUCE);
  },

  // เสียงโจมตีปกติเฉพาะตัว (hit_sound.mp3) ระหว่างถือดาบต้องสาป
  attackSound(attacker) { return swordOn(attacker) ? HIT_SOUND : undefined; },

  // ดาบต้องสาปใช้ได้ครั้งเดียว — ตัดทิ้งหลังการโจมตีปกติลงแล้ว (เรียกจาก doAttack)
  onAttackLanded(engine, attacker) {
    if (!swordOn(attacker)) return 0;
    delete attacker.statuses.bylethSword;
    if (attacker.statusAmt) delete attacker.statusAmt.bylethSword;
    engine.log(`🗡️ ${attacker.name} ดาบต้องสาปฟาดลงแล้ว (+${SWORD_ATK_BONUS}) — ดาบสลายไป`);
    return SWORD_ATK_BONUS;
  },

  // ---------- สกิลติดตัว 2 sothis: ฟื้นคืนชีพ 1 ครั้งต่อเกม (เลือด 1 เกราะ 0) ----------
  //  เรียกจาก instantDeath() ก่อนตั้ง alive=false (แพทเทิร์นเดียวกับสกิลติดตัว 1 ของริต้า เบอร์นัล)
  tryRevive(engine, p) {
    if (!isByleth(p) || p.bylethRevived || engine.passiveSealed(p)) return false;
    p.bylethRevived = true;
    p.alive = true;
    p.result = null;
    p.locked = false;
    p.hp = 1;
    p.armor = 0;
    p.shield = 0;
    p.tempHp = 0;
    engine.skillFlash({ name: "sothis — ย้อนเวลากลับมา", img: IMG.base, by: p.name, color: engine.colorOf(p) });
    engine.log(`⏳✨ ${p.name} sothis — ย้อนเวลาหนีความตาย! ฟื้นคืนชีพด้วยพลังชีวิต 1 หน่วย เกราะ 0 หน่วย (ครั้งเดียวต่อเกม)`);
    return true;
  },

  // ---------- หลักสูตร มาตราฐาน ----------
  //  ผู้ชนะติดสตั้น 1 เทิร์นในเทิร์นหน้า (ยกเว้นไบเลธเอง) — ตั้งธงไว้ให้ dealRound แปลงเป็นสถานะจริง
  onRoundWinner(engine, winner) {
    const owner = courseOwner(engine, "normal");
    if (!owner || !winner || !winner.alive || winner.id === owner.id) return;
    if (friendlyTo(engine, owner, winner)) return; // โหมดทีม: ไม่สตั้นเพื่อนร่วมทีมตัวเอง
    winner.bylethStunPending = 1;
    engine.log(`📗 ${winner.name} เป็นผู้ชนะระหว่าง "${COURSES.normal.name}" — เทิร์นถัดไปจะติดสถานะสตั้น 1 เทิร์น`);
  },
  //  ผู้แพ้ได้แต้มสกิลฟื้นเพิ่มอีก 1 หน่วย (มีผลกับทุกคน รวมไบเลธ)
  onRoundLoser(engine, loser) {
    const owner = courseOwner(engine, "normal");
    if (!owner || !loser || !loser.alive) return;
    const before = loser.skillPoints;
    engine.addSkill(loser, 1, "passive");
    if (loser.skillPoints > before) engine.log(`📗 ${loser.name} เป็นผู้แพ้ระหว่าง "${COURSES.normal.name}" — แต้มสกิลฟื้นเพิ่ม +${loser.skillPoints - before}`);
  },
  //  ไพ่แตกแล้วไม่รับความเสียหายจากการที่แต้มเกิน 21 (มีผลกับทุกคน รวมไบเลธ)
  bustDamageImmune(engine, p) {
    return !!courseOwner(engine, "normal") && !!p;
  },

  // ---------- หลักสูตร พิเศษ (ยกเว้นไบเลธเอง) ----------
  //  เรียกจาก resolveRound() หลังทุกคนล็อกไพ่แล้ว — อ่านจาก roundSkills ว่าใครกดสกิลอะไรไปบ้างในเทิร์นนี้
  applyExPunish(engine) {
    const owner = courseOwner(engine, "ex");
    if (!owner) return;
    const seenUlt = new Set();
    const seenBasic = new Set();
    for (const entry of engine.roundSkills) {
      if (!entry || entry.playerId === owner.id) continue;
      const t = engine.players[entry.playerId];
      if (!t || !t.alive) continue;
      if (friendlyTo(engine, owner, t)) continue; // เดิมดาเมจถูกเกตกลางกัน แต่ "ห้ามสกิลพื้นฐาน" ยังลงเพื่อนร่วมทีม
      if (entry.tier === "ultimate" && !seenUlt.has(t.id)) {
        seenUlt.add(t.id);
        engine.withEffectSource(owner, () => {
          engine.dealMixed(t, 1);
          engine.maybeBeatSave(t); engine.maybeBeatMode(t); engine.maybeEva3(t); engine.maybeWakeKotone(t);
        });
        engine.log(`📕 ${t.name} กดท่าไม้ตายระหว่าง "${COURSES.ex.name}" — รับความเสียหาย -1`);
        if (t.alive && t.hp <= 0) {
          engine.instantDeath(t);
          if (!t.alive) engine.log(`💀 ${t.name} เลือดจริงหมด ตกรอบ!`);
        }
      }
      if (entry.tier === "basic" && !seenBasic.has(t.id)) {
        seenBasic.add(t.id);
        t.bylethNoBasicPending = 1; // dealRound แปลงเป็นสถานะจริงในเทิร์นถัดไป
        engine.log(`📕 ${t.name} กดสกิลพื้นฐานระหว่าง "${COURSES.ex.name}" — เทิร์นหน้ากดสกิลพื้นฐานไม่ได้ 1 เทิร์น`);
      }
    }
  },
  //  ผู้ชนะที่กดสกิลรองในเทิร์นนี้จะโจมตีไม่ได้ (เรียกจาก afterSummary)
  blocksAttack(engine, winner) {
    const owner = courseOwner(engine, "ex");
    if (!owner || !winner || winner.id === owner.id) return false;
    if (friendlyTo(engine, owner, winner)) return false; // โหมดทีม: ไม่ตัดเทิร์นโจมตีของเพื่อนร่วมทีม
    return engine.roundSkills.some((e) => e && e.playerId === winner.id && e.tier === "secondary");
  },

  // ---------- หลักสูตร จบการศึกษา: โจมตีตอบผู้ชนะในเทิร์นเดียวกัน ----------
  //  เงื่อนไข: ไบเลธแต้มน้อยสุดของเทิร์นแบบไพ่ไม่แตก (ตั้งธงที่ resolveRound) และเพิ่งถูกผู้ชนะตี
  markLowestScore(engine, p) {
    if (courseOf(p) !== "end" || engine.passiveSealed(p)) return;
    p.bylethLowScore = true;
  },
  onAttacked(engine, attacker, target) {
    if (!isByleth(target) || !target.alive) return;
    if (courseOf(target) !== "end" || engine.passiveSealed(target)) return;
    if (!target.bylethLowScore || !attacker || attacker.id === target.id) return;
    target.bylethCounterReady = true;
  },
  startCounterAttack(engine, attacker) {
    const p = engine.alivePlayers().find((o) => isByleth(o) && o.bylethCounterReady);
    if (!p) return false;
    p.bylethCounterReady = false;
    if (courseOf(p) !== "end") return false;
    if (!engine.attackableTargets(p.id).length) return false;
    engine.setAttackerId(p.id);
    engine.log(`📘 ${p.name} "${COURSES.end.name}" — ถูกผู้ชนะตีทั้งที่แต้มน้อยสุดแบบไพ่ไม่แตก จึงได้โจมตีตอบทันทีในเทิร์นเดียวกัน`);
    return true;
  },

  // ---------- เพลงประจำหลักสูตร (client/src/audio.js) ----------
  //  คืน { music, at } ให้ buildStateFor เอาไปวางลำดับเพลงรวมกับตัวอื่น — สลับกลางวัน/กลางคืนแล้ว
  //  ฝั่ง client จะเล่นเพลงอีกไฟล์ต่อจากตำแหน่งเดิม (MUSIC_POSITION_GROUPS) ให้ไหลลื่นไม่สะดุด
  activeMusic(engine, night) {
    let best = null;
    for (const p of engine.alivePlayers()) {
      const course = courseOf(p);
      if (!course || !COURSES[course] || engine.passiveSealed(p)) continue;
      const at = p.transformAt || 0;
      if (!best || at > best.at) best = { music: COURSES[course].music[night ? "night" : "day"], at };
    }
    return best;
  },

  // ---------- ต้นเทิร์น — เรียกจาก dealRound() ----------
  onRoundStartTick(engine, p) {
    p.bylethSkillUsesRound = 0; // โควตาสกิล 5 ครั้ง เต็มใหม่ทุกเทิร์น
    p.bylethStrikeUses = 0;     // ดาบต้องสาปแบบฟาดทันที: 1 ครั้ง/เทิร์น
    p.bylethLowScore = false;
    p.bylethCounterReady = false;
    if (!p.bylethCourse) return;
    // หลักสูตรกินความรู้เทิร์นละ 1 หน่วย — หมดเมื่อไหร่ปิดตัวเองทันที
    const used = -this.addKnowledge(p, -ULT_DRAIN_PER_TURN);
    const course = COURSES[p.bylethCourse];
    if (knowledgeOf(p) <= 0) {
      p.bylethCourse = null;
      engine.log(`🎓 ${p.name} ความรู้หมดลง — "${course ? course.name : "หลักสูตรการสอน"}" ปิดตัวเองอัตโนมัติ`);
      return;
    }
    engine.log(`🎓 ${p.name} คง "${course ? course.name : "หลักสูตรการสอน"}" ไว้ต่อ — ความรู้ -${used} (เหลือ ${knowledgeOf(p)}/${KNOWLEDGE_MAX})`);
  },

  // สถานะที่หลักสูตรของไบเลธตั้งค้างไว้ให้ "เริ่มมีผลเทิร์นถัดไป" — เรียกจาก dealRound() ของทุกผู้เล่น
  //  (แพทเทิร์นเดียวกับ Gargorgon Ray / อมาซอนของฮารุกะ — ต้องอยู่ก่อนบล็อกเช็คสตั้นใน dealRound)
  applyPendingFromCourses(engine, p) {
    if (p.bylethStunPending > 0) {
      const turns = p.bylethStunPending;
      p.bylethStunPending = 0;
      if (engine.applyDebuff(p, "stun", null, turns)) engine.log(`😵 ${p.name} เป็นผู้ชนะเมื่อเทิร์นก่อนระหว่าง "${COURSES.normal.name}" — ติดสถานะสตั้น ${turns} เทิร์น!`);
      else engine.log(`🛡️ ${p.name} ต้านผลของ "${COURSES.normal.name}" ไว้ได้ — ไม่ติดสตั้น`);
    }
    if (p.bylethNoBasicPending > 0) {
      const turns = p.bylethNoBasicPending;
      p.bylethNoBasicPending = 0;
      if (engine.applyDebuff(p, "bylethNoBasic", null, turns)) engine.log(`📕 ${p.name} กดสกิลพื้นฐานเมื่อเทิร์นก่อนระหว่าง "${COURSES.ex.name}" — เทิร์นนี้กดสกิลพื้นฐานไม่ได้`);
    }
  },

  // ---------- ฟิลด์ที่ต้องรีเซ็ตทุกแมตช์ — เรียกจาก resetCombat() ----------
  resetCombat(p) {
    p.bylethKnowledge = 0;        // ความรู้สะสม (0-20)
    p.bylethCourse = null;        // หลักสูตรที่เปิดค้างอยู่ ("normal" | "ex" | "end" | null)
    p.bylethNextDraw = null;      // ผลทบทวนบทเรียนที่รอไพ่ใบถัดไป ("study" | "rest" | null)
    p.bylethSkillUsesRound = 0;   // ภูมิปัญญา: กดสกิลไปแล้วกี่ครั้งในเทิร์นนี้ (0-5)
    p.bylethStrikeUses = 0;       // ดาบต้องสาป (ฟาดทันที): ใช้ไปแล้วกี่ครั้งในเทิร์นนี้ (0-1)
    p.bylethRevived = false;      // sothis: ใช้ฟื้นคืนชีพไปแล้วหรือยัง (1 ครั้งต่อเกม)
    p.bylethLowScore = false;     // จบการศึกษา: เทิร์นนี้ไบเลธแต้มน้อยสุดแบบไพ่ไม่แตกหรือไม่
    p.bylethCounterReady = false; // จบการศึกษา: รอโจมตีตอบหลังผู้ชนะตีเสร็จ
    p.bylethStunPending = 0;      // มาตราฐาน: สตั้นที่จะลงในเทิร์นถัดไป (ของ "ผู้ชนะ" ไม่ใช่ของไบเลธ)
    p.bylethNoBasicPending = 0;   // พิเศษ: ห้ามใช้สกิลพื้นฐานที่จะลงในเทิร์นถัดไป (ของผู้เล่นคนอื่น)
  },
};
