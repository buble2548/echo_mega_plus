// Direct unit tests for characters/satoru.js — satoru.onTargeted is the highest-blast-radius
// hook in the game (nearly every other character calls engine.satoruOnTargeted before applying
// a skill effect/damage), yet had zero test coverage before this file.
const test = require('node:test');
const assert = require('node:assert/strict');
const { engine } = require('../../server.js');
const satoru = require('../../characters/satoru.js');

test.beforeEach(() => {
  for (const k of Object.keys(engine.players)) delete engine.players[k];
});

let uid = 0;
function mkPlayer(over = {}) {
  const id = `p${++uid}`;
  const p = Object.assign({
    id, name: id, alive: true, characterId: 'satoru', hp: 5, armor: 2,
    skillPoints: 4, statuses: {}, statusAmt: {}, cutsceneShown: {},
  }, over);
  engine.players[id] = p;
  return p;
}

test('onTargeted: negates the incoming skill and starts a 2-turn cooldown', () => {
  const satoruP = mkPlayer({ wouGuardCd: 0 });
  const attacker = mkPlayer({ characterId: 'tohno' });
  const result = satoru.onTargeted(engine, satoruP, attacker, 'สกิลทดสอบ ');
  assert.equal(result.negated, true);
  assert.equal(satoruP.wouGuardCd, 2);
});

test('onTargeted: on cooldown, does not negate (but still checks Wonder of U)', () => {
  const satoruP = mkPlayer({ wouGuardCd: 1, skillPoints: 3 });
  const attacker = mkPlayer({ characterId: 'tohno' });
  const result = satoru.onTargeted(engine, satoruP, attacker, 'สกิลทดสอบ ');
  assert.equal(result.negated, false);
  assert.equal(satoruP.wouGuardCd, 1, 'cooldown untouched while already on cooldown');
});

test('onTargeted: self-targeting never negates (satoru targeting satoru)', () => {
  const satoruP = mkPlayer({ wouGuardCd: 0 });
  const result = satoru.onTargeted(engine, satoruP, satoruP, 'สกิลทดสอบ ');
  assert.equal(result.negated, false);
});

test('onTargeted: passiveSealed (e.g. MOON*CELL) suppresses the negate entirely', () => {
  const satoruP = mkPlayer({ wouGuardCd: 0 });
  const attacker = mkPlayer({ characterId: 'tohno' });
  const sealedEngine = Object.assign(Object.create(engine), { passiveSealed: () => true });
  const result = satoru.onTargeted(sealedEngine, satoruP, attacker, 'สกิลทดสอบ ');
  assert.equal(result.negated, false);
  assert.equal(satoruP.wouGuardCd, 0, 'no cooldown consumed while sealed');
});

test('maybeWonderOfU: fires automatically when skillPoints >= WOU_COST(8), deducts cost, applies Calamity to attacker', () => {
  const satoruP = mkPlayer({ skillPoints: 10 });
  const attacker = mkPlayer({ characterId: 'tohno' });
  satoru.maybeWonderOfU(engine, satoruP, attacker);
  assert.equal(satoruP.skillPoints, 2, '10 - WOU_COST(8) = 2');
  assert.equal((attacker.statuses.calamity || 0) > 0, true, 'attacker gets hit with Calamity');
});

test('maybeWonderOfU: does not fire below the skill-point cost', () => {
  const satoruP = mkPlayer({ skillPoints: 7 });
  const attacker = mkPlayer({ characterId: 'tohno' });
  satoru.maybeWonderOfU(engine, satoruP, attacker);
  assert.equal(satoruP.skillPoints, 7, 'untouched — cost not met');
  assert.equal(attacker.statuses.calamity || 0, 0);
});

test('applyCalamity: stacks up to CALAMITY_MAX(3), blocked entirely by resist', () => {
  const v = mkPlayer({ characterId: 'tohno' });
  assert.equal(satoru.applyCalamity(engine, v), true);
  assert.equal(v.statusAmt.calamity, 1);
  satoru.applyCalamity(engine, v);
  satoru.applyCalamity(engine, v);
  satoru.applyCalamity(engine, v); // 4th call, should cap at 3
  assert.equal(v.statusAmt.calamity, 3);

  const resisted = mkPlayer({ characterId: 'tohno', statuses: { resist: 1 } });
  assert.equal(satoru.applyCalamity(engine, resisted), false);
  assert.equal(resisted.statusAmt.calamity || 0, 0);
});

test('prepareObladaTarget: rejects self-target and dead targets, accepts a valid other player', () => {
  const p = mkPlayer();
  const self = satoru.prepareObladaTarget(engine, p, [p.id]);
  assert.equal(self, null, 'cannot target self');
  const other = mkPlayer({ characterId: 'nanaya' });
  const dead = mkPlayer({ characterId: 'tohno', alive: false });
  assert.equal(satoru.prepareObladaTarget(engine, p, [dead.id]), null, 'cannot target a dead player');
  assert.equal(satoru.prepareObladaTarget(engine, p, [other.id]), other);
});

test('applyObladaEffect: applies the oblada dot unless the target resists or negates via satoru-on-satoru', () => {
  const p = mkPlayer();
  const target = mkPlayer({ characterId: 'nanaya' });
  applyObladaFresh(target);
  function applyObladaFresh(t) {
    satoru.applyObladaEffect(engine, p, t, 'ทดสอบ');
  }
  assert.equal((target.statuses.oblada || 0) > 0, true);
});

test('applyLocaEffect: using it on self heals to full, -1 max HP, +LOCA_SELF_POINTS skill', () => {
  const p = mkPlayer({ hp: 1 });
  const before = engine.maxHpOf(p);
  const suffix = satoru.applyLocaEffect(engine, p, p);
  assert.equal(p.maxHpPenalty, 1);
  assert.equal(engine.maxHpOf(p), before - 1);
  assert.equal(p.hp, engine.maxHpOf(p));
  assert.equal(p.skillPoints, 7, '4 default + LOCA_SELF_POINTS(3)');
  assert.match(suffix, /กินเอง/);
});

test('applyLocaEffect: giving it to another player just records a pending offer, no immediate effect on them', () => {
  const p = mkPlayer();
  const target = mkPlayer({ characterId: 'nanaya', hp: 3 });
  const targetMaxHpBefore = engine.maxHpOf(target);
  satoru.applyLocaEffect(engine, p, target);
  assert.equal(p.locaOffer, target.id);
  assert.equal(target.hp, 3, 'no immediate change to the target — they must still accept');
  assert.equal(engine.maxHpOf(target), targetMaxHpBefore);
});
