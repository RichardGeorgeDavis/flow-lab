import {Pane} from 'tweakpane';
import * as EssentialsPlugin from '@tweakpane/plugin-essentials';
import mobile from "is-mobile";
import * as THREE from "three/webgpu";

const COLOR_PRESETS = {
    sunset: {
        hueShift: 0.0,
        hueRange: 0.25,
        hueDrift: 0.05,
        saturationBase: 0.7,
        saturationVelocity: 0.3,
        valueBase: 0.7,
        valueForce: 0.3,
        exposure: 0.66,
        environmentIntensity: 0.5,
        bloomStrength: 0.94,
    },
    arctic: {
        hueShift: 0.52,
        hueRange: 0.14,
        hueDrift: 0.025,
        saturationBase: 0.55,
        saturationVelocity: 0.2,
        valueBase: 0.76,
        valueForce: 0.18,
        exposure: 0.62,
        environmentIntensity: 0.68,
        bloomStrength: 0.72,
    },
    ember: {
        hueShift: 0.92,
        hueRange: 0.08,
        hueDrift: 0.02,
        saturationBase: 0.82,
        saturationVelocity: 0.14,
        valueBase: 0.78,
        valueForce: 0.26,
        exposure: 0.72,
        environmentIntensity: 0.42,
        bloomStrength: 1.18,
    },
    toxic: {
        hueShift: 0.23,
        hueRange: 0.11,
        hueDrift: 0.035,
        saturationBase: 0.88,
        saturationVelocity: 0.12,
        valueBase: 0.72,
        valueForce: 0.32,
        exposure: 0.64,
        environmentIntensity: 0.58,
        bloomStrength: 1.05,
    },
    mono: {
        hueShift: 0.0,
        hueRange: 0.0,
        hueDrift: 0.0,
        saturationBase: 0.0,
        saturationVelocity: 0.0,
        valueBase: 0.72,
        valueForce: 0.22,
        exposure: 0.68,
        environmentIntensity: 0.44,
        bloomStrength: 0.82,
    },
};

class Conf {
    gui = null;
    maxParticles = 8192 * 16;
    particles = 8192 * 4;

    bloom = true;
    bloomStrength = 0.94;
    exposure = 0.66;
    environmentIntensity = 0.5;
    showSkyBackground = false;
    backgroundColor = "#05070b";
    backgroundRotation = 2.15;
    environmentRotation = -2.15;
    chamberTextureScale = 10;
    chamberRoughness = 0.9;
    chamberShade = 0.7;
    colorPreset = "sunset";
    hueShift = 0.0;
    hueRange = 0.25;
    hueDrift = 0.05;
    saturationBase = 0.7;
    saturationVelocity = 0.3;
    valueBase = 0.7;
    valueForce = 0.3;

    run = true;
    noise = 1.0;
    speed = 1;
    stiffness = 3.;
    restDensity = 1.;
    density = 1;
    dynamicViscosity = 0.1;
    gravity = 0;
    gravitySensorReading = new THREE.Vector3();
    accelerometerReading = new THREE.Vector3();
    actualSize = 1;
    size = 1;

    points = false;
    showChamber = false;
    fitToWindow = true;
    gifScale = 0.5;
    gifFrames = 18;
    gifFps = 10;

    constructor(info) {
        if (mobile()) {
            this.maxParticles = 8192 * 8;
            this.particles = 4096;
        }
        this.updateParams();
        this.applyColorPreset(this.colorPreset);
    }

    updateParams() {
        const level = Math.max(this.particles / 8192,1);
        const size = 1.6/Math.pow(level, 1/3);
        this.actualSize = size * this.size;
        this.restDensity = 0.25 * level * this.density;
    }

    setupGravitySensor() {
        if (this.gravitySensor) { return; }
        this.gravitySensor = new GravitySensor({ frequency: 60 });
        this.gravitySensor.addEventListener("reading", (e) => {
            this.gravitySensorReading.copy(this.gravitySensor).divideScalar(50);
            this.gravitySensorReading.setY(this.gravitySensorReading.y * -1);
        });
        this.gravitySensor.start();
    }

    applyColorPreset(name) {
        const preset = COLOR_PRESETS[name];
        if (!preset) {
            return;
        }

        this.colorPreset = name;
        this.hueShift = preset.hueShift;
        this.hueRange = preset.hueRange;
        this.hueDrift = preset.hueDrift;
        this.saturationBase = preset.saturationBase;
        this.saturationVelocity = preset.saturationVelocity;
        this.valueBase = preset.valueBase;
        this.valueForce = preset.valueForce;
        this.exposure = preset.exposure;
        this.environmentIntensity = preset.environmentIntensity;
        this.bloomStrength = preset.bloomStrength;
        this.gui?.refresh();
    }

    init() {
        const gui = new Pane()
        gui.registerPlugin(EssentialsPlugin);

        const stats = gui.addFolder({
            title: "stats",
            expanded: false,
        });
        this.fpsGraph = stats.addBlade({
            view: 'fpsgraph',
            label: 'fps',
            rows: 2,
        });

        const settings = gui.addFolder({
            title: "settings",
            expanded: false,
        });
        settings.addBinding(this, "particles", { min: 4096, max: this.maxParticles, step: 4096 }).on('change', () => { this.updateParams(); });
        settings.addBinding(this, "size", { min: 0.5, max: 2, step: 0.1 }).on('change', () => { this.updateParams(); });
        settings.addBinding(this, "bloom");
        settings.addBinding(this, "points");

        const presentation = settings.addFolder({
            title: "presentation",
            expanded: false,
        });
        presentation.addBinding(this, "fitToWindow");
        presentation.addBinding(this, "showChamber");
        presentation.addBinding(this, "exposure", { min: 0.3, max: 1.2, step: 0.01 });
        presentation.addBinding(this, "environmentIntensity", { min: 0, max: 2, step: 0.01 });
        presentation.addBinding(this, "bloomStrength", { min: 0, max: 2, step: 0.01 });

        const background = settings.addFolder({
            title: "background",
            expanded: false,
        });
        background.addBinding(this, "showSkyBackground");
        background.addBinding(this, "backgroundColor", { view: 'color' });
        background.addBinding(this, "backgroundRotation", { min: -Math.PI, max: Math.PI, step: 0.01 });
        background.addBinding(this, "environmentRotation", { min: -Math.PI, max: Math.PI, step: 0.01 });
        background.addBinding(this, "chamberTextureScale", { min: 1, max: 20, step: 0.5 });
        background.addBinding(this, "chamberRoughness", { min: 0, max: 1, step: 0.01 });
        background.addBinding(this, "chamberShade", { min: 0.2, max: 1.2, step: 0.01 });

        const color = settings.addFolder({
            title: "color",
            expanded: false,
        });
        color.addBlade({
            view: 'list',
            label: 'preset',
            options: [
                { text: 'sunset', value: 'sunset' },
                { text: 'arctic', value: 'arctic' },
                { text: 'ember', value: 'ember' },
                { text: 'toxic', value: 'toxic' },
                { text: 'mono', value: 'mono' },
            ],
            value: this.colorPreset,
        }).on('change', (ev) => {
            this.applyColorPreset(ev.value);
        });
        color.addBinding(this, "hueShift", { min: 0, max: 1, step: 0.01 });
        color.addBinding(this, "hueRange", { min: 0, max: 0.5, step: 0.01 });
        color.addBinding(this, "hueDrift", { min: 0, max: 0.2, step: 0.005 });
        color.addBinding(this, "saturationBase", { min: 0, max: 1, step: 0.01 });
        color.addBinding(this, "saturationVelocity", { min: 0, max: 0.5, step: 0.01 });
        color.addBinding(this, "valueBase", { min: 0.2, max: 1, step: 0.01 });
        color.addBinding(this, "valueForce", { min: 0, max: 0.5, step: 0.01 });

        const simulation = settings.addFolder({
            title: "simulation",
            expanded: false,
        });
        simulation.addBinding(this, "run");
        simulation.addBinding(this, "noise", { min: 0, max: 2, step: 0.01 });
        simulation.addBinding(this, "speed", { min: 0.1, max: 2, step: 0.1 });
        simulation.addBlade({
            view: 'list',
            label: 'gravity',
            options: [
                {text: 'back', value: 0},
                {text: 'down', value: 1},
                {text: 'center', value: 2},
                {text: 'device gravity', value: 3},
            ],
            value: 0,
        }).on('change', (ev) => {
            if (ev.value === 3) {
                this.setupGravitySensor();
            }
            this.gravity = ev.value;
        });
        simulation.addBinding(this, "density", { min: 0.4, max: 2, step: 0.1 }).on('change', () => { this.updateParams(); });;
        /*simulation.addBinding(this, "stiffness", { min: 0.5, max: 10, step: 0.1 });
        simulation.addBinding(this, "restDensity", { min: 0.5, max: 10, step: 0.1 });
        simulation.addBinding(this, "dynamicViscosity", { min: 0.01, max: 0.4, step: 0.01 });*/

        const capture = settings.addFolder({
            title: "capture",
            expanded: false,
        });
        capture.addBinding(this, "gifScale", { min: 0.2, max: 1, step: 0.05, label: "gif scale" });
        capture.addBinding(this, "gifFrames", { min: 6, max: 48, step: 1, label: "gif frames" });
        capture.addBinding(this, "gifFps", { min: 6, max: 24, step: 1, label: "gif fps" });
        capture.addButton({ title: "save png" }).on('click', () => {
            this.onSavePng?.();
        });
        capture.addButton({ title: "save short gif" }).on('click', () => {
            this.onSaveGif?.();
        });

        /*settings.addBinding(this, "roughness", { min: 0.0, max: 1, step: 0.01 });
        settings.addBinding(this, "metalness", { min: 0.0, max: 1, step: 0.01 });*/

        this.gui = gui;
    }

    update() {
    }

    begin() {
        this.fpsGraph.begin();
    }
    end() {
        this.fpsGraph.end();
    }
}
export const conf = new Conf();
