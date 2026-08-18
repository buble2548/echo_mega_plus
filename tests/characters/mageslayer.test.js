// Direct unit tests for characters/mageslayer.js — Witch Mark energy-steal math, dodge-steal, mark move,
// Mana Rupture damage tiers (incl. the Bard 2-turn stun special case), Mana Burden + Bard uncleansable
// exception, Song's Curse (addSkill gate on the engine itself), and Fury stack all-at-once consumption.
const test = require('node:test');
const assert = require('node:assert/strict');
const { engine } = require('../../server.js');
const mageslayer = require('../../characters/mageslayer.js');

test.beforeEach(() => {
  for (const k of Object.keys(engine.players)) delete engine.players[k];
});

let uid = 0;
function mkPlayer(over = {}) {
  const id = `p${++uid}`;
  const p = Object.assign({
    id, name: id, alive: true, characterId: 'mageslayer', hp: 5, armor: 2, skillPoints: 4,
    statuses: {}, statusAmt: {}, cutsceneShown: {}, seen: {},
    mageslayerMarkedId: null, mageslayerHasMarked: false,
  }, over);
  engine.players[id] = p;
  return p;
}

test('Song\'s Curse: engine.addSkill() is a permanent no-op for mageslayer (any amount, any source)', () => {
  const p = mkPlayer({ skillPoints: 2 });
  engine.addSkill(p, 5);
  assert.equal(p.skillPoints, 2, 'no regen from the shared addSkill() choke point');
});

test('stealEnergy: direct-assignment transfer bypasses Song\'s Curse (target loses, attacker gains, clamped to what target has)', () => {
  const ms = mkPlayer({ skillPoints: 0 });
  const target = mkPlayer({ characterId: 'tohno', skillPoints: 3 });
  const stolen = mageslayer.stealEnergy(engine, ms, target, 4);
  assert.equal(stolen, 3, 'clamped to what target actually had');
  assert.equal(target.skillPoints, 0);
  assert.equal(ms.skillPoints, 3, 'direct assignment — reaches mageslayer despite Song\'s Curse');
});

test('onAttackPostDamage: steals energy clamped to [1,4] based on damage dealt', () => {
  const ms = mkPlayer({ skillPoints: 0 });
  const target = mkPlayer({ characterId: 'tohno', skillPoints: 10 });
  mageslayer.onAttackPostDamage(engine, ms, target, 2); // dmg=2 -> steal 2
  assert.equal(ms.skillPoints, 2);
  assert.equal(target.skillPoints, 8);
});

test('onAttackPostDamage: damage below 1 still steals a minimum of 1', () => {
  const ms = mkPlayer({ skillPoints: 0 });
  const target = mkPlayer({ characterId: 'tohno', skillPoints: 10 });
  mageslayer.onAttackPostDamage(engine, ms, target, 0);
  assert.equal(ms.skillPoints, 1, 'min 1 even at 0 damage');
});

test('onAttackPostDamage: damage above 4 is capped at stealing 4', () => {
  const ms = mkPlayer({ skillPoints: 0 });
  const target = mkPlayer({ characterId: 'tohno', skillPoints: 10 });
  mageslayer.onAttackPostDamage(engine, ms, target, 9);
  assert.equal(ms.skillPoints, 4, 'max 4 even at 9 damage');
});

test('onAttackPostDamage: target at 0 energy BEFORE the steal gets sealed 2 turns (checked before the steal itself)', () => {
  const ms = mkPlayer({ skillPoints: 0 });
  const target = mkPlayer({ characterId: 'tohno', skillPoints: 0 });
  mageslayer.onAttackPostDamage(engine, ms, target, 3);
  assert.equal(target.statuses.manaSeal, 2);
  assert.equal(target.skillPoints, 0, 'nothing to steal — steal is a no-op');
});

test('onAttackPostDamage: target with energy > 0 before the hit does not get sealed even if the steal drains them to 0', () => {
  const ms = mkPlayer({ skillPoints: 0 });
  const target = mkPlayer({ characterId: 'tohno', skillPoints: 1 });
  mageslayer.onAttackPostDamage(engine, ms, target, 3);
  assert.equal(target.statuses.manaSeal || 0, 0, 'had energy before the hit — seal check happens pre-steal');
});

test('onAttackPostDamage: consumes all Fury stacks at once — heals attacker by the stack count and clears it', () => {
  const ms = mkPlayer({ skillPoints: 0, hp: 3, statuses: { mageslayerFury: 3 } });
  const target = mkPlayer({ characterId: 'tohno', skillPoints: 10 });
  mageslayer.onAttackPostDamage(engine, ms, target, 2);
  assert.equal(ms.hp, 6, 'healed by 3 (all stacks used at once)');
  assert.equal(ms.statuses.mageslayerFury || 0, 0, 'stack fully cleared, not decremented by 1');
});

test('onAttackDodgeSteal: target dodging the attack still gets 1 energy stolen', () => {
  const ms = mkPlayer({ skillPoints: 0 });
  const target = mkPlayer({ characterId: 'tohno', skillPoints: 5 });
  mageslayer.onAttackDodgeSteal(engine, ms, target);
  assert.equal(ms.skillPoints, 1);
  assert.equal(target.skillPoints, 4);
});

test('onAttackDodgeSteal: no-op for non-mageslayer attackers', () => {
  const other = mkPlayer({ characterId: 'tohno', skillPoints: 0 });
  const target = mkPlayer({ characterId: 'riddhe', skillPoints: 5 });
  mageslayer.onAttackDodgeSteal(engine, other, target);
  assert.equal(target.skillPoints, 5);
});

test('applyWitchMark: marks the target, records mageslayerMarkedId, sets mageslayerHasMarked permanently', () => {
  const ms = mkPlayer();
  const t = mkPlayer({ characterId: 'tohno' });
  mageslayer.applyWitchMark(engine, ms, t);
  assert.equal(t.statuses.mageslayerMark, 999);
  assert.equal(ms.mageslayerMarkedId, t.id);
  assert.equal(ms.mageslayerHasMarked, true);
});

test('applyWitchMark: casting again moves the mark — clears it from the old target first', () => {
  const ms = mkPlayer();
  const t1 = mkPlayer({ characterId: 'tohno' });
  const t2 = mkPlayer({ characterId: 'riddhe' });
  mageslayer.applyWitchMark(engine, ms, t1);
  mageslayer.applyWitchMark(engine, ms, t2);
  assert.equal(t1.statuses.mageslayerMark || 0, 0, 'old target unmarked');
  assert.equal(t2.statuses.mageslayerMark, 999);
  assert.equal(ms.mageslayerMarkedId, t2.id);
});

test('applyWitchMark: a resisted target is not marked (mageslayerMarkedId stays unset)', () => {
  const ms = mkPlayer();
  const t = mkPlayer({ characterId: 'tohno', statuses: { resist: 1 } });
  mageslayer.applyWitchMark(engine, ms, t);
  assert.equal(t.statuses.mageslayerMark || 0, 0);
  assert.equal(ms.mageslayerMarkedId, null);
});

test('onTargetUsedSkill: marked target has a chance to be drained 1 energy (force via Math.random stub)', () => {
  const ms = mkPlayer({ skillPoints: 0 });
  const t = mkPlayer({ characterId: 'tohno', skillPoints: 3 });
  mageslayer.applyWitchMark(engine, ms, t);
  const orig = Math.random;
  Math.random = () => 0; // force the 35% roll to succeed
  try {
    mageslayer.onTargetUsedSkill(engine, t);
  } finally {
    Math.random = orig;
  }
  assert.equal(t.skillPoints, 2);
  assert.equal(ms.skillPoints, 1);
});

test('onTargetUsedSkill: marked target with 0 energy gets sealed instead of drained (on a successful roll)', () => {
  const ms = mkPlayer({ skillPoints: 0 });
  const t = mkPlayer({ characterId: 'tohno', skillPoints: 0 });
  mageslayer.applyWitchMark(engine, ms, t);
  const orig = Math.random;
  Math.random = () => 0;
  try {
    mageslayer.onTargetUsedSkill(engine, t);
  } finally {
    Math.random = orig;
  }
  assert.equal(t.statuses.manaSeal, 2);
});

test('onBustOrLoseRoll: 35% chance to gain 1 Fury stack, capped at 3, no-op for non-mageslayer', () => {
  const ms = mkPlayer({ statuses: { mageslayerFury: 2 } });
  const orig = Math.random;
  Math.random = () => 0;
  try {
    mageslayer.onBustOrLoseRoll(engine, ms);
    assert.equal(ms.statuses.mageslayerFury, 3);
    mageslayer.onBustOrLoseRoll(engine, ms);
    assert.equal(ms.statuses.mageslayerFury, 3, 'capped at 3');
  } finally {
    Math.random = orig;
  }
  const other = mkPlayer({ characterId: 'tohno' });
  mageslayer.onBustOrLoseRoll(engine, other);
  assert.equal(other.statuses.mageslayerFury || 0, 0);
});

test('resolveManaRupture: damage tiers by target energy — 7-8=1, 3-6=3, 1-2=5, 0=5+stun(1, or 2 vs Bard)', () => {
  const caster = mkPlayer({ skillPoints: 0 });
  const t1 = mkPlayer({ characterId: 'tohno', hp: 10, armor: 0, skillPoints: 8 });
  mageslayer.resolveManaRupture(engine, caster, t1);
  assert.equal(t1.hp, 9, 'tier 7-8 -> 1 damage');

  const t2 = mkPlayer({ characterId: 'tohno', hp: 10, armor: 0, skillPoints: 5 });
  mageslayer.resolveManaRupture(engine, caster, t2);
  assert.equal(t2.hp, 7, 'tier 3-6 -> 3 damage');

  const t3 = mkPlayer({ characterId: 'tohno', hp: 10, armor: 0, skillPoints: 2 });
  mageslayer.resolveManaRupture(engine, caster, t3);
  assert.equal(t3.hp, 5, 'tier 1-2 -> 5 damage');

  const t4 = mkPlayer({ characterId: 'tohno', hp: 10, armor: 0, skillPoints: 0 });
  mageslayer.resolveManaRupture(engine, caster, t4);
  assert.equal(t4.hp, 5, 'tier 0 -> 5 damage');
  assert.equal(t4.statuses.stun, 1, 'non-bard: stun 1 turn');

  const bard = mkPlayer({ characterId: 'bard', hp: 10, armor: 0, skillPoints: 0 });
  mageslayer.resolveManaRupture(engine, caster, bard);
  assert.equal(bard.hp, 5);
  assert.equal(bard.statuses.stun, 2, 'bard special case: stun 2 turns');
});

test('resolveManaRupture: caster always gains +2 energy, bypassing Song\'s Curse (direct assignment)', () => {
  const caster = mkPlayer({ skillPoints: 0 });
  const t = mkPlayer({ characterId: 'tohno', hp: 10, armor: 0, skillPoints: 5 });
  mageslayer.resolveManaRupture(engine, caster, t);
  assert.equal(caster.skillPoints, 2);
});

test('applyManaBurden: every alive player (including the caster) gains +1 spellburden stack, 5 turns, resist blocks it', () => {
  const caster = mkPlayer();
  const ally = mkPlayer({ characterId: 'tohno' });
  const resistant = mkPlayer({ characterId: 'riddhe', statuses: { resist: 1 } });
  mageslayer.applyManaBurden(engine, caster);
  assert.equal(caster.statuses.spellburden, 5);
  assert.equal(caster.statusAmt.spellburden, 1);
  assert.equal(ally.statuses.spellburden, 5);
  assert.equal(ally.statusAmt.spellburden, 1);
  assert.equal(resistant.statuses.spellburden || 0, 0, 'resist blocks Mana Burden entirely');
});

test('applyManaBurden: a Bard currently marked by this player\'s Witch Mark gets mageslayerLockedBurden set', () => {
  const caster = mkPlayer();
  const bard = mkPlayer({ characterId: 'bard' });
  mageslayer.applyWitchMark(engine, caster, bard);
  mageslayer.applyManaBurden(engine, caster);
  assert.equal(bard.mageslayerLockedBurden, true);
});

test('applyManaBurden: an unmarked Bard does not get the uncleansable lock', () => {
  const caster = mkPlayer();
  const bard = mkPlayer({ characterId: 'bard' });
  mageslayer.applyManaBurden(engine, caster);
  assert.equal(bard.mageslayerLockedBurden || false, false);
});

test('cleanseDebuffs: spellburden survives cleanse when mageslayerLockedBurden is set, even though resist normally clears it', () => {
  const universal = require('../../characters/_universal_status.js');
  const bard = mkPlayer({ characterId: 'bard', statuses: { spellburden: 5, resist: 1 }, statusAmt: { spellburden: 1 }, mageslayerLockedBurden: true });
  universal.cleanseDebuffs(bard);
  assert.equal(bard.statuses.spellburden, 5, 'locked — survives cleanse despite being in BASIC_DEBUFF_CLEAR');
});

test('cleanseDebuffs: without the lock, spellburden clears normally', () => {
  const universal = require('../../characters/_universal_status.js');
  const bard = mkPlayer({ characterId: 'bard', statuses: { spellburden: 5, resist: 1 }, statusAmt: { spellburden: 1 } });
  universal.cleanseDebuffs(bard);
  assert.equal(bard.statuses.spellburden || 0, 0);
});

test('damageBonus: +1 vs a target with more energy than the attacker, plus the full Fury stack count', () => {
  const ms = mkPlayer({ skillPoints: 2, statuses: { mageslayerFury: 2 } });
  const target = mkPlayer({ characterId: 'tohno', skillPoints: 5 });
  assert.equal(mageslayer.damageBonus(engine, ms, target), 3, '+1 song bonus + 2 fury stacks');
  const lowEnergyTarget = mkPlayer({ characterId: 'tohno', skillPoints: 0 });
  assert.equal(mageslayer.damageBonus(engine, ms, lowEnergyTarget), 2, 'no song bonus, just 2 fury stacks');
  assert.equal(mageslayer.damageBonus(engine, mkPlayer({ characterId: 'tohno' }), target), 0, 'zero for non-mageslayer attackers');
});
