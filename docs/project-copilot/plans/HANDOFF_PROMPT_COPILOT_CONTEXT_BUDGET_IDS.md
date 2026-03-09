# Handoff: Copilot no obtiene IDs de presupuestos — análisis y solución

**Uso:** Copiar este contenido (o referenciarlo) en una sesión de Claude Code para que analice la causa raíz y proponga/implemente la solución. No generar código hasta que el agente lea la auditoría y confirme el diagnóstico.

---

## 1. Problema que debe resolver

El **Copilot** (asistente de planificación en el proyecto) a veces dice que **no puede obtener el ID del presupuesto** (o de categorías/ítems). El usuario espera que el Copilot tenga “full access”: poder usar los IDs para proponer categorías dentro de un budget, ítems dentro de categorías, etc., sin pedir al usuario que “refresque” o “abra el chat de nuevo”.

En la práctica:

- El modelo responde con mensajes del tipo: “Necesito el UUID de ese presupuesto para crear categorías”, “¿Puedes refrescar el contexto para que tenga los IDs?”, “El sistema no está procesando mi solicitud de contexto”.
- El usuario no quiere aprobar “contexto” en una UI; cuando el modelo necesita más contexto (p. ej. IDs), debe **obtenerlo por su cuenta** (auto-fulfill), sin mostrar un banner de “aprueba contexto”.
- No se quiere enviar **siempre** full context en todas las consultas (optimización de tokens/coste).

---

## 2. Auditoría de referencia (obligatoria)

Antes de proponer cambios, **lee y ten en cuenta** esta auditoría:

**Archivo:** `docs/audits/copilot-why-budget-id-not-available-audit.md`

Resumen rápido de lo que ahí se explica:

- El Copilot **no** consulta la base de datos; solo recibe texto en el system prompt (contexto construido por el backend).
- Los IDs de budgets/categorías/ítems solo entran en ese texto cuando la petición usa **scope `full`**. Por defecto el cliente envía **scope `standard`**, así que en la primera respuesta el modelo no ve IDs.
- El cliente solo reenvía con `full` cuando en la respuesta del modelo aparece el bloque **`<<REQUEST_CONTEXT>>{"full":true}<</REQUEST_CONTEXT>>`**. Si el modelo solo pide contexto en lenguaje natural y **no** emite ese bloque, no hay segunda petición y el modelo nunca recibe los IDs.
- La conclusión de la auditoría: el modelo no obtiene el ID porque no se le envía contexto full; y no se envía full porque el modelo no está emitiendo el bloque que dispara el auto-fulfill.

---

## 3. Tarea para Claude Code

1. **Confirmar la causa raíz**  
   Tras leer `docs/audits/copilot-why-budget-id-not-available-audit.md`, confirma si estás de acuerdo con el diagnóstico (o indica qué matizarías).

2. **Proponer solución**  
   En función del diagnóstico:
   - Reforzar el prompt para que el modelo **emita de forma fiable** `<<REQUEST_CONTEXT>>{"full":true}<</REQUEST_CONTEXT>>` cuando necesite IDs (y no pida al usuario que refresque/abra el chat), con ejemplo en el prompt si hace falta.
   - Valorar un **heurístico en el cliente**: si el último mensaje del usuario indica claramente que va de presupuestos (p. ej. “añade categorías”, “presupuesto”, “budget”), enviar **esa** petición con `contextScope: 'full'` para que el modelo reciba los IDs en la primera respuesta.
   - Cualquier otro cambio que consideres necesario (p. ej. en el auto-fulfill o en la construcción del contexto).

3. **Implementar**  
   Aplicar los cambios acordados (prompt, cliente, etc.) siguiendo las convenciones del repo (AGENTS.md, CONVENTIONS.md, patrones en `docs/patterns/`).

4. **Resumir**  
   Al terminar: qué se cambió, por qué, y cómo verificar que el Copilot puede proponer categorías/ítems de un presupuesto usando los IDs sin pedir al usuario que “apruebe contexto” o “refresque”.

---

## 4. Archivos relevantes (para el análisis)

| Qué                                          | Dónde                                                                                                                            |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Auditoría completa                           | `docs/audits/copilot-why-budget-id-not-available-audit.md`                                                                       |
| Construcción del contexto (standard vs full) | `lib/copilot/context.ts` → `buildProjectContext`, bloque REQUEST_CONTEXT                                                         |
| Contexto de budgets (con/sin IDs)            | `lib/copilot/registry/modules/budgets.ts` → `fetchBudgetsContext(projectId, scope, supabase)`                                    |
| Detección de petición de contexto            | `lib/copilot/parser.ts` → `parseContextRequest`                                                                                  |
| Cliente: envío standard/full y auto-fulfill  | `app/context/[projectId]/copilot/ContextCopilotClient.tsx` → `handleSubmit`, `persistAssistantMessage`                           |
| API: uso del scope                           | `app/api/copilot/[projectId]/chat/route.ts` → `contextScope` del body, `buildProjectContext(projectId, { scope: contextScope })` |

---

## 5. Restricciones

- No cambiar a “siempre full context” en todas las consultas (el usuario lo rechazó por optimización).
- Mantener el principio: cuando el modelo necesite más contexto, debe obtenerlo automáticamente (auto-fulfill), sin UI de “aprueba contexto”.
- Respetar AGENTS.md, CONVENTIONS.md y patrones del repo.
