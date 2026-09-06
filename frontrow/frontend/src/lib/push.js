// Web push, and an honest account of when it cannot work.
//
// A PWA can only subscribe in a secure context, and on iOS only once the app
// has been added to the Home Screen. Rather than letting the button fail
// silently, the app asks first and says which of those two things is missing.

import { api } from './api.js';

export function pushSupport() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { supported: false, reason: 'unsupported' };
  }
  if (!window.isSecureContext) return { supported: false, reason: 'insecure' };
  // iOS only exposes the Push API to an installed home-screen app.
  const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const standalone = window.navigator.standalone === true
    || window.matchMedia('(display-mode: standalone)').matches;
  if (iOS && !standalone) return { supported: false, reason: 'needs-install' };
  return { supported: true };
}

const urlBase64ToUint8Array = (base64) => {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
};

export async function enablePush(publicKey) {
  const support = pushSupport();
  if (!support.supported) throw new Error(support.reason);

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('denied');

  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing || await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });

  await api.subscribe(subscription.toJSON());
  return subscription;
}

export async function disablePush() {
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  await api.unsubscribe(subscription.endpoint);
  await subscription.unsubscribe();
}
