/* Bloqueio de login por conta e por aparelho (RF14).
   Arquivo separado: cada arquivo de teste roda num processo próprio, então os contadores
   começam zerados. Os blocos rodam em ordem e dependem do estado deixado pelo anterior. */
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { iniciar } = require('./apoio');

let ambiente;
let pedir;
let aparelhoDiretora; // cookie ge_aparelho=... de um navegador onde a diretora já entrou
let cookieDiretora;

function login(email, senha, cookie) {
  return pedir('POST', '/api/sessao', { corpo: { email, senha }, cookie });
}

function cookieAparelho(resposta) {
  const definido = resposta.cabecalhos.getSetCookie().find((c) => c.startsWith('ge_aparelho='));
  return definido || '';
}

before(async () => {
  ambiente = await iniciar();
  ({ pedir } = ambiente);
  await ambiente.criarUsuario({ email: 'diretora@escola.br', nome: 'Diretora', perfil: 'administrador', senha: 'senha-da-diretora' });
  await ambiente.criarUsuario({ email: 'alvo@escola.br', nome: 'Alvo', perfil: 'responsavel', senha: 'senha-do-alvo' });
});

after(() => ambiente.parar());

describe('Tentativas ao mesmo tempo', () => {
  test('10 senhas erradas disparadas juntas para a mesma conta: só 5 chegam a conferir a senha', async () => {
    const respostas = await Promise.all(Array.from({ length: 10 }, (_, i) => login('alvo@escola.br', 'chute-' + i)));
    const status = respostas.map((r) => r.status);
    assert.equal(status.filter((s) => s === 401).length, 5);
    assert.equal(status.filter((s) => s === 429).length, 5);
  });

  test('com a conta bloqueada, nem a senha certa entra por um navegador desconhecido', async () => {
    const r = await login('alvo@escola.br', 'senha-do-alvo');
    assert.equal(r.status, 429);
    assert.ok(Number(r.cabecalhos.get('retry-after')) > 0);
    assert.equal(r.cookie, null);
  });
});

describe('Cookie de aparelho: quem já entrou por este navegador não fica trancado do lado de fora', () => {
  before(async () => {
    const r = await login('diretora@escola.br', 'senha-da-diretora');
    assert.equal(r.status, 201);
    cookieDiretora = r.cookie;
    aparelhoDiretora = cookieAparelho(r).split(';')[0];
  });

  test('o login certo grava um cookie HttpOnly, só para /api/sessao, sem o e-mail dentro', async () => {
    const r = await login('diretora@escola.br', 'senha-da-diretora');
    const definido = cookieAparelho(r);
    assert.match(definido, /HttpOnly/i);
    assert.match(definido, /SameSite=Strict/i);
    assert.match(definido, /Path=\/api\/sessao(;|$)/);
    assert.match(definido, /Max-Age=\d{6,}/);
    assert.ok(!/diretora|escola/i.test(decodeURIComponent(definido)));
  });

  test('alguém bloqueia a conta errando a senha; o navegador conhecido ainda entra', async () => {
    for (let i = 0; i < 5; i++) assert.equal((await login('diretora@escola.br', 'errada-' + i)).status, 401);
    assert.equal((await login('diretora@escola.br', 'senha-da-diretora')).status, 429);

    const r = await login('diretora@escola.br', 'senha-da-diretora', aparelhoDiretora);
    assert.equal(r.status, 201);
    assert.ok(r.cookie);
  });

  test('o cookie só vale para o e-mail de quem entrou por ele', async () => {
    assert.equal((await login('alvo@escola.br', 'senha-do-alvo', aparelhoDiretora)).status, 429);
  });

  test('cookie adulterado é ignorado', async () => {
    const [nome, valor] = aparelhoDiretora.split('=');
    const [id, assinatura] = valor.split('.');
    const trocada = (assinatura[0] === 'A' ? 'B' : 'A') + assinatura.slice(1);
    assert.equal((await login('diretora@escola.br', 'senha-da-diretora', nome + '=' + id + '.' + trocada)).status, 429);
    assert.equal((await login('diretora@escola.br', 'senha-da-diretora', nome + '=x' + id.slice(1) + '.' + assinatura)).status, 429);
  });

  test('o aparelho também tem limite: depois de 5 erros, vale o bloqueio da conta', async () => {
    for (let i = 0; i < 5; i++) {
      assert.equal((await login('diretora@escola.br', 'errada-' + i, aparelhoDiretora)).status, 401);
    }
    assert.equal((await login('diretora@escola.br', 'senha-da-diretora', aparelhoDiretora)).status, 429);
  });
});

describe('Senha nova gerada pelo administrador', () => {
  test('libera a conta bloqueada na hora, de qualquer navegador', async () => {
    const { rows } = await ambiente.db.query("SELECT id_administrador FROM guardiao_mer.administrador WHERE email = 'alvo@escola.br'");
    const r = await pedir('POST', '/api/usuarios/' + rows[0].id_administrador + '/senha', { cookie: cookieDiretora });
    assert.equal(r.status, 200);
    assert.equal((await login('alvo@escola.br', r.corpo.senha_provisoria)).status, 201);
  });
});
