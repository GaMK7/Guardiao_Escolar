@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "CONFIG=.env.docker"
set "EXEMPLO=.env.docker.example"

if not exist "%CONFIG%" (
    if not exist "%EXEMPLO%" (
        echo ERRO: nao encontrei %EXEMPLO% nesta pasta.
        echo Extraia o ZIP completo da release e tente novamente.
        goto falha
    )
    copy "%EXEMPLO%" "%CONFIG%" >nul
    for /f %%G in ('powershell -NoProfile -Command "New-Guid"') do set "GE_DB_PASSWORD=%%G"
    for /f %%G in ('powershell -NoProfile -Command "New-Guid"') do set "GE_CODE_SECRET=%%G"
    if not defined GE_DB_PASSWORD (
        echo ERRO: nao consegui gerar uma senha local. Confirme se o PowerShell esta disponivel.
        goto falha
    )
    if not defined GE_CODE_SECRET (
        echo ERRO: nao consegui gerar a chave do aplicativo.
        goto falha
    )
    powershell -NoProfile -Command "$path='.env.docker'; $content=Get-Content -LiteralPath $path -Raw; $content=$content.Replace('guardiao_local_only_change_me',$env:GE_DB_PASSWORD); $content=$content.Replace('local-only-example-key-replace-with-a-random-secret-at-least-32-chars',$env:GE_CODE_SECRET); [System.IO.File]::WriteAllText((Resolve-Path $path),$content,[System.Text.UTF8Encoding]::new($false))"
    if errorlevel 1 goto falha
    echo Arquivo .env.docker criado com segredos locais aleatorios.
    echo Ele fica somente neste computador e nao deve ser compartilhado.
)

findstr /L /C:"guardiao_local_only_change_me" "%CONFIG%" >nul
if not errorlevel 1 (
    echo ERRO: troque a senha de exemplo em .env.docker antes de continuar.
    echo Use o mesmo valor em POSTGRES_PASSWORD e em DATABASE_URL.
    notepad "%CONFIG%"
    goto falha
)

findstr /L /C:"local-only-example-key-replace" "%CONFIG%" >nul
if not errorlevel 1 (
    echo ERRO: troque CODIGO_SEGREDO em .env.docker antes de continuar.
    notepad "%CONFIG%"
    goto falha
)

set "APP_PORT=3304"
for /f "tokens=1,* delims==" %%A in ('findstr /b /c:"APP_PORT=" "%CONFIG%"') do set "APP_PORT=%%B"

docker --version >nul 2>&1
if errorlevel 1 (
    echo ERRO: Docker nao foi encontrado. Instale e abra o Docker Desktop.
    goto falha
)

docker compose version >nul 2>&1
if errorlevel 1 (
    echo ERRO: Docker Compose nao esta disponivel. Atualize o Docker Desktop.
    goto falha
)

docker info >nul 2>&1
if errorlevel 1 (
    echo ERRO: o Docker Desktop nao esta iniciado. Abra-o, aguarde ficar pronto e tente novamente.
    goto falha
)

docker compose --env-file "%CONFIG%" ps --status running --services | findstr /x /c:"app" >nul
if errorlevel 1 (
    netstat -ano | findstr /R /C:":%APP_PORT% .*LISTENING" >nul
    if not errorlevel 1 (
        echo ERRO: a porta %APP_PORT% ja esta em uso.
        echo Altere APP_PORT em .env.docker para 3305, salve e execute este arquivo novamente.
        notepad "%CONFIG%"
        goto falha
    )
)

echo Iniciando o banco de dados...
docker compose --env-file "%CONFIG%" up -d db
if errorlevel 1 goto falha

echo Preparando as tabelas do banco...
docker compose --env-file "%CONFIG%" --profile tools run --rm db-init
if errorlevel 1 goto falha

echo Iniciando o Guardiao Escolar...
docker compose --env-file "%CONFIG%" up -d --build app
if errorlevel 1 goto falha

echo.
echo O sistema foi iniciado. Abrindo a tela de login...
start "" "http://localhost:%APP_PORT%/admin/login.html"
echo Se esta for a primeira utilizacao, execute criar-administrador.bat uma vez.
echo Para parar sem apagar os dados, execute parar-demonstracao.bat.
goto fim

:falha
echo.
echo A inicializacao nao foi concluida. Leia a mensagem acima e tente novamente.
pause
exit /b 1

:fim
echo.
pause
exit /b 0
