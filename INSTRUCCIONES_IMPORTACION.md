# Instrucciones para Importar la Incidencia en Jira

## Archivo CSV Creado

He creado el archivo `incidencia_jira.csv` con la incidencia extraída del PDF, usando exactamente los mismos nombres de campos que tienes configurados en tu cuenta de Jira.

## Campos Incluidos

El CSV contiene todos los campos de la tabla con los nombres exactos:
- Titulo
- Inc. Recurrente
- Responsable
- Recurso
- Plataforma
- Entorno
- Categoria
- Sub-categoria
- Tipo
- Descripción de la Novedad
- Prioridad
- Evidencias
- Desarrollador asignado
- Estado del Desarrollo
- Fecha Revision Dev.
- Validacion PM
- Validacion QA
- Fecha Validacion QA
- Build asociada
- Sprint asociado
- Observaciones
- Autor

## Cómo Importar en Jira

### Opción 1: Importación CSV (Recomendado)

1. **Accede a Jira** con permisos de administrador
2. Ve a **Configuración (Settings)** → **Sistema (System)** → **Importar y exportar (Import & Export)**
3. Selecciona **Importar desde CSV**
4. Sube el archivo `incidencia_jira.csv`
5. Jira te pedirá mapear las columnas del CSV con los campos de Jira
6. Como los nombres coinciden, deberías poder hacer coincidir automáticamente los campos
7. Completa la importación

### Opción 2: Crear Manualmente (Si la importación CSV no funciona)

Si tu instancia de Jira no tiene la función de importación CSV habilitada, puedes crear la incidencia manualmente usando los datos del CSV como referencia.

### Opción 3: Script de Automatización (Recomendado para automatización)

✅ **Ya está disponible un script de automatización completo**

He creado `registrar_incidencia_jira.py` que registra automáticamente la incidencia en Jira usando la API.

**Para usarlo:**
1. Configura tus credenciales en `config_jira.json` (ver `CONFIGURACION_INSTRUCCIONES.md`)
2. Instala las dependencias: `pip install -r requirements.txt`
3. Ejecuta: `python registrar_incidencia_jira.py`

Ver el archivo `CONFIGURACION_INSTRUCCIONES.md` para instrucciones detalladas.

## Notas Importantes

- El archivo CSV está codificado en UTF-8 para soportar caracteres especiales y acentos
- Los campos vacíos se dejan como celdas vacías
- Los valores con comillas están correctamente escapados
- Todos los textos están en español con los nombres de campos exactos que tienes configurados en Jira
- El campo "Entorno" contiene "Desarrollo / Produccion"
- Los campos vacíos se dejan como celdas vacías

## Si Necesitas Modificaciones

Si necesitas:
- Cambiar el formato del CSV
- Agregar más incidencias
- Modificar algún valor
- Crear un script de automatización

Solo dímelo y te ayudo.
