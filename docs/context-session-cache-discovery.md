# Descubrimiento: cache de sesión en contexto

**Estado:** Parte de la arquitectura  
**Fecha:** 2026-02  
**Contexto:** Fase 3 de navegación instantánea — no volver a cargar lo que ya cargamos.

Este documento explica el descubrimiento, el impacto en UX y rendimiento, cómo lo identificamos, cómo encontrar más ideas similares y cómo respetar esta forma de desarrollo en reglas y arquitectura.

---

## 1. Qué es y qué problema resuelve

### Idea central

**Si el usuario ya cargó una pantalla o un contexto en esta sesión, no volver a pedir esos datos al servidor al volver.** Mostrar de inmediato lo que ya tenemos en memoria (cache de sesión en el cliente).

En nuestro caso: el usuario entra a un proyecto, recorre Board, Notas, Ideas, Presupuestos, Tareas. Luego va a otro proyecto y hace lo mismo. Cuando **vuelve al primer proyecto**, no debe ver loading de nuevo: el proyecto, las notas, las ideas, etc. ya están en cache.

### Problema que teníamos

- Cada vez que el usuario cambiaba de tab o volvía a un proyecto, la app hacía **fetch de nuevo**.
- Eso generaba: más solicitudes al servidor, más tiempo de espera, más estados de loading y una sensación de “lentitud” aunque los datos no hubieran cambiado.
- El usuario ya había “pagado” el costo de carga la primera vez; al volver, la app actuaba como si no recordara nada.

### Solución en una frase

**Cache en cliente (React Context) por “contexto” (proyecto + tipo de dato), con el provider montado por encima de todas las rutas que comparten ese contexto, de modo que el cache sobreviva al cambiar de proyecto o de tab.**

---

## 2. Cómo mejoró la UX

- **Cero loading al volver:** Al regresar a un proyecto o tab ya visitado, el contenido aparece al instante. No hay spinner ni “Loading…” innecesario.
- **Sensación de fluidez:** La app “recuerda” lo que el usuario ya vio. Refuerza la idea de que el sistema es rápido y coherente.
- **Menos interrupciones:** El usuario no tiene que esperar de nuevo por datos que no han cambiado; puede seguir trabajando sin fricción.
- **Consistencia con el principio psicológico:** “Data that’s already loaded and can’t have changed under the user’s actions shouldn’t be refetched.” (Véase `docs/plan-instant-navigation-and-skeletons.md`.)

---

## 3. Cómo mejoró la optimización

- **Menos trabajo en servidor:** No se ejecutan consultas ni server actions para datos que ya están en el cliente.
- **Menos trabajo en red:** No se envían requests ni se transfieren los mismos payloads una y otra vez.
- **Menos re-renders de loading:** Los componentes no pasan por estado “loading” cuando hay cache hit; pintan directo con datos.
- **Uso eficiente de memoria:** El cache vive solo en la sesión (no persiste en disco); al cerrar la pestaña se libera. Es un buen equilibrio entre velocidad y recursos.

---

## 4. Reducción de fetches y tiempos de carga

### Antes (sin cache de sesión)

- Usuario en Proyecto A, tab Board → 1 fetch (proyecto + tareas).
- Cambia a Notas → 1 fetch (notas).
- Cambia a Ideas → 1 fetch (boards).
- Va a Proyecto B, tab Board → 1 fetch.
- … repite en B …
- **Vuelve a Proyecto A, tab Board → otra vez 1 fetch (proyecto + tareas).**
- Cambia a Notas → **otra vez 1 fetch (notas).**
- etc.

Cada “vuelta” a un proyecto o tab = **nuevos fetches** y nuevos tiempos de carga (red + servidor + DB).

### Después (con cache de sesión)

- Primera vez que entra a cada proyecto/tab: mismo número de fetches (necesarios).
- **Cada vez que vuelve** a un proyecto o tab ya visitado: **0 fetches** para ese contexto; se lee del cache en memoria.
- Tiempo de “carga” al volver: **~0 ms** (solo render con datos ya disponibles).

En flujos donde el usuario alterna entre varios proyectos y tabs, la reducción de fetches y de tiempo percibido es muy grande.

---

## 5. Cómo lo identificamos

### Síntoma

El usuario reportó: “Veo loading por todos lados. Entro a un proyecto, navego todos sus módulos (cargando toda la información). Voy a otro proyecto y hago lo mismo. Cuando regreso al proyecto inicial, hace loading al entrar al proyecto, loading en notas, en ideas, en budgets, en tareas. Todo eso ya debería estar cargado.”

### Análisis

1. **Confirmar que el cache existía pero “no funcionaba” al volver:** Ya teníamos cache (ContextDataCache) y componentes `*FromCache`, pero al regresar al primer proyecto seguía habiendo loading.
2. **Pregunta clave:** ¿Dónde vive el provider del cache? Estaba en `app/context/[projectId]/layout.tsx`.
3. **Consecuencia:** Ese layout es **por proyecto**. Al navegar de Proyecto A a Proyecto B, el layout de A se **desmonta** y el de B se monta. Al desmontar, todo el estado de React (incluido el cache) se pierde. Al volver a A, se monta un **nuevo** provider con cache **vacío**.
4. **Solución:** Mover el provider a un layout que **no** dependa de `[projectId]`: `app/context/layout.tsx`. Así el mismo provider (y el mismo cache) permanece montado al cambiar entre proyectos.

Este proceso quedó documentado en `docs/plan-fase3-cache-fix.md`.

### Lección

El comportamiento del cache no solo depende de la lógica get/set/invalidate, sino de **dónde vive el provider en el árbol de rutas**. Si el provider está dentro de un segmento dinámico que se desmonta al navegar, el cache se pierde. Para cache que debe persistir entre “vistas” (proyectos, tabs), el provider debe vivir en un layout **por encima** de esas vistas.

---

## 6. Cómo identificar más ideas como esta

### Preguntas útiles

1. **¿El usuario vuelve a ver los mismos datos sin haberlos modificado?**  
   Si sí, y cada vez hay fetch + loading, es candidato a cache de sesión.

2. **¿Los datos solo pueden cambiar por acciones del usuario en esta pantalla?**  
   Si no hay otros actores (otros usuarios, workers) que cambien esos datos mientras navega, es seguro mostrarlos desde cache al volver.

3. **¿Hay un “contexto” claro (proyecto, workspace, cuenta) con varias “vistas” o tabs?**  
   Ese contexto es un buen ámbito para un cache keyed por contexto + tipo de dato.

4. **¿Al navegar se desmonta algo que guarda estado?**  
   Si el “estado” (cache) vive en un componente o layout que se desmonta, hay que subir el provider para que no se desmonte.

### Señales de que hace falta cache de sesión

- Loading repetido al volver a una pantalla ya visitada.
- Muchos fetches idénticos (mismo recurso) en una misma sesión.
- Quejas de “va lento” o “tarda cada vez que cambio de pestaña/proyecto”.

### No confundir con

- **React `cache()` en el servidor:** Deduplica dentro de **una** request; no persiste entre navegaciones.
- **Revalidación tras mutaciones:** Sigue siendo necesaria; el cache de sesión se invalida/actualiza con `onRefresh` (invalidar + refetch) después de crear/editar/eliminar.

---

## 7. Cómo respetar esta forma de desarrollo

### Reglas de arquitectura

1. **Provider por encima del ámbito que debe compartir cache**  
   Si el cache debe persistir al cambiar de “X” (proyectos, workspaces, etc.), el provider no puede estar dentro del layout de cada “X”; debe estar en el layout padre común.

2. **Claves de cache por contexto + tipo de dato**  
   Ejemplo: `project:${id}`, `board:${id}`, `notes:${id}`. Así no se mezclan datos de distintos contextos.

3. **Primera carga: fetch y guardar en cache**  
   Si no hay entrada en cache, fetch (server action o RSC que pase datos al cliente) y al recibir datos, guardarlos en cache.

4. **Mutaciones: invalidar y opcionalmente refetch**  
   Tras una mutación que afecte a un contexto (ej. crear nota), invalidar esa clave (o llamar a `onRefresh` que invalida y refetchea) y actualizar la UI con el resultado para no quedarnos con datos obsoletos.

5. **No usar cache de sesión para datos que cambian fuera del control del usuario**  
   Si otros usuarios o procesos modifican los datos en tiempo real, el cache de sesión puede quedar desactualizado; en esos casos considerar Realtime, polling o no cachear.

### En Cursor y en código

- Las reglas del proyecto (`.cursorrules`) y el patrón en `docs/patterns/context-session-cache.md` deben leerse **antes** de implementar o tocar rutas/contextos que ya usan cache de sesión.
- Al añadir una nueva “vista” o tab dentro de un contexto cacheado, seguir el mismo patrón: componente `*FromCache` que lee cache o fetchea, guarda en cache y recibe `onRefresh` para mutaciones.
- Al crear un **nuevo** ámbito de cache (ej. otro tipo de contexto además de “proyecto”), decidir dónde debe vivir el provider para que no se desmonte al navegar dentro de ese ámbito.

---

## 8. Resumen

| Aspecto | Antes | Después |
|--------|--------|--------|
| UX al volver a proyecto/tab | Loading cada vez | Contenido al instante desde cache |
| Fetches al volver | Los mismos que la primera vez | 0 (lectura desde memoria) |
| Tiempo percibido al volver | Igual que primera carga | ~0 ms |
| Criterio | “Siempre datos frescos” (refetch) | “No refetch si ya los cargamos y no han cambiado” |
| Dónde vive el provider | Layout por proyecto (se desmontaba) | Layout común `/context` (persiste) |

El descubrimiento no fue solo “añadir un cache”, sino **dónde colocar el provider** para que el cache sobreviva a la navegación. Eso convierte la idea en algo que realmente mejora la experiencia y la optimización en cada vuelta a un contexto ya visitado.

Para la implementación concreta y las reglas de código, ver `docs/patterns/context-session-cache.md` y la sección correspondiente en `.cursorrules`.
