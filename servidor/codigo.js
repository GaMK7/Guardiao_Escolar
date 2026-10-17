/* Código de acompanhamento (RF08, RN01).
   Aparece uma única vez na resposta do registro; o banco guarda só o hash. */
const crypto = require('node:crypto');

// Sem 0, 1, I e O, que se confundem quando a pessoa anota o código.
const ALFABETO = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function gerarCodigo() {
  let codigo = '';
  for (let i = 0; i < 8; i++) codigo += ALFABETO[crypto.randomInt(ALFABETO.length)];
  return codigo.slice(0, 4) + '-' + codigo.slice(4);
}

// HMAC com chave do .env: se o banco vazar, os códigos não podem ser descobertos por tentativa.
// O código é normalizado antes, então "7h2k 9qx4" e "7H2K-9QX4" geram o mesmo hash.
// A consulta pública deve usar esta mesma função para achar a denúncia.
function hashCodigo(codigo) {
  const normalizado = String(codigo).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return crypto.createHmac('sha256', process.env.CODIGO_SEGREDO).update(normalizado).digest('hex');
}

module.exports = { gerarCodigo, hashCodigo };
