// ============================================================
//  ไฟล์มัดรวม (bundle) — รวมทุกไฟล์สคริปต์ตัวละครที่แยกออกมาจาก server.js
//  ใน server.js เรียกใช้ผ่าน CHAR_HOOKS[characterId] เท่านั้น
//
//  หมายเหตุ (สถานะ ณ วันที่เริ่มโปรเจกต์): ตัวละครส่วนใหญ่ยังอยู่ใน server.js
//  ตามเดิม (useSkill()/doAttack() ยังเป็นไฟล์เดียวสำหรับตัวที่ยังไม่ได้ย้าย) —
//  นี่คือโปรเจกต์แยกที่ทยอยย้ายทีละตัวละคร ไม่ได้ทำเสร็จในครั้งเดียว
// ============================================================

const tohno = require("./tohno");
const temari = require("./temari");
const kuwagata = require("./kuwagata");
const eva13 = require("./eva13");
const oberon = require("./oberon");
const takuto = require("./takuto");
const appleguy = require("./appleguy");
const nanaya = require("./nanaya");
const satoru = require("./satoru");
const shiki = require("./shiki");
const doomguy = require("./doomguy");
const oguri = require("./oguri");
const hakuno = require("./hakuno");
const miyako = require("./miyako");
const banagher = require("./banagher");
const riddhe = require("./riddhe");
const tepeu = require("./tepeu");
const shrade_elan = require("./shrade_elan");
const hikaru = require("./hikaru");
const phenex = require("./phenex");
const kotone = require("./kotone");
const gambler = require("./gambler");
const broadband_man = require("./broadband_man");
const bard = require("./bard");
const kai = require("./kai");
const mageslayer = require("./mageslayer");
const takumi = require("./takumi");

const CHARACTER_MODULES = [
  tohno,
  temari,
  kuwagata,
  eva13,
  oberon,
  takuto,
  appleguy,
  nanaya,
  satoru,
  shiki,
  doomguy,
  oguri,
  hakuno,
  miyako,
  banagher,
  riddhe,
  tepeu,
  shrade_elan,
  hikaru,
  phenex,
  kotone,
  gambler,
  broadband_man,
  bard,
  kai,
  mageslayer,
  takumi,
];

const CHAR_HOOKS = {};
for (const mod of CHARACTER_MODULES) CHAR_HOOKS[mod.id] = mod;

module.exports = CHAR_HOOKS;
