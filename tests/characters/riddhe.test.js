// Direct unit tests for characters/riddhe.js — the alliance state machine (shared with banagher.js)
// had zero test coverage before this file; only its damage-formula terms were exercised indirectly.
const test = require('node:test');
const assert = require('node:assert/strict');
const { engine } = require('../../server.js');
const riddhe = require('../../characters/riddhe.js');

test.beforeEach(() => {
  for (const k of Object.keys(engine.players)) delete engine.players[k];
});

let uid = 0;
function mkPlayer(over = {}) {
  const id = `p${++uid}`;
  const p = Object.assign({
    id, name: id, alive: true, characterId: 'riddhe', hp: 5, armor: 2, beamAmmo: 0,
    statuses: {}, statusAmt: {}, cutsceneShown: {},
  }, over);
  engine.players[id] = p;
  return p;
}

test('allied: only returns the other player if the link is mutual and they are alive', () => {
  const r = mkPlayer();
  const b = mkPlayer({ characterId: 'banagher' });
  assert.equal(riddhe.allied(engine, r), null, 'no allyId yet');
  r.allyId = b.id; // one-directional only
  assert.equal(riddhe.allied(engine, r), null, 'link must be mutual');
  b.allyId = r.id;
  assert.equal(riddhe.allied(engine, r), b);
  b.alive = false;
  assert.equal(riddhe.allied(engine, r), null, 'dead ally no longer counts');
});

test('guardProtects: true only for a live riddhe currently holding the riddheguard status', () => {
  const r = mkPlayer({ statuses: { riddheguard: 2 } });
  assert.equal(riddhe.guardProtects(r), true);
  const nonRiddhe = mkPlayer({ characterId: 'banagher', statuses: { riddheguard: 2 } });
  assert.equal(riddhe.guardProtects(nonRiddhe), false, 'only riddhe itself can be protected by its own guard');
});

test('freeNtd: grants NT-D once per game, refuses a second time, grants beam ammo unless already an Avenger', () => {
  const r = mkPlayer();
  riddhe.freeNtd(engine, r, false);
  assert.equal(r.riddhePassiveUsed, true);
  assert.equal(r.statuses.riddhentd > 0, true);
  assert.equal(r.beamAmmo, 1);

  const r2 = mkPlayer({ riddhePassiveUsed: true });
  riddhe.freeNtd(engine, r2, false);
  assert.equal(r2.statuses.riddhentd || 0, 0, 'already used once this game — refuses');

  const avenger = mkPlayer({ riddheAvenger: true });
  riddhe.freeNtd(engine, avenger, false);
  assert.equal(avenger.beamAmmo, 0, 'avengers do not get the beam-ammo bonus');
});

test('breakAlliance: clears the link and guard/ward statuses on both sides', () => {
  const r = mkPlayer({ allyId: 'x', statuses: { riddheguard: 3 }, allyFinalAsk: true });
  const b = mkPlayer({ characterId: 'banagher', allyId: 'x', statuses: { riddheward: 3 } });
  riddhe.breakAlliance(engine, r, b);
  assert.equal(r.allyId, null);
  assert.equal(b.allyId, null);
  assert.equal(r.statuses.riddheguard || 0, 0);
  assert.equal(b.statuses.riddheward || 0, 0);
  assert.equal(r.allyFinalAsk, false);
});

test('onRoundStartGrudgeTick: accumulates grudge across turns and auto-triggers freeNtd at the threshold (3)', () => {
  const r = mkPlayer();
  mkPlayer({ characterId: 'banagher' }); // an unallied banagher on the field
  const roundEngine = (n) => Object.create(engine, { roundNumber: { value: n } });

  riddhe.onRoundStartGrudgeTick(roundEngine(2), r);
  assert.equal(r.riddheGrudge, 1);
  riddhe.onRoundStartGrudgeTick(roundEngine(3), r);
  assert.equal(r.riddheGrudge, 2);
  riddhe.onRoundStartGrudgeTick(roundEngine(4), r);
  assert.equal(r.riddhePassiveUsed, true, 'grudge hit 3 -> freeNtd fired automatically');
  assert.equal(r.statuses.riddhentd > 0, true);
});

test('onRoundStartGrudgeTick: resets to 0 if no banagher is on the field, does nothing before round 2', () => {
  const r = mkPlayer();
  const before1 = Object.create(engine, { roundNumber: { value: 1 } });
  riddhe.onRoundStartGrudgeTick(before1, r);
  assert.equal(r.riddheGrudge || 0, 0, 'round 1 — grudge tick does not run yet');

  const r2 = mkPlayer({ riddheGrudge: 2 });
  const noBanagher = Object.create(engine, { roundNumber: { value: 2 } });
  riddhe.onRoundStartGrudgeTick(noBanagher, r2);
  assert.equal(r2.riddheGrudge, 0, 'no banagher on field -> grudge resets');
});

test('activateAbsorbShield: heals armor by RIDDHE_ABSORB_ARMOR(2)', () => {
  const p = mkPlayer({ armor: 0 });
  riddhe.activateAbsorbShield(engine, p);
  assert.equal(p.armor, 2);
});

test('findTaunter: finds a live riddhe (not the attacker) currently holding absorbplus, ignoring sealed ones', () => {
  const attacker = mkPlayer({ characterId: 'tohno' });
  assert.equal(riddhe.findTaunter(engine, attacker), null, 'nobody has absorbplus yet');
  const taunter = mkPlayer({ statuses: { absorbplus: 1 } });
  assert.equal(riddhe.findTaunter(engine, attacker), taunter);

  const sealedEngine = Object.assign(Object.create(engine), { sealActive: () => true });
  assert.equal(riddhe.findTaunter(sealedEngine, attacker), null, 'sealed absorbplus holder does not taunt');
});

test('onAttackedByBanagher: grants free NT-D (compensated) only to an unallied riddhe who has not used the passive yet', () => {
  const r = mkPlayer();
  riddhe.onAttackedByBanagher(engine, r);
  assert.equal(r.riddhePassiveUsed, true);
  assert.equal(r.statuses.riddhentd, 6, 'RIDDHE_NTD_TURNS(5) + compensate(1)');

  const already = mkPlayer({ riddhePassiveUsed: true });
  riddhe.onAttackedByBanagher(engine, already);
  assert.equal(already.statuses.riddhentd || 0, 0, 'no-op — already used');
});

test('checkAllyFriendlyFire: flags an allyBreakAsk only when allied riddhe/banagher hit each other', () => {
  const r = mkPlayer({ allyId: 'b1' });
  const b = mkPlayer({ id: 'b1', characterId: 'banagher', allyId: r.id, hp: 3, armor: 1 });
  engine.players['b1'] = b;
  riddhe.checkAllyFriendlyFire(engine, r, b, 5, 2);
  assert.deepEqual(b.allyBreakAsk, { by: r.id, hp: 2, armor: 1 });

  const stranger = mkPlayer({ characterId: 'tohno' });
  const victim = mkPlayer({ characterId: 'nanaya' });
  riddhe.checkAllyFriendlyFire(engine, stranger, victim, 5, 2);
  assert.equal(victim.allyBreakAsk, undefined, 'unrelated players never trigger this');
});

test('onEndTurnAvengerSweep: an allied riddhe becomes a permanent Avenger when their banagher partner dies', () => {
  const r = mkPlayer({ allyId: 'b1', statuses: { riddheguard: 2 } });
  const b = mkPlayer({ id: 'b1', characterId: 'banagher', allyId: r.id, alive: false, statuses: { riddheward: 2 } });
  engine.players['b1'] = b;
  riddhe.onEndTurnAvengerSweep(engine);
  assert.equal(r.riddheAvenger, true);
  assert.equal(r.allyId, null);
  assert.equal(r.statuses.riddheguard || 0, 0);
});

test('onEndTurnOrphanCleanup: clears alliance state pointing at a player who no longer exists', () => {
  const p = mkPlayer({ allyId: 'ghost', statuses: { riddheguard: 2 } });
  riddhe.onEndTurnOrphanCleanup(engine);
  assert.equal(p.allyId, null);
  assert.equal(p.statuses.riddheguard || 0, 0);
});
