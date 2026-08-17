// Direct unit tests for characters/oguri.js — the Breakfast/Training -> GrayBeast -> Burnout
// state machine had zero test coverage before this file; only its damage-formula terms were
// exercised indirectly.
const test = require('node:test');
const assert = require('node:assert/strict');
const { engine } = require('../../server.js');
const oguri = require('../../characters/oguri.js');

test.beforeEach(() => {
  for (const k of Object.keys(engine.players)) delete engine.players[k];
});

let uid = 0;
function mkPlayer(over = {}) {
  const id = `p${++uid}`;
  const p = Object.assign({
    id, name: id, alive: true, characterId: 'oguri', hp: 5, armor: 2,
    statuses: {}, statusAmt: {}, cutsceneShown: {}, seen: {},
    oguriEnergy: 0, stamina: 0,
  }, over);
  engine.players[id] = p;
  return p;
}

function withRandom(value, fn) {
  const orig = Math.random;
  Math.random = () => value;
  try { return fn(); } finally { Math.random = orig; }
}

test('damageBonus: golden-era stacks give +1 atk each capped at OGURI_GOLD_ATK_CAP(2), plus victorybeat +2', () => {
  const p = mkPlayer({ statuses: { goldenera: 6 }, statusAmt: { goldenera: 3 } });
  const ctx = {};
  const bonus = oguri.damageBonus(engine, p, mkPlayer({ characterId: 'tohno' }), ctx);
  assert.equal(bonus, 2, 'goldStacks(3) capped at 2, no victorybeat');
  assert.equal(ctx.oguriGoldAtk, 2);

  p.statuses.victorybeat = 1;
  const bonus2 = oguri.damageBonus(engine, p, mkPlayer({ characterId: 'tohno' }), {});
  assert.equal(bonus2, 4, '2 (capped gold) + 2 (victory)');
});

test('damageBonus: no goldenera status means zero stacks even if statusAmt.goldenera is set', () => {
  const p = mkPlayer({ statuses: {}, statusAmt: { goldenera: 3 } });
  assert.equal(oguri.damageBonus(engine, p, mkPlayer({ characterId: 'tohno' }), {}), 0);
});

test('onRoundStartTick: non-oguri players are ignored entirely', () => {
  const p = mkPlayer({ characterId: 'tohno', stamina: 0 });
  oguri.onRoundStartTick(engine, p);
  assert.equal(p.stamina, 0);
});

test('onRoundStartTick: charges stamina every round within [8,16]', () => {
  const p = mkPlayer();
  oguri.onRoundStartTick(engine, p);
  assert.ok(p.stamina >= 8 && p.stamina <= 16, `expected 8-16, got ${p.stamina}`);
});

test('onRoundStartTick: entering GrayBeast when golden-era stacks reach OGURI_GOLD_MAX(3)', () => {
  const p = mkPlayer({ statuses: { goldenera: 6 }, statusAmt: { goldenera: 3 } });
  oguri.onRoundStartTick(engine, p);
  assert.equal(p.statuses.graybeast, 1);
  assert.equal(p.seen.graybeast, true);
  assert.equal(p.oguriZoneTurns, 1, 'the same tick that enters GrayBeast also runs its Energy/turn-counter tick');
});

test('onRoundStartTick: GrayBeast grants Energy +1 every round and skill +1 every 2 rounds', () => {
  const p = mkPlayer({ statuses: { graybeast: 1, goldenera: 6 }, statusAmt: { goldenera: 3 }, skillPoints: 0 });
  oguri.onRoundStartTick(engine, p);
  assert.equal(p.oguriEnergy, 1);
  assert.equal(p.oguriZoneTurns, 1);
  assert.equal(p.skillPoints, 0, 'not yet at the 2-round threshold');

  oguri.onRoundStartTick(engine, p);
  assert.equal(p.oguriEnergy, 2);
  assert.equal(p.oguriZoneTurns, 0, 'threshold hit -> counter resets');
  assert.equal(p.skillPoints, 1);
});

test('onRoundStartTick: losing all golden-era stacks drops GrayBeast immediately', () => {
  const p = mkPlayer({ statuses: { graybeast: 1, goldenera: 0 }, statusAmt: { goldenera: 0 }, oguriZoneTurns: 3 });
  oguri.onRoundStartTick(engine, p);
  assert.equal(p.statuses.graybeast || 0, 0);
  assert.equal(p.oguriZoneTurns, 0);
});

test('onRoundStartTick: Energy at 0 with no golden era triggers Burnout + decay', () => {
  const p = mkPlayer({ oguriEnergy: 0, statuses: {}, statusAmt: {} });
  oguri.onRoundStartTick(engine, p);
  assert.equal(p.statuses.burnout, 2);
  assert.equal(p.statuses.decay >= 2, true);
});

test('onRoundStartTick: Sunny Day grants fortune every round it is active', () => {
  const p = mkPlayer({ statuses: { sunny: 3 } });
  oguri.onRoundStartTick(engine, p);
  assert.equal(p.statuses.fortune, 1);
  assert.equal(p.fortuneIdle, 0);
});

test('applyBreakfast: heals 1 hp, grants +4 Energy normally, +2 while Burnout is active', () => {
  const p = mkPlayer({ hp: 3, oguriEnergy: 0 });
  oguri.applyBreakfast(engine, p);
  assert.equal(p.hp, 4);
  assert.equal(p.oguriEnergy, 4);
  assert.equal(p.statuses.fullbelly, 1);

  const burning = mkPlayer({ hp: 3, oguriEnergy: 0, statuses: { burnout: 1 } });
  oguri.applyBreakfast(engine, burning);
  assert.equal(burning.oguriEnergy, 2, 'burnout penalty reduces the gain');
});

// applyTraining always ends with triggerCutscene + a real pausePlayingForCutscene() timer chain
// when a cutscene is queued (first-time-per-game) — stub hasQueuedCutscene so tests don't leak timers.
const noCutsceneEngine = Object.assign(Object.create(engine), { hasQueuedCutscene: () => false });

test('applyTraining: success path grants skill +1, golden-era stack +1, and refreshes the golden-era timer', () => {
  const p = mkPlayer({ oguriEnergy: 10, skillPoints: 0, statuses: {}, statusAmt: {} });
  withRandom(0, () => oguri.applyTraining(noCutsceneEngine, p));
  assert.equal(p.oguriEnergy, 6, 'training costs 4 energy');
  assert.equal(p.skillPoints, 1);
  assert.equal(p.statusAmt.goldenera, 1);
  assert.equal(p.statuses.goldenera, 6, 'refreshed to OGURI_GOLD_TURNS');
  assert.ok(p.oguriChargeCapBonus >= 3 && p.oguriChargeCapBonus <= 7);
});

test('applyTraining: failure path deals 1 unblockable damage and does not grant skill/golden-era', () => {
  const p = mkPlayer({ oguriEnergy: 10, skillPoints: 0, hp: 5, armor: 5, statuses: {}, statusAmt: {} });
  withRandom(0.999, () => oguri.applyTraining(noCutsceneEngine, p));
  assert.equal(p.skillPoints, 0);
  assert.equal(p.statusAmt.goldenera || 0, 0);
  assert.equal(p.hp, 4, 'unblockable damage ignores armor');
});

test('tryFlowDodge: consumes Flow regardless of outcome, returns true only on a successful roll', () => {
  // a successful dodge runs runCutsceneQueue(cb) -> real phase timers; stub it to a no-op so the
  // process doesn't leak a setTimeout that outlives the test.
  const noTimerEngine = Object.assign(Object.create(engine), { runCutsceneQueue: () => {} });
  const attacker = mkPlayer({ characterId: 'tohno' });
  const target = mkPlayer({ statuses: { flow: 3 } });
  const dodged = withRandom(0, () => oguri.tryFlowDodge(noTimerEngine, attacker, target));
  assert.equal(dodged, true);
  assert.equal(target.statuses.flow || 0, 0, 'flow is consumed even on success');
});

test('tryFlowDodge: no Flow status or non-oguri target never dodges', () => {
  const attacker = mkPlayer({ characterId: 'tohno' });
  const target = mkPlayer({ statuses: {} });
  assert.equal(oguri.tryFlowDodge(engine, attacker, target), false);
});

test('applyVictoryEffect: applies nohealing + staggerNext unless the target resists', () => {
  const target = mkPlayer({ characterId: 'nanaya' });
  oguri.applyVictoryEffect(engine, target);
  assert.equal(target.statuses.nohealing, 2);
  assert.equal(target.staggerNext, 2);

  const resisted = mkPlayer({ characterId: 'nanaya', statuses: { resist: 1 } });
  oguri.applyVictoryEffect(engine, resisted);
  assert.equal(resisted.statuses.nohealing || 0, 0);
  assert.equal(resisted.staggerNext || 0, 0);
});

test('applyVictoryEffect: no-op against an already-dead target', () => {
  const target = mkPlayer({ characterId: 'nanaya', alive: false });
  oguri.applyVictoryEffect(engine, target);
  assert.equal(target.statuses.nohealing || 0, 0);
});
