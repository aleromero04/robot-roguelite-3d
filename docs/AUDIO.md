# Audio v1 + segunda pasada · 21/10/2026

Primera integración de música y SFX. No cambia Simulation, balance, enemigos, upgrades, layouts ni progresión. Sin dependencias nuevas, commit ni push. Los originales de Downloads permanecen intactos.

## Arquitectura

- `src/audio.ts`: configuración, mezcla, persistencia, cooldowns y presupuesto de voces; independiente del navegador y testeable mediante un backend falso.
- `src/audio-browser.ts`: un AudioContext, buses MUSIC/SFX, master con mute y compresor suave, **un único HTMLAudioElement** para música en streaming y 18 AudioBuffer compartidos para SFX. Cada efecto crea un BufferSource y un Gain de corta vida; ambos se desconectan al terminar o cancelar.
- `src/audio-events.ts`: adaptador de solo lectura de los eventos existentes de Simulation. Detecta los cambios de estado del Boss para los avisos de Charge, incluida la segunda carga. No añade eventos ni modifica la simulación.
- `src/audio-controls.ts`: conecta el panel AUDIO con el mezclador y localStorage; captura teclado del panel para que flechas/espacio no muevan al Player ni activen dash.
- `src/game.ts`: integra el adaptador antes de consumir/limpiar los eventos visuales; conecta Start, upgrade, pausa, reinicio y salida de página. El diagnóstico `?debug=1` muestra pista, playhead, buffers, voces, fallos y ajustes.

No hay reproducción ni AudioContext antes de una interacción. Start/Reanudar y los controles llaman a unlock desde el gesto real. Los 18 SFX se descargan/decodifican una vez por instancia tras ese gesto. Los efectos aún no cargados se descartan: nunca quedan en una cola que suene tarde. Un bloqueo de autoplay se captura y puede reintentarse con el siguiente gesto. Los fallos no detienen el juego y se avisan una sola vez por recurso.

Máximo **12 voces SFX**, más la música; límites adicionales de 1–3 por efecto y cooldowns por evento. Los avisos importantes pueden sustituir una voz de menor prioridad. Una corona Radial emite un único sonido, no uno por bala. Los impactos múltiples se agrupan mediante cooldown de 55 ms; las muertes sustituyen su impacto del mismo paso. No se sonorizan los ticks de Burn ni los impactos de un Burrower oculto.

Los sonidos repetidos tienen variación de playback rate de ±1–2,5%, con una reducción de volumen de hasta ese mismo porcentaje. Los avisos importantes tienen tono estable. Los rates distintos de lanzamiento, salida, Charge o muerte son variantes fijas del mismo recurso, no variaciones aleatorias grandes.

## Estados

| Estado | Música y efectos |
| --- | --- |
| Ready | Silencio. Abrir controles desbloquea el motor, pero no inicia una pista. |
| Start / S01–06 | Brute Force en loop. Cambiar de sector no cambia el src ni reinicia su playhead. |
| Cleared / viaje | Continúa la pista. Se oyen peligros residuales que aún existen y la transición de puerta. |
| Core / cartas | Cue de recogida; se limpian voces de combate y se ignoran eventos residuales. Música al 65% de su mezcla normal, sin reiniciarse. |
| Elegir upgrade | Confirmación y apertura de puerta; vuelve el nivel habitual de música. |
| Entrada física S07 | El adaptador espera wave 6 y Boss existente, estados que Simulation establece al cruzar completamente la puerta. Fade-out de 120 ms, cambio a Fast Fight y fade-in de 150 ms. Un solo elemento impide solapamiento de pistas. |
| Phase 2 | Cue exclusivo de transición, una vez por evento. La música Boss continúa. |
| Pause / blur / pestaña oculta | Música pausada conservando posición; SFX activos cancelados. Reanudar continúa la pista sin crear otro reproductor. |
| Game Over | Música detenida y descargada del elemento; se cancelan efectos anteriores y suena una sola destrucción de robot; muerte y pantalla comparten el mismo estado. |
| Boss death / ending / Victory | Música detenida; cue de destrucción. Al confirmarse Victory suena una confirmación breve, sin recortar la cola de destrucción ni añadir combate residual. |
| Restart | Cancela voces/fades/cooldowns previos y vuelve a Brute Force desde el principio; reutiliza buffers y contexto. Conserva preferencias. |
| Salir de página | Abort de cargas pendientes, limpieza de fuentes y cierre de contexto. Si se conserva en bfcache, queda pausado. |

No existe un flujo independiente de volver al menú en esta versión; se mantienen los botones originales Start/Reanudar/Restart.

## Controles y mezcla

Panel **AUDIO**, esquina inferior izquierda, por encima de la vida. Incluye mute, Música y Efectos. Al abrirlo durante la run, se pausa la simulación y el audio. Cerrar el panel no reanuda accidentalmente: utiliza Reanudar o Escape una vez fuera del panel. Dentro del panel, Escape lo cierra primero.

Valores iniciales: **Music 35%, SFX 70%, muted false**. Persistencia en `protocol-zero.audio.v1`. Valores corruptos, no finitos o fuera de rango se validan; localStorage bloqueado/lleno no rompe el juego. Mute conserva ambos sliders. Durante pausa no se reproduce una preescucha; para juzgar la mezcla hay que reanudar.

Se midieron duración, canales, pico y RMS de PCM temporal decodificado con `afconvert`. Ningún SFX elegido presenta muestras saturadas en esa inspección. No son medidas LUFS ni una evaluación auditiva humana.

Brute Force mide aproximadamente −12,9 dBFS RMS y Fast Fight −9,1 dBFS RMS. Por ello se aplican trims internos **0,32 / 0,23**, además del slider de música. A 35%, sus niveles medios estimados son aproximadamente −31,9 / −31,0 dBFS antes del master. Los SFX importantes sobresalen; el disparo no usa el nivel máximo. Un compresor común suave limita acumulaciones; no sustituye los límites de voces.

Las ganancias individuales y cooldowns están centralizados en `SFX`. No se normalizan ni modifican los archivos OGG originales; las ganancias se aplican al reproducir.

## Recursos y licencias

### Música

Las URLs se recuperaron de los metadatos de descarga `kMDItemWhereFroms`; autoría/licencia se contrastaron con las páginas de OpenGameArt.

| Archivo del proyecto | Recurso / fuente | Licencia | Formato / duración / tamaño |
| --- | --- | --- | --- |
| `public/audio/music/brute_force_loop.mp3` | [Brute Force — Vitalezzz](https://opengameart.org/content/brute-force) | CC0 | MP3, 44,1 kHz estéreo, 320 kbps, 148,402 s; 5.936.135 bytes. Copia idéntica. |
| `public/audio/music/fight_looped.m4a` | [Fast fight / battle music (looped)](https://opengameart.org/content/fast-fight-battle-music-looped), loop publicado por XCVG del tema de Ville Nousiainen | CC0 | AAC/M4A, 44,1 kHz estéreo, objetivo 192 kbps, 24,765 s; 592.013 bytes. |

**Diferencia respecto al encargo:** la descarga real del Boss es `fight_looped.wav` (4.368.690 bytes), no un MP3. Se creó una copia AAC/M4A usando el conversor incluido en macOS, sin instalar dependencias, recortar ni cambiar tempo. El contenedor conserva 1.092.136 frames válidos y la información de priming. Se evita incorporar el WAV grande y se conserva la versión loop elegida. Comando usado:

```sh
afconvert ~/Downloads/fight_looped.wav /tmp/protocol-zero-boss.m4a -f m4af -d aac -b 192000
```

### SFX

Los tres packs son **Kenney Sci-Fi Sounds 1.0**, **Kenney Impact Sounds 1.0** y **Kenney Interface Sounds 1.0**, CC0, creados/distribuidos por Kenney según sus `License.txt`. Se conservan copias de esas licencias en `docs/audio-licenses/`. Sus textos incluyen `www.kenney.nl`; no se inventan URLs individuales de descarga de los packs.

Todos los archivos siguientes están en `public/audio/sfx/`, son OGG Vorbis a 44,1 kHz y son copias idénticas de los candidatos indicados. RMS en dBFS antes de la mezcla:

| Archivo | Pack Kenney | Nombre original | Duración | RMS |
| --- | --- | --- | ---: | ---: |
| `player_shot.ogg` | sci-fi | `laserSmall_000.ogg` | 0.239 s | -22.4 |
| `enemy_shot.ogg` | sci-fi | `laserSmall_003.ogg` | 0.3 s | -23.7 |
| `hit_enemy.ogg` | impact | `impactMetal_medium_002.ogg` | 0.119 s | -31.4 |
| `player_hurt.ogg` | sci-fi | `impactMetal_004.ogg` | 0.39 s | -21.2 |
| `dash.ogg` | interface | `open_001.ogg` | 0.148 s | -14.8 |
| `enemy_death.ogg` | sci-fi | `explosionCrunch_000.ogg` | 0.777 s | -13.8 |
| `grenade_explosion.ogg` | sci-fi | `lowFrequency_explosion_001.ogg` | 1.0 s | -15.6 |
| `burrow.ogg` | impact | `impactMining_002.ogg` | 0.805 s | -22.9 |
| `shield.ogg` | sci-fi | `forceField_000.ogg` | 0.954 s | -11.5 |
| `reward_pickup.ogg` | interface | `confirmation_002.ogg` | 0.539 s | -14.9 |
| `upgrade_select.ogg` | interface | `confirmation_001.ogg` | 0.29 s | -11.3 |
| `door_open.ogg` | sci-fi | `doorOpen_000.ogg` | 0.532 s | -17.6 |
| `ui_click.ogg` | interface | `select_003.ogg` | 0.383 s | -18.8 |
| `boss_attack.ogg` | sci-fi | `laserLarge_000.ogg` | 0.677 s | -17.2 |
| `boss_phase2.ogg` | sci-fi | `forceField_003.ogg` | 0.956 s | -11.6 |
| `shock.ogg` | sci-fi | `forceField_002.ogg` | 0.955 s | -11.6 |
| `player_death.ogg` | sci-fi | `explosionCrunch_001.ogg` | 1.357 s | -12.0 |
| `victory.ogg` | interface | `confirmation_004.ogg` | 0.490 s | -11.8 |

| Evento existente | Archivo / variante | Gain individual |
| --- | --- | ---: |
| Disparo Player, incluido Rapid/Triple | player_shot; una voz por evento de disparo, no por cada proyectil Triple | 0,45 |
| Shooter disparando | enemy_shot | 0,55 |
| Impacto contra enemigo/Boss | hit_enemy; omite ticks Burn e impacto redundante de muerte | 1,10 |
| Player recibe daño | player_hurt | 0,90 |
| Dash | dash | 0,50 |
| Muerte de enemigo | enemy_death | 0,26 |
| Grenadier lanza | boss_attack a rate 0,85 | 0,25 |
| Granada explota | grenade_explosion | 0,50 |
| Burrower se entierra / emerge | burrow a rate 0,90 / 1,08 | 0,32 / 0,48 |
| Shield bloquea y se consume | shield a rate 1,10 | 0,62 |
| Revive | shield, conserva su mezcla anterior | 0,40 |
| Shock activa cadena | shock a rate 1,30; agrupa los eslabones del paso | 0,34 |
| Flame aplica / renueva Burn | enemy_death a rate 1,35 ±1,5%; sin audio en ticks | 0,20 |
| Recoger núcleo | reward_pickup | 0,50 |
| Seleccionar upgrade | upgrade_select | 0,40 |
| Abrir puerta / cruzar sector | door_open | 0,32 |
| Start / Reanudar / Restart | ui_click | 0,30 |
| Boss Radial / Split | boss_attack, cooldown agrupa una corona | 0,40 |
| Aviso de Charge, incluido segundo | boss_attack a rate 0,75 | 0,48 |
| Boss Phase 2 | boss_phase2 a rate 0,85 | 0,55 |
| Muerte Boss | grenade_explosion a rate 0,85 | 0,80 |
| Player muere / Game Over | player_death a rate 0,90; una vez al entrar en dead | 0,65 |
| Victory confirmada | victory a rate 0,90; una vez en ending → complete | 0,65 |

El gain individual se multiplica por el slider SFX; no es un porcentaje de loudness percibido.

**Descartes relevantes:** `computerNoise_*`, `engine*`, `spaceEngine*` y `thrusterFire_*` duran 5 s y añadirían demasiadas colas para efectos repetidos. Las explosiones Crunch 001–004 duran 1,26–1,98 s: se eligió la 000 de 0,777 s para muertes frecuentes. `click_001` resultó demasiado débil (pico −38,8/RMS −52,6 dBFS); se sustituyó por `select_003`. `impactMetal_heavy_001` de Impact tenía RMS −33,0 dBFS y un ataque muy breve para señalar daño importante; se eligió `impactMetal_004` de Sci-Fi, RMS −21,2. Los láseres Retro se descartaron en favor de Small/Large para mantener una familia sonora más homogénea. No se incorporan archivos descartados.

**Tamaño:** 18 SFX = **304.147 bytes**. Dos músicas + SFX = **6.832.295 bytes**, aproximadamente **6,83 MB / 6,52 MiB**. Los SFX decodificados ocupan aproximadamente 2,36 MB de PCM Float32 a 44,1 kHz, algo más si el dispositivo trabaja a 48 kHz. Las músicas se reproducen en streaming y no se decodifican completas a buffers del juego.

## Verificación y límites

Primera integración: baseline **177/177**; final **204/204**. Los 27 tests nuevos cubren política, persistencia, limitación, eventos, buffers y lifecycle del backend, usando dobles de las APIs de navegador. Los tests comprueban estados y limpieza, no que un altavoz emita sonido ni la calidad subjetiva de la mezcla.

En la primera integración, `npm test`, `npm run check`, `npm run build` y `git diff --check`: correctos. El repo continúa sin archivos bajo seguimiento, por lo que se comparó además contra una copia previa: **55 archivos existentes intactos** y solo cuatro existentes modificados (`game.ts`, `style.css`, `index.html`, `README.md`). Se verificó whitespace también en archivos nuevos y que el build contiene los 17 audios con el mismo contenido.

Chrome: bloqueo inicial sin gesto; carga/decodificación de 15 SFX; continuidad entre sectores normales; pista Boss en loop, Phase 2 una sola vez, Victory/Game Over y reinicios; pausa, sliders y persistencia tras recargar. Los escenarios avanzados usaron un montaje temporal con invulnerabilidad y acceso a sectores, ya eliminado. Se corrigió una guarda de ese montaje al intentar activar P2 sin Boss tras recargar; no afectaba al juego. La comprobación final de la página normal no mostró warnings ni errores de consola. No se ha completado una run humana auditiva.

**Archivos nuevos de la primera integración:** `src/audio.ts`, `src/audio-browser.ts`, `src/audio-events.ts`, `src/audio-controls.ts`, `tests/audio.test.ts`, `tests/audio-browser.test.ts`, este documento, tres licencias y los 17 audios listados.

El playtest de mezcla con altavoces/auriculares sigue siendo necesario. Puede omitirse algún SFX durante su primera descarga; no se bloquea el combate esperando audio. El primer click de Start puede no oírse si todavía no se ha decodificado su buffer. OGG Vorbis y AAC/MP3 se han elegido para Chrome de escritorio; no se promete compatibilidad con navegadores antiguos ni loop sample-perfect con HTMLAudioElement. No hay espacialización/panning en esta primera versión.

Checklist breve:

1. Start: música normal y disparo/impacto/daño/dash con niveles cómodos; escucha varias ráfagas Rapid.
2. Core/cartas y S01–06: continuidad de música; recogida, selección y puerta claras.
3. S07/P2: cambio de pista sin dos músicas; avisos de carga, coronas/Split y Phase 2 distinguibles.
4. AUDIO: mute, sliders, recarga con valores persistidos y flechas sin mover al Player. Reanuda para oír la mezcla.
5. Pausa/otra pestaña: silencio; Reanudar continúa desde la misma posición.
6. Game Over/Victory y Restart: final coherente; nueva música normal desde el principio sin voces antiguas.

## Segunda pasada pequeña: Shield, Shock, Flame y finales

Solo cambian el manifiesto SFX, el adaptador de eventos, sus tests y esta documentación/README. No se modifica Simulation, gameplay, balance, VFX, música, volumen global ni dependencias. No se añade el rearmado opcional de Shield.

Se incorporan únicamente tres copias OGG desde los ZIP locales de Kenney: `shock.ogg` (27.647 bytes), `player_death.ogg` (47.916 bytes) y `victory.ogg` (12.391 bytes), **87.954 bytes adicionales**. La tabla de recursos conserva sus nombres originales y packs; las licencias ya existentes cubren estas incorporaciones. La explosión Crunch 001, descartada para muertes frecuentes, se utiliza ahora para el final excepcional del Player.

| Evento | Gain | Playback rate | Cooldown | Voces máximas / prioridad |
| --- | ---: | ---: | ---: | --- |
| Shield block | 0,62 | 1,10 | 180 ms | 1 / 4 |
| Shock | 0,34 | 1,30 | 120 ms | 1 / 2 |
| Flame impact | 0,20 | 1,35 ±1,5% | 90 ms | 2 / 1 |
| Muerte / Game Over | 0,65 | 0,90 | 500 ms | 1 / 4 |
| Victory | 0,65 | 0,90 | 500 ms | 1 / 4 |

Shield reutiliza su archivo y conexión existentes con más presencia y prioridad. Revive conserva la mezcla anterior mediante su propia entrada lógica, sin duplicar buffers. Flame reutiliza Crunch 000 más rápido y suave. Shock se emite solo si existen eventos reales de descarga; todos los eslabones del paso se agrupan en una reproducción, incluidas activaciones simultáneas, y el cooldown limita las muy próximas. Los impactos normales no lo disparan. Flame sigue el evento de aplicación/refresh; los ticks Burn no añaden audio.

Muerte y Game Over aparecen en el mismo estado, por lo que se usa una única destrucción de aproximadamente 1,51 s. Victory utiliza un recurso distinto de pickup, upgrade y UI, de aproximadamente 0,54 s al rate elegido; se reproduce tras los 0,9 s existentes de `ending`, sin modificar esa secuencia ni cortar la destrucción del Boss.

Verificación de esta pasada: **204/204 antes → 211/211 después**. Los siete tests nuevos incluyen impactos reales en Simulation: bloqueo sin perder HP, activación de Shock y cadena agrupada, ausencia de Shock sin objetivo secundario, aplicación/refresh de Flame y ticks silenciosos, impactos simultáneos y pantallas seguras, muerte única/reinicio y Victory diferida/única/reinicio. Se actualizan además las expectativas de carga a 18 buffers.

`npm test`, `npm run check` (TypeScript estricto), `npm run build` y `git diff --check`: correctos. Como todo el repositorio sigue untracked, se compara también con la copia previa: **78 archivos existentes intactos**, seis modificados (dos módulos de audio, dos tests, README y este documento), tres OGG nuevos y ningún archivo eliminado. Los 20 archivos de audio del build coinciden byte a byte con `public/audio/`; las tres incorporaciones coinciden con los originales Kenney extraídos. Se revisa whitespace en los archivos modificados y se eliminan los montajes temporales.

Chrome, con escenarios controlados de impactos reales: 18 buffers cargados sin fallos; Shield una vez con HP intacto; Shock una vez para varios objetivos; Flame una vez y ningún incremento al terminar Burn; muerte única incluso esperando en Game Over y nueva reproducción tras Restart; destrucción del Boss seguida de Victory una sola vez. La prueba usa un montaje temporal para provocar esos escenarios, no una run humana completa. Se corrigió una configuración de puertas de ese montaje antes de verificarlo; no era un error del juego. El montaje verificado y la página normal no mostraron warnings ni errores de consola. La calidad perceptiva de la mezcla sigue pendiente de escucha humana.

Checklist de esta pasada:

1. Recibir un golpe con Shield: escuchar un único bloqueo y conservar HP; repetir en otro sector tras el rearmado normal.
2. Activar Shock con varios objetivos: una descarga por activación, ninguna en impactos normales.
3. Aplicar/renovar Flame: ignición breve; esperar los ticks sin nuevos sonidos y probar varios impactos próximos.
4. Morir: destrucción una sola vez; esperar en Game Over y reiniciar para comprobar que vuelve a funcionar.
5. Derrotar al Boss: conservar su explosión y escuchar la confirmación al llegar a Victory; reiniciar sin colas antiguas.
