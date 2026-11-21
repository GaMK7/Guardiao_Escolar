const { test } = require('node:test');
const assert = require('node:assert/strict');
const GEStatusOptions = require('../js/status-opcoes');

const ROTULOS = {
  recebida: 'Recebida',
  analise: 'Em análise',
  concluida: 'Concluída',
  arquivada: 'Arquivada'
};

test('o menu mostra os quatro status e habilita apenas a próxima etapa válida', () => {
  const recebida = GEStatusOptions.criar('recebida', ROTULOS);
  assert.deepEqual(recebida.map(({ value }) => value), ['recebida', 'analise', 'concluida', 'arquivada']);
  assert.deepEqual(recebida.map(({ disabled }) => disabled), [false, false, true, true]);

  const analise = GEStatusOptions.criar('analise', ROTULOS);
  assert.deepEqual(analise.map(({ value }) => value), ['recebida', 'analise', 'concluida', 'arquivada']);
  assert.deepEqual(analise.map(({ disabled }) => disabled), [true, false, false, false]);
  assert.deepEqual(analise.slice(2).map(({ label }) => label), ['Concluída', 'Arquivada']);
});

test('o rótulo legível Em análise habilita Concluída e Arquivada', () => {
  const opcoes = GEStatusOptions.criar('Em análise', ROTULOS);
  assert.equal(opcoes[2].disabled, false);
  assert.equal(opcoes[3].disabled, false);
  assert.match(GEStatusOptions.ajuda('Em análise'), /Concluída ou Arquivada/);
});

test('casos encerrados mantêm o status atual e não permitem reabertura', () => {
  for (const atual of ['concluida', 'arquivada']) {
    const opcoes = GEStatusOptions.criar(atual, ROTULOS);
    assert.deepEqual(opcoes.map(({ disabled }) => disabled), [true, true, atual !== 'concluida', atual !== 'arquivada']);
  }
});
