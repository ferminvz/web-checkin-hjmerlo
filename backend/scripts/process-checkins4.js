async function processCheckins() {
    try {
        console.log('Iniciando procesamiento de check-ins...');
        
        // Obtener todas las claves de check-ins
        const keys = await getKVKeys();
        console.log(`Se encontraron ${keys.length} claves de huéspedes en KV.`);
        
        // Filtrar solo las claves que comienzan con guest:
        const guestKeys = keys.filter(key => key.startsWith('guest:'));
        console.log(`Encontrados ${guestKeys.length} check-ins pendientes.`);
        
        // Obtener token de FileMaker
        const token = await getFileMakerToken();
        console.log('Token de FileMaker obtenido exitosamente');
        console.log('Conectado a FileMaker Server.');
        
        let processedCount = 0;
        
        // Procesar cada check-in
        for (const key of guestKeys) {
            try {
                const checkInId = key.replace('guest:', '');
                console.log(`Procesando check-in ID: ${checkInId}`);
                
                // Obtener datos del check-in
                const guestData = await getKVValue(checkInId);
                if (!guestData) {
                    console.log(`No se encontraron datos para el check-in ${checkInId}, omitiendo.`);
                    continue;
                }

                // ... existing code ...
            } catch (error) {
                console.error(`Error al procesar el check-in ${checkInId}:`, error);
            }
        }

        console.log(`Procesados ${processedCount} check-ins.`);
    } catch (error) {
        console.error('Error al procesar los check-ins:', error);
    }
}

async function getKVValue(key) {
    try {
        const response = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces/${process.env.CLOUDFLARE_KV_NAMESPACE}/values/${key}`,
            {
                headers: {
                    'Authorization': `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`
                }
            }
        );

        if (!response.ok) {
            if (response.status === 404) {
                return null;
            }
            throw new Error(`Error al obtener valor de KV: ${response.status}`);
        }

        const data = await response.json();
        return data.result;
    } catch (error) {
        console.error('Error al obtener valor de KV:', error);
        return null;
    }
}

async function getKVKeys() {
    try {
        const response = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces/${process.env.CLOUDFLARE_KV_NAMESPACE}/keys`,
            {
                headers: {
                    'Authorization': `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`
                }
            }
        );

        if (!response.ok) {
            throw new Error(`Error al obtener claves de KV: ${response.status}`);
        }

        const data = await response.json();
        return data.result.map(key => key.name);
    } catch (error) {
        console.error('Error al obtener claves de KV:', error);
        return [];
    }
} 