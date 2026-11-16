/* Rotas de /api/sessao: login e saída da área da escola (RF14). */
const express = require('express');
const banco = require('../banco');
const { criarSessao, encerrarSessao, exigirLogin, lembrarAparelho, aparelhoConhecido } = require('../autenticacao');
const { chaveDaOrigem, reservarLogin } = require('../limite');
const { conferirSenha } = require('../senha');
const { validarLogin, responderInvalido } = require('../validacao');

const rotas = express.Router();
const PAGINA_LOGIN = '/admin/login.html';
const PAGINA_INICIAL = '/denuncias.html';

/* POST /api/sessao — entra com { email, senha }.
   Pedido JSON: 201 { nome, email, perfil }, 400, 401 ou 429.
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

  // A tentativa conta já aqui, antes do bcrypt: pedidos simultâneos não passam juntos pelo limite.
  const tentativa = reservarLogin({
    email: dados.email,
    aparelho: aparelhoConhecido(req, dados.email),
    origem: chaveDaOrigem(req)
  });
  if (tentativa.espera) {
    res.set('Retry-After', String(tentativa.espera));
    return recusar(429, 'Muitas tentativas erradas. Espere alguns minutos e tente de novo.', 'tentativas');
  }

  const { rows } = await banco.query(
    'SELECT id_administrador, senha_hash, nome, perfil FROM guardiao_mer.administrador WHERE email = $1 AND ativo',
    [dados.email]
  );
  // Confere a senha mesmo sem usuário, para a resposta demorar o mesmo tanto.
  const senhaConfere = await conferirSenha(dados.senha, rows[0] && rows[0].senha_hash);
  if (!rows.length || !senhaConfere) return recusar(401, 'E-mail ou senha incorretos.', 'credenciais');

  tentativa.acertou();
  await criarSessao(res, rows[0].id_administrador);
  lembrarAparelho(res, dados.email);
  if (formulario) return res.redirect(303, PAGINA_INICIAL);
  res.status(201).json({ nome: rows[0].nome, email: dados.email, perfil: rows[0].perfil });
});

/* GET /api/sessao — quem está logado. Serve para as telas da escola mostrarem o nome
   e saberem se mandam para o login. Resposta: 200 { nome, email, perfil } ou 401. */
rotas.get('/', exigirLogin, function (req, res) {
  const { nome, email, perfil } = req.administrador;
  res.json({ nome, email, perfil });
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
