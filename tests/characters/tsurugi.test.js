// คามิชิโร่ ซึรุงิ (patch 4.5 new) — CAST OFF / Clock Up / Rider Slash
//  สิ่งที่เทสต์นี้คุมไว้: ดาบสองจังหวะ (ปาดบัฟ -> ฝังพิษ) · ทะเบียนบัฟกลางที่ทำขึ้นใหม่ ·
//  และแกน Zect ที่ตอนนี้มีไรเดอร์ใช้ร่วมกันถึงสี่คน
//
//  ⚠️ server.js เรียกฮุคต้นเทิร์นของไรเดอร์ "ทุกคน" กับผู้เล่นทุกคน — เทสต์จึงเรียกครบทั้งสี่ตัว
//  เหมือนของจริง เพื่อดักบั๊กค่า Clock Up ถูกหักซ้ำถ้าใครลืมด่าน id ตัวเอง
const test = require('node:test');
const assert = require('node:assert/strict');
const { engine } = require('../../server.js');
const tsurugi = require('../../characters/tsurugi.js');
const kagami = require('../../characters/kagami.js');
const daisuke = require('../../characters/daisuke.js');
const yaguruma = require('../../characters/yaguruma.js');
const U = require('../../characters/_universal_status.js');

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
    hp: 8, maxHpPenalty: 0, armor: 0, shield: 0, tempHp: 0,
    statuses: {}, statusAmt: {}, statusAt: {}, seen: {}, cutsceneShown: {},
    cards: [], skillPoints: 20, gold: 0, teamId: null, evadeStacks: [], inventory: [],
    dmgArmor: 0, dmgHp: 0, gainedSkill: 0, locked: false, result: null, connected: true,
    isLoser: false, isWinner: false, busted: false,
    colorTrigger: { red: 0, blue: 0, green: 0, yellow: 0 }, cardBonus: 0,
  };
}

function setup() {
  for (const k of Object.keys(engine.players)) delete engine.players[k];
  cuts = [];
  // เหยื่อต้องไม่มี adjustIncomingDamage ไม่งั้นเทสต์จะแกว่งตามการหลบแบบสุ่ม
  const S = mk('S', 'tsurugi', 1);
  const A = mk('A', 'temari', 2);
  const B = mk('B', 'kai', 3);
  engine.players.S = S; engine.players.A = A; engine.players.B = B;
  for (const p of [S, A, B]) {
    tsurugi.resetCombat(p); kagami.resetCombat(p); daisuke.resetCombat(p); yaguruma.resetCombat(p);
  }
  engine.setRoundNumber(1);
  engine.setCycleShift(0);
  return { S, A, B };
}

// เลียนแบบ startRound ของจริง: เรียกฮุคต้นเทิร์นของไรเดอร์ครบทุกคน
function roundTick(p) {
  daisuke.onRoundStartTick(engine, p);
  yaguruma.onRoundStartTick(engine, p);
  kagami.onRoundStartTick(engine, p);
  tsurugi.onRoundStartTick(engine, p);
}

// ============================================================
//  ทะเบียนบัฟกลาง + ปาดบัฟล่าสุด
// ============================================================
test('ทะเบียนบัฟ: ปาดตัวที่เพิ่งได้มาล่าสุดก่อนเสมอ', () => {
  const p = mk('P', 'temari', 1);
  U.applyBuff(p, 'resist', null, 3);
  U.applyBuff(p, 'might', 2, 1);
  U.applyBuff(p, 'fortune', null, 5);
  assert.equal(U.stripLatestBuff(p).key, 'fortune');
  assert.equal(U.stripLatestBuff(p).key, 'might');
  assert.equal(U.stripLatestBuff(p).key, 'resist');
  assert.equal(U.stripLatestBuff(p), null, 'ไม่มีบัฟเหลือแล้ว');
});

test('ทะเบียนบัฟ: ดีบัฟไม่ถูกนับเป็นบัฟ', () => {
  const p = mk('P', 'temari', 1);
  U.applyDebuff(p, 'stun', null, 2);
  U.applyDebuff(p, 'weak', 1, 3);
  assert.equal(U.stripLatestBuff(p), null);
  assert.equal(p.statuses.stun, 2, 'ดีบัฟต้องอยู่ครบ');
  assert.equal(p.statuses.weak, 3);
});

test('ทะเบียนบัฟ: ปาด "หลบหลีก" ต้องล้างสแตคจริงด้วย ไม่ใช่แค่ตัวเลขเงา', () => {
  const p = mk('P', 'temari', 1);
  p.evadeStacks = [3, 3];
  U.applyBuff(p, 'evade', null, 3);
  assert.equal(U.stripLatestBuff(p).key, 'evade');
  assert.deepEqual(p.evadeStacks, []);
});

// ============================================================
//  Rider Slash
// ============================================================
test('Rider Slash: ต้องอยู่ใน CAST OFF · อาร์มแล้วกดซ้ำไม่ได้', () => {
  const { S } = setup();
  assert.equal(tsurugi.canUseSkill(engine, S, 'ultimate'), false, 'PUT ON กดไม่ได้');
  assert.equal(tsurugi.canUseSkill(engine, S, 'secondary'), false, 'PUT ON เปิด Clock Up ไม่ได้');
  S.zectCassOff = true;
  assert.equal(tsurugi.canUseSkill(engine, S, 'ultimate'), true);
  tsurugi.armSlash(engine, S);
  assert.equal(tsurugi.slashArmed(S), true);
  assert.equal(tsurugi.slashStep(S), 0);
  assert.equal(tsurugi.canUseSkill(engine, S, 'ultimate'), false, 'อาร์มค้างอยู่กดซ้ำไม่ได้');
});

test('Rider Slash จังหวะแรก: ปาดบัฟล่าสุดทิ้ง แล้วรอจังหวะสอง', () => {
  const { S, A } = setup();
  S.zectCassOff = true;
  tsurugi.armSlash(engine, S);
  U.applyBuff(A, 'resist', null, 3);
  U.applyBuff(A, 'might', 2, 1); // ตัวนี้มาทีหลัง = ตัวที่ต้องโดนปาด

  const stripped = tsurugi.prepareSlashOnAttack(engine, S, A);
  assert.equal(stripped.key, 'might');
  assert.equal(A.statuses.might, undefined);
  assert.equal(A.statuses.resist, 3, 'ปาดทีละตัวเท่านั้น');
  assert.ok(cuts.includes('tsurugiSlashFirst'), 'จังหวะแรกต้องคิววีดีโอของตัวเอง');
  assert.equal(tsurugi.slashSecondHit(S), false, 'ยังไม่ใช่จังหวะสอง — ดาเมจยังคิดปกติ');

  const r = tsurugi.resolveSlashOnAttack(engine, S, A);
  assert.equal(r.hit, 1);
  assert.equal(tsurugi.slashStep(S), 1);
  assert.equal(tsurugi.slashArmed(S), true, 'ดาบยังไม่จบ');
  assert.equal(tsurugi.slashSecondHit(S), true, 'หมัดถัดไปเป็นจังหวะสอง = ดาเมจตายตัว');
});

test('Rider Slash จังหวะสอง: ฝังพิษร้าย 3 เทิร์นแล้วปิดชุด', () => {
  const { S, A } = setup();
  S.zectCassOff = true;
  tsurugi.armSlash(engine, S);
  tsurugi.prepareSlashOnAttack(engine, S, A);
  tsurugi.resolveSlashOnAttack(engine, S, A);

  cuts = [];
  assert.equal(tsurugi.prepareSlashOnAttack(engine, S, A), null, 'จังหวะสองไม่ปาดบัฟอีก');
  assert.ok(cuts.includes('tsurugiSlashFinal'), 'จังหวะสองใช้คลิปอีกตัว');
  const r = tsurugi.resolveSlashOnAttack(engine, S, A);
  assert.equal(r.hit, tsurugi.SLASH_HITS);
  assert.equal(r.poisoned, true);
  assert.equal(A.statuses.poison, tsurugi.SLASH_POISON_TURNS);
  assert.equal(tsurugi.slashArmed(S), false, 'ใช้จบแล้วต้องหาย');
  assert.equal(tsurugi.slashStep(S), 0);
});

test('Rider Slash: เป้าหมายไม่มีบัฟเลยก็ยังฟันได้ตามปกติ', () => {
  const { S, A } = setup();
  S.zectCassOff = true;
  tsurugi.armSlash(engine, S);
  assert.equal(tsurugi.prepareSlashOnAttack(engine, S, A), null);
  assert.equal(tsurugi.resolveSlashOnAttack(engine, S, A).hit, 1);
});

test('Rider Slash: ต้านสถานะผิดปกติกันพิษของจังหวะสองได้', () => {
  const { S, A } = setup();
  S.zectCassOff = true;
  tsurugi.armSlash(engine, S);
  tsurugi.resolveSlashOnAttack(engine, S, A);       // จบจังหวะแรก
  A.statuses.resist = 2;
  const r = tsurugi.resolveSlashOnAttack(engine, S, A); // จังหวะสอง
  assert.equal(r.poisoned, false);
  assert.equal(A.statuses.poison, undefined);
});

test('Rider Slash: ไม่ได้อาร์มก็ไม่มีอะไรเกิดขึ้น', () => {
  const { S, A } = setup();
  assert.equal(tsurugi.prepareSlashOnAttack(engine, S, A), null);
  assert.equal(tsurugi.resolveSlashOnAttack(engine, S, A), null);
  assert.equal(tsurugi.slashSecondHit(S), false);
  assert.deepEqual(cuts, []);
});

test('Rider Slash: continueSlash เปิดเฟสโจมตีให้เฉพาะตอนค้างจังหวะสอง', () => {
  const { S, A } = setup();
  S.zectCassOff = true;
  assert.equal(tsurugi.continueSlash(engine), false, 'ยังไม่ได้อาร์ม');
  tsurugi.armSlash(engine, S);
  assert.equal(tsurugi.continueSlash(engine), false, 'อาร์มแล้วแต่ยังไม่ได้ฟันจังหวะแรก');
  tsurugi.resolveSlashOnAttack(engine, S, A);
  assert.equal(tsurugi.continueSlash(engine), true, 'ค้างจังหวะสอง -> เปิดเฟสโจมตีอีกครั้ง');
  assert.equal(engine.gameState, 'ATTACK');
  assert.equal(engine.attackerId, S.id);
});

test('Rider Slash: ตายคาจังหวะแรก -> ล้างดาบทิ้ง ไม่ค้างข้ามเทิร์น', () => {
  const { S, A } = setup();
  S.zectCassOff = true;
  tsurugi.armSlash(engine, S);
  tsurugi.resolveSlashOnAttack(engine, S, A);
  S.alive = false;
  assert.equal(tsurugi.continueSlash(engine), false);
  assert.equal(tsurugi.slashArmed(S), false);
  assert.equal(tsurugi.slashStep(S), 0);
});

// ============================================================
//  แกน Zect (ต้องไม่พังเพราะมีไรเดอร์เพิ่มเป็นสี่คน)
// ============================================================
test('Clock Up: กินแต้มสกิลเทิร์นละ 2 พอดี แม้จะมีไรเดอร์สี่คนในเกม', () => {
  const { S } = setup();
  S.zectCassOff = true;
  tsurugi.setClockUp(engine, S, true);
  S.skillPoints = 10;
  roundTick(S);
  assert.equal(S.skillPoints, 10 - tsurugi.CLOCK_UP_DRAIN);
  roundTick(S);
  assert.equal(S.skillPoints, 10 - tsurugi.CLOCK_UP_DRAIN * 2);
});

test('CAST OFF / PUT ON: โบนัสโจมตี +1 · ฟื้นเลือดครบ 3 เทิร์น · รูปสลับตามโหมด', () => {
  const { S } = setup();
  assert.equal(tsurugi.displayImg(S), tsurugi.IMG.putOn, 'เริ่มเกมที่ PUT ON');
  S.hp = 4;
  roundTick(S); roundTick(S); roundTick(S);
  assert.equal(S.hp, 4 + tsurugi.PUT_ON_HEAL);

  tsurugi.toggleCass(engine, S);
  assert.equal(tsurugi.displayImg(S), tsurugi.IMG.cassOff);
  assert.equal(tsurugi.damageBonus(engine, S, null, {}), tsurugi.CASS_OFF_ATK);
  assert.equal(tsurugi.blocksArmorRegen(S), true);
});

test('Zect: ตีไรเดอร์ที่อยู่ใน Clock Up ด้วยกัน แรงขึ้นอีก 1', () => {
  const { S, B } = setup();
  const K = mk('K', 'kagami', 4);
  engine.players.K = K; kagami.resetCombat(K);
  S.zectCassOff = true; K.zectCassOff = true;
  tsurugi.setClockUp(engine, S, true);
  assert.equal(tsurugi.damageBonus(engine, S, B, {}), tsurugi.CASS_OFF_ATK);
  kagami.setClockUp(engine, K, true);
  assert.equal(tsurugi.damageBonus(engine, S, K, {}), tsurugi.CASS_OFF_ATK + tsurugi.ZECT_MIRROR_ATK);
});

test('Clock Up: แช่คนอื่นทั้งสนาม และคลายเมื่อเจ้าของเปิดไพ่', () => {
  const { S, A } = setup();
  S.zectCassOff = true;
  tsurugi.setClockUp(engine, S, true);
  assert.equal(tsurugi.actionBlocked(engine, A), true);
  assert.equal(tsurugi.actionBlocked(engine, S), false);
  S.locked = true;
  assert.equal(tsurugi.actionBlocked(engine, A), false);
  assert.equal(tsurugi.onHostLockIn(engine, S), true);
});
