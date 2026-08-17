// Direct unit tests for characters/eva13.js — isEva3Active/maybeEnterEva3/rsHopperBlock/normalAttackFloor
// are called from ~30 sites across server.js (same choke-point pattern as maybeBeatSave/maybeBeatMode)
// via thin wrappers, yet had zero direct test coverage before this file.
const test = require('node:test');
const assert = require('node:assert/strict');
const { engine } = require('../../server.js');
const eva13 = require('../../characters/eva13.js');

test.beforeEach(() => {
  for (const k of Object.keys(engine.players)) delete engine.players[k];
});

let uid = 0;
function mkPlayer(over = {}) {
  const id = `p${++uid}`;
  const p = Object.assign({
    id, name: id, alive: true, characterId: 'eva13', hp: 5, armor: 0,
    statuses: {}, statusAmt: {}, cutsceneShown: {}, seen: {},
  }, over);
  engine.players[id] = p;
  return p;
}

test('damageBonus: spear gives +1 atk, Fourth Impact gives +2, both stack together', () => {
  const p = mkPlayer({ statuses: { spear: 1 } });
  const ctx = {};
  assert.equal(eva13.damageBonus(engine, p, mkPlayer({ characterId: 'tohno' }), ctx), 1);
  assert.equal(ctx.spearAtk, true);
  assert.equal(ctx.fourthAtk, 0);

  const both = mkPlayer({ statuses: { spear: 1, fourth: 1 } });
  assert.equal(eva13.damageBonus(engine, both, mkPlayer({ characterId: 'tohno' }), {}), 3, '1 (spear) + 2 (fourth)');
});

test('isEva3Active: true only while alive with 0 < hp <= EVA13_HP_THRESHOLD(4) and not passive-sealed', () => {
  assert.equal(eva13.isEva3Active(engine, mkPlayer({ hp: 4 })), true);
  assert.equal(eva13.isEva3Active(engine, mkPlayer({ hp: 5 })), false, 'above the threshold');
  assert.equal(eva13.isEva3Active(engine, mkPlayer({ hp: 0, alive: false })), false, 'dead');

  const sealedEngine = Object.assign(Object.create(engine), { passiveSealed: () => true });
  assert.equal(eva13.isEva3Active(sealedEngine, mkPlayer({ hp: 4 })), false, 'sealed passives never activate');
});

test('maybeEnterEva3: heals armor and marks seen.eva3 the first time hp drops to the threshold, no-ops on repeat calls', () => {
  const p = mkPlayer({ hp: 3, armor: 0 });
  eva13.maybeEnterEva3(engine, p);
  assert.equal(p.seen.eva3, true);
  assert.equal(p.armor, 1, 'healArmor is capped by maxArmorOf, which is only +1 while eva3 is active (eva13 has no armor otherwise)');

  p.armor = 0;
  eva13.maybeEnterEva3(engine, p); // already seen -> should not heal again
  assert.equal(p.armor, 0);
});

test('maybeEnterEva3: does nothing while hp is above the threshold', () => {
  const p = mkPlayer({ hp: 5, armor: 0 });
  eva13.maybeEnterEva3(engine, p);
  assert.equal(p.seen.eva3 || false, false);
  assert.equal(p.armor, 0);
});

test('isLossImmune: Fourth Impact always forces immunity; otherwise immune only while eva3 (low-hp passive) is NOT active', () => {
  const fourth = mkPlayer({ hp: 5, statuses: { fourth: 1 } });
  assert.equal(eva13.isLossImmune(engine, fourth), true, 'fourth impact overrides everything');

  const lowHp = mkPlayer({ hp: 3 }); // eva3 active -> immunity suppressed
  assert.equal(eva13.isLossImmune(engine, lowHp), false);

  const healthy = mkPlayer({ hp: 5 }); // eva3 not active -> immune by default
  assert.equal(eva13.isLossImmune(engine, healthy), true);
});

test('rsHopperBlock: consumes a charge and blocks skill damage, refuses with 0 charges or while Fourth Impact is active', () => {
  const p = mkPlayer({ statuses: { rsHopper: 2 } });
  assert.equal(eva13.rsHopperBlock(engine, p), true);
  assert.equal(p.statuses.rsHopper, 1);

  const noCharge = mkPlayer({ statuses: { rsHopper: 0 } });
  assert.equal(eva13.rsHopperBlock(engine, noCharge), false);

  const fourthActive = mkPlayer({ statuses: { rsHopper: 2, fourth: 1 } });
  assert.equal(eva13.rsHopperBlock(engine, fourthActive), false, 'fourth impact suppresses RS-Hopper');
  assert.equal(fourthActive.statuses.rsHopper, 2, 'not consumed');
});

test('normalAttackFloor: pins hp at EVA13_HP_THRESHOLD(4) and consumes a charge only when the hit would drop below it', () => {
  const p = mkPlayer({ hp: 6, statuses: { rsHopper: 1 } });
  assert.equal(eva13.normalAttackFloor(engine, p, 3), true, '6 - 3 = 3, which is <= threshold(4)');
  assert.equal(p.hp, 4);
  assert.equal(p.statuses.rsHopper, 0);

  const safe = mkPlayer({ hp: 6, statuses: { rsHopper: 1 } });
  assert.equal(eva13.normalAttackFloor(engine, safe, 1), false, '6 - 1 = 5, still above threshold — no floor needed');
  assert.equal(safe.hp, 6);
  assert.equal(safe.statuses.rsHopper, 1, 'not consumed');
});

test('onAttackConsumeSpear: always clears the spear flag; guaranteed lock while eva3/fourth active, otherwise a coin flip', () => {
  const attacker = mkPlayer({ hp: 3, statuses: { spear: 1 } }); // eva3 active -> guaranteed
  const target = mkPlayer({ characterId: 'tohno' });
  eva13.onAttackConsumeSpear(engine, attacker, target);
  assert.equal(attacker.statuses.spear, undefined);
  assert.equal(target.noSkillNext, 2, 'EVA13_SPEAR_LOCK_TURNS, guaranteed since eva3 is active');
});

test('onAttackConsumeSpear: no-op against a dead target (still clears the flag)', () => {
  const attacker = mkPlayer({ hp: 3, statuses: { spear: 1 } });
  const dead = mkPlayer({ characterId: 'tohno', alive: false });
  eva13.onAttackConsumeSpear(engine, attacker, dead);
  assert.equal(attacker.statuses.spear, undefined);
  assert.equal(dead.noSkillNext || 0, 0);
});

test('onRoundStartRegen: regenerates 1 RS-Hopper charge every EVA13_RSHOPPER_REGEN_TURNS(3) rounds, caps at EVA13_RSHOPPER_MAX(3)', () => {
  const p = mkPlayer({ statuses: { rsHopper: 1 } });
  eva13.onRoundStartRegen(engine, p);
  eva13.onRoundStartRegen(engine, p);
  assert.equal(p.statuses.rsHopper, 1, 'not yet at threshold');
  eva13.onRoundStartRegen(engine, p);
  assert.equal(p.statuses.rsHopper, 2, 'threshold hit -> +1 charge, timer resets');

  const full = mkPlayer({ statuses: { rsHopper: 3 } });
  eva13.onRoundStartRegen(engine, full);
  assert.equal(full.rsHopperRegenTimer || 0, 0, 'already at the cap — does not even start the timer');
});
