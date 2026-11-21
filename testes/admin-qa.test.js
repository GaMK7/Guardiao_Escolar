const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const RAIZ = path.join(__dirname, '..');
const EMAIL = 'qa-teste@exemplo.test';
const SENHA = 'senha-de-teste-123';

function prepararAmbiente() {
  const diretorio = fs.mkdtempSync(path.join(os.tmpdir(), 'guardiao-qa-'));
  fs.cpSync(path.join(RAIZ, 'servidor'), path.join(diretorio, 'servidor'), { recursive: true });
  fs.copyFileSync(
    path.join(RAIZ, 'guardiao-escolar-postgresql.sql'),
    path.join(diretorio, 'guardiao-escolar-postgresql.sql')
  );

  const ambiente = {
    ...process.env,
    NODE_PATH: path.join(RAIZ, 'node_modules'),
    DATABASE_URL: 'postgresql://nao-usado',
    LOCAL_DATABASE: 'pglite',
    QA_ADMIN_SEED_ENABLED: 'true',
    QA_ADMIN_EMAIL: EMAIL,
    QA_ADMIN_NOME: 'Equipe QA de teste',
    QA_ADMIN_PASSWORD: SENHA
  };

  return { diretorio, ambiente };
}

function executarSeed(diretorio, ambiente) {
  return spawnSync(process.execPath, ['servidor/criar-admin-qa.js'], {
    cwd: diretorio,
    env: ambiente,
    encoding: 'utf8'
  });
}

test('cria e atualiza a conta de QA sem guardar senha em texto puro', (t) => {
  const { diretorio, ambiente } = prepararAmbiente();
  t.after(() => fs.rmSync(diretorio, { recursive: true, force: true }));

  const primeiraExecucao = executarSeed(diretorio, ambiente);
  assert.equal(primeiraExecucao.status, 0, primeiraExecucao.stderr);
  const segundaExecucao = executarSeed(diretorio, ambiente);
  assert.equal(segundaExecucao.status, 0, segundaExecucao.stderr);

  const verificacao = spawnSync(process.execPath, ['-e', [
    "const {PGlite}=require('@electric-sql/pglite');",
    "const bcrypt=require('bcryptjs');",
    "(async()=>{",
    "const db=await PGlite.create('.local-db');",
    "const {rows}=await db.query('SELECT email,nome,perfil,ativo,senha_hash FROM guardiao_mer.administrador WHERE email=$1',[process.env.QA_ADMIN_EMAIL]);",
    "console.log(JSON.stringify(rows.map(({email,nome,perfil,ativo,senha_hash})=>({email,nome,perfil,ativo,senhaCorreta:bcrypt.compareSync(process.env.QA_ADMIN_PASSWORD,senha_hash)}))));",
    "await db.close();",
    "})().catch(erro=>{console.error(erro);process.exitCode=1});"
  ].join('')], {
    cwd: diretorio,
    env: ambiente,
    encoding: 'utf8'
  });

  assert.equal(verificacao.status, 0, verificacao.stderr);
  assert.deepEqual(JSON.parse(verificacao.stdout), [{
    email: EMAIL,
    nome: 'Equipe QA de teste',
    perfil: 'administrador',
    ativo: true,
    senhaCorreta: true
  }]);
});

test('recusa a criação quando a variável de ativação está desligada', (t) => {
  const { diretorio, ambiente } = prepararAmbiente();
  t.after(() => fs.rmSync(diretorio, { recursive: true, force: true }));
  ambiente.QA_ADMIN_SEED_ENABLED = 'false';

  const resultado = executarSeed(diretorio, ambiente);

  assert.equal(resultado.status, 1);
  assert.match(resultado.stderr, /Habilite QA_ADMIN_SEED_ENABLED/);
});

test('recusa e-mail inválido e senha menor que oito caracteres', (t) => {
  const { diretorio, ambiente } = prepararAmbiente();
  t.after(() => fs.rmSync(diretorio, { recursive: true, force: true }));

  ambiente.QA_ADMIN_EMAIL = 'email-invalido';
  const emailInvalido = executarSeed(diretorio, ambiente);
  assert.equal(emailInvalido.status, 1);
  assert.match(emailInvalido.stderr, /QA_ADMIN_EMAIL/);

  ambiente.QA_ADMIN_EMAIL = EMAIL;
  ambiente.QA_ADMIN_PASSWORD = 'curta';
  const senhaCurta = executarSeed(diretorio, ambiente);
  assert.equal(senhaCurta.status, 1);
  assert.match(senhaCurta.stderr, /QA_ADMIN_PASSWORD/);
});
