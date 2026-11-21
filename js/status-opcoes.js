/* Opções do fluxo de status da denúncia. Compartilhado pelo navegador e pelos testes. */
(function (raiz, criarModulo) {
  var modulo = criarModulo();
  if (typeof module === 'object' && module.exports) module.exports = modulo;
  else raiz.GEStatusOptions = modulo;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  var PROXIMOS = {
    recebida: ['analise'],
    analise: ['concluida', 'arquivada'],
    concluida: [],
    arquivada: []
  };

  function normalizar(status) {
    var chave = String(status || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .trim().toLowerCase().replace(/\s+/g, '_');
    if (chave === 'em_analise') return 'analise';
    return chave;
  }

  function criar(statusAtual, rotulos) {
    var atual = normalizar(statusAtual);
    var permitidos = PROXIMOS[atual];
    if (!permitidos || !rotulos || !Object.prototype.hasOwnProperty.call(rotulos, atual)) return [];

    return Object.keys(rotulos).map(function (status) {
      var eAtual = status === atual;
      var habilitado = eAtual || permitidos.includes(status);
      var rotulo = rotulos[status] + (eAtual ? ' (manter)' : '');
      if (!habilitado && atual === 'recebida' && (status === 'concluida' || status === 'arquivada')) {
        rotulo += ' (após Em análise)';
      }
      return { value: status, label: rotulo, disabled: !habilitado };
    });
  }

  function ajuda(statusAtual) {
    var atual = normalizar(statusAtual);
    if (atual === 'recebida') return 'Avance para Em análise. Concluída e Arquivada ficam disponíveis na etapa seguinte.';
    if (atual === 'analise') return 'Status atual: Em análise. Escolha Concluída ou Arquivada para encerrar o caso.';
    if (atual === 'concluida' || atual === 'arquivada') return 'Caso encerrado. Ainda é possível registrar uma providência.';
    return '';
  }

  return { normalizar: normalizar, criar: criar, ajuda: ajuda };
});
