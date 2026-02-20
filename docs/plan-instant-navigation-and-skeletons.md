# Plan: Navegación instantánea y skeletons (Fase 1 → Fase 2)

Documento que recoge la lógica de “no refetch cuando no puede haber desincronización” y el plan para llevar la fluidez al siguiente nivel: entrada a proyectos con animación + UI ya visible y contenido cargando con skeleton shimmer.

---

## 1. Lo que ya logramos (Fase 1)

### Principio

**No volver a pedir datos cuando el usuario no pudo haberlos cambiado.**

- Salir de un proyecto → la lista de proyectos no puede haber cambiado (no se crean proyectos desde dentro de un proyecto). Por tanto: pre-renderizamos el home con datos ya fetcheados y lo mostramos deslizándose desde la derecha, sin nuevo fetch.
- Volver al proyecto que acabamos de dejar → el proyecto no pudo haberse editado desde el dashboard. Por tanto: la vista del proyecto sigue montada; solo invertimos la animación (entra desde la izquierda) y actualizamos la URL. Cero fetch.
- Click en el mismo proyecto en la lista post-exit → mismo flujo que el botón “atrás”: animación de vuelta, sin navegación ni refetch.

### Resultado

- Transiciones con **contenido ya renderizado** (no ventana vacía que luego se pinta).
- **URL** actualizada con `history.replaceState` cuando no hace falta recargar.
- Sensación de **sistema fluido**, sin tiempos de carga en esos flujos.

---

## 2. Objetivo de la Fase 2

La **primera carga** del sistema (home al entrar) puede tardar ~2 s; es aceptable. Después de eso, el usuario espera que todo sea **rápido, sin fricción y con sensación de “ya está trabajando”**.

### Meta

Cuando el usuario **entra a un proyecto** (desde el home, primera vez o no):

- No esperar a que la página del proyecto esté totalmente renderizada para mostrar algo.
- Mostrar de inmediato una **animación de entrada** (igual que cuando hace “atrás”): la vista del proyecto **entra desde la derecha** con su **shell ya visible** (header, tab bar).
- El **área de contenido** (tablero, notas, etc.) no espera al fetch: se muestra con **skeleton / shimmer** (placeholders luminosos) mientras se hace el fetch en segundo plano.
- Cuando llegan los datos, se reemplazan los skeletons por el contenido real (con transición suave si aplica).

Así se consigue:

1. **Respuesta instantánea** al click (animación + shell).
2. **Sensación de “ya está cargando”** (shimmer en lugar de blanco o spinner genérico).
3. **Cero tiempo percibido muerto**: la UI ya está ahí y “trabajando”.

---

## 3. Cómo lograrlo (Fase 2)

### 3.1 Entrada al proyecto con animación

- Hoy: click en proyecto → navegación a `/context/[id]/board` → servidor corre RSC y fetches → se pinta la página.
- Objetivo: click en proyecto → **inmediatamente** se muestra algo que **entra desde la derecha** (como el “back to project” pero al revés).

Opciones:

- **A) Prefetch + transición:** Al hacer click, se hace `router.prefetch` (o ya está prefetched) y, en cuanto tengamos el payload mínimo (o en cuanto montemos el layout), mostramos el shell del proyecto con animación “slide in from right”. El contenido del tab (board, etc.) puede ser todavía loading.
- **B) Shell inmediato + contenido async:** La ruta `/context/[id]/board` renderiza en el servidor el **layout** (ContextShell) y una **versión del contenido** que en el servidor ya tiene estado “loading” y envía skeletons. En el cliente, el contenido real se pide en un server component hijo con Suspense o en un client component que hace el fetch y muestra skeleton hasta tener datos.
- **C) Client-side entry:** El home, al hacer click en un proyecto, no navega de inmediato; monta (o revela) una capa “proyecto” con el shell y skeletons, animación de entrada, y en paralelo dispara la navegación o el fetch. Cuando todo está listo, se considera “navegado”. Más control, más complejidad.

Recomendación para empezar: **B** (layout + Suspense + skeletons en el contenido), y opcionalmente una animación de entrada en el layout (slide from right) si el router lo permite o con un pequeño wrapper.

### 3.2 Skeleton shimmer en el contenido

- **Tablero (Etapas):** En lugar de “cargando…” o vacío, mostrar columnas (Pendientes, Lo siguiente, En progreso, Bloqueado) con **cards skeleton** con efecto shimmer en cada columna.
- **Notas / Ideas / Presupuestos / Tareas:** Listas o grids con filas/cards skeleton con shimmer.
- **Responsable del proyecto:** Bloque con líneas skeleton.

Requisitos:

- Componentes de skeleton reutilizables (por tipo: card, línea, lista).
- Estilo **shimmer luminoso** (gradiente que se mueve o pulsa) para dar sensación de “cargando activo”.
- Misma estructura que el contenido real (mismo número de columnas, misma disposición) para que al reemplazar no salte el layout.

### 3.3 Dónde definir “loading”

- **RSC con Suspense:** El contenido del tab (board, notes, etc.) se envuelve en `<Suspense fallback={<SkeletonBoard />}>`. Así el shell se pinta enseguida y el fallback son los skeletons hasta que el fetch del contenido termine.
- **Client components:** Si el contenido lo carga un client component, que tenga estado `loading` y muestre el mismo skeleton hasta tener datos.

### 3.4 Animación de entrada del proyecto

- Objetivo: que la primera vez que entras a un proyecto **sienta** como el “back to project” (vista que entra desde la derecha).
- Opciones:
  - View Transitions API (si se usa): definir transición “nueva vista desde la derecha”.
  - Layout wrapper en `/context/[id]`: al montar, aplicar una clase que anime `transform` (entrada desde la derecha) una sola vez.
  - O mantener consistencia con el “back”: si el back es “proyecto entra desde la izquierda”, la entrada “normal” al proyecto podría ser “proyecto entra desde la derecha” (misma dirección que el home al hacer Salir).

---

## 4. Fases sugeridas (resumen)

| Fase                  | Logro                                                                                                                                                                         |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fase 1** ✅         | Salir → home pre-renderizado, sin refetch. Back / click mismo proyecto → vuelta con animación, sin refetch. URL actualizada sin navegación cuando aplica.                     |
| **Fase 2** ✅         | Entrada a proyecto: shell visible de inmediato con animación de entrada; contenido con skeleton shimmer hasta que el fetch termine; luego reemplazo suave por contenido real. |
| **Fase 3** ✅         | Cache de datos ya cargados: proyecto, board, notas, ideas, owner, budgets, todos. Al volver a un proyecto o tab ya visitado no se hace fetch; se muestra desde cache.          |
| **Fase 4** (opcional) | Sin refresh con fetch tras insert/update: feedback (animaciones, popups), insertar en UI, fetch en background; retry si falla. No refetch completo del módulo.                  |

---

## 5. Checklist técnica Fase 2 (implementado)

- [x] Skeleton reutilizable con shimmer: `components/ui/skeleton.tsx`, `SkeletonBoard` en `components/skeletons/SkeletonBoard.tsx`, animación en `globals.css`.
- [x] Board page: `<Suspense fallback={<SkeletonBoard />}><BoardContent /></Suspense>`; fetch en BoardContent (RSC).
- [x] Fetches en RSC (BoardContent); Suspense muestra SkeletonBoard hasta tener datos.
- [x] Animación de entrada: ContextShell project layer slide from right al montar.
- [ ] Revisar que la primera carga del home (lista de proyectos) siga siendo aceptable (~2 s) y que el resto de flujos sientan instantáneos o “en progreso” (shimmer).

---

### Fase 3 — Cache (implementado)

Datos ya cargados no se vuelven a pedir: proyecto, board, notas, ideas, owner, budgets, todos en cache cliente (ContextDataCache). Al volver a un proyecto o tab ya visitado se muestra desde cache. Componentes `*FromCache` por tab; mutaciones usan `onRefresh` para invalidar y refetchear. Action `getBoardsByProjectIdAction` para ideas.

---

## 6. Principio reutilizable

**“Data that’s already loaded and can’t have changed under the user’s actions shouldn’t be refetched — show it with an animation instead.”**

**“First paint should be immediate (shell + skeletons); real content should replace placeholders when ready, with a clear ‘loading’ feel (shimmer), not a blank wait.”**

Esto es lo que llevamos al siguiente nivel en Fase 2.
