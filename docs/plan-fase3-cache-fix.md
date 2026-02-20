# Plan de acción: arreglar cache Fase 3 (no más loading al volver)

## Problema que ves

1. Entras al **Proyecto A** y recorres todos sus módulos (Board, Notas, Ideas, Presupuestos, Tareas, Owner). Cargas toda la información.
2. Vas al **Proyecto B** y haces lo mismo. Todo cargado.
3. **Vuelves al Proyecto A** (el primero).
4. Resultado actual: ves **loading** otra vez al entrar al proyecto, loading en Notas, en Ideas, en Budgets, en Tareas… como si no hubieras cargado nada antes.

Lo que debería pasar: al volver al Proyecto A, **nada** de eso debería cargar de nuevo; todo debería mostrarse de inmediato desde cache porque ya lo cargaste la primera vez.

---

## Causa raíz

El **ContextDataCacheProvider** (donde vive el cache) está dentro de:

```
app/context/[projectId]/layout.tsx
```

Ese layout es **por proyecto**. En Next.js:

- Cuando estás en `/context/proyecto-A/board` → se monta el layout de `projectId = proyecto-A` → el provider está ahí.
- Cuando navegas a **Proyecto B** (`/context/proyecto-B/board`) → el layout de proyecto-A **se desmonta** y se monta el layout de proyecto-B.
- Al desmontar, **todo el estado de React (incluido el cache) se destruye**.
- Cuando vuelves a Proyecto A → se monta **otro** layout de proyecto-A → **otro** provider **nuevo** → cache **vacío** → todo hace fetch otra vez = loading por todos lados.

Por eso el cache “no persiste” al cambiar de proyecto: el provider no persiste, porque vive dentro del segmento dinámico `[projectId]`.

---

## Objetivo

Que el **provider del cache viva por encima de todos los proyectos**, de modo que:

- Al ir de Proyecto A → Proyecto B → Proyecto A, **el mismo provider** siga montado.
- El cache (datos de A, datos de B, etc.) siga en memoria.
- Al volver a A, los componentes lean de cache y no muestren loading.

---

## Plan de acción (2 pasos)

### Paso 1: Provider por encima de toda la ruta `/context`

- **Crear** `app/context/layout.tsx` (no existe hoy).
- Ese layout debe:
  - Envolver `{children}` con **ContextDataCacheProvider**.
  - No hacer fetch ni lógica extra; solo el wrapper.
- Así, **cualquier** ruta bajo `/context` (la que redirige a `/`, y todas las de `/context/[projectId]/...`) comparten **el mismo** provider y el mismo cache.

Estructura deseada:

```
app/layout.tsx (root)
  └── app/context/layout.tsx  ← NUEVO: solo <ContextDataCacheProvider>{children}</ContextDataCacheProvider>
        └── /context → page (redirect)
        └── /context/[projectId]/... → layout [projectId] + páginas
```

Al navegar entre proyectos, el layout de `context` **no** cambia (seguimos en `/context/...`), así que el provider **no** se desmonta y el cache se mantiene.

### Paso 2: Quitar el provider del layout del proyecto

- En **`app/context/[projectId]/layout.tsx`**:
  - **Quitar** `<ContextDataCacheProvider>` (ya no envuelve aquí).
  - Dejar solo: `requireAuth` + `<ContextLayoutWrapper projectId={projectId}>{children}</ContextLayoutWrapper>`.
- Los componentes que usan `useContextDataCache()` siguen igual; solo que ahora consumen el provider del layout de `app/context/layout.tsx`.

---

## Criterios de éxito

Después de aplicar el plan:

1. Entras al **Proyecto A** y recorres Board, Notas, Ideas, Budgets, Tareas (todo carga una vez).
2. Vas al **Proyecto B** y recorres sus módulos (todo carga una vez).
3. Vuelves al **Proyecto A**:
   - **No** loading al entrar al proyecto (nombre y shell salen al instante).
   - **No** loading en Board, Notas, Ideas, Budgets, Tareas al cambiar de tab; todo sale de cache y se pinta de inmediato.

Si algo de esto no se cumple, habría que revisar que no haya otro layout o condición que desmonte el provider o limpie el cache.

---

## Resumen de cambios de archivos

| Acción | Archivo |
|--------|--------|
| Crear | `app/context/layout.tsx` con `<ContextDataCacheProvider>{children}</ContextDataCacheProvider>` |
| Editar | `app/context/[projectId]/layout.tsx`: eliminar el wrapper `ContextDataCacheProvider`, dejar solo `ContextLayoutWrapper` y children |

Nada más. Sin tocar los componentes `*FromCache` ni la lógica de cache (get/set/invalidate); solo dónde vive el provider.

---

Si este plan te cuadra, el siguiente paso es ejecutarlo (crear `context/layout.tsx` y ajustar `[projectId]/layout.tsx`).
