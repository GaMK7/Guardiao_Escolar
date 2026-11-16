/* Limites contra robôs: denúncias em massa, adivinhação de códigos e de senhas.
   Ficam em memória: zeram quando o servidor reinicia, e cada processo conta separado. */
const crypto = require('node:crypto');

const MAX_CHAVES = 50000;
const QUINZE_MIN_MS = 15 * 60 * 1000;

/* ------------------------------------------------- origem do pedido
   O IP nunca é guardado (RN02): vira um HMAC com uma chave sorteada a cada início do
   servidor, que não sai da memória. Nem quem lê a memória do processo recupera o IP. */
const CHAVE_ORIGEM = crypto.randomBytes(32);

/* IPv4 conta por endereço. IPv6 conta pelo bloco /64, que um único aparelho ou casa
   costuma receber inteiro: sem isso, trocar de endereço dentro do bloco furaria o limite. */
function blocoDoIp(ip) {
  const texto = String(ip || '').split('%')[0];
  const mapeado = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(texto);
  if (mapeado) return mapeado[1];
  if (!texto.includes(':')) return texto;

  const [inicio, fim] = texto.split('::');
  const antes = inicio ? inicio.split(':') : [];
  let grupos = antes;
  if (fim !== undefined) {
    const depois = fim ? fim.split(':') : [];
    grupos = antes.concat(Array(Math.max(0, 8 - antes.length - depois.length)).fill('0'), depois);
  }
  return grupos.slice(0, 4).map((grupo) => (parseInt(grupo, 16) || 0).toString(16)).join(':') + '::/64';
}

// Em produção, req.ip vem do X-Forwarded-For posto pelo proxy (trust proxy, em app.js).
function chaveDaOrigem(req) {
  return crypto.createHmac('sha256', CHAVE_ORIGEM).update(blocoDoIp(req.ip)).digest('base64url');
}

/* ------------------------------------------------- contador
   Conta pedidos por chave numa janela de tempo fixa.
   O pedido é contado ao chegar, antes de qualquer consulta ao banco ou bcrypt:
   assim, pedidos disparados todos ao mesmo tempo não passam juntos pelo limite. */
function criarLimite({ maximo, janelaMs }) {
  const contagens = new Map(); // chave -> { quantidade, desde }

  function abrirJanela(chave, agora) {
    if (contagens.size >= MAX_CHAVES) {
      for (const [outra, antigo] of contagens) if (agora - antigo.desde > janelaMs) contagens.delete(outra);
      // Ainda cheio: sai a janela aberta há mais tempo (o Map guarda a ordem de entrada).
      if (contagens.size >= MAX_CHAVES) contagens.delete(contagens.keys().next().value);
    }
    const registro = { quantidade: 0, desde: agora };
    contagens.delete(chave);
    contagens.set(chave, registro);
    return registro;
  }

  // Conta o pedido e devolve 0, ou, se o limite já foi atingido, os segundos até liberar.
  function reservar(chave) {
    const agora = Date.now();
    let registro = contagens.get(chave);
    if (!registro || agora - registro.desde > janelaMs) registro = abrirJanela(chave, agora);
    if (registro.quantidade >= maximo) return Math.max(1, Math.ceil((registro.desde + janelaMs - agora) / 1000));
    registro.quantidade++;
    return 0;
  }

  // Desconta um pedido que não deve pesar: consulta com código certo, login certo.
  function devolver(chave) {
    const registro = contagens.get(chave);
    if (registro && registro.quantidade > 0) registro.quantidade--;
  }

  // Zera a chave.
  function limpar(chave) {
    contagens.delete(chave);
  }

  return { reservar, devolver, limpar };
}

// Resposta padrão de limite atingido: 429 { erro }, com Retry-After em segundos.
function responderLimite(res, segundos, erro) {
  res.set('Retry-After', String(segundos));
  return res.status(429).json({ erro });
}

/* ------------------------------------------------- login (RF14)
   Três contadores de 15 minutos. Login certo não conta, mas também não apaga os erros de antes.
   - Por conta: 5 erros vindos de navegadores desconhecidos bloqueiam o e-mail.
   - Por aparelho: o navegador onde a pessoa já entrou tem os seus próprios 5 erros e não
     fica preso no bloqueio da conta. Quem só quer trancar a coordenação do lado de fora,
     errando a senha dela de propósito, não consegue (técnica "device cookie" da OWASP).
   - Por origem (IP): 20 erros, mesmo espalhados em e-mails diferentes. */
const LOGIN_POR_CONTA = criarLimite({ maximo: 5, janelaMs: QUINZE_MIN_MS });
const LOGIN_POR_APARELHO = criarLimite({ maximo: 5, janelaMs: QUINZE_MIN_MS });
const LOGIN_POR_ORIGEM = criarLimite({ maximo: 20, janelaMs: QUINZE_MIN_MS });

/* Reserva uma tentativa de login, antes de conferir a senha.
   "aparelho" é o identificador do cookie de aparelho já validado para este e-mail, ou null.
   Devolve { espera } com os segundos até poder tentar de novo, ou { acertou },
   que deve ser chamada quando a senha conferir. */
function reservarLogin({ email, aparelho, origem }) {
  // Aparelho conhecido usa o próprio contador. Se ele esgotou, vale o da conta, como um desconhecido.
  let contador = LOGIN_POR_APARELHO;
  let chave = aparelho;
  if (!aparelho || LOGIN_POR_APARELHO.reservar(aparelho)) {
    contador = LOGIN_POR_CONTA;
    chave = email;
    const espera = LOGIN_POR_CONTA.reservar(email);
    if (espera) return { espera };
  }

  const espera = LOGIN_POR_ORIGEM.reservar(origem);
  if (espera) {
    contador.devolver(chave); // barrado pela origem: não gasta a vaga da conta
    return { espera };
  }

  return {
    acertou() {
      contador.devolver(chave);
      LOGIN_POR_ORIGEM.devolver(origem);
    }
  };
}

// Senha nova gerada pelo administrador: a conta volta a aceitar login na hora, de qualquer lugar.
function liberarConta(email) {
  LOGIN_POR_CONTA.limpar(email);
}

module.exports = {
  blocoDoIp, chaveDaOrigem, criarLimite, responderLimite,
  reservarLogin, liberarConta
};
