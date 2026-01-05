#!/usr/bin/env node
/**
 * Script para listar todos los equipos disponibles en Jira
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    cyan: '\x1b[36m',
    blue: '\x1b[34m'
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

async function listarEquipos(config) {
    try {
        const auth = Buffer.from(`${config.email}:${config.api_token}`).toString('base64');
        
        log('cyan', '🔍', 'Buscando equipos en Jira...');
        console.log();
        
        const response = await axios.get(
            `${config.jira_server}/rest/api/3/team`,
            {
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Accept': 'application/json'
                },
                params: {
                    maxResults: 100
                }
            }
        );
        
        const equipos = response.data.values || response.data || [];
        
        if (equipos.length === 0) {
            log('blue', '⚠', 'No se encontraron equipos');
            return;
        }
        
        log('green', '✅', `Se encontraron ${equipos.length} equipo(s):`);
        console.log();
        
        equipos.forEach((equipo, index) => {
            log('blue', '   ', `${index + 1}. ${equipo.name}`);
            console.log(`      ID: ${equipo.id || equipo.teamId || 'N/A'}`);
            if (equipo.description) {
                console.log(`      Descripción: ${equipo.description}`);
            }
            console.log();
        });
        
        log('green', '💡', 'Usa el ID o el nombre exacto en el campo "Team" de tu CSV');
        
    } catch (error) {
        if (error.response) {
            console.error('Error:', error.response.status, error.response.statusText);
            console.error('Detalles:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error('Error:', error.message);
        }
    }
}

async function main() {
    console.log('='.repeat(60));
    log('cyan', '👥', 'LISTADO DE EQUIPOS EN JIRA');
    console.log('='.repeat(60));
    console.log();
    
    const config = cargarConfiguracion();
    await listarEquipos(config);
    
    console.log('='.repeat(60));
}

main();

