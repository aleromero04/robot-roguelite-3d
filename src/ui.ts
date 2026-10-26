import { DAMAGE_FEEDBACK } from './player';
import type { Simulation } from './simulation';
import { effectiveAttackStats, overdriveActive, UPGRADES, UPGRADE_VALUES, type UpgradeId } from './upgrades';
import { BOSS_SECTOR, SECTOR_COUNT, sectorNumber } from './waves';
const $ = <E extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<E>(selector)!;
export class UI {
    private presentation = '';
    private noticeTime = 0;
    private introTime = 0;
    constructor(choose: (id: UpgradeId) => void) {
        $('#upgrade-cards').addEventListener('click', event => {
            const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-upgrade]');
            if (button) choose(button.dataset.upgrade as UpgradeId);
        });
    }
    private renderCards(ids: readonly UpgradeId[]): void {
        $('#upgrade-cards').innerHTML = ids.map((id, i) => {
            const u = UPGRADES.find(upgrade => upgrade.id === id)!;
            return `<button class="upgrade-card" data-rarity="${u.rarity}" data-upgrade="${u.id}"><span class="upgrade-number">0${i + 1} / MÓDULO <b class="rarity-label">${u.rarity}</b></span><span class="upgrade-icon">${u.icon}</span><strong>${u.name}</strong><span class="upgrade-value">${u.value}</span><span class="upgrade-copy">${u.description}</span><span class="upgrade-action">INSTALAR <b>↗</b></span></button>`;
        }).join('');
    }

    notice(text: string): void { $('#notice').textContent = text; this.noticeTime = 3.2; }
    reset(): void {
        this.presentation = ''; this.noticeTime = 0; this.introTime = 0;
        $('#notice').textContent = ''; $('#notice').style.opacity = '0';
        $('#sector-intro').classList.remove('visible'); this.flash(0);
    }
    sector(wave: number): void {
        if (wave !== 0 && wave !== BOSS_SECTOR) return;
        $('#sector-intro strong').textContent = `SECTOR//${sectorNumber(wave)}`;
        $('#sector-intro span').textContent = wave === 0 ? 'BREACH INITIATED' : 'CORE GUARDIAN';
        this.introTime = 1.7;
    }
    update(sim: Simulation, paused: boolean, dt: number): void {
        this.introTime = Math.max(0, this.introTime - dt);
        $('#sector-intro').classList.toggle('visible', this.introTime > 0 && !paused);
        const { player: p, progression: run } = sim;
        this.noticeTime = Math.max(0, this.noticeTime - dt);
        $('#notice').style.opacity = this.noticeTime > 0 ? '1' : '0';
        $('#hp-value').innerHTML = `${Number(p.hp.toFixed(1))} <small>/ ${p.stats.maxHp}</small>`;
        document.querySelector<HTMLElement>('.vitals')!.style.setProperty('--damage-pulse', String(p.damageHud / DAMAGE_FEEDBACK.hud));
        $('#defense-status').textContent = [p.acquired.has('shield') ? (!p.shieldSpent ? 'ESCUDO LISTO' : 'ESCUDO GASTADO') : '', p.acquired.has('revive') ? (p.reviveUsed ? 'REVIVE CONSUMIDO' : 'REVIVE LISTO') : ''].filter(Boolean).join(' · ');
        $('#hp-bar').style.width = `${p.hp / p.stats.maxHp * 100}%`;
        $('#hp-bar').style.background = p.hp < 25 ? '#ff785b' : '#86e6d8';
        $('#hp-status').textContent = p.hp <= 0 ? 'UNIDAD DESCONECTADA' : p.hp < 25 ? 'INTEGRIDAD CRÍTICA' : 'INTEGRIDAD ESTRUCTURAL';
        $('#link-status').textContent = p.hp <= 0 ? '○ SIN SEÑAL' : '● CONECTADO';
        $('#kills').textContent = String(sim.kills).padStart(2, '0');
        $('#time').textContent = `${String(Math.floor(sim.elapsed / 60)).padStart(2, '0')}:${String(Math.floor(sim.elapsed % 60)).padStart(2, '0')}`;
        $('#dash-ready').style.opacity = p.dashCooldown > 0 ? '.2' : '1';
        $('#wave').textContent = `SECCIÓN ${sectorNumber(run.wave)} / ${SECTOR_COUNT}`;
        if (document.body.dataset.screen === 'playing') document.title = `CORE//07 · Sector ${sectorNumber(run.wave)}`;
        $('#sector-name').textContent = `SECTOR//${sectorNumber(run.wave)}`;
        const attack = effectiveAttackStats(p);
        const overdrive = !p.acquired.has('overdrive') ? '' : overdriveActive(p) ? ' · OVERDRIVE ACTIVO' : p.moving ? ' · OVERDRIVE CANCELADO' : ` · OVERDRIVE ${Math.floor(p.overdriveCharge * 100)}%`;
        $('#weapon-stats').textContent = `DAÑO ${Number(attack.damage.toFixed(2))} · INTERVALO ${Math.round(attack.attackCooldown * 1000)} ms${overdrive}`;
        $('#objective').textContent = run.phase === 'combat' ? (sim.boss ? 'BOSS · LEE LOS AVISOS Y BUSCA HUECOS' : `${sim.enemies.length + sim.pendingSpawns} HOSTILES · DETENTE PARA DISPARAR`) : run.phase === 'cleared' ? 'RECOGE EL NÚCLEO · LOS PELIGROS SIGUEN ACTIVOS' : run.phase === 'upgrade' ? 'ELIGE UN MÓDULO' : run.phase === 'travel' ? 'AVANZA POR LA COMPUERTA →' : run.phase === 'ending' ? 'BOSS NEUTRALIZADO · ASEGURANDO EXTRACCIÓN' : run.phase === 'complete' ? 'INCURSIÓN COMPLETADA' : 'SIETE SECTORES · UNA UNIDAD';
        $('#status').textContent = paused ? 'ENLACE EN PAUSA' : run.phase === 'dead' ? 'SEÑAL PERDIDA' : run.phase === 'combat' ? (p.moving ? 'MOVIMIENTO · ARMA EN ESPERA' : 'ESTACIONARIO · AUTOATAQUE') : run.phase === 'cleared' ? 'SECTOR DESPEJADO · NÚCLEO DISPONIBLE' : run.phase === 'travel' ? 'SALIDA HABILITADA' : run.phase === 'upgrade' ? 'INSTALACIÓN DE MÓDULO' : run.phase === 'ending' ? 'NÚCLEO DEL BOSS DESTRUIDO' : run.phase === 'complete' ? 'EXTRACCIÓN COMPLETA' : 'SISTEMAS EN ESPERA';
        const bossVisible = !!sim.boss && sim.boss.hp > 0 && run.phase === 'combat';
        $('#boss-hud').classList.toggle('hidden', !bossVisible);
        if (bossVisible) {
            const boss = sim.boss!;
            $('#boss-hp').textContent = `${Math.ceil(boss.hp)} / ${boss.maxHp}`;
            $('#boss-bar').style.width = `${boss.hp / boss.maxHp * 100}%`;
            $('#boss-phase').textContent = `PHASE 0${boss.phase}`;
        }
        const ending = run.phase === 'ending';
        const state = `${ending}:${paused}:${run.phase}:${run.wave}:${sim.offeredUpgrades.join(",")}`;
        if (state === this.presentation)
            return;
        this.presentation = state;
        const selection = run.phase === 'upgrade' && !paused;
        $('#upgrade-overlay').classList.toggle('hidden', !selection);
        if (selection) {
            this.renderCards(sim.offeredUpgrades);
            $('#upgrade-subtitle').textContent = `SECCIÓN ${run.wave + 1} ASEGURADA · ELIGE 1 DE 3`;
            $('#repair-preview').textContent = `Integridad ${Number(p.hp.toFixed(1))}/${p.stats.maxHp} · Repair restaura ${Number(Math.min(UPGRADE_VALUES.repair, p.stats.maxHp - p.hp).toFixed(1))} HP`;
            document.querySelector<HTMLButtonElement>('.upgrade-card')?.focus({ preventScroll: true });
        }
        document.querySelector('.progress-hud')!.classList.toggle('hidden', paused || selection || ['ready', 'dead', 'complete'].includes(run.phase));
    }
    flash(value: number): void { $('#damage-flash').style.opacity = String(Math.min(1, Math.max(0, value)) * .85); }
}
