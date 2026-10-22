# Family-App desde un chat de IA — Diseño V1

Usar Family-App desde Claude (escritorio, web y móvil) y, más adelante, desde ChatGPT: «¿qué tengo el
jueves?», «ponme dentista el martes 4 a las 17:30», «añade leche a la compra». La IA lee y escribe
como si lo hiciera la persona en la app, con su propia cuenta.

## 1. Decisiones (con Luis, 22-oct)

1. **Qué puede hacer:** ver el calendario, las tareas y la compra; crear y cambiar eventos (el evento
   entero, o un solo día de algo que se repite: cambiarlo o cancelarlo); crear, cambiar y marcar
   tareas; añadir productos a la compra. **Nada se borra** desde la IA (ni eventos, ni tareas, ni
   productos), ni se tocan grupos, personas o carpetas.
2. **Confirma antes:** cada herramienta que escribe le dice a la IA que resuma lo que va a hacer (con el
   día de la semana y la fecha) y espere un «sí». Claude, además, pide permiso por herramienta.
3. **Carpetas:** las mismas que en el formulario, también las de otras personas que el usuario edita
   como admin (p. ej. el Colegio de Pablo). Sin carpeta, la última usada.
4. **El token se limita en la base de datos**, no solo con RLS (ver §3).
5. **Textos:** pantalla «*Claude* quiere acceder a tu Family-App» (con el nombre que da la app) y en
   Cuenta la sección «Conectado con IA», con «Quitar acceso».
6. **Decidido en el desarrollo** (revisar si no encaja): un evento nuevo **no** se comparte con grupos
   extra salvo que se pida (`grupos_extra`); en la app el formulario marca por defecto el grupo actual,
   pero desde un chat no hay «grupo actual». Su zona horaria es la del primer grupo de la persona con el
   que está compartida la carpeta (o su grupo más reciente); hoy todas son `Europe/Madrid`, igual que el
   valor por defecto que deja la app.

## 2. Cómo funciona

```
Claude ── POST /functions/v1/mcp (sin token) ──▶ 401 + WWW-Authenticate: resource_metadata=…
   │                                               └ /functions/v1/mcp/oauth-protected-resource
   │                                                 (RFC 9728: el servidor de autorización es Supabase Auth)
   ├─ registro dinámico de cliente en Supabase Auth (/auth/v1/oauth/clients/register)
   ├─ /auth/v1/oauth/authorize ──▶ https://<app>/autorizar?authorization_id=…
   │        (si no hay sesión: /entrar y vuelta) → «Permitir» → approveAuthorization()
   ├─ código → token (OAuth 2.1 con PKCE; 1 h, y se renueva con el refresh token)
   └─ POST /functions/v1/mcp con Bearer <token de la persona>
          withSupabase(): comprueba la firma (ES256, JWKS del proyecto) → cliente con ESE token
          herramientas → PostgREST → check_api_request() + RLS → triggers (historial, avisos)
```

- **Edge Function `supabase/functions/mcp/`** (Deno), con las librerías oficiales:
  `@modelcontextprotocol/server` 2.x (transporte Streamable HTTP, **sin estado**: un servidor nuevo por
  petición) y `@supabase/server` (`withOAuthProtectedResource()` sirve los metadatos y añade
  `WWW-Authenticate` a todo 401; `withSupabase({ auth: 'user' })` valida el token y da un cliente con
  la sesión de la persona). Se despliega **sin la comprobación de JWT de la pasarela**
  (`[functions.mcp] verify_jwt = false`): la primera petición llega sin token. **Nunca usa la service
  role**: todo pasa por RLS, como en la app.
- **Reutiliza la lógica de la app**: importa desde `src/` `recurrence.ts` (`occurrencesBetween`),
  `eventText.ts`, `mappers.ts`, `types.ts`, `text.ts`, `errors.ts` y `utils/isoDays.ts` (las funciones
  puras de fechas, sacadas de `days.ts`, que importa `vue`). Esos ficheros usan imports relativos con
  `.ts` para que Deno los cargue; `mcp/imports.test.ts` falla si alguno deja de cumplirlo. Por eso el
  despliegue lleva `--use-api` (empaqueta en el servidor y admite ficheros fuera de `supabase/`).
- **Ficheros:** `index.ts` (montaje e instrucciones para la IA), `context.ts` (la persona, sus grupos,
  nombres, errores), `calendar.ts`, `tasks.ts`, `shopping.ts` (herramientas), `input.ts` y `agenda.ts`
  (funciones puras con sus tests: validación de la entrada con las reglas del formulario, el día a día
  expandido y los textos).
- **Escribe igual que la app:** inserta en `events` y luego `event_shares` / `event_participants`
  como `saveEvent()`; un solo día como `saveOccurrence()` (solo lo que difiere de la serie; si no queda
  nada, borra la excepción); tareas al final de la lista; la compra suma a una línea pendiente del mismo
  producto con `merge_item`. `created_by`, `last_calendar_id`, `event_history` y los avisos los ponen los
  triggers de siempre: un evento creado desde la IA queda a nombre de la persona y avisa (recordatorio)
  a dueño y participantes igual que uno de la app (probado en local).

### Herramientas

| Herramienta | Qué hace |
| --- | --- |
| `quien_soy` | Persona, grupos (zona horaria, secciones), fecha y hora de ahora en cada zona y los próximos 14 días con su día de la semana. |
| `listar_carpetas` | Carpetas en las que puede crear (`editable_calendar_ids`), de quién son, con quién se comparten, y la de por defecto. |
| `listar_personas` | Personas de sus grupos (también sin cuenta), con su `persona_id`. |
| `ver_eventos` | Del día «desde» al «hasta» (máx. 62 días), expandido por día: repeticiones, cancelados fuera, cambiados con sus datos, modo ocupado como «Ocupado» (`busy_events`). Filtro por persona o grupo. |
| `crear_evento` | Como el formulario: valida, carpeta por defecto la última usada, fin antes que inicio = cruza medianoche, sin fin dura 1 h, participantes, aviso. Devuelve «Dentista · mar 4 nov, 17:30–18:30 · carpeta Médico» y el enlace. |
| `recordatorio` (en crear y editar) | Un evento que solo es su aviso («recuérdame tomar la pastilla»): solo hora de inicio, avisa al empezar, no sale en Semana ni Mes. `ver_eventos` lo marca con `recordatorio: true`. |
| `editar_evento` | El evento entero (la serie); lo que no se pasa no cambia, `null` borra. Mover el inicio mueve el fin. |
| `cambiar_dia` / `cancelar_dia` | Un solo día de algo que se repite (excepción `modified` / `cancelled`). |
| `ver_tareas` / `crear_tarea` / `editar_tarea` / `marcar_tarea` | Listas y tareas pendientes; crear al final; cambiar; hecha con `set_task_done`. |
| `ver_compra` / `anadir_compra` | La lista de un grupo; añadir hasta 30 productos, sumando a los que ya están. |

Las descripciones (en español) le explican a la IA el formato (AAAA-MM-DD, HH:MM en 24 h, hora local),
que pregunte si falta la hora, el día, la carpeta o la lista, y que confirme antes de escribir.

## 3. Seguridad

- **Lo que ve y cambia lo decide RLS**, con el token de la persona: lo mismo que en la app, nunca más.
- **El token de una app conectada está limitado en la base de datos** (migración
  `20261027120000_ai_connector.sql`). Los permisos OAuth de Supabase no recortan la API de datos: sin
  esto, el token podría hacer lo mismo que la app (salir de un grupo, cambiar roles, vaciar la papelera).
  Los tokens OAuth llevan `client_id` (las sesiones de la app no) y:
  - `check_api_request()`, la función *pre-request* de PostgREST (`pgrst.db_pre_request`), deja pasar
    sin más a la app y a la service role, y a una app conectada solo le permite una lista cerrada de
    tablas y RPCs (las que usa la función). Cubre también las RPCs `security definer`, que se saltan la
    RLS, y GraphQL.
  - Comprueba además que **la sesión de esa app siga existiendo**: «Quitar acceso» (`revokeGrant`) la
    borra y el token deja de valer **al momento**, no al caducar (hasta 1 h).
  - Políticas *restrictive*: sin fotos (Storage) y sin ver los dispositivos (`push_subscriptions`,
    también por Realtime).
  - Tests en `supabase/tests/permissions.sql` (bloque «Connected AI apps»).
- **Límite que no podemos cerrar nosotros:** la **API de Auth** de Supabase acepta estos tokens en
  `/auth/v1/user` y `/auth/v1/factors`, así que quien tuviera el token podría **cambiar la contraseña o
  añadir un factor MFA** (probado en local). Es un fallo conocido de Supabase, abierto
  ([supabase/auth#2877](https://github.com/supabase/auth/issues/2877)), sin ajuste ni hook todavía.
  El token solo lo guarda Anthropic (el modelo no lo ve) y dura 1 hora. Lo reducen:
  **«Secure email change»** (activado por defecto: el cambio de email se confirma en los dos correos)
  y **«Secure password change»** (pide volver a identificarse para cambiar la contraseña si la sesión no es reciente). Cuando
  Supabase lo arregle, quitar este punto.
- **Inyección de instrucciones:** títulos, notas, lugares y nombres llegan como **datos** (JSON con un
  campo `aviso` que lo recuerda) y las instrucciones del servidor le dicen a la IA que no los obedezca.
  Aunque lo hiciera, solo podría lo que la persona puede, sin borrar.
- **Tokens:** la función no los registra ni los guarda (los errores se registran sin la petición).
- **Abuso:** cuerpo de petición de 64 KB como mucho (413), longitudes con los límites de la base,
  62 días por consulta, 30 productos y 20 participantes por llamada.
- **Pantalla de permiso:** dice a qué dirección vuelve el navegador, para que una app que se haga pasar
  por Claude no pase desapercibida (con registro dinámico, cualquiera puede registrarse como «Claude»).

## 4. Puesta en marcha (una vez)

En PowerShell, en la carpeta del repo, con el PR fusionado en `main`:

1. **Migración:** `npx supabase db push`.
2. **Servidor OAuth** — Dashboard → Authentication → **OAuth Server**:
   - Activar el servidor OAuth (el nombre exacto del interruptor puede variar).
   - **Authorization Path:** `/autorizar` (se suma a la Site URL:
     `https://family-cart-ecru.vercel.app/autorizar`).
   - Activar el **registro dinámico de clientes** (Dynamic Client Registration; es lo que usa Claude).
3. **URLs** — Authentication → URL Configuration: comprueba que la **Site URL** es
   `https://family-cart-ecru.vercel.app` y que en **Redirect URLs** sigue `https://family-cart-ecru.vercel.app/**`.
   La dirección de vuelta de Claude no va aquí: la registra Claude al conectarse.
4. **Seguridad recomendada** — Authentication → Providers → Email (o «Sign In / Providers»): activa
   **Secure password change** y comprueba que **Secure email change** está activado (ver §3).
5. **Subir la función** (sin comprobación de JWT; `--use-api` porque importa ficheros de `src/`):
   `npx supabase functions deploy mcp --no-verify-jwt --use-api`
6. **App:** al fusionar el PR, Vercel despliega la pantalla `/autorizar` y la sección de Cuenta.
   Espera a que termine antes del paso 7.
7. **Claude** (web o escritorio; luego también sale en el móvil): **Ajustes → Conectores → Añadir
   conector personalizado**. Nombre: `Family-App`. URL:
   `https://rbyevwmyusknlrltijxe.supabase.co/functions/v1/mcp` (también está en Cuenta → Conectado
   con IA, con botón de copiar). Pulsa **Conectar**: se abre Family-App, entras si hace falta y pulsas
   **Permitir**. En un chat, activa el conector en el menú de herramientas.
8. **Probar:** «¿qué tengo esta semana?», «ponme dentista el martes a las 17:30 en Médico». El evento
   aparece en la app al momento. En Cuenta → Conectado con IA sale «Claude».

Si algo falla: Dashboard → Edge Functions → mcp → Logs. Opcional: el secreto `APP_URL` cambia la
dirección de los enlaces que devuelve (por defecto `https://family-cart-ecru.vercel.app`).

## 5. Probar en local

`npm run db:start` crea una clave de firma ES256 local si falta (`supabase/signing_keys.json`, fuera
de git; `withSupabase` no acepta tokens HS256) y arranca Supabase con el servidor OAuth activado
(`config.toml`).

```
npm run db:start
npm run db:reset
npx supabase functions serve mcp        # en otra terminal
npm run dev                             # la pantalla /autorizar, en otra
npx @modelcontextprotocol/inspector     # en otra: abre el navegador
```

En el Inspector: transporte **Streamable HTTP**, URL `http://127.0.0.1:54321/functions/v1/mcp`,
con su flujo OAuth (en Auth Settings): registra el cliente, abre `localhost:5173/autorizar`,
entras como `marta@ejemplo.com` / `demo1234` y Permitir. Luego **List Tools** y prueba `quien_soy` o
`ver_eventos`.

## 6. Fuera de esta V1

- Borrar (eventos, tareas, productos), tachar la compra, crear carpetas o listas, compartir.
- Cambiar una serie «a partir de este día».
- Avisar al momento al crear un evento (hoy, como en la app, avisan los recordatorios y los cambios).
- Límite de peticiones por persona (hoy: los límites de tamaño de §3 y los de Supabase).

## 7. Siguiente paso: ChatGPT

El servidor es estándar (MCP + OAuth 2.1 con registro dinámico), así que no debería hacer falta código
nuevo:

- En ChatGPT, los conectores MCP propios se añaden en los planes de empresa (Business, Enterprise, Edu)
  y el **administrador del workspace tiene que permitirlos** (y, según el plan, activar el modo
  desarrollador). En Plus/Pro, si está disponible, con el modo desarrollador.
- Se añade con la misma URL de la función. ChatGPT se registra solo y la pantalla dirá «ChatGPT quiere
  acceder…». En Cuenta aparecerá como otra app, con su «Quitar acceso».
- Comprobar al hacerlo: que ChatGPT acepta el `WWW-Authenticate` y los metadatos tal cual, si pide
  herramientas con nombres concretos (para su modo de investigación pedía `search` y `fetch`) y cómo
  muestra las confirmaciones.

Después, **un chat dentro de la app** con la API de Claude: una Edge Function que llame a la API con
estas mismas herramientas (sin OAuth: con la sesión de la app), y una pantalla de chat.
