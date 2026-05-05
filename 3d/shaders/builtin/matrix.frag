// Matrix-style falling glyphs
float rand1(float x) { return fract(sin(x * 91.345) * 47453.5453); }
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 grid = vec2(40.0, 80.0);
  vec2 p = vUv * grid;
  vec2 ip = floor(p);
  vec2 fp = fract(p);
  float colSpeed = 0.5 + rand1(ip.x) * 1.5;
  float colOff   = rand1(ip.x + 7.0) * 10.0;
  float trail    = fract((ip.y + iTime * colSpeed + colOff) / grid.y);
  float bright   = pow(1.0 - trail, 3.0);
  float charBlink = step(0.5, rand1(ip.x * 31.0 + ip.y + floor(iTime * 8.0)));
  float ch = step(0.4, fract(sin(dot(ip + floor(iTime * 8.0), vec2(11.0, 7.0))) * 43758.0));
  float mask = step(0.3, fp.x) * step(0.3, fp.y) * step(fp.x, 0.7) * step(fp.y, 0.7);
  vec3 col = vec3(0.1, 1.0, 0.3) * bright * mask * (0.4 + 0.6 * charBlink * ch);
  fragColor = vec4(col, 1.0);
}
