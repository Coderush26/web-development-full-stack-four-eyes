import { getApps, initializeApp } from 'firebase/app';
import { getAnalytics, isSupported } from 'firebase/analytics';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: 'AIzaSyCClbraKuBK282BZZSMP2h733IdqKOCgH0',
  authDomain: 'vesselsync-itu.firebaseapp.com',
  databaseURL: 'https://vesselsync-itu-default-rtdb.firebaseio.com',
  projectId: 'vesselsync-itu',
  storageBucket: 'vesselsync-itu.firebasestorage.app',
  messagingSenderId: '940891764557',
  appId: '1:940891764557:web:df53942d9e81460528a904',
  measurementId: 'G-ZS310XMQF2'
};

export function getFirebaseApp() {
  return getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
}

export function getFirebaseDb() {
  return getDatabase(getFirebaseApp());
}

export async function initFirebaseAnalytics() {
  if (typeof window === 'undefined') return;
  const app = getFirebaseApp();
  const supported = await isSupported();
  if (supported) {
    getAnalytics(app);
  }
}
