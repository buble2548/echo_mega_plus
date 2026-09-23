// โซ ยากุรุมะ (patch 4.3 new) + แกนร่วม Zect (characters/_zect.js)
//  เทสต์นี้เน้นของที่ต่างจากไดสุเกะ: Rider Sting (เจาะต้านสถานะ + พิษร้าย + ผุพัง)
//  และกติกาสนามที่ต้องมองไรเดอร์ "ทุกคน" พร้อมกัน — Clock Up ซ้อนสองคน, การแช่รายเทิร์น, Zect ข้อ 2/3
const test = require('node:test');
const assert = require('node:assert/strict');
const { engine } = require('../../server.js');
const Y = require('../../characters/yaguruma.js');
const D = require('../../characters/daisuke.js');

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

// เป้าหมายต้องเป็นตัวที่ไม่มี adjustIncomingDamage ไม่งั้นมันหลบดาเมจเองแบบสุ่ม แล้วเทสต์แกว่ง
function setup(round = 3) {
  for (const k of Object.keys(engine.players)) delete engine.players[k];
  cuts = [];
  const S = mk('S', 'yaguruma', 1);
  const K = mk('K', 'daisuke', 2);
  const A = mk('A', 'temari', 3);
  engine.players.S = S; engine.players.K = K; engine.players.A = A;
  Y.resetCombat(S); D.resetCombat(K); Y.resetCombat(A);
  engine.setCycleShift(0);
  engine.setRoundNumber(round);
  engine.setGameMode('ffa');
  engine.setGameState('PLAYING');
  return { S, K, A };
}

// ============================================================
//  โหมดและภาพ
// ============================================================
test('เริ่มเกมอยู่ PUT ON · ภาพสลับตามโหมด · CAST OFF ปิดการฟื้นเกราะ', () => {
  const { S } = setup();
  assert.equal(Y.cassOff(S), false);
  assert.equal(Y.displayImg(S), Y.IMG.putOn);
  Y.toggleCass(engine, S);
  assert.equal(Y.displayImg(S), Y.IMG.cassOff);
  assert.equal(Y.blocksArmorRegen(S), true);
  assert.equal(Y.damageBonus(engine, S, null, {}), Y.CASS_OFF_ATK);
});

// ============================================================
//  ท่าไม้ตาย Rider Sting
// ============================================================
test('Rider Sting: ต้องอยู่ใน CAST OFF · อาร์มแล้วกดซ้ำไม่ได้', () => {
  const { S } = setup();
  assert.equal(Y.canUseSkill(engine, S, 'ultimate'), false, 'PUT ON กดไม่ได้');
  Y.toggleCass(engine, S);
  assert.equal(Y.canUseSkill(engine, S, 'ultimate'), true);
  Y.armSting(engine, S);
  assert.equal(Y.stingArmed(S), true);
  assert.equal(Y.canUseSkill(engine, S, 'ultimate'), false, 'อาร์มค้างอยู่กดซ้ำไม่ได้');
});

test('Rider Sting: ล้าง "ต้านสถานะ" ของเป้าหมายก่อนหมัดลง', () => {
  const { S, A } = setup();
  Y.toggleCass(engine, S);
  Y.armSting(engine, S);
  A.statuses.resist = 3;
  assert.equal(Y.stripResistOnAttack(engine, S, A), true);
  assert.equal(A.statuses.resist || 0, 0, 'ต้านสถานะต้องถูกเจาะทิ้ง');
  assert.ok(cuts.includes('yagurumaSting'), 'ต้องคิววีดีโอประจำท่า');
});

test('Rider Sting: ฝังพิษร้าย 3 เทิร์น + ผุพัง 2 เทิร์น แล้วใช้โควตาหมด', () => {
  const { S, A } = setup();
  Y.toggleCass(engine, S);
  Y.armSting(engine, S);
  const r = Y.resolveStingOnAttack(engine, S, A);
  assert.equal(r.poisoned, true);
  assert.equal(r.decayed, true);
  assert.equal(A.statuses.poison, Y.STING_POISON_TURNS);
  assert.equal(A.statuses.decay, Y.STING_DECAY_TURNS);
  assert.equal(Y.stingArmed(S), false, 'ใช้หมดแล้ว');
  assert.equal(Y.canUseSkill(engine, S, 'ultimate'), true, 'กดใหม่ได้');
});

test('Rider Sting: เจาะต้านสถานะก่อน ดีบัฟที่ตามมาจึงติดได้จริง', () => {
  const { S, A } = setup();
  Y.toggleCass(engine, S);
  Y.armSting(engine, S);
  A.statuses.resist = 3;
  Y.stripResistOnAttack(engine, S, A);   // เจาะก่อน
  Y.resolveStingOnAttack(engine, S, A);  // แล้วค่อยฝัง
  assert.equal(A.statuses.poison, Y.STING_POISON_TURNS, 'ถ้าลำดับสลับกัน พิษจะโดนต้านทิ้งหมด');
});

// ============================================================
//  สถานะ "พิษร้าย" (Universal)
// ============================================================
test('พิษร้าย: ดาเมจ 1/เทิร์น (ลดเกราะก่อน) และหักพลังโจมตี 1', () => {
  const { A } = setup();
  A.armor = 1; A.hp = 7;
  engine.applyPoison(A, 3);
  assert.equal(engine.poisonAtkPenalty(A), 1, 'ติดพิษแล้วต้องหักพลังโจมตี');
  engine.tickPoison(engine, A);
  assert.equal(A.armor, 0, 'ลดเกราะก่อน');
  assert.equal(A.hp, 7);
  engine.tickPoison(engine, A);
  assert.equal(A.hp, 6, 'หมดเกราะแล้วเข้าเลือดจริง');
});

test('พิษร้าย: ต้านสถานะกันได้ และล้างออกได้', () => {
  const { A } = setup();
  A.statuses.resist = 2;
  assert.equal(engine.applyPoison(A, 3), false);
  assert.equal(A.statuses.poison || 0, 0);
  delete A.statuses.resist;
  engine.applyPoison(A, 3);
  engine.cleanseDebuffs(A);
  assert.equal(A.statuses.poison || 0, 0, 'ล้างแล้วต้องหายทั้งก้อน (ไม่ใช่ลดทีละเทิร์น)');
});

// ============================================================
//  แกนร่วม Zect — Clock Up หลายคน
// ============================================================
test('Clock Up: แต้มไม่ถึง 2 กดเปิดไม่ได้ (แต่กดปิดได้เสมอ)', () => {
  const { S } = setup();
  Y.toggleCass(engine, S);
  S.skillPoints = 1;
  assert.equal(Y.canUseSkill(engine, S, 'secondary'), false, 'แต้มไม่พอเปิดไม่ได้');
  S.skillPoints = 2;
  assert.equal(Y.canUseSkill(engine, S, 'secondary'), true);
  Y.setClockUp(engine, S, true);
  S.skillPoints = 0;
  assert.equal(Y.canUseSkill(engine, S, 'secondary'), true, 'เปิดอยู่แล้วต้องกดปิดได้เสมอ');
});

test('Clock Up: การแช่เป็นรายเทิร์น — เจ้าของท่าเปิดไพ่แล้วทุกคนขยับได้ทันที', () => {
  const { S, A } = setup();
  Y.toggleCass(engine, S);
  Y.setClockUp(engine, S, true);
  assert.equal(Y.actionBlocked(engine, A), true);
  S.locked = true; // ของจริง lock() ตั้งก่อนเรียก hook
  assert.equal(Y.onHostLockIn(engine, S), true);
  assert.equal(Y.actionBlocked(engine, A), false, 'เปิดไพ่แล้วต้องคลายทันที');
  assert.equal(Y.cardPhaseSeconds(engine), 0, 'ไม่ต้องยืดเวลาเฟสอีกแล้ว');
  // ขึ้นเทิร์นใหม่ (startRound รีเซ็ต locked) -> แช่อีกรอบเพราะ Clock Up ยังเปิดอยู่
  S.locked = false;
  assert.equal(Y.clockUpOn(S), true, 'โทกเกิลยังเปิดค้างข้ามเทิร์น');
  assert.equal(Y.actionBlocked(engine, A), true, 'เทิร์นใหม่ต้องแช่ซ้ำ');
});

test('Clock Up สองคน: ต้องเปิดไพ่ครบทุกคนเวลาถึงจะเดิน', () => {
  const { S, K, A } = setup();
  Y.toggleCass(engine, S); D.toggleCass(engine, K);
  Y.setClockUp(engine, S, true);
  D.setClockUp(engine, K, true);
  assert.equal(Y.clockUpHosts(engine).length, 2);
  assert.equal(Y.actionBlocked(engine, A), true);
  assert.equal(Y.actionBlocked(engine, K), false, 'ไรเดอร์ที่เปิดด้วยกันต้องขยับได้ทั้งคู่');
  S.locked = true;
  assert.equal(Y.onHostLockIn(engine, S), false, 'ยังเหลืออีกคน เวลายังไม่เดิน');
  assert.equal(Y.actionBlocked(engine, A), true, 'และยังแช่อยู่');
  K.locked = true;
  assert.equal(D.onHostLockIn(engine, K), true, 'ครบทุกคนแล้วเวลาถึงเดิน');
  assert.equal(Y.actionBlocked(engine, A), false);
});

test('ม่าน CLOCK UP: ไรเดอร์ที่เปิดเองต้องไม่โดนม่านบัง แม้จะมีอีกคนเปิดพร้อมกัน', () => {
  const { S, K, A } = setup();
  Y.toggleCass(engine, S); D.toggleCass(engine, K);
  Y.setClockUp(engine, S, true);
  D.setClockUp(engine, K, true);
  //  ธงนี้คือสิ่งที่ client ใช้วาดม่าน — ต้องเป็น per-viewer ไม่ใช่ id ของไรเดอร์คนแรก
  //  (บักเดิม: เทียบ id คนแรก ทำให้ไรเดอร์คนที่สองโดนม่านบังเอง)
  assert.equal(engine.buildStateFor(S.id).clockUpFrozen, false, 'ไรเดอร์คนที่สองต้องไม่โดนม่านบัง');
  assert.equal(engine.buildStateFor(K.id).clockUpFrozen, false);
  assert.equal(engine.buildStateFor(A.id).clockUpFrozen, true, 'คนนอกต้องเห็นม่าน');
  assert.equal(engine.buildStateFor(A.id).fullForce, true, 'สองคนเปิดพร้อมกัน = FULL FORCE');
  engine.clearPhaseTimer();
});

test('วีดีโอ Clock Up เล่นทุกครั้งที่กดเปิด ไม่ใช่แค่ครั้งแรก', () => {
  const { S } = setup();
  Y.toggleCass(engine, S);
  cuts.length = 0;
  for (let i = 0; i < 3; i++) {
    Y.setClockUp(engine, S, true);
    Y.setClockUp(engine, S, false);
  }
  assert.equal(cuts.filter((k) => k === 'yagurumaClockUp').length, 3, 'กดเปิด 3 ครั้ง ต้องคิวคลิป 3 ครั้ง');
});

test('Zect ข้อ 2: ตีไรเดอร์ที่ Clock Up ด้วยกัน แรงขึ้นอีก 1', () => {
  const { S, K, A } = setup();
  Y.toggleCass(engine, S); D.toggleCass(engine, K);
  Y.setClockUp(engine, S, true);
  assert.equal(Y.damageBonus(engine, S, A, {}), Y.CASS_OFF_ATK, 'ตีคนธรรมดาได้แค่โบนัส CAST OFF');
  D.setClockUp(engine, K, true);
  assert.equal(Y.damageBonus(engine, S, K, {}), Y.CASS_OFF_ATK + Y.ZECT_MIRROR_ATK, 'ทั้งคู่ Clock Up = +1');
});

test('Zect ข้อ 3: ถูกแช่อยู่ก็ยังกดสกิลรองของตัวเองได้ ถ้า CAST OFF และแต้มพอ', () => {
  const { S, K } = setup();
  D.toggleCass(engine, K);
  D.setClockUp(engine, K, true); // ไดสุเกะแช่สนาม
  assert.equal(Y.actionBlocked(engine, S), true, 'ยากุรุมะถูกแช่');
  assert.equal(Y.skillBlocked(engine, S, 'ultimate'), true, 'ท่าไม้ตายยังกดไม่ได้');
  assert.equal(Y.skillBlocked(engine, S, 'secondary'), true, 'ยังไม่ CAST OFF ก็กดไม่ได้');
  Y.toggleCass(engine, S);
  assert.equal(Y.skillBlocked(engine, S, 'secondary'), false, 'CAST OFF + แต้มพอ = กดได้');
  S.skillPoints = 1;
  assert.equal(Y.skillBlocked(engine, S, 'secondary'), true, 'แต้มไม่พอก็กดไม่ได้');
});

test('Zect: หลบ 25% เฉพาะตอน Clock Up', () => {
  const { S } = setup();
  assert.equal(Y.dodgeChance(S), 0);
  Y.toggleCass(engine, S);
  Y.setClockUp(engine, S, true);
  assert.equal(Y.dodgeChance(S), Y.ZECT_DODGE);
});

test('publicState ส่งโหมด/Clock Up/ไรเดอร์สติงครบ', () => {
  const { S } = setup();
  Y.toggleCass(engine, S);
  Y.setClockUp(engine, S, true);
  Y.armSting(engine, S);
  const st = Y.publicState(S);
  assert.equal(st.cassOff, true);
  assert.equal(st.clockUp, true);
  assert.equal(st.sting, true);
  assert.equal(st.dodge, Y.ZECT_DODGE);
});
