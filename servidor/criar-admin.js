/* Cria um acesso de administrador à área da escola, ou recupera um que já existe.
   Uso: npm run criar-admin -- coordenacao@escola.edu.br "Nome da Pessoa"
   O nome é opcional. Para um e-mail que já existe, gera senha nova, reativa o acesso
   e dá perfil de administrador: é a saída quando ninguém mais consegue entrar.
   A senha provisória aparece uma vez só, no terminal. */
const { carregarAmbiente } = require('./ambiente');

carregarAmbiente(['DATABASE_URL']);
const banco = require('./banco');
const { gerarHashSenha, gerarSenhaProvisoria } = require('./senha');
const { emailValido, MAX_NOME } = require('./validacao');

async function principal() {
  const email = String(process.argv[2] || '').trim().toLowerCase();
  const nome = String(process.argv[3] || '').trim() || null;
  if (!emailValido(email)) {
    console.error('Informe o e-mail. Exemplo: npm run criar-admin -- coordenacao@escola.edu.br "Ana Paula"');
    process.exitCode = 1;
    return;
  }
  if (nome && nome.length > MAX_NOME) {
    console.error('O nome pode ter até ' + MAX_NOME + ' caracteres.');
    process.exitCode = 1;
    return;
  }

  const senha = gerarSenhaProvisoria();
  const hash = await gerarHashSenha(senha);
  const { rows } = await banco.query(
    `UPDATE guardiao_mer.administrador
        SET senha_hash = $1, ativo = true, perfil = 'administrador', nome = COALESCE($2, nome)
      WHERE email = $3 RETURNING id_administrador`,
    [hash, nome, email]
  );

  if (rows.length) {
    await banco.query('DELETE FROM guardiao_mer.sessao WHERE administrador_id = $1', [rows[0].id_administrador]);
    console.log('Senha nova gerada para ' + email + '. O acesso está ativo, com perfil de administrador, e as sessões abertas foram encerradas.');
  } else {
    await banco.query(
      `INSERT INTO guardiao_mer.administrador (email, nome, perfil, senha_hash) VALUES ($1, $2, 'administrador', $3)`,
      [email, nome || email.split('@')[0].slice(0, MAX_NOME), hash]
    );
    console.log('Acesso de administrador criado para ' + email + '.');
  }
  console.log('Senha provisória: ' + senha);
  console.log('Anote agora: ela não aparece de novo. Depois de entrar, troque em "Trocar senha".');
}

principal()
  .catch(function (erro) {
    console.error('Não foi possível criar o acesso:', erro.message);
    process.exitCode = 1;
  })
  .finally(function () {
    return banco.end();
  });
