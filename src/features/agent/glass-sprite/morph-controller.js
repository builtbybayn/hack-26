import { BlobSurface } from "./surface.js";
import { STATES, VISUAL } from "./visual-settings.js";

export class MorphController {
  constructor(surface, state = "idle") {
    if (!STATES.includes(state)) throw new RangeError("Unknown state: " + state);
    this.surface = surface;
    this.blob = new BlobSurface(surface);
    this.selectedState = this.settledState = state;
    this.transitionProgress = 1;
    this.transitionElapsed = 0;
    this.transitioning = false;
    this.time = 0;
    this.reactionAge = state === "error" ? 2 : 0;
    this.animated = true;
    this.motionSpeed = 1;
    this.drag = {
      x: 1,
      y: 0,
      stretch: 0,
      targetStretch: 0,
      ripple: 0,
      impulse: 0,
      age: 2,
      active: false,
    };
    const length = surface.idle.length;
    this.positions = new Float64Array(length);
    this.velocity = new Float64Array(length);
    this.target = new Float64Array(length);
    this.from = new Float64Array(length);
    this.fromVelocity = new Float64Array(length);
    // Idle, research, error, pitch, yaw, and hover.
    this.parameters = new Float64Array(6);
    this.parameterVelocity = new Float64Array(6);
    this.targetParameters = new Float64Array(6);
    this.fromParameters = new Float64Array(6);
    this.fromParameterVelocity = new Float64Array(6);
    this.sampleTarget();
    this.positions.set(this.target);
    this.parameters.set(this.targetParameters);
  }

  setState(state) {
    if (!STATES.includes(state)) throw new RangeError("Unknown state: " + state);
    if (state === this.selectedState) return false;
    this.from.set(this.positions);
    this.fromVelocity.set(this.velocity);
    this.fromParameters.set(this.parameters);
    this.fromParameterVelocity.set(this.parameterVelocity);
    this.selectedState = state;
    this.reactionAge = 0;
    this.transitioning = true;
    this.transitionElapsed = this.transitionProgress = 0;
    return true;
  }

  setInteraction({
    x = this.drag.x,
    y = this.drag.y,
    stretch = 0,
    ripple = false,
    active = false,
  } = {}) {
    const length = Math.hypot(x, y) || 1;
    this.drag.x = x / length;
    this.drag.y = y / length;
    if (this.drag.active && !active) {
      this.drag.impulse = Math.max(this.drag.stretch, 0.18);
      this.drag.age = 0;
    }
    this.drag.active = active;
    this.drag.targetStretch = active ? Math.max(0, Math.min(1, stretch)) : 0;
    if (ripple) this.drag.ripple = 1;
  }

  sampleTarget() {
    const state = this.selectedState,
      t = this.time,
      p = this.targetParameters;
    this.blob.sample(t, state, this.reactionAge, this.target, this.drag);
    p.fill(0);
    p[STATES.indexOf(state)] = 1;
    p[3] = (state === "researching" ? 0.09 : 0.035) * Math.sin(t * 0.62);
    p[4] = (state === "idle" ? 0.065 : 0.18) * Math.sin(t * 0.7);
    p[5] =
      state === "idle"
        ? 0.19 * Math.sin(t * 0.82)
        : state === "researching"
          ? 0.21 * Math.sin(t * 3.8) +
            0.055 * Math.sin(t * 2.17) +
            0.12 * Math.exp(-this.reactionAge * 2) * Math.sin(this.reactionAge * 7)
          : 0.09 * Math.sin(t * 1.32) -
            0.08 * Math.exp(-this.reactionAge * 4) * Math.sin(this.reactionAge * 11);
  }

  update(dt) {
    if (!(dt > 0)) return;
    dt = Math.min(dt, 0.05);
    if (this.animated) {
      this.time += dt * this.motionSpeed;
      this.reactionAge += dt * this.motionSpeed;
    }
    this.drag.stretch += (this.drag.targetStretch - this.drag.stretch) * (1 - Math.exp(-dt * 16));
    this.drag.ripple *= Math.exp(-dt * 4.5);
    this.drag.age += dt;
    this.sampleTarget();
    if (this.transitioning) {
      this.transitionElapsed += dt;
      this.transitionProgress = Math.min(1, this.transitionElapsed / VISUAL.transitionSeconds);
    }
    const u = this.transitionProgress;
    const blend = u * u * u * (10 + u * (-15 + 6 * u));
    const carry = VISUAL.transitionSeconds * u * (1 - u) ** 3 * (1 + 3 * u);
    for (let i = 0; i < this.positions.length; i++) {
      const next = this.transitioning
        ? (1 - blend) * this.from[i] + blend * this.target[i] + carry * this.fromVelocity[i]
        : this.target[i];
      this.velocity[i] = (next - this.positions[i]) / dt;
      this.positions[i] = next;
    }
    for (let i = 0; i < 6; i++) {
      const next = this.transitioning
        ? (1 - blend) * this.fromParameters[i] +
          blend * this.targetParameters[i] +
          (i > 2 ? carry * this.fromParameterVelocity[i] : 0)
        : this.targetParameters[i];
      this.parameterVelocity[i] = (next - this.parameters[i]) / dt;
      this.parameters[i] = next;
    }
    if (this.transitioning && u === 1) {
      this.transitioning = false;
      this.settledState = this.selectedState;
    }
  }
}
