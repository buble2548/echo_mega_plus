// Direct unit tests for characters/hakuno.js — the gender-swap stat-cap system and MOON*CELL
// (which globally clears/suppresses every other player's buffs/debuffs/passives) had zero
// direct test coverage before this file; only its damage-formula terms were exercised indirectly.
const test = require('node:test');
const assert = require('node:assert/strict');
const { engine } = require('../../server.js');
const hakuno = require('../../characters/hakuno.js');

test.beforeEach(() => {
  for (const k of Object.keys(engine.players)) delete engine.players[k];
});

let uid = 0;
function mkPlayer(over = {}) {
  const id = `p${++uid}`;
  const p = Object.assign({
    id, name: id, alive: true, characterId: 'hakuno', hakunoGender: 'female',
    hp: 5, armor: 2, cards: [], statuses: {}, statusAmt: {}, cutsceneShown: {},
    colorTrigger: { red: 0, blue: 0, green: 0, yellow: 0 }, // จำเป็นสำหรับทดสอบสกิลที่จั่วการ์ดจริงจากกองกลาง (drawToScore/onCardDrawn)
  }, over);
  engine.players[id] = p;
  return p;
}

test('damageBonus: male form gives +1 atk (unless MOON*CELL is active), MOON*CELL gives +1 for either form', () => {
  const male = mkPlayer({ hakunoGender: 'male' });
  const ctx1 = {};
  assert.equal(hakuno.damageBonus(engine, male, mkPlayer({ characterId: 'tohno' }), ctx1), 1);
  assert.equal(ctx1.hakunoMaleAtk, 1);
  assert.equal(ctx1.hakunoMoonAtk, 0);

  const female = mkPlayer({ hakunoGender: 'female' });
  assert.equal(hakuno.damageBonus(engine, female, mkPlayer({ characterId: 'tohno' }), {}), 0);

  const maleMoon = mkPlayer({ hakunoGender: 'male', statuses: { moonCell: 3 } });
  const ctx2 = {};
  assert.equal(hakuno.damageBonus(engine, maleMoon, mkPlayer({ characterId: 'tohno' }), ctx2), 1, 'MOON*CELL replaces the male bonus, does not stack with it');
  assert.equal(ctx2.hakunoMaleAtk, 0);
  assert.equal(ctx2.hakunoMoonAtk, 1);
});

test('onRoundStartRest: male form heals +1 every HAKUNO_MALE_REST_TURNS(2) rounds, female form is untouched', () => {
  const p = mkPlayer({ hakunoGender: 'male', hp: 3 });
  hakuno.onRoundStartRest(engine, p);
  assert.equal(p.hakunoRestTurn, 1);
  assert.equal(p.hp, 3, 'not yet at the threshold');

  hakuno.onRoundStartRest(engine, p);
  assert.equal(p.hakunoRestTurn, 0, 'threshold hit -> counter resets');
  assert.equal(p.hp, 4);

  const f = mkPlayer({ hakunoGender: 'female', hp: 3 });
  hakuno.onRoundStartRest(engine, f);
  assert.equal(f.hakunoRestTurn || 0, 0, 'female form never ticks the male rest counter');
  assert.equal(f.hp, 3);
});

test('applyGenderSwitch: flips gender and clamps hp/armor down to the new form\'s cap (never heals on switch)', () => {
  const p = mkPlayer({ hakunoGender: 'female', hp: 5, armor: 3 }); // female cap: hp 5 / armor 3
  hakuno.applyGenderSwitch(engine, p);
  assert.equal(p.hakunoGender, 'male');
  assert.equal(p.hakunoGenderSwitched, true);
  assert.equal(engine.maxHpOf(p), 6, 'male hp cap');
  assert.equal(p.hp, 5, 'hp carries over unchanged since it was already under the new cap');

  const over = mkPlayer({ hakunoGender: 'male', hp: 6, armor: 2 }); // male cap: hp 6 / armor 2
  hakuno.applyGenderSwitch(engine, over);
  assert.equal(over.hakunoGender, 'female');
  assert.equal(engine.maxHpOf(over), 5, 'female hp cap');
  assert.equal(over.hp, 5, 'clamped down to the new lower cap, not healed');
});

test('applyInvertCharge / applyNoRegenCharge: both accumulate hakunoMoonPoints toward HAKUNO_MOONCELL_NEED(3)', () => {
  const male = mkPlayer({ hakunoGender: 'male' });
  hakuno.applyInvertCharge(engine, male);
  assert.equal(male.hakunoMoonPoints, 1);
  hakuno.applyInvertCharge(engine, male);
  assert.equal(male.hakunoMoonPoints, 2);

  // แต้ม 19 ตอนนี้มาจากการจั่วการ์ดจริงจากกองกลาง (ไม่ใช่ cardBonus ลอยๆ อีกต่อไป) — ต้องเตรียมกองกลางให้มีใบที่ต้องการ (4) ไว้ให้จั่ว
  const female = mkPlayer({ hakunoGender: 'female', cards: [{ value: 10 }, { value: 5 }] }); // score 15, not yet 19
  engine.setCentralDeck([{ value: 4, color: 'red' }]);
  hakuno.applyNoRegenCharge(engine, female);
  assert.equal(female.hakunoMoonPoints, 1);
  assert.equal(female.hakunoLowDraw, true);
  assert.equal(engine.scoreOf(female), 19, 'card score reaches 19 by drawing a real card from the central deck');
  assert.equal(engine.centralDeck.length, 0, 'the needed card was actually drawn from the shared deck');
});

test('applyMoonCellCast: consumes HAKUNO_MOONCELL_NEED(3) moon points, clears everyone else\'s statuses (backed up), leaves caster untouched', () => {
  const p = mkPlayer({ hakunoGender: 'female', hakunoMoonPoints: 3 });
  const other = mkPlayer({ characterId: 'tohno', statuses: { discord: 2 }, statusAmt: { discord: 1 } });
  hakuno.applyMoonCellCast(engine, p);
  assert.equal(p.hakunoMoonPoints, 0);
  assert.equal(p.statuses.moonCell, 5, 'HAKUNO_MOONCELL_TURNS');
  assert.deepEqual(other.statuses, {}, 'other players get wiped');
  assert.deepEqual(other.moonCellBackup.statuses, { discord: 2 }, 'but their prior state is backed up for restore later');
});

test('onAttackConsumeInvert: applies invert to a fresh target, refuses to refresh an already-inverted one, always clears the ready flag', () => {
  const attacker = mkPlayer({ hakunoGender: 'male', statuses: { hakunoInvertReady: 1 } });
  const target = mkPlayer({ characterId: 'tohno' });
  hakuno.onAttackConsumeInvert(engine, attacker, target);
  assert.equal(attacker.statuses.hakunoInvertReady, undefined);
  assert.equal(target.statuses.invert, 3);

  const attacker2 = mkPlayer({ hakunoGender: 'male', statuses: { hakunoInvertReady: 1 } });
  const alreadyInverted = mkPlayer({ characterId: 'tohno', statuses: { invert: 1 } });
  hakuno.onAttackConsumeInvert(engine, attacker2, alreadyInverted);
  assert.equal(alreadyInverted.statuses.invert, 1, 'no refresh — wasted');
});

test('onAttackConsumeInvert: no-op against an already-dead target (but still clears the ready flag)', () => {
  const attacker = mkPlayer({ hakunoGender: 'male', statuses: { hakunoInvertReady: 1 } });
  const dead = mkPlayer({ characterId: 'tohno', alive: false });
  hakuno.onAttackConsumeInvert(engine, attacker, dead);
  assert.equal(attacker.statuses.hakunoInvertReady, undefined);
  assert.equal(dead.statuses.invert || 0, 0);
});

test('onAttackConsumeNoRegen: applies decay (armor won\'t regen) + nohealing to the target, clears the ready flag', () => {
  const attacker = mkPlayer({ hakunoGender: 'female', statuses: { hakunoNoRegenReady: 1 } });
  const target = mkPlayer({ characterId: 'tohno' });
  hakuno.onAttackConsumeNoRegen(engine, attacker, target);
  assert.equal(attacker.statuses.hakunoNoRegenReady, undefined);
  assert.equal(target.statuses.decay, 3);
  assert.equal(target.statuses.nohealing, 3);
});

test('onAttackConsumeNoRegen: resist blocks decay + nohealing entirely, still clears the ready flag', () => {
  const attacker = mkPlayer({ hakunoGender: 'female', statuses: { hakunoNoRegenReady: 1 } });
  const target = mkPlayer({ characterId: 'tohno', statuses: { resist: 1 } });
  hakuno.onAttackConsumeNoRegen(engine, attacker, target);
  assert.equal(attacker.statuses.hakunoNoRegenReady, undefined);
  assert.equal(target.statuses.decay || 0, 0);
  assert.equal(target.statuses.nohealing || 0, 0);
});

test('onAttackConsumeInvert: resist blocks invert entirely, still clears the ready flag', () => {
  const attacker = mkPlayer({ hakunoGender: 'male', statuses: { hakunoInvertReady: 1 } });
  const target = mkPlayer({ characterId: 'tohno', statuses: { resist: 1 } });
  hakuno.onAttackConsumeInvert(engine, attacker, target);
  assert.equal(attacker.statuses.hakunoInvertReady, undefined);
  assert.equal(target.statuses.invert || 0, 0);
});

test('applyCommandSpell: cmd 1 fills skill points, cmd 2 heals full, else forces card score to 21', () => {
  const p1 = mkPlayer({ skillPoints: 0 });
  assert.match(hakuno.applyCommandSpell(engine, p1, 1), /เติมแต้มสกิลเต็ม/);
  assert.equal(p1.skillPoints, engine.maxSkillOf(p1));

  const p2 = mkPlayer({ hp: 1 });
  assert.match(hakuno.applyCommandSpell(engine, p2, 2), /ฟื้นพลังชีวิตเต็ม/);
  assert.equal(p2.hp, engine.maxHpOf(p2));

  // แต้ม 21 ตอนนี้มาจากการจั่วการ์ดจริงจากกองกลาง — เตรียมใบที่ต้องการ (6) ไว้ให้จั่ว
  const p3 = mkPlayer({ cards: [{ value: 10 }, { value: 5 }] });
  engine.setCentralDeck([{ value: 6, color: 'blue' }]);
  assert.match(hakuno.applyCommandSpell(engine, p3, 3), /21/);
  assert.equal(engine.scoreOf(p3), 21);
});
