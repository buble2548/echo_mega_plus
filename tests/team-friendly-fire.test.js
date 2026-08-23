const test = require('node:test');
const assert = require('node:assert/strict');
const { engine } = require('../server.js');

function clearPlayers() {
  for (const id of Object.keys(engine.players)) delete engine.players[id];
}

let uid = 0;
function makePlayer(overrides = {}) {
  const id = overrides.id || `p${++uid}`;
  const player = {
    id,
    name: id,
    alive: true,
    characterId: 'banagher',
    teamId: null,
    modeVote: null,
    position: uid,
    cards: [],
    locked: false,
    busted: false,
    result: null,
    skillPoints: 0,
    inventory: [],
    hp: 5,
    armor: 2,
    shield: 0,
    tempHp: 0,
    statuses: {},
    statusAmt: {},
    seen: {},
    dmgHp: 0,
    dmgArmor: 0,
    ...overrides,
  };
  engine.players[id] = player;
  return player;
}

test.beforeEach(() => {
  clearPlayers();
  engine.setGameMode('duo');
});

test.afterEach(() => {
  clearPlayers();
  engine.setGameMode('ffa');
});

test('team mode blocks teammate damage and harmful statuses at engine gates', () => {
  const source = makePlayer({ id: 'source', teamId: 'A' });
  const friend = makePlayer({ id: 'friend', teamId: 'A' });

  engine.withEffectSource(source, () => {
    assert.equal(engine.applyDebuff(friend, 'stun', null, 1), false);
    engine.dealMixed(friend, 5);
    engine.dealDirect(friend, 5);
    engine.dealArmorOnly(friend, 5);
    engine.damageSoft(friend);
    engine.loseHp(friend);
    engine.loseArmor(friend);
    engine.instantDeath(friend);
  });

  assert.equal(friend.hp, 5);
  assert.equal(friend.armor, 2);
  assert.equal(friend.alive, true);
  assert.equal(friend.dmgHp, 0);
  assert.equal(friend.dmgArmor, 0);
  assert.equal(friend.statuses.stun, undefined);
});

test('team mode still allows enemy damage and self costs', () => {
  const source = makePlayer({ id: 'source', teamId: 'A' });
  const friend = makePlayer({ id: 'friend', teamId: 'A' });
  const enemy = makePlayer({ id: 'enemy', teamId: 'B' });

  engine.withEffectSource(enemy, () => engine.dealMixed(friend, 1));
  assert.equal(friend.armor, 1);
  assert.equal(friend.hp, 5);

  engine.withEffectSource(source, () => engine.loseHp(source));
  assert.equal(source.hp, 4);
});
test('mode voting starts the mode with the most votes after everyone votes', () => {
  const p1 = makePlayer({ id: 'p1', position: 1 });
  const p2 = makePlayer({ id: 'p2', position: 2 });
  const p3 = makePlayer({ id: 'p3', position: 3 });
  const p4 = makePlayer({ id: 'p4', position: 4 });
  engine.setGameState('TEAM_MODE');
  engine.setGameMode('pending');
  engine.resetModeVotes();

  engine.voteGameMode(p1.id, 'duo');
  engine.voteGameMode(p2.id, 'duo');
  engine.voteGameMode(p3.id, 'ffa');
  assert.equal(engine.gameState, 'TEAM_MODE');

  engine.voteGameMode(p4.id, 'duo');
  assert.equal(engine.gameState, 'TEAM_SETUP');
  assert.equal(engine.gameMode, 'duo');
});

test('mode voting waits for a changed vote when the completed vote is tied', () => {
  const p1 = makePlayer({ id: 'p1', position: 1 });
  const p2 = makePlayer({ id: 'p2', position: 2 });
  const p3 = makePlayer({ id: 'p3', position: 3 });
  const p4 = makePlayer({ id: 'p4', position: 4 });
  engine.setGameState('TEAM_MODE');
  engine.setGameMode('pending');
  engine.resetModeVotes();

  engine.voteGameMode(p1.id, 'duo');
  engine.voteGameMode(p2.id, 'duo');
  engine.voteGameMode(p3.id, 'ffa');
  engine.voteGameMode(p4.id, 'ffa');
  assert.equal(engine.gameState, 'TEAM_MODE');

  engine.voteGameMode(p4.id, 'duo');
  assert.equal(engine.gameState, 'TEAM_SETUP');
  assert.equal(engine.gameMode, 'duo');
});
test('team win check ends when only one team remains alive', () => {
  const a1 = makePlayer({ id: 'a1', teamId: 'A', alive: true });
  makePlayer({ id: 'a2', teamId: 'A', alive: false });
  const b1 = makePlayer({ id: 'b1', teamId: 'B', alive: true });
  makePlayer({ id: 'b2', teamId: 'B', alive: false });

  engine.setGameMode('duo');
  assert.deepEqual(engine.remainingTeamWinInfo([a1, b1], 4), { over: false, teamId: null });

  b1.alive = false;
  assert.deepEqual(engine.remainingTeamWinInfo([a1], 4), { over: true, teamId: 'A' });
});