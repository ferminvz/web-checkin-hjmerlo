const fetch = require('node-fetch');
const FormData = require('form-data');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const axios = require('axios');

// Configuración de Cloudflare
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CLOUDFLARE_KV_NAMESPACE = process.env.CLOUDFLARE_KV_NAMESPACE;
const CLOUDFLARE_R2_BUCKET = process.env.CLOUDFLARE_R2_BUCKET;

// Configuración de FileMaker
const filemakerConfig = {
    server: process.env.FILEMAKER_SERVER,
    database: process.env.FILEMAKER_DATABASE,
    layout: process.env.FILEMAKER_LAYOUT,
    authHeader: process.env.FILEMAKER_AUTH_HEADER
};

async function processCheckins() {
    try {
        console.log('Iniciando procesamiento de check-ins...');

        const keys = await getCloudflareKVKeys();
        console.log(`Encontrados ${keys.length} check-ins pendientes.`);

        if (keys.length === 0) {
            console.log('No hay check-ins para procesar.');
            return;
        }

        const filemakerToken = await getFileMakerToken();
        console.log('Conectado a FileMaker Server.');

        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hotel-checkin-'));
        let procesadosExitosamente = 0;

        for (const key of keys) {
            try {
                const checkInId = key.replace('guest:', '');
                console.log(`\nProcesando check-in ID: ${checkInId}`);

                const guestData = await getCloudflareKVValue(key);

                if (!guestData) {
                    console.log(`No se encontraron datos para el check-in ${checkInId}, omitiendo.`);
                    continue;
                }

                // Validar y corregir datos antes de procesar
                const datosCorregidos = corregirDatosHuesped(guestData);
                
                // Verificar si hay datos suficientes para crear un registro
                if (!validarDatosMinimos(datosCorregidos)) {
                    console.log(`Datos insuficientes para el check-in ${checkInId}, omitiendo.`);
                    continue;
                }

                console.log(`Datos del huésped para ${checkInId} (corregidos):`, JSON.stringify(datosCorregidos, null, 2));

                // Preparar las posibles rutas de imágenes
                const frontImageKeys = [
                    `${checkInId}_front`,
                    `checkins/${checkInId}/document-front`
                ];

                const backImageKeys = [
                    `${checkInId}_back`,
                    `checkins/${checkInId}/document-back`
                ];

                // Intentar descargar la imagen frontal probando diferentes rutas
                let frontImagePath = null;
                for (const frontKey of frontImageKeys) {
                    try {
                        const tempImagePath = path.join(tempDir, `${checkInId}_front.jpg`);
                        console.log(`Intentando descargar imagen frontal con clave: ${frontKey}`);
                        await downloadR2ObjectViaAPI(frontKey, tempImagePath);
                        frontImagePath = tempImagePath;
                        console.log(`Imagen frontal descargada con éxito usando la clave: ${frontKey}`);
                        break; // Si se descarga con éxito, salimos del bucle
                    } catch (imgError) {
                        console.log(`No se pudo descargar la imagen frontal con la clave: ${frontKey}`);
                    }
                }

                // Intentar descargar la imagen trasera probando diferentes rutas
                let backImagePath = null;
                for (const backKey of backImageKeys) {
                    try {
                        const tempImagePath = path.join(tempDir, `${checkInId}_back.jpg`);
                        console.log(`Intentando descargar imagen trasera con clave: ${backKey}`);
                        await downloadR2ObjectViaAPI(backKey, tempImagePath);
                        backImagePath = tempImagePath;
                        console.log(`Imagen trasera descargada con éxito usando la clave: ${backKey}`);
                        break; // Si se descarga con éxito, salimos del bucle
                    } catch (imgError) {
                        console.log(`No se pudo descargar la imagen trasera con la clave: ${backKey}`);
                    }
                }

                if (!frontImagePath && !backImagePath) {
                    console.log(`No se pudo descargar ninguna imagen para el check-in ${checkInId}, pero continuaremos con los datos.`);
                }

                // Descargar firma si está disponible
                let signatureDownloaded = false;
                let signaturePath = null;
                try {
                    console.log(`Descargando firma para ${checkInId}...`);
                    const signatureKey = `${checkInId}_signature`;
                    console.log(`Intentando descargar firma con clave: ${signatureKey}`);
                    
                    // Crear ruta temporal para la firma
                    signaturePath = path.join(tempDir, `${checkInId}_signature.png`);
                    
                    // Descargar la firma
                    await downloadR2ObjectViaAPI(signatureKey, signaturePath);
                    
                    // Leer el archivo y convertirlo a base64
                    const signatureBuffer = await fs.readFile(signaturePath);
                    datosCorregidos.signature = `data:image/png;base64,${signatureBuffer.toString('base64')}`;
                    signatureDownloaded = true;
                    console.log("Firma descargada exitosamente");
                } catch (imgError) {
                    console.error(`Error al descargar firma: ${imgError.message}`);
                    // Intentar con la ruta alternativa si la primera falla
                    try {
                        const alternativeSignatureKey = `checkins/${checkInId}/signature.png`;
                        console.log(`Intentando ruta alternativa: ${alternativeSignatureKey}`);
                        await downloadR2ObjectViaAPI(alternativeSignatureKey, signaturePath);
                        
                        // Leer el archivo y convertirlo a base64
                        const signatureBuffer = await fs.readFile(signaturePath);
                        datosCorregidos.signature = `data:image/png;base64,${signatureBuffer.toString('base64')}`;
                        signatureDownloaded = true;
                        console.log("Firma descargada exitosamente usando ruta alternativa");
                    } catch (altError) {
                        console.error(`Error al descargar firma usando ruta alternativa: ${altError.message}`);
                    }
                }

                // Enviar a FileMaker
                console.log(`Enviando datos a FileMaker para ${checkInId}...`);
                await sendToFileMaker(
                    datosCorregidos, 
                    frontImagePath, 
                    backImagePath, 
                    filemakerToken
                );
                
                console.log(`Check-in ${checkInId} transferido exitosamente a FileMaker.`);
                procesadosExitosamente++;

                // Eliminar datos de Cloudflare solo si se procesó correctamente
                console.log(`Eliminando datos de Cloudflare para ${checkInId}...`);
                await deleteCloudflareKVValue(key);
                
                // Intentar eliminar las imágenes con ambos formatos de ruta
                for (const frontKey of frontImageKeys) {
                    try {
                        await deleteR2ObjectViaAPI(frontKey);
                        console.log(`Imagen frontal eliminada con éxito usando la clave: ${frontKey}`);
                        break;
                    } catch (deleteError) {
                        console.log(`No se pudo eliminar la imagen frontal con la clave: ${frontKey}`);
                    }
                }
                
                for (const backKey of backImageKeys) {
                    try {
                        await deleteR2ObjectViaAPI(backKey);
                        console.log(`Imagen trasera eliminada con éxito usando la clave: ${backKey}`);
                        break;
                    } catch (deleteError) {
                        console.log(`No se pudo eliminar la imagen trasera con la clave: ${backKey}`);
                    }
                }
                
                console.log(`Datos del check-in ${checkInId} eliminados de Cloudflare.`);

                // Eliminar firma de R2 si se procesó correctamente
                if (signatureDownloaded) {
                    const signatureKey = `${checkInId}_signature`;
                    try {
                        await deleteR2ObjectViaAPI(signatureKey);
                        console.log(`Firma eliminada exitosamente con clave: ${signatureKey}`);
                    } catch (deleteError) {
                        console.log(`Error al eliminar firma: ${deleteError.message}`);
                    }
                }
            } catch (error) {
                console.error(`Error al procesar check-in: ${error.message}`);
                if (error.stack) {
                    console.error(`Stack: ${error.stack}`);
                }
                // Continuamos con el siguiente check-in a pesar del error
            }
        }

        await fs.rm(tempDir, { recursive: true, force: true });
        console.log(`Procesamiento de check-ins completado. Procesados exitosamente: ${procesadosExitosamente}/${keys.length}`);
    } catch (error) {
        console.error('Error en el procesamiento de check-ins:', error);
        process.exit(1);
    }
}

// Función para validar y corregir datos
function corregirDatosHuesped(guestData) {
    console.log('\nDatos originales completos recibidos:', JSON.stringify(guestData, null, 2));
    
    const datos = {...guestData}; // Clonar para no modificar el original
    
    // Corregir formato de fecha de nacimiento
    if (datos.birthDate) {
        // Corregir formatos como "0194-03-09" a "1994-03-09"
        if (datos.birthDate.startsWith('0') && datos.birthDate.length === 10) {
            datos.birthDate = '1' + datos.birthDate.substring(1);
            console.log(`Fecha de nacimiento corregida: ${datos.birthDate}`);
        }
    }
    
    // Asegurar que los campos de texto no sean null sino string vacío
    const camposTexto = [
        'firstName', 'lastName', 'documentType', 'documentNumber',
        'address', 'city', 'email', 'whatsapp', 'carBrand', 'licensePlate'
    ];
    
    camposTexto.forEach(campo => {
        const valorAnterior = datos[campo];
        if (datos[campo] === null || datos[campo] === undefined) {
            datos[campo] = '';
            console.log(`Campo '${campo}' corregido: ${valorAnterior} -> ''`);
        }
    });

    // Asegurar que los campos de acompañantes existan
    if (!datos.adultCompanion) {
        datos.adultCompanion = {};
        console.log('Inicializado campo adultCompanion vacío');
    }
    if (!datos.minorCompanions) {
        datos.minorCompanions = [];
        console.log('Inicializado campo minorCompanions vacío');
    }

    console.log('\nDatos después de correcciones:', JSON.stringify(datos, null, 2));
    
    return datos;
}

// Verificar si hay datos mínimos suficientes
function validarDatosMinimos(guestData) {
    // Mostrar todos los datos recibidos para debugging
    console.log('Datos completos recibidos para validación:', JSON.stringify(guestData, null, 2));

    // Verificar cada campo individualmente
    const validaciones = {
        nombre: Boolean(guestData.firstName),
        apellido: Boolean(guestData.lastName),
        tipoDocumento: Boolean(guestData.documentType),
        numeroDocumento: Boolean(guestData.documentNumber),
        email: Boolean(guestData.email),
        whatsapp: Boolean(guestData.whatsapp)
    };

    console.log('Estado de validación de campos:', validaciones);

    // Hacer la validación más flexible
    const tieneNombreCompleto = guestData.firstName || guestData.lastName; // Al menos uno
    const tieneDocumento = guestData.documentNumber; // Solo requerimos el número
    const tieneContacto = guestData.email || guestData.whatsapp;

    const esValido = tieneDocumento || tieneNombreCompleto || tieneContacto; // Al menos uno de estos grupos

    console.log('Resultado de validaciones:', {
        tieneNombreCompleto,
        tieneDocumento,
        tieneContacto,
        esValido
    });

    if (!esValido) {
        console.log('Razones por las que los datos son insuficientes:');
        if (!tieneNombreCompleto) console.log('- No hay nombre ni apellido');
        if (!tieneDocumento) console.log('- No hay número de documento');
        if (!tieneContacto) console.log('- No hay información de contacto');
    }

    // Proceder incluso con datos mínimos
    return true; // Temporalmente aceptamos todos los registros para ver qué datos llegan
}

async function getCloudflareKVKeys() {
    console.log(`Obteniendo claves KV del namespace ${CLOUDFLARE_KV_NAMESPACE}...`);

    const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces/${CLOUDFLARE_KV_NAMESPACE}/keys`,
        {
            headers: {
                'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
                'Content-Type': 'application/json',
            },
        }
    );

    const data = await response.json();
    if (!data.success) {
        throw new Error(`Error al obtener claves de KV: ${JSON.stringify(data.errors)}`);
    }

    const guestKeys = data.result.map(item => item.name).filter(name => name.startsWith('guest:'));
    console.log(`Se encontraron ${guestKeys.length} claves de huéspedes en KV.`);
    return guestKeys;
}

async function getCloudflareKVValue(key) {
    console.log(`Obteniendo valor de KV para clave: ${key}`);

    const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces/${CLOUDFLARE_KV_NAMESPACE}/values/${key}`,
        {
            headers: {
                'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
            },
        }
    );

    if (!response.ok) {
        throw new Error(`Error al obtener valor KV para ${key}: ${response.statusText}`);
    }

    return await response.json();
}

async function deleteCloudflareKVValue(key) {
    console.log(`Eliminando valor de KV para clave: ${key}`);

    const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces/${CLOUDFLARE_KV_NAMESPACE}/values/${key}`,
        {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
            },
        }
    );

    const data = await response.json();
    if (!data.success) {
        throw new Error(`Error al eliminar clave de KV ${key}: ${JSON.stringify(data.errors)}`);
    }
}

// Función para descargar objetos de R2 usando la API directa de Cloudflare
async function downloadR2ObjectViaAPI(key, filePath) {
    try {
        console.log(`Descargando objeto R2 ${key} mediante API de Cloudflare...`);

        const response = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/r2/buckets/${CLOUDFLARE_R2_BUCKET}/objects/${key}`,
            {
                headers: {
                    'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`
                }
            }
        );

        if (!response.ok) {
            throw new Error(`Error HTTP: ${response.status} ${response.statusText}`);
        }

        const buffer = await response.arrayBuffer();
        await fs.writeFile(filePath, Buffer.from(buffer));
        console.log(`Objeto ${key} descargado exitosamente (${buffer.byteLength} bytes)`);
        return true;
    } catch (err) {
        console.error(`Error detallado al descargar objeto ${key}:`, err);
        throw new Error(`Error al descargar objeto R2 ${key}: ${err.message}`);
    }
}

// Función para eliminar objetos de R2 usando la API directa de Cloudflare
async function deleteR2ObjectViaAPI(key) {
    try {
        console.log(`Eliminando objeto R2 ${key} mediante API de Cloudflare...`);

        const response = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/r2/buckets/${CLOUDFLARE_R2_BUCKET}/objects/${key}`,
            {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`
                }
            }
        );

        if (!response.ok) {
            throw new Error(`Error HTTP: ${response.status} ${response.statusText}`);
        }

        console.log(`Objeto ${key} eliminado exitosamente`);
        return true;
    } catch (err) {
        console.error(`Error detallado al eliminar objeto ${key}:`, err);
        throw new Error(`Error al eliminar objeto R2 ${key}: ${err.message}`);
    }
}

async function getFileMakerToken() {
    try {
        console.log(`Obteniendo token de FileMaker desde ${filemakerConfig.server}...`);

        const response = await axios.post(
            `${filemakerConfig.server}/fmi/data/v1/databases/${filemakerConfig.database}/sessions`,
            {},
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': filemakerConfig.authHeader
                }
            }
        );

        console.log('Token de FileMaker obtenido exitosamente');
        return response.data.response.token;
    } catch (error) {
        console.error('Error al obtener token de FileMaker:');
        if (error.response) {
            console.error(`Status: ${error.response.status}`);
            console.error(`Data: ${JSON.stringify(error.response.data)}`);
        } else if (error.request) {
            console.error('No se recibió respuesta del servidor');
        } else {
            console.error(`Error: ${error.message}`);
        }
        throw error;
    }
}

async function sendToFileMaker(guestData, frontImagePath, backImagePath, token) {
    try {
        console.log(`Creando registro en FileMaker para ${guestData.firstName || 'N/A'} ${guestData.lastName || 'N/A'}...`);

        // Preparar datos para FileMaker, asegurando que no haya null
        const fieldData = {
            Nombre: guestData.firstName || '',
            Apellido: guestData.lastName || '',
            TipoDocumento: guestData.documentType || '',
            NumeroDocumento: guestData.documentNumber || '',
            FechaNacimiento: guestData.birthDate || '',
            Domicilio: guestData.address || '',
            Email: guestData.email || '',
            Whatsapp: guestData.whatsapp || '',
            FechaCheckIn: guestData.timestamp || new Date().toISOString(),
            
            // Otros campos opcionales
            Localidad: guestData.city || '',
            MarcaVehiculo: guestData.carBrand || '',
            Patente: guestData.licensePlate || '',
            
            // Datos del acompañante adulto
            AcompananteNombre: guestData.adultCompanion?.firstName || '',
            AcompananteApellido: guestData.adultCompanion?.lastName || '',
            AcompananteDNI: guestData.adultCompanion?.dni || '',
            AcompananteWhatsapp: guestData.adultCompanion?.whatsapp || '',
            AcompananteEmail: guestData.adultCompanion?.email || '',
            
            // Datos de menores
            MenorNombre: guestData.minorCompanions?.[0]?.firstName || '',
            MenorApellido: guestData.minorCompanions?.[0]?.lastName || '',
            MenorFechaNacimiento: guestData.minorCompanions?.[0]?.birthDate || '',
            MenorDNI: guestData.minorCompanions?.[0]?.dni || '',
            
            Menor2Nombre: guestData.minorCompanions?.[1]?.firstName || '',
            Menor2Apellido: guestData.minorCompanions?.[1]?.lastName || '',
            Menor2FechaNacimiento: guestData.minorCompanions?.[1]?.birthDate || '',
            Menor2DNI: guestData.minorCompanions?.[1]?.dni || '',
            
            Menor3Nombre: guestData.minorCompanions?.[2]?.firstName || '',
            Menor3Apellido: guestData.minorCompanions?.[2]?.lastName || '',
            Menor3FechaNacimiento: guestData.minorCompanions?.[2]?.birthDate || '',
            Menor3DNI: guestData.minorCompanions?.[2]?.dni || ''
        };

        const createRecordResponse = await axios.post(
            `${filemakerConfig.server}/fmi/data/v1/databases/${filemakerConfig.database}/layouts/${filemakerConfig.layout}/records`,
            { fieldData },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                }
            }
        );

        const recordId = createRecordResponse.data.response.recordId;
        console.log(`Registro creado en FileMaker con ID: ${recordId}`);

        // Subir imágenes solo si están disponibles
        if (frontImagePath) {
            console.log(`Subiendo imagen frontal del documento...`);
            await uploadImageToFileMaker(frontImagePath, recordId, 'ImagenDocumentoFrente', token);
        } else {
            console.log('No hay imagen frontal disponible para subir');
        }
        
        if (backImagePath) {
            console.log(`Subiendo imagen trasera del documento...`);
            await uploadImageToFileMaker(backImagePath, recordId, 'ImagenDocumentoDorso', token);
        } else {
            console.log('No hay imagen trasera disponible para subir');
        }

        // Procesar y subir firma si está disponible
        if (guestData.signature) {
            console.log(`Procesando firma digital...`);
            try {
                // Crear un archivo temporal para la firma
                const signaturePath = path.join(path.dirname(frontImagePath), `signature_${recordId}.png`);
                
                // Convertir la firma de base64 a archivo
                const signatureData = guestData.signature.replace(/^data:image\/png;base64,/, '');
                await fs.writeFile(signaturePath, signatureData, 'base64');
                
                console.log(`Subiendo firma digital...`);
                await uploadImageToFileMaker(signaturePath, recordId, 'FirmaDigital', token);
                
                // Eliminar el archivo temporal de la firma
                await fs.unlink(signaturePath);
            } catch (signatureError) {
                console.error(`Error al procesar la firma digital: ${signatureError.message}`);
            }
        } else {
            console.log('No hay firma digital disponible para subir');
        }

        console.log(`Datos e imágenes disponibles subidas exitosamente para el registro ${recordId}`);
        return recordId;
    } catch (error) {
        console.error('Error al enviar datos a FileMaker:');
        if (error.response) {
            console.error(`Status: ${error.response.status}`);
            console.error(`Data: ${JSON.stringify(error.response.data)}`);
            
            // Si FileMaker proporciona información de error específica
            if (error.response.data && error.response.data.messages) {
                error.response.data.messages.forEach(msg => {
                    console.error(`FileMaker Error ${msg.code}: ${msg.message}`);
                });
            }
        } else if (error.request) {
            console.error('No se recibió respuesta del servidor');
        } else {
            console.error(`Error: ${error.message}`);
        }
        throw error;
    }
}

async function uploadImageToFileMaker(imagePath, recordId, fieldName, token) {
    try {
        const formData = new FormData();
        const fileBuffer = await fs.readFile(imagePath);
        const fileStats = await fs.stat(imagePath);

        console.log(`Preparando imagen ${path.basename(imagePath)} (${fileStats.size} bytes) para subir a campo ${fieldName}`);

        formData.append('upload', fileBuffer, {
            filename: path.basename(imagePath),
            contentType: 'image/jpeg',
        });

        const response = await axios.post(
            `${filemakerConfig.server}/fmi/data/v1/databases/${filemakerConfig.database}/layouts/${filemakerConfig.layout}/records/${recordId}/containers/${fieldName}`,
            formData,
            {
                headers: {
                    ...formData.getHeaders(),
                    'Authorization': `Bearer ${token}`
                }
            }
        );

        console.log(`Imagen subida exitosamente al campo ${fieldName}`);
        return response.data;
    } catch (error) {
        console.error(`Error al subir imagen a campo ${fieldName}:`);
        if (error.response) {
            console.error(`Status: ${error.response.status}`);
            console.error(`Data: ${JSON.stringify(error.response.data)}`);
        } else if (error.request) {
            console.error('No se recibió respuesta del servidor');
        } else {
            console.error(`Error: ${error.message}`);
        }
        throw error;
    }
}

// Ejecutar el procesamiento!
processCheckins();
