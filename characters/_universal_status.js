// ============================================================
//  บัฟ & ดีบัฟพื้นฐาน (universal) — ระบบสถานะที่ตัวละครไหนก็ใช้ร่วมกันได้
//  ไฟล์นี้ไม่ใช่ "ตัวละคร" (จึงไม่มี id/ไม่ถูกลงทะเบียนใน CHAR_HOOKS) — เป็น pure function
//  ล้วนๆ รับ player object เป็นพารามิเตอร์ตรงๆ ไม่ผูกกับ server.js/engine เลย
//  server.js require() ไฟล์นี้โดยตรง และ expose ทุกตัวผ่าน engine ให้ characters/*.js เรียกใช้ได้
//
//  บัฟ:   spellflow (กระแสเวท: ใช้สกิลเสียพลังงานลดลง N) / might (เสริมพลัง: ดาเมจที่ทำได้ +N)
//         guard (คุ้มครอง: ดาเมจที่ได้รับ -N) / resist (ต้านสถานะผิดปกติ: ล้าง+ต้านดีบัฟพื้นฐาน)
//         fortune (โชคลาภ: จั่วได้ไพ่ที่ดีที่สุด — ซ้อน 3)
//  ดีบัฟ: spellburden (ภาระเวท: ใช้สกิลเสียพลังงานเพิ่ม N ไม่เกิน 8) / weak (อ่อนแอ: ดาเมจที่ทำได้ -N)
//         fragile (เปราะบาง: ดาเมจที่ได้รับ +N) / sleep (หลับใหล) / stun (สตั้น)
//         nodraw (ห้ามจั่ว) / noskill (ห้ามใช้สกิล) / nohealing (ไร้ทางเยียวยา: ฟื้นเลือดจริงไม่ได้)
//         invert (ผกผัน: กลับด้านบัฟ/การฟื้นฟูทั้งหมด) / hburn (ลุกไหม้: ดาเมจ 1/เทิร์น สะสมได้ — ดู tickBurn)
//  บัฟ (ต่อ): netramana (เนตรมณะ: โจมตีปกติมีโอกาสสังหารทันที NETRAMANA_KILL_CHANCE — ดู netramanaActive)
//  จำนวน (amount) ของสถานะเก็บแยกใน p.statusAmt[key] — p.statuses[key] เก็บจำนวนเทิร์น/ครั้งตามเดิม
//
//  evade (หลบหลีก) เป็นกรณีพิเศษ ไม่ผ่าน applyBuff/statusAmtOf แบบตัวอื่น: แต่ละสแตคมีอายุของตัวเอง
//  EVADE_STACK_TURNS เทิร์น หมดอายุแยกจากกัน (ไม่ต่ออายุกันเองเมื่อได้สแตคใหม่) ซ้อนพร้อมกันได้สูงสุด
//  EVADE_STACK_MAX สแตค — เก็บจริงใน p.evadeStacks (array ของจำนวนเทิร์นที่เหลือต่อสแตค) ส่วน
//  p.statuses.evade เป็นแค่ mirror ของ p.evadeStacks.length ไว้ให้โค้ดอื่นอ่านจำนวนสแตคได้แบบเดิม
//  ใช้ grantEvadeStack/consumeEvadeStack/tickEvadeStacks จัดการ ห้ามแก้ p.statuses.evade ตรงๆ
// ============================================================

const SPELLBURDEN_MAX = 8; // ภาระเวท: เพิ่มค่าใช้พลังงานได้ไม่เกิน 8 หน่วย

function statusAmtOf(p, key) {
  if (!p || ((p.statuses && p.statuses[key]) || 0) <= 0) return 0;
  return Math.max(0, (p.statusAmt && p.statusAmt[key]) || 0);
}

function applyBuff(p, key, amount, turns) {
  p.statuses[key] = Math.max(p.statuses[key] || 0, turns || 1);
  if (amount != null) {
    p.statusAmt = p.statusAmt || {};
    p.statusAmt[key] = Math.max(p.statusAmt[key] || 0, amount);
  }
}

// ต้านสถานะผิดปกติ: จาก Sanctuary Hymn หรือสถานะ resist อื่นๆ ที่ตัวละครใดก็ตั้งได้
function resistActive(p) {
  if (!p) return false;
  return ((p.statuses && p.statuses.resist) || 0) > 0;
}

// ดีบัฟพื้นฐาน: ติดไม่เข้าถ้าเป้าหมายมี "ต้านสถานะผิดปกติ" — คืน false = โดนต้าน
function applyDebuff(p, key, amount, turns) {
  if (resistActive(p)) return false;
  applyBuff(p, key, amount, turns);
  return true;
}

// ดีบัฟพื้นฐานที่ "ต้านสถานะผิดปกติ" ล้างออกได้ทั้งหมด
const BASIC_DEBUFF_CLEAR = ["discord", "sleep", "stun", "nodraw", "noskill", "weak", "fragile", "spellburden", "oblada", "calamity", "hburn", "phenexBanUlt", "nanayaSeal", "miyakoSeal", "invert", "nohealing", "manaSeal"];
// ดีบัฟที่ยังไม่เกิดผลทันที (ยามฟ้าสาง / เส้นชีวิต): โดนล้าง = ลดลงทีละ 1 หน่วย ไม่หายทั้งหมด
const SOFT_DEBUFF_STEP = ["dawn", "deathline"];

function cleanseDebuffs(p) {
  let purged = 0;
  for (const k of BASIC_DEBUFF_CLEAR) {
    // Mana Burden (ผู้สังหารจอมมหาเวทย์): Bard ที่ติดตราล่าเวทอยู่ตอนโดนภาระเวท — ล้างสถานะนี้ด้วยต้านสถานะผิดปกติไม่ได้
    if (k === "spellburden" && p.mageslayerLockedBurden) continue;
    if ((p.statuses[k] || 0) > 0) {
      delete p.statuses[k];
      if (p.statusAmt) delete p.statusAmt[k];
      purged++;
    }
  }
  for (const k of SOFT_DEBUFF_STEP) {
    if ((p.statuses[k] || 0) > 0) {
      p.statuses[k]--;
      if (p.statuses[k] <= 0) delete p.statuses[k];
      purged++;
    }
  }
  return purged;
}

// "ไร้ทางเยียวยา" (สถานะ Universal): ฟื้นเลือดจริงไม่ได้
function noHealActive(p) {
  return !!p && ((p.statuses && p.statuses.nohealing) || 0) > 0;
}

// "ผกผัน" (สถานะ Universal patch 2.2.1): กลับด้านบัฟ/การฟื้นฟูทั้งหมด (ฟื้นเลือด/เกราะ -> เสียแทน, เพิ่มพลังโจมตี -> ลดแทน)
function invertActive(p) {
  return !!p && ((p.statuses && p.statuses.invert) || 0) > 0;
}

// "ลุกไหม้" (hburn, สถานะ Universal): ทำดาเมจ 1 หน่วยทุกต้นเทิร์น (ลดเกราะก่อน) แล้วลดจำนวนลง 1 — ตัวละครไหนก็ติด/ให้ติดได้
//  ⚠️ ฟังก์ชันนี้ต่างจากตัวอื่นในไฟล์นี้ตรงที่ต้องใช้ engine (ไม่ pure) เพราะต้องเรียก dealMixed/healHp/log ฯลฯ
//  ถ้าตัวละครเจ้าของสถานะ implement hburnHeals(p)/hburnLabel(p) ในไฟล์ตัวเอง (ดู characters/hikaru.js,
//  characters/phenex.js) จะฮีลแทนรับดาเมจได้ตามเงื่อนไขของตัวเอง — ค่าเริ่มต้นถ้าไม่ implement คือรับดาเมจตรงๆ
//  ตัวละครใหม่ในอนาคตที่อยากให้ลุกไหม้ทำงานพิเศษ แค่เพิ่ม 2 เมธอดนี้ในไฟล์ตัวเอง ไม่ต้องแก้ไฟล์นี้เลย
function tickBurn(engine, p) {
  if (!p || !p.alive || !(((p.statuses && p.statuses.hburn) || 0) > 0)) return;
  const hooks = engine.CHAR_HOOKS && engine.CHAR_HOOKS[p.characterId];
  const heals = !!(hooks && hooks.hburnHeals && hooks.hburnHeals(p));
  const label = (hooks && hooks.hburnLabel && hooks.hburnLabel(p)) || "ลุกไหม้";
  if (heals) {
    const heal = engine.healHp(p, 1);
    engine.log(`❤️‍🔥 ${p.name} ${label} — ลุกไหม้กลายเป็นการรักษา ฟื้นพลังชีวิต +${heal} (เหลืออีก ${p.statuses.hburn - 1} หน่วย)`);
  } else {
    engine.dealMixed(p, 1); // ลุกไหม้: ลดเกราะก่อน ถ้าไม่มีเกราะจึงเข้าเลือดจริง
    engine.log(`🔥 ${p.name} ลุกไหม้ — เสียหาย -1 (ลดเกราะก่อน) (เหลืออีก ${p.statuses.hburn - 1} หน่วย)`);
    engine.maybeBeatSave(p);
    engine.maybeBeatMode(p);
    engine.maybeEva3(p);
    engine.maybeWakeKotone(p);
    if (p.alive && p.hp <= 0) {
      engine.instantDeath(p);
      if (!p.alive) engine.log(`💀 ${p.name} เลือดจริงหมด ตกรอบ!`);
    }
  }
  p.statuses.hburn = Math.max(0, p.statuses.hburn - 1);
  if (p.statuses.hburn <= 0) delete p.statuses.hburn;
}

// "เนตรมณะ" (netramana, สถานะ Universal patch 2.2.7 — เจ้าหญิงราก "ทุกอย่างจะต้องราบรื่น"):
//  ผู้ที่ติดบัฟนี้ โจมตีปกติแล้วมีโอกาสสังหารเป้าหมายทันที 20% — ตัวละครไหนก็ติด/ให้ติดได้
//  จุดโรลจริงอยู่ใน doAttack() ของ server.js (ต้องใช้ cutscene/lastAttack/เฟสโจมตี จึงเป็น pure predicate ที่นี่)
const NETRAMANA_KILL_CHANCE = 0.20;
function netramanaActive(p) {
  return !!p && ((p.statuses && p.statuses.netramana) || 0) > 0;
}

const EVADE_STACK_MAX = 3;   // หลบหลีก: สะสมสแตคพร้อมกันได้สูงสุด 3
const EVADE_STACK_TURNS = 2; // หลบหลีก: แต่ละสแตคมีอายุของตัวเอง 2 เทิร์น แล้วหมดไปเอง (ไม่เกี่ยวกับสแตคอื่น ไม่ต่ออายุกันเอง)

// ให้สแตคหลบหลีกใหม่ 1 สแตค (อายุ EVADE_STACK_TURNS เทิร์นของตัวเอง) — ไม่เกิน EVADE_STACK_MAX สแตคพร้อมกัน
// คืน true ถ้าให้สำเร็จ, false ถ้าเต็มเพดานอยู่แล้ว (ไม่ต่ออายุสแตคเดิมที่มีอยู่)
function grantEvadeStack(p) {
  p.evadeStacks = p.evadeStacks || [];
  if (p.evadeStacks.length >= EVADE_STACK_MAX) return false;
  p.evadeStacks.push(EVADE_STACK_TURNS);
  p.statuses.evade = p.evadeStacks.length;
  return true;
}

// ใช้สแตคหลบหลีก 1 สแตค (เอาอันที่ใกล้หมดอายุที่สุดออกก่อน) — เรียกตอนถูกเลือกเป็นเป้าโจมตี ไม่ว่าหลบพ้นหรือไม่
function consumeEvadeStack(p) {
  if (!Array.isArray(p.evadeStacks) || !p.evadeStacks.length) return;
  let minIdx = 0;
  for (let i = 1; i < p.evadeStacks.length; i++) {
    if (p.evadeStacks[i] < p.evadeStacks[minIdx]) minIdx = i;
  }
  p.evadeStacks.splice(minIdx, 1);
  p.statuses.evade = p.evadeStacks.length;
  if (!p.evadeStacks.length) {
    delete p.statuses.evade;
    if (p.statusAmt) delete p.statusAmt.evade;
  }
}

// เรียกทุกจบเทิร์นต่อผู้เล่น — แต่ละสแตคนับถอยหลังอายุของตัวเอง หมดอายุอันไหนก็หายไปเฉพาะอันนั้น
function tickEvadeStacks(engine, p) {
  if (!Array.isArray(p.evadeStacks) || !p.evadeStacks.length) return;
  const before = p.evadeStacks.length;
  p.evadeStacks = p.evadeStacks.map((t) => t - 1).filter((t) => t > 0);
  p.statuses.evade = p.evadeStacks.length;
  if (!p.evadeStacks.length) delete p.statuses.evade;
  if (p.evadeStacks.length < before) {
    engine.log(`💨 ${p.name} หลบหลีกบางส่วนหมดอายุ (ครบ ${EVADE_STACK_TURNS} เทิร์น) — เหลือ ${p.evadeStacks.length}/${EVADE_STACK_MAX} ครั้ง`);
  }
}

module.exports = {
  SPELLBURDEN_MAX,
  statusAmtOf,
  applyBuff,
  applyDebuff,
  resistActive,
  BASIC_DEBUFF_CLEAR,
  SOFT_DEBUFF_STEP,
  cleanseDebuffs,
  noHealActive,
  invertActive,
  tickBurn,
  NETRAMANA_KILL_CHANCE,
  netramanaActive,
  EVADE_STACK_MAX,
  EVADE_STACK_TURNS,
  grantEvadeStack,
  consumeEvadeStack,
  tickEvadeStacks,
};
