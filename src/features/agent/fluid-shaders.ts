export const VERTEX_SHADER = `
attribute vec2 aPosition;
varying vec2 vUv;
void main() {
  vUv = aPosition;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

/** All forms are fields in the same space, shaded by the same environment. No meshes swap. */
export const FRAGMENT_SHADER = `
precision highp float;
varying vec2 vUv;
uniform vec2 uResolution;
uniform float uTime;
uniform float uWeights[9];
uniform vec2 uPointer;
uniform vec3 uColor;

mat2 rotate(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
float smoothUnion(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b-a)/k, 0.0, 1.0);
  return mix(b, a, h) - k*h*(1.0-h);
}
float polyhedron(vec3 p) {
  // Face normals of a regular icosahedron (the dodecahedron's twenty vertices).
  vec3 q = abs(p);
  float phi = 1.618033989;
  float d = dot(q, normalize(vec3(1.0)));
  d = max(d, dot(q, normalize(vec3(0.0, 1.0/phi, phi))));
  d = max(d, dot(q, normalize(vec3(1.0/phi, phi, 0.0))));
  d = max(d, dot(q, normalize(vec3(phi, 0.0, 1.0/phi))));
  return d - 0.68;
}
float torus(vec3 p, float major, float minor) {
  return length(vec2(length(p.xz)-major, p.y)) - minor;
}
float cone(vec3 p) {
  // Exact capped cone distance, rounded slightly at its edges.
  vec2 q = vec2(length(p.xz), p.y);
  vec2 k1 = vec2(0.06, 0.72), k2 = vec2(-0.64, 1.44);
  vec2 ca = vec2(q.x-min(q.x, q.y < 0.0 ? 0.70 : 0.06), abs(q.y)-0.72);
  vec2 cb = q-k1+k2*clamp(dot(k1-q,k2)/dot(k2,k2),0.0,1.0);
  float s = cb.x < 0.0 && ca.y < 0.0 ? -1.0 : 1.0;
  return s*sqrt(min(dot(ca,ca),dot(cb,cb))) - 0.045;
}
float spikes(vec3 p, float strength, float radial) {
  float r = length(p);
  vec3 n = p / max(r, 0.0001);
  float phi = 1.618033989;
  // Six axial or twelve icosahedral cones merge into the same liquid core.
  vec3 q = abs(n);
  float peak = max(dot(q, normalize(vec3(0.0,1.0,phi))),
               max(dot(q, normalize(vec3(1.0,phi,0.0))), dot(q,normalize(vec3(phi,0.0,1.0)))));
  peak = mix(max(q.x,max(q.y,q.z)),peak,radial);
  float along = peak*r;
  float across = sqrt(max(0.0,r*r-along*along));
  float needle = max((across-(0.65+strength-along)*0.34)*0.947,-along+0.34);
  return smoothUnion(r-0.53,needle,0.12);
}
float field(vec3 p) {
  // A shared low-frequency displacement gives every solid the same subtle liquid skin.
  float skin = 0.012*sin(p.x*5.0+uTime*0.8)*sin(p.y*4.0-uTime*0.6)*sin(p.z*5.0+uTime*0.4);
  float d = 0.0;
  if (uWeights[0] > 0.001) {
    vec3 q = p;
    q.x *= 1.0 + 0.10*sin(uTime*0.55);
    q.y *= 1.0 - 0.08*sin(uTime*0.55);
    float flow = 0.11*sin(q.x*3.0+uTime*0.6)*cos(q.y*2.8-uTime*0.45)
               +0.075*sin(q.z*3.5-uTime*0.5)*cos(q.x*2.5+uTime*0.3);
    d += uWeights[0]*(length(q)-0.75+flow);
  }
  if (uWeights[1] > 0.001) d += uWeights[1]*polyhedron(p);
  if (uWeights[2] > 0.001) d += uWeights[2]*spikes(p,0.43,0.0);
  if (uWeights[3] > 0.001) d += uWeights[3]*torus(p,0.55,0.245);
  if (uWeights[4] > 0.001) {
    float shift = 0.37+0.025*sin(uTime*0.8);
    d += uWeights[4]*smoothUnion(length(p-vec3(shift,0.08,0.0))-0.49,
                                length(p+vec3(shift,0.08,0.0))-0.49,0.32);
  }
  if (uWeights[5] > 0.001) {
    vec3 q = p;
    float a = atan(q.z,q.x);
    vec2 ring = vec2(length(q.xz)-0.53,q.y);
    ring = rotate(a*1.5+uTime*0.15)*ring;
    float twist = pow(pow(abs(ring.x),4.0)+pow(abs(ring.y),4.0),0.25)-0.24;
    d += uWeights[5]*twist*0.7;
  }
  if (uWeights[6] > 0.001) d += uWeights[6]*cone(p);
  if (uWeights[7] > 0.001) d += uWeights[7]*spikes(p,0.43+0.11*sin(uTime*2.4),1.0);
  if (uWeights[8] > 0.001) {
    vec3 q = abs(p)-vec3(0.54);
    d += uWeights[8]*(length(max(q,0.0))+min(max(q.x,max(q.y,q.z)),0.0)-0.085);
  }
  return d + skin;
}
vec3 normalAt(vec3 p) {
  vec2 e = vec2(0.0015,-0.0015);
  return normalize(e.xyy*field(p+e.xyy)+e.yyx*field(p+e.yyx)
                  +e.yxy*field(p+e.yxy)+e.xxx*field(p+e.xxx));
}
void main() {
  vec2 uv = vUv;
  uv.x *= uResolution.x/uResolution.y;
  vec3 origin = vec3(0.0,0.0,3.5);
  vec3 ray = normalize(vec3(uv*1.38,-3.0));
  // Rotate the camera, keeping all shape fields and lighting coherent through a morph.
  float yaw = 0.42+uTime*0.15+uPointer.x*0.32;
  float pitch = -0.32+0.10*sin(uTime*0.23)+uPointer.y*0.23;
  origin.yz = rotate(pitch)*origin.yz; ray.yz = rotate(pitch)*ray.yz;
  origin.xz = rotate(yaw)*origin.xz; ray.xz = rotate(yaw)*ray.xz;
  // Analytic bounds skip empty pixels and start marching at the object's bounding sphere.
  float b = dot(origin,ray);
  float disc = b*b-dot(origin,origin)+1.25*1.25;
  if (disc < 0.0) { gl_FragColor=vec4(0.0); return; }
  float distance = max(0.0,-b-sqrt(disc));
  float end = -b+sqrt(disc);
  float hit = 0.0;
  vec3 p = vec3(0.0);
  for (int i=0;i<88;i++) {
    p = origin+ray*distance;
    float d = field(p);
    if (d < 0.0018) { hit=1.0; break; }
    distance += max(d*0.72,0.0008);
    if (distance > end) break;
  }
  if (hit < 0.5) { gl_FragColor=vec4(0.0); return; }
  vec3 n = normalAt(p);
  vec3 view = -ray;
  vec3 reflection = reflect(ray,n);
  vec3 key = normalize(vec3(-0.8,1.6,2.2));
  vec3 fill = normalize(vec3(1.8,-0.5,0.4));
  float diffuse = max(dot(n,key),0.0);
  float fresnel = pow(1.0-max(dot(n,view),0.0),3.0);
  // Broad studio softboxes reflect as long clean highlights on a liquid-metal surface.
  float softbox = pow(max(dot(reflection,key),0.0),22.0);
  float strip = pow(max(dot(reflection,fill),0.0),36.0);
  float band = smoothstep(0.82,0.92,reflection.y)*0.34;
  vec3 pearl = mix(vec3(0.89,0.91,0.96),uColor,0.18);
  vec3 base = mix(uColor*0.32,pearl,0.25+0.42*diffuse);
  vec3 color = base + pearl*(softbox*0.85+strip*0.65+band);
  color += mix(uColor,pearl,0.55)*fresnel*0.48;
  color *= 0.78+0.22*smoothstep(-0.85,0.75,p.y);
  color = pow(color,vec3(0.88));
  gl_FragColor = vec4(color,1.0);
}
`;
