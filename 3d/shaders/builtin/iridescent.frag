// Iridescent — angle-dependent colour shifting
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec3 n = normalize(vNormal);
  vec3 v = normalize(cameraPosition - vWorldPos);
  float fresnel = pow(1.0 - max(dot(n, v), 0.0), 2.0);
  float t = iTime * 0.4 + dot(n, vec3(1.0, 0.7, 0.3)) * 2.0;
  vec3 col = 0.5 + 0.5 * cos(vec3(0.0, 2.0, 4.0) + t + fresnel * 3.0);
  col *= 0.6 + 0.6 * fresnel;
  fragColor = vec4(col, 1.0);
}
