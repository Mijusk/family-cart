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

Con los datos de ejemplo puedes entrar al grupo "Casa Martín" abriendo `/unirse/HUERTA7Q4K`,
o crear un grupo nuevo desde la pantalla de bienvenida. Cada navegador es un "dispositivo":
abre una ventana privada para simular a otra persona de la familia.

| Comando | Qué hace |
| --- | --- |
| `npm run db:start` / `db:stop` | Arranca / para Supabase local. Studio en http://127.0.0.1:54323 |
| `npm run db:reset` | Borra la base de datos y la recrea desde `supabase/migrations` + `supabase/seed.sql` |
| `npm run db:types` | Regenera `src/lib/database.types.ts` después de cambiar el esquema |
| `npm run build` | Type-check (vue-tsc) + build de producción |

`npm run dev` ya escucha en la red local (`--host`): al arrancar, además de
`http://localhost:5173` sale una línea `Network: http://<IP-de-tu-PC>:5173`, que es la que
abres en el móvil conectado al mismo wifi. Si esa línea "Network" no aparece, revisa que el
firewall de Windows no esté bloqueando el puerto.

No hace falta tocar `.env.local` para el móvil: con Supabase local (`127.0.0.1`), la app usa
el mismo host desde el que se abrió la página, así que en el móvil habla con la IP actual del PC.

TypeScript está fijado a 6.x porque `vue-tsc` todavía no es compatible con TypeScript 7.

## Cómo funciona

- **Sin registro:** cada dispositivo inicia sesión como usuario anónimo de Supabase, y
  `member_identities` lo liga a un miembro del grupo (el "device token" del diseño original). Un
  miembro puede tener varios dispositivos; el historial (`added_by`, `purchased_by`, `trips.member_id`)
  apunta siempre al miembro, nunca al dispositivo.
- **Unirse con un nombre que ya existe:** si el nombre coincide con el de un miembro (sin distinguir
  mayúsculas, tildes ni espacios), la app pregunta si es la misma persona en otro dispositivo (se
  vincula a ese miembro) o alguien distinto (se le pide un apodo o apellido: "Marta (García)"). Si se
  borran los datos del navegador, basta con volver a unirse con el mismo nombre y elegir "Soy yo".
- **Permisos:** RLS en todas las tablas: solo ves y tocas los datos de tus grupos. Crear y unirse a un
  grupo, sumar cantidades y finalizar/cancelar una compra son funciones SQL (RPC) atómicas, para que
  dos personas a la vez no se pisen.
- **Tiempo real:** los stores aplican cada cambio en local al momento, lo guardan en Supabase (en cola,
  en orden) y escuchan Realtime; al reconectar (móvil que vuelve de segundo plano) recargan todo.
- **Catálogo de autocompletado:** lo mantiene un trigger sobre `items`.
- **Varios grupos:** un dispositivo puede estar en varios grupos (familia, amigos…). Se cambia
  tocando el nombre del grupo arriba; el último abierto se recuerda en `localStorage`. "Salir de
  este grupo" desvincula el dispositivo; si era el último de esa persona, el miembro queda marcado
  (`members.left_at`) en vez de borrarse, para no perder sus compras del historial.
- **Historial:** se cargan las compras de los últimos 60 días.
- **Compras olvidadas:** un job de `pg_cron` (cada 15 min, dentro de la base de datos) cierra cualquier
  compra abierta hace más de 4 horas igual que "Finalizar compra": lo del carrito pasa a comprado a
  nombre de quien la empezó. `trips.closed_reason` guarda cómo terminó (`manual`, `timeout` o
  `cancelled`) y el historial avisa de las cerradas por tiempo.

```
supabase/
  migrations/       esquema, RLS, RPCs y publicación de Realtime
  seed.sql          grupo de ejemplo para desarrollo
src/
  types.ts          modelo de datos en camelCase
  lib/              cliente de Supabase, tipos generados y conversión filas ↔ modelo
  stores/           group (sesión, grupo, miembros), list (lista, catálogo, compras), toast (avisos con deshacer)
  views/            Lista, Modo compra, Historial, Grupo, Bienvenida, Unirse
  components/       formulario de añadir, filas, selector de cantidad, barra inferior, avisos
  styles/base.css   tokens de color/tipografía y estilos base
```
