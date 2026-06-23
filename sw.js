// Service Worker — PTS Cost Breakdown
// แคชไฟล์หลักของแอป เพื่อให้เปิดได้แม้ออฟไลน์ และทำให้ติดตั้งเป็นแอปได้

const CACHE_NAME = 'pts-cost-cache-v5.12';
const APP_SHELL = [
  './',
  './index.html',
  './form.html',
  './employee.html',
  './employee-manifest.json',
  './manifest.json',
  './PTS.png',
];

// รับคำสั่งจากหน้าเว็บให้ข้ามการรอ แล้วใช้ SW เวอร์ชันใหม่ทันที
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ติดตั้ง — แคชไฟล์หลัก
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// เปิดใช้งาน — ลบแคชเวอร์ชันเก่า
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// fetch — network-first สำหรับ HTML (เพื่อให้ได้เวอร์ชันล่าสุดเมื่อออนไลน์)
// cache-first สำหรับไฟล์อื่นๆ (รูป/ฟอนต์/ฯลฯ)
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // ข้าม API call ไปยัง Google Apps Script — ให้ผ่าน network ตรงๆ เสมอ
  if (req.url.includes('script.google.com')) return;

  if (req.mode === 'navigate' || req.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      // cache: 'no-store' กัน browser ใช้ HTTP cache เก่าของหน้า HTML
      // ทำให้ network-first ได้ของใหม่จริงๆ ทุกครั้งที่มีเน็ต
      fetch(req, { cache: 'no-store' })
        .then((res) => {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          return res;
        })
        .catch(() => caches.match(req).then((res) => res || caches.match('./form.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
        return res;
      }).catch(() => cached);
    })
  );
});
