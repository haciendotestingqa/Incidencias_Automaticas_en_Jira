#!/usr/bin/env node
/**
 * Script para registrar automáticamente incidencias en Jira
 * Usa el archivo config_jira.json para configuración y incidencia_jira.csv para los datos
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
        
        // Limpiar la URL del servidor (eliminar barra final si existe)
        if (config.jira_server.endsWith('/')) {
            config.jira_server = config.jira_server.slice(0, -1);
        }
        
        return config;
    } catch (error) {
        if (error.code === 'ENOENT') {
            log('red', '❌', 'Error: No se encontró el archivo config_jira.json');
            log('yellow', '   ', 'Por favor, crea el archivo con tu configuración de Jira');
        } else {
            log('red', '❌', `Error: El archivo config_jira.json tiene un formato incorrecto: ${error.message}`);
        }
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
    
    // Parsear la línea de datos teniendo en cuenta comillas
    const values = [];
    let currentValue = '';
    let insideQuotes = false;
    
    for (let i = 0; i < dataLine.length; i++) {
        const char = dataLine[i];
        const nextChar = dataLine[i + 1];
        
        if (char === '"') {
            if (insideQuotes && nextChar === '"') {
                // Doble comilla escapada
                currentValue += '"';
                i++; // Saltar la siguiente comilla
            } else {
                // Toggle de comillas
                insideQuotes = !insideQuotes;
            }
        } else if (char === ',' && !insideQuotes) {
            values.push(currentValue.trim());
            currentValue = '';
        } else {
            currentValue += char;
        }
    }
    values.push(currentValue.trim()); // Agregar el último valor
    
    // Crear objeto con los datos
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
        if (error.code === 'ENOENT') {
            log('red', '❌', 'Error: No se encontró el archivo incidencia_jira.csv');
        } else {
            log('red', '❌', `Error al leer el archivo CSV: ${error.message}`);
        }
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
        log('yellow', '⚠', 'No se pudieron obtener los campos personalizados, se usarán nombres directos');
        return [];
    }
}

async function obtenerCamposDisponibles(config) {
    try {
        const auth = Buffer.from(`${config.email}:${config.api_token}`).toString('base64');
        
        // Obtener los metadatos de creación para el proyecto y tipo de incidencia
        const response = await axios.get(
            `${config.jira_server}/rest/api/3/issue/createmeta?projectKeys=${config.project_key}&issuetypeNames=${config.issue_type}&expand=projects.issuetypes.fields`,
            {
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Accept': 'application/json'
                }
            }
        );
        
        // Extraer los campos disponibles para este tipo de incidencia
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
        log('yellow', '⚠', 'No se pudieron obtener los campos disponibles, se intentará con todos los campos');
        return {};
    }
}

function formatearValorCampo(campoMeta, valor) {
    if (!valor || valor.trim() === '') {
        return null;
    }
    
    // Si no tenemos metadatos completos, intentar con el valor directamente
    if (!campoMeta || !campoMeta.schema) {
        return valor;
    }
    
    const tipoCampo = campoMeta.schema?.type;
    const sistemaTipo = campoMeta.schema?.system;
    
    // Campos de tipo selección simple
    if (tipoCampo === 'option' || tipoCampo === 'priority') {
        // Buscar el valor en las opciones disponibles
        if (campoMeta.allowedValues && campoMeta.allowedValues.length > 0) {
            const opcionEncontrada = campoMeta.allowedValues.find(
                opcion => opcion.value === valor || opcion.name === valor || opcion.id === valor
            );
            if (opcionEncontrada) {
                return { id: opcionEncontrada.id || opcionEncontrada.value };
            }
        }
        // Si no se encuentra, intentar usar el valor directamente
        return { name: valor };
    }
    
    // Campos de tipo selección múltiple (array)
    if (tipoCampo === 'array' && sistemaTipo !== 'labels') {
        // Dividir por comas y buscar cada valor
        const valores = valor.split(',').map(v => v.trim()).filter(v => v);
        if (campoMeta.allowedValues && campoMeta.allowedValues.length > 0) {
            return valores.map(v => {
                const opcionEncontrada = campoMeta.allowedValues.find(
                    opcion => opcion.value === v || opcion.name === v || opcion.id === v
                );
                return opcionEncontrada ? { id: opcionEncontrada.id || opcionEncontrada.value } : { name: v };
            });
        }
        return valores.map(v => ({ name: v }));
    }
    
    // Campos de tipo usuario
    if (tipoCampo === 'user') {
        return { name: valor };
    }
    
    // Campos de tipo fecha
    if (tipoCampo === 'date') {
        return valor; // Formato YYYY-MM-DD
    }
    
    // Campos de tipo URL
    if (tipoCampo === 'url') {
        return valor;
    }
    
    // Campos de tipo texto/longtext
    if (tipoCampo === 'string' || tipoCampo === 'text') {
        return valor;
    }
    
    // Por defecto, devolver el valor como está
    return valor;
}

function mapearCamposPersonalizados(camposJira, datos, camposDisponibles, soloCreacion = false) {
    const camposMapeados = {};
    const nombresCampos = {
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
        'Validacion PM': datos['Validacion PM'],
        'Validacion QA': datos['Validacion QA'],
        'Fecha Validacion QA': datos['Fecha Validacion QA'],
        'Build asociada': datos['Build asociada'],
        'Sprint asociado': datos['Sprint asociado'],
        'Observaciones': datos['Observaciones'],
        'Autor': datos['Autor'],
        'Team': datos['Team'] || datos['Team '] // Manejar posible espacio en el nombre
    };
    
    // Crear un mapa de nombres de campos a IDs y metadatos
    const campoMap = {};
    camposJira.forEach(campo => {
        campoMap[campo.name] = { id: campo.id, meta: campo };
    });
    
    if (soloCreacion) {
        log('cyan', '📋', 'Buscando campos personalizados para CREACIÓN...');
    } else {
        log('cyan', '📋', 'Buscando campos personalizados para ACTUALIZACIÓN...');
    }
    
    Object.keys(nombresCampos).forEach(nombreCampo => {
        const valor = nombresCampos[nombreCampo];
        if (valor && valor.trim() !== '') {
            const campoInfo = campoMap[nombreCampo];
            if (campoInfo) {
                const campoId = campoInfo.id;
                
                if (soloCreacion) {
                    // Para creación: solo campos disponibles en la pantalla de creación
                    const estaDisponible = !camposDisponibles || camposDisponibles[campoId] !== undefined;
                    if (estaDisponible) {
                        const campoMeta = camposDisponibles[campoId];
                        const valorFormateado = formatearValorCampo(campoMeta, valor);
                        if (valorFormateado !== null) {
                            camposMapeados[campoId] = valorFormateado;
                            log('green', '   ✓', `Campo '${nombreCampo}' encontrado y disponible para creación`);
                        }
                    } else {
                        log('yellow', '   ⚠', `Campo '${nombreCampo}' existe pero no está en pantalla de creación (se usará en actualización)`);
                    }
                } else {
                    // Para actualización: todos los campos que existen, intentar obtener metadatos
                    // Si no está en camposDisponibles, intentar con formato básico
                    const campoMeta = camposDisponibles[campoId] || campoInfo.meta;
                    const valorFormateado = formatearValorCampo(campoMeta, valor);
                    if (valorFormateado !== null) {
                        camposMapeados[campoId] = valorFormateado;
                        const estaDisponible = camposDisponibles && camposDisponibles[campoId] !== undefined;
                        if (estaDisponible) {
                            log('green', '   ✓', `Campo '${nombreCampo}' disponible para actualización`);
                        } else {
                            log('blue', '   →', `Campo '${nombreCampo}' se intentará en actualización (no estaba en pantalla de creación)`);
                        }
                    }
                }
            } else {
                log('yellow', '   ⚠', `Campo '${nombreCampo}' no encontrado en Jira (se omitirá)`);
            }
        }
    });
    
    return camposMapeados;
}

async function crearIncidencia(config, datos, camposPersonalizados, camposDisponibles, camposJira) {
    const auth = Buffer.from(`${config.email}:${config.api_token}`).toString('base64');
    
    // Mapear prioridad
    const prioridadMap = {
        'Alta': 'Highest',
        'Media': 'Medium',
        'Baja': 'Low'
    };
    const prioridad = prioridadMap[datos['Prioridad']] || 'Medium';
    
    // Construir el objeto de campos para la incidencia
    let fields = {
        project: {
            key: config.project_key
        },
        summary: datos['Titulo'],
        description: {
            type: 'doc',
            version: 1,
            content: [
                {
                    type: 'paragraph',
                    content: [
                        {
                            type: 'text',
                            text: datos['Descripción'] || datos['Descripción de la Novedad'] || ''
                        }
                    ]
                }
            ]
        },
        issuetype: {
            name: config.issue_type || 'Incidencia'
        },
        priority: {
            name: prioridad
        },
        ...camposPersonalizados
    };
    
    // Intentar asignar desarrollador si existe
    if (datos['Desarrollador asignado'] && datos['Desarrollador asignado'].trim() !== '') {
        try {
            // Buscar el usuario (puede necesitar ajuste según tu Jira)
            fields.assignee = {
                name: datos['Desarrollador asignado']
            };
        } catch (error) {
            log('yellow', '⚠', `No se pudo asignar el desarrollador: ${datos['Desarrollador asignado']}`);
        }
    }
    
    // Función para intentar crear la incidencia
    const intentarCrear = (camposParaUsar) => {
        return axios.post(
            `${config.jira_server}/rest/api/3/issue`,
            { fields: camposParaUsar },
            {
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            }
        );
    };
    
    try {
        log('cyan', '📝', `Creando incidencia en el proyecto ${config.project_key}...`);
        
        let response;
        try {
            response = await intentarCrear(fields);
        } catch (error) {
            // Si hay errores de campos, intentar eliminar los problemáticos
            if (error.response && error.response.status === 400) {
                const errorData = error.response.data;
                const camposProblematicos = errorData.errors ? Object.keys(errorData.errors) : [];
                const mensajesError = errorData.errorMessages || [];
                
                // Si hay mensajes de error sobre campos específicos, buscar los campos problemáticos
                mensajesError.forEach(mensaje => {
                    // Buscar referencias a campos en los mensajes de error
                    const mensajeLower = mensaje.toLowerCase();
                    if (mensajeLower.includes('equipo') || mensajeLower.includes('team')) {
                        // Buscar el campo Team
                        Object.keys(fields).forEach(campoId => {
                            const campoInfo = camposJira.find(c => c.id === campoId);
                            if (campoInfo && (campoInfo.name === 'Team' || campoInfo.name.toLowerCase().includes('team'))) {
                                if (!camposProblematicos.includes(campoId)) {
                                    camposProblematicos.push(campoId);
                                }
                            }
                        });
                    }
                    // También buscar por prioridad si hay problemas
                    if (mensajeLower.includes('prioridad') || mensajeLower.includes('priority')) {
                        if (fields.priority && !camposProblematicos.includes('priority')) {
                            camposProblematicos.push('priority');
                        }
                    }
                });
                
                // Eliminar campos problemáticos conocidos ANTES del primer intento
                const camposConocidosProblematicos = ['Team', 'Sprint asociado'];
                camposConocidosProblematicos.forEach(nombreCampo => {
                    const campoInfo = camposJira.find(c => c.name === nombreCampo);
                    if (campoInfo && fields[campoInfo.id] !== undefined) {
                        // Verificar si este campo podría tener problemas
                        const valor = fields[campoInfo.id];
                        if (nombreCampo === 'Team' && typeof valor === 'string' && !valor.match(/^\d+$/)) {
                            // Team probablemente necesita un ID numérico
                            if (!camposProblematicos.includes(campoInfo.id)) {
                                camposProblematicos.push(campoInfo.id);
                            }
                        }
                    }
                });
                
                // Buscar campos problemáticos por nombre conocido
                const camposProblematicosPorNombre = ['Sprint asociado', 'Team'];
                camposProblematicosPorNombre.forEach(nombreCampo => {
                    const campoInfo = camposJira.find(c => c.name === nombreCampo);
                    if (campoInfo && fields[campoInfo.id] !== undefined && !camposProblematicos.includes(campoInfo.id)) {
                        // Verificar si este campo podría estar causando problemas
                        const campoId = campoInfo.id;
                        // Si hay errores relacionados con este campo
                        if (errorData.errors && errorData.errors[campoId]) {
                            camposProblematicos.push(campoId);
                        }
                    }
                });
                
                if (camposProblematicos.length > 0 || mensajesError.length > 0) {
                    log('yellow', '⚠', `Algunos campos tienen problemas, intentando sin ellos...`);
                    
                    // Crear una copia de fields sin los campos problemáticos
                    const camposSinProblemas = { ...fields };
                    camposProblematicos.forEach(campoId => {
                        delete camposSinProblemas[campoId];
                        // Encontrar el nombre del campo
                        const campoInfo = camposJira.find(c => c.id === campoId);
                        const nombreCampo = campoInfo ? campoInfo.name : campoId;
                        log('yellow', '   ', `- Omitiendo campo: ${nombreCampo}`);
                    });
                    
                    // Si hay mensajes de error sobre Team pero no está en camposProblematicos, buscarlo
                    if (mensajesError.some(m => m.toLowerCase().includes('equipo') || m.toLowerCase().includes('team'))) {
                        Object.keys(camposSinProblemas).forEach(campoId => {
                            const campoInfo = camposJira.find(c => c.id === campoId);
                            if (campoInfo && campoInfo.name === 'Team') {
                                delete camposSinProblemas[campoId];
                                log('yellow', '   ', `- Omitiendo campo: Team (el valor no corresponde a un equipo válido)`);
                            }
                        });
                    }
                    
                    // Intentar crear nuevamente
                    try {
                        response = await intentarCrear(camposSinProblemas);
                    } catch (error2) {
                        // Si todavía falla, intentar eliminar más campos problemáticos
                        if (error2.response && error2.response.status === 400) {
                            const errorData2 = error2.response.data;
                            const camposProblematicos2 = errorData2.errors ? Object.keys(errorData2.errors) : [];
                            
                            camposProblematicos2.forEach(campoId => {
                                delete camposSinProblemas[campoId];
                                const campoInfo = camposJira.find(c => c.id === campoId);
                                const nombreCampo = campoInfo ? campoInfo.name : campoId;
                                log('yellow', '   ', `- Omitiendo campo adicional: ${nombreCampo}`);
                            });
                            
                            response = await intentarCrear(camposSinProblemas);
                        } else {
                            throw error2;
                        }
                    }
                } else {
                    throw error;
                }
            } else {
                throw error;
            }
        }
        
        const issueKey = response.data.key;
        const issueUrl = `${config.jira_server}/browse/${issueKey}`;
        
        log('green', '✅', '¡Incidencia creada exitosamente!');
        log('blue', '   ', `URL: ${issueUrl}`);
        log('blue', '   ', `Clave: ${issueKey}`);
        log('blue', '   ', `Resumen: ${datos['Titulo']}`);
        
        return { key: issueKey, url: issueUrl };
    } catch (error) {
        log('red', '❌', 'Error al crear la incidencia');
        if (error.response) {
            log('red', '   ', `Status: ${error.response.status}`);
            const errorData = error.response.data;
            if (errorData.errors) {
                log('red', '   ', 'Campos con problemas:');
                Object.keys(errorData.errors).forEach(campoId => {
                    const campoInfo = camposJira.find(c => c.id === campoId);
                    const nombreCampo = campoInfo ? campoInfo.name : campoId;
                    log('red', '      ', `- ${nombreCampo}: ${errorData.errors[campoId]}`);
                });
                log('yellow', '💡', 'Estos campos no pudieron ser establecidos. Puedes editarlos manualmente en Jira después de crear la incidencia.');
            }
            log('red', '   ', `Detalles completos: ${JSON.stringify(errorData, null, 2)}`);
        } else {
            log('red', '   ', error.message);
        }
        process.exit(1);
    }
}

async function obtenerMetadatosEdicion(config, issueKey) {
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
        log('yellow', '⚠', 'No se pudieron obtener metadatos de edición, se intentará con valores directos');
        return {};
    }
}

async function actualizarIncidencia(config, issueKey, camposAdicionales, camposJira, datos) {
    if (Object.keys(camposAdicionales).length === 0) {
        return;
    }
    
    const auth = Buffer.from(`${config.email}:${config.api_token}`).toString('base64');
    
    try {
        log('cyan', '🔄', `Actualizando incidencia ${issueKey} con campos adicionales...`);
        
        // Obtener metadatos de edición para formatear mejor los campos
        const metadatosEdicion = await obtenerMetadatosEdicion(config, issueKey);
        
        // Re-formatear campos con metadatos de edición si están disponibles
        const camposFormateados = {};
        Object.keys(camposAdicionales).forEach(campoId => {
            const campoMeta = metadatosEdicion[campoId];
            const valorOriginal = camposAdicionales[campoId];
            
            // Obtener el valor original del CSV para re-formatearlo
            const campoInfo = camposJira.find(c => c.id === campoId);
            if (campoInfo && campoInfo.name && datos) {
                // Buscar el valor en los datos
                const valorDelCSV = datos[campoInfo.name];
                if (valorDelCSV && campoMeta) {
                    const valorFormateado = formatearValorCampo(campoMeta, valorDelCSV);
                    camposFormateados[campoId] = valorFormateado !== null ? valorFormateado : valorOriginal;
                } else {
                    camposFormateados[campoId] = valorOriginal;
                }
            } else {
                camposFormateados[campoId] = valorOriginal;
            }
        });
        
        const response = await axios.put(
            `${config.jira_server}/rest/api/3/issue/${issueKey}`,
            {
                fields: camposFormateados
            },
            {
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            }
        );
        
        log('green', '✅', `Incidencia actualizada exitosamente con ${Object.keys(camposFormateados).length} campo(s) adicional(es)`);
        
        // Mostrar qué campos se agregaron
        Object.keys(camposFormateados).forEach(campoId => {
            const campoInfo = camposJira.find(c => c.id === campoId);
            const nombreCampo = campoInfo ? campoInfo.name : campoId;
            log('blue', '   ✓', `Agregado: ${nombreCampo}`);
        });
        
    } catch (error) {
        log('yellow', '⚠', 'No se pudieron actualizar algunos campos adicionales');
        if (error.response && error.response.data && error.response.data.errors) {
            const errorData = error.response.data;
            Object.keys(errorData.errors).forEach(campoId => {
                const campoInfo = camposJira.find(c => c.id === campoId);
                const nombreCampo = campoInfo ? campoInfo.name : campoId;
                log('yellow', '   ⚠', `No se pudo actualizar ${nombreCampo}: ${errorData.errors[campoId]}`);
            });
        }
    }
}

async function main() {
    console.log('='.repeat(60));
    log('cyan', '🚀', 'Registrador Automático de Incidencias en Jira');
    console.log('='.repeat(60));
    console.log();
    
    // Cargar configuración y datos
    const config = cargarConfiguracion();
    const datos = cargarDatosIncidencia();
    
    // Conectar a Jira y obtener campos
    log('cyan', '🔌', `Conectando a Jira: ${config.jira_server}...`);
    const camposJira = await obtenerCamposJira(config);
    log('green', '✅', 'Conexión exitosa a Jira');
    
    // Obtener campos disponibles para el tipo de incidencia
    log('cyan', '🔍', 'Verificando campos disponibles para este tipo de incidencia...');
    const camposDisponibles = await obtenerCamposDisponibles(config);
    
    // Mapear campos personalizados para CREACIÓN (solo los disponibles en pantalla de creación)
    const camposParaCreacion = mapearCamposPersonalizados(camposJira, datos, camposDisponibles, true);
    
    // Crear la incidencia
    const incidencia = await crearIncidencia(config, datos, camposParaCreacion, camposDisponibles, camposJira);
    
    // Mapear campos personalizados para ACTUALIZACIÓN (todos los campos que existen)
    const camposParaActualizacion = mapearCamposPersonalizados(camposJira, datos, camposDisponibles, false);
    
    // Filtrar campos que ya se usaron en creación
    const camposAdicionales = {};
    Object.keys(camposParaActualizacion).forEach(campoId => {
        if (!camposParaCreacion[campoId]) {
            camposAdicionales[campoId] = camposParaActualizacion[campoId];
        }
    });
    
    // Actualizar la incidencia con los campos adicionales si hay alguno
    if (Object.keys(camposAdicionales).length > 0) {
        await actualizarIncidencia(config, incidencia.key, camposAdicionales, camposJira, datos);
    }
    
    console.log();
    console.log('='.repeat(60));
    log('green', '✅', 'Proceso completado exitosamente');
    console.log('='.repeat(60));
}

// Ejecutar
main().catch(error => {
    log('red', '❌', `Error inesperado: ${error.message}`);
    process.exit(1);
});
