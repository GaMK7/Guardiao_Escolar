/* ==========================================================================
   Guardião Escolar — telas da escola: lista, detalhe, usuários e troca de senha
   Usa o GE de js/app.js, que precisa ser carregado antes.
   A API confere o login em todo pedido (RNF07); se a sessão venceu, a tela volta
   para o login (RF15).
   ========================================================================== */
(function () {
  var LOGIN = '/admin/login.html';
  var PROXIMOS_STATUS = { recebida: ['analise'], analise: ['concluida', 'arquivada'], concluida: [], arquivada: [] };
  var PERFIS = { administrador: 'Administrador', responsavel: 'Responsável escolar' };
  var FALHA = 'Não foi possível carregar agora. Verifique a conexão e recarregue a página.';

  // Pedido à API da escola. Sessão vencida (401) volta para o login, e o resto da tela para.
  async function pedir(metodo, url, dados) {
    var resposta = await GE.api(metodo, url, dados);
    if (resposta.status === 401) {
      window.location.replace(LOGIN);
      return new Promise(function () {});
    }
    return resposta;
  }

  /* ------------------------------------------------- barra do topo */
  var sessao = pedir('GET', '/api/sessao').then(function (resposta) {
    var nome = document.querySelector('#usuario-nome');
    if (nome) nome.textContent = resposta.corpo.nome || '';
    var linkUsuarios = document.querySelector('#link-usuarios');
    if (linkUsuarios) linkUsuarios.hidden = resposta.corpo.perfil !== 'administrador';
    return resposta.corpo;
  });

  /* ------------------------------------------------- lista de denúncias (RF16, RF17, RF21) */
  function enderecoLista(status, tipo, pagina) {
    var parametros = new URLSearchParams();
    if (status) parametros.set('status', status);
    if (tipo) parametros.set('tipo', tipo);
    if (pagina > 1) parametros.set('pagina', pagina);
    var texto = parametros.toString();
    return 'denuncias.html' + (texto ? '?' + texto : '');
  }

  function mostrarResumo(resumo) {
    document.querySelectorAll('[data-contagem-status]').forEach(function (numero) {
      numero.textContent = resumo.por_status[numero.dataset.contagemStatus];
    });
    var lista = document.querySelector('#contagem-tipos');
    lista.replaceChildren();
    Object.keys(GE.TIPOS).forEach(function (tipo) {
      var item = GE.elemento('li', null, GE.TIPOS[tipo]);
      item.appendChild(GE.elemento('strong', null, String(resumo.por_tipo[tipo])));
      lista.appendChild(item);
    });
  }

  function mostrarLista(dados, filtrada, status, tipo) {
    var corpo = document.querySelector('#tabela-denuncias tbody');
    corpo.replaceChildren();
    dados.denuncias.forEach(function (denuncia) {
      var linha = GE.elemento('tr');
      var celulaProtocolo = GE.elemento('td', 'numero');
      var link = GE.elemento('a', null, denuncia.protocolo);
      link.href = 'detalhe.html?protocolo=' + encodeURIComponent(denuncia.protocolo);
      celulaProtocolo.appendChild(link);
      linha.appendChild(celulaProtocolo);
      linha.appendChild(GE.elemento('td', null, GE.TIPOS[denuncia.tipo]));
      linha.appendChild(GE.elemento('td', 'numero', GE.formatarData(denuncia.criado_em)));
      linha.appendChild(GE.elemento('td', null, GE.LOCAIS[denuncia.local]));
      var celulaStatus = GE.elemento('td');
      celulaStatus.appendChild(GE.etiquetaStatus(denuncia.status));
      linha.appendChild(celulaStatus);
      corpo.appendChild(linha);
    });

    var vazia = dados.total === 0;
    document.querySelector('#tabela-denuncias').hidden = vazia;
    document.querySelector('#lista-vazia').hidden = !vazia;
    document.querySelector('#lista-vazia-filtro').hidden = !filtrada;
    document.querySelector('#lista-vazia-geral').hidden = filtrada;
    document.querySelector('#tabela-denuncias caption').textContent =
      dados.total + (dados.total === 1 ? ' denúncia' : ' denúncias') + (filtrada ? ' com estes filtros' : ' no total') +
      ' · da mais recente para a mais antiga';

    var paginas = Math.ceil(dados.total / dados.por_pagina);
    var paginacao = document.querySelector('#paginacao');
    paginacao.hidden = paginas <= 1;
    if (paginas > 1) {
      var anterior = document.querySelector('#pagina-anterior');
      var seguinte = document.querySelector('#pagina-seguinte');
      anterior.hidden = dados.pagina <= 1;
      seguinte.hidden = dados.pagina >= paginas;
      anterior.href = enderecoLista(status, tipo, dados.pagina - 1);
      seguinte.href = enderecoLista(status, tipo, dados.pagina + 1);
      document.querySelector('#pagina-atual').textContent = 'Página ' + dados.pagina + ' de ' + paginas;
    }
  }

  async function carregarLista() {
    var parametros = new URLSearchParams(window.location.search);
    var status = parametros.get('status') || '';
    var tipo = parametros.get('tipo') || '';
    var pagina = Number(parametros.get('pagina')) || 1;

    document.querySelectorAll('.filtros a[data-status]').forEach(function (link) {
      link.href = enderecoLista(link.dataset.status, tipo, 1);
      if (link.dataset.status === status) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    var seletorTipo = document.querySelector('#filtro-tipo');
    seletorTipo.value = tipo;
    seletorTipo.addEventListener('change', function () {
      window.location.href = enderecoLista(status, seletorTipo.value, 1);
    });

    var busca = new URLSearchParams();
    if (status) busca.set('status', status);
    if (tipo) busca.set('tipo', tipo);
    if (pagina > 1) busca.set('pagina', pagina);
    var respostas = await Promise.all([pedir('GET', '/api/denuncias/resumo'), pedir('GET', '/api/denuncias?' + busca)]);

    if (respostas[0].status === 200) mostrarResumo(respostas[0].corpo);
    var falha = document.querySelector('#lista-falha');
    if (respostas[1].status === 200) {
      mostrarLista(respostas[1].corpo, Boolean(status || tipo), status, tipo);
    } else {
      falha.textContent = respostas[1].status === 400 ? 'Filtro inválido. Volte para "Todas".' : FALHA;
      falha.hidden = false;
      document.querySelector('#tabela-denuncias').hidden = true;
    }
  }

  if (document.querySelector('#tabela-denuncias')) carregarLista();

  /* ------------------------------------------------- detalhe e atualização (RF18, RF19, RF20) */
  var formAndamento = document.querySelector('#form-andamento');
  var protocoloAtual = new URLSearchParams(window.location.search).get('protocolo') || '';

  function mostrarDetalhe(denuncia) {
    document.title = 'Denúncia ' + denuncia.protocolo + ' — Guardião Escolar';
    document.querySelector('#detalhe-titulo').textContent = 'Denúncia ' + denuncia.protocolo;
    document.querySelector('#detalhe-status').replaceChildren(GE.etiquetaStatus(denuncia.status));
    document.querySelector('#detalhe-meta').textContent = [
      GE.TIPOS[denuncia.tipo],
      'ocorrida em ' + GE.formatarDia(denuncia.data_ocorrencia),
      GE.LOCAIS[denuncia.local],
      denuncia.vinculo ? 'relato de ' + GE.VINCULOS[denuncia.vinculo] : 'vínculo não informado'
    ].join(' · ');
    document.querySelector('#detalhe-relato').textContent = denuncia.descricao;
    GE.linhaDoTempo(document.querySelector('#detalhe-historico'), denuncia, true);

    // O status atual (só registra a providência) e os próximos permitidos pelo caminho do RF19.
    var seletor = formAndamento.elements.status;
    seletor.replaceChildren();
    [denuncia.status].concat(PROXIMOS_STATUS[denuncia.status]).forEach(function (status) {
      var opcao = GE.elemento('option', null, GE.STATUS[status] + (status === denuncia.status ? ' (manter)' : ''));
      opcao.value = status;
      seletor.appendChild(opcao);
    });
    document.querySelector('#ajuda-status').textContent = PROXIMOS_STATUS[denuncia.status].length
      ? 'O caminho é Recebida → Em análise → Concluída ou Arquivada.'
      : 'Caso encerrado. Ainda dá para registrar uma providência.';

    document.querySelector('#detalhe').hidden = false;
  }

  async function carregarDetalhe() {
    if (!/^\d{4}-\d{4,}$/.test(protocoloAtual)) {
      document.querySelector('#detalhe-ausente').hidden = false;
      return;
    }
    var resposta = await pedir('GET', '/api/denuncias/' + encodeURIComponent(protocoloAtual));
    if (resposta.status === 200) mostrarDetalhe(resposta.corpo);
    else if (resposta.status === 404) document.querySelector('#detalhe-ausente').hidden = false;
    else {
      var falha = document.querySelector('#detalhe-falha');
      falha.textContent = FALHA;
      falha.hidden = false;
    }
  }

  if (formAndamento) {
    carregarDetalhe();

    formAndamento.addEventListener('submit', async function (evento) {
      evento.preventDefault();
      var botao = formAndamento.querySelector('button[type="submit"]');
      var sucesso = document.querySelector('#andamento-salvo');
      var erroEnvio = document.querySelector('#erro-andamento');
      GE.limparErros(formAndamento);
      sucesso.textContent = '';

      var dados = { status: formAndamento.elements.status.value, providencia: formAndamento.elements.providencia.value };
      if (!dados.providencia.trim()) {
        GE.mostrarErros(formAndamento, { providencia: 'Descreva o que foi feito.' });
        return;
      }

      botao.disabled = true;
      var resposta = await pedir('POST', '/api/denuncias/' + encodeURIComponent(protocoloAtual) + '/andamentos', dados);
      botao.disabled = false;
      if (resposta.status === 201) {
        formAndamento.reset();
        sucesso.textContent = 'Atualização salva.';
        carregarDetalhe();
      } else if (resposta.status === 400 && resposta.corpo.campos) {
        GE.mostrarErros(formAndamento, resposta.corpo.campos);
      } else {
        erroEnvio.textContent = resposta.corpo.erro || 'Não foi possível salvar agora. Tente de novo em instantes.';
      }
    });
  }

  /* ------------------------------------------------- usuários da área da escola (RF22) */
  var formUsuario = document.querySelector('#form-usuario');

  function mostrarSenha(nome, senha) {
    document.querySelector('#senha-gerada-para').textContent = 'Senha provisória de ' + nome;
    document.querySelector('#senha-gerada-valor').textContent = senha;
    var bloco = document.querySelector('#senha-gerada');
    bloco.hidden = false;
    bloco.scrollIntoView({ block: 'center' });
  }

  function avisar(texto) {
    document.querySelector('#usuarios-mensagem').textContent = texto;
  }

  async function alterarSituacao(usuario, ativo) {
    var pergunta = ativo
      ? 'Reativar o acesso de ' + usuario.nome + '?'
      : 'Desativar o acesso de ' + usuario.nome + '? A pessoa sai na hora e não consegue mais entrar. O nome dela continua no histórico das denúncias.';
    if (!window.confirm(pergunta)) return;
    var resposta = await pedir('PATCH', '/api/usuarios/' + usuario.id, { ativo: ativo });
    if (resposta.status === 200) carregarUsuarios();
    else avisar(resposta.corpo.erro || FALHA);
  }

  async function gerarSenhaNova(usuario) {
    if (!window.confirm('Gerar uma senha nova para ' + usuario.nome + '? A senha atual deixa de funcionar.')) return;
    var resposta = await pedir('POST', '/api/usuarios/' + usuario.id + '/senha');
    if (resposta.status === 200) mostrarSenha(usuario.nome, resposta.corpo.senha_provisoria);
    else avisar(resposta.corpo.erro || FALHA);
  }

  function botao(texto, acao) {
    var el = GE.elemento('button', 'botao botao--secundario botao--curto', texto);
    el.type = 'button';
    el.addEventListener('click', acao);
    return el;
  }

  async function carregarUsuarios() {
    var eu = await sessao;
    var resposta = await pedir('GET', '/api/usuarios');
    if (resposta.status === 403) {
      document.querySelector('#usuarios-conteudo').hidden = true;
      document.querySelector('#usuarios-proibido').hidden = false;
      return;
    }
    if (resposta.status !== 200) return avisar(FALHA);

    var corpo = document.querySelector('#tabela-usuarios tbody');
    corpo.replaceChildren();
    resposta.corpo.usuarios.forEach(function (usuario) {
      var linha = GE.elemento('tr');
      linha.appendChild(GE.elemento('td', null, usuario.nome));
      linha.appendChild(GE.elemento('td', null, usuario.email));
      linha.appendChild(GE.elemento('td', null, PERFIS[usuario.perfil]));
      var celulaSituacao = GE.elemento('td');
      celulaSituacao.appendChild(GE.elemento('span', 'etiqueta ' + (usuario.ativo ? 'etiqueta--concluida' : 'etiqueta--arquivada'), usuario.ativo ? 'Ativo' : 'Inativo'));
      linha.appendChild(celulaSituacao);

      var acoes = GE.elemento('div', 'acoes');
      if (usuario.email === eu.email) {
        acoes.textContent = 'Você';
      } else {
        acoes.appendChild(usuario.ativo
          ? botao('Desativar', function () { alterarSituacao(usuario, false); })
          : botao('Reativar', function () { alterarSituacao(usuario, true); }));
        if (usuario.ativo) acoes.appendChild(botao('Gerar senha nova', function () { gerarSenhaNova(usuario); }));
      }
      var celulaAcoes = GE.elemento('td');
      celulaAcoes.appendChild(acoes);
      linha.appendChild(celulaAcoes);
      corpo.appendChild(linha);
    });
    document.querySelector('#usuarios-conteudo').hidden = false;
  }

  if (formUsuario) {
    carregarUsuarios();

    formUsuario.addEventListener('submit', async function (evento) {
      evento.preventDefault();
      var botaoEnviar = formUsuario.querySelector('button[type="submit"]');
      GE.limparErros(formUsuario);
      avisar('');

      var dados = {
        nome: formUsuario.elements.nome.value,
        email: formUsuario.elements.email.value,
        perfil: formUsuario.elements.perfil.value
      };
      botaoEnviar.disabled = true;
      var resposta = await pedir('POST', '/api/usuarios', dados);
      botaoEnviar.disabled = false;
      if (resposta.status === 201) {
        formUsuario.reset();
        mostrarSenha(resposta.corpo.nome, resposta.corpo.senha_provisoria);
        carregarUsuarios();
      } else if (resposta.corpo.campos) {
        GE.mostrarErros(formUsuario, resposta.corpo.campos);
      } else {
        document.querySelector('#erro-cadastro').textContent = resposta.corpo.erro || FALHA;
      }
    });
  }

  /* ------------------------------------------------- troca da própria senha (RF23) */
  var formSenha = document.querySelector('#form-senha');
  if (formSenha) {
    formSenha.addEventListener('submit', async function (evento) {
      evento.preventDefault();
      var botaoEnviar = formSenha.querySelector('button[type="submit"]');
      var sucesso = document.querySelector('#senha-salva');
      GE.limparErros(formSenha);
      sucesso.textContent = '';

      var dados = { senha_atual: formSenha.elements.senha_atual.value, senha_nova: formSenha.elements.senha_nova.value };
      if (dados.senha_nova !== formSenha.elements.senha_confirmacao.value) {
        GE.mostrarErros(formSenha, { senha_confirmacao: 'As duas senhas novas precisam ser iguais.' });
        return;
      }

      botaoEnviar.disabled = true;
      var resposta = await pedir('PUT', '/api/conta/senha', dados);
      botaoEnviar.disabled = false;
      if (resposta.status === 204) {
        formSenha.reset();
        sucesso.textContent = 'Senha alterada. Se você estava conectado em outro aparelho, ele foi desconectado.';
      } else if (resposta.status === 400 && resposta.corpo.campos) {
        GE.mostrarErros(formSenha, resposta.corpo.campos);
      } else {
        document.querySelector('#erro-senha').textContent = resposta.corpo.erro || FALHA;
      }
    });
  }
})();
