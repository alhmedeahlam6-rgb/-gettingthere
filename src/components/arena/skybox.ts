/**
 * Procedural daytime skybox.
 *
 * The levels ship with baked lighting, so we can't brighten them with more
 * real-time lights without paying for extra shading. Instead we wrap the map
 * in a very large inverted sphere painted with a canvas-generated day sky
 * (zenith blue → warm horizon haze, a sun glow and a few soft clouds). It is
 * a single unlit draw call: zero lighting cost, but it lifts the whole scene
 * because the horizon, fog colour and reflections all read as daylight.
 */
import * as THREE from "three";

export type SkyPalette = {
  /** colour straight overhead */
  zenith: string;
  /** mid-sky */
  mid: string;
  /** hazy band where the sky meets the ground */
  horizon: string;
  /** warm sun disc / glow tint */
  sun: string;
};

export const DAY_SKY: SkyPalette = {
  zenith: "#2f6fc4",
  mid: "#7db4e8",
  horizon: "#d8e6f2",
  sun: "#fff3d0",
};

/** Fog / clear colour that blends with the horizon band of the sky above. */
export const DAY_HORIZON = 0xcddcea;

function makeSkyTexture(palette: SkyPalette, size: number): THREE.Texture {
  const w = size;
  const h = Math.round(size / 2);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  // vertical gradient: zenith at the top of the equirect map, horizon at 50%,
  // then a slightly darker ground haze underneath so nothing looks cut off.
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0.0, palette.zenith);
  grad.addColorStop(0.28, palette.mid);
  grad.addColorStop(0.5, palette.horizon);
  grad.addColorStop(0.62, "#b9c8d4");
  grad.addColorStop(1.0, "#8d9aa5");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // sun glow — roughly matching the baked sun direction (+x/+z, high up)
  const sunX = w * 0.68;
  const sunY = h * 0.2;
  const glow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, h * 0.55);
  glow.addColorStop(0, "rgba(255,246,214,0.95)");
  glow.addColorStop(0.12, "rgba(255,236,186,0.55)");
  glow.addColorStop(0.4, "rgba(255,230,180,0.16)");
  glow.addColorStop(1, "rgba(255,230,180,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  ctx.beginPath();
  ctx.fillStyle = palette.sun;
  ctx.arc(sunX, sunY, h * 0.022, 0, Math.PI * 2);
  ctx.fill();

  // soft cumulus band — cheap blobby clouds, densest near the horizon
  let seed = 20260819;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  ctx.globalCompositeOperation = "source-over";
  for (let i = 0; i < 90; i += 1) {
    const cx = rand() * w;
    const cy = h * (0.14 + rand() * 0.33);
    const scale = 0.4 + rand() * 1.5;
    const rx = h * 0.06 * scale;
    const ry = rx * (0.32 + rand() * 0.22);
    const alpha = 0.1 + rand() * 0.3;
    const puff = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
    puff.addColorStop(0, `rgba(255,255,255,${alpha})`);
    puff.addColorStop(0.55, `rgba(255,255,255,${alpha * 0.5})`);
    puff.addColorStop(1, "rgba(255,255,255,0)");
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, ry / rx);
    ctx.translate(-cx, -cy);
    ctx.fillStyle = puff;
    ctx.beginPath();
    ctx.arc(cx, cy, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

export type Skybox = {
  mesh: THREE.Mesh;
  /** keep the dome centred on the camera so it never gets clipped */
  update: (cameraPos: THREE.Vector3) => void;
  dispose: () => void;
};

/**
 * Adds a daylight sky dome to the scene and returns a handle.
 * `radius` should sit comfortably inside the camera far plane.
 */
export function addDaySkybox(
  scene: THREE.Scene,
  opts: { radius?: number; textureSize?: number; palette?: SkyPalette } = {},
): Skybox {
  const radius = opts.radius ?? 900;
  const texture = makeSkyTexture(opts.palette ?? DAY_SKY, opts.textureSize ?? 1024);
  const geo = new THREE.SphereGeometry(radius, 32, 20);
  const mat = new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: true,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "DaySkybox";
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.matrixAutoUpdate = true;
  scene.add(mesh);

  return {
    mesh,
    update: (cameraPos) => {
      mesh.position.copy(cameraPos);
    },
    dispose: () => {
      scene.remove(mesh);
      geo.dispose();
      mat.dispose();
      texture.dispose();
    },
  };
}
