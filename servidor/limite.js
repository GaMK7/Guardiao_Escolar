/* Limite de tentativas erradas de login por e-mail, contra adivinhação de senha.
   Fica em memória: zera quando o servidor reinicia. */
const MAX_FALHAS = 5;
const JANELA_MS = 15 * 60 * 1000;
const MAX_REGISTROS = 10000;

const falhas = new Map(); // chave -> { quantidade, desde }

function expirado(registro, agora) {
  return agora - registro.desde > JANELA_MS;
}

// Segundos até liberar de novo, ou 0 se não está bloqueado.
function segundosBloqueado(chave) {
  const registro = falhas.get(chave);
  const agora = Date.now();
  if (!registro || expirado(registro, agora)) return 0;
  if (registro.quantidade < MAX_FALHAS) return 0;
  return Math.ceil((registro.desde + JANELA_MS - agora) / 1000);
}

function registrarFalha(chave) {
  const agora = Date.now();
  const registro = falhas.get(chave);
  if (registro && !expirado(registro, agora)) {
    registro.quantidade++;
    return;
  }
  // Evita que muitos e-mails inventados encham a memória.
  if (falhas.size >= MAX_REGISTROS) {
    for (const [outra, antigo] of falhas) if (expirado(antigo, agora)) falhas.delete(outra);
  }
  falhas.set(chave, { quantidade: 1, desde: agora });
}

function limparFalhas(chave) {
  falhas.delete(chave);
}

module.exports = { segundosBloqueado, registrarFalha, limparFalhas };
