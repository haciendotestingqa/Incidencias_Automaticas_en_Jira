# Guía: Configurar Campos desde la Configuración del Proyecto

Si solo ves "Configuración general" y "Notificaciones", necesitas acceder a la configuración del **PROYECTO**, no a tu perfil.

---

## 🎯 Método 1: Desde el Proyecto QUENOVA (Recomendado)

### Paso 1: Ir al Proyecto
1. En Jira, haz clic en **"Projects"** (Proyectos) en el menú superior
2. O busca **"QUENOVA"** en la barra de búsqueda
3. Selecciona el proyecto **QUENOVA**

### Paso 2: Acceder a Configuración del Proyecto
1. Una vez dentro del proyecto QUENOVA, busca el menú del lado izquierdo
2. Busca **"Project settings"** (Configuración del proyecto) o **"⚙️"** (ícono de engranaje)
3. Haz clic en **"Project settings"**

**Ruta:** `Projects → QUENOVA → Project settings`

### Paso 3: Ir a Screens
1. En el menú lateral de configuración del proyecto, busca **"Screens"** (Pantallas)
2. O busca **"Issue types"** (Tipos de incidencia) y luego **"Screens"**

### Paso 4: Ver qué Pantalla Usa el Tipo "Incidencia"
1. Ve a **"Issue types"** (Tipos de incidencia)
2. Encuentra **"Incidencia"** en la lista
3. Haz clic en el nombre o en "..." → **"Edit"**
4. Verás qué pantalla está asociada (ej: "Default Screen")

### Paso 5: Editar la Pantalla
1. Vuelve a **"Screens"**
2. Encuentra la pantalla que identificaste (ej: "Default Screen")
3. Haz clic en el nombre o en "..." → **"Edit"**
4. Se abrirá el editor de pantallas

### Paso 6: Agregar Campos
1. Arrastra **"Plataforma"** desde la columna izquierda hacia la derecha
2. (Opcional) Arrastra **"Categoria"** también
3. Haz clic en **"Update"** o **"Save"**

---

## 🎯 Método 2: Desde el Menú de Jira (Si tienes acceso)

### Si ves un menú "⚙️" diferente:

1. Haz clic en el **ícono ⚙️** en la esquina superior derecha (junto a tu foto de perfil)
2. Si aparece un menú desplegable, busca:
   - **"System"** (Sistema) - Solo si eres administrador del sistema
   - **"Projects"** (Proyectos) - Para acceder a proyectos
   - **"Jira settings"** (Configuración de Jira)

3. Si ves **"Projects"**, sigue el Método 1
4. Si ves **"System"**, ve a: **System → Issues → Screens**

---

## 🎯 Método 3: Desde una Incidencia Existente

### Paso 1: Abrir una Incidencia
1. Ve a cualquier incidencia del proyecto QUENOVA (ej: QUENOVA-7)
2. En la parte superior de la incidencia, busca **"..."** (tres puntos) o **"⚙️"**
3. Busca **"Configure fields"** (Configurar campos) o **"Screen configuration"**

### Paso 2: Configurar desde ahí
- Esto puede variar según la versión de Jira, pero algunos permiten configurar campos desde aquí

---

## 🔍 Método 4: Buscar Directamente

### Paso 1: Usar la Barra de Búsqueda
1. En la barra superior de Jira, haz clic en el ícono de **búsqueda** o escribe directamente
2. Busca: **"screen configuration"** o **"project screens"**
3. O busca: **"QUENOVA project settings"**

### Paso 2: Acceder desde Resultados
- Los resultados te llevarán a la configuración correcta

---

## 📋 Verificar Permisos

### Si no ves "Project settings":

1. **Verifica que estás en el proyecto correcto:**
   - Asegúrate de estar dentro del proyecto QUENOVA
   - No solo buscándolo, sino dentro de su espacio

2. **Verifica permisos:**
   - Aunque seas dueña de la cuenta, es posible que necesites permisos específicos del proyecto
   - Ve a: `Projects → QUENOVA → Project settings → Permissions`
   - Verifica que tienes rol de "Administrator" o "Project Administrator"

3. **Si no tienes permisos:**
   - Necesitarás que un administrador del sistema te dé permisos
   - O contacta al administrador de Jira para que haga los cambios

---

## 🎯 Pasos Específicos para Jira Cloud

Si estás usando Jira Cloud (jira.atlassian.net):

1. **Ve al proyecto:**
   - Haz clic en **"Projects"** en el menú superior
   - Selecciona **"QUENOVA"**

2. **Menú lateral:**
   - En el menú izquierdo del proyecto, busca **"Project settings"** (debajo de las opciones del proyecto)
   - O busca el ícono **⚙️** junto al nombre del proyecto

3. **Configuración:**
   - Dentro de Project settings, busca **"Screens"** o **"Issue types"**

---

## 🎯 Pasos Específicos para Jira Server/Data Center

Si estás usando Jira Server:

1. **Menú superior:**
   - Busca **"Projects"** → **"View all projects"**
   - O ve directamente a tu proyecto QUENOVA

2. **Configuración del proyecto:**
   - Dentro del proyecto, busca **"Administration"** o **"⚙️"**
   - Luego **"Screens"** o **"Issue types"**

---

## ❓ ¿Qué versión de Jira estás usando?

Para darte instrucciones más precisas, dime:
- ¿Ves "cohetedigital.atlassian.net" en la URL? (Jira Cloud)
- ¿O es una URL diferente como "jira.tuempresa.com"? (Jira Server)

---

## 📞 Resumen Rápido

**Intenta esta ruta:**
```
1. Projects → QUENOVA
2. Buscar "Project settings" o "⚙️" en el menú lateral
3. Screens o Issue types → Screens
4. Editar pantalla → Agregar campos → Save
```

Si no encuentras "Project settings", es posible que necesites permisos adicionales o que la interfaz sea diferente según tu versión de Jira.

