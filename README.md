# Guardião Escolar

Aplicação web para registrar denúncias de bullying, assédio, ameaças e agressões na escola, sem precisar se identificar. Quem denuncia recebe um código para acompanhar o caso. A equipe autorizada da escola entra numa área com login para ver as denúncias e registrar as providências.

Projeto de extensão, semestre 2026/2.

## Como funciona

**Quem denuncia** (sem login):

1. Preenche o formulário: tipo, relato, data, local e, se quiser, a relação com a escola.
2. Recebe um protocolo e um código de acompanhamento. O código aparece uma única vez.
3. Consulta o andamento com o código: status e providências, sem nada que identifique outras pessoas.

**A escola** (com login):

- Vê a lista de denúncias, filtra por tipo e por status e acompanha a contagem.
- Abre uma denúncia, muda o status (Recebida → Em análise → Concluída ou Arquivada) e registra a providência. O sistema grava quem fez e quando.
- Troca a própria senha.
- O perfil **administrador** também cadastra e desativa os usuários da área da escola.

### Decisões da equipe que diferem do escopo

- **Banco PostgreSQL (Neon)** no lugar de SQLite.
- **Toda denúncia é anônima.** O formulário não tem nome nem contato (RF02 ficou só com a opção anônima). O vínculo com a escola é opcional e inclui "outro".

## Tecnologias

HTML, CSS e JavaScript puro no front-end. Node.js com Express no back-end. PostgreSQL no Neon. A API segue o padrão REST.

## Como rodar

Precisa do Node.js 20.12 ou mais novo.

1. `npm install`
2. Copie `.env.example` para `.env` e preencha `DATABASE_URL` e `CODIGO_SEGREDO`. O comando para gerar a chave está no próprio arquivo.
3. Rode `guardiao-escolar-postgresql.sql` no SQL Editor do Neon. Pode rodar de novo sempre que o arquivo mudar: ele atualiza o banco sem apagar dados.
4. Crie o primeiro administrador:
   ```
   npm run criar-admin -- coordenacao@escola.edu.br "Nome da Pessoa"
   ```
   O comando mostra uma senha provisória uma única vez. Os outros usuários são cadastrados pela tela **Usuários**.
5. `npm run dev` e abra `http://localhost:3000`. O mesmo servidor entrega as telas e a API.

Se ninguém mais consegue entrar (senha esquecida, administrador desativado), rode o `criar-admin` de novo com o e-mail de um administrador. Ele gera senha nova, reativa o acesso e dá perfil de administrador.

## Testes

```
npm test
```

São 48 testes automáticos, organizados pelos requisitos do escopo: registro, validação, consulta pública, login, lista e contagem, andamento, usuários, troca de senha, segurança e HTTPS. Rodam num PostgreSQL em memória (PGlite), sem precisar do Neon nem do `.env`. Estão em [testes/](testes/).

## Produção e HTTPS (RNF01)

- Use `NODE_ENV=production` e as mesmas variáveis do `.env`, configuradas no painel da hospedagem. O `.env` não vai para o servidor nem para o Git.
- O certificado HTTPS fica na hospedagem (Render, Railway e similares), num proxy na frente do Node. Em produção o servidor:
  - redireciona todo pedido HTTP para HTTPS;
  - envia HSTS, para o navegador não tentar HTTP de novo;
  - só manda o cookie de login por HTTPS.
- Em produção, o servidor confia no primeiro proxy para saber se o pedido veio por HTTPS. Não rode com `NODE_ENV=production` sem esse proxy: todo pedido seria redirecionado.

## Estrutura

```
├── index.html            início
├── denuncia.html         formulário de denúncia
├── confirmacao.html      protocolo e código de acompanhamento
├── consultar.html        consulta pelo código
├── andamento.html        andamento visto por quem denunciou
├── informacoes.html      o que é bullying e onde buscar ajuda
├── admin/login.html      login da escola
├── denuncias.html        lista, filtros e contagem          (precisa de login)
├── detalhe.html          detalhe e atualização do caso      (precisa de login)
├── usuarios.html         cadastro e desativação de usuários (precisa de login de administrador)
├── senha.html            troca da própria senha             (precisa de login)
├── css/estilo.css
├── js/app.js             telas públicas, login e funções compartilhadas
├── js/admin.js           telas da escola
├── servidor/
│   ├── index.js          sobe o servidor
│   ├── app.js            API, telas, HTTPS e cabeçalhos de segurança
│   ├── ambiente.js       lê o .env e confere as variáveis
│   ├── banco.js          conexão com o PostgreSQL
│   ├── codigo.js         código de acompanhamento e o hash dele
│   ├── validacao.js      validação de tudo que chega
│   ├── autenticacao.js   sessões, exigirLogin e exigirAdministrador
│   ├── senha.js          bcrypt e senha provisória
│   ├── limite.js         limite de tentativas de login
│   ├── criar-admin.js    npm run criar-admin
│   └── rotas/            denuncias, sessao, conta e usuarios
├── testes/               npm test
├── guardiao-escolar-postgresql.sql
└── .env.example
```

## API

As rotas marcadas com **login** respondem `401` sem uma sessão válida. As de **administrador** respondem `403` para o perfil responsável. Dado inválido responde `400 { erro, campos }`, com uma mensagem por campo.

| Método e rota | Acesso | O que faz |
|---|---|---|
| `POST /api/denuncias` | público | Registra a denúncia. `201 { protocolo, codigo }` |
| `POST /api/denuncias/consulta` | público | Consulta pelo `{ codigo }`, que vai no corpo e nunca na URL. `200 { protocolo, tipo, status, criado_em, andamentos }` ou `404` |
| `POST /api/sessao` | público | Login com `{ email, senha }`. `201 { nome, email, perfil }`, `401` ou `429` |
| `GET /api/sessao` | login | Quem está logado |
| `DELETE /api/sessao` ou `GET /api/sessao/sair` | público | Sai |
| `GET /api/denuncias?status=&tipo=&pagina=` | login | Lista, da mais recente para a mais antiga, 50 por página. `{ total, pagina, por_pagina, denuncias }` |
| `GET /api/denuncias/resumo` | login | Contagem `{ total, por_status, por_tipo }` |
| `GET /api/denuncias/:protocolo` | login | Denúncia completa, com o histórico e o nome de quem registrou cada providência |
| `POST /api/denuncias/:protocolo/andamentos` | login | `{ status, providencia }`. `201`, ou `409` fora do caminho de status |
| `DELETE /api/denuncias/:protocolo` | — | Sempre `405`: denúncia não se exclui, se arquiva |
| `PUT /api/conta/senha` | login | `{ senha_atual, senha_nova }`. `204` e desconecta os outros aparelhos |
| `GET /api/usuarios` | administrador | Lista os usuários |
| `POST /api/usuarios` | administrador | `{ nome, email, perfil }`. `201` com a `senha_provisoria`, ou `409` se o e-mail já existe |
| `PATCH /api/usuarios/:id` | administrador | `{ ativo: true \| false }`. Desativar tira o acesso na hora. Ninguém desativa o próprio acesso (`409`) |
| `POST /api/usuarios/:id/senha` | administrador | Gera senha provisória nova para quem esqueceu. `200 { senha_provisoria }` |

O login também aceita o formulário sem JavaScript: em vez de JSON, redireciona para a lista ou de volta para `/admin/login.html?erro=credenciais` (ou `?erro=tentativas`).

## Segurança e privacidade

- **Anonimato (RN02):**
  - nome, contato ou qualquer campo fora do formulário é descartado;
  - não existe log de requisições, então o IP não fica registrado;
  - erros não gravam o relato no log.
- **Código de acompanhamento (RN01):**
  - é sorteado com 8 caracteres e o banco guarda só um HMAC dele;
  - **não troque a `CODIGO_SEGREDO` depois que houver denúncias**, ou os códigos já entregues param de funcionar;
  - o código vai da tela de envio para a de confirmação por `sessionStorage`, nunca pela URL.
- **Senhas (RNF02):** ficam no banco com bcrypt.
- **Login:**
  - depois de 5 senhas erradas, o e-mail fica bloqueado por 15 minutos;
  - a mensagem de erro não revela se o e-mail existe.
- **Sessão:**
  - dura 8 horas, num cookie `HttpOnly` e `SameSite=Strict`, e o banco guarda só o hash do token;
  - sair, desativar o usuário ou trocar a senha encerra a sessão na hora.
- **Controle de acesso (RNF07):** toda rota da escola usa `exigirLogin`, e as de usuários também `exigirAdministrador`. Rota nova da escola precisa deles.
- **Histórico (RN03, RN04):**
  - o banco impede excluir denúncias e alterar ou apagar o histórico;
  - autor e data-hora de cada providência são gravados pelo banco, nunca vêm do navegador.
- **Consultas ao banco (RNF04):** são todas parametrizadas.
- **Telas:** o que vem do servidor entra como texto, nunca como HTML. A política de conteúdo (CSP) só permite scripts dos arquivos do próprio site.
- **Arquivos públicos:** o navegador só alcança as páginas e as pastas `css`, `js`, `img` e `admin`. O `.env` e a pasta `servidor/` ficam fora.

## Requisitos e onde estão

| Requisitos | Onde |
|---|---|
| RF01–RF10, RN01, RN02, RN05, RNF06, RNF08 | `denuncia.html`, `confirmacao.html`, `POST /api/denuncias` |
| RF11–RF13 | `consultar.html`, `andamento.html`, `POST /api/denuncias/consulta` |
| RF14, RF15, RNF02, RNF07 | `admin/login.html`, `servidor/autenticacao.js`, `servidor/rotas/sessao.js` |
| RF16, RF17, RF21 | `denuncias.html`, `GET /api/denuncias` e `/resumo` |
| RF18–RF20, RN03, RN04 | `detalhe.html`, rotas de detalhe e andamentos, regras no banco |
| RF22 | `usuarios.html`, `servidor/rotas/usuarios.js` |
| RF23 | `senha.html`, `PUT /api/conta/senha` |
| RF24, RF25, RF07 | `informacoes.html` e avisos de 190 e 100 nas telas públicas |
| RNF01 | `servidor/app.js` (redirecionamento, HSTS) e cookie `Secure` em produção |
| RNF03–RNF05 | `servidor/validacao.js`, consultas parametrizadas, formulário só com o necessário |
| RNF15–RNF17 | este README, `.env.example` e `.gitignore`, códigos HTTP da tabela acima |
