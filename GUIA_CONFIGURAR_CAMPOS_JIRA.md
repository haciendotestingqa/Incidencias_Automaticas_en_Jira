# Guía Paso a Paso: Configurar Campos en Pantallas de Jira

Esta guía te ayudará a agregar los campos "Plataforma" y "Categoria" a las pantallas de creación/edición en Jira.

## 📋 Requisitos Previos

- ✅ Tener permisos de **Administrador de Jira** o **Administrador del Proyecto**
- ✅ Acceso a la configuración de Jira

---

## 🔧 PASO 1: Acceder a la Configuración de Pantallas

1. **Inicia sesión en Jira** con tu cuenta de administrador
2. Haz clic en el **⚙️ ícono de Configuración** (Settings) en la esquina superior derecha
3. Selecciona **"Issues"** (Problemas) en el menú lateral izquierdo
4. Haz clic en **"Screens"** (Pantallas)

**Ruta completa:** `Settings → Issues → Screens`

---

## 🔍 PASO 2: Identificar la Pantalla Correcta

Necesitas encontrar la pantalla que se usa para el tipo de incidencia "Incidencia":

### Opción A: Ver pantalla por tipo de incidencia
1. En el menú lateral, ve a **"Issue Types"** (Tipos de incidencias)
2. Haz clic en **"Incidencia"** (o el tipo que uses)
3. Verás qué pantalla está asociada (ej: "Default Screen" o "Create Screen")

### Opción B: Ver pantalla del proyecto
1. Ve a **"Projects"** (Proyectos) en el menú lateral
2. Selecciona tu proyecto **"QUENOVA"**
3. Ve a **"Screens"** o **"Issue Types"**
4. Revisa qué pantalla se usa para crear/editar incidencias

**Pantallas comunes:**
- **Default Screen**: Pantalla por defecto
- **Create Screen**: Pantalla de creación
- **Edit Screen**: Pantalla de edición
- **View Screen**: Pantalla de visualización

---

## ✏️ PASO 3: Editar la Pantalla

1. En la lista de pantallas, encuentra la pantalla que identificaste
2. Haz clic en el **nombre de la pantalla** o en **"..." → Edit"** (Editar)
3. Se abrirá el editor de pantallas

---

## ➕ PASO 4: Agregar el Campo "Plataforma"

1. En el editor de pantallas, verás dos columnas:
   - **Izquierda**: Campos disponibles (Available Fields)
   - **Derecha**: Campos en la pantalla (Screen Fields)

2. En la columna izquierda, busca el campo **"Plataforma"**
   - Puedes usar la búsqueda si hay muchos campos
   - El campo debería tener el ID: `customfield_10124`

3. **Arrastra** el campo "Plataforma" desde la izquierda hacia la derecha
   - O haz clic en el campo y luego en la flecha **"→"** para moverlo

4. Coloca el campo donde quieras que aparezca:
   - Puedes arrastrarlo arriba o abajo para cambiar el orden
   - Se recomienda colocarlo cerca de campos relacionados (ej: después de "Recurso")

5. Haz clic en **"Update"** (Actualizar) o **"Save"** (Guardar)

---

## ➕ PASO 5: Agregar el Campo "Categoria" (Opcional)

Repite el proceso anterior para "Categoria":
1. Busca el campo **"Categoria"** (ID: `customfield_10128`)
2. Arrástralo a la pantalla
3. Colócalo en la posición deseada
4. Guarda los cambios

---

## ✅ PASO 6: Verificar la Configuración

1. Ve a tu proyecto QUENOVA
2. Haz clic en **"Create"** (Crear) para crear una nueva incidencia
3. Verifica que los campos "Plataforma" y "Categoria" aparezcan en el formulario
4. Si aparecen, la configuración fue exitosa

---

## 🔄 PASO 7: Probar el Script

1. Vuelve a ejecutar el script:
   ```bash
   node registrar_incidencia_jira.js
   ```

2. Los campos "Plataforma" y "Categoria" ahora deberían registrarse correctamente

---

## ⚠️ Problemas Comunes y Soluciones

### Problema 1: "No tengo permisos de administrador"
**Solución:**
- Contacta al administrador de Jira de tu organización
- Pídeles que agreguen los campos a las pantallas siguiendo estos pasos
- O pídeles permisos de administrador del proyecto

### Problema 2: "No encuentro el campo en la lista"
**Solución:**
- Verifica que el campo existe: `Settings → Issues → Custom Fields`
- Busca "Plataforma" en la lista de campos personalizados
- Si no existe, primero debes crearlo

### Problema 3: "El campo aparece pero no se puede editar"
**Solución:**
- Verifica que estás editando la pantalla correcta (Create/Edit, no View)
- Asegúrate de que el campo está en la pantalla de **edición**, no solo de visualización

### Problema 4: "No sé qué pantalla usar"
**Solución:**
1. Ve a `Settings → Projects → QUENOVA → Screens`
2. Revisa qué pantalla se usa para el tipo "Incidencia"
3. O ve a `Settings → Issues → Issue Types → Incidencia`
4. Verás qué pantalla está configurada

---

## 📝 Notas Importantes

1. **Pantalla de Creación vs Edición:**
   - Puedes tener pantallas separadas para crear y editar
   - Necesitas agregar los campos a **ambas** pantallas si quieres que funcionen en creación y edición

2. **Orden de Campos:**
   - El orden en la pantalla no afecta la funcionalidad
   - Solo afecta cómo se muestran al usuario

3. **Campos Requeridos:**
   - Si haces un campo "requerido", aparecerá con un asterisco (*)
   - Esto no es necesario para que el script funcione

4. **Permisos:**
   - Los cambios en pantallas afectan a todos los usuarios del proyecto
   - Asegúrate de tener aprobación antes de hacer cambios

---

## 🎯 Resumen Rápido

1. ⚙️ Settings → Issues → Screens
2. 🔍 Encuentra la pantalla usada por "Incidencia"
3. ✏️ Edita la pantalla
4. ➕ Arrastra "Plataforma" (y "Categoria") a la pantalla
5. 💾 Guarda los cambios
6. ✅ Verifica creando una incidencia manualmente
7. 🚀 Ejecuta el script nuevamente

---

## 📞 Si Necesitas Ayuda

Si tienes problemas, verifica:
- ✅ Que tienes permisos de administrador
- ✅ Que el campo existe en Jira (Settings → Custom Fields)
- ✅ Que estás editando la pantalla correcta (Create/Edit)
- ✅ Que guardaste los cambios correctamente

**Alternativa:** Si no puedes configurar las pantallas, puedes usar la opción de **Bulk Edit** en Jira para actualizar las incidencias existentes manualmente.

