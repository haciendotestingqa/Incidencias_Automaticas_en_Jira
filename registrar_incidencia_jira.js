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

function parseCSVLine(line) {
    // Parsear una línea de CSV teniendo en cuenta comillas
    const values = [];
    let currentValue = '';
    let insideQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i + 1];
        
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
    
    return values;
}

function parseCSV(csvContent) {
    const lines = csvContent.split('\n').filter(line => line.trim());
    if (lines.length < 2) {
        throw new Error('El CSV debe tener al menos una fila de encabezados y una fila de datos');
    }
    
    const headers = parseCSVLine(lines[0]);
    const datosArray = [];
    
    // Procesar todas las filas de datos (desde la línea 1 en adelante)
    for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        
        // Crear objeto con los datos
        const datos = {};
        headers.forEach((header, index) => {
            datos[header] = values[index] || '';
        });
        
        datosArray.push(datos);
    }
    
    return datosArray;
}

function cargarDatosIncidencia() {
    try {
        const csvPath = path.join(__dirname, 'incidencia_jira.csv');
        const csvContent = fs.readFileSync(csvPath, 'utf-8');
        const datosArray = parseCSV(csvContent);
        return datosArray;
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
            // Normalizar el valor para comparación (sin tildes, en minúsculas, sin espacios extra)
            // Mantener la barra "/" y espacios alrededor para opciones como "Desarrollo / Producción"
            const normalizar = (str) => {
                if (!str) return '';
                return str.toLowerCase()
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '')
                    .trim()
                    .replace(/\s+/g, ' '); // Normalizar espacios múltiples a uno solo, pero mantener espacios alrededor de "/"
            };
            const valorNormalizado = normalizar(valor);
            
            // Primero intentar coincidencia exacta (case-insensitive)
            let opcionEncontrada = campoMeta.allowedValues.find(
                opcion => {
                    const valorOriginal = opcion.value || opcion.name || '';
                    return valorOriginal.toLowerCase() === valor.toLowerCase() || opcion.id === valor;
                }
            );
            
            // Si no se encuentra exacta, intentar con normalización (sin tildes)
            if (!opcionEncontrada) {
                opcionEncontrada = campoMeta.allowedValues.find(
                    opcion => {
                        const opcionValue = normalizar(opcion.value || opcion.name || '');
                        const opcionName = normalizar(opcion.name || opcion.value || '');
                        return opcionValue === valorNormalizado || opcionName === valorNormalizado;
                    }
                );
            }
            
            // Si aún no se encuentra, intentar comparación parcial, pero priorizando coincidencias más largas
            if (!opcionEncontrada) {
                // Ordenar por longitud descendente para priorizar coincidencias más específicas
                const opcionesOrdenadas = [...campoMeta.allowedValues].sort((a, b) => {
                    const lenA = (a.value || a.name || '').length;
                    const lenB = (b.value || b.name || '').length;
                    return lenB - lenA; // Más largo primero
                });
                
                opcionEncontrada = opcionesOrdenadas.find(
                    opcion => {
                        const opcionValue = normalizar(opcion.value || opcion.name || '');
                        // Solo usar comparación parcial si el valor del CSV está contenido en la opción o viceversa
                        // Pero priorizar coincidencias más largas (ya ordenadas)
                        return opcionValue.includes(valorNormalizado) || valorNormalizado.includes(opcionValue);
                    }
                );
            }
            if (opcionEncontrada) {
                return { id: opcionEncontrada.id || opcionEncontrada.value };
            }
        }
        // Si no se encuentra, intentar usar el valor directamente
        return { name: valor };
    }
    
    // Campos de tipo labels (array de strings)
    // Los campos labels tienen type: 'array', items: 'string' y custom: 'com.atlassian.jira.plugin.system.customfieldtypes:labels'
    const esLabels = tipoCampo === 'array' && 
                     campoMeta.schema?.items === 'string' && 
                     campoMeta.schema?.custom === 'com.atlassian.jira.plugin.system.customfieldtypes:labels';
    
    if (esLabels || (tipoCampo === 'array' && sistemaTipo === 'labels')) {
        // Los campos de tipo labels son arrays simples de strings
        // Dividir por comas si hay múltiples valores
        const valores = valor.split(',').map(v => v.trim()).filter(v => v);
        return valores; // Retornar array de strings directamente
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
        // Para campos de usuario, el formato puede ser un objeto o un array dependiendo del tipo
        // Si es un campo de usuario múltiple, debe ser un array
        // Si es un campo de usuario simple, debe ser un objeto
        // Por defecto, usar objeto con name
        return { name: valor };
    }
    
    // Campos de tipo array de usuarios (user picker múltiple)
    if (tipoCampo === 'array' && sistemaTipo === 'user') {
        // Para arrays de usuarios, dividir por comas y crear array de objetos
        const usuarios = valor.split(',').map(v => v.trim()).filter(v => v);
        return usuarios.map(u => ({ name: u }));
    }
    
    // Campos de tipo fecha
    if (tipoCampo === 'date') {
        // Convertir formato DD/MM/YYYY a YYYY-MM-DD
        const fechaMatch = valor.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (fechaMatch) {
            const [, dia, mes, anio] = fechaMatch;
            return `${anio}-${mes}-${dia}`;
        }
        // Si ya está en formato YYYY-MM-DD, devolverlo tal cual
        if (valor.match(/^\d{4}-\d{2}-\d{2}$/)) {
            return valor;
        }
        // Si no coincide con ningún formato conocido, intentar devolverlo tal cual
        return valor;
    }
    
    // Campos de tipo team (atlassian-team)
    if (tipoCampo === 'team' || campoMeta.schema?.custom === 'com.atlassian.jira.plugin.system.customfieldtypes:atlassian-team') {
        // Buscar el equipo en las opciones disponibles
        if (campoMeta.allowedValues && campoMeta.allowedValues.length > 0) {
            const equipoEncontrado = campoMeta.allowedValues.find(
                equipo => equipo.name === valor || equipo.value === valor || equipo.id === valor || equipo.teamId === valor
            );
            if (equipoEncontrado) {
                // Usar el ID del equipo si está disponible
                // El campo Team requiere el ID del equipo (UUID) como string directo
                return equipoEncontrado.id || equipoEncontrado.teamId || equipoEncontrado.value;
            }
        }
        // Para campos de tipo team, Jira requiere el ID del equipo (UUID) como string directo
        // Si el valor parece ser un UUID, usarlo directamente
        // Si no, intentar como string (puede funcionar en algunos casos si Jira puede resolverlo por nombre)
        const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (uuidPattern.test(valor)) {
            return valor; // Es un UUID, usarlo directamente
        }
        // Si no es un UUID, intentar como string (Jira puede resolverlo internamente)
        return valor;
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
        'Evidencias (parte 2)': datos['Evidencias (parte 2)'],
        'Evidencias (parte 3)': datos['Evidencias (parte 3)'],
        'Evidencias (parte 4)': datos['Evidencias (parte 4)'],
        'Prioridad': datos['Prioridad'], // Campo personalizado de Prioridad
        'Desarrollador asignado': datos['Desarrollador asignado'],
        'Estado del Desarrollo': datos['Estado del Desarrollo'],
        'Fecha Revision Dev': datos['Fecha Revision Dev'] || datos['Fecha Revision Dev.'],
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
    // Si hay múltiples campos con el mismo nombre, usar el que esté disponible en la pantalla de creación
    const campoMap = {};
    camposJira.forEach(campo => {
        if (!campoMap[campo.name]) {
            campoMap[campo.name] = { id: campo.id, meta: campo };
        } else {
            // Si ya existe un campo con este nombre, verificar cuál está disponible en creación
            // Preferir el que esté en camposDisponibles si soloCreacion es true
            if (soloCreacion && camposDisponibles) {
                const actualId = campoMap[campo.name].id;
                const nuevoId = campo.id;
                const actualDisponible = camposDisponibles[actualId] !== undefined;
                const nuevoDisponible = camposDisponibles[nuevoId] !== undefined;
                // Si el nuevo está disponible y el actual no, usar el nuevo
                if (nuevoDisponible && !actualDisponible) {
                    campoMap[campo.name] = { id: campo.id, meta: campo };
                }
            }
        }
    });
    
    if (soloCreacion) {
        log('cyan', '📋', 'Buscando campos personalizados para CREACIÓN...');
    } else {
        log('cyan', '📋', 'Buscando campos personalizados para ACTUALIZACIÓN...');
    }
    
    Object.keys(nombresCampos).forEach(nombreCampo => {
        let valor = nombresCampos[nombreCampo];
        if (valor && valor.trim() !== '') {
            // Mapeo especial: si el CSV tiene "Fecha Revision Dev." pero Jira tiene "Fecha Revision Dev"
            let nombreCampoJira = nombreCampo;
            if (nombreCampo === 'Fecha Revision Dev.' && !campoMap[nombreCampo]) {
                // Si el CSV tiene "Fecha Revision Dev." pero Jira tiene "Fecha Revision Dev", buscar por el nombre sin punto
                nombreCampoJira = 'Fecha Revision Dev';
                // Asegurarse de usar el valor del CSV con punto
                if (!valor && datos['Fecha Revision Dev.']) {
                    valor = datos['Fecha Revision Dev.'];
                }
            }
            
            const campoInfo = campoMap[nombreCampoJira] || campoMap[nombreCampo];
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
    
    // Construir el objeto de campos para la incidencia
    // NO usar el campo estándar "priority", usar el campo personalizado "Prioridad" que está en camposPersonalizados
    let fields = {
        project: {
            key: config.project_key
        },
        summary: datos['Titulo'] || datos['Título'] || '',
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
        ...camposPersonalizados
    };
    
    
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
            // Verificar si campos importantes están en fields antes de crear
            const campoDesarrollador = camposJira.find(c => c.name === 'Desarrollador asignado');
            const campoPrioridad = camposJira.find(c => c.name === 'Prioridad' && c.custom === true);
            const campoPlataforma = camposJira.find(c => c.name === 'Plataforma' && c.custom === true);
            const campoAutor = camposJira.find(c => c.name === 'Autor' && c.custom === true);
            const campoSprint = camposJira.find(c => c.name === 'Sprint asociado' && c.custom === true);
            if (campoDesarrollador && fields[campoDesarrollador.id]) {
                log('blue', '   →', `Campo 'Desarrollador asignado' incluido en creación inicial`);
            }
            if (campoPrioridad && fields[campoPrioridad.id]) {
                const valorPrioridad = fields[campoPrioridad.id];
                log('blue', '   →', `Campo 'Prioridad' (personalizado) incluido en creación inicial con valor: ${JSON.stringify(valorPrioridad)}`);
            }
            if (campoPlataforma && fields[campoPlataforma.id]) {
                const valorPlataforma = fields[campoPlataforma.id];
                log('blue', '   →', `Campo 'Plataforma' (personalizado) incluido en creación inicial con valor: ${JSON.stringify(valorPlataforma)}`);
            }
            if (campoAutor && fields[campoAutor.id]) {
                const valorAutor = fields[campoAutor.id];
                log('blue', '   →', `Campo 'Autor' (personalizado) incluido en creación inicial con valor: ${JSON.stringify(valorAutor)}`);
            }
            if (campoSprint && fields[campoSprint.id]) {
                const valorSprint = fields[campoSprint.id];
                log('blue', '   →', `Campo 'Sprint asociado' (personalizado) incluido en creación inicial con valor: ${JSON.stringify(valorSprint)}`);
            }
            const campoTeam = camposJira.find(c => c.name === 'Team' && c.custom === true);
            if (campoTeam && fields[campoTeam.id]) {
                const valorTeam = fields[campoTeam.id];
                log('blue', '   →', `Campo 'Team' (personalizado) incluido en creación inicial con valor: ${JSON.stringify(valorTeam)}`);
            }
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
                    // NO buscar por prioridad estándar, usar el campo personalizado "Prioridad"
                    // El campo personalizado "Prioridad" no debe omitirse
                });
                
                // Eliminar campos problemáticos conocidos ANTES del primer intento
                // NO incluir "Prioridad" y "Sprint asociado" aquí porque son campos personalizados que deben usarse
                const camposConocidosProblematicos = ['Team'];
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
                // NO incluir "Sprint asociado" aquí porque es un campo personalizado que debe usarse
                const camposProblematicosPorNombre = ['Team'];
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
                        const campoInfo = camposJira.find(c => c.id === campoId);
                        const nombreCampo = campoInfo ? campoInfo.name : campoId;
                        // No omitir campos importantes: "Desarrollador asignado" y "Prioridad" (campo personalizado)
                        if (nombreCampo === 'Desarrollador asignado') {
                            // Si es "Desarrollador asignado", verificar que sea un array válido con accountId
                            const valorCampo = camposSinProblemas[campoId];
                            if (!valorCampo || !Array.isArray(valorCampo) || !valorCampo[0] || !valorCampo[0].accountId) {
                                delete camposSinProblemas[campoId];
                                log('yellow', '   ', `- Omitiendo campo: ${nombreCampo} (formato inválido - debe ser array con accountId)`);
                            } else {
                                log('blue', '   ', `- Manteniendo campo: ${nombreCampo} (tiene array con accountId válido)`);
                            }
                        } else if (nombreCampo === 'Prioridad') {
                            // No omitir el campo personalizado "Prioridad" si tiene formato válido
                            const valorCampo = camposSinProblemas[campoId];
                            if (!valorCampo || !valorCampo.id) {
                                delete camposSinProblemas[campoId];
                                log('yellow', '   ', `- Omitiendo campo: ${nombreCampo} (formato inválido - debe tener id)`);
                            } else {
                                log('blue', '   ', `- Manteniendo campo: ${nombreCampo} (tiene id válido)`);
                            }
                        } else if (nombreCampo === 'Plataforma') {
                            // No omitir el campo personalizado "Plataforma" si tiene formato válido
                            const valorCampo = camposSinProblemas[campoId];
                            if (!valorCampo || !valorCampo.id) {
                                delete camposSinProblemas[campoId];
                                log('yellow', '   ', `- Omitiendo campo: ${nombreCampo} (formato inválido - debe tener id)`);
                            } else {
                                log('blue', '   ', `- Manteniendo campo: ${nombreCampo} (tiene id válido)`);
                            }
                        } else if (nombreCampo === 'Autor') {
                            // No omitir el campo personalizado "Autor" si tiene formato válido (array con accountId)
                            const valorCampo = camposSinProblemas[campoId];
                            if (!valorCampo || !Array.isArray(valorCampo) || !valorCampo[0] || !valorCampo[0].accountId) {
                                delete camposSinProblemas[campoId];
                                log('yellow', '   ', `- Omitiendo campo: ${nombreCampo} (formato inválido - debe ser array con accountId)`);
                            } else {
                                log('blue', '   ', `- Manteniendo campo: ${nombreCampo} (tiene array con accountId válido)`);
                            }
                        } else if (nombreCampo === 'Sprint asociado') {
                            // No omitir el campo personalizado "Sprint asociado" si tiene formato válido (array de strings)
                            const valorCampo = camposSinProblemas[campoId];
                            if (!valorCampo || !Array.isArray(valorCampo) || valorCampo.length === 0) {
                                delete camposSinProblemas[campoId];
                                log('yellow', '   ', `- Omitiendo campo: ${nombreCampo} (formato inválido - debe ser array de strings)`);
                            } else {
                                log('blue', '   ', `- Manteniendo campo: ${nombreCampo} (tiene array de strings válido)`);
                            }
                        } else if (nombreCampo === 'Team') {
                            // El campo Team puede requerir un ID específico que no está disponible
                            // Omitirlo durante la creación y se intentará en la actualización
                            delete camposSinProblemas[campoId];
                            log('yellow', '   ', `- Omitiendo campo: ${nombreCampo} (se intentará en actualización - requiere ID de equipo específico)`);
                        } else {
                            delete camposSinProblemas[campoId];
                            log('yellow', '   ', `- Omitiendo campo: ${nombreCampo}`);
                        }
                    });
                    
                    // Si hay mensajes de error sobre Team pero no está en camposProblematicos, verificarlo
                    // Pero no omitirlo automáticamente, solo si realmente tiene un error específico
                    if (mensajesError.some(m => m.toLowerCase().includes('equipo') || m.toLowerCase().includes('team'))) {
                        Object.keys(camposSinProblemas).forEach(campoId => {
                            const campoInfo = camposJira.find(c => c.id === campoId);
                            if (campoInfo && campoInfo.name === 'Team') {
                                // Verificar si hay un error específico para este campo
                                if (errorData.errors && errorData.errors[campoId]) {
                                    delete camposSinProblemas[campoId];
                                    log('yellow', '   ', `- Omitiendo campo: Team (error específico: ${errorData.errors[campoId]})`);
                                } else {
                                    // Si no hay error específico, mantener el campo
                                    const valorCampo = camposSinProblemas[campoId];
                                    if (valorCampo && (valorCampo.id || valorCampo.name)) {
                                        log('blue', '   ', `- Manteniendo campo: Team (tiene formato válido, el error puede ser de otro campo)`);
                                    }
                                }
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
                                const campoInfo = camposJira.find(c => c.id === campoId);
                                const nombreCampo = campoInfo ? campoInfo.name : campoId;
                                // No omitir campos importantes si tienen formato válido
                                if (nombreCampo === 'Desarrollador asignado') {
                                    // Si es "Desarrollador asignado", verificar que sea un array válido con accountId
                                    const valorCampo = camposSinProblemas[campoId];
                                    if (!valorCampo || !Array.isArray(valorCampo) || !valorCampo[0] || !valorCampo[0].accountId) {
                                        delete camposSinProblemas[campoId];
                                        log('yellow', '   ', `- Omitiendo campo adicional: ${nombreCampo} (formato inválido - debe ser array con accountId)`);
                                    } else {
                                        log('blue', '   ', `- Manteniendo campo: ${nombreCampo} (tiene array con accountId válido)`);
                                    }
                                } else if (nombreCampo === 'Team') {
                                    // Si es "Team", verificar que tenga formato válido (objeto con id o name)
                                    const valorCampo = camposSinProblemas[campoId];
                                    if (!valorCampo || (typeof valorCampo === 'object' && !valorCampo.id && !valorCampo.name)) {
                                        delete camposSinProblemas[campoId];
                                        log('yellow', '   ', `- Omitiendo campo adicional: ${nombreCampo} (formato inválido - debe tener id o name)`);
                                    } else {
                                        log('blue', '   ', `- Manteniendo campo: ${nombreCampo} (tiene formato válido)`);
                                    }
                                } else {
                                    delete camposSinProblemas[campoId];
                                    log('yellow', '   ', `- Omitiendo campo adicional: ${nombreCampo}`);
                                }
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
        log('blue', '   ', `Resumen: ${datos['Titulo'] || datos['Título'] || 'Sin título'}`);
        
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
    let camposFormateados = {}; // Declarar fuera del try para que esté disponible en el catch
    
    try {
        log('cyan', '🔄', `Actualizando incidencia ${issueKey} con campos adicionales...`);
        
        // Obtener metadatos de edición para formatear mejor los campos
        const metadatosEdicion = await obtenerMetadatosEdicion(config, issueKey);
        
        // Re-formatear campos con metadatos de edición si están disponibles
        camposFormateados = {};
        Object.keys(camposAdicionales).forEach(campoId => {
            const campoMeta = metadatosEdicion[campoId];
            const valorOriginal = camposAdicionales[campoId];
            
            // Obtener el valor original del CSV para re-formatearlo
            const campoInfo = camposJira.find(c => c.id === campoId);
            if (campoInfo && campoInfo.name && datos) {
                // Para campos de usuario, si ya tiene accountId, mantenerlo
                // El campo "Desarrollador asignado" es un array de usuarios
                if (campoInfo.name === 'Desarrollador asignado' && valorOriginal && Array.isArray(valorOriginal) && valorOriginal[0] && valorOriginal[0].accountId) {
                    camposFormateados[campoId] = valorOriginal;
                } else if (campoInfo.name === 'Entorno') {
                    // Para el campo Entorno, asegurarse de usar el valor del CSV y formatearlo correctamente
                    const valorDelCSV = datos[campoInfo.name];
                    if (valorDelCSV && campoMeta) {
                        const valorFormateado = formatearValorCampo(campoMeta, valorDelCSV);
                        camposFormateados[campoId] = valorFormateado !== null ? valorFormateado : valorDelCSV;
                    } else if (valorDelCSV) {
                        // Si no hay metadatos pero hay valor, intentar usarlo directamente
                        camposFormateados[campoId] = valorDelCSV;
                    } else {
                        camposFormateados[campoId] = valorOriginal;
                    }
                } else if (campoInfo.name === 'Team') {
                    // Para el campo Team, usar el UUID directamente del CSV
                    const valorDelCSV = datos['Team'] || datos['Team '];
                    if (valorDelCSV && valorDelCSV.trim() !== '') {
                        // Verificar si es un UUID válido
                        const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                        if (uuidPattern.test(valorDelCSV.trim())) {
                            camposFormateados[campoId] = valorDelCSV.trim();
                        } else {
                            camposFormateados[campoId] = valorOriginal;
                        }
                    } else {
                        camposFormateados[campoId] = valorOriginal;
                    }
                } else {
                    // Buscar el valor en los datos
                    const valorDelCSV = datos[campoInfo.name];
                    if (valorDelCSV && campoMeta) {
                        const valorFormateado = formatearValorCampo(campoMeta, valorDelCSV);
                        camposFormateados[campoId] = valorFormateado !== null ? valorFormateado : valorOriginal;
                    } else {
                        camposFormateados[campoId] = valorOriginal;
                    }
                }
            } else {
                camposFormateados[campoId] = valorOriginal;
            }
        });
        
        // Log detallado del Team antes de enviar
        const campoTeamId = camposJira.find(c => c.name === 'Team' && c.custom === true)?.id;
        if (campoTeamId && camposFormateados[campoTeamId]) {
            log('blue', '   🔍', `Enviando Team con valor: ${JSON.stringify(camposFormateados[campoTeamId])}`);
        }
        
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
        
        // Verificar si el Team se actualizó correctamente
        if (campoTeamId && camposFormateados[campoTeamId]) {
            try {
                const verifyResponse = await axios.get(
                    `${config.jira_server}/rest/api/3/issue/${issueKey}`,
                    {
                        headers: {
                            'Authorization': `Basic ${auth}`,
                            'Accept': 'application/json'
                        }
                    }
                );
                const teamVerificado = verifyResponse.data.fields[campoTeamId];
                if (teamVerificado) {
                    log('green', '   ✅', `Team verificado en Jira: ${teamVerificado.name || teamVerificado.id}`);
                } else {
                    log('yellow', '   ⚠', `Team no se configuró en Jira (aunque se envió correctamente)`);
                }
            } catch (verifyError) {
                // Ignorar error de verificación
            }
        }
        
        log('green', '✅', `Incidencia actualizada exitosamente con ${Object.keys(camposFormateados).length} campo(s) adicional(es)`);
        
        // Mostrar qué campos se agregaron
        Object.keys(camposFormateados).forEach(campoId => {
            const campoInfo = camposJira.find(c => c.id === campoId);
            const nombreCampo = campoInfo ? campoInfo.name : campoId;
            const valor = camposFormateados[campoId];
            // Mostrar información adicional para campos de usuario
            if (campoInfo && campoInfo.schema && campoInfo.schema.type === 'user') {
                if (valor && valor.accountId) {
                    log('blue', '   ✓', `Agregado: ${nombreCampo} (usuario con accountId: ${valor.accountId.substring(0, 8)}...)`);
                } else {
                    log('blue', '   ✓', `Agregado: ${nombreCampo}`);
                }
            } else if (campoInfo && campoInfo.schema && campoInfo.schema.type === 'option') {
                // Para campos de opción, mostrar el ID de la opción
                if (valor && valor.id) {
                    log('blue', '   ✓', `Agregado: ${nombreCampo} (opción con id: ${valor.id})`);
                } else {
                    log('blue', '   ✓', `Agregado: ${nombreCampo}`);
                }
            } else if (campoInfo && (campoInfo.schema?.type === 'string' || campoInfo.schema?.type === 'text' || campoInfo.schema?.type === 'url')) {
                // Para campos de texto/URL, mostrar el valor truncado
                const valorStr = typeof valor === 'string' ? valor : JSON.stringify(valor);
                const valorTruncado = valorStr.length > 50 ? valorStr.substring(0, 50) + '...' : valorStr;
                log('blue', '   ✓', `Agregado: ${nombreCampo} (${valorTruncado})`);
            } else {
                log('blue', '   ✓', `Agregado: ${nombreCampo}`);
            }
        });
        
    } catch (error) {
        log('yellow', '⚠', 'No se pudieron actualizar algunos campos adicionales');
        // Log detallado del error para debugging
        if (error.response && error.response.data) {
            const errorData = error.response.data;
            const camposConError = errorData.errors ? Object.keys(errorData.errors) : [];
            
            // Verificar específicamente si el Team está en los errores
            const campoTeamId = camposJira.find(c => c.name === 'Team' && c.custom === true)?.id;
            if (campoTeamId && camposConError.includes(campoTeamId)) {
                log('red', '   ❌', `Error al actualizar Team: ${errorData.errors[campoTeamId]}`);
                log('blue', '   💡', `Valor intentado: ${camposFormateados[campoTeamId]}`);
            }
            
            // Mostrar campos que sí se actualizaron exitosamente (los que no están en errores)
            const camposActualizados = Object.keys(camposFormateados).filter(campoId => {
                return !camposConError.includes(campoId);
            });
            
            if (camposActualizados.length > 0) {
                camposActualizados.forEach(campoId => {
                    const campoInfo = camposJira.find(c => c.id === campoId);
                    const nombreCampo = campoInfo ? campoInfo.name : campoId;
                    if (campoInfo && campoInfo.schema && campoInfo.schema.type === 'user') {
                        const valor = camposFormateados[campoId];
                        if (valor && valor.accountId) {
                            log('blue', '   ✓', `Agregado: ${nombreCampo} (usuario con accountId: ${valor.accountId.substring(0, 8)}...)`);
                        } else {
                            log('blue', '   ✓', `Agregado: ${nombreCampo}`);
                        }
                    } else if (campoInfo && campoInfo.schema && campoInfo.schema.type === 'option') {
                        // Para campos de opción, mostrar el ID de la opción
                        const valor = camposFormateados[campoId];
                        if (valor && valor.id) {
                            log('blue', '   ✓', `Agregado: ${nombreCampo} (opción con id: ${valor.id})`);
                        } else {
                            log('blue', '   ✓', `Agregado: ${nombreCampo}`);
                        }
                    } else if (nombreCampo === 'Team') {
                        // Para el campo Team, verificar si realmente se agregó
                        log('blue', '   ✓', `Agregado: ${nombreCampo} (formato: ${JSON.stringify(camposFormateados[campoId])})`);
                    } else {
                        log('blue', '   ✓', `Agregado: ${nombreCampo}`);
                    }
                });
            }
            
            // Mostrar campos con error
            if (errorData.errors) {
                Object.keys(errorData.errors).forEach(campoId => {
                    const campoInfo = camposJira.find(c => c.id === campoId);
                    const nombreCampo = campoInfo ? campoInfo.name : campoId;
                    const mensajeError = errorData.errors[campoId];
                    log('yellow', '   ⚠', `No se pudo actualizar ${nombreCampo}: ${mensajeError}`);
                    if (nombreCampo === 'Team') {
                        log('yellow', '   💡', `El campo Team requiere un ID de equipo válido. Verifica que el nombre del equipo en el CSV coincida exactamente con una de las opciones disponibles en el dropdown de Jira.`);
                    }
                });
            }
            
            // Verificar si hay mensajes de error generales relacionados con Team
            if (errorData.errorMessages && errorData.errorMessages.length > 0) {
                errorData.errorMessages.forEach(mensaje => {
                    if (mensaje.toLowerCase().includes('team') || mensaje.toLowerCase().includes('equipo')) {
                        log('yellow', '   ⚠', `Error relacionado con Team: ${mensaje}`);
                        log('yellow', '   💡', `El campo Team requiere un ID de equipo válido. Verifica que el nombre del equipo en el CSV ("${datos['Team'] || datos['Team ']}") coincida exactamente con una de las opciones disponibles en el dropdown de Jira.`);
                    }
                });
            }
        } else {
            log('red', '   ', `Error: ${error.message}`);
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
    const datosArray = cargarDatosIncidencia();
    
    if (!Array.isArray(datosArray) || datosArray.length === 0) {
        log('red', '❌', 'No se encontraron datos en el archivo CSV');
        process.exit(1);
    }
    
    log('cyan', '📊', `Se encontraron ${datosArray.length} incidencia(s) para procesar`);
    console.log();
    
    // Conectar a Jira y obtener campos
    log('cyan', '🔌', `Conectando a Jira: ${config.jira_server}...`);
    const camposJira = await obtenerCamposJira(config);
    log('green', '✅', 'Conexión exitosa a Jira');
    
    // Obtener campos disponibles para el tipo de incidencia
    log('cyan', '🔍', 'Verificando campos disponibles para este tipo de incidencia...');
    const camposDisponibles = await obtenerCamposDisponibles(config);
    
    // Función auxiliar para buscar y formatear un campo de usuario (array)
    async function buscarYFormatearUsuario(nombreCampo, valorUsuario, camposParaUsar) {
        if (!valorUsuario || valorUsuario.trim() === '') {
            return;
        }
        
        try {
            const auth = Buffer.from(`${config.email}:${config.api_token}`).toString('base64');
            
            // Intentar buscar primero con el valor exacto
            let userResponse = await axios.get(
                `${config.jira_server}/rest/api/3/user/search`,
                {
                    headers: {
                        'Authorization': `Basic ${auth}`,
                        'Accept': 'application/json'
                    },
                    params: {
                        query: valorUsuario,
                        maxResults: 20
                    }
                }
            );
            
            // Si no se encuentra, intentar buscar con una parte del nombre (primeros 8 caracteres)
            if (!userResponse.data || userResponse.data.length === 0) {
                const queryCorto = valorUsuario.length > 8 ? valorUsuario.substring(0, 8) : valorUsuario;
                userResponse = await axios.get(
                    `${config.jira_server}/rest/api/3/user/search`,
                    {
                        headers: {
                            'Authorization': `Basic ${auth}`,
                            'Accept': 'application/json'
                        },
                        params: {
                            query: queryCorto,
                            maxResults: 20
                        }
                    }
                );
            }
            
            if (userResponse.data && userResponse.data.length > 0) {
                // Buscar el usuario con coincidencia exacta primero
                let usuario = userResponse.data.find(u => 
                    u.displayName === valorUsuario || 
                    u.name === valorUsuario ||
                    u.emailAddress === valorUsuario
                );
                
                // Si no se encuentra exacto, buscar por coincidencia parcial (contiene)
                if (!usuario) {
                    usuario = userResponse.data.find(u => 
                        u.displayName.toLowerCase().includes(valorUsuario.toLowerCase()) ||
                        (u.name && u.name.toLowerCase().includes(valorUsuario.toLowerCase())) ||
                        (u.emailAddress && u.emailAddress.toLowerCase().includes(valorUsuario.toLowerCase()))
                    );
                }
                
                // Si aún no se encuentra, buscar por similitud (el valor contiene parte del displayName o viceversa)
                if (!usuario) {
                    usuario = userResponse.data.find(u => 
                        (u.displayName && valorUsuario.toLowerCase().includes(u.displayName.toLowerCase().substring(0, 8))) ||
                        (u.displayName && u.displayName.toLowerCase().includes(valorUsuario.toLowerCase().substring(0, 8)))
                    );
                }
                
                // Si aún no se encuentra, usar el primer resultado (puede ser una coincidencia cercana)
                if (!usuario) {
                    usuario = userResponse.data[0];
                }
                
                // Buscar el campo personalizado en camposJira
                const campoPersonalizado = camposJira.find(c => c.name === nombreCampo);
                if (campoPersonalizado && camposParaUsar[campoPersonalizado.id]) {
                    // El campo es un array de usuarios (people picker múltiple)
                    // Necesita ser formateado como un array
                    if (usuario.accountId) {
                        camposParaUsar[campoPersonalizado.id] = [{ accountId: usuario.accountId }];
                        log('green', '   ✓', `${nombreCampo} formateado correctamente: ${usuario.displayName} (como array con accountId)`);
                    } else if (usuario.name) {
                        camposParaUsar[campoPersonalizado.id] = [{ name: usuario.name }];
                        log('yellow', '   ⚠', `${nombreCampo} formateado con name (no se encontró accountId): ${usuario.name}`);
                    }
                } else if (campoPersonalizado) {
                    log('yellow', '   ⚠', `Campo ${nombreCampo} no está en camposParaUsar, agregándolo...`);
                    // Si el campo no está en camposParaUsar, agregarlo
                    if (usuario.accountId) {
                        camposParaUsar[campoPersonalizado.id] = [{ accountId: usuario.accountId }];
                        log('green', '   ✓', `${nombreCampo} agregado y formateado correctamente: ${usuario.displayName} (como array con accountId)`);
                    } else if (usuario.name) {
                        camposParaUsar[campoPersonalizado.id] = [{ name: usuario.name }];
                        log('yellow', '   ⚠', `${nombreCampo} agregado con name (no se encontró accountId): ${usuario.name}`);
                    }
                }
            } else {
                log('yellow', '   ⚠', `No se encontró el usuario "${valorUsuario}" para el campo ${nombreCampo}`);
            }
        } catch (error) {
            log('yellow', '⚠', `No se pudo buscar el usuario para el campo ${nombreCampo}: ${valorUsuario}`);
        }
    }
    
    // Función auxiliar para verificar si ya existe una incidencia con el mismo título
    async function verificarIncidenciaExistente(titulo) {
        try {
            const auth = Buffer.from(`${config.email}:${config.api_token}`).toString('base64');
            // Buscar las últimas 100 incidencias del proyecto y filtrar por título exacto
            // Esto es más confiable que usar JQL con texto que puede tener caracteres especiales
            const jql = `project = ${config.project_key} ORDER BY created DESC`;
            const response = await axios.get(
                `${config.jira_server}/rest/api/3/search`,
                {
                    headers: {
                        'Authorization': `Basic ${auth}`,
                        'Accept': 'application/json'
                    },
                    params: {
                        jql: jql,
                        maxResults: 100,
                        fields: ['key', 'summary']
                    }
                }
            );
            
            if (response.data.issues && response.data.issues.length > 0) {
                // Buscar la incidencia con el título exactamente igual (case-insensitive, sin espacios extra)
                const tituloNormalizado = titulo.toLowerCase().trim();
                const issueExistente = response.data.issues.find(issue => 
                    issue.fields.summary.toLowerCase().trim() === tituloNormalizado
                );
                if (issueExistente) {
                    return issueExistente;
                }
            }
            return null;
        } catch (error) {
            // Si hay error en la búsqueda, continuar con la creación
            // No mostrar error para no interrumpir el flujo
            return null;
        }
    }
    
    // Procesar cada incidencia del CSV
    // Verificar que no haya duplicados en el array
    const titulosProcesados = new Set();
    for (let i = 0; i < datosArray.length; i++) {
        const datos = datosArray[i];
        const titulo = datos['Titulo'] || datos['Título'] || 'Sin título';
        
        // Verificar si ya se procesó esta incidencia (por título) en el CSV
        if (titulosProcesados.has(titulo)) {
            log('yellow', '⚠', `Incidencia duplicada en CSV detectada, omitiendo: ${titulo}`);
            continue;
        }
        titulosProcesados.add(titulo);
        
        // Verificar si ya existe una incidencia en Jira con el mismo título
        const incidenciaExistente = await verificarIncidenciaExistente(titulo);
        if (incidenciaExistente) {
            log('yellow', '⚠', `Incidencia ya existe en Jira, omitiendo creación: ${titulo}`);
            log('blue', '   ', `Incidencia existente: ${incidenciaExistente.key} - ${incidenciaExistente.fields.summary}`);
            log('blue', '   ', `URL: ${config.jira_server}/browse/${incidenciaExistente.key}`);
            continue;
        }
        
        console.log();
        log('cyan', '📝', `Procesando incidencia ${i + 1} de ${datosArray.length}: ${titulo}`);
        console.log('-'.repeat(60));
        
        // Mapear campos personalizados para CREACIÓN (solo los disponibles en pantalla de creación)
        const camposParaCreacion = mapearCamposPersonalizados(camposJira, datos, camposDisponibles, true);
        
        // Buscar y formatear el campo "Desarrollador asignado" si existe
        await buscarYFormatearUsuario('Desarrollador asignado', datos['Desarrollador asignado'], camposParaCreacion);
        
        // Buscar y formatear el campo "Autor" si existe
        await buscarYFormatearUsuario('Autor', datos['Autor'], camposParaCreacion);
        
        // Crear la incidencia
        const incidencia = await crearIncidencia(config, datos, camposParaCreacion, camposDisponibles, camposJira);
        
        // Mapear campos personalizados para ACTUALIZACIÓN (todos los campos que existen)
        const camposParaActualizacion = mapearCamposPersonalizados(camposJira, datos, camposDisponibles, false);
        
        // Buscar y formatear el campo "Desarrollador asignado" en actualización si no se pudo en creación
        if (datos['Desarrollador asignado'] && datos['Desarrollador asignado'].trim() !== '') {
            const campoDesarrollador = camposJira.find(c => c.name === 'Desarrollador asignado');
            if (campoDesarrollador && camposParaActualizacion[campoDesarrollador.id]) {
                try {
                    const auth = Buffer.from(`${config.email}:${config.api_token}`).toString('base64');
                    const userResponse = await axios.get(
                        `${config.jira_server}/rest/api/3/user/search`,
                        {
                            headers: {
                                'Authorization': `Basic ${auth}`,
                                'Accept': 'application/json'
                            },
                            params: {
                                query: datos['Desarrollador asignado'],
                                maxResults: 10
                            }
                        }
                    );
                    
                    if (userResponse.data && userResponse.data.length > 0) {
                        const usuario = userResponse.data.find(u => 
                            u.displayName === datos['Desarrollador asignado'] || 
                            u.name === datos['Desarrollador asignado'] ||
                            u.emailAddress === datos['Desarrollador asignado'] ||
                            u.displayName.toLowerCase().includes(datos['Desarrollador asignado'].toLowerCase())
                        ) || userResponse.data[0];
                        
                        // El campo "Desarrollador asignado" es un array de usuarios (people picker múltiple)
                        // Necesita ser formateado como un array
                        if (usuario.accountId) {
                            camposParaActualizacion[campoDesarrollador.id] = [{ accountId: usuario.accountId }];
                        } else if (usuario.name) {
                            camposParaActualizacion[campoDesarrollador.id] = [{ name: usuario.name }];
                        }
                    }
                } catch (error) {
                    // Si falla, se usará el valor formateado original
                }
            }
        }
        
        // Filtrar campos que ya se usaron en creación
        // Pero incluir "Desarrollador asignado" si existe, ya que puede haberse omitido durante la creación
        const camposAdicionales = {};
        const campoDesarrollador = camposJira.find(c => c.name === 'Desarrollador asignado');
        const campoDesarrolladorId = campoDesarrollador?.id;
        const campoTeam = camposJira.find(c => c.name === 'Team' && c.custom === true);
        const campoTeamId = campoTeam?.id;
        const campoEntorno = camposJira.find(c => c.name === 'Entorno');
        const campoEntornoId = campoEntorno?.id;
        
        Object.keys(camposParaActualizacion).forEach(campoId => {
            // Incluir el campo si no está en creación, o si es un campo importante (para asegurar que se intente)
            if (!camposParaCreacion[campoId] || campoId === campoDesarrolladorId || campoId === campoTeamId || campoId === campoEntornoId) {
                camposAdicionales[campoId] = camposParaActualizacion[campoId];
            }
        });
        
        // Si el campo "Desarrollador asignado" está en camposAdicionales, asegurarse de que tenga el formato correcto
        if (campoDesarrolladorId && camposAdicionales[campoDesarrolladorId] && datos['Desarrollador asignado']) {
            // El campo ya debería estar formateado con accountId de la búsqueda anterior
            // Pero verificamos que tenga el formato correcto
            if (typeof camposAdicionales[campoDesarrolladorId] === 'object' && 
                (camposAdicionales[campoDesarrolladorId].accountId || camposAdicionales[campoDesarrolladorId].name)) {
                log('blue', '   →', `Campo 'Desarrollador asignado' se intentará actualizar con formato de usuario`);
            }
        }
        
        // Asegurarse de que el campo Team esté en camposAdicionales con el UUID correcto
        if (campoTeamId && datos['Team']) {
            const valorTeam = datos['Team'] || datos['Team '];
            if (valorTeam && valorTeam.trim() !== '') {
                const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                if (uuidPattern.test(valorTeam.trim())) {
                    camposAdicionales[campoTeamId] = valorTeam.trim();
                    log('blue', '   →', `Campo 'Team' se intentará actualizar con UUID: ${valorTeam.trim()}`);
                }
            }
        }
        
        // Actualizar la incidencia con los campos adicionales si hay alguno
        if (Object.keys(camposAdicionales).length > 0) {
            // Si el Team está en camposAdicionales, actualizarlo primero por separado para asegurar que se registre
            const campoTeam = camposJira.find(c => c.name === 'Team' && c.custom === true);
            const campoTeamId = campoTeam?.id;
            if (campoTeamId && camposAdicionales[campoTeamId] && datos['Team']) {
                const valorTeam = datos['Team'] || datos['Team '];
                if (valorTeam && valorTeam.trim() !== '') {
                    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                    if (uuidPattern.test(valorTeam.trim())) {
                        try {
                            const auth = Buffer.from(`${config.email}:${config.api_token}`).toString('base64');
                            const teamResponse = await axios.put(
                                `${config.jira_server}/rest/api/3/issue/${incidencia.key}`,
                                {
                                    fields: {
                                        [campoTeamId]: valorTeam.trim()
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
                            
                            // Verificar que el Team se haya actualizado correctamente
                            const verifyResponse = await axios.get(
                                `${config.jira_server}/rest/api/3/issue/${incidencia.key}`,
                                {
                                    headers: {
                                        'Authorization': `Basic ${auth}`,
                                        'Accept': 'application/json'
                                    }
                                }
                            );
                            const teamVerificado = verifyResponse.data.fields[campoTeamId];
                            if (teamVerificado) {
                                log('green', '   ✅', `Team actualizado exitosamente: ${teamVerificado.name || teamVerificado.id}`);
                            } else {
                                log('yellow', '   ⚠', `Team no se configuró (aunque la petición fue exitosa)`);
                            }
                            
                            // Remover el Team de camposAdicionales para no intentarlo de nuevo
                            delete camposAdicionales[campoTeamId];
                        } catch (teamError) {
                            log('yellow', '   ⚠', `Error al actualizar Team: ${teamError.response?.data?.errors?.[campoTeamId] || teamError.message}`);
                        }
                    }
                }
            }
            
            await actualizarIncidencia(config, incidencia.key, camposAdicionales, camposJira, datos);
        }
    }
    
    console.log();
    console.log('='.repeat(60));
    log('green', '✅', `Proceso completado exitosamente - ${datosArray.length} incidencia(s) procesada(s)`);
    console.log('='.repeat(60));
}

// Ejecutar
main().catch(error => {
    log('red', '❌', `Error inesperado: ${error.message}`);
    process.exit(1);
});
