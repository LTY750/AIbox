@echo off
REM Command-line Gradle wrapper for machines with no system-wide JDK.
REM Plain gradlew.bat fails here with "JAVA_HOME is not set and no 'java'
REM command could be found in your PATH" because Java is only available
REM inside the Android Studio install. This resolves that JDK first, then
REM delegates every argument to the normal wrapper.
REM
REM Usage: gradlew-cli.bat assembleDebug
setlocal EnableDelayedExpansion

if not defined JAVA_HOME (
  for /f "tokens=2,*" %%a in ('reg query "HKLM\SOFTWARE\Android Studio" /v Path 2^>nul ^| findstr /i "REG_SZ"') do set "STUDIO_HOME=%%b"
  if defined STUDIO_HOME set "JAVA_HOME=!STUDIO_HOME!\jbr"
)

if not exist "%JAVA_HOME%\bin\java.exe" (
  echo(
  echo ERROR: no JDK found.
  echo Set JAVA_HOME to the 'jbr' folder inside your Android Studio install, e.g.
  echo   set "JAVA_HOME=D:\Android studio\jbr"
  echo(
  exit /b 1
)

echo Using JAVA_HOME=%JAVA_HOME%
call "%~dp0gradlew.bat" %*
