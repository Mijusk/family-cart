# Notificaciones — Diseño V1

Avisos en el móvil (Web Push) aunque la app esté cerrada. Funcionan en Android y en el ordenador
desde el navegador; en iPhone/iPad (iOS 16.4 o posterior) solo con la app añadida a la pantalla de
inicio y abierta desde ese icono.

## 1. Decisiones (con Luis, 18-oct)

1. **Qué avisa:** recordatorios de eventos, tareas que te asignan y solicitudes para entrar en un
   grupo (a sus administradores). Nada más en la V1.
2. **Recordatorio por evento**, uno solo, en el formulario: Sin aviso · Al empezar · 15 minutos ·
   1 hora · 1 día · 1 semana antes · Personalizado (días, horas y minutos; como mucho 30 días).
   Es del evento, no de cada persona. En los que se repiten, avisa en cada repetición; un día
   cambiado o cancelado se respeta.
3. **A quién avisa un evento:** al dueño de la carpeta y a los participantes ("Con quién") que
   tengan cuenta. Compartir la carpeta con un grupo no avisa a nadie más. Si el dueño o un
   participante es un perfil sin cuenta (un niño), avisa a los administradores de los grupos con
   los que está compartido el evento (por la carpeta o como grupo extra) en los que está ese perfil.
4. **Evento de todo el día:** cuenta como si empezara a las 09:00 (hora del evento).
5. **Tareas:** avisa a cada persona que se añade a la tarea, salvo a quien se añade a sí mismo. Un
   perfil sin cuenta no recibe nada.
6. **Cada dispositivo se activa aparte**, desde Cuenta → «Avisos en este dispositivo». Al cerrar
   sesión, ese dispositivo deja de recibir los avisos de esa cuenta.

## 2. Cómo funciona

```
pg_cron (cada minuto) → dispatch_notifications()
   ├─ enqueue_event_reminders(): escribe en notifications los recordatorios que tocan
   └─ si hay algo pendiente: pg_net → Edge Function send-notifications
triggers en tasks / members ──────────→ notifications (tarea asignada, solicitud)
send-notifications: marca como enviadas las pendientes y las manda a cada dispositivo (web-push)
public/sw.js (en el móvil): muestra el aviso; al tocarlo abre la app en esa pantalla
```

- **`push_subscriptions`**: un dispositivo de una persona (`endpoint`, claves). Se guarda con la RPC
  `save_push_subscription` (si el dispositivo era de otra cuenta, pasa a la nueva); cada uno ve y
  borra solo los suyos. La función borra los que el navegador ya no acepta (404/410).
- **`notifications`**: la cola. Solo la base de datos y la función (service role) la tocan. Una
  `dedupe_key` evita escribir dos veces el mismo recordatorio. Las de más de 1 hora sin enviar ya no
  se envían, y todas se borran a los 7 días.
- **Recordatorios**: `enqueue_event_reminders(at)` mira los últimos 15 minutos (por si una vuelta de
  pg_cron se retrasa) y repite en SQL la lógica de `src/lib/recurrence.ts` (`is_series_date`).
- **`events.reminder_minutes`**: minutos antes del inicio; `null` = sin aviso.
- **Texto**: título del evento y «Hoy a las 17:30 · Clínica Sonrisas», «Mañana, todo el día»,
  «lun 20 oct a las 09:00».

## 3. Puesta en marcha en Supabase Cloud (una vez)

En PowerShell, en la carpeta del repo:

1. **Claves VAPID** (identifican a la app ante Google/Apple/Mozilla):
   `npx web-push generate-vapid-keys`. Guarda la pública y la privada; la privada no va al repo.
2. **Secretos de la función** (cambia los valores):
   ```
   npx supabase secrets set VAPID_PUBLIC_KEY=<pública> VAPID_PRIVATE_KEY=<privada> VAPID_SUBJECT=mailto:<tu email> NOTIFICATIONS_SECRET=<una contraseña larga inventada>
   ```
3. **Subir la función**, sin comprobación de JWT (la protege `NOTIFICATIONS_SECRET`):
   `npx supabase functions deploy send-notifications --no-verify-jwt`
4. **Migración**: `npx supabase db push`.
5. **Dos secretos en Vault** (Dashboard → SQL Editor), para que pg_cron sepa a quién llamar:
   ```sql
   select vault.create_secret('https://rbyevwmyusknlrltijxe.supabase.co/functions/v1/send-notifications', 'notifications_function_url');
   select vault.create_secret('<la misma NOTIFICATIONS_SECRET>', 'notifications_secret');
   ```
6. **Vercel**: variable de entorno `VITE_VAPID_PUBLIC_KEY` = la clave pública (Production y Preview)
   y volver a desplegar.

Hasta el paso 5 no se envía nada: los avisos esperan en la cola (y caducan en 1 hora).

Comprobar: activa los avisos en tu móvil, asígnate una tarea desde otra cuenta o pon un evento con
«Al empezar» dentro de 2 minutos. Si no llega: Dashboard → Edge Functions → send-notifications →
Logs, y en SQL `select * from notifications order by created_at desc limit 10`.

En local (`npm run db:start`) la función no arranca (`edge-runtime` está excluido) y no hay secretos
en Vault, así que los avisos solo se quedan en la cola; los tests lo cubren.

## 4. Fuera de esta V1

- Elegir qué tipos de aviso quiere cada persona, o silenciar un grupo.
- Varios recordatorios por evento, o recordatorios personales distintos del evento.
- Recordatorio de tareas con fecha.
- App nativa (Capacitor): cambiaría el envío a FCM/APNs, no la cola.
