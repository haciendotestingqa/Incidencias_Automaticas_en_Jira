# 🧹 Guía para Limpiar Secrets del Historial de Git

Si accidentalmente subiste `config_jira.json` con secrets al repositorio, sigue estos pasos:

## ⚠️ IMPORTANTE: Antes de empezar

1. **REVOCA tu API Token inmediatamente** en Jira:
   - Ve a: https://id.atlassian.com/manage-profile/security/api-tokens
   - Revoca el token expuesto
   - Genera uno nuevo

2. **Avisa a tu equipo** si trabajas en colaboración, ya que esto reescribirá el historial

## 🔧 Método Recomendado: git filter-repo

### Paso 1: Instalar git-filter-repo

```bash
# En macOS/Linux
pip3 install git-filter-repo

# O usando Homebrew (macOS)
brew install git-filter-repo
```

### Paso 2: Hacer backup del repositorio

```bash
cd /home/veronica/Desktop/Incidencias_Automaticas_en_Jira
cd ..
cp -r Incidencias_Automaticas_en_Jira Incidencias_Automaticas_en_Jira_backup
cd Incidencias_Automaticas_en_Jira
```

### Paso 3: Remover el archivo del historial

```bash
git filter-repo --path config_jira.json --invert-paths
```

### Paso 4: Verificar que se removió

```bash
# Verificar que el archivo ya no está en el historial
git log --all --full-history -- config_jira.json
# No debería mostrar ningún resultado
```

### Paso 5: Forzar push (SOLO si ya subiste a GitHub)

```bash
# ⚠️ CUIDADO: Esto reescribe el historial en GitHub
git push origin --force --all
git push origin --force --tags
```

## 🔄 Método Alternativo: BFG Repo-Cleaner

### Paso 1: Descargar BFG

```bash
# Descargar desde: https://rtyley.github.io/bfg-repo-cleaner/
# O usando Homebrew (macOS)
brew install bfg
```

### Paso 2: Hacer backup

```bash
cd /home/veronica/Desktop/Incidencias_Automaticas_en_Jira
cd ..
cp -r Incidencias_Automaticas_en_Jira Incidencias_Automaticas_en_Jira_backup
cd Incidencias_Automaticas_en_Jira
```

### Paso 3: Clonar repositorio como mirror

```bash
cd ..
git clone --mirror Incidencias_Automaticas_en_Jira Incidencias_Automaticas_en_Jira.git
```

### Paso 4: Limpiar con BFG

```bash
cd Incidencias_Automaticas_en_Jira.git
bfg --delete-files config_jira.json
```

### Paso 5: Limpiar referencias

```bash
git reflog expire --expire=now --all
git gc --prune=now --aggressive
```

### Paso 6: Forzar push

```bash
git push --force
```

## 📝 Verificación Post-Limpieza

Después de limpiar, verifica:

```bash
# 1. Verificar que el archivo no está en el historial
git log --all --full-history --source -- config_jira.json
# Debe estar vacío

# 2. Buscar el token en el historial
git log -p --all -S "ATATT3xFfGF0" 
# No debe encontrar nada

# 3. Verificar que el archivo local sigue existiendo (pero no en git)
ls -la config_jira.json
# Debe existir localmente
git status
# Debe mostrar "Untracked files: config_jira.json"
```

## ✅ Después de Limpiar

1. ✅ Verifica que `.gitignore` incluye `config_jira.json`
2. ✅ Crea `config_jira.json.example` con valores de ejemplo
3. ✅ Actualiza el README con instrucciones
4. ✅ Regenera tu API Token en Jira
5. ✅ Actualiza `config_jira.json` local con el nuevo token

## 🆘 Si algo sale mal

Si algo sale mal durante la limpieza:

```bash
# Restaurar desde el backup
cd /home/veronica/Desktop/Incidencias_Automaticas_en_Jira
cd ..
rm -rf Incidencias_Automaticas_en_Jira
mv Incidencias_Automaticas_en_Jira_backup Incidencias_Automaticas_en_Jira
cd Incidencias_Automaticas_en_Jira
```

## 📚 Recursos Adicionales

- [Git Filter Repo Documentation](https://github.com/newren/git-filter-repo)
- [BFG Repo-Cleaner](https://rtyley.github.io/bfg-repo-cleaner/)
- [GitHub: Removing sensitive data](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)

