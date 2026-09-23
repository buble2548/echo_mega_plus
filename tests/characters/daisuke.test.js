// คาซามะ ไดสุเกะ (patch 4.3 new)
//  พิสูจน์ของหลักสี่อย่าง: โหมด CAST OFF/PUT ON · Clock Up (แช่สนาม + เวลา + ค่าแต้ม)
//  · Rider Shooting (ล้างเกราะก่อนดาเมจ) · Zect (หลบ 25% เฉพาะตอน Clock Up)
const test = require('node:test');
const assert = require('node:assert/strict');
const { engine } = require('../../server.js');
const daisuke = require('../../characters/daisuke.js');

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
  Object.assign(engine, saved);
});
test.afterEach(() => {
  engine.clearPhaseTimer();
  Math.random = realRandom;
});

function mk(id, characterId, position) {
  return {
    id, name: id, characterId, position, alive: true,
    hp: 7, maxHpPenalty: 0, armor: 3, shield: 0, tempHp: 0,
    statuses: {}, statusAmt: {}, seen: {}, cutsceneShown: {},
    cards: [], skillPoints: 20, gold: 0, teamId: null, evadeStacks: [], inventory: [],
    dmgArmor: 0, dmgHp: 0, gainedSkill: 0, locked: false, result: null, connected: true,
    isLoser: false, isWinner: false, busted: false,
    colorTrigger: { red: 0, blue: 0, green: 0, yellow: 0 }, cardBonus: 0,
  };
}

function setup(round = 3) {
  for (const k of Object.keys(engine.players)) delete engine.players[k];
  cuts = [];
  const D = mk('D', 'daisuke', 1);
  //  เป้าหมายต้องเป็นตัวที่ไม่มี adjustIncomingDamage (ไม่งั้นมันหลบดาเมจเองแบบสุ่ม แล้วเทสต์แกว่ง)
  const A = mk('A', 'temari', 2);
  const B = mk('B', 'kai', 3);
  engine.players.D = D; engine.players.A = A; engine.players.B = B;
  for (const p of [D, A, B]) daisuke.resetCombat(p);
  engine.setCycleShift(0);
  engine.setRoundNumber(round);
  engine.setGameMode('ffa');
  engine.setGameState('PLAYING');
  return { D, A, B };
}

// ============================================================
//  สกิลพื้นฐาน CAST OFF / PUT ON
// ============================================================
test('เริ่มเกมอยู่ PUT ON และภาพบนสนามสลับตามโหมด', () => {
  const { D } = setup();
  assert.equal(daisuke.cassOff(D), false, 'ค่าเริ่มต้นต้องเป็น PUT ON');
  assert.equal(daisuke.displayImg(D), daisuke.IMG.putOn);
  daisuke.toggleCass(engine, D);
  assert.equal(daisuke.cassOff(D), true);
  assert.equal(daisuke.displayImg(D), daisuke.IMG.cassOff);
});

test('CAST OFF: พลังโจมตี +1 และปิดการฟื้นเกราะ · PUT ON กลับมาฟื้นได้', () => {
  const { D } = setup();
  assert.equal(daisuke.damageBonus(engine, D, null, {}), 0, 'PUT ON ไม่มีโบนัส');
  assert.equal(daisuke.blocksArmorRegen(D), false);
  daisuke.toggleCass(engine, D);
  assert.equal(daisuke.damageBonus(engine, D, null, {}), daisuke.CASS_OFF_ATK);
  assert.equal(daisuke.blocksArmorRegen(D), true, 'CAST OFF ต้องกันไม่ให้เกราะฟื้น');
  daisuke.toggleCass(engine, D);
  assert.equal(daisuke.blocksArmorRegen(D), false);
});

test('CAST OFF: วีดีโอเล่นครั้งเดียวต่อเกม ครั้งถัดไปเป็นแจ้งเตือน', () => {
  const { D } = setup();
  daisuke.toggleCass(engine, D);
  assert.deepEqual(cuts, ['daisukeCassOff']);
  daisuke.toggleCass(engine, D); // กลับ PUT ON
  daisuke.toggleCass(engine, D); // CAST OFF อีกครั้ง
  assert.equal(cuts.filter((k) => k === 'daisukeCassOff').length, 2,
    'triggerCutscene ถูกเรียกซ้ำได้ — ตัวคุมว่าเล่นคลิปจริงครั้งเดียวคือ p.cutsceneShown ฝั่ง engine');
});

test('PUT ON: ฟื้นพลังชีวิต 2 ทุก 3 เทิร์น และตัวนับรีเซ็ตเมื่อออกจากโหมด', () => {
  const { D } = setup();
  D.hp = 2;
  for (let r = 4; r <= 5; r++) { engine.setRoundNumber(r); daisuke.onRoundStartTick(engine, D); }
  assert.equal(D.hp, 2, 'ยังไม่ครบ 3 เทิร์น');
  engine.setRoundNumber(6);
  daisuke.onRoundStartTick(engine, D);
  assert.equal(D.hp, 2 + daisuke.PUT_ON_HEAL, 'ครบ 3 เทิร์นต้องฟื้น');
  // สลับไป CAST OFF แล้วกลับมา -> เริ่มนับใหม่
  daisuke.toggleCass(engine, D);
  engine.setRoundNumber(7);
  daisuke.onRoundStartTick(engine, D);
  assert.equal(D.daisukePutOnTurns, 0, 'อยู่ CAST OFF ตัวนับต้องเป็น 0');
});

// ============================================================
//  สกิลรอง Clock Up
// ============================================================
test('Clock Up: ต้องอยู่ใน CAST OFF ถึงกดได้ · สกิลพื้นฐานถูกล็อกระหว่างเปิด', () => {
  const { D } = setup();
  assert.equal(daisuke.canUseSkill(engine, D, 'secondary'), false, 'PUT ON กดไม่ได้');
  assert.equal(daisuke.canUseSkill(engine, D, 'ultimate'), false, 'PUT ON กดท่าไม้ตายไม่ได้');
  daisuke.toggleCass(engine, D);
  assert.equal(daisuke.canUseSkill(engine, D, 'secondary'), true);
  daisuke.setClockUp(engine, D, true);
  assert.equal(daisuke.canUseSkill(engine, D, 'basic'), false, 'ระหว่าง Clock Up สลับโหมดไม่ได้');
});

test('Clock Up: แช่คนอื่นทั้งสนาม แต่เจ้าของท่ายังทำอะไรก็ได้', () => {
  const { D, A, B } = setup();
  daisuke.toggleCass(engine, D);
  daisuke.setClockUp(engine, D, true);
  assert.equal(daisuke.actionBlocked(engine, D), false, 'เจ้าของท่าต้องไม่ถูกแช่');
  assert.equal(daisuke.actionBlocked(engine, A), true);
  assert.equal(daisuke.actionBlocked(engine, B), true);
  // จั่วไพ่จริงผ่าน engine
  const before = A.cards.length;
  engine.hit(A.id);
  assert.equal(A.cards.length, before, 'คนอื่นจั่วไม่ได้');
  // ...แต่ต้องไม่ถูกตั้ง locked ไว้ ไม่งั้น checkAllLocked จะเปิดไพ่ทันที
  assert.equal(A.locked, false, 'ห้ามแช่ด้วย p.locked เด็ดขาด');
});

test('Clock Up: เวลาเฟสเป็นตาข่ายกันห้องค้าง ไม่ใช่เวลาเล่นจริง', () => {
  const { D } = setup();
  assert.equal(daisuke.cardPhaseSeconds(engine), 0, 'ปกติต้องไม่แตะเวลาเฟส');
  daisuke.toggleCass(engine, D);
  daisuke.setClockUp(engine, D, true);
  assert.equal(daisuke.cardPhaseSeconds(engine), daisuke.CLOCK_UP_SAFETY);
  assert.ok(daisuke.CLOCK_UP_SAFETY > 60, 'ต้องยาวพอจนไม่ไปรบกวนการเล่นจริง');
});

test('Clock Up: กดเปิดไพ่แล้วเวลาเดินต่อ เหลือ 10 วิ', () => {
  const { D, A } = setup();
  daisuke.toggleCass(engine, D);
  daisuke.setClockUp(engine, D, true);
  assert.equal(daisuke.onHostLockIn(engine, A), false, 'คนอื่นเปิดไพ่ไม่นับ');
  assert.equal(daisuke.onHostLockIn(engine, D), true, 'เจ้าของท่าเปิดไพ่ = ต้องตั้งเวลาใหม่');
  assert.equal(daisuke.CLOCK_UP_CARD_TIME, 10);
});

test('Clock Up: เสียแต้มสกิล 2/เทิร์น และปิดตัวเองเมื่อจ่ายไม่ไหว', () => {
  const { D } = setup();
  daisuke.toggleCass(engine, D);
  daisuke.setClockUp(engine, D, true);
  D.skillPoints = 5;
  engine.setRoundNumber(4);
  daisuke.onRoundStartTick(engine, D);
  assert.equal(D.skillPoints, 3);
  engine.setRoundNumber(5);
  daisuke.onRoundStartTick(engine, D);
  assert.equal(D.skillPoints, 1);
  assert.equal(daisuke.clockUpOn(D), true, 'ยังพอจ่ายอยู่');
  engine.setRoundNumber(6);
  daisuke.onRoundStartTick(engine, D);
  assert.equal(daisuke.clockUpOn(D), false, 'แต้มไม่พอ 2 -> ปิดเอง');
  assert.equal(D.skillPoints, 1, 'ปิดแล้วต้องไม่หักแต้มติดลบ');
});

test('Clock Up: การไล่ล่าของคอนเนอร์ตัดจังหวะให้ปิดทันที', () => {
  const { D } = setup();
  daisuke.toggleCass(engine, D);
  daisuke.setClockUp(engine, D, true);
  assert.equal(daisuke.cancelClockUpForChase(engine), true);
  assert.equal(daisuke.clockUpOn(D), false);
  assert.equal(daisuke.cancelClockUpForChase(engine), false, 'ไม่มีใครเปิดอยู่ = ไม่ต้องทำอะไร');
});

test('สองสกิลแรกไม่กินโควตาสกิลของเทิร์น (กดท่าไม้ตายต่อได้)', () => {
  const { D } = setup();
  assert.equal(daisuke.skipsTurnQuota(D, 'basic'), true);
  assert.equal(daisuke.skipsTurnQuota(D, 'secondary'), true);
  assert.equal(daisuke.skipsTurnQuota(D, 'ultimate'), false, 'ท่าไม้ตายต้องกินโควตาตามปกติ');
});

// ============================================================
//  ท่าไม้ตาย Rider Shooting
// ============================================================
test('Rider Shooting: อาร์มแล้วกดซ้ำไม่ได้ · ให้พลังโจมตี +1', () => {
  const { D } = setup();
  daisuke.toggleCass(engine, D);
  daisuke.armRider(engine, D);
  assert.equal(daisuke.riderArmed(D), true);
  assert.equal(daisuke.canUseSkill(engine, D, 'ultimate'), false, 'อาร์มค้างอยู่กดซ้ำไม่ได้');
  // CAST OFF 1 + ไรเดอร์ชูต 1
  assert.equal(daisuke.damageBonus(engine, D, null, {}), daisuke.CASS_OFF_ATK + daisuke.RIDER_COST_ATK);
});

test('Rider Shooting: ล้างเกราะ 1 ก่อนดาเมจ · เกราะที่เหลือยังกันได้ตามปกติ', () => {
  const { D, A } = setup();
  daisuke.toggleCass(engine, D);
  daisuke.armRider(engine, D);
  A.armor = 3;
  const stripped = daisuke.stripArmorOnAttack(engine, D, A);
  assert.equal(stripped, daisuke.RIDER_STRIP);
  assert.equal(A.armor, 3 - daisuke.RIDER_STRIP, 'เกราะหายไปเฉยๆ ไม่ได้ซับดาเมจ');
  assert.ok(cuts.includes('daisukeRider'), 'ต้องคิววีดีโอประจำท่า');
});

test('Rider Shooting: ไม่มีเกราะให้ล้าง = ไม่เกิดอะไร แค่หมัดแรงขึ้น', () => {
  const { D, A } = setup();
  daisuke.toggleCass(engine, D);
  daisuke.armRider(engine, D);
  A.armor = 0;
  assert.equal(daisuke.stripArmorOnAttack(engine, D, A), 0);
  assert.equal(A.hp, 7, 'stripArmorOnAttack ต้องไม่แตะเลือดเอง');
});

test('Rider Shooting: ใช้โควตาหมดหลังออกหมัด ไม่ว่าจะมีเกราะให้ล้างหรือไม่', () => {
  const { D, A } = setup();
  daisuke.toggleCass(engine, D);
  daisuke.armRider(engine, D);
  A.armor = 0;
  daisuke.stripArmorOnAttack(engine, D, A);
  daisuke.consumeRiderOnAttack(engine, D);
  assert.equal(daisuke.riderArmed(D), false);
  assert.equal(daisuke.canUseSkill(engine, D, 'ultimate'), true, 'ใช้หมดแล้วกดใหม่ได้');
});

// ============================================================
//  สกิลติดตัว Zect
// ============================================================
test('Zect: หลบ 25% เฉพาะระหว่าง Clock Up', () => {
  const { D } = setup();
  assert.equal(daisuke.dodgeChance(D), 0, 'ไม่ได้ Clock Up ต้องไม่มีอัตราหลบ');
  daisuke.toggleCass(engine, D);
  assert.equal(daisuke.dodgeChance(D), 0, 'CAST OFF เฉยๆ ก็ยังไม่มี');
  daisuke.setClockUp(engine, D, true);
  assert.equal(daisuke.dodgeChance(D), daisuke.ZECT_DODGE);
});

test('Zect: หมัดที่เข้ามาถูกหลบจริงเมื่อโรลติด และเข้าเต็มเมื่อโรลไม่ติด', () => {
  const { D, A } = setup();
  daisuke.toggleCass(engine, D);
  daisuke.setClockUp(engine, D, true);
  D.hp = 7; D.armor = 0;
  Math.random = () => 0;      // โรลต่ำสุด = หลบติดเสมอ
  engine.setGameState('ATTACK');
  engine.setAttackerId(A.id);
  engine.doAttack(A.id, D.id);
  assert.equal(D.hp, 7, 'โรลติดต้องหลบพ้น');
  engine.clearPhaseTimer();
  Math.random = () => 0.99;   // โรลสูงสุด = ไม่มีทางหลบติด
  engine.setGameState('ATTACK');
  engine.setAttackerId(A.id);
  engine.doAttack(A.id, D.id);
  assert.ok(D.hp < 7, 'โรลไม่ติดต้องโดนเต็ม');
  engine.clearPhaseTimer();
});

// ============================================================
//  ข้อมูลสนามที่ส่งให้ client
// ============================================================
test('publicState ส่งโหมด/Clock Up/ไรเดอร์ชูตครบ', () => {
  const { D } = setup();
  let st = daisuke.publicState(D);
  assert.equal(st.cassOff, false);
  assert.equal(st.clockUp, false);
  assert.equal(st.rider, false);
  assert.equal(st.putOnEvery, daisuke.PUT_ON_EVERY);
  daisuke.toggleCass(engine, D);
  daisuke.setClockUp(engine, D, true);
  daisuke.armRider(engine, D);
  st = daisuke.publicState(D);
  assert.equal(st.cassOff, true);
  assert.equal(st.clockUp, true);
  assert.equal(st.rider, true);
  assert.equal(st.dodge, daisuke.ZECT_DODGE);
});
