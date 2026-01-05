#!/usr/bin/env node
/**
 * Script para analizar en detalle los campos que no se pueden registrar en Jira
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Colores para la consola
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m'
};

function log(color, emoji, message) {
    console.log(`${colors[color]}${emoji} ${message}${colors.reset}`);
}

function cargarConfiguracion() {
    try {
        const configPath = path.join(__dirname, 'config_jira.json');
        const configData = fs.readFileSync(configPath, 'utf-8');
        const config = JSON.parse(configData);
        if (config.jira_server.endsWith('/')) {
            config.jira_server = config.jira_server.slice(0, -1);
        }
        return config;
    } catch (error) {
        log('red', '❌', `Error al cargar configuración: ${error.message}`);
        process.exit(1);
    }
}

function parseCSV(csvContent) {
    const lines = csvContent.split('\n').filter(line => line.trim());
    if (lines.length < 2) {
        throw new Error('El CSV debe tener al menos una fila de encabezados y una fila de datos');
    }
    
    const headers = lines[0].split(',').map(h => h.trim());
    const dataLine = lines[1];
    
    const values = [];
    let currentValue = '';
    let insideQuotes = false;
    
    for (let i = 0; i < dataLine.length; i++) {
        const char = dataLine[i];
        const nextChar = dataLine[i + 1];
        
        if (char === '"') {
            if (insideQuotes && nextChar === '"') {
                currentValue += '"';
                i++;
            } else {
                insideQuotes = !insideQuotes;
            }
        } else if (char === ',' && !insideQuotes) {
            values.push(currentValue.trim());
            currentValue = '';
        } else {
            currentValue += char;
        }
    }
    values.push(currentValue.trim());
    
    const datos = {};
    headers.forEach((header, index) => {
        datos[header] = values[index] || '';
    });
    
    return datos;
}

function cargarDatosIncidencia() {
    try {
        const csvPath = path.join(__dirname, 'incidencia_jira.csv');
        const csvContent = fs.readFileSync(csvPath, 'utf-8');
        return parseCSV(csvContent);
    } catch (error) {
        log('red', '❌', `Error al leer CSV: ${error.message}`);
        process.exit(1);
    }
}

async function obtenerCamposJira(config) {
    try {
        const auth = Buffer.from(`${config.email}:${config.api_token}`).toString('base64');
        const response = await axios.get(
            `${config.jira_server}/rest/api/3/field`,
            {
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Accept': 'application/json'
                }
            }
        );
        return response.data;
    } catch (error) {
        log('red', '❌', `Error al obtener campos: ${error.message}`);
        return [];
    }
}

async function obtenerCamposCreacion(config) {
    try {
        const auth = Buffer.from(`${config.email}:${config.api_token}`).toString('base64');
        const response = await axios.get(
            `${config.jira_server}/rest/api/3/issue/createmeta?projectKeys=${config.project_key}&issuetypeNames=${config.issue_type}&expand=projects.issuetypes.fields`,
            {
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Accept': 'application/json'
                }
            }
        );
        
        const proyectos = response.data.projects;
        if (proyectos && proyectos.length > 0) {
            const proyecto = proyectos[0];
            const tiposIncidencia = proyecto.issuetypes;
            const tipoIncidencia = tiposIncidencia.find(t => t.name === config.issue_type);
            if (tipoIncidencia && tipoIncidencia.fields) {
                return tipoIncidencia.fields;
            }
        }
        return {};
    } catch (error) {
        log('yellow', '⚠', `No se pudieron obtener campos de creación: ${error.message}`);
        return {};
    }
}

async function obtenerCamposEdicion(config, issueKey) {
    try {
        const auth = Buffer.from(`${config.email}:${config.api_token}`).toString('base64');
        const response = await axios.get(
            `${config.jira_server}/rest/api/3/issue/${issueKey}/editmeta`,
            {
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Accept': 'application/json'
                }
            }
        );
        return response.data.fields || {};
    } catch (error) {
        log('yellow', '⚠', `No se pudieron obtener campos de edición: ${error.message}`);
        return {};
    }
}

async function crearIncidenciaPrueba(config, camposBasicos) {
    try {
        const auth = Buffer.from(`${config.email}:${config.api_token}`).toString('base64');
        const response = await axios.post(
            `${config.jira_server}/rest/api/3/issue`,
            {
                fields: camposBasicos
            },
            {
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            }
        );
        return response.data.key;
    } catch (error) {
        log('red', '❌', `Error al crear incidencia de prueba: ${error.message}`);
        return null;
    }
}

async function intentarActualizarCampo(config, issueKey, campoId, valor, nombreCampo, campoMeta) {
    try {
        const auth = Buffer.from(`${config.email}:${config.api_token}`).toString('base64');
        
        const response = await axios.put(
            `${config.jira_server}/rest/api/3/issue/${issueKey}`,
            {
                fields: {
                    [campoId]: valor
                }
            },
            {
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            }
        );
        return { exito: true, mensaje: 'Campo actualizado correctamente' };
    } catch (error) {
        const errorMsg = error.response?.data?.errors?.[campoId] || 
                        error.response?.data?.errorMessages?.[0] || 
                        error.message;
        return { exito: false, mensaje: errorMsg };
    }
}

async function analizarCampo(config, campoInfo, valor, datos, camposCreacion, camposEdicion) {
    const nombreCampo = campoInfo.name;
    const campoId = campoInfo.id;
    const campoMeta = camposCreacion[campoId] || camposEdicion[campoId] || campoInfo;
    
    const resultado = {
        nombre: nombreCampo,
        id: campoId,
        valor: valor,
        tipo: campoMeta?.schema?.type || campoInfo.schema?.type || 'unknown',
        sistemaTipo: campoMeta?.schema?.system || campoInfo.schema?.system || null,
        enCreacion: camposCreacion[campoId] !== undefined,
        enEdicion: camposEdicion[campoId] !== undefined,
        opcionesDisponibles: campoMeta?.allowedValues || null,
        requerido: campoMeta?.required || false,
        metadatos: campoMeta
    };
    
    return resultado;
}

async function main() {
    console.log('='.repeat(80));
    log('cyan', '🔍', 'ANÁLISIS DETALLADO DE CAMPOS DE JIRA');
    console.log('='.repeat(80));
    console.log();
    
    const config = cargarConfiguracion();
    const datos = cargarDatosIncidencia();
    
    log('cyan', '🔌', `Conectando a Jira: ${config.jira_server}...`);
    const camposJira = await obtenerCamposJira(config);
    log('green', '✅', `Conectado. ${camposJira.length} campos encontrados en Jira`);
    
    log('cyan', '📋', 'Obteniendo campos disponibles para creación...');
    const camposCreacion = await obtenerCamposCreacion(config);
    log('green', '✅', `${Object.keys(camposCreacion).length} campos disponibles para creación`);
    
    // Crear una incidencia de prueba para obtener metadatos de edición
    log('cyan', '🧪', 'Creando incidencia de prueba para análisis...');
    const camposBasicos = {
        project: { key: config.project_key },
        summary: 'INC-DE-PRUEBA-PARA-ANALISIS',
        issuetype: { name: config.issue_type || 'Incidencia' },
        description: {
            type: 'doc',
            version: 1,
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Incidencia temporal para análisis' }] }]
        }
    };
    
    const issueKey = await crearIncidenciaPrueba(config, camposBasicos);
    if (!issueKey) {
        log('red', '❌', 'No se pudo crear incidencia de prueba');
        process.exit(1);
    }
    log('green', '✅', `Incidencia de prueba creada: ${issueKey}`);
    
    log('cyan', '📝', 'Obteniendo campos disponibles para edición...');
    const camposEdicion = await obtenerCamposEdicion(config, issueKey);
    log('green', '✅', `${Object.keys(camposEdicion).length} campos disponibles para edición`);
    console.log();
    
    // Campos a analizar
    const camposParaAnalizar = {
        'Inc. Recurrente': datos['Inc. Recurrente'],
        'Responsable': datos['Responsable'],
        'Recurso': datos['Recurso'],
        'Plataforma': datos['Plataforma'],
        'Entorno': datos['Entorno'],
        'Categoria': datos['Categoria'],
        'Sub-categoria': datos['Sub-categoria'],
        'Tipo': datos['Tipo'],
        'Evidencias': datos['Evidencias'],
        'Desarrollador asignado': datos['Desarrollador asignado'],
        'Estado del Desarrollo': datos['Estado del Desarrollo'],
        'Fecha Revision Dev.': datos['Fecha Revision Dev.'],
        'Estado de Validacion QA': datos['Estado de Validacion QA'] || datos['Validacion PM'] || datos['Validacion QA'],
        'Fecha Validacion QA': datos['Fecha Validacion QA'],
        'Build asociada': datos['Build asociada'],
        'Sprint asociado': datos['Sprint asociado'],
        'Observaciones': datos['Observaciones'],
        'Autor': datos['Autor'],
        'Team': datos['Team']
    };
    
    // Crear mapa de campos
    const campoMap = {};
    camposJira.forEach(campo => {
        campoMap[campo.name] = campo;
    });
    
    log('cyan', '📊', 'Analizando cada campo...');
    console.log();
    
    const analisisCampos = [];
    
    for (const [nombreCampo, valor] of Object.entries(camposParaAnalizar)) {
        if (!valor || valor.trim() === '') {
            continue;
        }
        
        const campoInfo = campoMap[nombreCampo];
        if (!campoInfo) {
            analisisCampos.push({
                nombre: nombreCampo,
                estado: 'NO_EXISTE',
                mensaje: 'Este campo no existe en Jira'
            });
            continue;
        }
        
        const analisis = await analizarCampo(config, campoInfo, valor, datos, camposCreacion, camposEdicion);
        analisisCampos.push(analisis);
    }
    
    // Mostrar resultados
    console.log('='.repeat(80));
    log('magenta', '📊', 'RESULTADOS DEL ANÁLISIS');
    console.log('='.repeat(80));
    console.log();
    
    // Agrupar por estado
    const exitosos = analisisCampos.filter(c => c.enCreacion || c.enEdicion);
    const noEnCreacion = analisisCampos.filter(c => !c.enCreacion && campoMap[c.nombre]);
    const noEnEdicion = analisisCampos.filter(c => !c.enCreacion && !c.enEdicion && campoMap[c.nombre]);
    const noExisten = analisisCampos.filter(c => c.estado === 'NO_EXISTE');
    
    log('green', '✅', `CAMPOS QUE FUNCIONAN (${exitosos.length}):`);
    exitosos.forEach(campo => {
        console.log(`  • ${campo.nombre} (${campo.id})`);
        console.log(`    Tipo: ${campo.tipo} | Creación: ${campo.enCreacion ? 'Sí' : 'No'} | Edición: ${campo.enEdicion ? 'Sí' : 'No'}`);
        if (campo.opcionesDisponibles) {
            console.log(`    Opciones: ${campo.opcionesDisponibles.length} disponibles`);
        }
        console.log(`    Valor: "${campo.valor}"`);
        console.log();
    });
    
    if (noEnCreacion.length > 0) {
        log('yellow', '⚠', `CAMPOS QUE NO ESTÁN EN PANTALLA DE CREACIÓN (${noEnCreacion.length}):`);
        noEnCreacion.forEach(campo => {
            console.log(`  • ${campo.nombre} (${campo.id})`);
            console.log(`    Tipo: ${campo.tipo}`);
            console.log(`    Disponible en edición: ${campo.enEdicion ? 'Sí' : 'No'}`);
            console.log(`    Valor: "${campo.valor}"`);
            if (campo.metadatos) {
                console.log(`    Schema: ${JSON.stringify(campo.metadatos.schema, null, 2)}`);
            }
            console.log();
        });
    }
    
    if (noEnEdicion.length > 0) {
        log('red', '❌', `CAMPOS QUE NO ESTÁN EN NINGUNA PANTALLA (${noEnEdicion.length}):`);
        noEnEdicion.forEach(campo => {
            console.log(`  • ${campo.nombre} (${campo.id})`);
            console.log(`    Tipo: ${campo.tipo}`);
            console.log(`    Valor: "${campo.valor}"`);
            console.log(`    ⚠ Este campo existe en Jira pero no está configurado para aparecer en pantallas`);
            console.log();
        });
    }
    
    if (noExisten.length > 0) {
        log('red', '❌', `CAMPOS QUE NO EXISTEN EN JIRA (${noExisten.length}):`);
        noExisten.forEach(campo => {
            console.log(`  • ${campo.nombre}`);
            console.log(`    Valor: "${campo.valor || 'N/A'}"`);
            console.log(`    ⚠ Este campo no existe en tu instancia de Jira`);
            console.log();
        });
    }
    
    // Intentar actualizar campos problemáticos
    if (noEnCreacion.length > 0 || noEnEdicion.length > 0) {
        console.log('='.repeat(80));
        log('cyan', '🧪', 'PROBANDO ACTUALIZACIÓN DE CAMPOS PROBLEMÁTICOS...');
        console.log('='.repeat(80));
        console.log();
        
        const camposParaProbar = [...noEnCreacion, ...noEnEdicion];
        for (const campo of camposParaProbar) {
            if (campo.estado === 'NO_EXISTE') continue;
            
            const campoInfo = campoMap[campo.nombre];
            const valor = campo.valor;
            
            log('cyan', '🧪', `Probando actualizar: ${campo.nombre}`);
            const resultado = await intentarActualizarCampo(config, issueKey, campo.id, valor, campo.nombre, campo.metadatos);
            
            if (resultado.exito) {
                log('green', '   ✓', 'Se puede actualizar correctamente');
            } else {
                log('red', '   ✗', `Error: ${resultado.mensaje}`);
            }
            console.log();
        }
    }
    
    // Limpiar incidencia de prueba
    console.log('='.repeat(80));
    log('cyan', '🧹', `Eliminando incidencia de prueba ${issueKey}...`);
    try {
        const auth = Buffer.from(`${config.email}:${config.api_token}`).toString('base64');
        await axios.delete(
            `${config.jira_server}/rest/api/3/issue/${issueKey}`,
            {
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Accept': 'application/json'
                }
            }
        );
        log('green', '✅', 'Incidencia de prueba eliminada');
    } catch (error) {
        log('yellow', '⚠', `No se pudo eliminar la incidencia de prueba. Puedes eliminarla manualmente: ${issueKey}`);
    }
    
    console.log();
    console.log('='.repeat(80));
    log('green', '✅', 'ANÁLISIS COMPLETADO');
    console.log('='.repeat(80));
}

main().catch(error => {
    log('red', '❌', `Error inesperado: ${error.message}`);
    console.error(error);
    process.exit(1);
});

