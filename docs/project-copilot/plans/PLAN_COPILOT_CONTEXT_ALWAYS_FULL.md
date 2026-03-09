# Plan de ejecución: Contexto completo solo cuando el modelo lo necesita (auto-fulfill)

**Fecha:** 2026-03-08  
**Relacionado:** Auditoría `docs/audits/copilot-context-capabilities-audit.md`  
**Objetivo:** El problema es **global**: en muchas tareas el modelo repite que "necesita full context" y aparece una UI pidiendo al usuario que "apruebe" esa solicitud. El usuario **no** quiere aprobar contexto; tampoco quiere que **todas** las consultas lleven full context (optimización). Lo que se quiere: **cuando el modelo necesite más contexto, que lo obtenga por su cuenta** — sin pedírselo al usuario mediante UI.

---

## 1. Principio

- **Por defecto:** Se envía contexto **standard** (menos tokens, más eficiente).
- **Cuando el modelo necesita más:** El modelo emite `<<REQUEST_CONTEXT>>{"full":true}`. El **sistema** detecta eso y **automáticamente** reenvía la misma pregunta con scope `full`, sin mostrar banner ni pedir aprobación al usuario.
- **Acciones:** El usuario solo aprueba o rechaza _propuestas_ (crear/editar/eliminar).

---

## 2. Cambios implementados

### 2.1 Parser: soporte para `"full": true`

- En `lib/copilot/parser.ts`, `parseContextRequest()` ahora acepta `full: true` en el JSON. Cualquier petición de contexto (tasks, notes o full) dispara auto-fulfill.

### 2.2 Prompt (standard): instrucción única para pedir contexto

- En `lib/copilot/context.ts`, el bloque para standard indica que si necesita IDs (tasks, notes, budgets, categorías, billings, etc.) debe emitir `<<REQUEST_CONTEXT>>{"full":true}<</REQUEST_CONTEXT>>` y que **el sistema obtendrá el contexto automáticamente** — no debe pedir al usuario que apruebe o refresque.

### 2.3 Cliente: auto-fulfill sin UI

- En `app/context/[projectId]/copilot/ContextCopilotClient.tsx`, en `persistAssistantMessage`:
  - Si `parseContextRequest(fullText)` devuelve algo (modelo pidió contexto): **no** se muestra el banner.
  - Se quita de la conversación el mensaje del asistente que pidió contexto.
  - Se reenvía la última pregunta del usuario con `streamChatRequest(..., 'full')`.
  - La nueva respuesta se persiste con `skipContextAutoFulfill: true` para no volver a disparar y evitar bucles.
- El usuario solo ve: su pregunta → (breve carga) → respuesta del modelo con contexto completo. No ve "solicitud de contexto" ni botón de aprobar.

---

## 3. Checklist de implementación

- [x] Parser: aceptar `full: true` en `parseContextRequest`.
- [x] Prompt (standard): instrucción con `<<REQUEST_CONTEXT>>{"full":true}` y texto de que el sistema lo obtiene automáticamente.
- [x] Cliente: en `persistAssistantMessage`, cuando hay contextReq → auto re-request con full, sin banner; persistir respuesta con skipContextAutoFulfill.
- [ ] Verificación: flujo donde el modelo necesita IDs (p. ej. añadir categorías a un budget) y comprobar que no aparece la UI de "aprueba contexto".

---

## 4. Criterios de éxito

- Por defecto las consultas siguen con contexto **standard** (sin enviar full en todas).
- Cuando el modelo necesita más contexto, emite REQUEST_CONTEXT y el sistema **automáticamente** reenvía con full; el usuario no ve banner ni tiene que aprobar nada.
- La aprobación del usuario sigue siendo solo para **acciones** (propuestas).
