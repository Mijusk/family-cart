# Tareas — Diseño V1

Sección de **tareas puntuales**, de una sola vez ("comprar manguera", "quedar con Javi"). Lo que se
repite va en la rutina del calendario, no aquí.

Sigue el **mismo modelo de propiedad y compartición que las carpetas del calendario**
(`docs/calendario.md` §4–§7): una lista es de una persona y se comparte entera con grupos. Así el
calendario puede usar después las mismas piezas.

## 1. Decisiones

1. **Listas de una persona**, como las carpetas. Sin grupos, la lista es privada.
2. **Se comparte la lista entera** con 0..n grupos, nunca tarea a tarea. Solo con grupos en los que
   la dueña es miembro activa (y quien comparte también).
3. **Quién gestiona una lista** (renombrar, compartir, borrar): la dueña y quien pueda gestionarla
   (`can_manage_person`: los administradores de un grupo de un perfil sin cuenta). A diferencia del
   calendario, los administradores no gestionan las listas de otros por estar compartidas con su
   grupo.
4. **Quién usa las tareas** (crear, editar, marcar, reordenar, borrar): cualquiera que vea la lista.
5. **Asignar:** a alguien que vea la lista (la dueña o un miembro activo de un grupo con el que está
   compartida). En una lista privada, solo a la dueña o a nadie. Si alguien deja de ver la lista
   (sale del grupo o se deja de compartir con él), sus tareas de esa lista quedan sin asignar.
6. **Fecha sin hora** (`due_date`), opcional. Atrasada = fecha pasada y sin hacer.
7. **Orden manual** con `position` numérica: mover una tarea es un solo `update` con un valor entre
   sus dos vecinas. Las nuevas entran abajo (la base de datos pone `max + 1`). "Ordenar por fecha"
   solo cambia la vista.
8. **Hechas:** `done_at` y `done_by` solo por la RPC `set_task_done`, para que no se puedan falsear.
   En la vista van plegadas abajo, las de los últimos 30 días; solo esas se cargan.
9. **Borrado suave** con `deletion_batch`, como en el calendario: al borrar una lista, sus tareas
   comparten lote y vuelven juntas. Aviso "Deshacer" al borrar. Papelera y vaciado a los 30 días con
   el mismo `empty_trash()`.
10. **Registro:** quién creó y editó cada tarea y cuándo (icono ⓘ). Marcar, reordenar y borrar no
    cuentan como edición: tienen sus propios campos. Sin tabla de historial en V1.
11. **Sección por grupo:** `groups.tasks_enabled`, activable desde Grupo. Al menos una de las tres
    secciones activa.
12. **Al crear un grupo**, su creador recibe la lista "Pendientes" compartida con él.

## 2. Modelo de datos

*Auditoría* = `created_by`, `created_at`, `updated_by`, `updated_at`, `deleted_by`, `deleted_at`,
`deletion_batch` (como en el calendario).

**task_lists**
- `id`, `owner_id` → people, `name` (1–60)
- auditoría

**task_list_shares**
- `list_id`, `group_id`, `shared_by`, `shared_at`

**tasks**
- `id`, `list_id`, `title` (obligatorio, sin espacios a los lados, 1–120), `notes` (opcional, ≤ 2000)
- `assigned_to` → people (opcional), `due_date` (opcional), `position` (numeric)
- `done_at`, `done_by`
- auditoría

**groups**: `tasks_enabled` (por defecto `true`); el check `groups_some_section` pasa a cubrir las
tres secciones.

## 3. Permisos

Funciones auxiliares: `can_manage_task_list(lid)`, `can_view_task_list(lid)`,
`can_share_task_list(lid, gid)`, `person_sees_task_list(pid, lid)` (para `assigned_to`),
`is_live_task_list(lid)`.

- **Ver la lista y sus tareas:** quien la gestiona, y los miembros activos de los grupos con los que
  está compartida (mientras no esté borrada).
- **Gestionar la lista:** `can_manage_person(dueña)`. Solo se actualiza `name` por columna; borrar y
  restaurar van por RPC.
- **Tareas:** insert y update por columnas (`title`, `notes`, `assigned_to`, `due_date`, `position`)
  para quien ve la lista; sin `delete`. `created_by`/`updated_by` los ponen triggers.
- **Salir de un grupo** (`retire_member`): sus listas dejan de compartirse con él y deja de estar
  asignado a tareas de listas que ya no ve.
- **Reclamar un perfil:** una cuenta con listas ya no es nueva (como con las carpetas).
- **RPCs:** `set_task_done`, `delete_task`, `restore_task`, `delete_task_list`,
  `restore_task_list`, `purge_task`, `purge_task_list`. Una tarea borrada junto con su lista solo
  vuelve restaurando la lista.

## 4. Pantallas

- **Tareas** (`/tareas`): pestañas "Todas" y una por lista visible en el grupo elegido (las
  compartidas con él y mis privadas). Filtro Todas / Mías. Se añade escribiendo el título: sale al
  momento y el cursor sigue en la caja para escribir la siguiente (si falla al guardar, desaparece
  con un aviso). Arrastrar
  para ordenar (también en el móvil, pulsando y arrastrando). Fecha como etiqueta ("Hoy", "Mañana",
  "jue 23 oct"; atrasada en rojo suave). "Ordenar por fecha". Hechas plegadas abajo.
- **Tarea** (`/tareas/:id`): título, nota, persona, fecha, ⓘ con creada y editada por quién y
  cuándo, borrar con "Deshacer".
- **Mis listas** (`/tareas/listas`, enlace en la cabecera de Tareas): crear, renombrar, compartir con
  mis grupos (casillas) y borrar; deja claro si es privada o con quién se comparte. Los
  administradores eligen arriba de quién son las listas (yo o un perfil sin cuenta), como en Mis
  carpetas. Desde aquí, la **Papelera** de tareas.

Navegación: la barra queda en **Calendario · Tareas · Compra · Grupo** (la app abre en Hoy). Historial pasa dentro de
Compra (enlace en su cabecera, misma ruta `/historial`).

Fechas en español, semana de lunes, "hoy" en la zona horaria del grupo.

## 5. Preparado para el calendario (sin construir)

Las tareas con fecha saldrán en Hoy y en su día; las hechas, en el día en que se marcaron
(`done_at` en la zona del grupo; el store solo carga las hechas de los últimos 30 días, así que
para días más antiguos habría que pedirlas aparte). El store de tareas expone las tareas por día para que las vistas
del calendario las lean sin otra consulta.
