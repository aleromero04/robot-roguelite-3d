import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { Simulation } from '../src/simulation.ts';
import { createEnemy, updateEnemy } from '../src/enemies/enemies.ts';
import { createBoss, updateBoss, BOSS_STATS } from '../src/boss.ts';
import { createPlayer, updatePlayer, beginDash } from '../src/player.ts';
import { createProjectile, type ShotModifiers } from '../src/projectiles.ts';
import { UPGRADE_VALUES, applyUpgrade, effectiveAttackStats, overdriveActive, UPGRADES, eligibleUpgrades, chooseUpgradeOptions, RARITY_WEIGHTS } from '../src/upgrades.ts';
import { shockTargets, tickFrost } from '../src/status.ts';
import { BurnVisuals, BURN_FADE } from '../src/burn-visuals.ts';
import { applyStatusMaterial } from '../src/status-material.ts';
import { Effects } from '../src/effects.ts';
import { StatusEffects, SHOCK_VFX } from '../src/status-effects.ts';
import { refreshBurn } from '../src/burn.ts';
import { distance } from '../src/physics.ts';
import { seededRandom } from './helpers.ts';
const dt = 1 / 60, still = { x: 0, z: 0 }, bounds = { minX: -100, maxX: 100, minZ: -100, maxZ: 100 };
const close = (a: number, b: number) => assert.ok(Math.abs(a-b) < 1e-8, `${a} != ${b}`);
function fixture(count = 3) {
    const sim = new Simulation(); sim.progression.phase = 'combat'; sim.staticObstacles.length = 0; sim.gates = [];
    sim.player.x = 0; sim.player.z = 8; sim.player.shotCooldown = 1000;
    sim.enemies = Array.from({length:count}, (_,i) => {
        const e = createEnemy(100+i, 'basic', { x:i*3, z:0 }); e.hp=e.maxHp=1000; e.state='recovery'; e.timer=1000; return e;
    });
    return sim;
}
let shotId = 10000;
function hit(sim: Simulation, index = 0, options: ShotModifiers = {}, damage = 10) {
    const e = sim.enemies[index]; sim.projectiles.push(createProjectile(shotId++,e,e,false,damage,0,.2,options)); sim.update(dt,still);
}
function frames(sim: Simulation, n: number) { for(let i=0;i<n;i++) sim.update(dt,still); }

test('pool has exactly 17 upgrades with 12 uniques; new rarities, weights, exclusion and restart', () => {
    assert.equal(UPGRADES.length,17); assert.equal(UPGRADES.filter(u=>u.unique).length,12);
    assert.deepEqual(RARITY_WEIGHTS,{COMMON:60,RARE:27,EPIC:10,LEGENDARY:3});
    const p=createPlayer();
    for(const [id,rarity] of [['shock','RARE'],['frost','EPIC'],['overdrive','LEGENDARY']] as const) {
        assert.equal(UPGRADES.find(u=>u.id===id)?.rarity,rarity); assert.equal(applyUpgrade(p,id),true);
        assert.equal(applyUpgrade(p,id),false); assert.ok(!eligibleUpgrades(p).includes(id));
        assert.ok(eligibleUpgrades(createPlayer()).includes(id));
    }
    const random=seededRandom();
    for(let i=0;i<100;i++) { const offer=chooseUpgradeOptions(p,random); assert.equal(new Set(offer).size,3); assert.ok(offer.every(id=>!p.acquired.has(id))); }
});
test('Shock counts actual projectile impacts and triggers exactly on each third hit', () => {
    const sim=fixture();
    for(let n=1;n<=6;n++) {
        hit(sim,0,{shock:true}); assert.equal(sim.shockHits,n%3);
        assert.equal(sim.enemies[0].hp,1000-n*10);
        assert.equal(sim.enemies[1].hp,1000-Math.floor(n/3)*4); assert.equal(sim.enemies[2].hp,1000-Math.floor(n/3)*4);
    }
    assert.equal(sim.events.filter(e=>e.type==='shock').length,4);
});
test('Shock uses 40% of triggering projectile damage, two distinct bounded hops, and line of sight', () => {
    const origin={id:1,x:0,z:0,hp:1}; const targets=[origin,{id:2,x:5.5,z:0,hp:1},{id:3,x:11,z:0,hp:1},{id:4,x:5,z:0,hp:0}];
    assert.deepEqual(shockTargets(origin,targets,[]).map(t=>t.id),[2,3]);
    assert.deepEqual(shockTargets(origin,[origin,{id:2,x:5.501,z:0,hp:1}],[]),[]);
    assert.deepEqual(shockTargets(origin,targets,[{x:2,z:0,halfX:.2,halfZ:1}]),[]);
    const sim=fixture(4); sim.shockHits=2; hit(sim,0,{shock:true},25);
    assert.deepEqual(sim.enemies.map(e=>e.hp),[975,990,990,1000]);
});
test('Shock secondary damage neither recurses nor applies Flame/Frost or projectile modifiers', () => {
    const sim=fixture(4); sim.shockHits=2;
    hit(sim,0,{shock:true,flame:true,frost:true},10);
    assert.equal(sim.shockHits,0); assert.equal(sim.events.filter(e=>e.type==='shock').length,2);
    assert.deepEqual([...sim.burns.keys()],[100]); assert.deepEqual([...sim.frost.keys()],[100]);
    frames(sim,90); assert.equal(sim.shockHits,0); assert.deepEqual(sim.enemies.map(e=>e.hp),[984,996,996,1000]);
});
test('misses, cover, enemy bullets, contact, and preexisting Flame ticks cannot advance Shock', () => {
    const sim=fixture(); sim.shockHits=1;
    sim.burns.set(100,refreshBurn(undefined,10));
    sim.projectiles=[createProjectile(1,{x:-8,z:-8},{x:-8,z:-8},false,10,0,.1,{shock:true}),createProjectile(2,sim.player,sim.player,true,1,0,1,{shock:true})];
    frames(sim,91); assert.equal(sim.shockHits,1);
    assert.equal(createProjectile(3,still,still,true,10,1,1,{shock:true,frost:true}).shock,false);
    assert.equal(createProjectile(4,still,still,true,10,1,1,{shock:true,frost:true}).frost,false);
});
test('a lethal third impact can chain from the killed source without inventing targets', () => {
    const sim=fixture();sim.enemies[0].hp=1;sim.shockHits=2;hit(sim,0,{shock:true});
    assert.equal(sim.enemies.length,2);assert.ok(sim.enemies.every(e=>e.hp===996));assert.equal(sim.kills,1);
    const solo=fixture(1);solo.shockHits=2;hit(solo,0,{shock:true});assert.equal(solo.events.filter(e=>e.type==='shock').length,0);assert.equal(solo.shockHits,0);
});
test('Boss principal receives normal damage and chains only when valid secondaries exist', () => {
    const sim=fixture(0);sim.progression.wave=6;sim.boss=createBoss(500,{x:216,z:0});sim.boss.state='recovery';sim.boss.timer=100;
    sim.player.x=207;sim.player.z=5;sim.shockHits=2;
    const shoot=()=>{sim.projectiles.push(createProjectile(shotId++,sim.boss!,sim.boss!,false,10,0,.1,{shock:true}));sim.update(dt,still)};
    shoot();assert.equal(sim.boss.hp,1590);assert.equal(sim.events.filter(e=>e.type==='shock').length,0);
    const e=createEnemy(501,'grenadier',{x:220,z:0});e.state='recovery';e.timer=100;sim.enemies=[e];sim.shockHits=2;shoot();assert.equal(e.hp,44);
});
test('Shock ignores underground Burrower as secondary and as projectile collider', () => {
    const sim=fixture(); const b=createEnemy(101,'burrower',{x:3,z:0});b.state='emergence';b.timer=.9;sim.enemies[1]=b;
    sim.shockHits=2;hit(sim,0,{shock:true});assert.equal(b.hp,44);
    hit(sim,1,{shock:true,frost:true,flame:true});assert.equal(sim.shockHits,0);assert.equal(sim.frost.has(b.id),false);assert.equal(sim.burns.has(b.id),false);
});
test('Piercing and Ricochet count each actual victim, including the third combined impact', () => {
    const sim=fixture();sim.enemies.forEach((e,i)=>{e.x=i*2;e.z=0});
    sim.projectiles=[createProjectile(1,{x:-1,z:0},{x:10,z:0},false,10,60,1,{shock:true,piercing:1,ricochet:1})];
    sim.update(.1,still);
    assert.equal(sim.shockHits,0);assert.equal(sim.events.filter(e=>e.type==='shock').length,2);
    assert.deepEqual(sim.enemies.map(e=>e.hp),[986,986,990]);
});
for(const triple of [false,true]) test(`Rapid${triple?' + Triple':''} counts impacts rather than emitted shots`,()=>{
    const sim=fixture(1);sim.enemies[0].x=6;sim.enemies[0].z=8;
    applyUpgrade(sim.player,'shock');applyUpgrade(sim.player,'rapid');if(triple)applyUpgrade(sim.player,'triple');
    sim.player.shotCooldown=0;sim.update(dt,still);assert.equal(sim.shockHits,0);
    // Deliver each actual emitted projectile to the live collider, preserving the Rapid schedule.
    let impacts=0;
    for(let frame=0;frame<8;frame++) {
        for(const p of sim.projectiles){p.x=sim.enemies[0].x;p.z=8;p.velocity=still;impacts++}
        sim.update(dt,still);
    }
    assert.equal(impacts,triple?6:2);assert.equal(sim.shockHits,impacts%3);assert.equal(sim.enemies[0].hp,1000-impacts*10);
});
for(const kind of ['basic','runner','shooter','grenadier','burrower'] as const) test(`Frost scales only ${kind} normal locomotion by .80`,()=>{
    const normal=createEnemy(1,kind,still),frost=createEnemy(1,kind,still),p={x:12,z:0};
    if(kind==='grenadier') {normal.state=frost.state='recovery';normal.timer=frost.timer=1;}
    updateEnemy(normal,p,[normal],[],bounds,dt);
    updateEnemy(frost,p,[frost],[],bounds,dt,{locomotionMultiplier:.8});
    close(distance(still,frost),distance(still,normal)*.8);assert.ok(distance(still,frost)>0);
    assert.equal(normal.timer,frost.timer);assert.equal(normal.state,frost.state);
});
test('Frost refreshes to 1.5s without stacking and expiration restores normal motion',()=>{
    const sim=fixture(1);hit(sim,0,{frost:true});close(sim.frost.get(100)!,1.5);
    frames(sim,60);close(sim.frost.get(100)!, .5);hit(sim,0,{frost:true});close(sim.frost.get(100)!,1.5);
    frames(sim,89);assert.ok(sim.frost.has(100));frames(sim,1);assert.equal(sim.frost.size,0);
    const frost=new Map([[1,.1],[2,1.5]]);tickFrost(frost,.1,new Set([1]));assert.equal(frost.size,0);
});
test('Frost leaves Runner dash displacement, windup and recovery timing unchanged',()=>{
    for(const state of ['dash','windup','recovery'] as const) {
        const a=createEnemy(1,'runner',still),b=createEnemy(1,'runner',still);
        for(const e of [a,b]){e.state=state;e.timer=.3;e.dir={x:1,z:0}}
        const ia=updateEnemy(a,{x:10,z:0},[a],[],bounds,.1),ib=updateEnemy(b,{x:10,z:0},[b],[],bounds,.1,{locomotionMultiplier:.8});
        assert.deepEqual(a,b);assert.deepEqual(ia,ib);
    }
});
test('Frost does not change Burrow underground travel, warning, emergence or cooldowns',()=>{
    for(const state of ['underground','emergence','burrow-windup'] as const) {
        const a=createEnemy(1,'burrower',still),b=createEnemy(1,'burrower',still);
        for(const e of [a,b]){e.state=state;e.timer=.2;e.burrowOrigin=still;e.destination={x:3,z:0}}
        const ia=updateEnemy(a,{x:10,z:0},[a],[],bounds,.1),ib=updateEnemy(b,{x:10,z:0},[b],[],bounds,.1,{locomotionMultiplier:.8});
        assert.deepEqual(a,b);assert.deepEqual(ia,ib);
    }
});
test('Boss Frost affects approach only, never Charge or attack clocks in either phase',()=>{
    for(const phase of [1,2] as const) for(const state of ['approach','charge','windup','radial','split','recovery'] as const){
        const a=createBoss(1,still),b=createBoss(1,still);for(const boss of [a,b]){boss.phase=phase;boss.state=state;boss.timer=.4;boss.dir={x:1,z:0}}
        const ia=updateBoss(a,{x:10,z:0},[],bounds,.1),ib=updateBoss(b,{x:10,z:0},[],bounds,.1,.8);
        if(state==='approach')close(b.x,a.x*.8);else assert.deepEqual(a,b);
        assert.equal(a.timer,b.timer);assert.deepEqual(ia,ib);
    }
    assert.equal(BOSS_STATS.hp,1600);assert.equal(BOSS_STATS.chargeSpeed,14);
});
test('Frost expiration keeps running underground and no new hit can refresh it there',()=>{
    const sim=fixture(1),b=createEnemy(100,'burrower',still);b.state='emergence';b.timer=.9;sim.enemies=[b];sim.frost.set(100,.3);
    hit(sim,0,{frost:true});assert.ok(sim.frost.get(100)!<.3);frames(sim,18);assert.equal(sim.frost.size,0);assert.equal(b.state,'emergence');
});
test('Overdrive charges in one second without targets; never attacks by itself',()=>{
    const sim=fixture(0);applyUpgrade(sim.player,'overdrive');frames(sim,59);assert.equal(overdriveActive(sim.player),false);
    frames(sim,1);assert.equal(overdriveActive(sim.player),true);assert.equal(sim.projectiles.length,0);
    assert.deepEqual(effectiveAttackStats(sim.player),{damage:12.5,attackCooldown:.35*.8});
});
test('movement intent, blocked movement and dash cancel Overdrive immediately; stopping restarts from zero',()=>{
    const p=createPlayer();applyUpgrade(p,'overdrive');p.x=0;p.z=0;
    updatePlayer(p,still,1,[],bounds);assert.ok(overdriveActive(p));
    updatePlayer(p,{x:1,z:0},dt,[{x:.6,z:0,halfX:.1,halfZ:5}],bounds);assert.equal(p.overdriveCharge,0);
    updatePlayer(p,still,.6,[],bounds);assert.equal(overdriveActive(p),false);assert.equal(p.overdriveCharge,.6);
    assert.equal(beginDash(p),true);assert.equal(p.overdriveCharge,0);assert.equal(effectiveAttackStats(p).damage,10);
    updatePlayer(p,still,.2,[],bounds);assert.equal(p.overdriveCharge,0);updatePlayer(p,still,.9,[],bounds);assert.equal(overdriveActive(p),false);
});
test('Overdrive composes permanent damage/interval upgrades without mutating them or compounding',()=>{
    const p=createPlayer();for(const id of ['power','trio','overclock','overdrive'] as const)applyUpgrade(p,id);
    const before={...p.stats};updatePlayer(p,still,1,[],bounds);
    close(effectiveAttackStats(p).damage,10*1.25*1.2*1.25);close(effectiveAttackStats(p).attackCooldown,.35*.85*.9*.8);
    for(let i=0;i<100;i++)updatePlayer(p,still,dt,[],bounds);
    assert.deepEqual(p.stats,before);updatePlayer(p,{x:1,z:0},dt,[],bounds);close(effectiveAttackStats(p).damage,before.damage);close(effectiveAttackStats(p).attackCooldown,before.attackCooldown);
});
test('Overdrive Rapid + Triple remains 3 + 3 at 100ms; modifiers snapshot per projectile',()=>{
    const sim=fixture(1);sim.enemies[0].x=12;sim.enemies[0].z=8;
    for(const id of ['overdrive','rapid','triple','piercing','ricochet','homing','flame','shock','frost','power','trio','overclock'] as const)applyUpgrade(sim.player,id);
    sim.player.shotCooldown=1000;frames(sim,60);sim.player.shotCooldown=0;sim.update(dt,still);
    assert.equal(sim.projectiles.length,3);close(sim.player.shotCooldown,.35*.9*.85*.8);
    frames(sim,5);assert.equal(sim.projectiles.length,3);frames(sim,1);assert.equal(sim.projectiles.length,6);
    for(const p of sim.projectiles){close(p.damage,18.75);assert.ok(p.flame&&p.shock&&p.frost&&p.homing);assert.equal(p.pierces,1);assert.equal(p.bounces,1)}
    sim.update(dt,{x:1,z:0});assert.equal(sim.player.overdriveCharge,0);assert.ok(sim.projectiles.every(p=>p.damage===18.75));
});
test('moving or dashing during Rapid cancels both pending event and Overdrive; cards reset charging',()=>{
    for(const dash of [false,true]) {
        const sim=fixture(1);sim.enemies[0].x=12;sim.enemies[0].z=8;for(const id of ['rapid','overdrive'] as const)applyUpgrade(sim.player,id);
        frames(sim,60);sim.player.shotCooldown=0;sim.update(dt,still);assert.equal(sim.burstShots,1);
        if(dash)sim.dash();sim.update(dt,dash?still:{x:1,z:0});assert.equal(sim.player.overdriveCharge,0);assert.equal(sim.burstShots,0);
        sim.progression.phase='upgrade';frames(sim,90);assert.equal(sim.player.overdriveCharge,0);
    }
});
test('Flame still deals three 20% ticks at .5s; visual fade lasts .5s with zero additional damage',()=>{
    const sim=fixture(1),vfx=new BurnVisuals();hit(sim,0,{flame:true});vfx.update(0,sim.burns,new Set([100]));
    for(let i=0;i<90;i++){sim.update(dt,still);vfx.update(dt,sim.burns,new Set([100]))}
    assert.equal(sim.enemies[0].hp,984);assert.equal(sim.burns.size,0);assert.ok(vfx.strength(100)>0);
    const hp=sim.enemies[0].hp;frames(sim,30);vfx.update(BURN_FADE,new Map(),new Set([100]));assert.equal(sim.enemies[0].hp,hp);assert.equal(vfx.strength(100),0);
    assert.deepEqual([UPGRADE_VALUES.flameTicks,UPGRADE_VALUES.flameFraction,UPGRADE_VALUES.flameInterval],[3,.2,.5]);
});
test('Flame reimpact during fade reuses one visual owner; death/reset cleans it immediately',()=>{
    const vfx=new BurnVisuals(),active=new Map([[1,{}]]),alive=new Set([1]);vfx.update(0,active,alive);
    vfx.update(.25,new Map(),alive);close(vfx.strength(1),.5);vfx.update(dt,active,alive);assert.equal(vfx.strength(1),1);
    vfx.update(dt,active,new Set());assert.equal(vfx.strength(1),0);vfx.update(0,active,alive);vfx.clear();assert.equal(vfx.strength(1),0);
    const sim=fixture(1);hit(sim,0,{flame:true});frames(sim,90);hit(sim,0,{flame:true});frames(sim,90);assert.equal(sim.enemies[0].hp,968);
});
test('Burn and Frost materials compose deterministically; ending either leaves the other intact',()=>{
    const material=new T.MeshStandardMaterial(),base=new T.Color(0x5b3836);
    applyStatusMaterial(material,base,1,true);const both=material.emissive.clone();assert.ok(material.color.b>base.b);
    applyStatusMaterial(material,base,0,true);assert.ok(material.emissive.b>0);assert.ok(material.color.b>base.b);
    applyStatusMaterial(material,base,1,false);assert.ok(material.emissive.r>0);assert.ok(material.color.equals(base));
    applyStatusMaterial(material,base,1,true);assert.ok(material.emissive.equals(both));applyStatusMaterial(material,base,0,false);assert.ok(material.color.equals(base));assert.equal(material.emissive.getHex(),0);
});
test('owned Flame particles including impact/tick clean on hide or death; all VFX remain capped and reusable',()=>{
    const scene=new T.Scene(),effects=new Effects(scene),point=new T.Vector3();
    for(const kind of ['impact','tick','embers'] as const)effects.flame(point,1,false,kind);
    effects.update(dt);const mesh=scene.children[0] as T.InstancedMesh;assert.ok(mesh.count>0);
    effects.retainBurns(new Set());effects.update(dt);assert.equal(mesh.count,0);
    const status=new StatusEffects(scene),sim=fixture(1);sim.frost.set(100,1.5);
    for(let i=0;i<100;i++)status.shock(still,{x:3,z:0});status.update(dt,sim,0);
    const line=scene.children[1] as T.Mesh,ice=scene.children[2] as T.InstancedMesh;
    assert.equal(line.geometry.drawRange.count,SHOCK_VFX.capacity*SHOCK_VFX.segments*6);assert.equal(ice.count,4);
    status.update(.2,sim,1);assert.equal(line.geometry.drawRange.count,0);status.clear();assert.equal(ice.count,0);
});
test('new run resets Shock/Frost/Overdrive and restores the complete pool',()=>{
    const sim=fixture();sim.shockHits=2;sim.frost.set(100,1.5);applyUpgrade(sim.player,'overdrive');frames(sim,60);
    const fresh=new Simulation();assert.equal(fresh.shockHits,0);assert.equal(fresh.frost.size,0);assert.equal(fresh.player.overdriveCharge,0);assert.equal(eligibleUpgrades(fresh.player).length,17);
});
