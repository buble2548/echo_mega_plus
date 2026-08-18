// ============================================================
//  ดูมกาย (DoomGuy, patch 2.2 full) — Quick Swap / Weapon (ความสามารถพิเศษตามอาวุธ) / Crucible (ท่าไม้ตาย) /
//  สกิลติดตัว (ฮีล+ชาร์จ Crucible ทุกครั้งที่โจมตี) / สกิลติดตัว 2 (เสมอแต้มยังได้โจมตี 60%)
//  ย้ายออกมาจาก server.js — ดู characters/index.js สำหรับไฟล์มัดรวม
//  หมายเหตุ: ตาราง `DOOM_WEAPONS`/`rollDoomWeapon`/ค่าคงที่ atk พื้นฐาน (DOOM_CRUCIBLE_ATK) ยังอยู่ server.js
//  เพราะถูกอ่านตรงๆ ใน doAttack()'s shared damage-sum expression (`doomBaseAtk`/`doomPierceAtk`) — นอกขอบเขต Phase 1
//  เปิดผ่าน engine.DOOM_WEAPONS/engine.rollDoomWeapon แทน
// ============================================================

module.exports = {
  id: "doomguy",

  // แทนที่ base 1 ทั่วไปด้วยดาเมจอาวุธที่ถืออยู่ (Crucible = 7 คงที่) — เรียกจาก computeAttackBase()
  attackBaseOverride(engine, attacker, target, ctx) {
    const doomBaseAtk = (attacker.statuses.doomCrucible || 0) > 0
      ? engine.DOOM_CRUCIBLE_ATK
      : (engine.DOOM_WEAPONS[attacker.doomWeapon] || engine.DOOM_WEAPONS.shotgun).atk;
    ctx.doomBaseAtk = doomBaseAtk;
    return doomBaseAtk;
  },

  // ดาเมจ contribution (ล็อคเป้า Heavy Cannon +1) — เรียกจาก computeAttackBase()
  damageBonus(engine, attacker, target, ctx) {
    const doomLockonAtk = (target.statuses.doomLockon || 0) > 0 ? engine.DOOM_LOCKON_BONUS : 0;
    ctx.doomLockonAtk = doomLockonAtk;
    return doomLockonAtk;
  },

  // เรียกจาก useSkill()'s gate — เตรียมเป้าหมายความสามารถพิเศษของอาวุธ (คนอื่นเท่านั้น)
  resolveWeaponTarget(engine, p, targets) {
    const tgs = Array.isArray(targets) ? [...new Set(targets)] : [];
    const t = tgs.length === 1 ? engine.players[tgs[0]] : null;
    if (!t || !t.alive || t.id === p.id) return null;
    return t;
  },

  // เรียกจาก useSkill() ในส่วน effect — Quick Swap: สลับอาวุธทันที (ใช้ได้ 1 ครั้ง/เทิร์น)
  applyQuickSwap(engine, p) {
    p.doomQuickSwapUsed = true;
    p.doomWeapon = engine.rollDoomWeapon(p.doomWeapon);
    engine.log(`🔫 ${p.name} Quick Swap — สลับอาวุธเป็น ${engine.DOOM_WEAPONS[p.doomWeapon].name}!`);
  },

  // เรียกจาก useSkill() ในส่วน effect (หลัง io.emit skillFlash ที่ยังอยู่ server.js) — ใช้ความสามารถพิเศษของอาวุธที่ถืออยู่
  applyWeaponEffect(engine, p, doomW, doomTarget) {
    const wname = doomW.name;
    if (doomW.effect === "explode" && doomTarget) {
      if (engine.resistActive(doomTarget)) {
        engine.log(`🛡️ ${doomTarget.name} ต้านสถานะผิดปกติ — ${wname} ไม่มีผล`);
      } else {
        doomTarget.statuses.doomExplode = 1;
        engine.log(`💣 ${p.name} ${wname} — ${doomTarget.name} ติดสถานะระเบิด! (โจมตีโดนเมื่อไหร่จะระเบิดใส่คนอื่นสุ่ม 2 คน -1)`);
      }
    } else if (doomW.effect === "lockon" && doomTarget) {
      if (engine.resistActive(doomTarget)) {
        engine.log(`🛡️ ${doomTarget.name} ต้านสถานะผิดปกติ — ${wname} ไม่มีผล`);
      } else if (Math.random() < engine.DOOM_LOCKON_CHANCE) {
        doomTarget.statuses.doomLockon = 1;
        engine.log(`🎯 ${p.name} ${wname} — ล็อคเป้า ${doomTarget.name} สำเร็จ! (โดนโจมตีครั้งถัดไปแรงขึ้น +1)`);
      } else {
        engine.log(`🎯 ${p.name} ${wname} — ล็อคเป้า ${doomTarget.name} ล้มเหลว (โอกาส ${Math.round(engine.DOOM_LOCKON_CHANCE * 100)}%)`);
      }
    } else if (doomW.effect === "shield") {
      p.shield += 1;
      engine.log(`🛡️ ${p.name} ${wname} — เพิ่มโล่ +1`);
    } else if (doomW.effect === "bonusdmg" && doomTarget) {
      engine.dealMixed(doomTarget, engine.DOOM_ROCKET_BONUS_DMG);
      engine.maybeBeatSave(doomTarget); engine.maybeBeatMode(doomTarget); engine.maybeEva3(doomTarget); engine.maybeWakeKotone(doomTarget);
      doomTarget.wasAttacked = true;
      engine.log(`🚀 ${p.name} ${wname} — ยิงใส่ ${doomTarget.name} เพิ่มเติม -${engine.DOOM_ROCKET_BONUS_DMG}`);
      if (doomTarget.alive && doomTarget.hp <= 0) {
        engine.instantDeath(doomTarget);
        if (!doomTarget.alive) engine.log(`💀 ${doomTarget.name} เลือดจริงหมด ตกรอบ!`);
      }
    } else if (doomW.effect === "stun" && doomTarget) {
      if (engine.resistActive(doomTarget)) {
        engine.log(`🛡️ ${doomTarget.name} ต้านสถานะผิดปกติ — ${wname} ไม่มีผล`);
      } else {
        doomTarget.statuses.stun = Math.max(doomTarget.statuses.stun || 0, 1);
        engine.log(`💥 ${p.name} ${wname} — สตั้น ${doomTarget.name} 1 เทิร์น`);
      }
    } else if (doomW.effect === "aoe") {
      for (const o of engine.alivePlayers()) {
        if (o.id === p.id) continue;
        engine.dealMixed(o, engine.DOOM_BALLISTA_DMG);
        engine.maybeBeatSave(o); engine.maybeBeatMode(o); engine.maybeEva3(o); engine.maybeWakeKotone(o);
        o.wasAttacked = true;
        if (o.alive && o.hp <= 0) { engine.instantDeath(o); if (!o.alive) engine.log(`💀 ${o.name} เลือดจริงหมด ตกรอบ!`); }
      }
      engine.log(`💥 ${p.name} ${wname} — ทำดาเมจทุกคน -${engine.DOOM_BALLISTA_DMG}`);
    }
  },

  // เรียกจาก useSkill() ในส่วน effect — Crucible (ท่าไม้ตาย): แปลงร่างทันที + บังคับทุกคนอื่นแตกจริง
  activateCrucible(engine, p) {
    p.seen.doomCrucible = true;
    p.transformAt = engine.nextTransformCounter();
    engine.triggerCutscene(p, "doomCrucible");
    p.doomCharge = 0;
    for (const o of engine.alivePlayers()) {
      if (o.id === p.id) continue;
      // แตกจริงแบบเดียวกับ Ashen Trail (โอกูริ) — บังคับจั่วเพิ่ม + บวกแต้มการ์ดตรงๆ การันตีเกิน 21 แม้เปิดไพ่/ล็อกไปแล้วก็ตาม
      for (let i = 0; i < engine.DOOM_CRUCIBLE_BUST_DRAWS; i++) {
        const c = engine.drawCardFor(o);
        if (c) { o.cards.push(c); engine.onCardDrawn(o, c); }
      }
      o.cardBonus = (o.cardBonus || 0) + engine.DOOM_CRUCIBLE_BUST_BONUS;
      o.busted = engine.bustedOf(o);
      o.locked = true;
      engine.voidUltimateOnBust(o);
      engine.maybeMoonBurst(o);
      engine.dealDirect(o, engine.DOOM_CRUCIBLE_BUST_DMG);
      engine.maybeBeatSave(o); engine.maybeBeatMode(o); engine.maybeEva3(o); engine.maybeWakeKotone(o);
      o.wasAttacked = true;
      if (o.alive && o.hp <= 0) { engine.instantDeath(o); if (!o.alive) engine.log(`💀 ${o.name} เลือดจริงหมด ตกรอบ!`); }
    }
    engine.log(`⚔️ Crucible! ${p.name} คว้าดาบแห่งการล่า — บังคับทุกคนจั่วเพิ่ม ${engine.DOOM_CRUCIBLE_BUST_DRAWS} ใบ บวกแต้มการ์ด +${engine.DOOM_CRUCIBLE_BUST_BONUS} การันตีแตกทันที (แม้เปิดไพ่/ล็อกไปแล้ว) รับความเสียหาย -${engine.DOOM_CRUCIBLE_BUST_DMG} (พลังโจมตี 7 หน่วย คงอยู่จนกว่าจะได้โจมตี 1 ครั้ง)`);
  },

  // เรียกจาก resolveRound() ตอนตัดสินผู้ชนะ — สกิลติดตัว: เสมอแต้มปกติไม่มีเทิร์นโจมตี แต่มีโอกาส 60% ยังได้โจมตี คืน true ถ้าทำงาน
  tryTieAttack(engine, winner) {
    if (!(winner && winner.alive && winner.characterId === "doomguy")) return false;
    if (Math.random() >= engine.DOOM_TIE_ATTACK_CHANCE) return false;
    engine.log(`🎲 ${winner.name} สกิลติดตัว — เสมอแต้มแต่ยังได้โจมตี!`);
    return true;
  },

  // เรียกจาก doAttack() หลังคำนวณดาเมจแล้ว — ฮีลตัวเอง+ชาร์จ Crucible / ล็อคเป้าใช้แล้วหมดฤทธิ์ / ระเบิด Combat Shotgun / กระจายดาเมจ Rocket Launcher / Crucible ใช้แล้วหมดฤทธิ์
  onAttackPostDamage(engine, attacker, target, dmg, doomLockonAtk) {
    const heal = engine.healHp(attacker, engine.DOOM_HEAL_ON_ATK);
    if (heal > 0) engine.log(`💉 ${attacker.name} สกิลติดตัว — ฮีลตัวเอง +${heal}`);
    if ((attacker.doomCharge || 0) < engine.DOOM_CRUCIBLE_CHARGE_NEED && Math.random() < engine.DOOM_CHARGE_CHANCE) {
      attacker.doomCharge = (attacker.doomCharge || 0) + 1;
      engine.log(`🔥 ${attacker.name} สกิลติดตัว — ได้รับชาร์จ Crucible +1 (${attacker.doomCharge}/${engine.DOOM_CRUCIBLE_CHARGE_NEED})`);
    }
    // ล็อคเป้า (Heavy Cannon): ใช้แล้วหมดไปทันทีที่โจมตีโดน
    if (doomLockonAtk) {
      delete target.statuses.doomLockon;
      engine.log(`🎯 ${attacker.name} ล็อคเป้า — โจมตี ${target.name} แรงขึ้น +${engine.DOOM_LOCKON_BONUS} (บัฟหมดลง)`);
    }
    // ระเบิด (Combat Shotgun): โจมตีเป้าหมายที่ติดสถานะ -> ระเบิดใส่คนอื่นสุ่ม 2 คน
    if ((target.statuses.doomExplode || 0) > 0) {
      delete target.statuses.doomExplode;
      const pool = engine.alivePlayers().filter((o) => o.id !== attacker.id && o.id !== target.id);
      const hits = [];
      while (hits.length < engine.DOOM_EXPLODE_TARGETS && pool.length) hits.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
      for (const o of hits) {
        engine.dealMixed(o, engine.DOOM_EXPLODE_DMG);
        engine.maybeBeatSave(o); engine.maybeBeatMode(o); engine.maybeEva3(o); engine.maybeWakeKotone(o);
        o.wasAttacked = true;
        if (o.alive && o.hp <= 0) { engine.instantDeath(o); if (!o.alive) engine.log(`💀 ${o.name} เลือดจริงหมด ตกรอบ!`); }
      }
      if (hits.length) engine.log(`💣 ระเบิด! ${target.name} ระเบิดใส่ ${hits.map((o) => o.name).join(", ")} -${engine.DOOM_EXPLODE_DMG}`);
    }
    // Rocket Launcher: การโจมตีปกติกระจายดาเมจใส่อีก 1 คนแบบสุ่มด้วย (ไม่นับ Crucible)
    if (!((attacker.statuses.doomCrucible || 0) > 0) && attacker.doomWeapon === "rocket" && engine.DOOM_WEAPONS.rocket.splash) {
      const pool = engine.alivePlayers().filter((o) => o.id !== attacker.id && o.id !== target.id);
      if (pool.length) {
        const o = pool[Math.floor(Math.random() * pool.length)];
        engine.dealMixed(o, dmg);
        engine.maybeBeatSave(o); engine.maybeBeatMode(o); engine.maybeEva3(o); engine.maybeWakeKotone(o);
        o.wasAttacked = true;
        engine.log(`🚀 Rocket Launcher — ดาเมจกระจายใส่ ${o.name} ด้วย -${dmg}`);
        if (o.alive && o.hp <= 0) { engine.instantDeath(o); if (!o.alive) engine.log(`💀 ${o.name} เลือดจริงหมด ตกรอบ!`); }
      }
    }
    // Crucible: ใช้พลังโจมตี 7 หน่วยไปแล้ว 1 ครั้ง — หายไปทันที (ไม่ใช่นับเทิร์นแบบเดิม)
    if ((attacker.statuses.doomCrucible || 0) > 0) {
      delete attacker.statuses.doomCrucible;
      engine.log(`⚔️ ${attacker.name} Crucible — ใช้พลังโจมตี 7 หน่วยไปแล้ว ดาบเสื่อมพลังลง กลับไปใช้อาวุธปืนตามปกติ`);
    }
  },

  // เรียกจาก dealRound() ตอนจบเทิร์น (ในลูปสถานะร่วมท้ายเทิร์น) — Weapon: บังคับสลับอาวุธใหม่ทันที (ไม่ทำงานระหว่างถือ Crucible)
  onRoundStartWeaponCycle(engine, p) {
    if (!(p.characterId === "doomguy" && p.alive && (p.statuses.doomCrucible || 0) <= 0)) return;
    const oldW = engine.DOOM_WEAPONS[p.doomWeapon] ? engine.DOOM_WEAPONS[p.doomWeapon].name : "";
    p.doomWeapon = engine.rollDoomWeapon(p.doomWeapon);
    engine.log(`🔫 ${p.name} Weapon — จบเทิร์น สลับอาวุธจาก ${oldW} เป็น ${engine.DOOM_WEAPONS[p.doomWeapon].name} อัตโนมัติ`);
  },
};
