import os
import base64
import secrets
from datetime import datetime, timezone
from src.data.db import UPLOAD_DIR

def save_uploaded_image(file_data, file_name='image.png'):
    safe_name = f"{int(datetime.now(timezone.utc).timestamp())}_{secrets.token_hex(4)}_{os.path.basename(file_name)}"
    dest_path = os.path.join(UPLOAD_DIR, safe_name)

    if ',' in file_data:
        file_data = file_data.split(',', 1)[1]
    binary_content = base64.b64decode(file_data)
    with open(dest_path, 'wb') as f:
        f.write(binary_content)

    return f"assets/img/uploads/{safe_name}"
