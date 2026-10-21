# family-cart
App web para gestionar la lista de la compra en familia en tiempo real: cualquier miembro añade lo que falta, se marca al comprarlo y queda un historial para volver a añadir productos habituales. Vue 3 + Pinia, pensada mobile-first.

## Desarrollo

Necesitas Node y Docker (para la base de datos local de Supabase).

```bash
npm install
cp .env.example .env.local   # y pega la PUBLISHABLE_KEY que muestra db:start
npm run db:start             # levanta Supabase en Docker (Postgres + Auth + Realtime) y aplica migraciones y seed
npm run dev                  # http://localhost:5173
```

Los datos de ejemplo traen cuentas para probar (contraseña de todas: `demo1234`):

| Cuenta | Qué es |
| --- | --- |
| `marta@ejemplo.com` | Administradora de "Casa Martín" |
| `daniel@ejemplo.com` | Miembro de "Casa Martín" |
| `lucia@ejemplo.com` | Ha pedido unirse a "Casa Martín": acéptala entrando como Marta |

Además hay dos perfiles sin cuenta (Abuela Carmen y Pablo). Para probar a "reclamar" a Pablo, crea
una cuenta nueva y, en la bienvenida, elige "Tengo un código de perfil" con `PABLO7Q4KM`.
Abre una ventana privada para entrar con otra cuenta a la vez.

En local los emails (confirmación, recuperar contraseña) no se envían: se ven en
http://127.0.0.1:54324.

| Comando | Qué hace |
| --- | --- |
| `npm run db:start` / `db:stop` | Arranca / para Supabase local. Studio en http://127.0.0.1:54323 |
| `npm run db:reset` | Borra la base de datos y la recrea desde `supabase/migrations` + `supabase/seed.sql` |
| `npm run db:types` | Regenera `src/lib/database.types.ts` después de cambiar el esquema |
| `npm run db:test` | Comprueba los permisos (RLS y funciones) contra los datos de ejemplo; no cambia nada |
| `npm run build` | Type-check (vue-tsc) + build de producción |

`npm run dev` ya escucha en la red local (`--host`): al arrancar, además de
`http://localhost:5173` sale una línea `Network: http://<IP-de-tu-PC>:5173`, que es la que
abres en el móvil conectado al mismo wifi. Si esa línea "Network" no aparece, revisa que el
firewall de Windows no esté bloqueando el puerto.

No hace falta tocar `.env.local` para el móvil: con Supabase local (`127.0.0.1`), la app usa
el mismo host desde el que se abrió la página, así que en el móvil habla con la IP actual del PC.

TypeScript está fijado a 6.x porque `vue-tsc` todavía no es compatible con TypeScript 7.

## Cómo funciona

- **Cuentas:** se entra con email y contraseña (Supabase Auth). Cada cuenta es una **persona**
  (`people`), la misma en todos sus grupos; la crea un trigger al registrarse. Un hijo sin móvil es una
  persona sin cuenta que crean los administradores, y que más adelante puede "reclamar" su perfil con un
  código desde su propia cuenta.
- **Grupos y roles:** `members` une persona y grupo, con rol (`admin`/`member`) y estado
  (`pending`/`active`). Quien crea el grupo es administrador. Entrar con el enlace deja una solicitud
  pendiente que un administrador acepta; mientras tanto no se ve nada del grupo. El historial
  (`added_by`, `purchased_by`, `trips.member_id`) apunta siempre al miembro.
- **Secciones:** cada grupo activa calendario, lista de la compra o las dos (`groups.calendar_enabled`,
  `groups.shopping_enabled`), desde los ajustes del grupo.
- **Permisos:** RLS en todas las tablas: solo ves y tocas los datos de tus grupos, y solo los
  administradores cambian el grupo y sus miembros. Las operaciones de grupo (crear, pedir unirse,
  aceptar, roles, salir) y las de la compra (sumar cantidades, finalizar/cancelar) son funciones SQL
  (RPC) atómicas, para que dos personas a la vez no se pisen. `npm run db:test` las comprueba.
- **Tiempo real:** los stores aplican cada cambio en local al momento, lo guardan en Supabase (en cola,
  en orden) y escuchan Realtime; al reconectar (móvil que vuelve de segundo plano) recargan todo.
- **Sin conexión:** el service worker guarda la app, así que abre sin red, y el móvil guarda la última
  lista de la compra que mandó el servidor. Sin red se puede seguir añadiendo y marcando: los cambios
  esperan en cola y se guardan al volver la conexión (con la app abierta). Un aviso arriba lo indica.
- **Catálogo de autocompletado:** lo mantiene un trigger sobre `items`.
- **Varios grupos:** una persona puede estar en varios grupos (familia, pareja…). Se cambia
  tocando el nombre del grupo arriba; el último abierto se recuerda en `localStorage`. Al salir de un
  grupo (o ser quitado), el miembro queda marcado (`members.left_at`) en vez de borrarse, para no
  perder sus compras del historial. Si sale el último administrador, pasa a serlo el miembro más antiguo.
- **Historial:** se cargan las compras de los últimos 60 días.
- **Compras olvidadas:** un job de `pg_cron` (cada 15 min, dentro de la base de datos) cierra cualquier
  compra abierta hace más de 4 horas igual que "Finalizar compra": lo del carrito pasa a comprado a
  nombre de quien la empezó. `trips.closed_reason` guarda cómo terminó (`manual`, `timeout` o
  `cancelled`) y el historial avisa de las cerradas por tiempo.

```
supabase/
  migrations/       esquema, RLS, RPCs y publicación de Realtime
  seed.sql          cuentas y grupo de ejemplo para desarrollo
  tests/            comprobaciones de permisos (npm run db:test)
docs/
  calendario.md     diseño del calendario familiar (en desarrollo)
src/
  types.ts          modelo de datos en camelCase
  lib/              cliente de Supabase, cuentas (auth.ts), tipos generados y conversión filas ↔ modelo
  stores/           group (sesión, grupo, miembros), list (lista, catálogo, compras), toast (avisos con deshacer)
  views/            Entrar, Lista, Modo compra, Historial, Calendario, Grupo, Cuenta, Bienvenida, Unirse
  components/       formulario de añadir, filas, selector de cantidad, barra inferior, avisos
  styles/base.css   tokens de color/tipografía y estilos base
```
