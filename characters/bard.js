// ============================================================
//  คีตกวี (Bard) — บทเพลง 8 แบบ (RRR..RJJ) + มิติมายาบรรเลง (โลหิต/วิญญาณ)
//  ย้ายออกมาจาก server.js — ดู characters/index.js สำหรับไฟล์มัดรวม
//  หมายเหตุ: `bardCompose`/`bardPerform`/`useSkill()`'s bard gate block/`bardTarget` socket handler
//  ยังอยู่ server.js เพราะเรียก io.emit ตรงๆ (ยังไม่มี engine.io/engine.emit passthrough — ตามธรรมเนียม
//  เดียวกับ broadband_man.js/hakuno.js) และ bard ก็ไม่ได้ผ่านระบบ tier พื้นฐาน (basic/secondary/ultimate)
//  เหมือนตัวละครอื่น — ช่อง 3 ไม่ใช่สกิล การใช้ note คือการเติมช่อง ไม่ใช่ resolveSkill ปกติ
//  หมายเหตุ 2: `applyBardSong`/`maybeBardDim` ย้ายมาที่นี่แล้ว (ไม่มี io.emit ตรงๆ) — เรียกจาก server.js's
//  bardPerform() ที่ยังอยู่ server.js
//  หมายเหตุ 3: `shikiCancelUltimate`/`TRANSFORMS` ถูกเพิ่มเป็น engine passthrough ใหม่รอบนี้ (Universal) —
//  ก่อนหน้านี้ไม่มีตัวละครที่แยกออกมาแล้วต้องใช้ แต่จริงๆ เป็นระบบกลางที่ satoru/phenex ก็เรียกเช่นกัน
// ============================================================

module.exports = {
  id: "bard",

  // ผลของบทเพลงแต่ละแบบ — เรียกจาก server.js's bardPerform()
  applyBardSong(engine, p, pattern, targets) {
    const song = engine.BARD_SONGS[pattern];
    const songName = song ? song.name : "บทเพลง";
    const ts = (targets || []).map((id) => engine.players[id]).filter((t) => t && t.alive)
      // ซาโตรุ: บทเพลงที่เล็งใส่ซาโตรุถูกลบล้างได้ (สกิลติดตัว + เช็ค Wonder of U)
      .filter((t) => t.id === p.id || !engine.satoruOnTargeted(t, p, `บทเพลง ${songName} `).negated);
    const t = ts[0];
    switch (pattern) {
      case "RRR": { // Encore: หลบหลีก +100% ในการโดนโจมตี 1 ครั้งถัดไป (ซ้อนทับได้สูงสุด 3 สแตค แต่ละสแตคมีอายุ 2 เทิร์นของตัวเอง)
        if (!t) return;
        const granted = engine.grantEvadeStack(t);
        if (granted) {
          engine.log(`🎼💨 Encore — ${t.name} จะหลบหลีกการโดนโจมตี (100% · สะสม ${t.statuses.evade}/${engine.EVADE_STACK_MAX} ครั้ง, แต่ละครั้งมีอายุ ${engine.EVADE_STACK_TURNS} เทิร์น)`);
        } else {
          engine.log(`🎼💨 Encore — ${t.name} หลบหลีกเต็มเพดานแล้ว (${engine.EVADE_STACK_MAX} ครั้ง)`);
        }
        break;
      }
      case "RRJ": { // Silent Cadence: เลือกเป้าหมาย 1 คน ห้ามใช้สกิล 1 เทิร์น + ขโมยพลังงาน 1 หน่วย
        if (!t) return;
        if (engine.resistActive(t)) {
          engine.log(`🎼🛡️ ${t.name} ต้านสถานะผิดปกติ — Silent Cadence ไม่มีผล`);
          return;
        }
        t.noSkillNext = Math.max(t.noSkillNext || 0, 1);
        const stolen = Math.min(1, t.skillPoints);
        if (stolen > 0) { t.skillPoints -= stolen; engine.addSkill(p, stolen); }
        engine.log(`🎼🤫 Silent Cadence — ${t.name} ถูกความเงียบครอบงำ ใช้สกิลไม่ได้ 1 เทิร์น (เริ่มเทิร์นถัดไป)${stolen > 0 ? ` และถูกขโมยพลังงาน ${stolen} หน่วย` : ""}`);
        break;
      }
      case "RJR": // Fate's Prelude: โชคลาภในการจั่วไพ่ครั้งถัดไป (ซ้อนทับได้สูงสุด 3)
        if (!t) return;
        t.statuses.fortune = Math.min(engine.BARD_FORTUNE_MAX, (t.statuses.fortune || 0) + 1);
        t.fortuneIdle = 0;
        engine.log(`🎼🍀 Fate's Prelude — ${t.name} ได้รับโชคลาภในการจั่วไพ่ (สะสม ${t.statuses.fortune}/${engine.BARD_FORTUNE_MAX} ครั้ง)`);
        break;
      case "JRR": // Rejuvenation: HP +1 / ดาเมจครั้งต่อไป +1 (ไม่ซ้อนทับ)
        if (!t) return;
        engine.healHp(t, 1);
        t.statuses.empower = 1;
        engine.log(`🎼💖 Rejuvenation — ${t.name} ฟื้น HP +1 และการโจมตีครั้งถัดไป +1 (ไม่ซ้อนทับ)`);
        break;
      case "JJJ": { // Sanctuary Hymn: ล้าง + ต้านสถานะผิดปกติ 1 เทิร์น
        if (!t) return;
        t.statuses.resist = Math.max(t.statuses.resist || 0, 1);
        const purged = engine.cleanseDebuffs(t);
        engine.log(`🎼🛡️ Sanctuary Hymn — ${t.name} ต้านสถานะผิดปกติ 1 เทิร์น${purged ? ` (ล้างดีบัฟออก ${purged} อย่าง)` : ""}`);
        break;
      }
      case "JJR": // Resonance: เชื่อมผล 2 คน 3 เทิร์น
        if (ts.length < 2) return;
        ts[0].linkedWith = ts[1].id;
        ts[1].linkedWith = ts[0].id;
        ts[0].statuses.linked = Math.max(ts[0].statuses.linked || 0, 3);
        ts[1].statuses.linked = Math.max(ts[1].statuses.linked || 0, 3);
        engine.log(`🎼🔗 Resonance — ${ts[0].name} และ ${ts[1].name} ถูกเชื่อมผล 3 เทิร์น (HP/เกราะ โดนดาเมจ หรือฟื้นฟู แชร์ให้กันเท่ากัน 1:1)`);
        break;
      case "JRJ": // Discord: เปราะบาง +1 ดาเมจ 3 เทิร์น
        if (!t) return;
        if (!engine.applyDebuff(t, "fragile", 1, 3)) {
          engine.log(`🎼🛡️ ${t.name} ต้านสถานะผิดปกติ — ไม่ติดผลเปราะบาง`);
          return;
        }
        engine.log(`🎼⚡ Discord — ${t.name} ติดสถานะเปราะบาง (+1 ดาเมจที่ได้รับ) 3 เทิร์น`);
        break;
      case "RJJ": // Harmony: คุ้มครอง -1 ดาเมจ 3 เทิร์น
        if (!t) return;
        t.statuses.guard = Math.max(t.statuses.guard || 0, 3);
        engine.log(`🎼💗 Harmony — ${t.name} ได้รับการคุ้มครอง (-1 ดาเมจ) 3 เทิร์น`);
        break;
    }
  },

  // ท่อนทำนองครบ 5 ชั้น -> เปิดมิติมายาบรรเลง 3 เทิร์น (โลหิตมาก่อนถ้าครบพร้อมกัน) — เรียกจาก server.js's bardPerform()
  // คืนค่า true = มีวีดีโอเข้าคิว (ผู้เรียกอาจต้องพัก/เล่นคิวเอง — server.js เช็ค live/gameState เอง)
  maybeBardDim(engine, p, live) {
    if (!p || !p.alive || p.characterId !== "bard") return;
    if ((p.statuses.bloodDim || 0) > 0 || (p.statuses.soulDim || 0) > 0) return; // มิติเปิดอยู่แล้ว
    let kind = null;
    if ((p.bloodSection || 0) >= engine.BARD_SECTION_MAX) kind = "bloodDim";
    else if ((p.soulSection || 0) >= engine.BARD_SECTION_MAX) kind = "soulDim";
    if (!kind) return;
    // นายมีฝีมือแค่ไหนหรอ? (ชิกิ): มิติมายาบรรเลงนับเป็นท่าไม้ตาย — มีชิกิถือชาร์จ godslay
    //  อยู่บนสนามตอนมิติกำลังจะเปิด = มิติถูกยกเลิกทันที (ท่อนทำนองที่สะสมมาเสียฟรี)
    const slayer = engine.alivePlayers().find(
      (s) => s.id !== p.id && s.characterId === "shiki" && (s.statuses.godslay || 0) > 0
    );
    if (slayer) {
      const dimName = kind === "bloodDim" ? "มิติมายาบรรเลงโลหิต" : "มิติมายาบรรเลงวิญญาณ";
      if (kind === "bloodDim") p.bloodSection = 0;
      else p.soulSection = 0;
      engine.log(`🎼💔 ท่อนทำนองของ ${p.name} ที่สะสมมาแตกสลาย — ${dimName} ไม่ถูกเปิด`);
      const hasVideo = engine.shikiCancelUltimate(slayer, p, dimName, engine.TRANSFORMS.bardDim.img);
      if (hasVideo && live && engine.gameState === "PLAYING") engine.pausePlayingForCutscene();
      return;
    }
    p.statuses[kind] = engine.BARD_DIM_TURNS;
    p.transformAt = engine.nextTransformCounter();
    p.bardNotesUsed = 0; // เข้ามิติแล้วรีเซ็ตโน้ตที่เติมไปก่อนหน้าในเทิร์นนี้ — เริ่มนับใหม่ 0/6 ทันที
    // ทั้งสองมิติ — คีตกวีได้ "ต้านสถานะผิดปกติ" 3 เทิร์น (ล้างดีบัฟพื้นฐานตอนติดด้วย) "หลบหลีก" 1 ครั้ง และ "โชคลาภ" 1 ครั้ง
    p.statuses.resist = Math.max(p.statuses.resist || 0, engine.BARD_DIM_RESIST_TURNS);
    engine.cleanseDebuffs(p);
    p.statuses.fortune = Math.min(engine.BARD_FORTUNE_MAX, (p.statuses.fortune || 0) + engine.BARD_DIM_FORTUNE);
    for (let i = 0; i < engine.BARD_DIM_EVADE; i++) engine.grantEvadeStack(p);
    p.fortuneIdle = 0;
    if (kind === "bloodDim") {
      // มิติโลหิต — ผู้เล่นทุกคน (ยกเว้นคีตกวี) ติด "เปราะบาง" +1 ดาเมจที่ได้รับ 3 เทิร์น
      for (const o of engine.alivePlayers()) {
        if (o.id === p.id) continue;
        if (!engine.applyDebuff(o, "fragile", engine.BARD_BLOOD_FRAGILE, 3)) {
          engine.log(`🛡️ ${o.name} ต้านสถานะผิดปกติ — ไม่ติดผลเปราะบางจากมิติโลหิต`);
        }
      }
      engine.log(`❤️🌅 ${p.name} เปิดมิติมายาบรรเลงโลหิต! (3 เทิร์น — นับเป็นตอนเช้า) กดโน้ตได้สูงสุด ${engine.BARD_DIM_NOTES_PER_TURN} ครั้งต่อเทิร์น ต้านสถานะผิดปกติ ${engine.BARD_DIM_RESIST_TURNS} เทิร์น หลบหลีก ${engine.BARD_DIM_EVADE} โชคลาภ ${engine.BARD_DIM_FORTUNE} / ทุกคน (ยกเว้นคีตกวี) ติดเปราะบาง +${engine.BARD_BLOOD_FRAGILE} ดาเมจ 3 เทิร์น`);
    } else {
      // มิติวิญญาณ — ทุกการบรรเลงทำนอง ตีสุ่มผู้เล่น 2 คน คนละ 1 หน่วย จนกว่ามิติจะสิ้นสุด
      engine.log(`💚🌑 ${p.name} เปิดมิติมายาบรรเลงวิญญาณ! (3 เทิร์น — นับเป็นตอนกลางคืน) กดโน้ตได้สูงสุด ${engine.BARD_DIM_NOTES_PER_TURN} ครั้งต่อเทิร์น ต้านสถานะผิดปกติ ${engine.BARD_DIM_RESIST_TURNS} เทิร์น หลบหลีก ${engine.BARD_DIM_EVADE} โชคลาภ ${engine.BARD_DIM_FORTUNE} และทุกการบรรเลงตีสุ่มผู้เล่น ${engine.BARD_SOUL_TARGETS} คน -${engine.BARD_SOUL_PERFORM_DMG}`);
    }
    // วีดีโอเปิดมิติ เล่นเต็มทุกครั้ง (ไม่ใช่ครั้งเดียวต่อเกม) — บรรเลงตอนเปิดไพ่ให้เข้าคิวรอ afterResolve เล่นให้
    engine.queueCutscene(p, "bardDim");
    if (live && engine.gameState === "PLAYING") engine.pausePlayingForCutscene();
  },

  // มิติมายาบรรเลงที่เปิดอยู่บนสนาม: "day" (โลหิต) | "night" (วิญญาณ) | null — เรียกจาก isNightRound/morningBonusActive
  dimCycle(engine) {
    for (const p of Object.values(engine.players)) {
      if (!p || !p.alive || p.characterId !== "bard") continue;
      if ((p.statuses.bloodDim || 0) > 0) return "day";
      if ((p.statuses.soulDim || 0) > 0) return "night";
    }
    return null;
  },

  // เรียกจาก round-start — ถูกขัดจังหวะการประพันธ์ (หลับ/สตั้น/ใบ้สกิล ฯลฯ) -> โน้ตทั้งหมดถูกรีเซ็ต
  onRoundStartInterruptCheck(engine, p) {
    if (p.characterId !== "bard" || !(p.bardNotes || []).length) return;
    if (!(p.locked || (p.statuses.noskill || 0) > 0)) return;
    p.bardNotes = [];
    engine.log(`🎼💔 ${p.name} ถูกขัดจังหวะการประพันธ์เพลง — โน้ตทั้งหมดถูกรีเซ็ต!`);
  },

  // เรียกจาก endTurn() ต่อผู้เล่นแต่ละคน — โชคลาภ: ไม่ได้ใช้ 3 เทิร์นติดกัน = หมดฤทธิ์ไปเอง
  //  (หลบหลีก/evade ย้ายไปนับอายุแบบต่อสแตคใน characters/_universal_status.js's tickEvadeStacks แล้ว)
  onEndTurnIdleDecay(engine, p) {
    if ((p.statuses.fortune || 0) > 0) {
      p.fortuneIdle = (p.fortuneIdle || 0) + 1;
      if (p.fortuneIdle >= 3) {
        delete p.statuses.fortune;
        p.fortuneIdle = 0;
        engine.log(`🍀 ${p.name} โชคลาภไม่ได้ใช้ 3 เทิร์น — หมดฤทธิ์`);
      }
    } else p.fortuneIdle = 0;
  },

  // เรียกจากลูปลดเทิร์นสถานะ เมื่อ bloodDim/soulDim หมดอายุ — รีเซ็ตท่อนทำนองทั้งหมด
  onDimExpire(engine, p) {
    p.bloodSection = 0;
    p.soulSection = 0;
    engine.log(`🎼 ${p.name} มิติมายาบรรเลงสิ้นสุด — ท่อนทำนองทั้งหมดถูกรีเซ็ต`);
  },
};
