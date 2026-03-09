# Auditoría: Por qué el Copilot no obtiene el ID del presupuesto

**Fecha:** 2026-03-08  
**Motivo:** El usuario reporta que el Copilot sigue diciendo que no puede obtener el ID del presupuesto; debería tener “full access”, poder consultar la base de datos, crear categorías y ítems y obtener sus IDs. Se requiere entender por qué no funciona.

---

## 1. Aclaración: el Copilot no consulta la base de datos

El Copilot **no tiene** un “acceso a la base de datos” en forma de herramienta o query. Solo recibe **texto** en el system prompt:

- El backend (`buildProjectContext`) construye un string con tareas, notas, hitos, **budgets**, facturación, etc.
- Ese string se inyecta en el system prompt de cada petición al modelo.
- Lo que el modelo “ve” son únicamente esos párrafos de texto. Si en ese texto no aparecen los IDs (porque se usó scope `standard`), el modelo no puede “consultar” nada más; no tiene forma de obtener el UUID por su cuenta.

Por tanto, “full access” en este sistema significa: **que la petición use scope `full`** para que el backend incluya en ese texto los IDs (budget, categorías, ítems, etc.). No hay una segunda vía (tool/API) para que el modelo pida IDs.

---

## 2. Cuándo el modelo recibe los IDs de presupuestos

El backend incluye IDs de budgets solo cuando se construye el contexto con **scope `full`**:

- **`lib/copilot/registry/modules/budgets.ts`** → `fetchBudgetsContext(projectId, scope, supabase)`:
  - Con `scope === 'standard'`: solo nombres y totales, **sin IDs**.
  - Con `scope === 'full'`: para cada budget devuelve líneas del estilo  
    `- [<uuid-budget>] Nombre: $X total · ...`  
    y bajo cada budget: `Categories: [<uuid-cat>] Nombre` e `Items: [<uuid-item>] ...`.

Ese contexto se arma en **`lib/copilot/context.ts`** → `buildProjectContext(projectId, { scope })`, y el `scope` lo decide **quién llama al API**:

- En **`app/api/copilot/[projectId]/chat/route.ts`**:  
  `contextScope = body.contextScope === 'full' ? 'full' : 'standard'`.
- El **cliente** envía `contextScope` en el body. Por defecto (en `handleSubmit`) envía **`'standard'`**.

Conclusión: en el flujo normal (usuario escribe → enviar mensaje) el modelo **nunca** recibe los IDs de presupuestos porque la primera (y a veces única) petición va con `standard`.

---

## 3. Cuándo se envía scope `full`

Hoy el cliente envía `contextScope: 'full'` solo en dos casos:

1. **Auto-fulfill:** Después de recibir la respuesta del asistente, si en el **texto** de esa respuesta aparece un bloque  
   `<<REQUEST_CONTEXT>>{"full":true}<</REQUEST_CONTEXT>>`  
   (o `tasks`/`notes`), el cliente:
   - Quita ese mensaje del asistente de la conversación.
   - Reenvía la **misma** conversación (hasta el último mensaje del usuario) con **`contextScope: 'full'`**.
   - La nueva respuesta del modelo ya se construye con contexto full (incluidos IDs de budgets).

2. **Botón “Cargar contexto completo y responder de nuevo”:** El usuario hace clic y se reenvía con `full`.

Si **nunca** se da uno de estos dos casos, el modelo **nunca** ve los IDs.

---

## 4. Por qué en la práctica no obtiene el ID (hallazgo principal)

En los ejemplos que describes, el modelo dice cosas como:

- “Necesito el UUID de ese presupuesto…”
- “¿Puedes intentar abrir el chat de nuevo o refrescar la página para que el sistema me dé acceso al contexto completo con los IDs?”
- “El sistema no está procesando mi solicitud de contexto en este momento.”

Es decir, **pide contexto en lenguaje natural**, pero no emite el bloque estructurado que el cliente usa para auto-fulfill:

- El cliente solo reacciona cuando en la respuesta aparece **exactamente**  
  `<<REQUEST_CONTEXT>>{"full":true}<</REQUEST_CONTEXT>>`  
  (parseado por `parseContextRequest` en `lib/copilot/parser.ts`).
- Si el modelo solo escribe “necesito el contexto completo” o “refresca para que tenga los IDs” y **no** incluye ese bloque, `parseContextRequest` devuelve `null` y el cliente **no** hace la segunda petición con `full`.
- Por tanto, el modelo nunca recibe la versión del contexto que sí incluye los IDs. No es que “el sistema no procese la solicitud”; es que la solicitud que el sistema entiende (el bloque REQUEST_CONTEXT) **no se está emitiendo**.

Resumen: **el modelo no obtiene el ID del presupuesto porque no se está enviando contexto full, y no se envía contexto full porque el modelo no está emitiendo el bloque que dispara el auto-fulfill.**

---

## 5. Sobre “consultar en la base de datos” y “crear categorías y obtener IDs”

- **Consultar:** El modelo no ejecuta consultas. Solo lee el texto del system prompt. Para “tener” el ID, ese ID tiene que estar ya en ese texto; eso solo pasa con scope `full`.
- **Crear categorías / ítems y obtener IDs:**
  - Crear categoría o ítem lo hace el **usuario** al aprobar una **propuesta** (tarjeta Aprobar/Rechazar).
  - Quien escribe en la base de datos es el **backend** (approve en el registry).
  - Tras aprobar, el nuevo ID existe en la base, pero el modelo **no** lo ve hasta que haya una **nueva** petición cuyo contexto se construya con scope `full` (y que incluya ese budget/categoría/ítem).
  - Es decir: el modelo puede proponer “crear categoría en budget X” **solo si** en el contexto que recibe (full) ya ve el UUID del budget X. No puede “crear y luego consultar el ID” en la misma respuesta; en la siguiente vuelta, si la petición va con full, el nuevo ID puede aparecer en el contexto.

Por tanto, el flujo que sí funciona es: (1) el modelo recibe una petición con contexto **full** (donde ya aparecen budgets con UUID), (2) propone categorías/ítems usando esos UUID, (3) el usuario aprueba y el backend crea y devuelve IDs; en el siguiente turno, con full de nuevo, esos IDs pueden estar en el contexto.

---

## 6. Resumen de causas

| Causa                                                 | Explicación                                                                                                      |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| El modelo no emite `<<REQUEST_CONTEXT>>{"full":true}` | Pide contexto en prosa, pero el cliente solo reacciona al bloque. Sin bloque, no hay reenvío con `full`.         |
| Por defecto se envía `standard`                       | La primera (y a veces única) petición no incluye IDs de budgets en el contexto.                                  |
| No hay “consulta a la base de datos”                  | El modelo solo ve el texto del system prompt; si los IDs no están ahí (por no usar full), no puede “obtenerlos”. |

---

## 7. Recomendaciones

1. **Hacer que el modelo emita el bloque de forma fiable**
   - Reforzar en el prompt (modo standard) que cuando necesite **cualquier** ID (presupuesto, categoría, ítem, tarea, facturación, etc.) **debe** terminar la respuesta con exactamente:  
     `<<REQUEST_CONTEXT>>{"full":true}<</REQUEST_CONTEXT>>`  
     y que **no** debe pedir al usuario que refresque, abra de nuevo el chat o “apruebe” nada.
   - Incluir un ejemplo corto de respuesta que termine con ese bloque.

2. **Heurístico por tema (opcional)**
   - Si el **último mensaje del usuario** indica claramente que va de presupuestos (p. ej. “añade categorías”, “presupuesto”, “budget”, “ítems del presupuesto”), el cliente podría enviar **esa** petición directamente con `contextScope: 'full'`.
   - Así el modelo recibe los IDs en la primera respuesta sin depender de que emita el bloque. No hace falta enviar full en todas las consultas, solo en las que el tema sugiere que harán falta IDs de budgets/categorías/ítems.

3. **Mantener auto-fulfill**
   - Seguir detectando `<<REQUEST_CONTEXT>>` y reenviando con `full` sin mostrar UI de “aprueba contexto”, para cuando el modelo sí emita el bloque.

Con (1) y (2) se corrige que “siga diciendo que no puede obtener el ID”: o bien recibe full desde el inicio en conversaciones de presupuestos, o bien aprende a disparar el auto-fulfill de forma fiable.
