// Voronoi cells crawling on the surface
vec2 hash22(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 p = vUv * 12.0;
  vec2 ip = floor(p);
  vec2 fp = fract(p);
  float minD = 1.0;
  vec2 cell;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = hash22(ip + g);
      o = 0.5 + 0.5 * sin(iTime * 0.6 + 6.2831 * o);
      vec2 r = g + o - fp;
      float d = dot(r, r);
      if (d < minD) { minD = d; cell = ip + g; }
    }
  }
  vec3 col = 0.5 + 0.5 * cos(vec3(0.0, 2.0, 4.0) + dot(cell, vec2(0.3, 0.5)));
  col *= sqrt(minD) * 1.6;
  fragColor = vec4(col, 1.0);
}
