# CORE//07 · System Breach Protocol

Versión 3D candidata a principal: seis combates normales y un Boss final, conectados físicamente en la misma instalación. TypeScript + Vite + Three.js; arte visual procedural y audio CC0 local, sin nuevas dependencias. Se conservan cámara 3/4, robots, materiales, iluminación, VFX y controles.

Balance actual y comparación antes/después: [BALANCE.md](BALANCE.md). Audio v1 y segunda pasada, recursos, licencias, mezcla y checklist: [docs/AUDIO.md](docs/AUDIO.md). UX v1 y flujo de usuario: [docs/UX.md](docs/UX.md). Onboarding integrado y checklist: [docs/TUTORIAL.md](docs/TUTORIAL.md).

## Ejecutar y verificar

Node.js **22.18+** (o 24/26) y npm:

```sh
npm install
npm run dev
```

Abre **http://127.0.0.1:5173/robot-roguelite-3d/** o la URL indicada por Vite.

```sh
npm test
npm run check
npm run build
npm run preview
```

El destino inicial es **GitHub Pages**, con base `/robot-roguelite-3d/` y URL prevista
**https://aleromero04.github.io/robot-roguelite-3d/**. `npm run build` genera `dist/`;
`npm run preview` permite comprobarlo en **http://127.0.0.1:4173/robot-roguelite-3d/**
(o el puerto indicado). Verifica desde esa subruta el menú, Play y el audio, sin errores 404.
Vite aplica la base a JS/CSS y el audio utiliza `import.meta.env.BASE_URL` para música y SFX.
El aviso MIT de Three.js está en [public/THIRD_PARTY_LICENSES.txt](public/THIRD_PARTY_LICENSES.txt)
y se copia automáticamente a `dist/THIRD_PARTY_LICENSES.txt`. Al actualizar Three.js,
revisa el aviso frente a `node_modules/three/LICENSE`.

`?debug=1` muestra FPS, llamadas de dibujo y una instantánea de solo lectura en `#diagnostics[data-state]`: pantalla UX, estado, sector, enemigos, proyectiles, upgrades, apariciones pendientes, salas residentes, geometrías, texturas y estado del audio. No incorpora saltos de sector ni trampas.

## UX v1

El juego abre un menú sobre la instalación 3D: **JUGAR**, **CÓMO JUGAR** y **AJUSTES**. La sala y el robot son ambientales; no se ejecuta una run detrás. JUGAR inicia Sector 01 con un fundido de 360 ms.

**Escape** pausa y ofrece Continuar, Ajustes, Reiniciar run y Menú principal. Reiniciar/salir desde pausa exige confirmación; cancelar conserva la run. Escape vuelve un nivel desde Ajustes, ayuda o confirmaciones. Game Over y Victory ofrecen nueva run o menú. Ajustes reutiliza Audio v1 (música, SFX y mute persistentes); su antigua pestaña flotante se sustituye por este panel compartido. El HUD se oculta durante menús y finales.

CORE//07 es la identidad visible; nombre de paquete, repositorio y claves de almacenamiento permanecen iguales. Documentación de arquitectura, verificación visual y límites: [docs/UX.md](docs/UX.md).

La primera run enseña movimiento, detenerse para disparar, dash y recogida del núcleo en Sector 01 mediante acciones reales, sin pausar el combate. Al completar toda la secuencia se recuerda localmente. **CÓMO JUGAR → REPETIR TUTORIAL** lo reactiva para la próxima run sin borrar ajustes de audio.

## Controles y recorrido

- **WASD / flechas:** movimiento relativo a pantalla, diagonal normalizada.
- **Detenerse:** autoataque al enemigo vivo más cercano en XZ. Intentar moverse, incluso contra una pared, cancela disparos nuevos y ráfagas pendientes. Las balas ya emitidas continúan.
- **Espacio:** impulso en la última dirección. No permite disparar durante el desplazamiento.
- **Esc / perder el foco:** pausa. No avanza combate, ráfagas ni avisos de spawn; las ofertas no se vuelven a sortear.
- **Tarjetas:** ratón o Tab + Enter/Espacio para instalar una de las tres mejoras ofrecidas.
- **AUDIO:** panel inferior izquierdo con mute y volúmenes independientes; abrirlo durante la run pausa el juego. Valores iniciales 35% música / 70% efectos, guardados localmente. Cierra el panel y reanuda para escuchar los cambios.

Flujo: combate → eliminar todos los enemigos y refuerzos pendientes → **cleared, con control y peligros residuales** → recoger núcleo físico → tres tarjetas protegidas → elegir una mejora → abrir puerta → cruzar físicamente → siguiente sector. La puerta anterior se sella cuando ha entrado el cuerpo completo. No hay teleport, cuenta atrás ni pantalla de carga.

Tras la mejora del Sector 06, la sexta compuerta abre el acceso físico al **Sector 07**. No da Victory: el Boss tiene que morir. El umbral de entrada final pasa de 21 a 22,5 u desde el centro de 06, igual que las demás entradas, para sellar solo con el cuerpo dentro de 07. Se conserva el mecanismo y la geometría de las seis compuertas. No hay puerta posterior ni Sector 08. Reiniciar restaura stats, mejoras, ofertas, proyectiles, granadas/fuego/suelo, ráfagas, grupos, Boss, quemaduras, Frost, contador Shock, carga Overdrive, escudo, Revive, feedback, núcleo y puertas.

## Composición y arenas

| Sector | Basic | Runner | Shooter | Grenadier | Burrower | Grupos | Arena |
| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| 01 | 3 | 0 | 0 | 0 | 0 | 3 | Abierta, tutorial |
| 02 | 2 | 2 | 0 | 0 | 0 | 4 | Carriles + dos zonas de suelo |
| 03 | 2 | 2 | 2 | 0 | 0 | 6 | Reactor central, introducción ranged |
| 04 | 2 | 1 | 2 | 1 | 0 | 6 | Abierta reflejada, control de espacio |
| 05 | 1 | 2 | 2 | 1 | 2 | 5 + 3 | Carriles reflejados, reposicionamiento |
| 06 | 2 | 2 | 2 | 2 | 2 | 6 + 4 | Núcleo central reflejado, cinco tipos |

Sector 07: Boss de **1600 HP**, sin refuerzos ni hazards nuevos. Phase 1 conserva sus patrones; Phase 2 añade Double Charge y mayor presión. Daño y tiempos actuales en [BALANCE.md](BALANCE.md).

Total: **37 enemigos normales + 1 Boss**. Grupo inicial de 05: 1 Basic + 1 Runner + 1 Shooter + 1 Grenadier + 1 Burrower; refuerzo: 1 Burrower + 1 Runner + 1 Shooter. Inicial de 06: 2 Basic + 1 Runner + 1 Shooter + 1 Grenadier + 1 Burrower; refuerzo: 1 Burrower + 1 Runner + 1 Shooter + 1 Grenadier.

Refuerzos cuando quedan **como máximo dos** enemigos vivos/anunciados y han transcurrido **al menos cuatro segundos**. Máximo **siete enemigos vivos/avisos de spawn + granadas/fuegos**: tanto lanzar como programar refuerzos reserva ese presupuesto. Estas composiciones tienen como máximo seis enemigos vivos/anunciados a la vez; el fuego puede retrasar refuerzos. Sector 02 añade dos zonas fijas a sus cuatro enemigos (seis amenazas). El aviso de salida de Burrower cuenta como su propio enemigo, no duplica plaza; las balas no cuentan como enemigos. Si falta capacidad o espacio seguro, se reintenta cada 250 ms. Spawn conserva 650 ms de aviso y 180 ms de desvanecimiento. No se abren puertas ni tarjetas entre grupos.

Cada sala mide aproximadamente 30 × 22 unidades; centros separados 36 unidades. Se reutilizan tres distribuciones, con obstáculos y candidatos reflejados conjuntamente para 04–06. La colisión del reactor es una caja conservadora de 4,4 × 4,4 unidades. No hay generación procedural compleja.

El antiguo **SECTOR 09** procedía de literales en `index.html` y del desplazamiento `9 + índice` en UI y texturas Canvas del suelo/cartel. Ahora `sectorNumber()` genera 01–07 en todos ellos, incluido el título de la pestaña. El HUD cambia al cruzar completamente a la siguiente sala. El número del suelo de las salas centrales está delante del reactor para no quedar bajo él.

## Stats constantes durante la run

`src/stats.ts` centraliza el balance actual; los stats base no escalan por sector. Los upgrades conservan sus modifiers.

| Unidad | HP | Daño | Velocidad | Ataque |
| --- | ---: | ---: | ---: | --- |
| Player | 80 | 10 | 7,182 u/s | 0,35 s entre ataques, solo quieto |
| Basic | 48 | 15 | 2,431 u/s | Preparación 0,45 s; recuperación 0,70 s |
| Runner | 42 | 20 | 3,888 u/s | Aviso 0,75 s; dash 14,5 u/s durante 0,55 s; recuperación 1,20 s |
| Shooter | 45 | 13 | 2,53 u/s | Apuntado 0,60 s; recuperación 1,65 s |
| Grenadier | 48 | 15 explosión / 5 tick | 2,2 u/s | Alcance 42 u; distancia preferida 16–36 u; preparación 0,55 s; recuperación 3,6 s |
| Burrower | 44 | 18 salida | 2,99 u/s | Primer burrow a 2 s, luego activo 3 s; enterrado/aviso descritos abajo |

Player: radio 0,48; invulnerabilidad 0,85 s tras daño; impulso 21 u/s durante 0,18 s, recarga 1,65 s e invulnerabilidad 0,28 s. Turbo modifica caminar, no el impulso. Basic puede fallar su melee; ahora su contacto corporal hace 10 HP sin sustituir el ataque de 15 HP. Runner fija la trayectoria al anunciarla y solo golpea una vez por dash. Shooter se acerca por encima de 8 u, retrocede por debajo de 5 u y se detiene para apuntar.

Balas: Player 25 u/s y 1,10 s de vida; Shooter 9,72 u/s y 4 s. Cada bala guarda su daño y propiedades: no depende de que su emisor siga vivo.
## Enemigos nuevos y peligros de suelo

- **Grenadier:** adquisición/lanzamiento a **≤42 u**, preparación **0,55 s**, recuperación **3,6 s**. Durante recuperación intenta conservar **16–36 u** de distancia mediante navegación local. Puede lanzar sobre cobertura: valida destino, lo fija durante preparación y muestra siempre aviso al lanzar. Predicción de 0,30 s limitada a 1,6 u. Si el Player se acerca, se retira durante recovery pero vuelve a lanzar cuando hay una oportunidad válida. Radio corporal 0,55 u, contacto 10 HP. Modelo pesado con depósitos y mortero elevado.
- **Granada:** arco visual, aviso de suelo **0,95 s**, radio **1,7 u**, explosión única **15 HP**. Fuego **3,5 s**, **5 HP cada 0,5 s** (siete oportunidades de tick), con i-frames normales de 0,85 s: no todos los ticks causan pérdida de HP si permaneces dentro. Radio de daño medido al centro del Player, igual al aro visible. Zona roja/naranja pulsante y núcleo térmico. No colisiona como una bala ni desaparece con su emisor.
- **Capacidad térmica:** máximo **una zona por emisor y dos globales**, contando vuelo y fuego; también sujeto al presupuesto agregado de siete amenazas. Centros separados ≥3,9 u; el disco debe caber dentro de la arena sin invadir obstáculos. Como máximo unos 18,2 u² de fuego, alrededor del 3,2% del rectángulo jugable; se conserva espacio para rodear y usar dash. Si no hay destino válido, espera.
- **Burrower:** CHASE inicial **2 s**, después **3 s** → WINDUP **0,45 s** → UNDERGROUND **0,6 s** → EMERGENCE TELEGRAPH **0,9 s** → una salida → CHASE **3 s**. Radio corporal 0,5 u, contacto activo **10 HP**. Cuerpo bajo, cuatro garras y taladro; se hunde, deja rastro/montículo y partículas al entrar/salir. Oculta robot y barra bajo tierra, pero conserva el aviso independiente del suelo.
- **Salida:** predicción de 0,20 s limitada a 1,2 u, destino a **2,2–6 u** de la posición del Player al elegirlo; radio libre de geometría 0,65 u, distancia ≥1,5 u a otros cuerpos activos. Si no cabe, permanece visible y reintenta tras 1 s. AoE circular de **1,6 u**, **18 HP una vez**, con prioridad sobre contacto incluso si Shield lo absorbe. Durante underground y aviso de salida no bloquea ni hace contacto, y queda fuera de autoaim/proyectiles/Homing/Piercing/Ricochet. Una quemadura aplicada previamente sigue su ciclo: se conservan sus tres ticks y su daño. Los VFX del cuerpo se ocultan bajo tierra y durante emergence; vuelven al estar activo si todavía queda Burn o fade.
- **Shooter:** elige DIRECT o LEAD al iniciar apuntado. LEAD = posición + velocidad real actual × **0,28 s**, desplazamiento limitado a **1,7 u**. Probabilidades: 03 **10%**, 04 **20%**, 05 **30%**, 06 **38%**. Velocidad de bala **9,72 u/s**, daño **13** y cooldowns intactos. Tras emitir conserva dirección fija; el lead no cambia la navegación del Shooter.
- **Suelo 02:** dos discos de radio **1,35 u**. Al empezar cada warning eligen entre **13 posiciones válidas** del layout, excluyendo su posición anterior y puntos a menos de 3,5 u del otro hazard. Márgenes laterales de 3 u y disco completo libre de obstáculos. Primera espera 2 y 5,45 s; WARNING **1 s** ámbar → ACTIVE **1,7 s** rojo → COOLDOWN **4,2 s**. Daño **6 HP cada 0,5 s**, tres oportunidades por activación, sujeto a i-frames/Shield. Recolocar nunca hace daño instantáneo. Selección aleatoria inyectable, sin secuencia fija ni crecimiento de área. Ningún otro sector genera estos hazards.

Todos los daños nuevos pasan por la resolución común: dash/i-frames, **Shield un uso por sector** y Revive. Tras clear no hay nuevos ataques ni ciclos de suelo; un suelo ya activo termina, una advertencia se cancela, y las granadas/fuegos emitidos completan su vida. El núcleo sigue siendo físico y las tarjetas protegen desde el mismo paso de recogida. Pausa congela los timers; reiniciar borra peligros y libera sus recursos visuales.


## Pool de upgrades

Cada selección ofrece **tres mejoras diferentes**. Para cada hueco, sortea primero una rareza entre categorías con candidatos y peso positivo, luego una mejora uniforme dentro de esa rareza; la retira de esa oferta y recalcula las categorías del siguiente hueco. La oferta se guarda hasta elegir; pausa y refrescos de UI no cambian sus opciones. Solo se acepta una opción efectivamente ofrecida. Pesos centralizados en `RARITY_WEIGHTS`: **COMMON 60, RARE 27, EPIC 10, LEGENDARY 3**. Al agotarse una categoría se renormalizan las restantes; el número de mejoras de cada categoría no multiplica su peso. Son pesos por extracción, no porcentajes garantizados por pantalla.

| Upgrade | Rareza | Disponibilidad | Efecto |
| --- | --- | --- | --- |
| Power Core | COMMON | Repetible | Daño ×1,25 |
| Overclock | COMMON | Repetible | Intervalo de ataque ×0,85 |
| Turbo | COMMON | Repetible | Velocidad al caminar ×1,10 |
| Reinforced Chassis | COMMON | Repetible | +20 HP máximos y cura 20 HP |
| Repair | COMMON | Repetible | Cura 30 HP, limitado por el máximo actual |
| Piercing Shot | RARE | Único | Una penetración adicional por proyectil |
| Ricochet | RARE | Único | Un rebote por proyectil |
| Rapid Shot | RARE | Único | Dos disparos escalonados por ataque |
| Flame Shot | RARE | Único | Quemadura: tres ticks del 20% del daño del proyectil |
| Shock Shot | RARE | Único | Cada tres impactos reales, hasta dos saltos al 40% de daño |
| Homing Shot | EPIC | Único | Asistencia de giro moderada |
| Energy Shield | EPIC | Único | Absorbe un impacto por sector; se rearma al cruzar al siguiente |
| Power Trio | EPIC | Único | Daño ×1,20, caminar ×1,10, intervalo ×0,90 |
| Frost Shot | EPIC | Único | Locomoción normal ×0,80 durante 1,5 s, refrescable |
| Revive | LEGENDARY | Único | Una resurrección con 40% de HP máximo |
| Triple Shot | LEGENDARY | Único | Tres proyectiles simultáneos a −10°/0°/+10° |
| Overdrive | LEGENDARY | Único | Tras 1 s quieto: daño ×1,25 e intervalo ×0,80 |

**17 upgrades: 5 Common, 5 Rare, 4 Epic y 3 Legendary; 12 únicos y 5 repetibles.**

Las tarjetas usan verde (Common), azul (Rare), morado (Epic) y dorado (Legendary) en borde, glow, icono, nombre, valor y etiqueta explícita.

Valores centralizados en `UPGRADE_VALUES`, en `src/upgrades.ts`. Los únicos adquiridos salen del pool; los cinco repetibles siempre siguen elegibles, incluso Repair con HP completo. No puede agotarse la oferta de tres.

### Comportamiento exacto de proyectiles

- **Piercing:** el primer impacto daña y consume una penetración; el proyectil sigue recto y puede dañar a un segundo enemigo. Un conjunto de IDs impide golpear dos veces al mismo enemigo aunque permanezca dentro de su hitbox.
- **Ricochet:** en un impacto terminal busca al enemigo vivo más cercano a **≤6 u del punto de impacto**, no golpeado anteriormente y con línea libre de obstáculos. Redirige una vez manteniendo velocidad, daño y vida restante. Si no hay candidato válido, desaparece. No rebota contra paredes.
- **Piercing + Ricochet:** primero se consume Piercing sin gastar Ricochet. En el segundo impacto se puede consumir el rebote hacia un tercer enemigo. El tercer impacto termina la bala. No hay cadenas infinitas ni retorno a enemigos ya golpeados.
- **Rapid Shot:** disparo inicial más **un segundo disparo completo a +100 ms**, cuantizados por el paso de 60 Hz. Cada evento busca al enemigo vivo más cercano en ese momento y hereda daño efectivo, Piercing, Ricochet, Homing, Flame, Shock y Frost. Triple genera tres balas simultáneas por evento: **Rapid + Triple = 3 + 3**, con el segundo abanico completo a +100 ms. El cooldown cuenta desde el primer disparo; las ráfagas no se solapan, aunque Overclock reduzca el intervalo por debajo de su duración. Caminar, intentar moverse, iniciar dash, perder todos los objetivos, limpiar sector o morir cancela los disparos pendientes. Pausar los congela. No se recuperan después de moverse; las balas emitidas permanecen.
- **Homing:** busca un objetivo vivo a **≤10 u**, dentro de **±45°** de la dirección actual y con línea libre; prioriza mantener el objetivo válido y, si lo pierde, puede adquirir otro dentro de ese cono. Giro máximo **1,2 rad/s (~69°/s)**, con presupuesto total de corrección de **45° por bala**. Si no existe candidato válido, sigue recto. No aumenta velocidad ni vida. Piercing excluye enemigos ya golpeados; Ricochet fija su nuevo objetivo y conserva el presupuesto restante de Homing. El giro explícito de Ricochet es independiente de la asistencia.

Las colisiones calculan el primer contacto del segmento y ordenan enemigos/coberturas por impacto real, incluso con múltiples contactos dentro de un paso. Los obstáculos siempre bloquean. Los upgrades de disparo nunca se aplican a balas enemigas.

Durante las tarjetas no se mueve ni dispara el Player. Las balas siguen viajando y expirando, pero no causan daño. **La protección empieza en el paso de recogida del núcleo**, antes de resolver impactos, no al matar al último enemigo. Hasta recogerlo conserva movimiento y dash; las balas pueden matarlo normalmente. No se borran ni se altera su dirección/vida al limpiar la sala.

### Las cinco mejoras nuevas

- **Flame Shot:** cada impacto de una bala propia aplica una única quemadura por enemigo/Boss. Tres ticks del 20% del daño almacenado por esa bala, cada 0,5 s. Sin refresh, ticks a 0,5/1/1,5 s. Otro impacto repone los tres ticks y actualiza su daño, conservando el reloj del próximo tick: así Rapid/Triple no posponen el fuego indefinidamente. No hay stacks independientes. Puede matar y completar combate/run; se elimina al morir el objetivo o reiniciar. Balas ámbar; impacto naranja/rojo diferenciado, brasas ascendentes continuas, halo naranja y pulso emisivo cálido de la armadura. Cada tick tiene un burst menor. No cambian daño ni tiempos.
- **Energy Shield:** una carga disponible inmediatamente al adquirirlo. Absorbe por completo un impacto válido de melee/contacto Basic, dash/contacto Runner, contacto/bala Shooter, contacto/explosión/fuego Grenadier, contacto/salida Burrower, suelo y contacto/Charge/bala/fragmento Boss. Al gastarse conserva los **0,85 s** de i-frames normales, evitando perder HP simultáneamente. Pasa a `shieldSpent`, sin temporizador ni recarga por esperar, matar, recoger núcleo, elegir tarjeta o abrir puerta. **Solo `crossExit()` exitoso**, después de cruzar físicamente el umbral con la compuerta abierta, lo rearma y emite `shield-ready`. No acumula cargas; entrar en 07 da una, que no vuelve durante ese Boss. Revive no lo rearma. HUD: **ESCUDO LISTO / ESCUDO GASTADO**; burbuja disponible, ruptura al absorber y pequeño burst cian al entrar en otro sector. Reiniciar borra adquisición/consumo.
- **Revive:** si un golpe válido sería letal, se consume una vez, restaura **40% del máximo actual**, concede **2 s** de invulnerabilidad, pulso dorado de 0,8 s y aviso. No abre Game Over. El adquirido sigue en el conjunto de únicos incluso consumido, por lo que no vuelve a ofrecerse. Una nueva run resetea adquisición y consumo. Shield disponible se resuelve antes que Revive.
- **Power Trio:** multiplicadores propios **×1,20 daño, ×1,10 velocidad al caminar, ×0,90 intervalo de ataque**, centralizados en `UPGRADE_VALUES`. Se combina con Power/Turbo/Overclock sin marcarlos como adquiridos ni modificar dash.
- **Triple Shot:** tres proyectiles simultáneos por evento, a **−10°/0°/+10°**, todos con el daño normal completo y sus propios presupuestos de Piercing/Ricochet/Homing/Flame. Rapid sigue siendo dos eventos, no tres. Movimiento o dash antes del segundo evento cancela sus tres proyectiles pendientes; los tres primeros continúan.

### Shock, Frost y Overdrive

- **Shock Shot:** contador único por run, incrementado solo en la resolución de un impacto real de un proyectil del Player que lleva Shock. Cada tercero mantiene el daño primario y busca hasta **dos objetivos vivos distintos**, sin volver al original. Cada salto busca el más cercano a **≤5,5 u del objetivo anterior**, con línea libre de cobertura; desempate por ID. Cada secundario recibe **40% del daño almacenado del proyectil disparador**. Puede encadenar desde un impacto letal y desde Boss; Boss solo no produce saltos ficticios. Rapid, Triple y cada contacto real de Piercing/Ricochet cuentan; fallos, paredes, ticks de Burn, daño secundario, contacto y hazards no. Los secundarios se resuelven directamente: no crean proyectiles, estados adicionales ni recursión. El contador sobrevive al cambio de sector y se borra en nueva run. Arcos cian brillantes de **150 ms**, con pequeño burst eléctrico.
- **Frost Shot:** cada impacto válido aplica/refresca **1,5 s** a **×0,80 locomoción**, sin sumar intensidad. Basic, Runner, Shooter, Grenadier y Burrower activo consumen el multiplicador en su desplazamiento normal; Boss solo en `approach`. No afecta Runner Dash, Boss Charge, underground, emergence, animaciones de ataque, avisos, cooldowns, granadas ni balas. El reloj sigue siendo tiempo normal de simulación. Bajo tierra expira normalmente, sin nuevos impactos y sin cristales corporales visibles. Tint/emisivo cian y cuatro pequeños cristales permiten leerlo sin ocultar el modelo.
- **Overdrive:** carga durante **1,0 s** sin intención de movimiento ni dash, aunque no exista target. Al activarse, `effectiveAttackStats()` calcula **daño permanente ×1,25** e **intervalo permanente ×0,80** sin modificar `player.stats`. Power Core/Overclock/Power Trio se componen primero por sus multiplicadores habituales: con uno de cada, daño `10 × 1,25 × 1,20 × 1,25 = 18,75` e intervalo `0,35 × 0,85 × 0,90 × 0,80 = 0,2142 s`. No dispara por sí mismo. Rapid conserva dos eventos a 100 ms y Triple tres balas a −10°/0°/+10° por evento. Cada bala almacena los valores efectivos al emitirse. Moverse —también contra una pared— o hacer dash pone carga a cero inmediatamente y conserva la cancelación de Rapid pendiente. Al parar exige otro segundo entero. Anillo ámbar de progreso, anillo/emisivo cian activo y HUD discreto con porcentaje/ACTIVO/CANCELADO. Elegir recompensa, morir y reiniciar limpian carga.

Burn y Frost componen color/emisivo **juntos en cada actualización**, a partir del color base del material. La expiración de uno no restaura sobre el otro. No existe un framework general de estados: `status.ts` resuelve Shock/Frost; `burn.ts` conserva su lógica original; `burn-visuals.ts` mantiene exclusivamente la cola visual.

## Núcleo físico, contacto y daño

Al finalizar los sectores 01–06 aparece un pequeño pedestal metálico con núcleo flotante/rotatorio cian, aro y haz fino; usa materiales procedurales de la instalación. La puerta permanece cerrada hasta elegir tarjeta. Recogida automática a **1,15 u**, sin tecla adicional, con partículas y retirada del objeto.

Cada layout define tres anclas locales: arena abierta `(-4,4), (6,-3), (-10,4)`; carriles `(-7,5), (0,-6), (8,7)`; reactor central `(-6,2), (5,-7), (-5,7)`. En 04–06 se reflejan en X junto a sus layouts. Se usa la primera válida a **≥3 u del Player**, **≥2 u de los límites**, con una huella libre de obstáculos de **0,7 u**. Los tests verifican posiciones y recorrido real hacia todas las anclas. No se cambia geometría ni distribución de obstáculos. Boss no genera núcleo.

`contact.ts` centraliza los cinco enemigos normales activos (**10 HP**) y Boss (**16 HP** fuera de Charge). Primero se resuelven los ataques específicos: melee Basic **15 HP**, dash Runner **20 HP**, salida Burrower **18 HP**, Charge Boss **28 HP**. Si impactan, no se añade contacto; durante dash/Charge se suprime el contacto corporal incluso en el paso de salida de ese estado. Todos respetan i-frames y Shield/Revive.

La detención barrida bloquea caminar/dash contra todos los cuerpos. Si ya hay solapamiento, se permite salir o desplazarse tangencialmente, pero se elimina el movimiento hacia el centro. La corrección de todo el grupo se calcula conjuntamente, limitada a **8 u/s** en total, y solo se acepta si reduce el solapamiento. Evita correcciones contrapuestas sucesivas, respeta paredes y no desplaza enemigos. Los cuerpos detrás del primer bloqueo no cuentan como contacto alcanzado. IA, velocidades y ataques específicos se conservan.

Flame conserva exactamente **3 ticks del 20% del daño de la bala, cada 0,5 s**, y el refresh anterior, sin stacks. El cambio es visual: brasas de mayor tamaño, **2 cada 100 ms** (Boss **4**), escala base normal **1,2**, Shooter multiplicador adicional **1,35**, Burrower **0,8**, Boss **1,85**, y altura adaptada al cuerpo. Impacto mantiene **14 partículas** (Boss **22**) y tick **4** (Boss **7**). Shooter antes iluminaba principalmente una armadura tapada por su carcasa oscura; ahora la carcasa tiene también material propio y recibe calor, con intensidad moderada para conservar la silueta al moverse/apuntar/disparar.

Tras finalizar el daño se conserva una cola visual configurada a **0,5 s**, cuantizada a 1/60 s, que reduce progresivamente emisivo y tamaño de partículas, sin daño ni ticks adicionales. Un nuevo impacto reutiliza el mismo registro por ID y devuelve intensidad completa. Todas las partículas térmicas tienen propietario: muerte, descarga, fin del fade y reinicio las retiran. Bajo tierra y durante emergence se ocultan también los impactos/ticks/brasas corporales ya emitidos; el daño preexistente continúa igual que antes. Los avisos propios de Burrower siguen intactos.

Se reutiliza la malla instanciada global de **320 partículas** y su pool. Shock usa un buffer fijo de hasta **12 arcos**, ocho segmentos por arco, en una sola malla; Frost una malla instanciada de **64 cristales** como máximo. Los buffers/geometrías/materiales de estos efectos se crean una vez y se reutilizan entre runs; no se crean emisores por enemigo. Materiales propios se liberan al descargar el actor. Sin luces, shaders pesados, assets ni dependencias adicionales.

Cada pérdida válida de HP activa: flash blanco/rojo del robot **150 ms**, bordes rojos con caída suave **260 ms**, pequeño desplazamiento de cámara **120 ms** (desplazamiento máximo por eje ±0,06 u, ±0,10 u para Charge), y pulso rojo del HUD **300 ms**. La cámara vuelve a su trayectoria original. El halo cian pulsante conserva la señal de i-frames; el impacto rojo termina antes. Shield absorbido no muestra pérdida de HP ni vignette roja. Un nuevo golpe válido reinicia los tiempos.

## Spawns y navegación

Cada sala normal tiene 16 candidatos. Se barajan y filtran por margen de hitbox 0,65 u, límites, obstáculos, distancia **≥6 u al Player** y separación **≥2 u entre centros**. Primero círculo pulsante **650 ms**, después enemigo con las partículas existentes y desvanecimiento de **180 ms**. Al materializar se vuelve a validar; si se ocupó la posición, se anuncia otra durante el tiempo completo. Si no hay alternativa, espera y reintenta.

La IA conserva evasión local con objetivos en esquinas, sin un sistema de navegación global. Runner comprueba el ancho de su cuerpo antes del dash; Shooter puede desplazarse lateralmente junto al borde. Los nuevos enemigos reutilizan esa navegación local; el Boss mantiene su máquina de estados propia, con pausa y segundo aviso de carga en Phase 2.

## Mundo y recursos

`residentRoomIndices()` mantiene solamente las salas a menos de 50 u del Player: **máximo tres** de las siete. Se preparan antes de alcanzar su umbral visual de 45 u. Las lejanas se retiran de la escena y se liberan sus mallas combinadas, materiales/texturas de etiquetas y buffers de instancias. Al reiniciar se reconstruyen las del comienzo con la misma política.

Las salas comparten primitivas, geometría de baldosas, cristal y aros, paleta, materiales de suelo/maquinaria/reactor y factories. El suelo sigue siendo instanciado y los elementos opacos estáticos siguen combinados por material. Las seis puertas son ligeras y también se ocultan a distancia. Solo la luz direccional original proyecta sombras; las luces locales conservan su aspecto sin añadir sombras.

Revisión de este polish en Chrome con montaje temporal: bloqueo corporal Basic/Runner, melee de 12 y dash de 16, Shield gastado después de 20 s, regeneración al cruzar a 02, escudo gastado tras 180 s de simulación del Boss, Flame sobre los tres arquetipos/Boss, tick, expiración y muerte. Se usaron estados controlados y pasos de simulación para inspeccionar casos concretos; no es una sesión humana completa ni un benchmark de GPU. Se retira el montaje al terminar. La run completa se valida además con entradas normales, daño y ofertas reales.

## Boss: balance y patrones

`src/boss.ts` centraliza todo el balance del Boss. **1600 HP**, radio **1,25 u**. Daño **28 por carga** (35% de 80 HP) y **16 por proyectil**, tanto principal como fragmento (20%). Conserva la invulnerabilidad del Player; el contacto corporal fuera de Charge causa 16 HP, sin multiplicador de daño en Phase 2.

DPS teórico quieto: `10 / 0,35 = 28,57`. Una Power + un Overclock: `12,5 / 0,2975 = 42,02`; dos Power + un Overclock: `52,52`; una Power + Overclock + Rapid: `84,03`. Piercing/Ricochet no vuelven a golpear al mismo Boss, por lo que no multiplican su DPS individual. Homing mejora aciertos, sin añadir daño. Rapid requiere quedarse quieto hasta el segundo disparo; al esquivar pierde ese disparo pendiente.

Criterio inicial: una build mixta con Power, Overclock, Chassis, Repair, Turbo y Ricochet, con 55–80% de tiempo efectivo de tiro, da aproximadamente **23–34 DPS**: **47–69 s** para 1600 HP. La presión viene también de desplazamiento, carga, dos anillos alternos y fragmentación. No hay invulnerabilidad artificial del Boss para alargar la pelea.

Mediciones del piloto de pruebas (simulación, no sesiones humanas):

- Build mixta de referencia: **46,32 s**, 44/100 HP al terminar.
- Run completa actual con ofertas reales: Frost, Flame, Power Trio, Homing, Rapid y Energy Shield; **172,53 s** totales, **27,40 s** contra Boss y **2 HP** finales. El piloto recoge físicamente los seis núcleos.
- Mediciones históricas anteriores a este balance, no repetidas en esta pasada: ensayos aislados ofensivos: Power + Overclock + Rapid + Chassis + Repair + Turbo: **27,87 s**; sustituyendo Turbo por otro Power: **21,13 s**.

El objetivo de 45–75 s se cumple para la build mixta de referencia; **no está garantizado para builds con las nuevas mejoras ni con Rapid**. La combinación de multiplicadores y un piloto con esquiva predictiva puede acortarlo mucho. Es un punto de partida explícito para balance manual, no una promesa de duración para todas las ofertas.

| Parámetro | Phase 1 | Phase 2 |
| --- | ---: | ---: |
| Aproximación | 2,4 u/s durante 2 s | 3 u/s durante 1,25 s |
| Recuperación | 1,5 s | 0,8 s |
| Intervalo Split | 0,32 s | 0,19 s |
| Segunda radial | Cada tercera ejecución radial | Todas las ejecuciones radiales |

Secuencia determinista **Charge → Radial → Split**; en Phase 2, cada ejecución de Charge contiene sus dos cargas anunciadas. Entre ataques se aproxima por el suelo abierto; la posición objetivo evita la maquinaria trasera, y la colisión mantiene el cuerpo dentro de la sala.

- **Charge:** aviso **1 s**, dirección fijada al comenzar el aviso; trayectoria recta a **14 u/s durante 0,65 s** (máximo **9,1 u**). No sigue al Player. El corredor visual incluye el volumen del Boss. Solo un impacto por carga; ante pared/obstáculo se detiene, sin deslizar ni atravesar geometría. En **Phase 2**, después de la primera añade **0,30 s de pausa + 0,85 s de nuevo aviso** y una segunda carga. El aviso reajusta dirección al principio, mantiene la línea los últimos 0,25 s y la fija al lanzar; sin homing. Tras la segunda llega recovery, sin tercera carga.
- **Radial:** aviso **0,9 s**, **12 proyectiles**, separación **30°**, **7 u/s en P1 y 7,56 en P2**, vida **3,5 s**. Cuando corresponde, segundo anillo **0,45 s en P1 / 0,38 s en P2** después, rotado **15°**. No homing.
- **Split:** aviso **0,85 s**, **3 principales escalonados** que apuntan a la posición del Player al emitir cada uno. Velocidad **7,5 u/s en P1 / 8,1 en P2**; a **0,7 s / 5,25 u en P1 / 5,67 u en P2** desde el origen, el principal desaparece y emite exactamente **3 secundarios a −20°/0°/+20°**. Hijos a **8 u/s en P1 / 8,64 en P2**, vida **2,4 s**, sin otra división ni homing. Principal ámbar más grande, hijos rojos y pequeñas partículas al dividir. Impactar antes contra cobertura o Player destruye el principal sin fragmentarlo.
- **Phase 2:** al llegar a **≤800 HP**, una sola reacción de **0,8 s**, pulso, emisivo más intenso, partículas y aviso. Interrumpe el ataque pendiente; las balas emitidas conservan su vida y pueden fragmentarse. Mantiene el mismo daño que P1 y la velocidad de Charge; las nuevas balas de P2 son un 8% más rápidas. Pulso, reacción corporal, emisivo, partículas y shake refuerzan la transición.

Los tiempos se cuantizan al paso fijo de **1/60 s**. No hay timers externos: pausa congela la simulación. El robot tiene cuerpo pesado, cuatro patas articuladas y dos cañones rotatorios; comparte geometrías/materiales, combina partes rígidas y libera sus recursos propios al morir/reiniciar.

La barra fija muestra HP actual/máximo y fase en cada actualización. Desaparece en el mismo frame de muerte o Game Over. Al morir se entra en `ending`: se cancelan estados, ráfagas, timers/avisos pendientes y quemaduras; se emiten partículas/escombros y aparece Victory **0,9 s** después al entrar en `complete`. No hay recogida ni selección adicional. Las balas residuales continúan sin daño hasta expirar; reiniciar crea una Simulation limpia y libera los actores/VFX anteriores.

## Arquitectura y verificación

- `waves.ts`: seis composiciones normales, índice del Boss, siete sectores y estados de progreso, incluidos `cleared` y `ending`.
- `rewards.ts`, `reward-model.ts`: elección segura/recogida y representación del núcleo.
- `contact.ts`, `burn.ts`: contacto corporal/separación y quemaduras sin stacks.
- `boss.ts`, `boss-model.ts`: balance/estados puros del Boss y representación procedural separada.
- `layout.ts`: distribución modular, colisiones, candidatos y política de residencia.
- `simulation.ts`: combate, refuerzos, ráfagas, ofertas, puertas y eventos visuales.
- `upgrades.ts`, `stats.ts`, `player.ts`: pool, elegibilidad, valores y stats propios de cada run.
- `projectiles.ts`, `physics.ts`: asistencia y presupuestos por bala, contactos continuos ordenados.
- `arena.ts`, `world.ts`, `models.ts`: representación, factories compartidas y liberación de recursos.
- `actors.ts`, `effects.ts`, `game.ts`: animación, orientación de balas que giran, VFX, cámara y bucle fijo.
- `ui.ts`, `style.css`, `index.html`: interfaz original con numeración y tarjetas dinámicas; panel mínimo de audio.
- `audio.ts`, `audio-browser.ts`, `audio-events.ts`, `audio-controls.ts`: política, backend Web Audio, eventos y controles. Un reproductor de música y buffers SFX compartidos; 12 voces máximas.
- `public/audio/`, `docs/AUDIO.md`, `docs/audio-licenses/`: tres músicas (Airy para menú), 18 SFX seleccionados y trazabilidad CC0 (9,39 MB de audio).

La ampliación anterior dejó **160/160 tests**. La pasada de balance partió de ese baseline y terminó con **177/177**, TypeScript estricto, build y `git diff --check` correctos. Los 17 tests nuevos cubren parámetros, suelo variable, artillería, Burrower y Phase 2. Las regresiones de upgrades, burn, escudo, Revive, contacto, núcleo, puertas, Victory y restart siguen pasando.

Audio v1 parte de **177/177** y termina con **204/204**: 27 tests nuevos de mezcla, persistencia, estados, cooldowns, límites, carga única, transiciones y limpieza. No cambia archivos de simulación ni balance. La música normal continúa entre S01–06, cambia al entrar al Boss y se pausa/detiene en los estados correspondientes.

La segunda pasada de audio parte de **204/204** y termina con **211/211**: refuerza Shield, añade Shock/ignición Flame y distingue muerte/Victory. Tres SFX nuevos; música, mecánicas y VFX intactos.

Detalles de balance antes/después, decisiones, archivos nuevos/modificados, resultados del piloto y checklist: [BALANCE.md](BALANCE.md). La copia previa permite comparar archivos porque el repositorio aún no tiene archivos bajo seguimiento. Sin dependencias nuevas, commit ni push.

## Comprobación manual y límites

1. Mata al último enemigo de un sector normal: sin tarjetas, puerta cerrada, núcleo visible, movimiento/dash disponibles. En 05/06 elimina también los refuerzos.
2. Mata un Shooter justo después de disparar: su bala sigue y puede quitar HP antes de recoger el núcleo. Prueba esquivarla y recogerlo desde diferentes puntos.
3. Acércate al núcleo: recogida automática, efecto, tres tarjetas protegidas. Elige una: abre la puerta. Repite en los seis layouts.
4. Intenta atravesar Basic, Runner y Shooter: bloquean y hacen 10 HP por contacto respetando i-frames. Basic melee hace 15; Runner dash 20, sin sumar contacto. Prueba varios Basics, Runner pasando cerca, Shooter junto a pared y salir lateralmente entre cuerpo/cobertura. Boss hace 16 corporal y 28 Charge, nunca 44 en un mismo evento.
5. Observa flash del robot, bordes, pequeño shake y HP; deben apagarse antes que la señal cian de invulnerabilidad. Pausa durante un efecto y reanuda.
6. Cuenta 17 definiciones, tres ofertas distintas y colores verde/azul/morado/dorado. Un único adquirido no vuelve a salir; los cinco Common sí pueden repetirse.
7. Con Flame, impacta a Basic/Runner/Shooter y Boss: burst inicial, brasas ascendentes y armadura cálida; tres ticks menores al dejar de disparar. Refresca sin stacks; comprueba el fade sin daño durante 0,5 s al expirar y la limpieza inmediata al morir. Repite con varios objetivos.
8. Con Shield, recibe un golpe: HP intacto, ruptura y ESCUDO GASTADO. Espera más de 12 s, mata al último enemigo, recoge núcleo y elige mejora: sigue gastado. Cruza realmente de sector: vuelve una sola carga con burst cian. En Boss, espera varios minutos tras gastarlo: no vuelve. Prueba todas las fuentes de daño y adquisición al terminar Sector 06.
9. Con Revive, recibe daño letal: 40% del máximo, pulso dorado, 2 s seguros, estado consumido. Una segunda muerte termina la run; reiniciar permite adquirirlo otra vez.
10. Combina Trio con Power/Turbo/Overclock; verifica que las tres mejoras se multiplican sin cambiar dash. Triple genera tres balas; Rapid + Triple genera 3 + 3 a 100 ms. Movimiento/dash antes del segundo evento lo cancela completo.
11. Entra físicamente en 07; comprueba patrones, Phase 2 y 1600 HP conservados. Derrota al Boss: sin núcleo, avisos fuera, balas inofensivas, destrucción y Victory tras 0,9 s. Reinicia: 80 HP, daño 10, velocidad 7,182, sin mejoras ni estados residuales.

La pasada de balance ajustó velocidades, daño, suelo variable, artillería, presencia Burrower y Phase 2; la posterior de audio conserva esos valores. Upgrades, HP y layouts se conservan. La fuerza de la build depende de ofertas y elecciones. El autoaim sigue eligiendo al enemigo más cercano, aunque esté detrás de cobertura; hay que reposicionarse. La IA local puede tomar rodeos y no garantiza rutas óptimas. Solo se ha inspeccionado Chrome de escritorio; WebGL 2 y teclado, sin táctil ni guardado de runs; las preferencias de audio sí persisten. La sexta mejora sí participa en el combate del Boss.

Las builds con las nuevas mejoras pueden acortar mucho el Boss; se conserva deliberadamente su balance para probarlas. La separación sigue siendo local y suave: puede haber solapamiento visual breve con un cuerpo en carga o en una aglomeración sin hueco; no teletransporta ni empuja enemigos para resolverlo. Las pruebas verifican desplazamientos acotados y salida cuando hay espacio lateral. No hay fallos conocidos en los casos automatizados/visuales revisados.

Sin XP, monedas, tienda, progresión permanente, SDK, anuncios ni analytics. Three.js/Vite: MIT; TypeScript: Apache-2.0.

### Playtest de variedad

1. 01: solo tres Basic, núcleo y salida habitual.
2. 02: rodea las dos placas; diferencia seguro/ámbar/rojo; prueba tick y dash. Al limpiar no deben reiniciarse.
3. 03–06: corre recto ante Shooter y cambia de dirección; el lead ocasional conserva trayectoria una vez disparado.
4. 04: observa mortero, arco y aro fijo; abandona el fuego. Mata Grenadier con granada en vuelo: debe caer igualmente.
5. 05: observa hundimiento, rastro y aviso; cruza el cuerpo enterrado, esquiva la salida y dispara en sus 3 s activos. No debe salir dentro de geometría.
6. 06: comprueba cinco roles y refuerzo legible; no más de dos zonas térmicas ni siete enemigos/avisos/zonas agregados.
7. Con Shield prueba explosión, tick, salida y contactos: una absorción, sin recarga por esperar. El núcleo/card protege ante fuego residual; la puerta exige elegir.
8. Pausa con granada en vuelo y aviso de salida; reanuda. Muere/reinicia y comprueba limpieza. Completa 07 y verifica Phase 1 y la nueva intensidad de Phase 2.

### Playtest final de estados y upgrades

1. Shock: cuenta impactos, prueba grupo de tres y Boss solo; combina Rapid/Triple/Piercing/Ricochet. Comprueba arcos breves, cobertura y ausencia de daño/estados recursivos.
2. Frost: observa los cinco tipos y Boss; compara desplazamiento normal con Dash/Charge/avisos. Reimpacta para refrescar y deja expirar sin acumular slow.
3. Overdrive: carga un segundo sin target, acércate a uno, detente y compara HUD/ritmo. Mueve contra pared y usa dash: cancelación inmediata; parar de nuevo exige carga completa. Prueba con Power/Trio/Overclock y Rapid + Triple.
4. Flame: observa especialmente Shooter al moverse/apuntar/disparar y cada otro modelo. Deja completar tres ticks; comprueba medio segundo residual sin daño, reimpacto durante fade y muerte.
5. Burn + Frost: deja expirar primero uno y después el otro; el restante debe conservar color/partículas/efecto. Entierra Burrower ardiendo: cuerpo y fuego desaparecen, sus avisos habituales permanecen; emerge con el estado restante correcto.
6. Pausa/reanuda, mata Boss y reinicia: sin arcos, cristales, carga ni brasas huérfanos. Comprueba que nuevos únicos desaparecen al adquirirlos y vuelven al reiniciar. Revisa consola durante una run completa.
