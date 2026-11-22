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

// Всё, что пришло с сервера (копия хранится на телефоне — видно и без интернета).
// У каждого ученика своя копия: личные сообщения сервер отдаёт только их участникам
let remote = {events: [], last: ""};
let remoteKey = null;

function myNick() {
    return typeof currentNick === "undefined" ? "" : currentNick;
}

// Вошёл другой ученик — берём его копию
function ensureRemote() {
    let key = "schoolAppRemote|" + myNick();
    if (key !== remoteKey) {
        remoteKey = key;
        remote = readJson(key, {events: [], last: ""});
    }
    return remote;
}
let outbox = readJson("schoolAppOutbox", []);   // что ещё не удалось отправить
let remoteOnline = false;
const SITE_VERSION = 34;         // меняем вместе с ?v= в index.html
const SERVER_NEED = 3;           // какая версия функции нужна этому сайту
let serverVersion = 0;
let lastReject = "";             // что сервер отклонил последним (видно в «Настройках»)
let claimed = "";                // для какого ника уже отправили «ник занят»
let polling = false;

// Отправить событие на сервер. mod = true — действие модератора или учителя (нужен их код)
function remoteSend(ev, mod) {
    if (!serverUrl()) {
        return;
    }
    ev.dev = DEVICE_ID;
    let code = "";
    if (mod) {
        code = isCurator() ? CURATOR_CODE : TEACHER_CODE;
    }
    outbox.push({ev: ev, mod: code});
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
                body: JSON.stringify({code: SCHOOL_CODE, mod: item.mod === true ? TEACHER_CODE : (item.mod || ""), ev: item.ev})
            });
            if (res.status >= 500) {
                throw new Error("server " + res.status);
            }
            if (res.status >= 400) {
                // 4xx — сервер не принял событие: повторять бессмысленно, но показываем причину в «Настройках»
                let text = "";
                try { text = (await res.json()).error || ""; } catch (e) {}
                lastReject = (item.ev.t || "") + ": " + (text || res.status);
            }
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
        let store = ensureRemote();
        let key = remoteKey;
        let url = serverUrl() + "?code=" + encodeURIComponent(SCHOOL_CODE) + "&nick=" + encodeURIComponent(myNick()) +
                  "&after=" + encodeURIComponent(store.last);
        let res = await fetch(url);
        if (!res.ok) {
            throw new Error("server " + res.status);
        }
        let data = await res.json();
        remoteOnline = true;
        serverVersion = data.v || 1;
        // Данные на сервере очистили (бакет создали заново) — самое раннее событие на сервере
        // уже не то, что у нас. Забываем старую копию и скачиваем всё заново при следующем опросе
        if (typeof data.first === "string" && key === remoteKey && store.events.length > 0 && data.first !== store.events[0].k) {
            store.events = [];
            store.last = "";
            writeJson(key, store);
            claimed = "";                      // ник нужно занять заново
            polling = false;
            location.reload();                 // перерисовать без старых кружков и сообщений
            return;
        }
        if (data.events && data.events.length > 0 && key === remoteKey) {   // пока ждали ответа, мог войти другой
            let firstLoad = store.last === "";         // первая загрузка на этом телефоне: вся история сразу
            store.events = store.events.concat(data.events);
            store.last = data.events[data.events.length - 1].k;
            writeJson(key, store);
            if (firstLoad && myNick() !== "") {
                markAllSeen();                         // старое — не «новое»: без красных кружков на всю историю
            }
            onRemoteChange();
        }
        // Ник ещё не занят на сервере (профиль создан до подключения сервера) — занимаем,
        // иначе другие ученики не смогут написать ему лично
        let me = myNick();
        if (me !== "" && key === remoteKey && remoteNickOwner(me) === "" && claimed !== me) {
            claimed = me;
            remoteSend({t: "nick", nick: me, grade: users[me].grade, role: users[me].role || "student"});
        }
    } catch (e) {
        remoteOnline = false;
    }
    polling = false;
    showSyncStatus();
}

// Пришло новое — переносим в приложение и перерисовываем открытый экран
function onRemoteChange() {
    if (myNick() === "") {
        return;
    }
    applyRemote();                         // кружки, инициативы, события, личка (в script.js)
    if (location.hash === "#chat" && !document.querySelector("#messages .edit-input")) {
        let nearBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 120;
        let y = window.scrollY;
        renderChat();
        window.scrollTo(0, nearBottom ? document.body.scrollHeight : y);
    }
    if (location.hash === "#reports" && canModerate()) {
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
    let text;
    if (!serverUrl()) {
        text = "Режим прототипа: данные хранятся только на этом телефоне.";
    } else if (remoteOnline && serverVersion < SERVER_NEED) {
        text = "⚠️ Функция на сервере устарела (версия " + serverVersion + ", нужна " + SERVER_NEED + ") — обновите её код в Yandex Cloud.";
    } else if (remoteOnline && outbox.length === 0) {
        text = "🟢 Сервер подключён: сообщения видят все ученики.";
    } else {
        text = "⚪ Нет связи с сервером. Не отправлено: " + outbox.length + " — уйдёт, когда появится интернет.";
    }
    if (lastReject) {
        text += " Сервер не принял: " + lastReject + ".";
    }
    box.textContent = text + " Сайт v" + SITE_VERSION + (serverVersion ? ", сервер v" + serverVersion : "") + ".";
}

// ---------- Что пришло от других телефонов ----------

function othersEvents(type) {
    return ensureRemote().events.filter(function (e) { return e.t === type && e.dev !== DEVICE_ID; });
}

// Сообщения других телефонов: общий номер → данные (с учётом правок и удалений)
function remoteMessageMap() {
    let map = {};
    for (let e of ensureRemote().events) {
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
    for (let e of ensureRemote().events) {
        if ((e.t === "nick" || e.t === "msg") && e.nick === nick && e.grade) {
            return e.grade;
        }
    }
    return "";
}

// Кто занял ник: номер телефона или "" (свободен)
function remoteNickOwner(nick) {
    for (let e of ensureRemote().events) {
        if (e.t === "nick" && e.nick.toLowerCase() === nick.toLowerCase()) {
            return e.dev;
        }
    }
    return "";
}

// Роль ученика с другого телефона — по его «ник занят»
function remoteRoleOf(nick) {
    for (let e of ensureRemote().events) {
        if (e.t === "nick" && e.nick === nick) {
            return e.role || "student";
        }
    }
    return "student";
}

// Учителя-кураторы класса (с других телефонов)
function remoteCurators(grade) {
    let list = [];
    for (let e of ensureRemote().events) {
        if (e.t === "nick" && e.role === "curator" && e.grade === grade && e.dev !== DEVICE_ID && !list.includes(e.nick)) {
            list.push(e.nick);
        }
    }
    return list;
}

// Скрытые и оставленные модераторами (с любого телефона)
function remoteModeration() {
    let result = {hidden: [], dismissed: []};
    for (let e of ensureRemote().events) {
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

// Ученик с другого телефона (а не придуманный и не с этого телефона)
function isRealRemote(nick) {
    let owner = remoteNickOwner(nick);
    return owner !== "" && owner !== DEVICE_ID;
}

// Кто сейчас в кружке / идёт / в команде (с других телефонов): ник → класс
function remoteMembers(target) {
    let members = {};
    for (let e of ensureRemote().events) {
        if (e.dev === DEVICE_ID || e.target !== target) { continue; }
        if (e.t === "join") { members[e.nick] = e.grade || ""; }
        if (e.t === "leave") { delete members[e.nick]; }
    }
    return members;
}

// Опрос: сразу после загрузки и потом раз в 4 секунды, пока приложение открыто
setTimeout(poll, 300);
setInterval(function () {
    if (document.visibilityState !== "hidden") {
        poll();
    }
}, 4000);
window.addEventListener("online", poll);
