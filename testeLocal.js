const fs = require('fs').promises;
const path = require('path');
const { google } = require('googleapis');

// --- Configurações ---
const driveFolderId = '1VRFfMSQDAy8cskvjN_o7P5MSglddQFmu';
const spreadsheetId = '1MXL2ZdE0TFCb-vKBhsdtkA8XDGcLEcTM17knV6bF0RI';

// --- Autenticação com Google ---
async function autenticarGoogle() {
  // Carrega as credenciais do arquivo JSON
  const credentials = JSON.parse(await fs.readFile('credentials.json', 'utf-8'));

  const auth = new google.auth.GoogleAuth({
    // Usando 'credentials' com o objeto carregado do arquivo
    credentials: {
      client_email: credentials.client_email,
      private_key: credentials.private_key,
    },
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.readonly'
    ],
  });

  const client = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: client });
  const drive = google.drive({ version: 'v3', auth: client });
  return { sheets, drive };
}

// --- Função principal para listar arquivos do Drive e inserir no Sheets ---
async function inserirArquivosDoDriveNoSheets() {
  console.log(`🚀 Buscando arquivos na pasta do Google Drive (ID: ${driveFolderId})`);

  try {
    const { sheets, drive } = await autenticarGoogle();
    console.log('✅ Autenticação com Google realizada com sucesso.');
    console.log('--- Iniciando listagem de arquivos no Google Drive ---');

    const response = await drive.files.list({
      q: `'${driveFolderId}' in parents`,
      fields: 'files(id, name, createdTime)', // Adicionado 'id' para poder construir o link
    });

    const arquivosDoDrive = response.data.files;

    if (!arquivosDoDrive || arquivosDoDrive.length === 0) {
      console.log('Nenhum arquivo encontrado na pasta do Google Drive especificada.');
      return;
    }

    console.log(`✅ Encontrados ${arquivosDoDrive.length} arquivos no Google Drive.`);
    console.log('--- Iniciando inserção de arquivos no Sheets ---');

    for (const arquivo of arquivosDoDrive) {
      const nomeArquivo = arquivo.name;
      const dataCriacao = new Date(arquivo.createdTime);
      const dataFormatada = dataCriacao.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      const nomeAba = nomeArquivo.split('.')[0];
      const idArquivo = arquivo.id; // <-- Pegamos o ID do arquivo aqui
      const linkArquivo = `https://drive.google.com/file/d/${idArquivo}/view?usp=sharing`; // <-- Construímos o link

      // Ajustamos 'valoresParaInserir' para incluir o link
      const valoresParaInserir = [[nomeArquivo, dataFormatada, linkArquivo]];

      let proximaLinha = 1;
      try {
        const sheetValues = await sheets.spreadsheets.values.get({
          spreadsheetId: spreadsheetId,
          // Ajustamos o range para ler as 3 colunas (A, B, C)
          range: `${nomeAba}!A:C`,
        });

        if (sheetValues.data.values) {
          proximaLinha = sheetValues.data.values.length + 1;
        }
      } catch (errorAba) {
        // Captura o erro específico de "Unable to parse range" que indica que a aba não existe
        if (errorAba.message.includes('Unable to parse range')) {
          console.warn(`⚠️ Aba "${nomeAba}" não encontrada. Pulando este arquivo.`);
          continue; // Pula para o próximo arquivo no loop
        } else {
          // Se for outro tipo de erro ao tentar ler a aba, loga e continua para o próximo arquivo
          console.error(`❌ Erro ao tentar ler a aba "${nomeAba}" (arquivo: ${nomeArquivo}): ${errorAba.message}. Pulando este arquivo.`);
          continue; // Pula para o próximo arquivo no loop caso seja um erro diferente
        }
      }

      // --- Inserindo os dados na planilha ---
      await sheets.spreadsheets.values.update({
        spreadsheetId: spreadsheetId,
        // Ajustamos o range para incluir a nova coluna C
        range: `${nomeAba}!A${proximaLinha}:C${proximaLinha}`,
        valueInputOption: 'USER_ENTERED',
        resource: {
          values: valoresParaInserir,
        },
      });

      console.log(`✅ Inserido na aba "${nomeAba}": ${nomeArquivo} - ${dataFormatada} - ${linkArquivo}`);
    }
    console.log('--- Processo de inserção concluído! ---');

  } catch (error) {
    // Se o erro for durante a autenticação, ele pode parar aqui.
    console.error(`❌ Ocorreu um erro geral: ${error.message}`);
  }
}

// --- Executa a função principal ---
inserirArquivosDoDriveNoSheets();