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

5. **Dos rutinas más** (Luis, 18-nov): «Pausa en el trabajo», para quien está sentado en la oficina,
   de 3 minutos como mucho, y «Después de entrenar», de menos de 5. Cada una sale de un vídeo corto
   (§3b), igual que la primera: se copian las posturas, los dibujos y los textos son propios.

## 2. Cómo funciona

- `src/lib/stretchFigure.ts` (función pura con tests): dibuja el personaje a partir de sus
  articulaciones (cuello, cadera, hombros, codos, manos, rodillas, pies; cabeza de frente o de
  perfil). Los brazos y piernas `far` son los del otro lado: más oscuros y por detrás. `mirror` da la
  vuelta al dibujo (el mismo estiramiento al otro lado). Las flechas de puntos dicen hacia dónde se
  estira. Solo entran números y colores fijos, así que `StretchFigure.vue` lo pinta con `v-html`.
- `src/lib/stretching.ts`: las rutinas, sus estiramientos (texto y postura), los consejos y la
  seguridad, y el tiempo de la sesión: «Prepárate» 3 s, cada estiramiento lo que se elija (10, 15, 20
  o 30 s; la sentadilla sumo, el doble) y 3 s para cambiar de postura viendo el siguiente.
  `momentAt()`, `nextStart()` (Saltar) y `previousStart()` (Anterior) son funciones puras con tests.
- Cada rutina tiene su tiempo por defecto (`defaultHold`: 15 s al despertar y después de entrenar,
  10 s en el trabajo), su dibujo de portada (`cover`) y su frase final. Los dibujos pueden ir sobre
  la esterilla, el suelo o una silla vista de frente o de lado (`scene`).
- `StretchingView.vue` (`/estiramientos?rutina=trabajo|entreno`): pestañas por rutina, cada una con todos sus dibujos (tocar uno empieza desde ahí,
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

## 3b. Las rutinas del 18-nov

**Pausa en el trabajo** (10 s cada uno, unos 2 min 56 s). Sale del vídeo «Estiramientos en el
puesto de trabajo» de Mutua Montañesa (2:40), quitando lo que es calentamiento para trabajo físico
y separando los dos lados:

| # | Estiramiento | Dibujo |
|---|---|---|
| 1–2 | Cuello hacia la derecha / izquierda | en la silla, de frente |
| 3 | Círculos con los hombros | en la silla, de frente |
| 4–5 | Hombro derecho / izquierdo (brazo cruzado) | en la silla, de frente |
| 6–7 | Tríceps derecho / izquierdo | en la silla, de frente |
| 8 | Muñecas (20 s, a mitad cambia de mano) | en la silla, de lado |
| 9 | Espalda alta (manos al frente) | en la silla, de lado |
| 10–11 | De pie: costado izquierdo / derecho | de pie, de frente |
| 12 | De pie: muslos (20 s, a mitad cambia de pierna) | de pie, de lado |

**Después de entrenar** (15 s cada uno, unos 3 min 36 s). Sale del vídeo «Estiramientos para
después del entrenamiento» de GymVirtual (3:02), todos de pie:

| # | Estiramiento |
|---|---|
| 1–3 | Piernas abiertas: al centro, a la derecha y a la izquierda |
| 4–5 | Zancada lateral a la derecha / izquierda |
| 6–7 | Detrás del muslo derecho / izquierdo (pierna delante sobre el talón) |
| 8 | Espalda colgando |
| 9–10 | Muslo derecho / izquierdo (talón al glúteo) |
| 11–12 | Cuello hacia la derecha / izquierda |

## 4. Fuera de esta V1

- Más rutinas (espalda, antes de dormir).
- Recordatorio diario (como el de Respiración, con migración).
- Sonido o vibración al cambiar de estiramiento.
