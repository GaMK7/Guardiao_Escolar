/* Rotas de /api/sessao: login e saída da área da escola (RF14). */
const express = require('express');
const banco = require('../banco');
const { criarSessao, encerrarSessao, exigirLogin } = require('../autenticacao');
const { segundosBloqueado, registrarFalha, limparFalhas } = require('../limite');
const { conferirSenha } = require('../senha');
const { validarLogin, responderInvalido } = require('../validacao');

const rotas = express.Router();
const PAGINA_LOGIN = '/admin/login.html';
const PAGINA_INICIAL = '/denuncias.html';

/* POST /api/sessao — entra com { email, senha }.
   Pedido JSON: 201 { email }, 400, 401 ou 429.
   Formulário do admin/login.html (sem JavaScript): redireciona para a lista,
   ou de volta ao login com ?erro=credenciais ou ?erro=tentativas.
   A mensagem de erro é sempre a mesma, para não revelar se o e-mail existe. */
rotas.post('/', async function (req, res) {
  const formulario = Boolean(req.is('application/x-www-form-urlencoded'));
  function recusar(status, erro, motivo) {
    if (formulario) return res.redirect(303, PAGINA_LOGIN + '?erro=' + motivo);
    return res.status(status).json({ erro });
  }

  const { dados, erros } = validarLogin(req.body);
  if (erros) return formulario ? res.redirect(303, PAGINA_LOGIN + '?erro=credenciais') : responderInvalido(res, erros);

  const espera = segundosBloqueado(dados.email);
  if (espera) {
    res.set('Retry-After', String(espera));
    return recusar(429, 'Muitas tentativas erradas. Espere alguns minutos e tente de novo.', 'tentativas');
  }

  const { rows } = await banco.query(
    'SELECT id_administrador, senha_hash FROM guardiao_mer.administrador WHERE email = $1 AND ativo',
    [dados.email]
  );
  // Confere a senha mesmo sem usuário, para a resposta demorar o mesmo tanto.
  const senhaConfere = await conferirSenha(dados.senha, rows[0] && rows[0].senha_hash);
  if (!rows.length || !senhaConfere) {
    registrarFalha(dados.email);
    return recusar(401, 'E-mail ou senha incorretos.', 'credenciais');
  }

  limparFalhas(dados.email);
  await criarSessao(res, rows[0].id_administrador);
  if (formulario) return res.redirect(303, PAGINA_INICIAL);
  res.status(201).json({ email: dados.email });
});

/* GET /api/sessao — quem está logado. Serve para as telas da escola
   saberem se mostram a página ou mandam para o login. Resposta: 200 { email } ou 401. */
rotas.get('/', exigirLogin, function (req, res) {
  res.json({ email: req.administrador.email });
});

// DELETE /api/sessao — sai. Resposta: 204, mesmo se já não havia sessão.
rotas.delete('/', async function (req, res) {
  await encerrarSessao(req, res);
  res.status(204).end();
});

// GET /api/sessao/sair — o mesmo, para o link "Sair" das telas: volta para o login.
rotas.get('/sair', async function (req, res) {
  await encerrarSessao(req, res);
  res.redirect(303, PAGINA_LOGIN);
});

module.exports = rotas;
