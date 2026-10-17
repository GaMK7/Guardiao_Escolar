/* Validação no servidor (RF06, RNF03). O "required" do HTML é conveniência, não segurança.
   As listas precisam bater com as opções das telas e com os CHECK do banco. */
const { normalizarCodigo } = require('./codigo');

const TIPOS = ['bullying', 'cyberbullying', 'assedio', 'ameaca', 'agressao_fisica', 'discriminacao', 'outro'];
const LOCAIS = ['sala', 'corredor', 'patio', 'quadra', 'banheiro', 'refeitorio', 'entrada', 'internet', 'outro'];
const VINCULOS = ['aluno', 'professor', 'funcionario', 'responsavel', 'outro'];
const STATUS = ['recebida', 'analise', 'concluida', 'arquivada'];
const MAX_DESCRICAO = 2000;
const MAX_PROVIDENCIA = 800;
const MIN_SENHA = 8;
const MAX_SENHA_BYTES = 72; // o bcrypt ignora o que passar disso

function objeto(corpo) {
  return corpo && typeof corpo === 'object' ? corpo : {};
}

function hojeEmBrasilia() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

// Aceita só AAAA-MM-DD de um dia que existe (recusa 2026-02-30, por exemplo).
function dataValida(texto) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const data = new Date(texto + 'T00:00:00Z');
  return !Number.isNaN(data.getTime()) && data.toISOString().slice(0, 10) === texto;
}

/* Devolve { dados } quando está tudo certo, ou { erros } com uma mensagem por campo.
   Só os campos da denúncia são lidos: nome, contato ou qualquer outro campo enviado
   é descartado, porque toda denúncia é anônima (RN02, RNF05). */
function validarDenuncia(corpo) {
  const entrada = objeto(corpo);
  const texto = (campo) => (typeof entrada[campo] === 'string' ? entrada[campo].trim() : '');
  const erros = {};

  const tipo = texto('tipo');
  if (!TIPOS.includes(tipo)) erros.tipo = 'Escolha o que aconteceu.';

  const descricao = texto('descricao');
  if (!descricao) erros.descricao = 'Conte o que aconteceu.';
  else if (descricao.length > MAX_DESCRICAO) erros.descricao = 'O relato pode ter até ' + MAX_DESCRICAO + ' caracteres.';

  const data = texto('data_ocorrencia');
  if (!data) erros.data_ocorrencia = 'Informe quando aconteceu.';
  else if (!dataValida(data)) erros.data_ocorrencia = 'Informe uma data válida.';
  else if (data > hojeEmBrasilia()) erros.data_ocorrencia = 'A data não pode ser depois de hoje.';

  const local = texto('local');
  if (!LOCAIS.includes(local)) erros.local = 'Escolha onde aconteceu.';

  // Opcional (RF10): vazio significa "Prefiro não dizer".
  const vinculo = texto('vinculo') || null;
  if (vinculo && !VINCULOS.includes(vinculo)) erros.vinculo = 'Escolha uma das opções da lista.';

  if (Object.keys(erros).length) return { erros };
  return { dados: { tipo, descricao, data_ocorrencia: data, local, vinculo } };
}

// Consulta pública (RF11): o código precisa ter 8 letras ou números, com ou sem hífen.
function validarConsulta(corpo) {
  const codigo = objeto(corpo).codigo;
  if (typeof codigo !== 'string' || normalizarCodigo(codigo).length !== 8) {
    return { erros: { codigo: 'Digite o código de 8 caracteres que você recebeu, como 7H2K-9QX4.' } };
  }
  return { dados: { codigo } };
}

// Atualização de andamento (RF19, RF20). Se a mudança de status é permitida, quem decide é o banco.
function validarAndamento(corpo) {
  const entrada = objeto(corpo);
  const status = typeof entrada.status === 'string' ? entrada.status.trim() : '';
  const providencia = typeof entrada.providencia === 'string' ? entrada.providencia.trim() : '';
  const erros = {};

  if (!STATUS.includes(status)) erros.status = 'Escolha o novo status.';
  if (!providencia) erros.providencia = 'Descreva o que foi feito.';
  else if (providencia.length > MAX_PROVIDENCIA) erros.providencia = 'O texto pode ter até ' + MAX_PROVIDENCIA + ' caracteres.';

  if (Object.keys(erros).length) return { erros };
  return { dados: { status, providencia } };
}

// Troca da própria senha (RF23). Senha não passa por trim: espaços contam.
function validarTrocaSenha(corpo) {
  const entrada = objeto(corpo);
  const atual = typeof entrada.senha_atual === 'string' ? entrada.senha_atual : '';
  const nova = typeof entrada.senha_nova === 'string' ? entrada.senha_nova : '';
  const erros = {};

  if (!atual) erros.senha_atual = 'Digite a sua senha atual.';
  if (nova.length < MIN_SENHA) erros.senha_nova = 'A nova senha precisa ter pelo menos ' + MIN_SENHA + ' caracteres.';
  else if (Buffer.byteLength(nova, 'utf8') > MAX_SENHA_BYTES) erros.senha_nova = 'A nova senha pode ter até ' + MAX_SENHA_BYTES + ' caracteres.';
  else if (nova === atual) erros.senha_nova = 'A nova senha precisa ser diferente da atual.';

  if (Object.keys(erros).length) return { erros };
  return { dados: { senha_atual: atual, senha_nova: nova } };
}

// Login (RF14). O e-mail é comparado em minúsculas, como está gravado no banco.
function validarLogin(corpo) {
  const entrada = objeto(corpo);
  const email = typeof entrada.email === 'string' ? entrada.email.trim().toLowerCase() : '';
  const senha = typeof entrada.senha === 'string' ? entrada.senha : '';
  const erros = {};

  if (!email) erros.email = 'Digite o seu e-mail.';
  else if (email.length > 254) erros.email = 'E-mail longo demais.';
  if (!senha) erros.senha = 'Digite a sua senha.';
  else if (Buffer.byteLength(senha, 'utf8') > MAX_SENHA_BYTES) erros.senha = 'Senha longa demais.';

  if (Object.keys(erros).length) return { erros };
  return { dados: { email, senha } };
}

// Resposta padrão de dado inválido: 400 { erro, campos }, com uma mensagem por campo.
function responderInvalido(res, erros) {
  return res.status(400).json({ erro: 'Confira os campos indicados.', campos: erros });
}

module.exports = { validarDenuncia, validarConsulta, validarAndamento, validarTrocaSenha, validarLogin, responderInvalido };
