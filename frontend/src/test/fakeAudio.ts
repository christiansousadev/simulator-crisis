// minimal web audio shim for unit tests: records param automation and node lifecycles so the
// audio engine can be verified without a real AudioContext (jsdom has none)

export interface ParamCall {
  type: "set" | "linear" | "exp" | "target" | "cancel";
  args: number[];
}

export class FakeParam {
  value: number;
  calls: ParamCall[] = [];
  constructor(initial = 0) {
    this.value = initial;
  }
  setValueAtTime(v: number, t: number) {
    this.calls.push({ type: "set", args: [v, t] });
    this.value = v;
    return this;
  }
  linearRampToValueAtTime(v: number, t: number) {
    this.calls.push({ type: "linear", args: [v, t] });
    return this;
  }
  exponentialRampToValueAtTime(v: number, t: number) {
    this.calls.push({ type: "exp", args: [v, t] });
    return this;
  }
  setTargetAtTime(v: number, t: number, tc: number) {
    this.calls.push({ type: "target", args: [v, t, tc] });
    return this;
  }
  cancelScheduledValues(t: number) {
    this.calls.push({ type: "cancel", args: [t] });
    return this;
  }
  lastTarget(): number | undefined {
    return [...this.calls].reverse().find((c) => c.type === "target")?.args[0];
  }
}

export class FakeNode {
  connections: unknown[] = [];
  disconnected = false;
  onended: (() => void) | null = null;
  started = false;
  stopped = false;
  connect(dest: unknown) {
    this.connections.push(dest);
    return dest;
  }
  disconnect() {
    this.disconnected = true;
  }
  start() {
    this.started = true;
  }
  stop() {
    this.stopped = true;
  }
  // test helper: pretend the source finished playing
  end() {
    this.onended?.();
  }
}

class FakeGain extends FakeNode {
  gain = new FakeParam(1);
}
class FakeOsc extends FakeNode {
  type = "sine";
  frequency = new FakeParam(440);
  detune = new FakeParam(0);
}
class FakeFilter extends FakeNode {
  type = "lowpass";
  frequency = new FakeParam(350);
  Q = new FakeParam(1);
}
class FakeCompressor extends FakeNode {
  threshold = new FakeParam(-24);
  knee = new FakeParam(30);
  ratio = new FakeParam(12);
  attack = new FakeParam(0.003);
  release = new FakeParam(0.25);
}
class FakeDelay extends FakeNode {
  delayTime = new FakeParam(0);
}
class FakeBufferSource extends FakeNode {
  buffer: unknown = null;
  loop = false;
}

export class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  currentTime = 0;
  state: "suspended" | "running" | "closed" = "suspended";
  sampleRate = 8000;
  destination = new FakeNode();
  nodes: FakeNode[] = [];
  gains: FakeGain[] = [];
  oscillators: FakeOsc[] = [];
  closed = false;

  constructor() {
    FakeAudioContext.instances.push(this);
  }
  private track<T extends FakeNode>(n: T): T {
    this.nodes.push(n);
    return n;
  }
  resume() {
    this.state = "running";
    return Promise.resolve();
  }
  close() {
    this.closed = true;
    this.state = "closed";
    return Promise.resolve();
  }
  createGain() {
    const g = this.track(new FakeGain());
    this.gains.push(g);
    return g as unknown as GainNode;
  }
  createOscillator() {
    const o = this.track(new FakeOsc());
    this.oscillators.push(o);
    return o as unknown as OscillatorNode;
  }
  createBiquadFilter() {
    return this.track(new FakeFilter()) as unknown as BiquadFilterNode;
  }
  createDynamicsCompressor() {
    return this.track(new FakeCompressor()) as unknown as DynamicsCompressorNode;
  }
  createDelay() {
    return this.track(new FakeDelay()) as unknown as DelayNode;
  }
  createBufferSource() {
    return this.track(new FakeBufferSource()) as unknown as AudioBufferSourceNode;
  }
  createBuffer(_channels: number, length: number) {
    const data = new Float32Array(length);
    return { duration: length / this.sampleRate, getChannelData: () => data } as unknown as AudioBuffer;
  }
}

// fire onended on every started source of the context, like a real engine would after stop()
export function endAllSources(ctx: FakeAudioContext) {
  for (const n of ctx.nodes) if (n.started) n.end();
}

export function installFakeAudio(): typeof FakeAudioContext {
  FakeAudioContext.instances = [];
  (globalThis as Record<string, unknown>).AudioContext = FakeAudioContext;
  return FakeAudioContext;
}

export function uninstallFakeAudio() {
  delete (globalThis as Record<string, unknown>).AudioContext;
  delete (globalThis as Record<string, unknown>).webkitAudioContext;
}
