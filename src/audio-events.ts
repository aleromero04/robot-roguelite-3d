import { GameAudio, type SfxId } from './audio.ts';
import type { GameEvent, Simulation } from './simulation.ts';
import { BOSS_SECTOR, type Phase } from './waves.ts';
import { isUnderground } from './enemies/types.ts';

const EVENTS: Partial<Record<GameEvent['type'], SfxId>> = {
    'enemy-hit': 'hitEnemy', 'boss-hit': 'hitEnemy', 'enemy-death': 'enemyDeath',
    'player-hit': 'playerHurt', dash: 'dash', 'grenade-throw': 'grenadeThrow',
    explosion: 'grenadeExplosion', burrow: 'burrow', emerge: 'emerge',
    'shield-break': 'shield', 'reward-pickup': 'reward', 'boss-phase': 'bossPhase',
    'boss-death': 'bossDeath', 'flame-impact': 'flameImpact', revive: 'revive',
};
/** Read-only adapter for the existing simulation event stream and phase edges. */
export class AudioEvents {
    private audio: GameAudio;
    private phase?: Phase;
    private wave = -1;
    private bossState = '';
    constructor(audio: GameAudio) { this.audio = audio; }
    reset(): void { this.phase = undefined; this.wave = -1; this.bossState = ''; this.audio.reset(); }
    upgrade(): void { this.audio.play('upgrade'); this.audio.play('door'); }
    update(sim: Simulation, paused: boolean): void {
        const { phase, wave } = sim.progression;
        this.audio.setPaused(paused);
        if (paused) return;
        const terminal = ['ready', 'dead', 'ending', 'complete'].includes(phase);
        if (phase !== this.phase && (phase === 'upgrade' || terminal && !(phase === 'complete' && this.phase === 'ending')))
            this.audio.clearSfx();
        this.audio.setMusic(terminal ? null : wave === BOSS_SECTOR && !!sim.boss ? 'boss' : 'normal', phase === 'upgrade' ? .65 : 1);
        // Death and the Game Over overlay share a state: one destruction cue is enough.
        if (phase === 'dead' && this.phase !== 'dead') this.audio.play('playerDeath');
        if (phase === 'complete' && this.phase === 'ending') this.audio.play('victory');
        if (this.wave >= 0 && wave !== this.wave && !terminal) this.audio.play('door');
        const bossState = sim.boss ? `${sim.boss.state}:${sim.boss.chargeIndex}` : '';
        if (phase === 'combat' && bossState !== this.bossState && sim.boss?.state === 'windup' && sim.boss.pattern === 'charge')
            this.audio.play('bossCharge');
        this.bossState = bossState;
        const deaths = new Set(sim.events.filter(e => e.type === 'enemy-death').map(e => e.id));
        const burning = new Set(sim.events.filter(e => e.type === 'burn').map(e => e.id));
        let shockPlayed = false;
        for (const event of sim.events) {
            // Final-frame terminal/core cues survive; residual combat events in safe screens do not.
            if (terminal && !['boss-death', 'player-death'].includes(event.type)) continue;
            if (phase === 'upgrade' && event.type !== 'reward-pickup') continue;
            if (event.type === 'shock') {
                // Simulation emits every link synchronously in this step. Coalesce the chain,
                // including simultaneous procs, instead of playing once per secondary target.
                if (!shockPlayed) this.audio.play('shock');
                shockPlayed = true;
                continue;
            }
            if (event.type === 'shot') {
                if (phase === 'combat') this.audio.play(!event.enemy ? 'playerShot' : event.id === sim.boss?.id ? 'bossAttack' : 'enemyShot');
                continue;
            }
            if (event.type === 'enemy-hit' || event.type === 'boss-hit') {
                const enemy = sim.enemies.find(e => e.id === event.id);
                if (deaths.has(event.id) || burning.has(event.id) || enemy && isUnderground(enemy)) continue;
            }
            const sound = EVENTS[event.type];
            if (sound) this.audio.play(sound);
        }
        this.phase = phase; this.wave = wave;
    }
}
