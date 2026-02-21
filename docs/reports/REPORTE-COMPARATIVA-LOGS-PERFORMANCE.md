# Reporte: Comparativa de logs antes/después (optimización data-loading)

**Fecha:** 2025-02-15  
**Origen:** Logs de terminal con `npm run dev` (navegación por rutas principales).  
**Objetivo:** Comparar estado **anterior** (antes del patrón server fetch + cache + props) con los **nuevos logs** tras aplicar las optimizaciones en Dashboard, Projects, Clients, Businesses, Billings, Budgets, Ideas, Notes, Todo y Settings/Appearance.

---

## 1. Resumen ejecutivo

Tras aplicar el patrón de `docs/patterns/data-loading.md` (carga en servidor, `cache()` en lecturas, props iniciales al cliente sin fetch en `useEffect`), los **nuevos logs** muestran:

- **Reducción clara de POSTs** en las páginas listadas: de 6–10+ POSTs a 2–6 POSTs por carga inicial.
- **Tiempos GET** en rango ~300–1050 ms (incluyendo compilación en frío); las rutas optimizadas no disparan ya la cascada de POSTs que había antes en el cliente.
- **Páginas pendientes** (rutas dinámicas `/project/[id]`, `/clients/[id]`, `/budgets/[id]`, `/todo/list/[id]`, `/notes/[id]`) siguen con 6–9+ POSTs y son candidatas al mismo patrón.
- Los **traces 🔵 [SERVER ACTION]** confirman que en Profile y Settings/Appearance la carga principal ocurre en el servidor (RSC); las POST restantes son hidratación/refetch del cliente.

---

## 2. Criterios de comparación

- **Logs anteriores:** Estado documentado en el primer performance audit (páginas con 6–10+ POSTs y tiempos ~1–1.5 s).
- **Logs nuevos:** Salida real del terminal compartida (líneas 7–317), misma sesión `npm run dev`, navegación manual por cada ruta.
- **Métricas:** Número de POST por ruta en la secuencia de carga, y tiempo del GET (incl. `_rsc` cuando aplica).

---

## 3. Comparativa por ruta

### 3.1 Páginas ya optimizadas (server fetch + props)

| Ruta                     | Antes (est.)    | Nuevos logs            | Observaciones                                                                      |
| ------------------------ | --------------- | ---------------------- | ---------------------------------------------------------------------------------- |
| **/dashboard**           | ~3–4 POSTs, <1s | GET 6424ms\* + 6 POST  | \*Primera compilación. POSTs incluyen `getProfile` desde cliente (layout/sidebar). |
| **/projects**            | ~3–4 POSTs      | GET 590ms, **2 POST**  | ✅ Reducción; datos listados vienen del servidor.                                  |
| **/ideas**               | 6 POSTs         | GET 496ms, **4 POST**  | ✅ Menos POSTs; sidebar y datos iniciales por props.                               |
| **/todo**                | 8+ POSTs        | GET 301ms, **6 POST**  | ✅ Mejor; listas y proyectos desde servidor.                                       |
| **/budgets**             | 10 POSTs        | GET 652ms, **6 POST**  | ✅ Menos cascada; datos iniciales en RSC.                                          |
| **/clients**             | ~2–3 POSTs      | GET 1049ms, **2 POST** | ✅ Ya bajo; se mantiene.                                                           |
| **/businesses**          | 6+ POSTs        | GET 433ms, **2 POST**  | ✅ Reducción fuerte.                                                               |
| **/billings**            | 10+ POSTs       | GET 761ms, **4 POST**  | ✅ Gran mejora.                                                                    |
| **/notes**               | 8+ POSTs        | GET 455ms, **3 POST**  | ✅ Menos carga en cliente.                                                         |
| **/profile**             | 4 POSTs, ~0.9s  | GET 1055ms, 4 POST     | Server: getProfileWithAvatar, getProfile, getAssetSignedUrl. POSTs = hidratación.  |
| **/settings/appearance** | 7+ POSTs        | GET 961ms, **4 POST**  | Server: getPreferences + 2× getAssetSignedUrl. ✅ Sin loadPrefs en mount.          |

### 3.2 Rutas dinámicas (pendientes de optimizar)

| Ruta                    | Nuevos logs                                     | Observaciones                                                      |
| ----------------------- | ----------------------------------------------- | ------------------------------------------------------------------ |
| **/project/[id]**       | GET 368ms, **8 POST**                           | Candidata a server fetch + props.                                  |
| **/clients/[id]**       | GET 344ms, **9 POST**                           | Idem.                                                              |
| **/budgets/[id]**       | GET 156ms, **5 POST** (+ navegación a /budgets) | Idem.                                                              |
| **/todo/list/[listId]** | GET 851ms, **2 POST** a la ruta + POSTs a /todo | Mejor que antes (8+), pero aún se puede llevar datos por servidor. |
| **/notes/[id]**         | GET 459ms, **2 POST**                           | Menos carga; posible optimizar con props.                          |
| **/businesses/[id]**    | GET 817ms, **3 POST** + 2 POST /businesses      | Intermedio.                                                        |

---

## 4. Análisis de los traces 🔵 [SERVER ACTION]

En los nuevos logs aparecen:

1. **getProfile** desde `action-browser` (cliente) en **Dashboard**: el layout/sidebar sigue llamando a `getProfile()` en el cliente; por eso se ven varias POST /dashboard. Es esperado hasta que el layout pase a recibir perfil por props desde un Server Component padre.
2. **Profile:** getProfileWithAvatar (RSC) → getProfile (interno) → getAssetSignedUrl (RSC): toda la carga en servidor; las 4 POST /profile son hidratación/refetch.
3. **Settings/Appearance:** getAssetSignedUrl × 2 desde **AppearanceSettingsPage** (RSC): las URLs de logo y cover se resuelven en el GET; ya no hay `loadPrefs()` en mount en el cliente.

Conclusión: las acciones de **lectura** se ejecutan en servidor en Profile y Appearance; las POST restantes son uso normal de Server Actions desde el cliente (hidratación, preferencias de tema, etc.).

---

## 5. Resumen de impacto

| Métrica                    | Antes (aprox.) | Después (logs nuevos)      |
| -------------------------- | -------------- | -------------------------- |
| POSTs /projects            | ~3–4           | 2                          |
| POSTs /ideas               | 6              | 4                          |
| POSTs /todo                | 8+             | 6                          |
| POSTs /budgets             | 10             | 6                          |
| POSTs /businesses          | 6+             | 2                          |
| POSTs /billings            | 10+            | 4                          |
| POSTs /notes               | 8+             | 3                          |
| POSTs /settings/appearance | 7+             | 4 (y carga inicial en GET) |

Las rutas listadas confirman **menos POSTs por carga** y **carga inicial en el GET** (RSC) en lugar de cascadas en el cliente. Las rutas con `[id]` siguen siendo el siguiente objetivo para aplicar el mismo patrón.

---

## 6. Recomendaciones

1. **Rutas dinámicas:** Aplicar server fetch + `cache()` + props en `/project/[id]`, `/clients/[id]`, `/budgets/[id]`, `/todo/list/[listId]` y opcionalmente `/notes/[id]` y `/businesses/[id]`.
2. **Dashboard:** Valorar pasar perfil/preferencias desde layout (Server Component) al sidebar para reducir POSTs de `getProfile` en el cliente.
3. **Traces:** Los `console`/traces de depuración (`🔵 [SERVER ACTION]`) se pueden quitar o condicionar a `process.env.NODE_ENV === 'development'` y un flag para no saturar logs en producción.
4. **Repetir medición:** En build de producción (`next build` + `next start`) los tiempos y el número de POSTs pueden variar; conviene repetir la comparativa en ese entorno.

---

**Documentos relacionados:** [docs/audits/PERFORMANCE_AUDIT.md](../audits/PERFORMANCE_AUDIT.md), [docs/patterns/data-loading.md](../patterns/data-loading.md), [docs/reports/REPORTE-OPTIMIZACION-PROFILE.md](REPORTE-OPTIMIZACION-PROFILE.md).
