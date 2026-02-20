# Plan: Shimmer en todos los módulos del tab menu (context)

**Objetivo:** Sustituir el texto genérico "Loading…" / "Loading notes…" por skeletons con efecto shimmer que **repliquen la forma** del contenido real de cada módulo, para una sensación de carga consistente y profesional en todo el contexto.

**Referencia:** El board ya tiene `SkeletonBoard` en `components/skeletons/SkeletonBoard.tsx` usando `Skeleton` (`components/ui/skeleton.tsx`) y la clase `.cq-skeleton-shimmer` en `globals.css`. Reutilizar el mismo componente base y la misma animación.

---

## Orden de implementación (módulo por módulo)

Se implementa de uno en uno para no mezclar cambios y poder revisar cada módulo.

| Orden | Módulo | Componente FromCache que muestra loading | Skeleton nuevo |
|-------|--------|------------------------------------------|----------------|
| 1 | Home (project picker) | — (RSC; opcional Suspense fallback) | SkeletonProjectPicker |
| 2 | Responsable del proyecto (Owner) | ContextOwnerFromCache | SkeletonOwner |
| 3 | Notas | ContextNotesFromCache | SkeletonNotes |
| 4 | Ideas | ContextIdeasFromCache | SkeletonIdeas |
| 5 | Presupuestos | ContextBudgetsFromCache | SkeletonBudgets |
| 6 | Tareas (Todos) | ContextTodosFromCache | SkeletonTodos |

---

## Diseño de cada skeleton (forma según contenido real)

### 1. Home / Project picker (opcional)

- **Cuándo se ve:** Si en el futuro el home usa Suspense y tarda en resolver, o si hay un estado de carga client-side para la lista de proyectos.
- **Forma del contenido real:** Header (título + posible botón), subtítulo centrado, grid `sm:grid-cols-2 lg:grid-cols-3` de tarjetas. Cada tarjeta: título (nombre proyecto), línea de subtítulo (cliente), línea pequeña (categoría).
- **Skeleton:** Mismo layout: header con Skeleton para el título; párrafo Skeleton para el subtítulo; grid de 6 cards (2 filas x 3). Cada card: Skeleton para título ancho, Skeleton corto para subtítulo, Skeleton más corto para categoría. Clases de padding y gap iguales al picker real.
- **Archivos:** `components/skeletons/SkeletonProjectPicker.tsx` (nuevo). Usar en `app/page.tsx` como fallback de `<Suspense>` si se envuelve el contenido del home.

### 2. Responsable del proyecto (Owner)

- **Forma del contenido real:** Título "Responsable del proyecto"; uno o dos bloques (cliente y/o empresa). Cada bloque: card con borde, header (icono + nombre + "Ver perfil"), cuerpo con líneas de texto (email, teléfono, dirección, etc.).
- **Skeleton:** Título con Skeleton (h2). Dos cards: primera con header (Skeleton icono + Skeleton nombre + Skeleton link) y cuerpo con 4–5 líneas (Skeleton de ancho variable). Segunda card similar pero un poco más corta. Mantener `max-w-2xl`, `space-y-6`, `rounded-lg border border-border bg-card`.
- **Archivos:** `components/skeletons/SkeletonOwner.tsx` (nuevo). En `ContextOwnerFromCache` sustituir el `<div>Loading…</div>` por `<SkeletonOwner />`.

### 3. Notas

- **Forma del contenido real:** Grid `grid gap-4 sm:grid-cols-2 lg:grid-cols-3` de note cards. Cada card: `rounded-lg border border-border p-5`, título (font-semibold), línea pequeña (updated_at). Sin FAB en el skeleton para simplificar (o un Skeleton redondo en la esquina si se quiere).
- **Skeleton:** Mismo padding del contenedor `p-4 md:p-6`. Grid con 6 cards. Cada card: Skeleton para el título (ancho ~80%), Skeleton corto para la fecha debajo. Altura mínima similar a la card real (~p-5).
- **Archivos:** `components/skeletons/SkeletonNotes.tsx` (nuevo). En `ContextNotesFromCache` sustituir el div con "Loading notes…" por `<SkeletonNotes />`.

### 4. Ideas

- **Forma del contenido real:** Título "Mapas mentales"; grid `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4` de board cards. Cada card: `rounded-lg border border-border p-4`, icono + título + opcional descripción (2 líneas). FAB abajo a la derecha.
- **Skeleton:** Mismo contenedor `p-4 md:p-6`. Skeleton para el h2. Grid de 8 placeholders (2 filas x 4 en xl). Cada item: Skeleton pequeño (icono), Skeleton para título, Skeleton para 2 líneas de descripción. Min-height ~120px como las cards reales.
- **Archivos:** `components/skeletons/SkeletonIdeas.tsx` (nuevo). En `ContextIdeasFromCache` sustituir el div "Loading ideas…" por `<SkeletonIdeas />`.

### 5. Presupuestos

- **Forma del contenido real:** Párrafo de subtítulo; grid `grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6` de BudgetCards. Cada card: `rounded-lg border border-border p-6`, nombre, descripción, stats (totales, progreso), etc. FAB.
- **Skeleton:** Mismo contenedor; Skeleton para el párrafo de subtítulo (una línea). Grid de 6 cards. Cada card: Skeleton título, Skeleton 2 líneas para descripción, Skeleton barra de progreso, 2–3 Skeleton para números. Altura generosa (p-6) para que no salte el layout al reemplazar por BudgetCard.
- **Archivos:** `components/skeletons/SkeletonBudgets.tsx` (nuevo). En `ContextBudgetsFromCache` sustituir "Loading budgets…" por `<SkeletonBudgets />`.

### 6. Tareas (Todos)

- **Forma del contenido real:** Título (nombre del proyecto); formulario de añadir tarea (input + botón); lista `divide-y` de filas. Cada fila: checkbox redondo + contenido del ítem + acciones.
- **Skeleton:** Mismo contenedor `p-4 md:p-6 max-w-3xl`. Skeleton para el h2. Skeleton para el form (input + botón). Lista de 5–6 filas: cada una con Skeleton circular (checkbox), Skeleton para la línea de texto (ancho variable). Usar `divide-y divide-border` para mantener la misma sensación.
- **Archivos:** `components/skeletons/SkeletonTodos.tsx` (nuevo). En `ContextTodosFromCache` sustituir "Loading to-dos…" por `<SkeletonTodos />`.

---

## Reglas de diseño de los skeletons

1. **Misma estructura que el contenido real:** Mismo número de columnas en grid, mismos paddings (`p-4 md:p-6` donde aplique), mismos gaps y bordes para que al reemplazar por contenido real no haya salto de layout.
2. **Mismo componente base:** Usar `<Skeleton className="…" />` de `@/components/ui/skeleton` en todos (ya tiene la clase `cq-skeleton-shimmer`).
3. **Cantidad de placeholders:** Suficientes para que se vea una “página llena” (p. ej. 6–8 cards en grids), sin exagerar.
4. **Accesibilidad:** Mantener `aria-hidden` en el contenedor del skeleton o en los Skeleton para que lectores de pantalla no lean cada barra; opcionalmente un `aria-busy="true"` en el contenedor y `role="status"` con `aria-live="polite"` y un texto solo para screen readers (“Cargando…”) si se desea.

---

## Checklist por módulo (al implementar)

- [ ] Crear `components/skeletons/SkeletonX.tsx` con la forma descrita.
- [ ] En el `*FromCache` correspondiente, reemplazar el bloque que muestra "Loading…" / "Loading X…" por `<SkeletonX />`.
- [ ] Verificar en navegador: al entrar al tab (cache miss) se ve el shimmer con la forma correcta; al cargar los datos el reemplazo es sin salto.
- [ ] Commit con mensaje claro (ej. "feat(context): skeleton shimmer for Notes tab").

---

## Resumen de archivos

| Skeleton | Archivo nuevo | Dónde se usa |
|----------|----------------|--------------|
| SkeletonProjectPicker | `components/skeletons/SkeletonProjectPicker.tsx` | Opcional: `app/page.tsx` Suspense fallback |
| SkeletonOwner | `components/skeletons/SkeletonOwner.tsx` | `ContextOwnerFromCache` |
| SkeletonNotes | `components/skeletons/SkeletonNotes.tsx` | `ContextNotesFromCache` |
| SkeletonIdeas | `components/skeletons/SkeletonIdeas.tsx` | `ContextIdeasFromCache` |
| SkeletonBudgets | `components/skeletons/SkeletonBudgets.tsx` | `ContextBudgetsFromCache` |
| SkeletonTodos | `components/skeletons/SkeletonTodos.tsx` | `ContextTodosFromCache` |

Implementar en el orden de la tabla para poder revisar y ajustar módulo por módulo.
