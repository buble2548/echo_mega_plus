// คากามิ อาราตะ (patch 4.4 new) — CAST OFF / Clock Up / Rider Kick
//  สิ่งที่เทสต์นี้คุมไว้: การชาร์จ 3 ขั้นกับราคาของแต่ละขั้น · ผลของหมัดที่ชาร์จครบ ·
//  ทางแยกตอนเป้าหมายกาง "ต้านสถานะผิดปกติ" · และแกน Zect ที่ใช้ร่วมกับไรเดอร์อีกสองคน
//
//  ⚠️ server.js เรียกฮุคต้นเทิร์นของไรเดอร์ "ทุกคน" กับผู้เล่นทุกคน — เทสต์จึงเรียกทั้งสามตัว
//  เหมือนของจริง เพื่อดักบั๊กค่า Clock Up ถูกหักซ้ำถ้าใครลืมด่าน id ตัวเอง
const test = require('node:test');
const assert = require('node:assert/strict');
const { engine } = require('../../server.js');
const kagami = require('../../characters/kagami.js');
const daisuke = require('../../characters/daisuke.js');
const yaguruma = require('../../characters/yaguruma.js');

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
    statuses: {}, statusAmt: {}, seen: {}, cutsceneShown: {},
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
  const K = mk('K', 'kagami', 1);
  const A = mk('A', 'temari', 2);
  const B = mk('B', 'kai', 3);
  engine.players.K = K; engine.players.A = A; engine.players.B = B;
  for (const p of [K, A, B]) { kagami.resetCombat(p); daisuke.resetCombat(p); yaguruma.resetCombat(p); }
  engine.setRoundNumber(1);
  engine.setCycleShift(0);
  return { K, A, B };
}

// เลียนแบบ startRound ของจริง: เรียกฮุคต้นเทิร์นของไรเดอร์ครบทั้งสามตัว
function roundTick(p) {
  daisuke.onRoundStartTick(engine, p);
  yaguruma.onRoundStartTick(engine, p);
  kagami.onRoundStartTick(engine, p);
}

// ============================================================
//  CAST OFF / PUT ON
// ============================================================
test('CAST OFF: พลังโจมตี +1 · เกราะไม่ฟื้น · คลิปเล่นครั้งเดียวต่อเกม', () => {
  const { K } = setup();
  assert.equal(kagami.cassOff(K), false, 'เริ่มเกมที่ PUT ON เสมอ');
  assert.equal(kagami.displayImg(K), kagami.IMG.putOn);
  assert.equal(kagami.damageBonus(engine, K, null, {}), 0);

  kagami.toggleCass(engine, K);
  assert.equal(kagami.cassOff(K), true);
  assert.equal(kagami.displayImg(K), kagami.IMG.cassOff);
  assert.equal(kagami.damageBonus(engine, K, null, {}), kagami.CASS_OFF_ATK);
  assert.equal(kagami.blocksArmorRegen(K), true);
  assert.ok(cuts.includes('kagamiCassOff'));
});

test('PUT ON: ครบ 3 เทิร์นฟื้นเลือด +2 — และตัวนับต้องไม่เดินสองเท่า', () => {
  const { K } = setup();
  K.hp = 4;
  roundTick(K); assert.equal(K.zectPutOnTurns, 1, 'ฮุคของไรเดอร์คนอื่นต้องไม่มาเดินตัวนับให้');
  roundTick(K); assert.equal(K.zectPutOnTurns, 2);
  assert.equal(K.hp, 4, 'ยังไม่ครบ 3 เทิร์น ยังไม่ฟื้น');
  roundTick(K);
  assert.equal(K.hp, 4 + kagami.PUT_ON_HEAL);
  assert.equal(K.zectPutOnTurns, 0, 'ฟื้นแล้วเริ่มนับใหม่');
});

// ============================================================
//  Clock Up (แกนร่วมกับไดสุเกะ/ยากุรุมะ)
// ============================================================
test('Clock Up: กินแต้มสกิลเทิร์นละ 2 พอดี ไม่ใช่ 4', () => {
  const { K } = setup();
  K.zectCassOff = true;
  kagami.setClockUp(engine, K, true);
  K.skillPoints = 10;
  roundTick(K);
  assert.equal(K.skillPoints, 10 - kagami.CLOCK_UP_DRAIN);
  roundTick(K);
  assert.equal(K.skillPoints, 10 - kagami.CLOCK_UP_DRAIN * 2);
});

test('Clock Up: แต้มไม่พอจ่าย -> ปิดตัวเอง · แต้มไม่ถึง 2 กดเปิดไม่ได้', () => {
  const { K } = setup();
  K.zectCassOff = true;
  kagami.setClockUp(engine, K, true);
  K.skillPoints = 1;
  roundTick(K);
  assert.equal(kagami.clockUpOn(K), false);
  assert.equal(kagami.canToggleClockUp(K), false, 'แต้มเหลือ 1 กดเปิดใหม่ไม่ได้');
  K.skillPoints = kagami.CLOCK_UP_DRAIN;
  assert.equal(kagami.canToggleClockUp(K), true);
});

test('Clock Up: แช่คนอื่นทั้งสนาม และคลายทันทีที่เจ้าของเปิดไพ่', () => {
  const { K, A } = setup();
  K.zectCassOff = true;
  kagami.setClockUp(engine, K, true);
  assert.equal(kagami.actionBlocked(engine, A), true);
  assert.equal(kagami.actionBlocked(engine, K), false, 'เจ้าของท่ายังเล่นได้');
  assert.equal(kagami.cardPhaseSeconds(engine), kagami.CLOCK_UP_SAFETY);
  K.locked = true;
  assert.equal(kagami.actionBlocked(engine, A), false);
  assert.equal(kagami.onHostLockIn(engine, K), true, 'ไม่มีไรเดอร์คนอื่นค้างอยู่ -> เวลาเดินต่อ');
});

test('Zect: ตีไรเดอร์ที่อยู่ใน Clock Up ด้วยกัน แรงขึ้นอีก 1', () => {
  const { K, B } = setup();
  const Y = mk('Y', 'yaguruma', 4);
  engine.players.Y = Y; yaguruma.resetCombat(Y);
  K.zectCassOff = true; Y.zectCassOff = true;
  kagami.setClockUp(engine, K, true);
  assert.equal(kagami.damageBonus(engine, K, B, {}), kagami.CASS_OFF_ATK, 'คนธรรมดาได้แค่โบนัส CAST OFF');
  yaguruma.setClockUp(engine, Y, true);
  assert.equal(kagami.damageBonus(engine, K, Y, {}), kagami.CASS_OFF_ATK + kagami.ZECT_MIRROR_ATK);
});

// ============================================================
//  Rider Kick — การชาร์จ
// ============================================================
test('Rider Kick: ชาร์จ 3 ขั้น ราคา 1/1/3 · ครบแล้วอาร์ม · กดซ้ำไม่ได้', () => {
  const { K } = setup();
  K.zectCassOff = true;

  assert.equal(kagami.ultimateCost(K), 1, 'ขั้นที่ 1 ราคา 1');
  kagami.chargeKick(engine, K);
  assert.equal(kagami.chargeOf(K), 1);
  assert.ok(cuts.includes('kagamiKickOne'), 'ขั้นที่ 1 มีคลิป');

  assert.equal(kagami.ultimateCost(K), 1, 'ขั้นที่ 2 ราคา 1');
  cuts = [];
  kagami.chargeKick(engine, K);
  assert.equal(kagami.chargeOf(K), 2);
  assert.ok(cuts.includes('kagamiKickTwo'), 'ขั้นที่ 2 เป็นการ์ดแจ้งเตือน');
  assert.equal(kagami.kickArmed(K), false);

  assert.equal(kagami.ultimateCost(K), kagami.KICK_STEP_COST[2], 'ขั้นที่ 3 ราคา 3');
  cuts = [];
  kagami.chargeKick(engine, K);
  assert.equal(kagami.chargeOf(K), kagami.KICK_STEPS);
  assert.equal(kagami.kickArmed(K), true);
  assert.ok(cuts.includes('kagamiKickThree'), 'ขั้นที่ 3 มีคลิป');
  assert.equal(kagami.canUseSkill(engine, K, 'ultimate'), false, 'อาร์มแล้วกดซ้ำไม่ได้');
});

test('Rider Kick: ชาร์จค้างข้ามเทิร์น และกดรวดเดียวจบในเทิร์นเดียวได้', () => {
  const { K } = setup();
  K.zectCassOff = true;
  kagami.chargeKick(engine, K);
  roundTick(K); roundTick(K);
  assert.equal(kagami.chargeOf(K), 1, 'ขึ้นเทิร์นใหม่แล้วการชาร์จต้องไม่หาย');
  // ทั้งสามช่องของคากามิไม่กินโควตาสกิลของเทิร์น จึงกดต่อกันรวดเดียวได้
  assert.equal(kagami.skipsTurnQuota(K, 'basic'), true);
  assert.equal(kagami.skipsTurnQuota(K, 'secondary'), true);
  assert.equal(kagami.skipsTurnQuota(K, 'ultimate'), true);
});

test('Rider Kick: ต้องอยู่ใน CAST OFF · สกิลพื้นฐานกดระหว่าง Clock Up ไม่ได้', () => {
  const { K } = setup();
  assert.equal(kagami.canUseSkill(engine, K, 'secondary'), false, 'PUT ON เปิด Clock Up ไม่ได้');
  assert.equal(kagami.canUseSkill(engine, K, 'ultimate'), false, 'PUT ON ชาร์จไม่ได้');
  assert.equal(kagami.canUseSkill(engine, K, 'basic'), true);
  K.zectCassOff = true;
  assert.equal(kagami.canUseSkill(engine, K, 'ultimate'), true);
  kagami.setClockUp(engine, K, true);
  assert.equal(kagami.canUseSkill(engine, K, 'basic'), false, 'สลับโหมดระหว่าง Clock Up ไม่ได้');
});

// ============================================================
//  Rider Kick — ตอนออกหมัด
// ============================================================
test('Rider Kick: ชาร์จครบแล้วหมัดแรงขึ้น +1 และฝังช็อต 5 / ชา 3', () => {
  const { K, A } = setup();
  K.zectCassOff = true;
  K.kagamiCharge = kagami.KICK_STEPS;
  K.kagamiKick = true;
  assert.equal(kagami.damageBonus(engine, K, A, {}), kagami.CASS_OFF_ATK + kagami.KICK_ATK);

  const pierce = kagami.prepareKickOnAttack(engine, K, A);
  assert.equal(pierce, false, 'เป้าหมายไม่มีต้านสถานะ -> หมัดปกติ');
  assert.ok(cuts.includes('kagamiKickFinal'), 'ต้องคิววีดีโอตอนออกหมัด');

  const r = kagami.resolveKickOnAttack(engine, K, A, pierce);
  assert.equal(r.shocked, true);
  assert.equal(r.numbed, true);
  assert.equal(A.statuses.shock, kagami.KICK_SHOCK_TURNS);
  assert.equal(A.statuses.chaa, kagami.KICK_CHAA_TURNS);
  assert.equal(kagami.kickArmed(K), false, 'ใช้แล้วต้องหาย');
  assert.equal(kagami.chargeOf(K), 0, 'ใช้แล้วต้องชาร์จใหม่ตั้งแต่ขั้น 1');
});

test('Rider Kick: เป้าหมายมีต้านสถานะ -> ทะลุเกราะแทน ไม่ติดดีบัฟใดเลย', () => {
  const { K, A } = setup();
  K.zectCassOff = true;
  K.kagamiKick = true;
  K.kagamiCharge = kagami.KICK_STEPS;
  A.statuses.resist = 3;

  const pierce = kagami.prepareKickOnAttack(engine, K, A);
  assert.equal(pierce, true);
  kagami.resolveKickOnAttack(engine, K, A, pierce);
  assert.equal(A.statuses.shock, undefined, 'แลกเป็นหมัดทะลุเกราะแล้ว ไม่ฝังช็อต');
  assert.equal(A.statuses.chaa, undefined);
  assert.equal(A.statuses.resist, 3, 'ต่างจาก Rider Sting ตรงที่ไม่ล้างต้านสถานะทิ้ง');
  assert.equal(kagami.kickArmed(K), false);
});

test('Rider Kick: ไม่ได้อาร์มก็ไม่มีอะไรเกิดขึ้น', () => {
  const { K, A } = setup();
  assert.equal(kagami.prepareKickOnAttack(engine, K, A), false);
  assert.equal(kagami.resolveKickOnAttack(engine, K, A, false), null);
  assert.deepEqual(cuts, []);
});

// ============================================================
//  สถานะ "ช็อต" (Universal)
// ============================================================
test('ช็อต: โรล 15% ต่อเทิร์น -> ติดสตั้น · ไม่ผ่านโรลก็ไม่มีอะไรเกิด', () => {
  const { A } = setup();
  engine.applyShock(A, 5);
  assert.equal(A.statuses.shock, 5);

  Math.random = () => 0.9; // 90% -> ไม่ผ่าน
  assert.equal(engine.tickShock(engine, A), false);
  assert.equal(A.statuses.stun, undefined);

  Math.random = () => 0.01; // 1% -> ผ่าน
  assert.equal(engine.tickShock(engine, A), true);
  assert.equal(A.statuses.stun, 1);
});

test('ช็อต: ต้านสถานะกันได้ทั้งตอนแปะและตอนที่ไฟกำเริบกลางทาง', () => {
  const { A, B } = setup();
  A.statuses.resist = 2;
  assert.equal(engine.applyShock(A, 5), false, 'ต้านสถานะกันตอนแปะ');
  assert.equal(A.statuses.shock, undefined);

  engine.applyShock(B, 5);
  B.statuses.resist = 2; // ต้านสถานะมาทีหลัง
  Math.random = () => 0.01;
  assert.equal(engine.tickShock(engine, B), false, 'โรลผ่านแต่ต้านสถานะกันสตั้นไว้ได้');
  assert.equal(B.statuses.stun, undefined);
  assert.equal(B.statuses.shock, 5, 'ตัวช็อตเองยังอยู่');
});

test('ช็อต: ถูกล้างสถานะจะลดทีละ 1 เทิร์น ไม่หายทั้งก้อน', () => {
  const { A } = setup();
  engine.applyShock(A, 5);
  engine.cleanseOneStep(A);
  assert.equal(A.statuses.shock, 4);
  engine.cleanseDebuffs(A);
  assert.equal(A.statuses.shock, 3, 'ล้างดีบัฟชุดใหญ่ก็ลดทีละ 1 เท่านั้น ไม่ลบทั้งก้อน (อยู่ใน SOFT_DEBUFF_STEP)');
  A.statuses.shock = 1;
  engine.cleanseOneStep(A);
  assert.equal(A.statuses.shock, undefined, 'ลดจนหมดจึงหายไป');
});
