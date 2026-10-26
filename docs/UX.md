# CORE//07 · UX v1 · 22/10/2026

## Punto de partida y alcance

HEAD inicial: `b8d31ef` (`feat: complete core gameplay and audio v1`). Rama `main`, sincronizada con `origin/main` según el estado local, working tree limpio y diff vacío. Baseline ejecutado antes de editar: **211/211 tests**.

La arquitectura original ya separaba `Simulation` (datos y mecánicas), `Game` (input, bucle fijo/render y coordinación), `UI` (HUD, tarjetas y un briefing compartido por Start/Pause/Game Over/Victory), `World`/`Actors` (Three.js) y Audio v1 (`GameAudio`, `BrowserAudio`, `AudioEvents`, controles DOM). La pausa ya detenía las llamadas a la simulación. Existían reinicio y finales, pero no menú principal, navegación de subpaneles ni confirmaciones.

Esta iteración mantiene gameplay, balance, enemigos, upgrades, Boss, VFX y recursos/mezcla de audio. No cambia dependencias, package name, repositorio, directorio raíz ni almacenamiento de preferencias. La identidad visible pasa a **CORE//07**: menú, HUD y título/metadatos del navegador. Sin commit ni push.

## Archivos

Nuevos:

- `src/ux-flow.ts`: estados, navegación, confirmaciones y transición; no depende del DOM ni de Three.js. Solo llama a hooks de reset, inicio y pausa.
- `src/menu-view.ts`: paneles persistentes, eventos delegados, foco visible, vuelta al control de origen y Tab limitado a la capa activa.
- `src/menu-camera.ts`: pose de cámara ambiental sobre el mundo existente.
- `src/ux.css`: identidad, contraste, estados de botones, responsive y presentación de sectores.
- `tests/ux-flow.test.ts`: 16 pruebas del nuevo flujo con Simulation y Audio v1 reales (backend de audio falso).
- `docs/UX.md`: este informe.

Modificados: `index.html`, `src/main.ts`, `src/game.ts`, `src/ui.ts`, `src/audio-controls.ts`, `README.md` y `docs/AUDIO.md`. `UI` conserva HUD y tarjetas; las pantallas pasan a la nueva capa. `Game` conserva el único bucle y coordina la navegación. El cambio de controles de audio solo integra su panel con UX.

## Escena y legibilidad

Se reutilizan literalmente World, Actors, materiales, iluminación y robot. No se crea otra escena, renderer, compositor ni loop. El menú usa una cámara más próxima con un desplazamiento de apenas 0,16 unidades, a frecuencia baja; ventiladores y núcleo giran lentamente. `Simulation.update()` no se llama en menú, ayuda, ajustes, pausa ni confirmaciones. El estado de menú es una simulación nueva en `ready`, sin enemigos ni apariciones pendientes, y el aro del Player se oculta.

El menú principal combina gradiente oscuro fuerte detrás del título/botones, oscurecimiento en bordes y controles con fondos propios. Los subpaneles tienen fondo casi opaco, borde discreto y sombra; dejan visible el mundo alrededor. No se añade blur ni postprocesado. Pausa/finales centran el panel sobre oscurecimiento radial. Game Over usa acento cálido y Victory cyan. El HUD completo queda invisible e inerte cuando la capa UX está activa. El diagnóstico solo aparece con `?debug=1`.

En la inspección local, menú alrededor de **117 draw calls / 24K triángulos / 60 FPS**; combate observado alrededor de **192 / 33K / 60 FPS**. Son instantáneas de este equipo, no un benchmark universal. El menú no actualiza el HUD oculto cada frame y la pestaña oculta no renderiza ni simula. Se conserva el sistema existente de salas residentes y su disposición de recursos.

## Flujo y lifecycle

| Origen | Acción | Resultado |
| --- | --- | --- |
| Menú | Jugar | Fundido total de 360 ms; reemplazo de run a mitad del fundido; inicio en Sector 01 al terminar. |
| Menú | Cómo jugar / Ajustes | Panel sobre el mismo entorno, sin arrancar una run. |
| Gameplay, incluidas tarjetas/ending | Escape | Pausa real con Continuar, Ajustes, Reiniciar run y Menú principal. |
| Pausa | Continuar / Escape | Misma run, proyectiles, HP, timers y ofertas; se reanuda el audio. |
| Ajustes | Volver / Escape | Regresa a menú o pausa según procedencia; no reanuda por accidente. |
| Ayuda | Volver / Escape | Regresa al menú principal. |
| Pausa | Reiniciar / Menú | Confirmación propia, sin `alert()`; Cancelar tiene foco inicial. |
| Confirmación | Cancelar / Escape | Regresa a pausa conservando la run intacta. |
| Confirmación | Aceptar | Fundido y reemplazo de estado; empieza run nueva o regresa al menú. |
| Muerte | Reintentar / Menú | Nueva run limpia o entorno ambiental. No exige otra confirmación. |
| Victory | Nueva run / Menú | Mismo reinicio limpio, después de la secuencia existente del Boss. |

La transición usa el reloj fijo existente, no timers independientes. Clicks repetidos o acciones de otra pantalla no pueden iniciar dos runs. Si se pierde el foco durante la transición de inicio, la run queda pausada hasta Continuar. La pérdida de contexto WebGL muestra recuperación mediante recarga y no permite reanudar un contexto roto.

Reset cancela voces y fades mediante Audio v1, reemplaza Simulation, limpia Actors/partículas/estados visuales, sacudida, luces de impacto, avisos, teclas y cámara de seguimiento. Conserva renderer, mundo, buffers de audio y preferencias. Game Over/Victory no avanzan IA ni timers; solo terminan las partículas de destrucción ya existentes. Los finales no cortan su SFX al mostrar la pantalla.

## Ayuda, audio e input

Ayuda destaca **DETENTE PARA ATACAR**: movimiento WASD/flechas, dash con Espacio en la última dirección, arma automática al detenerse, núcleo/mejora entre sectores y objetivo Sector 07. No inventa controles ni mecánicas.

Ajustes es un único panel DOM compartido, enlazado al mismo GameAudio: Música, SFX y Silenciar. Mantiene la clave `protocol-zero.audio.v1`, los valores y su validación. Cambiar sliders aplica ganancias y persistencia inmediatamente; menú y pausa permanecen silenciosos. La música comienza al iniciar gameplay, se pausa conservando posición y continúa al reanudar. Volver al menú la detiene; nueva run inicia la pista normal desde cero. No se crean tracks ni contextos adicionales. SFX de muerte y Victory existentes se conservan una vez por final.

Input de gameplay solo se admite con UX en `playing` y fase `combat`, `cleared` o `travel`. Las tarjetas, `ending` y todos los menús bloquean movimiento/dash. Cambios de pantalla y blur limpian teclas. Flechas/Espacio en Ajustes pertenecen al panel; Escape vuelve un nivel y Tab mantiene el foco en la capa activa. Los botones no envían acciones al combate. Escape repetido por mantener pulsada la tecla no alterna pausa continuamente.

## Presentación de sectores

**SECTOR//01 — BREACH INITIATED** al comenzar cada run y **SECTOR//07 — CORE GUARDIAN** al cruzar realmente al Boss. Duran 1,7 s con entrada/salida breve, no capturan input ni detienen gameplay. CORE GUARDIAN es un descriptor provisional, no una nueva mecánica o lore. La pausa congela su duración; reset limpia presentaciones previas. No se altera la secuencia de 0,9 s de destrucción del Boss.

## Verificación

**16 tests nuevos:** menú sin run oculta; inicio único/fundido; pausa exacta de datos/timers; ayuda/Escape; Ajustes compartidos/persistentes; confirmación de restart/cancelación; menú con limpieza de audio y combate; muerte real/Retry; Boss real/Victory/Nueva run; vuelta desde ambos finales; bloqueo de input; rechazo de acciones inválidas; blur durante transición; pausa de `ending`; recuperación WebGL; pausa/Ajustes conservando ofertas de upgrade.

Resultado final: **227/227 tests**, sin saltos ni fallos. TypeScript estricto, build de producción y `git diff --check` correctos. Los tests existentes se mantienen. Revisión de untracked: únicamente módulos UX, CSS, tests y este documento; montajes de prueba retirados. No se añaden dependencias ni assets.

Revisión visual y funcional en Chrome:

- Menú: CORE//07 legible, mundo y Player visibles, controles reconocibles, HUD ausente, tiempo de run 0, sin enemigos/proyectiles/música de combate.
- Ayuda y Ajustes: contraste, teclado, sliders, mute, persistencia tras recargar y retorno a la pantalla correcta. Se restauraron las preferencias originales tras probarlas.
- Pausa: HP, posición, enemigos, proyectiles, elapsed y playhead idénticos antes/después de esperar y usar Ajustes. Confirmaciones de restart y menú probadas, incluida cancelación.
- Reinicio: Sector 01, 80 HP, estadísticas iniciales, sin mejoras ni avisos anteriores. Presentaciones 01 y 07 inspeccionadas.
- Game Over/Victory: daño letal y muerte del Boss reales en escenarios controlados temporales; SFX contados una vez por final; Retry/Nueva run y Menú verificados. Los escenarios no forman parte del juego entregado.
- Tamaños: ventana original, 1280×720, 800×600, 960×540 y 640×480. La ayuda compacta usa dos columnas en ventanas bajas; Ajustes y Volver quedan visibles a 640×480. Sin desbordamiento horizontal. Hay scroll vertical de respaldo para ventanas menores.
- La consola de los escenarios verificados no mostró warnings/errores; la página normal se revisó de nuevo después de retirar el montaje.

Límites: validación en Chrome de escritorio, sin run humana completa de siete sectores en esta pasada. No se promete rendimiento en otros equipos ni soporte táctil. Los SFX aún no descargados pueden omitirse al primer gesto, como ya ocurría en Audio v1. No se añaden guardado de run, selección de dificultad ni nuevos ajustes gráficos. No hay fallos conocidos en los flujos comprobados.

## Checklist humano corto

1. Abrir: menú legible; Ayuda → Volver y Ajustes → Volver sin mover al robot.
2. Jugar: fundido breve, Sector 01, movimiento y autoataque habituales.
3. Escape → Ajustes → Escape: sigue pausado; Escape otra vez continúa. Cancelar y aceptar Reiniciar/Menú.
4. Morir y derrotar al Boss: distinguir ambos finales, escuchar una sola señal y probar nueva run/menú.
5. Reducir ventana: leer controles, navegar con Tab/Escape y acceder siempre a Volver.
