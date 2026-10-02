let visible = false;

function passwordVisible() {

   const passwordInput = document.querySelector("#password");
   const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';

   if (!visible) {
      passwordVisibleButton.classList.replace("hide", "show");
      visible = true;
   }
   else {
      passwordVisibleButton.classList.replace("show", "hide");
      visible = false;
   }

   passwordInput.setAttribute('type', type);
}

const passwordVisibleButton = document.querySelector(".password-visible");

if (passwordVisibleButton) {
   passwordVisibleButton.addEventListener("click", passwordVisible);
}
