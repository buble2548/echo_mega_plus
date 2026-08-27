const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const escanor = require('../../characters/escanor.js');
const universal = require('../../characters/_universal_status.js');
const escanorCharacter = require('../../characters.js').CHARACTERS.find((entry) => entry.id === 'escanor');

function mkPlayer(over = {}) {
  return Object.assign({
    id: 'p1', name: 'Escanor', characterId: 'escanor', alive: true,
    hp: 7, armor: 3, skillPoints: 0, gold: 0,
    statuses: {}, statusAmt: {}, inventory: [], cutsceneShown: {},
    escanorCharge: 0, escanorForcedMorning: 0, escanorLastStandUsed: false,
  }, over);
}

function mkTarget(id, over = {}) {
  return Object.assign({ id, name: id, alive: true, hp: 3, armor: 0, statuses: {}, statusAmt: {} }, over);
}

function mkEngine(players, over = {}) {
  const logs = [];
  const cutscenes = [];
  const damageCalls = [];
  const engine = Object.assign({
    players,
    CHAR_BY_ID: { escanor: escanorCharacter },
    roundNumber: 1,
    GOLD_MAX: 30,
    addGold: (p, n) => { const before = p.gold || 0; p.gold = Math.min(30, before + n); return p.gold - before; },
    logs,
    cutscenes,
    damageCalls,
    log: (msg) => logs.push(msg),
    isNightRound: () => false,
    addSkill(p, n) { p.skillPoints = Math.min(8, (p.skillPoints || 0) + n); },
    dealMixed(target, n, isNormalAttack) {
      damageCalls.push({ targetId: target.id, amount: n, isNormalAttack: !!isNormalAttack });
      for (let i = 0; i < n; i++) {
        if (target.armor > 0) target.armor -= 1;
        else target.hp -= 1;
      }
    },
    resolveDamageAftermath(target) {
      if (target.alive && target.hp <= 0) engine.instantDeath(target);
    },
    healHp(p, n) { p.hp = Math.min(escanor.maxHp(p) || 7, p.hp + n); },
    loseHp(p) { p.hp -= 1; },
    instantDeath(p) {
      if (!escanor.tryNoonRevive(engine, p)) {
        p.hp = 0;
        p.alive = false;
      }
    },
    triggerCutscene(p, key) {
      p.cutsceneShown = p.cutsceneShown || {};
      if (!p.cutsceneShown[key]) {
        p.cutsceneShown[key] = true;
        cutscenes.push(key);
      }
    },
    applyDebuff(target, key, turns) { target.statuses[key] = turns; return true; },
    resistActive: () => false,
    friendlyEffectBlocked: () => false,
  }, over);
  return engine;
}

test('round start uses engine.isNightRound when dayTime is not provided', () => {
  const p = mkPlayer();
  const engine = mkEngine({ p1: p }, { isNightRound: () => false });
  escanor.onRoundStartTick(engine, p);
  assert.equal(escanor.formOf(p), 'morning');
  assert.equal(p.escanorCharge, 1);

  const night = mkPlayer();
  const nightEngine = mkEngine({ p1: night }, { isNightRound: () => true });
  escanor.onRoundStartTick(nightEngine, night);
  assert.equal(escanor.formOf(night), 'night');
  assert.equal(night.skillPoints, 1);
});

test('Noon does not change form until charge reaches zero', () => {
  const p = mkPlayer({
    didAttackRound: true,
    escanorCharge: 2,
    escanorForcedMorning: 1,
    statuses: { escanorNoon: 999, escanorSolar: 2 },
    statusAmt: { escanorNoon: 1, escanorSolar: 2 },
  });
  const engine = mkEngine({ p1: p }, { isNightRound: () => true });

  escanor.onRoundStartTick(engine, p);
  assert.equal(escanor.formOf(p), 'noon');
  assert.equal(p.escanorCharge, 2);

  escanor.onEndTurnSolar(engine, p);
  assert.equal(escanor.formOf(p), 'noon');
  assert.equal(p.escanorCharge, 1);
  assert.equal(p.statuses.escanorSolar, 2, 'Noon must pause Eternal Sunshine Solar drain');

  escanor.onEndTurnSolar(engine, p);
  assert.equal(p.escanorCharge, 0);
  assert.equal(escanor.formOf(p), 'morning', 'forced Morning may start only after Noon charge is zero');
  assert.equal(p.statuses.escanorSolar, 1);
});

test('Noon charge loses one from skill damage at most once per turn and exits immediately at zero', () => {
  const p = mkPlayer({ escanorCharge: 2, statuses: { escanorNoon: 999 }, statusAmt: { escanorNoon: 1 } });
  const engine = mkEngine({ p1: p }, { roundNumber: 7, isNightRound: () => true });

  assert.equal(escanor.adjustIncomingDamage(engine, p, 2, false), 2);
  assert.equal(p.escanorCharge, 1);
  escanor.adjustIncomingDamage(engine, p, 3, false);
  assert.equal(p.escanorCharge, 1, 'second skill hit in the same turn must not drain charge');

  engine.roundNumber = 8;
  escanor.adjustIncomingDamage(engine, p, 1, false);
  assert.equal(p.escanorCharge, 0);
  assert.equal(escanor.formOf(p), 'night');
});

test('fully mitigated skill damage does not drain Noon charge', () => {
  const p = mkPlayer({ escanorCharge: 4, statuses: { escanorNoon: 999, escanorCool: 2 }, statusAmt: { escanorNoon: 1, escanorCool: 2 } });
  const engine = mkEngine({ p1: p }, { roundNumber: 3 });
  const left = 2 - universal.coolReduction(p, false); // เย็นชื่นใจเป็นตัวลดกลาง ทำงานก่อนถึงฮุคของเอสคานอร์
  assert.equal(left, 0);
  assert.equal(escanor.adjustIncomingDamage(engine, p, left, false), 0);
  assert.equal(p.escanorCharge, 4);
});

test('status damage such as burn never drains Noon charge', () => {
  const p = mkPlayer({ escanorCharge: 4, statuses: { escanorNoon: 999 }, statusAmt: { escanorNoon: 1 } });
  const engine = mkEngine({ p1: p }, { roundNumber: 3 });
  p._statusDamage = true;
  assert.equal(escanor.adjustIncomingDamage(engine, p, 1, false), 1);
  assert.equal(p.escanorCharge, 4, 'ลุกไหม้/ดีบัฟไม่ใช่ "ความเสียหายจากสกิล"');
});

test('WineBarrel cool is a universal reduction that skips normal attacks and status damage', () => {
  const p = mkPlayer({ statuses: { escanorCool: 2 }, statusAmt: { escanorCool: 2 } });
  assert.equal(universal.coolReduction(p, true), 0, 'a normal attack is never reduced');
  assert.equal(universal.coolReduction(p, false), 2);
  p._statusDamage = true;
  assert.equal(universal.coolReduction(p, false), 0, 'burn and other status damage is never reduced');
  p._statusDamage = false;

  // ไวน์ถูกขโมยไปใช้ได้ -> ตัวละครอื่นที่ดื่มต้องได้ผลเท่ากัน
  const thief = mkPlayer({ characterId: 'temari', statuses: { escanorCool: 1 }, statusAmt: { escanorCool: 1 } });
  assert.equal(universal.coolReduction(thief, false), 1);
});

test('dynamic costs match normal and Noon skill specifications', () => {
  const ch = require('../../characters.js').CHARACTERS.find((entry) => entry.id === 'escanor');
  const engine = mkEngine({});
  const morning = mkPlayer({ statuses: { escanorMorning: 999 } });
  assert.equal(escanor.dynamicSkillFor(engine, morning, ch, 'basic').cost, 3);
  assert.equal(escanor.dynamicSkillFor(engine, morning, ch, 'secondary').cost, 4);
  assert.equal(escanor.dynamicSkillFor(engine, morning, ch, 'ultimate').cost, 7);

  const noon = mkPlayer({ escanorCharge: 12, statuses: { escanorNoon: 999 } });
  assert.equal(escanor.dynamicSkillFor(engine, noon, ch, 'basic').cost, 3);
  assert.equal(escanor.dynamicSkillFor(engine, noon, ch, 'secondary').cost, 4);
  assert.equal(escanor.dynamicSkillFor(engine, noon, ch, 'ultimate').cost, 8);
});

test('Last Stand has max armor 0 and starts outgoing damage from 0', () => {
  const p = mkPlayer({ statuses: { escanorLastStand: 999 }, statusAmt: { escanorLastStand: 1 } });
  const target = mkTarget('p2');
  const engine = mkEngine({ p1: p, p2: target });
  assert.equal(escanor.maxArmor(p), 0);
  assert.equal(escanor.adjustOutgoingDamage(engine, p, target, 1), 0);

  p.statuses.hburn = 4;
  target.statuses.hburn = 1;
  assert.equal(escanor.adjustOutgoingDamage(engine, p, target, 1), 1);

  p.statuses.escanorSun = 1;
  assert.equal(escanor.adjustOutgoingDamage(engine, p, target, 9), 0);
});

test('Noon secondary self-cost can enter Last Stand and does not leave Noon flare behind', () => {
  const p = mkPlayer({ hp: 1, escanorCharge: 3, statuses: { escanorNoon: 999 }, statusAmt: { escanorNoon: 1 } });
  const engine = mkEngine({ p1: p, p2: mkTarget('p2') });
  escanor.applySkill(engine, p, 'secondary', ['p2']);
  assert.equal(escanor.formOf(p), 'last');
  assert.equal(p.escanorCharge, 0);
  assert.equal(p.hp, 7);
  assert.equal(p.armor, 0);
  assert.equal(p.statuses.escanorFlareNoon || 0, 0);
});

test('Last Stand basic skill resolves after reveal as a random three-target burst', () => {
  const p = mkPlayer({ statuses: { escanorLastStand: 999 }, statusAmt: { escanorLastStand: 1 } });
  const targets = [mkTarget('p2'), mkTarget('p3'), mkTarget('p4'), mkTarget('p5')];
  const players = Object.fromEntries([p, ...targets].map((x) => [x.id, x]));
  const engine = mkEngine(players);

  escanor.applySkill(engine, p, 'basic', []);
  assert.equal(p.statuses.escanorSpearBurst, 1);
  assert.equal(targets.reduce((sum, t) => sum + (3 - t.hp), 0), 0);

  escanor.onAfterResolve(engine);
  const damaged = targets.filter((t) => t.hp === 2);
  assert.equal(damaged.length, 3);
  assert.equal(p.statuses.escanorSpearBurst || 0, 0);
  assert.equal(p.statuses.hburn, 1);
});

test('Solar is granted in any non-Last-Stand form when Escanor loses or does not attack', () => {
  const idle = mkPlayer({ statuses: { escanorMorning: 999 }, statusAmt: { escanorMorning: 1 } });
  escanor.onEndTurnSolar(mkEngine({ p1: idle }), idle);
  assert.equal(idle.statuses.escanorSolar, 1);
  assert.equal(idle.escanorSolarIdle, 0, 'the turn that grants Solar must not count as an idle turn');

  const loser = mkPlayer({ didAttackRound: true, isLoser: true, statuses: { escanorMorning: 999 }, statusAmt: { escanorMorning: 1 } });
  escanor.onEndTurnSolar(mkEngine({ p1: loser }), loser);
  assert.equal(loser.statuses.escanorSolar, 1);

  const winnerWhoAttacked = mkPlayer({ didAttackRound: true, isLoser: false, statuses: { escanorMorning: 999 }, statusAmt: { escanorMorning: 1 } });
  escanor.onEndTurnSolar(mkEngine({ p1: winnerWhoAttacked }), winnerWhoAttacked);
  assert.equal(winnerWhoAttacked.statuses.escanorSolar || 0, 0);

  const nightLoser = mkPlayer({ didAttackRound: true, isLoser: true, statuses: { escanorNight: 999 }, statusAmt: { escanorNight: 1 } });
  escanor.onEndTurnSolar(mkEngine({ p1: nightLoser }, { isNightRound: () => true }), nightLoser);
  assert.equal(nightLoser.statuses.escanorSolar, 1);
});

test('Solar loses one stack for every three turns without receiving more Solar', () => {
  const p = mkPlayer({
    didAttackRound: true,
    statuses: { escanorMorning: 999, escanorSolar: 2 },
    statusAmt: { escanorMorning: 1, escanorSolar: 2 },
  });
  const engine = mkEngine({ p1: p });

  escanor.onEndTurnSolar(engine, p);
  escanor.onEndTurnSolar(engine, p);
  assert.equal(p.statuses.escanorSolar, 2);
  assert.equal(p.escanorSolarIdle, 2);

  escanor.onEndTurnSolar(engine, p);
  assert.equal(p.statuses.escanorSolar, 1);
  assert.equal(p.escanorSolarIdle, 0);

  escanor.onEndTurnSolar(engine, p);
  escanor.onEndTurnSolar(engine, p);
  escanor.onEndTurnSolar(engine, p);
  assert.equal(p.statuses.escanorSolar || 0, 0);
  assert.equal(p.escanorSolarIdle, 0);
});

test('receiving Solar refreshes its three-turn decay timer, including at the stack cap', () => {
  const p = mkPlayer({
    didAttackRound: true,
    statuses: { escanorMorning: 999, escanorSolar: 4 },
    statusAmt: { escanorMorning: 1, escanorSolar: 4 },
    escanorSolarIdle: 2,
  });
  const engine = mkEngine({ p1: p });

  p.isLoser = true;
  escanor.onEndTurnSolar(engine, p);
  assert.equal(p.statuses.escanorSolar, 4);
  assert.equal(p.escanorSolarIdle, 0);

  p.isLoser = false;
  escanor.onEndTurnSolar(engine, p);
  escanor.onEndTurnSolar(engine, p);
  assert.equal(p.statuses.escanorSolar, 4);
  escanor.onEndTurnSolar(engine, p);
  assert.equal(p.statuses.escanorSolar, 3);
});

test('Eternal Sunshine spends one Solar per turn and returns to Night when Solar reaches zero', () => {
  const p = mkPlayer({
    didAttackRound: true,
    statuses: { escanorNight: 999, escanorSolar: 2 },
    statusAmt: { escanorNight: 1, escanorSolar: 2 },
  });
  const engine = mkEngine({ p1: p }, { isNightRound: () => true });
  escanor.applySkill(engine, p, 'ultimate', []);
  assert.equal(escanor.formOf(p), 'morning');
  assert.equal(p.escanorForcedMorning, 1);
  assert.equal(p.statuses.escanorSolar, 2, 'casting must not spend all Solar immediately');

  escanor.onEndTurnSolar(engine, p);
  assert.equal(p.statuses.escanorSolar, 1);
  assert.equal(p.escanorForcedMorning, 1);
  assert.equal(escanor.formOf(p), 'morning');

  escanor.onRoundStartTick(engine, p);
  assert.equal(escanor.formOf(p), 'morning');
  assert.equal(p.escanorForcedMorning, 1);

  escanor.onEndTurnSolar(engine, p);
  assert.equal(p.statuses.escanorSolar || 0, 0);
  assert.equal(p.escanorForcedMorning, 0);
  assert.equal(escanor.formOf(p), 'night');
});

test('Eternal Sunshine leaves Escanor in Morning when Solar reaches zero during daytime', () => {
  const p = mkPlayer({
    didAttackRound: true,
    statuses: { escanorNight: 999, escanorSolar: 1 },
    statusAmt: { escanorNight: 1, escanorSolar: 1 },
  });
  const engine = mkEngine({ p1: p }, { isNightRound: () => false });

  escanor.applySkill(engine, p, 'ultimate', []);
  escanor.onEndTurnSolar(engine, p);

  assert.equal(p.statuses.escanorSolar || 0, 0);
  assert.equal(p.escanorForcedMorning, 0);
  assert.equal(escanor.formOf(p), 'morning');
});

test('server preserves Solar during the generic status countdown', () => {
  const serverText = fs.readFileSync(path.resolve(__dirname, '../../server.js'), 'utf8');
  const persistentStatusRule = serverText.split('\n').find((line) => line.includes('escanorMorning') && line.includes('continue;')) || '';
  assert.match(persistentStatusRule, /escanorSolar/, 'Solar must not be decremented immediately after it is granted');
});

test('Escanor hook leaves WineBarrel durations for the shared status countdown', () => {
  const p = mkPlayer({
    didAttackRound: true,
    isLoser: false,
    statuses: { escanorMorning: 999, drunk: 2, escanorCool: 2 },
    statusAmt: { escanorMorning: 1, drunk: 2, escanorCool: 2 },
  });
  escanor.onEndTurnSolar(mkEngine({ p1: p }), p);
  assert.equal(p.statuses.drunk, 2);
  assert.equal(p.statuses.escanorCool, 2);
});

test('Morning or Noon basic skill hits the selected target', () => {
  const p = mkPlayer({ statuses: { escanorMorning: 999 }, statusAmt: { escanorMorning: 1 } });
  const t1 = mkTarget('p2');
  const t2 = mkTarget('p3');
  const engine = mkEngine({ p1: p, p2: t1, p3: t2 });

  escanor.applySkill(engine, p, 'basic', ['p3']);

  assert.equal(t1.hp, 3);
  assert.equal(t2.hp, 2);
  assert.equal(t2.statuses.hburn, 1);
});

test('Solar fireball requires a valid explicit target and resolves lethal damage immediately', () => {
  const p = mkPlayer({ statuses: { escanorMorning: 999 }, statusAmt: { escanorMorning: 1 } });
  const target = mkTarget('p2', { hp: 1 });
  const engine = mkEngine({ p1: p, p2: target });
  assert.equal(escanor.prepareSkill(engine, p, 'basic', []), null);
  assert.equal(escanor.prepareSkill(engine, p, 'basic', ['p1']), null);
  assert.ok(escanor.prepareSkill(engine, p, 'basic', ['p2']));

  escanor.applySkill(engine, p, 'basic', ['p2']);
  assert.equal(target.alive, false);
  assert.equal(target.hp, 0);
  assert.equal(engine.damageCalls[0].isNormalAttack, false);
});

test('Noon basic costs one HP and applies two burn', () => {
  const p = mkPlayer({ hp: 7, escanorCharge: 6, statuses: { escanorNoon: 999 }, statusAmt: { escanorNoon: 1 } });
  const target = mkTarget('p2');
  const engine = mkEngine({ p1: p, p2: target });
  escanor.applySkill(engine, p, 'basic', ['p2']);
  assert.equal(p.hp, 6);
  assert.equal(target.hp, 2);
  assert.equal(target.statuses.hburn, 2);
});

test('secondary video waits for an attack, plays once per match, and Noon has no damage or skill refund bonus', () => {
  const p = mkPlayer({ hp: 7, skillPoints: 2, escanorCharge: 6, statuses: { escanorNoon: 999 }, statusAmt: { escanorNoon: 1 } });
  const target = mkTarget('p2');
  const engine = mkEngine({ p1: p, p2: target });

  escanor.applySkill(engine, p, 'secondary', []);
  assert.deepEqual(engine.cutscenes, []);
  assert.equal(p.hp, 6);
  assert.equal(escanor.adjustOutgoingDamage(engine, p, target, 1), 2, 'only Noon passive adds attack damage');
  assert.equal(escanor.onAttackLanded(engine, p, target), true);
  assert.deepEqual(engine.cutscenes, ['escanorSecondary1']);
  assert.equal(target.statuses.hburn, 3, 'Noon passive +1 and Noon secondary +2');
  assert.equal(target.statuses.nohealing, 2);
  assert.equal(p.skillPoints, 2);

  p.statuses.escanorFlareNoon = 999;
  assert.equal(escanor.onAttackLanded(engine, p, target), false);
  assert.deepEqual(engine.cutscenes, ['escanorSecondary1']);
});

test('a pending secondary cannot be bought again before Escanor attacks', () => {
  for (const [formStatus, pendingStatus] of [
    ['escanorMorning', 'escanorFlare'],
    ['escanorNoon', 'escanorFlareNoon'],
    ['escanorLastStand', 'escanorPunch'],
  ]) {
    const p = mkPlayer({ escanorCharge: formStatus === 'escanorNoon' ? 3 : 0, statuses: { [formStatus]: 999, [pendingStatus]: 999 } });
    assert.equal(escanor.prepareSkill(mkEngine({ p1: p }), p, 'secondary', []), null, pendingStatus);
  }
});

test('Rhitta applies two burn without attack damage bonus and Noon forces two burn ticks', () => {
  const p = mkPlayer({ escanorCharge: 6, statuses: { escanorNoon: 999 }, statusAmt: { escanorNoon: 1 } });
  const target = mkTarget('p2', { hp: 8 });
  const engine = mkEngine({ p1: p, p2: target });
  escanor.applySkill(engine, p, 'ultimate', []);
  assert.equal(escanor.adjustOutgoingDamage(engine, p, target, 1), 2, 'only Noon passive adds attack damage');
  assert.equal(escanor.onAttackLanded(engine, p, target), true);
  assert.equal(target.statuses.hburn, 1, 'three burn are applied, then two stacks trigger immediately');
  assert.equal(target.hp, 6);
  assert.deepEqual(engine.cutscenes, ['escanorUltimate1']);
});

test('forced burn ticks resolve lethal damage immediately', () => {
  const p = mkPlayer({ escanorCharge: 6, statuses: { escanorNoon: 999, escanorRhitta: 999, escanorRhittaNoon: 999 } });
  const target = mkTarget('p2', { hp: 2 });
  const engine = mkEngine({ p1: p, p2: target });
  escanor.onAttackLanded(engine, p, target);
  assert.equal(target.alive, false);
  assert.equal(target.hp, 0);
});

test('remaining forced burn ticks stop damaging after the target revives into Last Stand', () => {
  const attacker = mkPlayer({ id: 'p1', escanorCharge: 6, statuses: { escanorNoon: 999, escanorRhitta: 999, escanorRhittaNoon: 999 } });
  const target = mkPlayer({ id: 'p2', hp: 1, armor: 0, escanorCharge: 3, statuses: { escanorNoon: 999 } });
  const engine = mkEngine({ p1: attacker, p2: target });
  escanor.onAttackLanded(engine, attacker, target);
  assert.equal(escanor.formOf(target), 'last');
  assert.equal(target.hp, 7, 'the second forced burn tick must respect Last Stand immunity');
});

test('Noon and Last Stand burn the normal attacker immediately', () => {
  const noon = mkPlayer({ escanorCharge: 2, statuses: { escanorNoon: 999 } });
  const attacker = mkTarget('p2');
  const engine = mkEngine({ p1: noon, p2: attacker });
  escanor.onNormalAttackReceived(engine, attacker, noon, 'noon');
  assert.equal(attacker.statuses.hburn, 1);
});

test('Escanor full-screen videos are queued only once per match', () => {
  const p = mkPlayer({ statuses: { escanorMorning: 999 } });
  const target = mkTarget('p2', { hp: 10 });
  const engine = mkEngine({ p1: p, p2: target });
  escanor.applySkill(engine, p, 'basic', ['p2']);
  escanor.applySkill(engine, p, 'basic', ['p2']);
  assert.deepEqual(engine.cutscenes, ['escanorBasic1']);
});

test('Last Stand attack videos play once and its skill damage is not tagged as a normal attack', () => {
  const p = mkPlayer({ statuses: { escanorLastStand: 999, escanorPunch: 999, escanorSun: 999 } });
  const target = mkTarget('p2', { hp: 10 });
  const splash = mkTarget('p3', { hp: 10 });
  const engine = mkEngine({ p1: p, p2: target, p3: splash });
  assert.equal(escanor.onAttackLanded(engine, p, target), true);
  assert.deepEqual(engine.cutscenes, ['escanorSecondary3', 'escanorUltimate3']);
  assert.equal(engine.damageCalls.find((call) => call.targetId === 'p3').isNormalAttack, false);

  p.statuses.escanorPunch = 999;
  p.statuses.escanorSun = 999;
  assert.equal(escanor.onAttackLanded(engine, p, target), false);
  assert.deepEqual(engine.cutscenes, ['escanorSecondary3', 'escanorUltimate3']);
});

test('Last Stand spear burst deals skill damage and can eliminate targets', () => {
  const p = mkPlayer({ statuses: { escanorLastStand: 999 } });
  const targets = [mkTarget('p2', { hp: 1 }), mkTarget('p3', { hp: 1 }), mkTarget('p4', { hp: 1 })];
  const engine = mkEngine(Object.fromEntries([p, ...targets].map((entry) => [entry.id, entry])));
  escanor.applySkill(engine, p, 'basic', []);
  escanor.onAfterResolve(engine);
  assert.equal(targets.every((target) => !target.alive), true);
  assert.equal(engine.damageCalls.every((call) => call.isNormalAttack === false), true);
});

test('Last Stand effects never damage or burn Escanor teammates', () => {
  const p = mkPlayer({ teamId: 'A', statuses: { escanorLastStand: 999 } });
  const teammate = mkTarget('p2', { teamId: 'A', hp: 5 });
  const enemy = mkTarget('p3', { teamId: 'B', hp: 5 });
  const engine = mkEngine({ p1: p, p2: teammate, p3: enemy });
  let source = null;
  engine.withEffectSource = (nextSource, fn) => {
    const previous = source;
    source = nextSource;
    try { return fn(); } finally { source = previous; }
  };
  engine.friendlyEffectBlocked = (target) => !!(source && target.id !== source.id && target.teamId === source.teamId);

  escanor.applySkill(engine, p, 'basic', []);
  escanor.onAfterResolve(engine);
  assert.equal(teammate.hp, 5);
  assert.equal(teammate.statuses.hburn || 0, 0);
  assert.equal(enemy.hp, 4);

  engine.withEffectSource(p, () => escanor.onRoundStartTick(engine, p));
  assert.equal(teammate.statuses.hburn || 0, 0);
  assert.equal(enemy.statuses.hburn, 2, 'Last Stand มอบลุกไหม้ศัตรูทุกคน +2 ต่อเทิร์น');
});

test('Night wine is delivered next turn with a usable uid and upgrades to the correct Roman level', () => {
  const p = mkPlayer({ statuses: { escanorNight: 999 }, statusAmt: { escanorNight: 1 } });
  const engine = mkEngine({ p1: p }, { isNightRound: () => true });
  assert.ok(escanor.prepareSkill(engine, p, 'basic', []));
  escanor.applySkill(engine, p, 'basic', []);
  assert.equal(p.inventory.length, 0);
  assert.equal(p.escanorPendingWine, 1);

  escanor.onRoundStartTick(engine, p);
  assert.equal(p.inventory.length, 1);
  assert.match(p.inventory[0].uid, /^wine_p1_/);
  assert.equal(p.inventory[0].name, 'WineBarrel I');
  assert.equal(p.inventory[0].age, 0, 'newly delivered wine must not age immediately');

  p.inventory[0].level = 3;
  p.inventory[0].age = 3;
  escanor.onRoundStartTick(engine, p);
  assert.equal(p.inventory[0].level, 4);
  assert.equal(p.inventory[0].name, 'WineBarrel IV');
});

test('Night wine cannot consume skill cost when the three-barrel inventory is full', () => {
  const p = mkPlayer({
    statuses: { escanorNight: 999 },
    inventory: [1, 2, 3].map((level) => ({ uid: `w${level}`, type: 'wineBarrel', level })),
  });
  const engine = mkEngine({ p1: p }, { isNightRound: () => true });
  assert.equal(escanor.prepareSkill(engine, p, 'basic', []), null);
});

test('a WineBarrel keeps aging after another character steals it', () => {
  const thief = mkTarget('p2', {
    characterId: 'ignis',
    inventory: [{ uid: 'stolen-wine', type: 'wineBarrel', level: 1, age: 3, name: 'WineBarrel I' }],
  });
  escanor.onRoundStartTick(mkEngine({ p2: thief }), thief);
  assert.equal(thief.inventory[0].level, 2);
  assert.equal(thief.inventory[0].age, 0);
  assert.equal(thief.inventory[0].name, 'WineBarrel II');
  assert.equal(Object.hasOwn(thief, 'escanorPendingWine'), false);
});

test('WineBarrel level IV heals three and grants two drunk and cool stacks', () => {
  const p = mkPlayer({ hp: 2 });
  const engine = mkEngine({ p1: p });
  assert.equal(escanor.useWineBarrel(engine, p, { type: 'wineBarrel', level: 4 }), true);
  assert.equal(p.hp, 5);
  assert.equal(p.statuses.drunk, 2);
  assert.equal(p.statusAmt.drunk, 2);
  assert.equal(p.statuses.escanorCool, 2);
  assert.equal(p.statusAmt.escanorCool, 2);
});

test('WineBarrel sell prices are level plus one', () => {
  for (const [level, price] of [[1, 2], [2, 3], [3, 4], [4, 5]]) {
    const p = mkPlayer({ statuses: { escanorNight: 999 }, statusAmt: { escanorNight: 1 }, inventory: [{ type: 'wineBarrel', level }] });
    const engine = mkEngine({ p1: p });
    escanor.applySkill(engine, p, 'secondary', []);
    assert.equal(p.gold, price, 'level ' + level);
    assert.equal(p.inventory.length, 0);
  }
});

test('all Escanor media paths referenced by code exist', () => {
  const root = path.resolve(__dirname, '../..');
  const files = ['characters/escanor.js', 'characters.js', 'characters/_transforms.js'];
  const paths = new Set();
  for (const file of files) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    for (const m of text.matchAll(/"(\/characters\/escanor\/[^"\n]+)"/g)) paths.add(m[1]);
  }
  assert.ok(paths.size > 0);
  for (const asset of paths) {
    assert.equal(fs.existsSync(path.join(root, 'client/public', asset)), true, asset);
  }
});

test('Escanor Thai source text remains valid UTF-8 without mojibake', () => {
  const root = path.resolve(__dirname, '../..');
  for (const file of ['characters/escanor.js', 'characters.js', 'characters/_transforms.js', 'client/src/screens/Game.jsx']) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    assert.equal(text.includes('\uFFFD'), false, `${file} contains a replacement character`);
    assert.equal(/à[¸¹]|ðŸ/.test(text), false, `${file} contains mojibake`);
  }
});

test('Morning and Night form notifications are hidden because the profile already shows the form', () => {
  const gameText = fs.readFileSync(path.resolve(__dirname, '../../client/src/screens/Game.jsx'), 'utf8');
  assert.doesNotMatch(gameText, /key:\s*["']escanorFormInfo["']/);
  assert.match(gameText, /k === "escanorMorning" \|\| k === "escanorNight" \|\| k === "escanorSolar"/);
  assert.match(gameText, /escanorSkillTarget = c\.escanorSel && !self && !friendly/);
});

test('pending Escanor after-reveal skills stay hidden from opponents', () => {
  const serverText = fs.readFileSync(path.resolve(__dirname, '../../server.js'), 'utf8');
  for (const status of ['escanorSpearBurst', 'escanorFlare', 'escanorFlareNoon', 'escanorPunch', 'escanorRhitta', 'escanorRhittaNoon']) {
    assert.match(serverText, new RegExp(`HIDDEN_UNTIL_REVEAL[\\s\\S]{0,400}${status}`));
  }
});

test('forced Morning from Eternal Sunshine still charges the sun +1 per turn', () => {
  const p = mkPlayer({ escanorCharge: 10, escanorForcedMorning: 1, statuses: { escanorMorning: 999 }, statusAmt: { escanorMorning: 1 } });
  const engine = mkEngine({ p1: p }, { isNightRound: () => true }); // กลางคืน แต่ถูกบังคับเป็น Morning

  escanor.onRoundStartTick(engine, p);
  assert.equal(escanor.formOf(p), 'morning');
  assert.equal(p.escanorCharge, 11, 'ร่าง Morning ต้องได้ชาร์จ +1 ไม่ว่าจะมาจากเวลาหรือจากสุริยาไม่สิ้นแสง');

  escanor.onRoundStartTick(engine, p);
  assert.equal(p.escanorCharge, 12);
  assert.equal(escanor.formOf(p), 'noon', 'ชาร์จเต็มระหว่างบังคับ Morning ต้องเข้า Noon ได้');
});

test('Last Stand has max HP 7 and is immune to bust damage', () => {
  const p = mkPlayer({ hp: 1, escanorCharge: 3, statuses: { escanorNoon: 999 }, statusAmt: { escanorNoon: 1 } });
  const engine = mkEngine({ p1: p, p2: mkTarget('p2') });
  escanor.applySkill(engine, p, 'secondary', ['p2']); // Noon secondary จ่าย 1 HP -> ตาย -> Last Stand
  assert.equal(escanor.formOf(p), 'last');
  assert.equal(escanor.maxHp(p), 7);
  assert.equal(p.hp, 7);
  assert.equal(escanor.maxArmor(p), 0);
  assert.equal(escanor.bustDamageImmune(p), true);

  const morning = mkPlayer({ statuses: { escanorMorning: 999 }, statusAmt: { escanorMorning: 1 } });
  assert.equal(escanor.bustDamageImmune(morning), false, 'ร่างอื่นยังรับความเสียหายจากไพ่แตกตามปกติ');
  assert.equal(escanor.bustDamageImmune(mkPlayer({ characterId: 'temari' })), false);
});

test('Noon self-cost deaths go through the shared death-save pipeline', () => {
  const p = mkPlayer({ hp: 1, escanorCharge: 3, statuses: { escanorNoon: 999 }, statusAmt: { escanorNoon: 1 } });
  const calls = [];
  const engine = mkEngine({ p1: p, p2: mkTarget('p2') }, {
    resolveDamageAftermath(target) { calls.push(target.id); if (target.alive && target.hp <= 0) engine2Death(target); },
  });
  const engine2Death = (target) => { if (!escanor.tryNoonRevive(engine, target)) { target.hp = 0; target.alive = false; } };

  escanor.applySkill(engine, p, 'basic', ['p2']);
  assert.deepEqual(calls, ['p1'], 'ค่าใช้จ่าย HP ของสกิลต้องเรียก resolveDamageAftermath ไม่ใช่ instantDeath ตรงๆ');
  assert.equal(escanor.formOf(p), 'last');
});

test('the retired escanorSpear status is gone from the hook', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'characters', 'escanor.js'), 'utf8');
  assert.equal(/escanorSpear(?!Burst)/.test(src), false, 'escanorSpear เป็นโค้ดตาย ไม่มีจุดไหนเซ็ตสถานะนี้');
  const server = fs.readFileSync(path.join(__dirname, '..', '..', 'server.js'), 'utf8');
  assert.equal(/escanorSpear(?!Burst)/.test(server), false);
});
