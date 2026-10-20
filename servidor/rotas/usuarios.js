/* Rotas de /api/usuarios: cadastro e desativação dos usuários da área da escola (RF22).
   Só o perfil administrador usa estas rotas. Usuário não é excluído, só desativado:
   o nome dele continua no histórico das denúncias (RN04). */
const express = require('express');
const banco = require('../banco');
const { exigirLogin, exigirAdministrador } = require('../autenticacao');
const { limparFalhas } = require('../limite');
const { gerarHashSenha, gerarSenhaProvisoria } = require('../senha');
const { validarUsuario, validarSituacao, responderInvalido } = require('../validacao');

const rotas = express.Router();
const ID = /^[1-9]\d{0,17}$/;
const CAMPOS = 'id_administrador AS id, nome, email, perfil, ativo, criado_em';

rotas.use(exigirLogin, exigirAdministrador);

// GET /api/usuarios — todos os usuários, ativos primeiro. Resposta: 200 { usuarios }, 401 ou 403.
rotas.get('/', async function (req, res) {
  const { rows } = await banco.query(
    `SELECT ${CAMPOS} FROM guardiao_mer.administrador ORDER BY ativo DESC, nome, id_administrador`
  );
  res.json({ usuarios: rows });
});

/* POST /api/usuarios — cadastra { nome, email, perfil }, com perfil "responsavel" ou "administrador".
   A senha provisória é gerada aqui e só aparece nesta resposta; a pessoa troca depois (RF23).
   Resposta: 201 { id, nome, email, perfil, ativo, criado_em, senha_provisoria }, 400, 401, 403 ou 409. */
rotas.post('/', async function (req, res) {
  const { dados, erros } = validarUsuario(req.body);
  if (erros) return responderInvalido(res, erros);

  const senha = gerarSenhaProvisoria();
  try {
    const { rows } = await banco.query(
      `INSERT INTO guardiao_mer.administrador (nome, email, perfil, senha_hash)
       VALUES ($1, $2, $3, $4) RETURNING ${CAMPOS}`,
      [dados.nome, dados.email, dados.perfil, await gerarHashSenha(senha)]
    );
    res.status(201).json({ ...rows[0], senha_provisoria: senha });
  } catch (erro) {
    if (erro.constraint === 'administrador_email_key') {
      const mensagem = 'Já existe um acesso com esse e-mail.';
      return res.status(409).json({ erro: mensagem, campos: { email: mensagem } });
    }
    throw erro;
  }
});

/* PATCH /api/usuarios/:id — desativa ou reativa com { ativo }. Desativar encerra as sessões
   da pessoa na hora. Ninguém desativa o próprio acesso, para a escola não ficar sem administrador.
   Resposta: 200 com o usuário, 400, 401, 403, 404 ou 409. */
rotas.patch('/:id', async function (req, res, next) {
  if (!ID.test(req.params.id)) return next();
  const { dados, erros } = validarSituacao(req.body);
  if (erros) return responderInvalido(res, erros);
  if (req.params.id === String(req.administrador.id) && !dados.ativo) {
    return res.status(409).json({ erro: 'Você não pode desativar o seu próprio acesso.' });
  }

  const { rows } = await banco.query(
    `UPDATE guardiao_mer.administrador SET ativo = $1 WHERE id_administrador = $2 RETURNING ${CAMPOS}`,
    [dados.ativo, req.params.id]
  );
  if (!rows.length) return res.status(404).json({ erro: 'Usuário não encontrado.' });
  if (!dados.ativo) await banco.query('DELETE FROM guardiao_mer.sessao WHERE administrador_id = $1', [req.params.id]);
  res.json(rows[0]);
});

/* POST /api/usuarios/:id/senha — gera uma senha provisória nova para quem esqueceu a sua.
   Encerra as sessões abertas da pessoa e libera o login, se estava bloqueado por tentativas.
   Resposta: 200 { senha_provisoria }, 401, 403, 404 ou 409. */
rotas.post('/:id/senha', async function (req, res, next) {
  if (!ID.test(req.params.id)) return next();
  if (req.params.id === String(req.administrador.id)) {
    return res.status(409).json({ erro: 'Para mudar a sua própria senha, use "Trocar senha".' });
  }

  const senha = gerarSenhaProvisoria();
  const { rows } = await banco.query(
    'UPDATE guardiao_mer.administrador SET senha_hash = $1 WHERE id_administrador = $2 RETURNING email',
    [await gerarHashSenha(senha), req.params.id]
  );
  if (!rows.length) return res.status(404).json({ erro: 'Usuário não encontrado.' });
  await banco.query('DELETE FROM guardiao_mer.sessao WHERE administrador_id = $1', [req.params.id]);
  limparFalhas(rows[0].email);
  res.json({ senha_provisoria: senha });
});

module.exports = rotas;
