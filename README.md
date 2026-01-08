# Incidencias Automáticas en Jira

Script para registrar incidencias en Jira de manera automática desde un archivo CSV.

## 📋 Requisitos

- Node.js instalado
- Cuenta de Jira con permisos para crear incidencias
- API Token de Jira

## 🚀 Configuración

1. **Clonar el repositorio:**
   ```bash
   git clone <url-del-repositorio>
   cd Incidencias_Automaticas_en_Jira
   ```

2. **Instalar dependencias:**
   ```bash
   npm install
   ```

3. **Configurar Jira:**
   - Copia el archivo de ejemplo: `cp config_jira.json.example config_jira.json`
   - Edita `config_jira.json` con tus credenciales:
     ```json
     {
       "jira_server": "https://tu-instancia.atlassian.net/",
       "email": "tu-email@ejemplo.com",
       "api_token": "TU_API_TOKEN_AQUI",
       "project_key": "PROYECTO",
       "issue_type": "Incidencia"
     }
     ```

4. **Preparar el archivo CSV:**
   - Crea un archivo `input.csv` con las incidencias a registrar
   - El formato debe seguir el ejemplo proporcionado

## 📝 Uso

```bash
node registrar_incidencia_jira.js
```

El script leerá el archivo `input.csv` y creará las incidencias en Jira automáticamente.

## 🔒 Seguridad

**IMPORTANTE:** 
- El archivo `config_jira.json` contiene información sensible y NO debe subirse a GitHub
- El archivo está excluido del repositorio mediante `.gitignore`
- Si accidentalmente subiste secrets al repositorio, debes:
  1. Regenerar tu API Token en Jira
  2. Limpiar el historial de git (ver sección de Limpieza de Historial)

## 🧹 Limpieza de Historial de Git

Si accidentalmente subiste `config_jira.json` con secrets al repositorio, debes limpiar el historial:

### Opción 1: Usando git filter-repo (Recomendado)

```bash
# Instalar git-filter-repo
pip install git-filter-repo

# Remover el archivo del historial
git filter-repo --path config_jira.json --invert-paths

# Forzar push (CUIDADO: esto reescribe el historial)
git push origin --force --all
```

### Opción 2: Usando BFG Repo-Cleaner

```bash
# Descargar BFG
# https://rtyley.github.io/bfg-repo-cleaner/

# Limpiar el archivo
java -jar bfg.jar --delete-files config_jira.json

# Limpiar referencias
git reflog expire --expire=now --all
git gc --prune=now --aggressive
```

### Opción 3: Rebase Interactivo (Para commits recientes)

```bash
# Ver commits
git log --oneline

# Iniciar rebase interactivo
git rebase -i HEAD~N  # N = número de commits a revisar

# En el editor, cambiar 'pick' por 'edit' en el commit que contiene el secret
# Luego remover el archivo y continuar:
git rm --cached config_jira.json
git commit --amend
git rebase --continue
```

## 📁 Estructura del Proyecto

```
.
├── config_jira.json.example    # Ejemplo de configuración (sin secrets)
├── config_jira.json            # Configuración real (NO se sube a git)
├── input.csv                   # Archivo CSV con incidencias
├── registrar_incidencia_jira.js # Script principal
└── README.md                   # Este archivo
```

## ⚠️ Advertencias

- **NUNCA** subas `config_jira.json` al repositorio
- **NUNCA** compartas tu API Token
- Si expusiste un token, **REVÓCALO INMEDIATAMENTE** en Jira y genera uno nuevo

## 📚 Documentación Adicional

- Ver `INSTRUCCIONES_IMPORTACION.md` para más detalles sobre el formato del CSV
- Ver `CONFIGURACION_INSTRUCCIONES.md` para configuración avanzada
