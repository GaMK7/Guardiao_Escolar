/* Rotas de /api/denuncias. */
const express = require('express');
const banco = require('../banco');
const { exigirLogin } = require('../autenticacao');
const { gerarCodigo, hashCodigo } = require('../codigo');
const { validarDenuncia, validarConsulta, validarAndamento, responderInvalido } = require('../validacao');

const rotas = express.Router();
const TENTATIVAS_CODIGO = 3;
const PROTOCOLO = /^\d{4}-\d{4,}$/;

/* POST /api/denuncias — registro público, sem login (RF01).
   Status "recebida" (RN05) e protocolo (RF08) são definidos pelo banco.
   Resposta: 201 { protocolo, codigo } ou 400 { erro, campos }. */
rotas.post('/', async function (req, res) {
  const { dados, erros } = validarDenuncia(req.body);
  if (erros) return responderInvalido(res, erros);

  for (let tentativa = 1; tentativa <= TENTATIVAS_CODIGO; tentativa++) {
    const codigo = gerarCodigo();
    try {
      const { rows } = await banco.query(
        'SELECT protocolo FROM guardiao_mer.criar_registro($1, $2, $3, $4, $5, $6)',
        [dados.vinculo, dados.tipo, dados.descricao, dados.data_ocorrencia, dados.local, hashCodigo(codigo)]
      );
      // O código em texto existe só nesta resposta: não vai para o banco nem para o log (RN01).
      res.set('Cache-Control', 'no-store');
      return res.status(201).json({ protocolo: rows[0].protocolo, codigo: codigo });
    } catch (erro) {
      // Código sorteado já existe (caso raríssimo): sorteia outro.
      if (erro.constraint === 'registro_token_protocolo_hash_key' && tentativa < TENTATIVAS_CODIGO) continue;
      throw erro;
    }
  }
});

/* POST /api/denuncias/consulta — consulta pública pelo código (RF11, RF12).
   O código vai no corpo, não na URL, para não ficar no histórico do navegador nem em logs.
   Não devolve relato, local, vínculo nem autor das providências (RF13).
   Resposta: 200 { protocolo, tipo, status, criado_em, andamentos }, 400 ou 404. */
rotas.post('/consulta', async function (req, res) {
  const { dados, erros } = validarConsulta(req.body);
  if (erros) return responderInvalido(res, erros);

  const { rows } = await banco.query('SELECT * FROM guardiao_mer.consultar_por_token($1)', [hashCodigo(dados.codigo)]);
  res.set('Cache-Control', 'no-store');
  if (!rows.length) {
    return res.status(404).json({ erro: 'Não encontramos nenhuma denúncia com esse código. Confira se digitou certo.' });
  }

  const denuncia = rows[0];
  res.json({
    protocolo: denuncia.protocolo,
    tipo: denuncia.tipo,
    status: denuncia.status,
    criado_em: denuncia.criado_em,
    andamentos: rows.filter((linha) => linha.andamento_em).map((linha) => ({
      status: linha.andamento_status,
      providencia: linha.andamento_providencia,
      criado_em: linha.andamento_em
    }))
  });
});

/* GET /api/denuncias/:protocolo — detalhe completo para a escola (RF18).
   Resposta: 200 com a denúncia e o histórico com autor, 401 ou 404. */
rotas.get('/:protocolo', exigirLogin, async function (req, res, next) {
  if (!PROTOCOLO.test(req.params.protocolo)) return next();

  const { rows } = await banco.query('SELECT * FROM guardiao_mer.detalhar_registro($1)', [req.params.protocolo]);
  if (!rows.length) return res.status(404).json({ erro: 'Denúncia não encontrada.' });

  const denuncia = rows[0];
  res.set('Cache-Control', 'no-store');
  res.json({
    protocolo: denuncia.protocolo,
    tipo: denuncia.tipo,
    status: denuncia.status,
    descricao: denuncia.descricao,
    data_ocorrencia: denuncia.data_ocorrencia,
    local: denuncia.local,
    vinculo: denuncia.vinculo,
    criado_em: denuncia.criado_em,
    andamentos: rows.filter((linha) => linha.andamento_em).map((linha) => ({
      status: linha.andamento_status,
      providencia: linha.andamento_providencia,
      criado_em: linha.andamento_em,
      autor: linha.andamento_autor
    }))
  });
});

/* POST /api/denuncias/:protocolo/andamentos — registra providência e muda o status (RF19, RF20).
   Autor e data-hora são gravados pelo banco, nunca vêm do cliente (RN04).
   Recebe { status, providencia }. Mandar o status atual registra só a providência.
   Resposta: 201 { status, providencia, criado_em, autor }, 400, 401, 403, 404 ou 409. */
rotas.post('/:protocolo/andamentos', exigirLogin, async function (req, res, next) {
  if (!PROTOCOLO.test(req.params.protocolo)) return next();
  const { dados, erros } = validarAndamento(req.body);
  if (erros) return responderInvalido(res, erros);

  try {
    const { rows } = await banco.query(
      'SELECT * FROM guardiao_mer.registrar_andamento($1, $2, $3, $4)',
      [req.params.protocolo, req.administrador.id, dados.status, dados.providencia]
    );
    if (!rows.length) return res.status(404).json({ erro: 'Denúncia não encontrada.' });
    res.status(201).json(rows[0]);
  } catch (erro) {
    if (erro.code === '55000') {
      return res.status(409).json({ erro: 'Essa mudança de status não é permitida. O caminho é Recebida → Em análise → Concluída ou Arquivada.' });
    }
    if (erro.code === '42501') return res.status(403).json({ erro: 'Seu acesso está desativado.' });
    throw erro;
  }
});

// RN03: denúncia não é excluída; para encerrar, usa-se o status "arquivada".
rotas.delete('/:protocolo', function (req, res) {
  res.set('Allow', 'GET');
  res.status(405).json({ erro: 'Denúncias não podem ser excluídas. Para encerrar um caso, use o status Arquivada.' });
});

module.exports = rotas;
