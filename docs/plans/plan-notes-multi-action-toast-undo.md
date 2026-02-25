# Plan: Notes multi-action FAB, toast con “Ir”/“Deshacer” y undo global

**Fecha:** 2026-02-24  
**Estado:** Diseño — listo para ejecutar por fases  
**Alcance:** FAB en modo multi-select (menú 3 puntos), actualizaciones optimistas al mover notas, toast global reutilizable con botón “Ir” y “Deshacer”, y mecanismo de undo global para acciones reversibles (mover notas/documentos/presupuestos, bulk delete, etc.).

---

## 1. Objetivos

1. **FAB en modo multi-select:** Cuando hay selección múltiple activa, el FAB ya no es “añadir” sino un **menú (3 puntos)** que abre dos opciones: “Mover a carpeta” y (futuro) “Eliminación masiva (soft delete)”. Cambio de color y animación sutil (bounce) para que destaque.
2. **Mover notas sin reload:** Actualización **optimista** en la UI al mover: quitar las notas de la vista actual en estado local (y opcionalmente invalidar caché) sin `router.refresh()` ni recarga completa.
3. **Toast global reutilizable:** Tras una acción reversible (p. ej. “X notas movidas a [Carpeta]”), mostrar un toast con:
   - Mensaje (ej. “3 notas movidas a Marketing”).
   - Botón **“Ir”** que navega al contexto donde quedaron los ítems (ej. carpeta destino).
   - Botón **“Deshacer”** que ejecuta la acción de undo registrada.
4. **Undo global:** Mecanismo reutilizable para registrar una acción de deshacer (callback) asociada al toast, de modo que en el futuro sirva para: mover documentos, mover presupuestos, bulk delete, etc.

---

## 2. Estado actual

- **FAB:** Siempre muestra “+” (nueva nota); en multi-select sigue igual. Existe botón “Mover a carpeta (N)” en la barra de herramientas.
- **Mover notas:** `handleMoveToFolder` hace `updateNote` por cada id y luego `loadNotes()` + `onRefresh()` → recarga de datos.
- **Toast:** Solo `toastError(message)` en `lib/ui/toast.ts`, que dispara `CustomEvent('clear-queue:toast', { detail: { type: 'error', message } })`. No hay UI de toast visible ni consumidor del evento documentado en el repo; no hay toasts con acciones “Ir” o “Deshacer”.
- **Undo:** No existe mecanismo global de undo.

---

## 3. Especificación por bloques

### 3.1 Toast global reutilizable (mensaje + “Ir” + “Deshacer”)

**Contrato del toast “acción reversible”:**

- **Mensaje:** string (ej. “3 notas movidas a Marketing”).
- **Botón “Ir” (opcional):** Objeto `{ label: string, href?: string, onClick?: () => void }`. Si se usa `href`, navegación con `router.push(href)`; si `onClick`, se ejecuta al hacer clic. Debe ser reutilizable (notas → carpeta, después documentos → carpeta, etc.).
- **Botón “Deshacer” (opcional):** Objeto `{ label: string, onUndo: () => void | Promise<void> }`. Al hacer clic se ejecuta `onUndo` y se cierra el toast.

**Implementación propuesta:**

- **Opción A — Evento custom existente:** Extender `clear-queue:toast` para soportar `detail: { type: 'success' | 'error', message, primaryAction?: { label, href?, onClick? }, undoAction?: { label, onUndo } }`. Un único componente global (p. ej. en `app/layout` o en un provider) escucha el evento y muestra un toast con mensaje y botones.
- **Opción B — Contexto React:** Provider que expone `showToast(options)`. El toast se renderiza en el provider (portal) y puede recibir callbacks “Ir” y “Deshacer” sin serializarlos por evento.

Recomendación: **Contexto React** para poder pasar `onUndo` y `onClick`/`href` sin limitaciones de eventos (más fácil de tipar y de usar desde componentes).

**Ubicación:**

- `lib/ui/toast.ts`: mantener `toastError` y añadir (o mover a) un hook/API que use el contexto.
- `components/ui/ToastProvider.tsx` (o `components/shared/ToastProvider.tsx`): estado del toast actual (mensaje, acciones, visible), método `showActionToast({ message, primaryAction?, undoAction? })`, y render del toast (fixed bottom o top, con botones “Ir” y “Deshacer” según se pasen).
- El provider debe estar en la raíz (p. ej. `app/layout.tsx`) para que sea global.

**i18n:** Claves reutilizables, ej. `toast.go`, `toast.undo`, o por contexto `toast.notes_moved`, `toast.go_to_folder`, etc.

---

### 3.2 Undo global (registro de acción reversible)

**Contrato:**

- Cualquier módulo (notas, documentos, presupuestos, bulk delete) que realice una acción reversible puede:
  1. Ejecutar la acción (con actualización optimista).
  2. Registrar la acción de undo (callback que revierte el cambio).
  3. Mostrar el toast con “Ir” (opcional) y “Deshacer”.
  4. Al hacer clic en “Deshacer”, el toast llama al callback registrado (undo).

No hace falta un “undo stack” múltiple para la v1: un solo toast visible con una acción de undo asociada. Si se dispara otro toast de acción antes de cerrar el primero, se puede reemplazar (nuevo undo reemplaza al anterior) o apilar (según decisión de producto).

**Implementación propuesta:**

- El “undo global” es simplemente: el toast recibe `undoAction: { label, onUndo }`. Quien muestra el toast (p. ej. `ContextNotesClient` al mover notas) es quien construye `onUndo`: p. ej. “vuelve a llamar `updateNote(id, { folder_id: previousFolderId })` para cada nota movida”.
- No hace falta un store global de “última acción” si el toast guarda la referencia a `onUndo` hasta que el usuario haga clic en “Deshacer” o el toast se cierre por tiempo. Así el mecanismo es reutilizable: cualquier pantalla que haga una acción reversible puede llamar `showActionToast({ message, primaryAction: { label, href }, undoAction: { label, onUndo } })`.

---

### 3.3 FAB en modo multi-select: menú (3 puntos) y multi-acciones

**Comportamiento:**

- Cuando **no** hay selección múltiple: FAB actual con “+” (nueva nota). Comportamiento sin cambios.
- Cuando **hay** selección múltiple activa:
  - El FAB deja de ser “+” y pasa a ser un **botón con icono de menú (tres puntos verticales, `MoreVertical`)**.
  - **Color distinto** (ej. secundario/muted o accent) y **animación bounce** sutil (Tailwind `animate-bounce` o keyframe suave) para que se entienda que es otro modo.
  - Al hacer clic se abre un **menú** (dropdown o popover) con:
    - **“Mover a carpeta”** (icono FolderOpen o Move): abre el mismo flujo actual (MoveNotesToFolderDialog) y luego toast + optimista + undo.
    - **“Eliminación masiva”** (futuro): opción para bulk soft delete (por ahora puede estar deshabilitada o oculta hasta que exista soft delete en notas).

**Implementación:**

- En `ContextNotesClient`, condicional del FAB:
  - Si `selectionMode && selectedNoteIds.size > 0`: renderizar FAB con `MoreVertical`, clase de color diferente, `animate-bounce` (o clase custom), y `DropdownMenu` con “Mover a carpeta” (y luego “Eliminación masiva”).
  - Si no: FAB actual con “+” y `handleNewNoteClick`.
- Quitar de la barra de herramientas el botón “Mover a carpeta (N)” si se desea que la única forma de mover en multi-select sea desde el FAB menú (o dejarlo también en la barra por accesibilidad; el plan puede decir “acción de mover disponible desde FAB menú y opcionalmente desde toolbar”).

Recomendación: **mantener** el botón “Mover a carpeta (N)” en la barra para descubribilidad y añadir **además** el FAB menú, de modo que ambas vías ejecuten el mismo flujo (abrir diálogo → optimista + toast con Ir/Deshacer).

---

### 3.4 Mover notas: optimista + toast con “Ir” y “Deshacer”

**Flujo:**

1. Usuario selecciona carpeta destino en `MoveNotesToFolderDialog` y confirma.
2. **Optimista:** Sin esperar al servidor, en el estado local de `ContextNotesClient`:
   - Para cada nota movida, actualizar `notes` en estado: `note.folder_id = targetFolderId`.
   - Cerrar el diálogo, salir del modo selección y limpiar `selectedNoteIds`. La lista actual se re-renderiza y las notas “desaparecen” de la vista (porque ya no están en `notesInFolder` para la carpeta actual).
3. **Servidor:** En segundo plano, llamar `updateNote(id, { folder_id: targetFolderId })` para cada id (o un futuro RPC `move_notes_to_folder_atomic` si se prefiere una sola llamada).
4. **Toast:** Mostrar toast global con:
   - Mensaje: “N notas movidas a [Nombre carpeta]” (o “N notas movidas a Sin carpeta”).
   - **“Ir”:** `primaryAction: { label: t('toast.go'), href: `/context/${projectId}/notes` con query o estado que abra directamente la carpeta destino }`. Navegar a la ruta que muestre esa carpeta (ej. seleccionando la carpeta en la URL o en estado).
   - **“Deshacer”:** `undoAction: { label: t('toast.undo'), onUndo: async () => { for each moved note, updateNote(id, { folder_id: previousFolderId }); actualizar estado local de nuevo; invalidar caché si aplica } }`. Guardar `previousFolderId` (carpeta actual antes del move) por cada nota para poder revertir.
5. Si alguna llamada a `updateNote` falla: revertir estado optimista (restaurar `folder_id` anterior en las notas afectadas), mostrar `toastError` y no mostrar toast de éxito.

**Datos a guardar para undo:** Por cada nota movida, guardar `{ noteId, previousFolderId }`. En `onUndo`, llamar `updateNote(noteId, { folder_id: previousFolderId })` y actualizar el estado local (o invalidar caché y refetch solo si se prefiere consistencia con servidor).

---

## 4. Orden de ejecución (fases)

| Fase  | Tarea                                                           | Entregable                                                                                                                                                                                                                                                                                                                                                                      |
| ----- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** | Toast global con acciones                                       | Provider (context) + componente Toast que muestre mensaje, botón “Ir” (href o onClick) y botón “Deshacer” (onUndo). API `showActionToast(options)`. Integrar en `app/layout.tsx`. i18n para “Ir” y “Deshacer”.                                                                                                                                                                  |
| **2** | Undo como contrato de uso del toast                             | Documentar que cualquier módulo que haga una acción reversible debe llamar `showActionToast` con `undoAction.onUndo`. Sin nuevo store: el callback se pasa al toast y se ejecuta al clic en “Deshacer”.                                                                                                                                                                         |
| **3** | FAB en multi-select: menú 3 puntos                              | En `ContextNotesClient`, cuando `selectionMode && selectedNoteIds.size > 0`, cambiar FAB a icono menú (MoreVertical), color distinto y animación bounce; dropdown con “Mover a carpeta” (y placeholder “Eliminación masiva” deshabilitado u oculto).                                                                                                                            |
| **4** | Mover notas: optimista                                          | En `handleMoveToFolder`: (1) Guardar `previousFolderId` por cada nota. (2) Aplicar en estado local el nuevo `folder_id` a las notas movidas. (3) Cerrar diálogo, salir selección. (4) Lanzar en segundo plano las llamadas a `updateNote`. (5) Si hay error, revertir estado y toastError.                                                                                      |
| **5** | Mover notas: toast “Ir” y “Deshacer”                            | Tras aplicar optimista y lanzar updates: llamar `showActionToast({ message, primaryAction: { label, href: ruta a carpeta destino }, undoAction: { label, onUndo } })`. `onUndo` re-ejecuta `updateNote` con `previousFolderId` y actualiza estado local (o invalida caché). Definir ruta “ir a carpeta” (ej. `/context/[projectId]/notes?folderId=xxx` o estado en navegación). |
| **6** | (Opcional) Quitar o mantener botón “Mover a carpeta” en toolbar | Decisión: mantener ambos (FAB menú + botón en barra) o solo FAB. Documentar en DoD.                                                                                                                                                                                                                                                                                             |

---

## 5. Archivos y referencias

| Tema                         | Archivos                                                                |
| ---------------------------- | ----------------------------------------------------------------------- |
| Toast actual                 | `lib/ui/toast.ts`                                                       |
| Layout raíz                  | `app/layout.tsx`                                                        |
| Notes folder view, FAB, move | `app/context/[projectId]/notes/ContextNotesClient.tsx`                  |
| Diálogo mover                | `components/context/notes/MoveNotesToFolderDialog.tsx`                  |
| Patrón optimista             | `docs/patterns/` (si existe); `templates/optimistic-update.template.ts` |

---

## 6. Contrato del toast reutilizable (para otros módulos)

Para que documentos, presupuestos o bulk delete usen el mismo patrón:

```ts
// Ejemplo de API
showActionToast({
  message: '3 notas movidas a Marketing',
  primaryAction: {
    label: t('toast.go'),
    href: `/context/${projectId}/notes?folderId=${folderId}`,
  },
  undoAction: {
    label: t('toast.undo'),
    onUndo: async () => {
      /* revert move */
    },
  },
});
```

- **Mover documentos:** Mismo esquema; `primaryAction.href` = ruta a carpeta de documentos; `undoAction.onUndo` = volver a poner `folder_id` anterior en cada documento.
- **Bulk delete:** Mensaje “N elementos eliminados”; “Deshacer” = restaurar (si hay soft delete) o informar que no hay undo para delete duro.

---

## 7. Riesgos y seguimiento

- **Ruta “Ir” a carpeta:** Hoy la vista de notas no usa query `folderId` en la URL; hay que decidir si se añade soporte (ej. `?folderId=xxx` en `/context/[projectId]/notes` y al cargar seleccionar esa carpeta) o si “Ir” lleva a la lista de carpetas. Recomendación: añadir soporte a `folderId` en URL para poder enlazar directamente a una carpeta.
- **Múltiples toasts:** Si se disparan dos acciones reversibles seguidas, definir si el segundo toast reemplaza al primero o se apilan (v1: reemplazar es más simple).
- **Undo tras navegación:** Si el usuario navega fuera antes de hacer “Deshacer”, el callback sigue siendo válido (revierte en servidor y al volver a la vista los datos pueden venir de refetch). Opcional: al montar la vista de notas, invalidar caché para tener datos frescos.

---

## 8. Definición de hecho (DoD)

- [ ] Toast global con mensaje, “Ir” y “Deshacer” integrado en layout y reutilizable.
- [ ] FAB en multi-select es menú (3 puntos), color distinto y animación bounce; opción “Mover a carpeta” (y placeholder para eliminación masiva).
- [ ] Mover notas actualiza la UI de forma optimista (sin reload); si falla, rollback y toastError.
- [ ] Tras mover, se muestra toast con “Ir” (navega a carpeta destino) y “Deshacer” (undo que restaura folder_id anterior).
- [ ] Ruta o estado para “Ir a carpeta” documentada o implementada (ej. `?folderId=` en notas).
- [ ] i18n para toast (go, undo, mensajes de notas movidas).
- [ ] Lint y build pasan; pruebas manuales de mover, undo e “Ir”.
