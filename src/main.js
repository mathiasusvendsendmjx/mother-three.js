import "./style.css";
import * as THREE from "three";
import { FirstPersonControls } from "three/examples/jsm/controls/FirstPersonControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

/* ---------- Scene / Camera / Renderer ---------- */
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

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(1.5); // stable frame time
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

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
const BASE_SPEED = 20;
const RUN_MULT = 2.5;

controls.movementSpeed = BASE_SPEED; // m/s
controls.lookSpeed = 0.5;
controls.lookVertical = true;
controls.constrainVertical = false;

// mouse-glide logic
controls.activeLook = false;
let mouseMoving = false;
let lastMoveTime = 0;
let glideTimer = 0;
const MOUSE_IDLE_DELAY = 0.2;

document.addEventListener("mousemove", () => {
  mouseMoving = true;
  lastMoveTime = performance.now() / 1000;
});

/* Shift to run */
let shiftDown = false;
window.addEventListener("keydown", (e) => {
  if (e.code === "ShiftLeft" || e.code === "ShiftRight") {
    shiftDown = true;
    controls.movementSpeed = BASE_SPEED * RUN_MULT;
  }
});
window.addEventListener("keyup", (e) => {
  if (e.code === "ShiftLeft" || e.code === "ShiftRight") {
    shiftDown = false;
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

/* ---------- Animate ---------- */
const clock = new THREE.Clock();
let lastValid = camera.position.clone();
let targetY = camera.position.y;
let frameCount = 0;

function animate() {
  const dt = clock.getDelta();
  frameCount++;

  /* --- Mouse-glide look --- */
  const now = performance.now() / 1000;
  const timeSinceMove = now - lastMoveTime;
  if (timeSinceMove < 0.2) {
    controls.activeLook = true;
    glideTimer = 0.2;
  } else if (glideTimer > 0) {
    controls.activeLook = true;
    glideTimer -= dt;
  } else {
    controls.activeLook = false;
  }

  /* --- Movement --- */
  controls._moveUp = false;
  controls._moveDown = false;

  const start = camera.position.clone();
  controls.update(dt);
  camera.position.y = start.y; // flatten Y

  const proposed = camera.position.clone();

  /* --- Nav clamp every 5th frame --- */
  let hit = null;
  if (frameCount % 5 === 0 && navMesh) {
    hit = hitXZ(proposed.x, proposed.z);
    if (!hit) {
      const tryX = new THREE.Vector3(proposed.x, start.y, start.z);
      if ((hit = hitXZ(tryX.x, tryX.z))) {
        camera.position.set(tryX.x, start.y, tryX.z);
      } else {
        const tryZ = new THREE.Vector3(start.x, start.y, proposed.z);
        if ((hit = hitXZ(tryZ.x, tryZ.z))) {
          camera.position.set(tryZ.x, start.y, tryZ.z);
        } else {
          camera.position.copy(lastValid);
          hit = hitXZ(lastValid.x, lastValid.z);
        }
      }
    }
    if (hit) {
      targetY = hit.y + EYE_HEIGHT;
      lastValid.set(camera.position.x, targetY, camera.position.z);
    }
  }

  /* --- Smooth height glue --- */
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
