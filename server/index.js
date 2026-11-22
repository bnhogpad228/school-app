// Сервер «Школьного двора» — одна функция в Yandex Cloud Functions (Node.js 18+).
//
// Как устроено:
//   • Каждое действие (сообщение, жалоба, скрытие, объявление) — это «событие».
//   • Каждое событие — отдельный маленький файл в приватном бакете Object Storage:
//       ev/<время в мс>-<случайные буквы>.json
//     Отдельный файл на событие — значит, два человека, написавшие одновременно,
//     не перезапишут друг друга.
//   • Приложение раз в несколько секунд спрашивает: «что нового после события X?»
//     Имена файлов начинаются со времени, поэтому их можно сравнивать как строки.
//   • Доступ к бакету — через IAM-токен сервисного аккаунта функции (context.token),
//     ключи и пароли в коде не хранятся.
//
// Переменные окружения функции:
//   BUCKET       — имя приватного бакета для данных (например, shkolny-dvor-data)
//   SCHOOL_CODE  — код школы (без него читать и писать нельзя)
//   MOD_CODE     — код модератора (без него нельзя скрывать сообщения и делать объявления)
//   CURATOR_CODE — код учителя-куратора (те же права на объявления и жалобы)

const VERSION = 3;                 // версия функции — приложение показывает её в «Настройках»
const BUCKET = process.env.BUCKET;
const SCHOOL_CODE = process.env.SCHOOL_CODE || "1234";
const MOD_CODE = process.env.MOD_CODE || "5678";
const CURATOR_CODE = process.env.CURATOR_CODE || "9012";   // код учителя-куратора
const S3 = "https://storage.yandexcloud.net/" + BUCKET;

// Кэш в памяти: пока функция «тёплая», уже прочитанные события не читаем из бакета повторно
const cache = new Map();     // имя файла → событие
let keys = [];               // все имена файлов по порядку
let listedAt = 0;            // когда последний раз смотрели список файлов

// Какие события бывают и какие поля у них разрешены (всё остальное отбрасываем)
const TYPES = {
    nick:   ["nick", "grade", "role"],                       // ник занят этим телефоном
    msg:    ["nick", "grade", "club", "i", "text", "time"],  // сообщение в чате кружка или класса
    edit:   ["gid", "text"],                                 // изменить своё сообщение
    del:    ["gid"],                                         // удалить своё сообщение у всех
    rep:    ["gid", "grade"],                                // жалоба (grade — класс того, кто пожаловался)
    hide:   ["gid"],                                         // модератор скрыл у всех
    keep:   ["gid"],                                         // модератор оставил (жалоба отклонена)
    ann:    ["grade", "from", "text", "time"],               // объявление для класса
    anndel: ["from", "time"],                                // объявление удалено
    club:   ["id", "name", "icon", "owner"],                 // ученик создал кружок
    join:   ["target", "nick", "grade"],                     // вступил в кружок / «Я в деле» / «Пойду»
    leave:  ["target", "nick"],                              // вышел из кружка
    idea:   ["id", "title", "text", "nick"],                 // новая инициатива
    event:  ["id", "title", "when", "place", "nick"],        // новое событие в афише
    // Личные сообщения — их сервер отдаёт только двоим участникам
    dmreq:  ["from", "to"],                                  // просит разрешения писать
    dmok:   ["from", "to"],                                  // разрешил
    dm:     ["from", "to", "i", "text", "time"],             // сообщение
    dmedit: ["from", "to", "i", "text"],
    dmdel:  ["from", "to", "i"],
    dmblock:   ["from", "to"],
    dmunblock: ["from", "to"]
};
const ID = /^[a-z0-9]{1,60}$/;
const MOD_ONLY = ["hide", "keep", "ann", "anndel"];

function reply(status, data) {
    return {
        statusCode: status,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Access-Control-Allow-Origin": "*",            // сайт и функция — на разных адресах
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
        },
        body: JSON.stringify(data)
    };
}

// Проверить и почистить событие от приложения. null — событие не подходит
function clean(ev) {
    if (!ev || typeof ev !== "object" || !TYPES[ev.t]) {
        return null;
    }
    let out = {t: ev.t, dev: String(ev.dev || "").slice(0, 40)};
    for (let field of TYPES[ev.t]) {
        let value = ev[field];
        if (value === undefined || value === null) {
            continue;
        }
        if (typeof value === "number") {
            out[field] = value;
        } else {
            out[field] = String(value).slice(0, field === "text" ? 500 : 60);
        }
    }
    if (ev.t === "msg" && (!out.text || !ID.test(out.club || ""))) {
        return null;
    }
    if ((ev.t === "club" || ev.t === "idea" || ev.t === "event") && !ID.test(out.id || "")) {
        return null;
    }
    if ((ev.t === "join" || ev.t === "leave") && (!ID.test(out.target || "") || !out.nick)) {
        return null;
    }
    if (ev.t.startsWith("dm") && (!out.from || !out.to)) {
        return null;
    }
    return out;
}

// Список всех файлов событий (по 1000 за запрос — так устроен S3)
async function listKeys(token) {
    let all = [];
    let next = "";
    do {
        let url = S3 + "?list-type=2&prefix=ev/" + (next ? "&continuation-token=" + encodeURIComponent(next) : "");
        let res = await fetch(url, {headers: {Authorization: "Bearer " + token}});
        let xml = await res.text();
        if (!res.ok) {
            throw new Error("list " + res.status + " " + xml.slice(0, 200));
        }
        for (let m of xml.matchAll(/<Key>([^<]+)<\/Key>/g)) {
            all.push(m[1]);
        }
        let t = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/);
        next = /<IsTruncated>true<\/IsTruncated>/.test(xml) && t ? t[1] : "";
    } while (next);
    return all.sort();
}

async function readEvent(key, token) {
    let res = await fetch(S3 + "/" + key, {headers: {Authorization: "Bearer " + token}});
    if (!res.ok) {
        throw new Error("get " + res.status);
    }
    return JSON.parse(await res.text());
}

// Новые события после файла after. Личные сообщения — только тем двоим, кому они принадлежат
async function eventsAfter(after, token, nick) {
    if (Date.now() - listedAt > 2500) {          // список обновляем не чаще раза в 2,5 секунды (экономим запросы)
        keys = await listKeys(token);
        listedAt = Date.now();
    }
    let fresh = keys.filter(function (k) { return k > after; });
    let missing = fresh.filter(function (k) { return !cache.has(k); });
    for (let start = 0; start < missing.length; start += 20) {     // читаем по 20 файлов параллельно
        let part = missing.slice(start, start + 20);
        let loaded = await Promise.all(part.map(function (k) { return readEvent(k, token).catch(function () { return null; }); }));
        part.forEach(function (k, n) { if (loaded[n]) { cache.set(k, loaded[n]); } });
    }
    return fresh.filter(function (k) {
        let ev = cache.get(k);
        return ev && (!ev.t.startsWith("dm") || ev.from === nick || ev.to === nick);
    }).map(function (k) { return Object.assign({k: k}, cache.get(k)); });
}

async function saveEvent(ev, token) {
    let key = "ev/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + ".json";
    ev.at = Date.now();                          // время ставит сервер, а не телефон
    let res = await fetch(S3 + "/" + key, {
        method: "PUT",
        headers: {Authorization: "Bearer " + token, "Content-Type": "application/json"},
        body: JSON.stringify(ev)
    });
    if (!res.ok) {
        throw new Error("put " + res.status + " " + (await res.text()).slice(0, 200));
    }
    cache.set(key, ev);
    keys.push(key);
    keys.sort();
    return key;
}

module.exports.handler = async function (event, context) {
    if (event.httpMethod === "OPTIONS") {
        return reply(200, {});
    }
    if (!BUCKET || !context.token) {
        return reply(500, {error: "Не настроены BUCKET или сервисный аккаунт функции"});
    }
    let token = context.token.access_token;
    let query = event.queryStringParameters || {};
    try {
        if (event.httpMethod === "GET") {
            if (query.code !== SCHOOL_CODE) {
                return reply(403, {error: "Неверный код школы"});
            }
            let events = await eventsAfter(String(query.after || ""), token, String(query.nick || ""));
            return reply(200, {events: events, v: VERSION});
        }
        if (event.httpMethod === "POST") {
            let raw = event.isBase64Encoded ? Buffer.from(event.body || "", "base64").toString("utf8") : (event.body || "");
            if (raw.length > 4000) {
                return reply(413, {error: "Слишком большой запрос"});
            }
            let body = JSON.parse(raw);
            if (body.code !== SCHOOL_CODE) {
                return reply(403, {error: "Неверный код школы"});
            }
            let ev = clean(body.ev);
            if (!ev) {
                return reply(400, {error: "Неверное событие"});
            }
            if (MOD_ONLY.includes(ev.t) && body.mod !== MOD_CODE && body.mod !== CURATOR_CODE) {
                return reply(403, {error: "Только для модератора или учителя"});
            }
            let key = await saveEvent(ev, token);
            return reply(200, {k: key});
        }
        return reply(405, {error: "Метод не поддерживается"});
    } catch (e) {
        console.log("Ошибка:", e.message);
        return reply(500, {error: "Ошибка сервера"});
    }
};
