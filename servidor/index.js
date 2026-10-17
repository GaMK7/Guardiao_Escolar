/* Ponto de entrada: carrega as variáveis de ambiente e sobe o servidor. */
const path = require('node:path');

// No desenvolvimento lê o .env; em produção as variáveis vêm do ambiente (RNF16).
try {
  process.loadEnvFile(path.join(__dirname, '..', '.env'));
} catch (erro) {
  if (erro.code !== 'ENOENT') throw erro;
}

for (const nome of ['DATABASE_URL', 'CODIGO_SEGREDO']) {
  if (!process.env[nome]) {
    console.error('Falta a variável de ambiente ' + nome + '. Veja o .env.example.');
    process.exit(1);
  }
}
if (process.env.CODIGO_SEGREDO.length < 32) {
  console.error('CODIGO_SEGREDO precisa ter pelo menos 32 caracteres. Veja o .env.example.');
  process.exit(1);
}

const app = require('./app');
const porta = Number(process.env.PORT) || 3000;

app.listen(porta, function (erro) {
  if (erro) throw erro;
  console.log('Guardião Escolar rodando em http://localhost:' + porta);
});
