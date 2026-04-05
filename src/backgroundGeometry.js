import * as THREE from "three/webgpu";
import {
    Fn,
    texture,
    uv,
    positionWorld
} from "three/tsl";
import {OBJLoader} from "three/examples/jsm/loaders/OBJLoader";
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import boxObj from './assets/boxSlightlySmooth.obj';

import normalMapFile from './assets/concrete_0016_normal_opengl_1k.png';
import aoMapFile from './assets/concrete_0016_ao_1k.jpg';
import colorMapFile from './assets/concrete_0016_color_1k.jpg';
import roughnessMapFile from './assets/concrete_0016_roughness_1k.jpg';

const textureLoader = new THREE.TextureLoader();
const loadTexture = (file) => {
    return new Promise(resolve => {
        textureLoader.load(file, texture => {
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            resolve(texture);
        });
    });
}

class BackgroundGeometry {
    object = null;
    constructor() {
        this.textureScale = 10;
        this.shade = 0.7;
    }
    async init() {
        const objectRaw = new OBJLoader().parse(boxObj);
        const geometry = BufferGeometryUtils.mergeVertices(objectRaw.children[0].geometry);
        this.geometry = geometry;
        this.baseUvArray = Float32Array.from(geometry.attributes.uv.array);
        this.setTextureScale(this.textureScale);


        const normalMap = await loadTexture(normalMapFile);
        const aoMap = await loadTexture(aoMapFile);
        const map = await loadTexture(colorMapFile);
        const roughnessMap = await loadTexture(roughnessMapFile);
        this.colorMap = map;

        const material = new THREE.MeshStandardNodeMaterial({
            roughness: 0.9,
            metalness:0.0,
            normalScale: new THREE.Vector3(1.0, 1.0),
            normalMap,
            aoMap,
            map,
            roughnessMap,
        });
        /*material.mrtNode = mrt( {
            bloomIntensity: 0
        } );*/
        material.aoNode = Fn(() => {
            return texture(aoMap, uv()).mul(positionWorld.z.div(0.4).mul(0.95).oneMinus());
        })();
        material.colorNode = Fn(() => {
            return texture(map, uv()).mul(positionWorld.z.div(0.4).mul(0.5).oneMinus().mul(this.shade));
        })();
        this.material = material;


        this.box = new THREE.Mesh(geometry, material);
        this.box.rotation.set(0, Math.PI, 0);
        this.box.position.set(0, -0.05, 0.22);
        this.box.castShadow = true;
        this.box.receiveShadow = true;

        this.object = new THREE.Object3D();
        this.object.add(this.box);
    }

    setFrameWidth(frameWidth) {
        this.object.scale.x = frameWidth;
    }

    setTextureScale(scale) {
        this.textureScale = scale;

        if (this.geometry && this.baseUvArray) {
            const uvArray = this.geometry.attributes.uv.array;
            for (let i = 0; i < uvArray.length; i++) {
                uvArray[i] = this.baseUvArray[i] * scale;
            }
            this.geometry.attributes.uv.needsUpdate = true;
        }
    }

    setRoughness(roughness) {
        if (this.material) {
            this.material.roughness = roughness;
            this.material.needsUpdate = true;
        }
    }

    setShade(shade) {
        this.shade = shade;

        if (this.material) {
            this.material.colorNode = Fn(() => {
                return texture(this.colorMap, uv()).mul(positionWorld.z.div(0.4).mul(0.5).oneMinus().mul(this.shade));
            })();
            this.material.needsUpdate = true;
        }
    }
}
export default BackgroundGeometry;
