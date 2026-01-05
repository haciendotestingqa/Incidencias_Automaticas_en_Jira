#!/usr/bin/env node
/**
 * Script alternativo para actualizar campos que no se pueden establecer
 * mediante los métodos normales de creación/edición
 * Intenta diferentes enfoques de la API de Jira
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

// Método 1: Actualización directa con API REST
async function metodoActualizacionDirecta(config, issueKey, campoId, valor, nombreCampo, camposJira) {
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
        return { exito: true, metodo: 'Actualización directa', mensaje: 'Campo actualizado correctamente' };
    } catch (error) {
        const errorMsg = error.response?.data?.errors?.[campoId] || 
                        error.response?.data?.errorMessages?.[0] || 
                        error.message;
        return { exito: false, metodo: 'Actualización directa', mensaje: errorMsg };
    }
}

// Método 2: Usar endpoint de transiciones (a veces permite actualizar campos)
async function metodoConTransicion(config, issueKey, campoId, valor, nombreCampo, camposJira) {
    try {
        const auth = Buffer.from(`${config.email}:${config.api_token}`).toString('base64');
        
        // Primero obtener las transiciones disponibles
        const transicionesResponse = await axios.get(
            `${config.jira_server}/rest/api/3/issue/${issueKey}/transitions`,
            {
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Accept': 'application/json'
                }
            }
        );
        
        const transiciones = transicionesResponse.data.transitions;
        if (transiciones.length === 0) {
            return { exito: false, metodo: 'Con transición', mensaje: 'No hay transiciones disponibles' };
        }
        
        // Intentar con la primera transición disponible (normalmente "To Do" o similar)
        const transicionId = transiciones[0].id;
        
        const response = await axios.post(
            `${config.jira_server}/rest/api/3/issue/${issueKey}/transitions`,
            {
                transition: {
                    id: transicionId
                },
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
        
        // Si funcionó, volver al estado original
        // Por ahora solo actualizamos el campo
        return { exito: true, metodo: 'Con transición', mensaje: 'Campo actualizado usando transición' };
    } catch (error) {
        const errorMsg = error.response?.data?.errors?.[campoId] || 
                        error.response?.data?.errorMessages?.[0] || 
                        error.message;
        return { exito: false, metodo: 'Con transición', mensaje: errorMsg };
    }
}

// Método 3: Usar API v2 (a veces menos restrictiva)
async function metodoAPIv2(config, issueKey, campoId, valor, nombreCampo, camposJira) {
    try {
        const auth = Buffer.from(`${config.email}:${config.api_token}`).toString('base64');
        
        // Obtener la incidencia actual
        const issueResponse = await axios.get(
            `${config.jira_server}/rest/api/2/issue/${issueKey}?expand=fields`,
            {
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Accept': 'application/json'
                }
            }
        );
        
        const currentFields = issueResponse.data.fields;
        currentFields[campoId] = valor;
        
        const response = await axios.put(
            `${config.jira_server}/rest/api/2/issue/${issueKey}`,
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
        
        return { exito: true, metodo: 'API v2', mensaje: 'Campo actualizado usando API v2' };
    } catch (error) {
        const errorMsg = error.response?.data?.errors?.[campoId] || 
                        error.response?.data?.errorMessages?.[0] || 
                        error.message;
        return { exito: false, metodo: 'API v2', mensaje: errorMsg };
    }
}

// Método 4: Buscar opciones disponibles para campos de selección
async function buscarOpcionesDisponibles(config, campoId, camposJira) {
    try {
        const auth = Buffer.from(`${config.email}:${config.api_token}`).toString('base64');
        
        // Obtener opciones del campo usando el endpoint de opciones
        const response = await axios.get(
            `${config.jira_server}/rest/api/3/field/${campoId}/option`,
            {
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Accept': 'application/json'
                }
            }
        );
        
        return response.data.values || response.data || [];
    } catch (error) {
        // Intentar otro endpoint
        try {
            const auth = Buffer.from(`${config.email}:${config.api_token}`).toString('base64');
            const response = await axios.get(
                `${config.jira_server}/rest/api/3/field/${campoId}`,
                {
                    headers: {
                        'Authorization': `Basic ${auth}`,
                        'Accept': 'application/json'
                    }
                }
            );
            return response.data.allowedValues || [];
        } catch (e) {
            return [];
        }
    }
}

// Método 5: Buscar equipos disponibles para campo Team
async function buscarEquiposDisponibles(config, campoId) {
    try {
        const auth = Buffer.from(`${config.email}:${config.api_token}`).toString('base64');
        
        // Obtener equipos usando el endpoint de teams
        const response = await axios.get(
            `${config.jira_server}/rest/api/3/team`,
            {
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Accept': 'application/json'
                }
            }
        );
        
        return response.data.values || response.data || [];
    } catch (error) {
        return [];
    }
}

// Método 6: Formatear valor según tipo de campo
function formatearValorSegunTipo(campoInfo, valor, opciones) {
    const tipoCampo = campoInfo.schema?.type;
    const sistemaTipo = campoInfo.schema?.system;
    
    if (tipoCampo === 'option') {
        // Buscar la opción en las opciones disponibles
        if (opciones && opciones.length > 0) {
            const opcionEncontrada = opciones.find(
                opt => opt.value === valor || opt.name === valor || 
                       opt.value?.toLowerCase() === valor.toLowerCase() ||
                       opt.name?.toLowerCase() === valor.toLowerCase()
            );
            if (opcionEncontrada) {
                return { id: opcionEncontrada.id || opcionEncontrada.value };
            }
        }
        return { value: valor };
    }
    
    if (tipoCampo === 'array' && sistemaTipo !== 'labels') {
        const valores = valor.split(',').map(v => v.trim()).filter(v => v);
        if (opciones && opciones.length > 0) {
            return valores.map(v => {
                const opcion = opciones.find(opt => 
                    opt.value === v || opt.name === v ||
                    opt.value?.toLowerCase() === v.toLowerCase() ||
                    opt.name?.toLowerCase() === v.toLowerCase()
                );
                return opcion ? { id: opcion.id || opcion.value } : { value: v };
            });
        }
        return valores.map(v => ({ value: v }));
    }
    
    if (tipoCampo === 'team') {
        // Para campos de equipo, necesitamos el ID o nombre exacto
        return valor; // Intentar con el valor directo primero
    }
    
    return valor;
}

async function actualizarCamposFaltantes(config, issueKey) {
    const datos = cargarDatosIncidencia();
    const camposJira = await obtenerCamposJira(config);
    
    // Campos que no se pudieron establecer
    const camposFaltantes = {
        'Plataforma': datos['Plataforma'],
        'Categoria': datos['Categoria'],
        'Sprint asociado': datos['Sprint asociado'],
        'Team': datos['Team']
    };
    
    // Crear mapa de campos
    const campoMap = {};
    camposJira.forEach(campo => {
        campoMap[campo.name] = campo;
    });
    
    log('cyan', '🔧', `Intentando actualizar campos faltantes en ${issueKey}...`);
    console.log();
    
    const resultados = {};
    
    for (const [nombreCampo, valor] of Object.entries(camposFaltantes)) {
        if (!valor || valor.trim() === '') {
            continue;
        }
        
        const campoInfo = campoMap[nombreCampo];
        if (!campoInfo) {
            log('yellow', '⚠', `${nombreCampo}: No existe en Jira`);
            continue;
        }
        
        const campoId = campoInfo.id;
        log('cyan', '🔍', `Procesando: ${nombreCampo} (${campoId})`);
        log('blue', '   ', `Valor: "${valor}"`);
        
        // Obtener opciones disponibles si es campo de selección
        let opciones = [];
        if (campoInfo.schema?.type === 'option' || campoInfo.schema?.type === 'array') {
            opciones = await buscarOpcionesDisponibles(config, campoId, camposJira);
            if (opciones.length > 0) {
                log('blue', '   ', `Opciones disponibles: ${opciones.length}`);
            }
        }
        
        // Formatear valor
        const valorFormateado = formatearValorSegunTipo(campoInfo, valor, opciones);
        
        // Intentar diferentes métodos
        const metodos = [
            () => metodoActualizacionDirecta(config, issueKey, campoId, valorFormateado, nombreCampo, camposJira),
            () => metodoAPIv2(config, issueKey, campoId, valorFormateado, nombreCampo, camposJira),
            () => metodoConTransicion(config, issueKey, campoId, valorFormateado, nombreCampo, camposJira)
        ];
        
        let exito = false;
        for (const metodo of metodos) {
            const resultado = await metodo();
            log('blue', '   ', `Método ${resultado.metodo}: ${resultado.exito ? '✓' : '✗'} ${resultado.mensaje}`);
            
            if (resultado.exito) {
                log('green', '   ✅', `${nombreCampo} actualizado correctamente usando ${resultado.metodo}`);
                resultados[nombreCampo] = { exito: true, metodo: resultado.metodo };
                exito = true;
                break;
            }
        }
        
        if (!exito) {
            resultados[nombreCampo] = { exito: false, mensaje: 'Ningún método funcionó' };
            log('red', '   ❌', `${nombreCampo} no pudo ser actualizado con ningún método`);
        }
        
        console.log();
    }
    
    return resultados;
}

async function main() {
    console.log('='.repeat(80));
    log('cyan', '🔄', 'ACTUALIZADOR ALTERNATIVO DE CAMPOS FALTANTES');
    console.log('='.repeat(80));
    console.log();
    
    // Pedir el issue key
    const args = process.argv.slice(2);
    let issueKey = args[0];
    
    if (!issueKey) {
        console.log('Uso: node actualizar_campos_faltantes.js <ISSUE-KEY>');
        console.log('Ejemplo: node actualizar_campos_faltantes.js QUENOVA-6');
        console.log();
        console.log('O puedes especificar múltiples issues separados por espacios:');
        console.log('Ejemplo: node actualizar_campos_faltantes.js QUENOVA-5 QUENOVA-6');
        process.exit(1);
    }
    
    const config = cargarConfiguracion();
    
    // Si hay múltiples issue keys
    const issueKeys = args;
    
    for (const key of issueKeys) {
        console.log('='.repeat(80));
        log('cyan', '📝', `Procesando incidencia: ${key}`);
        console.log('='.repeat(80));
        console.log();
        
        const resultados = await actualizarCamposFaltantes(config, key);
        
        console.log('='.repeat(80));
        log('magenta', '📊', `RESUMEN PARA ${key}:`);
        console.log('='.repeat(80));
        
        Object.keys(resultados).forEach(campo => {
            const resultado = resultados[campo];
            if (resultado.exito) {
                log('green', '   ✅', `${campo}: Actualizado usando ${resultado.metodo}`);
            } else {
                log('red', '   ❌', `${campo}: No se pudo actualizar`);
            }
        });
        
        console.log();
    }
    
    console.log('='.repeat(80));
    log('green', '✅', 'PROCESO COMPLETADO');
    console.log('='.repeat(80));
}

main().catch(error => {
    log('red', '❌', `Error inesperado: ${error.message}`);
    console.error(error);
    process.exit(1);
});

