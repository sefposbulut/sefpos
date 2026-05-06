@echo off
echo ŞefPOS .env Dosyası Oluşturucu
echo ================================
echo.
echo Supabase API Key'inizi aşağıya yapıştırın:
echo.
set /p ANON_KEY="Anon Key: "
echo.
echo VITE_SUPABASE_URL=https://orlydeyxshsdusxukhuu.supabase.co > .env
echo VITE_SUPABASE_ANON_KEY=%ANON_KEY% >> .env
echo.
echo .env dosyası oluşturuldu!
echo.
pause
