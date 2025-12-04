import * as THREE from 'three';
import Stats from 'three/addons/libs/stats.module.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';

let camera, scene, renderer, stats, object, loader, guiMorphsFolder;
let mixer;

const clock = new THREE.Clock();

const BASE_MODEL = 'Capoeira';
const ANIM_PATH = 'models/fbx/';
const KEY_TO_ANIM = [
    'Capoeira',
    'Dying',
    'Hip Hop Dancing',
    'Jumping Down',
    'Praying',
    'Reaction',
    'Rumba Dancing',
    'Sitting Clap'
];

const animationsMap = new Map();
let currentAction = null;
let currentIndex = 0; // para el botón SIGUIENTE

const params = { current: 'Capoeira' };

/* ====== RETÍCULA Y HIT TEST ====== */
let reticle;
let hitTestSource = null;
let hitTestRequested = false;

init();

/* ================================================= */
/* ===================== INIT ====================== */
/* ================================================= */
function init() {

    const container = document.createElement('div');
    document.body.appendChild(container);

    /* Cámara AR */
    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 2000);

    /* Escena */
    scene = new THREE.Scene();

    const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 3);
    scene.add(hemi);

    loader = new FBXLoader();

    /* Carga modelo base */
    loadBaseModel(BASE_MODEL).then(() => {
        preloadAnimations(KEY_TO_ANIM.filter(a => a !== BASE_MODEL));
    });

    /* Renderer AR */
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    container.appendChild(renderer.domElement);

    /* DOM Overlay para que los botones sí aparezcan en AR */
    navigator.xr.requestSession("immersive-ar", {
        requiredFeatures: ["hit-test"],
        optionalFeatures: ["dom-overlay"],
        domOverlay: { root: document.body }
    }).then(session => {
        renderer.xr.setSession(session);
    });

    /* Mostrar botón SIGUIENTE dentro del AR */
    renderer.xr.addEventListener("sessionstart", () => {
        document.querySelector(".ar-controls").style.display = "block";
    });

    renderer.xr.addEventListener("sessionend", () => {
        document.querySelector(".ar-controls").style.display = "none";
    });

    /* OrbitControls (solo fuera del AR) */
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.update();

    stats = new Stats();
    container.appendChild(stats.dom);

    /* GUI */
    const gui = new GUI();
    gui.add(params, 'current').name("Animación actual").listen();
    guiMorphsFolder = gui.addFolder("Morphs").hide();

    window.addEventListener('resize', onWindowResize);

    /* Teclas 1–8 para animaciones */
    window.addEventListener('keydown', e => {
        const n = parseInt(e.key);
        if (n >= 1 && n <= 8) playByName(KEY_TO_ANIM[n - 1]);
    });

    /* ====== BOTÓN SIGUIENTE ====== */
    const btnNext = document.getElementById("btnNext");
    btnNext.addEventListener("click", () => {
        currentIndex++;
        if (currentIndex >= KEY_TO_ANIM.length) currentIndex = 0;
        const anim = KEY_TO_ANIM[currentIndex];
        playByName(anim);
    });

    /* ====== RETÍCULA PARA PISO ====== */
    reticle = new THREE.Mesh(
        new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0x00ff00 })
    );
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;
    scene.add(reticle);

    /* COLOCAR MODELO EN EL PISO REAL */
    renderer.domElement.addEventListener("click", () => {
        if (!reticle.visible || !object) return;

        const p = new THREE.Vector3();
        p.setFromMatrixPosition(reticle.matrix);

        object.position.copy(p);
        object.position.y += 0.02; // evitar que se hunda
    });

    renderer.setAnimationLoop(animate);
}

/* ========================================================= */
/* ===================== MODELO FBX ======================== */
/* ========================================================= */
function loadBaseModel(name) {
    return new Promise((resolve, reject) => {
        loader.load(`${ANIM_PATH}${name}.fbx`,
            group => {
                if (object) scene.remove(object);

                object = group;

                /* 🔥 ESCALA DEL MODELO (ajustada para AR) */
                object.scale.set(0.003, 0.003, 0.003);

                scene.add(object);

                mixer = new THREE.AnimationMixer(object);

                const clips = object.animations || [];
                clips.forEach(c => animationsMap.set(c.name || name, c));

                if (clips.length > 0) {
                    const first = clips[0];
                    startAction(first);
                    params.current = first.name || name;
                }

                resolve();
            },
            undefined,
            err => reject(err)
        );
    });
}

/* ========================================================= */
/* ===================== PRECARGA ========================== */
/* ========================================================= */
function preloadAnimations(names) {
    names.forEach(name => {
        loader.load(`${ANIM_PATH}${name}.fbx`, fbx => {
            if (!fbx.animations.length) return;
            const clip = fbx.animations[0];
            clip.optimize();
            animationsMap.set(name, clip);
        });
    });
}

/* ========================================================= */
/* ===================== ANIMACIONES ======================= */
/* ========================================================= */
function playByName(name) {
    if (!mixer) return;
    const clip = animationsMap.get(name);
    if (!clip) return;

    const nextAction = mixer.clipAction(clip, object);
    crossFade(nextAction, 0.25);
    params.current = name;
}

function startAction(clip) {
    const action = mixer.clipAction(clip);
    action.reset().fadeIn(0.2).play();
    currentAction = action;
}

function crossFade(nextAction, duration) {
    if (currentAction && currentAction !== nextAction) {
        nextAction.reset().play();
        currentAction.crossFadeTo(nextAction, duration, false);
    } else {
        nextAction.reset().play();
    }
    currentAction = nextAction;
}

/* ========================================================= */
/* ===================== HIT TEST ========================== */
/* ========================================================= */
function requestHitTestSource(session) {
    session.requestReferenceSpace('viewer').then(ref => {
        session.requestHitTestSource({ space: ref }).then(source => {
            hitTestSource = source;
        });
    });

    session.addEventListener("end", () => {
        hitTestSource = null;
        hitTestRequested = false;
    });
}

/* ========================================================= */
/* ===================== ANIM LOOP ========================= */
/* ========================================================= */
function animate(timestamp, frame) {

    const delta = clock.getDelta();
    if (mixer) mixer.update(delta);

    if (frame) {
        const session = renderer.xr.getSession();

        if (!hitTestRequested) {
            requestHitTestSource(session);
            hitTestRequested = true;
        }

        if (hitTestSource) {
            const ref = renderer.xr.getReferenceSpace();
            const hits = frame.getHitTestResults(hitTestSource);

            if (hits.length > 0) {
                const hit = hits[0];
                const pose = hit.getPose(ref);

                reticle.visible = true;
                reticle.matrix.fromArray(pose.transform.matrix);
            } else {
                reticle.visible = false;
            }
        }
    }

    renderer.render(scene, camera);
    stats.update();
}

/* ========================================================= */
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}
