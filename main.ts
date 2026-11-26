// THE WORLD IN ONE DAY - Wednesday 25 November 2026.
// A newspaper front page drawn pixel by pixel with the Node standard
// library only: a tiny software rasteriser, a hand-made 5x7 bitmap
// font, a hand-drawn world map, and a minimal PNG encoder.
// Deterministic by construction: no clock, no randomness without a
// fixed seed, no network. Two runs write the same bytes.

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------- canvas

const W = 1024;
const H = 1024;
const px = new Uint8Array(W * H * 3);

type RGB = [number, number, number];

// Optional clip rectangle [x0, y0, x1, y1): scenes draw inside it so a
// big shape (the Earth disc) can never spill over the text below.
let clip: [number, number, number, number] | null = null;
const PAPER: RGB = [247, 243, 233];
const INK: RGB = [20, 22, 28];
const FAINT: RGB = [108, 104, 94];
const RED: RGB = [178, 32, 40];
const BLUE: RGB = [29, 78, 137];
const DEEP: RGB = [16, 32, 56];
const GOLD: RGB = [198, 148, 44];
const GREEN: RGB = [38, 110, 62];
const SKY: RGB = [188, 216, 240];
const LAND: RGB = [214, 203, 168];
const SEA: RGB = [168, 198, 224];
const WHITE: RGB = [255, 255, 255];

function setPx(x: number, y: number, c: RGB): void {
  const xi = Math.round(x);
  const yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= W || yi >= H) return;
  if (clip && (xi < clip[0] || yi < clip[1] || xi >= clip[2] || yi >= clip[3])) return;
  const i = (yi * W + xi) * 3;
  px[i] = c[0];
  px[i + 1] = c[1];
  px[i + 2] = c[2];
}

function fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
  for (let yy = Math.round(y); yy < Math.round(y + h); yy++)
    for (let xx = Math.round(x); xx < Math.round(x + w); xx++) setPx(xx, yy, c);
}

function frameRect(x: number, y: number, w: number, h: number, c: RGB, t = 2): void {
  fillRect(x, y, w, t, c);
  fillRect(x, y + h - t, w, t, c);
  fillRect(x, y, t, h, c);
  fillRect(x + w - t, y, t, h, c);
}

function line(x0: number, y0: number, x1: number, y1: number, c: RGB, t = 1): void {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let s = 0; s <= steps; s++) {
    const x = x0 + ((x1 - x0) * s) / steps;
    const y = y0 + ((y1 - y0) * s) / steps;
    fillRect(x - t / 2, y - t / 2, t, t, c);
  }
}

function disc(cx: number, cy: number, r: number, c: RGB): void {
  for (let y = -r; y <= r; y++)
    for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r) setPx(cx + x, cy + y, c);
}

function ring(cx: number, cy: number, r: number, c: RGB): void {
  for (let a = 0; a < 360; a += 2) {
    const rad = (a * Math.PI) / 180;
    setPx(cx + r * Math.cos(rad), cy + r * Math.sin(rad), c);
    setPx(cx + (r - 1) * Math.cos(rad), cy + (r - 1) * Math.sin(rad), c);
  }
}

// ---------------------------------------------------------- PNG out

const CRC_TABLE = ((): Int32Array => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type RGB
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0; // filter: none
    Buffer.from(px.buffer, y * W * 3, W * 3).copy(raw, y * (1 + W * 3) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------- font
// A 5x7 bitmap font, drawn by hand for this page. Rows are strings of
// five bits, top row first. The renderer upper-cases everything.

const FONT: Record<string, string[]> = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11100', '10010', '10001', '10001', '10001', '10010', '11100'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '10001', '11001', '10101', '10011', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
  '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  ',': ['00000', '00000', '00000', '00000', '01100', '00100', '01000'],
  ':': ['00000', '01100', '01100', '00000', '01100', '01100', '00000'],
  ';': ['00000', '01100', '01100', '00000', '01100', '00100', '01000'],
  '-': ['00000', '00000', '00000', '01110', '00000', '00000', '00000'],
  '+': ['00000', '00100', '00100', '01110', '00100', '00100', '00000'],
  '%': ['11001', '11010', '00010', '00100', '01000', '01011', '10011'],
  '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
  '(': ['00010', '00100', '01000', '01000', '01000', '00100', '00010'],
  ')': ['01000', '00100', '00010', '00010', '00010', '00100', '01000'],
  "'": ['00100', '00100', '01000', '00000', '00000', '00000', '00000'],
  '!': ['00100', '00100', '00100', '00100', '00100', '00000', '00100'],
  '?': ['01110', '10001', '00001', '00110', '00100', '00000', '00100'],
  '&': ['01100', '10010', '10100', '01000', '10101', '10010', '01101'],
  '$': ['00100', '01111', '10100', '01110', '00101', '11110', '00100'],
  '"': ['01010', '01010', '01010', '00000', '00000', '00000', '00000'],
  '#': ['01010', '01010', '11111', '01010', '11111', '01010', '01010'],
  '*': ['00000', '10101', '01110', '10101', '00000', '00000', '00000'],
  '=': ['00000', '00000', '01110', '00000', '01110', '00000', '00000'],
};

function textW(s: string, scale: number): number {
  return s.length === 0 ? 0 : s.length * 6 * scale - scale;
}

function drawText(x: number, y: number, s: string, scale: number, c: RGB): void {
  const up = s.toUpperCase();
  for (let i = 0; i < up.length; i++) {
    const glyph = FONT[up[i]] ?? FONT[' '];
    for (let row = 0; row < 7; row++)
      for (let col = 0; col < 5; col++)
        if (glyph[row][col] === '1')
          fillRect(x + i * 6 * scale + col * scale, y + row * scale, scale, scale, c);
  }
}

function drawTextC(cx: number, y: number, s: string, scale: number, c: RGB): void {
  drawText(cx - textW(s, scale) / 2, y, s, scale, c);
}

// Word-wrap into lines of at most maxChars characters.
function wrap(s: string, maxChars: number): string[] {
  const words = s.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (cur === '') cur = w;
    else if ((cur + ' ' + w).length <= maxChars) cur += ' ' + w;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur !== '') lines.push(cur);
  return lines;
}

function drawWrapped(
  x: number,
  y: number,
  s: string,
  maxChars: number,
  scale: number,
  lineH: number,
  c: RGB,
): number {
  const lines = wrap(s, maxChars);
  lines.forEach((ln, i) => drawText(x, y + i * lineH, ln, scale, c));
  return lines.length;
}

// ---------------------------------------------------------- world map
// A coarse equirectangular land grid drawn for this page: 84 columns
// (longitude -180..180) by 40 rows (latitude 90..-70). '#' is land.

const MAP_ROWS: string[] = [
  '....................................................................................',
  '........##..##.................####....................##.##........................',
  '.........#####................######................##..........#####...............',
  '.......##########............######..................##..##..##..##..##..##..##..##...',
  '..#####.################.....####.............###.##################################..',
  '..#####################.......##.....#.......#####.#################################..',
  '...##################.................##...########################################...',
  '..........################...............#.########################################...',
  '..........###############................##########################################...',
  '..........###############................#########################################......',
  '...........#############................################.##################...........',
  '...........#############.................#######..#################################.....',
  '...........############..................#####...####...###.########################....',
  '...........##########...................##########..###############################.....',
  '...........#########..................################...########################.....',
  '...........######.....................###############..##########################.......',
  '...........#####......................#############....#########################........',
  '...........###........................############.....########################.........',
  '......................................#############....#######################..........',
  '........................####..........############.....##########################.......',
  '........................########......###########......###########################......',
  '........................#########.....###########.......##########################......',
  '.........................########.....##########........########################........',
  '.........................#########....##########.........####################...........',
  '.........................#########....#########...............#############.........',
  '.........................#########....#########..........##########################.......',
  '..........................########....########...........##########################.......',
  '..........................########....#######......#.....#########################.......',
  '..........................#######.....######.......#.....########################.........',
  '..........................#######.....#####...............#######################.........',
  '..........................######......####.................######################...........',
  '..........................######...................................#####..........##.....',
  '..........................#####.....................................................##.....',
  '..........................#####.....................................................##.....',
  '..........................###................................................................',
  '..........................###................................................................',
  '..........................##.................................................................',
  '....................................................................................',
  '.................................................................................#...........',
  '....................................................................................',
];

const MAP_X = 50;
const MAP_Y = 522;
const CELL_W = 11;
const CELL_H = 4;

function drawMap(): void {
  fillRect(MAP_X - 6, MAP_Y - 6, 84 * CELL_W + 12, 40 * CELL_H + 12, SEA);
  for (let r = 0; r < MAP_ROWS.length; r++) {
    const row = MAP_ROWS[r].padEnd(84, '.').slice(0, 84);
    for (let c = 0; c < 84; c++)
      if (row[c] === '#') fillRect(MAP_X + c * CELL_W, MAP_Y + r * CELL_H, CELL_W, CELL_H, LAND);
  }
}

// [longitude, latitude, story number]
const PINS: Array<[number, number, number]> = [
  [100.29, 40.96, 1], // Jiuquan
  [139.69, 35.68, 2], // Tokyo
  [-91.26, 40.82, 3], // Middletown, Iowa
  [30.72, 46.48, 4], // Odesa
  [-74.01, 40.71, 5], // New York
  [-77.04, 38.9, 6], // Washington DC
  [6.14, 46.2, 7], // Geneva
  [171.03, -63.2, 8], // Balleny Islands
  [72.88, 19.08, 9], // Mumbai
  [149.13, -35.28, 11], // Canberra
  [13.4, 52.52, 12], // Berlin
  [126.97, 37.56, 13], // Seoul
  [50.16, 26.64, 14], // Ras Tanura
  [50.15, 53.2, 15], // Samara
  [116.4, 39.9, 16], // Beijing
  [-8.0, 12.63, 17], // Bamako (Sahel)
  [35.93, 31.95, 21], // Amman
  [101.69, 3.14, 22], // Kuala Lumpur
  [30.25, 1.57, 25], // Bunia, Ituri
  [31.24, 30.04, 26], // Cairo
  [7.51, 6.44, 27], // Enugu
  [34.36, 11.79, 28], // Damazin
  [28.04, -26.19, 29], // Johannesburg
  [11.34, 44.49, 30], // Bologna
  [-122.42, 37.77, 32], // San Francisco
  [121.47, 31.23, 33], // Shanghai
  [107.61, -6.91, 36], // Bandung
];

function pinXY(lon: number, lat: number): [number, number] {
  const x = MAP_X + ((lon + 180) / 360) * 84 * CELL_W;
  const y = MAP_Y + ((90 - lat) / 160) * 40 * CELL_H;
  return [x, y];
}

function drawPins(): void {
  for (const [lon, lat, n] of PINS) {
    const [x, y] = pinXY(lon, lat);
    disc(x, y, 4, WHITE);
    disc(x, y, 3, RED);
    const label = String(n);
    drawText(x + 5, y - 3, label, 1, INK);
  }
}

// ---------------------------------------------------------- the briefs index
// All 36 stories of the day, grouped into nine regions. Story 10 (the
// docking) is folded into story 1, as it was in the day's reporting.

const REGIONS: Array<{ name: string; items: string[] }> = [
  {
    name: 'EAST ASIA',
    items: [
      '1 SHENZHOU-24 DOCKS AT TIANGONG, 1ST FOREIGN CREW',
      '2 NIKKEI CLOSES -2.78% AT 57,011.62: CHIPS -10%',
      '13 KOSPI PLUNGES -6.16% TO 4,697.51: SAMSUNG -9.87%',
      '16 CHINA GRAFT PROBE: SHANGHAI CHIEF CHEN JINING',
      '23 SHANGHAI -2%: HANG SENG -1.14%, 7TH LOSS RUNNING',
      '33 PROBE: $270M AI SERVERS FINANCED VIA HUANG FIRMS',
    ],
  },
  {
    name: 'SOUTH + SE ASIA',
    items: [
      '9 TATA BIDS RS32,266 CR FOR 52.38% OF APL APOLLO',
      '22 MALAYSIA CONDEMNS GAZA STRIKE (STRIKE WAS MON)',
      '36 PERSIB BANDUNG BEAT FC SEOUL 3-1 IN ACL TWO',
    ],
  },
  {
    name: 'OCEANIA + SOUTHERN OCEAN',
    items: [
      '8 M5.9 QUAKE, BALLENY ISLANDS: NO DAMAGE, NO TSUNAMI',
      '11 AUSTRALIA CPI 4.9% IN OCT: TRIMMED MEAN 3.8%',
    ],
  },
  {
    name: 'WORLD / UNITED NATIONS',
    items: [
      '34 UN RIGHTS CHIEF: ATROCITY RISK, WEST BANK + GAZA',
      '35 UNGA SETS 3-YEAR CYCLE FOR UN WATER CONFERENCES',
    ],
  },
  {
    name: 'EUROPE',
    items: [
      '7 CHESS GAME 2 DRAWN IN 20 MOVES: MATCH LEVEL 1-1',
      '12 GERMANY Q3 GDP FINAL: +0.1% QOQ, EXPORTS WEAKER',
      '20 EUROPE CLOSES: FTSE -0.38%, DAX -1.26%, CAC -0.75%',
      '30 DAVIS CUP: MUSETTI BEATS HONG: ITALY 1-0 KOREA',
    ],
  },
  {
    name: 'THE WAR IN UKRAINE',
    items: [
      '4 RUSSIAN STRIKE KILLS 2, ODESA (LATE TUE, REP. WED)',
      '15 UKRAINIAN DRONES HIT SAMARA REFINERIES: 1 KILLED',
      '18 ZELENSKYY: UKRAINE NEEDS EUR115BN FOR 2027',
    ],
  },
  {
    name: 'MIDDLE EAST',
    items: [
      '14 HOUTHIS CLAIM RAS TANURA ATTACK: 4 DRONES DOWNED',
      '21 JORDAN: DEATH SENTENCE OVER OFFICER KILLING',
    ],
  },
  {
    name: 'AFRICA',
    items: [
      '17 SAHEL INSURGENTS TAKE WAR TO SKIES WITH DRONES',
      '25 DRC: UN EVACUATES 10 EBOLA WORKERS IN ITURI',
      '26 EGYPT RING-ROAD FUEL FIRE KILLS 21',
      '27 NIGERIA SEIZES $227M METH: FIVE MEXICANS ARRESTED',
      '28 SUDAN: RSF DRONES KILL 19, DAMAZIN (REP. WED)',
      '29 RAMAPHOSA WINS BID TO SET ASIDE FARMGATE REPORT',
    ],
  },
  {
    name: 'AMERICAS',
    items: [
      '3 IOWA BLAST: 9,700 LB LEAD AZIDE: EPA - NO LEAD',
      "5 NOR'EASTER BUILDS: MACY'S BALLOONS AT RISK THU",
      '6 US DATA DAY: GDP +4.3%, CORE PCE +3.3%, CLAIMS 189K',
      '19 US TECH ROUT (TUE): NVIDIA -5.9%, MICRON -11%',
      '24 US PROPOSES SECTION 301 TARIFFS ON 14 PARTNERS',
      '31 WALL ST WED: S+P -2.6%, NASDAQ -4.0% (LATE)',
      '32 ANTHROPIC BELOW IPO PRICE: $80.50 VS $83',
    ],
  },
];

const TIMELINE =
  '00:18 SHENZHOU-24 LAUNCHES, JIUQUAN - 00:30 AUSTRALIA CPI 4.9% - 01:38 M5.9 BALLENY QUAKE - 03:56 SHENZHOU-24 DOCKS AT TIANGONG - 06:00 NIKKEI -2.78% AND KOSPI -6.16% CLOSE - 07:00 GERMANY GDP +0.1% - 12:44 NIGERIA $227M METH SEIZURE - 13:30 US GDP +4.3%, CORE PCE +3.3% - 14:00 CHESS GAME 2 BEGINS, GENEVA - 15:00 IOWA DETONATION - 16:30 EUROPE CLOSES LOWER - 18:23 UN EVACUATES EBOLA WORKERS, ITURI';

const DATE_CHECK =
  'CHECKED AND LEFT OUT AS NOT 25 NOV NEWS: CIA HACK (24 NOV) - HUAWEI GUILTY VERDICT (24 NOV) - DEMOCRATS REACH 259 HOUSE SEATS (24 NOV) - SARKOZY TRIAL ORDER (24 NOV) - SENEGAL REINSTATED AS AFCON CHAMPIONS (24 NOV) - SOORYAVANSHI 204 OFF 53 (24 NOV) - CHESS GAME 1 (24 NOV) - CHAMPIONS LEAGUE MATCHDAY 5 (24 NOV) - ENGLAND T20I WIN (24 NOV) - IRAN RIAL RECORD LOW (24 NOV)';

// ---------------------------------------------------------- scenes

// Deterministic star field (fixed-seed LCG; no clock, no Math.random).
let seed = 987654321;
function rnd(): number {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}

function sceneSpace(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, DEEP);
  for (let i = 0; i < 90; i++) {
    const sx = x + rnd() * (w - 4);
    const sy = y + rnd() * (h - 30);
    setPx(sx, sy, WHITE);
    if (i % 7 === 0) setPx(sx + 1, sy, SKY);
  }
  // Earth curve along the bottom.
  disc(x + w / 2, y + h + 190, 230, BLUE);
  disc(x + w / 2, y + h + 196, 230, SEA);
  // Rocket on the left, climbing.
  const rx = x + 62;
  const ry = y + 26;
  fillRect(rx - 9, ry + 18, 18, 44, WHITE);
  for (let i = 0; i < 9; i++) fillRect(rx - 1 - i, ry + 8 + i, 2 + 2 * i, 1, RED);
  fillRect(rx - 15, ry + 52, 6, 12, RED);
  fillRect(rx + 9, ry + 52, 6, 12, RED);
  disc(rx, ry + 34, 4, BLUE);
  fillRect(rx - 4, ry + 62, 8, 10, GOLD);
  fillRect(rx - 2, ry + 72, 4, 8, RED);
  // Tiangong station on the right: core module and two solar wings.
  const sx = x + w - 128;
  const sy = y + 34;
  fillRect(sx, sy, 74, 14, [198, 202, 208]);
  fillRect(sx + 30, sy - 8, 14, 30, [168, 172, 180]);
  fillRect(sx - 44, sy + 2, 40, 10, BLUE);
  fillRect(sx + 78, sy + 2, 40, 10, BLUE);
  for (let i = 0; i < 4; i++) {
    line(sx - 44 + i * 10, sy + 2, sx - 44 + i * 10, sy + 12, SKY, 1);
    line(sx + 78 + i * 10, sy + 2, sx + 78 + i * 10, sy + 12, SKY, 1);
  }
  disc(sx + 37, sy + 7, 3, GOLD);
}

function sceneChart(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, [240, 238, 231]);
  for (let gy = y + 14; gy < y + h - 8; gy += 18) line(x + 8, gy, x + w - 8, gy, [206, 202, 190], 1);
  for (let gx = x + 12; gx < x + w - 8; gx += 26) line(gx, y + 8, gx, y + h - 8, [206, 202, 190], 1);
  // Tuesday's surge, then Wednesday's plunge.
  const pts: Array<[number, number]> = [
    [10, 74], [52, 70], [94, 44], [128, 30], [160, 38], [196, 58], [232, 82], [268, 96], [306, 104],
  ];
  for (let i = 0; i + 1 < pts.length; i++)
    line(x + pts[i][0], y + pts[i][1], x + pts[i + 1][0], y + pts[i + 1][1], RED, 3);
  for (const [qx, qy] of pts) disc(x + qx, y + qy, 3, RED);
  drawText(x + 12, y + 8, '-2.78%', 3, RED);
  drawText(x + w - 118, y + h - 16, 'CLOSE 57,011.62', 1, INK);
}

function sceneBlast(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, SKY);
  disc(x + w - 44, y + 22, 12, GOLD);
  // Ground and plant silhouette.
  fillRect(x, y + h - 26, w, 26, [206, 188, 148]);
  fillRect(x + 18, y + h - 48, 52, 22, INK);
  fillRect(x + 80, y + h - 58, 14, 32, INK);
  fillRect(x + 104, y + h - 42, 40, 16, INK);
  // The plume: stacked discs rising from the plant.
  const plume: Array<[number, number, number, RGB]> = [
    [70, 66, 10, [240, 238, 232]], [84, 56, 13, [232, 229, 220]], [102, 46, 16, [240, 238, 232]],
    [124, 38, 15, [226, 222, 210]], [148, 34, 12, [240, 238, 232]], [170, 34, 9, [232, 229, 220]],
  ];
  for (const [dx, dy, r, c] of plume) disc(x + dx, y + dy, r, c);
  fillRect(x + 58, y + h - 62, 10, 20, [120, 116, 106]);
  // EPA result tag.
  fillRect(x + w - 158, y + h - 22, 150, 15, GREEN);
  drawText(x + w - 152, y + h - 18, 'EPA: ZERO LEAD IN AIR', 1, WHITE);
}

// ---------------------------------------------------------- page sections

function drawLead(
  x: number,
  kicker: string,
  headline: string,
  body: string,
  scene: (x: number, y: number, w: number, h: number) => void,
): void {
  clip = [x, 116, x + 320, 232];
  scene(x, 116, 320, 116);
  clip = null;
  frameRect(x, 116, 320, 116, INK, 2);
  drawText(x, 240, kicker, 1, RED);
  drawWrapped(x, 254, headline, 26, 2, 17, INK);
  drawWrapped(x, 292, body, 53, 1, 10, INK);
}

function drawCard(x: number, num: string, region: string, headline: string, body: string): void {
  fillRect(x, 384, 320, 17, INK);
  drawText(x + 8, 389, num + ' - ' + region, 1, WHITE);
  frameRect(x, 384, 320, 108, INK, 2);
  drawWrapped(x + 6, 406, headline, 25, 2, 16, INK);
  drawWrapped(x + 6, 442, body, 51, 1, 10, INK);
}

function sectionHead(x: number, y: number, s: string): void {
  drawText(x, y, s, 2, INK);
  fillRect(x, y + 18, textW(s, 2), 3, RED);
}

function drawBriefs(): void {
  const cols: string[][][] = [
    [REGIONS[0], REGIONS[1], REGIONS[2], REGIONS[3]],
    [REGIONS[4], REGIONS[5], REGIONS[6]],
    [REGIONS[7], REGIONS[8]],
  ];
  const xs = [16, 352, 688];
  cols.forEach((regions, ci) => {
    let y = 788;
    for (const region of regions) {
      drawText(xs[ci], y, region.name, 1, RED);
      y += 9;
      for (const item of region.items) {
        drawText(xs[ci], y, item, 1, INK);
        y += 9;
      }
      y += 3;
    }
  });
}

function drawPage(): void {
  fillRect(0, 0, W, H, PAPER);
  frameRect(6, 6, W - 12, H - 12, INK, 3);

  // Masthead.
  drawTextC(512, 14, "ONE IMAGE - THE WHOLE DAY - 36 STORIES - 9 REGIONS - 6 CONTINENTS", 1, FAINT);
  drawTextC(512, 28, 'THE WORLD IN ONE DAY', 5, INK);
  fillRect(16, 72, 992, 28, INK);
  drawTextC(512, 79, 'WEDNESDAY 25 NOVEMBER 2026', 2, WHITE);
  drawTextC(512, 106, 'EVERY STORY BELOW HAPPENED, OR WAS FIRST REPORTED, ON WEDNESDAY 25 NOVEMBER 2026', 1, FAINT);

  // The three leads.
  drawLead(
    16,
    '1 - SPACE - JIUQUAN, CHINA',
    'CHINA FLIES ITS FIRST FOREIGN ASTRONAUT',
    "SHENZHOU-24 LAUNCHED 00:18 UTC FROM JIUQUAN AND DOCKED AT THE TIANGONG STATION AT 03:56 UTC. ABOARD: COMMANDER TANG HONGBO, WU YI AND PAKISTANI PILOT MUHAMMAD ZEESHAN ALI, 40 - THE FIRST FOREIGN ASTRONAUT ON A CHINESE STATION, FLYING PAKISTANI BIOTECH EXPERIMENTS.",
    sceneSpace,
  );
  drawLead(
    352,
    '2 - MARKETS - TOKYO',
    'NIKKEI TUMBLES 2.78% AS AI REBOUND STUMBLES',
    "THE NIKKEI 225 CLOSED AT 57,011.62, DOWN 1,633 POINTS, GIVING BACK MOST OF TUESDAY'S +3.91% SURGE. CHIP NAMES LED THE FALL: ADVANTEST, TOKYO ELECTRON, SOFTBANK AND KIOXIA EACH FELL 10-12%. THE BROADER TOPIX LOST ONLY 0.50% - THE PAIN SAT IN A FEW HIGH-PRICED CHIP STOCKS.",
    sceneChart,
  );
  drawLead(
    688,
    '3 - UNITED STATES - IOWA',
    'ARMY BLOWS UP 9,700 LB OF LEAD AZIDE IN IOWA',
    '68 DRUMS OF DEGRADED LEAD AZIDE - 9,700 LB, STORED 20+ YEARS - WERE DETONATED AT THE IOWA ARMY AMMUNITION PLANT NEAR MIDDLETOWN, THE LARGEST SUCH BLAST IN NEARLY 50 YEARS. RESIDENTS MOVED OUT WITH FEMA HELP. ONE HOUR ON, EPA MONITORS READ ZERO AIRBORNE LEAD.',
    sceneBlast,
  );

  // Cards 4-6.
  drawCard(
    16,
    '4',
    'THE WAR IN UKRAINE',
    'RUSSIAN STRIKE KILLS TWO IN ODESA',
    'STRIKE LATE TUESDAY, FIRST REPORTED WEDNESDAY: TWO DEAD, THREE HURT IN THE BLACK SEA REGION. DRONES ALSO HIT KYIV, SETTING AN APARTMENT BLOCK ABLAZE. (GOVERNOR KIPER; MAYOR KLITSCHKO.)',
  );
  drawCard(
    352,
    '5',
    'AMERICAS - WEATHER',
    "NOR'EASTER RAMPS UP: MACY'S BALLOONS AT RISK",
    'RAIN SPREADS ACROSS THE SOUTHEAST, SNARLING THANKSGIVING TRAVEL FOR MILLIONS. NEW YORK HIGH WIND WATCH THURSDAY: GUSTS TO 60 MPH. PARADE BALLOONS GROUND IF GUSTS TOP 34 MPH.',
  );
  drawCard(
    688,
    '6',
    'AMERICAS - ECONOMY',
    'GDP SURGES 4.3%: CORE PCE HEATS UP TO 3.3%',
    'Q3 GDP BEATS THE 3.5% FORECAST: CORE PCE IS THE HOTTEST SINCE NOV 2023. CLAIMS FALL TO 189K: NEW HOME SALES JUMP 14.2% TO 701K. TRADERS READ IT AS A DECEMBER FED HIKE.',
  );

  // The map.
  sectionHead(16, 502, 'WHERE IT HAPPENED - THE DAY ON THE MAP');
  drawMap();
  drawPins();
  drawText(16, 692, 'PINS ARE NUMBERED AS IN THE INDEX BELOW: 27 PINNED PLACES, FROM JIUQUAN TO BANDUNG TO THE BALLENY ISLANDS.', 1, FAINT);

  // The day in UTC.
  sectionHead(16, 706, 'THE DAY IN UTC');
  drawWrapped(16, 732, TIMELINE, 165, 1, 10, INK);

  // The briefs index.
  sectionHead(16, 766, 'ALL 36 STORIES - THE BRIEFS INDEX');
  drawBriefs();

  // Date check and sources.
  fillRect(16, 954, 992, 2, INK);
  drawText(16, 962, 'DATE CHECK - ', 1, RED);
  drawWrapped(94, 962, DATE_CHECK, 152, 1, 9, INK);
  drawTextC(512, 998, 'SOURCES: REUTERS - BEA - US LABOR DEPT - EPA - USGS - DESTATIS - ABS - UN OHCHR - CMSA - XINHUA', 1, FAINT);
}

// ---------------------------------------------------------- main

drawPage();
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
mkdirSync(outDir, { recursive: true });
const png = encodePng();
writeFileSync(join(outDir, 'entry.png'), png);
console.log('wrote entry.png:', png.length, 'bytes');
