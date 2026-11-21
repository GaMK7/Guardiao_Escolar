/* PostgreSQL normal ou PGlite persistente para desenvolvimento local. */
if (process.env.LOCAL_DATABASE === 'pglite') {
  const fs = require('node:fs');
  const path = require('node:path');
  const { PGlite } = require('@electric-sql/pglite');
  const RAIZ = path.join(__dirname, '..');
  const caminho = path.join(RAIZ, '.local-db');

  const pronto = PGlite.create(caminho).then(async function (db) {
    const esquema = fs.readFileSync(path.join(RAIZ, 'guardiao-escolar-postgresql.sql'), 'utf8');
    await db.exec(esquema);
    return db;
  });

  module.exports = {
    query: async function (sql, parametros) {
      return (await pronto).query(sql, parametros);
    },
    on: function () {
      return this;
    },
    end: async function () {
      return (await pronto).close();
    }
  };
} else {
  const { Pool } = require('pg');
  const banco = new Pool({ connectionString: process.env.DATABASE_URL });

  banco.on('error', function (erro) {
    console.error('Erro na conexao com o banco:', erro.message);
  });

  module.exports = banco;
}