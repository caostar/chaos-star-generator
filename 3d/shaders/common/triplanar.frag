// Triplanar texture material — wraps a 2D image around the chaos sphere
// without the pole-pinching of spherical UVs. Three independent samples
// (XZ, XY, YZ projections of object-space position) blended by squared
// surface-normal weights.

precision highp float;

uniform sampler2D uTex;
uniform float     uScale;
uniform vec2      uOffset;
uniform vec3      uLightDir;
uniform float     uShaded;       // 0.0 = unlit, 1.0 = lit

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorldPos;
varying vec3 vObjectPos;

void main() {
  vec3 n = normalize(vNormal);
  vec3 blend = pow(abs(n), vec3(4.0));
  blend /= max(blend.x + blend.y + blend.z, 0.0001);

  vec2 uvX = vObjectPos.zy * uScale + uOffset;
  vec2 uvY = vObjectPos.xz * uScale + uOffset;
  vec2 uvZ = vObjectPos.xy * uScale + uOffset;

  vec3 cx = texture2D(uTex, uvX).rgb;
  vec3 cy = texture2D(uTex, uvY).rgb;
  vec3 cz = texture2D(uTex, uvZ).rgb;

  vec3 col = cx * blend.x + cy * blend.y + cz * blend.z;

  // Cheap directional shading
  float ndotl = max(dot(n, normalize(uLightDir)), 0.0);
  vec3 lit = col * (0.35 + 0.85 * ndotl);
  col = mix(col, lit, uShaded);

  gl_FragColor = vec4(col, 1.0);
}
