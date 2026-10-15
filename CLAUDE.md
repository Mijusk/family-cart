# Family App (repo `family-cart`)

App web familiar: lista de la compra compartida (ya funciona) + calendario por persona
(rutina diaria, horario semanal, eventos puntuales) compartible con grupos. El nombre
definitivo de la app está por decidir; en la interfaz aún pone "Compra Familiar".

**Antes de tocar nada del calendario, lee `docs/calendario.md`**: diseño completo,
decisiones tomadas con Luis y plan de PRs (§12).

## Stack

- Vue 3 + Vite + TypeScript estricto (`vue-tsc`, `noUnusedLocals`) + Pinia + vue-router.
- Supabase: Postgres, Auth (email + contraseña), Realtime, Storage, RLS, RPCs
  `security definer`, pg_cron. Despliegue en Vercel.
- Sin librería de UI: CSS propio en `src/styles`, iconos en `AppIcon.vue`.

## Modelo de datos (ver `supabase/migrations/`)

- `auth.users` → `people` (una por humano; `user_id` null = perfil sin cuenta, p. ej. un
  niño; se reclama con `claim_code`) → `members` (persona en grupo: `role` admin/member,
  `status` pending/active, `left_at`; nunca se borran) → `groups` (`timezone`,
  `shopping_enabled`, `calendar_enabled`).
- Compra: `products`, `items`, `trips` apuntan a `members` para conservar el historial.
- Cambios de estado delicados van por RPC (`create_group`, `approve_member`,
  `set_member_role`, `claim_profile`…), no por update directo.

## Reglas de permisos

- Todas las tablas con RLS. La migración hace `revoke all` a `anon`/`authenticated` y
  concede solo lo necesario (por columna cuando aplica). Supabase da ALL por defecto a
  tablas nuevas: **cada tabla nueva necesita su revoke/grant explícito**.
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
Abuela Carmen y Pablo (código `PABLO7Q4KM`); grupo "Casa Martín" (invitación `HUERTA7Q4K`).

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
- Migraciones: mientras no haya datos reales, se puede editar la migración consolidada;
  cuando haya producción, solo migraciones nuevas.
- Si el entorno de Claude no puede instalar dependencias ni levantar Docker (sandbox en
  la nube), probar el SQL en un Postgres local con un stub de Supabase **incluyendo
  `alter default privileges ... grant all on tables to anon, authenticated`**, y pedir a
  Luis que ejecute `db:reset`, `db:test`, `db:types` y `build`.
- Al desplegar en Supabase Cloud: proveedor Email activado, inicio de sesión anónimo
  desactivado, Site URL y Redirect URLs (`https://<app>.vercel.app/**`) configurados.
