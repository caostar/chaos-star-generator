// Starfield — points of light on dark, drifting
float hash21(vec2 p) { return fract(sin(dot(p, vec2(91.345, 47.853))) * 43758.5453); }
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = vUv * vec2(40.0, 20.0);
  uv.x += iTime * 0.3;
  vec2 ip = floor(uv);
  vec2 fp = fract(uv) - 0.5;
  float h = hash21(ip);
  float starMask = step(0.985, h);
  float d = length(fp);
  float twinkle = 0.5 + 0.5 * sin(iTime * (2.0 + h * 4.0) + h * 6.28);
  float bright = starMask * smoothstep(0.45, 0.0, d) * (0.5 + 0.5 * twinkle);
  vec3 tint = vec3(0.7, 0.85, 1.0) + 0.4 * vec3(hash21(ip + 1.0), hash21(ip + 2.0), hash21(ip + 3.0));
  vec3 col = vec3(0.01, 0.0, 0.04) + tint * bright;
  fragColor = vec4(col, 1.0);
}
