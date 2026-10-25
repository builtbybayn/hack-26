import * as THREE from "three";
import { createSurface, uploadSurface } from "./surface.js";
import { LiquidInteraction } from "./liquid-interaction.js";
import { MorphController } from "./morph-controller.js";
import { createSurfaceMaterial } from "./surface-material.js";
import { STATES, VISUAL } from "./visual-settings.js";

export class ResearchSprite {
  constructor({ container, state = "idle", animated = true, transparent = false } = {}) {
    if (!container) throw new Error("ResearchSprite needs a container");
    if (!STATES.includes(state)) throw new RangeError(`Unknown state: ${state}`);
    this.container = container;
    this.dead = false;
    this.transparent = transparent;
    this.clock = new THREE.Clock();
    this.scene = new THREE.Scene();
    if (!transparent) {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 256;
      const context = canvas.getContext("2d");
      const gradient = context.createRadialGradient(128, 118, 12, 128, 128, 190);
      gradient.addColorStop(0, "#171c20");
      gradient.addColorStop(1, "#0b0d10");
      context.fillStyle = gradient;
      context.fillRect(0, 0, 256, 256);
      this.backdrop = new THREE.CanvasTexture(canvas);
      this.backdrop.colorSpace = THREE.SRGBColorSpace;
      this.scene.background = this.backdrop;
    }
    this.camera = new THREE.PerspectiveCamera(VISUAL.cameraFov, 1, 0.1, 100);
    this.camera.position.z = VISUAL.cameraDistance;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, VISUAL.pixelRatioLimit));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.setClearColor(0x000000, transparent ? 0 : 1);
    this.renderer.domElement.setAttribute("role", "img");
    this.renderer.domElement.setAttribute("aria-label", "Research core animated state preview");
    this.container.appendChild(this.renderer.domElement);

    this.scene.add(new THREE.HemisphereLight(0x77746d, 0x050608, 1.0));
    const key = new THREE.DirectionalLight(0xffe3aa, 2.6);
    key.position.set(3, 4, 5);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x83a9d8, 1.3);
    rim.position.set(-4, 1, -3);
    this.scene.add(rim);
    const warm = new THREE.PointLight(0xff8b35, 0.35, 5);
    this.scene.add(warm);

    // The same soft reflection environment stays on the glass in every state.
    // Broad studio softboxes, captured once. No visible background or external HDR asset.
    const room = new THREE.Scene();
    room.background = new THREE.Color(0.16, 0.19, 0.23);
    const panels = [];
    const panel = (color, intensity, x, y, z, w, h) => {
      const geometry = new THREE.PlaneGeometry(w, h);
      const material = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
      material.color.multiplyScalar(intensity);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z);
      mesh.lookAt(0, 0, 0);
      room.add(mesh);
      panels.push(mesh);
    };
    panel(0xf4f8ff, 3, -3, 3, 4, 2.6, 5);
    panel(0xb9d9ff, 1.8, 4, 1, 1, 1.2, 5);
    panel(0xffe7be, 1.3, 0, -3, -3, 4, 1.4);
    panel(0xffffff, 2, 0, 5, -2, 4, 2);
    const generator = new THREE.PMREMGenerator(this.renderer);
    this.environment = generator.fromScene(room, 0.025, 0.1, 30);
    panels.forEach((mesh) => {
      mesh.geometry.dispose();
      mesh.material.dispose();
    });
    generator.dispose();
    this.interfaceCanvas = document.createElement("canvas");
    this.interfaceCanvas.width = this.interfaceCanvas.height = 128;
    this.interfaceBackdrop = new THREE.CanvasTexture(this.interfaceCanvas);
    this.interfaceBackdrop.colorSpace = THREE.SRGBColorSpace;
    this.surface = createSurface();
    this.controller = new MorphController(this.surface, state);
    this.controller.animated = animated;
    this.liquidInteraction = new LiquidInteraction(this.surface);
    const appearance = createSurfaceMaterial(this.environment.texture);
    this.material = appearance.material;
    this.uniforms = appearance.uniforms;
    this.uniforms.uBackdrop.value = this.interfaceBackdrop;
    this.body = new THREE.Mesh(this.surface.geometry, this.material);
    this.scene.add(this.body);
    this.bindPointerInteraction();
    this.eye = new THREE.Vector3();

    this.motionPreference = matchMedia("(prefers-reduced-motion: reduce)");
    this.onMotionPreference = () => {
      this.controller.motionSpeed = this.motionPreference.matches ? VISUAL.reducedMotionSpeed : 1;
    };
    this.onMotionPreference();
    this.motionPreference.addEventListener("change", this.onMotionPreference);
    this.contextLost = false;
    this.onContextLost = (event) => {
      event.preventDefault();
      this.contextLost = true;
    };
    this.onContextRestored = () => {
      this.contextLost = false;
      this.clock.getDelta();
      this.resize();
    };
    this.renderer.domElement.addEventListener("webglcontextlost", this.onContextLost);
    this.renderer.domElement.addEventListener("webglcontextrestored", this.onContextRestored);
    this.onVisibility = () => {
      this.clock.getDelta();
    };
    document.addEventListener("visibilitychange", this.onVisibility);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.resize();
    this.liquidInteraction.positions.set(this.controller.positions);
    this.syncSurface();
    this.frame = () => this.render();
    this.render();
  }

  get state() {
    return this.controller.settledState;
  }
  get targetState() {
    return this.controller.selectedState;
  }
  get transitionProgress() {
    return this.controller.transitionProgress;
  }

  setState(state) {
    return this.controller.setState(state);
  }
  setInteraction(interaction) {
    this.controller.setInteraction(interaction);
  }
  setAnimationEnabled(enabled) {
    this.controller.animated = Boolean(enabled);
  }

  bindPointerInteraction() {
    const element = this.renderer.domElement;
    const raycaster = new THREE.Raycaster(),
      pointer = new THREE.Vector2();
    const plane = new THREE.Plane(),
      anchor = new THREE.Vector3(),
      world = new THREE.Vector3(),
      normal = new THREE.Vector3();
    let gesture = null,
      suppressClick = false;
    const ray = (event) => {
      const rect = element.getBoundingClientRect();
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        (-(event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, this.camera);
    };
    const down = (event) => {
      if (gesture || event.button !== 0 || this.contextLost) return;
      ray(event);
      this.body.updateMatrixWorld();
      const hit = raycaster.intersectObject(this.body, false)[0];
      if (!hit) return;
      this.camera.getWorldDirection(normal);
      plane.setFromNormalAndCoplanarPoint(normal, hit.point);
      anchor.copy(this.body.worldToLocal(hit.point.clone()));
      this.liquidInteraction.grab(anchor, this.liquidInteraction.positions);
      gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, dragged: false };
      suppressClick = false;
      element.setPointerCapture(event.pointerId);
      element.dataset.grabbed = "true";
    };
    const move = (event) => {
      if (!gesture || gesture.id !== event.pointerId) return;
      gesture.dragged ||= Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 5;
      if (!gesture.dragged) return;
      event.preventDefault();
      ray(event);
      if (raycaster.ray.intersectPlane(plane, world)) {
        this.body.worldToLocal(world);
        world.sub(anchor);
        this.liquidInteraction.move(world);
      }
    };
    const end = (event) => {
      if (!gesture || gesture.id !== event.pointerId) return;
      suppressClick = gesture.dragged || event.type !== "pointerup";
      gesture = null;
      this.liquidInteraction.release();
      element.dataset.grabbed = "false";
      if (element.hasPointerCapture(event.pointerId))
        element.releasePointerCapture(event.pointerId);
    };
    const click = (event) => {
      if (suppressClick) {
        event.preventDefault();
        event.stopPropagation();
        suppressClick = false;
      }
    };
    const blur = () => {
      if (gesture) end({ pointerId: gesture.id, type: "cancel" });
    };
    const handlers = {
      pointerdown: down,
      pointermove: move,
      pointerup: end,
      pointercancel: end,
      lostpointercapture: end,
      click,
    };
    Object.entries(handlers).forEach(([name, fn]) => element.addEventListener(name, fn));
    window.addEventListener("blur", blur);
    this.disposePointerInteraction = () => {
      blur();
      Object.entries(handlers).forEach(([name, fn]) => element.removeEventListener(name, fn));
      window.removeEventListener("blur", blur);
    };
  }

  // This is a diagnostic surface rendered by Three.js, not an orb CSS effect.
  setContrastBackdrop(enabled) {
    this.contrastBackdrop = Boolean(enabled);
    this.updateInterfaceBackdrop();
    this.scene.background = enabled ? this.interfaceBackdrop : this.backdrop || null;
  }

  updateInterfaceBackdrop() {
    const context = this.interfaceCanvas.getContext("2d");
    if (this.contrastBackdrop) {
      for (let y = 0; y < 128; y += 16)
        for (let x = 0; x < 128; x += 16) {
          context.fillStyle = ((x + y) / 16) % 2 ? "#82929f" : "#384958";
          context.fillRect(x, y, 16, 16);
        }
    } else {
      // Sample painted ancestor surfaces from back to front on resize, not per
      // frame. HTML text stays in the compositor and is never replaced by gray.
      const ancestors = [];
      for (let node = this.container; node; node = node.parentElement) ancestors.push(node);
      context.clearRect(0, 0, 128, 128);
      context.fillStyle = "#262626";
      context.fillRect(0, 0, 128, 128);
      for (const node of ancestors.reverse()) {
        context.fillStyle = getComputedStyle(node).backgroundColor;
        context.fillRect(0, 0, 128, 128);
      }
    }
    this.interfaceBackdrop.needsUpdate = true;
  }

  syncSurface() {
    const p = this.controller.parameters;
    uploadSurface(this.surface, this.liquidInteraction.positions);
    this.body.rotation.set(p[3], p[4], 0);
    this.body.position.y = p[5];
    const agitation = p[2] * (this.motionPreference?.matches ? 0.12 : 0.65);
    this.body.position.x =
      p[1] *
        (0.07 * Math.sin(this.controller.time * 1.7) +
          0.025 * Math.sin(this.controller.time * 3.1)) +
      agitation *
        (0.085 * Math.sin(this.controller.time * 32) + 0.025 * Math.sin(this.controller.time * 47));
    this.body.rotation.z =
      p[1] * 0.065 * Math.sin(this.controller.time * 2.1) +
      agitation * 0.085 * Math.sin(this.controller.time * 23);
    const squash =
      p[1] *
        (0.07 * Math.sin(this.controller.time * 3.8) +
          0.02 * Math.sin(this.controller.time * 5.1)) +
      agitation * 0.05 * Math.sin(this.controller.time * 17);
    this.body.scale.set(1 - squash * 0.5, 1 + squash, 1 - squash * 0.5);
    this.body.updateMatrixWorld();
    this.uniforms.uResearch.value = p[1];
    this.uniforms.uError.value = p[2];
    // Integrate speed rather than multiplying time on state changes (no phase jump).
    this.uniforms.uTime.value = this.energyTime || 0;
    this.uniforms.uReaction.value = Math.exp(-this.controller.reactionAge * 2.8) * p[2];
    this.eye.copy(this.camera.position);
    this.body.worldToLocal(this.eye);
    this.uniforms.uEye.value.copy(this.eye);
  }

  render() {
    if (this.dead) return;
    const dt = this.clock.getDelta();
    if (
      !this.contextLost &&
      !document.hidden &&
      this.container.getClientRects().length &&
      getComputedStyle(this.container).visibility !== "hidden"
    ) {
      // Suspended tabs cannot fast-forward a transition on resume.
      this.controller.update(Math.min(dt, 0.05));
      this.liquidInteraction.update(dt, this.controller.positions, this.motionPreference.matches);
      if (this.controller.animated)
        this.energyTime =
          (this.energyTime || 0) +
          Math.min(dt, 0.05) *
            this.controller.motionSpeed *
            (1 + this.controller.parameters[1] * 0.65 + this.controller.parameters[2] * 1.5);
      this.syncSurface();
      this.renderer.render(this.scene, this.camera);
    }
    this.raf = requestAnimationFrame(this.frame);
  }

  resize() {
    const { width, height } = this.container.getBoundingClientRect();
    if (!width || !height) return;
    this.camera.aspect = width / height;
    // Keep the original framing on desktop; fit the same mass on narrow screens.
    this.camera.position.z = VISUAL.cameraDistance / Math.min(1, this.camera.aspect);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.renderer.getDrawingBufferSize(this.uniforms.uViewport.value);
    this.updateInterfaceBackdrop();
  }

  dispose() {
    if (this.dead) return;
    this.dead = true;
    cancelAnimationFrame(this.raf);
    this.disposePointerInteraction?.();
    this.observer.disconnect();
    this.motionPreference.removeEventListener("change", this.onMotionPreference);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.renderer.domElement.removeEventListener("webglcontextlost", this.onContextLost);
    this.renderer.domElement.removeEventListener("webglcontextrestored", this.onContextRestored);
    this.surface.geometry.dispose();
    this.material.dispose();
    this.environment.dispose();
    this.backdrop?.dispose();
    this.interfaceBackdrop.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}

export const researchSpriteStates = STATES;
