// ============================================================
//  à¸£à¸°à¸šà¸šà¹€à¸ªà¸µà¸¢à¸‡ ECHO + master volume
//  - master volume à¸„à¸¸à¸¡à¸—à¸¸à¸à¹€à¸ªà¸µà¸¢à¸‡ (à¹€à¸žà¸¥à¸‡ / à¹€à¸­à¸Ÿà¹€à¸Ÿà¸à¸•à¹Œ / à¹€à¸ªà¸µà¸¢à¸‡à¸žà¸²à¸à¸¢à¹Œ / à¸§à¸µà¸”à¸µà¹‚à¸­) à¸”à¹‰à¸§à¸¢ curve à¸¢à¸à¸à¸³à¸¥à¸±à¸‡à¸ªà¸­à¸‡
//    à¹ƒà¸«à¹‰à¸«à¸¥à¸­à¸”à¸›à¸£à¸±à¸šà¹€à¸ªà¸µà¸¢à¸‡à¸¡à¸µà¸œà¸¥à¸Šà¸±à¸”à¹€à¸ˆà¸™ (linear à¹€à¸”à¸´à¸¡à¸Ÿà¸±à¸‡à¹à¸—à¸šà¹„à¸¡à¹ˆà¸•à¹ˆà¸²à¸‡)
//  - à¹€à¸žà¸¥à¸‡à¹€à¸¥à¹ˆà¸™à¸•à¹ˆà¸­à¸ˆà¸²à¸à¸ˆà¸¸à¸”à¹€à¸”à¸´à¸¡à¹€à¸‰à¸žà¸²à¸° "à¹ƒà¸™à¹à¸¡à¸•à¸Šà¹Œà¹€à¸”à¸µà¸¢à¸§à¸à¸±à¸™" â€” à¹€à¸£à¸´à¹ˆà¸¡à¹€à¸à¸¡à¹ƒà¸«à¸¡à¹ˆà¸£à¸µà¹€à¸‹à¹‡à¸•à¸—à¸±à¹‰à¸‡à¸«à¸¡à¸” (resetMusicPositions)
//  - à¹€à¸žà¸¥à¸‡à¸ªà¸à¸´à¸¥/à¸—à¹ˆà¸²à¹„à¸¡à¹‰à¸•à¸²à¸¢: à¸ªà¹ˆà¸‡ seq à¸¡à¸²à¸”à¹‰à¸§à¸¢ à¸–à¹‰à¸² seq à¹€à¸›à¸¥à¸µà¹ˆà¸¢à¸™ (à¹€à¸›à¸´à¸”à¸—à¹ˆà¸²à¹ƒà¸«à¸¡à¹ˆ / à¸–à¸¹à¸à¸—à¸±à¸šà¸”à¹‰à¸§à¸¢à¹€à¸žà¸¥à¸‡à¹€à¸”à¸µà¸¢à¸§à¸à¸±à¸™
//    à¸‚à¸­à¸‡à¸­à¸µà¸à¸„à¸™) à¹€à¸žà¸¥à¸‡à¸ˆà¸°à¹€à¸£à¸´à¹ˆà¸¡à¹ƒà¸«à¸¡à¹ˆà¸ˆà¸²à¸à¸•à¹‰à¸™
// ============================================================

const FILES = {
  main_home: "/theme_song/main_home.mp3",
  card_prepare_turn: "/theme_song/card_prepare_turn.mp3",
  new_morning: "/theme_song/new_morning.mp3", // à¹€à¸žà¸¥à¸‡à¸Šà¹ˆà¸§à¸‡à¸à¸¥à¸²à¸‡à¸§à¸±à¸™ (patch à¸žà¸´à¹€à¸¨à¸©)
  new_night: "/theme_song/new_night.mp3",     // à¹€à¸žà¸¥à¸‡à¸Šà¹ˆà¸§à¸‡à¸à¸¥à¸²à¸‡à¸„à¸·à¸™ (patch à¸žà¸´à¹€à¸¨à¸©)
  shrade: "/characters/shrade_elan/shrade_theme.mp3", // à¹€à¸žà¸¥à¸‡à¸£à¸°à¸«à¸§à¹ˆà¸²à¸‡à¸Šà¸²à¸£à¹Œà¸ˆ à¹à¸”à¹ˆà¹€à¸žà¸·à¹ˆà¸­à¸™à¸£à¸±à¸à¸‚à¸­à¸‡à¸‰à¸±à¸™ (à¸Šà¹€à¸£à¸” à¹€à¸­à¸¥à¸±à¸™)
  shiki: "/characters/shiki/shiki_theme.mp3",         // à¹€à¸žà¸¥à¸‡à¸£à¸°à¸«à¸§à¹ˆà¸²à¸‡à¸—à¹ˆà¸²à¹„à¸¡à¹‰à¸•à¸²à¸¢ à¸‰à¸±à¸™à¸¡à¸­à¸‡à¹€à¸«à¹‡à¸™à¸¡à¸±à¸™à¹à¸¥à¹‰à¸§ (à¸Šà¸´à¸à¸´)
  shiki2: "/characters/shiki/shiki_theme2.mp3",       // à¹€à¸žà¸¥à¸‡à¸£à¸°à¸«à¸§à¹ˆà¸²à¸‡à¸—à¹ˆà¸²à¹„à¸¡à¹‰à¸•à¸²à¸¢ 2 à¸„à¸§à¸²à¸¡à¸•à¸²à¸¢à¸—à¸µà¹ˆà¹‚à¸£à¸¢à¸£à¸² (à¸Šà¸´à¸à¸´ patch 2.0.6)
  tohno: "/characters/tohno/tohno_theme.mp3",         // à¹€à¸žà¸¥à¸‡à¸£à¸°à¸«à¸§à¹ˆà¸²à¸‡à¸ªà¸à¸´à¸¥à¸•à¸´à¸”à¸•à¸±à¸§à¹‚à¸—à¹‚à¸™à¸°à¹€à¸›à¸´à¸”à¹ƒà¸Šà¹‰à¸‡à¸²à¸™ (à¸£à¸°à¸”à¸±à¸š 2 à¸‚à¸¶à¹‰à¸™à¹„à¸› â€” patch 2.1.7)
  nanaya: "/characters/nanaya/nanaya_theme.mp3",      // à¹€à¸žà¸¥à¸‡à¸£à¸°à¸«à¸§à¹ˆà¸²à¸‡à¸ªà¸à¸´à¸¥à¸•à¸´à¸”à¸•à¸±à¸§ 1 à¸™à¸²à¸™à¸²à¸¢à¸° à¸Šà¸´à¸à¸´ à¹€à¸›à¸´à¸”à¹ƒà¸Šà¹‰à¸‡à¸²à¸™ (patch 2.1.9)
  hakuno: "/characters/hakuno/hakuno_theme.mp3",      // à¹€à¸žà¸¥à¸‡à¸£à¸°à¸«à¸§à¹ˆà¸²à¸‡ MOON*CELL à¸„à¸´à¸Šà¸´à¸™à¸²à¸¡à¸´ à¸®à¸²à¸„à¸¸à¹‚à¸™à¸° à¸—à¸³à¸‡à¸²à¸™ (patch 2.2.1)
  nanayaVoice1: "/characters/nanaya/voice/nanaya_voice1.m4a", // à¹€à¸ªà¸µà¸¢à¸‡à¸žà¸²à¸à¸¢à¹Œà¸ªà¸¸à¹ˆà¸¡à¸•à¸­à¸™à¸™à¸²à¸™à¸²à¸¢à¸°à¸Šà¸™à¸°à¸à¸²à¸£à¸ˆà¸±à¹ˆà¸§
  nanayaVoice2: "/characters/nanaya/voice/nanaya_voice2.m4a",
  nanayaVoice3: "/characters/nanaya/voice/nanaya_voice3.m4a",
  nanayaVoice4: "/characters/nanaya/voice/nanaya_voice4.m4a",
  nanayaVoice5: "/characters/nanaya/voice/nanaya_voice5.m4a",
  bard_dim: "/characters/bard/bard_dim_theme.mp3",    // BGM à¸£à¸°à¸«à¸§à¹ˆà¸²à¸‡à¸¡à¸´à¸•à¸´à¸¡à¸²à¸¢à¸²à¸šà¸£à¸£à¹€à¸¥à¸‡ (Bard â€” à¸§à¸™à¸¥à¸¹à¸› 3 à¹€à¸—à¸´à¸£à¹Œà¸™)
  bard_note1: "/characters/bard/bard_note1.mp3",      // à¹€à¸ªà¸µà¸¢à¸‡à¹€à¸•à¸´à¸¡à¹‚à¸™à¹‰à¸•à¸Šà¹ˆà¸­à¸‡à¸—à¸µà¹ˆ 1 (Bard)
  bard_note2: "/characters/bard/bard_note2.mp3",      // à¹€à¸ªà¸µà¸¢à¸‡à¹€à¸•à¸´à¸¡à¹‚à¸™à¹‰à¸•à¸Šà¹ˆà¸­à¸‡à¸—à¸µà¹ˆ 2
  bard_note3: "/characters/bard/bard_note3.mp3",      // à¹€à¸ªà¸µà¸¢à¸‡à¹€à¸•à¸´à¸¡à¹‚à¸™à¹‰à¸•à¸Šà¹ˆà¸­à¸‡à¸—à¸µà¹ˆ 3
  bard_note4: "/characters/bard/bard_note4.mp3",      // à¹€à¸ªà¸µà¸¢à¸‡à¹€à¸•à¸´à¸¡à¹‚à¸™à¹‰à¸• (à¸ªà¸³à¸£à¸­à¸‡)
  bard_melody1: "/characters/bard/bard_melody1.mp3",  // à¹€à¸ªà¸µà¸¢à¸‡à¸šà¸£à¸£à¹€à¸¥à¸‡à¸—à¸³à¸™à¸­à¸‡ à¸ªà¸²à¸¢ Crimson
  bard_melody2: "/characters/bard/bard_melody2.mp3",  // à¹€à¸ªà¸µà¸¢à¸‡à¸šà¸£à¸£à¹€à¸¥à¸‡à¸—à¸³à¸™à¸­à¸‡ à¸ªà¸²à¸¢ Jade
  bard_melody3: "/characters/bard/bard_melody3.mp3",  // à¹€à¸ªà¸µà¸¢à¸‡à¸šà¸£à¸£à¹€à¸¥à¸‡à¸—à¸³à¸™à¸­à¸‡ Encore à¸—à¸³à¸‡à¸²à¸™à¸‹à¹‰à¸³
  ginga: "/characters/hikaru/ginga_song.mp3",
  gingastrium: "/characters/hikaru/hikaru_update/ginga_theme2.mp3", // à¹€à¸žà¸¥à¸‡à¸£à¸°à¸«à¸§à¹ˆà¸²à¸‡à¸£à¹ˆà¸²à¸‡ Ginga Strium (à¸—à¹ˆà¸²à¹„à¸¡à¹‰à¸•à¸²à¸¢ patch 2.1.3) â€” à¹à¸—à¸™à¸—à¸µà¹ˆà¹€à¸žà¸¥à¸‡ ginga à¸—à¸µà¹ˆà¹€à¸¥à¹ˆà¸™à¸„à¹‰à¸²à¸‡à¸ˆà¸²à¸à¸ªà¸à¸´à¸¥à¸£à¸­à¸‡
  unicorn: "/characters/banagher/unicorn_song.mp3",
  final_normal: "/characters/kuwagata/final_normal.mp3", // à¹€à¸žà¸¥à¸‡à¸£à¸°à¸«à¸§à¹ˆà¸²à¸‡à¸ªà¸§à¸¡à¹€à¸à¸£à¸²à¸°à¸£à¸²à¸Šà¸±à¸™
  ex_guts: "/characters/kuwagata/ex_guts.mp3",           // à¹€à¸žà¸¥à¸‡ Beat Mode (à¸—à¸±à¸šà¸—à¸¸à¸à¹€à¸žà¸¥à¸‡à¸ˆà¸™à¸•à¸²à¸¢)
  normal_k: "/characters/kuwagata/normal_k.mp3",         // à¹€à¸ªà¸µà¸¢à¸‡à¸žà¸²à¸à¸¢à¹Œà¸«à¸¥à¸±à¸‡à¸§à¸µà¸”à¸µà¹‚à¸­à¸ªà¸§à¸¡à¹€à¸à¸£à¸²à¸°à¸£à¸²à¸Šà¸±à¸™
  ex_k: "/characters/kuwagata/ex_k.mp3",                 // à¹€à¸ªà¸µà¸¢à¸‡à¸žà¸²à¸à¸¢à¹Œà¸«à¸¥à¸±à¸‡à¸§à¸µà¸”à¸µà¹‚à¸­ Beat Mode
  temari_final_theme: "/characters/temari/temari_final_theme.mp3", // à¹€à¸žà¸¥à¸‡ ANATA WAAAAAAAA (à¹€à¸¥à¹ˆà¸™à¸–à¸¶à¸‡à¸•à¸­à¸™à¹€à¸›à¸´à¸”à¹„à¸žà¹ˆ)
  gambler: "/characters/gambler/gambler_theme.mp3",  // à¹€à¸žà¸¥à¸‡à¸£à¸°à¸«à¸§à¹ˆà¸²à¸‡à¸šà¸±à¸Ÿà¹€à¸§à¸¥à¸²à¸—à¸­à¸‡ 777 (à¹à¸à¸¡à¹€à¸šà¸¥à¸­à¸£à¹Œ)
  eva13: "/characters/eva13/eva13_theme.mp3",        // à¹€à¸žà¸¥à¸‡à¸£à¸°à¸«à¸§à¹ˆà¸²à¸‡ Fourth Impact (à¹€à¸­à¸§à¸² 13)
  oberon: "/characters/oberon/orberon theme.mp3",    // à¹€à¸žà¸¥à¸‡à¸›à¸£à¸°à¸ˆà¸³à¸•à¸±à¸§à¹‚à¸­à¹€à¸šà¸£à¸­à¸™ (à¸£à¸°à¸«à¸§à¹ˆà¸²à¸‡ Lie Like Vortigern)
  // à¸¢à¸¹à¸™à¸° à¹„à¸­à¸”à¸­à¸¥à¸›à¸£à¸°à¸ˆà¸³à¸ªà¸™à¸²à¸¡ (patch 2.2.6): à¹€à¸žà¸¥à¸‡à¸¥à¹‡à¸­à¸à¸—à¸±à¹‰à¸‡à¸ªà¸™à¸²à¸¡à¸•à¸¥à¸­à¸” 5 à¹€à¸—à¸´à¸£à¹Œà¸™à¸—à¸µà¹ˆà¹€à¸­à¸Ÿà¹€à¸Ÿà¸à¸•à¹Œà¸—à¸³à¸‡à¸²à¸™
  yuna_longing: "/characters/yuna/Longing.mp3",
  yuna_delete: "/characters/yuna/Delete.mp3",
  yuna_smile: "/characters/yuna/Smile for You.mp3",
  yuna_beatbark: "/characters/yuna/Break Beat Bark!.mp3",
  oguri: "/characters/oguri/oguri_theme.mp3",          // à¹€à¸žà¸¥à¸‡à¸›à¸£à¸°à¸ˆà¸³à¸•à¸±à¸§à¹‚à¸­à¸à¸¹à¸£à¸´ à¹à¸„à¸› (à¹€à¸£à¸´à¹ˆà¸¡à¸•à¸­à¸™à¹€à¸‚à¹‰à¸²à¸£à¹ˆà¸²à¸‡ Zone â€” à¹€à¸¥à¹ˆà¸™à¸„à¹‰à¸²à¸‡à¸£à¸°à¸«à¸§à¹ˆà¸²à¸‡à¸­à¸¢à¸¹à¹ˆà¸£à¹ˆà¸²à¸‡)
  wonderofu: "/characters/satoru/wonderofu_theme.mp3", // à¹€à¸žà¸¥à¸‡ Wonder of U (à¸‹à¸²à¹‚à¸•à¸£à¸¸ â€” à¹€à¸¥à¹ˆà¸™à¸„à¹‰à¸²à¸‡à¸•à¸£à¸²à¸šà¹ƒà¸”à¸—à¸µà¹ˆà¸¡à¸µà¸„à¸™à¸•à¸´à¸” Calamity)
  doomguy: "/characters/doomguy/à¸ªà¸à¸´à¸¥à¸­à¸±à¸¥à¸•à¸´à¹€à¸¡à¸•à¸´/Doom Eternal OST - The Only Thing They Fear Is You (Mick Gordon) [Doom Eternal Theme].mp3", // à¹€à¸žà¸¥à¸‡à¸£à¸°à¸«à¸§à¹ˆà¸²à¸‡à¸—à¹ˆà¸²à¹„à¸¡à¹‰à¸•à¸²à¸¢ Crucible (DoomGuy)
  takuto: "/characters/takuto/takuto_theme.mp3", // à¹€à¸žà¸¥à¸‡à¸›à¸£à¸°à¸ˆà¸³à¸•à¸±à¸§à¸«à¸¥à¸±à¸‡à¸‰à¸±à¸™à¸„à¸§à¹‰à¸²à¸¡à¸±à¸™à¹„à¸”à¹‰à¹à¸¥à¹‰à¸§ (à¸ªà¸¶à¸‡à¸²à¸Šà¸´ à¸—à¸²à¸„à¸¸à¹‚à¸•à¸°)
  takuto2: "/characters/takuto/upadate/takuto_theme2.m4a", // à¹€à¸žà¸¥à¸‡à¸›à¸£à¸°à¸ˆà¸³à¸•à¸±à¸§à¸«à¸¥à¸±à¸‡à¸ªà¸à¸´à¸¥à¸•à¸´à¸”à¸•à¸±à¸§ 1 à¸à¸±à¸™à¸•à¸²à¸¢à¸—à¸³à¸‡à¸²à¸™ (à¸ªà¸¶à¸‡à¸²à¸Šà¸´ à¸—à¸²à¸„à¸¸à¹‚à¸•à¸° patch 2.2.4)
  tepeu: "/characters/tepeu/tepeu_theme.mp3", // à¹€à¸žà¸¥à¸‡à¸£à¸°à¸«à¸§à¹ˆà¸²à¸‡à¸‰à¸²à¸à¸«à¸¥à¸±à¸‡ "à¸™à¸²à¸¢à¹€à¸›à¹‡à¸™à¸„à¸™à¸—à¸³à¸•à¸±à¸§à¹€à¸­à¸‡à¸™à¸°" à¸—à¸³à¸‡à¸²à¸™ (à¹€à¸—à¹€à¸›à¸² à¸Šà¸´à¸à¸´)
  tepeu_skill1_2: "/characters/tepeu/tepeu_skill1_2.m4a", // à¹€à¸ªà¸µà¸¢à¸‡à¸à¸”à¸ªà¸à¸´à¸¥à¸žà¸·à¹‰à¸™à¸à¸²à¸™/à¸ªà¸à¸´à¸¥à¸£à¸­à¸‡ (à¹€à¸—à¹€à¸›à¸² à¸Šà¸´à¸à¸´)
  // à¹„à¸„ à¸Šà¸´à¸‹à¸²à¸à¸´: à¹€à¸ªà¸µà¸¢à¸‡à¸žà¸²à¸à¸¢à¹Œà¸ªà¸¸à¹ˆà¸¡à¸—à¸¸à¸à¸„à¸£à¸±à¹‰à¸‡à¸—à¸µà¹ˆà¹ƒà¸Šà¹‰à¸ªà¸à¸´à¸¥ (à¸žà¸·à¹‰à¸™à¸à¸²à¸™/à¸£à¸­à¸‡/Overhaul)
  kaiVoice1: "/characters/kai/voice/kai_voice1.m4a",
  kaiVoice2: "/characters/kai/voice/kai_voice2.m4a",
  kaiVoice3: "/characters/kai/voice/kai_voice3.m4a",
  kaiVoice4: "/characters/kai/voice/kai_voice4.m4a",
  kaiVoice5: "/characters/kai/voice/kai_voice5.m4a",
  // à¸œà¸¹à¹‰à¸ªà¸±à¸‡à¸«à¸²à¸£à¸ˆà¸­à¸¡à¸¡à¸«à¸²à¹€à¸§à¸—à¸¢à¹Œ: à¹€à¸ªà¸µà¸¢à¸‡à¹‚à¸ˆà¸¡à¸•à¸µà¸›à¸à¸•à¸´à¹€à¸‰à¸žà¸²à¸°à¸•à¸±à¸§ / à¹€à¸ªà¸µà¸¢à¸‡à¸«à¸¥à¸±à¸‡ Mana Rupture / à¹€à¸žà¸¥à¸‡à¸£à¸°à¸«à¸§à¹ˆà¸²à¸‡à¸¡à¸µ Mana Burden (spellburden) à¸•à¸´à¸”à¸•à¸±à¸§à¹€à¸­à¸‡
  mageslayer_attack: "/characters/mageslayer/BA.mp3",
  mageslayer_skill2: "/characters/mageslayer/SFX_Skill_2.mp3",
  mageslayer_ult: "/characters/mageslayer/BGM_Ult.mp3",
  // à¹€à¸ªà¸µà¸¢à¸‡à¸­à¸²à¸§à¸¸à¸˜ DoomGuy (patch 2.2 full): à¹€à¸ªà¸µà¸¢à¸‡à¹‚à¸ˆà¸¡à¸•à¸µ/à¹€à¸ªà¸µà¸¢à¸‡à¹ƒà¸Šà¹‰à¸ªà¸à¸´à¸¥à¸£à¸­à¸‡ Weapon à¹à¸¢à¸à¸•à¸²à¸¡à¸­à¸²à¸§à¸¸à¸˜à¸—à¸µà¹ˆà¸–à¸·à¸­à¸­à¸¢à¸¹à¹ˆ
  doomguy_cs_shoot: "/characters/doomguy/sound/CS Shoot.mp3",
  doomguy_cs_skill: "/characters/doomguy/sound/CS Skill.mp3",
  doomguy_hc_shoot: "/characters/doomguy/sound/HC Shoot.mp3",
  doomguy_hc_skill: "/characters/doomguy/sound/HC SKill.mp3",
  doomguy_pg_shoot: "/characters/doomguy/sound/PG Shoot.mp3",
  doomguy_cg_shoot: "/characters/doomguy/sound/CG Shoot.mp3",
  doomguy_cg_skill: "/characters/doomguy/sound/CG SKill.mp3",
  doomguy_rk_shoot: "/characters/doomguy/sound/RK Shoot.mp3",
  doomguy_rk_skill: "/characters/doomguy/sound/RK Skill.mp3",
  doomguy_ss_shoot: "/characters/doomguy/sound/SS Shoot.mp3",
  doomguy_ss_skill: "/characters/doomguy/sound/SS Skill.mp3",
  doomguy_bt_shoot: "/characters/doomguy/sound/BT Shoot.mp3",
  doomguy_bt_skill: "/characters/doomguy/sound/BT Skill.mp3",
  doomguy_bfg_shoot: "/characters/doomguy/sound/BFG.mp3",
  // à¸—à¸²à¸„à¸¸à¸¡à¸´ à¸Ÿà¸¸à¸ˆà¸´à¸§à¸²à¸£à¸°: à¹€à¸žà¸¥à¸‡à¸›à¸£à¸°à¸ˆà¸³à¸•à¸±à¸§à¸•à¸²à¸¡à¹€à¸à¸µà¸¢à¸£à¹Œ (à¹€à¸à¸µà¸¢à¸£à¹Œ 3-5 / à¹€à¸à¸µà¸¢à¸£à¹Œ 6) + à¹€à¸žà¸¥à¸‡à¸£à¸°à¸«à¸§à¹ˆà¸²à¸‡à¸—à¹ˆà¸²à¹„à¸¡à¹‰à¸•à¸²à¸¢ "à¸–à¸¶à¸‡à¸ˆà¸°à¸¡à¸­à¸‡à¹„à¸¡à¹ˆà¹€à¸«à¹‡à¸™ à¹à¸•à¹ˆà¸‰à¸±à¸™à¸¢à¸±à¸‡à¸­à¸¢à¸¹à¹ˆ" à¸—à¸³à¸‡à¸²à¸™
  all_around: "/characters/takumi/all_around.mp3",
  secret_love: "/characters/takumi/secret_love.mp3",
  forever: "/characters/takumi/forever.mp3",
  // à¹à¸šà¸—à¹à¸¡à¸™ (à¹€à¸šà¸™ à¹à¸­à¸Ÿà¹€à¸Ÿà¸¥à¹‡à¸) patch 2.2.7: à¹€à¸žà¸¥à¸‡à¸£à¸°à¸«à¸§à¹ˆà¸²à¸‡à¸—à¹ˆà¸²à¹„à¸¡à¹‰à¸•à¸²à¸¢ "à¹€à¸‚à¹‰à¸²à¸¡à¸²à¹€à¸¥à¸¢" à¸—à¸³à¸‡à¸²à¸™ (à¸¥à¹ˆà¸­à¹€à¸›à¹‰à¸² 5 à¹€à¸—à¸´à¸£à¹Œà¸™)
  bat_ben: "/characters/bat_ben/bat_ben_theme.mp3",
  // à¹€à¸ˆà¹‰à¸²à¸«à¸à¸´à¸‡à¸£à¸²à¸ (à¹€à¸£à¸µà¸¢à¸§à¸à¸´ à¸Šà¸´à¸à¸´) patch 2.2.7: à¹€à¸žà¸¥à¸‡à¸£à¸°à¸«à¸§à¹ˆà¸²à¸‡à¸—à¹ˆà¸²à¹„à¸¡à¹‰à¸•à¸²à¸¢ "à¸—à¸¸à¸à¸­à¸¢à¹ˆà¸²à¸‡à¸ˆà¸°à¸•à¹‰à¸­à¸‡à¸£à¸²à¸šà¸£à¸·à¹ˆà¸™" à¸—à¸³à¸‡à¸²à¸™
  p_shiki: "/characters/princess_shiki/p_shiki_theme.m4a",
  trigger: "/characters/ultraman_trigger/trigger_theme.mp3",
  hisakawa_sunday: "/characters/hisakawa_sister/skill3/O-Ku-Ri-Mo-No.mp3",
  hisakawa_nagi_1: "/characters/hisakawa_sister/voice/nagi/nagi_voice.m4a",
  hisakawa_nagi_2: "/characters/hisakawa_sister/voice/nagi/nagi_voice2.m4a",
  hisakawa_nagi_3: "/characters/hisakawa_sister/voice/nagi/nagi_voice3.m4a",
  hisakawa_hayate_1: "/characters/hisakawa_sister/voice/hayate_voice.m4a",
  hisakawa_hayate_2: "/characters/hisakawa_sister/voice/hayate_voice2.m4a",
  hisakawa_hayate_3: "/characters/hisakawa_sister/voice/hayate_voice3.m4a",
  action_button: "/effect_sound/action_button.wav",
  trun_change: "/effect_sound/trun_change.wav",
  attack: "/effect_sound/attack.wav",
};

// à¸£à¸°à¸”à¸±à¸šà¹€à¸ªà¸µà¸¢à¸‡à¸žà¸·à¹‰à¸™à¸à¸²à¸™à¸•à¹ˆà¸­à¸Šà¸™à¸´à¸” (à¸à¹ˆà¸­à¸™à¸„à¸¹à¸“ master) â€” à¸šà¸²à¸¥à¸²à¸™à¸‹à¹Œà¹ƒà¸«à¹‰à¸”à¸±à¸‡à¹ƒà¸à¸¥à¹‰à¹€à¸„à¸µà¸¢à¸‡à¸à¸±à¸™
const MUSIC_BASE = 0.55;
const SFX_BASE = 0.85;
const CLICK_BASE = 0.55;
const VIDEO_BASE = 0.8;

// à¹€à¸žà¸¥à¸‡à¸šà¸²à¸‡à¹€à¸žà¸¥à¸‡à¸•à¹‰à¸™à¸‰à¸šà¸±à¸šà¸”à¸±à¸‡à¸à¸§à¹ˆà¸²à¹€à¸žà¸¥à¸‡à¸­à¸·à¹ˆà¸™à¸¡à¸²à¸ (à¹€à¸žà¸¥à¸‡à¸„à¸¸à¸§à¸²à¸à¸²à¸•à¸°à¸—à¸±à¹‰à¸‡ 2 à¹à¸šà¸š) â€” à¸¥à¸”à¹€à¸‰à¸žà¸²à¸°à¸•à¸±à¸§à¹ƒà¸«à¹‰à¸ªà¸¡à¸”à¸¸à¸¥à¸à¸±à¸šà¹€à¸žà¸¥à¸‡à¸­à¸·à¹ˆà¸™
const MUSIC_TRACK_SCALE = {
  final_normal: 0.6, // à¸ªà¸§à¸¡à¹€à¸à¸£à¸²à¸°à¸£à¸²à¸Šà¸±à¸™
  ex_guts: 0.6,       // Beat Mode
};
function trackVolume(name) {
  return MUSIC_BASE * (MUSIC_TRACK_SCALE[name] ?? 1) * vcurve();
}

// ---------- master volume (à¸ˆà¸³à¸„à¹ˆà¸²à¹„à¸§à¹‰à¹ƒà¸™ localStorage) ----------
let masterVolume = 0.8;
try {
  const saved = parseFloat(localStorage.getItem("echo_vol"));
  if (!Number.isNaN(saved)) masterVolume = Math.max(0, Math.min(1, saved));
} catch {}
const volListeners = new Set();

// curve à¸¢à¸à¸à¸³à¸¥à¸±à¸‡à¸ªà¸­à¸‡: à¸«à¸¹à¸„à¸™à¸£à¸±à¸šà¸£à¸¹à¹‰à¸„à¸§à¸²à¸¡à¸”à¸±à¸‡à¹à¸šà¸š log â€” à¸—à¸³à¹ƒà¸«à¹‰à¹€à¸¥à¸·à¹ˆà¸­à¸™à¸«à¸¥à¸­à¸”à¹à¸¥à¹‰à¸§à¸£à¸¹à¹‰à¸ªà¸¶à¸à¹€à¸›à¸¥à¸µà¹ˆà¸¢à¸™à¸ˆà¸£à¸´à¸‡
const vcurve = () => masterVolume * masterVolume;

export function getMasterVolume() { return masterVolume; }
export function videoVolume() { return VIDEO_BASE * vcurve(); } // à¹ƒà¸«à¹‰ <video> à¹ƒà¸Šà¹‰ (à¸œà¹ˆà¸²à¸™ curve à¹€à¸”à¸µà¸¢à¸§à¸à¸±à¸™)
export function onVolumeChange(fn) { volListeners.add(fn); return () => volListeners.delete(fn); }
export function setMasterVolume(v) {
  masterVolume = Math.max(0, Math.min(1, v));
  try { localStorage.setItem("echo_vol", String(masterVolume)); } catch {}
  if (currentMusic) getMusic(currentMusic).volume = trackVolume(currentMusic);
  volListeners.forEach((fn) => fn(masterVolume));
}

let currentMusic = null;
// seq à¸¥à¹ˆà¸²à¸ªà¸¸à¸” "à¸•à¹ˆà¸­à¹€à¸žà¸¥à¸‡" (à¹„à¸¡à¹ˆà¹ƒà¸Šà¹ˆà¸•à¹ˆà¸­à¸à¸²à¸£à¸ªà¸¥à¸±à¸šà¹€à¸žà¸¥à¸‡): à¸ˆà¸³à¹„à¸§à¹‰à¹à¸¡à¹‰à¹€à¸žà¸¥à¸‡à¸–à¸¹à¸à¸žà¸±à¸/à¸ªà¸¥à¸±à¸šà¸­à¸­à¸
// -> à¸à¸¥à¸±à¸šà¸¡à¸²à¹€à¸¥à¹ˆà¸™à¹€à¸žà¸¥à¸‡à¹€à¸”à¸´à¸¡à¸”à¹‰à¸§à¸¢ seq à¹€à¸”à¸´à¸¡ (à¹€à¸Šà¹ˆà¸™ à¸«à¸¥à¸±à¸‡à¸ˆà¸š cutscene à¸‚à¸­à¸‡à¸„à¸™à¸­à¸·à¹ˆà¸™) = à¹€à¸¥à¹ˆà¸™à¸•à¹ˆà¸­à¸ˆà¸²à¸à¸ˆà¸¸à¸”à¹€à¸”à¸´à¸¡ à¹„à¸¡à¹ˆà¹€à¸£à¸´à¹ˆà¸¡à¹ƒà¸«à¸¡à¹ˆ
// -> seq à¹ƒà¸«à¸¡à¹ˆ (à¹€à¸›à¸´à¸”à¸—à¹ˆà¸²à¸„à¸£à¸±à¹‰à¸‡à¹ƒà¸«à¸¡à¹ˆ / à¸„à¸™à¸­à¸·à¹ˆà¸™à¹€à¸›à¸´à¸”à¸—à¹ˆà¸²à¹€à¸žà¸¥à¸‡à¹€à¸”à¸µà¸¢à¸§à¸à¸±à¸™à¸—à¸±à¸š) = à¹€à¸£à¸´à¹ˆà¸¡à¸ˆà¸²à¸à¸•à¹‰à¸™
const musicSeq = {};
const musicCache = {};
function getMusic(name) {
  if (!musicCache[name]) {
    const a = new Audio(FILES[name]);
    a.loop = true;
    musicCache[name] = a;
  }
  musicCache[name].volume = trackVolume(name);
  return musicCache[name];
}

// seq: identity à¸‚à¸­à¸‡à¸à¸²à¸£à¹€à¸›à¸´à¸”à¹€à¸žà¸¥à¸‡à¸ªà¸à¸´à¸¥ â€” à¹€à¸›à¸´à¸”à¸—à¹ˆà¸²à¹ƒà¸«à¸¡à¹ˆ/à¸„à¸™à¹ƒà¸«à¸¡à¹ˆà¸—à¸±à¸šà¹€à¸žà¸¥à¸‡à¹€à¸”à¸´à¸¡ = seq à¹ƒà¸«à¸¡à¹ˆ -> à¹€à¸£à¸´à¹ˆà¸¡à¸ˆà¸²à¸à¸•à¹‰à¸™
// à¹€à¸žà¸¥à¸‡à¸—à¸±à¹ˆà¸§à¹„à¸› (main_home / card_prepare_turn) à¹„à¸¡à¹ˆà¸ªà¹ˆà¸‡ seq -> à¹€à¸¥à¹ˆà¸™à¸•à¹ˆà¸­à¸ˆà¸²à¸à¸ˆà¸¸à¸”à¹€à¸”à¸´à¸¡ (à¹€à¸‰à¸žà¸²à¸°à¹ƒà¸™à¹à¸¡à¸•à¸Šà¹Œ)
export function playMusic(name, seq) {
  if (!FILES[name]) return;
  const a = getMusic(name);
  // seq à¹€à¸”à¸´à¸¡à¸‚à¸­à¸‡à¹€à¸žà¸¥à¸‡à¸™à¸µà¹‰ (à¸ˆà¸³à¸‚à¹‰à¸²à¸¡à¸à¸²à¸£à¸žà¸±à¸/à¸ªà¸¥à¸±à¸šà¹€à¸žà¸¥à¸‡) â€” à¹€à¸›à¸¥à¸µà¹ˆà¸¢à¸™à¹€à¸¡à¸·à¹ˆà¸­à¹„à¸«à¸£à¹ˆà¸„à¹ˆà¸­à¸¢à¹€à¸£à¸´à¹ˆà¸¡à¹€à¸žà¸¥à¸‡à¹ƒà¸«à¸¡à¹ˆà¸ˆà¸²à¸à¸•à¹‰à¸™
  const isNewSeq = seq != null && seq !== musicSeq[name];
  if (isNewSeq) {
    musicSeq[name] = seq;
    a.currentTime = 0; // à¸à¸²à¸£à¹€à¸›à¸´à¸”à¸£à¹ˆà¸²à¸‡à¸„à¸£à¸±à¹‰à¸‡à¹ƒà¸«à¸¡à¹ˆ (à¸à¸”à¹ƒà¸«à¸¡à¹ˆ/à¹‚à¸”à¸™à¸„à¸™à¸­à¸·à¹ˆà¸™à¸—à¸±à¸š) -> à¹€à¸£à¸´à¹ˆà¸¡à¸ˆà¸²à¸à¸•à¹‰à¸™
  }
  if (currentMusic === name) {
    if (isNewSeq || a.paused) a.play().catch(() => {}); // à¹„à¸¡à¹ˆà¹ƒà¸Šà¹ˆ seq à¹ƒà¸«à¸¡à¹ˆ = à¹€à¸¥à¹ˆà¸™à¸•à¹ˆà¸­à¸ˆà¸²à¸à¸•à¸³à¹à¸«à¸™à¹ˆà¸‡à¹€à¸”à¸´à¸¡
    return;
  }
  if (currentMusic) getMusic(currentMusic).pause(); // à¸žà¸±à¸à¹€à¸žà¸¥à¸‡à¹€à¸”à¸´à¸¡ à¹€à¸à¹‡à¸šà¸•à¸³à¹à¸«à¸™à¹ˆà¸‡à¹„à¸§à¹‰ (à¹ƒà¸™à¹à¸¡à¸•à¸Šà¹Œ)
  currentMusic = name;
  a.play().catch(() => {}); // seq à¹€à¸”à¸´à¸¡ (à¹€à¸Šà¹ˆà¸™ à¸à¸¥à¸±à¸šà¸¡à¸²à¸«à¸¥à¸±à¸‡ cutscene) -> à¹€à¸¥à¹ˆà¸™à¸•à¹ˆà¸­à¸ˆà¸²à¸à¸ˆà¸¸à¸”à¹€à¸”à¸´à¸¡ à¹„à¸¡à¹ˆà¹€à¸£à¸´à¹ˆà¸¡à¹ƒà¸«à¸¡à¹ˆ
}
export function stopMusic() {
  if (!currentMusic) return;
  getMusic(currentMusic).pause(); // à¸žà¸±à¸à¹„à¸§à¹‰ à¹„à¸¡à¹ˆà¸£à¸µà¹€à¸‹à¹‡à¸• -> à¸à¸¥à¸±à¸šà¸¡à¸²à¹€à¸¥à¹ˆà¸™à¸•à¹ˆà¸­à¸ˆà¸²à¸à¸ˆà¸¸à¸”à¹€à¸”à¸´à¸¡ (à¹ƒà¸™à¹à¸¡à¸•à¸Šà¹Œ)
  currentMusic = null;
}
// à¹€à¸£à¸´à¹ˆà¸¡à¹€à¸à¸¡à¹ƒà¸«à¸¡à¹ˆ / à¸ˆà¸šà¹à¸¡à¸•à¸Šà¹Œ: à¸£à¸µà¹€à¸‹à¹‡à¸•à¸•à¸³à¹à¸«à¸™à¹ˆà¸‡à¹€à¸žà¸¥à¸‡à¸—à¸¸à¸à¹€à¸žà¸¥à¸‡ -> à¸„à¸£à¸±à¹‰à¸‡à¸–à¸±à¸”à¹„à¸›à¹€à¸£à¸´à¹ˆà¸¡à¸ˆà¸²à¸à¸•à¹‰à¸™à¸—à¸±à¹‰à¸‡à¸«à¸¡à¸”
export function resetMusicPositions() {
  for (const a of Object.values(musicCache)) {
    a.pause();
    a.currentTime = 0;
  }
  for (const k of Object.keys(musicSeq)) delete musicSeq[k];
  currentMusic = null;
}
export function playSfx(name) {
  if (!FILES[name]) return;
  const a = new Audio(FILES[name]);
  a.volume = (name === "action_button" ? CLICK_BASE : SFX_BASE) * vcurve();
  a.play().catch(() => {});
}
export function clickSound() { playSfx("action_button"); }

// DoomGuy (patch 2.2 full): à¸­à¸²à¸§à¸¸à¸˜ id (à¸•à¸²à¸¡ server) -> à¸Šà¸·à¹ˆà¸­à¹„à¸Ÿà¸¥à¹Œà¹€à¸ªà¸µà¸¢à¸‡à¸¢à¸´à¸‡/à¹€à¸ªà¸µà¸¢à¸‡à¸ªà¸à¸´à¸¥à¹ƒà¸™ FILES à¸”à¹‰à¸²à¸™à¸šà¸™
export const DOOM_WEAPON_SOUNDS = {
  shotgun: { shoot: "doomguy_cs_shoot", skill: "doomguy_cs_skill" },
  heavy: { shoot: "doomguy_hc_shoot", skill: "doomguy_hc_skill" },
  plasma: { shoot: "doomguy_pg_shoot", skill: null },
  chaingun: { shoot: "doomguy_cg_shoot", skill: "doomguy_cg_skill" },
  rocket: { shoot: "doomguy_rk_shoot", skill: "doomguy_rk_skill" },
  supershotgun: { shoot: "doomguy_ss_shoot", skill: "doomguy_ss_skill" },
  ballista: { shoot: "doomguy_bt_shoot", skill: "doomguy_bt_skill" },
  bfg: { shoot: "doomguy_bfg_shoot", skill: null },
};

function resumeCurrent() {
  if (currentMusic) {
    const a = getMusic(currentMusic);
    if (a.paused) a.play().catch(() => {});
  }
}
if (typeof window !== "undefined") window.addEventListener("pointerdown", resumeCurrent);
