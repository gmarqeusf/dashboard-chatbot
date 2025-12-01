// cloudinary-api.js

const cloudinary = require('cloudinary').v2;

// 1. Configuração do Cloudinary
if (
    !process.env.CLOUDINARY_CLOUD_NAME || 
    !process.env.CLOUDINARY_API_KEY || 
    !process.env.CLOUDINARY_API_SECRET
) {
    console.error('❌ Erro: As variáveis do CLOUDINARY (CLOUD_NAME, API_KEY, API_SECRET) não estão definidas no arquivo .env!');
    // Não paramos o processo aqui, mas a função de upload pode falhar.
} else {
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
        secure: true,
    });
    console.log('☁️ Cloudinary configurado com sucesso.');
}


// 2. Função de Upload
/**
 * Faz o upload de uma mídia Base64 para o Cloudinary e retorna a URL pública.
 * @param {string} base64Data - A string Base64 da mídia.
 * @param {string} mimeType - O tipo MIME da mídia (ex: 'image/jpeg', 'video/mp4').
 * @returns {Promise<string>} Promessa que resolve para a URL pública segura.
 */
async function uploadMediaToCloudinary(base64Data, mimeType) {
    // Cria o Data URI formatado: data:[mimeType];base64,[data]
    const dataUri = `data:${mimeType};base64,${base64Data}`;
    
    // Determina o tipo de recurso ('image' ou 'video')
    const resourceType = mimeType.startsWith('video/') ? 'video' : 'image';

    try {
        const result = await cloudinary.uploader.upload(dataUri, {
            resource_type: resourceType,
            folder: 'whatsapp_trello_anexos', // Pasta no Cloudinary para organização
        });
        
        console.log(`☁️ Upload concluído. URL: ${result.secure_url}`);
        return result.secure_url;
    } catch (error) {
        console.error('❌ Erro durante o upload para o Cloudinary:', error.message);
        throw new Error('Falha ao obter URL pública da mídia.');
    }
}

module.exports = {
    uploadMediaToCloudinary,
};