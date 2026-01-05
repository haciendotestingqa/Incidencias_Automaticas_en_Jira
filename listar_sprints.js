#!/usr/bin/env node
/**
 * Script para listar todos los sprints disponibles en Jira
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    cyan: '\x1b[36m',
    blue: '\x1b[34m',
    yellow: '\x1b[33m'
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
        console.error('Error al cargar configuración:', error.message);
        process.exit(1);
    }
}

async function obtenerBoards(config) {
    try {
        const auth = Buffer.from(`${config.email}:${config.api_token}`).toString('base64');
        
        const response = await axios.get(
            `${config.jira_server}/rest/agile/1.0/board`,
            {
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Accept': 'application/json'
                },
                params: {
                    maxResults: 50,
                    projectKeyOrId: config.project_key
                }
            }
        );
        
        return response.data.values || [];
    } catch (error) {
        return [];
    }
}

async function obtenerSprintsDelBoard(config, boardId) {
    try {
        const auth = Buffer.from(`${config.email}:${config.api_token}`).toString('base64');
        
        const response = await axios.get(
            `${config.jira_server}/rest/agile/1.0/board/${boardId}/sprint`,
            {
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Accept': 'application/json'
                },
                params: {
                    maxResults: 50
                }
            }
        );
        
        return response.data.values || [];
    } catch (error) {
        return [];
    }
}

async function listarSprints(config) {
    try {
        const auth = Buffer.from(`${config.email}:${config.api_token}`).toString('base64');
        
        log('cyan', '🔍', `Buscando sprints para el proyecto ${config.project_key}...`);
        console.log();
        
        // Obtener boards del proyecto
        const boards = await obtenerBoards(config);
        
        if (boards.length === 0) {
            log('yellow', '⚠', 'No se encontraron boards para este proyecto');
            log('blue', '💡', 'Esto puede significar que el proyecto no usa Scrum/Kanban');
            return;
        }
        
        log('blue', '📋', `Se encontraron ${boards.length} board(s):`);
        console.log();
        
        let todosLosSprints = [];
        
        for (const board of boards) {
            console.log(`${board.name} (ID: ${board.id}):`);
            
            const sprints = await obtenerSprintsDelBoard(config, board.id);
            
            if (sprints.length === 0) {
                console.log('   No hay sprints en este board\n');
            } else {
                sprints.forEach((sprint, index) => {
                    const estado = sprint.state === 'active' ? '🟢 Activo' : 
                                  sprint.state === 'closed' ? '🔴 Cerrado' : 
                                  '🟡 Futuro';
                    console.log(`   ${index + 1}. ${sprint.name} (ID: ${sprint.id}) - ${estado}`);
                    if (sprint.startDate) {
                        console.log(`      Inicio: ${sprint.startDate}`);
                    }
                    if (sprint.endDate) {
                        console.log(`      Fin: ${sprint.endDate}`);
                    }
                });
                console.log();
                todosLosSprints = todosLosSprints.concat(sprints);
            }
        }
        
        if (todosLosSprints.length > 0) {
            log('green', '💡', `Usa el ID del sprint en el campo "Sprint asociado" de tu CSV`);
            log('blue', '   ', `Ejemplo: Si quieres usar "${todosLosSprints[0].name}", usa ID: ${todosLosSprints[0].id}`);
        } else {
            log('yellow', '⚠', 'No se encontraron sprints activos');
        }
        
    } catch (error) {
        if (error.response) {
            console.error('Error:', error.response.status, error.response.statusText);
            if (error.response.status === 404) {
                log('yellow', '⚠', 'El proyecto no parece usar Scrum/Kanban (no tiene boards configurados)');
            } else {
                console.error('Detalles:', JSON.stringify(error.response.data, null, 2));
            }
        } else {
            console.error('Error:', error.message);
        }
    }
}

async function main() {
    console.log('='.repeat(60));
    log('cyan', '🏃', 'LISTADO DE SPRINTS EN JIRA');
    console.log('='.repeat(60));
    console.log();
    
    const config = cargarConfiguracion();
    await listarSprints(config);
    
    console.log('='.repeat(60));
}

main();

