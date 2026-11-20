(() => {
  "use strict";

  // ---------------------------------------------------------------------------
  // Core constants
  // ---------------------------------------------------------------------------

  // The canvas is now battlefield-only. Title, stats and ability cards live in
  // the side rails, so the field can use the full screen height on Switch.
  const VIEW_W = 416;
  const VIEW_H = 416;
  const FIELD = 416;
  const TILE = 16;
  const COLS = 26;
  const ROWS = 26;
  const COARSE = 32;
  const CCOLS = 13;
  const CROWS = 13;
  const IS_SWITCH_HOST = Boolean(window.__TANK_WARS_HOST__);
  // Debug-only convenience: on the title screen, 1/2/3 jump straight to a
  // stage and 4 previews the epilogue. Never exposed on the normal title.
  const PREVIEW_MODE = !IS_SWITCH_HOST &&
    new URLSearchParams(window.location.search).has("debug");
  // The Switch renders the 416px field into a 416px offscreen canvas and
  // upscales once to 720px. Keeping the raster work at 1x is cheaper than
  // drawing every primitive at 720p, and matches the proven low-res path.
  const RENDER_SCALE = IS_SWITCH_HOST ? 1 : 2;

  const TANK_DRAW = 26;
  const TANK_HIT = 24;
  const BULLET_SIZE = 6;
  const PLAYER_SPEED = 88;
  const PLAYER_LIVES = 3;
  const MAX_ENEMY_SLOTS = 16;

  const DIRS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };
  const OPPOSITE = { up: "down", down: "up", left: "right", right: "left" };

  const ENEMY_TYPES = {
    basic: {
      name: "步兵",
      hp: 1,
      speed: 48,
      bulletSpeed: 205,
      fireMin: 1.25,
      fireMax: 2.15,
      score: 100,
      palette: { body: "#b7c0c2", dark: "#596467", light: "#eef3ee", accent: "#7f8c8b" },
    },
    fast: {
      name: "侦察兵",
      hp: 1,
      speed: 82,
      bulletSpeed: 220,
      fireMin: 1.45,
      fireMax: 2.4,
      score: 200,
      palette: { body: "#75c963", dark: "#2a6528", light: "#c9f6b8", accent: "#93a749" },
    },
    power: {
      name: "炮手",
      hp: 1,
      speed: 54,
      bulletSpeed: 255,
      fireMin: 0.85,
      fireMax: 1.35,
      score: 300,
      palette: { body: "#df6b4a", dark: "#742a20", light: "#ffb59a", accent: "#ba9747" },
    },
    armor: {
      name: "重甲",
      hp: 2,
      speed: 43,
      bulletSpeed: 215,
      fireMin: 1.1,
      fireMax: 1.8,
      score: 400,
      palette: { body: "#718ddd", dark: "#30457f", light: "#c4d4ff", accent: "#d6bd6d" },
    },
  };

  // Three original, hand-built stages. Each layout is 13 x 13, with the
  // player spawn at column 4 / base at column 6 on the bottom row.
  //
  // The campaign is deliberately a small life story:
  //   1. CRADLE    — the eagle is sealed behind steel. Nothing to defend yet.
  //   2. HOMESTEAD — only one layer of brick is left. You have to hold it.
  //   3. DUSK      — no walls at all. At the one-minute mark, fate arrives.
  const STAGES = [
    {
      name: "CRADLE",
      chapter: "初生",
      chapterEn: "YOUTH",
      mission: "初生 · 击毁或策反",
      missionUnit: "台敌军",
      baseShield: "steel",
      layout: [
        ".............",
        ".BB.BB.BB.BB.",
        ".BB.BB.BB.BB.",
        "..BB.....BB..",
        "..BB.SSS.BB..",
        ".....S.S.....",
        "TT...S.S...TT",
        "TT.BB...BB.TT",
        "....WWWWW....",
        ".BB.WWWWW.BB.",
        ".BB...B...BB.",
        ".....SSS.....",
        "....PSES.....",
      ],
      enemies: [
        "basic", "basic", "fast", "basic",
        "fast", "power", "basic", "fast",
        "armor", "power",
      ],
      drops: [3, 7],
      maxActive: 3,
      spawnInterval: 2.25,
    },
    {
      name: "HOMESTEAD",
      chapter: "中坚",
      chapterEn: "MIDLIFE",
      mission: "中坚 · 击毁或策反",
      missionUnit: "台敌军",
      baseShield: "brick",
      layout: [
        ".............",
        ".BB.BB.BB.BB.",
        ".BB.BB.BB.BB.",
        "..BB.BBB.BB..",
        "..BB.B.B.BB..",
        ".SS..B.B..SS.",
        ".SS.......SS.",
        "..BB.TTT.BB..",
        "..BB.TTT.BB..",
        ".WW...B...WW.",
        ".WW.BBBBB.WW.",
        ".....BBB.....",
        "....PBEB.....",
      ],
      enemies: [
        "basic", "fast", "basic", "power",
        "fast", "armor", "basic", "power",
        "fast", "armor", "basic", "power",
        "fast", "armor",
      ],
      drops: [4, 9],
      maxActive: 4,
      spawnInterval: 1.9,
    },
    {
      name: "DUSK",
      chapter: "落幕",
      chapterEn: "OLD AGE",
      mission: "落幕 · 敌军无限",
      missionUnit: "",
      missionHideCount: true,
      baseShield: "none",
      // No special protection at all: enemy shells, stray shots, and the
      // player's own cannon can all break the eagle in one hit.
      playerCanBreakBase: true,
      noGameOver: true,
      endless: true,
      finaleAt: 60,
      layout: [
        ".............",
        ".BB.BBBBB.BB.",
        ".BB.B...B.BB.",
        "..BB.B.B.BB..",
        "..SS.B.B.SS..",
        ".....B.B.....",
        "TT...B.B...TT",
        "TT.BBB.BBB.TT",
        "....W...W....",
        ".BB.W.S.W.BB.",
        ".BB...S...BB.",
        ".............",
        "....P.E......",
      ],
      enemies: [
        "fast", "basic", "power", "armor",
        "fast", "power", "armor", "basic",
        "fast", "power", "armor", "fast",
        "power", "armor", "fast", "armor",
      ],
      drops: [5, 11],
      maxActive: 5,
      spawnInterval: 1.55,
    },
  ];

  const PLAYER_PALETTE = {
    body: "#e3b23b",
    dark: "#714b0e",
    light: "#ffe58a",
    accent: "#5bd0c9",
  };

  const PLAYER2_PALETTE = {
    body: "#63c8e8",
    dark: "#20506e",
    light: "#cdf6ff",
    accent: "#9fe86b",
  };

  const PLAYER_PALETTES = [PLAYER_PALETTE, PLAYER2_PALETTE];

  const MIND_PALETTE = {
    body: "#a98bff",
    dark: "#443271",
    light: "#eadcff",
    accent: "#63e0e8",
  };

  // The uninvited guest from the final minute. Bone, ash and a red eye.
  const FATE_PALETTE = {
    body: "#cfc8b6",
    dark: "#34302b",
    light: "#f4eedf",
    accent: "#c6402f",
  };

  // Confetti / petals for the ending. Both the canvas fallback (Switch) and
  // the DOM ending use the same palette so the two versions feel related.
  const PETAL_COLORS = ["#e8b53c", "#d95f3b", "#63d8ef", "#f1e4bd", "#93a749"];

  const SKILL_DEFS = {
    magnet: {
      name: "磁力场",
      callout: "磁力场",
      cooldown: 15,
      duration: 2.2,
      radius: 136,
      color: "#63d8ef",
      sfx: "skillMagnet",
    },
    mind: {
      name: "心念支配",
      callout: "心念支配",
      cooldown: 22,
      duration: 0,
      radius: 280,
      color: "#bb91ff",
      sfx: "skillMind",
    },
    teleport: {
      name: "瞬移",
      callout: "瞬移",
      cooldown: 11,
      duration: 0.3,
      distance: 176,
      color: "#ffbf66",
      sfx: "skillTeleport",
    },
  };

  const TARGET_SLOW = 0.12;
  const TARGETING_DURATION = 7;

  const BASE_COARSE = { x: 6, y: 12 };
  const SPAWN_POINTS = [
    { x: 208, y: 16 },
    { x: 16, y: 16 },
    { x: 400, y: 16 },
  ];
  const PLAYER_SPAWNS = [
    { x: 144, y: 400 },
    { x: 272, y: 400 },
  ];
  const PLAYER_LABELS = ["P1", "P2"];

  // Two local keyboard schemes. Menu keys stay global (Enter/P/M/R).
  const PLAYER_KEYS = [
    {
      dirs: { up: ["KeyW"], down: ["KeyS"], left: ["KeyA"], right: ["KeyD"] },
      fire: ["Space", "KeyJ"],
      skills: {
        magnet: ["KeyQ", "Digit1"],
        mind: ["KeyE", "Digit2"],
        teleport: ["KeyF", "Digit3"],
      },
    },
    {
      dirs: { up: ["ArrowUp"], down: ["ArrowDown"], left: ["ArrowLeft"], right: ["ArrowRight"] },
      fire: ["Enter", "Numpad0"],
      skills: {
        magnet: ["Digit7"],
        mind: ["Digit8"],
        teleport: ["Digit9"],
      },
    },
  ];

  const KEY_BINDINGS = new Map();
  PLAYER_KEYS.forEach((scheme, playerIndex) => {
    for (const [dir, codes] of Object.entries(scheme.dirs)) {
      for (const code of codes) KEY_BINDINGS.set(code, { playerIndex, kind: "dir", dir });
    }
    for (const code of scheme.fire) KEY_BINDINGS.set(code, { playerIndex, kind: "fire" });
    for (const [skill, codes] of Object.entries(scheme.skills)) {
      for (const code of codes) KEY_BINDINGS.set(code, { playerIndex, kind: "skill", skill });
    }
  });

  // ---------------------------------------------------------------------------
  // Small helpers
  // ---------------------------------------------------------------------------

  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const padScore = (n) => String(Math.max(0, Math.floor(n))).padStart(6, "0");
  const pad2 = (n) => String(Math.max(0, Math.floor(n))).padStart(2, "0");
  const overlaps = (a, b) =>
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const nearestLane = (v) => clamp(Math.round((v - 16) / 32) * 32 + 16, 16, 400);
  const coarseOf = (v) => clamp(Math.floor(v / 32), 0, 12);
  const unique = (values) => [...new Set(values)];

  function makeCanvas(w, h) {
    if (typeof OffscreenCanvas !== "undefined") {
      return new OffscreenCanvas(w, h);
    }
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    return canvas;
  }

  function boxAt(x, y, w, h) {
    return { x, y, w, h };
  }

  function tankBox(t, x = t.x, y = t.y) {
    return boxAt(x - TANK_HIT / 2, y - TANK_HIT / 2, TANK_HIT, TANK_HIT);
  }

  function bulletBox(b) {
    return boxAt(b.x - BULLET_SIZE / 2, b.y - BULLET_SIZE / 2, BULLET_SIZE, BULLET_SIZE);
  }

  function readHighScore() {
    try {
      const value = Number(window.localStorage.getItem("tank-wars-best") || 0);
      return Number.isFinite(value) ? value : 0;
    } catch (error) {
      return 0;
    }
  }

  function writeHighScore(value) {
    try {
      window.localStorage.setItem("tank-wars-best", String(Math.floor(value)));
    } catch (error) {
      // Private browsing / file URLs can reject storage. The game still runs.
    }
  }

  // ---------------------------------------------------------------------------
  // Audio: all effects are synthesized with WebAudio, no samples.
  // ---------------------------------------------------------------------------

  class AudioEngine {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.noiseBuffer = null;
      this.muted = false;
      this.masterVolume = 0.2;
      this.bufferMode = false;
      this.audioError = "";
      this.audioErrorLogged = false;
      this.playCount = 0;
      this.sfxCount = 0;
      this.retryTimer = null;
      this.retryCount = 0;
      // nx.js keeps audio buffers/nodes alive until JS GC and does not report
      // them as external memory. Reuse a bounded cache and disconnect finished
      // sources so a long session does not accumulate native audio memory.
      this.bufferCache = new Map();
    }

    failAudio(error) {
      this.audioError = String((error && error.message) || error);
      if (!this.audioErrorLogged) {
        this.audioErrorLogged = true;
        console.log(`[audio] error: ${this.audioError}`);
      }
    }

    rememberBuffer(key, buffer) {
      if (this.bufferCache.size >= 96) {
        const oldest = this.bufferCache.keys().next().value;
        this.bufferCache.delete(oldest);
      }
      this.bufferCache.set(key, buffer);
      return buffer;
    }

    ensure() {
      if (!this.ctx) {
        // Look this up at call time. The Switch DOM shim snapshots globals at
        // module evaluation; nx.js may install AudioContext later, and a stale
        // `window.AudioContext` would silently disable all sound.
        const AudioCtor =
          globalThis.AudioContext ||
          globalThis.webkitAudioContext ||
          window.AudioContext ||
          window.webkitAudioContext;
        if (!AudioCtor) {
          this.failAudio("AudioContext unavailable");
          this.scheduleRetry();
          return;
        }
        try {
          this.ctx = new AudioCtor();
          this.master = this.ctx.createGain();
          // nx.js exposes GainNode + AudioBufferSourceNode, but not
          // oscillators, biquads or compressors. In host mode every cue is
          // rendered into a short AudioBuffer with JavaScript.
          this.bufferMode = IS_SWITCH_HOST ||
            typeof this.ctx.createOscillator !== "function" ||
            typeof this.ctx.createDynamicsCompressor !== "function" ||
            typeof this.ctx.createBiquadFilter !== "function";
          this.masterVolume = this.bufferMode ? 0.35 : 0.2;
          this.master.gain.value = this.muted ? 0 : this.masterVolume;

          if (!this.bufferMode) {
            // Keep layered cannon/explosion effects from clipping when
            // several things detonate on the same frame.
            const compressor = this.ctx.createDynamicsCompressor();
            compressor.threshold.value = -18;
            compressor.knee.value = 16;
            compressor.ratio.value = 6;
            compressor.attack.value = 0.003;
            compressor.release.value = 0.22;
            this.master.connect(compressor);
            compressor.connect(this.ctx.destination);

            const length = Math.floor(this.ctx.sampleRate * 1.8);
            this.noiseBuffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
            const data = this.noiseBuffer.getChannelData(0);
            for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
          } else {
            this.master.connect(this.ctx.destination);
          }
          this.retryCount = 0;
          console.log(
            `[audio] ready sr=${this.ctx.sampleRate} bufferMode=${this.bufferMode} state=${this.ctx.state} t=${this.ctx.currentTime.toFixed(2)}`
          );
          if (this.audioError) {
            console.log(`[audio] recovered (was: ${this.audioError})`);
            this.audioError = "";
            this.audioErrorLogged = false;
          }
          try {
            this.ctx.onstatechange = () => {
              console.log(`[audio] context state=${this.ctx ? this.ctx.state : "none"}`);
            };
          } catch {
            // statechange notifications are diagnostic only.
          }
        } catch (error) {
          this.ctx = null;
          this.master = null;
          this.failAudio(error);
          // audren can still be busy while the app is gaining foreground
          // audio focus; keep retrying so the first cues are not lost.
          this.scheduleRetry();
          return;
        }
      }
      try {
        if (this.ctx.state === "suspended") this.ctx.resume();
      } catch {
        // Keep input/gameplay alive even if audio resume is unsupported.
      }
    }

    // On Switch the audio output (audren) comes up through nx.js when the
    // context is created. If that fails — commonly while the app is still
    // gaining foreground focus — every cue before the next successful attempt
    // is dropped. Retry on a short timer instead of waiting for the next key.
    scheduleRetry() {
      if (this.retryTimer !== null || this.retryCount >= 60) return;
      this.retryCount += 1;
      const setTimer = globalThis.setTimeout || (typeof window !== "undefined" && window.setTimeout);
      if (typeof setTimer !== "function") return;
      this.retryTimer = setTimer(() => {
        this.retryTimer = null;
        this.ensure();
      }, 250);
    }

    toggle() {
      this.muted = !this.muted;
      if (this.master && this.ctx) {
        // Direct assignment, not setTargetAtTime: nx.js does not prune the
        // AudioParam event table, and the render thread scans it per sample.
        this.master.gain.value = this.muted ? 0 : this.masterVolume;
      }
      return this.muted;
    }

    get ready() {
      return Boolean(this.ctx && this.master && !this.muted);
    }

    makeToneBuffer(freq, duration, type, volume, slideTo) {
      const key = `t|${type}|${freq.toFixed(2)}|${duration.toFixed(3)}|${volume.toFixed(3)}|${slideTo ? slideTo.toFixed(2) : 0}`;
      const cached = this.bufferCache.get(key);
      if (cached) return cached;
      const sampleRate = this.ctx.sampleRate;
      const length = Math.max(1, Math.floor(duration * sampleRate));
      const buffer = this.ctx.createBuffer(1, length, sampleRate);
      const data = buffer.getChannelData(0);
      const startFreq = Math.max(20, freq);
      const endFreq = slideTo ? Math.max(20, slideTo) : startFreq;
      let phase = 0;
      for (let i = 0; i < length; i += 1) {
        const t = i / sampleRate;
        const progress = i / length;
        const currentFreq = startFreq + (endFreq - startFreq) * progress;
        phase += (Math.PI * 2 * currentFreq) / sampleRate;
        let wave;
        if (type === "sine") wave = Math.sin(phase);
        else if (type === "triangle") wave = 2 * Math.abs(2 * ((phase / (Math.PI * 2)) % 1) - 1) - 1;
        else if (type === "sawtooth") wave = 2 * ((phase / (Math.PI * 2)) % 1) - 1;
        else wave = Math.sin(phase) >= 0 ? 1 : -1;
        const attack = Math.min(1, t / 0.006);
        const release = Math.pow(1 - progress, 1.7);
        data[i] = wave * volume * attack * release;
      }
      return this.rememberBuffer(key, buffer);
    }

    makeNoiseBuffer(duration, volume, cutoff) {
      const key = `n|${duration.toFixed(3)}|${volume.toFixed(3)}|${Math.round(cutoff)}`;
      const cached = this.bufferCache.get(key);
      if (cached) return cached;
      const sampleRate = this.ctx.sampleRate;
      const length = Math.max(1, Math.floor(duration * sampleRate));
      const buffer = this.ctx.createBuffer(1, length, sampleRate);
      const data = buffer.getChannelData(0);
      const rc = 1 / (Math.PI * 2 * Math.max(80, cutoff));
      const dt = 1 / sampleRate;
      const alpha = dt / (rc + dt);
      let filtered = 0;
      for (let i = 0; i < length; i += 1) {
        const t = i / sampleRate;
        const progress = i / length;
        const white = Math.random() * 2 - 1;
        filtered += alpha * (white - filtered);
        const attack = Math.min(1, t / 0.004);
        const release = Math.pow(1 - progress, 1.45);
        data[i] = filtered * 1.9 * volume * attack * release;
      }
      return this.rememberBuffer(key, buffer);
    }

    playBuffer(buffer, delay = 0) {
      try {
        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(this.master);
        // nx.js only reclaims the native source node on JS GC; detach it as
        // soon as playback ends so it stops being scanned by the audio graph.
        source.onended = () => {
          try {
            source.disconnect();
            source.buffer = null;
          } catch (error) {
            // The node may already be torn down during app exit.
          }
        };
        source.start(this.ctx.currentTime + delay);
        this.playCount += 1;
        if (this.playCount === 1) {
          console.log(
            `[audio] first source: ${buffer.duration.toFixed(3)}s at ${this.ctx.currentTime.toFixed(2)}`
          );
        }
      } catch (error) {
        this.failAudio(error);
      }
    }

    tone(freq, duration, type = "square", volume = 0.08, delay = 0, slideTo = null) {
      if (!this.ready) return;
      if (this.bufferMode) {
        try {
          // The browser path has a compressor and per-sound gain nodes; the
          // buffer path is a single gain stage, so give it a modest boost to
          // match the reference project's Switch loudness.
          this.playBuffer(this.makeToneBuffer(freq, duration, type, volume * 2, slideTo), delay);
        } catch (error) {
          this.failAudio(error);
        }
        return;
      }
      const now = this.ctx.currentTime + delay;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(Math.max(20, freq), now);
      if (slideTo) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), now + duration);
      }
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(volume, now + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(now);
      osc.stop(now + duration + 0.03);
    }

    noise(duration, volume = 0.12, delay = 0, cutoff = 1200) {
      if (!this.ready) return;
      if (this.bufferMode) {
        try {
          this.playBuffer(this.makeNoiseBuffer(duration, volume * 2, cutoff), delay);
        } catch (error) {
          this.failAudio(error);
        }
        return;
      }
      const now = this.ctx.currentTime + delay;
      const source = this.ctx.createBufferSource();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();
      source.buffer = this.noiseBuffer;
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(cutoff, now);
      filter.frequency.exponentialRampToValueAtTime(Math.max(120, cutoff * 0.35), now + duration);
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      source.start(now);
      source.stop(now + duration + 0.02);
    }

    sfx(name) {
      if (this.sfxCount < 12) {
        this.sfxCount += 1;
        console.log(
          `[audio] sfx ${name} ${this.ready ? `t=${this.ctx.currentTime.toFixed(2)}` : `skipped state=${this.ctx ? this.ctx.state : "none"} muted=${this.muted}`}`
        );
      }
      if (!this.ready) return;
      switch (name) {
        case "ui":
          this.tone(600, 0.05, "square", 0.035, 0, 880);
          break;
        case "shoot":
          // Player cannon: a sharp crack over a short low-frequency thump.
          this.tone(840, 0.055, "square", 0.05, 0, 180);
          this.tone(145, 0.1, "triangle", 0.05, 0.005, 52);
          this.noise(0.055, 0.06, 0, 1900);
          break;
        case "enemyShoot":
          this.tone(310, 0.08, "square", 0.023, 0, 120);
          this.tone(90, 0.08, "triangle", 0.018, 0.01, 55);
          this.noise(0.03, 0.018, 0, 900);
          break;
        case "mindShot":
          this.tone(880, 0.055, "triangle", 0.035, 0, 540);
          this.noise(0.025, 0.012, 0, 2200);
          break;
        case "brick":
          // Crumbling brick: crunched noise plus a low, dusty knock.
          this.noise(0.12, 0.095, 0, 1500);
          this.noise(0.055, 0.045, 0.025, 2600);
          this.tone(165, 0.07, "square", 0.032, 0, 70);
          break;
        case "steel":
          // Metallic ricochet.
          this.tone(1750, 0.055, "square", 0.028, 0, 760);
          this.tone(920, 0.16, "triangle", 0.024, 0.006, 1240);
          this.noise(0.04, 0.025, 0, 3200);
          break;
        case "shieldHit":
          this.tone(940, 0.12, "sine", 0.038, 0, 1460);
          this.tone(1520, 0.08, "triangle", 0.022, 0.02, 980);
          this.noise(0.05, 0.018, 0, 3000);
          break;
        case "bulletClash":
          this.tone(1240, 0.04, "square", 0.026, 0, 520);
          this.tone(640, 0.06, "triangle", 0.022, 0.012, 290);
          this.noise(0.035, 0.02, 0, 2600);
          break;
        case "hit":
          this.tone(290, 0.07, "sawtooth", 0.038, 0, 85);
          this.noise(0.07, 0.045, 0, 1100);
          break;
        case "explosion": {
          // Enemy/ally tank explosion. Slight random detune keeps repeated
          // kills from sounding like a copy-paste.
          // Quantize the detune so the generated buffers stay cacheable.
          const pitch = 0.88 + Math.floor(Math.random() * 7) * 0.04;
          this.noise(0.36, 0.16, 0, 720 + Math.floor(Math.random() * 4) * 65);
          this.noise(0.48, 0.08, 0.035, 260);
          this.tone(116 * pitch, 0.4, "sine", 0.11, 0, 32);
          this.tone(74 * pitch, 0.55, "triangle", 0.05, 0.025, 27);
          break;
        }
        case "playerHit":
          // The player's own tank goes up: bigger, brighter and longer.
          this.noise(0.72, 0.22, 0, 660);
          this.noise(0.45, 0.12, 0.08, 230);
          this.tone(190, 0.7, "sawtooth", 0.11, 0, 26);
          this.tone(68, 0.9, "sine", 0.09, 0, 18);
          this.noise(0.38, 0.08, 0.3, 300);
          break;
        case "baseExplosion":
          // Eagle/core loss: a long multi-stage detonation that reads as
          // "the whole bunker just went up".
          this.noise(1.35, 0.24, 0, 620);
          this.noise(0.5, 0.16, 0.18, 380);
          this.noise(0.55, 0.13, 0.62, 290);
          this.tone(92, 1.25, "sawtooth", 0.11, 0, 22);
          this.tone(44, 1.45, "sine", 0.14, 0, 15);
          this.tone(255, 0.45, "triangle", 0.04, 0.08, 45);
          [330, 262, 196].forEach((note, i) => {
            this.tone(note, 0.24, "square", 0.03, 0.35 + i * 0.12);
          });
          break;
        case "allyLost":
          this.tone(520, 0.16, "triangle", 0.04, 0, 250);
          this.tone(250, 0.3, "triangle", 0.028, 0.12, 110);
          this.noise(0.32, 0.12, 0.02, 600);
          this.tone(88, 0.42, "sine", 0.075, 0.04, 28);
          break;
        case "powerupDrop":
          this.tone(660, 0.08, "triangle", 0.035, 0, 880);
          this.tone(1050, 0.12, "sine", 0.026, 0.08, 1320);
          break;
        case "powerup":
          [523, 659, 784, 1047].forEach((note, i) => {
            this.tone(note, 0.09, "triangle", 0.085, i * 0.065);
          });
          break;
        case "spawn":
          this.tone(180, 0.12, "triangle", 0.032, 0, 560);
          this.tone(280, 0.09, "triangle", 0.024, 0.14, 660);
          break;
        case "stageStart":
          [196, 262, 330, 392].forEach((note, i) => {
            this.tone(note, 0.14, "square", 0.055, i * 0.12);
          });
          this.tone(523, 0.26, "square", 0.045, 0.5);
          break;
        case "gameOver":
          [392, 330, 262, 196, 131].forEach((note, i) => {
            this.tone(note, 0.2, "square", 0.06, i * 0.17);
          });
          this.tone(98, 0.6, "sawtooth", 0.045, 0.9, 65);
          break;
        case "clear":
          [523, 659, 784, 1047].forEach((note, i) => {
            this.tone(note, 0.13, "triangle", 0.075, i * 0.11);
          });
          [1047, 1319, 1568].forEach((note, i) => {
            this.tone(note, 0.5, "square", 0.035, 0.48 + i * 0.01);
          });
          break;
        case "finale":
          // Old age arrives: a low, patient drone and three heartbeats.
          this.tone(55, 2.8, "sine", 0.1, 0, 44);
          this.tone(110, 2.2, "triangle", 0.028, 0.18, 82);
          this.noise(1.9, 0.045, 0, 210);
          [0, 0.62, 1.24].forEach((delay, i) => {
            this.tone(58 - i * 2, 0.2, "sine", 0.11, delay, 38);
            this.tone(46, 0.26, "sine", 0.07, delay + 0.16, 30);
          });
          break;
        case "fateShot":
          // One shell. No counterplay.
          this.noise(0.5, 0.24, 0, 520);
          this.tone(64, 0.9, "sine", 0.16, 0, 18);
          this.tone(130, 0.45, "sawtooth", 0.08, 0, 28);
          this.noise(0.7, 0.1, 0.12, 240);
          break;
        case "ending":
          // Warm, unhurried, a little sad. The war is over.
          [262, 330, 392, 523, 659, 784, 1047].forEach((note, i) => {
            this.tone(note, 0.5, "triangle", 0.038, 0.35 + i * 0.17);
          });
          this.tone(1568, 1.6, "sine", 0.02, 1.45);
          this.tone(131, 2.2, "sine", 0.03, 0.1, 196);
          break;
        case "skillAim":
          this.tone(440, 0.18, "sine", 0.035, 0, 220);
          this.tone(220, 0.3, "triangle", 0.026, 0.1);
          break;
        case "lock":
          this.tone(740, 0.045, "square", 0.022, 0, 980);
          break;
        case "skillMagnet":
          this.tone(150, 0.48, "sawtooth", 0.055, 0, 520);
          this.tone(300, 0.3, "square", 0.025, 0.1, 900);
          this.noise(0.28, 0.07, 0.02, 1700);
          break;
        case "skillMind":
          [392, 523, 659, 784, 1047].forEach((note, i) => {
            this.tone(note, 0.16, "triangle", 0.055, i * 0.075);
          });
          this.tone(1319, 0.45, "sine", 0.025, 0.36);
          break;
        case "skillTeleport":
          this.tone(210, 0.34, "sine", 0.055, 0, 1600);
          this.tone(1180, 0.16, "square", 0.024, 0.14, 260);
          this.noise(0.18, 0.055, 0.04, 2600);
          break;
        case "uiDenied":
          this.tone(120, 0.08, "square", 0.045, 0, 80);
          this.tone(90, 0.1, "square", 0.035, 0.08, 60);
          break;
        case "life":
          [330, 392, 523].forEach((note, i) => {
            this.tone(note, 0.1, "triangle", 0.07, i * 0.07);
          });
          break;
        default:
          break;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Tiny 5 x 7 bitmap font. Keeps the HUD crisp at any integer scale.
  // ---------------------------------------------------------------------------

  const GLYPHS = {
    " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
    A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
    B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
    C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
    D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
    E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
    F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
    G: ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
    H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
    I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
    J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
    K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
    L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
    M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
    N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
    O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
    P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
    Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
    R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
    S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
    T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
    U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
    V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
    W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
    X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
    Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
    Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
    0: ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
    1: ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
    2: ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
    3: ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
    4: ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
    5: ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
    6: ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
    7: ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
    8: ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
    9: ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
    "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
    ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
    ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
    "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
    "?": ["01110", "10001", "00001", "00010", "00100", "00000", "00100"],
    "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
    "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
    "*": ["00000", "10101", "01110", "11111", "01110", "10101", "00000"],
  };

  function measureText(text, scale = 1) {
    const length = String(text).length;
    return length <= 0 ? 0 : length * 6 * scale - scale;
  }

  function drawText(g, text, x, y, scale = 1, color = "#ffffff", align = "left", shadow = null) {
    const value = String(text).toUpperCase();
    const width = measureText(value, scale);
    let drawX = x;
    if (align === "center") drawX -= Math.floor(width / 2);
    if (align === "right") drawX -= width;

    if (shadow) {
      // A full font-pixel offset looks like a second, broken letter at large
      // scales. Keep large signage readable with a restrained 1-2px drop shadow.
      const shadowOffset = clamp(Math.round(scale * 0.34), 1, 2);
      drawTextRaw(g, value, drawX + shadowOffset, y + shadowOffset, scale, shadow);
    }
    drawTextRaw(g, value, drawX, y, scale, color);
    return width;
  }

  function drawTextRaw(g, text, x, y, scale, color) {
    g.fillStyle = color;
    for (let i = 0; i < text.length; i += 1) {
      const glyph = GLYPHS[text[i]] || GLYPHS["?"];
      const gx = x + i * 6 * scale;
      for (let row = 0; row < 7; row += 1) {
        const bits = glyph[row];
        for (let col = 0; col < 5; col += 1) {
          if (bits[col] === "1") {
            g.fillRect(gx + col * scale, y + row * scale, scale, scale);
          }
        }
      }
    }
  }

  // The 5x7 bitmap font is ASCII-only. Chinese is drawn from the host's
  // bundled 14x14 bitmap glyph table on Switch (a custom FontFace stalled the
  // NX.js renderer on device) and from the system CJK face in the browser.
  const CJK_GLYPHS = window.__tankWarsCJKGlyphs || null;
  const CJK_CELL = 14;
  const CJK_ADVANCE = 15;
  const CJK_FALLBACK = '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif';
  if (IS_SWITCH_HOST) {
    window.__tankWarsAsciiGlyphs = GLYPHS;
    globalThis.__tankWarsAsciiGlyphs = GLYPHS;
  }

  function drawCJKSystem(g, text, x, y, size, color, align = "center", shadow = null) {
    g.save();
    g.font = `normal ${size}px ${CJK_FALLBACK}`;
    g.textAlign = align;
    g.textBaseline = "alphabetic";
    if (shadow) {
      g.fillStyle = shadow;
      g.fillText(text, x + 1, y + 1);
    }
    g.fillStyle = color;
    g.fillText(text, x, y);
    g.restore();
  }

  function drawRichText(g, text, x, top, size, color, align = "center", shadow = null) {
    if (!CJK_GLYPHS) {
      drawCJKSystem(g, text, x, top + size, size, color, align, shadow);
      return;
    }
    const value = String(text).toUpperCase();
    // Chinese cells are 14px tall; ASCII glyphs are drawn at 2x so both share
    // the same baseline and line height.
    const scale = Math.max(1, Math.round(size / CJK_CELL));
    const asciiScale = scale * 2;
    const advanceOf = (ch) => (CJK_GLYPHS[ch] ? CJK_ADVANCE * scale : 6 * asciiScale);
    let width = 0;
    for (const ch of value) width += advanceOf(ch);
    let originX = x;
    if (align === "center") originX -= Math.floor(width / 2);
    else if (align === "right") originX -= width;

    const paint = (dx, dy, colorValue) => {
      g.fillStyle = colorValue;
      let px = originX + dx;
      for (const ch of value) {
        const glyph = CJK_GLYPHS[ch];
        if (ch === " ") {
          px += 6 * asciiScale;
          continue;
        }
        if (glyph) {
          for (let row = 0; row < CJK_CELL; row += 1) {
            const bits = glyph[row];
            for (let col = 0; col < CJK_CELL; col += 1) {
              if (bits[col] !== "1") continue;
              let end = col + 1;
              while (end < CJK_CELL && bits[end] === "1") end += 1;
              g.fillRect(
                px + col * scale,
                top + dy + row * scale,
                (end - col) * scale,
                scale
              );
              col = end;
            }
          }
          px += CJK_ADVANCE * scale;
        } else {
          const ascii = GLYPHS[ch] || GLYPHS["?"];
          for (let row = 0; row < 7; row += 1) {
            const bits = ascii[row];
            for (let col = 0; col < 5; col += 1) {
              if (bits[col] !== "1") continue;
              let end = col + 1;
              while (end < 5 && bits[end] === "1") end += 1;
              g.fillRect(
                px + col * asciiScale,
                top + dy + row * asciiScale,
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

    if (shadow) paint(1, 1, shadow);
    paint(0, 0, color);
  }

  // Chinese label helper: `top` is the top edge (matching drawText's y), which
  // keeps the existing overlay layout coordinates usable.
  function drawLabel(g, text, x, top, size, color, align = "center", shadow = null) {
    drawRichText(g, text, x, top, size, color, align, shadow);
  }

  // ---------------------------------------------------------------------------
  // DOM and global game state
  // ---------------------------------------------------------------------------

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.imageSmoothingEnabled = false;

  const btnSound = document.getElementById("btn-sound");
  const btnPause = document.getElementById("btn-pause");
  const btnRestart = document.getElementById("btn-restart");
  const highScoreEl = document.getElementById("high-score");
  const screenEl = document.getElementById("screen");
  const skillButtons = [...document.querySelectorAll("[data-skill]")];
  const targetHintEl = document.getElementById("target-hint");
  const targetHintTextEl = document.getElementById("target-hint-text");
  const statScoreP1El = document.getElementById("stat-score-p1");
  const statScoreP2El = document.getElementById("stat-score-p2");
  const p2ScoreBlockEl = document.getElementById("p2-score-block");
  const p2PlayerRowEl = document.getElementById("p2-player-row");
  const p2AbilityDeckEl = document.getElementById("p2-ability-deck");
  const statEnemyEl = document.getElementById("stat-enemy");
  const statStageEl = document.getElementById("stat-stage");
  const statBaseEl = document.getElementById("stat-base");
  const missionEnemyEl = document.getElementById("mission-enemy");
  const missionTextEl = document.getElementById("mission-text");
  const missionUnitEl = document.getElementById("mission-unit");
  const railStageLabelEl = document.getElementById("rail-stage-label");
  const endingOverlayEl = document.getElementById("ending-overlay");
  const endingPetalsEl = document.getElementById("ending-petals");
  const endingReplayEl = document.getElementById("ending-replay");
  const enemyPipsEl = document.getElementById("enemy-pips");
  const livesPipsEls = [
    document.getElementById("lives-pips-p1"),
    document.getElementById("lives-pips-p2"),
  ];
  const gunPipsEls = [
    document.getElementById("gun-pips-p1"),
    document.getElementById("gun-pips-p2"),
  ];
  const enemyPipEls = [];
  const lifePipEls = [[], []];
  const gunPipEls = [[], []];
  const audio = new AudioEngine();
  let skillUiSignature = "";
  let statsUiSignature = "";
  let titleGradient = null;

  let state = "title";
  let stateTime = 0;
  let visualTime = 0;
  let score = 0;
  let highScore = readHighScore();
  let selectedPlayerCount = 1;
  let players = [];
  let killed = 0;
  let converted = 0;
  let currentStage = 1;
  let stageConfig = STAGES[0];
  let totalEnemies = stageConfig.enemies.length;
  let maxActiveEnemies = stageConfig.maxActive;
  let spawnInterval = stageConfig.spawnInterval;
  let endReason = "";
  let victoryBonus = 0;
  // Stage 3's scripted, unavoidable last minute. `null` until it starts.
  let finale = null;
  // Short beat between losing the last tank in DUSK and the epilogue.
  let endingTrigger = null;
  const endingPetals = [];

  let map = [];
  let base = null;
  let enemies = [];
  let bullets = [];
  let particles = [];
  let popups = [];
  let powerups = [];
  let teleportGhosts = [];
  let targeting = null;
  let spawnQueue = [];
  let pendingSpawn = null;
  let spawnIndex = 0;
  let spawnTimer = 0;
  let spawnBlockedTime = 0;
  let endTimer = 0;
  let shake = 0;
  let flashAlpha = 0;
  let terrainCanvas = null;
  let treeCanvas = null;
  let terrainDirty = true;
  let waterCells = [];
  let navVersion = 0;
  let navCacheVersion = -1;
  const navBlocked = new Uint8Array(CCOLS * CROWS);

  function createInput() {
    return {
      fire: false,
      order: [],
      counts: { up: 0, down: 0, left: 0, right: 0 },
    };
  }
  const inputs = [createInput(), createInput()];
  const heldKeys = new Set();
  const touchPointers = new Map();
  const titleDust = Array.from({ length: 34 }, () => ({
    x: rand(0, VIEW_W),
    y: rand(0, VIEW_H),
    size: Math.random() < 0.78 ? 1 : 2,
    speed: rand(3, 13),
    phase: rand(0, Math.PI * 2),
    color: Math.random() < 0.16 ? "#c29433" : "#6f8066",
    alpha: rand(0.12, 0.55),
  }));

  // ---------------------------------------------------------------------------
  // Level construction and terrain rendering
  // ---------------------------------------------------------------------------

  function loadStage(stageNumber, { resetRun = false } = {}) {
    currentStage = clamp(stageNumber, 1, STAGES.length);
    stageConfig = STAGES[currentStage - 1];
    maxActiveEnemies = stageConfig.maxActive;
    spawnInterval = stageConfig.spawnInterval;
    finale = null;
    endingTrigger = null;
    hideEndingOverlay();

    map = [];
    for (let cy = 0; cy < CROWS; cy += 1) {
      for (let sy = 0; sy < 2; sy += 1) {
        const row = [];
        for (let cx = 0; cx < CCOLS; cx += 1) {
          const ch = stageConfig.layout[cy][cx];
          for (let sx = 0; sx < 2; sx += 1) {
            row.push(ch === "P" ? "." : ch);
          }
        }
        map.push(row);
      }
    }

    base = {
      x: BASE_COARSE.x * COARSE,
      y: BASE_COARSE.y * COARSE,
      w: COARSE,
      h: COARSE,
      alive: true,
    };

    enemies = [];
    bullets = [];
    particles = [];
    popups = [];
    powerups = [];
    teleportGhosts = [];
    targeting = null;
    hideTargetHint();
    spawnQueue = stageConfig.enemies.slice();
    pendingSpawn = null;
    spawnIndex = 0;
    spawnTimer = 1.15;
    spawnBlockedTime = 0;
    endTimer = 0;
    killed = 0;
    converted = 0;
    totalEnemies = spawnQueue.length;
    victoryBonus = 0;
    endReason = "";
    shake = 0;
    flashAlpha = 0;
    if (resetRun) score = 0;
    resetPlayersForStage(resetRun);
    markMapChanged();
    rebuildTerrain();
  }

  function createPlayer(index, lives = PLAYER_LIVES, playerScore = 0) {
    const spawn = PLAYER_SPAWNS[index] || PLAYER_SPAWNS[0];
    return {
      index,
      label: PLAYER_LABELS[index] || `P${index + 1}`,
      x: spawn.x,
      y: spawn.y,
      dir: "up",
      speed: PLAYER_SPEED,
      cooldown: 0,
      fireTier: 0,
      shield: 0,
      isPlayer: true,
      hp: 1,
      moving: false,
      lives,
      score: playerScore,
      active: true,
      out: false,
      respawnTimer: 0,
      skills: {
        magnet: { cooldown: 0, active: 0 },
        mind: { cooldown: 0, active: 0 },
        teleport: { cooldown: 0, active: 0 },
      },
    };
  }

  function resetPlayersForStage(resetRun) {
    if (resetRun || players.length !== selectedPlayerCount) {
      players = Array.from({ length: selectedPlayerCount }, (_, index) => createPlayer(index));
    }
    const finalLives = stageConfig.noGameOver ? 1 : null;
    for (const p of players) {
      const spawn = PLAYER_SPAWNS[p.index] || PLAYER_SPAWNS[0];
      p.x = spawn.x;
      p.y = spawn.y;
      p.dir = "up";
      p.cooldown = 0;
      p.fireTier = 0;
      p.moving = false;
      p.respawnTimer = 0;
      if (finalLives !== null) {
        // The final act gives everyone one last tank, even if they were out.
        p.lives = finalLives;
        p.out = false;
        p.active = true;
      } else if (p.lives <= 0) {
        p.out = true;
        p.active = false;
      } else {
        p.out = false;
        p.active = true;
      }
      p.shield = p.active ? 3 : 0;
      for (const key of Object.keys(p.skills)) {
        p.skills[key].cooldown = 0;
        p.skills[key].active = 0;
      }
    }
    refreshTeamScore();
  }

  function refreshTeamScore() {
    score = players.reduce((sum, p) => sum + (p.score || 0), 0);
  }

  function activePlayers() {
    return players.filter((p) => p.active && !p.out && p.lives > 0);
  }

  function primaryPlayer() {
    return players[0] || null;
  }

  function nearestActivePlayer(x, y) {
    let best = null;
    let bestDistance = Infinity;
    for (const p of activePlayers()) {
      const distance = Math.hypot(p.x - x, p.y - y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = p;
      }
    }
    return best;
  }

  function markMapChanged() {
    terrainDirty = true;
    navVersion += 1;
  }

  function rebuildTerrain() {
    const hostTerrain = IS_SWITCH_HOST ? window.__tankWarsHostTerrain : null;
    let g;
    let t = null;
    if (hostTerrain) {
      terrainCanvas = null;
      treeCanvas = null;
      g = hostTerrain.beginTerrain();
    } else {
      terrainCanvas = makeCanvas(FIELD, FIELD);
      treeCanvas = makeCanvas(FIELD, FIELD);
      g = terrainCanvas.getContext("2d");
      t = treeCanvas.getContext("2d");
    }
    g.imageSmoothingEnabled = false;
    if (t) t.imageSmoothingEnabled = false;
    waterCells = [];

    g.fillStyle = "#08100b";
    g.fillRect(0, 0, FIELD, FIELD);

    // Quiet checkerboard and sparse ground specks.
    for (let y = 0; y < CROWS; y += 1) {
      for (let x = 0; x < CCOLS; x += 1) {
        if ((x + y) % 2 === 0) {
          g.fillStyle = "rgba(106, 132, 101, 0.027)";
          g.fillRect(x * COARSE, y * COARSE, COARSE, COARSE);
        }
      }
    }

    let seed = 92821;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let i = 0; i < 280; i += 1) {
      const x = Math.floor(random() * FIELD);
      const y = Math.floor(random() * FIELD);
      g.fillStyle = random() < 0.5 ? "rgba(143, 161, 126, 0.075)" : "rgba(0, 0, 0, 0.17)";
      g.fillRect(x, y, random() < 0.8 ? 1 : 2, 1);
    }

    // A dark inset around the playfield.
    g.fillStyle = "rgba(0, 0, 0, 0.28)";
    g.fillRect(0, 0, FIELD, 2);
    g.fillRect(0, FIELD - 2, FIELD, 2);
    g.fillRect(0, 0, 2, FIELD);
    g.fillRect(FIELD - 2, 0, 2, FIELD);

    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const type = map[y][x];
        const px = x * TILE;
        const py = y * TILE;
        if (type === "B") {
          drawBrickTile(g, px, py, (x + y) % 2 === 0);
        } else if (type === "S") {
          drawSteelTile(g, px, py);
        } else if (type === "W") {
          drawWaterTile(g, px, py);
          waterCells.push({ x, y });
        } else if (type === "T") {
          if (t) drawTreeTile(t, px, py, x, y);
        } else if (type === "E") {
          g.fillStyle = "#11150f";
          g.fillRect(px, py, TILE, TILE);
        }
      }
    }

    if (hostTerrain) hostTerrain.endTerrain();
    terrainDirty = false;
  }

  function drawBrickTile(g, x, y, variant) {
    g.fillStyle = "#2a1512";
    g.fillRect(x, y, TILE, TILE);
    g.fillStyle = variant ? "#7f3b2d" : "#89412f";
    g.fillRect(x + 1, y + 1, 14, 4);
    g.fillRect(x + 1, y + 6, 6, 4);
    g.fillRect(x + 9, y + 6, 6, 4);
    g.fillRect(x + 1, y + 11, 10, 4);
    g.fillRect(x + 13, y + 11, 2, 4);
    g.fillStyle = variant ? "#a95d43" : "#b46448";
    g.fillRect(x + 1, y + 1, 14, 1);
    g.fillRect(x + 1, y + 6, 6, 1);
    g.fillRect(x + 9, y + 6, 6, 1);
    g.fillRect(x + 1, y + 11, 10, 1);
    g.fillStyle = "#4b211a";
    g.fillRect(x + 2, y + 4, 12, 1);
    g.fillRect(x + 7, y + 9, 1, 6);
    g.fillStyle = "rgba(255, 214, 160, 0.08)";
    g.fillRect(x + 3, y + 2, 5, 1);
    g.fillRect(x + 10, y + 7, 3, 1);
  }

  function drawSteelTile(g, x, y) {
    g.fillStyle = "#384347";
    g.fillRect(x, y, TILE, TILE);
    g.fillStyle = "#718087";
    g.fillRect(x + 1, y + 1, 14, 14);
    g.fillStyle = "#b9c5c6";
    g.fillRect(x + 2, y + 2, 12, 11);
    g.fillStyle = "#e2eaea";
    g.fillRect(x + 2, y + 2, 12, 2);
    g.fillRect(x + 2, y + 2, 2, 10);
    g.fillStyle = "#657376";
    g.fillRect(x + 2, y + 12, 12, 1);
    g.fillRect(x + 13, y + 3, 1, 10);
    g.fillStyle = "#495559";
    g.fillRect(x + 6, y + 6, 4, 4);
    g.fillStyle = "#d7e0df";
    g.fillRect(x + 7, y + 7, 2, 2);
    g.fillStyle = "#415055";
    g.fillRect(x + 4, y + 4, 1, 1);
    g.fillRect(x + 11, y + 4, 1, 1);
    g.fillRect(x + 4, y + 11, 1, 1);
    g.fillRect(x + 11, y + 11, 1, 1);
  }

  function drawWaterTile(g, x, y) {
    g.fillStyle = "#071e31";
    g.fillRect(x, y, TILE, TILE);
    g.fillStyle = "#0a2d47";
    g.fillRect(x, y, 16, 15);
    g.fillStyle = "rgba(46, 121, 151, 0.2)";
    g.fillRect(x, y, 16, 1);
    g.fillStyle = "rgba(0, 0, 0, 0.28)";
    g.fillRect(x, y + 15, 16, 1);
  }

  function drawTreeTile(g, x, y, cellX, cellY) {
    let seed = (cellX + 11) * 7349 + (cellY + 3) * 9151;
    const random = () => {
      seed = (seed * 16807 + 37) % 2147483647;
      return seed / 2147483647;
    };
    const greens = ["#15321d", "#1b4226", "#24542e", "#2d6637", "#376f3e"];
    g.fillStyle = "rgba(6, 17, 10, 0.75)";
    g.fillRect(x + 1, y + 2, 14, 13);
    for (let i = 0; i < 12; i += 1) {
      const rx = x + Math.floor(random() * 17) - 2;
      const ry = y + Math.floor(random() * 16) - 1;
      const size = 2 + Math.floor(random() * 5);
      g.fillStyle = greens[Math.floor(random() * greens.length)];
      g.fillRect(rx, ry, size, Math.max(2, size - 1));
    }
    g.fillStyle = "rgba(153, 188, 107, 0.18)";
    for (let i = 0; i < 3; i += 1) {
      g.fillRect(x + 2 + Math.floor(random() * 12), y + 2 + Math.floor(random() * 11), 2, 1);
    }
  }

  // ---------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------

  function pressDir(playerIndex, dir) {
    const input = inputs[playerIndex];
    if (!input) return;
    input.counts[dir] += 1;
    if (input.counts[dir] === 1) input.order.push(dir);
  }

  function releaseDir(playerIndex, dir) {
    const input = inputs[playerIndex];
    if (!input || input.counts[dir] <= 0) return;
    input.counts[dir] -= 1;
    if (input.counts[dir] === 0) {
      input.order = input.order.filter((item) => item !== dir);
    }
  }

  function clearInputs() {
    heldKeys.clear();
    touchPointers.clear();
    for (const input of inputs) {
      input.order = [];
      input.counts = { up: 0, down: 0, left: 0, right: 0 };
      input.fire = false;
    }
    document.querySelectorAll("[data-control].is-active").forEach((el) => {
      el.classList.remove("is-active");
    });
  }

  function currentDir(playerIndex) {
    const input = inputs[playerIndex];
    return input && input.order.length ? input.order[input.order.length - 1] : null;
  }

  function fieldPointFromPointer(event) {
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const x = ((event.clientX - rect.left) / rect.width) * VIEW_W;
    const y = ((event.clientY - rect.top) / rect.height) * VIEW_H;
    if (x < 0 || y < 0 || x > FIELD || y > FIELD) return null;
    return { x, y };
  }

  function onKeyDown(event) {
    const code = event.code;
    const gameKeys = [
      "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
      "KeyW", "KeyA", "KeyS", "KeyD",
      "Space", "KeyJ", "Enter", "Numpad0", "KeyP", "Escape", "KeyM", "KeyR",
      "KeyQ", "KeyE", "KeyF", "Digit1", "Digit2", "Digit3", "Digit7", "Digit8", "Digit9",
    ];
    if (gameKeys.includes(code)) event.preventDefault();

    audio.ensure();

    if (state === "title" && !event.repeat) {
      if (PREVIEW_MODE && (code === "Digit1" || code === "Digit2" || code === "Digit3")) {
        jumpToStage(Number(code.slice(-1)));
        return;
      }
      if (PREVIEW_MODE && code === "Digit4") {
        beginEnding();
        return;
      }
      if (code === "Digit1" || code === "Digit2") {
        selectedPlayerCount = Number(code.slice(-1));
        syncUI();
        audio.sfx("ui");
        return;
      }
    }

    if (code === "KeyM") {
      if (!event.repeat) toggleMute();
      return;
    }
    if (code === "KeyR") {
      if (!event.repeat) startGame();
      return;
    }
    if (code === "KeyP") {
      if (!event.repeat) togglePause();
      return;
    }
    if (code === "Escape") {
      if (!event.repeat) {
        if (targeting) cancelTargeting();
        else togglePause();
      }
      return;
    }

    if (code === "Enter") {
      if (state === "title" || state === "gameover" || state === "victory" || state === "ending" || state === "stageclear") {
        if (!event.repeat) menuConfirm();
        return;
      }
      if (state === "playing") {
        if (targeting) {
          if (!event.repeat) confirmTargeting();
        } else {
          inputs[1].fire = true;
        }
        return;
      }
    }

    if (code === "Space" || code === "KeyJ") {
      if (state === "title" || state === "stageclear") {
        if (!event.repeat) menuConfirm();
        return;
      }
      if (state === "playing") {
        if (targeting) {
          if (!event.repeat) confirmTargeting();
        } else {
          inputs[0].fire = true;
        }
        return;
      }
    }

    const binding = KEY_BINDINGS.get(code);
    if (!binding) return;

    if (binding.kind === "skill") {
      if (event.repeat) return;
      if (targeting && targeting.ownerIndex === binding.playerIndex && targeting.skill === binding.skill) {
        cancelTargeting();
      } else {
        activateSkill(binding.playerIndex, binding.skill);
      }
      return;
    }

    if (binding.kind === "fire") {
      if (state !== "playing") return;
      if (targeting) {
        if (!event.repeat) confirmTargeting();
      } else {
        inputs[binding.playerIndex].fire = true;
      }
      return;
    }

    if (binding.kind === "dir" && state === "playing" && !heldKeys.has(code)) {
      heldKeys.add(code);
      pressDir(binding.playerIndex, binding.dir);
    }
  }

  function onKeyUp(event) {
    const code = event.code;
    if (code === "Space" || code === "KeyJ") inputs[0].fire = false;
    if (code === "Enter" || code === "Numpad0") inputs[1].fire = false;
    const binding = KEY_BINDINGS.get(code);
    if (binding && binding.kind === "dir" && heldKeys.has(code)) {
      heldKeys.delete(code);
      releaseDir(binding.playerIndex, binding.dir);
    }
  }

  function bindTouchButton(button) {
    const control = button.dataset.control;
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      audio.ensure();
      if (state === "title" || state === "gameover" || state === "victory" || state === "ending") {
        startGame();
      }
      button.setPointerCapture(event.pointerId);
      touchPointers.set(event.pointerId, control);
      button.classList.add("is-active");
      if (control === "fire") {
        if (targeting && state === "playing") confirmTargeting();
        else inputs[0].fire = true;
      } else {
        pressDir(0, control);
      }
    });

    const finish = (event) => {
      const held = touchPointers.get(event.pointerId);
      if (!held) return;
      touchPointers.delete(event.pointerId);
      button.classList.remove("is-active");
      const stillHeld = [...touchPointers.values()].includes(held);
      if (held === "fire") {
        if (!stillHeld) inputs[0].fire = false;
      } else if (!stillHeld) {
        releaseDir(0, held);
      }
    };
    button.addEventListener("pointerup", finish);
    button.addEventListener("pointercancel", finish);
    button.addEventListener("lostpointercapture", finish);
  }

  function bindEvents() {
    window.addEventListener("keydown", onKeyDown, { passive: false });
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", clearInputs);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        clearInputs();
        if (state === "playing") togglePause();
      }
    });

    screenEl.addEventListener("contextmenu", (event) => event.preventDefault());
    canvas.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      audio.ensure();
      canvas.focus({ preventScroll: true });
      if (targeting && state === "playing") {
        if (event.button === 2) {
          cancelTargeting();
          return;
        }
        const point = fieldPointFromPointer(event);
        if (point) {
          setTargetingReticle(point.x, point.y);
          confirmTargeting();
        }
        return;
      }
      if (state === "stageclear") {
        menuConfirm();
      } else if (state === "title" || state === "gameover" || state === "victory") {
        startGame();
      }
    });
    canvas.addEventListener("pointermove", (event) => {
      if (!targeting || state !== "playing") return;
      const point = fieldPointFromPointer(event);
      if (point) setTargetingReticle(point.x, point.y);
    });

    document.querySelectorAll("[data-control]").forEach(bindTouchButton);

    btnSound.addEventListener("click", toggleMute);
    btnPause.addEventListener("click", togglePause);
    btnRestart.addEventListener("click", startGame);
    if (endingReplayEl) endingReplayEl.addEventListener("click", startGame);

    for (const button of skillButtons) {
      button.addEventListener("click", () => {
        audio.ensure();
        const playerIndex = Number(button.dataset.player) || 0;
        if (targeting) {
          if (targeting.ownerIndex === playerIndex && targeting.skill === button.dataset.skill) {
            cancelTargeting();
          } else if (playerIndex !== targeting.ownerIndex && button.dataset.skill === "magnet") {
            activateSkill(playerIndex, "magnet");
          }
          canvas.focus({ preventScroll: true });
          return;
        }
        activateSkill(playerIndex, button.dataset.skill);
        canvas.focus({ preventScroll: true });
      });
    }

    buildStatPips();
    highScoreEl.textContent = padScore(highScore);
    syncUI();
    syncSkillUI(true);
  }

  // ---------------------------------------------------------------------------
  // Game lifecycle
  // ---------------------------------------------------------------------------

  function startGame() {
    audio.ensure();
    clearInputs();
    selectedPlayerCount = clamp(selectedPlayerCount, 1, 2);
    loadStage(1, { resetRun: true });
    state = "intro";
    stateTime = 0;
    endReason = "";
    resetClock();
    syncUI();
    audio.sfx("stageStart");
  }

  function advanceStage() {
    if (currentStage >= STAGES.length) return;
    clearInputs();
    loadStage(currentStage + 1, { resetRun: false });
    state = "intro";
    stateTime = 0;
    resetClock();
    syncUI();
    audio.sfx("stageStart");
  }

  // Debug / preview helper. Also used by ?stage=3&time=58 so the finale can
  // be inspected without waiting a real minute.
  function jumpToStage(stageNumber, time = 0) {
    clearInputs();
    const n = clamp(Number(stageNumber) || 1, 1, STAGES.length);
    loadStage(n, { resetRun: n === 1 });
    for (const p of players) {
      if (p.active) p.shield = 1.2;
    }
    state = "playing";
    stateTime = Math.max(0, Number(time) || 0);
    resetClock();
    syncUI();
  }

  function menuConfirm() {
    if (state === "stageclear") {
      advanceStage();
    } else if (state === "title" || state === "gameover" || state === "victory" || state === "ending") {
      startGame();
    }
  }

  function togglePause() {
    if (state === "playing") {
      state = "paused";
      clearInputs();
      resetClock();
      audio.sfx("ui");
    } else if (state === "paused") {
      state = "playing";
      clearInputs();
      resetClock();
      audio.sfx("ui");
    }
    syncUI();
  }

  function toggleMute() {
    audio.ensure();
    const muted = audio.toggle();
    syncUI();
    if (!muted) audio.sfx("ui");
  }

  function syncUI() {
    btnSound.textContent = audio.muted ? "UNMUTE" : "MUTE";
    btnSound.title = audio.muted ? "开启音效（M）" : "关闭音效（M）";
    btnSound.setAttribute("aria-pressed", audio.muted ? "true" : "false");
    btnPause.textContent = state === "paused" ? "RESUME" : "PAUSE";
    btnPause.disabled = state !== "playing" && state !== "paused";
    btnPause.setAttribute("aria-pressed", state === "paused" ? "true" : "false");
    highScoreEl.textContent = padScore(highScore);
    syncStatsUI(true);
    syncSkillUI(true);
  }

  function commitHighScore() {
    const best = players.length ? Math.max(...players.map((p) => p.score || 0)) : 0;
    if (best > highScore) {
      highScore = best;
      writeHighScore(highScore);
      syncUI();
    }
  }

  function beginGameOver(reason) {
    if (state !== "playing") return;
    // The last stage has no ordinary defeat state. It always unwinds through
    // the scripted finale instead, no matter how the player is doing.
    if (stageConfig.noGameOver) return;
    if (targeting) cancelTargeting(false, true);
    clearActiveSkills();
    state = "gameover";
    stateTime = 0;
    endReason = reason;
    clearInputs();
    commitHighScore();
    syncUI();
    audio.sfx("gameOver");
  }

  function stageClear() {
    if (state !== "playing") return;
    // DUSK never clears by kill count. Its only exit is the finale.
    if (stageConfig.endless) return;
    if (targeting) cancelTargeting(false, true);
    clearActiveSkills();
    clearInputs();
    stateTime = 0;

    if (currentStage < STAGES.length) {
      state = "stageclear";
      syncUI();
      audio.sfx("clear");
      return;
    }

    victoryBonus = 0;
    for (const p of players) {
      const bonus = Math.max(0, p.lives) * 500;
      p.score += bonus;
      victoryBonus += bonus;
    }
    refreshTeamScore();
    state = "victory";
    commitHighScore();
    syncUI();
    audio.sfx("clear");
  }

  function campaignCleared() {
    return !stageConfig.endless && killed + converted >= totalEnemies;
  }

  function makeEnemy(type, x, y) {
    const config = ENEMY_TYPES[type];
    return {
      x,
      y,
      dir: "down",
      type,
      config,
      hp: config.hp,
      maxHp: config.hp,
      speed: config.speed,
      cooldown: 0,
      fireTimer: rand(0.65, 1.5),
      aimTimer: 0,
      hitFlash: 0,
      baseCooldown: 0,
      path: null,
      pathIndex: 0,
      repathTimer: rand(0.2, 0.8),
      stuck: 0,
      alive: true,
      isEnemy: true,
    };
  }

  // ---------------------------------------------------------------------------
  // World collision and enemy navigation
  // ---------------------------------------------------------------------------

  function cellAt(px, py) {
    const x = Math.floor(px / TILE);
    const y = Math.floor(py / TILE);
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return null;
    return map[y][x];
  }

  function solidForTank(type) {
    return type === "B" || type === "S" || type === "W" || type === "E";
  }

  function solidForPath(type) {
    return type === "B" || type === "S" || type === "W" || type === "E";
  }

  function tankHitsTerrain(t, x, y) {
    const box = tankBox(t, x, y);
    if (box.x < 0 || box.y < 0 || box.x + box.w > FIELD || box.y + box.h > FIELD) {
      return true;
    }
    const x0 = Math.floor(box.x / TILE);
    const y0 = Math.floor(box.y / TILE);
    const x1 = Math.floor((box.x + box.w - 0.001) / TILE);
    const y1 = Math.floor((box.y + box.h - 0.001) / TILE);
    for (let yy = y0; yy <= y1; yy += 1) {
      for (let xx = x0; xx <= x1; xx += 1) {
        if (map[yy] && solidForTank(map[yy][xx])) return true;
      }
    }
    return false;
  }

  function tankHitsTank(t, x, y) {
    const box = tankBox(t, x, y);
    const all = [];
    for (const p of players) {
      if (p.active) all.push(p);
    }
    for (const enemy of enemies) {
      if (enemy.alive) all.push(enemy);
    }
    for (const other of all) {
      if (other === t) continue;
      if (overlaps(box, tankBox(other))) return true;
    }
    return false;
  }

  function canOccupy(t, x, y) {
    return !tankHitsTerrain(t, x, y) && !tankHitsTank(t, x, y);
  }

  function tryMove(t, dx, dy, assist = false) {
    if (canOccupy(t, t.x + dx, t.y + dy)) {
      t.x += dx;
      t.y += dy;
      return true;
    }

    if (!assist) return false;

    // Gentle lane assist keeps a 26px tank from snagging on 32px corridors.
    if (dx !== 0) {
      const lane = nearestLane(t.y);
      const delta = lane - t.y;
      if (Math.abs(delta) > 0.25 && Math.abs(delta) <= 2.4) {
        const step = Math.sign(delta) * Math.min(1.3, Math.abs(delta));
        const candidateY = t.y + step;
        if (canOccupy(t, t.x, candidateY) && canOccupy(t, t.x + dx, candidateY)) {
          t.y = candidateY;
          t.x += dx;
          return true;
        }
      }
    } else if (dy !== 0) {
      const lane = nearestLane(t.x);
      const delta = lane - t.x;
      if (Math.abs(delta) > 0.25 && Math.abs(delta) <= 2.4) {
        const step = Math.sign(delta) * Math.min(1.3, Math.abs(delta));
        const candidateX = t.x + step;
        if (canOccupy(t, candidateX, t.y) && canOccupy(t, candidateX, t.y + dy)) {
          t.x = candidateX;
          t.y += dy;
          return true;
        }
      }
    }
    return false;
  }

  function snapToLane(t, dir) {
    let nx = t.x;
    let ny = t.y;
    if (dir === "up" || dir === "down") {
      const lane = nearestLane(t.x);
      if (Math.abs(lane - t.x) <= 6) nx = lane;
    } else {
      const lane = nearestLane(t.y);
      if (Math.abs(lane - t.y) <= 6) ny = lane;
    }
    if (canOccupy(t, nx, ny)) {
      t.x = nx;
      t.y = ny;
    }
  }

  function ensureNavCache() {
    if (navCacheVersion === navVersion) return;
    for (let cy = 0; cy < CROWS; cy += 1) {
      for (let cx = 0; cx < CCOLS; cx += 1) {
        let blocked = false;
        for (let dy = 0; dy < 2 && !blocked; dy += 1) {
          for (let dx = 0; dx < 2; dx += 1) {
            if (solidForPath(map[cy * 2 + dy][cx * 2 + dx])) {
              blocked = true;
              break;
            }
          }
        }
        navBlocked[cy * CCOLS + cx] = blocked ? 1 : 0;
      }
    }
    navCacheVersion = navVersion;
  }

  function coarseBlocked(cx, cy) {
    if (cx < 0 || cy < 0 || cx >= CCOLS || cy >= CROWS) return true;
    ensureNavCache();
    return navBlocked[cy * CCOLS + cx] === 1;
  }

  function bfsPath(startX, startY, goalX, goalY) {
    if (coarseBlocked(startX, startY)) return null;
    if (coarseBlocked(goalX, goalY)) return null;

    const size = CCOLS * CROWS;
    const prev = new Int16Array(size).fill(-1);
    const seen = new Uint8Array(size);
    const queue = [startY * CCOLS + startX];
    seen[startY * CCOLS + startX] = 1;
    const goalIndex = goalY * CCOLS + goalX;
    let headed = 0;

    while (headed < queue.length) {
      const current = queue[headed];
      headed += 1;
      if (current === goalIndex) break;
      const cx = current % CCOLS;
      const cy = Math.floor(current / CCOLS);
      const neighbors = [[cx, cy - 1], [cx + 1, cy], [cx, cy + 1], [cx - 1, cy]];
      for (const [nx, ny] of neighbors) {
        if (nx < 0 || ny < 0 || nx >= CCOLS || ny >= CROWS) continue;
        const index = ny * CCOLS + nx;
        if (seen[index] || coarseBlocked(nx, ny)) continue;
        seen[index] = 1;
        prev[index] = current;
        queue.push(index);
      }
    }

    if (!seen[goalIndex]) return null;
    const path = [];
    let current = goalIndex;
    while (current !== startY * CCOLS + startX) {
      path.push({
        x: (current % CCOLS) * COARSE + COARSE / 2,
        y: Math.floor(current / CCOLS) * COARSE + COARSE / 2,
      });
      current = prev[current];
      if (current < 0) return null;
    }
    path.reverse();
    return path;
  }

  function pathToNearestBase(startX, startY) {
    if (coarseBlocked(startX, startY)) return null;

    const size = CCOLS * CROWS;
    const prev = new Int16Array(size).fill(-1);
    const seen = new Uint8Array(size);
    const queue = [startY * CCOLS + startX];
    seen[startY * CCOLS + startX] = 1;
    let headed = 0;
    let best = startY * CCOLS + startX;
    let bestDistance = Infinity;

    while (headed < queue.length) {
      const current = queue[headed];
      headed += 1;
      const cx = current % CCOLS;
      const cy = Math.floor(current / CCOLS);
      const distance = Math.hypot(cx - BASE_COARSE.x, cy - BASE_COARSE.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = current;
      }
      const neighbors = [[cx, cy - 1], [cx + 1, cy], [cx, cy + 1], [cx - 1, cy]];
      for (const [nx, ny] of neighbors) {
        if (nx < 0 || ny < 0 || nx >= CCOLS || ny >= CROWS) continue;
        const index = ny * CCOLS + nx;
        if (seen[index] || coarseBlocked(nx, ny)) continue;
        seen[index] = 1;
        prev[index] = current;
        queue.push(index);
      }
    }

    const path = [];
    let current = best;
    const startIndex = startY * CCOLS + startX;
    while (current !== startIndex && current >= 0) {
      path.push({
        x: (current % CCOLS) * COARSE + COARSE / 2,
        y: Math.floor(current / CCOLS) * COARSE + COARSE / 2,
      });
      current = prev[current];
    }
    path.reverse();
    return path;
  }

  function wanderPath(startX, startY) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const goalX = randInt(0, CCOLS - 1);
      const goalY = randInt(0, CROWS - 1);
      if ((goalX === startX && goalY === startY) || coarseBlocked(goalX, goalY)) continue;
      const path = bfsPath(startX, startY, goalX, goalY);
      if (path && path.length > 0) return path;
    }
    return null;
  }

  function chooseEnemyPath(enemy) {
    const startX = coarseOf(enemy.x);
    const startY = coarseOf(enemy.y);
    // Like the NES, early bots wander; pressure on the base ramps up over
    // the first minute of play. This gives the player room to learn the map.
    const attackChance = 0.3 + Math.min(0.45, (stateTime / 60000) * 0.45);

    if (Math.random() < attackChance) {
      const basePath = pathToNearestBase(startX, startY);
      if (basePath) {
        enemy.path = basePath;
        enemy.pathIndex = 0;
        return;
      }
    }

    const targets = activePlayers();
    if (targets.length && Math.random() < 0.55) {
      const target = targets[randInt(0, targets.length - 1)];
      const px = coarseOf(target.x);
      const py = coarseOf(target.y);
      const chase = bfsPath(startX, startY, px, py);
      if (chase) {
        enemy.path = chase;
        enemy.pathIndex = 0;
        return;
      }
    }

    enemy.path = wanderPath(startX, startY);
    enemy.pathIndex = 0;
  }

  // ---------------------------------------------------------------------------
  // Gameplay update
  // ---------------------------------------------------------------------------

  function updatePlaying(dt) {
    stateTime += dt;

    // DUSK can end early: lose the last tank and the run goes straight to the
    // epilogue instead of a GAME OVER screen. A short beat lets the explosion
    // land before the overlay fades in.
    if (endingTrigger) {
      endingTrigger.t -= dt;
      updateEffects(dt);
      if (endingTrigger.t <= 0) beginEnding();
      return;
    }

    // The last minute of DUSK. This runs before input/targeting/AI so nothing
    // the player does can postpone it.
    if (stageConfig.finaleAt && !finale && stateTime >= stageConfig.finaleAt) {
      startFinale();
    }
    if (finale) {
      updateFinale(dt);
      return;
    }

    updateSkillTimers(dt);

    if (targeting) {
      const owner = players[targeting.ownerIndex];
      if (!owner || !owner.active) {
        cancelTargeting(false, true);
      } else {
        updateTargeting(dt);
      }
    }

    const coop = players.length > 1;
    const tacticalAim = Boolean(targeting);
    if (tacticalAim && !coop) {
      const owner = players[targeting.ownerIndex];
      owner.shield = Math.max(0, owner.shield - dt);
      owner.cooldown = Math.max(0, owner.cooldown - dt);
      owner.moving = false;

      // Single-player tactical time dilation freezes the whole battlefield.
      updateEnemies(dt * TARGET_SLOW);
      if (state !== "playing") return;
      updateBullets(dt * TARGET_SLOW);
      if (state !== "playing") return;
      updateEffects(dt * TARGET_SLOW);

      enemies = enemies.filter((enemy) => enemy.alive);
      bullets = bullets.filter((bullet) => bullet.alive);

      if (campaignCleared()) stageClear();
      return;
    }

    for (const p of players) {
      if (!p.active) {
        updatePlayerRespawn(p, dt);
        continue;
      }
      if (targeting && targeting.ownerIndex === p.index) {
        p.shield = Math.max(0, p.shield - dt);
        p.cooldown = Math.max(0, p.cooldown - dt);
        p.moving = false;
        continue;
      }
      updatePlayer(p, dt);
    }

    if (state !== "playing") return;
    if (tacticalAim) {
      // Co-op tactical aim (mind link / blink): the enemy army and its shells
      // drop to 0.12x, while the other player keeps full speed. Only the
      // aiming player's tank is frozen.
      updateEnemies(dt * TARGET_SLOW);
      if (state !== "playing") return;
      updateBullets(dt, TARGET_SLOW);
      if (state !== "playing") return;
      updateEffects(dt);
    } else {
      updateEnemies(dt);
      if (state !== "playing") return;
      updateBullets(dt);
      if (state !== "playing") return;
      updateSpawner(dt);
      updatePowerups(dt);
      updateEffects(dt);
    }

    enemies = enemies.filter((enemy) => enemy.alive);
    bullets = bullets.filter((bullet) => bullet.alive);

    if (campaignCleared()) stageClear();
  }

  function updatePlayerRespawn(p, dt) {
    if (p.out || p.active || p.respawnTimer <= 0) return;
    p.respawnTimer -= dt;
    if (p.respawnTimer > 0) return;
    const spawn = PLAYER_SPAWNS[p.index] || PLAYER_SPAWNS[0];
    p.x = spawn.x;
    p.y = spawn.y;
    p.dir = "up";
    if (canOccupy(p, p.x, p.y)) {
      p.active = true;
      p.shield = 3;
      p.moving = false;
      audio.sfx("life");
    } else {
      p.respawnTimer = 0.3;
    }
  }

  function updatePlayer(p, dt) {
    if (!p || !p.active) return;
    const input = inputs[p.index];
    p.cooldown = Math.max(0, p.cooldown - dt);
    p.shield = Math.max(0, p.shield - dt);
    p.moving = false;

    const dir = currentDir(p.index);
    if (dir) {
      if (dir !== p.dir) {
        p.dir = dir;
        snapToLane(p, dir);
      }
      const vector = DIRS[dir];
      p.moving = tryMove(
        p,
        vector.x * p.speed * dt,
        vector.y * p.speed * dt,
        true
      );
    }

    if (input.fire && p.cooldown <= 0) {
      const tier = p.fireTier;
      const bulletCap = tier === 0 ? 1 : tier === 1 ? 2 : 3;
      const active = bullets.filter((b) => b.alive && b.source === p).length;
      if (active < bulletCap) {
        const speed = tier === 0 ? 300 : tier === 1 ? 330 : 365;
        fireBullet(p, p.dir, "player", speed, tier === 2 ? 2 : 1, p);
        p.cooldown = tier === 0 ? 0.38 : tier === 1 ? 0.29 : 0.21;
        audio.sfx("shoot");
      } else {
        p.cooldown = 0.08;
      }
    }
  }

  function updateSkillTimers(dt) {
    for (const p of players) {
      for (const id of Object.keys(p.skills)) {
        p.skills[id].cooldown = Math.max(0, p.skills[id].cooldown - dt);
        if (p.skills[id].active > 0) {
          p.skills[id].active = Math.max(0, p.skills[id].active - dt);
        }
      }
      if (!p.active) {
        p.skills.magnet.active = 0;
        p.skills.teleport.active = 0;
      }
    }
  }

  function findMindTarget(owner) {
    if (!owner) return null;
    let best = null;
    let bestDistance = Infinity;
    for (const enemy of enemies) {
      if (!enemy.alive || enemy.charmed) continue;
      const distance = Math.hypot(enemy.x - owner.x, enemy.y - owner.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = enemy;
      }
    }
    return best;
  }

  function nearestEnemyToPoint(x, y, maxDistance = 30) {
    let best = null;
    let bestDistance = maxDistance;
    for (const enemy of enemies) {
      if (!enemy.alive || enemy.charmed) continue;
      const distance = Math.hypot(enemy.x - x, enemy.y - y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = enemy;
      }
    }
    return best;
  }

  function isValidTeleportSpot(owner, x, y) {
    if (!owner) return false;
    const definition = SKILL_DEFS.teleport;
    const distance = Math.hypot(x - owner.x, y - owner.y);
    if (distance < 24 || distance > definition.distance) return false;
    if (
      x < TANK_HIT / 2 || y < TANK_HIT / 2 ||
      x > FIELD - TANK_HIT / 2 || y > FIELD - TANK_HIT / 2
    ) {
      return false;
    }
    return canOccupy(owner, x, y);
  }

  function findNearbyTeleportSpot(owner, x, y, maxSnap = 32) {
    if (isValidTeleportSpot(owner, x, y)) return { x, y };
    for (let radius = 4; radius <= maxSnap; radius += 4) {
      for (let i = 0; i < 12; i += 1) {
        const angle = (Math.PI * 2 * i) / 12;
        const px = x + Math.cos(angle) * radius;
        const py = y + Math.sin(angle) * radius;
        if (isValidTeleportSpot(owner, px, py)) return { x: px, y: py };
      }
    }
    return null;
  }

  function findAnyTeleportSpot(owner) {
    if (!owner) return null;
    const definition = SKILL_DEFS.teleport;
    const facing = Math.atan2(DIRS[owner.dir].y, DIRS[owner.dir].x);
    const offsets = [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6, 7, -7, 8];
    for (const offset of offsets) {
      const angle = facing + offset * (Math.PI / 8);
      for (let distance = definition.distance; distance >= 32; distance -= 8) {
        const x = owner.x + Math.cos(angle) * distance;
        const y = owner.y + Math.sin(angle) * distance;
        if (isValidTeleportSpot(owner, x, y)) return { x, y };
      }
    }
    return null;
  }

  function targetingOwner() {
    return targeting ? players[targeting.ownerIndex] : null;
  }

  function clampTargetingReticle(x, y) {
    let nextX = clamp(x, TANK_HIT / 2, FIELD - TANK_HIT / 2);
    let nextY = clamp(y, TANK_HIT / 2, FIELD - TANK_HIT / 2);
    const owner = targetingOwner();
    if (targeting && targeting.skill === "teleport" && owner) {
      const dx = nextX - owner.x;
      const dy = nextY - owner.y;
      const distance = Math.hypot(dx, dy);
      const maxDistance = SKILL_DEFS.teleport.distance;
      if (distance > maxDistance) {
        nextX = owner.x + (dx / distance) * maxDistance;
        nextY = owner.y + (dy / distance) * maxDistance;
      }
    }
    return { x: nextX, y: nextY };
  }

  function refreshTargeting() {
    const owner = targetingOwner();
    if (!targeting || !owner) return;
    if (targeting.skill === "mind") {
      const nextTarget = nearestEnemyToPoint(targeting.reticle.x, targeting.reticle.y, 30);
      if (nextTarget && nextTarget !== targeting.target) audio.sfx("lock");
      targeting.target = nextTarget;
      targeting.valid = Boolean(nextTarget);
    } else {
      const landing = findNearbyTeleportSpot(owner, targeting.reticle.x, targeting.reticle.y, 32);
      targeting.landing = landing;
      targeting.valid = Boolean(landing);
    }
  }

  function setTargetingReticle(x, y) {
    if (!targeting) return;
    const point = clampTargetingReticle(x, y);
    targeting.reticle.x = point.x;
    targeting.reticle.y = point.y;
    refreshTargeting();
  }

  function updateTargeting(dt) {
    if (!targeting) return;
    const owner = targetingOwner();
    if (!owner) return;
    targeting.timer -= dt;
    if (targeting.timer <= 0) {
      cancelTargeting(true);
      return;
    }

    const input = inputs[owner.index];
    const dx = (input.counts.right > 0 ? 1 : 0) - (input.counts.left > 0 ? 1 : 0);
    const dy = (input.counts.down > 0 ? 1 : 0) - (input.counts.up > 0 ? 1 : 0);
    if (dx !== 0 || dy !== 0) {
      const length = Math.hypot(dx, dy);
      const speed = 220;
      setTargetingReticle(
        targeting.reticle.x + (dx / length) * speed * dt,
        targeting.reticle.y + (dy / length) * speed * dt
      );
    } else {
      refreshTargeting();
    }
  }

  function stopPlayerInput(playerIndex) {
    const input = inputs[playerIndex];
    if (input) {
      input.order = [];
      input.counts = { up: 0, down: 0, left: 0, right: 0 };
      input.fire = false;
    }
    for (const scheme of [PLAYER_KEYS[playerIndex]]) {
      if (!scheme) continue;
      for (const codes of Object.values(scheme.dirs)) {
        for (const code of codes) heldKeys.delete(code);
      }
      for (const code of scheme.fire) heldKeys.delete(code);
    }
  }

  function enterTargeting(playerIndex, id) {
    const owner = players[playerIndex];
    if (state !== "playing" || !owner || !owner.active || targeting) return false;
    const definition = SKILL_DEFS[id];
    const skill = owner.skills[id];
    if (!definition || !skill || skill.cooldown > 0) {
      audio.sfx("uiDenied");
      return false;
    }

    if (id === "mind") {
      const target = findMindTarget(owner);
      if (!target) {
        audio.sfx("uiDenied");
        addPopup(owner.x, owner.y - 28, "无目标", definition.color);
        pulseSkillButton(playerIndex, id);
        return false;
      }
      targeting = {
        skill: id,
        ownerIndex: playerIndex,
        timer: TARGETING_DURATION,
        reticle: { x: target.x, y: target.y },
        target,
        valid: true,
      };
    } else if (id === "teleport") {
      const spot = findAnyTeleportSpot(owner);
      if (!spot) {
        audio.sfx("uiDenied");
        addPopup(owner.x, owner.y - 28, "无落点", definition.color);
        pulseSkillButton(playerIndex, id);
        return false;
      }
      targeting = {
        skill: id,
        ownerIndex: playerIndex,
        timer: TARGETING_DURATION,
        reticle: { x: spot.x, y: spot.y },
        target: null,
        landing: spot,
        valid: true,
      };
    } else {
      return false;
    }

    // The cooldown is committed only when the selection is confirmed, so a
    // canceled aim does not burn the skill.
    stopPlayerInput(playerIndex);
    showTargetHint(id, owner);
    audio.sfx("skillAim");
    syncSkillUI(true);
    return true;
  }

  function confirmTargeting() {
    if (!targeting || state !== "playing") return false;
    const owner = players[targeting.ownerIndex];
    if (!owner || !owner.active) {
      cancelTargeting(false, true);
      return false;
    }
    const definition = SKILL_DEFS[targeting.skill];
    const skill = owner.skills[targeting.skill];

    if (targeting.skill === "mind") {
      const target = targeting.target;
      if (!target || !target.alive || target.charmed) {
        audio.sfx("uiDenied");
        addPopup(
          clamp(targeting.reticle.x, 60, FIELD - 60),
          targeting.reticle.y - 20,
          "请选择目标",
          definition.color
        );
        return false;
      }

      skill.cooldown = definition.cooldown;
      targeting = null;
      stopPlayerInput(owner.index);
      hideTargetHint();
      convertEnemy(target, owner);
      skill.mind.active = 0.45;
      spawnSkillBurst(owner.x, owner.y, definition.color, 12);
      addPopup(owner.x, owner.y - 30, definition.callout, definition.color);
      audio.sfx(definition.sfx);
      flashAlpha = Math.max(flashAlpha, 0.12);
      syncSkillUI(true);
      return true;
    }

    const spot = targeting.landing || findNearbyTeleportSpot(
      owner,
      targeting.reticle.x,
      targeting.reticle.y,
      32
    );
    if (!spot) {
      audio.sfx("uiDenied");
      addPopup(
        clamp(targeting.reticle.x, 50, FIELD - 50),
        targeting.reticle.y - 20,
        "无落点",
        "#ff8f7a"
      );
      return false;
    }

    const origin = {
      x: owner.x,
      y: owner.y,
      dir: owner.dir,
      fireTier: owner.fireTier,
      ownerIndex: owner.index,
    };
    skill.cooldown = definition.cooldown;
    targeting = null;
    stopPlayerInput(owner.index);
    hideTargetHint();
    owner.x = spot.x;
    owner.y = spot.y;
    owner.shield = Math.max(owner.shield, 1);
    teleportGhosts.push({ ...origin, life: 0.36, maxLife: 0.36 });
    skill.teleport.active = definition.duration;
    spawnSkillBurst(origin.x, origin.y, definition.color, 18);
    spawnSkillBurst(spot.x, spot.y, definition.color, 24);
    addPopup(spot.x, spot.y - 30, definition.callout, definition.color);
    shake = Math.max(shake, 3);
    flashAlpha = Math.max(flashAlpha, 0.2);
    audio.sfx(definition.sfx);
    syncSkillUI(true);
    return true;
  }

  function showTargetHint(skill, owner) {
    const label = owner ? owner.label : "P1";
    const coop = players.length > 1;
    targetHintEl.hidden = false;
    targetHintEl.dataset.skill = skill;
    if (skill === "mind") {
      targetHintTextEl.textContent = coop
        ? `${label} 瞄准中 · 战场不会减速。方向键移动准星，Space / Enter / 点击目标确认；Esc 取消。`
        : "敌军减速 88%。方向键 / 十字键移动准星，空格 / 点击目标 / FIRE 确认；Esc 或再点技能卡取消。";
    } else {
      targetHintTextEl.textContent = coop
        ? `${label} 瞄准中 · 战场不会减速。方向键选择落点，Space / Enter / 点击地面确认；Esc 取消。`
        : "敌军减速 88%。方向键 / 十字键选择落点，空格 / 点击地面 / FIRE 确认；Esc 或再点技能卡取消。";
    }
  }

  function hideTargetHint() {
    targetHintEl.hidden = true;
    targetHintTextEl.textContent = "";
    targetHintEl.removeAttribute("data-skill");
  }

  function cancelTargeting(showMessage = false, silent = false) {
    if (!targeting) return;
    const definition = SKILL_DEFS[targeting.skill];
    const reticle = { ...targeting.reticle };
    const owner = players[targeting.ownerIndex];
    targeting = null;
    if (owner) stopPlayerInput(owner.index);
    hideTargetHint();
    if (!silent) audio.sfx("ui");
    if (showMessage && owner) {
      addPopup(
        clamp(reticle.x, 60, FIELD - 60),
        clamp(reticle.y - 20, 14, FIELD - 20),
        "AIM END",
        definition.color
      );
    }
    syncSkillUI(true);
  }

  function convertEnemy(target, owner) {
    if (!target || !target.alive || target.charmed) return;
    target.charmed = true;
    target.ally = true;
    target.owner = owner || null;
    target.ownerIndex = owner ? owner.index : 0;
    target.hp = target.maxHp;
    target.path = null;
    target.pathIndex = 0;
    target.repathTimer = 0;
    target.stuck = 0;
    target.fireTimer = 0.35;
    target.aimTimer = 0;
    target.baseCooldown = 0;
    converted += 1;
    addPopup(target.x, target.y - 22, "已策反", SKILL_DEFS.mind.color);
    spawnSkillBurst(target.x, target.y, SKILL_DEFS.mind.color, 24);
  }

  function activateSkill(playerIndex, id) {
    const owner = players[playerIndex];
    if (state !== "playing" || !owner || !owner.active) return false;
    if (targeting) {
      if (targeting.ownerIndex === playerIndex) return false;
      // The other player can still use the non-aiming magnet field, but only
      // one tactical aim can exist at a time.
      if (id === "mind" || id === "teleport") return false;
    }
    const definition = SKILL_DEFS[id];
    const skill = owner.skills[id];
    if (!definition || !skill || skill.cooldown > 0) {
      audio.sfx("uiDenied");
      return false;
    }

    if (id === "mind" || id === "teleport") {
      return enterTargeting(playerIndex, id);
    }

    skill.cooldown = definition.cooldown;
    skill.active = definition.duration;
    spawnSkillBurst(owner.x, owner.y, definition.color);
    addPopup(owner.x, owner.y - 30, definition.callout, definition.color);
    audio.sfx(definition.sfx);
    flashAlpha = Math.max(flashAlpha, 0.12);
    syncSkillUI(true);
    return true;
  }

  function pulseSkillButton(playerIndex, id) {
    const button = skillButtons.find(
      (item) => Number(item.dataset.player) === playerIndex && item.dataset.skill === id
    );
    if (!button) return;
    button.classList.remove("is-denied");
    void button.offsetWidth;
    button.classList.add("is-denied");
    window.setTimeout(() => button.classList.remove("is-denied"), 260);
  }

  function clearActiveSkills() {
    for (const p of players) {
      p.skills.magnet.active = 0;
      p.skills.mind.active = 0;
      p.skills.teleport.active = 0;
    }
    syncSkillUI(true);
  }

  function clearPlayerActiveSkills(p) {
    if (!p) return;
    p.skills.magnet.active = 0;
    p.skills.mind.active = 0;
    p.skills.teleport.active = 0;
  }

  function spawnSkillBurst(x, y, color, count = 18) {
    for (let i = 0; i < count; i += 1) {
      const angle = (Math.PI * 2 * i) / count + rand(-0.08, 0.08);
      const speed = rand(25, 95);
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        gravity: 0,
        drag: 0.93,
        life: rand(0.24, 0.55),
        maxLife: 0.55,
        size: Math.random() < 0.5 ? 1 : 2,
        color: Math.random() < 0.3 ? "#f2efd9" : color,
      });
    }
  }

  function absorbEnemyBullet(bullet, owner) {
    bullet.alive = false;
    if (owner) {
      owner.score += 5;
      refreshTeamScore();
    }
    spawnSparks(bullet.x, bullet.y, SKILL_DEFS.magnet.color, 4);
  }

  function syncSkillUI(force = false) {
    const rows = [];
    for (const p of players) {
      const onField = state === "playing" && !finale && !endingTrigger && p.active && !p.out;
      const aimingSkill = targeting && targeting.ownerIndex === p.index ? targeting.skill : null;
      rows.push(`${p.index}:${onField ? 1 : 0}:${aimingSkill || ""}`);
      for (const id of Object.keys(SKILL_DEFS)) {
        const cooling = p.skills[id].cooldown;
        const active = p.skills[id].active;
        const coolBucket = cooling > 0 ? Math.ceil(cooling * 20) : 0;
        const activeBucket = active > 0 ? Math.ceil(active * 20) : 0;
        rows.push(`${p.index}:${id}:${coolBucket}:${activeBucket}`);
      }
    }
    const targetingBucket = targeting
      ? `${targeting.ownerIndex}:${targeting.skill}:${Math.ceil(targeting.timer * 20)}`
      : "";
    const signature = `${state}|${players.length}|${targetingBucket}|${rows.join("|")}`;
    if (!force && signature === skillUiSignature) return;
    skillUiSignature = signature;

    for (const button of skillButtons) {
      const playerIndex = Number(button.dataset.player) || 0;
      const p = players[playerIndex];
      const id = button.dataset.skill;
      const definition = SKILL_DEFS[id];
      if (!definition) continue;
      const onField = state === "playing" && !finale && !endingTrigger && p && p.active && !p.out;
      const aimingSkill = targeting && targeting.ownerIndex === playerIndex ? targeting.skill : null;
      const otherAim = Boolean(targeting && targeting.ownerIndex !== playerIndex);
      const cooling = p ? p.skills[id].cooldown : 0;
      const active = p ? p.skills[id].active : 0;
      const targetingSkill = id === "mind" || id === "teleport";
      const blockedByOtherAim = otherAim && targetingSkill;
      const ready = onField && cooling <= 0 && !blockedByOtherAim;
      const timer = button.querySelector("[data-skill-timer]");

      if (aimingSkill === id) {
        button.disabled = !onField;
        button.classList.remove("is-ready", "is-suspended");
        button.classList.add("is-active");
        button.style.setProperty(
          "--charge",
          String(clamp(targeting.timer / TARGETING_DURATION, 0, 1))
        );
        button.style.setProperty("--cool", "0");
        if (timer) timer.textContent = "AIM";
        continue;
      }

      button.disabled = !onField || cooling > 0 || Boolean(aimingSkill) || blockedByOtherAim;
      button.classList.toggle("is-ready", ready && active <= 0);
      button.classList.toggle("is-active", active > 0);
      button.classList.toggle("is-suspended", Boolean(aimingSkill) || blockedByOtherAim);
      button.style.setProperty("--charge", String(clamp(1 - cooling / definition.cooldown, 0, 1)));
      button.style.setProperty("--cool", String(cooling > 0 && active <= 0 ? 0.48 : 0));
      if (timer) {
        timer.textContent = active > 0
          ? "LIVE"
          : cooling > 0
            ? `${Math.ceil(cooling)}S`
            : !onField
              ? "OFF"
              : aimingSkill
                ? "WAIT"
                : blockedByOtherAim
                  ? "WAIT"
                  : "READY";
      }
    }
  }

  function buildStatPips() {
    const make = (parent, count, target) => {
      parent.replaceChildren();
      target.length = 0;
      for (let i = 0; i < count; i += 1) {
        const pip = document.createElement("span");
        pip.className = "pip";
        parent.appendChild(pip);
        target.push(pip);
      }
    };
    make(enemyPipsEl, MAX_ENEMY_SLOTS, enemyPipEls);
    for (let i = 0; i < 2; i += 1) {
      make(livesPipsEls[i], PLAYER_LIVES, lifePipEls[i]);
      make(gunPipsEls[i], 3, gunPipEls[i]);
    }
  }

  function syncStatsUI(force = false) {
    const remaining = Math.max(0, totalEnemies - killed - converted);
    const endless = Boolean(stageConfig.endless);
    const p1 = players[0] || null;
    const p2 = players[1] || null;
    const coop = selectedPlayerCount > 1;
    if (p2ScoreBlockEl) p2ScoreBlockEl.hidden = !coop;
    if (p2PlayerRowEl) p2PlayerRowEl.hidden = !coop;
    if (p2AbilityDeckEl) p2AbilityDeckEl.hidden = !coop;
    const baseAlive = Boolean(base && base.alive);
    const signature = `${state}|${currentStage}|${totalEnemies}|${score}|${remaining}|${p1?.score || 0}|${p1?.lives || 0}|${p1?.fireTier || 0}|${p2?.score || 0}|${p2?.lives || 0}|${p2?.fireTier || 0}|${baseAlive}|${highScore}|${endless}|${selectedPlayerCount}`;
    if (!force && signature === statsUiSignature) return;
    statsUiSignature = signature;

    if (statScoreP1El) statScoreP1El.textContent = padScore(p1 ? p1.score : 0);
    if (statScoreP2El) statScoreP2El.textContent = padScore(p2 ? p2.score : 0);
    if (statEnemyEl) {
      statEnemyEl.textContent = endless ? "∞" : String(remaining).padStart(2, "0");
      statEnemyEl.classList.toggle("is-endless", endless);
    }
    if (statStageEl) statStageEl.textContent = String(currentStage).padStart(2, "0");
    if (missionTextEl) missionTextEl.textContent = stageConfig.mission || "守住基地 · 击毁或策反";
    if (missionEnemyEl) {
      missionEnemyEl.textContent = endless ? "∞" : String(totalEnemies);
      missionEnemyEl.hidden = Boolean(stageConfig.missionHideCount);
    }
    if (missionUnitEl) {
      missionUnitEl.textContent = stageConfig.missionUnit || "";
      missionUnitEl.hidden = Boolean(stageConfig.missionHideCount);
    }
    if (railStageLabelEl) {
      railStageLabelEl.textContent = `STAGE ${String(currentStage).padStart(2, "0")} / ${stageConfig.name}`;
    }
    if (statBaseEl) {
      statBaseEl.textContent = baseAlive ? "ONLINE" : "LOST";
      statBaseEl.classList.toggle("is-alert", !baseAlive);
    }
    if (highScoreEl) highScoreEl.textContent = padScore(highScore);

    enemyPipEls.forEach((pip, i) => {
      pip.hidden = endless || i >= totalEnemies;
      pip.classList.toggle("is-on", !endless && i < remaining);
    });
    [p1, p2].forEach((p, index) => {
      const tier = p ? p.fireTier : 0;
      lifePipEls[index].forEach((pip, i) => pip.classList.toggle("is-on", p && i < p.lives));
      gunPipEls[index].forEach((pip, i) => pip.classList.toggle("is-on", p && i <= tier));
    });
  }

  function updateEnemies(dt) {
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      enemy.fireTimer -= dt;
      enemy.aimTimer -= dt;
      enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
      enemy.repathTimer -= dt;
      enemy.stuck = Math.max(0, enemy.stuck - dt * 0.6);
      enemy.baseCooldown = Math.max(0, enemy.baseCooldown - dt);

      if (enemy.charmed) {
        updateAlly(enemy, dt);
        continue;
      }

      let magnetOwner = null;
      for (const p of activePlayers()) {
        if (p.skills.magnet.active <= 0) continue;
        if (Math.hypot(enemy.x - p.x, enemy.y - p.y) < SKILL_DEFS.magnet.radius) {
          magnetOwner = p;
          break;
        }
      }
      if (magnetOwner) {
        pullEnemyTowardPlayer(enemy, magnetOwner, dt);
        enemy.path = null;
        enemy.aimTimer = 0;
        enemy.fireTimer = Math.max(enemy.fireTimer, 0.24);
        continue;
      }

      if (enemy.aimTimer > 0) {
        continue;
      }

      if (!enemy.path || enemy.repathTimer <= 0) {
        chooseEnemyPath(enemy);
        enemy.repathTimer = rand(1.1, 2.3);
      }

      followPath(enemy, dt);

      if (enemy.fireTimer <= 0 && enemyBulletCount(enemy) < 1) {
        updateEnemyAimAndFire(enemy);
      }
    }
  }

  function followPath(unit, dt) {
    if (!unit.path || unit.pathIndex >= unit.path.length) return false;
    const waypoint = unit.path[unit.pathIndex];
    const dx = waypoint.x - unit.x;
    const dy = waypoint.y - unit.y;
    if (Math.abs(dx) < 1.8 && Math.abs(dy) < 1.8) {
      unit.pathIndex += 1;
      return false;
    }

    const axisOptions = Math.abs(dx) >= Math.abs(dy) ? ["x", "y"] : ["y", "x"];
    for (const axis of axisOptions) {
      if (axis === "x" && Math.abs(dx) > 1) {
        const step = Math.sign(dx) * Math.min(Math.abs(dx), unit.speed * dt);
        if (tryMove(unit, step, 0, false)) {
          unit.dir = dx > 0 ? "right" : "left";
          return true;
        }
      } else if (axis === "y" && Math.abs(dy) > 1) {
        const step = Math.sign(dy) * Math.min(Math.abs(dy), unit.speed * dt);
        if (tryMove(unit, 0, step, false)) {
          unit.dir = dy > 0 ? "down" : "up";
          return true;
        }
      }
    }

    unit.stuck += dt;
    if (unit.stuck > 0.18) {
      unit.path = null;
      unit.stuck = 0;
      unit.repathTimer = 0.2;
    }
    return false;
  }

  function pullEnemyTowardPlayer(enemy, owner, dt) {
    if (!owner) return;
    const dx = owner.x - enemy.x;
    const dy = owner.y - enemy.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= 38) return;
    const step = Math.min(distance - 38, 72 * dt);
    const vx = (dx / distance) * step;
    const vy = (dy / distance) * step;
    if (Math.abs(vx) >= Math.abs(vy)) {
      if (!tryMove(enemy, vx, 0, false)) tryMove(enemy, 0, vy, false);
      enemy.dir = vx >= 0 ? "right" : "left";
    } else {
      if (!tryMove(enemy, 0, vy, false)) tryMove(enemy, vx, 0, false);
      enemy.dir = vy >= 0 ? "down" : "up";
    }
    enemy.stuck = 0;
  }

  function updateAlly(ally, dt) {
    let target = null;
    let bestDistance = Infinity;
    for (const other of enemies) {
      if (other === ally || !other.alive || other.charmed) continue;
      const distance = Math.hypot(other.x - ally.x, other.y - ally.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        target = other;
      }
    }

    if (!target) {
      ally.fireTimer = Math.min(ally.fireTimer, 0.5);
      return;
    }

    if (!ally.path || ally.repathTimer <= 0 || (ally.path.length > 0 && ally.pathIndex >= ally.path.length)) {
      const startX = coarseOf(ally.x);
      const startY = coarseOf(ally.y);
      const path = bfsPath(startX, startY, coarseOf(target.x), coarseOf(target.y));
      ally.path = path || wanderPath(startX, startY);
      ally.pathIndex = 0;
      ally.repathTimer = rand(1.1, 2.1);
    }

    followPath(ally, dt);

    const dx = target.x - ally.x;
    const dy = target.y - ally.y;
    const distance = Math.hypot(dx, dy);
    if (ally.fireTimer > 0) return;

    let aim = null;
    if (distance < 340) {
      if (Math.abs(dx) < 18) aim = dy > 0 ? "down" : "up";
      else if (Math.abs(dy) < 18) aim = dx > 0 ? "right" : "left";
    }
    if (!aim && Math.random() < 0.24) aim = ally.dir;

    if (aim && enemyBulletCount(ally) < 2) {
      ally.dir = aim;
      fireBullet(ally, aim, "player", 280, 1, ally.owner || players[ally.ownerIndex || 0]);
      ally.fireTimer = rand(0.7, 1.05);
      audio.sfx("mindShot");
    } else {
      ally.fireTimer = 0.2;
    }
  }

  function enemyBulletCount(enemy) {
    return bullets.filter((b) => b.alive && b.source === enemy).length;
  }

  function updateEnemyAimAndFire(enemy) {
    let aim = null;
    const targetPlayer = nearestActivePlayer(enemy.x, enemy.y);

    if (targetPlayer) {
      const dx = targetPlayer.x - enemy.x;
      const dy = targetPlayer.y - enemy.y;
      if (Math.hypot(dx, dy) < 285) {
        if (Math.abs(dx) < 17) aim = dy > 0 ? "down" : "up";
        else if (Math.abs(dy) < 17) aim = dx > 0 ? "right" : "left";
      }
    }

    if (!aim) {
      let allyTarget = null;
      let allyDistance = 300;
      for (const other of enemies) {
        if (!other.alive || !other.charmed) continue;
        const distance = Math.hypot(other.x - enemy.x, other.y - enemy.y);
        if (distance < allyDistance) {
          allyDistance = distance;
          allyTarget = other;
        }
      }
      if (allyTarget) {
        const dx = allyTarget.x - enemy.x;
        const dy = allyTarget.y - enemy.y;
        if (Math.abs(dx) < 17) aim = dy > 0 ? "down" : "up";
        else if (Math.abs(dy) < 17) aim = dx > 0 ? "right" : "left";
      }
    }

    if (!aim && base.alive && enemy.baseCooldown <= 0) {
      const dx = base.x + base.w / 2 - enemy.x;
      const dy = base.y + base.h / 2 - enemy.y;
      if (Math.hypot(dx, dy) < 320) {
        if (Math.abs(dx) < 18) aim = dy > 0 ? "down" : "up";
        else if (Math.abs(dy) < 18) aim = dx > 0 ? "right" : "left";
      }
    }

    if (!aim && enemy.baseCooldown <= 0 && Math.random() < 0.43) {
      aim = enemy.dir;
    }

    if (aim) {
      enemy.dir = aim;
      enemy.aimTimer = 0.24;
      fireBullet(enemy, aim, "enemy", enemy.config.bulletSpeed, 1);
      enemy.fireTimer = rand(enemy.config.fireMin, enemy.config.fireMax);
      audio.sfx("enemyShoot");
    } else {
      enemy.fireTimer = 0.25;
    }
  }

  function registerBasePressure(bullet) {
    if (bullet.side !== "enemy" || !bullet.source || !base.alive) return;
    const bx = base.x + base.w / 2;
    const by = base.y + base.h / 2;
    if (Math.hypot(bullet.x - bx, bullet.y - by) < 112) {
      // Give the defender a beat after a shell opens a hole in the bunker.
      bullet.source.baseCooldown = Math.max(bullet.source.baseCooldown || 0, 2.4);
    }
  }

  function updateSpawner(dt) {
    if (pendingSpawn) {
      pendingSpawn.timer -= dt;
      if (pendingSpawn.timer <= 0) {
        if (!spawnPointBlocked(pendingSpawn.x, pendingSpawn.y)) {
          const type = spawnQueue.shift();
          if (type) {
            enemies.push(makeEnemy(type, pendingSpawn.x, pendingSpawn.y));
          }
          pendingSpawn = null;
          spawnTimer = rand(spawnInterval * 0.75, spawnInterval * 1.1);
        } else {
          // The pad we picked became occupied. Try another free pad instead
          // of retrying the same one forever.
          const alternative = chooseSpawnPoint();
          if (alternative) {
            pendingSpawn.x = alternative.x;
            pendingSpawn.y = alternative.y;
            pendingSpawn.timer = 0.45;
            pendingSpawn.blockedTime = 0;
          } else {
            pendingSpawn.blockedTime = (pendingSpawn.blockedTime || 0) + dt;
            if (pendingSpawn.blockedTime >= 2.5) {
              // The player and/or converted allies are camping every pad.
              // Nudge friendlies off this pad so the campaign cannot deadlock.
              clearSpawnPad(pendingSpawn.x, pendingSpawn.y);
              pendingSpawn.blockedTime = 0;
              pendingSpawn.timer = 0.3;
            } else {
              pendingSpawn.timer = 0.2;
            }
          }
        }
      }
      return;
    }

    spawnTimer -= dt;
    if (spawnTimer > 0) return;
    if (!spawnQueue.length) {
      if (!stageConfig.endless) return;
      // DUSK has no finite enemy roster. Keep the field alive until fate
      // arrives, but never let the reserve grow without bound.
      const types = ["basic", "fast", "power", "armor"];
      for (let i = 0; i < 6; i += 1) {
        spawnQueue.push(types[randInt(0, types.length - 1)]);
      }
    }
    if (enemies.filter((enemy) => enemy.alive && !enemy.charmed).length >= maxActiveEnemies) {
      spawnTimer = 0.5;
      return;
    }

    const point = chooseSpawnPoint();
    if (point) {
      spawnBlockedTime = 0;
      pendingSpawn = {
        x: point.x,
        y: point.y,
        timer: 0.85,
        type: spawnQueue[0],
        blockedTime: 0,
      };
      spawnTimer = spawnInterval + 0.85;
      audio.sfx("spawn");
    } else {
      // Every pad is already occupied before we even picked one. Give the
      // friendlies a short grace period, then clear the next pad.
      spawnBlockedTime += 0.4;
      if (spawnBlockedTime >= 2.4) {
        const pad = SPAWN_POINTS[spawnIndex % SPAWN_POINTS.length];
        clearSpawnPad(pad.x, pad.y);
        spawnBlockedTime = 0;
        spawnTimer = 0.3;
      } else {
        spawnTimer = 0.4;
      }
    }
  }

  function chooseSpawnPoint() {
    for (let attempt = 0; attempt < SPAWN_POINTS.length; attempt += 1) {
      const candidate = SPAWN_POINTS[(spawnIndex + attempt) % SPAWN_POINTS.length];
      if (!spawnPointBlocked(candidate.x, candidate.y)) {
        spawnIndex = (spawnIndex + attempt + 1) % SPAWN_POINTS.length;
        return candidate;
      }
    }
    return null;
  }

  function spawnPointBlocked(x, y) {
    const box = boxAt(x - 15, y - 15, 30, 30);
    for (const p of players) {
      if (p.active && overlaps(box, tankBox(p))) return true;
    }
    for (const enemy of enemies) {
      if (enemy.alive && overlaps(box, tankBox(enemy))) return true;
    }
    return false;
  }

  function findFreeSpotNear(tank, padX, padY, maxRadius = 112) {
    for (let radius = 32; radius <= maxRadius; radius += 16) {
      const candidates = [];
      for (let dx = -radius; dx <= radius; dx += 16) {
        candidates.push([padX + dx, padY - radius], [padX + dx, padY + radius]);
      }
      for (let dy = -radius + 16; dy <= radius - 16; dy += 16) {
        candidates.push([padX - radius, padY + dy], [padX + radius, padY + dy]);
      }
      for (const [cx, cy] of candidates) {
        const nx = clamp(cx, 16, FIELD - 16);
        const ny = clamp(cy, 16, FIELD - 16);
        // Must end up fully outside the 30x30 spawn box.
        if (Math.abs(nx - padX) < 28 && Math.abs(ny - padY) < 28) continue;
        if (canOccupy(tank, nx, ny)) return { x: nx, y: ny };
      }
    }
    return null;
  }

  function clearSpawnPad(x, y) {
    const box = boxAt(x - 15, y - 15, 30, 30);
    const occupants = [];
    for (const p of players) {
      if (p.active && overlaps(box, tankBox(p))) occupants.push(p);
    }
    for (const enemy of enemies) {
      if (enemy.alive && overlaps(box, tankBox(enemy))) occupants.push(enemy);
    }

    let moved = false;
    for (const tank of occupants) {
      const spot = findFreeSpotNear(tank, x, y);
      if (!spot) continue;
      spawnSparks(tank.x, tank.y, "#7fe8ff", 8);
      tank.x = spot.x;
      tank.y = spot.y;
      if (tank.isPlayer) {
        // Never punish a player for standing on a pad: brief mercy shield.
        tank.shield = Math.max(tank.shield || 0, 1.4);
      } else {
        tank.path = null;
        tank.pathIndex = 0;
        tank.repathTimer = 0.1;
        tank.aimTimer = 0;
      }
      spawnSparks(spot.x, spot.y, "#ffbf66", 10);
      moved = true;
    }

    if (moved) {
      addPopup(x, y - 18, "出生点已清空", "#ffbf66");
      flashAlpha = Math.max(flashAlpha, 0.12);
      audio.sfx("spawn");
    }
  }

  function updatePowerups(dt) {
    for (const powerup of powerups) {
      powerup.life -= dt;
      if (powerup.life <= 0) continue;
      for (const p of activePlayers()) {
        if (Math.abs(p.x - powerup.x) < 20 && Math.abs(p.y - powerup.y) < 20) {
          powerup.life = 0;
          if (p.fireTier < 2) {
            p.fireTier += 1;
            addPopup(powerup.x, powerup.y - 12, `${p.label} 强化`, "#ffe06d");
          } else {
            p.score += 500;
            refreshTeamScore();
            addPopup(powerup.x, powerup.y - 12, `${p.label} +500`, "#f0e6c4");
          }
          audio.sfx("powerup");
          flashAlpha = Math.max(flashAlpha, 0.16);
          break;
        }
      }
    }
    powerups = powerups.filter((powerup) => powerup.life > 0);
  }

  function fireBullet(source, dir, side, speed, damage, credit = null) {
    const vector = DIRS[dir];
    const x = source.x + vector.x * 16;
    const y = source.y + vector.y * 16;
    bullets.push({
      x,
      y,
      dir,
      speed,
      side,
      source,
      credit,
      damage,
      life: 3,
      alive: true,
      charmedShot: Boolean(side === "player" && source && source.charmed),
    });
    spawnMuzzle(x, y, dir, side);
  }

  // enemyScale slows only enemy shells (co-op tactical aim) while player
  // shots keep their normal cadence.
  function updateBullets(dt, enemyScale = 1) {
    for (const bullet of bullets) {
      if (!bullet.alive) continue;
      const stepDt = bullet.side === "enemy" ? dt * enemyScale : dt;
      bullet.life -= stepDt;
      if (bullet.life <= 0) {
        bullet.alive = false;
        continue;
      }
      if (bullet.side === "enemy") {
        let absorber = null;
        for (const p of activePlayers()) {
          if (p.skills.magnet.active <= 0) continue;
          if (Math.hypot(bullet.x - p.x, bullet.y - p.y) < SKILL_DEFS.magnet.radius) {
            absorber = p;
            break;
          }
        }
        if (absorber) {
          absorbEnemyBullet(bullet, absorber);
          continue;
        }
      }
      let remaining = bullet.speed * stepDt;
      const vector = DIRS[bullet.dir];
      while (remaining > 0 && bullet.alive) {
        const step = Math.min(4, remaining);
        bullet.x += vector.x * step;
        bullet.y += vector.y * step;
        remaining -= step;
        collideBullet(bullet);
      }
    }

    // Bullets cancel each other, which makes timing shots feel tactical.
    for (let i = 0; i < bullets.length; i += 1) {
      const a = bullets[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < bullets.length; j += 1) {
        const b = bullets[j];
        if (!b.alive || a.side === b.side) continue;
        if (overlaps(bulletBox(a), bulletBox(b))) {
          a.alive = false;
          b.alive = false;
          spawnSparks((a.x + b.x) / 2, (a.y + b.y) / 2, "#f4e4b0", 5);
          audio.sfx("bulletClash");
          break;
        }
      }
    }
  }

  function collideBullet(bullet) {
    if (!bullet.alive) return;

    if (bullet.x < 2 || bullet.y < 2 || bullet.x > FIELD - 2 || bullet.y > FIELD - 2) {
      bullet.alive = false;
      spawnSparks(bullet.x, bullet.y, "#cdbb8a", 3);
      return;
    }

    const bbox = bulletBox(bullet);
    const vector = DIRS[bullet.dir];
    const leadX = bullet.x + vector.x * 3;
    const leadY = bullet.y + vector.y * 3;
    const cells = [];

    if (vector.x === 0) {
      const row = Math.floor(leadY / TILE);
      if (row < 0 || row >= ROWS) {
        bullet.alive = false;
        return;
      }
      const columns = unique([
        Math.floor((bullet.x - 9) / TILE),
        Math.floor((bullet.x - 1) / TILE),
        Math.floor((bullet.x + 8) / TILE),
      ]).filter((col) => col >= 0 && col < COLS);
      for (const col of columns) cells.push({ x: col, y: row });
    } else {
      const col = Math.floor(leadX / TILE);
      if (col < 0 || col >= COLS) {
        bullet.alive = false;
        return;
      }
      const rows = unique([
        Math.floor((bullet.y - 9) / TILE),
        Math.floor((bullet.y - 1) / TILE),
        Math.floor((bullet.y + 8) / TILE),
      ]).filter((row) => row >= 0 && row < ROWS);
      for (const row of rows) cells.push({ x: col, y: row });
    }

    let hitSomething = false;
    let hitBrick = false;
    let hitSteel = false;
    const bricksToBreak = [];

    for (const cell of cells) {
      const type = map[cell.y][cell.x];
      if (type === "B") {
        hitSomething = true;
        hitBrick = true;
        bricksToBreak.push(cell);
      } else if (type === "S") {
        hitSomething = true;
        hitSteel = true;
      }
    }

    if (hitSomething) {
      bullet.alive = false;
      registerBasePressure(bullet);
      if (hitBrick) {
        for (const cell of bricksToBreak) {
          if (map[cell.y][cell.x] === "B") {
            map[cell.y][cell.x] = ".";
            spawnBrickDust(cell.x * TILE + 8, cell.y * TILE + 8, 5);
          }
        }
        markMapChanged();
        audio.sfx("brick");
      } else if (hitSteel) {
        spawnSparks(bullet.x, bullet.y, "#e8f2ed", 6);
        audio.sfx("steel");
      }
      return;
    }

    // The base sits behind its brick shell. Only a bullet that has a clear
    // line into the base rectangle can end the run.
    if (base.alive && overlaps(bbox, base)) {
      bullet.alive = false;
      if (bullet.side === "enemy" || stageConfig.playerCanBreakBase) {
        // In DUSK nothing is special: enemy shells, stray rounds and the
        // player's own cannon all end the eagle in one hit.
        destroyBase();
      } else {
        spawnSparks(bullet.x, bullet.y, "#e2c567", 5);
        audio.sfx("shieldHit");
      }
      return;
    }

    if (bullet.side === "player") {
      for (const enemy of enemies) {
        if (!enemy.alive || enemy.charmed) continue;
        if (overlaps(bbox, tankBox(enemy))) {
          bullet.alive = false;
          damageEnemy(enemy, bullet.damage, bullet.credit || bullet.source);
          return;
        }
      }
    } else {
      for (const p of activePlayers()) {
        if (!overlaps(bbox, tankBox(p))) continue;
        bullet.alive = false;
        if (p.shield > 0) {
          spawnSparks(bullet.x, bullet.y, "#7ee6dd", 7);
          audio.sfx("shieldHit");
        } else {
          hitPlayer(p);
        }
        return;
      }
      for (const ally of enemies) {
        if (!ally.alive || !ally.charmed) continue;
        if (overlaps(bbox, tankBox(ally))) {
          bullet.alive = false;
          damageAlly(ally);
          return;
        }
      }
    }
  }

  function damageEnemy(enemy, damage, credit) {
    if (!enemy.alive) return;
    enemy.hp -= damage;
    if (enemy.hp > 0) {
      enemy.hitFlash = 0.12;
      spawnSparks(enemy.x, enemy.y, "#ffe9b0", 7);
      audio.sfx("hit");
      return;
    }
    killEnemy(enemy, credit);
  }

  function damageAlly(ally) {
    if (!ally.alive || !ally.charmed) return;
    ally.hp -= 1;
    ally.hitFlash = 0.14;
    if (ally.hp > 0) {
      spawnSparks(ally.x, ally.y, "#eadcff", 7);
      audio.sfx("hit");
      return;
    }
    ally.alive = false;
    spawnExplosion(ally.x, ally.y, false);
    addPopup(ally.x, ally.y - 18, "友军阵亡", SKILL_DEFS.mind.color);
    audio.sfx("allyLost");
  }

  function killEnemy(enemy, credit) {
    if (!enemy.alive) return;
    enemy.alive = false;
    killed += 1;
    if (credit && credit.isPlayer) {
      credit.score += enemy.config.score;
      refreshTeamScore();
    }
    const creditLabel = credit && credit.isPlayer ? `${credit.label} ` : "";
    addPopup(enemy.x, enemy.y - 16, `${creditLabel}+${enemy.config.score}`, "#f4e6bc");
    spawnExplosion(enemy.x, enemy.y, false);
    audio.sfx("explosion");

    if (stageConfig.drops.includes(killed)) {
      powerups.push({
        x: clamp(enemy.x, 24, FIELD - 24),
        y: clamp(enemy.y, 24, FIELD - 24),
        life: 14,
      });
      addPopup(enemy.x, enemy.y - 30, "奖励掉落", "#ffe06d");
      audio.sfx("powerupDrop");
    }
  }

  function hitPlayer(p) {
    if (!p || !p.active || state !== "playing") return;
    if (targeting && targeting.ownerIndex === p.index) cancelTargeting(false, true);
    clearPlayerActiveSkills(p);
    spawnExplosion(p.x, p.y, true);
    audio.sfx("playerHit");
    shake = Math.max(shake, 7);
    flashAlpha = Math.max(flashAlpha, 0.36);
    bullets = bullets.filter((bullet) => bullet.source !== p);
    p.active = false;
    p.shield = 0;
    p.moving = false;
    p.lives = Math.max(0, p.lives - 1);
    if (p.lives <= 0) {
      p.out = true;
      p.respawnTimer = 0;
    } else {
      p.respawnTimer = 1.45;
    }

    const everyoneOut = players.every((item) => item.out);
    if (stageConfig.noGameOver) {
      // One last tank per player. The epilogue waits until the whole team is
      // down; the last survivor can keep fighting.
      if (everyoneOut) scheduleEnding(1.55);
      return;
    }

    if (everyoneOut) {
      beginGameOver("坦克耗尽");
    }
  }

  function destroyBase({ cause = "enemy" } = {}) {
    if (!base.alive) return;
    base.alive = false;
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        if (map[y][x] === "E") map[y][x] = ".";
      }
    }
    markMapChanged();
    const cx = base.x + base.w / 2;
    const cy = base.y + base.h / 2;
    spawnExplosion(cx, cy, true);
    spawnExplosion(cx - 8, cy - 7, false);
    spawnExplosion(cx + 9, cy + 5, false);
    shake = Math.max(shake, 10);
    flashAlpha = Math.max(flashAlpha, 0.7);
    audio.sfx("baseExplosion");
    if (cause === "finale") return;
    if (stageConfig.noGameOver) {
      // If anything ever takes the unprotected eagle before the finale, the
      // run still ends in the epilogue.
      scheduleEnding(1.8);
    } else {
      beginGameOver("老鹰被毁");
    }
  }

  function scheduleEnding(delay = 1.5) {
    if (state === "ending" || endingTrigger) return;
    if (targeting) cancelTargeting(false, true);
    clearActiveSkills();
    clearInputs();
    endingTrigger = { t: Math.max(0.2, delay) };
    syncUI();
  }

  // ---------------------------------------------------------------------------
  // Stage 3 finale: one minute in, fate appears above the eagle and fires once.
  // ---------------------------------------------------------------------------

  function startFinale() {
    if (finale) return;
    if (targeting) cancelTargeting(false, true);
    clearActiveSkills();
    clearInputs();
    finale = {
      t: 0,
      // The empty tile directly above the eagle. Facing down, one clean shot.
      tankY: base.y - 18,
      fired: false,
      destroyed: false,
      flash: 0,
    };
    for (const p of players) p.moving = false;
    shake = Math.max(shake, 2);
    audio.sfx("finale");
    syncUI();
  }

  function placeFinaleTank() {
    finale.tankY = base.y - 18;
    return clamp(finale.t / 0.55, 0, 1);
  }

  function updateFinale(dt) {
    if (!finale) return;
    finale.t += dt;
    finale.flash = Math.max(0, finale.flash - dt * 3.2);
    updateEffects(dt);

    // Materialize the uninvited tank in the empty tile above the eagle.
    const appear = placeFinaleTank();
    if (appear < 1 && Math.random() < 0.45) {
      const cx = base.x + base.w / 2;
      spawnSparks(cx + rand(-14, 14), base.y - 22 + rand(-8, 8), "#c6402f", 1);
    }

    // The single shot. It is not a bullet that can be dodged or shot down.
    if (!finale.fired && finale.t >= 2.9) {
      finale.fired = true;
      finale.flash = 1;
      shake = Math.max(shake, 9);
      audio.sfx("fateShot");
    }
    if (finale.fired && !finale.destroyed && finale.t >= 3.25) {
      finale.destroyed = true;
      destroyBase({ cause: "finale" });
      shake = Math.max(shake, 14);
      flashAlpha = Math.max(flashAlpha, 0.9);
    }
    if (finale.t >= 5.4) {
      beginEnding();
    }
  }

  // Debug/preview only: jump the scripted sequence to a given second.
  function seekFinale(time) {
    if (!finale) startFinale();
    if (!finale) return;
    finale.t = clamp(Number(time) || 0, 0, 5.3);
    placeFinaleTank();
    finale.fired = finale.t >= 2.9;
    if (finale.fired && !finale.destroyed && finale.t >= 3.25) {
      finale.destroyed = true;
      destroyBase({ cause: "finale" });
      shake = Math.max(shake, 14);
      flashAlpha = Math.max(flashAlpha, 0.9);
    }
    syncUI();
  }

  function renderFinale() {
    if (!finale) return;
    const t = finale.t;
    const cx = base.x + base.w / 2;
    const y = Math.round(finale.tankY);
    const appear = clamp(t / 0.55, 0, 1);

    // Let the battlefield fall away before the shot.
    const dim = clamp((t - 0.3) / 2.2, 0, 1) * 0.5;
    if (dim > 0) {
      const g = ctx.createRadialGradient(cx, base.y + 12, 60, cx, base.y + 12, 270);
      g.addColorStop(0, "rgba(4, 6, 4, 0)");
      g.addColorStop(1, `rgba(4, 6, 4, ${dim})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, FIELD, FIELD);
    }

    // A dark red seam opens above the eagle; the tank condenses out of it.
    if (appear < 1) {
      ctx.fillStyle = `rgba(4, 6, 4, ${(1 - appear) * 0.55})`;
      ctx.fillRect(cx - 20, y - 28, 40, 46);
      ctx.fillStyle = `rgba(198, 64, 47, ${(1 - appear) * 0.24})`;
      ctx.fillRect(cx - 2, y - 28, 4, 46);
    }

    // A thin, patient targeting line straight down through the eagle.
    if (t > 1.45 && !finale.destroyed) {
      const pulse = 0.35 + Math.sin(visualTime * 18) * 0.25;
      const aimTop = base.y - 2;
      const aimBottom = base.y + base.h - 2;
      ctx.fillStyle = `rgba(198, 64, 47, ${pulse})`;
      ctx.fillRect(cx - 0.5, aimTop, 1, aimBottom - aimTop);
      ctx.fillStyle = `rgba(244, 238, 223, ${pulse * 0.8})`;
      ctx.fillRect(cx - 10, base.y + 12, 20, 1);
      ctx.fillRect(cx - 10, base.y + 20, 20, 1);
    }

    // Faint red aura around the materialized tank.
    const aura = 0.12 + Math.sin(visualTime * 5.5) * 0.05;
    ctx.globalAlpha = appear;
    ctx.fillStyle = `rgba(198, 64, 47, ${aura})`;
    ctx.fillRect(cx - 16, y - 16, 32, 32);

    renderTank({
      x: cx,
      y,
      dir: "down",
      isPlayer: false,
      shield: 0,
      fireTier: 0,
      hitFlash: 0,
      maxHp: 1,
    }, FATE_PALETTE);
    ctx.globalAlpha = 1;

    // Muzzle flash and the single tracer, both driven down into the eagle.
    if (finale.fired && !finale.destroyed) {
      const flash = clamp(1 - (t - 2.9) / 0.35, 0, 1);
      ctx.fillStyle = `rgba(255, 240, 201, ${flash})`;
      ctx.fillRect(cx - 5, y + 14, 10, 10);
      ctx.fillStyle = `rgba(232, 181, 60, ${flash * 0.55})`;
      ctx.fillRect(cx - 2, base.y - 2, 4, base.h + 2);
    }
    if (finale.flash > 0.02) {
      ctx.fillStyle = `rgba(255, 238, 205, ${finale.flash * 0.25})`;
      ctx.fillRect(0, 0, FIELD, FIELD);
    }
  }

  function beginEnding() {
    if (state === "ending") return;
    if (targeting) cancelTargeting(false, true);
    clearActiveSkills();
    clearInputs();
    finale = null;
    endingTrigger = null;
    state = "ending";
    stateTime = 0;
    commitHighScore();
    syncUI();
    showEndingOverlay();
    spawnEndingPetals();
    audio.sfx("ending");
  }

  function showEndingOverlay() {
    if (!endingOverlayEl) return;
    endingOverlayEl.hidden = false;
    endingOverlayEl.setAttribute("aria-hidden", "false");
    if (document.body) document.body.classList.add("is-ending");
  }

  function hideEndingOverlay() {
    if (!endingOverlayEl) return;
    endingOverlayEl.hidden = true;
    endingOverlayEl.setAttribute("aria-hidden", "true");
    if (document.body) document.body.classList.remove("is-ending");
  }

  function spawnEndingPetals() {
    if (!endingPetalsEl || typeof endingPetalsEl.replaceChildren !== "function") return;
    endingPetalsEl.replaceChildren();
    const count = 46;
    for (let i = 0; i < count; i += 1) {
      const petal = document.createElement("span");
      petal.className = "ending-petal";
      const size = rand(5, 11);
      petal.style.setProperty("--x", `${rand(0, 100).toFixed(2)}%`);
      petal.style.setProperty("--drift", `${rand(-140, 140).toFixed(0)}px`);
      petal.style.setProperty("--dur", `${rand(6.5, 13).toFixed(2)}s`);
      petal.style.setProperty("--delay", `${rand(-13, 0).toFixed(2)}s`);
      petal.style.setProperty("--spin", `${rand(180, 900).toFixed(0)}deg`);
      petal.style.setProperty("--w", `${size.toFixed(0)}px`);
      petal.style.setProperty("--h", `${(size * rand(0.55, 1.15)).toFixed(0)}px`);
      petal.style.color = PETAL_COLORS[i % PETAL_COLORS.length];
      endingPetalsEl.appendChild(petal);
    }

    // The canvas fallback needs its own petals (Switch never renders DOM).
    endingPetals.length = 0;
    for (let i = 0; i < 70; i += 1) {
      endingPetals.push({
        x: rand(0, FIELD),
        y: rand(-FIELD, FIELD),
        vy: rand(14, 46),
        sway: rand(6, 22),
        phase: rand(0, Math.PI * 2),
        size: Math.random() < 0.65 ? 2 : 3,
        color: PETAL_COLORS[i % PETAL_COLORS.length],
      });
    }
  }

  function updateEndingPetals(dt) {
    for (const petal of endingPetals) {
      petal.y += petal.vy * dt;
      petal.x += Math.sin(visualTime * 1.6 + petal.phase) * petal.sway * dt;
      if (petal.y > FIELD + 8) {
        petal.y = -8;
        petal.x = rand(0, FIELD);
      }
      if (petal.x < -8) petal.x = FIELD + 8;
      else if (petal.x > FIELD + 8) petal.x = -8;
    }
  }

  // ---------------------------------------------------------------------------
  // Effects
  // ---------------------------------------------------------------------------

  function updateEffects(dt) {
    shake = Math.max(0, shake - dt * 24);
    flashAlpha = Math.max(0, flashAlpha - dt * 2.6);

    for (const particle of particles) {
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += particle.gravity * dt;
      particle.vx *= particle.drag;
      particle.vy *= particle.drag;
    }
    particles = particles.filter((particle) => particle.life > 0);

    for (const ghost of teleportGhosts) ghost.life -= dt;
    teleportGhosts = teleportGhosts.filter((ghost) => ghost.life > 0);

    for (const popup of popups) {
      popup.life -= dt;
      popup.y -= 13 * dt;
    }
    popups = popups.filter((popup) => popup.life > 0);
  }

  function spawnSparks(x, y, color, count) {
    for (let i = 0; i < count; i += 1) {
      const angle = rand(0, Math.PI * 2);
      const speed = rand(18, 80);
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        gravity: 80,
        drag: 0.93,
        life: rand(0.15, 0.35),
        maxLife: 0.35,
        size: Math.random() < 0.7 ? 1 : 2,
        color,
      });
    }
  }

  function spawnBrickDust(x, y, count) {
    for (let i = 0; i < count; i += 1) {
      particles.push({
        x: x + rand(-7, 7),
        y: y + rand(-7, 7),
        vx: rand(-35, 35),
        vy: rand(-55, -8),
        gravity: 170,
        drag: 0.96,
        life: rand(0.2, 0.5),
        maxLife: 0.5,
        size: Math.random() < 0.65 ? 2 : 3,
        color: Math.random() < 0.5 ? "#b36a4d" : "#7d3a2c",
      });
    }
  }

  function spawnMuzzle(x, y, dir, side) {
    const vector = DIRS[dir];
    for (let i = 0; i < 4; i += 1) {
      particles.push({
        x: x - vector.x * 2,
        y: y - vector.y * 2,
        vx: vector.x * rand(18, 50) + rand(-10, 10),
        vy: vector.y * rand(18, 50) + rand(-10, 10),
        gravity: 0,
        drag: 0.9,
        life: rand(0.05, 0.13),
        maxLife: 0.13,
        size: 1,
        color: side === "player" ? "#ffe89b" : "#ffb08b",
      });
    }
  }

  function spawnExplosion(x, y, big) {
    const count = big ? 34 : 20;
    const colors = ["#ffe9a0", "#f2b94f", "#d96b36", "#9c3b25", "#4d4b42"];
    for (let i = 0; i < count; i += 1) {
      const angle = rand(0, Math.PI * 2);
      const speed = rand(20, big ? 150 : 100);
      particles.push({
        x: x + rand(-5, 5),
        y: y + rand(-5, 5),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        gravity: rand(20, 90),
        drag: 0.955,
        life: rand(0.18, big ? 0.8 : 0.55),
        maxLife: big ? 0.8 : 0.55,
        size: Math.random() < 0.55 ? 2 : 3,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }
    for (let i = 0; i < (big ? 12 : 7); i += 1) {
      const angle = rand(0, Math.PI * 2);
      const speed = rand(10, big ? 60 : 38);
      particles.push({
        x: x + rand(-6, 6),
        y: y + rand(-6, 6),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 6,
        gravity: -6,
        drag: 0.97,
        life: rand(0.4, big ? 1.15 : 0.8),
        maxLife: 1.15,
        size: Math.random() < 0.45 ? 4 : 3,
        color: "#3b3f36",
        smoke: true,
      });
    }
  }

  function addPopup(x, y, text, color) {
    popups.push({ x, y, text, color, life: 0.9, maxLife: 0.9 });
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  function render() {
    ctx.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);
    syncSkillUI();
    syncStatsUI();

    if (state === "title") {
      renderTitle();
      return;
    }

    if (terrainDirty) rebuildTerrain();
    renderWorld();
    if (targeting && state === "playing") renderTargetingOverlay();
    if (state === "playing" && stageConfig.finaleAt && !finale) renderApproachVignette();

    if (state === "intro") renderIntroOverlay();
    else if (state === "paused") renderPauseOverlay();
    else if (state === "stageclear") renderStageClearOverlay();
    else if (state === "gameover") renderGameOverOverlay();
    else if (state === "victory") renderVictoryOverlay();
    else if (state === "ending") renderEndingOverlay();
  }

  function renderApproachVignette() {
    const remaining = stageConfig.finaleAt - stateTime;
    if (remaining > 15) return;
    const p = clamp(1 - remaining / 15, 0, 1);
    const alpha = p * 0.46;
    const g = ctx.createRadialGradient(FIELD / 2, FIELD / 2, FIELD * 0.2, FIELD / 2, FIELD / 2, FIELD * 0.78);
    g.addColorStop(0, "rgba(4, 6, 4, 0)");
    g.addColorStop(1, `rgba(4, 6, 4, ${alpha})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, FIELD, FIELD);
    if (p > 0.55) {
      // A barely-there red pulse. No countdown, just a feeling.
      const red = (p - 0.55) * 0.1;
      ctx.fillStyle = `rgba(120, 28, 20, ${red + Math.sin(visualTime * 2.4) * 0.015})`;
      ctx.fillRect(0, 0, FIELD, FIELD);
    }
  }

  function renderWorld() {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, FIELD, FIELD);
    ctx.clip();

    // Switch host: the terrain is a putImageData blit and does not follow the
    // canvas transform, so a translated world would look like the map is
    // refreshing under the tanks. Keep the Switch view stable; web still shakes.
    if (!IS_SWITCH_HOST && shake > 0.2) {
      const sx = Math.round(rand(-shake, shake));
      const sy = Math.round(rand(-shake, shake));
      ctx.translate(sx, sy);
    }

    if (IS_SWITCH_HOST && window.__tankWarsHostTerrain) {
      ctx.putImageData(window.__tankWarsHostTerrain.imageData, 0, 0);
    } else {
      ctx.drawImage(terrainCanvas, 0, 0);
    }
    renderWater();
    renderBase();
    renderSkillFields();
    renderTeleportGhosts();

    if (pendingSpawn) renderSpawnFlash(pendingSpawn);

    for (const p of players) {
      if (p.active) renderTank(p, PLAYER_PALETTES[p.index] || PLAYER_PALETTE);
    }
    for (const enemy of enemies) {
      if (enemy.alive) renderTank(enemy, enemy.config.palette);
    }

    renderBullets();

    // Trees obscure tanks and bullets, like a proper 8-bit battlefield. Loot
    // stays above the canopy so it is never invisible.
    if (IS_SWITCH_HOST && !treeCanvas) {
      for (let ty = 0; ty < ROWS; ty += 1) {
        for (let tx = 0; tx < COLS; tx += 1) {
          if (map[ty][tx] === "T") {
            drawTreeTile(ctx, tx * TILE, ty * TILE, tx, ty);
          }
        }
      }
    } else {
      ctx.drawImage(treeCanvas, 0, 0);
    }
    for (const powerup of powerups) renderPowerup(powerup);
    renderParticles();
    renderPopups();
    if (state === "playing" && finale) renderFinale();

    if (flashAlpha > 0.01) {
      ctx.fillStyle = `rgba(255, 235, 182, ${flashAlpha * 0.3})`;
      ctx.fillRect(0, 0, FIELD, FIELD);
    }

    ctx.restore();
  }

  function drawDottedRing(cx, cy, radius, color, count, phase, alpha) {
    ctx.fillStyle = color;
    for (let i = 0; i < count; i += 1) {
      const angle = (Math.PI * 2 * i) / count + phase;
      const x = Math.round(cx + Math.cos(angle) * radius);
      const y = Math.round(cy + Math.sin(angle) * radius);
      ctx.globalAlpha = alpha * (0.6 + Math.sin(i * 1.7 + visualTime * 7) * 0.25);
      const size = i % 4 === 0 ? 3 : 2;
      ctx.fillRect(x - Math.floor(size / 2), y - Math.floor(size / 2), size, size);
    }
    ctx.globalAlpha = 1;
  }

  function renderSkillFields() {
    ctx.save();
    for (const p of players) {
      if (!p.active) continue;
      const px = p.x;
      const py = p.y;

      if (p.skills.magnet.active > 0) {
        const def = SKILL_DEFS.magnet;
        const pulse = 0.5 + Math.sin(visualTime * 9) * 0.5;
        ctx.globalAlpha = 0.045 + pulse * 0.035;
        ctx.fillStyle = def.color;
        ctx.beginPath();
        ctx.arc(px, py, def.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.2 + pulse * 0.18;
        ctx.strokeStyle = def.color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(px, py, def.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;

        drawDottedRing(px, py, def.radius, def.color, 40, visualTime * 1.1, 0.88);
        drawDottedRing(px, py, def.radius - 14, def.color, 28, -visualTime * 0.8, 0.42);

        for (let i = 0; i < 8; i += 1) {
          const angle = visualTime * 1.6 + (Math.PI * 2 * i) / 8;
          const travel = (visualTime * 1.5 + i * 0.37) % 1;
          const radius = def.radius * (0.32 + travel * 0.55);
          const x = Math.round(px + Math.cos(angle) * radius);
          const y = Math.round(py + Math.sin(angle) * radius);
          ctx.globalAlpha = 0.35 + (1 - travel) * 0.55;
          ctx.fillStyle = i % 2 === 0 ? def.color : "#e9fbff";
          ctx.fillRect(x - 1, y - 1, 3, 3);
        }
        ctx.globalAlpha = 1;
      }

      if (p.skills.teleport.active > 0) {
        const def = SKILL_DEFS.teleport;
        const progress = 1 - p.skills.teleport.active / def.duration;
        const radius = 18 + progress * 42;
        ctx.globalAlpha = (1 - progress) * 0.8;
        ctx.strokeStyle = def.color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.stroke();
        drawDottedRing(px, py, radius + 6, def.color, 20, visualTime * 3, (1 - progress) * 0.85);
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
  }

  function renderTeleportGhosts() {
    for (const ghost of teleportGhosts) {
      ctx.globalAlpha = (ghost.life / ghost.maxLife) * 0.38;
      renderTank({
        x: ghost.x,
        y: ghost.y,
        dir: ghost.dir,
        isPlayer: true,
        shield: 0,
        fireTier: ghost.fireTier,
        hitFlash: 0,
        maxHp: 1,
      }, PLAYER_PALETTES[ghost.ownerIndex || 0] || PLAYER_PALETTE);
    }
    ctx.globalAlpha = 1;
  }

  function renderWater() {
    for (const cell of waterCells) {
      const x = cell.x * TILE;
      const y = cell.y * TILE;
      const phase = visualTime * 2.1 + cell.x * 0.72 + cell.y * 0.43;
      ctx.fillStyle = "rgba(36, 105, 137, 0.5)";
      ctx.fillRect(x + 2 + Math.round(Math.sin(phase) * 2), y + 5, 7, 1);
      ctx.fillRect(x + 8 + Math.round(Math.cos(phase * 0.8) * 2), y + 11, 5, 1);
      if ((cell.x + cell.y) % 3 === 0) {
        ctx.fillStyle = "rgba(86, 155, 174, 0.28)";
        ctx.fillRect(x + 4 + Math.round(Math.cos(phase) * 2), y + 8, 3, 1);
      }
    }
  }

  function renderBase() {
    const x = base.x;
    const y = base.y;
    const pulse = 0.45 + Math.sin(visualTime * 3.2) * 0.15;

    if (!base.alive) {
      ctx.fillStyle = "#1a1b16";
      ctx.fillRect(x, y, 32, 32);
      ctx.fillStyle = "#33352b";
      ctx.fillRect(x + 3, y + 8, 26, 21);
      ctx.fillStyle = "#4a3828";
      ctx.fillRect(x + 6, y + 14, 8, 15);
      ctx.fillRect(x + 18, y + 10, 9, 19);
      ctx.fillStyle = "#22241e";
      ctx.fillRect(x + 10, y + 20, 13, 6);
      ctx.fillStyle = "#8d3d29";
      ctx.fillRect(x + 14, y + 25, 4, 3);
      return;
    }

    ctx.fillStyle = "rgba(232, 181, 60, 0.05)";
    ctx.fillRect(x - 2, y - 2, 36, 36);
    ctx.fillStyle = "#17160f";
    ctx.fillRect(x, y, 32, 32);
    ctx.fillStyle = "#6f5721";
    ctx.fillRect(x + 1, y + 1, 30, 30);
    ctx.fillStyle = "#29271a";
    ctx.fillRect(x + 3, y + 3, 26, 26);
    ctx.fillStyle = "#93702a";
    ctx.fillRect(x + 5, y + 5, 22, 22);
    ctx.fillStyle = "#161a12";
    ctx.fillRect(x + 7, y + 7, 18, 18);

    // A small original phoenix/shield emblem.
    ctx.fillStyle = "#d6a331";
    ctx.fillRect(x + 14, y + 8, 4, 3);
    ctx.fillRect(x + 13, y + 11, 6, 2);
    ctx.fillRect(x + 10, y + 13, 12, 3);
    ctx.fillRect(x + 11, y + 16, 10, 3);
    ctx.fillRect(x + 13, y + 19, 6, 4);
    ctx.fillRect(x + 15, y + 23, 2, 3);
    ctx.fillRect(x + 6, y + 14, 4, 2);
    ctx.fillRect(x + 4, y + 16, 4, 2);
    ctx.fillRect(x + 22, y + 14, 4, 2);
    ctx.fillRect(x + 24, y + 16, 4, 2);
    ctx.fillRect(x + 7, y + 18, 3, 2);
    ctx.fillRect(x + 22, y + 18, 3, 2);
    ctx.fillStyle = "#ffe17a";
    ctx.fillRect(x + 15, y + 12, 2, 2);
    ctx.fillRect(x + 13, y + 17, 4, 1);
    ctx.fillRect(x + 15, y + 22, 2, 1);
    ctx.fillStyle = `rgba(255, 230, 145, ${pulse})`;
    ctx.fillRect(x + 16, y + 9, 1, 1);
    ctx.fillRect(x + 8, y + 17, 1, 1);
    ctx.fillRect(x + 23, y + 17, 1, 1);
  }

  function renderPowerup(powerup) {
    const bob = Math.round(Math.sin(visualTime * 4.5) * 2);
    const x = Math.round(powerup.x);
    const y = Math.round(powerup.y) + bob;
    const blink = powerup.life < 3 && Math.floor(powerup.life * 8) % 2 === 0;
    if (blink) return;

    ctx.fillStyle = "rgba(255, 224, 109, 0.12)";
    ctx.fillRect(x - 13, y - 13, 26, 26);
    ctx.fillStyle = "#15170f";
    ctx.fillRect(x - 10, y - 8, 20, 16);
    ctx.fillRect(x - 8, y - 10, 16, 20);
    ctx.fillStyle = "#c18d2d";
    ctx.fillRect(x - 9, y - 7, 18, 14);
    ctx.fillRect(x - 7, y - 9, 14, 18);
    ctx.fillStyle = "#ffe06d";
    drawPixelStar(x, y - 1, 2, "#ffe06d", "#4a3510");
  }

  function drawPixelStar(cx, cy, scale, color, outline) {
    const pattern = [
      "00100",
      "01110",
      "11111",
      "01110",
      "00100",
    ];
    const w = 5 * scale;
    const x = cx - Math.floor(w / 2);
    const y = cy - Math.floor(w / 2);
    ctx.fillStyle = outline;
    for (let row = 0; row < 5; row += 1) {
      for (let col = 0; col < 5; col += 1) {
        if (pattern[row][col] === "1") {
          ctx.fillRect(x + col * scale - 1, y + row * scale - 1, scale + 2, scale + 2);
        }
      }
    }
    ctx.fillStyle = color;
    for (let row = 0; row < 5; row += 1) {
      for (let col = 0; col < 5; col += 1) {
        if (pattern[row][col] === "1") {
          ctx.fillRect(x + col * scale, y + row * scale, scale, scale);
        }
      }
    }
  }

  function renderSpawnFlash(spawn) {
    const x = Math.round(spawn.x);
    const y = Math.round(spawn.y);
    const phase = visualTime * 18;
    const size = 7 + Math.round((Math.sin(phase) * 0.5 + 0.5) * 7);
    ctx.fillStyle = "rgba(219, 238, 214, 0.12)";
    ctx.fillRect(x - 16, y - 16, 32, 32);
    ctx.fillStyle = "#eef5de";
    ctx.fillRect(x - size, y - 2, size * 2, 4);
    ctx.fillRect(x - 2, y - size, 4, size * 2);
    ctx.fillStyle = "#d9b84e";
    ctx.fillRect(x - 2, y - 2, 4, 4);
    ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
    ctx.fillRect(x - size + 2, y - 4, size * 2 - 4, 1);
    ctx.fillRect(x - 4, y - size + 2, 1, size * 2 - 4);
  }

  function renderTank(tank, palette) {
    const cx = Math.round(tank.x);
    const cy = Math.round(tank.y);
    const dir = tank.dir;
    const isPlayer = Boolean(tank.isPlayer);
    const activePalette = tank.hitFlash > 0
      ? { body: "#fff9df", dark: "#b99c5d", light: "#ffffff", accent: "#f5df9e" }
      : tank.charmed
        ? MIND_PALETTE
        : palette;

    if (tank.charmed) {
      const pulse = 0.5 + Math.sin(visualTime * 11) * 0.3;
      ctx.strokeStyle = `rgba(187, 145, 255, ${pulse})`;
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - 16.5, cy - 16.5, 33, 33);
      for (let i = 0; i < 4; i += 1) {
        const angle = visualTime * 3 + (Math.PI * 2 * i) / 4;
        ctx.fillStyle = i % 2 === 0 ? "#eadcff" : SKILL_DEFS.mind.color;
        ctx.fillRect(
          Math.round(cx + Math.cos(angle) * 19) - 1,
          Math.round(cy + Math.sin(angle) * 19) - 1,
          3,
          3
        );
      }
    }

    if (isPlayer && tank.shield > 0) {
      const a = 0.55 + Math.sin(visualTime * 12) * 0.25;
      ctx.strokeStyle = `rgba(110, 232, 222, ${a})`;
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - 16.5, cy - 16.5, 33, 33);
      ctx.fillStyle = `rgba(110, 232, 222, ${a * 0.55})`;
      const offset = Math.round(visualTime * 10) % 32;
      ctx.fillRect(cx - 16, cy - 16 + offset, 2, 2);
      ctx.fillRect(cx + 14, cy + 14 - offset, 2, 2);
    }

    // Soft rectangular shadow keeps the sprite grounded without blurring pixels.
    ctx.fillStyle = "rgba(0, 0, 0, 0.32)";
    ctx.fillRect(cx - 11, cy + 7, 24, 7);

    const R = (x, y, w, h, color) => {
      let left;
      let top;
      let width;
      let height;
      if (dir === "up") {
        left = cx + x;
        top = cy + y;
        width = w;
        height = h;
      } else if (dir === "right") {
        left = cx - y - h;
        top = cy + x;
        width = h;
        height = w;
      } else if (dir === "down") {
        left = cx - x - w;
        top = cy - y - h;
        width = w;
        height = h;
      } else {
        left = cx + y;
        top = cy - x - w;
        width = h;
        height = w;
      }
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(left), Math.round(top), width, height);
    };

    // Treads
    R(-12, -11, 5, 22, activePalette.dark);
    R(7, -11, 5, 22, activePalette.dark);
    R(-11, -10, 1, 20, activePalette.light);
    R(8, -10, 1, 20, activePalette.light);
    for (let i = -9; i <= 9; i += 4) {
      R(-12, i, 5, 1, "rgba(0, 0, 0, 0.36)");
      R(7, i, 5, 1, "rgba(0, 0, 0, 0.36)");
    }
    R(-12, 9, 5, 2, "#232721");
    R(7, 9, 5, 2, "#232721");

    // Hull
    R(-7, -10, 14, 20, activePalette.body);
    R(-6, -11, 12, 2, activePalette.light);
    R(-7, 7, 14, 3, activePalette.dark);
    R(-8, -8, 1, 14, activePalette.dark);
    R(7, -8, 1, 14, activePalette.dark);
    R(-5, -8, 10, 2, "rgba(255, 255, 255, 0.18)");
    R(-4, 3, 8, 1, "rgba(0, 0, 0, 0.2)");

    // Barrel + turret
    R(-2, -17, 4, 13, activePalette.dark);
    R(-1, -17, 2, 12, activePalette.light);
    R(-3, -17, 6, 2, activePalette.body);
    R(-5, -6, 10, 10, activePalette.body);
    R(-4, -7, 8, 2, activePalette.light);
    R(-5, 3, 10, 1, activePalette.dark);
    R(-4, -5, 8, 1, "rgba(255, 255, 255, 0.25)");
    R(-2, -3, 4, 4, activePalette.accent);
    R(-1, -2, 2, 2, "rgba(255, 255, 255, 0.45)");

    if (isPlayer) {
      // Gold/cyan ID strip plus power-tier ticks.
      R(-4, 5, 8, 1, activePalette.accent);
      for (let i = 0; i < tank.fireTier + 1; i += 1) {
        R(-4 + i * 3, 8, 2, 1, "#fff1ac");
      }
    } else if (tank.maxHp > 1) {
      R(-4, -9, 8, 1, "#f0d77a");
      R(-4, -7, 8, 1, "rgba(0, 0, 0, 0.25)");
    }
  }

  function renderBullets() {
    for (const bullet of bullets) {
      if (!bullet.alive) continue;
      const x = Math.round(bullet.x);
      const y = Math.round(bullet.y);
      const playerShot = bullet.side === "player";
      const charmedShot = playerShot && bullet.charmedShot;
      const dx = DIRS[bullet.dir].x;
      const dy = DIRS[bullet.dir].y;
      ctx.fillStyle = charmedShot
        ? "rgba(187, 145, 255, 0.16)"
        : playerShot
          ? "rgba(255, 220, 115, 0.13)"
          : "rgba(255, 105, 70, 0.15)";
      ctx.fillRect(x - 6, y - 6, 12, 12);
      ctx.fillStyle = charmedShot
        ? "rgba(159, 226, 255, 0.42)"
        : playerShot
          ? "rgba(255, 203, 70, 0.42)"
          : "rgba(255, 96, 68, 0.4)";
      ctx.fillRect(x - dx * 3 - 2, y - dy * 3 - 2, 4, 4);
      ctx.fillStyle = charmedShot ? "#f0e6ff" : playerShot ? "#fff5c8" : "#ffd3bd";
      if (dx !== 0) ctx.fillRect(x - 4, y - 2, 8, 4);
      else ctx.fillRect(x - 2, y - 4, 4, 8);
      ctx.fillStyle = charmedShot ? "#a98bff" : playerShot ? "#e7a62c" : "#e04f32";
      if (dx !== 0) ctx.fillRect(x - 4, y + 1, 8, 1);
      else ctx.fillRect(x + 1, y - 4, 1, 8);
    }
  }

  function renderParticles() {
    for (const particle of particles) {
      const alpha = clamp(particle.life / Math.max(0.01, particle.maxLife), 0, 1);
      ctx.globalAlpha = particle.smoke ? alpha * 0.6 : Math.min(1, alpha * 1.5);
      ctx.fillStyle = particle.color;
      const size = particle.size;
      ctx.fillRect(
        Math.round(particle.x - size / 2),
        Math.round(particle.y - size / 2),
        size,
        size
      );
    }
    ctx.globalAlpha = 1;
  }

  function renderPopups() {
    for (const popup of popups) {
      const alpha = clamp(popup.life / popup.maxLife, 0, 1);
      const cjk = /[^\x20-\x7E]/.test(popup.text);
      const width = cjk ? String(popup.text).length * 11 : measureText(popup.text, 1);
      const x = clamp(Math.round(popup.x), Math.floor(width / 2) + 6, FIELD - Math.ceil(width / 2) - 6);
      const y = clamp(Math.round(popup.y), 10, FIELD - 18);
      ctx.globalAlpha = alpha;
      if (cjk) {
        drawLabel(ctx, popup.text, x, y - 4, 11, popup.color, "center", "rgba(0,0,0,.85)");
      } else {
        drawText(ctx, popup.text, x, y, 1, popup.color, "center", "rgba(0,0,0,.85)");
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawClampedCenteredText(text, x, y, scale, color) {
    const cjk = /[^\x20-\x7E]/.test(text);
    const width = cjk ? String(text).length * 11 : measureText(text, scale);
    const cx = clamp(x, Math.floor(width / 2) + 8, FIELD - Math.ceil(width / 2) - 8);
    const cy = clamp(y, 38, FIELD - 14);
    if (cjk) {
      drawLabel(ctx, text, cx, cy - 4, 11, color, "center", "rgba(0,0,0,.9)");
    } else {
      drawText(ctx, text, cx, cy, scale, color, "center", "rgba(0,0,0,.9)");
    }
  }

  function drawTargetBracket(x, y, size, color, corner = 6, alpha = 1) {
    const half = Math.round(size / 2);
    const left = Math.round(x) - half;
    const top = Math.round(y) - half;
    const right = Math.round(x) + half;
    const bottom = Math.round(y) + half;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillRect(left, top, corner, 1);
    ctx.fillRect(left, top, 1, corner);
    ctx.fillRect(right - corner + 1, top, corner, 1);
    ctx.fillRect(right, top, 1, corner);
    ctx.fillRect(left, bottom, corner, 1);
    ctx.fillRect(left, bottom - corner + 1, 1, corner);
    ctx.fillRect(right - corner + 1, bottom, corner, 1);
    ctx.fillRect(right, bottom - corner + 1, 1, corner);
    ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2);
    ctx.globalAlpha = 1;
  }

  function drawDottedLine(x1, y1, x2, y2, color, alpha = 0.5) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const count = Math.max(2, Math.floor(Math.hypot(dx, dy) / 13));
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    for (let i = 1; i < count; i += 1) {
      const t = i / count;
      ctx.fillRect(Math.round(x1 + dx * t), Math.round(y1 + dy * t), 2, 2);
    }
    ctx.globalAlpha = 1;
  }

  function renderTargetingOverlay() {
    const owner = targetingOwner();
    if (!targeting || !owner) return;
    const definition = SKILL_DEFS[targeting.skill];
    const color = definition.color;
    const coop = players.length > 1;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, FIELD, FIELD);
    ctx.clip();

    ctx.fillStyle = "rgba(4, 9, 13, 0.35)";
    ctx.fillRect(0, 0, FIELD, FIELD);

    ctx.fillStyle = "rgba(3, 6, 6, 0.66)";
    ctx.fillRect(0, 0, FIELD, 34);
    ctx.fillStyle = "rgba(232, 181, 60, 0.28)";
    ctx.fillRect(0, 33, FIELD, 1);
    drawLabel(
      ctx,
      coop ? `${owner.label} 瞄准中` : "战术时间",
      FIELD / 2,
      6,
      14,
      "#f0e5c6",
      "center",
      "rgba(0,0,0,.85)"
    );
    drawLabel(
      ctx,
      targeting.skill === "mind" ? "选择目标" : "选择落点",
      FIELD / 2,
      22,
      9,
      color,
      "center"
    );
    drawLabel(ctx, `瞄准 ${Math.ceil(targeting.timer)}`, FIELD - 12, 6, 11, color, "right");

    if (targeting.skill === "mind") {
      for (const enemy of enemies) {
        if (!enemy.alive || enemy.charmed) continue;
        drawTargetBracket(enemy.x, enemy.y, 20, color, 4, 0.3);
      }

      const reticle = targeting.reticle;
      drawTargetBracket(reticle.x, reticle.y, 26, color, 7, 0.9);

      if (targeting.target) {
        const target = targeting.target;
        drawTargetBracket(target.x, target.y, 31, "#f0e5c6", 8, 0.95);
        drawClampedCenteredText(
          `已锁定 ${target.config.name}`,
          target.x,
          target.y - 27,
          1,
          color
        );
      } else {
        drawClampedCenteredText("无目标", reticle.x, reticle.y - 23, 1, "#ff917d");
      }
    } else {
      const maxRange = definition.distance;
      ctx.globalAlpha = 0.14;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(owner.x, owner.y, maxRange, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      drawDottedRing(owner.x, owner.y, maxRange, color, 40, visualTime * 0.35, 0.45);

      const marker = targeting.landing || targeting.reticle;
      const markerColor = targeting.valid ? color : "#ff806b";
      drawDottedLine(owner.x, owner.y, marker.x, marker.y, color, 0.35);
      drawTargetBracket(marker.x, marker.y, 28, markerColor, 8, 0.95);
      ctx.strokeStyle = markerColor;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.arc(marker.x, marker.y, 12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      drawClampedCenteredText(
        targeting.valid ? "LANDING READY" : "LANDING BLOCKED",
        marker.x,
        marker.y - 27,
        1,
        markerColor
      );
    }

    ctx.restore();
  }

  function dimField(alpha = 0.62) {
    ctx.fillStyle = `rgba(3, 7, 5, ${alpha})`;
    ctx.fillRect(0, 0, FIELD, FIELD);
  }

  function renderIntroOverlay() {
    dimField(0.58);
    const x = FIELD / 2;
    ctx.fillStyle = "rgba(232, 181, 60, 0.55)";
    ctx.fillRect(x - 126, 128, 252, 1);
    ctx.fillRect(x - 126, 330, 252, 1);
    drawLabel(ctx, `第 ${pad2(currentStage)} 关`, x, 146, 26, "#f2e7c2", "center", "#552b1b");
    drawLabel(ctx, stageConfig.chapter, x, 198, 34, "#e8b53c", "center", "rgba(0,0,0,.6)");
    drawText(ctx, stageConfig.name, x, 240, 2, "#8d6e2b", "center");
    drawLabel(
      ctx,
      stageConfig.endless ? "敌军无限" : `敌军 ${totalEnemies} 辆来袭`,
      x,
      268,
      12,
      "#77836c",
      "center"
    );
    if (stateTime > 1.3) {
      ctx.globalAlpha = 0.5 + Math.sin(visualTime * 8) * 0.3;
      drawLabel(ctx, "准备", x, 292, 18, "#e8b53c", "center");
      ctx.globalAlpha = 1;
    }
  }

  function renderPauseOverlay() {
    dimField(0.68);
    const x = FIELD / 2;
    drawLabel(ctx, "已暂停", x, 170, 28, "#f0e4c4", "center", "#4f291a");
    drawLabel(
      ctx,
      IS_SWITCH_HOST ? "按 + 键继续" : "按 P 键继续",
      x,
      226,
      12,
      "#aab49a",
      "center"
    );
    ctx.fillStyle = "rgba(232, 181, 60, 0.5)";
    ctx.fillRect(x - 70, 258, 140, 1);
  }

  function playerScoreLine() {
    if (players.length < 2) return "";
    return `P1 ${padScore(players[0] ? players[0].score : 0)}   P2 ${padScore(players[1] ? players[1].score : 0)}`;
  }

  function renderStageClearOverlay() {
    const fade = clamp((stateTime - 0.15) / 0.5, 0, 1);
    if (fade <= 0) return;
    ctx.globalAlpha = fade;
    dimField(0.68);
    const x = FIELD / 2;
    drawLabel(ctx, `第 ${pad2(currentStage)} 关通过`, x, 142, 26, "#f2d46f", "center", "#4d2d12");
    drawText(ctx, stageConfig.name, x, 188, 1, "#c9b77f", "center");
    drawLabel(ctx, `得分 ${padScore(score)}`, x, 214, 14, "#f1e4bd", "center", "rgba(0,0,0,.7)");
    if (players.length > 1) {
      drawText(ctx, playerScoreLine(), x, 246, 1, "#9fb0a2", "center");
    }
    drawLabel(ctx, "下一关", x, players.length > 1 ? 258 : 250, 10, "#7f8b76", "center");
    drawText(ctx, STAGES[currentStage].name, x, players.length > 1 ? 276 : 268, 2, "#e8b53c", "center", "rgba(0,0,0,.7)");
    if (Math.floor(visualTime * 2) % 2 === 0) {
      drawLabel(ctx, IS_SWITCH_HOST ? "按 A 键继续" : "按回车或点击继续", x, 302, 12, "#d8d2b4", "center");
    }
    ctx.globalAlpha = 1;
  }

  function renderGameOverOverlay() {
    const fade = clamp((stateTime - 0.25) / 0.55, 0, 1);
    if (fade <= 0) return;
    ctx.globalAlpha = fade;
    dimField(0.72);
    const x = FIELD / 2;
    drawLabel(ctx, "游戏结束", x, 151, 28, "#e36449", "center", "#421813");
    drawLabel(ctx, endReason, x, 194, 12, "#b89c84", "center");
    drawLabel(ctx, `得分 ${padScore(score)}`, x, 222, 14, "#f1e4bd", "center", "rgba(0,0,0,.7)");
    if (players.length > 1) {
      drawText(ctx, playerScoreLine(), x, 252, 1, "#9fb0a2", "center");
    }
    drawLabel(ctx, `最高 ${padScore(highScore)}`, x, players.length > 1 ? 262 : 252, 10, "#8e9784", "center");
    if (Math.floor(visualTime * 2) % 2 === 0) {
      drawLabel(ctx, IS_SWITCH_HOST ? "按 A 键重来" : "按回车键重来", x, 294, 12, "#e8b53c", "center");
    }
    ctx.globalAlpha = 1;
  }

  function renderVictoryOverlay() {
    const fade = clamp((stateTime - 0.2) / 0.6, 0, 1);
    if (fade <= 0) return;
    ctx.globalAlpha = fade;
    dimField(0.7);
    const x = FIELD / 2;
    drawLabel(ctx, "全部通关", x, 144, 28, "#f2d46f", "center", "#4d2d12");
    drawLabel(ctx, `三关全部通过`, x, 192, 12, "#b7c3a6", "center");
    drawLabel(ctx, `生命奖励  +${padScore(victoryBonus)}`, x, 214, 10, "#d8c98f", "center");
    drawLabel(ctx, `得分 ${padScore(score)}`, x, 238, 14, "#fff2c6", "center", "rgba(0,0,0,.7)");
    if (players.length > 1) {
      drawText(ctx, playerScoreLine(), x, 264, 1, "#9fb0a2", "center");
    }
    drawLabel(ctx, `最高 ${padScore(highScore)}`, x, players.length > 1 ? 276 : 266, 10, "#8e9784", "center");
    if (Math.floor(visualTime * 2) % 2 === 0) {
      drawLabel(ctx, IS_SWITCH_HOST ? "按 A 键再玩一次" : "按回车键再玩一次", x, 302, 12, "#e8b53c", "center");
    }
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------------------
  // The easter egg. Web shows the rich DOM version; this canvas version is the
  // Switch fallback (and a safety net if the overlay cannot mount).
  // ---------------------------------------------------------------------------

  function drawMiniEagle(cx, cy, shield) {
    const B = (x, y, w, h, color) => {
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(cx + x), Math.round(cy + y), w, h);
    };

    if (shield === "steel") {
      B(-20, -20, 40, 3, "#8c9b9a");
      B(-20, -17, 3, 34, "#8c9b9a");
      B(17, -17, 3, 34, "#8c9b9a");
      B(-17, 17, 34, 3, "#8c9b9a");
      B(-19, -19, 4, 1, "#c9d4d1");
      B(-19, -16, 1, 30, "#c9d4d1");
      B(18, -16, 1, 30, "#c9d4d1");
    } else if (shield === "brick") {
      B(-20, -20, 40, 4, "#8a4434");
      B(-20, -16, 4, 32, "#8a4434");
      B(16, -16, 4, 32, "#8a4434");
      B(-16, 16, 32, 4, "#8a4434");
      for (let i = -18; i < 18; i += 6) {
        B(i, -20, 3, 1, "#c06a4c");
        B(-20, i, 1, 3, "#c06a4c");
        B(19, i, 1, 3, "#c06a4c");
      }
    }

    B(-16, -16, 32, 32, "#17160f");
    B(-15, -15, 30, 30, "#6f5721");
    B(-13, -13, 26, 26, "#29271a");
    B(-11, -11, 22, 22, "#93702a");
    B(-9, -9, 18, 18, "#161a12");

    const G = "#d6a331";
    B(-2, -8, 4, 3, G);
    B(-3, -5, 6, 2, G);
    B(-6, -3, 12, 3, G);
    B(-5, 0, 10, 3, G);
    B(-3, 3, 6, 4, G);
    B(-1, 7, 2, 3, G);
    B(-10, 0, 4, 2, G);
    B(-12, 2, 4, 2, G);
    B(6, 0, 4, 2, G);
    B(8, 2, 4, 2, G);
    B(-1, -4, 2, 2, "#ffe17a");
  }

  function renderEndingOverlay() {
    const fade = clamp(stateTime / 1.15, 0, 1);
    ctx.save();
    ctx.globalAlpha = fade;

    const bg = ctx.createLinearGradient(0, 0, 0, FIELD);
    bg.addColorStop(0, "#0a140f");
    bg.addColorStop(0.55, "#0a110c");
    bg.addColorStop(1, "#040705");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, FIELD, FIELD);

    const halo = ctx.createRadialGradient(208, 58, 4, 208, 58, 170);
    halo.addColorStop(0, "rgba(232, 181, 60, 0.2)");
    halo.addColorStop(0.45, "rgba(217, 95, 59, 0.07)");
    halo.addColorStop(1, "rgba(232, 181, 60, 0)");
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, FIELD, FIELD);

    // Low battlefield silhouette: a horizon of tiny wrecks and grass.
    ctx.fillStyle = "rgba(232, 181, 60, 0.2)";
    ctx.fillRect(28, 372, 360, 1);
    for (let i = 0; i < 14; i += 1) {
      const x = 30 + i * 26;
      const h = 2 + ((i * 7) % 5);
      ctx.fillStyle = "rgba(120, 142, 104, 0.16)";
      ctx.fillRect(x, 373 - h, 3, h);
    }

    for (const petal of endingPetals) {
      ctx.globalAlpha = fade * 0.8;
      ctx.fillStyle = petal.color;
      ctx.fillRect(Math.round(petal.x), Math.round(petal.y), petal.size, petal.size);
    }
    ctx.globalAlpha = fade;

    drawText(ctx, "THE END", 208, 20, 4, "#f2d46f", "center", "#3c2010");
    drawLabel(ctx, "谢谢你，陪这只老鹰走完一生。", 208, 50, 11, "#aab49a", "center");
    ctx.fillStyle = "rgba(232, 181, 60, 0.5)";
    ctx.fillRect(124, 72, 168, 1);
    ctx.fillStyle = "rgba(232, 181, 60, 0.2)";
    ctx.fillRect(150, 75, 116, 1);

    const cards = [
      { x: 15, label: "01 YOUTH", name: "初生", notes: ["石头护着老鹰，", "放心去闯。"], shield: "steel", a: "#c9d4d1" },
      { x: 147, label: "02 MIDLIFE", name: "中坚", notes: ["只剩一层土墙，", "自己守住。"], shield: "brick", a: "#d58a63" },
      { x: 279, label: "03 OLD AGE", name: "落幕", notes: ["再无保护，", "一炮就结束。"], shield: "none", a: "#b9ae95" },
    ];
    const cardY = 86;
    const cardW = 122;
    const cardH = 118;
    for (const card of cards) {
      const cx = card.x + cardW / 2;
      ctx.fillStyle = "rgba(255, 255, 255, 0.035)";
      ctx.fillRect(card.x, cardY, cardW, cardH);
      ctx.fillStyle = "rgba(196, 204, 178, 0.16)";
      ctx.fillRect(card.x, cardY, cardW, 1);
      ctx.fillRect(card.x, cardY + cardH - 1, cardW, 1);
      ctx.fillRect(card.x, cardY, 1, cardH);
      ctx.fillRect(card.x + cardW - 1, cardY, 1, cardH);
      ctx.fillStyle = card.a;
      ctx.fillRect(cx - 11, cardY + 8, 22, 2);
      drawText(ctx, card.label, cx, cardY + 16, 1, card.a, "center");
      drawMiniEagle(cx, cardY + 52, card.shield);
      drawLabel(ctx, card.name, cx, cardY + 72, 16, "#f1e4bd", "center");
      drawLabel(ctx, card.notes[0], cx, cardY + 89, 9, "#8e9a84", "center");
      drawLabel(ctx, card.notes[1], cx, cardY + 101, 9, "#8e9a84", "center");
    }

    ctx.fillStyle = "rgba(232, 181, 60, 0.28)";
    ctx.fillRect(92, 218, 232, 1);

    drawLabel(ctx, "有一天，我们终会长大，", 208, 224, 11, "#e9e5d8", "center");
    drawLabel(ctx, "变成一个无聊且忙碌的大人，", 208, 238, 11, "#e9e5d8", "center");
    drawLabel(ctx, "慢慢老去，慢慢死去。", 208, 252, 11, "#e9e5d8", "center");
    drawLabel(ctx, "但无论多忙，都要留一点点时间给自己，", 208, 266, 11, "#f1cf72", "center");
    drawLabel(ctx, "做自己喜欢的事情。", 208, 280, 11, "#f1cf72", "center");
    drawLabel(ctx, "哪怕只是，再打一局曾经的坦克大战。", 208, 296, 11, "#aab49a", "center");

    if (Math.floor(visualTime * 2) % 2 === 0) {
      drawLabel(ctx, IS_SWITCH_HOST ? "按 A 键再玩一次" : "按回车键再玩一次", 208, 316, 12, "#e8b53c", "center");
    }
    drawLabel(ctx, "三关通关 · 感谢你把时间花在这里", 208, 334, 9, "#77836c", "center");
    drawLabel(ctx, "慢慢来 · 战争可以等", 208, 346, 9, "#77836c", "center");

    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function renderTitle() {
    ctx.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);
    ctx.fillStyle = "#050806";
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    if (terrainDirty || (!IS_SWITCH_HOST && !terrainCanvas)) rebuildTerrain();
    if (IS_SWITCH_HOST && window.__tankWarsHostTerrain) {
      ctx.putImageData(window.__tankWarsHostTerrain.imageData, 0, 0);
    } else {
      ctx.globalAlpha = 0.35;
      ctx.drawImage(terrainCanvas, 0, 0);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = "rgba(3, 7, 4, 0.63)";
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    if (!titleGradient) {
      titleGradient = ctx.createLinearGradient(0, 0, 0, VIEW_H);
      titleGradient.addColorStop(0, "rgba(7, 12, 8, 0.18)");
      titleGradient.addColorStop(0.5, "rgba(4, 8, 5, 0.04)");
      titleGradient.addColorStop(1, "rgba(2, 5, 3, 0.58)");
    }
    ctx.fillStyle = titleGradient;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    for (const dust of titleDust) {
      let y = (dust.y - visualTime * dust.speed) % VIEW_H;
      if (y < 0) y += VIEW_H;
      ctx.globalAlpha = dust.alpha * (0.55 + Math.sin(visualTime * 1.4 + dust.phase) * 0.35);
      ctx.fillStyle = dust.color;
      ctx.fillRect(Math.round(dust.x), Math.round(y), dust.size, dust.size);
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = "rgba(232, 181, 60, 0.36)";
    ctx.fillRect(0, 22, VIEW_W, 1);
    ctx.fillRect(0, VIEW_H - 24, VIEW_W, 1);
    drawLabel(ctx, "原创致敬版", VIEW_W / 2, 30, 10, "#7f8c74", "center");
    drawText(ctx, "01", 18, 34, 1, "#8d6e2b");
    drawLabel(ctx, "试玩版", VIEW_W - 18, 30, 10, "#6e7967", "right");

    drawText(ctx, "TANK", VIEW_W / 2, 80, 7, "#f0e3b9", "center", "#55251a");
    drawText(ctx, "WARS", VIEW_W / 2, 137, 7, "#e8b53c", "center", "#55251a");
    drawLabel(ctx, "坦克大战", VIEW_W / 2, 185, 11, "#e8b53c", "center", "rgba(0,0,0,.6)");

    ctx.fillStyle = "rgba(232, 181, 60, 0.6)";
    ctx.fillRect(VIEW_W / 2 - 100, 199, 200, 1);
    ctx.fillStyle = "rgba(232, 181, 60, 0.2)";
    ctx.fillRect(VIEW_W / 2 - 70, 202, 140, 1);

    drawLabel(ctx, "三关战役 / 1–2 人", VIEW_W / 2, 210, 10, "#b5a77b", "center");
    drawLabel(ctx, "初生 / 中坚 / 落幕", VIEW_W / 2, 226, 10, "#7f8b76", "center");
    drawLabel(ctx, "守护 / 坚守 / 放手", VIEW_W / 2, 242, 10, "#6f7b68", "center");

    renderTank({
      x: 226,
      y: 279,
      dir: "up",
      isPlayer: true,
      shield: 0,
      fireTier: 1,
      hitFlash: 0,
      maxHp: 1,
    }, PLAYER_PALETTE);
    renderTank({
      x: 294,
      y: 279,
      dir: "down",
      isPlayer: true,
      shield: 0,
      fireTier: 1,
      hitFlash: 0,
      maxHp: 1,
    }, PLAYER2_PALETTE);

    drawLabel(ctx, "人数", VIEW_W / 2 - 46, 296, 10, "#6f7b68", "center");
    const selectedColor = "#ffe58a";
    const idleColor = "#5c6759";
    drawText(ctx, "1", VIEW_W / 2 - 8, 296, 2, selectedPlayerCount === 1 ? selectedColor : idleColor, "center");
    drawText(ctx, "2", VIEW_W / 2 + 20, 296, 2, selectedPlayerCount === 2 ? selectedColor : idleColor, "center");
    ctx.fillStyle = selectedPlayerCount === 1 ? selectedColor : idleColor;
    ctx.fillRect(VIEW_W / 2 - 14, 314, 12, 1);
    ctx.fillStyle = selectedPlayerCount === 2 ? selectedColor : idleColor;
    ctx.fillRect(VIEW_W / 2 + 14, 314, 12, 1);
    if (Math.floor(visualTime * 1.8) % 2 === 0) {
      drawLabel(ctx, IS_SWITCH_HOST ? "按 A 键开始" : "按回车或点击开始", VIEW_W / 2, 322, 14, "#f2e7c2", "center", "rgba(0,0,0,.82)");
    }
    if (IS_SWITCH_HOST) {
      drawLabel(ctx, "十字键左右选择人数", VIEW_W / 2, 348, 9, "#8f9a84", "center");
      drawLabel(ctx, "P1 / P2：十字键移动  A 开火  X/Y/R 技能", VIEW_W / 2, 362, 9, "#8f9a84", "center");
    } else {
      drawLabel(ctx, "P1 WASD / 空格    P2 方向键 / 回车", VIEW_W / 2, 348, 9, "#8f9a84", "center");
      drawLabel(ctx, "1 / 2 选择人数   技能 Q/E/F · 7/8/9", VIEW_W / 2, 362, 9, "#77836c", "center");
    }
    drawLabel(ctx, `本地最高 ${padScore(highScore)}`, VIEW_W / 2, 376, 10, "#707b69", "center");
    if (PREVIEW_MODE) {
      drawLabel(ctx, "选关 1 / 2 / 3 / 4", VIEW_W / 2, 394, 9, "#8d6e2b", "center");
    }

    ctx.fillStyle = "rgba(255, 255, 255, 0.035)";
    ctx.fillRect(0, VIEW_H - 5, VIEW_W, 1);
  }

  // ---------------------------------------------------------------------------
  // Main loop
  // ---------------------------------------------------------------------------

  function update(dt) {
    if (state === "intro") {
      stateTime += dt;
      updateEffects(dt);
      if (stateTime >= 2.2) {
        state = "playing";
        stateTime = 0;
        spawnTimer = 0.9;
        syncUI();
      }
    } else if (state === "playing") {
      updatePlaying(dt);
    } else if (state === "gameover" || state === "victory" || state === "stageclear") {
      stateTime += dt;
      updateEffects(dt);
      if (state === "stageclear" && stateTime >= 3.4) advanceStage();
    } else if (state === "ending") {
      stateTime += dt;
      updateEffects(dt);
      updateEndingPetals(dt);
    } else if (state === "title") {
      stateTime += dt;
    }
  }

  // Fixed 60Hz simulation, rendered once per animation frame. This keeps
  // collisions, AI timers and movement identical on 60/120/144Hz displays.
  const STEP_MS = 1000 / 60;
  const MAX_FRAME_DELTA = 120;
  const MAX_STEPS_PER_FRAME = 5;
  let accumulator = 0;
  let lastTime = performance.now();

  function resetClock() {
    lastTime = performance.now();
    accumulator = 0;
  }

  function loop(now) {
    let frameDelta = now - lastTime;
    lastTime = now;
    if (!Number.isFinite(frameDelta) || frameDelta < 0) frameDelta = 0;
    frameDelta = Math.min(frameDelta, MAX_FRAME_DELTA);

    if (state !== "paused") {
      accumulator += frameDelta;
      let steps = 0;
      while (accumulator >= STEP_MS && steps < MAX_STEPS_PER_FRAME) {
        visualTime += 1 / 60;
        update(1 / 60);
        accumulator -= STEP_MS;
        steps += 1;
      }
      // If the machine fell far behind, drop the backlog instead of
      // fast-forwarding through 20 seconds of gameplay after a stall.
      if (steps === MAX_STEPS_PER_FRAME) accumulator = 0;
    }

    render();
    window.requestAnimationFrame(loop);
  }

  function boot() {
    loadStage(1, { resetRun: true });
    bindEvents();
    canvas.focus({ preventScroll: true });
    // The console has no autoplay policy, so initialize audio up front like
    // the reference project does. This also makes failures visible in the log.
    if (IS_SWITCH_HOST) {
      try {
        audio.ensure();
      } catch (error) {
        audio.failAudio(error);
      }
    }
    resetClock();
    const bootParams = new URLSearchParams(window.location.search);
    if (bootParams.has("players")) {
      selectedPlayerCount = clamp(Number(bootParams.get("players")) || 1, 1, 2);
    }
    if (bootParams.has("ending")) {
      // Preview the easter egg directly: index.html?ending=1
      beginEnding();
    } else if (bootParams.has("stage")) {
      jumpToStage(bootParams.get("stage"), bootParams.get("time") || 0);
      if (bootParams.has("finale")) {
        startFinale();
        if (bootParams.has("ft")) seekFinale(bootParams.get("ft"));
      }
    }
    window.requestAnimationFrame(loop);
  }

  if (window.__TANK_WARS_HOST__) {
    window.__tankWarsHost = {
      view: () => ({
        state,
        score,
        selectedPlayerCount,
        killed,
        converted,
        totalEnemies,
        currentStage,
        stageName: stageConfig.name,
        stageChapter: stageConfig.chapter,
        stageCount: STAGES.length,
        endless: Boolean(stageConfig.endless),
        finaleAt: stageConfig.finaleAt || 0,
        finale: finale ? { t: finale.t, fired: finale.fired, destroyed: finale.destroyed } : null,
        highScore,
        baseAlive: Boolean(base && base.alive),
        muted: audio.muted,
        audio: {
          ready: audio.ready,
          state: audio.ctx ? audio.ctx.state : "none",
          error: audio.audioError,
          t: audio.ctx ? Number(audio.ctx.currentTime.toFixed(2)) : 0,
        },
        players: players.map((p) => ({
          index: p.index,
          label: p.label,
          score: p.score,
          lives: p.lives,
          fireTier: p.fireTier,
          active: p.active,
          out: p.out,
          shield: p.shield,
          skills: Object.fromEntries(Object.entries(p.skills).map(([id, value]) => [id, {
            cooldown: value.cooldown,
            active: value.active,
          }])),
        })),
        targeting: targeting ? {
          ownerIndex: targeting.ownerIndex,
          skill: targeting.skill,
          timer: targeting.timer,
          valid: targeting.valid,
        } : null,
      }),
    };
  }

  if (window.__TANK_WARS_HOST__ || new URLSearchParams(window.location.search).has("debug")) {
    window.__tankWars = {
      start: startGame,
      goStage: jumpToStage,
      startFinale,
      seekFinale,
      beginEnding,
      setStageTime: (time) => {
        stateTime = Math.max(0, Number(time) || 0);
      },
      snapshot: () => ({
        state,
        stateTime,
        score,
        selectedPlayerCount,
        killed,
        converted,
        totalEnemies,
        currentStage,
        stageName: stageConfig.name,
        stageChapter: stageConfig.chapter,
        stageCount: STAGES.length,
        endless: Boolean(stageConfig.endless),
        finale: finale ? { t: finale.t, fired: finale.fired, destroyed: finale.destroyed } : null,
        highScore,
        base: { ...base },
        players: players.map((p) => ({
          index: p.index,
          label: p.label,
          x: p.x,
          y: p.y,
          dir: p.dir,
          shield: p.shield,
          fireTier: p.fireTier,
          score: p.score,
          lives: p.lives,
          active: p.active,
          out: p.out,
          respawnTimer: p.respawnTimer,
          skills: Object.fromEntries(Object.entries(p.skills).map(([id, value]) => [id, {
            cooldown: value.cooldown,
            active: value.active,
          }])),
        })),
        player: players[0] ? {
          x: players[0].x,
          y: players[0].y,
          dir: players[0].dir,
          shield: players[0].shield,
          fireTier: players[0].fireTier,
        } : null,
        enemies: enemies.filter((e) => e.alive).map((e) => ({
          x: e.x,
          y: e.y,
          type: e.type,
          hp: e.hp,
          dir: e.dir,
          pathLength: e.path ? e.path.length : 0,
          pathIndex: e.pathIndex,
          baseCooldown: e.baseCooldown,
          charmed: Boolean(e.charmed),
          ally: Boolean(e.ally),
        })),
        teleportGhosts: teleportGhosts.length,
        targeting: targeting ? {
          ownerIndex: targeting.ownerIndex,
          skill: targeting.skill,
          timer: targeting.timer,
          reticle: { ...targeting.reticle },
          valid: targeting.valid,
          target: targeting.target ? { x: targeting.target.x, y: targeting.target.y, type: targeting.target.type } : null,
          landing: targeting.landing ? { ...targeting.landing } : null,
        } : null,
        bullets: bullets.filter((b) => b.alive).map((b) => ({ x: b.x, y: b.y, side: b.side, dir: b.dir, credit: b.credit ? b.credit.label : null })),
        powerups: powerups.map((p) => ({ x: p.x, y: p.y, life: p.life })),
        pendingSpawn: pendingSpawn ? { ...pendingSpawn } : null,
        spawnQueue: spawnQueue.slice(),
        map: map.map((row) => row.join("")),
      }),
      setPlayerCount: (count) => {
        selectedPlayerCount = clamp(Number(count) || 1, 1, 2);
        syncUI();
      },
      warpPlayer: (x, y, playerIndex = 0) => {
        const p = players[playerIndex];
        if (!p) return;
        p.x = x;
        p.y = y;
      },
      setShield: (seconds, playerIndex = 0) => {
        const p = players[playerIndex];
        if (p) p.shield = seconds;
      },
      addEnemyBullet: (x, y, dir = "down") => {
        bullets.push({
          x,
          y,
          dir,
          speed: 160,
          side: "enemy",
          source: null,
          damage: 1,
          life: 4,
          alive: true,
          charmedShot: false,
        });
      },
      forceSkillUI: () => syncSkillUI(true),
      addTarget: (type = "basic", x = 16, y = 272, speed = 0) => {
        const target = makeEnemy(type, x, y);
        target.speed = speed;
        target.path = speed > 0 ? null : [];
        target.fireTimer = 999;
        target.repathTimer = speed > 0 ? 0.2 : 999;
        enemies.push(target);
      },
      destroyBase,
      stageClear,
      addScore: (amount) => {
        const p = players[0];
        if (p) {
          p.score += amount;
          refreshTeamScore();
        }
      },
    };
  }

  boot();
})();
