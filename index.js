// index.js

require('dotenv').config(); // Carrega as variáveis de ambiente do arquivo .env

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const { google } = require('googleapis');

// --- Configurações (Usando Variáveis de Ambiente) ---
const GRUPO_MONITORADO_ID = '120363421997659113@g.us';
// ID da pasta do Drive para o upload (parte da URL fornecida anteriormente)
const DRIVE_FOLDER_ID = '1VRFfMSQDAy8cskvjN_o7P5MSglddQFmu'; 

// Variáveis da Conta de Serviço do Google
const CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
// A chave privada precisa de um pequeno ajuste para remover as quebras de linha '\n' no Windows
const PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');


// --- 1. Configuração de Autenticação do Google Drive (Service Account) ---

let drive; // Variável para a instância autenticada do Google Drive

async function authorizeServiceAccount() {
    console.log('Iniciando autenticação da Conta de Serviço do Google...');
    
    if (!CLIENT_EMAIL || !PRIVATE_KEY) {
        throw new Error("As variáveis GOOGLE_CLIENT_EMAIL e GOOGLE_PRIVATE_KEY não estão definidas no .env.");
    }

    const auth = new google.auth.JWT(
        CLIENT_EMAIL,
        null,
        PRIVATE_KEY,
        ['https://www.googleapis.com/auth/drive.file'] // Scope para acesso a arquivos criados pelo app
    );

    try {
        await auth.authorize();
        drive = google.drive({ version: 'v3', auth });
        console.log('✅ Google Drive API autenticada com sucesso via Service Account.');
    } catch (err) {
        throw new Error(`❌ Erro ao autenticar no Google Drive: ${err.message}. Verifique o email/chave e as permissões da pasta.`);
    }
}

// --- 2. Função de Upload para o Google Drive ---

/**
 * Faz o upload de um buffer (dados da imagem) para o Google Drive.
 */
async function uploadFileToDrive(fileName, fileDataBuffer, mimeType, folderId) {
    if (!drive) {
        throw new Error('Google Drive não está autenticado. Não é possível fazer upload.');
    }

    console.log(`Iniciando upload do arquivo: ${fileName}`);

    // Cria o stream do arquivo a partir do buffer
    const stream = require('stream');
    const bufferStream = new stream.PassThrough();
    bufferStream.end(fileDataBuffer);

    const response = await drive.files.create({
        requestBody: {
            name: fileName,
            parents: [folderId], // Define a pasta de destino
            mimeType: mimeType,
        },
        media: {
            mimeType: mimeType,
            body: bufferStream, // Passa o stream do buffer
        },
        fields: 'id, webViewLink'
    });
    
    return response.data;
}


// --- 3. Lógica do WhatsApp Bot ---

const client = new Client({
    authStrategy: new LocalAuth()
});

client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    console.log('Escaneie o QR Code acima para conectar o bot ao WhatsApp.');
});

client.on('ready', async () => {
    console.log('Cliente WhatsApp está pronto!');
    
    // Autentica no Drive usando a Conta de Serviço (Service Account)
    try {
        await authorizeServiceAccount();
    } catch (e) {
        console.error(`ERRO CRÍTICO: ${e.message}`);
        return; // Impede que o bot continue se a autenticação falhar
    }
    
    console.log(`Monitorando APENAS o grupo: ${GRUPO_MONITORADO_ID}`);
});

client.on('message', async message => {
    const chatId = message.id.remote;

    // Filtro: só processa mensagens do grupo monitorado
    if (chatId !== GRUPO_MONITORADO_ID) {
        return; 
    }
    
    // Processamento de mídia
    if (message.hasMedia) {
        // Verifica se o drive está autenticado antes de prosseguir
        if (!drive) {
             message.reply('❌ O Google Drive não está autenticado. Não foi possível salvar a imagem.');
             return;
        }

        try {
            message.reply('Recebi sua mídia! Fazendo download e upload para o Google Drive...');

            // 1. Baixa a mídia
            const media = await message.downloadMedia();

            // 2. Prepara os dados
            const fileDataBuffer = Buffer.from(media.data, 'base64');
            const mimeType = media.mimetype;
            
            // Tenta obter o nome original, senão usa um nome genérico
            let fileName = media.filename || `whatsapp-media-${Date.now()}`;
            const fileExtension = mimeType.split('/')[1] || 'dat';
            
            // Adiciona a extensão ao nome do arquivo
            fileName = `${fileName}.${fileExtension}`;
            
            // 3. Faz o upload para o Google Drive
            const driveResponse = await uploadFileToDrive(fileName, fileDataBuffer, mimeType, DRIVE_FOLDER_ID);
            
            // 4. Responde no grupo com o link da imagem
            const link = driveResponse.webViewLink;
            message.reply(`🎉 Arquivo *${fileName}* salvo no Drive! \n\n🔗 Link: ${link}`);

        } catch (error) {
            console.error('❌ Erro ao processar mídia ou fazer upload para o Drive:', error);
            message.reply('Ops! Houve um erro inesperado ao salvar sua mídia no Drive. Tente novamente.');
        }
    }
});

client.initialize();