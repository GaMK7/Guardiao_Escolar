document.addEventListener("DOMContentLoaded", function () {
  const senha = document.getElementById("senha");
  const botao = document.querySelector(".alternar-senha");

  if (!senha || !botao) return;

  botao.addEventListener("click", function () {
    const mostrando = senha.type === "password";

    senha.type = mostrando ? "text" : "password";

    botao.setAttribute("aria-label", mostrando ? "Ocultar senha" : "Mostrar senha");

    botao.setAttribute("aria-pressed", String(mostrando));
  });
});
