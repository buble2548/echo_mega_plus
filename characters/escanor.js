const ID = "escanor";
const ESCANOR_CHARGE_MAX = 12;
const SOLAR_MAX = 4;
const BURN_MAX = 6;

const IMG = {
  morning: "/characters/escanor/ร่าง เช้า Profile.png",
  night: "/characters/escanor/ร่าง กลางคืน Profile.png",
  noon: "/characters/escanor/ร่าง Noon Profile.png",
  last: "/characters/escanor/Last Stand Profile.png",
};

const FX = {
  morning: "/characters/escanor/ร่าง เช้า Animation.mp4",
  last: "/characters/escanor/Last Stand.mp4",
  basic1: "/characters/escanor/สกิลพื้นฐาน/สกิลพื้นฐาน 1 บอลเพลิงสุริยะ.mp4",
  secondary1: "/characters/escanor/สกิลรอง/สกิลรอง 1 เพลิงปะทุ.mp4",
  secondary3: "/characters/escanor/สกิลรอง/สกิลรอง 3 หมัดเพลิงสุริยัน.mp4",
  ultimate1: "/characters/escanor/สกิลอัลติเมต/สกิลอัลติเมต 1 Divin Axe Rhitta.mp4",
  ultimate3: "/characters/escanor/สกิลอัลติเมต/สกิลอัลติเมต 3 ดวงอาทิตย์จำลอง.mp4",
};

function alivePlayers(engine) {
  return Object.values(engine.players || {}).filter((p) => p && p.alive);
}
function enemies(engine, p) {
  return alivePlayers(engine).filter((o) => o.id !== p.id);
}
function isMorningTime(engine) {
  return !!(engine.dayTime && engine.dayTime());
}
function formOf(p) {
  if (!p || !p.alive) return "none";
  if (p.statuses?.escanorLastStand > 0 || p.escanorLastStandUsed) return "last";
  if ((p.escanorCharge || 0) > 0 && p.statuses?.escanorNoon > 0) return "noon";
  if (p.escanorForcedMorning > 0 || p.statuses?.escanorMorning > 0) return "morning";
  if (p.statuses?.escanorNight > 0) return "night";
  return "morning";
}
function isNoon(p) { return formOf(p) === "noon"; }
function isLast(p) { return formOf(p) === "last"; }
function isNight(p) { return formOf(p) === "night"; }
function displayImg(p) {
  const form = formOf(p);
  if (form === "last") return IMG.last;
  if (form === "noon") return IMG.noon;
  if (form === "night") return IMG.night;
  return IMG.morning;
}
function setStatus(p, key, turns, amount) {
  p.statuses = p.statuses || {};
  p.statusAmt = p.statusAmt || {};
  p.statuses[key] = turns;
  if (amount != null) p.statusAmt[key] = amount;
}
function clearForms(p) {
  if (!p.statuses) p.statuses = {};
  delete p.statuses.escanorMorning;
  delete p.statuses.escanorNight;
  delete p.statuses.escanorNoon;
}
function enterForm(engine, p, form) {
  const old = formOf(p);
  clearForms(p);
  if (form === "morning") {
    setStatus(p, "escanorMorning", 999, 1);
    p.escanorForcedMorning = Math.max(0, p.escanorForcedMorning || 0);
    if (old !== "morning") engine.triggerCutscene?.({ img: IMG.morning, video: FX.morning, title: "ESCANOR", label: "Morning Form", seconds: 8, music: null });
  } else if (form === "night") {
    setStatus(p, "escanorNight", 999, 1);
  } else if (form === "noon") {
    setStatus(p, "escanorNoon", 999, 1);
  }
}
function clampCharge(p) {
  p.escanorCharge = Math.max(0, Math.min(ESCANOR_CHARGE_MAX, p.escanorCharge || 0));
}
function useSolar(p, n = 1) {
  p.statuses = p.statuses || {};
  p.statusAmt = p.statusAmt || {};
  const have = p.statuses.escanorSolar || 0;
  if (have < n) return false;
  p.statuses.escanorSolar = have - n;
  p.statusAmt.escanorSolar = p.statuses.escanorSolar;
  p.escanorSolarIdle = 0;
  if (p.statuses.escanorSolar <= 0) {
    delete p.statuses.escanorSolar;
    delete p.statusAmt.escanorSolar;
  }
  return true;
}
function addSolar(p, n = 1) {
  p.statuses = p.statuses || {};
  p.statusAmt = p.statusAmt || {};
  p.statuses.escanorSolar = Math.min(SOLAR_MAX, (p.statuses.escanorSolar || 0) + n);
  p.statusAmt.escanorSolar = p.statuses.escanorSolar;
  p.escanorSolarIdle = 0;
}
function addBurn(engine, target, amount, source) {
  if (!target || !target.alive || amount <= 0) return 0;
  if (engine.friendlyEffectBlocked?.(target)) return 0;
  if (engine.resistActive?.(target)) {
    engine.log?.(`🛡️ ${target.name} ต้านสถานะลุกไหม้จาก ${source || "Escanor"}`);
    return 0;
  }
  target.statuses = target.statuses || {};
  const before = target.statuses.hburn || 0;
  target.statuses.hburn = Math.min(BURN_MAX, before + amount);
  const gained = target.statuses.hburn - before;
  if (gained > 0) engine.log?.(`🔥 ${target.name} ติดลุกไหม้ +${gained} จาก ${source || "Escanor"} (รวม ${target.statuses.hburn})`);
  return gained;
}
function forceBurnTicks(engine, target, ticks) {
  if (!target || !target.alive || ticks <= 0) return;
  const count = Math.min(ticks, target.statuses?.hburn || 0);
  if (count <= 0) return;
  target.statuses.hburn -= count;
  if (target.statuses.hburn <= 0) delete target.statuses.hburn;
  if (isLast(target)) {
    engine.log?.(`🔥 ${target.name} อยู่ใน Last Stand จึงไม่รับดาเมจจากลุกไหม้ที่ถูกบังคับทำงาน`);
    return;
  }
  for (let i = 0; i < count && target.alive; i++) {
    target._statusDamage = true;
    engine.dealMixed(target, 1);
    target._statusDamage = false;
  }
}
function totalBurn(engine) {
  return alivePlayers(engine).reduce((sum, p) => sum + (p.statuses?.hburn || 0), 0);
}
function cooldownSkillLoss(p) {
  return p.escanorNoonSkillLossRound || 0;
}
function skillByForm(engine, p, ch, tier) {
  const form = formOf(p);
  if (form === "last") return ch[`${tier}3`] || ch[tier];
  if (form === "night") return ch[`${tier}2`] || ch[tier];
  if (form === "noon") {
    const base = { ...(ch[tier] || {}) };
    if (tier === "basic") base.cost = 3;
    if (tier === "secondary") base.cost = 4;
    if (tier === "ultimate") base.cost = 7;
    return base;
  }
  return ch[tier];
}
function chooseTargets(engine, p, targetIds, count) {
  const byId = (targetIds || []).map((id) => engine.players[id]).filter((t) => t && t.alive && t.id !== p.id);
  if (byId.length) return byId.slice(0, count);
  return enemies(engine, p).slice(0, count);
}
function addWine(p, level = 1) {
  p.inventory = p.inventory || [];
  const wines = p.inventory.filter((it) => it.type === "wineBarrel");
  if (wines.length >= 3) return false;
  p.inventory.push({ type: "wineBarrel", name: `WineBarrel ${"I".repeat(level)}`, level, age: 0, img: "/characters/escanor/สกิลพื้นฐาน/Barrel.png" });
  return true;
}
function wineSellPrice(level) { return 4 + Math.max(1, Math.min(4, level || 1)); }

function onRoundStartTick(engine, p, prevNight) {
  if (!p || p.characterId !== ID || !p.alive) return;
  p.statuses = p.statuses || {};
  p.statusAmt = p.statusAmt || {};
  clampCharge(p);

  if (isLast(p)) {
    addBurn(engine, p, 4, "Last Stand");
    for (const o of enemies(engine, p)) addBurn(engine, o, 1, "Last Stand");
    engine.loseHp(p);
    if (p.hp <= 0) engine.instantDeath(p);
    return;
  }

  if (p.escanorForcedMorning > 0) {
    p.escanorForcedMorning -= 1;
    enterForm(engine, p, "morning");
  } else if (p.escanorCharge >= ESCANOR_CHARGE_MAX) {
    p.escanorCharge = ESCANOR_CHARGE_MAX;
    enterForm(engine, p, "noon");
  } else if (isMorningTime(engine)) {
    enterForm(engine, p, "morning");
    p.escanorCharge = Math.min(ESCANOR_CHARGE_MAX, (p.escanorCharge || 0) + 1);
    if (p.escanorCharge >= ESCANOR_CHARGE_MAX) enterForm(engine, p, "noon");
  } else {
    enterForm(engine, p, "night");
    engine.addSkill(p, 1);
  }

  if (p.inventory) {
    for (const it of p.inventory) {
      if (it.type !== "wineBarrel") continue;
      it.age = (it.age || 0) + 1;
      if (it.age >= 4 && (it.level || 1) < 4) { it.level += 1; it.age = 0; it.name = `WineBarrel ${"I".repeat(it.level)}`; }
    }
  }
}
function onEndTurnSolar(engine, p) {
  if (!p || p.characterId !== ID || !p.alive) return;
  if (isNoon(p)) {
    p.escanorCharge = Math.max(0, (p.escanorCharge || 0) - 1);
    if (p.escanorCharge <= 0) enterForm(engine, p, isMorningTime(engine) ? "morning" : "night");
  }
  if (isMorningTime(engine) && formOf(p) === "morning" && !p.didAttackRound && !p.isLoser) addSolar(p, 1);
  if (p.statuses?.escanorSolar > 0) {
    p.escanorSolarIdle = (p.escanorSolarIdle || 0) + 1;
    if (p.escanorSolarIdle >= 3) useSolar(p, p.statuses.escanorSolar);
  }
  if (p.statuses?.drunk > 0) {
    p.statuses.drunk -= 1;
    if (p.statuses.drunk <= 0) delete p.statuses.drunk;
  }
  if (p.statuses?.escanorCool > 0) {
    p.statuses.escanorCool -= 1;
    if (p.statuses.escanorCool <= 0) { delete p.statuses.escanorCool; delete p.statusAmt.escanorCool; }
  }
}
function armorBonus(p) { return p && p.characterId === "escanor" && ["morning", "noon"].includes(formOf(p)) ? 1 : 0; }
function maxHp(p) { return isLast(p) ? 6 : null; }
function adjustOutgoingDamage(engine, attacker, target, dmg) {
  if (!attacker || attacker.characterId !== ID) return dmg;
  const f = formOf(attacker);
  if (f === "night" || attacker.statuses?.escanorSun > 0) dmg = 0;
  if (f === "morning" || f === "noon") dmg += 1;
  if (f === "last") dmg += Math.floor(totalBurn(engine) / 5);
  if (attacker.statuses?.escanorSpear > 0) dmg += 1;
  if (attacker.statuses?.escanorFlareNoon > 0 || attacker.statuses?.escanorPunch > 0 || attacker.statuses?.escanorRhitta > 0) dmg += 1;
  return Math.max(0, dmg);
}
function adjustIncomingDamage(engine, p, n, isNormalAttack) {
  if (!p || p.characterId !== ID || n <= 0 || p._statusDamage) return n;
  if (p.statuses?.escanorCool > 0) n = Math.max(0, n - (p.statusAmt?.escanorCool || 1));
  if (isNoon(p) && !isNormalAttack && cooldownSkillLoss(p) !== engine.roundNumber) {
    p.escanorCharge = Math.max(0, (p.escanorCharge || 0) - 1);
    p.escanorNoonSkillLossRound = engine.roundNumber;
  }
  if (isLast(p)) n = Math.min(1, n);
  return n;
}
function tryNightDodge(engine, attacker, target) {
  if (!target || target.characterId !== ID || !isNight(target)) return false;
  if (Math.random() >= 0.5) return false;
  engine.log?.(`🌙 ${target.name} หลบการโจมตีในร่างกลางคืน`);
  return true;
}
function onAttackLanded(engine, attacker, target) {
  if (!attacker || attacker.characterId !== ID || !target || !target.alive) return;
  const f = formOf(attacker);
  if (f === "morning" || f === "noon") addBurn(engine, target, 1, "Escanor");
  if (f === "last") addBurn(engine, target, 2, "Last Stand");
  if (attacker.statuses?.escanorSpear > 0) { addBurn(engine, target, 1, "หอกเพลิงสุริยะ"); delete attacker.statuses.escanorSpear; }
  if (attacker.statuses?.escanorFlare > 0) { addBurn(engine, target, 1, "เพลิงปะทุ"); delete attacker.statuses.escanorFlare; }
  if (attacker.statuses?.escanorFlareNoon > 0) { addBurn(engine, target, 1, "เพลิงปะทุ Noon"); engine.applyDebuff(target, "nohealing", 2, 1); engine.addSkill(attacker, 1); delete attacker.statuses.escanorFlareNoon; }
  if (attacker.statuses?.escanorPunch > 0) { addBurn(engine, target, 2, "หมัดเพลิงสุริยัน"); delete attacker.statuses.escanorPunch; }
  if (attacker.statuses?.escanorRhitta > 0) { addBurn(engine, target, 1, "Divine Axe Rhitta"); delete attacker.statuses.escanorRhitta; }
  if (attacker.statuses?.escanorRhittaNoon > 0) { forceBurnTicks(engine, target, 2); delete attacker.statuses.escanorRhittaNoon; }
  if (attacker.statuses?.escanorSun > 0) {
    for (const o of enemies(engine, attacker)) if (o.id !== target.id) engine.dealMixed(o, 1, true);
    forceBurnTicks(engine, target, target.statuses?.hburn || 0);
    delete attacker.statuses.escanorSun;
  }
  if (isLast(attacker)) {
    delete attacker.statuses.hburn;
    engine.healHp(attacker, 1);
  }
}
function onAfterResolve(engine) {
  for (const p of alivePlayers(engine)) {
    if (p.characterId !== ID) continue;
    if (!isNoon(p) && !isLast(p)) continue;
    const lastAttacker = p.lastHitBy ? engine.players[p.lastHitBy] : null;
    if (lastAttacker && lastAttacker.alive) addBurn(engine, lastAttacker, 1, formOf(p) === "last" ? "Last Stand" : "Noon");
  }
}
function tryNoonRevive(engine, p) {
  if (!p || p.characterId !== ID || !isNoon(p) || p.escanorLastStandUsed) return false;
  p.escanorLastStandUsed = true;
  p.alive = true;
  p.hp = 6;
  p.armor = 0;
  p.statuses = p.statuses || {};
  p.statusAmt = p.statusAmt || {};
  clearForms(p);
  setStatus(p, "escanorLastStand", 999, 1);
  addBurn(engine, p, 4, "Last Stand");
  engine.triggerCutscene?.({ img: IMG.last, video: FX.last, title: "LAST STAND", label: "คืนชีพ", seconds: 10, music: null });
  engine.log?.(`☀️ ${p.name} ฟื้นคืนชีพเข้าสู่ Last Stand!`);
  return true;
}
function hburnImmune(p) { return p && p.characterId === ID && isLast(p); }
function hburnLabel(p) { return hburnImmune(p) ? "Last Stand ไม่รับดาเมจจากลุกไหม้" : null; }
function hburnHeals() { return false; }

function onCardDraw(engine, p) {
  if (!p || p.characterId !== ID || !p.alive || !(p.statuses?.drunk > 0)) return;
  if (Math.random() >= 0.2) return;
  const roll = Math.random();
  if (roll < 0.38) engine.applyDebuff(p, "nodraw", 1, 1);
  else if (roll < 0.75) engine.applyDebuff(p, "noskill", 1, 1);
  else engine.applyDebuff(p, "stun", 1, 1);
  engine.log?.(`🍷 ${p.name} มึนเมาจาก WineBarrel`);
}
function onSkillUsed(engine, p) { onCardDraw(engine, p); }
function prepareSkill(engine, p, tier, targets) {
  const ch = engine.CHAR_BY_ID[ID];
  const skill = skillByForm(engine, p, ch, tier);
  if (!skill) return null;
  if (["basic", "secondary"].includes(tier) && chooseTargets(engine, p, targets, 1).length === 0 && tier !== "basic") return null;
  if (skill.needSolar && !(p.statuses?.escanorSolar > 0)) { engine.log?.(`${p.name} ต้องมี Solar ก่อนใช้สกิลนี้`); return null; }
  if (tier === "secondary" && formOf(p) === "night") {
    const wines = (p.inventory || []).filter((it) => it.type === "wineBarrel");
    if (!wines.length) { engine.log?.(`${p.name} ไม่มี WineBarrel สำหรับ Sell`); return null; }
  }
  return skill;
}
function applySkill(engine, p, tier, targets) {
  const form = formOf(p);
  const targets1 = chooseTargets(engine, p, targets, 3);
  const t = targets1[0];
  if (tier === "basic") {
    if (form === "night") { addWine(p, 1); engine.log?.(`🍷 ${p.name} หมัก WineBarrel +1`); return; }
    if (form === "last") { for (const o of targets1) engine.dealMixed(o, 1); addBurn(engine, p, 1, "หอกเพลิงสุริยะ"); return; }
    if (!t) return;
    engine.triggerCutscene?.({ img: "/characters/escanor/สกิลพื้นฐาน/สกิลพื้นฐาน 1 บอลเพลิงสุริยะ.png.jpg", video: FX.basic1, title: "SUN FIREBALL", label: "สกิล", seconds: 8, music: null });
    engine.dealMixed(t, 1);
    addBurn(engine, t, form === "noon" ? 2 : 1, "บอลเพลิงสุริยะ");
    return;
  }
  if (tier === "secondary") {
    if (form === "night") {
      const wines = (p.inventory || []).filter((it) => it.type === "wineBarrel").sort((a, b) => (b.level || 1) - (a.level || 1));
      const it = wines[0];
      p.inventory.splice(p.inventory.indexOf(it), 1);
      p.gold = Math.min(engine.GOLD_MAX, (p.gold || 0) + wineSellPrice(it.level));
      engine.log?.(`🍷 ${p.name} ขาย WineBarrel Lv.${it.level || 1} ได้ ${wineSellPrice(it.level)} เหรียญ`);
      return;
    }
    if (form === "last") { setStatus(p, "escanorPunch", 999, 1); return; }
    if (form === "noon") { engine.loseHp(p); if (p.hp <= 0) engine.instantDeath(p); setStatus(p, "escanorFlareNoon", 999, 1); return; }
    setStatus(p, "escanorFlare", 999, 1);
    engine.triggerCutscene?.({ img: "/characters/escanor/สกิลรอง/สกิลรอง 1 เพลิงปะทุ.jpg", video: FX.secondary1, title: "FLARE", label: "สกิลรอง", seconds: 8, music: null });
    return;
  }
  if (tier === "ultimate") {
    if (form === "night") {
      const amt = p.statuses?.escanorSolar || 0;
      if (!amt) return;
      useSolar(p, amt);
      p.escanorForcedMorning = amt;
      enterForm(engine, p, "morning");
      return;
    }
    if (form === "last") { setStatus(p, "escanorSun", 999, 1); return; }
    if (form === "noon") { setStatus(p, "escanorRhittaNoon", 999, 1); return; }
    setStatus(p, "escanorRhitta", 999, 1);
  }
}
function useWineBarrel(engine, p, item) {
  if (!item || item.type !== "wineBarrel") return false;
  const level = Math.max(1, Math.min(4, item.level || 1));
  engine.healHp(p, level >= 3 ? 2 : 1);
  if (level >= 2) setStatus(p, "escanorCool", 2, level >= 4 ? 2 : 1);
  if (level >= 3) setStatus(p, "drunk", (p.statuses?.drunk || 0) + (level >= 4 ? 2 : 1), (p.statusAmt?.drunk || 0) + (level >= 4 ? 2 : 1));
  return true;
}

module.exports = {
  id: ID,
  ESCANOR_CHARGE_MAX,
  formOf,
  displayImg,
  onRoundStartTick,
  onEndTurnSolar,
  onCardDraw,
  onSkillUsed,
  prepareSkill,
  applySkill,
  dynamicSkillFor: skillByForm,
  armorBonus,
  maxHp,
  adjustOutgoingDamage,
  adjustIncomingDamage,
  tryNightDodge,
  onAttackLanded,
  onAfterResolve,
  tryNoonRevive,
  hburnImmune,
  hburnLabel,
  hburnHeals,
  useWineBarrel,
};
