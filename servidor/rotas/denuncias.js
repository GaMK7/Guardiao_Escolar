/* Rotas de /api/denuncias. */
const express = require('express');
const banco = require('../banco');
const { gerarCodigo, hashCodigo } = require('../codigo');
const { validarDenuncia } = require('../validacao');

const rotas = express.Router();
const TENTATIVAS_CODIGO = 3;

/* POST /api/denuncias — registro público, sem login (RF01).
   Status "recebida" (RN05) e protocolo (RF08) são definidos pelo banco.
   Resposta: 201 { protocolo, codigo } ou 400 { erro, campos }. */
rotas.post('/', async function (req, res) {
  const { dados, erros } = validarDenuncia(req.body);
  if (erros) {
    return res.status(400).json({ erro: 'Confira os campos indicados.', campos: erros });
  }

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

module.exports = rotas;
