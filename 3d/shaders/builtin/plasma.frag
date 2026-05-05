// Plasma — classic sine-mix
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 p = vObjectPos.xy * 0.08 + vObjectPos.z * 0.05;
  float t = iTime * 0.5;
  float v = sin(p.x + t) + sin(p.y * 1.3 + t * 1.1) + sin((p.x + p.y) * 0.7 + t * 0.7);
  v += sin(length(p) * 1.5 - t);
  v *= 0.25;
  vec3 col = 0.5 + 0.5 * cos(vec3(0.0, 2.0, 4.0) + v * 6.2831 + iTime * 0.2);
  fragColor = vec4(col, 1.0);
}
