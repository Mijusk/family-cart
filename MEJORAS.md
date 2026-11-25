# Mejoras autónomas

Rama `mejoras/auto-2026-11-25`, sin push. Cada mejora, un commit. Este fichero dice qué se ha hecho, cómo
se ha comprobado y qué queda.

## Punto de partida (25-nov, `main` en `25b0c20`)

- `npm test`: 171 tests en 16 ficheros, todos bien.
- `npm run build` (vue-tsc + vite): bien. JS de entrada: `group` 338 kB (98,8 kB gzip) + `index` 38 kB.
- Permisos (`supabase/tests/permissions.sql`): **360 ok, 0 failed**. Docker no está arrancado y el PC va justo de
  memoria, así que se pasan sobre un Postgres en WASM (PGlite, fuera del repo) con un stub de Supabase, como
  dice CLAUDE.md. Aplica todas las migraciones + seed desde cero.
- No hay lint ni tests de interfaz. `npm audit`: 2 avisos altos, los dos en Vite (solo desarrollo).
- `.env.local` apunta a `127.0.0.1:54321` (local). Nada de esta rama habla con Supabase Cloud.

## Backlog (por impacto / esfuerzo + riesgo)

| # | Qué | Dónde / evidencia | Estado |
| --- | --- | --- | --- |
| 1 | Una recarga en segundo plano que falla (móvil que vuelve con mala cobertura) cambia el calendario o las tareas ya cargados por «No se pudo cargar» | `stores/calendar.ts` y `stores/tasks.ts`: el `catch` de `load()` pone `error` aunque haya datos | **hecho** |
| 2 | Compra: con mala cobertura (el móvil dice que hay red) un cambio se descarta a los ~9 s y no vuelve a intentarse | `stores/list.ts` `send()`, `NETWORK_TRIES = 3` | **hecho** |
| 3 | Con la app abierta durante un despliegue, las pantallas que no se habían abierto ya no cargan: tocas y no pasa nada | rutas con `import()`; los ficheros viejos ya no están en Vercel y el service worker nuevo borra su caché | **hecho** |
| 4 | Tarea: lo escrito en la nota o el título se pierde al volver con el gesto del móvil o cerrar la app (solo se guarda al salir del campo) | `views/TaskView.vue` | **hecho** |
| 5 | Evento nuevo: si se guarda pero fallan los grupos o participantes, reintentar crea un segundo evento | `stores/calendar.ts` `saveEvent()` | **hecho** |
| 6 | El aviso de un día movido abre el evento en el día que no es (hora y título de la serie) | SQL `enqueue_event_reminders` enlaza `occ_date`; `EventView` espera la fecha de la serie | **hecho** |
| 7 | Compra: un nombre de más de 80 caracteres se pierde con «Revisa la conexión» | `AddItemForm.vue`, `PendingItemRow.vue` sin `maxlength`; la base limita a 80 | **hecho** |
| 8 | Autocompletado: un producto nuevo sale dos veces hasta recargar | `stores/list.ts`: id local ≠ id del trigger, `upsert` por id | **hecho** |
| 9 | Conector IA: `ver_compra` no enseña lo marcado «No lo encontré» y `anadir_compra` lo duplica | `functions/mcp/shopping.ts` solo mira `pending` | **hecho** |
| 10 | Rachas: la API corta en 1000 filas; con el tiempo la racha de la familia saldría a 0 | `stores/stretching.ts` | **hecho** |
| 11 | Racha sin conexión: dos envíos a la vez pueden perder una sesión pendiente, y no se reintenta al volver a la app | `stores/stretching.ts` `flush()` | **hecho** |
| 12 | Tocar una notificación con la app abierta la recarga entera: se pierde lo que se estuviera escribiendo y los cambios de la compra en cola | `public/sw.js` `notificationclick` | **hecho** |
| 13 | Con red muy lenta, abrir la app se queda en blanco esperando aunque esté guardada | `public/sw.js` `networkFirst` sin límite de tiempo | **hecho** |
| 14 | Cambiar de grupo sin conexión deja la pantalla de error aunque ese grupo tenga copia guardada | `stores/group.ts` `switchGroup()` | **hecho** |
| 15 | Seguridad: la pantalla `/autorizar` se puede meter en un iframe (clickjacking) | `vercel.json` sin cabeceras | **hecho** |
| 16 | Seguridad: cualquier miembro puede leer el `claim_code` de un perfil sin cuenta y quedarse con él | `grant select on people`; la app pide `people(*)` | **hecho** |
| 17 | Evento semanal nuevo: al cambiar la fecha, el día marcado sigue siendo el de antes | `EventFormView.vue` | **hecho** |
| 18 | Semana y Hoy: dos eventos cortos seguidos se pintan uno encima del otro | `lib/timeline.ts`, `MIN_BLOCK_PX` | **hecho** |
| 19 | Cerrar sesión con cambios de la compra sin guardar los pierde sin avisar | `AccountView.vue` | **hecho** |
| 20 | Accesibilidad: ordenar tareas no se puede con teclado | `TaskRows.vue` | **hecho** |
| 21 | Cuenta y «Añadir otro grupo» vuelven siempre a Grupo (la regla es `goBack()`) | `AccountView.vue`, `WelcomeView.vue` | **hecho** |
| 22 | Vite con avisos de seguridad altos (solo desarrollo, pero `npm run dev` escucha en la red local) | `npm audit` | **hecho** |
| 23 | Los avisos recorren cada minuto todos los eventos con recordatorio, también los pasados | SQL `enqueue_event_reminders` | **hecho** |
| 24 | README: secciones y documentos desactualizados | `README.md` | **hecho** |
| 25 | Mes y Semana: calcular un mes con muchos eventos tarda ~270 ms en un PC (más de 1 s en un móvil) | `stores/calendar.ts` `occurrencesOn()`: recorre todo, con proxies, por cada día | **hecho** |
| 26 | Accesibilidad: Mes usa `aria-pressed` donde no vale y la barra de Modo compra no tiene nombre (axe) | `MonthView.vue`, `ShoppingView.vue` | **hecho** |
| 27 | «Crear un grupo / Tengo un código» se ve roto: píldoras sobre fondo gris | `WelcomeView.vue`: su `.choice` choca con la `.choice` global | **hecho** |
| 28 | Mes: tocar un día de otro mes (los grises) no hace nada | `MonthView.vue` `selected` | **hecho** |

## Hecho

- **1.** Si falla una recarga de lo que ya está en pantalla, se queda; el error solo sale si no hay nada que enseñar (otro grupo, otros días). Tests nuevos de los stores (`calendar.test.ts`), que fallan sin el arreglo.
- **5.** El evento nuevo lleva su id desde el formulario: reintentar continúa con el mismo. Tests en `calendar.test.ts` (fallo a medias, y respuesta que no llega).
- **2.** Los cambios de la compra se reintentan hasta que llegan (cada 3 s, luego hasta 24 s), también si el servidor está caído un momento; el aviso «Sin conexión» lo dice. Solo se deshace lo que el servidor rechaza. Tests en `list.test.ts`.
- **8.** La fila del servidor sustituye a la copia local por nombre normalizado. Test en `list.test.ts`.
- **7.** Los campos de nombre y nota cortan en lo que admite la base de datos (80 y 120), con una sola constante.
- **4.** La nota o el título a medio escribir se guardan al volver atrás o al esconder la app. Comprobado en Chromium con la app compilada y un Supabase simulado.
- **3.** Si al abrir una pantalla falta su fichero (despliegue nuevo), la app se recarga ya en ella; sin conexión, con cambios en cola o si vuelve a fallar, lo dice con un aviso. Comprobado en Chromium con el fichero devolviendo 404.
- **13.** Con copia guardada, una página espera 4 s a la red y luego abre la copia (antes, sin límite). Comprobado con un servidor que tarda 15 s: abre en 4,1 s; sin red, en 0,1 s.
- **12.** Tocar un aviso con la app abierta cambia de pantalla sin recargar (y pregunta si hay algo a medias); si la ventana no contesta, la carga como antes. Comprobado en Chromium simulando el toque en el service worker; falta verlo en un móvil de verdad.
- **6.** El evento se abre en el día bueno aunque el enlace traiga la fecha movida, o en la próxima vez si no trae ninguna (`nearestSeriesDate`, con tests); comprobado en Chromium. El conector IA enlaza ya la fecha de la serie.
- **9.** `ver_compra` enseña también lo no encontrado y `anadir_compra` suma a esa línea. `deno check` pasa; se publica al desplegar la función.
- **10.** Los días se piden por páginas de 1000. Test con 1500 días seguidos.
- **11.** La sesión terminada se guarda primero en el dispositivo y se envía una sola vez, en orden; se reintenta al volver a la app. Tests en `stretching.test.ts`.
- **19.** Al cerrar sesión con cambios de la compra en cola, pregunta antes. Comprobado en Chromium.
- **21.** Cuenta y «Añadir otro grupo» vuelven con `goBack()`. Comprobado en Chromium.
- **14.** Sin conexión, cambiar de grupo abre la copia guardada al momento (antes, 7 s y pantalla de error); si ese grupo no se ha abierto en el dispositivo, vuelve al que estaba y lo dice. Abrir la app sin red tampoco espera ya. Además, la copia guardada ya no se puede sustituir por una lista vacía a medio cargar (test en `list.test.ts`, que falla sin el arreglo).
- **18.** Los eventos cortos que se pintarían uno encima de otro van en columnas. Test en `timeline.test.ts` y visto en Chromium.
- **17.** Al cambiar la fecha de un evento semanal nuevo, el día marcado la sigue, y el aviso dice el primer día de verdad. Comprobado en Chromium.
- **15.** `vercel.json`: la app no se puede meter en un iframe (`frame-ancestors 'none'`, `X-Frame-Options`), más `nosniff` y `Referrer-Policy`. Solo se puede ver al desplegar: `curl -I` en la web.
- **20.** Las tareas se ordenan también con las flechas sobre el asa, que no pierde el foco. Comprobado en Chromium.
- **22.** `npm audit` queda en 0: Vite 8.3.8, source-map-js 1.2.2 (solo el lockfile, versiones de hace dos semanas o más). Comprobado en una copia aparte con `npm ci`, tests y build. En tu PC entra con `npm install`.
- **23.** Misma migración: el job de cada minuto solo mira los eventos que pueden tocar.
- **16.** Migración nueva `20261126120000_private_claim_codes` (sin aplicar en ningún sitio): el código pasa a una tabla que nadie lee y el aviso de un día movido enlaza la fecha de la serie. Compatible con la app desplegada. Sobre Postgres en WASM: 365 permisos bien, y el paso desde datos existentes conserva los códigos. `database.types.ts` editado a mano con el orden del generador.
- **24.** README al día: qué es la app, secciones, documentos y stores.
- **25.** Índice de excepciones, descarte rápido de lo que no puede caer ese día y arrays sin proxies: un mes con 330 eventos y 150 excepciones pasa de 270 ms a 26 ms, con los mismos resultados (960 apariciones). Tests de `mayHappenOn`.
- **26.** Corregido; axe (WCAG AA) sobre 28 rutas a 360 px, sin desbordes. Quedan solo el atenuado de los días pasados (decisión de Luis) y de los días de otro mes.
- **27.** La pantalla usa su propia clase. Visto en Chromium a 360 px.
- **28.** Tocar un día de otro mes lleva a ese mes con el día abierto. Comprobado en Chromium.

## Decisiones tomadas

- Verificar los permisos con PGlite en vez de Docker, por memoria. CI los pasa con Supabase de verdad en el PR.

## Pendiente de Luis

1. **`npx supabase db push`** de `20261125120000_family_streaks` (según la memoria del proyecto, sin aplicar en la nube).
   Hasta entonces, Rachas solo enseña la propia.
