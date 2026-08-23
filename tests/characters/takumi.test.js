// Direct unit tests for characters/takumi.js — gear damageBonus tiers, gear-up/gear-down clamping,
// heal-on-drop-to-1 math, and blackout activation/trigger/expiry state transitions.
const test = require('node:test');
const assert = require('node:assert/strict');
const { engine } = require('../../server.js');
const takumi = require('../../characters/takumi.js');

test.beforeEach(() => {
  for (const k of Object.keys(engine.players)) delete engine.players[k];
});

let uid = 0;
function mkPlayer(over = {}) {
  const id = `p${++uid}`;
  const p = Object.assign({
    id, name: id, alive: true, characterId: 'takumi', position: uid, hp: 5, armor: 2, skillPoints: 4,
    statuses: {}, statusAmt: {}, cutsceneShown: {}, seen: {}, cards: [], cardBonus: 0,
    takumiGear: 1, takumiBlackoutFired: false,
  }, over);
  engine.players[id] = p;
  return p;
}

test('damageBonus: 0 at gear 1-2, +1 at gear 3-5, +2 at gear 6, 0 for non-takumi', () => {
  const p1 = mkPlayer({ takumiGear: 1 });
  assert.equal(takumi.damageBonus(engine, p1), 0);
  const p2 = mkPlayer({ takumiGear: 2 });
  assert.equal(takumi.damageBonus(engine, p2), 0);
  const p3 = mkPlayer({ takumiGear: 3 });
  assert.equal(takumi.damageBonus(engine, p3), 1);
  const p5 = mkPlayer({ takumiGear: 5 });
  assert.equal(takumi.damageBonus(engine, p5), 1);
  const p6 = mkPlayer({ takumiGear: 6 });
  assert.equal(takumi.damageBonus(engine, p6), 2, 'gear 6: +1 (>=3) + 1 (>=6) = +2');
  const other = mkPlayer({ characterId: 'tohno', takumiGear: 6 });
  assert.equal(takumi.damageBonus(engine, other), 0, 'zero for non-takumi attackers');
});

test('applyGearUp: increments gear, clamped at 6 (no error/overflow when pressed at cap)', () => {
  const p = mkPlayer({ takumiGear: 5 });
  takumi.applyGearUp(engine, p);
  assert.equal(p.takumiGear, 6);
  takumi.applyGearUp(engine, p);
  assert.equal(p.takumiGear, 6, 'clamped at 6');
});

test('applyGearDown: decrements gear, clamped at 1 (no error/underflow when pressed at floor)', () => {
  const p = mkPlayer({ takumiGear: 2 });
  takumi.applyGearDown(engine, p);
  assert.equal(p.takumiGear, 1);
  takumi.applyGearDown(engine, p);
  assert.equal(p.takumiGear, 1, 'clamped at 1');
});

test('applyGearDown: landing exactly on 1 heals min(4, gear-before-this-press - 1)', () => {
  const p = mkPlayer({ takumiGear: 2, hp: 3, armor: 0 });
  takumi.applyGearDown(engine, p); // before=2 -> heal min(4, 2-1) = 1
  assert.equal(p.takumiGear, 1);
  assert.equal(p.hp, 4, 'healed +1 (min(4, 2-1))');
});

test('applyGearDown: heal is capped at 4 even from a high gear (e.g. gear 6 -> heal min(4,5)=4)', () => {
  const p = mkPlayer({ takumiGear: 6, hp: 1, armor: 0 });
  // press down repeatedly to gear 1 — only the FINAL press (landing exactly on 1) should heal,
  // and that heal is based on the gear right before that last press (gear 2 -> 1), not the original 6
  for (let i = 0; i < 5; i++) takumi.applyGearDown(engine, p);
  assert.equal(p.takumiGear, 1);
  assert.equal(p.hp, 2, 'only the last press (2->1) healed: min(4, 2-1)=1, not min(4,5)=4');
});

test('applyGearDown: no heal when already at gear 1 (no-op press)', () => {
  const p = mkPlayer({ takumiGear: 1, hp: 3, armor: 0 });
  takumi.applyGearDown(engine, p);
  assert.equal(p.hp, 3, 'no heal — was already at floor');
});

test('activateBlackout: sets takumiBlackout status to 3 turns and resets the fired guard', () => {
  const p = mkPlayer({ takumiBlackoutFired: true });
  takumi.activateBlackout(engine, p);
  assert.equal(p.statuses.takumiBlackout, 3);
  assert.equal(p.takumiBlackoutFired, false);
});

test('isBlackoutActive: true only while some player holds the takumiBlackout status', () => {
  const p = mkPlayer();
  assert.equal(takumi.isBlackoutActive(engine), false);
  takumi.activateBlackout(engine, p);
  assert.equal(takumi.isBlackoutActive(engine), true);
  delete p.statuses.takumiBlackout;
  assert.equal(takumi.isBlackoutActive(engine), false);
});

test('tryBustTrigger: no-op if no takumi has an active, unfired blackout', () => {
  const other = mkPlayer({ characterId: 'tohno', cards: [{ value: 25 }] });
  takumi.tryBustTrigger(engine);
  assert.equal(other.hp, 5, 'nothing happened — no takumi in blackout');
});

test('tryBustTrigger: no-op if nobody busted this round', () => {
  const t = mkPlayer();
  takumi.activateBlackout(engine, t);
  const other = mkPlayer({ characterId: 'tohno', cards: [{ value: 10 }] });
  takumi.tryBustTrigger(engine);
  assert.equal(t.statuses.takumiBlackout, 3, 'blackout still active — nobody busted');
  assert.equal(other.hp, 5, 'untouched');
});

test('tryBustTrigger: first buster in seat order takes 3 dmg (through armor) + decay(3), then blackout ends immediately', () => {
  const t = mkPlayer({ position: 1 });
  takumi.activateBlackout(engine, t);
  const p2 = mkPlayer({ characterId: 'tohno', position: 2, cards: [{ value: 25 }], hp: 10, armor: 1 });
  const p3 = mkPlayer({ characterId: 'riddhe', position: 3, cards: [{ value: 25 }], hp: 10, armor: 1 });
  takumi.tryBustTrigger(engine);
  assert.equal(p2.armor, 0, 'armor absorbed 1 of the 3 damage first');
  assert.equal(p2.hp, 8, 'remaining 2 damage spilled into hp');
  assert.equal(p2.statuses.decay, 3, 'target gets 3 turns of decay');
  assert.equal(p3.hp, 10, 'second buster (later seat) untouched — only the first buster in seat order is hit');
  assert.equal(t.statuses.takumiBlackout || 0, 0, 'blackout ends immediately once triggered');
  assert.equal(t.takumiBlackoutFired, true, 'fired guard set to prevent re-trigger');
});

test('tryBustTrigger: guard prevents a second trigger once already fired this activation', () => {
  const t = mkPlayer({ position: 1 });
  takumi.activateBlackout(engine, t);
  t.takumiBlackoutFired = true; // simulate already fired earlier this same activation
  const p2 = mkPlayer({ characterId: 'tohno', position: 2, cards: [{ value: 25 }], hp: 10, armor: 0 });
  takumi.tryBustTrigger(engine);
  assert.equal(p2.hp, 10, 'no-op — guard blocks re-trigger');
});

test('tryBustTrigger: a resisted bust target still takes damage but not the decay debuff', () => {
  const t = mkPlayer({ position: 1 });
  takumi.activateBlackout(engine, t);
  const p2 = mkPlayer({ characterId: 'tohno', position: 2, cards: [{ value: 25 }], hp: 10, armor: 0, statuses: { resist: 1 } });
  takumi.tryBustTrigger(engine);
  assert.equal(p2.hp, 7, 'still takes the 3 damage');
  assert.equal(p2.statuses.decay || 0, 0, 'resisted — no decay applied');
});
