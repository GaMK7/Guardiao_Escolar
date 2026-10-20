/* Apoio dos testes: um PostgreSQL em memória (PGlite) com o script do banco, e o servidor
   de verdade numa porta livre. Não usa o Neon nem o .env: cada arquivo de teste começa vazio. */
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const RAIZ = path.join(__dirname, '..');

/* Sobe banco e servidor. "variaveis" entra no ambiente antes de carregar o app
   (por exemplo, NODE_ENV=production). */
async function iniciar(variaveis = {}) {
  const { PGlite } = await import('@electric-sql/pglite');
  const { PGLiteSocketServer } = await import('@electric-sql/pglite-socket');

  const db = new PGlite();
  await db.exec('SET client_min_messages = error');
  await db.exec(fs.readFileSync(path.join(RAIZ, 'guardiao-escolar-postgresql.sql'), 'utf8'));
  const socket = new PGLiteSocketServer({ db, port: 0, host: '127.0.0.1', maxConnections: 20 });
  await socket.start();

  Object.assign(process.env, {
    DATABASE_URL: `postgresql://postgres:postgres@127.0.0.1:${socket.port}/postgres`,
    CODIGO_SEGREDO: 'segredo-usado-so-nos-testes-com-mais-de-32-caracteres'
  }, variaveis);
  const app = require('../servidor/app');
  const banco = require('../servidor/banco');
  const { gerarHashSenha } = require('../servidor/senha');
  const servidor = await new Promise((pronto) => {
    const http = app.listen(0, '127.0.0.1', () => pronto(http));
  });
  const base = 'http://127.0.0.1:' + servidor.address().port;

  /* Faz um pedido e devolve { status, corpo (JSON), texto, cabecalhos, cookie }.
     "cookie" é o ge_sessao=... que o servidor mandou, pronto para o próximo pedido. */
  async function pedir(metodo, url, { corpo, cookie, form, cabecalhos } = {}) {
    const headers = { ...cabecalhos };
    let body;
    if (form) body = new URLSearchParams(form);
    else if (corpo !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(corpo);
    }
    if (cookie) headers.Cookie = cookie;
    const resposta = await fetch(base + url, { method: metodo, headers, body, redirect: 'manual' });
    const texto = await resposta.text();
    let json = null;
    try {
      json = texto ? JSON.parse(texto) : null;
    } catch {
      json = null;
    }
    const definido = resposta.headers.getSetCookie().find((c) => c.startsWith('ge_sessao='));
    return {
      status: resposta.status,
      corpo: json,
      texto,
      cabecalhos: resposta.headers,
      setCookie: definido || '',
      cookie: definido ? definido.split(';')[0] : null
    };
  }

  // Cria um usuário direto no banco, como o npm run criar-admin faria.
  async function criarUsuario({ email, nome, perfil, senha }) {
    await db.query(
      'INSERT INTO guardiao_mer.administrador (email, nome, perfil, senha_hash) VALUES ($1, $2, $3, $4)',
      [email, nome, perfil, await gerarHashSenha(senha)]
    );
  }

  async function entrar(email, senha) {
    const resposta = await pedir('POST', '/api/sessao', { corpo: { email, senha } });
    if (resposta.status !== 201) throw new Error('login falhou: ' + resposta.texto);
    return resposta.cookie;
  }

  // Roda um script de servidor/ (como o criar-admin) apontando para o banco de teste.
  function rodarScript(arquivo, argumentos) {
    return new Promise((terminou) => {
      const processo = spawn(process.execPath, [path.join(RAIZ, 'servidor', arquivo), ...argumentos], { env: process.env });
      let saida = '';
      processo.stdout.on('data', (d) => (saida += d));
      processo.stderr.on('data', (d) => (saida += d));
      processo.on('close', (codigo) => terminou({ codigo, saida }));
    });
  }

  async function parar() {
    await new Promise((fechou) => servidor.close(fechou));
    await banco.end();
    await socket.stop();
    await db.close();
  }

  return { db, base, pedir, criarUsuario, entrar, rodarScript, parar };
}

module.exports = { iniciar };
