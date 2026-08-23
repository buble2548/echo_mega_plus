const test = require('node:test');
const assert = require('node:assert/strict');
const { engine } = require('../../server.js');
const mageslayer = require('../../characters/mageslayer.js');
const kai = require('../../characters/kai.js');
const bard = require('../../characters/bard.js');
const shiki = require('../../characters/shiki.js');
const shrade = require('../../characters/shrade_elan.js');
const takumi = require('../../characters/takumi.js');
const tepeu = require('../../characters/tepeu.js');

const cutsceneFns = {
  triggerCutscene: engine.triggerCutscene,
  queueCutscene: engine.queueCutscene,
  pausePlayingForCutscene: engine.pausePlayingForCutscene,
};

test.before(() => {
  engine.triggerCutscene = () => {};
  engine.queueCutscene = () => {};
  engine.pausePlayingForCutscene = () => {};
});

test.after(() => Object.assign(engine, cutsceneFns));

let uid = 0;
function player(characterId, over = {}) {
  const id = `dup${++uid}`;
  const p = Object.assign({
    id, name: id, characterId, alive: true, position: uid, hp: 20, armor: 0,
    skillPoints: 4, cards: [], statuses: {}, statusAmt: {}, cutsceneShown: {}, seen: {},
  }, over);
  engine.players[id] = p;
  return p;
}

test.beforeEach(() => {
  for (const id of Object.keys(engine.players)) delete engine.players[id];
  engine.setKaiOverhaulSlots([]);
});

test('Witch Mark: moving one caster mark does not remove another caster mark', () => {
  const a = player('mageslayer');
  const b = player('mageslayer');
  const shared = player('tohno');
  const next = player('riddhe');
  mageslayer.applyWitchMark(engine, a, shared);
  mageslayer.applyWitchMark(engine, b, shared);
  mageslayer.applyWitchMark(engine, a, next);
  assert.equal(shared.statuses.mageslayerMark, 999);
  assert.equal(shared.mageslayerMarks[b.id], true);
  assert.equal(shared.mageslayerMarks[a.id], undefined);
});

test('Kai marks: each Kai owns an independent Overhaul tracker', () => {
  const a = player('kai');
  const b = player('kai');
  const target = player('tohno');
  kai.applyMark(engine, a, target, 'kaiCreation', 'รังสรรค์');
  kai.applyMark(engine, b, target, 'kaiCreation', 'รังสรรค์');
  assert.equal(engine.kaiOverhaulSlots.filter((slot) => slot.ownerId === a.id).length, 1);
  assert.equal(engine.kaiOverhaulSlots.filter((slot) => slot.ownerId === b.id).length, 1);
  assert.equal(target.kaiMarksBy[a.id].kaiCreation, true);
  assert.equal(target.kaiMarksBy[b.id].kaiCreation, true);
});

test('Bard Resonance: links from separate Bards coexist on the same player', () => {
  const a = player('bard');
  const b = player('bard');
  const center = player('tohno');
  const left = player('riddhe');
  const right = player('phenex');
  bard.applyBardSong(engine, a, 'JJR', [center.id, left.id]);
  bard.applyBardSong(engine, b, 'JJR', [center.id, right.id]);
  assert.equal(center.bardLinks[a.id].buddyId, left.id);
  assert.equal(center.bardLinks[b.id].buddyId, right.id);
  assert.deepEqual(bard.linkedBuddiesOf(engine, center).map((p) => p.id).sort(), [left.id, right.id].sort());
});

test('Wither: each Shiki has an independent contribution and cleanup', () => {
  const a = player('shiki', { statuses: { wither: 5 } });
  const b = player('shiki', { statuses: { wither: 5 } });
  const target = player('tohno');
  shiki.onRoundStartWitherTick(engine);
  assert.equal(target.statuses.deathline, 2);
  engine.clearWitherLines(a.id);
  assert.equal(target.statuses.deathline, 1);
  assert.equal(target.witherAddedBy[b.id], 1);
});

test('Shrade moon marks: one burst deals once per Spada caster', () => {
  const a = player('shrade_elan', { shradeForm: true });
  const b = player('shrade_elan', { shradeForm: true });
  const target = player('tohno', { hp: 10, cards: [{ value: 22 }] });
  shrade.applyMoonEffect(engine, a, target, 'แสงจันทร์ส่องวิญญาณ');
  shrade.applyMoonEffect(engine, b, target, 'แสงจันทร์ส่องวิญญาณ');
  shrade.maybeMoonBurst(engine, target);
  assert.equal(target.hp, 8);
  assert.equal(target.statuses.moonmark || 0, 0);
});

test('Takumi blackout: every active Takumi triggers on the first buster', () => {
  const a = player('takumi');
  const b = player('takumi');
  const target = player('tohno', { hp: 20, cards: [{ value: 22 }] });
  takumi.activateBlackout(engine, a);
  takumi.activateBlackout(engine, b);
  takumi.tryBustTrigger(engine);
  assert.equal(target.hp, 14);
  assert.equal(a.statuses.takumiBlackout || 0, 0);
  assert.equal(b.statuses.takumiBlackout || 0, 0);
});

test('Tepeu pondering: every pondering Tepeu grants one deathline to the winner', () => {
  const a = player('tepeu', { tepeuPonderTurns: 3 });
  const b = player('tepeu', { tepeuPonderTurns: 2 });
  const winner = player('tohno');
  tepeu.onRoundWin(engine, winner, [a, b, winner]);
  assert.equal(winner.statuses.deathline, 2);
});
