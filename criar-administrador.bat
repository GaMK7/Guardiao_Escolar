@echo off
setlocal EnableExtensions
cd /d "%~dp0"

if not exist ".env.docker" (
    echo ERRO: execute iniciar-demonstracao.bat primeiro e configure .env.docker.
    pause
    exit /b 1
)

echo Este passo deve ser feito uma unica vez para criar o acesso inicial.
echo Executar novamente redefine a senha provisoria desta conta.
echo.
choice /C SN /M "Deseja continuar"
if errorlevel 2 exit /b 0

set "ADMIN_EMAIL="
set /p "ADMIN_EMAIL=Digite o e-mail de demonstracao: "
if not defined ADMIN_EMAIL (
    echo ERRO: o e-mail nao pode ficar vazio.
    pause
    exit /b 1
)

set "ADMIN_NOME="
set /p "ADMIN_NOME=Digite o nome para a conta: "
if not defined ADMIN_NOME (
    echo ERRO: o nome nao pode ficar vazio.
    pause
    exit /b 1
)

echo.
echo Criando o administrador. Guarde a senha provisoria mostrada a seguir.
docker compose --env-file .env.docker exec app npm run criar-admin -- "%ADMIN_EMAIL%" "%ADMIN_NOME%"
if errorlevel 1 (
    echo.
    echo ERRO: nao consegui criar o usuario. Confirme se o aplicativo esta rodando.
    pause
    exit /b 1
)

echo.
set "APP_PORT=3304"
for /f "tokens=1,* delims==" %%A in ('findstr /b /c:"APP_PORT=" .env.docker') do set "APP_PORT=%%B"
echo Acesse http://localhost:%APP_PORT%/admin/login.html e troque a senha no primeiro acesso.
pause
exit /b 0
