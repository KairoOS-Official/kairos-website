import { hasAnalyticsConsent } from './consent.js';

function getVisitorId(): string | null {
  if (!hasAnalyticsConsent()) return null;
  try {
    let vid = localStorage.getItem('kairo_vid');
    if (!vid) {
      vid = 'v_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now().toString(36);
      localStorage.setItem('kairo_vid', vid);
    }
    return vid;
  } catch {
    return null;
  }
}

function getSessionId(): string | null {
  if (!hasAnalyticsConsent()) return null;
  try {
    let sessionId = sessionStorage.getItem('kairo_session_id');
    if (!sessionId) {
      sessionId = 's_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now().toString(36);
      sessionStorage.setItem('kairo_session_id', sessionId);
    }
    return sessionId;
  } catch {
    return null;
  }
}

export function sendEvent(eventType: string, target: string, meta: Record<string, any> = {}): void {
  if (!hasAnalyticsConsent()) return;

  const vid = getVisitorId() || 'v_anon';
  const sid = getSessionId() || 's_anon';
  const compositeSession = vid + '.' + sid;

  const payload = JSON.stringify({
    event_type: eventType,
    target,
    page: window.location.pathname || '/',
    session_id: compositeSession,
    referrer: document.referrer ? document.referrer.split('?')[0] : '',
    meta: Object.assign({ visitor_id: vid }, meta)
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

// --- ACTIVE ENGAGEMENT TIMER ---
let activeSeconds = 0;
let isUserEngaged = true;
let idleTimeoutId: any = null;

function markUserEngaged(): void {
  isUserEngaged = true;
  if (idleTimeoutId) clearTimeout(idleTimeoutId);
  idleTimeoutId = setTimeout(() => {
    isUserEngaged = false;
  }, 45000);
}

let lastSentDuration = 0;

export function sendPageDuration(): void {
  if (!hasAnalyticsConsent()) return;
  if (activeSeconds <= 0 || activeSeconds <= lastSentDuration) return;

  lastSentDuration = activeSeconds;
  sendEvent('page_duration', window.location.pathname || '/', {
    duration_seconds: activeSeconds
  });
}

if (typeof window !== 'undefined') {
  ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'].forEach((evt) => {
    window.addEventListener(evt, markUserEngaged, { passive: true });
  });
  markUserEngaged();

  setInterval(() => {
    if (document.visibilityState === 'visible' && isUserEngaged) {
      activeSeconds++;
    }
  }, 1000);

  setInterval(() => {
    if (document.visibilityState === 'visible' && isUserEngaged) {
      sendPageDuration();
    }
  }, 15000);

  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      isUserEngaged = false;
      sendPageDuration();
    } else {
      markUserEngaged();
    }
  });
  window.addEventListener('pagehide', sendPageDuration);
  window.addEventListener('beforeunload', sendPageDuration);
}
