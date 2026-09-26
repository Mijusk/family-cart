# family-cart
App web para gestionar la lista de la compra en familia en tiempo real: cualquier miembro añade lo que falta, se marca al comprarlo y queda un historial para volver a añadir productos habituales. Vue 3 + Pinia, pensada mobile-first.

## Desarrollo

```bash
npm install
npm run dev        # servidor de desarrollo (añade -- --host para probar desde el móvil en la red local)
npm run build      # type-check (vue-tsc) + build de producción
```

Stack: Vue 3 + Vite + TypeScript + Pinia + Vue Router. De momento los datos son de mentira
(`src/mocks/seed.ts`) y viven en memoria: al recargar la página vuelven al estado inicial.
TypeScript está fijado a 6.x porque `vue-tsc` todavía no es compatible con TypeScript 7.

```
src/
  types.ts          modelo de datos (refleja las tablas previstas en Supabase)
  mocks/seed.ts     grupo, miembros, productos, compras e historial de ejemplo
  stores/           group (grupo y miembro actual), list (lista, catálogo, compras), toast (avisos con deshacer)
  views/            ListView, ShoppingView, HistoryView, GroupView
  components/       formulario de añadir, filas, selector de cantidad, barra inferior, avisos
  styles/base.css   tokens de color/tipografía y estilos base
```
