import * as THREE from "three/webgpu";
import GIF from "gif.js";
import gifWorkerUrl from "gif.js/dist/gif.worker.js?url";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls"
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import {Lights} from "./lights";
import hdri from "./assets/autumn_field_puresky_1k.hdr";

import { float, Fn, mrt, output, pass, vec3, vec4 } from "three/tsl";
import {conf} from "./conf";
import MlsMpmSimulator from "./mls-mpm/mlsMpmSimulator";
import ParticleRenderer from "./mls-mpm/particleRenderer";
import BackgroundGeometry from "./backgroundGeometry";
import { bloom } from 'three/examples/jsm/tsl/display/BloomNode.js';
import PointRenderer from "./mls-mpm/pointRenderer.js";

const loadHdr = async (file) => {
    const texture = await new Promise(resolve => {
        new RGBELoader().load(file, result => {
            result.mapping = THREE.EquirectangularReflectionMapping;
            resolve(result);
        });
    });
    return texture;
}

class App {
    renderer = null;

    camera = null;

    scene = null;

    controls = null;

    lights = null;

    constructor(renderer) {
        this.renderer = renderer;
        this.lastFitToWindow = null;
        this.viewportAspect = window.innerWidth / window.innerHeight;
        this.captureState = null;
        this.backgroundColor = new THREE.Color();
        this.isSavingPng = false;
        this.captureCanvas = document.createElement("canvas");
        this.captureContext = this.captureCanvas.getContext("2d", { willReadFrequently: true });
    }

    downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    async canvasToBlob(type) {
        return new Promise((resolve) => {
            this.renderer.domElement.toBlob((blob) => resolve(blob), type);
        });
    }

    async savePng() {
        if (this.isSavingPng) {
            return;
        }

        this.isSavingPng = true;
        const blob = await this.canvasToBlob("image/png");
        if (blob) {
            this.downloadBlob(blob, `flow-lab-${Date.now()}.png`);
        }
        this.isSavingPng = false;
    }

    startGifCapture() {
        if (this.captureState) {
            return;
        }

        const scale = Math.max(0.1, conf.gifScale);
        const width = Math.max(1, Math.round(this.renderer.domElement.width * scale));
        const height = Math.max(1, Math.round(this.renderer.domElement.height * scale));
        this.captureCanvas.width = width;
        this.captureCanvas.height = height;
        const gif = new GIF({
            workers: 2,
            quality: 12,
            width,
            height,
            workerScript: gifWorkerUrl,
            background: conf.backgroundColor,
        });

        gif.on("finished", (blob) => {
            this.downloadBlob(blob, `flow-lab-${Date.now()}.gif`);
            this.captureState = null;
        });

        this.captureState = {
            gif,
            remainingFrames: conf.gifFrames,
            frameDelay: 1000 / conf.gifFps,
            lastCaptureAt: 0,
            rendering: false,
        };
    }

    copyFrameForGif() {
        if (!this.captureContext) {
            return false;
        }

        this.captureContext.clearRect(0, 0, this.captureCanvas.width, this.captureCanvas.height);
        this.captureContext.drawImage(
            this.renderer.domElement,
            0,
            0,
            this.captureCanvas.width,
            this.captureCanvas.height,
        );

        return true;
    }

    handleKeydown(event) {
        if (event.code === "Space" && !event.repeat) {
            const tagName = document.activeElement?.tagName;
            if (tagName === "INPUT" || tagName === "TEXTAREA") {
                return;
            }
            event.preventDefault();
            conf.run = !conf.run;
            conf.gui?.refresh();
        }
    }

    applyCameraPreset() {
        if (conf.fitToWindow) {
            this.camera.fov = 60;
            this.camera.position.set(0, 0.5, -0.68);
            this.controls.target.set(0, 0.5, 0.2);
            this.controls.maxDistance = 1.4;
        } else {
            this.camera.fov = 60;
            this.camera.position.set(0, 0.5, -1);
            this.controls.target.set(0, 0.5, 0.2);
            this.controls.maxDistance = 2.0;
        }

        this.camera.updateProjectionMatrix();
        this.controls.update();
    }

    applyPresentationSettings(force = false) {
        this.renderer.toneMappingExposure = conf.exposure;
        this.scene.environmentIntensity = conf.environmentIntensity;
        this.backgroundColor.set(conf.backgroundColor);
        this.scene.background = conf.showSkyBackground ? this.hdriTexture : this.backgroundColor;
        this.scene.backgroundRotation.set(0, conf.backgroundRotation, 0);
        this.scene.environmentRotation.set(0, conf.environmentRotation, 0);
        this.bloomPass.strength.value = conf.bloomStrength;
        const frameWidth = conf.fitToWindow ? this.viewportAspect : 1;

        this.particleRenderer.setFrameWidth(frameWidth);
        this.pointRenderer.setFrameWidth(frameWidth);

        if (this.backgroundGeometry) {
            this.backgroundGeometry.setFrameWidth(frameWidth);
            this.backgroundGeometry.setTextureScale(conf.chamberTextureScale);
            this.backgroundGeometry.setRoughness(conf.chamberRoughness);
            this.backgroundGeometry.setShade(conf.chamberShade);
            this.backgroundGeometry.object.visible = conf.showChamber;
        }

        if (force || this.lastFitToWindow !== conf.fitToWindow) {
            this.applyCameraPreset();
            this.lastFitToWindow = conf.fitToWindow;
        }
    }

    async init(progressCallback) {
        conf.init();
        conf.onSavePng = () => { this.savePng(); };
        conf.onSaveGif = () => { this.startGifCapture(); };

        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 5);
        this.camera.position.set(0, 0.5, -1);
        this.camera.updateProjectionMatrix()

        this.scene = new THREE.Scene();

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.target.set(0,0.5,0.2);
        this.controls.enableDamping = true;
        this.controls.enablePan = false;
        this.controls.touches = {
            TWO: THREE.TOUCH.DOLLY_ROTATE,
        }
        this.controls.maxDistance = 2.0;
        this.controls.minPolarAngle = 0.2 * Math.PI;
        this.controls.maxPolarAngle = 0.8 * Math.PI;
        this.controls.minAzimuthAngle = 0.7 * Math.PI;
        this.controls.maxAzimuthAngle = 1.3 * Math.PI;

        await progressCallback(0.1)

        this.hdriTexture = await loadHdr(hdri);

        this.scene.background = this.hdriTexture; //bgNode.mul(2);
        this.scene.backgroundRotation = new THREE.Euler(0, conf.backgroundRotation, 0);
        this.scene.environment = this.hdriTexture;
        this.scene.environmentRotation = new THREE.Euler(0, conf.environmentRotation, 0);
        this.scene.environmentIntensity = conf.environmentIntensity;
        //this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = conf.exposure;

        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        await progressCallback(0.5)

        this.mlsMpmSim = new MlsMpmSimulator(this.renderer);
        await this.mlsMpmSim.init();
        this.particleRenderer = new ParticleRenderer(this.mlsMpmSim);
        this.scene.add(this.particleRenderer.object);
        this.pointRenderer = new PointRenderer(this.mlsMpmSim);
        this.scene.add(this.pointRenderer.object);

        this.lights = new Lights();
        this.scene.add(this.lights.object);

        this.backgroundGeometry = new BackgroundGeometry();
        await this.backgroundGeometry.init();
        this.scene.add(this.backgroundGeometry.object);


        const scenePass = pass(this.scene, this.camera);
        scenePass.setMRT( mrt( {
            output,
            bloomIntensity: float( 0 ) // default bloom intensity
        } ) );
        const outputPass = scenePass.getTextureNode();
        const bloomIntensityPass = scenePass.getTextureNode( 'bloomIntensity' );
        const bloomPass = bloom( outputPass.mul( bloomIntensityPass ) );
        const postProcessing = new THREE.PostProcessing(this.renderer);
        postProcessing.outputColorTransform = false;
        //postProcessing.outputNode = vec4(outputPass.rgb, 1).add( vec4(bloomPass.mul(bloomIntensityPass.sign().oneMinus()).rgb, 0.0) ).renderOutput();
        //postProcessing.outputNode = outputPass.renderOutput();
        //(1-2b)*a*a + 2ba
        postProcessing.outputNode = Fn(() => {
            const a = outputPass.rgb.clamp(0,1).toVar();
            const b = bloomPass.rgb.clamp(0,1).mul(bloomIntensityPass.r.sign().oneMinus()).toVar();
            //return vec4(vec3(1).sub(b).sub(b).mul(a).mul(a).mul(0.0),1.0);
            //return b;
            //return a.div(b.oneMinus().max(0.0001)).clamp(0,1);
            return vec4(vec3(1).sub(b).sub(b).mul(a).mul(a).add(b.mul(a).mul(2)).clamp(0,1),1.0);
        })().renderOutput();

        this.postProcessing = postProcessing;
        this.bloomPass = bloomPass;
        this.bloomPass.threshold.value = 0.001;
        this.bloomPass.strength.value = conf.bloomStrength;
        this.bloomPass.radius.value = 0.8;


        this.raycaster = new THREE.Raycaster();
        this.plane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0.2);
        this.renderer.domElement.addEventListener("pointermove", (event) => { this.onMouseMove(event); });
        window.addEventListener("keydown", (event) => { this.handleKeydown(event); });
        this.applyPresentationSettings(true);

        await progressCallback(1.0, 100);
    }

    resize(width, height) {
        this.viewportAspect = width / height;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.applyPresentationSettings(true);
    }

    onMouseMove(event) {
        const pointer = new THREE.Vector2();
        pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
        pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
        this.raycaster.setFromCamera(pointer, this.camera);
        const intersect = new THREE.Vector3();
        this.raycaster.ray.intersectPlane(this.plane, intersect);
        if (intersect) {
            this.particleRenderer.object.updateMatrixWorld(true);
            const inverseMatrix = this.particleRenderer.object.matrixWorld.clone().invert();
            const originLocal = this.raycaster.ray.origin.clone().applyMatrix4(inverseMatrix);
            const intersectLocal = intersect.clone().applyMatrix4(inverseMatrix);
            const directionLocal = this.raycaster.ray.direction.clone().transformDirection(inverseMatrix);
            this.mlsMpmSim.setMouseRay(originLocal, directionLocal, intersectLocal);
        }
    }


    async update(delta, elapsed) {
        conf.begin();

        this.applyPresentationSettings();
        this.particleRenderer.object.visible = !conf.points;
        this.pointRenderer.object.visible = conf.points;

        this.controls.update(delta);
        this.lights.update(elapsed);
        this.particleRenderer.update();
        this.pointRenderer.update();

        await this.mlsMpmSim.update(delta,elapsed);

        if (conf.bloom) {
            await this.postProcessing.renderAsync();
        } else {
            await this.renderer.renderAsync(this.scene, this.camera);
        }

        if (this.captureState && !this.captureState.rendering) {
            const now = performance.now();
            if (this.captureState.lastCaptureAt === 0 || now - this.captureState.lastCaptureAt >= this.captureState.frameDelay) {
                if (this.copyFrameForGif()) {
                    this.captureState.gif.addFrame(this.captureContext, {
                        copy: true,
                        delay: this.captureState.frameDelay,
                    });
                    this.captureState.lastCaptureAt = now;
                    this.captureState.remainingFrames -= 1;

                    if (this.captureState.remainingFrames <= 0) {
                        this.captureState.rendering = true;
                        this.captureState.gif.render();
                    }
                }
            }
        }

        conf.end();
    }
}
export default App;
