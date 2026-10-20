/* Testes de funcionamento da API, um bloco por grupo de requisitos do escopo.
   Rodam com "npm test" num PostgreSQL em memória: não precisam do Neon nem do .env.
   Os blocos rodam em ordem e compartilham o banco. */
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { iniciar } = require('./apoio');

const DENUNCIA = {
  tipo: 'cyberbullying',
  descricao: 'Criaram um grupo só para tirar print das minhas mensagens e rir.',
  data_ocorrencia: '2026-03-12',
  local: 'internet',
  vinculo: 'aluno'
};
const CODIGO = /^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/;

let ambiente;
let pedir;
let db;
let cookieAdmin;
let cookieAna;
let denuncia; // { protocolo, codigo } da primeira denúncia registrada

before(async () => {
  ambiente = await iniciar();
  ({ pedir, db } = ambiente);
  await ambiente.criarUsuario({ email: 'diretora@escola.br', nome: 'Diretora Marta', perfil: 'administrador', senha: 'senha-da-diretora' });
  await ambiente.criarUsuario({ email: 'coordenacao@escola.br', nome: 'Ana Paula', perfil: 'responsavel', senha: 'senha-da-ana' });
  cookieAdmin = await ambiente.entrar('diretora@escola.br', 'senha-da-diretora');
  cookieAna = await ambiente.entrar('coordenacao@escola.br', 'senha-da-ana');
});

after(() => ambiente.parar());

describe('Registro da denúncia (RF01, RF08, RF10, RN01, RN02, RN05)', () => {
  test('qualquer pessoa registra, sem login, e recebe protocolo e código', async () => {
    const r = await pedir('POST', '/api/denuncias', { corpo: DENUNCIA });
    assert.equal(r.status, 201);
    assert.match(r.corpo.protocolo, /^\d{4}-\d{4,}$/);
    assert.match(r.corpo.codigo, CODIGO);
    assert.equal(r.cabecalhos.get('cache-control'), 'no-store');
    denuncia = r.corpo;
  });

  test('nasce como "recebida" e o banco guarda só o hash do código', async () => {
    const { rows } = await db.query('SELECT * FROM guardiao_mer.registro WHERE protocolo = $1', [denuncia.protocolo]);
    assert.equal(rows[0].status, 'recebida');
    assert.match(rows[0].token_protocolo_hash, /^[0-9a-f]{64}$/);
    assert.ok(!JSON.stringify(rows[0]).includes(denuncia.codigo.replace('-', '')));
  });

  test('descarta nome, contato e status enviados pelo cliente', async () => {
    const r = await pedir('POST', '/api/denuncias', {
      corpo: { ...DENUNCIA, nome: 'Fulano de Tal', contato: 'fulano@exemplo.com', status: 'concluida', anonima: false }
    });
    assert.equal(r.status, 201);
    const { rows } = await db.query(
      `SELECT r.*, d.classificacao FROM guardiao_mer.registro r
       LEFT JOIN guardiao_mer.denunciante d ON d.id_denunciante = r.denunciante_id WHERE r.protocolo = $1`,
      [r.corpo.protocolo]
    );
    assert.equal(rows[0].status, 'recebida');
    assert.ok(!/Fulano|fulano@exemplo/.test(JSON.stringify(rows[0])));
  });

  test('o vínculo é opcional', async () => {
    const r = await pedir('POST', '/api/denuncias', { corpo: { ...DENUNCIA, vinculo: '' } });
    assert.equal(r.status, 201);
    const { rows } = await db.query('SELECT denunciante_id FROM guardiao_mer.registro WHERE protocolo = $1', [r.corpo.protocolo]);
    assert.equal(rows[0].denunciante_id, null);
  });
});

describe('Validação no servidor (RF03, RF06, RNF03, RNF04)', () => {
  test('campos obrigatórios vazios: 400 com uma mensagem por campo', async () => {
    const r = await pedir('POST', '/api/denuncias', { corpo: {} });
    assert.equal(r.status, 400);
    assert.deepEqual(Object.keys(r.corpo.campos).sort(), ['data_ocorrencia', 'descricao', 'local', 'tipo']);
  });

  test('tipo fora da lista, data futura e relato longo são recusados', async () => {
    const r = await pedir('POST', '/api/denuncias', {
      corpo: { ...DENUNCIA, tipo: 'briga', data_ocorrencia: '2999-01-01', descricao: 'x'.repeat(2001) }
    });
    assert.equal(r.status, 400);
    assert.deepEqual(Object.keys(r.corpo.campos).sort(), ['data_ocorrencia', 'descricao', 'tipo']);
  });

  test('texto com cara de SQL é gravado como texto (consulta parametrizada)', async () => {
    const descricao = "'); DROP TABLE guardiao_mer.registro; --";
    const r = await pedir('POST', '/api/denuncias', { corpo: { ...DENUNCIA, descricao } });
    assert.equal(r.status, 201);
    const detalhe = await pedir('GET', '/api/denuncias/' + r.corpo.protocolo, { cookie: cookieAna });
    assert.equal(detalhe.corpo.descricao, descricao);
  });

  test('JSON quebrado: 400', async () => {
    const quebrado = await fetch(ambiente.base + '/api/denuncias', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"tipo":'
    });
    assert.equal(quebrado.status, 400);
  });
});

describe('Consulta pública pelo código (RF11, RF12, RF13)', () => {
  test('aceita o código com minúsculas e sem hífen', async () => {
    const r = await pedir('POST', '/api/denuncias/consulta', { corpo: { codigo: denuncia.codigo.replace('-', '').toLowerCase() } });
    assert.equal(r.status, 200);
    assert.equal(r.corpo.protocolo, denuncia.protocolo);
    assert.equal(r.corpo.status, 'recebida');
    assert.deepEqual(r.corpo.andamentos, []);
  });

  test('não devolve relato, local nem vínculo', async () => {
    const r = await pedir('POST', '/api/denuncias/consulta', { corpo: { codigo: denuncia.codigo } });
    assert.deepEqual(Object.keys(r.corpo).sort(), ['andamentos', 'criado_em', 'protocolo', 'status', 'tipo']);
  });

  test('código inexistente: 404; formato errado: 400', async () => {
    assert.equal((await pedir('POST', '/api/denuncias/consulta', { corpo: { codigo: '2222-2222' } })).status, 404);
    assert.equal((await pedir('POST', '/api/denuncias/consulta', { corpo: { codigo: '123' } })).status, 400);
  });
});

describe('Login e controle de acesso (RF14, RF15, RNF02, RNF07)', () => {
  test('senha errada e e-mail inexistente têm a mesma resposta', async () => {
    const errada = await pedir('POST', '/api/sessao', { corpo: { email: 'coordenacao@escola.br', senha: 'nao-e-essa' } });
    const inexistente = await pedir('POST', '/api/sessao', { corpo: { email: 'ninguem@escola.br', senha: 'nao-e-essa' } });
    assert.equal(errada.status, 401);
    assert.deepEqual(errada.corpo, inexistente.corpo);
  });

  test('a senha fica no banco só como hash bcrypt', async () => {
    const { rows } = await db.query('SELECT senha_hash FROM guardiao_mer.administrador');
    assert.ok(rows.every((linha) => /^\$2[aby]\$/.test(linha.senha_hash)));
  });

  test('o cookie de sessão é HttpOnly e SameSite=Strict', async () => {
    const r = await pedir('POST', '/api/sessao', { corpo: { email: 'coordenacao@escola.br', senha: 'senha-da-ana' } });
    assert.match(r.setCookie, /HttpOnly/i);
    assert.match(r.setCookie, /SameSite=Strict/i);
    const sessao = await pedir('GET', '/api/sessao', { cookie: r.cookie });
    assert.deepEqual(sessao.corpo, { nome: 'Ana Paula', email: 'coordenacao@escola.br', perfil: 'responsavel' });
  });

  test('sem login, toda rota da escola responde 401', async () => {
    const rotas = [
      ['GET', '/api/sessao'],
      ['GET', '/api/denuncias'],
      ['GET', '/api/denuncias/resumo'],
      ['GET', '/api/denuncias/' + denuncia.protocolo],
      ['POST', '/api/denuncias/' + denuncia.protocolo + '/andamentos'],
      ['PUT', '/api/conta/senha'],
      ['GET', '/api/usuarios'],
      ['POST', '/api/usuarios'],
      ['PATCH', '/api/usuarios/1'],
      ['POST', '/api/usuarios/1/senha']
    ];
    for (const [metodo, url] of rotas) {
      const r = await pedir(metodo, url, { corpo: metodo === 'GET' ? undefined : {} });
      assert.equal(r.status, 401, metodo + ' ' + url);
    }
  });

  test('sem login, as telas da escola mandam para o login', async () => {
    for (const tela of ['/denuncias.html', '/detalhe.html', '/usuarios.html', '/senha.html']) {
      const r = await pedir('GET', tela);
      assert.equal(r.status, 303, tela);
      assert.equal(r.cabecalhos.get('location'), '/admin/login.html');
    }
    assert.equal((await pedir('GET', '/denuncias.html', { cookie: cookieAna })).status, 200);
  });

  test('depois de 5 senhas erradas, o login fica bloqueado (429)', async () => {
    await ambiente.criarUsuario({ email: 'bloqueio@escola.br', nome: 'Bloqueio', perfil: 'responsavel', senha: 'senha-certa-1' });
    for (let i = 0; i < 5; i++) await pedir('POST', '/api/sessao', { corpo: { email: 'bloqueio@escola.br', senha: 'errada' + i } });
    const r = await pedir('POST', '/api/sessao', { corpo: { email: 'bloqueio@escola.br', senha: 'senha-certa-1' } });
    assert.equal(r.status, 429);
    assert.ok(Number(r.cabecalhos.get('retry-after')) > 0);
  });

  test('sair encerra a sessão no banco', async () => {
    const cookie = await ambiente.entrar('coordenacao@escola.br', 'senha-da-ana');
    assert.equal((await pedir('DELETE', '/api/sessao', { cookie })).status, 204);
    assert.equal((await pedir('GET', '/api/sessao', { cookie })).status, 401);
  });
});

describe('Lista, filtros e contagem (RF16, RF17, RF21)', () => {
  before(async () => {
    // Mais 55 denúncias direto no banco, para testar filtros e páginas.
    for (let i = 0; i < 55; i++) {
      const tipo = i % 5 === 0 ? 'ameaca' : 'bullying';
      await db.query(
        `SELECT guardiao_mer.criar_registro(NULL, $1, 'relato de teste', '2026-05-01', 'patio', $2)`,
        [tipo, String(i).padStart(64, 'a')]
      );
    }
  });

  test('lista com protocolo, tipo, data e status, da mais recente para a mais antiga', async () => {
    const r = await pedir('GET', '/api/denuncias', { cookie: cookieAna });
    assert.equal(r.status, 200);
    assert.equal(r.corpo.por_pagina, 50);
    assert.equal(r.corpo.denuncias.length, 50);
    assert.deepEqual(Object.keys(r.corpo.denuncias[0]).sort(), ['criado_em', 'data_ocorrencia', 'local', 'protocolo', 'status', 'tipo']);
    const datas = r.corpo.denuncias.map((d) => d.criado_em);
    assert.deepEqual(datas, [...datas].sort().reverse());
  });

  test('página 2 traz o resto', async () => {
    const r = await pedir('GET', '/api/denuncias?pagina=2', { cookie: cookieAna });
    assert.equal(r.corpo.denuncias.length, r.corpo.total - 50);
  });

  test('filtra por tipo e por status', async () => {
    const r = await pedir('GET', '/api/denuncias?tipo=ameaca&status=recebida', { cookie: cookieAna });
    assert.equal(r.corpo.total, 11);
    assert.ok(r.corpo.denuncias.every((d) => d.tipo === 'ameaca' && d.status === 'recebida'));
  });

  test('filtro desconhecido: 400', async () => {
    const r = await pedir('GET', '/api/denuncias?status=apagada', { cookie: cookieAna });
    assert.equal(r.status, 400);
    assert.ok(r.corpo.campos.status);
  });

  test('a contagem por tipo e por status bate com a lista', async () => {
    const resumo = (await pedir('GET', '/api/denuncias/resumo', { cookie: cookieAna })).corpo;
    const lista = (await pedir('GET', '/api/denuncias', { cookie: cookieAna })).corpo;
    assert.equal(resumo.total, lista.total);
    assert.equal(resumo.por_tipo.ameaca, 11);
    assert.equal(resumo.por_tipo.discriminacao, 0);
    assert.deepEqual(Object.keys(resumo.por_status), ['recebida', 'analise', 'concluida', 'arquivada']);
    assert.equal(Object.values(resumo.por_status).reduce((a, b) => a + b), resumo.total);
  });
});

describe('Detalhe e andamento (RF18, RF19, RF20, RN03, RN04)', () => {
  const andamentos = () => '/api/denuncias/' + denuncia.protocolo + '/andamentos';

  test('a escola vê a denúncia completa', async () => {
    const r = await pedir('GET', '/api/denuncias/' + denuncia.protocolo, { cookie: cookieAna });
    assert.equal(r.status, 200);
    assert.equal(r.corpo.descricao, DENUNCIA.descricao);
    assert.equal(r.corpo.data_ocorrencia, '2026-03-12');
    assert.equal(r.corpo.vinculo, 'aluno');
  });

  test('protocolo inexistente: 404', async () => {
    assert.equal((await pedir('GET', '/api/denuncias/1999-9999', { cookie: cookieAna })).status, 404);
  });

  test('não dá para pular etapas do status (409)', async () => {
    const r = await pedir('POST', andamentos(), { cookie: cookieAna, corpo: { status: 'concluida', providencia: 'Resolvido.' } });
    assert.equal(r.status, 409);
  });

  test('providência é obrigatória', async () => {
    const r = await pedir('POST', andamentos(), { cookie: cookieAna, corpo: { status: 'analise', providencia: '   ' } });
    assert.equal(r.status, 400);
    assert.ok(r.corpo.campos.providencia);
  });

  test('grava status e providência com autor e data-hora do servidor', async () => {
    const r = await pedir('POST', andamentos(), {
      cookie: cookieAna,
      corpo: { status: 'analise', providencia: 'Conversamos com as turmas.', autor: 'forjado', criado_em: '2000-01-01' }
    });
    assert.equal(r.status, 201);
    assert.equal(r.corpo.autor, 'Ana Paula');
    assert.ok(new Date(r.corpo.criado_em).getFullYear() > 2000);
    await pedir('POST', andamentos(), { cookie: cookieAdmin, corpo: { status: 'concluida', providencia: 'Caso resolvido com as famílias.' } });
    const detalhe = await pedir('GET', '/api/denuncias/' + denuncia.protocolo, { cookie: cookieAna });
    assert.equal(detalhe.corpo.status, 'concluida');
    assert.deepEqual(detalhe.corpo.andamentos.map((a) => a.autor), ['Ana Paula', 'Diretora Marta']);
  });

  test('a consulta pública mostra as providências, sem o autor', async () => {
    const r = await pedir('POST', '/api/denuncias/consulta', { corpo: { codigo: denuncia.codigo } });
    assert.equal(r.corpo.status, 'concluida');
    assert.deepEqual(r.corpo.andamentos.map((a) => a.providencia), ['Conversamos com as turmas.', 'Caso resolvido com as famílias.']);
    assert.ok(!/Ana Paula|Diretora/.test(r.texto));
  });

  test('denúncia não se exclui, e o histórico não se altera', async () => {
    const r = await pedir('DELETE', '/api/denuncias/' + denuncia.protocolo, { cookie: cookieAdmin });
    assert.equal(r.status, 405);
    await assert.rejects(db.query('DELETE FROM guardiao_mer.registro'));
    await assert.rejects(db.query("UPDATE guardiao_mer.andamento SET providencia = 'editado'"));
  });
});

describe('Usuários da área da escola (RF22)', () => {
  let novo;

  test('só o administrador gerencia usuários', async () => {
    assert.equal((await pedir('GET', '/api/usuarios', { cookie: cookieAna })).status, 403);
    const r = await pedir('GET', '/api/usuarios', { cookie: cookieAdmin });
    assert.equal(r.status, 200);
    assert.ok(r.corpo.usuarios.every((u) => !('senha_hash' in u)));
  });

  test('cadastra com senha provisória, que já serve para entrar', async () => {
    const r = await pedir('POST', '/api/usuarios', {
      cookie: cookieAdmin,
      corpo: { nome: ' Carlos Lima ', email: 'Carlos@Escola.br', perfil: 'responsavel' }
    });
    assert.equal(r.status, 201);
    assert.equal(r.corpo.email, 'carlos@escola.br');
    assert.equal(r.corpo.nome, 'Carlos Lima');
    assert.equal(r.corpo.senha_provisoria.length, 16);
    novo = r.corpo;
    novo.cookie = await ambiente.entrar('carlos@escola.br', novo.senha_provisoria);
  });

  test('dados inválidos: 400; e-mail repetido: 409', async () => {
    const invalido = await pedir('POST', '/api/usuarios', { cookie: cookieAdmin, corpo: { nome: '', email: 'sem-arroba', perfil: 'chefe' } });
    assert.equal(invalido.status, 400);
    assert.deepEqual(Object.keys(invalido.corpo.campos).sort(), ['email', 'nome', 'perfil']);
    const repetido = await pedir('POST', '/api/usuarios', { cookie: cookieAdmin, corpo: { nome: 'Outro', email: 'carlos@escola.br', perfil: 'responsavel' } });
    assert.equal(repetido.status, 409);
  });

  test('desativar tira o acesso na hora', async () => {
    const r = await pedir('PATCH', '/api/usuarios/' + novo.id, { cookie: cookieAdmin, corpo: { ativo: false } });
    assert.equal(r.status, 200);
    assert.equal(r.corpo.ativo, false);
    assert.equal((await pedir('GET', '/api/sessao', { cookie: novo.cookie })).status, 401);
    const login = await pedir('POST', '/api/sessao', { corpo: { email: 'carlos@escola.br', senha: novo.senha_provisoria } });
    assert.equal(login.status, 401);
  });

  test('ninguém desativa o próprio acesso', async () => {
    const { rows } = await db.query("SELECT id_administrador FROM guardiao_mer.administrador WHERE email = 'diretora@escola.br'");
    const r = await pedir('PATCH', '/api/usuarios/' + rows[0].id_administrador, { cookie: cookieAdmin, corpo: { ativo: false } });
    assert.equal(r.status, 409);
  });

  test('reativar e gerar senha nova', async () => {
    await pedir('PATCH', '/api/usuarios/' + novo.id, { cookie: cookieAdmin, corpo: { ativo: true } });
    const r = await pedir('POST', '/api/usuarios/' + novo.id + '/senha', { cookie: cookieAdmin });
    assert.equal(r.status, 200);
    const antiga = await pedir('POST', '/api/sessao', { corpo: { email: 'carlos@escola.br', senha: novo.senha_provisoria } });
    assert.equal(antiga.status, 401);
    await ambiente.entrar('carlos@escola.br', r.corpo.senha_provisoria);
  });

  test('usuário inexistente: 404; situação inválida: 400', async () => {
    assert.equal((await pedir('PATCH', '/api/usuarios/999999', { cookie: cookieAdmin, corpo: { ativo: false } })).status, 404);
    assert.equal((await pedir('PATCH', '/api/usuarios/' + novo.id, { cookie: cookieAdmin, corpo: { ativo: 'não' } })).status, 400);
  });
});

describe('Troca da própria senha (RF23)', () => {
  test('confere a senha atual e o tamanho da nova', async () => {
    const errada = await pedir('PUT', '/api/conta/senha', { cookie: cookieAna, corpo: { senha_atual: 'nao-e-essa', senha_nova: 'nova-senha-123' } });
    assert.equal(errada.status, 400);
    assert.ok(errada.corpo.campos.senha_atual);
    const curta = await pedir('PUT', '/api/conta/senha', { cookie: cookieAna, corpo: { senha_atual: 'senha-da-ana', senha_nova: '123' } });
    assert.ok(curta.corpo.campos.senha_nova);
  });

  test('troca e desconecta os outros aparelhos', async () => {
    const outroAparelho = await ambiente.entrar('coordenacao@escola.br', 'senha-da-ana');
    const r = await pedir('PUT', '/api/conta/senha', { cookie: cookieAna, corpo: { senha_atual: 'senha-da-ana', senha_nova: 'nova-senha-da-ana' } });
    assert.equal(r.status, 204);
    assert.equal((await pedir('GET', '/api/sessao', { cookie: outroAparelho })).status, 401);
    assert.equal((await pedir('GET', '/api/sessao', { cookie: cookieAna })).status, 200);
    await ambiente.entrar('coordenacao@escola.br', 'nova-senha-da-ana');
  });
});

describe('Segurança do servidor (RNF01, RNF16, RNF17)', () => {
  test('cabeçalhos de segurança nas telas e na API', async () => {
    for (const url of ['/', '/api/denuncias/resumo']) {
      const r = await pedir('GET', url, { cookie: cookieAna });
      assert.match(r.cabecalhos.get('content-security-policy'), /script-src 'self'/);
      assert.equal(r.cabecalhos.get('x-content-type-options'), 'nosniff');
      assert.equal(r.cabecalhos.get('x-frame-options'), 'DENY');
    }
  });

  test('o navegador não alcança o código do servidor nem o .env', async () => {
    for (const url of ['/servidor/app.js', '/.env', '/package.json', '/guardiao-escolar-postgresql.sql']) {
      assert.equal((await pedir('GET', url)).status, 404, url);
    }
  });

  test('rota desconhecida da API: 404 em JSON', async () => {
    const r = await pedir('GET', '/api/nada');
    assert.equal(r.status, 404);
    assert.equal(r.corpo.erro, 'Rota não encontrada.');
  });
});

describe('Primeiro acesso pelo terminal (npm run criar-admin)', () => {
  test('cria um administrador com senha provisória', async () => {
    const r = await ambiente.rodarScript('criar-admin.js', ['secretaria@escola.br', 'Secretaria']);
    assert.equal(r.codigo, 0, r.saida);
    const senha = r.saida.match(/Senha provisória: (\S+)/)[1];
    const cookie = await ambiente.entrar('secretaria@escola.br', senha);
    const sessao = await pedir('GET', '/api/sessao', { cookie });
    assert.deepEqual(sessao.corpo, { nome: 'Secretaria', email: 'secretaria@escola.br', perfil: 'administrador' });
  });

  test('sem e-mail, explica o uso e termina com erro', async () => {
    const r = await ambiente.rodarScript('criar-admin.js', []);
    assert.equal(r.codigo, 1);
    assert.match(r.saida, /Informe o e-mail/);
  });
});
