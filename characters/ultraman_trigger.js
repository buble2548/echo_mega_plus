const TRIGGER_FORM_TURNS = 10;
const TRIGGER_LIGHT_MAX = 6;
const TRIGGER_KEY_COOLDOWN_TURNS = 5;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = {
  id: "ultraman_trigger",
  TRIGGER_FORM_TURNS,
  TRIGGER_LIGHT_MAX,
  TRIGGER_KEY_COOLDOWN_TURNS,

  activate(engine, p) {
    if (!p || !p.alive || p.characterId === "ultraman_trigger") return false;
    const snapshot = clone(p);
    p.triggerSnapshot = snapshot;
    p.characterId = "ultraman_trigger";
    p.img = "/characters/ultraman_trigger/trigger.webp";
    p.statuses = { triggerForm: TRIGGER_FORM_TURNS };
    p.statusAmt = {};
    p.seen = {};
    p.hp = engine.maxHpOf(p);
    p.armor = engine.maxArmorOf(p);
    p.shield = 0;
    p.skillPoints = Math.min(engine.maxSkillOf(p), (p.skillPoints || 0) + 4);
    p.skillUsedRound = false;
    p.transformAt = engine.nextTransformCounter();
    engine.triggerCutscene(p, "triggerHenshin");
    engine.log(`🔴 ${p.name} ใช้ Hyper Key Trigger — แปลงร่างเป็น Ultraman Trigger ${TRIGGER_FORM_TURNS} เทิร์น! ฟื้นพลังชีวิต/เกราะเต็ม และแต้มสกิล +4`);
    return true;
  },

  restore(engine, p) {
    if (!p || p.characterId !== "ultraman_trigger" || !p.triggerSnapshot) return false;
    const snapshot = p.triggerSnapshot;
    const triggerId = p.id;
    const recoveryTargetHp = Math.max(1, snapshot.hp || 1);
    const shown = { ...(snapshot.cutsceneShown || {}), ...(p.cutsceneShown || {}) };
    const connected = p.connected;
    Object.keys(p).forEach((key) => delete p[key]);
    Object.assign(p, clone(snapshot));
    p.cutsceneShown = shown;
    p.connected = connected;
    p.hp = 1;
    p.armor = engine.maxArmorOf(p);
    p.shield = 0;
    p.triggerRecoveryTargetHp = recoveryTargetHp;
    p.hyperTriggerReadyRound = engine.roundNumber + TRIGGER_KEY_COOLDOWN_TURNS;
    for (const target of Object.values(engine.players)) {
      if (!target.triggerLightBy) continue;
      delete target.triggerLightBy[triggerId];
      const total = Object.values(target.triggerLightBy).reduce((sum, n) => sum + n, 0);
      if (total > 0) target.statuses.triggerLight = total;
      else {
        delete target.triggerLightBy;
        delete target.statuses.triggerLight;
      }
    }
    engine.log(`✨ ${p.name} ครบ ${TRIGGER_FORM_TURNS} เทิร์น — คืนร่างเดิม พลังชีวิตเหลือ 1 เกราะเต็ม และ Hyper Key Trigger จะกลับมาใช้ได้อีกครั้งใน ${TRIGGER_KEY_COOLDOWN_TURNS} เทิร์น`);
    return true;
  },

  attackBaseOverride(engine, attacker, target, ctx) {
    ctx.triggerCircleAtk = (attacker.statuses.triggerCircle || 0) > 0;
    ctx.triggerMultiAtk = (attacker.statuses.triggerMulti || 0) > 0;
    ctx.triggerZeperionAtk = (attacker.statuses.triggerZeperion || 0) > 0;
    ctx.triggerMultiHighestHp = ctx.triggerMultiAtk && this.isHighestHpTarget(engine, attacker, target);
    ctx.triggerMultiLowHpPenalty = ctx.triggerMultiAtk && target.hp < 5;
    const light = target.triggerLightBy
      ? Math.min(TRIGGER_LIGHT_MAX, Object.values(target.triggerLightBy).reduce((sum, n) => sum + n, 0))
      : 0;
    ctx.triggerLightBonus = ctx.triggerZeperionAtk ? Math.floor(light / 2) : 0;
    const multiBase = ctx.triggerMultiLowHpPenalty ? 2 : 3 + (ctx.triggerMultiHighestHp ? 1 : 0);
    return (ctx.triggerMultiAtk ? multiBase : 3) + ctx.triggerLightBonus;
  },

  applySkill(engine, p, tier) {
    if (tier === "basic") {
      p.statuses.triggerCircle = 5;
      engine.log(`⚔️ ${p.name} Circle Arms — ได้รับสถานะ [ดาบวงจักร] 5 เทิร์น`);
      return true;
    }
    if (tier === "secondary") {
      if (!(p.statuses.triggerCircle > 0) || p.statuses.triggerMulti > 0 || p.statuses.triggerZeperion > 0) return false;
      p.statuses.triggerMulti = 999;
      engine.log(`⭕ ${p.name} Multi Sword Finish — ได้รับ [จักรแห่งแสง] จนกว่าจะโจมตีสำเร็จ 1 ครั้ง`);
      return true;
    }
    if (tier === "ultimate") {
      if (!(p.statuses.triggerCircle > 0) || p.statuses.triggerMulti > 0 || p.statuses.triggerZeperion > 0) return false;
      p.statuses.triggerZeperion = 999;
      engine.log(`🌟 ${p.name} เตรียมลำแสง Zeperion — คงอยู่จนกว่าจะโจมตีสำเร็จ ดาเมจเพิ่มตามแสงสว่างของเป้าหมาย`);
      return true;
    }
    return false;
  },

  isHighestHpTarget(engine, attacker, target) {
    const candidates = engine.alivePlayers().filter((o) => o.id !== attacker.id && !engine.sealActive(o));
    const maxHp = Math.max(...candidates.map((o) => o.hp));
    return target.hp === maxHp;
  },

  clearTargetLight(target) {
    if (!target || !target.statuses) return 0;
    const removed = target.triggerLightBy
      ? Object.values(target.triggerLightBy).reduce((sum, n) => sum + n, 0)
      : (target.statuses.triggerLight || 0);
    delete target.triggerLightBy;
    delete target.statuses.triggerLight;
    if (target.statusAmt) delete target.statusAmt.triggerLight;
    return Math.min(TRIGGER_LIGHT_MAX, removed);
  },

  onAttackLanded(engine, attacker, target, ctx) {
    if (ctx.triggerCircleAtk) {
      const requested = ctx.triggerMultiAtk ? 4 : 2;
      target.triggerLightBy = target.triggerLightBy || {};
      const currentTotal = Object.values(target.triggerLightBy).reduce((sum, n) => sum + n, 0);
      const add = target.alive ? Math.min(requested, Math.max(0, TRIGGER_LIGHT_MAX - currentTotal)) : 0;
      if (add > 0) target.triggerLightBy[attacker.id] = (target.triggerLightBy[attacker.id] || 0) + add;
      target.statuses.triggerLight = Math.min(TRIGGER_LIGHT_MAX, currentTotal + add);
      const healed = engine.healHp(attacker, 2);
      engine.log(`✨ Circle Arms — ${target.name} ได้รับ [แสงสว่าง] +${add} (${target.statuses.triggerLight}/${TRIGGER_LIGHT_MAX}) และ ${attacker.name} ฟื้นพลังชีวิต +${healed}`);
    }
    if (ctx.triggerMultiAtk) {
      delete attacker.statuses.triggerMulti;
      engine.triggerCutscene(attacker, "triggerMultiSword");
    }
    if (ctx.triggerZeperionAtk) {
      delete attacker.statuses.triggerZeperion;
      engine.triggerCutscene(attacker, "triggerZeperion");
      const removed = this.clearTargetLight(target);
      if (removed > 0) engine.log(`🌟 Zeperion Ray — แสงสว่างของ ${target.name} ถูกล้างออกทั้งหมด (-${removed})`);
    }
  },
};
