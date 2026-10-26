import './style.css';
import './ux.css';
import { Game } from './game';
try {
    new Game(document.querySelector<HTMLCanvasElement>('#game')!);
}
catch (error) {
    console.error(error);
    document.body.dataset.screen = 'error';
    const ux = document.querySelector<HTMLElement>('#ux')!;
    ux.hidden = false; ux.dataset.screen = 'error';
    ux.querySelectorAll<HTMLElement>('[data-panel]').forEach(panel => { panel.hidden = panel.dataset.panel !== 'error'; });
    document.querySelector('#error-title')!.textContent = 'NO SE PUDO INICIAR';
    document.querySelector('#error-copy')!.textContent = 'Se necesita WebGL 2 y aceleración gráfica. Comprueba que estén disponibles y recarga la página.';
    document.querySelector<HTMLButtonElement>('#reload-game')!.onclick = () => location.reload();
}
