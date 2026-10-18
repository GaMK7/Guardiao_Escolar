/* ==========================================================================
   Guardião Escolar — script compartilhado
   Nada aqui substitui a validação do servidor (RNF03).
   Dado que vem do servidor entra na página sempre como texto (textContent),
   nunca como HTML: relato e providências são escritos por pessoas.
   ========================================================================== */

/* --------------------------------------------------- utilidades (também usadas em js/admin.js) */
var GE = (function () {
  var TIPOS = {
    bullying: 'Bullying',
    cyberbullying: 'Cyberbullying',
    assedio: 'Assédio',
    ameaca: 'Ameaça',
    agressao_fisica: 'Agressão física',
    discriminacao: 'Discriminação',
    outro: 'Outro'
  };
  var STATUS = { recebida: 'Recebida', analise: 'Em análise', concluida: 'Concluída', arquivada: 'Arquivada' };
  var LOCAIS = {
    sala: 'Sala de aula',
    corredor: 'Corredor',
    patio: 'Pátio',
    quadra: 'Quadra',
    banheiro: 'Banheiro',
    refeitorio: 'Refeitório',
    entrada: 'Entrada ou saída',
    internet: 'Internet',
    outro: 'Outro lugar'
  };
  var VINCULOS = { aluno: 'aluno', professor: 'professor', funcionario: 'funcionário', responsavel: 'responsável por aluno', outro: 'outro vínculo' };
  var FUSO = 'America/Sao_Paulo';

  // Hoje no horário de Brasília, no formato AAAA-MM-DD (o mesmo que o servidor usa).
  function hoje() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO }).format(new Date());
  }

  // "2026-03-12" -> "12/03/2026", sem passar por fuso horário.
  function formatarDia(texto) {
    var partes = String(texto).split('-');
    return partes[2] + '/' + partes[1] + '/' + partes[0];
  }

  // Data-hora do servidor -> "12/03/2026".
  function formatarData(iso) {
    return new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso));
  }

  // Data-hora do servidor -> "12/03/2026 às 14h20".
  function formatarMomento(iso) {
    var p = {};
    new Intl.DateTimeFormat('pt-BR', {
      timeZone: FUSO, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date(iso)).forEach(function (parte) { p[parte.type] = parte.value; });
    return p.day + '/' + p.month + '/' + p.year + ' às ' + p.hour + 'h' + p.minute;
  }

  function elemento(tag, classe, texto) {
    var el = document.createElement(tag);
    if (classe) el.className = classe;
    if (texto !== undefined && texto !== null) el.textContent = texto;
    return el;
  }

  function etiquetaStatus(status) {
    return elemento('span', 'etiqueta etiqueta--' + status, STATUS[status] || status);
  }

  /* Histórico: "Recebida" na data do registro, depois cada providência e o próximo passo.
     Na área da escola (comAutor) mostra quem registrou; na consulta pública, não (RF13). */
  function linhaDoTempo(lista, denuncia, comAutor) {
    function item(titulo, iso, complemento) {
      var li = elemento('li');
      li.appendChild(elemento('strong', null, titulo));
      var tempo = elemento('time', null, formatarMomento(iso) + (complemento ? ' · ' + complemento : ''));
      tempo.dateTime = iso;
      li.appendChild(tempo);
      return li;
    }

    lista.replaceChildren(item('Recebida', denuncia.criado_em, comAutor ? 'registro automático' : ''));
    denuncia.andamentos.forEach(function (andamento) {
      var li = item(STATUS[andamento.status], andamento.criado_em, comAutor ? andamento.autor : '');
      li.appendChild(elemento('p', null, andamento.providencia));
      lista.appendChild(li);
    });

    var proximo = { recebida: 'Em análise', analise: 'Concluída' }[denuncia.status];
    if (proximo) {
      var pendente = elemento('li', 'pendente');
      pendente.appendChild(elemento('strong', null, proximo));
      pendente.appendChild(elemento('time', null, 'ainda não'));
      lista.appendChild(pendente);
    }
  }

  // Apaga as mensagens de erro do formulário.
  function limparErros(form) {
    form.querySelectorAll('.erro').forEach(function (saida) { saida.textContent = ''; });
    form.querySelectorAll('[aria-invalid]').forEach(function (campo) { campo.removeAttribute('aria-invalid'); });
  }

  /* Mostra { campo: mensagem } no <span class="erro" id="erro-campo"> de cada campo
     e leva o foco para o primeiro campo com problema. */
  function mostrarErros(form, campos) {
    var primeiro = null;
    Object.keys(campos).forEach(function (nome) {
      var saida = form.querySelector('#erro-' + nome);
      if (saida) saida.textContent = campos[nome];
      var campo = form.elements[nome];
      if (!campo) return;
      if (campo instanceof RadioNodeList) campo = campo[0];
      campo.setAttribute('aria-invalid', 'true');
      if (!primeiro) primeiro = campo;
    });
    if (primeiro) primeiro.focus();
  }

  /* Chama a API com JSON e devolve { status, corpo }. Sem conexão, status 0. */
  async function api(metodo, url, dados) {
    var opcoes = { method: metodo, headers: { Accept: 'application/json' } };
    if (dados !== undefined) {
      opcoes.headers['Content-Type'] = 'application/json';
      opcoes.body = JSON.stringify(dados);
    }
    try {
      var resposta = await fetch(url, opcoes);
      var corpo = resposta.status === 204 ? {} : await resposta.json().catch(function () { return {}; });
      return { status: resposta.status, corpo: corpo };
    } catch (e) {
      return { status: 0, corpo: {} };
    }
  }

  return {
    TIPOS: TIPOS, STATUS: STATUS, LOCAIS: LOCAIS, VINCULOS: VINCULOS,
    hoje: hoje, formatarDia: formatarDia, formatarData: formatarData, formatarMomento: formatarMomento,
    elemento: elemento, etiquetaStatus: etiquetaStatus, linhaDoTempo: linhaDoTempo,
    limparErros: limparErros, mostrarErros: mostrarErros, api: api
  };
})();

/* --------------------------------------------------- copiar o código (ou a senha provisória) */
document.querySelectorAll('[data-copiar]').forEach(function (botao) {
  botao.addEventListener('click', function () {
    var alvo = document.querySelector(botao.dataset.copiar);
    if (!alvo) return;
    var texto = alvo.textContent.trim();

    function confirmar() {
      var original = botao.textContent;
      botao.textContent = botao.dataset.copiado || 'Código copiado';
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

/* --------------------------------------------------- contador de caracteres */
document.querySelectorAll('[data-contador]').forEach(function (campo) {
  var saida = document.querySelector(campo.dataset.contador);
  if (!saida) return;
  var maximo = campo.getAttribute('maxlength') || 2000;
  function atualizar() {
    saida.textContent = campo.value.length + ' de ' + maximo + ' caracteres';
  }
  campo.addEventListener('input', atualizar);
  if (campo.form) campo.form.addEventListener('reset', function () { setTimeout(atualizar); });
  atualizar();
});

/* --------------------------------------------------- formata o código digitado */
document.querySelectorAll('[data-formato-codigo]').forEach(function (campo) {
  campo.addEventListener('input', function () {
    var limpo = campo.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    campo.value = limpo.length > 4 ? limpo.slice(0, 4) + '-' + limpo.slice(4) : limpo;
  });
});

/* --------------------------------------------------- formulário de denúncia (RF01–RF06)
   POST /api/denuncias -> { protocolo, codigo }. A confirmação recebe os dois por
   sessionStorage, nunca pela URL, para o código não ficar no histórico do navegador.
--------------------------------------------------------------------------- */
var formDenuncia = document.querySelector('#form-denuncia');
if (formDenuncia) {
  formDenuncia.elements.data_ocorrencia.max = GE.hoje();

  // As mesmas regras do servidor (servidor/validacao.js), para avisar antes de enviar.
  var validarDenuncia = function (dados) {
    var erros = {};
    if (!dados.tipo) erros.tipo = 'Escolha o que aconteceu.';
    if (!(dados.descricao || '').trim()) erros.descricao = 'Conte o que aconteceu.';
    if (!dados.data_ocorrencia) erros.data_ocorrencia = 'Informe quando aconteceu.';
    else if (dados.data_ocorrencia > GE.hoje()) erros.data_ocorrencia = 'A data não pode ser depois de hoje.';
    if (!dados.local) erros.local = 'Escolha onde aconteceu.';
    return erros;
  };

  formDenuncia.addEventListener('submit', async function (evento) {
    evento.preventDefault();

    var erro = document.querySelector('#erro-envio');
    var botao = formDenuncia.querySelector('button[type="submit"]');
    GE.limparErros(formDenuncia);

    var dados = Object.fromEntries(new FormData(formDenuncia).entries());
    var erros = validarDenuncia(dados);
    if (Object.keys(erros).length) {
      GE.mostrarErros(formDenuncia, erros);
      erro.textContent = 'Confira os campos indicados.';
      return;
    }

    botao.disabled = true;
    botao.textContent = 'Enviando...';
    var resposta = await GE.api('POST', '/api/denuncias', dados);

    if (resposta.status === 201) {
      sessionStorage.setItem('ge_protocolo', resposta.corpo.protocolo);
      sessionStorage.setItem('ge_codigo', resposta.corpo.codigo);
      window.location.href = 'confirmacao.html';
      return;
    }
    if (resposta.status === 400 && resposta.corpo.campos) {
      GE.mostrarErros(formDenuncia, resposta.corpo.campos);
      erro.textContent = 'Confira os campos indicados.';
    } else {
      erro.textContent = 'Não foi possível enviar agora. Verifique a conexão e tente de novo. O que você escreveu continua aqui.';
    }
    botao.disabled = false;
    botao.textContent = 'Enviar denúncia';
  });
}

/* --------------------------------------------------- tela de confirmação (RF08, RF09) */
var caixaCodigo = document.querySelector('#codigo-gerado');
if (caixaCodigo) {
  var codigo = sessionStorage.getItem('ge_codigo');
  var protocolo = sessionStorage.getItem('ge_protocolo');
  if (codigo && protocolo) {
    caixaCodigo.textContent = codigo;
    document.querySelector('#protocolo-gerado').textContent = protocolo;
  } else {
    // Página aberta de novo ou direto pelo endereço: o código não aparece outra vez (RN01).
    document.querySelector('#com-codigo').hidden = true;
    document.querySelector('#sem-codigo').hidden = false;
  }
  // o código sai da memória assim que a pessoa deixa a página
  window.addEventListener('pagehide', function () {
    sessionStorage.removeItem('ge_codigo');
    sessionStorage.removeItem('ge_protocolo');
  });
}

/* --------------------------------------------------- consulta pelo código (RF11)
   O código vai no corpo do POST, nunca na URL. O resultado segue para andamento.html
   por sessionStorage, que some quando a aba é fechada.
--------------------------------------------------------------------------- */
var formConsulta = document.querySelector('#form-consulta');
if (formConsulta) {
  formConsulta.addEventListener('submit', async function (evento) {
    evento.preventDefault();

    var saida = document.querySelector('#erro-codigo');
    var botao = formConsulta.querySelector('button[type="submit"]');
    var codigoDigitado = formConsulta.elements.codigo.value;
    saida.textContent = '';
    if (codigoDigitado.replace(/[^A-Za-z0-9]/g, '').length !== 8) {
      saida.textContent = 'Digite o código de 8 caracteres que você recebeu, como 7H2K-9QX4.';
      formConsulta.elements.codigo.focus();
      return;
    }

    botao.disabled = true;
    var resposta = await GE.api('POST', '/api/denuncias/consulta', { codigo: codigoDigitado });
    if (resposta.status === 200) {
      sessionStorage.setItem('ge_consulta', JSON.stringify(resposta.corpo));
      window.location.href = 'andamento.html';
      return;
    }
    botao.disabled = false;
    if (resposta.status === 400 || resposta.status === 404) {
      saida.textContent = (resposta.corpo.campos && resposta.corpo.campos.codigo) || resposta.corpo.erro;
    } else {
      saida.textContent = 'Não foi possível consultar agora. Verifique a conexão e tente de novo.';
    }
    formConsulta.elements.codigo.focus();
  });
}

/* --------------------------------------------------- andamento visto pelo denunciante (RF12, RF13) */
var blocoAndamento = document.querySelector('#andamento');
if (blocoAndamento) {
  var consulta = null;
  try {
    consulta = JSON.parse(sessionStorage.getItem('ge_consulta'));
  } catch (e) {
    consulta = null;
  }
  if (!consulta || !consulta.protocolo) {
    window.location.replace('consultar.html');
  } else {
    document.querySelector('#andamento-protocolo').textContent = 'Protocolo ' + consulta.protocolo;
    document.querySelector('#andamento-resumo').textContent = GE.TIPOS[consulta.tipo] + ' · enviada em ' + GE.formatarData(consulta.criado_em);
    document.querySelector('#andamento-status').replaceChildren(GE.etiquetaStatus(consulta.status));
    GE.linhaDoTempo(document.querySelector('#andamento-historico'), consulta, false);
    blocoAndamento.hidden = false;
  }
}

/* --------------------------------------------------- login da escola (RF14)
   Sem JavaScript, o formulário também funciona: o servidor volta com ?erro=. */
var formLogin = document.querySelector('#form-login');
if (formLogin) {
  var erroLogin = document.querySelector('#erro-login');
  var MENSAGENS_LOGIN = {
    credenciais: 'E-mail ou senha incorretos.',
    tentativas: 'Muitas tentativas erradas. Espere alguns minutos e tente de novo.'
  };
  var motivo = new URLSearchParams(window.location.search).get('erro');
  if (MENSAGENS_LOGIN[motivo]) erroLogin.textContent = MENSAGENS_LOGIN[motivo];

  // Quem já está logado vai direto para a lista.
  GE.api('GET', '/api/sessao').then(function (resposta) {
    if (resposta.status === 200) window.location.replace('/denuncias.html');
  });

  formLogin.addEventListener('submit', async function (evento) {
    evento.preventDefault();
    var botao = formLogin.querySelector('button[type="submit"]');
    erroLogin.textContent = '';
    var email = formLogin.elements.email.value.trim();
    var senha = formLogin.elements.senha.value;
    if (!email || !senha) {
      erroLogin.textContent = 'Digite o e-mail e a senha.';
      return;
    }

    botao.disabled = true;
    var resposta = await GE.api('POST', '/api/sessao', { email: email, senha: senha });
    if (resposta.status === 201) {
      window.location.href = '/denuncias.html';
      return;
    }
    botao.disabled = false;
    if (resposta.status === 401 || resposta.status === 429) erroLogin.textContent = resposta.corpo.erro;
    else if (resposta.status === 400) erroLogin.textContent = 'Digite o e-mail e a senha.';
    else erroLogin.textContent = 'Não foi possível entrar agora. Verifique a conexão e tente de novo.';
  });
}
