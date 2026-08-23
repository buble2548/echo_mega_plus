const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const escanor = require('../../characters/escanor.js');

function mkPlayer(over = {}) {
  return Object.assign({
    id: 'p1', name: 'Escanor', characterId: 'escanor', alive: true,
    hp: 7, armor: 3, skillPoints: 0, gold: 0,
    statuses: {}, statusAmt: {}, inventory: [],
    escanorCharge: 0, escanorForcedMorning: 0, escanorLastStandUsed: false,
  }, over);
}

function mkTarget(id, over = {}) {
  return Object.assign({ id, name: id, alive: true, hp: 3, armor: 0, statuses: {}, statusAmt: {} }, over);
}

function mkEngine(players, over = {}) {
  const logs = [];
  const engine = Object.assign({
    players,
    roundNumber: 1,
    GOLD_MAX: 30,
    logs,
    log: (msg) => logs.push(msg),
    isNightRound: () => false,
    addSkill(p, n) { p.skillPoints = Math.min(8, (p.skillPoints || 0) + n); },
    dealMixed(target, n) {
      for (let i = 0; i < n; i++) {
        if (target.armor > 0) target.armor -= 1;
        else target.hp -= 1;
      }
    },
    healHp(p, n) { p.hp = Math.min(escanor.maxHp(p) || 7, p.hp + n); },
    loseHp(p) { p.hp -= 1; },
    instantDeath(p) {
      if (!escanor.tryNoonRevive(engine, p)) {
        p.hp = 0;
        p.alive = false;
      }
    },
    triggerCutscene() {},
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
  assert.equal(p.hp, 6);
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

test('morning Solar is granted only when Escanor did not attack, did not bust, and was not lowest', () => {
  const p = mkPlayer({ statuses: { escanorMorning: 999 }, statusAmt: { escanorMorning: 1 } });
  const engine = mkEngine({ p1: p });
  escanor.onEndTurnSolar(engine, p);
  assert.equal(p.statuses.escanorSolar, 1);

  const busted = mkPlayer({ busted: true, statuses: { escanorMorning: 999 }, statusAmt: { escanorMorning: 1 } });
  escanor.onEndTurnSolar(mkEngine({ p1: busted }), busted);
  assert.equal(busted.statuses.escanorSolar || 0, 0);
});

test('all Escanor media paths referenced by code exist', () => {
  const root = path.resolve(__dirname, '../..');
  const files = ['characters/escanor.js', 'characters.js'];
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
