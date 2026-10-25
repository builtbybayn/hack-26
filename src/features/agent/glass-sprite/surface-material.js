import * as THREE from "three";

export function createSurfaceMaterial(environment) {
  const uniforms = {
    uResearch: { value: 0 },
    uError: { value: 0 },
    uTime: { value: 0 },
    uBackdrop: { value: null },
    uViewport: { value: new THREE.Vector2(1, 1) },
    uReaction: { value: 0 },
    uEye: { value: new THREE.Vector3(0, 0, 7.7) },
  };
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0,
    roughness: 0.035,
    transmission: 1,
    thickness: 0.48,
    ior: 1.39,
    attenuationColor: 0xffffff,
    attenuationDistance: 100,
    clearcoat: 0.14,
    clearcoatRoughness: 0.025,
    envMap: environment,
    envMapIntensity: 0.5,
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
      varying vec3 vLocal;
      varying vec3 vLocalNormal;
    `,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
      vLocal = position;
      vLocalNormal = normal;
    `,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
      uniform float uResearch, uError, uTime, uReaction;
      uniform vec3 uEye;
      uniform sampler2D uBackdrop;
      uniform vec2 uViewport;
      varying vec3 vLocal;
      varying vec3 vLocalNormal;
      float gaussian(float x) { return exp(-x * x); }

      // One 3D fluid field for both emotional states. No separate red geometry.
      float liquidDensity(vec3 p, float t) {
        float angle = .5 * sin(t * .47) + p.y * .85;
        p.xz = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * p.xz;
        float wave = .32 * sin(p.x * 2.7 + p.z * 1.9 + t * 1.3)
          + .16 * sin(p.z * 3.6 - p.x * 1.5 - t * .93);
        float sheet = gaussian((p.y - wave) / .08);
        float strand = gaussian((length(p.xy - vec2(.12 * sin(t), -.08))
          - (.56 + .12 * sin(p.z * 3.0 + t))) / .065);
        float envelope = 1.0 - smoothstep(.85, 1.24, length(p));
        float opening = .45 + .55 * gaussian((p.z + .25 * sin(t * .7)) / .72);
        return envelope * (sheet * opening + strand * .65);
      }

      vec4 innerLiquid(vec3 surface) {
        float activity = clamp(uResearch + uError, 0.0, 1.0);
        vec3 ray = refract(normalize(surface - uEye), normalize(vLocalNormal), 1.0 / 1.39);
        vec3 light = vec3(0.0);
        float coverage = 0.0;
        float t = uTime;
        vec3 deepColor = mix(vec3(.48, .22, .035), vec3(.39, .012, .025), uError);
        vec3 energyColor = mix(vec3(1.0, .64, .19), vec3(1.0, .085, .10), uError);
        float pulse = 1.0 + uError * (.2 * sin(t * 8.7) * sin(t * 5.3) + .35 * uReaction);
        // Front-to-back integration gives strands their own opacity, leaving gaps clear.
        for (int i = 0; i < 20; i++) {
          vec3 p = surface + ray * (.10 + float(i) * .145);
          float density = liquidDensity(p, t) * activity * pulse;
          float alpha = 1.0 - exp(-density * .32);
          float highlight = gaussian((p.y + p.z * .35 - .16 * sin(t)) / .2);
          vec3 color = mix(deepColor, energyColor, .65 + .35 * highlight);
          light += (1.0 - coverage) * alpha * color;
          coverage += (1.0 - coverage) * alpha;
        }
        return vec4(light, coverage);
      }
    `,
      )
      .replace(
        "#include <transmission_fragment>",
        `#include <transmission_fragment>
      // The interface backdrop is sampled explicitly below; retain physical
      // Fresnel/clearcoat reflections without adding the backdrop twice.
      totalDiffuse = vec3(0.0);
    `,
      )
      .replace(
        "#include <opaque_fragment>",
        `
      float facing = clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
      float fresnel = pow(1.0 - facing, 5.0);
      vec4 liquid = innerLiquid(vLocal);
      // Only a thin grazing reflection: no broad painted-on central softboxes.
      outgoingLight += vec3(.92, .95, 1.0) * fresnel * .85;
      float shellAlpha = clamp(.035 + .10 * pow(1.0 - facing, 2.0) + fresnel * .48, .035, .615);
      // Three r180 clears the transmission target to white at half alpha on
      // transparent canvases. That placeholder is not actual DOM coverage.
      float glassAlpha = shellAlpha + liquid.a * (1.0 - shellAlpha);
      #include <opaque_fragment>
      gl_FragColor.a = glassAlpha;
    `,
      )
      .replace(
        "#include <tonemapping_fragment>",
        `#include <tonemapping_fragment>
      // Compose in linear light before sRGB conversion. Premultiplied liquid
      // radiance is divided only once; clear pixels do not attenuate HTML behind us.
      // Screen-space refraction of the sampled interface surface. The real DOM
      // remains visible through clear pixels; only the curved edge overlays a
      // displaced sample. The current sidebar is a solid painted surface.
      vec2 screenUV = gl_FragCoord.xy / uViewport;
      vec2 offset = normalize(normal).xy * (1.0 - facing) * (material.ior - 1.0) * material.thickness * .72;
      vec3 backdrop = texture2D(uBackdrop, clamp(screenUV - offset, .001, .999)).rgb;
      vec3 shellColor = backdrop + max(gl_FragColor.rgb, vec3(0.0)) * .65;
      vec3 composite = shellColor * shellAlpha + liquid.rgb * (1.0 - shellAlpha);
      gl_FragColor.rgb = composite / max(glassAlpha, .0001);
    `,
      );
  };
  material.customProgramCacheKey = () => "research-hollow-liquid-v9";
  return { material, uniforms };
}
