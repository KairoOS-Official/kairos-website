#!/usr/bin/env python3
"""
KaïroOS - Point d'entrée principal du serveur HTTP et de la CLI d'administration.
Architecture modulaire : src/app, src/routes, src/services, src/data.
"""
import sys
from src.app.server import main

if __name__ == '__main__':
    main(sys.argv[1:])
