// ============================================================
//  Hisakawa Sister - one player slot, two separate twins
// ============================================================

const BASE = "/characters/hisakawa_sister";
const TWIN_MAX_HP = 3;
const TWIN_MAX_ARMOR = 2;
const STAGE_TURNS = 5;
const TALENT_TURNS = 5;
const DREAM_TURNS = 5;
const LIMIT_TURNS = 3;
const REVIVE_COST = 6;
const SWITCH_COST = 1;
const TWIN_KEYS = ["nagi", "hayate"];

const PATHS = {
  select: `${BASE}/hisakawa_sister.webp`,
  nagi: `${BASE}/nagi/nagi.png`,
  hayate: `${BASE}/hayate/hayate.png`,
  switchToHayate: `${BASE}/skill1/hasakawa_skill1.1_hayate.png`,
  switchToNagi: `${BASE}/skill1/hasakawa_skill1.1_nagi.png`,
  revive: `${BASE}/skill1/hasakawa_skill1.2.png`,
  nagiSkill2: `${BASE}/nagi/skill2/nagi_skill2.png`,
  hayateSkill2: `${BASE}/hayate/skill2/hayate_skill2.png`,
  nagiSkill3: `${BASE}/nagi/skill3/nagi_skill3.png`,
  hayateSkill3: `${BASE}/hayate/skill3/hayate_skill3.png`,
  sunday: `${BASE}/skill3/hisakawa_skill3.jpg`,
  sundayVideo: `${BASE}/skill3/hisakawa_skill3.mp4`,
  sundayBg: `${BASE}/skill3/hisakawa_skill3_background.webp`,
};

function clone(obj) {
  return { ...(obj || {}) };
}

function makeTwin(key) {
  return {
    key,
    name: key === "nagi" ? "นากิ ฮิซากาว่า" : "ฮายาเตะ ฮิซากาว่า",
    img: key === "nagi" ? PATHS.nagi : PATHS.hayate,
    hp: TWIN_MAX_HP,
    armor: TWIN_MAX_ARMOR,
    alive: true,
    statuses: {},
    statusAmt: {},
  };
}

function ensure(p, opts = {}) {
  if (!p || p.characterId !== "hisakawa_sister") return null;
  if (!p.hisakawa) {
    p.hisakawa = {
      active: "nagi",
      controlTurns: 0,
      twins: { nagi: makeTwin("nagi"), hayate: makeTwin("hayate") },
    };
  }
  for (const key of TWIN_KEYS) if (!p.hisakawa.twins[key]) p.hisakawa.twins[key] = makeTwin(key);
  if (!opts.keepActive && (!p.hisakawa.active || !p.hisakawa.twins[p.hisakawa.active]?.alive)) {
    const live = TWIN_KEYS.find((key) => p.hisakawa.twins[key]?.alive);
    if (live) p.hisakawa.active = live;
  }
  return p.hisakawa;
}

function twinOf(p, key) {
  const h = ensure(p);
  return h ? h.twins[key || h.active] : null;
}

function activeTwin(p) {
  const h = ensure(p);
  return h ? h.twins[h.active] : null;
}

function otherKey(key) {
  return key === "nagi" ? "hayate" : "nagi";
}

function otherTwin(p) {
  const h = ensure(p);
  return h ? h.twins[otherKey(h.active)] : null;
}

function liveTwins(p) {
  const h = ensure(p);
  return h ? TWIN_KEYS.map((key) => h.twins[key]).filter((t) => t.alive) : [];
}

function bothAlive(p) {
  return liveTwins(p).length === 2;
}

function anyTwinDead(p) {
  const h = ensure(p);
  return !!h && TWIN_KEYS.some((key) => !h.twins[key].alive);
}

function syncIn(p) {
  const t = activeTwin(p);
  if (!t) return;
  p.hp = t.hp;
  p.armor = t.armor;
  p.statuses = clone(t.statuses);
  p.statusAmt = clone(t.statusAmt);
}

function syncOut(p) {
  const t = activeTwin(p);
  if (!t) return;
  t.hp = Math.max(0, p.hp || 0);
  t.armor = Math.max(0, p.armor || 0);
  t.alive = p.alive !== false && t.hp > 0;
  t.statuses = clone(p.statuses);
  t.statusAmt = clone(p.statusAmt);
}

function statusOn(t, key) {
  return ((t && t.statuses && t.statuses[key]) || 0) > 0;
}

function skillStatus(skill) {
  return skill?.status || skill?.effect?.status;
}

function applyStatus(t, key, turns, amount) {
  if (!t || !t.alive) return;
  t.statuses[key] = Math.max(t.statuses[key] || 0, turns);
  if (amount != null) {
    t.statusAmt = t.statusAmt || {};
    t.statusAmt[key] = Math.max(t.statusAmt[key] || 0, amount);
  }
}

function addFortune(t, n = 1) {
  if (!t || !t.alive) return;
  t.statuses.fortune = Math.min(3, (t.statuses.fortune || 0) + n);
}

function damageTwin(t, n) {
  for (let i = 0; i < n && t.alive; i++) {
    if (t.armor > 0) t.armor--;
    else t.hp--;
    if (t.hp <= 0) {
      t.hp = 0;
      t.alive = false;
    }
  }
}

function clearCoupleBuffs(p) {
  const h = ensure(p);
  if (!h) return;
  for (const t of Object.values(h.twins)) {
    delete t.statuses.hisakawaStage;
    delete t.statuses.hisakawaTalent;
    delete t.statuses.hisakawaDream;
  }
  delete p.statuses.hisakawaStage;
  delete p.statuses.hisakawaTalent;
  delete p.statuses.hisakawaDream;
}

function publicTwin(t, active) {
  return {
    key: t.key,
    name: t.name,
    img: t.img,
    hp: t.hp,
    maxHp: TWIN_MAX_HP,
    armor: t.armor,
    maxArmor: TWIN_MAX_ARMOR,
    alive: !!t.alive,
    active: !!active,
    statuses: clone(t.statuses),
    statusAmt: clone(t.statusAmt),
  };
}

function skillVoice(p, tier, skill) {
  const h = ensure(p);
  if (!h) return null;
  const voiceTwin = tier === "basic" ? otherKey(h.active) : h.active;
  if (tier === "ultimate" && skill?.status === "hisakawaDream") return null;
  const n = tier === "ultimate" ? 3 : tier === "secondary" ? 2 : 1;
  return `hisakawa_${voiceTwin}_${n}`;
}

module.exports = {
  id: "hisakawa_sister",
  PATHS,
  TWIN_MAX_HP,
  TWIN_MAX_ARMOR,
  REVIVE_COST,
  SWITCH_COST,

  init(p) {
    ensure(p);
    syncIn(p);
  },

  syncIn,
  syncOut,
  activeTwin,
  otherTwin,
  bothAlive,
  anyTwinDead,

  maxHp() { return TWIN_MAX_HP; },
  maxArmor() { return TWIN_MAX_ARMOR; },
  displayImg(p) {
    const t = activeTwin(p);
    return t ? t.img : PATHS.select;
  },

  publicState(p) {
    const h = ensure(p);
    if (!h) return null;
    return {
      active: h.active,
      controlTurns: h.controlTurns || 0,
      twins: TWIN_KEYS.map((key) => publicTwin(h.twins[key], key === h.active)),
    };
  },

  dynamicSkillFor(p, ch, tier) {
    const h = ensure(p);
    if (!h) return ch[tier];
    if (tier === "basic") return anyTwinDead(p) ? ch.basic2 : ch.basic;
    if (tier === "secondary") return h.active === "nagi" ? ch.secondary : ch.secondary2;
    if (tier === "ultimate") {
      const t = activeTwin(p);
      if (statusOn(t, "hisakawaStage") && statusOn(t, "hisakawaTalent")) return ch.ultimate3;
      return h.active === "nagi" ? ch.ultimate : ch.ultimate2;
    }
    return ch[tier];
  },

  canUseSkill(engine, p, tier, skill) {
    const h = ensure(p);
    if (!h) return false;
    const t = h.twins[h.active];
    if (!t || !t.alive) return false;
    if (tier === "basic" && skillStatus(skill) === "hisakawaSwitch") return (p.hisakawaSwitchedRound || 0) !== engine.roundNumber && bothAlive(p);
    if (tier === "basic" && skillStatus(skill) === "hisakawaRevive") return anyTwinDead(p);
    if (tier === "secondary" && skillStatus(skill) === "hisakawaLimit") return h.active === "nagi" && !statusOn(t, "hisakawaLimit");
    if (tier === "secondary" && skillStatus(skill) === "hisakawaTempo") return h.active === "hayate" && !statusOn(t, "hisakawaTempo");
    if (tier === "ultimate" && skillStatus(skill) === "hisakawaDream") return statusOn(t, "hisakawaStage") && statusOn(t, "hisakawaTalent");
    return true;
  },

  applySkill(engine, p, tier, skill) {
    const h = ensure(p);
    const active = h.twins[h.active];
    const other = h.twins[otherKey(h.active)];
    let suffix = "";
    if (skillStatus(skill) === "hisakawaSwitch") {
      p.hisakawaSwitchedRound = engine.roundNumber;
      const outgoing = active;
      outgoing.hp = Math.min(TWIN_MAX_HP, outgoing.hp + 2);
      syncOut(p);
      h.active = other.key;
      h.controlTurns = 0;
      if (statusOn(outgoing, "hisakawaLimit") && other.key === "hayate") {
        addFortune(other, 1);
        suffix = " — ฮายาเตะได้รับโชคลาภ +1";
      }
      syncIn(p);
      engine.log(`🔁 ${p.name} สลับตัวเป็น ${other.name} — ${outgoing.name} ฟื้นพลังชีวิต 2 หน่วย${suffix}`);
    } else if (skillStatus(skill) === "hisakawaRevive") {
      const dead = TWIN_KEYS.map((key) => h.twins[key]).find((t) => !t.alive);
      if (!dead) return "";
      dead.alive = true;
      dead.hp = TWIN_MAX_HP;
      dead.armor = 0;
      dead.statuses = {};
      dead.statusAmt = {};
      engine.log(`💫 ${p.name} ปลุก ${dead.name} กลับมาสู้ต่อ (${dead.hp}/${TWIN_MAX_HP}, เกราะ 0)`);
    } else if (skillStatus(skill) === "hisakawaLimit") {
      applyStatus(active, "hisakawaLimit", LIMIT_TURNS);
      syncIn(p);
      engine.log(`🧡 ${active.name} อย่าทำอะไรเกินตัวสิ — ดาเมจที่ได้รับเบาลง 1 และโจมตีติดผกผัน`);
    } else if (skillStatus(skill) === "hisakawaTempo") {
      applyStatus(active, "hisakawaTempo", 999);
      syncIn(p);
      engine.log(`💨 ${active.name} จังหวะนี้แหละ — หากแต้มต่ำสุดแบบไม่เสมอ จะได้โจมตีหลังผู้ชนะ`);
    } else if (skillStatus(skill) === "hisakawaStage") {
      for (const t of Object.values(h.twins)) applyStatus(t, "hisakawaStage", STAGE_TURNS);
      syncIn(p);
      engine.log(`🎤 ${p.name} Miracle Live — เปิดเวทีของพวกเรา ${STAGE_TURNS} เทิร์น`);
    } else if (skillStatus(skill) === "hisakawaTalent") {
      for (const t of Object.values(h.twins)) applyStatus(t, "hisakawaTalent", TALENT_TURNS);
      syncIn(p);
      engine.log(`💃 ${p.name} Miracle Dance — พรสวรรค์ของพวกเราเพิ่มพลังโจมตี +2`);
    } else if (skillStatus(skill) === "hisakawaDream") {
      for (const t of Object.values(h.twins)) {
        delete t.statuses.hisakawaStage;
        delete t.statuses.hisakawaTalent;
        applyStatus(t, "hisakawaDream", DREAM_TURNS);
      }
      p.transformAt = engine.nextTransformCounter();
      syncIn(p);
      engine.queueCutscene(p, "hisakawaSunday");
      engine.log(`🎁 ${p.name} O-KU-RI-MO-NO-Sunday — รวมเวทีและพรสวรรค์เป็นฝันของเหล่าฝาแฝด`);
    }
    return suffix;
  },

  skillVoice,

  adjustIncomingDamage(engine, p, n) {
    const t = activeTwin(p);
    if (!t || !statusOn(t, "hisakawaLimit")) return n;
    return Math.max(0, n - 1);
  },

  damageBonus(engine, attacker, target, ctx) {
    const t = activeTwin(attacker);
    if (!t) return 0;
    let bonus = 0;
    if (statusOn(t, "hisakawaTalent") || statusOn(t, "hisakawaDream")) bonus += 2;
    if (ctx) ctx.hisakawaActiveTwin = t.key;
    return bonus;
  },

  onAttackLanded(engine, attacker, target) {
    const t = activeTwin(attacker);
    if (!t) return [];
    const skills = [];
    if (t.key === "nagi" && statusOn(t, "hisakawaLimit") && target.alive) {
      if (engine.applyDebuff(target, "invert", null, 3)) engine.log(`🔄 ${t.name} มอบสถานะผกผันให้ ${target.name} 3 เทิร์น`);
      else engine.log(`🛡️ ${target.name} ต้านผกผันจาก ${t.name}`);
      skills.push({ name: "เท่าที่ไหว — ผกผัน", img: PATHS.nagiSkill2, by: t.name, side: "atk" });
    }
    return skills;
  },

  maybeDreamFollowup(engine, attacker, target) {
    const h = ensure(attacker);
    if (!h || !bothAlive(attacker) || !target || !target.alive) return null;
    const active = h.twins[h.active];
    const other = h.twins[otherKey(h.active)];
    if (!statusOn(active, "hisakawaDream")) return null;
    if (Math.random() >= 0.7) {
      engine.log(`🎁 ฝันของเหล่าฝาแฝด — ${other.name} ไม่ได้ออกมาโจมตีต่อ (30%)`);
      return null;
    }
    engine.dealMixed(target, 2, true);
    target.wasAttacked = true;
    engine.log(`🎁 ฝันของเหล่าฝาแฝด — ${other.name} ออกมาโจมตีช่วย ${target.name} -2`);
    return { name: `ฝันของเหล่าฝาแฝด — ${other.name}`, img: other.img, by: attacker.name, side: "atk" };
  },

  onAfterRoundScores(engine, combatants, winnerId, valFn) {
    for (const p of combatants) {
      const h = ensure(p);
      if (!h || h.active !== "hayate") continue;
      const t = h.twins.hayate;
      if (!statusOn(t, "hisakawaTempo") || !t.alive || !bothAlive(p)) continue;
      const score = valFn(p);
      if (score < 0) continue;
      const sameLow = combatants.filter((o) => valFn(o) === score);
      const low = Math.min(...combatants.map(valFn).filter((v) => v >= 0));
      if (score === low && sameLow.length === 1 && p.id !== winnerId) {
        p.hisakawaHayateAssist = true;
        delete t.statuses.hisakawaTempo;
        syncIn(p);
        engine.log(`💨 ${t.name} ได้จังหวะต่ำสุด — เตรียมโจมตีหลังผู้ชนะ`);
      }
    }
  },

  startHayateAssistAttack(engine, attacker) {
    const p = engine.alivePlayers().find((o) => o.characterId === "hisakawa_sister" && o.hisakawaHayateAssist);
    if (!p) return false;
    p.hisakawaHayateAssist = false;
    const targets = engine.attackableTargets(p.id);
    if (!targets.length) return false;
    engine.setAttackerId(p.id);
    engine.log(`💨 ฮายาเตะ ฮิซากาว่า ได้โจมตีต่อจาก ${attacker ? attacker.name : "ผู้ชนะ"}`);
    return true;
  },

  onRoundStartTick(engine, p) {
    const h = ensure(p);
    if (!h) return;
    const active = h.twins[h.active];
    for (const key of TWIN_KEYS) {
      const t = h.twins[key];
      if (!t.alive || key === h.active) continue;
      let dmg = 0;
      if ((t.statuses.oblada || 0) > 0 && t.statuses.oblada % 2 === 1) dmg += 1;
      if ((t.statuses.hburn || 0) > 0) {
        dmg += 1;
        t.statuses.hburn = Math.max(0, t.statuses.hburn - 1);
        if (t.statuses.hburn <= 0) delete t.statuses.hburn;
      }
      if (dmg > 0) {
        damageTwin(t, dmg);
        engine.log(`👭 ${t.name} ที่พักอยู่ยังโดนผลค้างอยู่ — รับความเสียหาย -${dmg}`);
      }
    }
    if (active.alive) {
      h.controlTurns = (h.controlTurns || 0) + 1;
      if (h.controlTurns >= 2 && h.controlTurns % 3 === 2) {
        applyStatus(active, "resist", 1, 1);
        engine.log(`👭 ${active.name} ควบคุมต่อเนื่อง — ได้ต้านสถานะผิดปกติ 1 เทิร์น`);
      }
    }
    syncIn(p);
  },

  onEndTurnTick(engine, p) {
    const h = ensure(p);
    if (!h) return;
    for (const key of TWIN_KEYS) {
      const t = h.twins[key];
      if (!t.alive || key === h.active) continue;
      for (const s of Object.keys(t.statuses || {})) {
        if (t.statuses[s] >= 999) continue;
        if (s === "fortune") continue;
        t.statuses[s]--;
        if (t.statuses[s] <= 0) {
          delete t.statuses[s];
          if (t.statusAmt) delete t.statusAmt[s];
        }
      }
    }
    syncIn(p);
  },

  extraSkillRegen(p) {
    const h = ensure(p);
    if (!h) return 0;
    let gain = 0;
    const active = h.twins[h.active];
    if (statusOn(active, "hisakawaStage") || statusOn(active, "hisakawaDream")) gain += 1;
    if (!bothAlive(p)) gain += 1;
    return gain;
  },

  extraGoldRegen(p) {
    const h = ensure(p);
    return h && h.controlTurns >= 5 ? 1 : 0;
  },

  tryTwinDeath(engine, p) {
    const h = ensure(p, { keepActive: true });
    if (!h) return false;
    const deadKey = h.active;
    const dead = h.twins[deadKey];
    dead.hp = 0;
    dead.alive = false;
    dead.armor = 0;
    const next = TWIN_KEYS.find((key) => key !== deadKey && h.twins[key].alive);
    if (!next) return false;
    h.active = next;
    h.controlTurns = 0;
    syncIn(p);
    p.alive = true;
    engine.log(`👭 ${dead.name} หมดสภาพต่อสู้ — ${h.twins[next].name} ออกมาควบคุมแทน`);
    return true;
  },
};

