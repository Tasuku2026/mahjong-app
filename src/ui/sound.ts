// 効果音（WebAudio で合成。音声ファイルは使わない）

let ctx: AudioContext | null = null;
let enabled = true;

export function setSoundEnabled(on: boolean): void {
  enabled = on;
}

/** ユーザー操作のタイミングで呼ぶ（スマホでは操作をきっかけにしないと音が出ない） */
export function unlockAudio(): void {
  try {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null;
  }
}

function ac(): AudioContext | null {
  if (!enabled) return null;
  if (!ctx) unlockAudio();
  return ctx;
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.18): void {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + start;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

/** 牌を卓に置く「カチッ」という音 */
function click(gain = 0.5, freq = 2400): void {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime;
  const len = Math.floor(c.sampleRate * 0.05);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 6);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = 1.4;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(c.destination);
  src.start(t0);
  // 低い「コトッ」
  tone(320, 0, 0.06, 'triangle', 0.12);
}

export const sfx = {
  discard: () => click(0.55, 2200),
  select: () => click(0.18, 3200),
  call: () => {
    tone(660, 0, 0.12, 'triangle', 0.16);
    tone(990, 0.08, 0.18, 'triangle', 0.16);
  },
  riichi: () => {
    tone(523, 0, 0.5, 'sine', 0.14);
    tone(784, 0.02, 0.5, 'sine', 0.12);
    tone(1568, 0.1, 0.35, 'triangle', 0.06);
  },
  win: () => {
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.09, 0.45, 'triangle', 0.15));
    tone(2093, 0.48, 0.6, 'sine', 0.06);
  },
  /** 満貫・跳満などのはんこ */
  stamp: () => {
    tone(110, 0, 0.25, 'sine', 0.3);
    click(0.6, 900);
    tone(1319, 0.05, 0.4, 'triangle', 0.08);
  },
  /** 役満のファンファーレ */
  yakuman: () => {
    [523, 659, 784, 1047, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, i * 0.11, 0.5, 'triangle', 0.14));
    [1047, 1319, 1568, 2093].forEach((f) => tone(f, 0.95, 1.2, 'sine', 0.07));
  },
  draw: () => {
    tone(392, 0, 0.35, 'sine', 0.12);
    tone(294, 0.22, 0.5, 'sine', 0.12);
  },
};
