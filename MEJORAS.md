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
| 14 | Cambiar de grupo sin conexión deja la pantalla de error aunque ese grupo tenga copia guardada | `stores/group.ts` `switchGroup()` | pendiente |
| 15 | Seguridad: la pantalla `/autorizar` se puede meter en un iframe (clickjacking) | `vercel.json` sin cabeceras | pendiente |
| 16 | Seguridad: cualquier miembro puede leer el `claim_code` de un perfil sin cuenta y quedarse con él | `grant select on people`; la app pide `people(*)` | pendiente |
| 17 | Evento semanal nuevo: al cambiar la fecha, el día marcado sigue siendo el de antes | `EventFormView.vue` | pendiente |
| 18 | Semana y Hoy: dos eventos cortos seguidos se pintan uno encima del otro | `lib/timeline.ts`, `MIN_BLOCK_PX` | pendiente |
| 19 | Cerrar sesión con cambios de la compra sin guardar los pierde sin avisar | `AccountView.vue` | pendiente |
| 20 | Accesibilidad: ordenar tareas no se puede con teclado | `TaskRows.vue` | pendiente |
| 21 | Cuenta y «Añadir otro grupo» vuelven siempre a Grupo (la regla es `goBack()`) | `AccountView.vue`, `WelcomeView.vue` | pendiente |
| 22 | Vite con avisos de seguridad altos (solo desarrollo, pero `npm run dev` escucha en la red local) | `npm audit` | pendiente |
| 23 | Los avisos recorren cada minuto todos los eventos con recordatorio, también los pasados | SQL `enqueue_event_reminders` | pendiente |
| 24 | README: secciones y documentos desactualizados | `README.md` | pendiente |

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

## Decisiones tomadas

- Verificar los permisos con PGlite en vez de Docker, por memoria. CI los pasa con Supabase de verdad en el PR.

## Pendiente de Luis

1. **`npx supabase db push`** de `20261125120000_family_streaks` (según la memoria del proyecto, sin aplicar en la nube).
   Hasta entonces, Rachas solo enseña la propia.
