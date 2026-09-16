# Guardião Escolar — front-end

HTML e CSS das nove telas do escopo simplificado. Nenhum framework: só HTML5, CSS3 e JavaScript, como definido no projeto.

## Estrutura

```
guardiao-escolar/
├── index.html            Tela 1 — início
├── denuncia.html         Tela 2 — formulário de registro
├── confirmacao.html      Tela 3 — protocolo e código de acompanhamento
├── consultar.html        Tela 4 — consulta pelo código
├── andamento.html        Tela 5 — histórico visto pelo denunciante
├── informacoes.html      Tela 6 — conteúdo informativo
├── admin/
│   ├── login.html        Tela 7 — acesso da escola
│   ├── denuncias.html    Tela 8 — lista com filtros e contadores
│   └── detalhe.html      Tela 9 — detalhe e atualização de andamento
├── css/estilo.css        folha única, com todos os componentes
├── js/app.js             cópia do código, contador, máscara e envio do formulário
└── LEIAME.md
```

Para ver as telas agora, basta abrir `index.html` no navegador. Os dados exibidos são de exemplo.

## Onde o back-end entra

As rotas abaixo ainda não existem: são os pontos que o Express precisa responder.

| Tela | Rota esperada | Retorno |
|---|---|---|
| denuncia.html | `POST /api/denuncias` | `{ protocolo, codigo }` |
| consultar.html | `GET /api/denuncias/:codigo` | denúncia + histórico público |
| admin/login.html | `POST /api/sessao` | cria a sessão |
| admin/denuncias.html | `GET /api/denuncias?status=&tipo=` | lista |
| admin/denuncias.html | `GET /api/denuncias/resumo` | contagem por status |
| admin/detalhe.html | `GET /api/denuncias/:protocolo` | denúncia completa |
| admin/detalhe.html | `POST /api/denuncias/:protocolo/andamentos` | grava status + providência |
| todas | `GET /api/sessao/sair` | encerra a sessão |

## Cuidados que já estão embutidos no HTML

- O código de acompanhamento vai da tela 2 para a 3 por `sessionStorage`, nunca pela URL, para não ficar no histórico do navegador.
- As páginas com dado sensível têm `<meta name="robots" content="noindex">`.
- Os campos de nome e contato só aparecem quando a pessoa escolhe se identificar.
- O aviso sobre o 190 está no início, no formulário e no rodapé das telas públicas.
- O campo de providência avisa, na própria tela, que o texto será visto pelo denunciante.
- A mensagem de erro do login é genérica de propósito: não deve revelar se o e-mail existe.

## O que falta fazer

1. Substituir os dados de exemplo pela renderização real (EJS, ou `fetch` no cliente).
2. Estado vazio da lista — o HTML está comentado dentro de `admin/denuncias.html`.
3. Mensagens de erro campo a campo no formulário de denúncia.
4. Validação no servidor de tudo que já é validado aqui. O `required` do HTML é conveniência, não segurança.
