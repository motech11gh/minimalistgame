// 100% Procedural Web Audio Synthesizer for weight-scaled combat feedback

class TacticalSoundEngine {
  private ctx: AudioContext | null = null;
  public muted = false;

  private ensureContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

  public playGunshot(suppressed: boolean, isHeavy: boolean) {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const pitchJitter = 0.94 + Math.random() * 0.12;

    // Noise burst for propellant crack
    const bufferSize = Math.floor(ctx.sampleRate * (suppressed ? 0.06 : 0.13));
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.35));
    }

    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = suppressed ? 'bandpass' : 'lowpass';
    filter.frequency.setValueAtTime(
      (suppressed ? 950 : isHeavy ? 1400 : 2200) * pitchJitter,
      now
    );

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(suppressed ? 0.14 : isHeavy ? 0.32 : 0.24, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (suppressed ? 0.06 : 0.13));

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);

    // Low-end mechanical thump
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime((isHeavy ? 110 : 165) * pitchJitter, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + 0.09);

    oscGain.gain.setValueAtTime(suppressed ? 0.12 : 0.25, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.095);
  }

  public playHitMarker(isKill: boolean) {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = isKill ? 'sawtooth' : 'sine';
    osc.frequency.setValueAtTime(isKill ? 880 : 1320, now);
    if (isKill) {
      osc.frequency.setValueAtTime(1180, now + 0.04);
    }

    gain.gain.setValueAtTime(isKill ? 0.2 : 0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (isKill ? 0.14 : 0.05));

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + (isKill ? 0.15 : 0.055));
  }

  public playMovementAction(action: 'slide' | 'vault' | 'climb' | 'build' | 'pickup' | 'stim') {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    if (action === 'slide') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(240, now);
      osc.frequency.exponentialRampToValueAtTime(95, now + 0.18);
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.19);
    } else if (action === 'vault' || action === 'climb') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.exponentialRampToValueAtTime(310, now + 0.12);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.14);
    } else if (action === 'build') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.setValueAtTime(480, now + 0.06);
      osc.frequency.setValueAtTime(640, now + 0.12);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.23);
    } else if (action === 'pickup' || action === 'stim') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(980, now + 0.16);
      gain.gain.setValueAtTime(0.16, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.19);
    }
  }

  public playTelegraphAlert() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(420, now);
    osc.frequency.linearRampToValueAtTime(760, now + 0.22);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.25);
  }

  public playOutcomeSting(victory: boolean) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = victory ? [440, 554.37, 659.25, 880] : [330, 293.66, 246.94, 196];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.11);
      gain.gain.setValueAtTime(0.16, now + idx * 0.11);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.11 + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.11);
      osc.stop(now + idx * 0.11 + 0.3);
    });
  }
}

export const soundEngine = new TacticalSoundEngine();
