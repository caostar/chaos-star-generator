// Swirling kaleidoscopic
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 p = vUv * 2.0 - 1.0;
  float a = atan(p.y, p.x);
  float r = length(p);
  float t = iTime * 0.5;
  a += sin(r * 8.0 - t) * 0.5;
  float v = sin(a * 6.0 + t * 1.3) * 0.5 + 0.5;
  v *= sin(r * 14.0 - t * 2.0) * 0.5 + 0.5;
  vec3 col = 0.5 + 0.5 * cos(vec3(0.0, 2.0, 4.0) + v * 6.2831 + a);
  fragColor = vec4(col, 1.0);
}
