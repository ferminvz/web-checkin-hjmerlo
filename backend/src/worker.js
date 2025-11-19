export default {
    async fetch(request, env, ctx) {
        // Configuración CORS
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        };

        // Verificar disponibilidad de R2
        console.log("R2 bucket disponible:", !!env.CHECKIN_IMAGES);

        // Manejar solicitudes OPTIONS para CORS
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                headers: corsHeaders,
            });
        }

        // Solo permitir solicitudes POST
        if (request.method !== 'POST') {
            return new Response('Método no permitido', {
                status: 405,
                headers: {
                    'Content-Type': 'text/plain',
                    ...corsHeaders
                }
            });
        }

        try {
            // Procesar los datos del formulario (multipart/form-data)
            const formData = await request.formData();
            
            // Log de todas las entradas del FormData
            console.log("Entradas del FormData:");
            for (let [key, value] of formData.entries()) {
                console.log(`${key}: ${value instanceof File ? `File (${value.size} bytes)` : value}`);
            }
            
            // Extraer el JSON de los datos
            const jsonDataString = formData.get("data");
            
            if (!jsonDataString) {
                return new Response(
                    JSON.stringify({
                        success: false,
                        message: "No se encontraron datos en el campo 'data'",
                    }),
                    {
                        status: 400,
                        headers: {
                            "Content-Type": "application/json",
                            ...corsHeaders,
                        },
                    }
                );
            }
            
            // Convertir la cadena JSON a un objeto
            const jsonData = JSON.parse(jsonDataString);
            
            // Extraer los datos del objeto JSON
            const {
                documentType,
                firstName,
                lastName,
                documentNumber,
                birthDate,
                address,
                city,
                email,
                whatsapp,
                carBrand,
                licensePlate,
                adultCompanion,
                minorCompanions,
                timestamp
            } = jsonData;
            
            // Crear un objeto con todos los datos del huésped
            const guestData = {
                documentType,
                firstName,
                lastName,
                documentNumber,
                birthDate,
                address,
                city,
                email,
                whatsapp,
                carBrand,
                licensePlate,
                adultCompanion: adultCompanion || null,
                minorCompanions: minorCompanions || [],
                timestamp: timestamp || new Date().toISOString(),
            };
            
            // Generar un ID único para este check-in
            const checkInId = crypto.randomUUID();
            
            // Guardar los datos en Cloudflare KV
            await env.CHECKIN_DATA.put(`guest:${checkInId}`, JSON.stringify(guestData));
            
            // Guardar las imágenes en Cloudflare R2 (si está disponible)
            if (env.CHECKIN_IMAGES) {
                // Procesar documentos
                const documentFront = formData.get("documentFront");
                if (documentFront) {
                    const frontBuffer = await documentFront.arrayBuffer();
                    await env.CHECKIN_IMAGES.put(`${checkInId}_front`, frontBuffer, {
                        httpMetadata: {
                            contentType: documentFront.type,
                        },
                    });
                    console.log("Documento frontal guardado en R2");
                }
                
                const documentBack = formData.get("documentBack");
                if (documentBack) {
                    const backBuffer = await documentBack.arrayBuffer();
                    await env.CHECKIN_IMAGES.put(`${checkInId}_back`, backBuffer, {
                        httpMetadata: {
                            contentType: documentBack.type,
                        },
                    });
                    console.log("Documento posterior guardado en R2");
                }
                
                // Procesar firma con mejor manejo de errores
                const signature = formData.get("signature");
                console.log("Tipo de firma recibida:", signature ? signature.constructor.name : 'no signature');
                if (signature) {
                    try {
                        console.log("Procesando firma...");
                        const signatureBuffer = await signature.arrayBuffer();
                        console.log("Tamaño del buffer de firma:", signatureBuffer.byteLength);
                        
                        // Corregir la ruta de almacenamiento de la firma
                        const signatureKey = `${checkInId}_signature`;
                        console.log("Guardando firma con clave:", signatureKey);
                        
                        await env.CHECKIN_IMAGES.put(signatureKey, signatureBuffer, {
                            httpMetadata: {
                                contentType: 'image/png',
                            },
                        });
                        console.log("Firma guardada en R2 exitosamente con clave:", signatureKey);
                    } catch (error) {
                        console.error("Error detallado al guardar la firma:", {
                            message: error.message,
                            stack: error.stack,
                            name: error.name
                        });
                    }
                } else {
                    console.log("No se recibió firma en el FormData");
                }
            }
            
            // Disparar un evento programado para procesar estos datos
            if (env.CHECKIN_QUEUE) {
                await env.CHECKIN_QUEUE.send({
                    checkInId,
                    processTime: new Date().toISOString(),
                });
            }
            
            // Retornar una respuesta exitosa
            return new Response(
                JSON.stringify({
                    success: true,
                    message: "Check-in completado exitosamente",
                    checkInId,
                }),
                {
                    headers: {
                        "Content-Type": "application/json",
                        ...corsHeaders
                    },
                }
            );
        } catch (error) {
            console.error("Error detallado en el procesamiento:", {
                message: error.message,
                stack: error.stack,
                name: error.name
            });
            
            return new Response(
                JSON.stringify({
                    success: false,
                    message: "Error al procesar el check-in",
                    error: error.message,
                    details: error.stack
                }),
                {
                    status: 500,
                    headers: {
                        "Content-Type": "application/json",
                        ...corsHeaders,
                    },
                }
            );
        }
    }
};

// Función auxiliar para obtener extensión de archivo
function getFileExtension(filename) {
    return filename.split('.').pop().toLowerCase();
}

// Función auxiliar para convertir base64 a Blob
async function base64ToBlob(base64Data) {
    const base64Response = await fetch(base64Data);
    return base64Response.blob();
}
