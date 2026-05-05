// Crystalline facets (triplanar bands of cool colour)
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec3 n = normalize(vNormal);
  float bandX = sin(vWorldPos.x * 0.06 + iTime * 0.4);
  float bandY = sin(vWorldPos.y * 0.06 - iTime * 0.5);
  float bandZ = sin(vWorldPos.z * 0.06 + iTime * 0.3);
  float v = abs(bandX * n.x) + abs(bandY * n.y) + abs(bandZ * n.z);
  vec3 a = vec3(0.05, 0.15, 0.45);
  vec3 b = vec3(0.7, 0.95, 1.0);
  vec3 col = mix(a, b, smoothstep(0.0, 1.5, v));
  float fres = pow(1.0 - max(dot(n, normalize(cameraPosition - vWorldPos)), 0.0), 3.0);
  col += fres * 0.6;
  fragColor = vec4(col, 1.0);
}
