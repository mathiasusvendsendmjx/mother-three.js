import "./style.css";
import * as THREE from "three";
import { FirstPersonControls } from "three/examples/jsm/controls/FirstPersonControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

/* ========= Config: Start camera pose ========= */
// Choose one: "DEGREES" | "LOOKAT" | "MARKER"
const START_FROM = "DEGREES";

// If START_FROM === "DEGREES"
const START_YAW_DEG = 125; // rotate around Y (left/right)
const START_PITCH_DEG = 15; // rotate around X (up/down)

// If START_FROM === "LOOKAT"
const START_POS = new THREE.Vector3(140, 10, -100); // where camera stands
const LOOK_AT = new THREE.Vector3(100, 8, -140); // what camera looks at

/* ========= Scene / Camera / Renderer ========= */
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x333333);

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  2000
);
const EYE_HEIGHT = 10.0;
camera.position.set(140, EYE_HEIGHT, -100);
camera.rotation.order = "YXZ"; // for yaw/pitch helper

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(1.5);
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Cursor visible until game actually starts
renderer.domElement.style.cursor = "default";

/* ========= Lights ========= */
scene.add(new THREE.AmbientLight(0xffffff, 0.7));
const dirLight = new THREE.DirectionalLight(0xffffff, 2);
dirLight.position.set(10, 20, 10);
scene.add(dirLight);

/* ========= UI Overlays: Start → Video → Loading → Controls ========= */
// Start
const startOverlay = el(`
  <div style="position:fixed;inset:0;background:rgba(0,0,0,.5);
              display:flex;align-items:center;justify-content:center;z-index:1000">
    <button id="btnStart" style="padding:14px 18px;border:0;border-radius:12px;background:#4ade80;color:#0a0a0a;cursor:pointer;font-size:16px">
      Start
    </button>
  </div>
`);
document.body.appendChild(startOverlay);
const btnStart = startOverlay.querySelector("#btnStart");

// Video (animation + audio)
const videoOverlay = el(`
  <div style="position:fixed;inset:0;background:#000;display:none;align-items:center;justify-content:center;z-index:1000">
    <video id="introVid" src="/intro.mp4" style="max-width:100%;max-height:100%" playsinline></video>
    <button id="skipVid" style="position:absolute;right:24px;top:24px;padding:10px 14px;border:0;border-radius:10px;background:#fff;color:#000;cursor:pointer">
      Skip
    </button>
  </div>
`);
document.body.appendChild(videoOverlay);
const introVid = videoOverlay.querySelector("#introVid");
const skipVid = videoOverlay.querySelector("#skipVid");

// Loading (transparent; shows scene behind)
const loadingOverlay = el(`
  <div style="position:fixed;inset:0;background:transparent;display:none;
              align-items:center;justify-content:center;z-index:1000;color:#fff;font-family:system-ui,sans-serif;flex-direction:column;gap:12px">
    <div style="background:rgba(18,18,18,.55);backdrop-filter: blur(6px);-webkit-backdrop-filter: blur(6px);
                border:1px solid rgba(255,255,255,.1);padding:18px 16px;border-radius:12px;min-width:280px">
      <div style="font-size:14px;opacity:.9;margin-bottom:8px;text-align:center">Loading…</div>
      <div style="width:320px;max-width:60vw;height:8px;background:#333;border-radius:999px;overflow:hidden">
        <div id="bar" style="height:100%;width:0%;background:#4ade80;transition:width .15s ease"></div>
      </div>
    </div>
  </div>
`);
document.body.appendChild(loadingOverlay);
const loadingBar = loadingOverlay.querySelector("#bar");

// Controls (transparent card; blocks input until Continue)
const controlsOverlay = el(`
  <div style="position:fixed;inset:0;background:transparent;display:none;
              align-items:center;justify-content:center;z-index:1000;color:#fff;font-family:system-ui,sans-serif;pointer-events:auto">
    <div style="background:rgba(18,18,18,.55);backdrop-filter: blur(6px);-webkit-backdrop-filter: blur(6px);
                border:1px solid rgba(255,255,255,.1);padding:22px 20px;border-radius:14px;max-width:520px;width:90%;
                box-shadow:0 10px 30px rgba(0,0,0,.35)">
      <h2 style="margin:0 0 10px;font-size:20px">How to play</h2>
      <ul style="margin:0 0 18px 18px;line-height:1.6;font-size:14px;opacity:.95">
        <li>W / A / S / D — move</li>
        <li>Mouse — look</li>
        <li>Shift — run</li>
        <li>Stay on the board; borders are blocked</li>
      </ul>
      <div style="display:flex;justify-content:flex-end;gap:10px">
        <button id="btnContinue" style="padding:10px 14px;border:0;border-radius:10px;background:#4ade80;color:#0a0a0a;cursor:pointer">
          Continue
        </button>
      </div>
    </div>
  </div>
`);
document.body.appendChild(controlsOverlay);
const btnContinue = controlsOverlay.querySelector("#btnContinue");

/* ========= Flow: Start → Video → Loading → Controls → Game ========= */
btnStart.addEventListener("click", async () => {
  startOverlay.style.display = "none";
  videoOverlay.style.display = "flex";
  try {
    introVid.currentTime = 0;
    introVid.muted = false; // plays with audio thanks to user gesture
    await introVid.play();
  } catch {
    introVid.setAttribute("controls", "true");
  }
  // Fallback after ~30s
  setTimeout(() => {
    if (videoOverlay.style.display !== "none") endVideo();
  }, 30000);
});
skipVid.addEventListener("click", endVideo);
introVid.addEventListener("ended", endVideo);

function endVideo() {
  introVid.pause();
  videoOverlay.style.display = "none";
  beginLoading(); // transparent loading; scene visible
}

btnContinue.addEventListener("click", () => {
  controlsOverlay.style.display = "none";
  startGame(); // game ON; UI disappears; camera pose unchanged
});

/* ========= Loading (GLTFs) ========= */
let navMesh = null;
let worldRoot = null;
let gltfLoader = null;

function beginLoading() {
  loadingOverlay.style.display = "flex";

  const manager = new THREE.LoadingManager();
  manager.onProgress = (url, loaded, total) => {
    const pct = total ? Math.round((loaded / total) * 100) : 0;
    loadingBar.style.width = pct + "%";
  };
  manager.onLoad = () => {
    // -- Set the precise start pose BEFORE showing controls --
    setInitialView(); // << makes the still frame = game start pose

    setTimeout(() => {
      loadingOverlay.style.display = "none";
      controlsOverlay.style.display = "flex";
      isPlaying = false; // block movement while UI is up
      renderer.domElement.style.cursor = "default";
    }, 150);
  };

  gltfLoader = new GLTFLoader(manager);

  // Visible world
  gltfLoader.load("/models/bundkort.gltf", (gltf) => {
    worldRoot = gltf.scene;
    worldRoot.scale.set(5, 5, 5);
    worldRoot.rotation.y = Math.PI * 1.2;
    scene.add(worldRoot);
  });

  // Invisible nav mesh (walkable bounds)
  gltfLoader.load("/models/nav.gltf", (gltf) => {
    navMesh = gltf.scene;
    navMesh.traverse((o) => {
      if (o.isMesh && o.material) {
        o.material.transparent = true;
        o.material.opacity = 0; // invisible but raycastable
      }
    });
    navMesh.scale.set(5, 5, 5);
    navMesh.rotation.y = Math.PI * 1.2;
    scene.add(navMesh);
    navMesh.updateMatrixWorld(true);

    // If start is off-nav, place camera on nav center (height gets fixed later)
    const box = new THREE.Box3().setFromObject(navMesh);
    const c = box.getCenter(new THREE.Vector3());
    const h = hitXZ(c.x, c.z);
    if (h) camera.position.set(h.x, h.y + EYE_HEIGHT, h.z);
  });
}

/* ========= Make the still frame = exact start pose ========= */
function setInitialView() {
  // Try MARKER first (artist-friendly)
  if (START_FROM === "MARKER") {
    const ok = setFromMarkers(worldRoot) || setFromMarkers(navMesh);
    if (ok) return;
    // fall back to degrees if markers not found
    setFromDegrees(START_YAW_DEG, START_PITCH_DEG);
    return;
  }

  if (START_FROM === "LOOKAT") {
    camera.position.copy(START_POS);
    camera.lookAt(LOOK_AT);
    syncControlsLook();
    return;
  }

  // Default: DEGREES
  setFromDegrees(START_YAW_DEG, START_PITCH_DEG);
}

function setFromDegrees(yawDeg, pitchDeg) {
  camera.rotation.set(
    THREE.MathUtils.degToRad(pitchDeg),
    THREE.MathUtils.degToRad(yawDeg),
    0,
    "YXZ"
  );
  syncControlsLook();
}

function setFromMarkers(root) {
  if (!root) return false;
  const spawn = root.getObjectByName("Spawn");
  if (!spawn) return false;

  // Position: use Spawn XY, ground + EYE_HEIGHT
  const wp = new THREE.Vector3();
  spawn.getWorldPosition(wp);
  camera.position.set(wp.x, wp.y + EYE_HEIGHT, wp.z);

  // Direction: prefer SpawnTarget if present, else use spawn forward
  const target = root.getObjectByName("SpawnTarget");
  if (target) {
    const wt = new THREE.Vector3();
    target.getWorldPosition(wt);
    camera.lookAt(wt);
  } else {
    // compute forward from spawn's rotation
    const wq = new THREE.Quaternion();
    spawn.getWorldQuaternion(wq);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(wq);
    camera.lookAt(wp.clone().add(forward));
  }
  syncControlsLook();
  return true;
}

function syncControlsLook() {
  // Nudge FirstPersonControls so it matches camera rotation
  const forward = new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation);
  controls.lookAt(camera.position.clone().add(forward));
}

/* ========= Controls ========= */
const controls = new FirstPersonControls(camera, renderer.domElement);
const BASE_SPEED = 30;
const RUN_MULT = 2;

controls.movementSpeed = BASE_SPEED;
const BASE_LOOK = 0.5; // look speed scaled by glide
const GLIDE_TAU = 0.12; // seconds; smaller = quicker fade
const GLIDE_MIN_ACTIVE = 0.02; // disable look below this
controls.lookSpeed = BASE_LOOK;
controls.lookVertical = true;
controls.constrainVertical = false;
controls.handleResize();

let lookGain = 0; // 0..1
document.addEventListener("mousemove", () => {
  lookGain = 1;
});

window.addEventListener("keydown", (e) => {
  if (e.code === "ShiftLeft" || e.code === "ShiftRight")
    controls.movementSpeed = BASE_SPEED * RUN_MULT;
});
window.addEventListener("keyup", (e) => {
  if (e.code === "ShiftLeft" || e.code === "ShiftRight")
    controls.movementSpeed = BASE_SPEED;
});

/* ========= Start the actual game (UI disappears; pose unchanged) ========= */
function startGame() {
  isPlaying = true;
  renderer.domElement.style.cursor = "none"; // hide cursor in-game
}

/* ========= Raycast + movement (no-jitter border) ========= */
const downRay = new THREE.Raycaster();
downRay.far = 20000;
function hitXZ(x, z) {
  if (!navMesh) return null;
  downRay.set(new THREE.Vector3(x, 10000, z), new THREE.Vector3(0, -1, 0));
  const h = downRay.intersectObject(navMesh, true);
  return h.length ? h[0].point : null;
}

/* ========= Animate ========= */
const clock = new THREE.Clock();
let targetY = camera.position.y;
let isPlaying = false;

function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);

  if (isPlaying) {
    // look glide fade
    if (lookGain > 0) {
      lookGain *= Math.exp(-dt / GLIDE_TAU);
      if (lookGain < 1e-4) lookGain = 0;
    }
    controls.lookSpeed = BASE_LOOK * lookGain;
    controls.activeLook = lookGain > GLIDE_MIN_ACTIVE;

    // block vertical flying
    controls._moveUp = false;
    controls._moveDown = false;

    // 1) remember start
    const start = camera.position.clone();

    // 2) FirstPersonControls moves camera
    controls.update(dt);

    // 3) intended horizontal delta and revert to start
    const dx = camera.position.x - start.x;
    const dz = camera.position.z - start.z;
    camera.position.copy(start);
    camera.position.y = start.y;

    // 4) apply only if valid (full -> X -> Z). Else don't move.
    let appliedHit = null;
    const tryMove = (x, z) => {
      const h = hitXZ(x, z);
      if (h) camera.position.set(x, camera.position.y, z);
      return h;
    };

    if (dx !== 0 || dz !== 0) {
      appliedHit =
        tryMove(start.x + dx, start.z + dz) ||
        tryMove(start.x + dx, start.z) ||
        tryMove(start.x, start.z + dz) ||
        null;
    }

    // 5) ground height
    const groundHit = appliedHit || hitXZ(camera.position.x, camera.position.z);
    if (groundHit) targetY = groundHit.y + EYE_HEIGHT;

    // 6) smooth vertical glue
    camera.position.y += (targetY - camera.position.y) * 0.18;
  }

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

/* ========= Resize ========= */
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  controls.handleResize();
});

/* ========= tiny helper ========= */
function el(html) {
  const d = document.createElement("div");
  d.innerHTML = html.trim();
  return d.firstChild;
}
