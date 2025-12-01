const path = require('path');
const { google } = require('googleapis');

// 1. O ESCOPO: Define o nível de permissão que o bot precisa.
//    - drive.metadata.readonly: Permite apenas ler metadados (nomes, IDs, etc.).
//    - drive: Permite acesso total (leitura, escrita, exclusão). Use com cautela!
const SCOPES = ['https://www.googleapis.com/auth/drive.metadata.readonly'];

// 2. O ARQUIVO DE CHAVE: O caminho para o arquivo JSON da sua Conta de Serviço.
const SERVICE_ACCOUNT_KEY_PATH = path.join(process.cwd(), 'service_account_key.json');

/**
 * Função de Autenticação da Conta de Serviço.
 * Usa o arquivo JSON para gerar um cliente autorizado.
 * @returns {google.auth.GoogleAuth} O objeto de autenticação configurado.
 */
function getServiceAccountAuth() {
  // O GoogleAuth cuida do fluxo de autenticação (JWT) com a chave privada.
  const auth = new google.auth.GoogleAuth({
    keyFile: SERVICE_ACCOUNT_KEY_PATH,
    scopes: SCOPES,
  });
  return auth;
}

/**
 * Função Principal para Listar Arquivos.
 * Ela obtém o cliente autenticado e chama a API do Drive.
 * @param {google.auth.JWT} authClient O cliente JWT (autenticado) para a API.
 */
async function listFiles(authClient) {
  try {
    // Inicializa o serviço do Google Drive com a versão v3 e o cliente autenticado.
    const drive = google.drive({ version: 'v3', auth: authClient });

    console.log(`Buscando arquivos para a conta: ${authClient._client_email}...`);

    // 3. CHAMADA À API: Lista até 10 arquivos.
    const res = await drive.files.list({
      // pageSize: Limita o número de resultados.
      pageSize: 10,
      // fields: Otimiza a resposta, solicitando apenas os campos 'id' e 'name'.
      fields: 'nextPageToken, files(id, name)',
    });
    
    const files = res.data.files;
    
    if (files.length === 0) {
      console.log('Nenhum arquivo encontrado.');
      // O motivo mais comum para isso é que a Conta de Serviço (o e-mail que você tem) 
      // ainda não foi adicionada como 'Colaborador' ou 'Leitor' em nenhuma pasta do seu Drive.
      return;
    }

    console.log('\n--- Resultado (Primeiros 10 Arquivos) ---');
    files.map((file) => {
      console.log(`- Nome: ${file.name} | ID: ${file.id}`);
    });
    console.log('-------------------------------------------\n');


  } catch (err) {
    console.error('Ocorreu um erro ao chamar a API:', err.message);
    if (err.code === 403) {
        console.error("Erro de permissão (403). Verifique se a API do Drive está ativada no seu projeto.");
    }
  }
}

// Execução: Obtém o cliente de autenticação e, em seguida, chama listFiles.
// O .getClient() é uma etapa assíncrona que garante que o token de acesso foi gerado.
getServiceAccountAuth().getClient().then(listFiles).catch(console.error);