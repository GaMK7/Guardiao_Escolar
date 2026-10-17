/* Conexão com o PostgreSQL. Toda consulta deve usar parâmetros ($1, $2...), nunca texto concatenado (RNF04). */
const { Pool } = require('pg');

const banco = new Pool({ connectionString: process.env.DATABASE_URL });

// O Neon encerra conexões paradas; sem isto o erro derrubaria o servidor.
banco.on('error', function (erro) {
  console.error('Conexão com o banco perdida:', erro.message);
});

module.exports = banco;
