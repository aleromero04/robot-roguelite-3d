import type { Player } from './player.ts';
export const UPGRADE_VALUES = {
    power: 1.25, overclock: .85, turbo: 1.1, chassis: 20, repair: 30,
    piercing: 1, ricochet: 1, ricochetRange: 6,
    shockEvery: 3, shockFraction: .4, shockRange: 5.5, shockTargets: 2,
    frostMultiplier: .8, frostDuration: 1.5,
    overdriveCharge: 1, overdriveDamage: 1.25, overdriveInterval: .8,
    flameTicks: 3, flameFraction: .2, flameInterval: .5,
    reviveFraction: .4, reviveInvulnerability: 2,
    trioDamage: 1.2, trioSpeed: 1.1, trioCooldown: .9, tripleAngle: Math.PI / 18,
    rapidExtraShots: 1, rapidInterval: .1,
    homingRange: 10, homingCone: Math.PI / 4, homingTurnRate: 1.2, homingTotalTurn: Math.PI / 4,
} as const;
export type Rarity = 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';
export const RARITY_WEIGHTS: Readonly<Record<Rarity, number>> = { COMMON: 60, RARE: 27, EPIC: 10, LEGENDARY: 3 };
export const UPGRADES = [
    { id: 'power', rarity: 'COMMON', unique: false, name: 'POWER CORE', value: '+25% DAÑO', description: 'Amplifica la potencia de cada proyectil.', icon: '◈' },
    { id: 'overclock', rarity: 'COMMON', unique: false, name: 'OVERCLOCK', value: '−15% INTERVALO', description: 'Reduce el tiempo entre ataques automáticos.', icon: 'ϟ' },
    { id: 'turbo', rarity: 'COMMON', unique: false, name: 'TURBO', value: '+10% VELOCIDAD', description: 'Aumenta la velocidad de movimiento.', icon: '»' },
    { id: 'chassis', rarity: 'COMMON', unique: false, name: 'REINFORCED CHASSIS', value: '+20 HP MÁX. / +20 HP', description: 'Refuerza la unidad y recupera 20 de integridad.', icon: '⬡' },
    { id: 'repair', rarity: 'COMMON', unique: false, name: 'REPAIR', value: '+30 HP', description: 'Repara sin superar la integridad máxima.', icon: '+' },
    { id: 'piercing', rarity: 'RARE', unique: true, name: 'PIERCING SHOT', value: '+1 PENETRACIÓN', description: 'Cada proyectil atraviesa un enemigo adicional.', icon: '↠' },
    { id: 'ricochet', rarity: 'RARE', unique: true, name: 'RICOCHET', value:  '1 REBOTE', description: 'Tras impactar, rebota hacia otro enemigo cercano.', icon: '⌁' },
    { id: 'rapid', rarity: 'RARE', unique: true, name: 'RAPID SHOT', value: 'RÁFAGA DE 2', description: 'Un segundo disparo a los 100 ms. Moverte cancela el pendiente.', icon: '∶' },
    { id: 'homing', rarity: 'EPIC', unique: true, name: 'HOMING SHOT', value: 'ASISTENCIA DE TIRO', description: 'Corrige suavemente el rumbo, con giro limitado.', icon: '⌖' },
    { id: 'flame', rarity: 'RARE', unique: true, name: 'FLAME SHOT', value: 'PROYECTILES INCENDIARIOS', description: 'Quema al impactar. El fuego causa daño durante un breve tiempo.', icon: '♨' },
    { id: 'shield', rarity: 'EPIC', unique: true, name: 'ENERGY SHIELD', value: 'BLOQUEA UN IMPACTO', description: 'Absorbe un golpe por sector. Se rearma al entrar en el siguiente.', icon: '⬡' },
    { id: 'revive', rarity: 'LEGENDARY', unique: true, name: 'REVIVE', value: 'UNA SEGUNDA OPORTUNIDAD', description: 'Evita una muerte y restaura el 40% de tu vida máxima.', icon: '↻' },
    { id: 'trio', rarity: 'EPIC', unique: true, name: 'POWER TRIO', value: 'POTENCIA · MOVILIDAD · CADENCIA', description: '+20% daño, +10% movimiento y −10% intervalo entre ataques.', icon: '△' },
    { id: 'triple', rarity: 'LEGENDARY', unique: true, name: 'TRIPLE SHOT', value: 'TRES TIROS A LA VEZ', description: 'Dispara un abanico de tres proyectiles. Combina con Rapid Shot.', icon: '⋔' },
    { id: 'shock', rarity: 'RARE', unique: true, name: 'SHOCK SHOT', value: 'CADA 3 IMPACTOS · CADENA', description: 'Cada tercer impacto descarga un 40% de su daño hacia hasta dos enemigos cercanos.', icon: 'ϟ' },
    { id: 'frost', rarity: 'EPIC', unique: true, name: 'FROST SHOT', value: '−20% MOVIMIENTO · 1,5 s', description: 'Ralentiza el movimiento normal. No afecta cargas ni ataques.', icon: '❄' },
    { id: 'overdrive', rarity: 'LEGENDARY', unique: true, name: 'OVERDRIVE', value: 'QUIETO 1 s · SOBRECARGA', description: '+25% daño y −20% intervalo tras un segundo parado. Moverte cancela la carga.', icon: '◎' },
] as const;
export type UpgradeId = typeof UPGRADES[number]['id'];
export function eligibleUpgrades(player: Player): UpgradeId[] {
    return UPGRADES.filter(u => !u.unique || !player.acquired.has(u.id)).map(u => u.id);
}
export function chooseUpgradeOptions(player: Player, random: () => number = Math.random): UpgradeId[] {
    const pool = eligibleUpgrades(player);
    const chosen: UpgradeId[] = [];
    while (chosen.length < 3 && pool.length) {
        const categories = (Object.keys(RARITY_WEIGHTS) as Rarity[]).filter(rarity =>
            RARITY_WEIGHTS[rarity] > 0 && pool.some(id => UPGRADES.find(u => u.id === id)!.rarity === rarity));
        if (!categories.length) break;
        let roll = random() * categories.reduce((sum, rarity) => sum + RARITY_WEIGHTS[rarity], 0);
        const rarity = categories.find(r => (roll -= RARITY_WEIGHTS[r]) < 0) ?? categories[categories.length - 1];
        const candidates = pool.filter(id => UPGRADES.find(u => u.id === id)!.rarity === rarity);
        const id = candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))];
        chosen.push(id);
        pool.splice(pool.indexOf(id), 1);
    }
    return chosen;
}
export function applyUpgrade(player: Player, id: UpgradeId): boolean {
    if (!eligibleUpgrades(player).includes(id)) return false;
    if (id === 'shield') player.shieldSpent = false;
    if (id === 'power') player.stats.damage *= UPGRADE_VALUES.power;
    if (id === 'overclock') {
        player.stats.attackCooldown *= UPGRADE_VALUES.overclock;
        player.shotCooldown = Math.min(player.shotCooldown, player.stats.attackCooldown);
    }
    if (id === 'trio') {
        player.stats.damage *= UPGRADE_VALUES.trioDamage;
        player.stats.speed *= UPGRADE_VALUES.trioSpeed;
        player.stats.attackCooldown *= UPGRADE_VALUES.trioCooldown;
        player.shotCooldown = Math.min(player.shotCooldown, player.stats.attackCooldown);
    }
    if (id === 'turbo') player.stats.speed *= UPGRADE_VALUES.turbo;
    if (id === 'chassis') {
        player.stats.maxHp += UPGRADE_VALUES.chassis;
        player.hp = Math.min(player.stats.maxHp, player.hp + UPGRADE_VALUES.chassis);
    }
    if (id === 'repair') player.hp = Math.min(player.stats.maxHp, player.hp + UPGRADE_VALUES.repair);
    player.acquired.add(id);
    return true;
}

/** Permanent upgrades accumulate in stats; temporary multipliers never mutate that base. */
export function overdriveActive(player: Player): boolean {
    return player.acquired.has('overdrive') && player.overdriveCharge + 1e-9 >= UPGRADE_VALUES.overdriveCharge;
}
export function effectiveAttackStats(player: Player): { damage: number; attackCooldown: number } {
    const active = overdriveActive(player);
    return { damage: player.stats.damage * (active ? UPGRADE_VALUES.overdriveDamage : 1),
        attackCooldown: player.stats.attackCooldown * (active ? UPGRADE_VALUES.overdriveInterval : 1) };
}
