@echo off
setlocal enabledelayedexpansion

REM FilePrompt Extension Installer for Windows
REM This script builds and installs the VS Code/Cursor extension locally

echo [INFO] Starting FilePrompt Extension installation...

REM Check prerequisites
echo [INFO] Checking prerequisites...

where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not installed. Please install Node.js first.
    echo [INFO] Download from: https://nodejs.org/
    pause
    exit /b 1
)

where npm >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] npm is not installed. Please install npm first.
    pause
    exit /b 1
)

echo [SUCCESS] Prerequisites check passed

REM Install vsce if not already installed
where vsce >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [INFO] Installing VS Code Extension CLI (vsce)...
    call npm install -g @vscode/vsce
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Failed to install vsce
        pause
        exit /b 1
    )
    echo [SUCCESS] vsce installed successfully
) else (
    echo [INFO] vsce is already installed
)

REM Install dependencies
echo [INFO] Installing project dependencies...
call npm install
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Failed to install dependencies
    pause
    exit /b 1
)
echo [SUCCESS] Dependencies installed successfully

REM Package the extension
echo [INFO] Packaging the extension...
call vsce package
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Failed to package extension
    pause
    exit /b 1
)
echo [SUCCESS] Extension packaged successfully

REM Find the generated .vsix file
for %%f in (*.vsix) do set VSIX_FILE=%%f

if not defined VSIX_FILE (
    echo [ERROR] No .vsix file found after packaging
    pause
    exit /b 1
)

echo [INFO] Found extension package: %VSIX_FILE%

REM Detect available editors
echo [INFO] Detecting available editors...
set INSTALL_COUNT=0

where code >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo [INFO] Installing extension in VS Code...
    call code --install-extension "%VSIX_FILE%"
    if %ERRORLEVEL% equ 0 (
        echo [SUCCESS] Successfully installed in VS Code
        set /a INSTALL_COUNT+=1
    ) else (
        echo [WARNING] Failed to install in VS Code
    )
)

where cursor >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo [INFO] Installing extension in Cursor...
    call cursor --install-extension "%VSIX_FILE%"
    if %ERRORLEVEL% equ 0 (
        echo [SUCCESS] Successfully installed in Cursor
        set /a INSTALL_COUNT+=1
    ) else (
        echo [WARNING] Failed to install in Cursor
    )
)

where code-insiders >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo [INFO] Installing extension in VS Code Insiders...
    call code-insiders --install-extension "%VSIX_FILE%"
    if %ERRORLEVEL% equ 0 (
        echo [SUCCESS] Successfully installed in VS Code Insiders
        set /a INSTALL_COUNT+=1
    ) else (
        echo [WARNING] Failed to install in VS Code Insiders
    )
)

REM Summary
echo.
if %INSTALL_COUNT% gtr 0 (
    echo [SUCCESS] Installation completed! Extension installed in %INSTALL_COUNT% editor(s).
    echo [INFO] To use the extension:
    echo [INFO]   1. Open your editor
    echo [INFO]   2. Right-click on files/folders in the explorer
    echo [INFO]   3. Select 'Copy file tree to clipboard'
    echo.
    echo [INFO] Extension file: %VSIX_FILE%
    echo [SUCCESS] All done! 🎉
) else (
    echo [ERROR] No supported editors found (VS Code, Cursor, or VS Code Insiders)
    echo [INFO] Please install one of the following:
    echo [INFO]   - VS Code: https://code.visualstudio.com/
    echo [INFO]   - Cursor: https://cursor.sh/
    pause
    exit /b 1
)

pause 