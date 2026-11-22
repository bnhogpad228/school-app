// =====================================================================
// СИНХРОНИЗАЦИЯ С СЕРВЕРОМ (Yandex Cloud Functions)
// Сервер хранит «события»: сообщения, правки, жалобы, скрытия, объявления, занятые ники.
// Приложение раз в 4 секунды спрашивает: «что нового?» — и дорисовывает чужие сообщения.
// Нет интернета или сервера — приложение работает как раньше, только на этом телефоне,
// а то, что не отправилось, ждёт в очереди и уйдёт, когда связь появится.
// Этот файл подключается раньше script.js.
// =====================================================================

// Адрес функции в Yandex Cloud. Пусто — сервер выключен (режим прототипа)
const SERVER_URL_DEFAULT = "https://functions.yandexcloud.net/d4etcajfq6mamt671k0e";

function serverUrl() {
    try {
        return localStorage.getItem("schoolAppServer") || SERVER_URL_DEFAULT;   // для проверки можно подставить свой
    } catch (e) {
        return SERVER_URL_DEFAULT;
    }
}

// Номер этого телефона: по нему отличаем свои события от чужих
const DEVICE_ID = (function () {
    try {
        let id = localStorage.getItem("schoolAppDevice");
        if (!id) {
            id = Math.random().toString(36).slice(2, 10);
            localStorage.setItem("schoolAppDevice", id);
        }
        return id;
    } catch (e) {
        return "d" + Math.random().toString(36).slice(2, 10);
    }
})();

function readJson(key, fallback) {
    try {
        return JSON.parse(localStorage.getItem(key)) || fallback;
    } catch (e) {
        return fallback;
    }
}
function writeJson(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {}
}

// Всё, что пришло с сервера (копия хранится на телефоне — видно и без интернета)
let remote = readJson("schoolAppRemote", {events: [], last: ""});
let outbox = readJson("schoolAppOutbox", []);   // что ещё не удалось отправить
let remoteOnline = false;
let polling = false;

// Отправить событие на сервер. mod = true — действие модератора (нужен код модератора)
function remoteSend(ev, mod) {
    if (!serverUrl()) {
        return;
    }
    ev.dev = DEVICE_ID;
    outbox.push({ev: ev, mod: !!mod});
    writeJson("schoolAppOutbox", outbox);
    flushOutbox();
}

async function flushOutbox() {
    while (outbox.length > 0 && serverUrl()) {
        let item = outbox[0];
        try {
            let res = await fetch(serverUrl(), {
                method: "POST",
                headers: {"Content-Type": "text/plain"},     // простой запрос — браузер не шлёт лишний OPTIONS
                body: JSON.stringify({code: SCHOOL_CODE, mod: item.mod ? TEACHER_CODE : "", ev: item.ev})
            });
            if (res.status >= 500) {
                throw new Error("server " + res.status);
            }
            // 4xx — событие неправильное, повторять бессмысленно: выбрасываем
        } catch (e) {
            remoteOnline = false;
            showSyncStatus();
            return;                        // нет связи — попробуем при следующем опросе
        }
        outbox.shift();
        writeJson("schoolAppOutbox", outbox);
    }
}

// Спросить у сервера новые события
async function poll() {
    if (!serverUrl() || polling) {
        return;
    }
    polling = true;
    try {
        await flushOutbox();
        let url = serverUrl() + "?code=" + encodeURIComponent(SCHOOL_CODE) + "&after=" + encodeURIComponent(remote.last);
        let res = await fetch(url);
        if (!res.ok) {
            throw new Error("server " + res.status);
        }
        let data = await res.json();
        remoteOnline = true;
        if (data.events && data.events.length > 0) {
            remote.events = remote.events.concat(data.events);
            remote.last = data.events[data.events.length - 1].k;
            writeJson("schoolAppRemote", remote);
            onRemoteChange();
        }
    } catch (e) {
        remoteOnline = false;
    }
    polling = false;
    showSyncStatus();
}

// Пришло новое — перерисовываем открытый экран
function onRemoteChange() {
    if (typeof currentNick === "undefined" || currentNick === "") {
        return;
    }
    if (location.hash === "#chat" && !document.querySelector("#messages .edit-input")) {
        let nearBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 120;
        let y = window.scrollY;
        renderChat();
        window.scrollTo(0, nearBottom ? document.body.scrollHeight : y);
    }
    if (location.hash === "#reports" && isModerator()) {
        renderReports();
    }
    if (location.hash === "#events") {
        renderAnnouncements();
    }
}

function showSyncStatus() {
    let box = document.getElementById("sync-status");
    if (!box) {
        return;
    }
    if (!serverUrl()) {
        box.textContent = "Режим прототипа: данные хранятся только на этом телефоне.";
    } else if (remoteOnline && outbox.length === 0) {
        box.textContent = "🟢 Сервер подключён: сообщения видят все ученики.";
    } else {
        box.textContent = "⚪ Нет связи с сервером. Не отправлено: " + outbox.length + " — уйдёт, когда появится интернет.";
    }
}

// ---------- Что пришло от других телефонов ----------

function othersEvents(type) {
    return remote.events.filter(function (e) { return e.t === type && e.dev !== DEVICE_ID; });
}

// Сообщения других телефонов: общий номер → данные (с учётом правок и удалений)
function remoteMessageMap() {
    let map = {};
    for (let e of remote.events) {
        if (e.dev === DEVICE_ID) {
            continue;                      // свои сообщения и так есть на телефоне
        }
        if (e.t === "msg") {
            map["u-" + e.nick + "-" + e.i] = {nick: e.nick, grade: e.grade, club: e.club, text: e.text, time: e.time || e.at};
        } else if (e.t === "edit" && map[e.gid]) {
            map[e.gid].text = e.text;
            map[e.gid].edited = true;
        } else if (e.t === "del" && map[e.gid]) {
            map[e.gid].text = "";
            map[e.gid].deleted = true;
        }
    }
    return map;
}

function remoteMessage(gid) {
    return remoteMessageMap()[gid] || null;
}

// Сообщения других телефонов в этом чате
function remoteMessagesIn(club, grade) {
    let map = remoteMessageMap();
    let list = [];
    for (let gid in map) {
        let m = map[gid];
        if (m.club !== club || (club === "class" && m.grade !== grade)) {
            continue;
        }
        list.push(Object.assign({gid: gid}, m));
    }
    return list;
}

// Класс ученика с другого телефона — по его сообщениям или занятому нику
function remoteGradeOf(nick) {
    for (let e of remote.events) {
        if ((e.t === "nick" || e.t === "msg") && e.nick === nick && e.grade) {
            return e.grade;
        }
    }
    return "";
}

// Кто занял ник: номер телефона или "" (свободен)
function remoteNickOwner(nick) {
    for (let e of remote.events) {
        if (e.t === "nick" && e.nick.toLowerCase() === nick.toLowerCase()) {
            return e.dev;
        }
    }
    return "";
}

// Скрытые и оставленные модераторами (с любого телефона)
function remoteModeration() {
    let result = {hidden: [], dismissed: []};
    for (let e of remote.events) {
        if (e.t === "hide") { result.hidden.push(e.gid); }
        if (e.t === "keep") { result.dismissed.push(e.gid); }
    }
    return result;
}

// Объявления с других телефонов (без удалённых)
function remoteAnnouncements() {
    let gone = {};
    for (let e of othersEvents("anndel")) {
        gone[e.from + "|" + e.time] = true;
    }
    return othersEvents("ann").filter(function (a) { return !gone[a.from + "|" + a.time]; })
                              .map(function (a) { return {grade: a.grade, from: a.from, text: a.text, time: a.time}; });
}

// Опрос: сразу после загрузки и потом раз в 4 секунды, пока приложение открыто
setTimeout(poll, 300);
setInterval(function () {
    if (document.visibilityState !== "hidden") {
        poll();
    }
}, 4000);
window.addEventListener("online", poll);
