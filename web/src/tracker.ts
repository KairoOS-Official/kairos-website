import { hasAnalyticsConsent } from './consent.js';

function getSessionId(): string | null {
  if (!hasAnalyticsConsent()) return null;
  let sessionId = sessionStorage.getItem('kairo_session_id');
  if (!sessionId) {
    sessionId = 's_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now().toString(36);
    sessionStorage.setItem('kairo_session_id', sessionId);
  }
  return sessionId;
}

export function sendEvent(eventType: string, target: string, meta: Record<string, any> = {}): void {
  if (!hasAnalyticsConsent()) return;

  const sessionId = getSessionId() || 'anon';
  const payload = JSON.stringify({
    event_type: eventType,
    target,
    page: window.location.pathname || '/',
    session_id: sessionId,
    referrer: document.referrer ? document.referrer.split('?')[0] : '',
    meta
  });

  if (navigator.sendBeacon) {
    const blob = new Blob([payload], { type: 'application/json' });
    navigator.sendBeacon('/api/track', blob);
  } else {
    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true
    }).catch(() => {});
  }
}

export function trackPageView(): void {
  sendEvent('page_view', 'page_load');
}

export function trackDownloadClick(): void {
  sendEvent('click', 'download_button');
}
