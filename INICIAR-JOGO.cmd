@echo off
setlocal
cd /d "%~dp0"
title Arte da Guerra - Servidor local
where node >nul 2>nul
if errorlevel 1 (
  echo Instale o Node.js 22 ou superior em https://nodejs.org/
  echo Depois, abra este arquivo novamente.
  pause
  exit /b 1
)
node -e "if(Number(process.versions.node.split('.')[0])<22)process.exit(1)"
if errorlevel 1 (
  echo Atualize o Node.js para a versao 22 ou superior.
  pause
  exit /b 1
)
echo.
echo ARTE DA GUERRA 1.0.0
echo Depois que o servidor iniciar, abra http://localhost:3000
echo Mantenha esta janela aberta enquanto joga. Ctrl+C encerra o servidor.
echo.
node server.js
echo.
echo O servidor foi encerrado. Se a porta 3000 estiver ocupada,
echo encerre a outra instancia do jogo antes de tentar novamente.
pause
