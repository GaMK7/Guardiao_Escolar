/* Senhas com bcrypt (RNF02): o banco guarda só o hash, nunca a senha. */
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');

const CUSTO = 12;

// Hash de um texto aleatório, usado no login quando o e-mail não existe: a resposta
// demora o mesmo tanto e não denuncia quais e-mails estão cadastrados.
const HASH_FALSO = '$2b$12$nqqfCnNvWtOJixihpCBMFeQXO4x/gu3NL3Klm6B4BQMmnvv/eZHYe';

function gerarHashSenha(senha) {
  return bcrypt.hash(senha, CUSTO);
}

function conferirSenha(senha, hash) {
  return bcrypt.compare(senha, hash || HASH_FALSO);
}

// Senha provisória de 16 caracteres, para um acesso novo ou para quem esqueceu a senha.
function gerarSenhaProvisoria() {
  return crypto.randomBytes(12).toString('base64url');
}

module.exports = { gerarHashSenha, conferirSenha, gerarSenhaProvisoria };
