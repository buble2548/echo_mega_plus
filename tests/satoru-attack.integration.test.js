const test = require('node:test');
const assert = require('node:assert/strict');
const { engine } = require('../server.js');

test.beforeEach(() => {
  for (const k of Object.keys(engine.players)) delete engine.players[k];
  engine.clearPhaseTimer();
  engine.setGameState('ATTACK');
  engine.setRoundNumber(1);
});

test.afterEach(() => engine.clearPhaseTimer());

let seq = 0;
function mkPlayer(over = {}) {
  const id = over.id || `p${++seq}`;
  const p = Object.assign({
    id,
    name: id,
    position: seq,
    alive: true,
    connected: true,
    characterId: 'kai',
    hp: 5,
    maxHp: 5,
    armor: 2,
    maxArmor: 2,
    shield: 0,
    tempHp: 0,
    skillPoints: 8,
    maxSkill: 8,
    gold: 0,
    inventory: [],
    cards: [],
    locked: false,
    busted: false,
    statuses: {},
    statusAmt: {},
    seen: {},
    cutsceneShown: {},
    colorTrigger: { red: 0, blue: 0, green: 0, yellow: 0 },
    dmgHp: 0,
    dmgArmor: 0,
  }, over);
  engine.players[id] = p;
  return p;
}

test('Satoru normal attack resolves without hanging the attack phase', () => {
  const satoru = mkPlayer({ id: 'satoru', name: 'Satoru', position: 1, characterId: 'satoru' });
  const target = mkPlayer({ id: 'target', name: 'Target', position: 2, characterId: 'kai' });
  engine.setAttackerId(satoru.id);

  engine.doAttack(satoru.id, target.id);

  assert.equal(engine.gameState, 'ATTACKING');
  assert.equal(target.hp, 5);
  assert.equal(target.armor, 2);
  assert.equal(target.statuses.oblada, 4);
});