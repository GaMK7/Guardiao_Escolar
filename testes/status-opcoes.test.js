const { test } = require('node:test');
const assert = require('node:assert/strict');
const GEStatusOptions = require('../js/status-opcoes');

const ROTULOS = {
  recebida: 'Recebida',
  analise: 'Em análise',
  concluida: 'Concluída',
  arquivada: 'Arquivada'
};

test('o menu mostra os quatro status e habilita só a próxima etapa para a equipe', () => {
  const recebida = GEStatusOptions.criar('recebida', ROTULOS);
  assert.deepEqual(recebida.map(({ value }) => value), ['recebida', 'analise', 'concluida', 'arquivada']);
  assert.deepEqual(recebida.map(({ disabled }) => disabled), [true, false, true, true]);
  assert.doesNotMatch(recebida[0].label, /manter/i);

  const analise = GEStatusOptions.criar('analise', ROTULOS);
  assert.deepEqual(analise.map(({ value }) => value), ['recebida', 'analise', 'concluida', 'arquivada']);
  assert.deepEqual(analise.map(({ disabled }) => disabled), [true, true, false, true]);
  assert.doesNotMatch(analise[1].label, /manter/i);
  assert.deepEqual(analise.slice(2).map(({ label }) => label), ['Concluída', 'Arquivada']);
});

test('administrador pode avançar etapas futuras quando necessário, mas nunca voltar', () => {
  const opcoes = GEStatusOptions.criar('Em análise', ROTULOS, true);
  assert.equal(opcoes[0].disabled, true);
  assert.equal(opcoes[2].disabled, false);
  assert.equal(opcoes[3].disabled, false);
  assert.match(GEStatusOptions.ajuda('Em análise', true), /etapas anteriores não podem ser retomadas/);
});

test('Concluída só permite arquivar e Arquivada é terminal', () => {
  const concluida = GEStatusOptions.criar('concluida', ROTULOS);
  assert.deepEqual(concluida.map(({ disabled }) => disabled), [true, true, true, false]);
  assert.match(GEStatusOptions.ajuda('concluida'), /Próxima etapa: Arquivada/);

  const arquivada = GEStatusOptions.criar('arquivada', ROTULOS);
  assert.deepEqual(arquivada.map(({ disabled }) => disabled), [true, true, true, true]);
  assert.match(GEStatusOptions.ajuda('arquivada'), /fluxo foi concluído/);
});
