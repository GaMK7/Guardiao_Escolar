@echo off
setlocal EnableExtensions
cd /d "%~dp0"

if not exist ".env.docker" (
    echo Nao encontrei .env.docker. Nenhum servico foi alterado.
    pause
    exit /b 1
)

docker compose --env-file .env.docker down
if errorlevel 1 (
    echo ERRO: nao consegui parar os servicos.
    pause
    exit /b 1
)

echo Servicos parados. Os dados do banco foram preservados.
echo Nao use docker compose down -v se quiser manter os dados.
pause
exit /b 0
