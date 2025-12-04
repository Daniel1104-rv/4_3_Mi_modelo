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

let currentIndex = 0;
const animationsMap = new Map();
let currentAction = null;

let reticle, hitTestSource = null, hitTestRequested = false;

init();

/* ===================== INIT ====================== */
function init() {

    const container = document.createElement('div');
    document.body.appendChild(container);

    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 2000);

    scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 3));

    loader = new FBXLoader();

    loadBaseModel(BASE_MODEL).then(() => {
        preloadAnimations(KEY_TO_ANIM.slice(1));
    });

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    container.appendChild(renderer.domElement);

    /* 🔥 ARButton con DOM Overlay */
    document.body.appendChild(ARButton.createButton(renderer, {
        requiredFeatures: ['hit-test'],
        optionalFeatures: ['dom-overlay'],
        domOverlay: { root: document.body }
    }));

    renderer.xr.addEventListener("sessionstart", () => {
        document.querySelector(".ar-controls").style.display = "block";
    });

    renderer.xr.addEventListener("sessionend", () => {
        document.querySelector(".ar-controls").style.display = "none";
    });

    new OrbitControls(camera, renderer.domElement);

    stats = new Stats();
    container.appendChild(stats.dom);

    /* Botón SIGUIENTE */
   document.getElementById("btnNext").addEventListener("click", () => {
    currentIndex++;

    if (currentIndex >= KEY_TO_ANIM.length) {
        currentIndex = 0; // volver al inicio siempre
    }

    playByName(KEY_TO_ANIM[currentIndex]);
});


    

    /* Retícula */
    reticle = new THREE.Mesh(
        new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0x00ff00 })
    );
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;
    scene.add(reticle);

    /* Colocar modelo */
    renderer.domElement.addEventListener("click", () => {
        if (reticle.visible && object) {
            const pos = new THREE.Vector3().setFromMatrixPosition(reticle.matrix);
            object.position.copy(pos);
        }
    });

    renderer.setAnimationLoop(animate);
}

/* ===================== CARGA FBX ====================== */
function loadBaseModel(name) {
    return new Promise(resolve => {

        loader.load(`${ANIM_PATH}${name}.fbx`, group => {

            if (object) scene.remove(object);

            object = group;
            object.scale.set(0.003, 0.003, 0.003); // tamaño correcto

            mixer = new THREE.AnimationMixer(object);
            scene.add(object);

            group.animations.forEach(clip => animationsMap.set(clip.name, clip));

            if (group.animations.length > 0) {
                startAction(group.animations[0]);
            }

            resolve();
        });
    });
}

/* ===================== PRECARGA ====================== */
function preloadAnimations(names) {
    names.forEach(name => {
        loader.load(`${ANIM_PATH}${name}.fbx`, fbx => {
            if (fbx.animations.length)
                animationsMap.set(name, fbx.animations[0]);
        });
    });
}

/* ===================== ANIMACIONES ====================== */
function playByName(name) {
    const clip = animationsMap.get(name);
    if (!clip || !mixer) return;

    const next = mixer.clipAction(clip);

    // 🔥 REINICIAR SIEMPRE LA ANIMACIÓN
    next.reset();

    // transiciones suaves
    if (currentAction && currentAction !== next) {
        currentAction.crossFadeTo(next, 0.25, false);
    }

    next.play();
    currentAction = next;
}


function startAction(clip) {
    currentAction = mixer.clipAction(clip);
    currentAction.play();
}

/* ===================== HIT TEST ====================== */
function animate(t, frame) {

    if (mixer) mixer.update(clock.getDelta());

    const session = renderer.xr.getSession();
    if (frame && session) {

        if (!hitTestRequested) {
            session.requestReferenceSpace('viewer').then(ref => {
                session.requestHitTestSource({ space: ref }).then(source => {
                    hitTestSource = source;
                });
            });
            hitTestRequested = true;
        }

        if (hitTestSource) {
            const hits = frame.getHitTestResults(hitTestSource);
            if (hits.length > 0) {
                const refSpace = renderer.xr.getReferenceSpace();
                const pose = hits[0].getPose(refSpace);
                reticle.visible = true;
                reticle.matrix.fromArray(pose.transform.matrix);
            } else {
                reticle.visible = false;
            }
        }
    }

    renderer.render(scene, camera);
}
