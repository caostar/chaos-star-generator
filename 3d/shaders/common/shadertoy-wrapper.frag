precision highp float;

uniform float     iTime;
uniform vec3      iResolution;
uniform vec4      iMouse;
uniform sampler2D iChannel0;
uniform float     iChannel0Active;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorldPos;
varying vec3 vObjectPos;

// __USER_CODE__

void main() {
  vec4 col = vec4(0.0);
  vec2 fragCoord = vUv * iResolution.xy;
  mainImage(col, fragCoord);
  gl_FragColor = vec4(col.rgb, 1.0);
}
