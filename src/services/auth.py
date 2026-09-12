import json
import hashlib
import secrets
from src.data.db import get_db

DEFAULT_ADMIN_USERNAME = 'admin'
DEFAULT_ADMIN_PASSWORD = 'KairoOS-Admin-2026!'

def hash_password(password: str, salt: str = "kairo_salt_2026") -> str:
    return hashlib.sha256((password + salt).encode('utf-8')).hexdigest()

def verify_token(headers, required_permission=None):
    auth = headers.get('Authorization', '')
    token = auth.replace('Bearer ', '').strip()
    if not token:
        return False
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, username, role, permissions FROM admin_users WHERE token = ?", (token,))
    user = cursor.fetchone()
    conn.close()
    if not user:
        return False

    if required_permission:
        try:
            perms = json.loads(user['permissions']) if user['permissions'] else ["all"]
        except Exception:
            perms = ["all"]
        if "all" not in perms and required_permission not in perms:
            return False

    return True

def get_token_user(headers):
    auth = headers.get('Authorization', '')
    token = auth.replace('Bearer ', '').strip()
    if not token:
        return None
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, username, role, permissions FROM admin_users WHERE token = ?", (token,))
    user = cursor.fetchone()
    conn.close()
    if not user:
        return None
    d = dict(user)
    try:
        d['permissions'] = json.loads(d['permissions']) if d['permissions'] else ["all"]
    except Exception:
        d['permissions'] = ["all"]
    return d

def normalize_permissions(raw_permissions):
    try:
        perms = json.loads(raw_permissions or '["all"]')
        if isinstance(perms, list) and perms:
            return perms
        return ['all']
    except Exception:
        return ['all']

def list_admin_users():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, username, role, permissions, last_login, last_ip, created_at FROM admin_users ORDER BY id ASC")
    rows = [dict(row) for row in cursor.fetchall()]
    conn.close()
    if not rows:
        print("Aucun utilisateur administrateur trouvé.")
        return

    print("Liste des comptes admin :")
    for row in rows:
        try:
            perms = json.loads(row['permissions']) if row['permissions'] else ['all']
        except Exception:
            perms = ['all']
        p_str = ','.join(perms)
        print(f"- id={row['id']} username={row['username']} role={row['role']} permissions={p_str} last_login={row['last_login']} last_ip={row['last_ip']} created_at={row['created_at']}")

def create_admin_user(username, password=None, role='superadmin', permissions='["all"]'):
    if not username or not username.strip():
        print("Erreur : un identifiant utilisateur admin est requis.")
        return

    username = username.strip()
    if password is None:
        password = secrets.token_urlsafe(12)

    password = password.strip()
    if len(password) < 6:
        print("Erreur : le mot de passe doit contenir au moins 6 caractères.")
        return

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM admin_users WHERE username = ?", (username,))
    existing = cursor.fetchone()
    if existing:
        conn.close()
        print(f"Erreur : l'utilisateur '{username}' existe déjà.")
        return

    perms = normalize_permissions(permissions)
    p_str = ','.join(perms)
    cursor.execute("INSERT INTO admin_users (username, password_hash, role, permissions) VALUES (?, ?, ?, ?)",
                   (username, hash_password(password), role, json.dumps(perms)))
    conn.commit()
    conn.close()
    print(f"Compte admin créé : username={username} role={role} permissions={p_str} password={password}")

def delete_admin_user(username):
    username = (username or '').strip()
    if not username:
        print("Erreur : un identifiant admin est requis pour supprimer un compte.")
        return

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM admin_users WHERE username = ?", (username,))
    user = cursor.fetchone()
    if not user:
        conn.close()
        print(f"Erreur : utilisateur '{username}' introuvable.")
        return

    cursor.execute("DELETE FROM admin_users WHERE username = ?", (username,))
    conn.commit()
    conn.close()
    print(f"Compte admin supprimé : {username}")

def reset_admin_password(username, password=None, generate_password=False):
    username = (username or '').strip()
    if not username:
        print("Erreur : un identifiant admin est requis pour la réinitialisation.")
        return

    if password and generate_password:
        print("Erreur : choisissez soit --password, soit --generate-password, pas les deux.")
        return

    if generate_password:
        password = secrets.token_urlsafe(12)

    if not password:
        print("Erreur : un mot de passe manuel ou la génération aléatoire est requis.")
        return

    password = password.strip()
    if len(password) < 6:
        print("Erreur : le mot de passe doit contenir au moins 6 caractères.")
        return

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM admin_users WHERE username = ?", (username,))
    user = cursor.fetchone()
    if not user:
        conn.close()
        print(f"Erreur : utilisateur admin '{username}' introuvable.")
        return

    cursor.execute("UPDATE admin_users SET password_hash = ? WHERE username = ?", (hash_password(password), username))
    conn.commit()
    conn.close()
    print(f"Mot de passe réinitialisé pour l'utilisateur '{username}'. Nouveau mot de passe : {password}")
