# Idea Graph MVP - Testing Checklist

## Pruebas Manuales para Validar el Flujo MVP

### 1. Ideas Globales
- [ ] Crear una nueva idea desde `/ideas`
- [ ] Ver lista de ideas con búsqueda funcionando
- [ ] Editar título y descripción de una idea
- [ ] Eliminar una idea y verificar que desaparece de la lista

### 2. Boards
- [ ] Crear un nuevo board desde `/ideas/boards`
- [ ] Ver lista de boards
- [ ] Agregar una idea existente a un board con posición x/y
- [ ] Verificar que la misma idea puede estar en múltiples boards

### 3. Canvas y Drag
- [ ] Abrir canvas de un board (`/ideas/boards/[id]/canvas`)
- [ ] Ver nodos posicionados correctamente según x/y
- [ ] Arrastrar un nodo y verificar que se guarda la nueva posición
- [ ] Verificar que las líneas de conexión se actualizan al mover nodos

### 4. Conexiones entre Ideas
- [ ] Click derecho en un nodo para iniciar conexión
- [ ] Click en otro nodo para completar la conexión
- [ ] Verificar que aparece la línea SVG entre los nodos
- [ ] Click en una línea para eliminar conexión (con confirmación)
- [ ] Verificar que ESC cancela el modo conexión

### 5. Vinculación Idea ↔ Proyecto (Desde Idea)
- [ ] Ir a `/ideas/[id]` de una idea
- [ ] En sección "Linked Projects", seleccionar un proyecto del dropdown
- [ ] Agregar role opcional (ej: "origin")
- [ ] Submit y verificar que el proyecto aparece en la lista
- [ ] Verificar que el nombre del proyecto se muestra (no solo ID)
- [ ] Click en "Unlink" y confirmar eliminación
- [ ] Intentar vincular el mismo proyecto dos veces y verificar mensaje de error

### 6. Vinculación Idea ↔ Proyecto (Desde Proyecto)
- [ ] Ir a `/project/[id]` de un proyecto
- [ ] Verificar que aparece sección "Linked Ideas" (overlay o integrada)
- [ ] Verificar que se muestran las ideas vinculadas con sus títulos
- [ ] Click en título de idea para navegar a `/ideas/[ideaId]`
- [ ] Click en "Unlink" desde la página del proyecto y verificar que funciona
- [ ] Verificar que el role se muestra si existe

### 7. Integración End-to-End
- [ ] Vincular idea A a proyecto X desde `/ideas/[id]`
- [ ] Ir a `/project/[id]` y verificar que idea A aparece en "Linked Ideas"
- [ ] Desde proyecto, hacer unlink de idea A
- [ ] Volver a `/ideas/[id]` y verificar que el link desapareció
- [ ] Crear conexión entre idea A e idea B en un board
- [ ] Verificar que la conexión se muestra en el canvas

### 8. Validaciones y Edge Cases
- [ ] Intentar vincular idea a proyecto inexistente (debe fallar)
- [ ] Intentar crear conexión de una idea a sí misma (debe fallar)
- [ ] Verificar que proyectos ya vinculados no aparecen en el dropdown
- [ ] Verificar que al eliminar una idea, sus links y conexiones se eliminan (CASCADE)
