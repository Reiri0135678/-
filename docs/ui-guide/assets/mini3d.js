/* mini3d.js — 依存なしの最小 3D レンダラ（WebGL2、約400行）
 *
 * 目的：3D の「操作」を学ぶために必要な最小限だけを持つ。写実的な描画はしない。
 *   - 行列（128）／カメラ操作 orbit・pan・dolly（129）／正投影と透視（130）
 *   - 2方式のピッキング：CPU レイキャスト と GPU カラーID（132）
 *   - 3D 座標 → 画面座標の投影（ラベル・計測・注釈に使う: 136/139）
 *   - クリッピング平面（137）
 * 実務では three.js などを使う。ここでは「中で何が起きているか」を見せるために自前で書く。
 *
 * 使い方:
 *   const v = Mini3D.createViewer(canvas);
 *   v.add({ id:'a', geo: Mini3D.Shapes.box(1,1,1), color:'#2563eb', position:[0,0,0] });
 *   v.attachOrbit(); v.draw();
 */
(function (global) {
  'use strict';

  // ---- 行列・ベクトル（列優先。WebGL の慣習に合わせる） ----
  const mat4 = {
    identity: () => new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]),
    multiply(a, b) {                                   // a * b
      const o = new Float32Array(16);
      for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
        let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
        o[c * 4 + r] = s;
      }
      return o;
    },
    perspective(fovy, aspect, near, far) {             // 透視投影：遠くのものが小さくなる
      const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
      return new Float32Array([f / aspect,0,0,0, 0,f,0,0, 0,0,(far + near) * nf,-1, 0,0,2 * far * near * nf,0]);
    },
    ortho(h, aspect, near, far) {                      // 正投影：奥行きで大きさが変わらない（図面向き）
      const w = h * aspect, nf = 1 / (near - far);
      return new Float32Array([2 / w,0,0,0, 0,2 / h,0,0, 0,0,2 * nf,0, 0,0,(far + near) * nf,1]);
    },
    lookAt(eye, target, up) {
      const z = vec3.normalize(vec3.sub(eye, target));
      const x = vec3.normalize(vec3.cross(up, z));
      const y = vec3.cross(z, x);
      return new Float32Array([
        x[0],y[0],z[0],0, x[1],y[1],z[1],0, x[2],y[2],z[2],0,
        -vec3.dot(x, eye), -vec3.dot(y, eye), -vec3.dot(z, eye), 1]);
    },
    compose(position, rotation, scale) {               // 平行移動 × 回転(XYZ) × 拡縮
      const [rx, ry, rz] = rotation, s = scale;
      const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
      const m = new Float32Array(16);
      m[0] = (cy * cz) * s[0];               m[1] = (cx * sz + sx * sy * cz) * s[0];  m[2] = (sx * sz - cx * sy * cz) * s[0];  m[3] = 0;
      m[4] = (-cy * sz) * s[1];              m[5] = (cx * cz - sx * sy * sz) * s[1];  m[6] = (sx * cz + cx * sy * sz) * s[1];  m[7] = 0;
      m[8] = (sy) * s[2];                    m[9] = (-sx * cy) * s[2];                m[10] = (cx * cy) * s[2];               m[11] = 0;
      m[12] = position[0]; m[13] = position[1]; m[14] = position[2]; m[15] = 1;
      return m;
    },
    invert(a) {
      const b = new Float32Array(16), n = a;
      const a00=n[0],a01=n[1],a02=n[2],a03=n[3],a10=n[4],a11=n[5],a12=n[6],a13=n[7],
            a20=n[8],a21=n[9],a22=n[10],a23=n[11],a30=n[12],a31=n[13],a32=n[14],a33=n[15];
      const b00=a00*a11-a01*a10,b01=a00*a12-a02*a10,b02=a00*a13-a03*a10,b03=a01*a12-a02*a11,
            b04=a01*a13-a03*a11,b05=a02*a13-a03*a12,b06=a20*a31-a21*a30,b07=a20*a32-a22*a30,
            b08=a20*a33-a23*a30,b09=a21*a32-a22*a31,b10=a21*a33-a23*a31,b11=a22*a33-a23*a32;
      let det = b00*b11-b01*b10+b02*b09+b03*b08-b04*b07+b05*b06;
      if (!det) return mat4.identity();
      det = 1 / det;
      b[0]=(a11*b11-a12*b10+a13*b09)*det; b[1]=(a02*b10-a01*b11-a03*b09)*det; b[2]=(a31*b05-a32*b04+a33*b03)*det; b[3]=(a22*b04-a21*b05-a23*b03)*det;
      b[4]=(a12*b08-a10*b11-a13*b07)*det; b[5]=(a00*b11-a02*b08+a03*b07)*det; b[6]=(a32*b02-a30*b05-a33*b01)*det; b[7]=(a20*b05-a22*b02+a23*b01)*det;
      b[8]=(a10*b10-a11*b08+a13*b06)*det; b[9]=(a01*b08-a00*b10-a03*b06)*det; b[10]=(a30*b04-a31*b02+a33*b00)*det; b[11]=(a21*b02-a20*b04-a23*b00)*det;
      b[12]=(a11*b07-a10*b09-a12*b06)*det; b[13]=(a00*b09-a01*b07+a02*b06)*det; b[14]=(a31*b01-a30*b03-a32*b00)*det; b[15]=(a20*b03-a21*b01+a22*b00)*det;
      return b;
    },
    transformPoint(m, p) {
      const x = p[0], y = p[1], z = p[2];
      const w = m[3] * x + m[7] * y + m[11] * z + m[15] || 1;
      return [(m[0]*x+m[4]*y+m[8]*z+m[12]) / w, (m[1]*x+m[5]*y+m[9]*z+m[13]) / w, (m[2]*x+m[6]*y+m[10]*z+m[14]) / w];
    },
    transformDir(m, p) {
      const x = p[0], y = p[1], z = p[2];
      return [m[0]*x+m[4]*y+m[8]*z, m[1]*x+m[5]*y+m[9]*z, m[2]*x+m[6]*y+m[10]*z];
    },
  };
  const vec3 = {
    sub: (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]],
    add: (a, b) => [a[0]+b[0], a[1]+b[1], a[2]+b[2]],
    scale: (a, s) => [a[0]*s, a[1]*s, a[2]*s],
    dot: (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2],
    cross: (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]],
    length: a => Math.hypot(a[0], a[1], a[2]),
    normalize(a) { const l = vec3.length(a) || 1; return [a[0]/l, a[1]/l, a[2]/l]; },
  };

  // ---- 形状（位置と法線を持つ三角形の集まり） ----
  const Shapes = {
    box(w = 1, h = 1, d = 1) {
      const x = w / 2, y = h / 2, z = d / 2, pos = [], nrm = [], idx = [];
      const faces = [
        [[ x,-y,-z],[ x, y,-z],[ x, y, z],[ x,-y, z],[1,0,0]], [[-x,-y, z],[-x, y, z],[-x, y,-z],[-x,-y,-z],[-1,0,0]],
        [[-x, y,-z],[-x, y, z],[ x, y, z],[ x, y,-z],[0,1,0]], [[-x,-y, z],[-x,-y,-z],[ x,-y,-z],[ x,-y, z],[0,-1,0]],
        [[-x,-y, z],[ x,-y, z],[ x, y, z],[-x, y, z],[0,0,1]], [[ x,-y,-z],[-x,-y,-z],[-x, y,-z],[ x, y,-z],[0,0,-1]],
      ];
      faces.forEach((f, i) => {
        const n = f[4];
        for (let k = 0; k < 4; k++) { pos.push(...f[k]); nrm.push(...n); }
        idx.push(i*4, i*4+1, i*4+2, i*4, i*4+2, i*4+3);
      });
      return { pos: new Float32Array(pos), nrm: new Float32Array(nrm), idx: new Uint16Array(idx) };
    },
    cylinder(r = .5, h = 1, seg = 24) {
      const pos = [], nrm = [], idx = [], y = h / 2;
      for (let i = 0; i <= seg; i++) {                       // 側面
        const a = i / seg * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
        pos.push(r*c, -y, r*s, r*c, y, r*s); nrm.push(c, 0, s, c, 0, s);
        if (i < seg) { const b = i * 2; idx.push(b, b+1, b+3, b, b+3, b+2); }
      }
      const base = pos.length / 3;
      for (const sign of [1, -1]) {                          // 上下のふた
        const o = pos.length / 3;
        pos.push(0, sign*y, 0); nrm.push(0, sign, 0);
        for (let i = 0; i <= seg; i++) {
          const a = i / seg * Math.PI * 2;
          pos.push(r*Math.cos(a), sign*y, r*Math.sin(a)); nrm.push(0, sign, 0);
          if (i < seg) sign > 0 ? idx.push(o, o+1+i, o+2+i) : idx.push(o, o+2+i, o+1+i);
        }
      }
      return { pos: new Float32Array(pos), nrm: new Float32Array(nrm), idx: new Uint16Array(idx) };
    },
    plane(w = 4, d = 4) {
      return { pos: new Float32Array([-w/2,0,-d/2, w/2,0,-d/2, w/2,0,d/2, -w/2,0,d/2]),
               nrm: new Float32Array([0,1,0, 0,1,0, 0,1,0, 0,1,0]), idx: new Uint16Array([0,1,2, 0,2,3]) };
    },
    gridLines(size = 6, step = .5) {                        // 線分の集まり（LINES で描く）
      const p = [];
      for (let i = -size; i <= size; i += step) { p.push(i, 0, -size, i, 0, size, -size, 0, i, size, 0, i); }
      return { pos: new Float32Array(p), lines: true };
    },
    axisLines(len = 1) { return { pos: new Float32Array([0,0,0, len,0,0, 0,0,0, 0,len,0, 0,0,0, 0,0,len]), lines: true }; },
  };

  const VS = `#version 300 es
  in vec3 aPos; in vec3 aNrm;
  uniform mat4 uModel, uViewProj;
  out vec3 vNrm; out vec3 vWorld;
  void main(){ vec4 w = uModel * vec4(aPos,1.0); vWorld = w.xyz;
    vNrm = mat3(uModel) * aNrm; gl_Position = uViewProj * w; }`;
  const FS = `#version 300 es
  precision highp float;
  in vec3 vNrm; in vec3 vWorld;
  uniform vec3 uColor; uniform float uLit; uniform vec4 uClip; uniform float uOpacity;
  out vec4 outColor;
  void main(){
    if (uClip.w < 900.0 && dot(vWorld, uClip.xyz) > uClip.w) discard;   // クリッピング平面（137）
    float l = 1.0;
    if (uLit > 0.5) { vec3 n = normalize(vNrm); l = 0.35 + 0.65 * max(dot(n, normalize(vec3(0.5,0.9,0.6))), 0.0); }
    outColor = vec4(uColor * l, uOpacity);
  }`;

  function compile(gl, src, type) {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  const hex2rgb = h => [parseInt(h.slice(1,3),16)/255, parseInt(h.slice(3,5),16)/255, parseInt(h.slice(5,7),16)/255];

  function createViewer(canvas, opts = {}) {
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
    if (!gl) return null;                                    // 非対応環境は呼び出し側で案内する
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, VS, gl.VERTEX_SHADER));
    gl.attachShader(prog, compile(gl, FS, gl.FRAGMENT_SHADER));
    gl.linkProgram(prog); gl.useProgram(prog);
    const loc = {};
    ['uModel','uViewProj','uColor','uLit','uClip','uOpacity'].forEach(n => loc[n] = gl.getUniformLocation(prog, n));
    gl.enable(gl.DEPTH_TEST);

    const bg = hex2rgb(opts.background || '#eef2f7');
    const objects = [];
    const camera = { target: [0,0,0], distance: 6, azimuth: 0.7, elevation: 0.5, fov: 45 * Math.PI/180, ortho: false, near: 0.1, far: 100 };
    const viewer = { gl, canvas, objects, camera, clip: null, onPick: null, mat4, vec3 };

    const upload = geo => {
      if (geo._vao) return geo._vao;
      const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
      const pb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, pb); gl.bufferData(gl.ARRAY_BUFFER, geo.pos, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      if (geo.nrm) { const nb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, nb); gl.bufferData(gl.ARRAY_BUFFER, geo.nrm, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0); }
      if (geo.idx) { const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geo.idx, gl.STATIC_DRAW); }
      gl.bindVertexArray(null);
      return (geo._vao = vao);
    };

    viewer.add = o => {
      const obj = Object.assign({ position: [0,0,0], rotation: [0,0,0], scale: [1,1,1], color: '#8aa0b8', visible: true, opacity: 1, lit: !o.geo.lines }, o);
      objects.push(obj); return obj;
    };
    viewer.get = id => objects.find(o => o.id === id);
    viewer.eye = () => {
      const { target, distance, azimuth, elevation } = camera;
      return [target[0] + distance * Math.cos(elevation) * Math.sin(azimuth),
              target[1] + distance * Math.sin(elevation),
              target[2] + distance * Math.cos(elevation) * Math.cos(azimuth)];
    };
    viewer.viewProj = () => {                                 // モデル→ワールド→ビュー→クリップ（128）
      const aspect = canvas.width / canvas.height || 1;
      const proj = camera.ortho ? mat4.ortho(camera.distance, aspect, -100, 100)
                                : mat4.perspective(camera.fov, aspect, camera.near, camera.far);
      return mat4.multiply(proj, mat4.lookAt(viewer.eye(), camera.target, [0,1,0]));
    };
    viewer.resize = () => {
      const dpr = Math.min(devicePixelRatio || 1, 2);          // 55 と同じ：内部解像度を DPR 倍に
      const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    };
    viewer.draw = () => {
      viewer.resize();
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(bg[0], bg[1], bg[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(prog);
      const vp = viewer.viewProj();
      gl.uniformMatrix4fv(loc.uViewProj, false, vp);
      const c = viewer.clip ? [...viewer.clip.normal, viewer.clip.offset] : [0,0,0,1000];
      gl.uniform4f(loc.uClip, c[0], c[1], c[2], c[3]);
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      for (const o of objects) {
        if (!o.visible) continue;
        gl.bindVertexArray(upload(o.geo));
        gl.uniformMatrix4fv(loc.uModel, false, mat4.compose(o.position, o.rotation, o.scale));
        gl.uniform3fv(loc.uColor, hex2rgb(o.color));
        gl.uniform1f(loc.uLit, o.lit ? 1 : 0);
        gl.uniform1f(loc.uOpacity, o.opacity);
        if (o.geo.lines) gl.drawArrays(gl.LINES, 0, o.geo.pos.length / 3);
        else gl.drawElements(gl.TRIANGLES, o.geo.idx.length, gl.UNSIGNED_SHORT, 0);
      }
      gl.bindVertexArray(null);
    };

    // 3D 座標 → 画面座標（ラベル・計測・注釈で使う）
    viewer.project = p => {
      const cl = mat4.transformPoint(viewer.viewProj(), p);
      const r = canvas.getBoundingClientRect();
      return { x: (cl[0] * 0.5 + 0.5) * r.width, y: (-cl[1] * 0.5 + 0.5) * r.height, behind: cl[2] > 1 };
    };
    // 画面座標 → レイ（132 のレイキャスト、136 の計測に使う）
    viewer.ray = (sx, sy) => {
      const r = canvas.getBoundingClientRect();
      const ndc = [(sx - r.left) / r.width * 2 - 1, -((sy - r.top) / r.height * 2 - 1)];
      const inv = mat4.invert(viewer.viewProj());
      const a = mat4.transformPoint(inv, [ndc[0], ndc[1], -1]), b = mat4.transformPoint(inv, [ndc[0], ndc[1], 1]);
      return { origin: a, dir: vec3.normalize(vec3.sub(b, a)) };
    };
    // CPU レイキャスト（Möller–Trumbore）。当たった面の位置と法線まで分かるので計測に使える
    viewer.raycast = (sx, sy, filter) => {
      const { origin, dir } = viewer.ray(sx, sy);
      let best = null;
      for (const o of objects) {
        if (!o.visible || o.geo.lines || (filter && !filter(o))) continue;
        const m = mat4.compose(o.position, o.rotation, o.scale), inv = mat4.invert(m);
        const ro = mat4.transformPoint(inv, origin), rd = mat4.transformDir(inv, dir);
        const P = o.geo.pos, I = o.geo.idx;
        for (let i = 0; i < I.length; i += 3) {
          const a = I[i]*3, b = I[i+1]*3, c = I[i+2]*3;
          const v0 = [P[a],P[a+1],P[a+2]], v1 = [P[b],P[b+1],P[b+2]], v2 = [P[c],P[c+1],P[c+2]];
          const e1 = vec3.sub(v1, v0), e2 = vec3.sub(v2, v0), h = vec3.cross(rd, e2), det = vec3.dot(e1, h);
          if (Math.abs(det) < 1e-8) continue;
          const f = 1 / det, s = vec3.sub(ro, v0), u = f * vec3.dot(s, h);
          if (u < 0 || u > 1) continue;
          const q = vec3.cross(s, e1), vv = f * vec3.dot(rd, q);
          if (vv < 0 || u + vv > 1) continue;
          const t = f * vec3.dot(e2, q);
          if (t <= 1e-6) continue;
          const local = vec3.add(ro, vec3.scale(rd, t));
          const world = mat4.transformPoint(m, local);
          const dist = vec3.length(vec3.sub(world, origin));
          if (!best || dist < best.distance) best = { object: o, point: world, normal: vec3.normalize(mat4.transformDir(m, vec3.cross(e1, e2))), distance: dist };
        }
      }
      return best;
    };
    // GPU カラーIDピッキング：全部を「IDを色にして」描き、1px 読む（132 の比較用）
    let pickFB = null;                                        // 使い回す（毎回作ると遅い）
    const ensurePickTarget = (w, h) => {
      if (pickFB && pickFB.w === w && pickFB.h === h) return pickFB;
      if (pickFB) { gl.deleteFramebuffer(pickFB.fb); gl.deleteTexture(pickFB.tex); gl.deleteRenderbuffer(pickFB.rb); }
      const fb = gl.createFramebuffer(), tex = gl.createTexture(), rb = gl.createRenderbuffer();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.bindRenderbuffer(gl.RENDERBUFFER, rb); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
      return (pickFB = { fb, tex, rb, w, h });
    };
    viewer.pickGPU = (sx, sy) => {
      const w = canvas.width, h = canvas.height;
      const t = ensurePickTarget(w, h);
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
      gl.viewport(0, 0, w, h); gl.clearColor(0,0,0,1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(prog);
      gl.uniformMatrix4fv(loc.uViewProj, false, viewer.viewProj());
      gl.uniform4f(loc.uClip, 0,0,0,1000); gl.uniform1f(loc.uOpacity, 1);
      const pickable = objects.filter(o => o.visible && !o.geo.lines);
      pickable.forEach((o, i) => {
        gl.bindVertexArray(upload(o.geo));
        gl.uniformMatrix4fv(loc.uModel, false, mat4.compose(o.position, o.rotation, o.scale));
        gl.uniform3f(loc.uColor, ((i + 1) & 255) / 255, (((i + 1) >> 8) & 255) / 255, 0);   // 連番を色にする
        gl.uniform1f(loc.uLit, 0);
        gl.drawElements(gl.TRIANGLES, o.geo.idx.length, gl.UNSIGNED_SHORT, 0);
      });
      const r = canvas.getBoundingClientRect(), dpr = w / r.width;
      const px = new Uint8Array(4);
      gl.readPixels(Math.round((sx - r.left) * dpr), Math.round((r.height - (sy - r.top)) * dpr), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      const id = px[0] + (px[1] << 8);
      return id > 0 ? pickable[id - 1] : null;
    };

    // カメラ操作（129）：ドラッグ＝オービット、Shift/中ボタン＝パン、ホイール＝ドリー
    viewer.attachOrbit = (o = {}) => {
      let mode = null, last = null;
      const local = e => ({ x: e.clientX, y: e.clientY });
      canvas.style.touchAction = 'none';
      const pointers = new Map();
      canvas.addEventListener('pointerdown', e => {
        pointers.set(e.pointerId, local(e));
        if (o.filter && !o.filter(e)) return;
        mode = (e.shiftKey || e.button === 1) ? 'pan' : 'orbit'; last = local(e);
        canvas.setPointerCapture(e.pointerId);
      });
      canvas.addEventListener('pointermove', e => {
        if (pointers.has(e.pointerId)) pointers.set(e.pointerId, local(e));
        if (pointers.size >= 2) { mode = 'pan'; }                       // 2本指はパン（129）
        if (!mode || !last) return;
        const p = local(e), dx = p.x - last.x, dy = p.y - last.y; last = p;
        if (mode === 'orbit') {
          camera.azimuth -= dx * 0.008;
          camera.elevation = Math.max(-1.5, Math.min(1.5, camera.elevation + dy * 0.008));   // 真上・真下で回り込まない
        } else {
          const eye = viewer.eye(), fwd = vec3.normalize(vec3.sub(camera.target, eye));
          const right = vec3.normalize(vec3.cross(fwd, [0,1,0])), up = vec3.cross(right, fwd);
          const k = camera.distance * 0.0016;
          camera.target = vec3.add(camera.target, vec3.add(vec3.scale(right, -dx * k), vec3.scale(up, dy * k)));
        }
        viewer.draw(); o.onChange && o.onChange();
      });
      const end = e => { pointers.delete(e.pointerId); if (!pointers.size) { mode = null; last = null; } };
      canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
      canvas.addEventListener('wheel', e => {
        e.preventDefault();
        camera.distance = Math.max(o.minDistance || 1, Math.min(o.maxDistance || 60, camera.distance * Math.exp(e.deltaY * 0.0015)));
        viewer.draw(); o.onChange && o.onChange();
      }, { passive: false });
    };
    canvas.__mini3d = viewer;   // 開発時の確認用（テストや開発者ツールから状態を覗ける）
    return viewer;
  }

  global.Mini3D = { createViewer, Shapes, mat4, vec3, hex2rgb };
})(window);
