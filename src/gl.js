// WebGL2 レンダラー。描画パイプライン:
//   1) セグメント（作品1枚ぶんのシーン）をオフスクリーン FBO に描く
//   2) トランジションシェーダーで FBO をメイン FBO に合成（ずらし・ズーム・アイリス・スライス・グリッチ）
//   3) 全体オーバーレイ（カラーバー・HUD）をメイン FBO に重ねる
//   4) ポストプロセス（色収差・フラッシュ・グレイン・ビネット）で画面へ
// 座標は仮想解像度（例: 1920x1080）のピクセル、原点左上・y 下向き。

const QUAD_VS = `#version 300 es
layout(location=0) in vec2 a_pos;
uniform vec2 u_res;
uniform vec4 u_xf;     // 中心x, 中心y, 幅, 高さ
uniform vec3 u_rot;    // cos, sin, skew
out vec2 v_uv;
out vec2 v_local;
void main(){
  vec2 p = a_pos * u_xf.zw;
  p.x += p.y * u_rot.z;
  p = vec2(p.x*u_rot.x - p.y*u_rot.y, p.x*u_rot.y + p.y*u_rot.x) + u_xf.xy;
  vec2 ndc = p / u_res * 2.0 - 1.0;
  gl_Position = vec4(ndc.x, -ndc.y, 0.0, 1.0);
  v_local = a_pos;
  v_uv = a_pos + 0.5;
}`;

const QUAD_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
in vec2 v_local;
uniform int u_mode;       // 0 単色, 1 テクスチャ, 2 ストライプ, 3 ドット, 4 円, 5 リング
uniform vec4 u_color;
uniform sampler2D u_tex;
uniform vec4 u_uv;        // テクスチャ上の矩形 u0 v0 u1 v1
uniform float u_lod;      // >=0 でミップレベル固定（ぼかし背景）
uniform vec2 u_blur;      // 方向ブラー（テクスチャ uv 単位）
uniform vec4 u_mask;      // 種別, 進捗, 角度, 輪郭ぼかし(px)
uniform vec4 u_mask2;     // 中心x, 中心y（ローカル0..1）, 本数, 時差
uniform vec4 u_tint;      // rgb, 量
uniform vec4 u_pat;       // 周期px, 太さ比, 角度, オフセットpx
uniform vec2 u_size;      // 描画サイズ px
uniform float u_alpha;
out vec4 o;

float aa(float d, float soft){ return clamp(0.5 - d / max(soft, 0.001), 0.0, 1.0); }

float maskValue(){
  int t = int(u_mask.x + 0.5);
  if (t == 0) return 1.0;
  float p = u_mask.y;
  vec2 pos = v_local * u_size;
  float soft = max(u_mask.w, 1.0);
  vec2 dir = vec2(cos(u_mask.z), sin(u_mask.z));
  float ext = 0.5 * (abs(dir.x) * u_size.x + abs(dir.y) * u_size.y);
  float s = (dot(pos, dir) + ext) / (2.0 * ext);
  if (t == 1) { // 直線ワイプ
    return aa((s - p) * 2.0 * ext, soft);
  }
  if (t == 2) { // 円（アイリス）
    vec2 c = (u_mask2.xy - 0.5) * u_size;
    vec2 far = max(abs(-0.5*u_size - c), abs(0.5*u_size - c));
    float r = p * length(far);
    return aa(length(pos - c) - r, soft);
  }
  // 3: ブラインド（スライスごとに時差で開く） / 4: シャッター（スライスごとに直交方向へ伸びる）
  float n = max(u_mask2.z, 1.0);
  float st = u_mask2.w;
  if (t == 3) {
    float idx = floor(s * n);
    float f = fract(s * n);
    float pi = clamp(p * (1.0 + st) - st * idx / max(n - 1.0, 1.0), 0.0, 1.0);
    return aa((f - pi) * 2.0 * ext / n, soft);
  }
  vec2 perp = vec2(-dir.y, dir.x);
  float ext2 = 0.5 * (abs(perp.x) * u_size.x + abs(perp.y) * u_size.y);
  float s2 = (dot(pos, perp) + ext2) / (2.0 * ext2);
  float idx = floor(s * n);
  float pi = clamp(p * (1.0 + st) - st * idx / max(n - 1.0, 1.0), 0.0, 1.0);
  // 偶数/奇数で伸びる向きを反転
  float sd = mod(idx, 2.0) < 0.5 ? s2 : 1.0 - s2;
  return aa((sd - pi) * 2.0 * ext2, soft);
}

vec4 sampleTex(vec2 uv){
  return u_lod >= 0.0 ? textureLod(u_tex, uv, u_lod) : texture(u_tex, uv);
}

void main(){
  vec4 col;
  if (u_mode == 1) {
    vec2 uv = mix(u_uv.xy, u_uv.zw, v_uv);
    if (dot(u_blur, u_blur) > 1e-7) {
      col = vec4(0.0);
      for (int i = 0; i < 9; i++) {
        float k = float(i) / 8.0 - 0.5;
        col += sampleTex(uv + u_blur * k);
      }
      col /= 9.0;
    } else {
      col = sampleTex(uv);
    }
    // テクスチャ外はクリップ（枠内スライド用）。エッジは fwidth でアンチエイリアス
    vec2 fw = fwidth(uv) + 1e-6;
    vec2 inside = clamp(min(uv, 1.0 - uv) / fw + 0.5, 0.0, 1.0);
    col *= inside.x * inside.y;
    col.rgb = mix(col.rgb, u_tint.rgb * col.a, u_tint.a);
    col *= u_color;
  } else {
    float a = 1.0;
    vec2 pos = v_local * u_size;
    if (u_mode == 2 || u_mode == 3) {
      float ca = cos(u_pat.z), sa = sin(u_pat.z);
      vec2 q = vec2(pos.x*ca - pos.y*sa, pos.x*sa + pos.y*ca);
      if (u_mode == 2) {
        float f = fract((q.x + u_pat.w) / u_pat.x);
        // 縞の中心からの距離 px で判定（1px のアンチエイリアス）
        a = aa(abs(f - 0.5) * u_pat.x - u_pat.x * u_pat.y * 0.5, 1.0);
      } else {
        vec2 g = mod(q + vec2(u_pat.w, 0.0), u_pat.x) - 0.5 * u_pat.x;
        a = aa(length(g) - u_pat.x * u_pat.y * 0.5, 1.0);
      }
    } else if (u_mode == 4) {
      a = aa(length(pos) - 0.5 * min(u_size.x, u_size.y), 1.0);
    } else if (u_mode == 5) {
      float r = 0.5 * min(u_size.x, u_size.y);
      a = aa(abs(length(pos) - (r - u_pat.y * 0.5)) - u_pat.y * 0.5, 1.0);
    }
    col = vec4(u_color.rgb * u_color.a, u_color.a) * a;
  }
  o = col * maskValue() * u_alpha;
}`;

const FULL_VS = `#version 300 es
layout(location=0) in vec2 a_pos;
out vec2 v_uv;
void main(){ v_uv = a_pos + 0.5; gl_Position = vec4(a_pos * 2.0, 0.0, 1.0); }`;

// セグメント FBO → メイン への合成（トランジション）
const COMP_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform vec2 u_offset;    // uv ずらし
uniform float u_scale;    // center 基準の拡大
uniform vec2 u_center;
uniform float u_rot;
uniform vec2 u_blurDir;   // 方向ブラー uv
uniform float u_radial;   // 放射ブラー
uniform vec4 u_mask;      // 種別(0なし 1円), 進捗, 中心x, 中心y
uniform vec4 u_slice;     // 軸(0=横帯が横へ /1=縦帯が縦へ), 本数, 進捗, 方向(+1退場 -1入場)
uniform float u_glitch;
uniform float u_time;
uniform float u_alpha;
out vec4 o;

float hash(float n){ return fract(sin(n * 127.1) * 43758.5453); }
float expoIn(float t){ return t <= 0.0 ? 0.0 : pow(2.0, 10.0 * t - 10.0); }
float expoOut(float t){ return t >= 1.0 ? 1.0 : 1.0 - pow(2.0, -10.0 * t); }

vec4 samp(vec2 uv){
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec4(0.0);
  return texture(u_tex, uv);
}

void main(){
  vec2 asp = vec2(u_res.x / u_res.y, 1.0);
  vec2 uv = v_uv - u_offset;
  // 回転・拡大（アスペクト補正付き）
  vec2 d = (uv - u_center) * asp;
  float c = cos(-u_rot), s = sin(-u_rot);
  d = vec2(d.x*c - d.y*s, d.x*s + d.y*c) / u_scale;
  uv = u_center + d / asp;

  if (u_slice.y > 0.5) {
    float n = u_slice.y;
    float along = u_slice.x < 0.5 ? v_uv.y : v_uv.x;
    float idx = floor(along * n);
    float st = 0.35;
    float pi = clamp(u_slice.z * (1.0 + st) - st * idx / max(n - 1.0, 1.0), 0.0, 1.0);
    float e = u_slice.w > 0.0 ? expoIn(pi) : 1.0 - expoOut(pi);
    float sgn = mod(idx, 2.0) < 0.5 ? 1.0 : -1.0;
    if (u_slice.x < 0.5) uv.x += sgn * e * 1.05; else uv.y += sgn * e * 1.05;
  }
  if (u_glitch > 0.0) {
    float band = floor(v_uv.y * 24.0 + hash(floor(u_time * 20.0)) * 7.0);
    float h = hash(band + floor(u_time * 30.0) * 13.0);
    if (h > 1.0 - u_glitch * 0.8) uv.x += (hash(band * 3.1 + u_time) - 0.5) * 0.25 * u_glitch;
  }

  vec4 col;
  float bl = dot(u_blurDir, u_blurDir);
  if (bl > 1e-7 || u_radial > 0.001) {
    col = vec4(0.0);
    for (int i = 0; i < 12; i++) {
      float k = float(i) / 11.0;
      vec2 q = uv + u_blurDir * (k - 0.5);
      q = mix(q, u_center, u_radial * k * 0.5);
      col += samp(q);
    }
    col /= 12.0;
  } else {
    col = samp(uv);
  }
  if (u_mask.x > 0.5) {
    vec2 p = (v_uv - u_mask.zw) * asp;
    vec2 far = max(abs(vec2(0.0) - u_mask.zw), abs(vec2(1.0) - u_mask.zw)) * asp;
    float r = u_mask.y * length(far);
    float px = 1.0 / u_res.y;
    col *= clamp(0.5 - (length(p) - r) / (1.5 * px), 0.0, 1.0);
  }
  o = col * u_alpha;
}`;

const POST_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform float u_aberr;
uniform float u_grain;
uniform float u_vig;
uniform vec4 u_flash;
uniform vec2 u_shake;
uniform float u_time;
uniform vec3 u_bg;
out vec4 o;
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main(){
  vec2 uv = v_uv + u_shake;
  vec2 dir = (uv - 0.5);
  vec2 off = dir * u_aberr / u_res.y;
  vec4 c = texture(u_tex, uv);
  if (u_aberr > 0.05) {
    c.r = texture(u_tex, uv + off).r;
    c.b = texture(u_tex, uv - off).b;
  }
  // 未描画部分は背景色
  vec3 col = c.rgb + u_bg * (1.0 - c.a);
  float v = smoothstep(0.95, 0.25, length(dir * vec2(1.0, u_res.y / u_res.x) * 1.25));
  col *= mix(1.0, v, u_vig);
  col = mix(col, u_flash.rgb, u_flash.a);
  float g = hash(uv * u_res + fract(u_time * 7.13) * 100.0) - 0.5;
  col += g * u_grain;
  o = vec4(col, 1.0);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    throw new Error('shader compile error: ' + log);
  }
  return s;
}

function program(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link error: ' + gl.getProgramInfoLog(p));
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    u[info.name] = gl.getUniformLocation(p, info.name);
  }
  return { p, u };
}

const MASK_TYPES = { none: 0, wipe: 1, circle: 2, blinds: 3, shutter: 4 };
const MODES = { solid: 0, tex: 1, stripes: 2, dots: 3, disc: 4, ring: 5 };
const ZERO2 = [0, 0];
const WHITE = [1, 1, 1, 1];
const FULL_UV = [0, 0, 1, 1];

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      alpha: false, antialias: false, premultipliedAlpha: true,
      preserveDrawingBuffer: false, powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('WebGL2 が使えません');
    this.gl = gl;
    this.quad = program(gl, QUAD_VS, QUAD_FS);
    this.comp = program(gl, FULL_VS, COMP_FS);
    this.post = program(gl, FULL_VS, POST_FS);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    this.maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    this.fbos = [];
    this.vw = 1920; this.vh = 1080;
    this.bw = 0; this.bh = 0;
    // カメラ（セグメント内の全描画に掛かる）: 中心 cx,cy 基準で scale / rot、そのあと dx,dy
    this.cam = { x: 0, y: 0, s: 1, r: 0, cx: 960, cy: 540 };
    this.drawCalls = 0;
  }

  setSize(vw, vh, bw, bh) {
    this.vw = vw; this.vh = vh;
    if (bw !== this.bw || bh !== this.bh) {
      this.bw = bw; this.bh = bh;
      this.canvas.width = bw; this.canvas.height = bh;
      for (const f of this.fbos) this._deleteFbo(f);
      this.fbos = [this._fbo(), this._fbo(), this._fbo()]; // seg A, seg B, main
    }
  }

  _fbo() {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, this.bw, this.bh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { fb, tex };
  }

  _deleteFbo(f) {
    this.gl.deleteFramebuffer(f.fb);
    this.gl.deleteTexture(f.tex);
  }

  createTexture(source, { mipmap = true } = {}) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    if (mipmap) {
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      if (this.aniso) gl.texParameterf(gl.TEXTURE_2D, this.aniso.TEXTURE_MAX_ANISOTROPY_EXT, 8);
    } else {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  deleteTexture(tex) { this.gl.deleteTexture(tex); }

  // ---- フレーム制御 ----
  beginFrame() {
    this.drawCalls = 0;
  }

  // セグメント用 FBO(0/1) かメイン(2) に描画先を切り替えてクリア
  target(i, clear = [0, 0, 0, 0]) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbos[i].fb);
    gl.viewport(0, 0, this.bw, this.bh);
    gl.clearColor(clear[0], clear[1], clear[2], clear[3]);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.resetCam();
  }

  resetCam() {
    const c = this.cam;
    c.x = 0; c.y = 0; c.s = 1; c.r = 0; c.cx = this.vw / 2; c.cy = this.vh / 2;
  }

  // 汎用の矩形描画。o: {x,y,w,h, rot, skew, color, tex, uv, lod, blur, mask, tint, alpha, mode, pat, cam}
  draw(o) {
    const gl = this.gl;
    const { p, u } = this.quad;
    gl.useProgram(p);
    let x = o.x, y = o.y, w = o.w, h = o.h, rot = o.rot || 0;
    if (o.cam !== false) {
      const c = this.cam;
      if (c.s !== 1 || c.r !== 0 || c.x !== 0 || c.y !== 0) {
        const dx = (x - c.cx) * c.s, dy = (y - c.cy) * c.s;
        const cs = Math.cos(c.r), sn = Math.sin(c.r);
        x = c.cx + dx * cs - dy * sn + c.x;
        y = c.cy + dx * sn + dy * cs + c.y;
        w *= c.s; h *= c.s; rot += c.r;
      }
    }
    if (w === 0 || h === 0) return;
    gl.uniform2f(u.u_res, this.vw, this.vh);
    gl.uniform4f(u.u_xf, x, y, w, h);
    gl.uniform3f(u.u_rot, Math.cos(rot), Math.sin(rot), o.skew || 0);
    gl.uniform2f(u.u_size, Math.abs(w), Math.abs(h));
    const mode = o.tex ? 1 : MODES[o.mode || 'solid'];
    gl.uniform1i(u.u_mode, mode);
    const col = o.color || WHITE;
    gl.uniform4f(u.u_color, col[0], col[1], col[2], col.length > 3 ? col[3] : 1);
    if (o.tex) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, o.tex);
      gl.uniform1i(u.u_tex, 0);
      const uv = o.uv || FULL_UV;
      gl.uniform4f(u.u_uv, uv[0], uv[1], uv[2], uv[3]);
      gl.uniform1f(u.u_lod, o.lod ?? -1);
      const b = o.blur || ZERO2;
      gl.uniform2f(u.u_blur, b[0], b[1]);
      const t = o.tint;
      gl.uniform4f(u.u_tint, t ? t[0] : 0, t ? t[1] : 0, t ? t[2] : 0, t ? t[3] : 0);
    }
    const pat = o.pat;
    gl.uniform4f(u.u_pat, pat ? pat[0] : 10, pat ? pat[1] : 0.5, pat ? pat[2] : 0, pat ? pat[3] : 0);
    const m = o.mask;
    if (m) {
      gl.uniform4f(u.u_mask, MASK_TYPES[m.type] || 0, m.p, m.angle || 0, m.soft ?? 1.2);
      gl.uniform4f(u.u_mask2, m.cx ?? 0.5, m.cy ?? 0.5, m.count || 1, m.stagger ?? 0.4);
    } else {
      gl.uniform4f(u.u_mask, 0, 1, 0, 1);
    }
    gl.uniform1f(u.u_alpha, o.alpha ?? 1);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    this.drawCalls++;
  }

  // セグメント FBO をメインへ合成。t: トランジション状態
  composite(i, t = {}) {
    const gl = this.gl;
    const { p, u } = this.comp;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbos[2].fb);
    gl.viewport(0, 0, this.bw, this.bh);
    gl.useProgram(p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fbos[i].tex);
    gl.uniform1i(u.u_tex, 0);
    gl.uniform2f(u.u_res, this.vw, this.vh);
    gl.uniform2f(u.u_offset, t.ox || 0, t.oy || 0);
    gl.uniform1f(u.u_scale, t.scale || 1);
    gl.uniform2f(u.u_center, t.cx ?? 0.5, t.cy ?? 0.5);
    gl.uniform1f(u.u_rot, t.rot || 0);
    gl.uniform2f(u.u_blurDir, t.bx || 0, t.by || 0);
    gl.uniform1f(u.u_radial, t.radial || 0);
    gl.uniform4f(u.u_mask, t.circle ? 1 : 0, t.circle ?? 1, t.mx ?? 0.5, t.my ?? 0.5);
    gl.uniform4f(u.u_slice, t.sliceAxis || 0, t.slices || 0, t.sliceP || 0, t.sliceDir || 1);
    gl.uniform1f(u.u_glitch, t.glitch || 0);
    gl.uniform1f(u.u_time, t.time || 0);
    gl.uniform1f(u.u_alpha, t.alpha ?? 1);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    this.drawCalls++;
  }

  // メインに直接描く（オーバーレイ用）
  toMain() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbos[2].fb);
    gl.viewport(0, 0, this.bw, this.bh);
    this.resetCam();
  }

  present(fx, bg, time) {
    const gl = this.gl;
    const { p, u } = this.post;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.bw, this.bh);
    gl.disable(gl.BLEND);
    gl.useProgram(p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fbos[2].tex);
    gl.uniform1i(u.u_tex, 0);
    gl.uniform2f(u.u_res, this.vw, this.vh);
    gl.uniform1f(u.u_aberr, fx.aberr || 0);
    gl.uniform1f(u.u_grain, fx.grain || 0);
    gl.uniform1f(u.u_vig, fx.vignette || 0);
    const f = fx.flash || [1, 1, 1, 0];
    gl.uniform4f(u.u_flash, f[0], f[1], f[2], f[3]);
    gl.uniform2f(u.u_shake, fx.shakeX || 0, fx.shakeY || 0);
    gl.uniform1f(u.u_time, time);
    gl.uniform3f(u.u_bg, bg[0], bg[1], bg[2]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.enable(gl.BLEND);
    this.drawCalls++;
  }
}
