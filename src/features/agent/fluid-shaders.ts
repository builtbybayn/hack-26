export const VERTEX_SHADER = `
attribute vec2 aPosition;
varying vec2 vUv;
void main() {
  vUv = aPosition;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

/** Continuous implicit surfaces with shared advection, surface tension, and studio reflections. */
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
float smoothMax(float a, float b, float k) { return -smoothUnion(-a,-b,k); }
float ellipsoid(vec3 p, vec3 size) {
  float k0 = length(p/size);
  float k1 = length(p/(size*size));
  return k0*(k0-1.0)/max(k1,0.0001);
}
float crystal(vec3 p) {
  vec3 q = sqrt(p*p+0.0015);
  float phi = 1.618033989;
  float d = dot(q, normalize(vec3(1.0)));
  d = smoothMax(d,dot(q,normalize(vec3(0.0,1.0/phi,phi))),0.18);
  d = smoothMax(d,dot(q,normalize(vec3(1.0/phi,phi,0.0))),0.18);
  d = smoothMax(d,dot(q,normalize(vec3(phi,0.0,1.0/phi))),0.18);
  return mix(d-0.73,length(p)-0.83,0.23);
}
float liquidStar(vec3 p, float lengthening, float radial) {
  float r = length(p);
  vec3 n = p/max(r,0.0001);
  float phi = 1.618033989;
  // Even directional harmonics blend every lobe continuously. Selecting a nearest
  // cone produces creases where cones meet; summing smooth peaks has no such seams.
  vec3 q = abs(n);
  float axial = pow(q.x,12.0)+pow(q.y,12.0)+pow(q.z,12.0);
  float petals = pow(abs(dot(n,normalize(vec3(0.0,1.0,phi)))),28.0)
               + pow(abs(dot(n,normalize(vec3(0.0,1.0,-phi)))),28.0)
               + pow(abs(dot(n,normalize(vec3(1.0,phi,0.0)))),28.0)
               + pow(abs(dot(n,normalize(vec3(1.0,-phi,0.0)))),28.0)
               + pow(abs(dot(n,normalize(vec3(phi,0.0,1.0)))),28.0)
               + pow(abs(dot(n,normalize(vec3(-phi,0.0,1.0)))),28.0);
  float crest = mix(axial,petals,radial);
  return (r-(0.55+(0.24+lengthening)*crest))*0.40;
}
float liquidCone(vec3 p) {
  p.x -= 0.12*sin(p.y*1.5+uTime*0.28)*(p.y+0.8);
  vec2 q = vec2(length(p.xz),p.y);
  vec2 k1 = vec2(0.05,0.67), k2 = vec2(-0.61,1.34);
  vec2 ca = vec2(q.x-min(q.x,q.y<0.0?0.66:0.05),abs(q.y)-0.67);
  vec2 cb = q-k1+k2*clamp(dot(k1-q,k2)/dot(k2,k2),0.0,1.0);
  float signD = cb.x<0.0 && ca.y<0.0 ? -1.0 : 1.0;
  return signD*sqrt(min(dot(ca,ca),dot(cb,cb)))-0.10;
}
float freeFlow(vec3 p) {
  float t = uTime*0.38;
  // Four connected volumes exchange prominence without separating into particles.
  float d = ellipsoid(p,vec3(0.43,0.49,0.43));
  vec3 a = vec3(0.49*cos(t),0.40*sin(t*0.91),0.32*sin(t*0.76));
  vec3 b = vec3(-0.42*cos(t*0.83),0.46*cos(t*0.72),-0.32*sin(t));
  vec3 c = vec3(0.35*sin(t*0.67),-0.46*cos(t*0.81),0.36*cos(t*0.93));
  d = smoothUnion(d,length(p-a)-(0.40+0.055*sin(t)),0.38);
  d = smoothUnion(d,length(p-b)-(0.39+0.045*cos(t*0.8)),0.36);
  d = smoothUnion(d,length(p-c)-0.37,0.34);
  return d;
}
float field(vec3 p) {
  float t = uTime;
  p.y -= 0.035*sin(t*0.58);
  // Incompressible-looking counter motion: twist and stretch share a continuous clock.
  p.xz = rotate(0.14*sin(p.y*2.0+t*0.36))*p.xz;
  vec3 flow = vec3(sin(p.y*2.6+t*0.51),sin(p.z*2.3-t*0.43),sin(p.x*2.4+t*0.37));
  p += flow*(0.035+uWeights[0]*0.025);
  float d = 0.0;
  if (uWeights[0]>0.0001) d += uWeights[0]*freeFlow(p);
  if (uWeights[1]>0.0001) d += uWeights[1]*crystal(p);
  if (uWeights[2]>0.0001) d += uWeights[2]*liquidStar(p,0.16+0.07*sin(t*0.6),0.0);
  if (uWeights[3]>0.0001) {
    vec3 q = p;
    q.yz = rotate(0.82)*q.yz;
    float a = atan(q.z,q.x);
    float major = 0.55+0.045*sin(3.0*a+t*0.55);
    float minor = 0.235+0.028*cos(3.0*a-t*0.4);
    d += uWeights[3]*(length(vec2(length(q.xz)-major,q.y))-minor);
  }
  if (uWeights[4]>0.0001) {
    vec3 offset = vec3(0.38,0.14*sin(t*0.5),0.10*cos(t*0.4));
    d += uWeights[4]*smoothUnion(length(p-offset)-0.48,length(p+offset)-0.48,0.38+0.1*sin(t*0.4));
  }
  if (uWeights[5]>0.0001) {
    vec3 q = p;
    q.yz = rotate(0.72)*q.yz;
    float a = atan(q.z,q.x);
    float major = 0.53+0.08*cos(3.0*a+t*0.3);
    vec2 ring = vec2(length(q.xz)-major,q.y-0.13*sin(3.0*a+t*0.3));
    ring = rotate(a*1.5-t*0.28)*ring;
    d += uWeights[5]*(length(ring/vec2(1.0,0.72))-0.245)*0.65;
  }
  if (uWeights[6]>0.0001) d += uWeights[6]*liquidCone(p);
  if (uWeights[7]>0.0001) d += uWeights[7]*liquidStar(p,0.17+0.08*sin(t*1.25),1.0);
  if (uWeights[8]>0.0001) {
    vec3 q = abs(p);
    d += uWeights[8]*(pow(pow(q.x,5.0)+pow(q.y,5.0)+pow(q.z,5.0),0.2)-0.67)*0.8;
  }
  // Long capillary waves add curvature, never fine noisy texture.
  d += 0.008*sin(p.x*6.0+p.y*3.0+t*0.7)*sin(p.z*4.0-t*0.5);
  return d;
}
vec3 normalAt(vec3 p) {
  vec2 e = vec2(0.0012,-0.0012);
  return normalize(e.xyy*field(p+e.xyy)+e.yyx*field(p+e.yyx)
                  +e.yxy*field(p+e.yxy)+e.xxx*field(p+e.xxx));
}
vec3 environment(vec3 r) {
  // A studio panorama: broad ribbons and negative space, rather than point-light dots.
  vec3 pearl = mix(vec3(0.94,0.97,1.0),uColor,0.09);
  vec3 violet = mix(uColor,vec3(0.62,0.48,0.86),0.32);
  vec3 blue = mix(uColor.brg,vec3(0.42,0.77,0.90),0.7);
  float sky = smoothstep(-0.4,0.8,r.y);
  vec3 result = mix(violet*0.045,pearl*0.25,sky);
  float arc = r.y-0.24*sin(r.x*2.8+0.7)-0.15;
  float ribbon = exp(-pow(arc/0.095,2.0));
  float edge = exp(-pow((arc+0.21)/0.035,2.0));
  float longBox = exp(-pow((r.x+0.46*r.y+0.42)/0.17,2.0));
  float darkBand = exp(-pow((arc-0.20)/0.12,2.0));
  result *= 1.0-darkBand*0.78;
  result += pearl*ribbon*2.8 + blue*edge*0.8;
  result += mix(pearl,blue,0.3)*longBox*1.6;
  result += violet*pow(max(0.0,-r.y),3.0)*0.5;
  return result;
}
void main() {
  vec2 uv = vUv;
  uv.x *= uResolution.x/uResolution.y;
  vec3 origin = vec3(0.0,0.0,3.6);
  vec3 ray = normalize(vec3(uv*1.20,-3.0));
  float yaw = 0.38+uTime*0.075+uPointer.x*0.38;
  float pitch = -0.23+0.13*sin(uTime*0.17)+uPointer.y*0.25;
  origin.yz=rotate(pitch)*origin.yz; ray.yz=rotate(pitch)*ray.yz;
  origin.xz=rotate(yaw)*origin.xz; ray.xz=rotate(yaw)*ray.xz;
  float b=dot(origin,ray);
  float disc=b*b-dot(origin,origin)+1.30*1.30;
  if (disc<0.0) { gl_FragColor=vec4(0.0); return; }
  float distance=max(0.0,-b-sqrt(disc));
  float end=-b+sqrt(disc);
  float hit=0.0;
  vec3 p=vec3(0.0);
  // Tighter convergence and retina backing remove the faceted, stair-stepped silhouette.
  for (int i=0;i<160;i++) {
    p=origin+ray*distance;
    float d=field(p);
    if (d<0.00065) { hit=1.0; break; }
    distance+=max(d*0.60,0.00035);
    if (distance>end) break;
  }
  if (hit<0.5) { gl_FragColor=vec4(0.0); return; }
  vec3 n=normalAt(p);
  vec3 reflection=reflect(ray,n);
  float facing=max(dot(n,-ray),0.0);
  float fresnel=pow(1.0-facing,3.0);
  vec3 reflected=environment(reflection);
  // Pearlescent liquid: clear reflected ribbons over a softly transmitted, colored body.
  vec3 transmission=environment(refract(ray,n,0.72));
  vec3 tint=mix(vec3(0.76,0.84,0.94),uColor,0.27);
  vec3 color=reflected*mix(0.82,0.98,fresnel)+transmission*tint*0.09;
  float film=0.5+0.5*sin(facing*5.5+dot(n,vec3(1.1,0.8,0.6)));
  color+=mix(uColor*0.08,uColor.brg*0.10,film)*(0.3+fresnel);
  // Ground the folds with a short local occlusion probe without adding a floor or shadow.
  float occlusion=clamp(field(p+n*0.13)/0.13,0.35,1.0);
  color*=0.72+0.28*occlusion;
  color=color/(vec3(0.6)+color);
  color=pow(color,vec3(0.84));
  gl_FragColor=vec4(color,1.0);
}
`;
