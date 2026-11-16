/* Limites por origem (IP) contra robôs: denúncias em massa, adivinhação de códigos e de senhas.
   Arquivo separado: cada arquivo de teste roda num processo próprio, então os contadores
   começam zerados. Todos os pedidos daqui saem do mesmo IP (127.0.0.1). */
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { iniciar } = require('./apoio');
const { blocoDoIp, chaveDaOrigem } = require('../servidor/limite');

const DENUNCIA = { tipo: 'outro', descricao: 'Teste do limite por origem.', data_ocorrencia: '2026-03-12', local: 'outro' };
const ERRADO = { codigo: '2222-2222' };

let ambiente;
let pedir;
let codigo; // código de uma denúncia que existe

before(async () => {
  ambiente = await iniciar();
  ({ pedir } = ambiente);
  await ambiente.criarUsuario({ email: 'diretora@escola.br', nome: 'Diretora', perfil: 'administrador', senha: 'senha-da-diretora' });
});

after(() => ambiente.parar());

describe('Registro de denúncias: 20 por hora por origem', () => {
  test('dado inválido não gasta o limite; a 21ª denúncia recebe 429', async () => {
    for (let i = 0; i < 3; i++) assert.equal((await pedir('POST', '/api/denuncias', { corpo: {} })).status, 400);
    for (let i = 1; i <= 20; i++) {
      const r = await pedir('POST', '/api/denuncias', { corpo: DENUNCIA });
      assert.equal(r.status, 201, 'denúncia ' + i);
      codigo = r.corpo.codigo;
    }
    const r = await pedir('POST', '/api/denuncias', { corpo: DENUNCIA });
    assert.equal(r.status, 429);
    assert.ok(Number(r.cabecalhos.get('retry-after')) > 0);
    assert.equal(r.cabecalhos.get('cache-control'), 'no-store');
    assert.match(r.corpo.erro, /Tente de novo mais tarde/);
  });
});

describe('Consulta pelo código: 30 códigos errados a cada 15 minutos por origem', () => {
  test('código certo não gasta o limite', async () => {
    for (let i = 0; i < 40; i++) {
      assert.equal((await pedir('POST', '/api/denuncias/consulta', { corpo: { codigo } })).status, 200);
    }
  });

  test('formato inválido não gasta o limite', async () => {
    for (let i = 0; i < 40; i++) {
      assert.equal((await pedir('POST', '/api/denuncias/consulta', { corpo: { codigo: '123' } })).status, 400);
    }
  });

  test('40 códigos errados disparados juntos: só 30 chegam ao banco', async () => {
    const respostas = await Promise.all(Array.from({ length: 40 }, () => pedir('POST', '/api/denuncias/consulta', { corpo: ERRADO })));
    const status = respostas.map((r) => r.status);
    assert.equal(status.filter((s) => s === 404).length, 30);
    assert.equal(status.filter((s) => s === 429).length, 10);
  });

  test('depois disso, até o código certo espera', async () => {
    const r = await pedir('POST', '/api/denuncias/consulta', { corpo: { codigo } });
    assert.equal(r.status, 429);
    assert.ok(Number(r.cabecalhos.get('retry-after')) > 0);
    assert.match(r.corpo.erro, /Muitos códigos errados/);
  });
});

describe('Login: 20 erros a cada 15 minutos por origem, além das 5 falhas por e-mail', () => {
  test('login certo não gasta o limite (o teste seguinte só passa se isso valer)', async () => {
    for (let i = 0; i < 3; i++) await ambiente.entrar('diretora@escola.br', 'senha-da-diretora');
  });

  test('uma senha em 25 e-mails diferentes, ao mesmo tempo: 20 erros e depois 429', async () => {
    const respostas = await Promise.all(Array.from({ length: 25 }, (_, i) =>
      pedir('POST', '/api/sessao', { corpo: { email: 'pessoa' + i + '@escola.br', senha: 'senha123' } })
    ));
    const status = respostas.map((r) => r.status);
    assert.equal(status.filter((s) => s === 401).length, 20);
    assert.equal(status.filter((s) => s === 429).length, 5);
    const certo = await pedir('POST', '/api/sessao', { corpo: { email: 'diretora@escola.br', senha: 'senha-da-diretora' } });
    assert.equal(certo.status, 429);
    assert.equal(certo.cookie, null);
  });

  test('sem JavaScript, o formulário volta ao login com ?erro=tentativas', async () => {
    const r = await pedir('POST', '/api/sessao', { form: { email: 'diretora@escola.br', senha: 'senha-da-diretora' } });
    assert.equal(r.status, 303);
    assert.equal(r.cabecalhos.get('location'), '/admin/login.html?erro=tentativas');
  });
});

describe('Origem sem guardar o IP (RN02)', () => {
  test('IPv4 conta pelo endereço; IPv6, pelo bloco /64', () => {
    assert.equal(blocoDoIp('203.0.113.7'), '203.0.113.7');
    assert.equal(blocoDoIp('::ffff:203.0.113.7'), '203.0.113.7');
    assert.equal(blocoDoIp('2001:0db8:00aa:00bb::1'), '2001:db8:aa:bb::/64');
    assert.equal(blocoDoIp('2001:db8:aa:bb:1:2:3:4'), blocoDoIp('2001:db8:aa:bb::99'));
    assert.notEqual(blocoDoIp('2001:db8:aa:bb::1'), blocoDoIp('2001:db8:aa:bc::1'));
    assert.equal(blocoDoIp('2001:db8::1'), '2001:db8:0:0::/64');
    assert.equal(blocoDoIp('fe80::1%eth0'), 'fe80:0:0:0::/64');
  });

  test('a chave da origem é um HMAC: estável, mas sem o IP dentro', () => {
    const chave = chaveDaOrigem({ ip: '203.0.113.7' });
    assert.equal(chave, chaveDaOrigem({ ip: '203.0.113.7' }));
    assert.notEqual(chave, chaveDaOrigem({ ip: '203.0.113.8' }));
    assert.ok(!chave.includes('203.0.113.7'));
    assert.match(chave, /^[A-Za-z0-9_-]{43}$/);
  });
});
