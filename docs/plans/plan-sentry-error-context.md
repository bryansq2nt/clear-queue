# Plan: Contexto rico en errores enviados a Sentry

**Objetivo:** Que cada error que llegue a Sentry permita responder: **en qué módulo ocurrió**, **qué intentaba hacer el usuario**, **qué se esperaba** y **qué sucedió**. Así se prioriza y se depura sin reproducir a ciegas.

---

## 1. Estado actual

- **Errores no capturados** (throw o promesa rechazada): se envían automáticamente; Sentry incluye stack trace y breadcrumbs (clicks, navegación, fetches). No hay contexto semántico (módulo, intención, esperado vs real).
- **Errores capturados:** solo se reportan donde se llama explícitamente a `Sentry.captureException`. Hoy eso ocurre solo en `app/global-error.tsx` (errores que rompen la app). Las server actions y muchos `try/catch` no envían nada a Sentry ni añaden contexto.
- **Conclusión:** La mayoría de los errores o no se envían o llegan con poco contexto (solo stack + breadcrumbs genéricos).

---

## 2. Diseño deseado: qué debe llevar cada error

Cada evento de error en Sentry debería permitir ver:

| Campo                     | Descripción                                                                                              | Uso en Sentry                                    |
| ------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| **Módulo / área**         | Dónde ocurrió (ej. `board`, `tasks`, `auth`, `budgets`, `ideas`).                                        | Filtros, agrupación, dashboards.                 |
| **Acción**                | Qué operación se estaba ejecutando (ej. `moveTask`, `createProject`, `updateNote`).                      | Tags; entender el flujo.                         |
| **Intención del usuario** | Qué intentaba hacer el cliente en lenguaje de negocio (ej. "Mover tarea a En progreso", "Guardar nota"). | Contexto/extra; priorizar y comunicar.           |
| **Esperado**              | Comportamiento esperado en una frase (ej. "La tarea se actualiza y la columna se re-renderiza").         | Contexto/extra; comparar con lo real.            |
| **Sucedido**              | Qué pasó en realidad (mensaje del error o resumen corto).                                                | Ya lo da el error; se puede reforzar en `extra`. |

Además, cuando aplique:

- **Usuario:** `id` (y opcionalmente `email`) para saber quién fue afectado.
- **Recurso:** `projectId`, `taskId`, etc., cuando sea relevante (sin datos sensibles).

---

## 3. Cómo modelarlo en Sentry

- **Tags** (indexados, para filtrar): `module`, `action`, opcionalmente `route` o `area`.
- **Extra / context** (visibles en el detalle del evento, no indexados): `user_intent`, `expected`, `actual` (y si hace falta `resource`: `projectId`, etc.).
- **Breadcrumbs:** Seguir usando (y donde convenga añadir) breadcrumbs antes de acciones críticas (ej. "Usuario movió tarea X a columna Y") para reconstruir el flujo.

No incluir en contexto: contraseñas, tokens, datos personales sensibles más allá de lo necesario (p. ej. solo `user.id` está bien si la política lo permite).

---

## 4. Convención técnica

### 4.1 Helper recomendado

Centralizar el reporte con contexto en un solo sitio para no repetir lógica y mantener el mismo “shape” de datos:

- **Ubicación sugerida:** `lib/sentry.ts` (o `lib/monitoring/sentry.ts`).
- **Función:** por ejemplo `captureWithContext(error, options)` donde `options` incluya:
  - `module` / `area`
  - `action`
  - `userIntent` (opcional)
  - `expected` (opcional)
  - `extra` (objeto libre para más datos).
- **Implementación:** llamar a `Sentry.setContext('error_context', { userIntent, expected, actual: error.message })`, `Sentry.setTag('module', ...)`, `Sentry.setTag('action', ...)`, y luego `Sentry.captureException(error)`. Si ya tenemos `setUser` en otro sitio, no duplicar; si no, el helper puede aceptar `userId` opcional y hacer `setUser` ahí.

Así, en cualquier módulo (server action, API route, cliente) se hace una sola llamada con la misma estructura.

### 4.2 Dónde llamar al helper

- **Server actions** que hagan mutaciones o operaciones críticas: en el `catch`, antes de devolver error al cliente, llamar a `captureWithContext(err, { module, action, userIntent, expected, extra })`.
- **Rutas API** (`app/api/.../route.ts`): en el catch del handler, mismo patrón.
- **Cliente:** en manejadores de error de flujos importantes (ej. fallo al mover tarea, al guardar formulario): además de mostrar mensaje al usuario, llamar a `captureWithContext` con el mismo esquema. No sustituir el reporte automático de errores no capturados; usarlo para errores que sí capturamos pero queremos reportar con contexto.
- **global-error.tsx:** seguir llamando a `Sentry.captureException(error)`. Opcionalmente, si tenemos datos de ruta o último breadcrumb relevante, podríamos añadir un poco de contexto ahí también (sin bloquear el render del error).

---

## 5. Plan de ejecución (fases)

### Fase 1: Infraestructura

- [x] Crear `lib/sentry.ts` (o `lib/monitoring/sentry.ts`) con `captureWithContext(error, options)`.
- [x] Definir en el helper los campos: `module`, `action`, `userIntent`, `expected`, `extra` (y opcionalmente `userId`).
- [x] Documentar en `docs/reference/sentry-guide.md` el uso de `captureWithContext` y el significado de cada campo.
- [x] Añadir tipos (TypeScript) para `options` para que sea fácil usarlo bien desde cualquier módulo.

### Fase 2: Server actions críticas

- [x] Listar server actions que hacen mutaciones o accesos importantes (tasks, projects, notes, ideas, budgets, auth, etc.).
- [x] En cada una, en el `catch` o en el branch `if (error)`, llamar a `captureWithContext` con `module`, `action`, y cuando sea claro: `userIntent`, `expected`, y `extra` (p. ej. `projectId`, `taskId` sin datos sensibles).
- [x] Revisar que no se expongan secrets en `extra` ni en mensajes (auth sin PII; budgets no tocados por usar throw, opcional en fase posterior).

### Fase 3: Rutas API

- [x] Revisar `app/api/**/*.ts` y en los handlers que hagan operaciones importantes, en el catch llamar a `captureWithContext` con el mismo esquema.
- [x] Asegurar que el `module`/`action` identifiquen la ruta o operación (ej. `module: 'api', action: 'export-report'` o similar).

### Fase 4: Cliente (flujos críticos)

- [x] Identificar flujos donde el usuario puede ver un error y nosotros hacemos `try/catch` (ej. mover tarea, guardar nota, crear proyecto).
- [x] En esos catch, además del mensaje al usuario, llamar a `captureWithContext` con `userIntent` y `expected` en lenguaje de negocio.
- [ ] Opcional: añadir breadcrumbs antes de acciones críticas (ej. "Moving task X to column Y") para que en Sentry se vea el flujo hasta el error.

### Fase 5: Revisión y ajuste

- [ ] Generar algunos errores de prueba (en staging o con feature flag) y comprobar en Sentry que cada evento tenga módulo, acción, intención, esperado y sucedido.
- [ ] Ajustar tags o nombres de `module`/`action` para que los filtros y búsquedas en Sentry sean útiles.
- [ ] Opcional: definir en el doc un pequeño “vocabulario” de `module` y `action` para consistencia (ej. siempre `board` para el Kanban, `tasks` para acciones de tareas, etc.).

---

## Cómo probar y seguir (después de Fases 1–4)

1. **Tener Sentry activo:** `NEXT_PUBLIC_SENTRY_DSN` definida en `.env.local` (o en Vercel). Sin DSN no se envía nada.
2. **Provocar un error de prueba:** Por ejemplo fallar una mutación (desconectar DB, o forzar un error en una server action). O usar la página `/sentry-example-page` si sigue disponible.
3. **En Sentry (sentry.io):** Ir a **Issues** → abrir el evento → comprobar que en el evento aparezcan **Tags** (`module`, `action`) y **Context** / **Additional Data** (`error_context` con `userIntent`, `expected`, `actual`).
4. **Si algo no se ve bien:** Ajustar en el código el `module`/`action` o los textos de `userIntent`/`expected` y volver a probar.
5. **Fase 5** es solo esta verificación + opcionalmente un vocabulario de módulos/acciones en el doc; no requiere más implementación.

---

## 6. Criterios de éxito

- Cada error reportado en Sentry permite identificar: **módulo**, **acción**, **qué intentaba el usuario**, **qué se esperaba** y **qué sucedió**.
- No se envían datos sensibles (contraseñas, tokens, PII innecesaria).
- El equipo puede priorizar y depurar usando Sentry sin tener que reproducir a ciegas.

---

## 7. Referencias

- [Guía de Sentry en el proyecto](../reference/sentry-guide.md)
- [Sentry: Context](https://docs.sentry.io/platforms/javascript/enriching-events/context/)
- [Sentry: Tags](https://docs.sentry.io/platforms/javascript/enriching-events/tags/)
