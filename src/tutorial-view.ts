import { TutorialController, type TutorialStep, type TutorialStorage } from './tutorial.ts';

const COPY: Partial<Record<TutorialStep, readonly [string, string]>> = {
    movement: ['MOVERSE', 'WASD / FLECHAS'],
    stopToAttack: ['DETENTE PARA ATACAR', 'El disparo es automático mientras estás quieto'],
    dash: ['DASH', 'ESPACIO'],
    collectReward: ['RECOGE EL NÚCLEO', 'Elige una mejora para continuar'],
};
export function tutorialStorage(): TutorialStorage | undefined {
    try { return window.localStorage; } catch { return undefined; }
}
/** Presentation only; timers here never complete an action or advance gameplay. */
export class TutorialView {
    private root = document.querySelector<HTMLElement>('#tutorial')!;
    private last = '';
    private repeatTime = 0;
    private abort = new AbortController();
    constructor(tutorial: TutorialController) {
        document.querySelector('#repeat-tutorial')!.addEventListener('click', () => {
            tutorial.repeat(); this.repeatTime = 3;
            document.querySelector('#tutorial-feedback')!.textContent = 'Tutorial activado para la próxima run';
        }, { signal: this.abort.signal });
    }
    reset(): void {
        this.last = '';
        this.root.classList.remove('visible'); this.root.dataset.step = 'inactive';
        this.root.setAttribute('aria-hidden', 'true');
        this.root.querySelector('strong')!.textContent = ''; this.root.querySelector('span')!.textContent = '';
    }
    update(tutorial: TutorialController, dt: number): void {
        if (this.repeatTime > 0) {
            this.repeatTime -= dt;
            if (this.repeatTime <= 0) document.querySelector('#tutorial-feedback')!.textContent = '';
        }
        const copy = tutorial.separating ? undefined : COPY[tutorial.step], key = `${tutorial.step}:${tutorial.confirmed}`;
        this.root.setAttribute('aria-hidden', String(!copy));
        this.root.dataset.step = tutorial.step;
        if (!copy) { this.root.classList.remove('visible'); this.last = ''; return; }
        // Controller owns reading/feedback/gap timing. CSS only animates visibility.
        if (key !== this.last) {
            this.root.querySelector('strong')!.textContent = copy[0];
            this.root.querySelector('span')!.textContent = tutorial.confirmed ? '✓ COMPLETADO' : copy[1];
            this.root.classList.toggle('confirmed', tutorial.confirmed);
            this.root.classList.add('visible'); this.last = key;
        }
    }
    dispose(): void { this.abort.abort(); }
}
