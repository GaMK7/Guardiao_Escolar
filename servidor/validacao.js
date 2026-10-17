/* Validação no servidor (RF06, RNF03). O "required" do HTML é conveniência, não segurança.
   As listas precisam bater com as opções de denuncia.html e com os CHECK do banco. */

const TIPOS = ['bullying', 'cyberbullying', 'assedio', 'ameaca', 'agressao_fisica', 'discriminacao', 'outro'];
const LOCAIS = ['sala', 'corredor', 'patio', 'quadra', 'banheiro', 'refeitorio', 'entrada', 'internet', 'outro'];
const VINCULOS = ['aluno', 'professor', 'funcionario', 'responsavel', 'outro'];
const MAX_DESCRICAO = 2000;

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
  const entrada = corpo && typeof corpo === 'object' ? corpo : {};
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

module.exports = { validarDenuncia };
