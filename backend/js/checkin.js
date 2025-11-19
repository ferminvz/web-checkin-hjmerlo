/**
 * Web Check-in Hotel - Funcionalidad JavaScript
 * 
 * Este archivo contiene todas las funciones para el proceso de web check-in,
 * incluyendo la lectura automática de documentos mediante PDF417 y OCR.
 */

document.addEventListener('DOMContentLoaded', function() {
    // Inicializar event listeners
    initEventListeners();
});

/**
 * Inicializa todos los event listeners de la aplicación
 */
function initEventListeners() {
    // Esperar a que el DOM esté completamente cargado
    console.log("Inicializando event listeners...");
    
    // Evento para mostrar vista previa de frente del documento
    const documentFrontInput = document.getElementById('documentFront');
    if (documentFrontInput) {
        documentFrontInput.addEventListener('change', handleDocumentFrontChange);
        console.log("Event listener para documentFront registrado");
    } else {
        console.error("No se encontró el elemento documentFront");
    }
    
    // Evento para mostrar vista previa de dorso del documento
    const documentBackInput = document.getElementById('documentBack');
    if (documentBackInput) {
        documentBackInput.addEventListener('change', handleDocumentBackChange);
        console.log("Event listener para documentBack registrado");
    } else {
        console.error("No se encontró el elemento documentBack");
    }
    
    // Evento para cambio de tipo de documento
    const documentTypeSelect = document.getElementById('documentType');
    if (documentTypeSelect) {
        documentTypeSelect.addEventListener('change', handleDocumentTypeChange);
        console.log("Event listener para documentType registrado");
    } else {
        console.error("No se encontró el elemento documentType");
    }
    
    // Manejo del formulario
    const checkInForm = document.getElementById('checkInForm');
    if (checkInForm) {
        checkInForm.addEventListener('submit', handleFormSubmit);
        console.log("Event listener para checkInForm registrado");
    } else {
        console.error("No se encontró el elemento checkInForm");
    }
    
    console.log("Inicialización de event listeners completada");
}

/**
 * Maneja el cambio de tipo de documento
 */
function handleDocumentTypeChange() {
    const pdfNotice = document.querySelector('.border-dashed p.text-xs');
    if (this.value === 'dni') {
        pdfNotice.classList.remove('hidden');
    } else {
        pdfNotice.classList.add('hidden');
    }
}

/**
 * Maneja el cambio del archivo del frente del documento
 */
function handleDocumentFrontChange(e) {
    const file = e.target.files[0];
    if (file) {
        document.getElementById('frontFileName').textContent = file.name;
        
        const reader = new FileReader();
        reader.onload = function(e) {
            const preview = document.getElementById('frontPreview');
            preview.innerHTML = '';
            
            const img = new Image();
            img.className = 'max-h-full max-w-full object-contain';
            
            // Configurar el evento onload antes de asignar la src
            img.onload = function() {
                console.log("Imagen cargada correctamente, dimensiones:", img.width, "x", img.height);
                
                // Verificar si el tipo de documento es DNI para intentar leer el PDF417
                const documentType = document.getElementById('documentType').value;
                if (documentType === 'dni') {
                    // Crear un div de estado para mostrar el proceso
                    const statusDiv = document.createElement('div');
                    statusDiv.className = 'mt-2 text-sm text-blue-600';
                    statusDiv.textContent = 'Analizando documento...';
                    preview.appendChild(statusDiv);
                    
                    // Esperar un momento para asegurar que la imagen está completamente renderizada
                    setTimeout(async () => {
                        try {
                            // Primer intento: PDF417
                            let success = await decodePDF417(img);
                            
                            // Si falló el PDF417, intentar con OCR como respaldo
                            if (!success) {
                                statusDiv.textContent = 'Intentando con OCR...';
                                success = await tryOCR(img);
                            }
                            
                            if (success) {
                                statusDiv.className = 'mt-2 text-sm text-green-600';
                                statusDiv.textContent = 'Documento leído correctamente';
                            } else {
                                statusDiv.className = 'mt-2 text-sm text-yellow-600';
                                statusDiv.textContent = 'No se pudo leer automáticamente. Por favor complete manualmente.';
                            }
                        } catch (error) {
                            console.error("Error al procesar imagen:", error);
                            statusDiv.className = 'mt-2 text-sm text-red-600';
                            statusDiv.textContent = 'Error al procesar el documento';
                        }
                    }, 500);
                }
            };
            
            img.onerror = function() {
                console.error("Error al cargar la imagen");
                preview.innerHTML = '<span class="text-red-500">Error al cargar la imagen</span>';
            };
            
            // Añadir la imagen al preview primero
            preview.appendChild(img);
            
            // Asignar la src después de configurar los eventos y añadir al DOM
            img.src = e.target.result;
        };
        
        reader.onerror = function(error) {
            console.error("Error al leer el archivo:", error);
            document.getElementById('frontPreview').innerHTML = '<span class="text-red-500">Error al leer el archivo</span>';
        };
        
        // Iniciar la lectura del archivo
        reader.readAsDataURL(file);
    }
}

/**
 * Maneja el cambio del archivo del dorso del documento
 */
function handleDocumentBackChange(e) {
    const file = e.target.files[0];
    if (file) {
        document.getElementById('backFileName').textContent = file.name;
        
        const reader = new FileReader();
        reader.onload = function(e) {
            const preview = document.getElementById('backPreview');
            preview.innerHTML = '';
            
            const img = new Image();
            img.className = 'max-h-full max-w-full object-contain';
            
            // Configurar el evento onload antes de asignar la src
            img.onload = function() {
                console.log("Imagen dorso cargada correctamente");
            };
            
            img.onerror = function() {
                console.error("Error al cargar la imagen del dorso");
                preview.innerHTML = '<span class="text-red-500">Error al cargar la imagen</span>';
            };
            
            // Añadir la imagen al preview
            preview.appendChild(img);
            
            // Asignar la src después de configurar los eventos
            img.src = e.target.result;
        };
        
        reader.onerror = function(error) {
            console.error("Error al leer el archivo del dorso:", error);
            document.getElementById('backPreview').innerHTML = '<span class="text-red-500">Error al leer el archivo</span>';
        };
        
        // Iniciar la lectura del archivo
        reader.readAsDataURL(file);
    }
}

/**
 * Maneja el envío del formulario
 */
function handleFormSubmit(e) {
    e.preventDefault();

    // Mostrar indicador de carga
    document.getElementById('loadingIndicator').classList.remove('hidden');

    // Crear un objeto FormData con los datos del formulario
    const formData = new FormData(this);

    // Enviar datos al Worker de Cloudflare
    fetch('https://round-term-80a4.fvazquez-2f3.workers.dev', {
        method: 'POST',
        body: formData
    })
        .then(response => response.json())
        .then(data => {
            document.getElementById('loadingIndicator').classList.add('hidden');

            if (data.success) {
                document.getElementById('successMessage').classList.remove('hidden');
                document.getElementById('checkInForm').reset();

                // Limpiar vistas previas
                document.getElementById('frontPreview').innerHTML = '<span class="text-gray-500">Vista previa del frente</span>';
                document.getElementById('backPreview').innerHTML = '<span class="text-gray-500">Vista previa del dorso</span>';
                document.getElementById('frontFileName').textContent = 'Ningún archivo seleccionado';
                document.getElementById('backFileName').textContent = 'Ningún archivo seleccionado';
                
                // Desplazarse al mensaje de éxito
                document.getElementById('successMessage').scrollIntoView({ behavior: 'smooth' });
            } else {
                alert('Error: ' + (data.message || 'No se pudo completar el check-in'));
            }
        })
        .catch(error => {
            console.error('Error:', error);
            document.getElementById('loadingIndicator').classList.add('hidden');
            alert('Error al procesar el check-in. Por favor, intente nuevamente.');
        });
}

/**
 * Función para mostrar notificaciones mejoradas
 */
function showNotification(message, type = 'info') {
    // Eliminar notificaciones previas
    const existingNotifications = document.querySelectorAll('.notification-toast');
    existingNotifications.forEach(notif => notif.remove());
    
    // Crear elemento de notificación
    const notification = document.createElement('div');
    notification.className = 'notification-toast fixed top-4 right-4 px-4 py-2 rounded shadow-lg z-50 transition-opacity duration-500';
    
    // Configurar estilo según el tipo
    switch (type) {
        case 'success':
            notification.classList.add('bg-green-500', 'text-white');
            break;
        case 'error':
            notification.classList.add('bg-red-500', 'text-white');
            break;
        case 'warning':
            notification.classList.add('bg-yellow-500', 'text-white');
            break;
        case 'info':
        default:
            notification.classList.add('bg-blue-500', 'text-white');
            break;
    }
    
    notification.textContent = message;
    document.body.appendChild(notification);
    
    // Eliminar notificación después de 3 segundos
    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => notification.remove(), 500);
    }, 3000);
}

/**
 * Función para rellenar el formulario con los datos extraídos
 */
function populateFormWithData(data) {
    console.log("Rellenando formulario con datos:", data);
    
    // Verificar que tenemos datos válidos antes de rellenar
    if (!data || (!data.nombre && !data.apellido && !data.numeroDocumento)) {
        console.warn("Datos incompletos, no se pudo rellenar el formulario automáticamente");
        return;
    }
    
    // Rellenar campos básicos
    if (data.nombre) document.getElementById('firstName').value = data.nombre.trim();
    if (data.apellido) document.getElementById('lastName').value = data.apellido.trim();
    if (data.numeroDocumento) document.getElementById('documentNumber').value = data.numeroDocumento.trim();
    
    // Si tenemos dirección
    if (data.domicilio) document.getElementById('address').value = data.domicilio.trim();
    
    // Convertir la fecha al formato requerido por el input date
    if (data.fechaNacimiento) {
        try {
            // Detectar el formato de la fecha
            let parts;
            if (data.fechaNacimiento.includes('/')) {
                // Formato DD/MM/YYYY
                parts = data.fechaNacimiento.split('/');
            } else if (data.fechaNacimiento.includes('-')) {
                // Formato DD-MM-YYYY
                parts = data.fechaNacimiento.split('-');
            } else {
                // Intentar extraer números
                const matches = data.fechaNacimiento.match(/(\d{1,2})[^\d](\d{1,2})[^\d](\d{4})/);
                if (matches) {
                    parts = [matches[1], matches[2], matches[3]];
                }
            }
            
            if (parts && parts.length === 3) {
                // Verificar que es una fecha válida
                if (parseInt(parts[0]) > 0 && parseInt(parts[0]) <= 31 &&
                    parseInt(parts[1]) > 0 && parseInt(parts[1]) <= 12 &&
                    parseInt(parts[2]) > 1900 && parseInt(parts[2]) < 2100) {
                    
                    const formattedDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                    document.getElementById('birthDate').value = formattedDate;
                }
            }
        } catch (error) {
            console.error("Error al procesar la fecha:", error);
        }
    }
    
    // Mostrar notificación de lectura exitosa
    const documentType = document.getElementById('documentType');
    if (documentType.value === 'dni') {
        showNotification('Datos del DNI leídos correctamente', 'success');
    }
    
    // Resaltar campos que se han rellenado
    const fieldsToHighlight = ['firstName', 'lastName', 'documentNumber', 'birthDate', 'address'];
    fieldsToHighlight.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field && field.value) {
            field.classList.add('bg-green-50', 'border-green-300');
            setTimeout(() => {
                field.classList.remove('bg-green-50', 'border-green-300');
            }, 3000);
        }
    });
}

/**
 * Función para leer código PDF417 de una imagen
 */
async function decodePDF417(imageElement) {
    try {
        console.log("Iniciando decodificación PDF417...");
        
        // Verificar que la imagen está cargada correctamente
        if (!imageElement.complete || !imageElement.naturalWidth) {
            console.error("La imagen no está completamente cargada");
            return false;
        }
        
        // Crear un canvas para preprocesar la imagen
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Configurar tamaño del canvas
        const width = imageElement.naturalWidth || imageElement.width;
        const height = imageElement.naturalHeight || imageElement.height;
        
        if (!width || !height) {
            console.error("No se pudo determinar el tamaño de la imagen");
            return false;
        }
        
        canvas.width = width;
        canvas.height = height;
        
        // Dibujar la imagen en el canvas
        try {
            ctx.drawImage(imageElement, 0, 0);
        } catch (err) {
            console.error("Error al dibujar la imagen en canvas:", err);
            return false;
        }
        
        // Intentar con el enfoque directo primero
        console.log("Intentando enfoque directo con toda la imagen");
        let result = await tryDecodeWithZXing(imageElement);
        
        // Si falla, intentamos un enfoque más específico
        if (!result) {
            console.log("Primer intento fallido, probando técnicas adicionales");
            
            // Los DNI argentinos tienen el código PDF417 en la parte inferior derecha
            // Vamos a recortar esa región para mejorar la detección
            const regions = [
                // Región inferior derecha (donde suele estar el código en DNIs argentinos)
                {x: Math.floor(width * 0.5), y: Math.floor(height * 0.5), 
                 width: Math.floor(width * 0.5), height: Math.floor(height * 0.5)},
                // Mitad inferior de la imagen
                {x: 0, y: Math.floor(height * 0.5), 
                 width: width, height: Math.floor(height * 0.5)},
                // Tercio derecho de la imagen
                {x: Math.floor(width * 0.66), y: 0, 
                 width: Math.floor(width * 0.34), height: height}
            ];
            
            // Probar con diferentes regiones
            for (const region of regions) {
                console.log(`Probando región: x=${region.x}, y=${region.y}, w=${region.width}, h=${region.height}`);
                
                // Crear un canvas para la región
                const regionCanvas = document.createElement('canvas');
                regionCanvas.width = region.width;
                regionCanvas.height = region.height;
                const regionCtx = regionCanvas.getContext('2d');
                
                // Recortar la región y dibujarla en el nuevo canvas
                regionCtx.drawImage(canvas, 
                    region.x, region.y, region.width, region.height,
                    0, 0, region.width, region.height);
                
                // Mostrar la región para debug
                console.log("Procesando región de la imagen");
                
                // Intentar decodificar la región
                result = await tryDecodeWithZXing(regionCanvas);
                if (result) {
                    console.log("¡Decodificación exitosa en región recortada!");
                    break;
                }
            }
        }
        
        // Si aún no tenemos resultado, probamos con ajustes de contraste
        if (!result) {
            console.log("Intentando con ajustes de imagen");
            
            // Aumentar contraste
            ctx.drawImage(imageElement, 0, 0);
            const imageData = ctx.getImageData(0, 0, width, height);
            const data = imageData.data;
            
            // Ajustar contraste
            const contrast = 1.5; // Aumentar contraste
            const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
            
            for (let i = 0; i < data.length; i += 4) {
                // Rojo
                data[i] = factor * (data[i] - 128) + 128;
                // Verde
                data[i + 1] = factor * (data[i + 1] - 128) + 128;
                // Azul
                data[i + 2] = factor * (data[i + 2] - 128) + 128;
            }
            
            ctx.putImageData(imageData, 0, 0);
            
            // Intentar con la imagen de alto contraste
            result = await tryDecodeWithZXing(canvas);
        }
        
        // Si encontramos un resultado, procesarlo
        if (result) {
            console.log("Código PDF417 detectado:", result);
            
            // Parsear datos del código PDF417
            const data = parsePDF417Data(result);
            
            // Rellenar formulario con los datos extraídos
            populateFormWithData(data);
            return true;
        }
        
        console.log("No se pudo detectar el código PDF417 después de todos los intentos");
        return false;
        
    } catch (error) {
        console.error("Error general al decodificar PDF417:", error);
        return false;
    }
}

/**
 * Función para intentar la decodificación con ZXing
 */
async function tryDecodeWithZXing(imageElement) {
    try {
        // Configuración para mejorar la detección
        const hints = new Map();
        hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
        hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [ZXing.BarcodeFormat.PDF_417]);
        
        // Intento 1: Usar BrowserPDF417Reader (más simple)
        try {
            const codeReader = new ZXing.BrowserPDF417Reader();
            const result = await codeReader.decodeFromImage(imageElement);
            if (result && result.text) {
                console.log("Decodificado con BrowserPDF417Reader:", result.text);
                return result.text;
            }
        } catch (err) {
            console.log("Error en BrowserPDF417Reader:", err.message);
        }
        
        // Intento 2: Usar enfoque de nivel más bajo
        try {
            // Si es un canvas, usamos directamente
            if (imageElement instanceof HTMLCanvasElement) {
                const luminanceSource = new ZXing.HTMLCanvasElementLuminanceSource(imageElement);
                const binaryBitmap = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(luminanceSource));
                const reader = new ZXing.PDF417Reader();
                
                try {
                    const result = reader.decode(binaryBitmap, hints);
                    if (result && result.text) {
                        console.log("Decodificado con PDF417Reader directo:", result.text);
                        return result.text;
                    }
                } catch (error) {
                    console.log("Error en decodificación directa:", error.message);
                }
            }
        } catch (err) {
            console.log("Error en enfoque de nivel bajo:", err.message);
        }
        
        return null;
    } catch (error) {
        console.error("Error en tryDecodeWithZXing:", error);
        return null;
    }
}

/**
 * Función para parsear datos de un PDF417 de DNI argentino
 */
function parsePDF417Data(rawData) {
    console.log("Datos brutos del PDF417:", rawData);
    
    // Eliminar caracteres no imprimibles que puedan estar presentes
    const cleanData = rawData.replace(/[\x00-\x1F\x7F-\x9F]/g, '');
    console.log("Datos limpios:", cleanData);
    
    // Verificamos múltiples formatos posibles
    
    // 1. Formato típico argentino con @ como separador
    if (cleanData.includes('@')) {
        const fields = cleanData.split('@');
        console.log("Campos detectados (formato @):", fields);
        
        // Intentar determinar el formato específico basado en la cantidad de campos
        if (fields.length >= 8) {
            let data = {
                apellido: '',
                nombre: '',
                numeroDocumento: '',
                fechaNacimiento: '',
                domicilio: '',
                sexo: ''
            };
            
            // Iterar por los campos buscando patrones específicos
            for (let i = 0; i < fields.length; i++) {
                const field = fields[i].trim();
                
                // Campos vacíos no nos interesan
                if (!field) continue;
                
                // Buscar números que puedan ser DNI (7-8 dígitos)
                if (!data.numeroDocumento && /^\d{7,8}$/.test(field)) {
                    data.numeroDocumento = field;
                    continue;
                }
                
                // Buscar fechas en formato DD/MM/AAAA o similar
                if (!data.fechaNacimiento && 
                    (/\d{1,2}\/\d{1,2}\/\d{4}/.test(field) || 
                     /\d{1,2}-\d{1,2}-\d{4}/.test(field))) {
                    data.fechaNacimiento = field;
                    continue;
                }
                
                // Determinaciones basadas en la posición para el formato típico
                // @APELLIDO@NOMBRE@SEXO@NÚMERO_DOCUMENTO@X@FECHA_NACIMIENTO
                if (i === 1 && !data.apellido) {
                    data.apellido = field;
                } else if (i === 2 && !data.nombre) {
                    data.nombre = field;
                } else if (i === 3 && !data.sexo && (field === 'M' || field === 'F')) {
                    data.sexo = field;
                } else if (i === 4 && !data.numeroDocumento) {
                    data.numeroDocumento = field;
                } else if (i === 6 && !data.fechaNacimiento) {
                    data.fechaNacimiento = field;
                }
            }
            
            // Verificar si encontramos datos esenciales
            if (data.nombre || data.apellido || data.numeroDocumento) {
                return data;
            }
        }
        
        // Intento con un mapeo más directo (formato clásico)
        return {
            apellido: fields[1] || '',
            nombre: fields[2] || '',
            numeroDocumento: fields[4] || '',
            fechaNacimiento: fields[6] || '',
            sexo: fields[3] || '',
            domicilio: fields[5] || ''
        };
    } 
    
    // 2. Formato alternativo: texto con saltos de línea
    if (cleanData.indexOf('\n') > -1) {
        const lines = cleanData.split('\n').filter(line => line.trim() !== '');
        console.log("Líneas detectadas:", lines);
        
        let data = {
            apellido: '',
            nombre: '',
            numeroDocumento: '',
            fechaNacimiento: '',
            sexo: ''
        };
        
        // Buscar patrones específicos en cada línea
        for (const line of lines) {
            // Buscar número de documento (7-8 dígitos)
            const dniMatch = line.match(/\b\d{7,8}\b/);
            if (dniMatch && !data.numeroDocumento) {
                data.numeroDocumento = dniMatch[0];
            }
            
            // Buscar fechas
            const dateMatch = line.match(/\b\d{1,2}[\/-]\d{1,2}[\/-]\d{4}\b/);
            if (dateMatch && !data.fechaNacimiento) {
                data.fechaNacimiento = dateMatch[0];
            }
            
            // Análisis heurístico para nombre/apellido
            // Asumimos que líneas cortas con solo texto podrían ser nombre/apellido
            if (line.length < 30 && !/\d/.test(line) && /[A-Za-z]/.test(line)) {
                const words = line.split(/\s+/);
                
                // Si no tenemos apellido y hay múltiples palabras, la primera podría ser apellido
                if (!data.apellido && words.length > 1) {
                    data.apellido = words[0];
                    // El resto podría ser nombre
                    if (!data.nombre) {
                        data.nombre = words.slice(1).join(' ');
                    }
                } 
                // Si ya tenemos apellido pero no nombre, esta línea podría ser el nombre
                else if (data.apellido && !data.nombre) {
                    data.nombre = line;
                }
                // Si no tenemos ni apellido ni nombre, y es una sola palabra, probablemente apellido
                else if (!data.apellido && !data.nombre) {
                    if (words.length === 1) {
                        data.apellido = line;
                    } else {
                        data.apellido = words[0];
                        data.nombre = words.slice(1).join(' ');
                    }
                }
            }
        }
        
        // Si encontramos al menos algún dato, devolver el resultado
        if (data.nombre || data.apellido || data.numeroDocumento) {
            return data;
        }
    }
    
    // 3. Formato general: buscar patrones en el texto completo
    let data = {
        apellido: '',
        nombre: '',
        numeroDocumento: '',
        fechaNacimiento: '',
        sexo: ''
    };
    
    // Buscar número de documento (7-8 dígitos)
    const dniMatch = cleanData.match(/\b\d{7,8}\b/);
    if (dniMatch) {
        data.numeroDocumento = dniMatch[0];
    }
    
    // Buscar fechas
    const dateMatch = cleanData.match(/\b\d{1,2}[\/-]\d{1,2}[\/-]\d{4}\b/);
    if (dateMatch) {
        data.fechaNacimiento = dateMatch[0];
    }
    
    // Si encontramos al menos el número de documento, devolver lo que tenemos
    if (data.numeroDocumento) {
        return data;
    }
    
    // Si no pudimos identificar ningún formato conocido, devolvemos objeto vacío
    console.log("No se pudo identificar ningún formato conocido en los datos");
    return {
        apellido: '',
        nombre: '',
        numeroDocumento: '',
        fechaNacimiento: '',
        sexo: ''
    };
}