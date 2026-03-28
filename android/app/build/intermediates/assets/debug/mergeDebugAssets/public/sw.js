const CACHE_NAME = 'trinetra-cache-v4';
const urlsToCache = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/manifest.json',
  '/libs/tf.min.js',
  '/libs/coco-ssd.min.js',
  '/libs/face-api.min.js',
  '/models/coco-ssd-lite/model.json',
  '/models/coco-ssd-lite/group1-shard1of5.bin',
  '/models/coco-ssd-lite/group1-shard2of5.bin',
  '/models/coco-ssd-lite/group1-shard3of5.bin',
  '/models/coco-ssd-lite/group1-shard4of5.bin',
  '/models/coco-ssd-lite/group1-shard5of5.bin',
  '/models/tiny_face_detector_model-weights_manifest.json',
  '/models/tiny_face_detector_model-shard1.bin',
  '/models/face_landmark_68_model-weights_manifest.json',
  '/models/face_landmark_68_model-shard1.bin',
  '/models/face_recognition_model-weights_manifest.json',
  '/models/face_recognition_model-shard1.bin',
  '/models/face_recognition_model-shard2.bin'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Opened cache');
                return cache.addAll(urlsToCache);
            })
    );
});

self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // Cache hit - return response
                if (response) {
                    return response;
                }
                return fetch(event.request);
            })
    );
});
