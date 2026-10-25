import { FRAGMENT_SHADER, VERTEX_SHADER } from "./fluid-shaders";

export interface FluidFrame {
  time: number;
  weights: readonly number[];
  pointer: readonly [number, number];
  color: readonly [number, number, number];
}

/** Small native WebGL renderer; no scene library, assets, external requests, or retained app state. */
export function createFluidRenderer(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext("webgl", {
    alpha: true,
    antialias: false,
    depth: false,
    premultipliedAlpha: false,
    powerPreference: "low-power",
  });
  if (!gl) return null;
  const resources: WebGLShader[] = [];
  function compile(type: number, source: string) {
    const shader = gl!.createShader(type);
    if (!shader) throw new Error("Could not create fluid shader.");
    resources.push(shader);
    gl!.shaderSource(shader, source);
    gl!.compileShader(shader);
    if (!gl!.getShaderParameter(shader, gl!.COMPILE_STATUS))
      throw new Error(gl!.getShaderInfoLog(shader) ?? "Could not compile fluid shader.");
    return shader;
  }
  let program: WebGLProgram | null = null;
  let buffer: WebGLBuffer | null = null;
  function dispose() {
    if (buffer) gl!.deleteBuffer(buffer);
    if (program) gl!.deleteProgram(program);
    resources.forEach((shader) => gl!.deleteShader(shader));
  }
  try {
    program = gl.createProgram();
    if (!program) throw new Error("Could not create fluid program.");
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX_SHADER));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error("Could not link fluid program.");
    gl.useProgram(program);
    buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const position = gl.getAttribLocation(program, "aPosition");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const uniforms = {
      resolution: gl.getUniformLocation(program, "uResolution"),
      time: gl.getUniformLocation(program, "uTime"),
      weights: gl.getUniformLocation(program, "uWeights[0]"),
      pointer: gl.getUniformLocation(program, "uPointer"),
      color: gl.getUniformLocation(program, "uColor"),
    };
    return {
      render(frame: FluidFrame) {
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
        gl.uniform1f(uniforms.time, frame.time);
        gl.uniform1fv(uniforms.weights, frame.weights);
        gl.uniform2f(uniforms.pointer, ...frame.pointer);
        gl.uniform3f(uniforms.color, ...frame.color);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      },
      dispose,
    };
  } catch {
    dispose();
    return null;
  }
}
