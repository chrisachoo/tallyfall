let audioCtx: AudioContext | null = null;
let muted = false;

export function setMuted(next: boolean) {
  muted = next;
}

function context(): AudioContext | null {
  if (muted) return null;
  try {
    audioCtx ??= new AudioContext();
    return audioCtx;
  } catch {
    return null;
  }
}

export function playClearTone(chainIndex: number) {
  const ctx = context();
  if (!ctx) return;
  void ctx.resume();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.value = 280 * Math.pow(1.22, chainIndex);
  gain.gain.value = 0.05;
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.14);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.14);
}

export function playInvalidTone() {
  const ctx = context();
  if (!ctx) return;
  void ctx.resume();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = 140;
  gain.gain.value = 0.03;
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.1);
}
