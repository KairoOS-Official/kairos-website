export interface ConsentState {
  analytics: boolean;
  essential: boolean;
  updatedAt: string;
}

const CONSENT_KEY = 'kairo_consent_v1';

export function getConsent(): ConsentState | null {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function hasGivenConsent(): boolean {
  return getConsent() !== null;
}

export function hasAnalyticsConsent(): boolean {
  const c = getConsent();
  return Boolean(c && c.analytics);
}

export function setConsent(analytics: boolean, transition = 'initial'): void {
  const consent: ConsentState = {
    analytics,
    essential: true,
    updatedAt: new Date().toISOString()
  };

  try {
    localStorage.setItem(CONSENT_KEY, JSON.stringify(consent));
  } catch {}

  // Envoi anonymisé au backend Fastify
  fetch('/api/consent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      choice: analytics ? 'consent_accepted' : 'consent_refused',
      page: window.location.pathname || '/'
    })
  }).catch(() => {});

  window.dispatchEvent(new CustomEvent('kairo_consent_updated', { detail: { consent, transition } }));
}
