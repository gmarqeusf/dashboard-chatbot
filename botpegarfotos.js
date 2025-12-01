const fs = require('fs').promises;
const path = require('path');
const { google } = require('googleapis');

// --- Configurações ---
const driveFolderId = '1VRFfMSQDAy8cskvjN_o7P5MSglddQFmu';
const spreadsheetId = '1MXL2ZdE0TFCb-vKBhsdtkA8XDGcLEcTM17knV6bF0RI';

// --- Mapeamento de Nomes de Abas ---
// Mantido para casos de exceção onde o nome da aba é totalmente diferente do nome do arquivo
const SHEET_NAME_MAP = {
    // Exemplo: 'maya' é o nome gerado pelo script. 'MAYA NASRALLAH' é o nome exato da aba.
    'maya': 'MAYA NASRALLAH', 
};

// --- Funções de Autenticação (omitas, pois permanecem as mesmas) ---
async function autenticarGoogle() {
    const credentials = JSON.parse(await fs.readFile('credentials.json', 'utf-8'));
    const auth = new google.auth.GoogleAuth({
        credentials: { client_email: credentials.client_email, private_key: credentials.private_key, },
        scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive.readonly'],
    });
    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });
    const drive = google.drive({ version: 'v3', auth: client });
    return { sheets, drive };
}

/**
 * Verifica a existência da aba de forma insensível a maiúsculas/minúsculas.
 * Retorna o nome da aba EXATO se existir, ou o nome gerado pelo script se for nova.
 * @param {object} sheets - Objeto Google Sheets API.
 * @param {string} spreadsheetId - ID da planilha.
 * @param {string} sheetTitleGerado - Nome da aba gerado pelo script (ex: 'miguel pereira').
 * @returns {Promise<{name: string, exists: boolean}>} Objeto com o nome exato e se ela já existia.
 */
async function obterOuCriarAba(sheets, spreadsheetId, sheetTitleGerado) {
    try {
        const response = await sheets.spreadsheets.get({
            spreadsheetId: spreadsheetId,
            fields: 'sheets.properties.title'
        });

        // Converte os nomes de todas as abas existentes para minúsculas
        const abasExistentes = response.data.sheets.map(sheet => ({
            titleExact: sheet.properties.title,
            titleLower: sheet.properties.title.toLowerCase()
        }));
        
        const titleGeradoLower = sheetTitleGerado.toLowerCase();
        
        // 1. Procura a aba usando a comparação em minúsculas
        const abaEncontrada = abasExistentes.find(aba => aba.titleLower === titleGeradoLower);

        if (abaEncontrada) {
            // Se encontrou (ex: 'miguel pereira' é igual a 'MIGUEL PEREIRA' em minúsculas)
            console.log(`✅ Aba "${sheetTitleGerado}" encontrada como "${abaEncontrada.titleExact}".`);
            return { name: abaEncontrada.titleExact, exists: true }; // Retorna o nome EXATO
        }

        // 2. Se não encontrou, a aba é realmente nova, então a criamos
        console.log(`🚧 Aba "${sheetTitleGerado}" não encontrada. Criando...`);
        
        await sheets.spreadsheets.batchUpdate({
            spreadsheetId: spreadsheetId,
            resource: {
                requests: [{
                    addSheet: {
                        properties: {
                            // Cria a aba exatamente com o nome gerado pelo script (ex: 'miguel pereira')
                            title: sheetTitleGerado 
                        }
                    }
                }]
            }
        });
        console.log(`✅ Aba "${sheetTitleGerado}" criada com sucesso.`);
        return { name: sheetTitleGerado, exists: false }; // Retorna o nome que acabou de ser criado
    } catch (error) {
        console.error(`❌ Erro crítico ao verificar/criar a aba "${sheetTitleGerado}": ${error.message}`);
        throw error; 
    }
}


// --- Função principal para listar arquivos do Drive e inserir no Sheets ---
async function inserirArquivosDoDriveNoSheets() {
  console.log(`🚀 Buscando arquivos na pasta do Google Drive (ID: ${driveFolderId})`);

  try {
    const { sheets, drive } = await autenticarGoogle();
    console.log('✅ Autenticação com Google realizada com sucesso.');
    // ... (código de listagem de arquivos omitido)

    const response = await drive.files.list({ q: `'${driveFolderId}' in parents and trashed = false`, fields: 'files(id, name, createdTime)' });
    const arquivosDoDrive = response.data.files;
    
    if (!arquivosDoDrive || arquivosDoDrive.length === 0) {
      console.log('Nenhum arquivo encontrado.');
      return;
    }

    console.log(`✅ Encontrados ${arquivosDoDrive.length} arquivos.`);
    console.log('--- Iniciando inserção de arquivos no Sheets ---');

    for (const arquivo of arquivosDoDrive) {
      const nomeArquivo = arquivo.name;
      const dataCriacao = new Date(arquivo.createdTime);
      const dataFormatada = dataCriacao.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      
      const nomeAbaBase = nomeArquivo.split('.').slice(0, -1).join('.'); 
      
      // 1. Aplicação do MAPA (para exceções como MAYA NASRALLAH)
      const nomeMapeado = SHEET_NAME_MAP[nomeAbaBase.toLowerCase()];
      const nomeAbaGerado = nomeMapeado ? nomeMapeado : nomeAbaBase; // Usa o mapeado ou o gerado

      const idArquivo = arquivo.id; 
      const linkArquivo = `https://drive.google.com/file/d/${idArquivo}/view?usp=sharing`; 

      const valoresParaInserir = [[nomeArquivo, dataFormatada, linkArquivo]];

      try {
        // 2. Chama a nova função de verificação/criação
        const resultadoAba = await obterOuCriarAba(sheets, spreadsheetId, nomeAbaGerado);
        
        const nomeAbaExato = resultadoAba.name; // O nome exato que o script deve usar (Ex: 'MIGUEL PEREIRA')
        let proximaLinha = 1;

        if (resultadoAba.exists) {
            // Se a aba já existia (mesmo que com capitalização diferente), busca a próxima linha
            const sheetValues = await sheets.spreadsheets.values.get({
                spreadsheetId: spreadsheetId,
                range: `${nomeAbaExato}!A:A`, 
            });
    
            if (sheetValues.data.values) {
              proximaLinha = sheetValues.data.values.length + 1;
            }
        }
        // Se 'exists' for false, 'proximaLinha' é 1

        // --- 3. Inserindo os dados na planilha ---
        await sheets.spreadsheets.values.update({
          spreadsheetId: spreadsheetId,
          // USA O NOME EXATO RETORNADO (nomeAbaExato)
          range: `${nomeAbaExato}!A${proximaLinha}:C${proximaLinha}`, 
          valueInputOption: 'USER_ENTERED',
          resource: {
            values: valoresParaInserir,
          },
        });

        console.log(`✅ Inserido na aba "${nomeAbaExato}" (Linha ${proximaLinha}): ${nomeArquivo}`);
      } catch (errorAba) {
        console.error(`❌ Falha ao processar o arquivo "${nomeArquivo}". Pulando. Detalhes: ${errorAba.message}`);
        continue;
      }
    }
    console.log('--- Processo de inserção concluído! ---');

  } catch (error) {
    console.error(`❌ Ocorreu um erro GERAL: ${error.message}`);
  }
}

// --- Executa a função principal ---
inserirArquivosDoDriveNoSheets();