# Soluciones para Campos Faltantes

Este documento describe todas las opciones disponibles para registrar los campos que no se pudieron establecer automáticamente.

## 📋 Resumen de Campos Problemáticos

1. **Plataforma** (customfield_10124) - No está en pantalla de edición
2. **Categoria** (customfield_10128) - No está en pantalla de edición  
3. **Sprint asociado** (customfield_10277) - Formato incorrecto
4. **Team** (customfield_10001) - Valor no corresponde a equipo válido

---

## 🔧 Opciones Disponibles

### Opción 1: Configurar Campos en Pantallas de Jira (Recomendado)

**Requisitos:** Permisos de Administrador en Jira

**Pasos:**
1. Ve a **Settings (Configuración)** → **Issues** → **Screens**
2. Encuentra la pantalla de "Incidencia" (Default Screen o la que uses)
3. Haz clic en **Configure**
4. Agrega los campos faltantes:
   - Plataforma (customfield_10124)
   - Categoria (customfield_10128)
5. Guarda los cambios

**Ventajas:**
- ✅ Permite que los campos se establezcan automáticamente
- ✅ Los campos estarán disponibles para todas las incidencias futuras

**Desventajas:**
- ⚠️ Requiere permisos de administrador
- ⚠️ Puede requerir aprobación del administrador del sistema

---

### Opción 2: Usar Jira Automation (Si está disponible)

**Requisitos:** Acceso a Jira Automation (Atlassian Automation)

**Pasos:**
1. Ve a **Project Settings** → **Automation**
2. Crea una nueva regla:
   - Trigger: "Issue created" o "Issue updated"
   - Condition: "Issue type is Incidencia"
   - Action: "Edit issue fields"
3. Establece los campos faltantes basándote en otros campos

**Ventajas:**
- ✅ Se ejecuta automáticamente
- ✅ No requiere modificar pantallas

**Ejemplo de regla:**
```
When: Issue created
If: Issue type = Incidencia
Then: Edit issue → Set field "Plataforma" = "WEB"
```

---

### Opción 3: Usar ScriptRunner (Si está instalado)

**Requisitos:** ScriptRunner instalado en Jira

Puedes crear un script Groovy que actualice los campos:

```groovy
import com.atlassian.jira.component.ComponentAccessor
import com.atlassian.jira.issue.MutableIssue
import com.atlassian.jira.issue.fields.CustomField

def customFieldManager = ComponentAccessor.getCustomFieldManager()
def issueManager = ComponentAccessor.getIssueManager()

// Obtener la incidencia
MutableIssue issue = issueManager.getIssueObject("QUENOVA-6")

// Obtener campos
CustomField plataformaField = customFieldManager.getCustomFieldObject("customfield_10124")
CustomField categoriaField = customFieldManager.getCustomFieldObject("customfield_10128")

// Establecer valores (bypassa restricciones de pantalla)
issue.setCustomFieldValue(plataformaField, "WEB")
issue.setCustomFieldValue(categoriaField, "PI - Home")

issueManager.updateIssue(user, issue, EventDispatchOption.ISSUE_UPDATED, false)
```

**Ventajas:**
- ✅ Puede bypasear restricciones de pantalla
- ✅ Muy flexible

**Desventajas:**
- ⚠️ Requiere ScriptRunner (plugin de pago)
- ⚠️ Requiere conocimiento de Groovy

---

### Opción 4: Usar Bulk Edit (Jira nativo)

**Pasos:**
1. Ve al proyecto en Jira
2. Usa **Bulk Change** (Cambio masivo)
3. Selecciona las incidencias que quieres actualizar
4. Selecciona **Edit Issues**
5. Actualiza los campos faltantes

**Ventajas:**
- ✅ No requiere permisos especiales
- ✅ Puede actualizar múltiples incidencias a la vez

**Desventajas:**
- ⚠️ Debe hacerse manualmente
- ⚠️ Solo funciona si los campos están en la pantalla de edición masiva

---

### Opción 5: Corregir Valores en el CSV

Para algunos campos, el problema es el formato del valor:

#### Sprint asociado
**Problema:** El valor "enero2026" no es un ID válido de sprint

**Solución:** 
1. Ve a tu proyecto en Jira
2. Obtén el ID real del sprint (ej: "24", "25", etc.)
3. Actualiza el CSV con el ID correcto, o elimina el campo si no es necesario

**Para obtener el ID del sprint:**
```bash
# Usando la API
curl -u email:api_token \
  "https://tu-jira.atlassian.net/rest/agile/1.0/board/{boardId}/sprint"
```

#### Team
**Problema:** "Cohete Digital - Proy. Quenova" no es un equipo válido

**Solución:**
1. Ve a **Settings** → **Organization** → **Teams**
2. Encuentra el nombre exacto del equipo (o su ID)
3. Actualiza el CSV con el nombre/ID correcto

**Para obtener equipos:**
```bash
# Usando la API
curl -u email:api_token \
  "https://tu-jira.atlassian.net/rest/api/3/team"
```

---

### Opción 6: Usar Jira REST API con Postman/cURL

Si tienes permisos avanzados, puedes intentar actualizar directamente usando cURL:

```bash
curl --request PUT \
  --url 'https://tu-jira.atlassian.net/rest/api/3/issue/QUENOVA-6' \
  --user 'email:api_token' \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --data '{
    "fields": {
      "customfield_10124": {"value": "WEB"},
      "customfield_10128": {"value": "PI - Home"}
    }
  }'
```

**Nota:** Esto probablemente fallará por las mismas razones que el script, pero puedes intentarlo.

---

### Opción 7: Crear Script de Post-procesamiento

Puedes crear un script que se ejecute después de crear la incidencia y que use diferentes métodos:

1. **Usar transiciones de workflow:** A veces se pueden establecer campos durante transiciones
2. **Usar webhooks:** Crear un webhook que actualice campos cuando se crea una incidencia
3. **Usar listeners personalizados:** Si tienes acceso a desarrollo personalizado

---

## 🎯 Recomendación

**Para solución inmediata:**
1. Usa **Bulk Edit** (Opción 4) para actualizar manualmente las incidencias existentes
2. Para el campo **Team**, verifica y corrige el nombre del equipo en el CSV

**Para solución permanente:**
1. Contacta al administrador de Jira para que agregue **Plataforma** y **Categoria** a las pantallas (Opción 1)
2. Corrige los valores de **Sprint asociado** y **Team** en el CSV con los valores reales de Jira

---

## 🔍 Scripts de Ayuda

### Script para Listar Equipos Disponibles
```bash
node -e "
const axios = require('axios');
const fs = require('fs');
const config = JSON.parse(fs.readFileSync('config_jira.json'));
const auth = Buffer.from(\`\${config.email}:\${config.api_token}\`).toString('base64');

axios.get(\`\${config.jira_server}/rest/api/3/team\`, {
  headers: { 'Authorization': \`Basic \${auth}\`, 'Accept': 'application/json' }
}).then(r => {
  console.log('Equipos disponibles:');
  r.data.values?.forEach(t => console.log(\`- ID: \${t.id}, Nombre: \${t.name}\`));
}).catch(e => console.error('Error:', e.message));
"
```

### Script para Listar Sprints Disponibles
```bash
node -e "
const axios = require('axios');
const fs = require('fs');
const config = JSON.parse(fs.readFileSync('config_jira.json'));
const auth = Buffer.from(\`\${config.email}:\${config.api_token}\`).toString('base64');

axios.get(\`\${config.jira_server}/rest/agile/1.0/board\`, {
  headers: { 'Authorization': \`Basic \${auth}\`, 'Accept': 'application/json' }
}).then(r => {
  console.log('Boards disponibles:');
  r.data.values?.forEach(b => console.log(\`- ID: \${b.id}, Nombre: \${b.name}\`));
  // Luego obtener sprints del board
}).catch(e => console.error('Error:', e.message));
"
```

---

## 📞 Contacto

Si ninguna de estas opciones funciona, necesitarás:
1. Contactar al administrador de Jira para configurar los campos en las pantallas
2. Verificar que los valores en el CSV sean correctos para Jira
3. Considerar si realmente necesitas todos estos campos o si algunos pueden omitirse

