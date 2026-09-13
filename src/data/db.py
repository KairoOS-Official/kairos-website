import os
import sqlite3

# BASE_DIR corresponds to root kairos-website
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR = os.path.join(BASE_DIR, 'data')
DB_PATH = os.path.join(DATA_DIR, 'kairoos.db')
WEB_DIR = os.path.join(BASE_DIR, 'web')
UPLOAD_DIR = os.path.join(WEB_DIR, 'assets', 'img', 'uploads')
LOGS_DIR = os.path.join(DATA_DIR, 'logs')

os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(LOGS_DIR, exist_ok=True)

def get_db():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn
