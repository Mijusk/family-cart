# Respiración — Diseño V1

Sección del menú (las tres rayas de arriba a la derecha) con ejercicios de respiración guiados.
Pensada para Paula (nódulos en las cuerdas vocales, se queda sin aire al hablar y a veces le cuesta
subir montañas), pero la ve todo el mundo (decisión de Luis, 12-nov).

## 1. Decisiones (con Luis, 12-nov)

1. **Header nuevo** en todas las pantallas con barra: «Buenos días» (06:00–13:59), «Buenas tardes»
   (14:00–20:59) o «Buenas noches», con el nombre de pila y la hora del grupo; a la derecha la campana
   (últimos avisos, `docs/notificaciones.md` §5) y el menú (`AppMenu.vue`: Respiración, Avisos, Cuenta).
2. **Por secciones**: Relajarse, Deporte y Hablar, cada una con sus ejercicios y sus consejos. Muy
   visual: un círculo que crece al tomar aire y se encoge al soltarlo, con un color por sección.
3. **Nunca se aguanta el aire**: ni 4-7-8 ni respiración cuadrada. Lo pide la guía de Paula: las
   retenciones y las espiraciones largas pueden incomodar a quien ya nota falta de aire.
4. **Recordatorio diario** opcional, a la hora que elija cada persona (`people.breathing_reminder_time`).
5. **Las frases** del ejercicio de habla las elige Claude (abajo, §3).

## 2. Cómo funciona

- Contenido y tiempos en `src/lib/breathing.ts` (funciones puras con tests): ejercicios, consejos,
  frases y avisos de seguridad. Cada ronda es «tomar aire → soltar» (o «tomar aire → hablar →
  descansar» en las frases); `momentAt()` dice en qué punto está la sesión.
- `BreathingView.vue` (`/respiracion?tipo=relax|sport|speech`): secciones, ejercicios, consejos,
  recordatorio y «Importante» (no sustituye al logopeda, señales de alarma, a quién acudir).
- `BreathingSessionView.vue` (`/respiracion/:id`, sin barra): antes de empezar se ven los pasos, la
  duración (1, 2, 3 o 5 min) y los segundos de cada fase (de medio en medio, con límites:
  tomar aire 1,5–6 s, soltar 2–8 s). Se guardan en el dispositivo (`localStorage`), por ejercicio.
  Empieza con «Prepárate» 3 s, la última ronda siempre se termina, se pausa sola si la app pasa a
  segundo plano y mantiene la pantalla encendida donde el navegador deja (Wake Lock).
- Siempre a la vista: «Si notas mareo, ahogo o malestar, para y respira con normalidad».

## 3. Ejercicios

| Sección | Ejercicio | Dibujo | Tiempos |
|---|---|---|---|
| Relajarse | Respiración tranquila (diafragmática) | círculo | 3 s / 4 s |
| Relajarse | Labios fruncidos | círculo + ondas al soltar | 3 s / 5 s |
| Relajarse | Para desconectar | círculo | 4 s / 6 s |
| Deporte | Caminar con ritmo: 2 pasos / 4 pasos | puntos por paso | 2 s / 4 s |
| Deporte | Subir cuestas: 2 pasos / 3 pasos | puntos por paso | 2 s / 3 s |
| Deporte | Recuperar el aliento (inclinada, labios fruncidos) | círculo + ondas | 2 s / 4 s |
| Hablar | Aire continuo con «sss» (sin voz) | barra que se vacía igual | 3 s / 4 s |
| Hablar | Contar sin prisa, uno por segundo | números | 3 s / 4 s |
| Hablar | Frases cortas (o un poco más largas) | la frase | 3 s / 4 s + 2 s de descanso |

**Frases**: cotidianas, sin palabras difíciles, de 4–6 sílabas (cortas) o 8–11 (más largas), y
empezando por un sonido suave (m, n, l, ll) para que la voz arranque sin golpe (ataque vocal suave).

Fuentes: la guía orientativa que pasó Luis (respiración y nódulos), recomendaciones de higiene
vocal para nódulos (beber agua, no carraspear ni gritar, frases cortas, pausas para respirar) y las
guías de respiración con labios fruncidos al caminar y subir (inspirar 2 pasos, espirar 4) de
servicios de rehabilitación respiratoria.

## 4. Fuera de esta V1

- Sonido o vibración en cada fase.
- Historial de sesiones o rachas.
- Ejercicios con voz más específicos: mejor con su logopeda.
