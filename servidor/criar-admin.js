/* Cria um acesso à área da escola, ou gera senha nova para um acesso que já existe.
   Uso: npm run criar-admin -- coordenacao@escola.edu.br
   A senha provisória aparece uma vez só, no terminal. */
const crypto = require('node:crypto');
const { carregarAmbiente } = require('./ambiente');

carregarAmbiente(['DATABASE_URL']);
const banco = require('./banco');
const { gerarHashSenha } = require('./senha');

async function principal() {
  const email = String(process.argv[2] || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('Informe o e-mail. Exemplo: npm run criar-admin -- coordenacao@escola.edu.br');
    process.exitCode = 1;
    return;
  }

  const senha = crypto.randomBytes(12).toString('base64url');
  const hash = await gerarHashSenha(senha);
  const { rows } = await banco.query(
    'SELECT id_administrador, ativo FROM guardiao_mer.administrador WHERE email = $1',
    [email]
  );

  if (rows.length) {
    await banco.query('UPDATE guardiao_mer.administrador SET senha_hash = $1 WHERE id_administrador = $2', [hash, rows[0].id_administrador]);
    await banco.query('DELETE FROM guardiao_mer.sessao WHERE administrador_id = $1', [rows[0].id_administrador]);
    console.log('Senha nova gerada para ' + email + '. As sessões abertas foram encerradas.');
    if (!rows[0].ativo) console.log('Atenção: este acesso está inativo e não consegue entrar.');
  } else {
    await banco.query('INSERT INTO guardiao_mer.administrador (email, senha_hash) VALUES ($1, $2)', [email, hash]);
    console.log('Acesso criado para ' + email + '.');
  }
  console.log('Senha provisória: ' + senha);
  console.log('Anote agora: ela não aparece de novo.');
}

principal()
  .catch(function (erro) {
    console.error('Não foi possível criar o acesso:', erro.message);
    process.exitCode = 1;
  })
  .finally(function () {
    return banco.end();
  });
