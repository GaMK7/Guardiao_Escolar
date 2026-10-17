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
│   ├── index.js          sobe o servidor
│   ├── ambiente.js       lê o .env e confere as variáveis
│   ├── app.js            API, telas do front e tratamento de erros
│   ├── banco.js          conexão com o PostgreSQL
│   ├── codigo.js         geração e hash do código de acompanhamento
│   ├── validacao.js      validação no servidor
│   ├── autenticacao.js   sessões e bloqueio das rotas da escola
│   ├── senha.js          hash de senha com bcrypt
│   ├── limite.js         limite de tentativas erradas de login
│   ├── criar-admin.js    cria acesso à área da escola (npm run criar-admin)
│   └── rotas/
│       ├── denuncias.js  registro, consulta, detalhe e andamentos
│       ├── sessao.js     login e saída
│       └── conta.js      troca da própria senha
├── guardiao-escolar-postgresql.sql   banco (rodar no Neon)
├── .env.example
└── LEIAME.md
```

Para ver as telas agora, basta abrir `index.html` no navegador. Os dados exibidos são de exemplo.

## Onde o back-end entra

Rotas que as telas usam. As que precisam de login respondem `401` sem uma sessão válida.

| Tela | Rota | Retorno | Situação |
|---|---|---|---|
| denuncia.html | `POST /api/denuncias` | `{ protocolo, codigo }` | pronta |
| consultar.html | `POST /api/denuncias/consulta` | status + histórico público | pronta |
| admin/login.html | `POST /api/sessao` | cria a sessão | pronta |
| telas da escola | `GET /api/sessao` | quem está logado | pronta, precisa de login |
| admin/denuncias.html | `GET /api/denuncias?status=&tipo=` | lista | falta |
| admin/denuncias.html | `GET /api/denuncias/resumo` | contagem por status | falta |
| admin/detalhe.html | `GET /api/denuncias/:protocolo` | denúncia completa | pronta, precisa de login |
| admin/detalhe.html | `POST /api/denuncias/:protocolo/andamentos` | grava status + providência | pronta, precisa de login |
| (sem tela) | `PUT /api/conta/senha` | troca a própria senha | pronta, precisa de login |
| telas da escola | `GET /api/sessao/sair` ou `DELETE /api/sessao` | encerra a sessão | pronta |

## Como rodar o back-end

Precisa do Node.js 20.12 ou mais novo.

1. `npm install`
2. Copie `.env.example` para `.env` e preencha `DATABASE_URL` e `CODIGO_SEGREDO`.
3. Rode `guardiao-escolar-postgresql.sql` no SQL Editor do Neon. Pode rodar de novo quando o arquivo mudar: ele atualiza o banco sem apagar dados.
4. Crie o primeiro acesso à área da escola: `npm run criar-admin -- coordenacao@escola.edu.br`. O comando mostra uma senha provisória uma única vez. Rodar de novo com o mesmo e-mail gera uma senha nova: é assim que se recupera uma senha esquecida.
5. `npm run dev` e abra `http://localhost:3000`. O mesmo servidor entrega as telas e a API.

Em produção, use `NODE_ENV=production` e HTTPS: o cookie de login só trafega por HTTPS.

### Rotas prontas

`POST /api/denuncias` registra a denúncia, sempre anônima.

- Recebe `tipo`, `descricao`, `data_ocorrencia` (AAAA-MM-DD), `local` e `vinculo` (opcional). Qualquer outro campo, como nome ou contato, é descartado.
- Responde `201 { protocolo, codigo }`. O código só aparece nessa resposta; o banco guarda apenas o hash dele (função `hashCodigo` em `servidor/codigo.js`, que a consulta pública também deve usar).
- Com dado inválido, responde `400 { erro, campos }`, com uma mensagem por campo: `{ "campos": { "local": "Escolha onde aconteceu." } }`. As outras rotas seguem o mesmo formato.

`POST /api/denuncias/consulta` é a consulta pública pelo código.

- Recebe `{ codigo }` no corpo, e não na URL, para o código não ficar no histórico do navegador. Aceita minúsculas, espaço e falta de hífen.
- Responde `200 { protocolo, tipo, status, criado_em, andamentos: [{ status, providencia, criado_em }] }`. Não devolve relato, local, vínculo nem quem escreveu a providência.
- Código com formato errado: `400`. Código que não existe: `404`.

`GET /api/denuncias/:protocolo` (precisa de login) devolve a denúncia completa: o mesmo da consulta, mais `descricao`, `data_ocorrencia`, `local`, `vinculo` e o `autor` (e-mail) de cada andamento.

`POST /api/denuncias/:protocolo/andamentos` (precisa de login) registra uma providência.

- Recebe `{ status, providencia }`. A providência é obrigatória, com até 800 caracteres. Mandar o status atual registra só a providência.
- O caminho do status é Recebida → Em análise → Concluída ou Arquivada. Fora dele a resposta é `409`.
- Autor e data-hora são gravados pelo banco. O histórico não pode ser editado nem apagado.
- Responde `201 { status, providencia, criado_em, autor }`. Protocolo inexistente: `404`. Usuário inativo: `403`.

`DELETE /api/denuncias/:protocolo` sempre responde `405`: denúncia não se exclui, se arquiva.

`PUT /api/conta/senha` (precisa de login) recebe `{ senha_atual, senha_nova }` e responde `204`. A nova senha precisa ter de 8 a 72 caracteres. As outras sessões do usuário são encerradas.

### Login

`POST /api/sessao` recebe `{ email, senha }`.

- **Pedido JSON (`fetch`):** responde `201 { email }`. Com e-mail ou senha errados, `401 { erro: "E-mail ou senha incorretos." }`, a mesma mensagem nos dois casos.
- **Formulário do `admin/login.html` (sem JavaScript):** redireciona para `/denuncias.html`. Se der errado, volta para `/admin/login.html?erro=credenciais` ou `?erro=tentativas`, e a tela pode mostrar a mensagem pelo parâmetro.
- **Tentativas:** depois de 5 senhas erradas para o mesmo e-mail, o login fica bloqueado por 15 minutos (`429`, com `Retry-After`).
- **Sessão:** dura 8 horas, num cookie `HttpOnly` e `SameSite=Strict`. O banco guarda só o hash do token. Sair apaga a sessão no banco, e usuário desativado perde o acesso na hora.

As telas `denuncias.html` e `detalhe.html` mandam para o login quem não está logado. Na API, toda rota da escola usa o `exigirLogin` de `servidor/autenticacao.js`. Rota nova da escola precisa dele também (RNF07).

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
