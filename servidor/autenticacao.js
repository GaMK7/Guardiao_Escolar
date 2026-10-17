/* Sessões e controle de acesso da área da escola (RF14, RF15, RNF07).
   O navegador guarda um token aleatório num cookie HttpOnly; o banco guarda só o hash dele. */
const crypto = require('node:crypto');
const banco = require('./banco');

const NOME_COOKIE = 'ge_sessao';
const DURACAO_HORAS = 8;
const FORMATO_TOKEN = /^[A-Za-z0-9_-]{43}$/;

// SameSite=Strict: o cookie não vai em pedidos vindos de outros sites (proteção contra CSRF).
// Secure em produção: o cookie só trafega por HTTPS (RNF01).
function opcoesCookie() {
  return { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/' };
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function lerToken(req) {
  for (const parte of (req.headers.cookie || '').split(';')) {
    const [nome, valor] = parte.trim().split('=');
    if (nome === NOME_COOKIE && FORMATO_TOKEN.test(valor || '')) return valor;
  }
  return null;
}

async function criarSessao(res, idAdministrador) {
  const token = crypto.randomBytes(32).toString('base64url');
  await banco.query('DELETE FROM guardiao_mer.sessao WHERE expira_em < now()');
  await banco.query(
    `INSERT INTO guardiao_mer.sessao (administrador_id, token_hash, expira_em)
     VALUES ($1, $2, now() + make_interval(hours => $3))`,
    [idAdministrador, hashToken(token), DURACAO_HORAS]
  );
  res.cookie(NOME_COOKIE, token, { ...opcoesCookie(), maxAge: DURACAO_HORAS * 60 * 60 * 1000 });
}

async function encerrarSessao(req, res) {
  const token = lerToken(req);
  if (token) await banco.query('DELETE FROM guardiao_mer.sessao WHERE token_hash = $1', [hashToken(token)]);
  res.clearCookie(NOME_COOKIE, opcoesCookie());
}

/* Lê o cookie e, se a sessão vale e o usuário está ativo, preenche
   req.administrador = { id, email, sessao }. Não bloqueia nada sozinho. */
async function carregarSessao(req, res, next) {
  const token = lerToken(req);
  if (!token) return next();
  const { rows } = await banco.query(
    `SELECT s.id_sessao, a.id_administrador, a.email
       FROM guardiao_mer.sessao s
       JOIN guardiao_mer.administrador a ON a.id_administrador = s.administrador_id
      WHERE s.token_hash = $1 AND s.expira_em > now() AND a.ativo`,
    [hashToken(token)]
  );
  if (rows.length) {
    req.administrador = { id: rows[0].id_administrador, email: rows[0].email, sessao: rows[0].id_sessao };
  }
  next();
}

// Rotas da escola: sem sessão válida, 401.
function exigirLogin(req, res, next) {
  if (req.administrador) return next();
  res.status(401).json({ erro: 'Faça login para continuar.' });
}

module.exports = { criarSessao, encerrarSessao, carregarSessao, exigirLogin };
