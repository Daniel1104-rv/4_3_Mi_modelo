import * as THREE from 'three';
import Stats from 'three/addons/libs/stats.module.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { ARButton } from 'three/addons/webxr/ARButton.js';

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

const params = {
    current: 'Capoeira'
};

init();

/* ================================================= */
/* ===================== INIT ====================== */
/* ================================================= */
function init() {

    const container = document.createElement('div');
    document.body.appendChild(container);

    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 2000);

    scene = new THREE.Scene();

    const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 3);
    scene.add(hemi);

    loader = new FBXLoader();

    /* 🔥 Cargar modelo base (AQUÍ FALLABA) */
    loadBaseModel(BASE_MODEL).then(() => {
        preloadAnimations(KEY_TO_ANIM.filter(a => a !== BASE_MODEL));
    });

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    container.appendChild(renderer.domElement);

    document.body.appendChild(ARButton.createButton(renderer));

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.update();

    stats = new Stats();
    container.appendChild(stats.dom);

    const gui = new GUI();
    gui.add(params, 'current').name("Animación actual").listen();
    guiMorphsFolder = gui.addFolder("Morphs").hide();

    window.addEventListener('resize', onWindowResize);

    /* Cambiar animaciones con teclas 1-8 */
    window.addEventListener('keydown', e => {
        const n = parseInt(e.key);
        if (n >= 1 && n <= 8) playByName(KEY_TO_ANIM[n - 1]);
    });

    /* Colocar modelo AR donde toques */
    renderer.domElement.addEventListener("click", () => {
        if (!object) return;
        const pos = renderer.xr.getCamera(camera).position;
        object.position.set(pos.x, pos.y - 1.4, pos.z - 2);
    });

    renderer.setAnimationLoop(animate);
}

/* ================================================= */
/* ============= FUNCIÓN QUE FALTABA =============== */
/* ================================================= */
function loadBaseModel(name) {
    return new Promise((resolve, reject) => {
        loader.load(
            `${ANIM_PATH}${name}.fbx`,
            (group) => {

                if (object) {
                    scene.remove(object);
                }

                object = group;
                object.scale.set(0.01, 0.01, 0.01);
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

/* ================================================= */
/* ============ PRECARGA DE ANIMACIONES ============ */
/* ================================================= */
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

/* ================================================= */
/* ============ CAMBIAR ANIMACIONES FBX ============ */
/* ================================================= */
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

/* ================================================= */
/* ===================== UTILS ====================== */
/* ================================================= */
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    const delta = clock.getDelta();
    if (mixer) mixer.update(delta);
    renderer.render(scene, camera);
    stats.update();
}
