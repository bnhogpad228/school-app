// Service worker — «помощник» PWA. Он сохраняет файлы приложения на телефоне,
// поэтому после первого открытия приложение запускается даже без интернета.
const CACHE = "school-app-v37";   // при изменении файлов меняем номер версии (и ?v= в списке ниже)
const FILES = [
    "./", "./index.html", "./style.css?v=37", "./sync.js?v=37", "./script.js?v=37", "./manifest.json",
    "./Montserrat.woff", "./ComicRelief-Bold.woff", "./FiraSans-SemiBold.woff",
    "./icon-192.png", "./icon-512.png"
];

// Установка: кладём файлы в кэш (хранилище на телефоне)
self.addEventListener("install", function (event) {
    event.waitUntil(caches.open(CACHE).then(function (cache) { return cache.addAll(FILES); }));
    self.skipWaiting();
});

// Активация: удаляем кэш старых версий
self.addEventListener("activate", function (event) {
    event.waitUntil(caches.keys().then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k !== CACHE; })
                               .map(function (k) { return caches.delete(k); }));
    }));
    self.clients.claim();
});

// Запросы: сначала пробуем интернет (чтобы видеть свежую версию),
// а если сети нет — отдаём файл из кэша
self.addEventListener("fetch", function (event) {
    // Запросы к серверу (другой адрес) и отправку данных (POST) не трогаем — только файлы самого сайта
    if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) {
        return;
    }
    event.respondWith(
        // cache: "no-cache" — всегда спрашиваем сервер, нет ли новой версии (а не берём старую из кэша браузера).
        // Для открытия самой страницы (navigate) так нельзя — браузер и так проверяет её сам
        (event.request.mode === "navigate" ? fetch(event.request) : fetch(event.request, {cache: "no-cache"})).then(function (response) {
            let copy = response.clone();
            caches.open(CACHE).then(function (cache) { cache.put(event.request, copy); });
            return response;
        }).catch(function () {
            // Нет сети: берём файл из кэша; если версия в ?v= другая — подойдёт и тот же файл с другим номером
            return caches.match(event.request).then(function (found) {
                return found || caches.match(event.request, {ignoreSearch: true});
            });
        })
    );
});
