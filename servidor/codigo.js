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

// "7h2k 9qx4" e "7H2K-9QX4" viram "7H2K9QX4".
function normalizarCodigo(codigo) {
  return String(codigo).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// HMAC com chave do .env: se o banco vazar, os códigos não podem ser descobertos por tentativa.
// O registro e a consulta pública usam esta mesma função.
function hashCodigo(codigo) {
  return crypto.createHmac('sha256', process.env.CODIGO_SEGREDO).update(normalizarCodigo(codigo)).digest('hex');
}

module.exports = { gerarCodigo, normalizarCodigo, hashCodigo };
