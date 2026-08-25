const test = require('node:test');
const assert = require('node:assert/strict');
const { engine } = require('../server.js');

test.afterEach(() => {
  engine.clearPhaseTimer();
  engine.setGameMode('ffa');
  for (const id of Object.keys(engine.players)) delete engine.players[id];
});

test('Over Load is available from the mode selection with at least two players', () => {
  assert.equal(engine.validGameMode('overload', 1), false);
  assert.equal(engine.validGameMode('overload', 2), true);
  assert.deepEqual(
    engine.modeOptionsFor(2).find((option) => option.mode === 'overload'),
    { mode: 'overload', label: 'Over Load', size: 1, enabled: true },
  );
});

test('Over Load starts at night and changes to day after five turns', () => {
  engine.setGameMode('overload');
  assert.equal(engine.isNightRound(1), true);
  assert.equal(engine.isNightRound(5), true);
  assert.equal(engine.isNightRound(6), false);
  assert.equal(engine.isNightRound(10), false);
  assert.equal(engine.isNightRound(11), true);
});

test('Over Load creates Yuuki immediately before the first turn', () => {
  engine.players.human = {
    id: 'human', name: 'Human', characterId: 'tohno', position: 1, avatar: 0,
    connected: true, socketId: null, statuses: {}, statusAmt: {}, cards: [], inventory: [],
  };
  engine.setGameMode('overload');
  engine.startMatch();

  const boss = engine.yuukiBoss();
  assert.ok(boss);
  assert.equal(boss.name, 'ยูกิ Overload');
  assert.equal(boss.yuukiPlayerCount, 1);
  assert.equal(engine.overloadForceActive, true);
  assert.equal(engine.gameState, 'CUTSCENE');
  assert.equal(engine.cutsceneInfo.kind, 'yuukiSpawn');
  assert.equal(engine.cutsceneInfo.video, '/characters/yuuki/yuuki_overload.mp4');
  assert.notEqual(engine.cutsceneInfo.video, '/overload_force/overload_force_start.mp4');
});

test('Yuuki victory always leaves the attack flow and enters game over', () => {
  engine.setGameState('ATTACK');
  engine.finishYuukiVictory();
  assert.equal(engine.gameState, 'GAMEOVER');
});
