# Instrucciones para Configurar el Script de Automatización

## 📋 Requisitos Previos

1. **Node.js 14 o superior** instalado en tu sistema
2. **npm** (viene con Node.js)
3. **Acceso a Jira** con permisos para crear incidencias
4. **API Token de Jira** (ver instrucciones abajo)

## 🔑 Paso 1: Obtener tu API Token de Jira

1. Ve a: https://id.atlassian.com/manage-profile/security/api-tokens
2. Inicia sesión con tu cuenta de Jira
3. Haz clic en **"Crear token API"** (Create API token)
4. Dale un nombre descriptivo (ej: "Script Automatización Incidencias")
5. Copia el token generado (solo se muestra una vez)
6. **⚠️ IMPORTANTE**: Guarda este token de forma segura

## ⚙️ Paso 2: Configurar el archivo config_jira.json

Abre el archivo `config_jira.json` y completa los siguientes campos:

### Campos a completar:

1. **`jira_server`**: 
   - Si usas Jira Cloud: `https://tu-empresa.atlassian.net`
   - Si usas Jira Server: `https://tu-servidor-jira.com`
   - Ejemplo: `https://quenova.atlassian.net`

2. **`email`**: 
   - Tu dirección de email con la que inicias sesión en Jira
   - Ejemplo: `veronica.romero@empresa.com`

3. **`api_token`**: 
   - El token API que obtuviste en el Paso 1
   - Ejemplo: `ATATT3xFfGF0...` (tu token completo)

4. **`project_key`**: 
   - La clave del proyecto donde quieres crear la incidencia
   - Puedes verla en la URL de tu proyecto: `https://...jira.net/browse/PROJ-123`
   - La clave es la parte antes del guión (ej: `PROJ`)
   - Ejemplo: `INC` o `BUG`

5. **`issue_type`**: 
   - El tipo de incidencia que quieres crear
   - Valores comunes: `Incidencia`, `Bug`, `Tarea`, `Historia`
   - Debe coincidir exactamente con el nombre en tu Jira

### Ejemplo de config_jira.json completo:

```json
{
  "jira_server": "https://quenova.atlassian.net",
  "email": "veronica.romero@empresa.com",
  "api_token": "ATATT3xFfGF0TuTokenCompletoAquí123456789",
  "project_key": "INC",
  "issue_type": "Incidencia"
}
```

## 📦 Paso 3: Instalar las Dependencias

Abre una terminal en la carpeta del proyecto y ejecuta:

```bash
npm install
```

Esto instalará automáticamente todas las dependencias necesarias (axios para hacer peticiones a la API de Jira).

## 🚀 Paso 4: Ejecutar el Script

Una vez configurado todo, ejecuta:

```bash
node registrar_incidencia_jira.js
```

O usando npm:

```bash
npm start
```

## 📝 Notas Importantes

### Campos Personalizados

El script intentará mapear automáticamente todos los campos del CSV a los campos personalizados en tu Jira. Si algún campo personalizado no se encuentra, se omitirá y se mostrará una advertencia.

### Asignación de Usuarios

Si quieres asignar la incidencia a un usuario, el campo "Desarrollador asignado" debe contener el **username** o **email** exacto del usuario en Jira.

### Fechas

Los campos de fecha deben estar en formato ISO 8601 (YYYY-MM-DD) para que funcionen correctamente.

### Validación

El script mostrará:
- ✅ Mensajes en verde: Operaciones exitosas
- ⚠️ Mensajes en amarillo: Advertencias (campos no encontrados, etc.)
- ❌ Mensajes en rojo: Errores que impiden continuar

## 🔧 Solución de Problemas

### Error: "No se pudo conectar a Jira"
- Verifica que `jira_server` sea correcto
- Asegúrate de que tu email y API token sean correctos
- Verifica tu conexión a internet

### Error: "Campo personalizado no encontrado"
- El nombre del campo en el CSV debe coincidir exactamente con el nombre en Jira
- Verifica los nombres de los campos personalizados en Jira:
  - Settings → Issues → Custom Fields

### Error: "Proyecto no encontrado"
- Verifica que `project_key` sea correcto (sensible a mayúsculas/minúsculas)
- Asegúrate de tener permisos para crear incidencias en ese proyecto

### Error: "Tipo de incidencia no válido"
- Verifica que `issue_type` coincida exactamente con el nombre en Jira
- Los tipos comunes son: Bug, Tarea, Historia, Incidencia, etc.

## 🔄 Script Alternativo para Campos Faltantes

Si algunos campos no se pudieron establecer durante la creación/actualización normal, puedes usar el script alternativo:

```bash
node actualizar_campos_faltantes.js <ISSUE-KEY>
```

**Ejemplo:**
```bash
node actualizar_campos_faltantes.js QUENOVA-6
```

**Para múltiples incidencias:**
```bash
node actualizar_campos_faltantes.js QUENOVA-5 QUENOVA-6 QUENOVA-7
```

Este script intenta **múltiples métodos alternativos** para actualizar campos que no se pudieron establecer:

1. **Actualización directa API v3**: Intenta actualizar directamente
2. **API v2**: Usa la versión anterior de la API (menos restrictiva)
3. **Con transiciones**: Actualiza campos durante una transición de estado
4. **Búsqueda de opciones**: Busca automáticamente las opciones válidas para campos de selección

## 📞 Soporte

Si tienes problemas, verifica:
1. Que todos los campos en `config_jira.json` estén correctamente llenos
2. Que tengas permisos en el proyecto de Jira
3. Que el archivo `incidencia_jira.csv` esté presente y tenga el formato correcto
4. Para campos problemáticos, intenta usar el script alternativo `actualizar_campos_faltantes.js`
