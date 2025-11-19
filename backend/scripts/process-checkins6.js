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

// Funciones auxiliares
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

function corregirDatosHuesped(guestData) {
    console.log('\nDatos originales completos recibidos:', JSON.stringify(guestData, null, 2));
    
    const datos = {...guestData};
    
    if (datos.birthDate) {
        if (datos.birthDate.startsWith('0') && datos.birthDate.length === 10) {
            datos.birthDate = '1' + datos.birthDate.substring(1);
            console.log(`Fecha de nacimiento corregida: ${datos.birthDate}`);
        }
    }
    
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

function validarDatosMinimos(guestData) {
    console.log('Datos completos recibidos para validación:', JSON.stringify(guestData, null, 2));

    const validaciones = {
        nombre: Boolean(guestData.firstName),
        apellido: Boolean(guestData.lastName),
        tipoDocumento: Boolean(guestData.documentType),
        numeroDocumento: Boolean(guestData.documentNumber),
        email: Boolean(guestData.email),
        whatsapp: Boolean(guestData.whatsapp)
    };

    console.log('Estado de validación de campos:', validaciones);

    const tieneNombreCompleto = guestData.firstName || guestData.lastName;
    const tieneDocumento = guestData.documentNumber;
    const tieneContacto = guestData.email || guestData.whatsapp;

    const esValido = tieneDocumento || tieneNombreCompleto || tieneContacto;

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

    return true;
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

async function sendToFileMaker(guestData, frontImagePath, backImagePath, token) {
    try {
        console.log(`Creando registro en FileMaker para ${guestData.firstName || 'N/A'} ${guestData.lastName || 'N/A'}...`);

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
            
            Localidad: guestData.city || '',
            MarcaVehiculo: guestData.carBrand || '',
            Patente: guestData.licensePlate || '',
            
            AcompananteNombre: guestData.adultCompanion?.firstName || '',
            AcompananteApellido: guestData.adultCompanion?.lastName || '',
            AcompananteDNI: guestData.adultCompanion?.dni || '',
            AcompananteWhatsapp: guestData.adultCompanion?.whatsapp || '',
            AcompananteEmail: guestData.adultCompanion?.email || '',
            
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

        if (frontImagePath) {
            console.log(`Subiendo imagen frontal del documento...`);
            await uploadImageToFileMaker(frontImagePath, recordId, 'ImagenDocumentoFrente', token);
        }
        
        if (backImagePath) {
            console.log(`Subiendo imagen trasera del documento...`);
            await uploadImageToFileMaker(backImagePath, recordId, 'ImagenDocumentoDorso', token);
        }

        if (guestData.signature) {
            console.log(`Procesando firma digital...`);
            try {
                const signaturePath = path.join(path.dirname(frontImagePath), `signature_${recordId}.png`);
                const signatureData = guestData.signature.replace(/^data:image\/png;base64,/, '');
                await fs.writeFile(signaturePath, signatureData, 'base64');
                console.log(`Subiendo firma digital...`);
                await uploadImageToFileMaker(signaturePath, recordId, 'FirmaDigital', token);
                await fs.unlink(signaturePath);
            } catch (signatureError) {
                console.error(`Error al procesar la firma digital: ${signatureError.message}`);
            }
        }

        console.log(`Datos e imágenes disponibles subidas exitosamente para el registro ${recordId}`);
        return recordId;
    } catch (error) {
        console.error('Error al enviar datos a FileMaker:');
        if (error.response) {
            console.error(`Status: ${error.response.status}`);
            console.error(`Data: ${JSON.stringify(error.response.data)}`);
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

async function downloadDocumentImage(checkInId, side, tempDir) {
    const imagePath = path.join(tempDir, `${checkInId}_${side}.jpg`);
    const imageKey = `${checkInId}_${side}`;
    
    try {
        console.log(`Intentando descargar imagen ${side} con clave: ${imageKey}`);
        await downloadR2ObjectViaAPI(imageKey, imagePath);
        console.log(`Imagen ${side} descargada exitosamente`);
        return imagePath;
    } catch (error) {
        console.error(`Error al descargar imagen ${side}: ${error.message}`);
        return null;
    }
}

async function deleteR2Files(checkInId, signatureExists) {
    const files = [`${checkInId}_front`, `${checkInId}_back`];
    if (signatureExists) {
        files.push(`${checkInId}_signature`);
    }

    for (const file of files) {
        try {
            await deleteR2ObjectViaAPI(file);
            console.log(`Archivo ${file} eliminado exitosamente`);
        } catch (error) {
            console.error(`Error al eliminar archivo ${file}: ${error.message}`);
        }
    }
}

// Función principal
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

                const datosCorregidos = corregirDatosHuesped(guestData);
                
                if (!validarDatosMinimos(datosCorregidos)) {
                    console.log(`Datos insuficientes para el check-in ${checkInId}, omitiendo.`);
                    continue;
                }

                const frontImagePath = await downloadDocumentImage(checkInId, 'front', tempDir);
                const backImagePath = await downloadDocumentImage(checkInId, 'back', tempDir);

                let signaturePath = null;
                let signatureDownloaded = false;
                try {
                    const signatureKey = `${checkInId}_signature`;
                    console.log(`Intentando descargar firma con clave: ${signatureKey}`);
                    signaturePath = path.join(tempDir, `${checkInId}_signature.png`);
                    await downloadR2ObjectViaAPI(signatureKey, signaturePath);
                    
                    const signatureBuffer = await fs.readFile(signaturePath);
                    datosCorregidos.signature = `data:image/png;base64,${signatureBuffer.toString('base64')}`;
                    signatureDownloaded = true;
                    console.log("Firma descargada exitosamente");
                } catch (signatureError) {
                    console.error(`Error al descargar firma: ${signatureError.message}`);
                }

                await sendToFileMaker(
                    datosCorregidos, 
                    frontImagePath, 
                    backImagePath, 
                    filemakerToken
                );
                
                console.log(`Check-in ${checkInId} transferido exitosamente a FileMaker.`);
                procesadosExitosamente++;

                await deleteCloudflareKVValue(key);
                await deleteR2Files(checkInId, signatureDownloaded);
                
                console.log(`Datos del check-in ${checkInId} eliminados de Cloudflare.`);
            } catch (error) {
                console.error(`Error al procesar check-in: ${error.message}`);
                if (error.stack) {
                    console.error(`Stack: ${error.stack}`);
                }
            }
        }

        await fs.rm(tempDir, { recursive: true, force: true });
        console.log(`Procesamiento de check-ins completado. Procesados exitosamente: ${procesadosExitosamente}/${keys.length}`);
    } catch (error) {
        console.error('Error en el procesamiento de check-ins:', error);
        process.exit(1);
    }
}

// Ejecutar el procesamiento
processCheckins(); 