/* Rotas de /api/conta: a própria conta de quem está logado. */
const express = require('express');
const banco = require('../banco');
const { exigirLogin } = require('../autenticacao');
const { gerarHashSenha, conferirSenha } = require('../senha');
const { validarTrocaSenha, responderInvalido } = require('../validacao');

const rotas = express.Router();

/* PUT /api/conta/senha — troca a própria senha (RF23).
   Encerra as outras sessões do usuário; a atual continua aberta.
   Recebe { senha_atual, senha_nova }. Resposta: 204, 400 { erro, campos }, 401 ou 403. */
rotas.put('/senha', exigirLogin, async function (req, res) {
  const { dados, erros } = validarTrocaSenha(req.body);
  if (erros) return responderInvalido(res, erros);

  const { rows } = await banco.query(
    'SELECT senha_hash FROM guardiao_mer.administrador WHERE id_administrador = $1 AND ativo',
    [req.administrador.id]
  );
  if (!rows.length) return res.status(403).json({ erro: 'Seu acesso está desativado.' });
  if (!(await conferirSenha(dados.senha_atual, rows[0].senha_hash))) {
    return responderInvalido(res, { senha_atual: 'A senha atual não confere.' });
  }

  await banco.query(
    'UPDATE guardiao_mer.administrador SET senha_hash = $1 WHERE id_administrador = $2',
    [await gerarHashSenha(dados.senha_nova), req.administrador.id]
  );
  await banco.query(
    'DELETE FROM guardiao_mer.sessao WHERE administrador_id = $1 AND id_sessao <> $2',
    [req.administrador.id, req.administrador.sessao]
  );
  res.status(204).end();
});

module.exports = rotas;
