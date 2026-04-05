import * as THREE from "three/webgpu";
import {Fn, vec3,instanceIndex} from "three/tsl";
import {conf} from "../conf";

class PointRenderer {
    mlsMpmSim = null;
    object = null;
    baseScale = 1 / 64;

    constructor(mlsMpmSim) {
        this.mlsMpmSim = mlsMpmSim;

        this.geometry = new THREE.InstancedBufferGeometry();
        const positionBuffer = new THREE.BufferAttribute(new Float32Array(3), 3, false);
        const material = new THREE.PointsNodeMaterial();
        this.geometry.setAttribute('position', positionBuffer);
        this.object = new THREE.Points(this.geometry, material);
        material.positionNode = Fn(() => {
            return this.mlsMpmSim.particleBuffer.element(instanceIndex).get('position').mul(vec3(1,1,0.4));
        })();

        this.object.frustumCulled = false;

        this.setFrameWidth(1);
        this.object.castShadow = true;
        this.object.receiveShadow = true;
    }

    setFrameWidth(frameWidth) {
        this.object.position.set(-frameWidth * 0.5, 0, 0);
        this.object.scale.set(this.baseScale * frameWidth, this.baseScale, this.baseScale);
    }

    update() {
        const { particles } = conf;
        this.geometry.instanceCount = particles;
    }
}
export default PointRenderer;
