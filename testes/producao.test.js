/* HTTPS em produção (RNF01). Arquivo separado porque o app lê o NODE_ENV ao carregar.
   Na hospedagem, o proxy com o certificado avisa por X-Forwarded-Proto como o pedido chegou. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { iniciar } = require('./apoio');

const HTTPS = { 'X-Forwarded-Proto': 'https' };
let ambiente;

before(async () => {
  ambiente = await iniciar({ NODE_ENV: 'production' });
  await ambiente.criarUsuario({ email: 'diretora@escola.br', nome: 'Diretora', perfil: 'administrador', senha: 'senha-da-diretora' });
});

after(() => ambiente.parar());

test('pedido por HTTP é redirecionado para HTTPS, mantendo o caminho', async () => {
  const r = await ambiente.pedir('GET', '/consultar.html?x=1');
  assert.equal(r.status, 308);
  assert.equal(r.cabecalhos.get('location'), 'https://' + new URL(ambiente.base).host + '/consultar.html?x=1');
});

test('nada da API responde por HTTP', async () => {
  const r = await ambiente.pedir('POST', '/api/sessao', { corpo: { email: 'diretora@escola.br', senha: 'senha-da-diretora' } });
  assert.equal(r.status, 308);
  assert.equal(r.cookie, null);
});

test('por HTTPS a página abre, com HSTS', async () => {
  const r = await ambiente.pedir('GET', '/consultar.html', { cabecalhos: HTTPS });
  assert.equal(r.status, 200);
  assert.match(r.cabecalhos.get('strict-transport-security'), /max-age=\d+/);
});

/* O proxy acrescenta o IP real ao fim do X-Forwarded-For, e o servidor só confia nele.
   Um X-Forwarded-For inventado pelo visitante fica à esquerda e não muda a origem. */
test('o limite conta pelo IP que o proxy informa, e não se burla com X-Forwarded-For falso', async () => {
  const DENUNCIA = { tipo: 'outro', descricao: 'Teste do limite atrás do proxy.', data_ocorrencia: '2026-03-12', local: 'outro' };
  const vindoDe = (cadeia) => ({ corpo: DENUNCIA, cabecalhos: { ...HTTPS, 'X-Forwarded-For': cadeia } });

  for (let i = 1; i <= 20; i++) {
    assert.equal((await ambiente.pedir('POST', '/api/denuncias', vindoDe('203.0.113.7'))).status, 201, 'denúncia ' + i);
  }
  assert.equal((await ambiente.pedir('POST', '/api/denuncias', vindoDe('203.0.113.7'))).status, 429);
  assert.equal((await ambiente.pedir('POST', '/api/denuncias', vindoDe('198.51.100.9, 203.0.113.7'))).status, 429);
  assert.equal((await ambiente.pedir('POST', '/api/denuncias', vindoDe('198.51.100.9'))).status, 201);
});

test('o cookie de login só trafega por HTTPS (Secure)', async () => {
  const r = await ambiente.pedir('POST', '/api/sessao', {
    corpo: { email: 'diretora@escola.br', senha: 'senha-da-diretora' },
    cabecalhos: HTTPS
  });
  assert.equal(r.status, 201);
  assert.match(r.setCookie, /;\s*Secure/i);
});
