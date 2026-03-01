# 📦 Media Vault Module

## Documento de Diseño Funcional

---

## 1️⃣ Propósito del módulo

El **Media Vault** es el módulo responsable de:

> Centralizar, organizar y versionar los archivos visuales asociados a un contexto activo del sistema.

No es almacenamiento genérico.  
No es Google Drive.  
No es un CMS completo.

Es un sistema estructurado de activos visuales que viven dentro de un contexto (ej: proyecto, cliente, iniciativa, etc.).

---

## 2️⃣ Problema que resuelve

Sin este módulo:

- Los archivos quedan dispersos
- No hay control de versiones visuales
- No hay trazabilidad
- No hay orden por categorías
- No se puede marcar una versión como final
- No existe relación entre media y tareas

El Media Vault existe para:

- ✔️ Reducir caos visual
- ✔️ Proteger activos importantes
- ✔️ Mantener contexto limpio
- ✔️ Permitir evolución controlada de archivos

---

## 3️⃣ Qué es “media” en este sistema

### Media incluye:

- Imágenes (png, jpg, webp, svg)
- Videos cortos
- Mockups
- Screenshots
- Material visual de referencia

### No incluye:

- PDFs contractuales
- Facturas
- Documentos legales
- Links
- Texto estructurado

Este módulo es exclusivamente visual.

---

## 4️⃣ Principios del módulo

### Context-first

El Media Vault siempre opera sobre el contexto activo.

### Seguridad por defecto

Un usuario solo puede ver media asociada a contextos que posee.

### Orden antes que volumen

Se prioriza clasificación y estructura sobre cantidad de archivos.

### No es un editor

El módulo no modifica imágenes, solo las gestiona.

### Versionabilidad ligera

Puede marcarse un archivo como “final”, pero no es Git.

---

## 5️⃣ Features principales (Core)

### 5.1 Upload Media

Permite subir archivos visuales al contexto activo.

**Requisitos:**

- Validación de tipo MIME
- Límite de tamaño
- Asignación obligatoria de categoría
- Generación automática de metadatos (size, width, height)

---

### 5.2 Clasificación por categoría

Cada archivo debe pertenecer a una categoría:

- branding
- content
- reference
- screenshot
- mockup
- other

**Objetivo:**  
Permitir orden mental inmediato.

---

### 5.3 Vista en grid

Visualización en tarjetas:

- Preview
- Título
- Estado (final / normal)
- Indicador si está archivado

**UX clave:**  
Debe sentirse ligero, no pesado.

---

### 5.4 Archivo lógico (Archive)

El archivo no se elimina físicamente.

Se puede:

- Archivar
- Desarchivar

**Objetivo:**  
No borrar historia visual.

---

### 5.5 Marcar como Final

Un archivo puede marcarse como:
