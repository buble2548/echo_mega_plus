// โอเบรอน ราชาแห่งภูติ (rework 3 / patch 4.2)
//  เทสต์นี้พิสูจน์ของใหม่ทั้งห้า: จอมหลอกลวง / พลังโจมตีร่างกลางคืน / จุดจบของความฝัน /
//  ฝันร้ายยามค่ำคืน (ที่รับผล Vortigern เดิมมา) / ร่างฝูงแมลง "ล่มสลาย" + สถานะ "คำสาป"
//
//  ⚠️ applyNightmare เรียก extendNight() ซึ่งเลื่อน cycleShift ทั้งเกม — ทุกเทสต์จึงตั้ง
//  setCycleShift(0) ใหม่ทุกครั้ง ไม่งั้นเทสต์ถัดไปจะอ่านกลางวัน/กลางคืนผิดแบบสุ่ม
const test = require('node:test');
const assert = require('node:assert/strict');
const { engine } = require('../../server.js');
const oberon = require('../../characters/oberon.js');

const DAY = 3;   // รอบ 1-5 = กลางวัน (cycleShift 0)
const NIGHT = 8; // รอบ 6-10 = กลางคืน

const saved = {
  triggerCutscene: engine.triggerCutscene,
  queueCutscene: engine.queueCutscene,
  notifyTransform: engine.notifyTransform,
  skillFlash: engine.skillFlash,
};
const realRandom = Math.random;
let cuts = [];

test.before(() => {
  engine.triggerCutscene = (p, key) => { cuts.push(key); };
  engine.queueCutscene = (p, key) => { cuts.push(key); };
  engine.notifyTransform = (p, key) => { cuts.push(key); };
  engine.skillFlash = () => {};
});
test.after(() => {
  engine.clearPhaseTimer();
  Math.random = realRandom;
  engine.setCycleShift(0);
  Object.assign(engine, saved);
});
test.afterEach(() => {
  engine.clearPhaseTimer();
  Math.random = realRandom;
});

function mk(id, characterId, position) {
  return {
    id, name: id, characterId, position, alive: true,
    hp: 6, maxHpPenalty: 0, armor: 0, shield: 0, tempHp: 0,
    statuses: {}, statusAmt: {}, seen: {}, cutsceneShown: {},
    cards: [], skillPoints: 20, gold: 0, teamId: null, evadeStacks: [], inventory: [],
    dmgArmor: 0, dmgHp: 0, gainedSkill: 0, locked: false, result: null, connected: true,
    isLoser: false, isWinner: false, busted: false,
    colorTrigger: { red: 0, blue: 0, green: 0, yellow: 0 }, cardBonus: 0,
  };
}

function setup(round = DAY) {
  for (const k of Object.keys(engine.players)) delete engine.players[k];
  cuts = [];
  const O = mk('O', 'oberon', 1);
  const A = mk('A', 'temari', 2);
  //  เหยื่อของหมัดฝูงแมลงต้องเป็นตัวที่ "ไม่มี adjustIncomingDamage" — อิปโป/เอจิ/โปรดิวเซอร์
  //  หลบดาเมจที่ไม่ใช่การโจมตีปกติได้เป็นเปอร์เซ็นต์ เทสต์จะกระพริบทันที
  const B = mk('B', 'kai', 3);
  engine.players.O = O; engine.players.A = A; engine.players.B = B;
  for (const p of [O, A, B]) oberon.resetCombat(p);
  engine.setCycleShift(0);
  engine.setRoundNumber(round);
  engine.setGameMode('ffa');
  engine.setGameState('PLAYING');
  return { O, A, B };
}

// ============================================================
//  สกิลติดตัว จอมหลอกลวง
// ============================================================
test('จอมหลอกลวง: ยืมเปลือกจากตัวละครที่ไม่ได้ลงสนามเท่านั้น และซ่อนแบนเนอร์ตอนกดสกิล', () => {
  const { O } = setup();
  oberon.assignMasks(engine);
  assert.ok(O.oberonMask, 'ต้องได้เปลือกมาสวม');
  assert.notEqual(O.oberonMask, 'oberon');
  assert.ok(!['temari', 'kai'].includes(O.oberonMask), 'ห้ามยืมตัวที่อยู่ในสนาม');
  assert.equal(oberon.disguised(O), true);
  assert.equal(oberon.silentSkill(O), true, 'ระหว่างปลอมตัวต้องไม่มีแบนเนอร์เด้ง');
  // ชื่อสกิลใน log ถูกยืมของตัวปลอมไปใช้แทน
  assert.notEqual(oberon.maskedSkillName(O, 'basic', 'ม่านแห่งราตรี'), 'ม่านแห่งราตรี');
});

test('จอมหลอกลวง: เปลือกแตกถาวรเมื่อเข้ากลางคืนครั้งแรก', () => {
  const { O } = setup();
  oberon.assignMasks(engine);
  engine.setRoundNumber(NIGHT);
  oberon.onDayNightTransition(engine, true, NIGHT, false);
  assert.equal(O.oberonUnmasked, true);
  assert.equal(oberon.disguised(O), false);
  assert.equal(oberon.maskId(O), null);
  assert.equal(oberon.silentSkill(O), false, 'เปลือกแตกแล้วแบนเนอร์ต้องกลับมา');
  // กลับเป็นกลางวันอีกครั้งก็ไม่ปลอมซ้ำ
  oberon.onDayNightTransition(engine, false, NIGHT + 3, true);
  assert.equal(oberon.disguised(O), false);
});

test('จอมหลอกลวง: คนอื่นเห็นชื่อ/รูป/การ์ดสกิลเป็นของตัวปลอม แต่เจ้าตัวเห็นของจริง', () => {
  const { O } = setup(DAY);
  oberon.assignMasks(engine);
  const maskId = O.oberonMask;
  const byOther = engine.buildStateFor('A').players.find((x) => x.id === 'O');
  const bySelf = engine.buildStateFor('O').players.find((x) => x.id === 'O');
  // คนอื่น: เปลือกทั้งชุดเป็นของตัวที่ยืมมา
  assert.equal(byOther.character.id, maskId, 'ต้องไม่หลุด id จริงออกไป');
  assert.notEqual(byOther.character.name, bySelf.character.name);
  assert.notEqual(byOther.character.basic.name, 'ม่านแห่งราตรี', 'การ์ดสกิลต้องถูกปลอมด้วย');
  assert.notEqual(byOther.img, bySelf.img, 'รูปบนกระดานก็ต้องต่างกัน');
  // เจ้าตัว: ของจริงทั้งหมด — ไม่งั้นกดสกิลตัวเองไม่ถูก
  assert.equal(bySelf.character.id, 'oberon');
  assert.equal(bySelf.character.basic.name, 'ม่านแห่งราตรี');
  // เปลือกแตกแล้วทุกคนเห็นของจริงเหมือนกัน
  engine.setRoundNumber(NIGHT);
  oberon.onDayNightTransition(engine, true, NIGHT, false);
  const afterOther = engine.buildStateFor('A').players.find((x) => x.id === 'O');
  assert.equal(afterOther.character.id, 'oberon');
  assert.equal(afterOther.character.basic.name, 'ม่านแห่งราตรี');
});

// ============================================================
//  พลังโจมตี: 0 เฉพาะกลางวัน
// ============================================================
test('การหลับไหลอันไม่สิ้นสุด: ตี 0 เฉพาะกลางวัน — ร่างกลางคืนตีได้เต็ม', () => {
  const { O } = setup(DAY);
  assert.equal(oberon.damageBonus(engine, O), -1, 'กลางวันต้องหักพลังโจมตีทิ้ง');
  engine.setRoundNumber(NIGHT);
  assert.equal(oberon.damageBonus(engine, O), 0, 'กลางคืนต้องไม่ถูกหัก');
});

// ============================================================
//  ท่าไม้ตายกลางวัน จุดจบของความฝัน
// ============================================================
test('จุดจบของความฝัน: +4 พลังโจมตีเทิร์นนี้ · สตั้น 3 เทิร์นต้นเทิร์นหน้า · คูลดาวน์ 5', () => {
  const { O, A } = setup(DAY);
  oberon.applyDreamEnd(engine, O, A, 'จุดจบของความฝัน');
  assert.equal(engine.statusAmtOf(A, 'might'), oberon.DREAMEND_ATK);
  assert.equal(A.statuses.might, 1, 'พลังโจมตีอยู่แค่เทิร์นนี้');
  assert.equal(A.oberonDreamStun, oberon.DREAMEND_STUN, 'สตั้นยังไม่ลง รอต้นเทิร์นหน้า');
  assert.equal(A.statuses.stun || 0, 0);
  assert.equal(oberon.cooldownLeft(engine, O, 'ultimate'), oberon.DREAMEND_COOLDOWN);
  // ต้นเทิร์นถัดไปสตั้นจึงลง
  engine.setRoundNumber(DAY + 1);
  oberon.applyPendingStun(engine, A);
  assert.equal(A.statuses.stun, oberon.DREAMEND_STUN);
  assert.equal(A.oberonDreamStun, 0);
});

test('จุดจบของความฝัน: คูลดาวน์ปิดปุ่มไว้ และเดินต่อเองระหว่างอยู่ในร่างฝูงแมลง', () => {
  const { O, A } = setup(DAY);
  oberon.applyDreamEnd(engine, O, A, 'จุดจบของความฝัน');
  assert.equal(oberon.canUseSkill(engine, O, 'ultimate'), false, 'ติดคูลดาวน์ต้องกดไม่ได้');
  engine.setRoundNumber(DAY + oberon.DREAMEND_COOLDOWN - 1);
  assert.equal(oberon.cooldownLeft(engine, O, 'ultimate'), 1, 'ก่อนครบยังเหลืออีก 1 เทิร์น');
  engine.setRoundNumber(DAY + oberon.DREAMEND_COOLDOWN);
  assert.equal(oberon.cooldownLeft(engine, O, 'ultimate'), 0, 'ครบ 5 เทิร์นแล้วต้องกดได้อีก');
  // คูลดาวน์ 5 เทิร์นข้ามไปช่วงกลางคืนเสมอ (วงจร 5 เทิร์นต่อช่วง)
  //  จึงต้องบังคับให้เป็นกลางวันก่อน ไม่งั้น canUseSkill จะตกไปเกต์กลางคืน (ต้องมีฝันร้าย) แทน
  engine.setCycleShift(engine.roundNumber - 1);
  assert.equal(engine.isNightRound(engine.roundNumber), false);
  assert.equal(oberon.canUseSkill(engine, O, 'ultimate'), true);
  engine.setCycleShift(0);
});

test('จุดจบของความฝัน: ต้านสถานะผิดปกติกันสตั้นได้ แต่พลังโจมตียังได้ไปแล้ว', () => {
  const { O, A } = setup(DAY);
  oberon.applyDreamEnd(engine, O, A, 'จุดจบของความฝัน');
  A.statuses.resist = 2;
  engine.setRoundNumber(DAY + 1);
  oberon.applyPendingStun(engine, A);
  assert.equal(A.statuses.stun || 0, 0, 'ต้านสถานะต้องกันสตั้นไว้ได้');
});

// ============================================================
//  สกิลรองกลางวัน รุ่งอรุณแห่งวันใหม่
// ============================================================
test('รุ่งอรุณแห่งวันใหม่: ฮีล 5 + ต้านสถานะ 2 เทิร์น แล้วต้นเทิร์นหน้าเด้งกลับ 2 ทะลุเกราะ', () => {
  const { O, A } = setup(DAY);
  A.hp = 4; A.armor = 2;
  oberon.applySunriseEffect(engine, O, A, 'รุ่งอรุณแห่งวันใหม่');
  assert.equal(A.hp, 7, 'ฮีล 5 แต่ชนเพดานเลือด (MAX_HP 7)');
  assert.equal(A.statuses.resist, oberon.SUNRISE_RESIST);
  assert.equal(A.statuses.dawn, 1, 'ยามฟ้าสางต้องติดก่อนต้านสถานะจะมีผล');
  assert.equal(A.oberonSunriseHit, DAY + 1);
  // ต้นเทิร์นถัดไป
  engine.setRoundNumber(DAY + 1);
  oberon.onRoundStartTick(engine, A);
  assert.equal(A.hp, 5, 'เสีย 2 หน่วยรวดเดียว');
  assert.equal(A.armor, 2, 'ทะลุเกราะ — เกราะต้องไม่ถูกแตะ');
  assert.equal(A.oberonSunriseHit, 0);
});

test('รุ่งอรุณแห่งวันใหม่: แรงสะท้อนไม่ฆ่า — ค้างที่พลังชีวิต 1', () => {
  const { O, A } = setup(DAY);
  A.hp = 2;
  oberon.applySunriseEffect(engine, O, A, 'รุ่งอรุณแห่งวันใหม่');
  A.hp = 2; // จำลองว่าโดนตีจนเหลือ 2 ก่อนแรงสะท้อนลง
  engine.setRoundNumber(DAY + 1);
  oberon.onRoundStartTick(engine, A);
  assert.equal(A.hp, 1, 'ต้องค้างที่ 1 ไม่ตาย');
  assert.equal(A.alive, true);
});

// ============================================================
//  สกิลรองกลางคืน ฝันร้ายยามค่ำคืน (ผล Vortigern เดิม)
// ============================================================
test('ฝันร้ายยามค่ำคืน: หลับเท่ายามฟ้าสาง และเกราะราตรีอยู่เท่าเวลาหลับพอดี', () => {
  const { O, A, B } = setup(NIGHT);
  A.statuses.dawn = 3;
  B.statuses.dawn = 5;
  oberon.applyNightmare(engine, O);
  assert.equal(A.statuses.sleep, 3);
  assert.equal(A.statuses.vortarmor, 3, 'เกราะราตรีต้องนับตามเวลาหลับ ไม่ใช่ 3 ตายตัว');
  assert.equal(B.statuses.sleep, 5);
  assert.equal(B.statuses.vortarmor, 5);
  assert.equal(A.statuses.dawn || 0, 0, 'ยามฟ้าสางถูกล้างหลังใช้');
  assert.equal(O.oberonNightmare, true);
  // วีดีโอประจำท่าย้ายตามผลมาด้วย: oberon_final_night.mp4 ก่อน แล้วค่อยราตรีกลืนกิน
  assert.deepEqual(cuts, ['oberonNightmare'], 'สกิลรองเล่นคลิปเดียว ห้ามคิวซ้อนสองคลิป');
  engine.setCycleShift(0);
});

test('ฝันร้ายยามค่ำคืน: ไม่มียามฟ้าสาง = ไม่หลับและไม่ได้เกราะราตรี · ต้านสถานะกันหลับได้', () => {
  const { O, A, B } = setup(NIGHT);
  A.statuses.dawn = 0;
  B.statuses.dawn = 4; B.statuses.resist = 3;
  oberon.applyNightmare(engine, O);
  assert.equal(A.statuses.sleep || 0, 0);
  assert.equal(A.statuses.vortarmor || 0, 0, 'เกราะผูกกับการหลับ ไม่ใช่ของแจกฟรี');
  assert.equal(B.statuses.sleep || 0, 0, 'ต้านสถานะต้องกันหลับไว้ได้');
  engine.setCycleShift(0);
});

test('ฝันร้ายยามค่ำคืน: กดซ้ำไม่ได้ระหว่างยังมีผล และหายเองเมื่อเข้าเช้า', () => {
  const { O, A } = setup(NIGHT);
  A.statuses.dawn = 2;
  oberon.applyNightmare(engine, O);
  assert.equal(oberon.canUseSkill(engine, O, 'secondary'), false, 'ยังมีผล = disable');
  engine.setCycleShift(0);
  oberon.onDayNightTransition(engine, false, NIGHT + 5, true);
  assert.equal(O.oberonNightmare, false);
  assert.equal(A.statuses.sleep || 0, 0, 'หลับไหลหายทันทีเมื่อเข้าเช้า');
});

// ============================================================
//  ท่าไม้ตายกลางคืน Lie Like Vortigern — ร่างฝูงแมลง
// ============================================================
function enterSwarm(round = NIGHT) {
  const s = setup(round);
  s.A.statuses.dawn = 2;
  oberon.applyNightmare(engine, s.O);
  engine.setCycleShift(0);
  engine.setRoundNumber(round);
  oberon.applySwarm(engine, s.O);
  return s;
}

test('ร่างฝูงแมลง: ต้องอยู่ระหว่างฝันร้ายเท่านั้นถึงกดได้', () => {
  const { O } = setup(NIGHT);
  assert.equal(oberon.canUseSkill(engine, O, 'ultimate'), false, 'ยังไม่ได้กดฝันร้าย = กดไม่ได้');
  O.statuses.dawn = 0;
  oberon.applyNightmare(engine, O);
  engine.setCycleShift(0);
  assert.equal(oberon.canUseSkill(engine, O, 'ultimate'), true);
});

test('ร่างฝูงแมลง: ทุกคนตื่น + ติดคำสาป 3 และเปราะบาง · ฝันร้ายถูกปิด', () => {
  const { O, A, B } = enterSwarm();
  assert.equal(oberon.swarmOn(O), true);
  assert.equal(O.oberonNightmare, false, 'ฝันร้ายต้องถูกปิด');
  assert.equal(A.statuses.sleep || 0, 0, 'ทุกคนต้องตื่นขึ้น');
  for (const v of [A, B]) {
    assert.equal(v.statuses.curse, oberon.SWARM_CURSE_TURNS);
    assert.ok((v.statuses.fragile || 0) > 0, 'ต้องติดเปราะบาง');
  }
  assert.equal(O.statuses.curse || 0, 0, 'ตัวเองต้องไม่ติด');
  assert.equal(O.statuses.fragile || 0, 0);
});

test('ร่างฝูงแมลง: ยังถูกเลือกโจมตีได้ · แต้มเป็น 0 · จั่วไพ่ไม่ได้', () => {
  const { O, A } = enterSwarm();
  const targets = engine.attackableTargets(A.id).map((t) => t.id);
  assert.ok(targets.includes(O.id), 'ร่างฝูงแมลงไม่มีภูมิคุ้มกันการเล็งแล้ว');
  O.cards = [{ value: 10, color: 'red' }, { value: 9, color: 'red' }];
  assert.equal(engine.scoreOf(O), 0, 'แต้มต้องนับเป็น 0 เสมอ');
  const before = O.cards.length;
  engine.hit(O.id);
  assert.equal(O.cards.length, before, 'จั่วไพ่ไม่ได้');
});

test('ร่างฝูงแมลง: กดสกิลอื่นไม่ได้ กดได้แค่ท่าไม้ตายเพื่อยกเลิก (ฟรี ไม่ติดคูลดาวน์)', () => {
  const { O } = enterSwarm();
  assert.equal(oberon.canUseSkill(engine, O, 'basic'), false);
  assert.equal(oberon.canUseSkill(engine, O, 'secondary'), false);
  assert.equal(oberon.canUseSkill(engine, O, 'ultimate'), true);
  assert.equal(oberon.ultimateIsFree(O), true, 'ยกเลิกต้องไม่เสียแต้มสกิล');
  oberon.applySwarm(engine, O); // กดซ้ำ = ยกเลิก
  assert.equal(oberon.swarmOn(O), false);
  assert.equal(oberon.cooldownLeft(engine, O, 'ultimate'), 0, 'ยกเลิกแล้วต้องไม่ติดคูลดาวน์');
});

test('ร่างฝูงแมลง: ยกเลิกแล้วเปราะบางของทุกคนหายไป', () => {
  const { O, A, B } = enterSwarm();
  oberon.cancelSwarm(engine, O, 'เทสต์');
  for (const v of [A, B]) {
    assert.equal(v.statuses.fragile || 0, 0, 'เปราะบางต้องถูกถอนคืน');
    assert.equal(v.oberonSwarmFragile, false);
  }
});

test('ร่างฝูงแมลง: เปราะบางถูกล้างออก -> เทิร์นถัดไปแปะซ้ำ', () => {
  const { O, A } = enterSwarm();
  delete A.statuses.fragile;
  if (A.statusAmt) delete A.statusAmt.fragile;
  engine.setRoundNumber(NIGHT + 1);
  oberon.onRoundStartTick(engine, O);
  assert.ok((A.statuses.fragile || 0) > 0, 'ต้องถูกแปะซ้ำ');
});

test('ร่างฝูงแมลง: ทุก 2 เทิร์นเสียเลือด 1 ไม่สนเกราะ และปิดตัวเองเมื่อเหลือ 1', () => {
  const { O } = enterSwarm();
  O.hp = 5; O.armor = 3;
  engine.setRoundNumber(NIGHT + 1);
  oberon.onRoundStartTick(engine, O);
  assert.equal(O.hp, 5, 'เทิร์นคี่ยังไม่เสีย');
  engine.setRoundNumber(NIGHT + 2);
  oberon.onRoundStartTick(engine, O);
  assert.equal(O.hp, 4, 'ครบ 2 เทิร์นเสีย 1');
  assert.equal(O.armor, 3, 'ไม่สนเกราะ');
  // ไล่จนเหลือ 1 -> ปิดตัวเอง
  O.hp = 2;
  engine.setRoundNumber(NIGHT + 4);
  oberon.onRoundStartTick(engine, O);
  assert.equal(O.hp, 1);
  assert.equal(oberon.swarmOn(O), false, 'เลือดเหลือ 1 ต้องคืนร่างอัตโนมัติ');
});

test('ร่างฝูงแมลง: กัดคนเลือดน้อยสุด และคิดเปราะบางรวมด้วย', () => {
  const { A, B } = enterSwarm();
  A.hp = 9; A.armor = 0;
  B.hp = 5; B.armor = 0;              // B เลือดน้อยสุด
  assert.equal(engine.statusAmtOf(B, 'fragile'), 1, 'ร่างฝูงแมลงแปะเปราะบางไว้แล้ว');
  oberon.swarmBite(engine);
  assert.equal(A.hp, 9, 'คนเลือดเยอะต้องไม่โดน');
  assert.equal(B.hp, 5 - (oberon.SWARM_TICK_DMG + 1), 'เปราะบาง +1 ต้องถูกคิดรวม');
});

test('ร่างฝูงแมลง: "เปราะบาง" ต่ออายุสั้นๆ ทุกเทิร์น — ห้ามโชว์เลขเทิร์นมหาศาล', () => {
  const { O, A, B } = enterSwarm();
  for (const v of [A, B]) {
    assert.equal(v.statuses.fragile, oberon.SWARM_FRAGILE_TURNS);
    assert.ok(v.statuses.fragile < 10, 'ป้ายสถานะอ่านค่านี้ตรงๆ — เลขใหญ่อย่าง 99 จะโผล่ให้ผู้เล่นเห็น');
  }
  // ผ่านไปหลายเทิร์นก็ยังคงเลขเดิม (ต่ออายุ ไม่สะสม)
  for (let r = NIGHT + 1; r <= NIGHT + 4; r++) {
    engine.setRoundNumber(r);
    A.statuses.fragile -= 1; // จำลองลูปลดเทิร์นท้ายเทิร์นของ endTurn
    if (A.statuses.fragile <= 0) delete A.statuses.fragile;
    oberon.onRoundStartTick(engine, O);
    assert.equal(A.statuses.fragile, oberon.SWARM_FRAGILE_TURNS, `เทิร์น ${r} ต้องถูกต่ออายุกลับมาเท่าเดิม`);
  }
});

test('ร่างฝูงแมลง: สกิลและอาวุธ/ไอเทมยังเล็งโอเบรอนไม่ได้', () => {
  const { O, A } = enterSwarm();
  O.hp = 5; O.armor = 0;
  // สกิลที่ส่ง targets มา — ต้องถูกปัดทิ้งก่อนหักแต้ม
  const spBefore = A.skillPoints;
  engine.useSkill(A.id, 'secondary', [O.id]);
  assert.equal(A.skillPoints, spBefore, 'สกิลต้องไม่ทำงานเลย (ไม่เสียแต้ม)');
  assert.equal(O.hp, 5);
  // กระสุน GUTS ที่เล็งโอเบรอน
  A.inventory = [{ uid: 'g1', type: 'gutsGun' }, { uid: 'a1', type: 'gutsAmmo', ammo: 'nurse' }];
  engine.useInventoryItem(A.id, 'a1', { targetId: O.id });
  assert.equal(A.inventory.length, 2, 'กระสุนต้องไม่ถูกใช้ไป');
  assert.equal(O.hp, 5, 'อาวุธเล็งโอเบรอนไม่ได้');
  engine.clearPhaseTimer();
});

test('ร่างฝูงแมลง: doAttack ใส่โอเบรอนเข้าตามปกติ', () => {
  const { O, A } = enterSwarm();
  O.hp = 5; O.armor = 0;
  engine.setGameState('ATTACK');
  engine.setAttackerId(A.id);
  engine.doAttack(A.id, O.id);
  assert.ok(O.hp < 5, 'ร่างฝูงแมลงต้องโดนหมัดได้');
  engine.clearPhaseTimer();
});

test('ร่างฝูงแมลง: หมัดกัดลดเกราะก่อน และฆ่าได้', () => {
  const { A, B } = enterSwarm();
  A.hp = 9; A.armor = 0;
  B.hp = 5; B.armor = 3;
  oberon.swarmBite(engine);
  assert.equal(B.hp, 5, 'มีเกราะอยู่ เลือดจริงต้องไม่ลด');
  assert.equal(B.armor, 1, 'เกราะถูกกินก่อน (1 + เปราะบาง 1 = 2)');
  // เลือดน้อยจนหมด -> ตกรอบจริง
  //  beatSaved = true: ปิดโควตากันตายของ Beat Mode ทิ้ง — ไม่งั้นผลเทสต์จะขึ้นกับโหมดที่ไฟล์อื่นตั้งค้างไว้
  B.beatSaved = true;
  B.hp = 1; B.armor = 0;
  oberon.swarmBite(engine);
  assert.equal(B.alive, false, 'หมัดของฝูงแมลงต้องฆ่าได้');
});

// ============================================================
//  สถานะ Universal "คำสาป"
// ============================================================
test('คำสาป: กดสกิลแล้วเสียเลือด 1 — ครั้งเดียวต่อเทิร์น', () => {
  const { A } = setup(DAY);
  engine.applyCurse(A, 3);
  A.hp = 6; A.armor = 0;
  assert.equal(engine.tickCurseOnSkill(engine, A), true);
  assert.equal(A.hp, 5);
  assert.equal(engine.tickCurseOnSkill(engine, A), false, 'เทิร์นเดียวกินได้ครั้งเดียว');
  assert.equal(A.hp, 5);
  engine.setRoundNumber(DAY + 1);
  assert.equal(engine.tickCurseOnSkill(engine, A), true, 'เทิร์นใหม่กินได้อีก');
  assert.equal(A.hp, 4);
});

test('คำสาป: ลดเกราะก่อน · ต้านสถานะกันได้ · ถูกล้างแล้วลดทีละ 1 เทิร์น', () => {
  const { A, B } = setup(DAY);
  A.armor = 2; A.hp = 6;
  engine.applyCurse(A, 3);
  engine.tickCurseOnSkill(engine, A);
  assert.equal(A.hp, 6, 'ยังมีเกราะ เลือดจริงต้องไม่ลด');
  assert.equal(A.armor, 1);
  // ต้านสถานะ
  B.statuses.resist = 2;
  assert.equal(engine.applyCurse(B, 3), false);
  assert.equal(B.statuses.curse || 0, 0);
  // ล้างสถานะ -> ลดทีละ 1 เทิร์น (เหมือนเส้นชีวิต)
  assert.equal(A.statuses.curse, 3);
  engine.cleanseDebuffs(A);
  assert.equal(A.statuses.curse, 2, 'ล้างแล้วต้องลดทีละ 1 ไม่หายทั้งก้อน');
});

test('คำสาป: ฆ่าได้ — เลือดหมดแล้วตกรอบจริง', () => {
  const { A } = setup(DAY);
  A.hp = 1; A.armor = 0;
  engine.applyCurse(A, 3);
  engine.tickCurseOnSkill(engine, A);
  assert.equal(A.alive, false, 'คำสาปต้องฆ่าได้');
});

// ============================================================
//  หลับไหล: ต้องกันครบทุกช่องทาง
// ============================================================
test('หลับไหล: ซื้อของและใช้ไอเทมไม่ได้ (เดิมรั่วทั้งสองทาง)', () => {
  const { A } = setup(DAY);
  A.statuses.sleep = 2;
  A.gold = 50;
  engine.setShopItems([{ id: 'shop_x', type: 'skillPoint', value: 2, price: 1, sold: false, soldTo: null }]);
  engine.buyShopItem(A.id, 'shop_x');
  assert.equal(engine.shopItems[0].sold, false, 'คนหลับซื้อของไม่ได้');
  A.inventory = [{ uid: 'u1', type: 'armor', value: 2 }];
  engine.useInventoryItem(A.id, 'u1');
  assert.equal(A.inventory.length, 1, 'คนหลับใช้ไอเทมไม่ได้');
  engine.setShopItems([]);
});
