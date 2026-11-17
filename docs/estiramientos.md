# Estiramientos — Diseño V1

Sección del menú (las tres rayas de arriba a la derecha) con rutinas de estiramientos guiadas y un
dibujo de cada postura. Para todo el mundo, como Respiración (`docs/respiracion.md`).

## 1. Decisiones (con Luis, 17-nov)

1. **De momento, una rutina**: «Al despertar», los 18 estiramientos de la rutina de 5 minutos que pasó
   Luis (un vídeo de YouTube de estiramientos al despertar, 15 s cada uno). Se copian las posturas,
   nada del vídeo.
2. **Dibujos propios en SVG**, estilo plano «de dibujo animado»: el mismo personaje en todos, con los
   colores de la app. Luis probó una versión con más detalle (contorno, zapatillas…) y prefirió la
   sencilla.
3. **Guiada**, a pantalla completa como Respiración: dibujo grande, cómo hacerlo, cuenta atrás y
   «Siguiente: …».
4. **Sin migración ni recordatorio** en esta V1.

## 2. Cómo funciona

- `src/lib/stretchFigure.ts` (función pura con tests): dibuja el personaje a partir de sus
  articulaciones (cuello, cadera, hombros, codos, manos, rodillas, pies; cabeza de frente o de
  perfil). Los brazos y piernas `far` son los del otro lado: más oscuros y por detrás. `mirror` da la
  vuelta al dibujo (el mismo estiramiento al otro lado). Las flechas de puntos dicen hacia dónde se
  estira. Solo entran números y colores fijos, así que `StretchFigure.vue` lo pinta con `v-html`.
- `src/lib/stretching.ts`: las rutinas, sus estiramientos (texto y postura), los consejos y la
  seguridad, y el tiempo de la sesión: «Prepárate» 3 s, cada estiramiento lo que se elija (10, 15, 20
  o 30 s; la sentadilla sumo, el doble) y 5 s para cambiar de postura viendo el siguiente.
  `momentAt()`, `nextStart()` (Saltar) y `previousStart()` (Anterior) son funciones puras con tests.
- `StretchingView.vue` (`/estiramientos`): la rutina, todos sus dibujos (tocar uno empieza desde ahí,
  `?desde=N`), consejos e «Importante».
- `StretchingSessionView.vue` (`/estiramientos/:id`, sin barra): el tiempo de cada estiramiento se
  guarda en el dispositivo (`localStorage`). Se pausa sola si la app pasa a segundo plano y mantiene
  la pantalla encendida donde el navegador deja (Wake Lock).
- Siempre a la vista: «Si algo duele, marea u hormiguea, para y descansa».

## 3. La rutina «Al despertar»

| # | Estiramiento | Dibujo |
|---|---|---|
| 1–2 | Cuello hacia la derecha / izquierda | sentado con las piernas cruzadas, de frente |
| 3–4 | Cuello hacia atrás / hacia delante | sentado, de perfil, manos en las rodillas |
| 5–7 | Rodilla derecha, izquierda y las dos al pecho | tumbado boca arriba |
| 8 | Mariposa | sentado, de frente |
| 9 | Brazos arriba | sentado, de frente |
| 10–11 | Dorsal y tríceps derecho / izquierdo | sentado, de frente |
| 12–13 | Hombro derecho / izquierdo (brazo cruzado) | sentado, de frente |
| 14 | Postura del niño | de rodillas, de perfil |
| 15 | Cobra | boca abajo, de perfil |
| 16–17 | Zancada con la derecha / izquierda delante | de perfil |
| 18 | Sentadilla sumo (30 s) | de frente |

En el vídeo, «cuello hacia delante» se hace con las manos en la nuca; aquí se dibuja con las manos
en las rodillas y el texto dice que se pueden apoyar en la nuca sin tirar.

## 4. Fuera de esta V1

- Más rutinas (espalda, oficina, antes de dormir, después del deporte).
- Recordatorio diario (como el de Respiración, con migración).
- Sonido o vibración al cambiar de estiramiento.
