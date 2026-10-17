/* Variáveis de ambiente (RNF16): no desenvolvimento vêm do .env; em produção, do servidor. */
const path = require('node:path');

function carregarAmbiente(obrigatorias) {
  try {
    process.loadEnvFile(path.join(__dirname, '..', '.env'));
  } catch (erro) {
    if (erro.code !== 'ENOENT') throw erro;
  }
  for (const nome of obrigatorias) {
    if (!process.env[nome]) {
      console.error('Falta a variável de ambiente ' + nome + '. Veja o .env.example.');
      process.exit(1);
    }
  }
}

module.exports = { carregarAmbiente };
