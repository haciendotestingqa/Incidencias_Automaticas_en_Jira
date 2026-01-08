#!/usr/bin/env node
/**
 * Script para asignar desarrollador a una incidencia existente
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
    cyan: '\x1b[36m'
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

async function buscarUsuario(config, nombreUsuario) {
    try {
        const auth = Buffer.from(`${config.email}:${config.api_token}`).toString('base64');
        
        // Buscar usuario por nombre
        const response = await axios.get(
            `${config.jira_server}/rest/api/3/user/search`,
            {
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Accept': 'application/json'
                },
                params: {
                    query: nombreUsuario,
                    maxResults: 10
                }
            }
        );
        
        if (response.data && response.data.length > 0) {
            // Buscar coincidencia exacta o parcial
            const usuario = response.data.find(u => 
                u.displayName === nombreUsuario || 
                u.name === nombreUsuario ||
                u.emailAddress === nombreUsuario ||
                u.displayName.toLowerCase().includes(nombreUsuario.toLowerCase())
            ) || response.data[0];
            
            return usuario;
        }
        
        return null;
    } catch (error) {
        log('yellow', '⚠', `Error al buscar usuario: ${error.message}`);
        return null;
    }
}

async function asignarDesarrollador(config, issueKey, nombreDesarrollador) {
    const auth = Buffer.from(`${config.email}:${config.api_token}`).toString('base64');
    
    try {
        log('cyan', '🔍', `Buscando usuario: ${nombreDesarrollador}...`);
        
        // Buscar el usuario
        const usuario = await buscarUsuario(config, nombreDesarrollador);
        
        if (!usuario) {
            log('red', '❌', `No se encontró el usuario: ${nombreDesarrollador}`);
            log('yellow', '💡', 'Intenta con el email o el username exacto del usuario en Jira');
            return false;
        }
        
        log('green', '✅', `Usuario encontrado: ${usuario.displayName} (${usuario.accountId})`);
        
        // Intentar asignar usando accountId (método moderno de Jira Cloud)
        let assigneeData;
        if (usuario.accountId) {
            assigneeData = { accountId: usuario.accountId };
        } else if (usuario.name) {
            assigneeData = { name: usuario.name };
        } else {
            log('red', '❌', 'No se pudo determinar el identificador del usuario');
            return false;
        }
        
        log('cyan', '🔄', `Asignando desarrollador a ${issueKey}...`);
        
        const response = await axios.put(
            `${config.jira_server}/rest/api/3/issue/${issueKey}`,
            {
                fields: {
                    assignee: assigneeData
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
        
        log('green', '✅', `Desarrollador asignado exitosamente a ${issueKey}`);
        log('blue', '   ', `Usuario: ${usuario.displayName}`);
        log('blue', '   ', `URL: ${config.jira_server}/browse/${issueKey}`);
        
        return true;
        
    } catch (error) {
        log('red', '❌', 'Error al asignar desarrollador');
        if (error.response) {
            log('red', '   ', `Status: ${error.response.status}`);
            log('red', '   ', `Detalles: ${JSON.stringify(error.response.data, null, 2)}`);
        } else {
            log('red', '   ', error.message);
        }
        return false;
    }
}

async function main() {
    const args = process.argv.slice(2);
    
    if (args.length < 2) {
        console.log('Uso: node asignar_desarrollador.js <ISSUE_KEY> <NOMBRE_DESARROLLADOR>');
        console.log('Ejemplo: node asignar_desarrollador.js QUENOVA-9 "Jorge Croquer"');
        process.exit(1);
    }
    
    const issueKey = args[0];
    const nombreDesarrollador = args[1];
    
    console.log('='.repeat(60));
    log('cyan', '👤', 'Asignador de Desarrollador a Incidencia');
    console.log('='.repeat(60));
    console.log();
    
    const config = cargarConfiguracion();
    await asignarDesarrollador(config, issueKey, nombreDesarrollador);
    
    console.log();
    console.log('='.repeat(60));
}

main().catch(error => {
    log('red', '❌', `Error inesperado: ${error.message}`);
    process.exit(1);
});


