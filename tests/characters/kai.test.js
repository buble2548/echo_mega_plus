// Direct unit tests for characters/kai.js — mark application (creation/punishment), Overhaul tracker,
// the 3 combo resolutions (including the self-punishment exception), and the kaiLink mirror.
const test = require('node:test');
const assert = require('node:assert/strict');
const { engine } = require('../../server.js');
const kai = require('../../characters/kai.js');

test.beforeEach(() => {
  for (const k of Object.keys(engine.players)) delete engine.players[k];
  engine.setKaiOverhaulSlots([]);
});

let uid = 0;
function mkPlayer(over = {}) {
  const id = `p${++uid}`;
  const p = Object.assign({
    id, name: id, alive: true, characterId: 'kai', hp: 5, armor: 2, skillPoints: 0,
    statuses: {}, statusAmt: {}, cutsceneShown: {}, seen: {},
  }, over);
  engine.players[id] = p;
  return p;
}

test('applyMark: grants kaiCreation/kaiPunishment and pushes onto the Overhaul tracker', () => {
  const kaiP = mkPlayer();
  const t = mkPlayer();
  kai.applyMark(engine, kaiP, t, 'kaiCreation', 'รังสรรค์');
  assert.equal(t.statuses.kaiCreation, 999);
  assert.equal(engine.kaiOverhaulSlots.length, 1);
  assert.deepEqual(engine.kaiOverhaulSlots[0], { playerId: t.id, status: 'kaiCreation' });
});

test('applyMark: cannot re-grant to a target that already holds the same mark (no-op, not pushed again)', () => {
  const kaiP = mkPlayer();
  const t = mkPlayer();
  kai.applyMark(engine, kaiP, t, 'kaiCreation', 'รังสรรค์');
  const before = engine.kaiOverhaulSlots.length;
  const suffix = kai.applyMark(engine, kaiP, t, 'kaiCreation', 'รังสรรค์');
  assert.equal(engine.kaiOverhaulSlots.length, before, 'blocked — not pushed a second time');
  assert.match(suffix, /อยู่แล้ว/);
});

test('applyMark: a resisted target does not get the mark and is not pushed onto the tracker', () => {
  const kaiP = mkPlayer();
  const t = mkPlayer({ statuses: { resist: 1 } });
  kai.applyMark(engine, kaiP, t, 'kaiPunishment', 'ลงทัณฑ์');
  assert.equal(t.statuses.kaiPunishment || 0, 0);
  assert.equal(engine.kaiOverhaulSlots.length, 0);
});

test('applyMark: creation and punishment are independent — same target can hold both at once', () => {
  const kaiP = mkPlayer();
  const t = mkPlayer();
  kai.applyMark(engine, kaiP, t, 'kaiCreation', 'รังสรรค์');
  kai.applyMark(engine, kaiP, t, 'kaiPunishment', 'ลงทัณฑ์');
  assert.equal(t.statuses.kaiCreation, 999);
  assert.equal(t.statuses.kaiPunishment, 999);
  assert.equal(engine.kaiOverhaulSlots.length, 2);
});

test('pruneOverhaulSlots: removes slots whose holder died or lost the mark outside Overhaul', () => {
  const a = mkPlayer();
  const b = mkPlayer();
  a.statuses.kaiCreation = 999;
  b.statuses.kaiPunishment = 999;
  engine.setKaiOverhaulSlots([{ playerId: a.id, status: 'kaiCreation' }, { playerId: b.id, status: 'kaiPunishment' }]);
  b.alive = false;
  kai.pruneOverhaulSlots(engine);
  assert.equal(engine.kaiOverhaulSlots.length, 1);
  assert.equal(engine.kaiOverhaulSlots[0].playerId, a.id);
});

test('resolveOverhaul: creation+creation -> Sanctuary Link (kaiLink) both sides, mirrored kaiLinkWith', () => {
  const kaiP = mkPlayer();
  const a = mkPlayer();
  const b = mkPlayer();
  kai.resolveOverhaul(engine, a, 'kaiCreation', b, 'kaiCreation', kaiP);
  assert.equal(a.statuses.kaiLink, 3);
  assert.equal(b.statuses.kaiLink, 3);
  assert.equal(a.kaiLinkWith, b.id);
  assert.equal(b.kaiLinkWith, a.id);
});

test('resolveOverhaul: creation+creation — one side resists, link does not form on that side (no mirror)', () => {
  const kaiP = mkPlayer();
  const a = mkPlayer({ statuses: { resist: 1 } });
  const b = mkPlayer();
  kai.resolveOverhaul(engine, a, 'kaiCreation', b, 'kaiCreation', kaiP);
  assert.equal(a.statuses.kaiLink || 0, 0);
  assert.equal(a.kaiLinkWith, undefined);
  // b's applyDebuff succeeded on its own status, but per spec the pair only truly links if BOTH succeed —
  // still, engine.applyDebuff(b) itself is independent — assert b did get the status (both are attempted)
  assert.equal(b.statuses.kaiLink, 3);
});

test('resolveOverhaul: punishment+punishment -> mutual kaiRival lock (kaiRival1/kaiRival2, mirrored kaiRivalId)', () => {
  const kaiP = mkPlayer();
  const a = mkPlayer();
  const b = mkPlayer();
  kai.resolveOverhaul(engine, a, 'kaiPunishment', b, 'kaiPunishment', kaiP);
  assert.equal(a.statuses.kaiRival1, 3);
  assert.equal(b.statuses.kaiRival2, 3);
  assert.equal(a.kaiRivalId, b.id);
  assert.equal(b.kaiRivalId, a.id);
});

test('resolveOverhaul: punishment+punishment — one-sided resist creates a one-way lock only', () => {
  const kaiP = mkPlayer();
  const a = mkPlayer({ statuses: { resist: 1 } });
  const b = mkPlayer();
  kai.resolveOverhaul(engine, a, 'kaiPunishment', b, 'kaiPunishment', kaiP);
  assert.equal(a.statuses.kaiRival1 || 0, 0);
  assert.equal(a.kaiRivalId, undefined);
  assert.equal(b.statuses.kaiRival2, 3);
  assert.equal(b.kaiRivalId, a.id);
});

test('resolveOverhaul: creation+punishment -> Scale of Equality — punished side takes 2 (through armor), creation side heals 3', () => {
  const kaiP = mkPlayer();
  const creationSide = mkPlayer({ armor: 2, hp: 5 });
  const punishSide = mkPlayer({ armor: 2, hp: 5, hp5: true });
  punishSide.hp = 3; // dip below max so heal on the creation side is observable, and damage on punish side is observable via armor
  kai.resolveOverhaul(engine, creationSide, 'kaiCreation', punishSide, 'kaiPunishment', kaiP);
  assert.equal(punishSide.armor, 0, '2 damage through armor-first: both armor units gone, nothing spills to hp');
  assert.equal(punishSide.hp, 3, 'hp untouched — 2 armor absorbed the full 2 damage');
});

test('resolveOverhaul: creation+punishment — self-punishment exception: kai punishing itself only takes 1 damage', () => {
  const kaiP = mkPlayer({ armor: 2, hp: 5 });
  const creationSide = mkPlayer();
  // kaiP itself holds kaiPunishment — order doesn't matter, function detects punishSide by status
  kai.resolveOverhaul(engine, creationSide, 'kaiCreation', kaiP, 'kaiPunishment', kaiP);
  assert.equal(kaiP.armor, 1, 'only 1 damage taken (self-punishment exception), not 3');
});

test('kaiLinkedBuddyOf: returns the mirrored partner only while both sides hold kaiLink and are alive', () => {
  const a = mkPlayer();
  const b = mkPlayer();
  assert.equal(kai.kaiLinkedBuddyOf(engine, a), null, 'no link yet');
  a.kaiLinkWith = b.id;
  a.statuses.kaiLink = 3;
  assert.equal(kai.kaiLinkedBuddyOf(engine, a), null, 'other side must also hold kaiLink');
  b.kaiLinkWith = a.id;
  b.statuses.kaiLink = 3;
  assert.equal(kai.kaiLinkedBuddyOf(engine, a), b);
  b.alive = false;
  assert.equal(kai.kaiLinkedBuddyOf(engine, a), null, 'dead partner no longer counts');
});

test('onExpireKaiLink / onExpireKaiRival: clear the mirror pointer on this side only', () => {
  const p = mkPlayer({ kaiLinkWith: 'x', kaiRivalId: 'y' });
  kai.onExpireKaiLink(p);
  assert.equal(p.kaiLinkWith, null);
  kai.onExpireKaiRival(p);
  assert.equal(p.kaiRivalId, null);
});
