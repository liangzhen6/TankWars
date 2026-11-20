// Minimal browser shim for running the web game (game.js) inside nx.js.
// The game still renders its battlefield into an OffscreenCanvas; main.js
// composites that canvas with native Canvas side rails and Switch input.
import { CJK_GLYPHS } from './cjk-glyphs.js';

class FakeClassList {
  constructor() {
    this._set = new Set();
  }
  add(...names) {
    for (const name of names) this._set.add(name);
  }
  remove(...names) {
    for (const name of names) this._set.delete(name);
  }
  contains(name) {
    return this._set.has(name);
  }
  toggle(name, force) {
    const on = force === undefined ? !this._set.has(name) : Boolean(force);
    if (on) this._set.add(name);
    else this._set.delete(name);
    return on;
  }
}

class FakeStyle {
  setProperty() {}
  removeProperty() {}
}

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = String(tagName).toUpperCase();
    this.dataset = {};
    this.style = new FakeStyle();
    this.classList = new FakeClassList();
    this.listeners = new Map();
    this.children = [];
    this.textContent = '';
    this.hidden = false;
    this.disabled = false;
    this.attributes = {};
    this._timerChild = null;
  }

  addEventListener(type, callback) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(callback);
  }

  removeEventListener(type, callback) {
    const list = this.listeners.get(type);
    if (!list) return;
    const index = list.indexOf(callback);
    if (index !== -1) list.splice(index, 1);
  }

  dispatch(type, event = {}) {
    const list = this.listeners.get(type) || [];
    for (const callback of list.slice()) callback(event);
  }

  appendChild(child) {
    this.children.push(child);
    child.parentNode = this;
    return child;
  }

  replaceChildren(...children) {
    this.children = [...children];
    for (const child of this.children) child.parentNode = this;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  removeAttribute(name) {
    delete this.attributes[name];
    if (name === 'data-skill') delete this.dataset.skill;
  }

  querySelector(selector) {
    if (selector === '[data-skill-timer]') return this._timerChild;
    return null;
  }

  focus() {}

  getBoundingClientRect() {
    return { x: 0, y: 0, left: 0, top: 0, width: 416, height: 416, right: 416, bottom: 416 };
  }
}

class FakeCanvasElement extends FakeElement {
  constructor(width, height, id = '') {
    super('canvas');
    this.id = id;
    this.width = width;
    this.height = height;
    this._canvas = new OffscreenCanvas(width, height);
    this._context = this._canvas.getContext('2d');
  }
  getContext() {
    return this._context;
  }
}

const hostScreen = globalThis.screen || null;
let hostScreenCtx = null;
if (hostScreen) {
  try {
    hostScreenCtx = hostScreen.getContext('2d');
  } catch {
    hostScreenCtx = null;
  }
}

const HOST_FIELD = hostScreen ? hostScreen.height : 720;
const HOST_FIELD_X = hostScreen ? Math.round((hostScreen.width - HOST_FIELD) / 2) : 0;
const HOST_SCALE = HOST_FIELD / 416;

export const hostScreenContext = hostScreenCtx;

// The raster renderer must not composite a changing canvas every frame:
// NX.js's drawImage path allocates a native snapshot each call and V8 never
// sees that pressure. Bake the static terrain into one reusable ImageData and
// draw the game straight onto the screen surface instead.
const colorCache = new Map();

function parseColor(style) {
  if (typeof style !== 'string') return { r: 0, g: 0, b: 0, a: 1 };
  const cached = colorCache.get(style);
  if (cached) return cached;

  const color = { r: 0, g: 0, b: 0, a: 1 };
  if (style[0] === '#') {
    const hex = style.slice(1);
    if (hex.length === 3) {
      color.r = parseInt(hex[0] + hex[0], 16);
      color.g = parseInt(hex[1] + hex[1], 16);
      color.b = parseInt(hex[2] + hex[2], 16);
    } else if (hex.length === 6 || hex.length === 8) {
      color.r = parseInt(hex.slice(0, 2), 16);
      color.g = parseInt(hex.slice(2, 4), 16);
      color.b = parseInt(hex.slice(4, 6), 16);
      if (hex.length === 8) color.a = parseInt(hex.slice(6, 8), 16) / 255;
    }
  } else {
    const match = style.match(/^rgba?\(([^)]+)\)$/i);
    if (match) {
      const parts = match[1].split(',').map((part) => parseFloat(part));
      color.r = Math.max(0, Math.min(255, parts[0] || 0));
      color.g = Math.max(0, Math.min(255, parts[1] || 0));
      color.b = Math.max(0, Math.min(255, parts[2] || 0));
      if (parts.length > 3) color.a = Math.max(0, Math.min(1, parts[3]));
    }
  }
  colorCache.set(style, color);
  return color;
}

class SoftwareContext2D {
  constructor(imageData, scale) {
    this.imageData = imageData;
    this.data = imageData.data;
    this.width = imageData.width;
    this.height = imageData.height;
    this.scale = scale;
    this.fillStyle = '#000000';
    this.globalAlpha = 1;
    this.imageSmoothingEnabled = false;
  }

  clearRect(x, y, w, h) {
    this._paint(x, y, w, h, null);
  }

  fillRect(x, y, w, h) {
    this._paint(x, y, w, h, parseColor(this.fillStyle));
  }

  _paint(x, y, w, h, color) {
    if (!(w > 0) || !(h > 0)) return;
    const scale = this.scale;
    let x0 = Math.round(x * scale);
    let y0 = Math.round(y * scale);
    let x1 = Math.round((x + w) * scale);
    let y1 = Math.round((y + h) * scale);
    if (x0 < 0) x0 = 0;
    if (y0 < 0) y0 = 0;
    if (x1 > this.width) x1 = this.width;
    if (y1 > this.height) y1 = this.height;
    if (x1 <= x0 || y1 <= y0) return;

    const data = this.data;
    if (!color) {
      for (let py = y0; py < y1; py += 1) {
        let index = (py * this.width + x0) * 4;
        for (let px = x0; px < x1; px += 1) {
          data[index] = 0;
          data[index + 1] = 0;
          data[index + 2] = 0;
          data[index + 3] = 0;
          index += 4;
        }
      }
      return;
    }

    const alpha = color.a * this.globalAlpha;
    if (alpha <= 0) return;
    const sr = color.r;
    const sg = color.g;
    const sb = color.b;
    for (let py = y0; py < y1; py += 1) {
      let index = (py * this.width + x0) * 4;
      if (alpha >= 0.999) {
        for (let px = x0; px < x1; px += 1) {
          data[index] = sr;
          data[index + 1] = sg;
          data[index + 2] = sb;
          data[index + 3] = 255;
          index += 4;
        }
      } else {
        const inv = 1 - alpha;
        for (let px = x0; px < x1; px += 1) {
          const da = data[index + 3] / 255;
          const outA = alpha + da * inv;
          if (outA <= 0) {
            data[index] = 0;
            data[index + 1] = 0;
            data[index + 2] = 0;
            data[index + 3] = 0;
          } else {
            const back = da * inv;
            data[index] = (sr * alpha + data[index] * back) / outA;
            data[index + 1] = (sg * alpha + data[index + 1] * back) / outA;
            data[index + 2] = (sb * alpha + data[index + 2] * back) / outA;
            data[index + 3] = outA * 255;
          }
          index += 4;
        }
      }
    }
  }
}

let hostTerrainImage = null;
let hostTerrainPainter = null;
if (hostScreenCtx) {
  try {
    hostTerrainImage = hostScreenCtx.createImageData(HOST_FIELD, HOST_FIELD);
    hostTerrainPainter = new SoftwareContext2D(hostTerrainImage, HOST_SCALE);
  } catch {
    hostTerrainImage = null;
    hostTerrainPainter = null;
  }
}

const hostTerrain = hostTerrainImage
  ? {
      imageData: hostTerrainImage,
      beginTerrain() {
        return hostTerrainPainter;
      },
      endTerrain() {},
    }
  : null;

// Game drawing uses 416px logical coordinates. Intercept setTransform so the
// field maps to the 720px centre square on the screen surface.
const hostGameContext = hostScreenCtx
  ? new Proxy(hostScreenCtx, {
      get(target, property) {
        if (property === 'setTransform') {
          return () => {
            target.setTransform(HOST_SCALE, 0, 0, HOST_SCALE, HOST_FIELD_X, 0);
          };
        }
        if (property === 'putImageData') {
          return (image, dx, dy) => {
            target.putImageData(
              image,
              Math.round(dx * HOST_SCALE + HOST_FIELD_X),
              Math.round(dy * HOST_SCALE)
            );
          };
        }
        if (property === 'translate') {
          return (dx, dy) => target.translate(dx * HOST_SCALE, dy * HOST_SCALE);
        }
        const value = target[property];
        return typeof value === 'function' ? value.bind(target) : value;
      },
      set(target, property, value) {
        target[property] = value;
        return true;
      },
    })
  : null;

class GameCanvasElement extends FakeElement {
  constructor() {
    super('canvas');
    this.id = 'game';
    this.width = 416;
    this.height = 416;
  }
  getContext() {
    return hostGameContext;
  }
}

const gameCanvasElement = new GameCanvasElement();

const elements = new Map();
const abilityButtons = [];

function makeElement(id, extra = {}) {
  const el = new FakeElement('div');
  el.id = id;
  Object.assign(el, extra);
  elements.set(id, el);
  return el;
}

function makeAbilityButton(skill, keyLetter, playerIndex = 0) {
  const button = new FakeElement('button');
  button.dataset.skill = skill;
  button.dataset.key = keyLetter;
  button.dataset.player = String(playerIndex);
  const timer = new FakeElement('span');
  timer.dataset.skillTimer = '';
  button._timerChild = timer;
  abilityButtons.push(button);
  return button;
}

const fakeDocument = {
  hidden: false,
  visibilityState: 'visible',
  _listeners: new Map(),
  getElementById(id) {
    if (id === 'game') return gameCanvasElement;
    if (!elements.has(id)) makeElement(id);
    return elements.get(id);
  },
  querySelectorAll(selector) {
    if (selector === '[data-skill]') return abilityButtons.slice();
    return [];
  },
  createElement(tagName) {
    return new FakeElement(tagName);
  },
  addEventListener(type, callback) {
    if (!this._listeners.has(type)) this._listeners.set(type, []);
    this._listeners.get(type).push(callback);
  },
  removeEventListener(type, callback) {
    const list = this._listeners.get(type);
    if (!list) return;
    const index = list.indexOf(callback);
    if (index !== -1) list.splice(index, 1);
  },
  dispatch(type, event = {}) {
    const list = this._listeners.get(type) || [];
    for (const callback of list.slice()) callback(event);
  },
};

makeElement('screen');
makeElement('btn-sound');
makeElement('btn-pause');
makeElement('btn-restart');
makeElement('high-score');
makeElement('target-hint');
makeElement('target-hint-text');
makeElement('stat-score');
makeElement('stat-enemy');
makeElement('stat-stage');
makeElement('stat-base');
makeElement('mission-enemy');
makeElement('rail-stage-label');
makeElement('enemy-pips');
makeElement('lives-pips');
makeElement('gun-pips');

makeAbilityButton('magnet', 'X', 0);
makeAbilityButton('mind', 'Y', 0);
makeAbilityButton('teleport', 'R', 0);
makeAbilityButton('magnet', 'X', 1);
makeAbilityButton('mind', 'Y', 1);
makeAbilityButton('teleport', 'R', 1);

const windowListeners = new Map();
const memoryStorage = {
  _data: new Map(),
  getItem(key) {
    return this._data.has(key) ? this._data.get(key) : null;
  },
  setItem(key, value) {
    this._data.set(key, String(value));
  },
  removeItem(key) {
    this._data.delete(key);
  },
};

let nativeStorage = null;
try {
  nativeStorage = globalThis.localStorage || null;
} catch {
  nativeStorage = null;
}

const fakeWindow = {
  __TANK_WARS_HOST__: true,
  __tankWarsHostTerrain: hostTerrain,
  __tankWarsCJKGlyphs: CJK_GLYPHS,
  document: fakeDocument,
  location: { search: '' },
  AudioContext: globalThis.AudioContext,
  webkitAudioContext: globalThis.AudioContext,
  localStorage: nativeStorage || memoryStorage,
  setTimeout: (...args) => globalThis.setTimeout(...args),
  clearTimeout: (...args) => globalThis.clearTimeout(...args),
  addEventListener(type, callback) {
    if (!windowListeners.has(type)) windowListeners.set(type, []);
    windowListeners.get(type).push(callback);
  },
  removeEventListener(type, callback) {
    const list = windowListeners.get(type);
    if (!list) return;
    const index = list.indexOf(callback);
    if (index !== -1) list.splice(index, 1);
  },
  dispatch(type, event = {}) {
    const list = windowListeners.get(type) || [];
    for (const callback of list.slice()) callback(event);
  },
};

// This wrapper is the host's frame clock. Input is polled before game.js
// advances, then the host composites field + rails after it renders.
fakeWindow.requestAnimationFrame = (callback) => globalThis.requestAnimationFrame((time) => {
  try {
    globalThis.__nxHostInput?.();
  } catch (error) {
    console.error('Host input error:', error);
  }
  try {
    callback(time);
  } catch (error) {
    console.error('Game frame error:', error);
  }
  try {
    globalThis.__nxHostRender?.();
  } catch (error) {
    console.error('Host render error:', error);
  }
});

try {
  globalThis.window = fakeWindow;
} catch {
  Object.defineProperty(globalThis, 'window', { value: fakeWindow, configurable: true });
}
try {
  globalThis.document = fakeDocument;
} catch {
  Object.defineProperty(globalThis, 'document', { value: fakeDocument, configurable: true });
}

globalThis.__tankWarsCJKGlyphs = CJK_GLYPHS;

export function emitKey(code, down) {
  const event = {
    code,
    key: code,
    repeat: false,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
  };
  fakeWindow.dispatch(down ? 'keydown' : 'keyup', event);
  return event;
}

export function tapKey(code) {
  emitKey(code, true);
  emitKey(code, false);
}

export { fakeWindow, fakeDocument };
