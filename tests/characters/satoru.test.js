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
    id, name: id, alive: true, characterId: 'satoru', hp: 5, armor: 2, shield: 0, tempHp: 0,
    skillPoints: 4, statuses: {}, statusAmt: {}, seen: {}, cutsceneShown: {}, dmgHp: 0, dmgArmor: 0,
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

test('onTargeted: on cooldown, does not negate', () => {
  const satoruP = mkPlayer({ wouGuardCd: 1, skillPoints: 3 });
  const attacker = mkPlayer({ characterId: 'tohno' });
  const result = satoru.onTargeted(engine, satoruP, attacker, 'สกิลทดสอบ ');
  assert.equal(result.negated, false);
  assert.equal(satoruP.wouGuardCd, 1);
});

test('onTargeted: self-targeting never negates', () => {
  const satoruP = mkPlayer({ wouGuardCd: 0 });
  const result = satoru.onTargeted(engine, satoruP, satoruP, 'สกิลทดสอบ ');
  assert.equal(result.negated, false);
});

test('onTargeted: passiveSealed suppresses the negate and Wonder of U', () => {
  const satoruP = mkPlayer({ wouGuardCd: 0, skillPoints: 10 });
  const attacker = mkPlayer({ characterId: 'tohno' });
  const sealedEngine = Object.assign(Object.create(engine), { passiveSealed: () => true });
  const result = satoru.onTargeted(sealedEngine, satoruP, attacker, 'การโจมตี');
  assert.equal(result.negated, false);
  assert.equal(satoruP.wouGuardCd, 0);
  assert.equal(satoruP.skillPoints, 10);
  assert.equal(attacker.statuses.calamity || 0, 0);
});

test('maybeWonderOfU: spends 8, applies unresistable Calamity, and deals 1 on attacks', () => {
  const satoruP = mkPlayer({ skillPoints: 10 });
  const attacker = mkPlayer({ characterId: 'tohno', statuses: { resist: 1 }, armor: 2 });
  satoru.maybeWonderOfU(engine, satoruP, attacker, { attack: true });
  assert.equal(satoruP.skillPoints, 2);
  assert.equal(attacker.statusAmt.calamity, 1);
  assert.equal(attacker.statuses.calamity > 0, true);
  assert.equal(attacker.armor, 1);
});

test('maybeWonderOfU: does not fire below the skill-point cost', () => {
  const satoruP = mkPlayer({ skillPoints: 7 });
  const attacker = mkPlayer({ characterId: 'tohno' });
  satoru.maybeWonderOfU(engine, satoruP, attacker, { attack: true });
  assert.equal(satoruP.skillPoints, 7);
  assert.equal(attacker.statuses.calamity || 0, 0);
  assert.equal(attacker.armor, 2);
});

test('applyCalamity: stacks up to CALAMITY_MAX(3) and ignores resist', () => {
  const v = mkPlayer({ characterId: 'tohno', statuses: { resist: 1 } });
  assert.equal(satoru.applyCalamity(engine, v), true);
  assert.equal(v.statusAmt.calamity, 1);
  satoru.applyCalamity(engine, v);
  satoru.applyCalamity(engine, v);
  satoru.applyCalamity(engine, v);
  assert.equal(v.statusAmt.calamity, 3);
});

test('prepareObladaTarget: rejects self-target and dead targets, accepts a valid other player', () => {
  const p = mkPlayer();
  const other = mkPlayer({ characterId: 'nanaya' });
  const dead = mkPlayer({ characterId: 'tohno', alive: false });
  assert.equal(satoru.prepareObladaTarget(engine, p, [p.id]), null);
  assert.equal(satoru.prepareObladaTarget(engine, p, [dead.id]), null);
  assert.equal(satoru.prepareObladaTarget(engine, p, [other.id]), other);
});

test('applyObladaEffect: Do Do Do applies 4-turn ObLa and 4-turn spellburden', () => {
  const p = mkPlayer();
  const target = mkPlayer({ characterId: 'nanaya' });
  satoru.applyObladaEffect(engine, p, target, 'Do Do Do, De Da Da Da');
  assert.equal(target.statuses.oblada, 4);
  assert.equal(target.statuses.spellburden, 4);
  assert.equal(target.statusAmt.spellburden, 1);
});

test('applyPassiveAttack: normal attack applies only ObLa', () => {
  const p = mkPlayer();
  const target = mkPlayer({ characterId: 'nanaya' });
  assert.equal(satoru.applyPassiveAttack(engine, p, target), true);
  assert.equal(target.statuses.oblada, 4);
  assert.equal(target.statuses.spellburden || 0, 0);
});

test('prepareLocaTarget: Locacaca is self-only', () => {
  const p = mkPlayer();
  const target = mkPlayer({ characterId: 'nanaya' });
  assert.equal(satoru.prepareLocaTarget(engine, p, []), p);
  assert.equal(satoru.prepareLocaTarget(engine, p, [p.id]), p);
  assert.equal(satoru.prepareLocaTarget(engine, p, [target.id]), null);
});

test('applyLocaEffect: using it on self heals to full, -1 max HP, +LOCA_SELF_POINTS skill', () => {
  const p = mkPlayer({ hp: 1 });
  const before = engine.maxHpOf(p);
  const suffix = satoru.applyLocaEffect(engine, p, p);
  assert.equal(p.maxHpPenalty, 1);
  assert.equal(engine.maxHpOf(p), before - 1);
  assert.equal(p.hp, engine.maxHpOf(p));
  assert.equal(p.skillPoints, 7);
  assert.match(suffix, /กินเอง/);
});