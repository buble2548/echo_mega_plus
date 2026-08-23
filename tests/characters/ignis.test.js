const test = require('node:test');
const assert = require('node:assert/strict');
const ignis = require('../../characters/ignis.js');

function mkEngine(over = {}) {
  const logs = [];
  return Object.assign({
    roundNumber: 1,
    GOLD_MAX: 30,
    players: {},
    logs,
    log: (msg) => logs.push(msg),
    sameTeam: () => false,
    healHp(p, n) {
      const before = p.hp;
      p.hp = Math.min(p.maxHp || 5, p.hp + n);
      return p.hp - before;
    },
    shopItemName(item) { return item.name || item.type || 'item'; },
    nextTransformCounter() { return 7; },
    triggerCutscene(p, key) { p.cutscene = key; },
    isNightRound: () => false,
    passiveSealed: () => false,
    colorOf: () => '#fff',
  }, over);
}

function mkIgnis(over = {}) {
  return Object.assign({
    id: 'ignis', name: 'Ignis', alive: true, characterId: 'ignis',
    hp: 3, maxHp: 5, armor: 0, statuses: {}, statusAmt: {}, inventory: [], gold: 0,
  }, over);
}

test('ensureBlackSparklence gives Ignis the permanent weapon once', () => {
  const p = mkIgnis();
  ignis.ensureBlackSparklence(p);
  ignis.ensureBlackSparklence(p);
  assert.equal(p.inventory.filter((it) => it.type === 'blackSparklence').length, 1);
});

test('basic skill steals one backpack item, heals, and awards bonus gold only on success', () => {
  const p = mkIgnis({ hp: 2, gold: 1 });
  const target = { id: 't1', name: 'Target', alive: true, inventory: [{ uid: 'a', type: 'armor', value: 1 }] };
  const engine = mkEngine({ players: { [p.id]: p, [target.id]: target } });
  const picked = ignis.prepareStealTarget(engine, p, target.id);

  const suffix = ignis.applySteal(engine, p, picked);

  assert.equal(target.inventory.length, 0);
  assert.equal(p.inventory.length, 1);
  assert.equal(p.inventory[0].type, 'armor');
  assert.equal(p.hp, 4);
  assert.equal(p.gold, 3);
  assert.match(suffix, /\+2/);
});

test('Trigger Dark key activates the form, heals, and queues the henshin cutscene', () => {
  const p = mkIgnis({ hp: 1, inventory: [{ uid: 'black', type: 'blackSparklence' }] });
  const engine = mkEngine();

  assert.equal(ignis.activateTriggerDark(engine, p), true);
  assert.equal(p.statuses.triggerDarkForm, ignis.DARK_TURNS);
  assert.equal(p.hp, 3);
  assert.equal(p.transformAt, 7);
  assert.equal(p.cutscene, 'triggerDarkHenshin');
});

test('Trigger Dark impact spends the queued buff after a landed attack and keeps wail stacks', () => {
  const p = mkIgnis({ statuses: { triggerDarkForm: 5, triggerDarkCry: 1, triggerDarkImpact: 999 }, triggerDarkWail: 2 });
  const ctx = {};
  const engine = mkEngine({ isNightRound: () => true });

  assert.equal(ignis.damageBonus(engine, p, { id: 't' }, ctx), 4);
  const fx = ignis.onAttackLanded(engine, p, { id: 't' }, ctx);

  assert.equal(p.triggerDarkWail, 3);
  assert.equal(p.statusAmt.triggerDarkWail, 3);
  assert.equal(p.statuses.triggerDarkImpact || 0, 0);
  assert.equal(p.cutscene, 'triggerDarkImpact');
  assert.equal(fx.length, 2);
});
