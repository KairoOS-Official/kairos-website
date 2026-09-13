import os
import sys
from datetime import datetime
from src.data.db import LOGS_DIR

class DualLogger:
    def __init__(self, original_stream, log_type='out'):
        self.original_stream = original_stream
        self.log_type = log_type

    def write(self, message):
        if self.original_stream:
            try:
                self.original_stream.write(message)
                self.original_stream.flush()
            except Exception:
                pass

        if not message:
            return

        try:
            today_str = datetime.now().strftime('%Y-%m-%d')
            log_file = os.path.join(LOGS_DIR, f'{today_str}.log')
            with open(log_file, 'a', encoding='utf-8') as f:
                f.write(message)
        except Exception:
            pass

    def flush(self):
        if self.original_stream:
            try:
                self.original_stream.flush()
            except Exception:
                pass

def setup_daily_logging():
    os.makedirs(LOGS_DIR, exist_ok=True)
    if not isinstance(sys.stdout, DualLogger):
        sys.stdout = DualLogger(sys.stdout, 'out')
    if not isinstance(sys.stderr, DualLogger):
        sys.stderr = DualLogger(sys.stderr, 'err')
