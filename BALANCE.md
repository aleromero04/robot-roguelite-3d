# Balance y gameplay polish · 20/10/2026

Pasada posterior al playtest humano. Se mantienen 5 enemigos normales, 7 sectores, 17 upgrades y 1600 HP del Boss. Sin nuevas dependencias, commit ni push.

## Valores comprobados antes → después

Unidades: u/s para velocidad, segundos para tiempos y HP para daño. No se aumentan HP enemigos ni Max HP del Player.

| Locomoción normal | Antes | Ahora | Cambio |
| --- | ---: | ---: | ---: |
| Player | 6,84 | 7,182 | +5% |
| Basic | 2,21 | 2,431 | +10% |
| Runner | 3,6 | 3,888 | +8% |
| Shooter | 2,3 | 2,53 | +10% |
| Grenadier | 2 | 2,2 | +10% |
| Burrower activo | 2,6 | 2,99 | +15% |
| Boss Phase 1 | 2,4 | 2,4 | Igual |
| Boss Phase 2 | 2,9 | 3 | +25% frente a Phase 1; +3,45% frente al anterior P2 |

Dash Player permanece en 21 u/s, 0,18 s y recarga de 1,65 s; Runner Dash 14,5 u/s durante 0,55 s; Boss Charge 14 u/s durante 0,65 s. Frost se aplica solo a locomoción normal, incluida la nueva retirada del Grenadier durante recovery.

| Proyectil | Antes | Ahora |
| --- | ---: | ---: |
| Player | 25 | 25 |
| Shooter | 9 | 9,72 (+8%) |
| Boss P1: Radial / Split / fragmento | 7 / 7,5 / 8 | Sin cambios |
| Boss P2: Radial / Split / fragmento | 7 / 7,5 / 8 | 7,56 / 8,1 / 8,64 (+8%) |

Cada principal Split guarda la velocidad de sus futuros fragmentos al emitirse: cambiar de fase o morir no altera las balas ya lanzadas. No hay homing nuevo. Shooter conserva DIRECT/LEAD, probabilidades, predicción, aviso de 0,60 s y recuperación de 1,65 s.

| Fuente de daño | Antes | Ahora |
| --- | ---: | ---: |
| Basic contacto / melee | 8 / 12 | 10 / 15 |
| Runner contacto / dash | 8 / 16 | 10 / 20 |
| Shooter contacto / bala | 8 / 10 | 10 / 13 |
| Grenadier contacto / explosión / fuego por tick | 8 / 12 / 4 | 10 / 15 / 5 |
| Burrower contacto / salida | 8 / 14 | 10 / 18 |
| Boss contacto / bala y fragmento / Charge | 12 / 12 / 20 | 16 / 16 / 28 |
| Suelo Sector 02 por tick | 6 | 6 |

Player sigue con 80 HP, 10 de daño base e intervalo de 0,35 s. Se conservan i-frames de 0,85 s, Shield por sector, Revive, healing y todos los modifiers de upgrades. Melee, Dash, emergence y Charge conservan prioridad sobre contacto, sin doble golpe en el mismo evento.

## Suelo variable de Sector 02

Se mantienen dos hazards y los tiempos anteriores: espera inicial 2 / 5,45 s; WARNING 1 s → ACTIVE 1,7 s → COOLDOWN 4,2 s. Radio 1,35 u, daño 6 cada 0,5 s activo. Primer daño posible: 1,5 s después de recolocar; nunca al aparecer el aviso.

Al comenzar **cada warning**, se sortea una posición entre 13 puntos del layout existente que admiten el disco completo. Se excluyen la ubicación anterior del mismo hazard y puntos a menos de 3,5 u del otro. Los centros quedan al menos a 3 u de los límites laterales de la sala, protegiendo las entradas/salidas; se validan límites y obstáculos con la misma geometría del juego. Si no hay candidato, espera 0,25 s y reintenta.

Selección uniforme mediante el generador de Simulation, inyectable en tests. No depende de perseguir al Player; puede avisar bajo sus pies, pero siempre da el segundo completo de warning. La pareja cambia entre ciclos sin crecer ni aumentar la superficie peligrosa. Tras clear no empiezan ciclos nuevos; las zonas activas terminan su vida y la recogida del núcleo protege desde el mismo paso de entrada en tarjetas.

## Grenadier: artillería

Antes solo preparaba un ataque a **6–10 u**, con visión directa. Ahora adquiere y prepara lanzamientos a **≤42 u**, incluso sobre cobertura, validando el área de impacto. La trayectoria es un arco; se conserva el destino fijado durante la preparación y no persigue al jugador tras lanzar.

El Player no tiene un límite de adquisición: selecciona al enemigo más cercano. Su alcance físico sin impactos es **27,5 u desde la boca del arma** (25 × 1,1 s). No se ha modificado para fingir una diferencia de rango. El alcance 42 del Grenadier cubre la arena y permite disparar más allá del alcance de esas balas.

Distancia preferida **16–36 u**. Durante recovery se retira si el Player está a menos de 16 y se aproxima si está a más de 36; usa la evasión local existente. Al poder atacar vuelve a preparar un lanzamiento válido incluso bajo presión cercana: no huye eternamente. Conserva preparación 0,55 s, recovery 3,6 s, vuelo/aviso 0,95 s, radio 1,7 u, fuego 3,5 s y sus límites de una zona por dueño / dos globales.

La granada es visualmente 30% mayor, con relleno de impacto más contrastado y borde pulsante. El radio peligroso no cambia. El warning aparece al lanzar aunque el emisor esté lejos o fuera de cámara.

## Burrower y composiciones

Primera espera activa: **4,5 → 2 s** desde materialización. Después de emerger: **4,5 → 3 s** activo. Se conservan hundimiento **0,45 s**, viaje **0,60 s** y aviso de salida **0,90 s**. El primer uso más temprano evita depender de que sobreviva 4,5 s; el periodo posterior conserva una ventana clara para atacarlo. Con destino válido, el ciclo posterior completo pasa de **6,45 a 4,95 s**.

Windup ahora pulsa el halo; montículo/rastro y relleno del aviso son más visibles; partículas de entrada **12 → 16** y salida **24 → 30**, dentro del pool existente. No se cambia el radio real de salida. Underground/emergence siguen sin collider ni target normal; Burn previo continúa sin revelar el cuerpo, igual que antes.

| Sector | Basic | Runner | Shooter | Grenadier | Burrower | Total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 01 | 3 | 0 | 0 | 0 | 0 | 3 |
| 02 | 2 | 2 | 0 | 0 | 0 | 4 |
| 03 | 2 | 2 | 2 | 0 | 0 | 6 |
| 04 | 2 | 1 | 2 | 1 | 0 | 6 |
| 05 | 1 | 2 | 2 | 1 | 2 | 8 |
| 06 | 2 | 2 | 2 | 2 | 2 | 10 |

- **05 inicial:** Basic, Runner, Shooter, Grenadier, Burrower. **Refuerzo:** Burrower, Runner, Shooter.
- **06 inicial:** 2 Basic, Runner, Shooter, Grenadier, Burrower. **Refuerzo:** Burrower, Runner, Shooter, Grenadier.

Solo se sustituye un Basic de cada refuerzo por un Burrower. Siguen siendo 37 enemigos normales, los mismos grupos 5+3 / 6+4 y máximo agregado de 7 enemigos/avisos/granadas/fuegos. No se modifican 01–04 ni los layouts.

## Boss: Phase 1 enseña; Phase 2 presiona

1600 HP; Phase 2 a **≤800 HP**. Phase 1 conserva Charge → Radial → Split, locomoción, timings y velocidades de proyectil; cambia el daño según la tabla.

| Tiempo o patrón | P1 anterior → actual | P2 anterior → actual |
| --- | --- | --- |
| Aproximación | 2 → 2 s | 1,6 → 1,25 s |
| Recovery | 1,5 → 1,5 s | 1,1 → 0,8 s |
| Intervalo entre principales Split | 0,32 → 0,32 s | 0,23 → 0,19 s |
| Retraso entre coronas Radial | 0,45 → 0,45 s | 0,45 → 0,38 s |
| Segunda corona | Cada tercera radial, igual | Todas las radiales, igual |
| Charge por ejecución | Una, igual | Una → dos con pausa y nuevo aviso |

Transición conserva **0,8 s** e interrumpe ataques pendientes: pulso más amplio y rojo/naranja, core más intenso, reacción corporal mayor, **32 → 48 partículas**, pequeño shake **0,14 → 0,22** con caída existente y destello usando la luz ya existente. El núcleo mantiene mayor intensidad en Phase 2; sin cinemática adicional.

**Double Charge exacta:** primer aviso de 1 s con línea fija → Charge 1 hasta 0,65 s (o colisión) → pausa quieta de 0,30 s → segundo aviso visible de 0,85 s → Charge 2 hasta 0,65 s → recovery de 0,80 s. El segundo aviso actualiza su dirección hacia la posición actual durante aproximadamente 0,60 s; la mantiene durante los últimos 0,25 s, y copia esa dirección al vector definitivo al terminar el aviso. No hay predicción ni homing durante la carga. Ambas usan la misma colisión barrida, daño 28 y un único impacto por carga. La segunda no genera una tercera; muerte/reset cancelan también pausa y aviso.

Radial mantiene **12 + 12**, 30° entre proyectiles y desfase de **15°** entre coronas, evitando alinear ambas. P2 aumenta velocidad un 8% y reduce el retraso, sin más balas. Split mantiene **3 principales**, cada uno con **3 fragmentos a −20°/0°/+20°**, división a 0,7 s, sin recursión/homing; en P2 la velocidad mayor sitúa la división a 5,67 u en vez de 5,25 u.

## Decisiones frente a los targets

- Se aplican exactamente los incrementos pedidos de locomoción normal y todos los targets de daño.
- P2 ya era un 20,83% más rápida que P1; 3 u/s completa el objetivo de +25%, sin aplicar otro +25% sobre 2,9.
- Proyectiles: +8% Shooter y Boss P2; P1 se mantiene para enseñar los patrones.
- Grenadier no tenía parámetros separados de adquisición/ataque: ambos usaban la banda 6–10. Ahora hay un alcance explícito de 42 y una banda de reposicionamiento independiente.
- El suelo conserva su daño y sus tiempos; cambia solo selección/posición por ciclo.
- Primera espera Burrower diferenciada del periodo activo posterior para asegurar una presentación más temprana.
- Sin cambios de upgrades, rarezas 60/27/10/3, Overdrive ni Flame (3 ×20% cada 0,5 s y fade visual de 0,5 s).

## Verificación y archivos

Baseline **160/160**; final **177/177**. Los 17 nuevos tests cubren valores/HP/dashes, posiciones/reproducibilidad/aviso/protección del suelo, Grenadier a larga distancia y retirada con Frost, composiciones/timings Burrower, transición y Double Charge, prioridades/Shield/colisiones, cancelación, Radial y velocidades reales de principales/fragmentos. Se actualizan expectativas anteriores de valores y composiciones, manteniendo las regresiones de upgrades, burn, contacto, puertas, núcleo, Victory, Game Over y restart.

El piloto anterior muere con la nueva presión. Se ajusta **solo el piloto de tests** para leer el segundo aviso, esquivar perpendicularmente, usar dash y evitar proyectiles sin oscilar en los bordes; no modifica HP, enemigos, daño ni ofertas. Con el piloto actualizado:

- Build mixta (Power, Overclock, Chassis, Repair, Turbo, Ricochet): Boss en **46,32 s**, **44 HP**.
- Run completa con ofertas reales (Frost, Flame, Trio, Homing, Rapid, Shield): **172,53 s**, Boss **27,40 s**, **2 HP**.

Son simulaciones deterministas, no estimaciones de win rate humano. La distinta potencia de cada build sigue afectando mucho a la duración del Boss.

`npm test`, `npm run check` (strict), `npm run build` y `git diff --check` pasan. El repositorio continúa sin archivos bajo seguimiento: se conserva copia previa y se compara contenido/whitespace además del diff de Git. Sin commit ni push.

Revisión visual en Chrome de Sector 01, dos ubicaciones sucesivas del hazard de 02, lanzamiento lejano de Grenadier con emisor en el borde superior de cámara, entrada/salida de Burrower, mezcla de 06 y Boss (P1, transición P2, segundo aviso de Charge, dos coronas Radial y secuencia Split). Se utilizó un montaje temporal con avance por pasos e invulnerabilidad para inspeccionar los avisos; no cuenta como una run humana ni como prueba de dificultad. La fragmentación y sus velocidades se verifican en tests; en la escena visual cercana los principales alcanzan al Player. Sin warnings ni errores en la consola consultada. Montaje temporal eliminado y página normal comprobada de nuevo.

**Nuevos:** `tests/balance-polish.test.ts`, `BALANCE.md`.

**Código modificado:** `src/stats.ts`, `src/contact.ts`, `src/waves.ts`, `src/hazards.ts`, `src/hazard-view.ts`, `src/enemies/grenadier.ts`, `src/enemies/enemies.ts`, `src/boss.ts`, `src/boss-model.ts`, `src/projectiles.ts`, `src/simulation.ts`, `src/actors.ts`, `src/game.ts`.

**Tests/documentación modificados:** `tests/{boss,enemy-variety,feel,final-upgrades,gameplay,polish,rewards-contact,run,status-content,upgrades}.test.ts`, `tests/pilot.ts`, `README.md`.

## Playtest manual y límites

1. **01:** comprueba que tres Basic enseñan el combate, permiten esquivar el melee de 0,45 s y que moverse sigue siendo más rápido. No hay enemigos/hazards nuevos.
2. **02:** observa tres ciclos: discos en lugares distintos, borde ámbar antes de rojo, sin daño al recolocar. Sal del área y prueba pausa, clear y tarjetas.
3. **03–04:** comprueba Shooter DIRECT/LEAD a 9,72 u/s. Busca un Grenadier lejano/tras cobertura: debe lanzar, avisar en el destino y retirarse al acercarte, sin huir indefinidamente.
4. **05:** comprueba un Burrower inicial y otro en refuerzo. Primera habilidad a los 2 s, después 3 s activos entre usos; salida siempre precedida por 0,9 s de aviso.
5. **06:** comprueba los cinco roles, mezcla legible y refuerzo con segundo Burrower sin elevar el total de enemigos.
6. **Boss P1:** reconoce Charge/Radial/Split; contacto 16, balas 16 y Charge 28. Shield debe absorber un evento completo.
7. **Boss P2:** transición inequívoca a mitad de HP. Esquiva carga 1, pausa y nueva línea; cambia de posición durante el aviso y confirma que no te persigue una vez lanzada. Prueba paredes y esquinas.
8. Comprueba los huecos entre las dos coronas y los tres Split más rápidos. Prueba cargar Overdrive entre ataques: modifiers iguales, ventana más arriesgada.
9. Prueba Frost durante retirada Grenadier y locomoción Boss, sin ralentizar Dash/Charge. Mantén Burn + Frost en Burrower antes de enterrarse.
10. Muere/reinicia y vence al Boss: sin cargas, granadas, estados ni avisos huérfanos; seis núcleos, puertas y Victory habituales.

No se deduce de los tests que el balance sea justo para todos los jugadores. Hace falta una nueva tanda de runs humanas; no se ha hecho un benchmark de GPU. Se conservan las limitaciones de navegación local y autoaim al enemigo más cercano aunque haya cobertura. Los impactos en 01 ahora castigan más, por lo que su accesibilidad y la combinación de artillería + Burrower en 05–06 son puntos prioritarios de observación.
