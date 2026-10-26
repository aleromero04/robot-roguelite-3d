import type { Action, UXFlow } from './ux-flow.ts';

/** One persistent DOM shell: shared settings, delegated buttons, bounded focus. */
export class MenuView {
    private root = document.querySelector<HTMLElement>('#ux')!;
    private last = '';
    private abort = new AbortController();
    constructor(action: (action: Action) => void) {
        const options = { signal: this.abort.signal };
        this.root.addEventListener('click', event => {
            const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action]');
            if (button) action(button.dataset.action as Action);
        }, options);
        this.root.addEventListener('keydown', event => {
            if (event.code !== 'Tab') return;
            const items = Array.from(this.root.querySelectorAll<HTMLElement>('button, input')).filter(el => el.getClientRects().length && !el.hasAttribute('disabled'));
            if (!items.length) return;
            const index = items.indexOf(document.activeElement as HTMLElement);
            if (event.shiftKey && index <= 0 || !event.shiftKey && (index < 0 || index === items.length - 1)) {
                event.preventDefault(); items[event.shiftKey ? items.length - 1 : 0].focus();
            }
        }, options);
    }
    render(flow: UXFlow): void {
        const key = `${flow.screen}:${flow.confirmation}`;
        document.querySelector<HTMLElement>('#transition-veil')!.style.opacity = String(flow.fade);
        if (key === this.last) return;
        const previous = this.last.split(':')[0]; this.last = key;
        this.root.scrollTop = 0;
        const overlay = flow.screen !== 'playing';
        this.root.hidden = !overlay;
        this.root.dataset.screen = flow.screen;
        this.root.dataset.ambient = String(flow.ambient);
        this.root.querySelector('#system-status')!.textContent = flow.screen === 'gameover' || flow.screen === 'error'
            ? 'CONNECTION LOST' : flow.screen === 'victory' ? 'PROTOCOL COMPLETE' : flow.ambient ? 'SYSTEM ONLINE' : 'LINK SUSPENDED';
        document.body.dataset.screen = flow.screen;
        document.querySelector<HTMLElement>('#hud')!.inert = overlay;
        document.title = flow.screen === 'menu' ? 'CORE//07 · System Breach Protocol' : 'CORE//07';
        this.root.querySelectorAll<HTMLElement>('[data-panel]').forEach(panel => { panel.hidden = panel.dataset.panel !== flow.screen; });
        if (flow.screen === 'confirm') {
            const restart = flow.confirmation === 'restart';
            this.root.querySelector('#confirm-title')!.textContent = restart ? 'REINICIAR RUN' : 'VOLVER AL MENÚ';
            this.root.querySelector('#confirm-copy')!.textContent = restart ? 'Se perderá el progreso de esta run. ¿Quieres empezar de nuevo?' : 'Se perderá el progreso de esta run. ¿Quieres volver al menú principal?';
            this.root.querySelector('#confirm-accept')!.textContent = restart ? 'REINICIAR' : 'IR AL MENÚ';
        }
        if (!overlay) { (document.activeElement as HTMLElement)?.blur(); return; }
        const panel = this.root.querySelector<HTMLElement>('[data-panel]:not([hidden])');
        const restore = previous === 'settings' ? 'settings' : previous === 'how' ? 'how' : previous === 'confirm' ? flow.confirmation : '';
        const focus = flow.screen === 'confirm' ? panel?.querySelector<HTMLElement>('[data-action="cancel"]')
            : panel?.querySelector<HTMLElement>(`[data-action="${restore}"]`) ?? panel?.querySelector<HTMLElement>('button, input');
        focus?.focus({ preventScroll: true });
    }
    dispose(): void { this.abort.abort(); }
}
