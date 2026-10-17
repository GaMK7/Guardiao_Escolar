/* Aplicação Express: API e telas do front. */
const path = require('node:path');
const express = require('express');
const { carregarSessao } = require('./autenticacao');
const rotasDenuncias = require('./rotas/denuncias');
const rotasConta = require('./rotas/conta');
const rotasSessao = require('./rotas/sessao');

const app = express();
app.disable('x-powered-by');

// Sem logger de requisições: denúncia anônima não pode deixar IP registrado (RN02).
app.use(express.json({ limit: '10kb' }));
// Envio do formulário sem JavaScript (action do denuncia.html).
app.use(express.urlencoded({ extended: false, limit: '10kb' }));

// Identifica quem está logado; cada rota da escola exige isso com exigirLogin (RNF07).
app.use('/api', carregarSessao);
app.use('/api/sessao', rotasSessao);
app.use('/api/denuncias', rotasDenuncias);
app.use('/api/conta', rotasConta);

app.use('/api', function (req, res) {
  res.status(404).json({ erro: 'Rota não encontrada.' });
});

// Telas do front. Só estas pastas e as páginas .html da raiz ficam públicas,
// nunca o resto do repositório (.env, servidor/, package.json).
const raiz = path.join(__dirname, '..');
for (const pasta of ['css', 'js', 'img', 'admin']) {
  app.use('/' + pasta, express.static(path.join(raiz, pasta)));
}
app.get('/', function (req, res) {
  res.sendFile('index.html', { root: raiz });
});
// Telas da escola: sem login, vai para a tela de login (RF15).
app.get(['/denuncias.html', '/detalhe.html'], carregarSessao, function (req, res, next) {
  if (!req.administrador) return res.redirect(303, '/admin/login.html');
  next();
});
app.get('/:pagina.html', function (req, res, next) {
  if (!/^[a-z0-9-]+$/.test(req.params.pagina)) return next();
  res.sendFile(req.params.pagina + '.html', { root: raiz });
});

const MENSAGENS = {
  400: 'Requisição inválida.',
  404: 'Não encontrado.',
  413: 'O conteúdo enviado é grande demais.'
};

// Nunca registra o corpo da requisição nem o "detail" do banco: os dois podem conter o relato.
app.use(function (erro, req, res, next) {
  const status = erro.status || erro.statusCode || 500;
  if (status >= 500) {
    console.error('Erro interno:', erro.code || '', erro.message);
    return res.status(500).json({ erro: 'Não foi possível concluir agora. Tente de novo em instantes.' });
  }
  res.status(status).json({ erro: MENSAGENS[status] || MENSAGENS[400] });
});

module.exports = app;
