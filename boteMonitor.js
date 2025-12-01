// -----------------------------------------------------------------------------------
// CÓDIGO UNIFICADO: BOT + SERVIDOR EXPRESS (API PARA QR CODE)
//
// Este arquivo contém:
// 1. A lógica original do Trello/Cloudinary/WhatsApp.
// 2. Um servidor Express para evitar o erro de 'Port scan timeout' no Render.
// 3. A rota /qrcode que permite ao dashboard buscar o código de conexão.
// -----------------------------------------------------------------------------------

// --- IMPORTS ---
require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const fetch = require('node-fetch');

// Imports para a API/Servidor Web
const express = require('express');
const qrcode = require('qrcode');

// 💡 Importa a API do Cloudinary (Presumindo que este arquivo existe no seu projeto)
const { uploadMediaToCloudinary } = require('./cloudinary-api'); 

// ======================================================
// 🔹 CONFIGURAÇÕES E VARIÁVEIS GLOBAIS
// ======================================================

const app = express();
const port = process.env.PORT || 3000;
const SESSION_NAME = 'bot-monitor-session'; // Nome da sessão para o LocalAuth

// Variável que armazena o Base64 do QR Code ou o status de conexão
let qrCodeBase64 = ''; // Valores possíveis: Base64, 'READY', 'DISCONNECTED', 'AUTH_FAILURE'

// 🚨 SEU NÚMERO DE WHATSAPP PRIVADO PARA NOTIFICAÇÕES
const MEU_WHATSAPP_PRIVADO = '5519992897178@c.us'; 
const TARGET_GROUP_ID = process.env.TARGET_GROUP_ID || '5519988247466-1584793498@g.us';

// 🔹 CREDENCIAIS DO TRELLO (Carregadas do .env)
const TRELLO_API_KEY = process.env.TRELLO_API_KEY; 
const TRELLO_AUTH_TOKEN = process.env.TRELLO_AUTH_TOKEN;
const TRELLO_BOARD_ID = process.env.TRELLO_BOARD_ID; 
const TRELLO_LIST_ID = process.env.TRELLO_LIST_ID; 


// ======================================================
// 🔍 VALIDAÇÃO INICIAL
// ======================================================
if (!TRELLO_API_KEY || !TRELLO_AUTH_TOKEN || !TRELLO_BOARD_ID || !TRELLO_LIST_ID) {
    console.error('❌ Erro: Uma das variáveis do TRELLO não está definida no arquivo .env!');
    process.exit(1);
}

// ======================================================
// 🔹 FUNÇÕES DO TRELLO (Mantidas inalteradas)
// ======================================================

// [Omitindo findCardByTitle, createCard, attachUrlToCard para brevidade, mas elas permanecem no seu código]

async function findCardByTitle(alunoNome) {
    const searchUrl = `https://api.trello.com/1/boards/${TRELLO_BOARD_ID}/cards?key=${TRELLO_API_KEY}&token=${TRELLO_AUTH_TOKEN}&fields=name,id`;
    
    const response = await fetch(searchUrl);
    if (!response.ok) {
        throw new Error(`Erro ao buscar Cards: ${response.statusText}`);
    }
    
    const cards = await response.json();
    
    const normalizedSearch = alunoNome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

    for (const card of cards) {
        const normalizedCardName = card.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        
        if (normalizedCardName.includes(normalizedSearch)) {
            console.log(`🔍 Card encontrado para "${alunoNome}": ${card.name}`);
            return card.id;
        }
    }

    return null;
}

async function createCard(title) {
    const createUrl = `https://api.trello.com/1/cards?idList=${TRELLO_LIST_ID}&key=${TRELLO_API_KEY}&token=${TRELLO_AUTH_TOKEN}`;

    const response = await fetch(createUrl, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            name: title, 
            desc: `Card criado automaticamente após receber a primeira mídia de ${title} em ${new Date().toLocaleString('pt-BR')}.`,
        })
    });

    if (!response.ok) {
        throw new Error(`Erro ao criar Card: ${response.status} - ${await response.text()}`);
    }

    const newCard = await response.json();
    console.log(`🆕 Card criado com sucesso para "${title}". ID: ${newCard.id}`);
    return newCard.id;
}

async function attachUrlToCard(cardId, title, url) {
    const attachmentUrl = `https://api.trello.com/1/cards/${cardId}/attachments?key=${TRELLO_API_KEY}&token=${TRELLO_AUTH_TOKEN}`;
    
    const attachmentResponse = await fetch(attachmentUrl, {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
            url: url,
            name: title,
        })
    });

    if (!attachmentResponse.ok) {
        throw new Error(`Erro ao anexar URL. Status: ${attachmentResponse.statusText}`);
    }
    
    console.log('🔗 Anexo adicionado ao Card.');
}

// ======================================================
// 🔹 INICIALIZA CLIENTE WHATSAPP e Eventos QR/Ready...
// ======================================================
const client = new Client({
    authStrategy: new LocalAuth({ clientId: SESSION_NAME }),
    puppeteer: {
        headless: true, 
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-gpu',
            '--disable-dev-shm-usage'
        ],
    },
});

// ✅ ATUALIZAÇÃO CRÍTICA: Geração do QR Code em Base64 para a API
client.on('qr', async (qr) => {
    console.log('QR Code solicitado. Gerando Base64 para API...');
    qrCodeBase64 = await qrcode.toDataURL(qr);
    console.log('QR Code Base64 gerado e pronto para ser consumido pelo Dashboard.');
});

client.on('ready', () => {
    console.log('✅ Cliente conectado e pronto!');
    qrCodeBase64 = 'READY'; // Sinaliza que a conexão está OK
});

client.on('auth_failure', (msg) => {
    console.error('Authentication failure: ', msg);
    qrCodeBase64 = 'AUTH_FAILURE';
});

client.on('disconnected', (reason) => {
    console.log('Client was disconnected: ', reason);
    qrCodeBase64 = 'DISCONNECTED'; 
});


// ======================================================
// 🔹 EVENTO: MENSAGEM RECEBIDA (LÓGICA FINAL)
// ======================================================
client.on('message', async msg => {
    if (msg.from !== TARGET_GROUP_ID) return; 

    if (msg.hasMedia && msg.body && (msg.hasQuotedMsg === false)) {
        const alunoNome = msg.body.trim();
        let publicUrl = null;
        let cardId = null;
        let isNewCard = false; 
        
        // Aviso de legenda incompleta vai para o privado
        if (alunoNome.length < 3) {
            const warning = '⚠️ ALERTA: Mídia ignorada. Por favor, envie a mídia com o nome completo do aluno na legenda.';
            await client.sendMessage(MEU_WHATSAPP_PRIVADO, warning);
            console.warn(warning);
            return;
        }

        try {
            const media = await msg.downloadMedia();
            const mimeType = media.mimetype;
            
            if (mimeType.startsWith('image/') || mimeType.startsWith('video/')) {
                
                // 1. Busca ou Cria o Card
                cardId = await findCardByTitle(alunoNome);
                
                if (!cardId) {
                    cardId = await createCard(alunoNome);
                    isNewCard = true;
                }
                
                // 2. UPLOAD PARA CLOUDINARY
                publicUrl = await uploadMediaToCloudinary(media.data, mimeType);
                
                // 3. Anexa a URL pública ao Card
                const title = `Anexo de Mídia para ${alunoNome} (${new Date().toLocaleDateString('pt-BR')})`;
                await attachUrlToCard(cardId, title, publicUrl);
                
                
                // 🎯 NOTIFICAÇÃO APENAS PARA O PRIVADO
                let successMessage = `✅ Mídia anexada com sucesso ao Card de **"${alunoNome}"** no Trello.`;
                if (isNewCard) {
                    successMessage = `🆕 Card para **"${alunoNome}"** foi criado e a mídia foi anexada com sucesso.`;
                }

                const privateMessage = `${successMessage}\n\n🔗 **URL do Anexo no Cloudinary:** ${publicUrl}`;
                
                // Envia para o seu chat privado
                await client.sendMessage(MEU_WHATSAPP_PRIVADO, privateMessage);

            } else {
                console.log(`ℹ️ Mídia ignorada (Não é imagem/vídeo): ${mimeType}`);
            }

        } catch (err) {
            console.error('❌ Erro no fluxo Trello/Cloudinary:', err);
            
            // ✅ Notificação de Erro APENAS para o privado
            await client.sendMessage(MEU_WHATSAPP_PRIVADO, `❌ ALERTA DE ERRO: Ocorreu um erro ao processar e anexar a mídia do aluno **"${alunoNome}"**: ${err.message}`);
        }
    }
});

// Inicializa o cliente do WhatsApp
client.initialize();


// ======================================================
// 🌐 SERVIDOR EXPRESS (API E HEALTH CHECK)
// ======================================================

// Middleware para permitir acesso CORS do seu dashboard (workers.dev)
app.use((req, res, next) => {
    // 💡 IMPORTANTE: Adicione o domínio real do seu dashboard!
    const allowedOrigins = ['http://localhost:8080', 'https://whatsapp-dashboard.abcgiga2015.workers.dev'];
    const origin = req.headers.origin;

    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    next();
});

// Rota 1: Health Check (para o Render não matar o processo)
app.get('/', (req, res) => {
  res.status(200).send('Bot Monitor API está rodando e pronto para Health Check.');
});

// Rota 2: API que o Dashboard HTML irá consultar para pegar o QR Code/Status
app.get('/qrcode', (req, res) => {
  // Retorna a Base64 ou a string de status ('READY', 'DISCONNECTED', etc.)
  res.json({ qr: qrCodeBase64 });
});

// Inicia o servidor Express
app.listen(port, () => {
  console.log(`Web server listening on port ${port} and exposing /qrcode API.`);
});