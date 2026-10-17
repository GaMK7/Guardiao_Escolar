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
├── servidor/             back-end em Node.js + Express
│   ├── index.js          lê o .env e sobe o servidor
│   ├── app.js            API, telas do front e tratamento de erros
│   ├── banco.js          conexão com o PostgreSQL
│   ├── codigo.js         geração e hash do código de acompanhamento
│   ├── validacao.js      validação no servidor
│   └── rotas/denuncias.js
├── guardiao-escolar-postgresql.sql   banco (rodar no Neon)
├── .env.example
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

## Como rodar o back-end

Precisa do Node.js 20.12 ou mais novo.

1. `npm install`
2. Copie `.env.example` para `.env` e preencha `DATABASE_URL` e `CODIGO_SEGREDO`.
3. Rode `guardiao-escolar-postgresql.sql` no SQL Editor do Neon. Pode rodar de novo quando o arquivo mudar: ele atualiza o banco sem apagar dados.
4. `npm run dev` e abra `http://localhost:3000`. O mesmo servidor entrega as telas e a API.

### Rotas prontas

`POST /api/denuncias` registra a denúncia, sempre anônima.

- Recebe `tipo`, `descricao`, `data_ocorrencia` (AAAA-MM-DD), `local` e `vinculo` (opcional). Qualquer outro campo, como nome ou contato, é descartado.
- Responde `201 { protocolo, codigo }`. O código só aparece nessa resposta; o banco guarda apenas o hash dele (função `hashCodigo` em `servidor/codigo.js`, que a consulta pública também deve usar).
- Com dado inválido, responde `400 { erro, campos }`, com uma mensagem por campo: `{ "campos": { "local": "Escolha onde aconteceu." } }`.

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
