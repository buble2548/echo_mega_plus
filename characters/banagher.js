// ============================================================
//  บานาจ ลิงก์ (patch 2.1.2) — Absorb shield / Full Assault / NT-D System (สกิลติดตัว) / NewType Paradise (ท่าไม้ตาย 1) /
//  แสงที่ไม่อยู่เพียงลำพัง (ท่าไม้ตาย 2) / สกิลติดตัว 2 (ฉันไม่อยากให้เราต้องมาสู้กัน — ล็อกเป้าแก้แค้นใส่ริดดี้ที่ไม่ใช่พันธมิตร)
//  ย้ายออกมาจาก server.js — ดู characters/index.js สำหรับไฟล์มัดรวม, characters/riddhe.js สำหรับฝั่งริดดี้
//  หมายเหตุ: NewType Paradise/unibeam2 ทั้งคู่พึ่งพาระบบพันธมิตรของริดดี้ (`engine.riddheAllied`,
//  `CHAR_HOOKS.riddhe.grantFreeNtdToAlly`) — เรียกผ่าน engine เท่านั้น ไม่แตะ internals ของริดดี้ตรงๆ
//  ระบบยื่นข้อเสนอพันธมิตร/ตอบรับ/ยกเลิกยังอยู่ server.js เป็น thin wrapper (ดูหมายเหตุ riddhe.js)
//  BANAGHER_SHIELD_AMT มีสำเนาที่นี่ (ใช้แค่ log) กับใน server.js (ฟื้นโล่ต้นเทิร์นที่ยังมีผล — shared round-start loop)
// ============================================================

const BANAGHER_SHIELD_AMT = 2;    // Absorb shield: โล่ที่มอบให้เป้าหมาย (มีสำเนาใน server.js สำหรับฟื้นโล่ต้นเทิร์น)
const BANAGHER_SHIELD_TURNS = 2;  // Absorb shield: คงอยู่ 2 เทิร์น
const BANAGHER_ASSAULT_TURNS = 3; // Full Assault: ตีหมู่ทุกคน 3 เทิร์น เทิร์นละ 1 หน่วย
const BANAGHER_ULT2_ALLY_COST = 8; // แสงที่ไม่อยู่เพียงลำพัง: หักแต้มสกิลริดดี้พันธมิตรเพิ่มอีก 8 แต้ม (คอสจริงรวม 16)
const BANAGHER_ULT2_TARGET_DMG = 6; // แสงที่ไม่อยู่เพียงลำพัง: ดาเมจเสริมใส่เป้าหมาย (รวมพื้นฐาน 1 = 7)

module.exports = {
  id: "banagher",

  // ดาเมจ contribution (แสงที่ไม่อยู่เพียงลำพัง +6) — เรียกจาก computeAttackBase()
  damageBonus(engine, attacker, target, ctx) {
    const unibeam2Atk = (attacker.statuses.unibeam2 || 0) > 0;
    ctx.unibeam2Atk = unibeam2Atk;
    return unibeam2Atk ? BANAGHER_ULT2_TARGET_DMG : 0;
  },

  // เรียกจาก useSkill()'s gate — เตรียมเป้าหมาย Absorb shield (เลือกตัวเองได้)
  prepareShieldTarget(engine, p, targets) {
    const tgs = Array.isArray(targets) ? [...new Set(targets)] : [];
    const t = tgs.length === 1 ? engine.players[tgs[0]] : null;
    if (!t || !t.alive) return null;
    return t;
  },

  // เรียกจาก useSkill() ในส่วน effect — Absorb shield: มอบโล่ + ผูกเจ้าของสกิลไว้ (โล่แตกระหว่างมีผล -> ฟื้นเลือดให้เจ้าของสกิลตามที่เสีย)
  applyShieldEffect(engine, p, t) {
    t.shield += BANAGHER_SHIELD_AMT;
    t.statuses.bshield = BANAGHER_SHIELD_TURNS;
    t.bshieldOwnerId = p.id;
    engine.log(`🛡️ ${p.name} Absorb shield — มอบโล่ +${BANAGHER_SHIELD_AMT} (${BANAGHER_SHIELD_TURNS} เทิร์น) ให้${t.id === p.id ? "ตัวเอง" : ` ${t.name}`} — หากโล่แตกระหว่างนี้จะฟื้นเลือดให้ ${p.name} ตามจำนวนที่เสีย`);
  },

  // เรียกจาก useSkill() ในส่วน effect — Full Assault: ตีหมู่ทุกคนทันที 1 หน่วย (เทิร์นถัดไปอีก 2 ครั้งผ่าน onRoundStartFullAssaultTick)
  activateFullAssault(engine, p) {
    p.transformAt = engine.nextTransformCounter();
    const hits = [];
    for (const o of engine.alivePlayers()) {
      if (o.id === p.id) continue;
      engine.dealMixed(o, 1);
      engine.maybeBeatSave(o); engine.maybeBeatMode(o); engine.maybeEva3(o); engine.maybeWakeKotone(o);
      o.wasAttacked = true;
      hits.push(o);
      if (o.alive && o.hp <= 0) { engine.instantDeath(o); if (!o.alive) engine.log(`💀 ${o.name} เลือดจริงหมด ตกรอบ!`); }
    }
    engine.triggerCutscene(p, "banagherAssault");
    engine.log(`💥 ${p.name} Full Assault — โจมตีหมู่ทันที! ${hits.map((o) => o.name).join(", ") || "ไม่มีเป้าหมาย"} รับความเสียหาย -1 (ต่อเนื่องอีก ${BANAGHER_ASSAULT_TURNS - 1} เทิร์น)`);
  },

  // เรียกจาก dealRound() ต้นเทิร์น — Full Assault: ตีหมู่ทุกคนต่อเนื่องทุกต้นเทิร์นที่ผลยังอยู่
  onRoundStartFullAssaultTick(engine, p) {
    if (!((p.statuses.fullassault || 0) > 0)) return;
    const hits = [];
    for (const o of engine.alivePlayers()) {
      if (o.id === p.id) continue;
      engine.dealMixed(o, 1);
      engine.maybeBeatSave(o); engine.maybeBeatMode(o); engine.maybeEva3(o); engine.maybeWakeKotone(o);
      o.wasAttacked = true;
      hits.push(o);
      if (o.alive && o.hp <= 0) { engine.instantDeath(o); if (!o.alive) engine.log(`💀 ${o.name} เลือดจริงหมด ตกรอบ!`); }
    }
    if (hits.length) engine.log(`💥 ${p.name} Full Assault ต่อเนื่อง — ${hits.map((o) => o.name).join(", ")} รับความเสียหาย -1 (เหลืออีก ${p.statuses.fullassault - 1} เทิร์น)`);
  },

  // เรียกจาก useSkill() ในส่วน effect — NewType Paradise (ท่าไม้ตาย 1): เติมกระสุน Beam Magnum +1
  //  มีริดดี้เป็นพันธมิตร -> มอบท่าไม้ตาย 1 ให้ฟรี (ผูกอายุกับ Paradise) / ไม่มี -> ล็อกเป้าแก้แค้นใส่ริดดี้ที่ไม่ใช่พันธมิตร (สกิลติดตัว 2)
  activateParadise(engine, p) {
    p.beamAmmo = Math.min(engine.BEAM_AMMO, (p.beamAmmo || 0) + 1);
    p.seen.paradise = true;
    p.transformAt = engine.nextTransformCounter();
    engine.triggerCutscene(p, "paradise");
    engine.log(`⚡ ${p.name} NewType Paradise — เปิด NT-D แบบพิเศษ 5 เทิร์น! โจมตีผู้เล่นอื่นได้ด้วยพลัง NT-D (+1) และกระสุน Beam Magnum +1`);
    // มีริดดี้เป็นพันธมิตร: ต่อวีดีโอ "ไม่ได้อยู่ตัวคนเดียว" + มอบท่าไม้ตาย 1 ให้ริดดี้ฟรี (ผูกอายุกับ Paradise)
    const rAlly = engine.riddheAllied(p);
    if (rAlly && rAlly.alive) {
      engine.triggerCutscene(p, "banagherAlly");
      if (engine.riddheGrantFreeNtdToAlly(rAlly, p.id)) {
        engine.log(`🤝⚡ ${rAlly.name} ได้รับ NT-D System ไปด้วยฟรีจากพันธมิตร ${p.name} — แกไม่มีสิทธิ์มาสั่งสอนฉัน (ไม่เสียแต้มสกิล — จะหมดพร้อมกับ NewType Paradise)`);
      }
      return;
    }
    // ฉันไม่อยากให้เราต้องมาสู้กัน (สกิลติดตัว 2): ริดดี้ไม่ใช่พันธมิตร -> ล็อกเป้าแก้แค้นใส่ริดดี้เพิ่มอีกทาง
    const rival = engine.alivePlayers().find((o) => o.characterId === "riddhe" && !engine.riddheAllied(o));
    if (rival && p.ntdRivalId !== rival.id) {
      p.ntdRivalId = rival.id;
      p.seen.banagherPassive2 = true;
      engine.triggerCutscene(p, "banagherPassive2");
      engine.log(`🥺 ${p.name} ฉันไม่อยากให้เราต้องมาสู้กัน — ล็อกเป้าแก้แค้นใส่ ${rival.name} เพิ่มอีกทาง (แรง +1 หน่วยเหมือน NT-D System)`);
    }
  },

  // เรียกจาก useSkill() ในส่วน effect — แสงที่ไม่อยู่เพียงลำพัง (ท่าไม้ตาย 2): หักแต้มสกิลริดดี้พันธมิตรเพิ่มอีก 8 แต้ม
  activateUnibeam2(engine, p, cost) {
    const rAlly = engine.riddheAllied(p);
    if (!rAlly) return;
    rAlly.skillPoints -= BANAGHER_ULT2_ALLY_COST;
    engine.log(`🤝💥 ${p.name} แสงที่ไม่อยู่เพียงลำพัง — หักแต้มสกิล ${rAlly.name} เพิ่มอีก ${BANAGHER_ULT2_ALLY_COST} แต้ม (คอสจริงรวม ${cost + BANAGHER_ULT2_ALLY_COST})`);
  },

  // เรียกจาก endTurn() — สกิลติดตัว 2: เป้าแก้แค้นพิเศษ (ntdRivalId) ตาย/หายไป/กลายเป็นพันธมิตร -> สงบลง
  onEndTurnRivalCleanup(engine) {
    for (const p of Object.values(engine.players)) {
      if (!p.ntdRivalId) continue;
      const rival = engine.players[p.ntdRivalId];
      if (!rival || !rival.alive || engine.riddheAllied(rival)) {
        p.ntdRivalId = null;
        if (!p.ntdTarget) delete p.seen.banagherPassive2;
      }
    }
  },
};
