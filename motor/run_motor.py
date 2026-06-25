"""Ponto de entrada do motor para empacotamento (PyInstaller).

Importa o app diretamente (em vez de string "app.main:app") para o PyInstaller
rastrear as dependências corretamente. A porta pode vir de DARK_HUB_PORT.
"""
import os

import uvicorn

from app.main import app

if __name__ == "__main__":
    port = int(os.environ.get("DARK_HUB_PORT", "8077"))
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")
