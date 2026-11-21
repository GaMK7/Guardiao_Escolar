/* Opções do fluxo de status da denúncia. Compartilhado pelo navegador e pelos testes. */
(function (raiz, criarModulo) {
  var modulo = criarModulo();
  if (typeof module === 'object' && module.exports) module.exports = modulo;
  else raiz.GEStatusOptions = modulo;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  var ORDEM = ['recebida', 'analise', 'concluida', 'arquivada'];

  function normalizar(status) {
    var chave = String(status || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .trim().toLowerCase().replace(/\s+/g, '_');
    if (chave === 'em_analise') return 'analise';
    return chave;
  }

  function criar(statusAtual, rotulos, administradorMaster) {
    var atual = normalizar(statusAtual);
    var indiceAtual = ORDEM.indexOf(atual);
    if (indiceAtual < 0 || !rotulos || !Object.prototype.hasOwnProperty.call(rotulos, atual)) return [];

    return Object.keys(rotulos).map(function (status) {
      var indice = ORDEM.indexOf(status);
      var habilitado = indice > indiceAtual && (administradorMaster || indice === indiceAtual + 1);
      var rotulo = rotulos[status];
      return { value: status, label: rotulo, disabled: !habilitado };
    });
  }

  function ajuda(statusAtual, administradorMaster) {
    var atual = normalizar(statusAtual);
    if (atual === 'arquivada') return 'Caso arquivado. O fluxo foi concluído.';
    if (administradorMaster) return 'Administrador: você pode avançar para qualquer etapa futura. Descreva a decisão; etapas anteriores não podem ser retomadas.';
    if (atual === 'recebida') return 'Próxima etapa: Em análise. Etapas anteriores não podem ser retomadas.';
    if (atual === 'analise') return 'Próxima etapa: Concluída. Arquivada fica disponível depois.';
    if (atual === 'concluida') return 'Próxima etapa: Arquivada.';
    return '';
  }

  return { normalizar: normalizar, criar: criar, ajuda: ajuda };
});
