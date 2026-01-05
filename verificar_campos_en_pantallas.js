#!/usr/bin/env node
/**
 * Script para verificar qué campos están en las pantallas y cuáles no
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

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
    if (lines.length < 2) return {};
    
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
        return {};
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
        return [];
    }
}

async function obtenerCamposEnPantallaCreacion(config) {
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
        return {};
    }
}

async function main() {
    console.log('='.repeat(80));
    log('cyan', '🔍', 'ANÁLISIS: ¿POR QUÉ ALGUNOS CAMPOS FUNCIONAN Y OTROS NO?');
    console.log('='.repeat(80));
    console.log();
    
    const config = cargarConfiguracion();
    const datos = cargarDatosIncidencia();
    
    log('cyan', '📋', 'Obteniendo información de campos...');
    const camposJira = await obtenerCamposJira(config);
    const camposEnPantalla = await obtenerCamposEnPantallaCreacion(config);
    
    console.log();
    log('magenta', '💡', 'EXPLICACIÓN IMPORTANTE:');
    console.log();
    log('blue', '   ', 'En Jira, hay DOS pasos separados para configurar un campo:');
    log('yellow', '   1.', 'CREAR el campo personalizado (esto ya está hecho)');
    log('yellow', '   2.', 'AGREGAR el campo a una PANTALLA (esto NO todos los campos lo tienen)');
    console.log();
    log('blue', '   ', 'Los campos que están en la pantalla → Funcionan ✅');
    log('blue', '   ', 'Los campos que NO están en la pantalla → NO funcionan ❌');
    console.log();
    
    // Campos a analizar
    const camposParaVerificar = {
        'Recurso': datos['Recurso'],
        'Plataforma': datos['Plataforma'],
        'Categoria': datos['Categoria'],
        'Tipo': datos['Tipo'],
        'Sub-categoria': datos['Sub-categoria'],
        'Responsable': datos['Responsable']
    };
    
    // Crear mapa de campos
    const campoMap = {};
    camposJira.forEach(campo => {
        campoMap[campo.name] = campo;
    });
    
    console.log('='.repeat(80));
    log('cyan', '📊', 'COMPARACIÓN DE CAMPOS');
    console.log('='.repeat(80));
    console.log();
    
    log('green', '✅', 'CAMPOS QUE ESTÁN EN LA PANTALLA (FUNCIONAN):');
    console.log();
    
    Object.keys(camposParaVerificar).forEach(nombreCampo => {
        const campoInfo = campoMap[nombreCampo];
        if (campoInfo) {
            const campoId = campoInfo.id;
            const estaEnPantalla = camposEnPantalla[campoId] !== undefined;
            
            if (estaEnPantalla) {
                log('green', '   ✓', `${nombreCampo} (${campoId})`);
                log('blue', '      ', `Estado: EN LA PANTALLA → El script puede usarlo`);
            }
        }
    });
    
    console.log();
    log('red', '❌', 'CAMPOS QUE NO ESTÁN EN LA PANTALLA (NO FUNCIONAN):');
    console.log();
    
    Object.keys(camposParaVerificar).forEach(nombreCampo => {
        const campoInfo = campoMap[nombreCampo];
        if (campoInfo) {
            const campoId = campoInfo.id;
            const estaEnPantalla = camposEnPantalla[campoId] !== undefined;
            
            if (!estaEnPantalla) {
                log('red', '   ✗', `${nombreCampo} (${campoId})`);
                log('yellow', '      ', `Estado: NO ESTÁ EN LA PANTALLA → El script NO puede usarlo`);
                log('yellow', '      ', `Razón: Fue creado como campo, pero nunca se agregó a la pantalla`);
            }
        }
    });
    
    console.log();
    console.log('='.repeat(80));
    log('magenta', '📝', 'RESUMEN');
    console.log('='.repeat(80));
    console.log();
    
    log('blue', '🔑', 'DIFERENCIA CLAVE:');
    console.log();
    log('blue', '   ', '• Los campos existen en Jira (fueron creados) ✅');
    log('yellow', '   ', '• PERO solo algunos fueron agregados a las pantallas');
    log('yellow', '   ', '• Los que están en pantalla → Funcionan');
    log('yellow', '   ', '• Los que NO están en pantalla → No funcionan');
    console.log();
    log('blue', '💡', 'SOLUCIÓN:');
    log('yellow', '   ', 'Agregar "Plataforma" y "Categoria" a la pantalla (requiere permisos de admin)');
    log('yellow', '   ', 'O usar métodos alternativos (Bulk Edit, edición manual)');
    console.log();
    
    console.log('='.repeat(80));
}

main().catch(error => {
    log('red', '❌', `Error: ${error.message}`);
    process.exit(1);
});

