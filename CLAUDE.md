# Family App (repo `family-cart`)

App web familiar: lista de la compra compartida, tareas puntuales en listas compartibles y
calendario por persona (rutina diaria, horario semanal, eventos puntuales) compartible con grupos. La app se
llama **Family App** (el repo sigue siendo `family-cart`).

**Antes de tocar nada del calendario, lee `docs/calendario.md`**: diseño completo,
decisiones tomadas con Luis y plan de PRs (§12). Las tareas, en `docs/tareas.md`; las
notificaciones (Web Push), en `docs/notificaciones.md`.

## Stack

- Vue 3 + Vite + TypeScript estricto (`vue-tsc`, `noUnusedLocals`) + Pinia + vue-router.
- Supabase: Postgres, Auth (email + contraseña), Realtime, Storage, RLS, RPCs
  `security definer`, pg_cron. Despliegue en Vercel.
- Sin librería de UI: CSS propio en `src/styles`, iconos en `AppIcon.vue`.

## Modelo de datos (ver `supabase/migrations/`)

- `auth.users` → `people` (una por humano; `user_id` null = perfil sin cuenta, p. ej. un
  niño; se reclama con `claim_code`) → `members` (persona en grupo: `role` admin/member,
  `status` pending/active, `left_at`; nunca se borran) → `groups` (`timezone`,
  `shopping_enabled`, `tasks_enabled`, `calendar_enabled`; al menos una activa).
- Compra: `products`, `items`, `trips` apuntan a `members` para conservar el historial.
- Calendario: `calendars` (carpetas de una persona) → `events` (repetición en columnas
  simples) + `event_exceptions`, `event_participants`. Se comparte con grupos vía
  `calendar_shares` (`full`/`busy`) y `event_shares`. El modo ocupado se lee solo con la RPC
  `busy_events(gid)`. Borrado suave con `deletion_batch` y RPCs de papelera; `event_history`
  lo escriben triggers.
- Tareas: `task_lists` (de una persona, como las carpetas) → `tasks` (orden en `position`
  numérica; varias personas en `assignees`; `done_at`/`done_by` solo por la RPC `set_task_done`). Se comparten enteras con
  grupos vía `task_list_shares`; sin grupos es privada. Borrado suave como en el calendario.
- Notificaciones: `push_subscriptions` (dispositivos) y la cola `notifications`, que llenan
  triggers y pg_cron (`events.reminder_minutes`) y vacía la Edge Function `send-notifications`.
- Cambios de estado delicados van por RPC (`create_group`, `approve_member`,
  `set_member_role`, `claim_profile`…), no por update directo.

## Reglas de permisos

- Todas las tablas con RLS. La migración hace `revoke all` a `anon`/`authenticated` y
  concede solo lo necesario (por columna cuando aplica). Supabase da ALL por defecto a
  tablas nuevas: **cada tabla nueva necesita su revoke/grant explícito**.
  En Supabase Cloud `service_role` tampoco recibe nada por defecto: si una Edge Function usa
  una tabla, concédele a `service_role` justo lo que necesita.
- Funciones: `revoke execute on all functions` y lista explícita de `grant execute`.
  Al añadir una RPC, añádela a esa lista.
- Admin del grupo: gestiona miembros, perfiles sin cuenta y el calendario de otros
  (solo calendarios compartidos con ese grupo, nunca los privados).
- Cada cambio de permisos lleva su test en `supabase/tests/permissions.sql`.

## Comandos

```
npm run dev        # front en localhost:5173
npm run db:start   # Supabase local (requiere Docker Desktop arrancado)
npm run db:reset   # aplica migraciones + seed.sql
npm run db:test    # tests de permisos; debe acabar en "N ok, 0 failed"
npm run db:types   # regenera src/lib/database.types.ts desde la BD local
npm run build      # vue-tsc + vite build
```

Datos de prueba (`seed.sql`), contraseña `demo1234`: `marta@ejemplo.com` (admin),
`daniel@ejemplo.com` (miembro), `lucia@ejemplo.com` (pendiente); perfiles sin cuenta
Abuela Carmen y Pablo (código `PABLO7Q4KM`); grupo "Casa Martín" (invitación `HUERTA7Q4K`). Calendario: "Trabajo" de Marta y "Colegio" de
Pablo compartidos en completo, "Gimnasio" de Daniel en modo ocupado, "Médico" de Marta privado.
Tareas: "Pendientes" de Marta compartida con el grupo y "Amigos con quien quedar" de Daniel privada.

## Convenciones

- Interfaz y mensajes en español de España. Semana empieza en lunes, formato 24 h,
  zona `Europe/Madrid` por defecto (cada grupo tiene la suya).
- Código, nombres y comentarios en inglés.
- Errores al usuario vía `friendlyError()` (`src/utils/errors.ts`); añade ahí los
  mensajes de nuevas excepciones SQL.
- Colores de persona: `src/utils/colors.ts` y `random_person_color()` en SQL deben
  coincidir (contraste suficiente con texto blanco).
- Preparada para PWA/Capacitor más adelante: nada que dependa solo de escritorio.

## Forma de trabajar

- Luis (frontend dev) revisa todo. Un PR por bloque del plan, en rama `feat/...`;
  nunca commits directos a `main`.
- Migraciones: una nueva por PR (Luis las aplica en Supabase Cloud). Mientras no haya datos
  reales se puede rehacer una migración que aún no esté aplicada.
- Si el entorno de Claude no puede instalar dependencias ni levantar Docker (sandbox en
  la nube), probar el SQL en un Postgres local con un stub de Supabase **incluyendo
  `alter default privileges ... grant all on tables to anon, authenticated`** y un `realtime.send(payload, event, topic, private)` falso, y pedir a
  Luis que ejecute `db:reset`, `db:test`, `db:types` y `build`. Para probar la interfaz sin
  Docker sirve PostgREST (binario estático) sobre ese Postgres, con un proxy de Vite de
  `/rest/v1` y una sesión con JWT firmado a mano en `localStorage`.
- Lógica del calendario fuera de los componentes: fechas en `src/utils/days.ts`, repeticiones
  en `src/lib/recurrence.ts` (funciones puras), textos en `src/lib/eventText.ts`, datos en
  `src/stores/calendar.ts`.
- Volver atrás siempre con `goBack()` de `src/router/back.ts` (como el botón atrás del móvil), no con
  un enlace fijo; el estado de las vistas (día, semana, filtros, día elegido del mes) va en la URL.
- Al desplegar en Supabase Cloud: proveedor Email activado, inicio de sesión anónimo
  desactivado, Site URL y Redirect URLs (`https://<app>.vercel.app/**`) configurados.
