// index.js (ou main.js) - CÓDIGO FINAL COM NOTIFICAÇÕES APENAS NO PRIVADO

require('dotenv').config();
const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');
const fetch = require('node-fetch');

// 💡 Importa a API do Cloudinary
const { uploadMediaToCloudinary } = require('./cloudinary-api'); 

// ======================================================
// 🔹 CONFIGURAÇÕES PRINCIPAIS E TRELLO
// ======================================================

// 🚨 NOVO: SEU NÚMERO DE WHATSAPP PRIVADO PARA NOTIFICAÇÕES
const MEU_WHATSAPP_PRIVADO = '5519992897178@c.us'; 
const TARGET_GROUP_ID = process.env.TARGET_GROUP_ID || '5519988247466-1584793498@g.us';

// 🔹 CREDENCIAIS DO TRELLO
const TRELLO_API_KEY = process.env.TRELLO_API_KEY; 
const TRELLO_AUTH_TOKEN = process.env.TRELLO_AUTH_TOKEN;
const TRELLO_BOARD_ID = process.env.TRELLO_BOARD_ID; 
const TRELLO_LIST_ID = process.env.TRELLO_LIST_ID; 


// ======================================================
// 🔍 VALIDAÇÃO INICIAL
// ======================================================
if (!TRELLO_API_KEY || !TRELLO_AUTH_TOKEN || !TRELLO_BOARD_ID || !TRELLO_LIST_ID) {
    console.error('❌ Erro: Uma das variáveis do TRELLO (API_KEY, AUTH_TOKEN, BOARD_ID, LIST_ID) não está definida no arquivo .env!');
    process.exit(1);
}

// ======================================================
// 🔹 FUNÇÕES DO TRELLO (Mantidas inalteradas)
// ======================================================

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
    authStrategy: new LocalAuth(),
});

client.on('qr', qr => {
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('✅ Cliente conectado e pronto!');
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
        
        // 🚨 MUDANÇA: Aviso de legenda incompleta agora também vai para o privado
        if (alunoNome.length < 3) {
            const warning = '⚠️ ALERTA: Mídia ignorada. Por favor, envie a mídia com o nome completo do aluno na legenda (Ex: Bernardo Henrique) para que eu possa localizar o Card.';
            await client.sendMessage(MEU_WHATSAPP_PRIVADO, warning);
            console.warn(warning);
            // Nenhum 'msg.reply()' no grupo
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
                
                // Nenhuma mensagem de resposta ou confirmação no grupo.

            } else {
                console.log(`ℹ️ Mídia ignorada (Não é imagem/vídeo): ${mimeType}`);
                // Nenhuma notificação no grupo
            }

        } catch (err) {
            console.error('❌ Erro no fluxo Trello/Cloudinary:', err);
            
            // ✅ Notificação de Erro APENAS para o privado
            await client.sendMessage(MEU_WHATSAPP_PRIVADO, `❌ ALERTA DE ERRO: Ocorreu um erro ao processar e anexar a mídia do aluno **"${alunoNome}"**: ${err.message}`);
            
            // Nenhuma mensagem de erro no grupo.
        }
    }
});

client.initialize();