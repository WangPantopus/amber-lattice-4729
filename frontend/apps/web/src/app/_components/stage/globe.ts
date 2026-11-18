// ============================================================
// The homepage's Earth: NASA's night and day pictures on a sphere, a thin blue rim, the home's light, and moments
// pinging on cities while the page is at the scale of the world.
//
// Ported from the approved sample, which used three.js r128. This module is imported only on the client, after the
// page has painted (HomeStage), so three.js never delays the hero. Colour: r128 wrote shader output as it was, with
// no colour-space conversion, and that is the look the founder approved. Current three.js converts built-in
// materials' output to sRGB, so the renderer's output colour space is set to linear (no conversion) and every texture
// keeps three's default NoColorSpace (no decoding): the shaders see and write the same numbers as in the sample.
//
// Two tiers of pictures: the sample's 4096-wide ones first, then NASA's own 8192-wide Black Marble and Blue Marble
// (tone-matched to the first; public/home/README.md), so the Earth stays sharp in the middle of the zoom. The second
// tier loads only after the first is showing, is decoded off the main thread and uploaded before it is swapped in, and
// only where it can be carried: a GPU that takes 8192-wide textures, a wide screen with a mouse or trackpad, at least
// 8 GB of memory where the browser reports it (the pair takes about 360 MB of GPU memory), and no data saver.
// Everywhere else the Earth stays as in the sample.
// ============================================================

import {
  AdditiveBlending,
  BackSide,
  CanvasTexture,
  Group,
  ImageBitmapLoader,
  LinearSRGBColorSpace,
  Mesh,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Texture,
  TextureLoader,
  Vector3,
  WebGLRenderer,
} from 'three';
import { lerp, sstep } from './scene';

const HOME = { lat: 45.64, lon: -122.6 };

const CITIES: Array<[number, number]> = [[40.7, -74], [34, -118.2], [41.9, -87.6], [19.4, -99.1], [-23.5, -46.6], [-34.6, -58.4], [4.7, -74], [-12, -77], [43.7, -79.4], [51.5, -0.1], [48.9, 2.35], [40.4, -3.7], [52.5, 13.4], [41.9, 12.5], [6.5, 3.4], [30, 31.2], [-1.3, 36.8], [-26.2, 28], [41, 29], [55.8, 37.6], [25.2, 55.3], [19.1, 72.9], [28.6, 77.2], [23.8, 90.4], [13.8, 100.5], [1.35, 103.8], [-6.2, 106.8], [22.3, 114.2], [31.2, 121.5], [39.9, 116.4], [37.6, 127], [35.7, 139.7], [14.6, 121], [-33.9, 151.2], [-36.8, 174.8], [21.3, -157.9], [47.6, -122.3], [39.7, -105], [25.8, -80.2], [29.8, -95.4], [33.7, -84.4], [59.3, 18.1], [-4.3, 15.3], [24.7, 46.7], [33.6, -7.6], [10.5, -66.9], [64.1, -21.9], [49.3, -123.1]];

export interface GlobeFrame {
  W: number;
  H: number;
  narrow: boolean;
  u: number;
  t: number;
  reduced: boolean;
  /** Progress through the world section, 0–1. */
  worldP: number;
  /** Progress into the closing section, 0–1. */
  closeP: number;
}

export interface Globe {
  size(W: number, H: number, narrow: boolean): void;
  draw(f: GlobeFrame, alpha: number): void;
  dispose(): void;
}

function ll(lat: number, lon: number, r: number) {
  const phi = ((lon + 180) * Math.PI) / 180, th = ((90 - lat) * Math.PI) / 180;
  return new Vector3(-r * Math.cos(phi) * Math.sin(th), r * Math.cos(th), r * Math.sin(phi) * Math.sin(th));
}

function dotTex(ring: boolean) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  if (ring) {
    g.strokeStyle = 'rgba(255,200,103,1)';
    g.lineWidth = 7;
    g.beginPath();
    g.arc(64, 64, 52, 0, 6.283);
    g.stroke();
  } else {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,240,205,1)');
    gr.addColorStop(0.25, 'rgba(255,200,103,.9)');
    gr.addColorStop(1, 'rgba(255,200,103,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
  }
  return new CanvasTexture(c);
}

const EARTH_VERTEX = 'varying vec2 vUv; varying vec3 vN; varying vec3 vP; void main(){ vUv=uv; vN=normalize(mat3(modelMatrix)*normal); vec4 wp=modelMatrix*vec4(position,1.0); vP=wp.xyz; gl_Position=projectionMatrix*viewMatrix*wp; }';
const EARTH_FRAGMENT = [
  'uniform sampler2D day; uniform sampler2D night; uniform vec3 sun; uniform float ready; varying vec2 vUv; varying vec3 vN; varying vec3 vP;',
  'void main(){ vec3 n=normalize(vN); float nl=dot(n,sun); vec3 d=texture2D(day,vUv).rgb; vec3 nt=texture2D(night,vUv).rgb;',
  ' float dayAmt=smoothstep(-0.10,0.24,nl);',
  ' vec3 dayCol=d*(0.22+1.0*max(nl,0.0));',
  ' vec3 lights=pow(nt,vec3(1.25))*vec3(1.5,1.12,0.7)*2.1;',
  ' vec3 nightCol=d*vec3(0.03,0.045,0.085)+lights;',
  ' vec3 col=mix(nightCol,dayCol,dayAmt);',
  ' float tw=smoothstep(-0.22,0.0,nl)*(1.0-smoothstep(0.0,0.26,nl)); col+=vec3(1.0,0.45,0.16)*tw*0.20;',
  ' vec3 v=normalize(cameraPosition-vP); float f=pow(1.0-max(dot(n,v),0.0),4.6); col+=vec3(0.22,0.48,1.0)*f*(0.16+0.85*dayAmt);',
  ' gl_FragColor=vec4(col*ready,1.0); }',
].join('\n');
const ATMO_VERTEX = 'varying vec3 vNv; varying vec3 vDir; void main(){ vNv=normalize(normalMatrix*normal); vDir=normalize(mat3(modelMatrix)*position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }';
const ATMO_FRAGMENT = 'uniform vec3 sun; varying vec3 vNv; varying vec3 vDir; void main(){ float i=pow(smoothstep(0.0,0.46,-vNv.z),2.4); float s=smoothstep(-0.45,0.5,dot(vDir,sun)); vec3 c=mix(vec3(0.10,0.22,0.62),vec3(0.42,0.68,1.0),s)+vec3(1.0,0.5,0.2)*s*(1.0-s)*1.3; gl_FragColor=vec4(c*i*(0.38+1.25*s),1.0); }';

/** The Earth on `canvas`, or null where WebGL is not available (the page then keeps its stars and drawn town). */
export function createGlobe(canvas: HTMLCanvasElement, opts: { W: number; H: number; narrow: boolean; base: string }): Globe | null {
  let R: WebGLRenderer;
  try {
    R = new WebGLRenderer({ canvas, alpha: true, antialias: true });
  } catch {
    return null;
  }
  R.outputColorSpace = LinearSRGBColorSpace;
  R.setClearColor(0x000000, 0);

  const scene = new Scene();
  const cam = new PerspectiveCamera(32, opts.W / opts.H, 0.1, 100);
  const tilt = new Group(), spin = new Group();
  scene.add(tilt);
  tilt.add(spin);
  const un = {
    day: { value: null as Texture | null },
    night: { value: null as Texture | null },
    sun: { value: new Vector3(-0.6, 0.3, -0.7).normalize() },
    ready: { value: 0 },
  };
  const earthGeo = new SphereGeometry(1, 128, 96);
  const earthMat = new ShaderMaterial({ uniforms: un, vertexShader: EARTH_VERTEX, fragmentShader: EARTH_FRAGMENT });
  spin.add(new Mesh(earthGeo, earthMat));
  const atmoGeo = new SphereGeometry(1.085, 64, 48);
  const atmoMat = new ShaderMaterial({
    uniforms: { sun: un.sun },
    side: BackSide,
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
    vertexShader: ATMO_VERTEX,
    fragmentShader: ATMO_FRAGMENT,
  });
  tilt.add(new Mesh(atmoGeo, atmoMat));

  const ringMap = dotTex(true), dotMap = dotTex(false);
  const sprite = (map: CanvasTexture, opacity = 1) =>
    new Sprite(new SpriteMaterial({ map, blending: AdditiveBlending, depthWrite: false, transparent: true, opacity }));
  const home = sprite(dotMap);
  home.position.copy(ll(HOME.lat, HOME.lon, 1.006));
  spin.add(home);
  const homeRing = sprite(ringMap);
  homeRing.position.copy(home.position);
  spin.add(homeRing);
  const pings = CITIES.map(([la, lo], n) => {
    const ring = sprite(ringMap, 0), dot = sprite(dotMap, 0);
    ring.position.copy(ll(la, lo, 1.008));
    dot.position.copy(ring.position);
    dot.scale.setScalar(0.03);
    spin.add(ring);
    spin.add(dot);
    return { ring, dot, off: (n * 0.618) % 1, dur: 2.6 + (n % 5) * 0.5 };
  });

  let loaded = false, got = 0, disposed = false, wide = !opts.narrow;
  let sharpTimer = 0;
  const aniso = Math.min(8, R.capabilities.getMaxAnisotropy());
  const done = () => {
    if (++got !== 2) return;
    loaded = true;
    sharpTimer = window.setTimeout(sharpen, 1500); // once the first tier has faded in
  };
  const loader = new TextureLoader();
  const night = loader.load(`${opts.base}/earth-night.jpg`, done);
  const day = loader.load(`${opts.base}/earth-day.jpg`, done);
  night.anisotropy = aniso;
  day.anisotropy = aniso;
  un.night.value = night;
  un.day.value = day;
  const textures: Texture[] = [night, day];

  // The second tier (see the top of this file).
  function sharpen() {
    const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
    const canCarry =
      R.capabilities.maxTextureSize >= 8192 &&
      wide &&
      window.matchMedia('(pointer: fine)').matches &&
      (nav.deviceMemory ?? 8) >= 8 &&
      !nav.connection?.saveData &&
      typeof createImageBitmap === 'function';
    if (disposed || !canCarry) return;
    // Decoded straight to the orientation and colours the first tier uploads with (flipped, no colour conversion).
    const bitmaps = new ImageBitmapLoader().setOptions({ imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
    const get = (name: string) =>
      new Promise<Texture>((resolve, reject) => {
        bitmaps.load(
          `${opts.base}/${name}`,
          (bitmap) => {
            const t = new Texture(bitmap);
            t.flipY = false;
            t.anisotropy = aniso;
            t.needsUpdate = true;
            resolve(t);
          },
          undefined,
          reject,
        );
      });
    Promise.all([get('earth-night-8k.jpg'), get('earth-day-8k.jpg')])
      .then(([n8, d8]) => {
        if (disposed) {
          n8.dispose();
          d8.dispose();
          return;
        }
        R.initTexture(n8); // upload now, not inside a frame
        R.initTexture(d8);
        un.night.value = n8;
        un.day.value = d8;
        night.dispose();
        day.dispose();
        textures.push(n8, d8);
      })
      .catch(() => {
        // The first tier stays.
      });
  }

  const size = (W: number, H: number, narrow: boolean) => {
    wide = !narrow;
    R.setPixelRatio(Math.min(window.devicePixelRatio || 1, narrow ? 1.5 : 2));
    R.setSize(W, H, false);
    cam.aspect = W / H;
    cam.updateProjectionMatrix();
  };
  size(opts.W, opts.H, opts.narrow);

  const draw = (f: GlobeFrame, alpha: number) => {
    canvas.style.opacity = alpha.toFixed(3);
    if (alpha <= 0.01) return;
    const { W, H, narrow, u, t, reduced, worldP, closeP } = f;
    if (loaded && un.ready.value < 1) un.ready.value = Math.min(1, un.ready.value + 0.04);
    const s45 = sstep(4, 5, u), wp = sstep(0.3, 1, worldP), afterWorld = worldP >= 1 ? 1 : 0;
    // how far, and where on the screen
    const d = u >= 4 ? lerp(1.95, narrow ? 3.9 : 3.5, s45) : lerp(1.62, 1.95, sstep(3.2, 4, u));
    cam.position.set(0, 0, d);
    cam.lookAt(0, 0, 0);
    const half = Math.tan((16 * Math.PI) / 180) * d;
    const axFar = W / H > 1.55 ? 0.78 : 0.86;
    const axT = narrow ? 0.5 : lerp(0.66, axFar, s45), ayT = narrow ? lerp(0.36, 0.8, s45 * (1 - wp)) : lerp(0.52, 0.66, s45);
    tilt.position.set((axT - 0.5) * 2 * half * (W / H), -(ayT - 0.5) * 2 * half, 0);
    // which side faces us
    const sway = reduced ? 0 : 9 * Math.sin(t * 0.045) * s45;
    const lon = HOME.lon + (-98 - HOME.lon) * s45 * (1 - wp) + (20 - HOME.lon) * wp + sway + (afterWorld ? closeP * 46 : 0);
    const lat = lerp(HOME.lat, lerp(30, 24, wp), s45);
    spin.rotation.y = (-(lon + 90) * Math.PI) / 180;
    tilt.rotation.x = ((lat * Math.PI) / 180) * 0.86;
    // the sun: behind the Earth at night, coming round at the end
    const th = (lerp(lerp(150, 132, wp), 78, sstep(0.05, 0.85, closeP)) * Math.PI) / 180;
    un.sun.value.set(-Math.sin(th), 0.28, Math.cos(th)).normalize();
    // you are here
    const hs = lerp(0.026, 0.042, s45) * (reduced ? 1 : 1 + 0.12 * Math.sin(t * 2.2));
    home.scale.setScalar(hs);
    const rp = reduced ? 0.5 : (t * 0.45) % 1;
    homeRing.scale.setScalar(hs * (1 + rp * 1.9));
    homeRing.material.opacity = (1 - rp) * 0.8;
    // moments, everywhere (with reduced motion they light up but hold still, as in the sample)
    const amt = sstep(0.36, 0.62, worldP) * (1 - sstep(0.3, 0.9, closeP) * 0.5);
    for (const p of pings) {
      const a = reduced ? 0.5 : ((t / p.dur) + p.off) % 1;
      p.ring.scale.setScalar(0.012 + a * 0.1);
      p.ring.material.opacity = (1 - a) * amt;
      p.dot.material.opacity = amt * 0.9;
    }
    R.render(scene, cam);
  };

  const dispose = () => {
    disposed = true;
    window.clearTimeout(sharpTimer);
    for (const x of [earthGeo, atmoGeo, earthMat, atmoMat, ringMap, dotMap, ...textures]) x.dispose();
    home.material.dispose();
    homeRing.material.dispose();
    for (const p of pings) {
      p.ring.material.dispose();
      p.dot.material.dispose();
    }
    R.dispose();
  };

  return { size, draw, dispose };
}
