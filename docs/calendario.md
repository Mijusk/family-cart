# Calendario familiar — Diseño V1

Documento de diseño para ampliar **family-cart** con un calendario familiar. Recoge las decisiones cerradas antes de escribir código.

## 1. Objetivo

Que cada persona tenga su calendario (rutina, horario semanal y eventos puntuales) y decida qué parte ve cada grupo, para consultar en un solo sitio los horarios de toda la familia, incluidos los hijos sin móvil.

La compra sigue existiendo como otra sección de la misma app.

## 2. Decisiones tomadas

**Cuentas**
1. **Login con email y contraseña, obligatorio para toda la app** (calendario y compra). Se elimina el acceso anónimo actual.
2. **Una cuenta = una persona**, la misma en todos sus grupos.
3. **Hijos sin móvil:** perfil sin cuenta, creado por un administrador. Todo hijo con móvil tiene email.
4. **Reclamar perfil:** cuando el hijo crea su cuenta, usa un código o enlace personal que genera un administrador desde su perfil.

**Grupos**
5. **Entrar con código requiere aprobación** de un administrador.
6. **Administradores:** quien crea el grupo es administrador y puede nombrar a otros. Pueden invitar, aprobar, expulsar, renombrar, regenerar el código, activar secciones **y editar los calendarios compartidos con ese grupo**. Nunca los privados.
7. **Secciones por grupo:** Calendario y Compra se activan o desactivan desde un menú secundario de ajustes del grupo.
8. **Salir de un grupo:** sus calendarios dejan de verse allí y deja de ser participante de los eventos de ese grupo.

**Calendario**
9. **El calendario es de cada persona**, organizado en carpetas ("Ejercicio", "Trabajo", "Universidad"…). Compartir una carpeta comparte todos sus eventos.
10. **Se comparte solo con grupos.** Para compartir con una persona concreta se crea un grupo pequeño ("Pareja", "Padres").
11. **Un evento puede sumar grupos**, nunca restarlos. Lo privado va en una carpeta sin grupos.
12. **Modo "ocupado":** una carpeta se puede compartir con un grupo mostrando solo "ocupado" (sin título ni detalles). Desactivado por defecto. Oculta los detalles al resto del grupo, no a sus administradores: tras el lanzamiento, Luis decidió que los administradores vean y editen toda carpeta compartida con su grupo, también en modo ocupado (y que puedan crear una carpeta a otro miembro, que nace compartida en completo con el grupo). Las privadas siguen siendo solo de su dueño.
13. **Repeticiones:** puntual, diaria, semanal (uno o varios días), cada dos semanas y mensual (mismo día del mes), con fecha de fin opcional. **Cruzar medianoche:** si la hora de fin es menor que la de inicio (23:00–01:00), el evento acaba al día siguiente (sin fecha de fin; como máximo 24 h).
14. **Por defecto,** el evento nuevo va a la última carpeta usada, con sus grupos.
15. **Ediciones simultáneas:** gana el último cambio, se ve un aviso de "X está editando este evento" y todo queda en el historial.
16. **Tiempo real:** los cambios se ven al instante, como en la compra.

**Registro y papelera**
17. **Todo queda registrado:** quién creó, editó o borró cada cosa y cuándo, visible desde un icono ⓘ discreto.
18. **Papelera:** lo borrado (eventos y carpetas enteras) se recupera durante 30 días desde un apartado secundario del menú.

**App**
19. **Web ahora, preparada para app:** lógica fuera de los componentes, sin depender de APIs exclusivas del navegador. Más adelante, PWA o Capacitor.
20. **Español, semana de lunes a domingo, formato 24 h**, zona horaria `Europe/Madrid`.
21. **Base de datos limpia:** los datos actuales son de prueba y se pueden borrar.

## 3. Conceptos

| Concepto | Qué es |
| --- | --- |
| **Persona** | Un ser humano. Con cuenta (email) o sin ella (hijo pequeño). |
| **Grupo** | Familia, pareja, padres… Tiene miembros, administradores y secciones activas. |
| **Miembro** | Una persona dentro de un grupo, con rol y estado. |
| **Carpeta** | Calendario de una persona, con nombre y color (tabla `calendars`). |
| **Evento** | Algo con fecha y hora, puntual o que se repite. |
| **Excepción** | Cambio en una sola repetición ("este martes no hay clase"). |

Las tres capas (rutina diaria, horario semanal, eventos puntuales) no necesitan un tipo propio: salen de la **repetición** y de la **carpeta**.

## 4. Modelo de datos

*Auditoría* = `created_by`, `created_at`, `updated_by`, `updated_at`, `deleted_by`, `deleted_at`, `deletion_batch`. Los `*_by` apuntan a **personas**. `deletion_batch` agrupa lo que se borró en la misma acción.

**people**
- `id`, `user_id` (auth.users, único, `null` si no tiene cuenta), `display_name`, `color`
- `claim_code` (para que un hijo reclame su perfil), `last_calendar_id` (llega con el calendario)
- `created_by`, `created_at`, `updated_by`, `updated_at`

**groups**
- `id`, `name`, `invite_code`, `timezone`
- `shopping_enabled`, `calendar_enabled`
- auditoría (sin borrado suave en V1)

**members**
- `id`, `group_id`, `person_id`, `role` (`admin` | `member`), `status` (`pending` | `active`)
- `created_at` (cuándo lo pidió), `approved_by`, `approved_at`, `left_at`
- Una fila que ha estado activa no se borra nunca: el historial de la compra apunta a ella.

**calendars** (carpetas)
- `id`, `owner_id` → people, `name`, `color`, `position`
- auditoría

**calendar_shares**
- `calendar_id`, `group_id`, `level` (`full` | `busy`), `shared_by`, `shared_at`

**events**
- `id`, `calendar_id`, `title`, `notes`, `location`
- `all_day`, `start_date`, `start_time`, `end_time` (hora local), `timezone`
- Repetición: `repeat` (`none` | `daily` | `weekly` | `biweekly` | `monthly`), `repeat_weekdays` (lista de 1–7, para semanal y quincenal), `repeat_until` (opcional)
- auditoría

**event_shares**
- `event_id`, `group_id`, `shared_by`, `shared_at`

**event_participants**
- `event_id`, `person_id`

**event_exceptions**
- `event_id`, `occurrence_date`, `status` (`cancelled` | `modified`), `overrides` (jsonb: solo `title`, `notes`, `location`, `all_day`, `start_date`, `start_time`, `end_time`)
- `created_*` y `updated_*`; quitar una excepción borra la fila y queda en `event_history`.

**event_history**
- `id`, `event_id`, `calendar_id`, `action` (`create` | `update` | `delete` | `restore` | `purge`)
- `changed_by`, `changed_at`, `before`, `after` (jsonb, solo los campos que cambian)
- Lo rellena un **trigger**; el front nunca escribe aquí. Los cambios de excepciones, grupos extra y participantes se guardan como `update` del evento.
- Sin claves foráneas: tras eliminar un evento queda su línea mínima, y `calendar_id` dice quién puede leerla (quien edita la carpeta).

Las tablas de la compra (`products`, `items`, `trips`) se mantienen y siguen apuntando a `members.id`. Desaparecen `member_identities` y el login anónimo.

La repetición se guarda en columnas simples en lugar de una regla RRULE: cubre todo lo que necesitamos y se puede convertir a RRULE cuando haya que exportar a `.ics`.

## 5. Permisos (RLS)

**Puede ver un evento** quien:
- es el dueño, o
- es miembro activo de un grupo en `calendar_shares` (con `level = full`) o en `event_shares`, o
- es participante.

Con `level = busy` solo ve la franja horaria, con el texto "Ocupado". Esto se resuelve con una vista o función en la base de datos, no en el front, para que el título nunca llegue al navegador.

**Puede editar un evento o carpeta** quien:
- es el dueño, o
- es administrador de un grupo en el que esa carpeta está compartida (completo u ocupado), o
- (persona sin cuenta) es administrador de un grupo del que esa persona es miembro.

Un administrador puede crear una carpeta a otro miembro activo de su grupo con la RPC `create_calendar_for`; nace compartida en completo con ese grupo.

**Puede compartir una carpeta con un grupo** quien puede editarla y es miembro activo de ese grupo, siempre que el dueño también sea miembro activo. Lo mismo para añadir un grupo a un evento.

**Participantes:** los añade quien edita el evento, entre las personas con las que comparte grupo. Un participante puede quitarse él mismo.

**Salir de un grupo** borra los `calendar_shares` y `event_shares` de sus carpetas con ese grupo y le quita como participante de los eventos compartidos con él. Si vuelve, comparte de nuevo.

Funciones auxiliares: `my_person_id()`, `is_group_member(gid)` (el `is_active_member` del diseño), `is_group_admin(gid)`, `can_edit_calendar(cid)`, `can_view_calendar(cid)`, `can_view_event(eid)`, `can_edit_event(eid)`, `can_share_calendar(cid, gid)`, `can_share_event(eid, gid)`.

Para pintar eventos, `event_owners(ids)` da el dueño y el color de la carpeta de cada evento visible (aunque la carpeta sea privada, por ejemplo un evento visto como participante) y `editable_calendar_ids()` las carpetas en las que el usuario puede crear eventos.

El modo ocupado se lee con la función `busy_events(gid)`: horas, repetición y excepciones (sin título, notas ni lugar) de los eventos que el usuario no puede ver completos.

## 6. Registro de cambios

- En la ficha del evento, un icono ⓘ muestra quién lo creó y cuándo, y la última edición.
- "Ver historial" lista los cambios de `event_history`.
- Borrar muestra el aviso de **deshacer** y envía el evento a la papelera.

## 7. Papelera

- **Qué entra:** eventos y carpetas borrados.
- **Borrado en bloque:** al borrar una carpeta, sus eventos se marcan con el mismo `deletion_batch`. Restaurarla devuelve exactamente ese lote.
- **Restaurar** devuelve también sus grupos compartidos.
- **Quién la ve:** quien puede editar esa carpeta.
- **Vaciado:** tarea programada en Postgres (`empty_trash()`, cada noche a las 04:00 UTC) que elimina lo que lleva más de 30 días borrado. También se puede eliminar a mano.
- **RPCs:** `delete_event`, `restore_event`, `delete_calendar`, `restore_calendar`, `purge_event`, `purge_calendar`. Un evento borrado junto con su carpeta solo vuelve restaurando la carpeta.
- Al eliminar definitivamente se conserva una línea mínima en el historial (título, quién y cuándo).

## 8. Pantallas V1

**Acceso**
- Registro, inicio de sesión y recuperar contraseña.
- Crear grupo o unirse con código (queda pendiente de aprobación).

**Calendario**
- **Hoy:** lo de hoy de cada persona del grupo actual (yo primero), agrupado por persona, con flechas para pasar al día anterior o siguiente. Cada persona ve sus eventos, los que comparte el grupo, aquellos en los que participa y las franjas "Ocupado".
- **Semana:** el grupo elegido, con filtros por persona y por carpeta. Al abrirla en la semana actual baja hasta hoy (salvo que hoy ya se vea); al cambiar de semana vuelve a su lunes si la lista estaba más abajo. El nombre de cada día se queda fijo arriba mientras pasan sus eventos, y los días ya pasados salen atenuados. Cada día es una escala de horas, como una agenda (`src/lib/timeline.ts`): la altura sigue al reloj (44 px por hora), de la primera hora con algo a la última; los huecos de 2 h o más sin nada se encogen en una franja «· · · N h libres». Los eventos a la vez van en columnas, como en Google Calendar, con el color de la carpeta; los de todo el día, como etiquetas encima. Lo que viene de la noche anterior empieza arriba y lo que cruza la medianoche llega hasta abajo. Una línea marca la hora actual en hoy. Decidido con Luis el 19 oct 2026 tras probar las líneas de metro; con los horarios de los hijos (más solapes) se revisará.
- **Mes:** solo eventos puntuales y excepciones.
- En Hoy, Semana y Mes, deslizar el dedo hacia un lado pasa al día, la semana o el mes siguiente (hacia la izquierda) o anterior (hacia la derecha), como las flechas. El contenido sigue al dedo y entra deslizándose desde el lado (también con las flechas); sin animación si el móvil pide reducir el movimiento.
- **Persona:** el calendario de una persona.
- **Evento:** crear y editar rápido, duplicar un día, aviso (recordatorio, ver `docs/notificaciones.md`), elegir carpeta, participantes ("Con quién": miembros activos del grupo actual, sin el dueño de la carpeta) y grupos extra, icono ⓘ y aviso de "está editando".
  - En un evento que se repite, editar o borrar pregunta "solo este día" (excepción) o "toda la serie".
  - Si no hay carpeta, "Nueva carpeta…" en el propio formulario crea una privada (nombre y color); compartirla llega con "Mis carpetas".

**Menú secundario**
- **Mis carpetas:** crear, renombrar, cambiar de color y borrar carpetas, y elegir con qué grupos se comparten (completo u ocupado). Los administradores eligen arriba de quién son las carpetas (tú u otro miembro del grupo; de quien tiene cuenta solo ven las compartidas con el grupo). Se llega desde el enlace «Mis carpetas» bajo Hoy / Semana / Mes.
- **Grupo:** miembros, solicitudes pendientes, administradores, secciones activas y código de invitación.
- **Perfiles sin cuenta:** crear el perfil de un hijo y generar su código para reclamarlo.
- **Papelera:** desde Mis carpetas. Carpetas borradas (con sus eventos) y eventos borrados sueltos; recuperar o eliminar definitivamente.

Navegación: la barra inferior muestra las secciones activas del grupo actual, en el orden Calendario · Tareas · Compra · Grupo. La app abre siempre en Hoy (o en la primera sección activa si el grupo no usa el calendario). Grupo lleva un aviso con el número de solicitudes pendientes para los administradores.

## 9. Fuera de la V1 (pero preparado)

- Importar calendarios externos (`.ics`, colegio, trabajo). Exportar ya se puede: §13.
- Exportar horarios (CSV/JSON) para generar tablas de tareas con IA.
- Repartos de tareas familiares (las tareas puntuales llegan en el PR 8, ver `docs/tareas.md`).
- Entrar con Google.
- App con Capacitor. (La PWA instalable y las notificaciones ya están: `docs/notificaciones.md`.)

## 10. Pendiente de investigar durante el desarrollo

- **Vistas de semana y mes:** componente propio o librería para Vue.
- **Fechas:** cálculo de repeticiones y cambio de hora en el navegador.
- **Emails de Supabase:** el remitente por defecto tiene un límite bajo de envíos; para producción hará falta un SMTP propio (p. ej. Resend).
- **Casos límite:** todo el día, cambiar una serie "a partir de esta semana".

## 11. Forma de trabajo

- Desarrollo en ramas con **pull requests** que Luis revisa antes de fusionar.
- Las migraciones se prueban en local (`npm run db:reset`) y Luis las aplica en Supabase Cloud.

## 12. Orden de trabajo

1. **PR 1 — Cuentas y grupos** ✅: login con email, `people`, roles, aprobación de entrada, secciones por grupo. La compra sigue funcionando.
2. **PR 2 — Esquema del calendario** ✅: tablas, permisos, historial y papelera, con pruebas de RLS.
3. **PR 3 — Evento y Hoy** ✅.
4. **PR 4 — Semana y Mes** ✅: componentes propios (sin librería); Semana con filtros por persona y carpeta; Mes solo con eventos puntuales y excepciones.
5. **PR 5 — Carpetas, compartir, perfiles sin cuenta y papelera** ✅: sin migración (el esquema y las RPCs ya estaban en el PR 2; los perfiles sin cuenta se crean desde Grupo desde el PR 1).
6. **PR 6 — Tiempo real y aviso de "está editando"** ✅: Postgres changes para lo que cada uno ve; para las franjas "Ocupado" un trigger manda un aviso vacío al canal `calendar:<grupo>` (`realtime.send`) y la app recarga. "Está editando" con Presence en el canal `event-edit:<evento>`.
7. **PR 7 — Navegación y flujos** ✅: volver atrás a la vista de donde se venía (`goBack()`), estado de las vistas en la URL, la hora de fin sigue a la de inicio, mensajes de error y reintentar.
8. **PR 8 — Tareas**: listas de tareas puntuales con el mismo modelo de propiedad y compartición que las carpetas. Diseño en `docs/tareas.md`. La barra queda en Compra · Tareas · Calendario · Grupo, con Historial dentro de Compra. Las tareas con fecha en Hoy llegarán después.

## 13. Calendario en el móvil (feed `.ics`)

Cada persona con cuenta puede crear, en **Cuenta → Calendario en el móvil**, un enlace privado al
que se suscribe el calendario del móvil (Google, iPhone, Outlook). Es de solo lectura y se
actualiza solo (Google, cada pocas horas). Decidido con Luis el 21 oct 2026.

- **Qué sale:** lo mismo que esa persona ve en la app, de todos sus grupos: sus eventos, los
  compartidos con ella y aquellos en los que participa, y las franjas «Ocupado». Los de otra
  persona llevan su nombre delante («Daniel · Pádel») y la carpeta en la descripción. Los puntuales
  de hace más de un año no salen.
- **Enlace:** `calendar_feeds` (un token aleatorio por persona; solo lo ve su dueña). Las RPCs
  `create_calendar_feed` (crea el enlace o lo cambia; el anterior deja de funcionar) y
  `delete_calendar_feed`.
- **Datos:** `feed_calendar(token)`, solo para `service_role`. No repite las reglas de permisos:
  durante esa llamada actúa como la dueña del enlace (`request.jwt.claim.sub`), así que
  `can_view_event` y `busy_events` responden igual que en la app.
- **Edge Function `calendar-feed`:** `GET /functions/v1/calendar-feed/<token>.ics`, sin
  comprobación de JWT (la clave es el token). El `.ics` se construye en `ics.ts` (TypeScript puro,
  con tests en `npm test` que comparan las repeticiones con `src/lib/recurrence.ts`): repeticiones
  como `RRULE` en la zona del evento (la hora se mantiene con el cambio de hora), días cancelados
  como `EXDATE` y días cambiados como otro `VEVENT` con `RECURRENCE-ID`.
- **Puesta en marcha:** `npx supabase db push` y
  `npx supabase functions deploy calendar-feed --no-verify-jwt`. En local la función no arranca
  con `db:start`; se prueba con `npx supabase functions serve`.
