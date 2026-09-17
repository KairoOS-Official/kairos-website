export interface BanStatus {
  is_banned: boolean;
  ip: string;
  ban_type?: 'temp' | 'permanent';
  expires_at?: string;
  reason?: string;
  block_all?: boolean;
  block_vote?: boolean;
  block_proposal?: boolean;
  block_suggestion?: boolean;
}

export async function fetchBanStatus(): Promise<BanStatus> {
  try {
    const res = await fetch('/api/user/ban-status');
    if (!res.ok) throw new Error('Erreur réseau ban-status');
    return await res.json();
  } catch {
    return { is_banned: false, ip: '127.0.0.1' };
  }
}

export async function submitBanAppeal(email: string, message: string): Promise<{ status: string; message: string }> {
  const res = await fetch('/api/ban/appeal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, message })
  });
  return await res.json();
}
