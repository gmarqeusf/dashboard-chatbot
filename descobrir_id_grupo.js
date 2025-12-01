require('dotenv').config();
const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode-terminal');
const { google } = require('googleapis');
const { Client, LocalAuth } = require('whatsapp-web.js');

// 🔹 Configurações do grupo e do Google Drive
const TARGET_GROUP_ID = process.env.TARGET_GROUP_ID;
const DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;

// 🔹 Inicializa o cliente do Google Drive
const auth = new google.auth.GoogleAuth({
    credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/drive.file'],
});

const drive = google.drive({ version: 'v3', auth });

// 🔹 Inicializa o cliente do WhatsApp
const client = new Client({
    authStrategy: new LocalAuth(),
});

client.on('qr', qr => {
    qrcode.generate(qr, { small: true });
    console.log('📱 Escaneie o QR Code para conectar o bot ao WhatsApp...');
});

client.on('ready', () => {
    console.log('✅ Cliente conectado e pronto!');
    console.log(`🧠 Monitorando exclusivamente o grupo: ${TARGET_GROUP_ID}`);
});

// 🔹 Ao receber mensagens
client.on('message', async msg => {
    if (msg.from !== TARGET_GROUP_ID) return; // ignora outros chats

    if (msg.hasMedia) {
        const media = await msg.downloadMedia();

        if (media.mimetype.startsWith('image/')) {
            // Cria arquivo temporário local
            const fileName = `imagem_${Date.now()}.jpg`;
            const filePath = path.join(__dirname, 'fotos_recebidas', fileName);

            if (!fs.existsSync(path.join(__dirname, 'fotos_recebidas'))) {
                fs.mkdirSync(path.join(__dirname, 'fotos_recebidas'));
            }

            fs.writeFileSync(filePath, media.data, { encoding: 'base64' });
            console.log(`📸 Imagem recebida: ${fileName}`);

            // Faz upload pro Google Drive
            try {
                const fileMetadata = {
                    name: fileName,
                    parents: [DRIVE_FOLDER_ID],
                };
                const mediaStream = {
                    mimeType: media.mimetype,
                    body: fs.createReadStream(filePath),
                };

                const uploadResponse = await drive.files.create({
                    resource: fileMetadata,
                    media: mediaStream,
                    fields: 'id, name, webViewLink',
                });

                console.log(`✅ Enviada para o Drive: ${uploadResponse.data.name}`);
                console.log(`🔗 Link: ${uploadResponse.data.webViewLink}`);

                // Remove o arquivo local após o upload
                fs.unlinkSync(filePath);
            } catch (error) {
                console.error('❌ Erro ao enviar para o Drive:', error.message);
            }
        }
    }
});

client.initialize();
