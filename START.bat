@echo off
echo ========================================
echo   Betting Assessment v3.0
echo   With Timer, Skip, and Reports
echo ========================================
echo.

echo Installing backend dependencies...
cd backend
call npm install
if errorlevel 1 (
    echo Failed to install backend dependencies!
    pause
    exit /b 1
)

echo.
echo Starting backend server...
start "Backend Server" cmd /k "npm start"

echo.
echo Installing frontend dependencies...
cd ..\frontend
call npm install
if errorlevel 1 (
    echo Failed to install frontend dependencies!
    pause
    exit /b 1
)

echo.
echo Starting frontend server...
start "Frontend Server" cmd /k "npm start"

echo.
echo ========================================
echo   Both servers starting...
echo   Frontend: http://localhost:3002
echo   Backend:  http://localhost:3001
echo ========================================
echo.
echo Browser will open automatically.
pause
