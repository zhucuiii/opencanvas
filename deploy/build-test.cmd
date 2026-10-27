@echo off
rem Build entry for the 10087 dev instance.
rem This machine's PowerShell execution policy is Restricted, so a bare .ps1
rem would be blocked. -ExecutionPolicy Bypass relaxes it for this one command
rem only and leaves the system setting untouched.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-test.ps1" %*
exit /b %ERRORLEVEL%
