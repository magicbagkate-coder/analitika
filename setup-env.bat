@echo off
cd /d "%~dp0"
(
echo # Server
echo PORT=3000
echo NODE_ENV=development
echo.
echo # Sitniks CRM ^(base host only — paths already include /open-api/... in code^)
echo SITNIKS_API_URL=https://crm.sitniks.com
echo SITNIKS_API_KEY=uCE1oD0D2eePpLFznbFouigInUJqn8i5ThaI95mEezH
echo.
echo # Claude ^(Anthropic^) — впиши свой ключ вместо replace-me
echo ANTHROPIC_API_KEY=replace-me
echo ANTHROPIC_MODEL=claude-sonnet-5
echo.
echo # Telegram ^(пока не используется^)
echo # TELEGRAM_BOT_TOKEN=replace-me
echo # TELEGRAM_CHAT_ID=replace-me
) > .env
echo Готово: .env создан/обновлён в этой папке.
pause
