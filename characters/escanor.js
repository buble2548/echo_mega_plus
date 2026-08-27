const ID = "escanor";
const ESCANOR_CHARGE_MAX = 12;
const LAST_STAND_HP = 7;
const SOLAR_MAX = 4;
const BURN_MAX = 6;
const WINE_MAX = 3;
let wineUidSeq = 0;

// ร่างกลางคืน: โอกาส 50/50 ที่จะรับความเสียหายจากการโจมตีปกติ 0 หน่วย (หลบพ้นไปเลย)
const NIGHT_DODGE_CHANCE = 0.5;

const IMG = {
  morning: "/characters/escanor/ร่าง เช้า Profile.png",
  night: "/characters/escanor/ร่าง กลางคืน Profile.png",
  noon: "/characters/escanor/ร่าง Noon Profile.png",
  last: "/characters/escanor/Last Stand Profile.png",
};

function alivePlayers(engine) {
  return Object.values(engine.players || {}).filter((p) => p && p.alive);
}
function enemies(engine, p) {
  return alivePlayers(engine).filter((o) => o.id !== p.id);
}
function isMorningTime(engine) {
  if (engine && typeof engine.dayTime === "function") return !!engine.dayTime();
  if (engine && typeof engine.isNightRound === "function") return !engine.isNightRound(engine.roundNumber || 0);
  return true;
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
function playCutscene(engine, p, key) {
  if (!p || !key || typeof engine?.triggerCutscene !== "function") return false;
  p.cutsceneShown = p.cutsceneShown || {};
  const firstTime = !p.cutsceneShown[key];
  engine.triggerCutscene(p, key);
  return firstTime;
}

function setStatus(p, key, turns, amount) {
  p.statuses = p.statuses || {};
  p.statusAmt = p.statusAmt || {};
  p.statuses[key] = turns;
  if (amount != null) p.statusAmt[key] = amount;
}
function clearStatus(p, key) {
  if (p.statuses) delete p.statuses[key];
  if (p.statusAmt) delete p.statusAmt[key];
}
function clearForms(p) {
  if (!p.statuses) p.statuses = {};
  clearStatus(p, "escanorMorning");
  clearStatus(p, "escanorNight");
  clearStatus(p, "escanorNoon");
}
function enterForm(engine, p, form) {
  const old = formOf(p);
  clearForms(p);
  if (form === "morning") {
    setStatus(p, "escanorMorning", 999, 1);
    p.escanorForcedMorning = Math.max(0, p.escanorForcedMorning || 0);
    if (old !== "morning") playCutscene(engine, p, "escanorMorning");
  } else if (form === "night") {
    setStatus(p, "escanorNight", 999, 1);
  } else if (form === "noon") {
    setStatus(p, "escanorNoon", 999, 1);
  }
}
function clampCharge(p) {
  p.escanorCharge = Math.max(0, Math.min(ESCANOR_CHARGE_MAX, p.escanorCharge || 0));
}
function leaveNoon(engine, p) {
  enterForm(engine, p, p.escanorForcedMorning > 0 || isMorningTime(engine) ? "morning" : "night");
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
    // เป้าหมายอาจเพิ่งคืนชีพเป็น Last Stand จาก tick ก่อนหน้า ต้องหยุดดาเมจที่เหลือทันที
    if (isLast(target)) {
      engine.log?.(`🔥 ${target.name} เข้าสู่ Last Stand จึงไม่รับดาเมจลุกไหม้ที่เหลือ`);
      break;
    }
    target._statusDamage = true;
    engine.dealMixed(target, 1);
    target._statusDamage = false;
    resolveDamageAftermath(engine, target);
  }
}
function resolveDamageAftermath(engine, target) {
  if (!target) return;
  if (typeof engine.resolveDamageAftermath === "function") {
    engine.resolveDamageAftermath(target);
  } else if (target.alive && target.hp <= 0) {
    engine.instantDeath?.(target);
  }
}
function dealSkillDamage(engine, target, amount) {
  if (!target || !target.alive || amount <= 0) return;
  engine.dealMixed(target, amount, false);
  resolveDamageAftermath(engine, target);
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
    if (tier === "ultimate") base.cost = 8;
    return base;
  }
  return ch[tier];
}
function chooseTargets(engine, p, targetIds, count) {
  const requested = Array.isArray(targetIds) && targetIds.length > 0;
  const allowed = (t) => t && t.alive && t.id !== p.id && !engine.friendlyEffectBlocked?.(t);
  const byId = (targetIds || []).map((id) => engine.players[id]).filter(allowed);
  if (requested) return byId.slice(0, count);
  return enemies(engine, p).filter(allowed).slice(0, count);
}
function randomTargets(engine, p, count) {
  const pool = enemies(engine, p).filter((target) => !engine.friendlyEffectBlocked?.(target));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}
function addWine(p, level = 1) {
  p.inventory = p.inventory || [];
  const wines = p.inventory.filter((it) => it.type === "wineBarrel");
  if (wines.length >= WINE_MAX) return false;
  const safeLevel = Math.max(1, Math.min(4, level || 1));
  const roman = ["", "I", "II", "III", "IV"][safeLevel];
  p.inventory.push({ uid: `wine_${p.id || "player"}_${Date.now()}_${++wineUidSeq}`, type: "wineBarrel", name: `WineBarrel ${roman}`, level: safeLevel, age: 0, img: "/characters/escanor/สกิลพื้นฐาน/Barrel.png" });
  return true;
}
function wineSellPrice(level) { return 1 + Math.max(1, Math.min(4, level || 1)); }

function tickWineBarrels(engine, p) {
  p.inventory = p.inventory || [];
  for (const it of p.inventory) {
    if (it.type !== "wineBarrel") continue;
    it.age = (it.age || 0) + 1;
    if (it.age >= 4 && (it.level || 1) < 4) {
      it.level += 1;
      it.age = 0;
      it.name = `WineBarrel ${["", "I", "II", "III", "IV"][it.level]}`;
    }
  }
  const pending = Math.max(0, p.escanorPendingWine || 0);
  if (pending > 0) p.escanorPendingWine = 0;
  for (let i = 0; i < pending; i++) {
    if (addWine(p, 1)) engine.log?.(`🍷 ${p.name} ได้รับ WineBarrel I ที่หมักไว้`);
    else engine.log?.(`🍷 ${p.name} ไม่ได้รับ WineBarrel เพราะกระเป๋าไวน์เต็ม ${WINE_MAX} ชิ้น`);
  }
}

function onRoundStartTick(engine, p, prevNight) {
  if (!p || !p.alive) return;
  // WineBarrel ยังต้องบ่มต่อเมื่อถูกขโมยไปอยู่ในกระเป๋าของตัวละครอื่น
  tickWineBarrels(engine, p);
  if (p.characterId !== ID) return;
  p.statuses = p.statuses || {};
  p.statusAmt = p.statusAmt || {};
  clampCharge(p);

  if (isLast(p)) {
    addBurn(engine, p, 4, "Last Stand");
    for (const o of enemies(engine, p)) addBurn(engine, o, 2, "Last Stand");
    engine.loseHp(p);
    resolveDamageAftermath(engine, p); // ต้องผ่านระบบกันตายกลาง (beatSave/beatMode/eva3) เหมือนดาเมจก้อนอื่นทั้งเกม
    return;
  }

  // เมื่อเข้า Noon แล้ว ห้ามเวลา/Forced Morning แทรกเปลี่ยนร่างจนกว่าชาร์จจะหมดจริง
  if (isNoon(p)) {
    enterForm(engine, p, "noon");
  } else if (p.escanorCharge >= ESCANOR_CHARGE_MAX) {
    p.escanorCharge = ESCANOR_CHARGE_MAX;
    enterForm(engine, p, "noon");
  } else if (p.escanorForcedMorning > 0 || isMorningTime(engine)) {
    // ร่าง Morning ได้ชาร์จ +1/เทิร์นเสมอ ไม่ว่าจะมาจากเวลากลางวันหรือจาก "สุริยาไม่สิ้นแสง"
    enterForm(engine, p, "morning");
    p.escanorCharge = Math.min(ESCANOR_CHARGE_MAX, (p.escanorCharge || 0) + 1);
    if (p.escanorCharge >= ESCANOR_CHARGE_MAX) enterForm(engine, p, "noon");
  } else {
    enterForm(engine, p, "night");
    engine.addSkill(p, 1);
  }

}
function onEndTurnSolar(engine, p) {
  if (!p || p.characterId !== ID || !p.alive) return;
  if (isNoon(p)) {
    p.escanorCharge = Math.max(0, (p.escanorCharge || 0) - 1);
    if (p.escanorCharge <= 0) leaveNoon(engine, p);
  }
  const receivedSolar = !isLast(p) && (p.isLoser || !p.didAttackRound);
  if (receivedSolar) addSolar(p, 1);
  if (p.escanorForcedMorning > 0) {
    // Noon มีลำดับความสำคัญสูงกว่า จึงพักการใช้ Solar จนกว่าจะกลับมาเป็น Morning จริง
    if (isNoon(p) || isLast(p)) return;
    const spent = useSolar(p, 1);
    if (spent) engine.log?.(`☀️ ${p.name} ใช้ Solar 1 หน่วยเพื่อคงร่าง Morning`);
    if (!spent || !(p.statuses?.escanorSolar > 0)) {
      p.escanorForcedMorning = 0;
      if (!isNoon(p) && !isLast(p)) {
        enterForm(engine, p, isMorningTime(engine) ? "morning" : "night");
      }
    }
    return;
  }
  if (!receivedSolar && p.statuses?.escanorSolar > 0) {
    p.escanorSolarIdle = (p.escanorSolarIdle || 0) + 1;
    if (p.escanorSolarIdle >= 3) {
      useSolar(p, 1);
      engine.log?.(`☀️ ${p.name} ไม่ได้รับ Solar เพิ่มครบ 3 เทิร์น — Solar ลดลง 1 หน่วย`);
    }
  }
}
function armorBonus(p) { return p && p.characterId === "escanor" && ["morning", "noon"].includes(formOf(p)) ? 1 : 0; }
function maxHp(p) { return isLast(p) ? LAST_STAND_HP : null; }
function maxArmor(p) { return isLast(p) ? 0 : null; }
function adjustOutgoingDamage(engine, attacker, target, dmg) {
  if (!attacker || attacker.characterId !== ID) return dmg;
  const f = formOf(attacker);
  if (attacker.statuses?.escanorSun > 0) return 0;
  if (f === "night") dmg = 0;
  if (f === "last") dmg = 0;
  if (f === "morning" || f === "noon") dmg += 1;
  if (f === "last") dmg += Math.floor(totalBurn(engine) / 5);
  if (attacker.statuses?.escanorPunch > 0) dmg += 1;
  return Math.max(0, dmg);
}
function adjustIncomingDamage(engine, p, n, isNormalAttack) {
  if (!p || p.characterId !== ID || n <= 0 || p._statusDamage) return n;
  if (n > 0 && isNoon(p) && !isNormalAttack && cooldownSkillLoss(p) !== engine.roundNumber) {
    p.escanorCharge = Math.max(0, (p.escanorCharge || 0) - 1);
    p.escanorNoonSkillLossRound = engine.roundNumber;
    if (p.escanorCharge <= 0) leaveNoon(engine, p);
  }
  if (isLast(p)) n = Math.min(1, n);
  return n;
}
function tryNightDodge(engine, attacker, target) {
  if (!target || target.characterId !== ID || !isNight(target)) return false;
  if (Math.random() >= NIGHT_DODGE_CHANCE) {
    engine.log?.(`💢 ${target.name} พยายามหลบในร่างกลางคืน (${NIGHT_DODGE_CHANCE * 100}%) แต่ไม่พ้น`);
    return false;
  }
  // patch 2.1.3.5: ถูกโจมตีไม่ได้แต้มสกิลอีกต่อไป (แม้หลบพ้น)
  target.wasAttacked = true;
  engine.log?.(`🌙 หลบหลีก! ${target.name} หลบการโจมตีของ ${attacker.name} ในร่างกลางคืนได้ — รับความเสียหาย 0 หน่วย`);
  // ต้องจบฉากโจมตีให้ครบเหมือนกลไกหลบของตัวอื่น (oguri/appleguy) ไม่งั้น doAttack จะ return ทิ้งไว้
  //  โดยที่ gameState ยังเป็น "ATTACK" และไม่มี timer เดินอยู่ = เทิร์นค้าง (บั๊กเดิม "หลบไม่ได้จริง")
  engine.setLastAttack({
    byName: attacker.name, byImg: engine.displayImg(attacker), byColor: engine.POSITION_COLORS[attacker.position] || "#888",
    byDoomWeapon: attacker.characterId === "doomguy" ? attacker.doomWeapon : undefined,
    targetName: target.name, targetImg: engine.displayImg(target), targetColor: engine.POSITION_COLORS[target.position] || "#888",
    dmg: 0, dodge: true,
    skills: [{ name: `ร่างกลางคืน (หลบพ้น ${NIGHT_DODGE_CHANCE * 100}%)`, img: IMG.night, by: target.name, color: engine.POSITION_COLORS[target.position] || "#888", side: "def" }],
  });
  engine.runCutsceneQueue(() => {
    engine.setGameState("ATTACKING");
    engine.startPhaseTimer(engine.ATTACKFX_TIME, engine.endTurn);
    engine.broadcastState();
  });
  return true;
}
function onAttackLanded(engine, attacker, target) {
  if (!attacker || attacker.characterId !== ID || !target) return false;
  const f = formOf(attacker);
  let videoQueued = false;
  if (attacker.statuses?.escanorFlare > 0 || attacker.statuses?.escanorFlareNoon > 0) {
    videoQueued = playCutscene(engine, attacker, "escanorSecondary1") || videoQueued;
  }
  if (attacker.statuses?.escanorRhitta > 0 || attacker.statuses?.escanorRhittaNoon > 0) {
    videoQueued = playCutscene(engine, attacker, "escanorUltimate1") || videoQueued;
  }
  if (attacker.statuses?.escanorPunch > 0) {
    videoQueued = playCutscene(engine, attacker, "escanorSecondary3") || videoQueued;
  }
  if (attacker.statuses?.escanorSun > 0) {
    videoQueued = playCutscene(engine, attacker, "escanorUltimate3") || videoQueued;
  }
  if (f === "morning" || f === "noon") addBurn(engine, target, 1, "Escanor");
  if (f === "last") addBurn(engine, target, 2, "Last Stand");
  if (attacker.statuses?.escanorFlare > 0) { addBurn(engine, target, 1, "เพลิงปะทุ"); clearStatus(attacker, "escanorFlare"); }
  if (attacker.statuses?.escanorFlareNoon > 0) { addBurn(engine, target, 2, "เพลิงปะทุ Noon"); engine.applyDebuff(target, "nohealing", 2, 1); clearStatus(attacker, "escanorFlareNoon"); }
  if (attacker.statuses?.escanorPunch > 0) { addBurn(engine, target, 2, "หมัดเพลิงสุริยัน"); clearStatus(attacker, "escanorPunch"); }
  if (attacker.statuses?.escanorRhitta > 0) { addBurn(engine, target, 2, "Divin Axe Rhitta"); clearStatus(attacker, "escanorRhitta"); }
  if (attacker.statuses?.escanorRhittaNoon > 0) { forceBurnTicks(engine, target, 2); clearStatus(attacker, "escanorRhittaNoon"); }
  if (attacker.statuses?.escanorSun > 0) {
    for (const o of enemies(engine, attacker)) if (o.id !== target.id) dealSkillDamage(engine, o, 1);
    forceBurnTicks(engine, target, target.statuses?.hburn || 0);
    clearStatus(attacker, "escanorSun");
  }
  if (isLast(attacker)) {
    delete attacker.statuses.hburn;
    engine.healHp(attacker, 1);
  }
  return videoQueued;
}
function onNormalAttackReceived(engine, attacker, target, formBeforeHit) {
  if (!target || target.characterId !== ID || !attacker?.alive) return;
  if (formBeforeHit === "noon" || formBeforeHit === "last") {
    addBurn(engine, attacker, 1, formBeforeHit === "last" ? "Last Stand" : "Noon");
  }
}
function onAfterResolve(engine) {
  for (const p of alivePlayers(engine)) {
    if (p.characterId !== ID) continue;
    if (p.statuses?.escanorSpearBurst > 0) {
      delete p.statuses.escanorSpearBurst;
      if (p.statusAmt) delete p.statusAmt.escanorSpearBurst;
      if (isLast(p)) {
        const resolveBurst = () => {
          const targets = randomTargets(engine, p, 3);
          for (const target of targets) dealSkillDamage(engine, target, 1);
          addBurn(engine, p, 1, "Escanor Spear");
          engine.log?.("Escanor Spear Burst - hit " + targets.length + " targets");
        };
        if (typeof engine.withEffectSource === "function") engine.withEffectSource(p, resolveBurst);
        else resolveBurst();
      }
    }
  }
}
function tryNoonRevive(engine, p) {
  if (!p || p.characterId !== ID || !isNoon(p) || p.escanorLastStandUsed) return false;
  p.escanorLastStandUsed = true;
  p.escanorCharge = 0;
  p.escanorForcedMorning = 0;
  p.alive = true;
  p.hp = Math.max(1, LAST_STAND_HP - (p.maxHpPenalty || 0));
  p.armor = 0;
  p.statuses = p.statuses || {};
  p.statusAmt = p.statusAmt || {};
  clearForms(p);
  setStatus(p, "escanorLastStand", 999, 1);
  addBurn(engine, p, 4, "Last Stand");
  playCutscene(engine, p, "escanorLastStand");
  engine.log?.(`☀️ ${p.name} ฟื้นคืนชีพเข้าสู่ Last Stand!`);
  return true;
}
// ไพ่แตกในร่าง Last Stand: ไม่รับความเสียหายจากการที่ไพ่แตก (ยังได้แต้มสกิลจากการแพ้ตามปกติ)
function bustDamageImmune(p) { return p && p.characterId === ID && isLast(p); }
function hburnImmune(p) { return p && p.characterId === ID && isLast(p); }
function hburnLabel(p) { return hburnImmune(p) ? "Last Stand ไม่รับดาเมจจากลุกไหม้" : null; }
function hburnHeals() { return false; }

// มึนเมา (drunk): มาจาก WineBarrel ซึ่งถูกขโมยไปใช้ได้ -> ผลต้องทำงานกับทุกตัวละคร ไม่ผูกกับ characterId
function onCardDraw(engine, p) {
  if (!p || !p.alive || !(p.statuses?.drunk > 0)) return;
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
  const form = formOf(p);
  if (tier === "basic" && (form === "morning" || form === "noon") &&
      (!(Array.isArray(targets) && targets.length > 0) || chooseTargets(engine, p, targets, 1).length === 0)) {
    engine.log?.(`${p.name} ต้องเลือกผู้เล่นเป้าหมายของบอลเพลิงสุริยะ`);
    return null;
  }
  if (skill.needSolar && !(p.statuses?.escanorSolar > 0)) { engine.log?.(`${p.name} ต้องมี Solar ก่อนใช้สกิลนี้`); return null; }
  if (tier === "basic" && form === "night") {
    const wineCount = (p.inventory || []).filter((it) => it.type === "wineBarrel").length + (p.escanorPendingWine || 0);
    if (wineCount >= WINE_MAX) { engine.log?.(`${p.name} มี WineBarrel เต็ม ${WINE_MAX} ชิ้นแล้ว`); return null; }
  }
  if (tier === "secondary" && form === "night") {
    const wines = (p.inventory || []).filter((it) => it.type === "wineBarrel");
    if (!wines.length) { engine.log?.(`${p.name} ไม่มี WineBarrel สำหรับ Sell`); return null; }
  }
  const pendingSecondary = form === "noon" ? "escanorFlareNoon" : form === "last" ? "escanorPunch" : form === "morning" ? "escanorFlare" : null;
  if (tier === "secondary" && pendingSecondary && (p.statuses?.[pendingSecondary] || 0) > 0) {
    engine.log?.(`${p.name} มีผลของสกิลรองรอการโจมตีอยู่แล้ว`);
    return null;
  }
  return skill;
}
function applySkill(engine, p, tier, targets) {
  const form = formOf(p);
  const targets1 = chooseTargets(engine, p, targets, 3);
  const t = targets1[0];
  if (tier === "basic") {
    if (form === "night") { p.escanorPendingWine = (p.escanorPendingWine || 0) + 1; engine.log?.(`🍷 ${p.name} เริ่มหมัก WineBarrel I ซึ่งจะได้รับต้นเทิร์นถัดไป`); return; }
    if (form === "last") { setStatus(p, "escanorSpearBurst", 1, 1); return; }
    if (!t) return;
    if (form === "noon") {
      engine.loseHp(p);
      resolveDamageAftermath(engine, p); // กันตาย/Beat Mode ต้องได้ลุ้นก่อนตกรอบจากค่าใช้จ่ายของสกิลตัวเอง
      if (!p.alive || !isNoon(p)) return;
    }
    playCutscene(engine, p, "escanorBasic1");
    dealSkillDamage(engine, t, 1);
    addBurn(engine, t, form === "noon" ? 2 : 1, "บอลเพลิงสุริยะ");
    return;
  }
  if (tier === "secondary") {
    if (form === "night") {
      const wines = (p.inventory || []).filter((it) => it.type === "wineBarrel").sort((a, b) => (b.level || 1) - (a.level || 1));
      const it = wines[0];
      p.inventory.splice(p.inventory.indexOf(it), 1);
      engine.addGold(p, wineSellPrice(it.level));
      engine.log?.(`🍷 ${p.name} ขาย WineBarrel Lv.${it.level || 1} ได้ ${wineSellPrice(it.level)} เหรียญ`);
      return;
    }
    if (form === "last") { setStatus(p, "escanorPunch", 999, 1); return; }
    if (form === "noon") {
      engine.loseHp(p);
      resolveDamageAftermath(engine, p); // กันตาย/Beat Mode ต้องได้ลุ้นก่อนตกรอบจากค่าใช้จ่ายของสกิลตัวเอง
      if (p.alive && isNoon(p)) setStatus(p, "escanorFlareNoon", 999, 1);
      return;
    }
    setStatus(p, "escanorFlare", 999, 1);
    return;
  }
  if (tier === "ultimate") {
    if (form === "night") {
      const amt = p.statuses?.escanorSolar || 0;
      if (!amt) return;
      p.escanorForcedMorning = 1;
      p.escanorSolarIdle = 0;
      enterForm(engine, p, "morning");
      return;
    }
    if (form === "last") { setStatus(p, "escanorSun", 999, 1); return; }
    setStatus(p, "escanorRhitta", 999, 1);
    if (form === "noon") setStatus(p, "escanorRhittaNoon", 999, 1);
  }
}
function useWineBarrel(engine, p, item) {
  if (!item || item.type !== "wineBarrel") return false;
  const level = Math.max(1, Math.min(4, item.level || 1));
  engine.healHp(p, level >= 4 ? 3 : level >= 3 ? 2 : 1);
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
  maxArmor,
  adjustOutgoingDamage,
  adjustIncomingDamage,
  tryNightDodge,
  onAttackLanded,
  onNormalAttackReceived,
  onAfterResolve,
  tryNoonRevive,
  bustDamageImmune,
  hburnImmune,
  hburnLabel,
  hburnHeals,
  useWineBarrel,
};
