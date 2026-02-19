# Plan: Módulo de guía al usuario y tips

Documento de planificación para un futuro **módulo de guía y tips** que ayude al usuario a aprender el sistema mediante recorridos (tours), highlights de elementos UI y explicaciones contextuales. **No se ejecuta en este momento;** solo sirve como referencia para cuando se decida implementar.

---

## 1. Objetivos

- **Reducir la curva de aprendizaje:** que un usuario nuevo entienda cómo usar la app sin leer documentación externa.
- **Contextualizar la UI:** explicar para qué sirve un elemento o un módulo en el momento en que está visible.
- **Soporte in-app:** tips reutilizables (ej. “Así se crea un proyecto”, “Así mueves una tarea”) que se puedan mostrar en distintos contextos.
- **Recorridos guiados (tours):** flujos paso a paso con highlight de elementos y texto explicativo (tooltip/modal).

---

## 2. Capacidades deseadas

### 2.1 Highlight de elementos UI

- Poder **señalar** un elemento de la interfaz (botón, tab, card, sección) con un anillo, overlay o spotlight.
- **Texto explicativo** asociado (tooltip, popover o paso de tour): qué es el elemento y para qué sirve.
- Opcional: pulsación suave o animación para llamar la atención sin ser invasiva.

### 2.2 Recorridos (tours)

- **Tours por flujo:** secuencia de pasos (paso 1 → paso 2 → …) donde cada paso:
  - Opcionalmente ancla a un elemento (selector CSS o ref).
  - Muestra un título y un cuerpo de texto.
  - Incluye acciones: “Siguiente”, “Anterior”, “Cerrar”, “No volver a mostrar”.
- **Tours por contexto:** por ejemplo “Tour: tu primer proyecto”, “Tour: tab Etapas”, “Tour: Ideas”.
- Persistencia: marcar tour como “completado” o “omitido” (localStorage o preferencias de usuario) para no mostrarlo de nuevo.

### 2.3 Tips contextuales

- **Tips por pantalla o módulo:** al entrar en una ruta (ej. `/context/[id]/board`, Ideas, Presupuestos), poder mostrar un tip único o una breve explicación del módulo (“Aquí organizas las tareas por etapas”, “Aquí vinculás ideas al proyecto”).
- **Tips reutilizables:** mismos textos usables tanto en un tour como en un tooltip al hacer hover o en un “?” pequeño.
- Contenido en i18n para mantener una sola fuente de verdad para guías y tips.

### 2.4 Punto de entrada para el usuario

- Un **menú o sección “Guía” / “Ayuda” / “Cómo usar”** (por ejemplo en settings, en el header o en un ícono de “?”) desde donde:
  - Ver listado de tours disponibles.
  - Reiniciar un tour.
  - Ver tips por módulo o por tema (opcional).

---

## 3. Consideraciones técnicas (para cuando se implemente)

- **Anclaje a elementos:** refs en React o selectores por `data-*` (ej. `data-tour="project-picker"`) para no acoplar el tour al estilo o a clases que cambien.
- **Rutas y pasos:** definir tours como datos (array de pasos con `target`, `title`, `body`, `placement`) para poder añadir o editar tours sin tocar mucho código.
- **Accesibilidad:** focos, teclado (Escape para cerrar, flechas si aplica), y que el highlight no rompa el flujo de lectores de pantalla.
- **Rendimiento:** no inyectar lógica pesada en cada página; un provider o un hook “useTour” que solo se active cuando el usuario inicia un tour o cuando la app decide mostrar un tip.
- **i18n:** claves tipo `guide.tour_stages_title`, `guide.tip_ideas_intro` para título y cuerpo de cada paso o tip.

---

## 4. Ideas de contenido (ejemplos)

- **Home (selector de proyecto):** “Estos son tus proyectos. Los que abrís seguido aparecen arriba.” (highlight de la lista o de una card).
- **Tab Salir:** “Salir te lleva de vuelta a la lista de proyectos para elegir otro.”
- **Tab Etapas:** “Acá organizás las tareas en etapas: Pendientes, Lo siguiente, En progreso, Bloqueado.”
- **Tour “Tu primer proyecto”:** pasos: elegir proyecto → ver Etapas → agregar tarea → mover tarea.
- **Módulo Ideas:** “Las ideas se pueden vincular a proyectos y ordenar en mapas mentales.”
- **Presupuestos / Notas / Responsable:** un tip corto por módulo describiendo qué se puede hacer ahí.

---

## 5. Fases sugeridas (solo plan)

1. **Fase 0 (este doc):** Plan y alcance acordado. ✅
2. **Fase 1:** Definir modelo de datos y rutas para “tours” y “tips” (solo estructura, sin UI).
3. **Fase 2:** Componente de highlight + tooltip/popover reutilizable (un solo paso).
4. **Fase 3:** Flujo de tour multi-paso (siguiente/anterior/cerrar) y persistencia (completado/omitido).
5. **Fase 4:** Integración con rutas y módulos (tours por contexto, tips por pantalla).
6. **Fase 5:** Punto de entrada “Guía / Ayuda” y listado de tours/tips.
7. **Fase 6:** Contenido i18n y copy para los tours y tips acordados.

---

## 6. Referencias útiles (para implementación futura)

- Librerías de “product tour”: Driver.js, React Joyride, Intro.js, Shepherd.js (evaluar accesibilidad y peso).
- Patrón “spotlight” + modal para pasos.
- `data-*` para anclas y no depender de clases de estilo.

---

**Resumen:** Este plan describe un módulo de **guía y tips** con highlight de UI, recorridos guiados y tips contextuales, sin implementación actual. Cuando se decida ejecutarlo, se puede seguir por fases a partir de la sección 5.
