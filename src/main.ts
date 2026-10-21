import './style.css';
import { Game } from './game';
try {
    new Game(document.querySelector<HTMLCanvasElement>('#game')!);
}
catch (error) {
    console.error(error);
    document.querySelector('#overlay-title')!.textContent = 'NO SE PUDO INICIAR';
    document.querySelector('#overlay-copy')!.textContent = 'Se necesita un navegador con WebGL 2 y aceleración gráfica. Comprueba que estén disponibles y recarga la página.';
    const button = document.querySelector<HTMLButtonElement>('#start')!;
    button.textContent = 'RECARGAR';
    button.onclick = () => location.reload();
}
