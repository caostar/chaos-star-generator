// Lava / flowing magma
float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float noise3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
                 mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                 mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec3 p = vWorldPos * 0.018;
  float t = iTime * 0.2;
  float n = 0.0; float amp = 0.5;
  for (int i = 0; i < 5; i++) { n += amp * noise3(p + vec3(0.0, t, 0.0)); p *= 2.0; amp *= 0.5; }
  vec3 hot = mix(vec3(0.05, 0.0, 0.0), vec3(1.0, 0.4, 0.05), smoothstep(0.3, 0.7, n));
  hot = mix(hot, vec3(1.0, 0.95, 0.6), smoothstep(0.65, 0.85, n));
  fragColor = vec4(hot, 1.0);
}
