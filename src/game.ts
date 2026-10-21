import { BurnVisuals } from './burn-visuals';
import { StatusEffects } from './status-effects';
import { isUnderground } from './enemies/types';
import * as T from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Actors } from './actors';
import { Effects } from './effects';
import { DAMAGE_FEEDBACK, movementInput } from './player';
import { Simulation } from './simulation';
import { UI } from './ui';
import { World } from './world';
import type { UpgradeId } from './upgrades';
import { GameAudio } from './audio';
import { BrowserAudio } from './audio-browser';
import { AudioEvents } from './audio-events';
import { bindAudioControls, browserAudioStorage } from './audio-controls';
/** Render/input coordinator. Gameplay is testable without a browser in Simulation. */
export class Game {
    private renderer: T.WebGLRenderer;
    private scene = new T.Scene();
    private camera = new T.PerspectiveCamera(42, 1, .1, 150);
    private composer: EffectComposer;
    private world: World;
    private actors: Actors;
    private effects: Effects;
    private statusEffects: StatusEffects;
    private burnVisuals = new BurnVisuals();
    private ui: UI;
    private sim = new Simulation();
    private keys = new Set<string>();
    private paused = false;
    private time = 0;
    private shake = 0;
    private burnParticleTimer = 0;
    private lookAt = new T.Vector3(0, 0, -.7);
    private key = new T.DirectionalLight(0xc8e4f4, 3.6);
    private rim = new T.DirectionalLight(0x469edf, 1.5);
    private hitLight = new T.PointLight(0x80ffee, 0, 4, 2);
    private frames = 0;
    private fps = 60;
    private diagnostic: HTMLOutputElement | null = null;
    private audioBackend = new BrowserAudio();
    private audio = new GameAudio(this.audioBackend, browserAudioStorage());
    private audioEvents = new AudioEvents(this.audio);
    constructor(canvas: HTMLCanvasElement) {
        this.renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
        this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
        this.renderer.info.autoReset = false;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = T.PCFSoftShadowMap;
        this.renderer.toneMapping = T.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.18;
        this.scene.background = new T.Color(0x080f19);
        this.scene.fog = new T.FogExp2(0x0b1725, .013);
        this.scene.add(new T.HemisphereLight(0x95c7e5, 0x29394b, 2.1));
        this.key.position.set(-8, 18, 4);
        this.key.castShadow = true;
        this.key.shadow.mapSize.set(2048, 2048);
        Object.assign(this.key.shadow.camera, { left: -21, right: 21, top: 20, bottom: -20, far: 55 });
        this.key.shadow.normalBias = .035;
        this.key.shadow.bias = -.00015;
        this.rim.position.set(8, 9, -12);
        this.scene.add(this.key, this.key.target, this.rim, this.rim.target, this.hitLight);
        this.world = new World(this.scene);
        this.actors = new Actors(this.scene);
        this.effects = new Effects(this.scene);
        this.statusEffects = new StatusEffects(this.scene);
        this.composer = new EffectComposer(this.renderer);
        this.composer.addPass(new RenderPass(this.scene, this.camera));
        this.composer.addPass(new UnrealBloomPass(new T.Vector2(800, 600), .32, .55, 1.15));
        this.composer.addPass(new OutputPass());
        this.ui = new UI(() => this.start(), id => this.chooseUpgrade(id));
        const removeAudioControls = bindAudioControls(this.audio, () => this.pause(), () => this.keys.clear());
        window.addEventListener('pagehide', event => {
            this.audio.setPaused(true);
            if (!event.persisted) { removeAudioControls(); this.audio.dispose(); }
        });
        this.resize();
        this.bindInput();
        this.camera.position.set(10, 24, 19);
        this.camera.lookAt(this.lookAt);
        this.ui.update(this.sim, false, 0);
        if (new URLSearchParams(location.search).has('debug')) {
            this.diagnostic = document.createElement('output');
            this.diagnostic.id = 'diagnostics';
            document.body.append(this.diagnostic);
        }
        let last = performance.now(), accumulator = 0;
        const loop = (now: number) => {
            requestAnimationFrame(loop);
            const dt = Math.min((now - last) / 1000, .1);
            last = now;
            accumulator += dt;
            while (accumulator >= 1 / 60) {
                this.update(1 / 60);
                accumulator -= 1 / 60;
            }
            this.render(dt);
            this.frames++;
        };
        requestAnimationFrame(loop);
    }
    private start(): void {
        document.querySelector<HTMLDetailsElement>('#audio-controls')!.open = false;
        if (this.paused) {
            this.paused = false;
            this.audio.setPaused(false);
            this.audio.unlock();
            this.audio.play('ui');
            this.keys.clear();
            (document.activeElement as HTMLElement)?.blur();
            return;
        }
        if (['dead', 'complete'].includes(this.sim.progression.phase)) {
            this.audioEvents.reset();
            this.sim = new Simulation();
            this.actors.reset();
            this.effects.clear(); this.statusEffects.clear(); this.burnVisuals.clear();
            this.shake = 0;
            this.burnParticleTimer = 0;
            this.hitLight.intensity = 0;
            this.lookAt.set(0, 0, -.7);
        }
        this.sim.start();
        this.audioEvents.update(this.sim, false);
        this.audio.unlock();
        this.audio.play('ui');
        this.keys.clear();
        (document.activeElement as HTMLElement)?.blur();
        this.ui.notice('SECCIÓN 1 · DETENTE PARA DISPARAR');
    }
    private chooseUpgrade(id: UpgradeId): void {
        if (this.paused || !this.sim.selectUpgrade(id))
            return;
        this.audio.unlock();
        this.audioEvents.upgrade();
        this.keys.clear();
        (document.activeElement as HTMLElement)?.blur();
        this.ui.notice('MÓDULO INSTALADO · AVANZA POR LA COMPUERTA →');
    }
    private pause(): void {
        if (['combat', 'cleared', 'travel', 'upgrade', 'ending'].includes(this.sim.progression.phase)) {
            this.paused = true;
            this.audio.setPaused(true);
            this.keys.clear();
        }
    }
    private bindInput(): void {
        window.addEventListener('resize', () => this.resize());
        window.addEventListener('keydown', e => {
            if (e.code.startsWith('Arrow'))
                e.preventDefault();
            if (e.code === 'Escape' && !e.repeat) {
                if (this.paused)
                    this.start();
                else
                    this.pause();
                return;
            }
            if (e.code === 'Space' && document.activeElement?.tagName !== 'BUTTON') {
                e.preventDefault();
                if (!e.repeat && !this.paused)
                    this.sim.dash();
            }
            this.keys.add(e.code);
        });
        window.addEventListener('keyup', e => this.keys.delete(e.code));
        window.addEventListener('blur', () => this.pause());
        document.addEventListener('visibilitychange', () => { if (document.hidden)
            this.pause(); });
        this.renderer.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); this.pause(); this.ui.contextLost(); });
    }
    private resize(): void {
        const w = innerWidth, h = innerHeight;
        this.renderer.setSize(w, h);
        this.composer.setSize(w, h);
        this.camera.aspect = w / h;
        this.camera.fov = w / h < 1.3 ? 54 : 42;
        this.camera.updateProjectionMatrix();
    }
    private update(dt: number): void {
        if (this.paused) {
            this.ui.update(this.sim, true, 0);
            return;
        }
        this.time += dt;
        this.shake = Math.max(0, this.shake - dt * .8);
        this.hitLight.intensity *= Math.exp(-dt * 24);
        const ix = Number(this.keys.has('KeyD') || this.keys.has('ArrowRight')) - Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft'));
        const iz = Number(this.keys.has('KeyS') || this.keys.has('ArrowDown')) - Number(this.keys.has('KeyW') || this.keys.has('ArrowUp'));
        const previousWave = this.sim.progression.wave;
        this.sim.update(dt, movementInput(ix, iz));
        this.audioEvents.update(this.sim, false);
        if (previousWave !== this.sim.progression.wave)
            this.ui.notice(`SECCIÓN ${this.sim.progression.wave + 1} · COMBATE ACTIVO`);
        const living = [...this.sim.enemies, ...(this.sim.boss ? [this.sim.boss] : [])].filter(t => t.hp > 0);
        this.burnVisuals.update(dt, this.sim.burns, new Set(this.sim.player.hp > 0 ? living.map(t => t.id) : []));
        const visibleHeat = new Set(this.sim.targets.filter(t => t.hp > 0 && this.burnVisuals.strength(t.id) > 0).map(t => t.id));
        for (const event of this.sim.events) {
            const p = new T.Vector3(event.position.x, 1, event.position.z);
            if (event.type === 'shot' || event.type === 'grenade-throw') {
                const enemy = event.type === 'grenade-throw' || (event.type === 'shot' && event.enemy);
                const robot = enemy ? this.actors.enemies.get(event.id!) : this.actors.player;
                if (robot)
                    robot.recoil = 1;
                this.hitLight.position.copy(p);
                this.hitLight.color.setHex(enemy ? 0xff623f : 0x82fff5);
                this.hitLight.intensity = 4;
            }
            else if (event.type === 'shock') {
                this.statusEffects.shock(event.position, event.target);
                this.effects.burst(new T.Vector3(event.target.x, 1.1, event.target.z), 0x74ddff, 6);
            }
            else if (event.type === 'explosion') {
                p.y = .25; this.effects.burst(p, 0xff8639, 22);
            }
            else if (event.type === 'burrow' || event.type === 'emerge') {
                p.y = .2; this.effects.burst(p, 0xa58c6e, event.type === 'emerge' ? 30 : 16, true);
            }
            else if (event.type === 'boss-death') {
                this.effects.burst(p, 0xff8d45, 65);
                this.effects.burst(p, 0x87949d, 55, true);
                this.shake = Math.max(this.shake, .28);
                this.hitLight.position.copy(p); this.hitLight.color.setHex(0xff6e30); this.hitLight.intensity = 35;
                this.keys.clear();
            }
            else if (event.type === 'boss-phase') {
                p.y = 1.7; this.effects.burst(p, 0xff753e, 48);
                this.shake = Math.max(this.shake, .22);
                this.hitLight.position.copy(p); this.hitLight.color.setHex(0xff6430); this.hitLight.intensity = 25;
                this.ui.notice('BOSS · PHASE 2 · SOBRECARGA');
            }
            else if (event.type === 'boss-hit' || event.type === 'fragment')
                this.effects.burst(p, event.type === 'fragment' ? 0xffcb75 : 0xffa16a, 7);
            else if (event.type === 'enemy-hit') {
                const enemy = this.sim.enemies.find(e => e.id === event.id);
                if (enemy && isUnderground(enemy)) continue;
                const robot = this.actors.enemies.get(event.id!);
                if (robot)
                    robot.hit = .18;
                this.effects.burst(p, 0xffb376, 8);
            }
            else if (event.type === 'enemy-death') {
                this.effects.burst(p, 0xff864d, 19);
                this.effects.burst(p, 0x73828f, 15, true);
                this.shake = Math.max(this.shake, .09);
            }
            else if (event.type === 'player-hit') {
                this.actors.player.hit = DAMAGE_FEEDBACK.robot;
                this.effects.burst(p, 0xff9a69, 14);
            }
            else if (event.type === 'reward-spawn') {
                this.effects.burst(p, 0x89ffd6, 14);
                this.ui.notice('SECTOR DESPEJADO · RECOGE EL NÚCLEO · CUIDADO CON LOS PELIGROS');
            }
            else if (event.type === 'reward-pickup') {
                this.effects.burst(p, 0xa3ffdf, 28); this.keys.clear();
            }
            else if (event.type === 'flame-impact' || event.type === 'burn') {
                if (!visibleHeat.has(event.id!)) continue;
                const boss = event.id === this.sim.boss?.id;
                const enemy = this.sim.enemies.find(e => e.id === event.id);
                p.y = boss ? 1.8 : enemy?.kind === 'shooter' ? 1.5 : enemy?.kind === 'burrower' ? .65 : 1.1;
                this.effects.flame(p, event.id!, boss, event.type === 'flame-impact' ? 'impact' : 'tick', 1, enemy?.kind === 'shooter' ? 1.35 : 1);
            }
            else if (event.type === 'shield-ready') this.effects.burst(p, 0x85ffe5, 16);
            else if (event.type === 'shield-break') this.effects.burst(p, 0x9afff2, 28);
            else if (event.type === 'revive') {
                this.effects.burst(p, 0xffdc83, 38); this.ui.notice('REVIVE CONSUMIDO · SISTEMAS RESTAURADOS');
            }
            else if (event.type === 'player-death') {
                this.effects.burst(p, 0x99d9dd, 42, true);
                this.effects.burst(p, 0x65ffee, 30);
                this.keys.clear();
            }
            else if (event.type === 'spawn')
                this.effects.burst(p, 0xff7450, 16);
            else if (event.type === 'dash') {
                this.effects.burst(p, 0x5ff6ec, 12);
                this.shake = Math.max(this.shake, .07);
            }
            else if (event.type === 'impact')
                this.effects.burst(p, 0x88bcc8, 4);
        }
        this.sim.events.length = 0;
        this.effects.retainBurns(visibleHeat, id => this.burnVisuals.strength(id));
        this.burnParticleTimer -= dt;
        if (this.burnParticleTimer <= 0) {
            this.burnParticleTimer = .1;
            for (const target of this.sim.targets) if (visibleHeat.has(target.id)) {
                const boss = target === this.sim.boss, kind = 'kind' in target ? target.kind : undefined;
                this.effects.flame(new T.Vector3(target.x, boss ? 1.8 : kind === 'shooter' ? 1.5 : kind === 'burrower' ? .65 : 1.1, target.z),
                    target.id, boss, 'embers', this.burnVisuals.strength(target.id), kind === 'shooter' ? 1.35 : kind === 'burrower' ? .8 : 1);
            }
        }
        this.statusEffects.update(dt, this.sim, this.time);
        if (this.sim.player.dashTime > 0 && Math.random() < .65)
            this.effects.burst(new T.Vector3(this.sim.player.x, .3, this.sim.player.z), 0x64dedf, 2);
        this.actors.update(this.sim, this.time, dt, this.camera, this.burnVisuals);
        this.effects.update(dt);
        this.world.update(dt, this.time, this.sim.gates, this.sim.player.x);
        this.ui.update(this.sim, false, dt);
    }
    private render(dt: number): void {
        const p = this.sim.player;
        // Keep the original viewing angle; follow longitudinal travel continuously.
        this.lookAt.lerp(new T.Vector3(p.x, 0, p.z * .3 - .9), 1 - Math.exp(-dt * 3));
        const shake = this.paused ? 0 : Math.max(this.shake, p.damageStrength * p.damageShake / DAMAGE_FEEDBACK.shake);
        this.camera.position.set(this.lookAt.x + 10 + (Math.random() - .5) * shake, 24 + (Math.random() - .5) * shake, this.lookAt.z + 18);
        this.camera.lookAt(this.lookAt);
        this.key.position.set(this.lookAt.x - 8, 18, 4);
        this.key.target.position.set(this.lookAt.x, 0, 0);
        this.rim.position.set(this.lookAt.x + 8, 9, -12);
        this.rim.target.position.set(this.lookAt.x, 0, 0);
        this.ui.flash(p.damageScreen / DAMAGE_FEEDBACK.screen);
        this.renderer.info.reset();
        this.composer.render();
        this.fps += (1 / Math.max(dt, .001) - this.fps) * .03;
        if (this.diagnostic && this.frames % 15 === 0) {
            const info = this.renderer.info, run = this.sim.progression;
            this.diagnostic.textContent = `${Math.round(this.fps)} FPS / ${info.render.calls} DRAW CALLS / ${Math.round(info.render.triangles / 1000)}K TRIS`;
            this.diagnostic.dataset.state = JSON.stringify({ phase: run.phase, wave: run.wave + 1, paused: this.paused, hp: p.hp, stats: p.stats, kills: this.sim.kills, elapsed: this.sim.elapsed, player: { x: p.x, z: p.z, moving: p.moving }, enemies: this.sim.enemies, boss: this.sim.boss, bullets: this.sim.projectiles, thermal: this.sim.thermal, floorHazards: this.sim.floorHazards, gates: this.sim.gates, frames: this.frames, fps: Math.round(this.fps), geometries: info.memory.geometries, textures: info.memory.textures, residentRooms: [...this.world.rooms.keys()].map(i => i + 1), pendingSpawns: this.sim.pendingSpawns, upgrades: [...p.acquired], offeredUpgrades: this.sim.offeredUpgrades, reward: this.sim.reward, burns: [...this.sim.burns], frost: [...this.sim.frost], shockHits: this.sim.shockHits, overdriveCharge: p.overdriveCharge, shieldSpent: p.shieldSpent, reviveUsed: p.reviveUsed, feedback: { flash: p.damageFlash, screen: p.damageScreen, hud: p.damageHud, shake: p.damageShake }, audio: { ...this.audioBackend.diagnostics, settings: this.audio.settings } });
        }
    }
}
