import "./style.css";
import * as THREE from "three";
import { FirstPersonControls } from "three/examples/jsm/controls/FirstPersonControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

/* ---------- Scene / Camera / Renderer ---------- */
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x333333);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
const EYE_HEIGHT = 10.0;
camera.position.set(140, EYE_HEIGHT, -100);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(1.5); // stable frame time
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Hide mouse cursor
renderer.domElement.style.cursor = "none";

/* ---------- Lights ---------- */
scene.add(new THREE.AmbientLight(0xffffff, 0.7));
const dirLight = new THREE.DirectionalLight(0xffffff, 2);
dirLight.position.set(10, 20, 10);
scene.add(dirLight);

/* ---------- Load Models ---------- */
const gltfLoader = new GLTFLoader();
let navMesh = null;

// Visible world
gltfLoader.load("/models/bundkort.gltf", (gltf) => {
  const model = gltf.scene;
  model.scale.set(5, 5, 5);
  model.rotation.y = Math.PI * 1.2;
  scene.add(model);
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

  // If start position is off-nav, drop to nav center
  const box = new THREE.Box3().setFromObject(navMesh);
  const c = box.getCenter(new THREE.Vector3());
  const h = hitXZ(c.x, c.z);
  if (h) camera.position.set(h.x, h.y + EYE_HEIGHT, h.z);
});

/* ---------- Controls ---------- */
const controls = new FirstPersonControls(camera, renderer.domElement);
const BASE_SPEED = 30;
const RUN_MULT = 2;

const BASE_LOOK = 0.5;         // <— use this, glide scales it
const GLIDE_TAU = 0.12;        // <— seconds; smaller = shorter glide
const GLIDE_MIN_ACTIVE = 0.02; // <— below this we disable look

controls.movementSpeed = BASE_SPEED; // m/s
controls.lookSpeed = BASE_LOOK;
controls.lookVertical = true;
controls.constrainVertical = false;

// --- Smooth exponential glide (replaces timer-y version) ---
let lookGain = 0; // 0..1
document.addEventListener("mousemove", () => {
  lookGain = 1; // instant “charge” on mouse move
});

/* Shift to run */
window.addEventListener("keydown", (e) => {
  if (e.code === "ShiftLeft" || e.code === "ShiftRight") {
    controls.movementSpeed = BASE_SPEED * RUN_MULT;
  }
});
window.addEventListener("keyup", (e) => {
  if (e.code === "ShiftLeft" || e.code === "ShiftRight") {
    controls.movementSpeed = BASE_SPEED;
  }
});

/* ---------- Raycast helpers ---------- */
const downRay = new THREE.Raycaster();
downRay.far = 20000;

function hitXZ(x, z) {
  if (!navMesh) return null;
  downRay.set(new THREE.Vector3(x, 10000, z), new THREE.Vector3(0, -1, 0));
  const h = downRay.intersectObject(navMesh, true);
  return h.length ? h[0].point : null;
}

/* ---------- Animate (no border jitter; smooth glide) ---------- */
const clock = new THREE.Clock();
let targetY = camera.position.y;

function animate() {
  // clamp dt so decay stays stable if tab inactive
  const dt = Math.min(clock.getDelta(), 0.05);

  // Exponential decay of lookGain toward 0
  // after ~3*GLIDE_TAU it’s ~95% faded
  if (lookGain > 0) {
    lookGain *= Math.exp(-dt / GLIDE_TAU);
    if (lookGain < 1e-4) lookGain = 0;
  }

  // Drive look from gain: scale lookSpeed & toggle activeLook near-zero
  controls.lookSpeed = BASE_LOOK * lookGain;
  controls.activeLook = lookGain > GLIDE_MIN_ACTIVE;

  // no flying
  controls._moveUp = false;
  controls._moveDown = false;

  // 1) remember start
  const start = camera.position.clone();

  // 2) let controls compute intended movement this frame
  controls.update(dt);

  // 3) compute intended horizontal delta and revert to start
  const dx = camera.position.x - start.x;
  const dz = camera.position.z - start.z;
  camera.position.copy(start); // don't apply yet
  camera.position.y = start.y;

  // 4) apply only if valid (full -> X -> Z). If all invalid, stay at start.
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

  // 5) update ground height
  const groundHit = appliedHit || hitXZ(camera.position.x, camera.position.z);
  if (groundHit) targetY = groundHit.y + EYE_HEIGHT;

  // 6) smooth vertical glue
  camera.position.y += (targetY - camera.position.y) * 0.18;

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

/* ---------- Resize ---------- */
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  controls.handleResize();
});
