// ============================================================
//  นานายะ ชิกิ (patch 2.1.9) — Mystic eye of death perception (เปิด/ปิดเอง) / หัวใจฆาตกร / อันนี้ของนายรึเปล่า
//  ย้ายออกมาจาก server.js — ดู characters/index.js สำหรับไฟล์มัดรวม
//  หมายเหตุ: postAttackFollowup() (หัวใจฆาตกรโจมตีซ้ำ) เป็น universal-dispatcher ที่ใช้ร่วมกับ
//  มิยาโกะ/ทาคุโตะ — มีแค่ if-branch ของนานายะที่ย้ายมาที่นี่ (startReattack), ไม่ใช่ทั้งฟังก์ชัน
// ============================================================

const NANAYA_KILL_CHANCE = 0.5;      // Mystic eye of death perception: โอกาสสังหารทันที 50% (ระหว่างเปิดใช้งาน)
const NANAYA_MISS_DMG = 6;           // พลาดหรือสังหารไม่ได้: เสียพลังชีวิตไม่สนเกราะ 6 หน่วย
const NANAYA_REATTACK_CHANCE = 0.5;  // หัวใจฆาตกร (สกิลติดตัว 2): พลาดสังหาร -> 50% เปิดโอกาสโจมตีซ้ำทันที
const NANAYA_SILENCE_TURNS = 2;      // อันนี้ของนายรึเปล่า: ห้ามใช้สกิล/จั่วไพ่/สกิลติดตัวไม่ทำงาน 2 เทิร์น
const NANAYA_SILENCE_SELF_DMG = 1;   // อันนี้ของนายรึเปล่า: เสียพลังชีวิตตัวเอง 1 หน่วยไม่สนเกราะทุกครั้งที่ใช้
const NANAYA_REST_TURNS = 2;         // พักผ่อนสักครู่ (สกิลติดตัว 3): ทุกๆ 2 เทิร์น ฟื้นพลังชีวิต
const NANAYA_REST_HEAL = 2;          // พักผ่อนสักครู่: จำนวนพลังชีวิตที่ฟื้น

module.exports = {
  id: "nanaya",

  // เรียกจาก server.js's nanayaToggleEye(id) (socket handler) — เปิด/ปิด Mystic eye (แค่ 1 ครั้ง/เทิร์น)
  toggleEye(engine, p) {
    if (engine.passiveSealed(p)) return; // อันนี้ของนายรึเปล่า: สกิลติดตัวไม่ทำงาน — เปิด/ปิดไม่ได้
    if (p.nanayaToggleUsed) return;
    p.nanayaToggleUsed = true;
    p.nanayaEyeOn = !p.nanayaEyeOn;
    if (p.nanayaEyeOn) p.transformAt = engine.nextTransformCounter(); // เพลง/ฉากหลังเริ่มใหม่ทุกครั้งที่เปิด
    engine.log(`👁️ ${p.name} Mystic eye of death perception — ${p.nanayaEyeOn ? "เปิดใช้งาน" : "ปิดใช้งาน"}`);
    return true;
  },

  // เรียกจาก useSkill()'s gate — ต้องเลือกเป้าหมาย 1 คน (คนอื่นเท่านั้น) ที่ยังไม่ติดผลอยู่
  prepareSilenceTarget(engine, p, targets) {
    const tgs = Array.isArray(targets) ? [...new Set(targets)] : [];
    const t = tgs.length === 1 ? engine.players[tgs[0]] : null;
    if (!t || !t.alive || t.id === p.id) return null;
    if ((t.statuses.nanayaSeal || 0) > 0) return null; // เป้าหมายเดิมยังติดผลอยู่ — เลือกซ้ำไม่ได้จนกว่าจะหมดฤทธิ์
    return t;
  },

  // เรียกจาก useSkill() ในส่วน effect — ห้ามใช้สกิล/จั่วไพ่/สกิลติดตัวไม่ทำงาน 2 เทิร์น + เสียเลือดตัวเองไม่สนเกราะ
  applySilenceEffect(engine, p, target, skillName) {
    let flashSuffix;
    if (engine.satoruOnTargeted(target, p, `สกิล ${skillName} `).negated) {
      flashSuffix = " — ถูกลบล้าง";
    } else {
      target.statuses.noskill = Math.max(target.statuses.noskill || 0, NANAYA_SILENCE_TURNS);
      target.statuses.nodraw = Math.max(target.statuses.nodraw || 0, NANAYA_SILENCE_TURNS);
      target.statuses.nanayaSeal = Math.max(target.statuses.nanayaSeal || 0, NANAYA_SILENCE_TURNS);
      flashSuffix = ` — ใส่ ${target.name}`;
      engine.log(`👁️ ${p.name} อันนี้ของนายรึเปล่า — ${target.name} ใช้สกิล/จั่วไพ่ไม่ได้ และสกิลติดตัวไม่ทำงาน ${NANAYA_SILENCE_TURNS} เทิร์น`);
    }
    engine.dealDirect(p, NANAYA_SILENCE_SELF_DMG);
    engine.log(`💢 ${p.name} เสียพลังชีวิต ${NANAYA_SILENCE_SELF_DMG} หน่วย (ไม่สนเกราะ) จากการใช้อันนี้ของนายรึเปล่า`);
    if (p.alive && p.hp <= 0) {
      engine.instantDeath(p);
      if (!p.alive) engine.log(`💀 ${p.name} เลือดจริงหมด ตกรอบ!`);
    }
    return flashSuffix;
  },

  // เรียกจาก doAttack() ตอนโจมตีปกติ — คืน true ถ้าฟังก์ชันหลักต้อง return ทันที (สังหารทันทีทำงาน)
  onAttack(engine, attacker, target) {
    if (!(attacker.nanayaEyeOn && !engine.passiveSealed(attacker) && !engine.killSealed(attacker))) return false;
    if (Math.random() < engine.miyakoKillChance(target, NANAYA_KILL_CHANCE)) {
      if (engine.appleGuyDodgesKill(attacker, target)) return true; // Apple guy: หลบสังหารทันทีได้
      engine.queueCutscene(attacker, "nanayaKill"); // เล่นวีดีโอก่อนสังหารทุกครั้ง
      engine.instantDeath(target);
      target.wasAttacked = true;
      if (!target.alive) engine.log(`👁️💀 Mystic eye of death perception — ${attacker.name} มองเห็นเส้นความตายของ ${target.name} (โอกาส 50%) — สังหารทันที!`);
      else engine.log(`👁️💀 Mystic eye of death perception — ${attacker.name} มองเห็นเส้นความตายของ ${target.name} — แต่ ${target.name} เกิดใหม่หนีความตายไปได้!`);
      engine.setLastAttack({
        byName: attacker.name, byImg: engine.displayImg(attacker), byColor: engine.POSITION_COLORS[attacker.position] || "#888",
        byDoomWeapon: attacker.characterId === "doomguy" ? attacker.doomWeapon : undefined,
        targetName: target.name, targetImg: engine.displayImg(target), targetColor: engine.POSITION_COLORS[target.position] || "#888",
        dmg: 0, kill: !target.alive,
        skills: [{ name: "Mystic eye of death perception — สังหารทันที", img: "/characters/nanaya/nanaya.png", by: attacker.name, color: engine.POSITION_COLORS[attacker.position] || "#888", side: "atk" }],
      });
      engine.runCutsceneQueue(() => {
        engine.setGameState("ATTACKING");
        engine.startPhaseTimer(engine.ATTACKFX_TIME + 2, engine.endTurn);
        engine.broadcastState();
      });
      return true;
    }
    engine.dealDirect(attacker, NANAYA_MISS_DMG);
    engine.log(`👁️💢 Mystic eye of death perception พลาด — ${attacker.name} เสียพลังชีวิต ${NANAYA_MISS_DMG} หน่วย (ไม่สนเกราะ)`);
    if (attacker.alive && attacker.hp <= 0) {
      engine.instantDeath(attacker);
      if (!attacker.alive) engine.log(`💀 ${attacker.name} เลือดจริงหมด ตกรอบ!`);
    }
    engine.miyakoSurvivedKillAttempt(target);
    // หัวใจฆาตกร (สกิลติดตัว 2): พลาดสังหาร -> 50% เปิดโอกาสโจมตีซ้ำทันที (ต้องยังไม่ตายจากดาเมจตัวเอง)
    if (attacker.alive) {
      if (Math.random() < NANAYA_REATTACK_CHANCE) {
        attacker.nanayaMissedThisAttack = true;
        engine.log(`🗡️ ${attacker.name} หัวใจฆาตกร — ความแค้นเปิดโอกาสให้โจมตีซ้ำ!`);
      } else {
        engine.log(`🗡️ ${attacker.name} หัวใจฆาตกร — ไม่ได้โอกาสโจมตีซ้ำครั้งนี้`);
      }
    }
    return false;
  },

  // เรียกจาก postAttackFollowup() (universal dispatcher) — หัวใจฆาตกร: เนตรมารพลาด -> เปิดโอกาสโจมตีซ้ำทันที
  //  คืน true ถ้าเริ่มโจมตีซ้ำสำเร็จ (ผู้เรียกต้อง return ทันที ไม่ไปต่อ endTurn())
  startReattack(engine, attacker) {
    if (!attacker.nanayaMissedThisAttack) return false;
    attacker.nanayaMissedThisAttack = false;
    const targets = engine.attackableTargets(attacker.id);
    if (targets.length === 0) return false;
    attacker.nanayaReattackReady = true;
    engine.setAttackerId(attacker.id);
    engine.setGameState("ATTACK");
    engine.startPhaseTimer(engine.ATTACK_TIME, () => {
      attacker.nanayaReattackReady = false;
      engine.endTurn();
    });
    engine.broadcastState();
    return true;
  },

  // เรียกจาก server.js's nanayaCancelReattack(id) (socket handler) — ยกเลิกการโจมตีซ้ำของหัวใจฆาตกร
  cancelReattack(engine, p) {
    if (!p.nanayaReattackReady) return false;
    if (engine.gameState !== "ATTACK" || engine.attackerId !== p.id) return false;
    p.nanayaReattackReady = false;
    engine.clearPhaseTimer();
    engine.log(`🗡️ ${p.name} หัวใจฆาตกร — ยกเลิกการโจมตีซ้ำ`);
    engine.endTurn();
    return true;
  },

  // เรียกจาก dealRound() ต้นเทิร์น — พักผ่อนสักครู่ (สกิลติดตัว 3): ทุกๆ 2 เทิร์น ฟื้นพลังชีวิต
  onRoundStartRest(engine, p) {
    if (engine.passiveSealed(p)) return;
    p.nanayaRestTurn = (p.nanayaRestTurn || 0) + 1;
    if (p.nanayaRestTurn >= NANAYA_REST_TURNS) {
      p.nanayaRestTurn = 0;
      const heal = engine.healHp(p, NANAYA_REST_HEAL);
      if (heal > 0) engine.log(`💤 ${p.name} พักผ่อนสักครู่ — ฟื้นพลังชีวิต +${heal}`);
    }
  },
};
