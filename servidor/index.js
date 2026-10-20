/* Ponto de entrada: carrega as variáveis de ambiente e sobe o servidor. */
const { carregarAmbiente } = require('./ambiente');

carregarAmbiente(['DATABASE_URL', 'CODIGO_SEGREDO']);
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
