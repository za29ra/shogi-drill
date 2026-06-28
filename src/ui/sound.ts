// ごく軽い効果音（WebAudio）。設定でオフにできる。

let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new Ctor();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, startOffset: number, dur: number, type: OscillatorType = 'sine', gain = 0.18): void {
  const c = ac();
  if (!c) return;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t0 = c.currentTime + startOffset;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export function playSelect(on: boolean): void {
  if (!on) return;
  tone(660, 0, 0.06, 'triangle', 0.1);
}

export function playMove(on: boolean): void {
  if (!on) return;
  tone(420, 0, 0.07, 'square', 0.08);
}

export function playCorrect(on: boolean): void {
  if (!on) return;
  tone(660, 0, 0.1, 'sine', 0.16);
  tone(880, 0.09, 0.12, 'sine', 0.16);
}

export function playWrong(on: boolean): void {
  if (!on) return;
  tone(200, 0, 0.18, 'sawtooth', 0.12);
}

export function playFinish(on: boolean): void {
  if (!on) return;
  tone(660, 0, 0.12, 'sine', 0.16);
  tone(880, 0.1, 0.12, 'sine', 0.16);
  tone(1320, 0.22, 0.2, 'sine', 0.16);
}
