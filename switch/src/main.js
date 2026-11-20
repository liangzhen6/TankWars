import './boot.js';
import { emitKey, tapKey, hostScreenContext } from './shim.js';
import { Button } from '@nx.js/constants';

const W = screen.width;
const H = screen.height;
const ctx = hostScreenContext || screen.getContext('2d');
ctx.imageSmoothingEnabled = false;

const FIELD = H;
const FIELD_X = Math.round((W - FIELD) / 2);
const LEFT_W = FIELD_X;
const RIGHT_X = FIELD_X + FIELD;
const RIGHT_W = W - RIGHT_X;

const ABILITIES = [
  {
    id: 'magnet',
    key: 'X',
    title: '磁力场',
    desc: '吸弹 · 牵引',
    color: '#63d8ef',
    max: 15,
  },
  {
    id: 'mind',
    key: 'Y',
    title: '心念支配',
    desc: '选目标 · 策反',
    color: '#bb91ff',
    max: 22,
  },
  {
    id: 'teleport',
    key: 'R',
    title: '瞬移',
    desc: '选落点 · 无敌',
    color: '#ffbf66',
    max: 11,
  },
];

const buttonWasDown = new Map();
const padStates = [
  { lastDir: null, firing: false, titleSelect: 0 },
  { lastDir: null, firing: false, titleSelect: 0 },
];

// Each physical pad drives one player. P1 uses WASD/Space/Q-E-F (the web
// keyboard scheme); P2 uses arrows/Enter/7-8-9.
const PAD_BINDINGS = [
  {
    dirCodes: { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD' },
    fireCode: 'Space',
    skills: { [Button.X]: 'KeyQ', [Button.Y]: 'KeyE', [Button.R]: 'KeyF' },
  },
  {
    dirCodes: { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' },
    fireCode: 'Enter',
    skills: { [Button.X]: 'Digit7', [Button.Y]: 'Digit8', [Button.R]: 'Digit9' },
  },
];

function padPressed(pad, index) {
  return Boolean(pad && pad.buttons && pad.buttons[index] && pad.buttons[index].pressed);
}

function padEdge(pad, playerIndex, index) {
  const key = `${playerIndex}:${index}`;
  const down = padPressed(pad, index);
  const wasDown = buttonWasDown.get(key) === true;
  buttonWasDown.set(key, down);
  return down && !wasDown;
}

function readView() {
  try {
    return window.__tankWarsHost?.view?.() || null;
  } catch (error) {
    console.error('Host view error:', error);
    return null;
  }
}

function releaseDirection(playerIndex) {
  const state = padStates[playerIndex];
  const binding = PAD_BINDINGS[playerIndex];
  if (!state || !binding || !state.lastDir) return;
  emitKey(binding.dirCodes[state.lastDir], false);
  state.lastDir = null;
}

function pollPad(playerIndex, pad, view) {
  const state = padStates[playerIndex];
  const binding = PAD_BINDINGS[playerIndex];
  if (!state || !binding) return;

  if (!pad) {
    releaseDirection(playerIndex);
    if (state.firing) {
      emitKey(binding.fireCode, false);
      state.firing = false;
    }
    return;
  }

  // Title: left/right on the D-pad or stick picks the player count. The count
  // is a menu choice, not an auto-detection result, so one pad can start a 2P
  // game; the second pad simply takes over P2 whenever it connects.
  if (view && view.state === 'title') {
    const ax = pad.axes?.[0] ?? 0;
    const stick = ax < -0.6 ? 1 : ax > 0.6 ? 2 : 0;
    if (padEdge(pad, playerIndex, Button.Left)) tapKey('Digit1');
    if (padEdge(pad, playerIndex, Button.Right)) tapKey('Digit2');
    if (stick !== state.titleSelect) {
      state.titleSelect = stick;
      if (stick === 1) tapKey('Digit1');
      if (stick === 2) tapKey('Digit2');
    }
  } else {
    state.titleSelect = 0;
  }

  // D-pad first, then left stick. Pick one dominant direction so the game's
  // one-direction movement model stays deterministic.
  let dir = null;
  if (padPressed(pad, Button.Up)) dir = 'up';
  else if (padPressed(pad, Button.Down)) dir = 'down';
  else if (padPressed(pad, Button.Left)) dir = 'left';
  else if (padPressed(pad, Button.Right)) dir = 'right';

  if (!dir) {
    const ax = pad.axes?.[0] ?? 0;
    const ay = pad.axes?.[1] ?? 0;
    if (Math.abs(ax) > 0.5 || Math.abs(ay) > 0.5) {
      if (Math.abs(ax) > Math.abs(ay)) dir = ax > 0 ? 'right' : 'left';
      else dir = ay > 0 ? 'down' : 'up';
    }
  }

  if (dir !== state.lastDir) {
    if (state.lastDir) emitKey(binding.dirCodes[state.lastDir], false);
    if (dir) emitKey(binding.dirCodes[dir], true);
    state.lastDir = dir;
  }

  const aDown = padPressed(pad, Button.A);
  if (padEdge(pad, playerIndex, Button.A) && view) {
    if (view.state === 'playing') {
      if (view.targeting) {
        tapKey(playerIndex === 0 ? 'Space' : 'Enter');
      } else {
        emitKey(binding.fireCode, true);
        state.firing = true;
      }
    } else if (view.state === 'paused') {
      tapKey('KeyP');
    } else if (
      view.state === 'title' ||
      view.state === 'stageclear' ||
      view.state === 'gameover' ||
      view.state === 'victory' ||
      view.state === 'ending'
    ) {
      releaseDirection(playerIndex);
      tapKey('Enter');
    }
  }
  if (!aDown && state.firing) {
    emitKey(binding.fireCode, false);
    state.firing = false;
  }

  if (padEdge(pad, playerIndex, Button.B) && view) {
    if (view.state === 'playing' && view.targeting) tapKey('Escape');
    else if (view.state === 'paused') tapKey('KeyP');
  }

  for (const [button, code] of Object.entries(binding.skills)) {
    if (padEdge(pad, playerIndex, Number(button))) tapKey(code);
  }
}

function pollInput() {
  let pads = [];
  try {
    pads = navigator.getGamepads?.() || [];
  } catch {
    pads = [];
  }
  const view = readView();
  const connected = Array.from(pads || []).filter(Boolean);

  // Player count is chosen on the title (left/right). P1 always uses the
  // first pad; the second pad drives P2 as soon as it connects, including
  // mid-run — a 2P game started with one pad has P2's tank waiting.
  pollPad(0, pads[0] || null, view);
  pollPad(1, pads[1] || null, view);

  const anyPad = connected[0] || null;
  if (anyPad) {
    if (padEdge(anyPad, 0, Button.L)) tapKey('KeyM');
    if (padEdge(anyPad, 0, Button.Plus)) tapKey('KeyP');
    if (padEdge(anyPad, 0, Button.Minus)) tapKey('KeyR');
  }
}

let currentFontSpec = '';
const CJK_RE = /[^\x20-\x7E]/;

// nx.js registers the system font with weight "normal". Asking for "600" (or
// any explicit numeric weight) makes findFont() miss the cached face and call
// addSystemFont() again — each call copies the whole system font into native
// memory and adds it to the global FontFaceSet forever. Always request the
// "normal" descriptor; fake bold below where it matters.
function font(size) {
  const spec = `normal ${size}px system-ui`;
  if (currentFontSpec !== spec) {
    ctx.font = spec;
    currentFontSpec = spec;
  }
}

// Chinese has no reliable system glyphs on this runtime, so CJK strings are
// drawn from the bundled 14x14 bitmap table with fillRect (same approach as
// the game field). Pure-ASCII labels keep the crisp system font.
function drawBitmapText(str, x, y, size, color, align, weight) {
  const cjkGlyphs = globalThis.__tankWarsCJKGlyphs;
  const asciiGlyphs = globalThis.__tankWarsAsciiGlyphs;
  if (!cjkGlyphs || !asciiGlyphs) return false;
  const scale = size <= 16 ? 1 : 2;
  const asciiScale = scale * 2;
  const advanceOf = (ch) => (cjkGlyphs[ch] ? 15 * scale : 6 * asciiScale);
  let width = 0;
  for (const ch of str) width += advanceOf(ch);
  let cx = x;
  if (align === 'center') cx -= Math.floor(width / 2);
  else if (align === 'right') cx -= width;
  const top = y - 14 * scale;

  ctx.fillStyle = color;
  const paint = (dx) => {
    let px = cx + dx;
    for (const ch of str) {
      if (ch === ' ') {
        px += 6 * asciiScale;
        continue;
      }
      const glyph = cjkGlyphs[ch];
      if (glyph) {
        for (let row = 0; row < 14; row += 1) {
          const bits = glyph[row];
          for (let col = 0; col < 14; col += 1) {
            if (bits[col] !== '1') continue;
            let end = col + 1;
            while (end < 14 && bits[end] === '1') end += 1;
            ctx.fillRect(px + col * scale, top + row * scale, (end - col) * scale, scale);
            col = end;
          }
        }
        px += 15 * scale;
      } else {
        const ascii = asciiGlyphs[ch.toUpperCase()] || asciiGlyphs['?'];
        for (let row = 0; row < 7; row += 1) {
          const bits = ascii[row];
          for (let col = 0; col < 5; col += 1) {
            if (bits[col] !== '1') continue;
            let end = col + 1;
            while (end < 5 && bits[end] === '1') end += 1;
            ctx.fillRect(
              px + col * asciiScale,
              top + row * asciiScale,
              (end - col) * asciiScale,
              asciiScale
            );
            col = end;
          }
        }
        px += 6 * asciiScale;
      }
    }
  };
  if (weight >= 700) paint(1);
  paint(0);
  return true;
}

function text(value, x, y, size, color, weight = 600, align = 'left') {
  const str = String(value);
  if (CJK_RE.test(str) && drawBitmapText(str, x, y, size, color, align, weight)) {
    return;
  }
  font(size);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  if (weight >= 700) {
    // Faux bold: a second pass one device pixel to the right. No extra font
    // registration, and it keeps the rail headings readable.
    ctx.fillText(str, x + 1, y);
  }
  ctx.fillText(str, x, y);
}

function line(x1, y1, x2, y2, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function drawPips(x, y, count, active, color, width = 22, height = 5) {
  for (let i = 0; i < count; i += 1) {
    const col = i % 8;
    const row = Math.floor(i / 8);
    ctx.fillStyle = i < active ? color : 'rgba(196, 204, 178, 0.12)';
    ctx.fillRect(x + col * (width + 4), y + row * 10, width, height);
  }
}

function drawKeyHint(key, desc, x, y) {
  ctx.fillStyle = 'rgba(6, 9, 7, 0.7)';
  ctx.fillRect(x, y - 14, 26, 20);
  ctx.strokeStyle = 'rgba(196, 204, 178, 0.24)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y - 13.5, 25, 19);
  text(key, x + 13, y, 11, '#e8b53c', 700, 'center');
  text(desc, x + 36, y, 11, '#9da292', 600, 'left');
}

function pad6(value) {
  return String(Math.max(0, Math.floor(Number(value) || 0))).padStart(6, '0');
}

function abilityStatus(view, player, ability) {
  if (!view || !player) return { label: 'OFF', progress: 0, color: '#6f7768' };
  const targeting = view.targeting;
  const isTargetingSkill = ability.id === 'mind' || ability.id === 'teleport';
  if (targeting && targeting.ownerIndex === player.index) {
    if (targeting.skill === ability.id) {
      return {
        label: 'AIM',
        progress: Math.max(0, Math.min(1, targeting.timer / 7)),
        color: ability.color,
      };
    }
    return { label: 'WAIT', progress: 0, color: '#6f7768' };
  }
  if (targeting && isTargetingSkill) {
    return { label: 'WAIT', progress: 0, color: '#6f7768' };
  }
  const skill = player.skills?.[ability.id];
  if (skill && skill.cooldown > 0) {
    return {
      label: `${Math.ceil(skill.cooldown)}S`,
      progress: Math.max(0, Math.min(1, 1 - skill.cooldown / ability.max)),
      color: ability.color,
    };
  }
  if (skill && skill.active > 0) {
    return { label: 'LIVE', progress: 1, color: ability.color };
  }
  if (view.state === 'playing' && player.active && !player.out) {
    return { label: 'READY', progress: 1, color: ability.color };
  }
  return { label: 'OFF', progress: 0, color: '#6f7768' };
}

function drawPlayerBars(x, y, player, liveColor, gunColor) {
  const lives = player ? player.lives : 0;
  const tier = player ? player.fireTier : 0;
  text('LIVES', x, y, 8, '#6e7669', 700);
  text('GUN', x + 92, y, 8, '#6e7669', 700);
  for (let i = 0; i < 3; i += 1) {
    ctx.fillStyle = i < lives ? liveColor : 'rgba(196, 204, 178, 0.12)';
    ctx.fillRect(x + i * 18, y + 10, 14, 6);
    ctx.fillStyle = i <= tier ? gunColor : 'rgba(196, 204, 178, 0.12)';
    ctx.fillRect(x + 92 + i * 18, y + 10, 14, 6);
  }
}

function drawLeftRail(view) {
  const x = 24;
  const right = LEFT_W - 24;
  const coop = (view?.selectedPlayerCount || 1) > 1;
  const p1 = view?.players?.[0];
  const p2 = view?.players?.[1];

  text('8-BIT TRIBUTE', x, 32, 10, '#738d63', 700);
  font(32);
  ctx.fillStyle = '#f0ecdd';
  ctx.fillText('TANK', x, 68);
  const tankWidth = ctx.measureText('TANK ').width;
  ctx.fillStyle = '#e8b53c';
  ctx.fillText('WARS', x + tankWidth, 68);

  const stage = view ? `${pad2(view.currentStage)} / ${view.stageName}` : '01 / CRADLE';
  text(`STAGE ${stage}`, x, 92, 12, '#9da292', 600);
  line(x, 108, right, 108, 'rgba(196, 204, 178, 0.14)');

  text('P1 SCORE', x, 128, 9, '#6e7669', 700);
  text(p1 ? pad6(p1.score) : '000000', x, 152, 22, '#f1cf72', 700);
  if (coop) {
    text('P2 SCORE', x, 180, 9, '#6e7669', 700);
    text(p2 ? pad6(p2.score) : '000000', x, 204, 22, '#9fe4ff', 700);
  }

  const enemyY = coop ? 248 : 196;
  text('ENEMY', x, enemyY, 10, '#6e7669', 700);
  const total = view?.totalEnemies ?? 12;
  const remaining = view ? Math.max(0, view.totalEnemies - view.killed - view.converted) : total;
  text(view?.endless ? '∞' : pad2(remaining), right, enemyY, 18, view?.endless ? '#e08a6b' : '#d5d9ca', 700, 'right');
  drawPips(x, enemyY + 12, view?.endless ? 0 : total, remaining, '#aeb9b2', 20, 4);

  let barsY = enemyY + 44;
  drawPlayerBars(x, barsY, p1, '#f1cf72', '#63d8ef');
  if (coop) {
    barsY += 28;
    drawPlayerBars(x, barsY, p2, '#9fe4ff', '#63d8ef');
  }

  const lineY = barsY + 40;
  line(x, lineY, right, lineY, 'rgba(196, 204, 178, 0.1)');
  const infoY = lineY + 22;
  const baseAlive = view?.baseAlive !== false;
  text('STAGE', x, infoY, 10, '#6e7669', 700);
  text(view ? `${pad2(view.currentStage)} / ${view.stageCount}` : '01 / 3', right, infoY, 10, '#c7ccbd', 600, 'right');
  text('BASE', x, infoY + 24, 10, '#6e7669', 700);
  text(baseAlive ? 'ONLINE' : 'LOST', right, infoY + 24, 10, baseAlive ? '#b9d6a3' : '#e08a6b', 700, 'right');
  text('LOCAL BEST', x, infoY + 48, 10, '#6e7669', 700);
  text(view ? pad6(view.highScore) : '000000', right, infoY + 48, 10, '#c7ccbd', 600, 'right');

  line(x, infoY + 70, right, infoY + 70, 'rgba(196, 204, 178, 0.14)');
  text('CONTROLS', x, infoY + 92, 10, '#6e7669', 700);
  let hintY = infoY + 116;
  drawKeyHint('P1', 'D-PAD / A / X Y R', x, hintY);
  hintY += 24;
  if (coop) {
    drawKeyHint('P2', 'D-PAD / A / X Y R', x, hintY);
    hintY += 24;
  }
  drawKeyHint('B', 'CANCEL', x, hintY);
  hintY += 24;
  drawKeyHint('+', 'PAUSE', x, hintY);
  hintY += 24;
  drawKeyHint('-', 'RESTART', x, hintY);
  hintY += 24;
  drawKeyHint('L', 'MUTE', x, hintY);
  hintY += 24;
  const audioIssue = Boolean(view?.audio && (view.audio.error || view.audio.state !== 'running'));
  text(
    audioIssue ? 'NO AUDIO' : view?.muted ? 'UNMUTE' : 'MUTE',
    x,
    hintY + 4,
    10,
    audioIssue ? '#e08a6b' : view?.muted ? '#e08a6b' : '#738d63',
    700
  );
  text('守住基地 · 击毁或策反', x, Math.min(hintY + 28, H - 16), 10, '#738d63', 700);
}

function drawAbilityCard(view, player, ability, x, y, right, cardH) {
  const status = abilityStatus(view, player, ability);
  const active = status.label === 'AIM';
  ctx.fillStyle = active ? 'rgba(20, 26, 21, 0.98)' : 'rgba(16, 22, 17, 0.9)';
  ctx.fillRect(x, y, right - x, cardH);
  ctx.strokeStyle = active ? ability.color : 'rgba(196, 204, 178, 0.16)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, right - x - 1, cardH - 1);
  ctx.fillStyle = ability.color;
  ctx.fillRect(x + 1, y + 1, 3, cardH - 2);

  ctx.fillStyle = 'rgba(5, 8, 6, 0.8)';
  ctx.fillRect(x + 10, y + 11, 28, 23);
  ctx.strokeStyle = 'rgba(196, 204, 178, 0.22)';
  ctx.strokeRect(x + 10.5, y + 11.5, 27, 22);
  text(ability.key, x + 24, y + 28, 12, ability.color, 800, 'center');

  text(ability.title, x + 47, y + 25, 13, '#d8ddcf', 700);
  text(status.label, right - 10, y + 25, 10, status.color, 700, 'right');
  text(ability.desc, x + 47, y + 43, 10, '#879180', 500);

  ctx.fillStyle = 'rgba(196, 204, 178, 0.1)';
  ctx.fillRect(x + 10, y + cardH - 9, right - x - 20, 3);
  ctx.fillStyle = status.color;
  ctx.fillRect(x + 10, y + cardH - 9, (right - x - 20) * status.progress, 3);
}

function drawRightRail(view) {
  const x = RIGHT_X + 18;
  const right = W - 18;
  const coop = (view?.selectedPlayerCount || 1) > 1;
  text('SPECIAL ABILITIES', x, 34, 11, '#6e7669', 700);
  text('P1 / P2', right, 34, 10, '#b5a77b', 700, 'right');

  const cardH = coop ? 62 : 94;
  const gap = coop ? 6 : 8;
  let y = 52;
  const drawDeck = (playerIndex, label, color) => {
    const player = view?.players?.[playerIndex];
    text(`${label}  X / Y / R`, x, y + 9, 10, color, 700);
    y += 19;
    ABILITIES.forEach((ability) => {
      drawAbilityCard(view, player, ability, x, y, right, cardH);
      y += cardH + gap;
    });
    y += 7;
  };
  drawDeck(0, 'P1', '#f1cf72');
  if (coop) drawDeck(1, 'P2', '#9fe4ff');

  const targeting = view?.targeting;
  const noteY = coop ? Math.max(y + 2, 520) : y + 14;
  line(x, noteY, right, noteY, 'rgba(196, 204, 178, 0.14)');
  if (targeting) {
    const owner = view.players?.[targeting.ownerIndex];
    const definition = ABILITIES.find((a) => a.id === targeting.skill) || ABILITIES[0];
    text(`${owner?.label || 'P1'} AIMING`, x, noteY + 24, 13, definition.color, 800);
    text(
      definition.id === 'mind' ? '选择一台敌军坦克' : '选择落点',
      x,
      noteY + 45,
      11,
      '#aeb8a5',
      600
    );
    text('A  确认', x, noteY + 72, 12, '#e8b53c', 700);
    text('B  取消', x, noteY + 93, 12, '#9da292', 700);
    text('十字键 / 摇杆 移动光标', x, noteY + 114, 10, '#879180', 600);
  } else {
    text('FIELD NOTES', x, noteY + 22, 10, '#6e7669', 700);
    text('P1 + P2   X / Y / R 技能', x, noteY + 45, 10, '#879180', 500);
    text('A  开火      B  取消', x, noteY + 65, 10, '#879180', 500);
    text('+ 暂停   - 重开   L 静音', x, noteY + 85, 10, '#879180', 500);
  }

  const stage = view ? `STAGE ${pad2(view.currentStage)} / ${view.stageCount}` : 'STAGE 01 / 3';
  text(stage, x, H - 54, 10, '#b5a77b', 700);
  text('TACTICAL TANK COMMAND', x, H - 32, 10, '#6e7669', 700);
}

function viewSignature(view) {
  if (!view) return 'none';
  const playerKey = (player) => {
    if (!player) return '';
    const skills = player.skills || {};
    const skillKey = (id) => {
      const skill = skills[id];
      return skill ? `${Math.ceil(skill.cooldown * 10)}/${Math.ceil(skill.active * 10)}` : '';
    };
    return [
      player.index,
      player.score,
      player.lives,
      player.fireTier,
      player.active ? 1 : 0,
      player.out ? 1 : 0,
      skillKey('magnet'),
      skillKey('mind'),
      skillKey('teleport'),
    ].join(':');
  };
  const targeting = view.targeting
    ? `${view.targeting.ownerIndex}:${view.targeting.skill}:${Math.ceil(view.targeting.timer * 10)}`
    : '';
  return [
    view.state,
    view.score,
    view.selectedPlayerCount,
    view.killed,
    view.converted,
    view.totalEnemies,
    view.currentStage,
    view.stageCount,
    view.stageName,
    view.baseAlive ? 1 : 0,
    view.muted ? 1 : 0,
    view.highScore,
    playerKey(view.players?.[0]),
    playerKey(view.players?.[1]),
    targeting,
  ].join('|');
}

let lastRailSignature = null;

function drawHost() {
  // The game already rendered the field directly onto this surface. Only the
  // rails are drawn here, at identity transform, and only when a value they
  // display has actually changed.
  const view = readView();
  const signature = viewSignature(view);
  if (signature === lastRailSignature) return;
  lastRailSignature = signature;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#0a0e0b';
  ctx.fillRect(0, 0, LEFT_W, H);
  ctx.fillRect(RIGHT_X, 0, RIGHT_W, H);

  ctx.fillStyle = 'rgba(196, 204, 178, 0.15)';
  ctx.fillRect(FIELD_X - 1, 0, 1, H);
  ctx.fillRect(RIGHT_X, 0, 1, H);

  drawLeftRail(view);
  drawRightRail(view);
}

// Temporary on-device diagnostic: font registrations are the suspected native
// leak, so log the global FontFaceSet size and V8 memory every 5s for 2 min.
let diagTicks = 0;
const diagTimer = setInterval(() => {
  diagTicks += 1;
  try {
    const fontCount =
      globalThis.fonts && typeof globalThis.fonts.size === 'number'
        ? globalThis.fonts.size
        : -1;
    const memory = globalThis.Switch?.memoryUsage?.();
    console.log(
      `[diag] ${diagTicks * 5}s fonts=${fontCount} heap=${
        memory ? memory.usedHeapSize : -1
      } external=${memory ? memory.externalMemory : -1}`
    );
  } catch (error) {
    // Diagnostics must never affect the game.
  }
  if (diagTicks >= 24) clearInterval(diagTimer);
}, 5000);

globalThis.__nxHostInput = pollInput;
globalThis.__nxHostRender = drawHost;
