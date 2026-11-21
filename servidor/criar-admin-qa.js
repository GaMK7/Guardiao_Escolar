/* Cria ou atualiza a conta compartilhada de QA com credenciais privadas do ambiente.
   Nunca roda automaticamente: exige QA_ADMIN_SEED_ENABLED=true e execucao manual. */
const { carregarAmbiente } = require('./ambiente');

carregarAmbiente(['DATABASE_URL', 'QA_ADMIN_SEED_ENABLED', 'QA_ADMIN_EMAIL', 'QA_ADMIN_PASSWORD']);
const banco = require('./banco');
const { gerarHashSenha } = require('./senha');
const { emailValido, MAX_NOME } = require('./validacao');

async function principal() {
  if (process.env.QA_ADMIN_SEED_ENABLED !== 'true') {
    throw new Error('Habilite QA_ADMIN_SEED_ENABLED=true somente no ambiente escolhido.');
  }

  const email = String(process.env.QA_ADMIN_EMAIL || '').trim().toLowerCase();
  const nome = String(process.env.QA_ADMIN_NOME || 'Equipe QA').trim();
  const senha = String(process.env.QA_ADMIN_PASSWORD || '');

  if (!emailValido(email)) throw new Error('QA_ADMIN_EMAIL precisa ser um e-mail valido.');
  if (!nome || nome.length > MAX_NOME) throw new Error('QA_ADMIN_NOME precisa ter de 1 a ' + MAX_NOME + ' caracteres.');
  if (senha.length < 8 || Buffer.byteLength(senha, 'utf8') > 72) {
    throw new Error('QA_ADMIN_PASSWORD precisa ter de 8 a 72 bytes.');
  }

  const hash = await gerarHashSenha(senha);
  const sql = [
    'INSERT INTO guardiao_mer.administrador (email, nome, perfil, senha_hash, ativo)',
    "VALUES ($1, $2, 'administrador', $3, true)",
    'ON CONFLICT (email) DO UPDATE',
    'SET nome = EXCLUDED.nome, perfil = EXCLUDED.perfil,',
    '    senha_hash = EXCLUDED.senha_hash, ativo = true',
    'RETURNING id_administrador'
  ].join('\n');
  const { rows } = await banco.query(sql, [email, nome, hash]);

  await banco.query('DELETE FROM guardiao_mer.sessao WHERE administrador_id = $1', [rows[0].id_administrador]);
  console.log('Conta compartilhada de QA criada ou atualizada para ' + email + '.');
  console.log('A senha configurada foi aplicada; as sessoes anteriores foram encerradas.');
}

principal()
  .catch(function (erro) {
    console.error('Nao foi possivel configurar a conta de QA:', erro.message);
    process.exitCode = 1;
  })
  .finally(function () {
    return banco.end();
  });
