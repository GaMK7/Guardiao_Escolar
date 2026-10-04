/* ==========================================================================
   Guardião Escolar — script compartilhado
   Nada aqui substitui a validação do servidor (RNF03).
   ========================================================================== */

/* --------------------------------------------------- copiar o código */
document.querySelectorAll('[data-copiar]').forEach(function (botao) {
  botao.addEventListener('click', function () {
    var alvo = document.querySelector(botao.dataset.copiar);
    if (!alvo) return;
    var texto = alvo.textContent.trim();

    function confirmar() {
      var original = botao.textContent;
      botao.textContent = 'Código copiado';
      setTimeout(function () { botao.textContent = original; }, 2500);
    }

    if (navigator.clipboard) {
      navigator.clipboard.writeText(texto).then(confirmar);
    } else {
      var campo = document.createElement('textarea');
      campo.value = texto;
      document.body.appendChild(campo);
      campo.select();
      document.execCommand('copy');
      document.body.removeChild(campo);
      confirmar();
    }
  });
});

/* --------------------------------------------------- contador do relato */
document.querySelectorAll('[data-contador]').forEach(function (campo) {
  var saida = document.querySelector(campo.dataset.contador);
  if (!saida) return;
  var maximo = campo.getAttribute('maxlength') || 2000;
  function atualizar() {
    saida.textContent = campo.value.length + ' de ' + maximo + ' caracteres';
  }
  campo.addEventListener('input', atualizar);
  atualizar();
});

/* --------------------------------------------------- formata o código digitado */
document.querySelectorAll('[data-formato-codigo]').forEach(function (campo) {
  campo.addEventListener('input', function () {
    var limpo = campo.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    campo.value = limpo.length > 4 ? limpo.slice(0, 4) + '-' + limpo.slice(4) : limpo;
  });
});

/* --------------------------------------------------- envio do formulário de denúncia
   Troque a URL pela rota real da API em Express quando o back-end existir.
   Fluxo esperado: POST /api/denuncias  ->  { protocolo, codigo }
   A página de confirmação recebe os dois por sessionStorage, nunca pela URL,
   para que o código não fique no histórico do navegador.
--------------------------------------------------------------------------- */
var formDenuncia = document.querySelector('#form-denuncia');
if (formDenuncia) {
  formDenuncia.addEventListener('submit', async function (evento) {
    evento.preventDefault();

    var erro = document.querySelector('#erro-envio');
    var botao = formDenuncia.querySelector('button[type="submit"]');
    erro.textContent = '';
    botao.disabled = true;
    botao.textContent = 'Enviando...';

    var dados = Object.fromEntries(new FormData(formDenuncia).entries());
    dados.anonima = dados.identificacao === 'anonima';

    try {
      var resposta = await fetch('/api/denuncias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dados)
      });
      if (!resposta.ok) throw new Error('falha');
      var corpo = await resposta.json();

      sessionStorage.setItem('ge_protocolo', corpo.protocolo);
      sessionStorage.setItem('ge_codigo', corpo.codigo);
      window.location.href = 'confirmacao.html';
    } catch (e) {
      erro.textContent = 'Não foi possível enviar agora. Verifique a conexão e tente de novo — o que você escreveu continua aqui.';
      botao.disabled = false;
      botao.textContent = 'Enviar denúncia';
    }
  });
}

/* ------------------------------------------------------ tela de confirmação */
var caixaCodigo = document.querySelector('#codigo-gerado');
if (caixaCodigo) {
  var codigo = sessionStorage.getItem('ge_codigo');
  var protocolo = sessionStorage.getItem('ge_protocolo');
  if (codigo) caixaCodigo.textContent = codigo;
  if (protocolo) document.querySelector('#protocolo-gerado').textContent = protocolo;
  // o código sai da memória assim que a pessoa deixa a página
  window.addEventListener('pagehide', function () {
    sessionStorage.removeItem('ge_codigo');
    sessionStorage.removeItem('ge_protocolo');
  });
}
