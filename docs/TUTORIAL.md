# Onboarding v1 · CORE//07

Tutorial integrado en Sector 01. Observa la simulación, sin modificar controles, combate, daño, dificultad, audio ni cartas. No detiene el mundo ni bloquea el ratón.

## Arquitectura y secuencia

- `src/tutorial.ts`: controlador independiente del DOM, con almacenamiento inyectable y los estados `inactive`, `movement`, `stopToAttack`, `dash`, `waitingForReward`, `collectReward`, `completed`.
- `src/tutorial-view.ts` y `src/tutorial.css`: mensajes, transiciones y acción secundaria de repetición.
- `src/game.ts`: inicia/restablece el controlador con la run; lo actualiza después de `Simulation.update`, antes de consumir los eventos compartidos. La simulación no conoce el tutorial.
- `index.html` y `src/main.ts`: contenedor informativo, botón de repetición en Cómo jugar e importación de estilos.
- `tests/tutorial.test.ts`: casos con la simulación real y almacenamiento sustituible.

| Mensaje | Hecho que lo completa |
| --- | --- |
| MOVERSE · WASD / FLECHAS | 0,6 unidades acumuladas de desplazamiento real con entrada de movimiento, `walking` activo y sin dash. Pulsar contra una pared no cuenta. |
| DETENTE PARA ATACAR | Un nuevo evento `shot` del jugador con `moving === false`, tras 1,2 s de lectura. El sistema de combate existente emite ese evento cuando dispara realmente contra un objetivo válido. No se infiere por soltar teclas. |
| DASH · ESPACIO | Un nuevo evento `dash` tras 0,8 s de lectura, emitido solo cuando el dash se ejecuta. Un intento rechazado por cooldown no cuenta. |
| Sin mensaje durante el resto del combate | Espera al núcleo físico. |
| RECOGE EL NÚCLEO | `sim.reward` presente en fase `cleared`; desaparece con el evento real `reward-pickup`. |

Los tiempos están centralizados en `TUTORIAL_TIMINGS`, en `src/tutorial.ts`, expresados en segundos:

| Constante | Valor | Uso |
| --- | --- | --- |
| `completeFeedback` | 0,35 | Confirmación de movimiento, auto-fire y dash. |
| `betweenStepsDelay` | 0,60 | Separación visual antes de mostrar el siguiente paso. |
| `stopToAttackMinVisible` | 1,20 | Lectura antes de aceptar un nuevo disparo. |
| `dashMinVisible` | 0,80 | Lectura antes de aceptar un nuevo dash. |

El controlador permanece en el mismo paso durante lectura, confirmación y separación; solo después cambia al siguiente. Los disparos y dashes anteriores a su instrucción o a su ventana de lectura se descartan, sin buffer. Al expirar la ventana, debe llegar un evento nuevo. No se toca el cooldown real del arma ni del dash. La vista refleja el estado inmediatamente; CSS conserva su entrada/salida de 150 ms y respeta movimiento reducido. No hay un temporizador visual separado que adelante el estado interno.

El núcleo disponible tiene prioridad sobre una transición pendiente y no recibe retrasos. Si se recoge sin haber realizado todas las acciones válidas, el tutorial se retira para no tapar las cartas, **no guarda completado** y vuelve desde el principio en la próxima run. Las cartas existentes ya explican cómo elegir una mejora y no se modifican.

## Persistencia y ciclo de vida

Solo se utiliza `core07.tutorial.v1.completed`, con valor literal `true`. La ausencia de la flag, incluso con preferencias de audio guardadas, activa el tutorial. Se guarda únicamente después de movimiento, disparo, dash y recogida reales.

**Cómo jugar → REPETIR TUTORIAL** elimina únicamente esa flag, muestra feedback durante tres segundos de pantalla activa y habilita el tutorial para la siguiente nueva run. No inicia una partida ni cambia preferencias.

- Pausa: oculta el mensaje y congela estado y tiempos; continuar recupera el paso.
- Death / Retry / Restart / volver al menú: un tutorial incompleto empieza de nuevo en la próxima run; uno completado permanece desactivado.
- Salir de Sector 01: desactiva cualquier tutorial incompleto sin guardar completado.
- Almacenamiento bloqueado: lectura, escritura, borrado y acceso a `window.localStorage` están protegidos. La sesión sigue funcionando y conserva la finalización en memoria; entre sesiones no se garantiza persistencia.

## Verificación

Base inspeccionada: `a74cf4c` (`feat: add CORE//07 UX v1 and menu presentation`), `main` sincronizado con `origin/main`, working tree limpio. Baseline ejecutado: **233/233 tests**.

La primera entrega añadió 15 tests a los 233 iniciales: **248/248** correctos. Ese baseline se ha vuelto a ejecutar antes de corregir el ritmo, conservando los cambios locales. Se mantienen los casos existentes, adaptando sus tiempos y la expectativa de acciones tempranas al nuevo requisito. Se añaden ocho pruebas con reloj controlado para lectura, descarte de eventos tempranos, aceptación posterior, pausa, separación y equivalencia de dos simulaciones con/sin tutorial. No hay esperas reales en tests.

Resultado de esta corrección: **256/256 tests**, sin fallos ni omitidos; typecheck, build de producción y `git diff --check` correctos.

Chrome: comprobados inicio con flag ausente, mensajes y núcleo, desaparición al recoger, cartas existentes, segunda run sin tutorial, repetición con feedback sin autoinicio, muerte/Retry desde movimiento y pausa conservando el paso. Sin errores ni warnings de consola capturados. Revisión visual a 1440 × 778: mensajes inferiores sobre el HUD, contraste legible y botón secundario discreto.

La prueba humana posterior detectó que el mensaje de auto-fire desaparecía demasiado pronto: la primera implementación guardaba eventos anteriores a la instrucción y no exigía tiempo de lectura. La corrección de ritmo elimina ese comportamiento.

Chrome, comprobación del nuevo ritmo con gameplay en tiempo real y entradas programadas desde una página temporal: movimiento confirmado en 0,267 s; separación desde 0,633 s; auto-fire visible desde 1,233 s; disparos reales en 1,383 / 1,750 / 2,117 s ignorados; disparo de 2,483 s confirma. DASH aparece en 3,450 s; dash real en 3,667 s ignorado y otro en 5,467 s aceptado. El núcleo aparece en 6,250 s e interrumpe correctamente la separación pendiente. Se comprobó visualmente el texto de auto-fire tras un disparo temprano y no se capturaron errores ni warnings de consola. El juego siguió disparando y ejecutando dash sin alterar sus cooldowns.

Las páginas temporales de comprobación se retiraron y no forman parte de la entrega. Estas verificaciones funcionales y visuales no equivalen a una partida humana completa ni certifican por sí solas que todo jugador aprenderá en menos de un minuto. Queda tu valoración subjetiva de claridad y ritmo.

## Checklist de prueba humana

1. Cómo jugar → Repetir tutorial → Volver → Jugar. Debe aparecer MOVERSE sin preguntas ni ventanas.
2. Caminar, detenerse hasta un disparo real y pulsar Espacio. Comprobar mensajes y confirmaciones; tras el dash, dejar jugar.
3. Terminar Sector 01 y recoger el núcleo: desaparece la instrucción y aparecen las cartas habituales.
4. Iniciar otra run: no aparece tutorial. Repetir tutorial desde la ayuda lo recupera.
5. Con tutorial activo, probar pausa/continuar, muerte/Retry, Restart y salir al menú: no se guarda una secuencia incompleta.

Validación reproducible: `npm test`, `npm run check`, `npm run build`, `git diff --check`. No se añaden dependencias, recursos ni cambios de audio o balance.
