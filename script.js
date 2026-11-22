// =====================================================================
// ПОЛЬЗОВАТЕЛИ И ПАМЯТЬ НА ТЕЛЕФОНЕ (localStorage)
// На одном телефоне может быть несколько профилей. Все они лежат в users —
// это как словарь в Python: { "Енот_7Б": {password: "...", grade: "7Б", state: {...}}, ... }.
// Данные хранятся только в браузере этого телефона, на сервер ничего не уходит.
// =====================================================================
const SCHOOL_CODE = "1234";   // код школы — один для всех учеников (в настоящей версии проверял бы сервер)
const TEACHER_CODE = "5678";  // код модератора — выдаёт школа ученикам из совета, чтобы любой не стал модератором //ировался учителем
const ROLE_NAMES = {student: "Ученик", teacher: "Модератор"};

let users = {};          // все профили на этом телефоне
let currentNick = "";    // кто сейчас вошёл (пусто — никто)

// Данные одного пользователя
function emptyState() {
    return {
        myMessages: [],    // свои сообщения
        myIdeas: [],       // свои инициативы
        myEvents: [],      // свои события
        myClubs: [],       // кружки, которые создал сам
        joinedClubs: [],   // кружки, в которые вступил
        hidden: [],        // id скрытых сообщений
        reported: [],      // id сообщений, на которые пожаловался
        joined: [],        // id инициатив, где нажал «Я в деле»
        warnings: 0,       // сколько раз нарушил правила
        blocked: false,    // приостановлена ли отправка
        settings: {dark: true, big: false},    // настройки: по умолчанию тёмная тема
        dm: null           // личные чаты (null — ещё не создавались): { "Ник": {status: "...", messages: [...]} }
    };
}
let state = emptyState();

// Загрузить всех пользователей с телефона
function loadUsers() {
    try {
        let saved = localStorage.getItem("schoolAppUsers");
        if (saved) {
            users = JSON.parse(saved);    // из JSON-строки в объект — как json.load в Python
        }
    } catch (e) {}
}

// Роль пользователя: student — ученик, teacher — модератор (ученик из совета старшеклассников).
// Взрослых в приложении нет — так сказал автор кейса: оно только для школьников
// У старых профилей роли нет — это ученики
function roleOf(nick) {
    return (users[nick] && users[nick].role) || "student";
}
function myRole() {
    return roleOf(currentNick);
}

// Сохранить данные текущего пользователя
function saveState() {
    if (currentNick === "") {
        return;
    }
    users[currentNick].state = state;
    try {
        localStorage.setItem("schoolAppUsers", JSON.stringify(users));   // как json.dump
    } catch (e) {
        // в режиме инкогнито хранилище может быть недоступно — приложение просто не запомнит
    }
}

// Кто вошёл, помним только пока открыта вкладка (sessionStorage).
// Закрыл вкладку — следующему человеку придётся входить самому.
function startSession(nick) {
    try {
        sessionStorage.setItem("schoolAppCurrent", nick);
    } catch (e) {}
    currentNick = nick;
    state = users[nick].state;
    restoreScreen();         // показываем сообщения, жалобы и т.д. этого пользователя
    location.hash = "rules"; // переходим на экран правил
}

// =====================================================================
// РЕГИСТРАЦИЯ: код школы, ник, класс, пароль и повтор пароля
// =====================================================================
function register() {
    let role = document.querySelector('input[name="role"]:checked').value;
    // .value — то, что ввели в поле; .trim() убирает пробелы по краям (как strip() в Python)
    let code = document.getElementById("reg-code").value.trim();
    let nick = document.getElementById("reg-nick").value.trim();
    let grade = document.getElementById("reg-grade").value;
    let letter = document.getElementById("reg-letter").value;
    let password = document.getElementById("reg-password").value;
    let password2 = document.getElementById("reg-password2").value;
    let error = document.getElementById("register-error");

    if (code !== SCHOOL_CODE) {            // код школы — один для всех
        error.textContent = "Неверный код школы";
        return;
    }
    // Модератор вводит ещё и код модератора — его выдают только ученикам из совета
    if (role === "teacher" && document.getElementById("reg-teacher-code").value.trim() !== TEACHER_CODE) {
        error.textContent = "Неверный код модератора";
        return;
    }
    if (nick === "") {
        error.textContent = "Придумай ник";
        return;
    }
    if (users[nick] || isDemoNick(nick)) {
        error.textContent = "Такой ник уже занят — придумай другой";
        return;
    }
    if (isRude(nick)) {                    // фильтр грубых слов — и для ника тоже
        error.textContent = "Такой ник нарушает правила общения — придумай другой";
        return;
    }
    let user = {password: password, role: role, grade: "", state: emptyState()};
    if (role === "student") {
        if (grade === "" || letter === "") {
            error.textContent = "Выбери номер и букву класса";
            return;
        }
        user.grade = grade + letter;
    }
    if (role === "teacher") {
        if ((grade === "") !== (letter === "")) {
            error.textContent = "Выберите и номер, и букву класса — или оставьте оба пустыми";
            return;
        }
        user.grade = grade + letter;       // класс, за который отвечает модератор (может быть пусто)
        user.clubs = [];
        for (let box of document.querySelectorAll('input[name="teach-club"]:checked')) {
            user.clubs.push(box.value);
        }
        if (user.clubs.length === 0 && user.grade === "") {
            error.textContent = "Отметьте кружки, которые модерируете, или свой класс";
            return;
        }
    }
    if (password.length < 4) {
        error.textContent = "Пароль — не меньше 4 символов";
        return;
    }
    if (password !== password2) {          // !== значит «строго не равно»
        error.textContent = "Пароли не совпадают";
        return;
    }
    users[nick] = user;
    currentNick = nick;
    saveState();
    startSession(nick);
}

// Ники придуманных учеников заняты — иначе чужое сообщение выглядело бы как твоё
function isDemoNick(nick) {
    for (let id in CLUBS) {
        for (let m of CLUBS[id].messages) {
            if (m[0].toLowerCase() === nick.toLowerCase()) {
                return true;
            }
        }
    }
    return nick.toLowerCase() === "скрипка_7в";
}

// Переключили «Ученик / Модератор» — меняем поля формы
function changeRole() {
    let role = document.querySelector('input[name="role"]:checked').value;
    for (let el of document.querySelectorAll("#register [data-reg]")) {
        el.hidden = !el.dataset.reg.split(" ").includes(role);
    }
    let texts = {
        student: ["Ник (не фамилия!)", "Например, Енот_7Б", "Класс",
                  "Пишешь в чатах кружков и своего класса, предлагаешь инициативы и события."],
        teacher: ["Ник (не фамилия!)", "Например, Совет_10А",
                  "Класс, за которым следите (если есть)",
                  "Модератор — ученик из совета старшеклассников. Разбирает жалобы в своих кружках и в чате своего класса, скрывает сообщения, нарушающие правила, делает объявления для класса. Это отдельный аккаунт: писать в чатах с него нельзя."]
    }[role];
    document.getElementById("reg-nick-label").textContent = texts[0];
    document.getElementById("reg-nick").placeholder = texts[1];
    document.getElementById("reg-grade-label").textContent = texts[2];
    document.getElementById("role-about").textContent = texts[3];
}

// =====================================================================
// ВХОД: код школы, ник и пароль
// =====================================================================
function login() {
    let code = document.getElementById("code").value.trim();
    let nick = document.getElementById("nick").value.trim();
    let password = document.getElementById("password").value;
    let error = document.getElementById("login-error");

    if (!users[nick] || users[nick].password !== password) {
        // Не говорим, что именно неверно — так сложнее подбирать чужие ники
        error.textContent = "Неверный ник или пароль";
        return;
    }
    // Вход у всех по коду школы (код модератора проверили один раз — при регистрации)
    if (code !== SCHOOL_CODE) {
        error.textContent = "Неверный код школы";
        return;
    }
    startSession(nick);
}

// Выйти: профиль остаётся на телефоне, но войти можно только снова по паролю
function logout() {
    try {
        sessionStorage.removeItem("schoolAppCurrent");
    } catch (e) {}
    // Перезагружаем страницу без # — экран снова чистый, показывается вход
    location.replace(location.pathname);
}

// =====================================================================
// ПОДТВЕРЖДЕНИЕ: всё, что нельзя отменить, сначала спрашиваем в окне посередине
// =====================================================================
let confirmAction = null;            // что сделать, если человек нажмёт «Да»

function askConfirm(title, text, yesText, action) {
    document.getElementById("confirm-title").textContent = title;
    document.getElementById("confirm-text").textContent = text;
    document.getElementById("confirm-yes").textContent = yesText;
    confirmAction = action;
    document.getElementById("confirm-dialog").classList.add("open");
}

function closeConfirm() {
    confirmAction = null;
    document.getElementById("confirm-dialog").classList.remove("open");
}

document.getElementById("confirm-yes").onclick = function () {
    let action = confirmAction;
    closeConfirm();
    if (action) {
        action();
    }
};

// Удалить свой профиль и все свои данные с этого телефона
function deleteProfile() {
    askConfirm("Удалить профиль?", "Твои сообщения, кружки и настройки пропадут с этого телефона. Вернуть их будет нельзя.", "Удалить профиль", function () {
        delete users[currentNick];         // как del users[nick] в Python
        try {
            localStorage.setItem("schoolAppUsers", JSON.stringify(users));
        } catch (e) {}
        logout();
    });
}

// =====================================================================
// СООБЩЕНИЯ: скрыть, пожаловаться, отправить
// =====================================================================
function hideMessage(button) {
    // closest(".message") — ищем вверх ближайший блок сообщения, в котором лежит кнопка
    let message = button.closest(".message");
    askConfirm("Скрыть сообщение?", "Оно пропадёт только у тебя, другие его увидят. Вернуть его будет нельзя.", "Скрыть", function () {
        if (!state.hidden.includes(message.id)) {
            state.hidden.push(message.id); // push — как append в Python
            saveState();
        }
        showHidden(message);
    });
}

function showHidden(message) {
    message.innerHTML = '<p class="muted">Сообщение скрыто</p>';
}

function report(button) {
    let message = button.closest(".message");
    askConfirm("Пожаловаться на сообщение?", "Жалоба уйдёт модератору из совета старшеклассников. Отменить её будет нельзя.", "Пожаловаться", function () {
        if (!state.reported.includes(message.id)) {
            state.reported.push(message.id);
            saveState();
        }
        showReported(button);
    });
}

function showReported(button) {
    button.textContent = "Жалоба отправлена модератору";
    button.disabled = true;                // повторно нажать нельзя
}

// =====================================================================
// КРУЖКИ: у каждого свой чат с придуманными сообщениями
// Это как словарь в Python: ключ — id кружка, значение — название, значок и сообщения
// =====================================================================
const CLUBS = {
    // Сообщения придуманы под нашу школу: новая, все друг друга не знают, профиль — химия, биология, экология
    music: {name: "Музыка", icon: "🎵", messages: [
        ["Бит_8Б", "Собираем группу к первому школьному концерту — кто играет?"],
        ["Струна_10А", "Я на гитаре. Нужен барабанщик и вокал."],
        ["Скрипка_7В", "Могу петь! Репетиции после уроков в актовом зале?"]
    ]},
    basketball: {name: "Баскетбол", icon: "🏀", messages: [
        ["Форвард_9А", "Собираем команду на школьный турнир 3×3 — нужны 2 запасных!"],
        ["Центровой_8В", "Я в деле. Тренируемся в новом спортзале после 7 урока?"],
        ["Пас_7Б", "Можно мне? Я только учусь, но очень хочу."],
        ["Данк_10Б", "Кто не пришёл на тренировку — тот слабак, ха-ха 😂"]
    ]},
    robots: {name: "Роботы", icon: "🤖", messages: [
        ["Байт_10В", "Кто хочет собрать робота для городских соревнований?"],
        ["Схема_8А", "Я умею паять, программировать — пока не очень."],
        ["Пиксельный_9Б", "Программирую на Python, могу научить."]
    ]},
    books: {name: "Книги", icon: "📚", messages: [
        ["Закладка_9В", "В новой библиотеке есть полка «возьми — оставь». Кто что принёс?"],
        ["Глава_11А", "Оставил научпоп про химию — для нашего профиля самое то."],
        ["Обложка_8Б", "Давайте раз в месяц обсуждать одну книгу?"]
    ]},
    photo: {name: "Фото", icon: "📷", messages: [
        ["Кадр_7А", "Школа новая — давайте снимем её для первого школьного альбома!"],
        ["Объектив_9Б", "Я сниму теплицу и бассейн, там красиво."],
        ["Вспышка_8В", "А я — портреты классов, чтобы все быстрее запомнили друг друга."]
    ]},
    eco: {name: "Экология", icon: "🌱", messages: [
        ["Росток_9Б", "В школьной теплице свободны две грядки — кто будет выращивать?"],
        ["Лист_7В", "Давайте помидоры! Я принесу семена."],
        ["Корень_10А", "Можно поставить опыт: с подкормкой и без."]
    ]}
};
// Ещё придуманные участники кружков (кроме тех, кто пишет в чате)
const CLUB_EXTRA = {
    music: ["Бас_9А", "Ритм_7А"], basketball: ["Защитник_9В"], robots: ["Шестерёнка_7Б", "Чип_11Б"],
    books: ["Страница_10Б"], photo: ["Ракурс_10В"], eco: ["Семечко_8А", "Ветер_11А"],
    class: ["Сокол", "Кит"]
};
// Пример жалобы для показа модератору: на это сообщение уже пожаловались двое
const DEMO_REPORTS = {"basketball-3": 2};

// Класс для чата класса и объявлений: у ученика — свой, у модератора — класс, за которым он следит; ый руководитель
function classGrade() {
    return users[currentNick].grade || "";
}

// Какие кружки видны: ученику — все, модератору — только те, что он модерирует
function allowedClubs() {
    let u = users[currentNick];
    if (myRole() === "teacher") {
        return (u.clubs || []).slice();                 // slice() — копия; в чат своего класса модератор не заходит
    }
    return null;                           // null — ученику видны все кружки
}

// Можно ли открыть чат: ученик — любой (писать — после «Вступить»),
// модератор — только чаты своих кружков (читает и модерирует)
function canOpenChat(id) {
    if (myRole() === "teacher") {
        return (users[currentNick].clubs || []).includes(id);
    }
    return myRole() === "student";
}

// Где модератор разбирает жалобы: свои кружки и чат своего класса (сам чат класса он не читает)
function reportClubs() {
    let u = users[currentNick];
    let list = (u.clubs || []).slice();
    if (u.grade) {
        list.push("class");
    }
    return list;
}

// =====================================================================
// ОБЪЯВЛЕНИЯ КЛАССА: классный руководитель пишет всему классу,
// видят все ученики этого класса. Хранятся отдельно — они общие
// =====================================================================
function loadAnnouncements() {
    try {
        return JSON.parse(localStorage.getItem("schoolAppAnnouncements")) || [];
    } catch (e) {
        return [];
    }
}

function saveAnnouncements(list) {
    try {
        localStorage.setItem("schoolAppAnnouncements", JSON.stringify(list));
    } catch (e) {}
}

function addAnnouncement() {
    let text = document.getElementById("ann-text").value.trim();
    let warn = function (t) { document.getElementById("ann-warning").textContent = t; };
    if (text === "") {
        warn("Напишите текст объявления");
        return;
    }
    if (stopRudeOrBlocked(text, warn)) {
        return;
    }
    let list = loadAnnouncements();
    list.push({grade: classGrade(), from: currentNick, text: text, time: Date.now()});
    saveAnnouncements(list);
    document.getElementById("ann-text").value = "";
    document.querySelector("#announcements-box .new-form").open = false;
    renderAnnouncements();
}

function deleteAnnouncement(time) {
    askConfirm("Удалить объявление?", "Ученики больше его не увидят.", "Удалить", function () {
        removeAnnouncement(time);
    });
}

function removeAnnouncement(time) {
    let list = loadAnnouncements().filter(function (a) { return !(a.time === time && a.from === currentNick); });
    saveAnnouncements(list);
    renderAnnouncements();
}

// Объявления своего класса, новые сверху
function classAnnouncements() {
    let grade = classGrade();
    return loadAnnouncements().filter(function (a) { return a.grade === grade; })
                              .sort(function (a, b) { return b.time - a.time; });
}

function renderAnnouncements() {
    let grade = classGrade();
    document.getElementById("announcements-box").hidden = grade === "";   // модератор без класса — без объявлений
    document.getElementById("ann-grade").textContent = grade;
    let box = document.getElementById("announcements");
    box.innerHTML = "";
    let list = classAnnouncements();
    if (list.length === 0) {
        box.innerHTML = '<p class="hint">Объявлений пока нет.</p>';
    }
    for (let a of list) {
        let card = document.createElement("div");
        card.className = "card announcement";
        card.innerHTML = '<p class="muted"></p><p class="ann-text"></p>';
        card.querySelector(".muted").textContent = a.from + " · " + new Date(a.time).toLocaleDateString("ru-RU");
        card.querySelector(".ann-text").textContent = a.text;           // textContent — безопасно
        if (a.from === currentNick) {
            card.append(makeButton("Удалить", "btn small second", function () { deleteAnnouncement(a.time); }));
        }
        box.append(card);
    }
}

// Чат своего класса: создаётся при входе, по классу из профиля (например, «Класс 7Б»)
function setupClassChat() {
    let grade = classGrade();
    CLUBS["class"] = {name: "Класс " + grade, icon: "🏫", messages: [
        ["Лиса_" + grade, "Мы же все новенькие — давайте знакомиться! Я люблю химию и футбол."],
        ["Звезда_" + grade, "Кто знает, где кабинет биологии? Школа огромная 😅"],
        ["Пингвин_" + grade, "В субботу гуляем у школы, кто с нами?"]
    ]};
    document.getElementById("class-label").textContent = "Класс " + grade;
}

let currentClub = "class";    // какой чат открыт сейчас (после входа — чат своего класса)

// Нажали на кружок: запоминаем его и рисуем его чат
function openClub(clubId) {
    currentClub = clubId;
    document.getElementById("members-list").hidden = true;
    renderChat();
    showChatWarning(state.blocked ? "Отправка сообщений приостановлена. Модератор рассмотрит ситуацию." : "");
}

// Нарисовать чат текущего кружка заново
function renderChat() {
    let club = CLUBS[currentClub];
    document.getElementById("chat-title").textContent = club.icon + " Чат: " + club.name;
    document.getElementById("messages").innerHTML = "";        // очищаем старые сообщения

    // В чате класса сверху — последнее объявление классного руководителя
    if (currentClub === "class" && classAnnouncements().length > 0) {
        let a = classAnnouncements()[0];
        let pinned = document.createElement("div");
        pinned.className = "pinned";
        pinned.textContent = "📢 " + a.from + ": " + a.text;
        document.getElementById("messages").append(pinned);
    }

    // Придуманные сообщения кружка. id вида robots-0, music-1...
    for (let i = 0; i < club.messages.length; i++) {
        let nick = club.messages[i][0];
        let text = club.messages[i][1];
        addMessageToChat(currentClub + "-" + i, nick, text);
    }

    // Сообщения учеников на этом телефоне (в настоящей версии они приходили бы с сервера).
    // Своё сообщение — id вида my0, my1; чужое — u-Ник-0. Сортируем по времени отправки
    let all = [];
    for (let nick in users) {
        if (roleOf(nick) !== "student") {
            continue;
        }
        if (currentClub === "class" && users[nick].grade !== classGrade()) {
            continue;                      // в чате класса — только ученики этого класса
        }
        if (currentClub.startsWith("myclub") && nick !== CLUBS[currentClub].owner) {
            continue;                      // свои кружки пока видит только создатель
        }
        let list = users[nick].state.myMessages || [];
        for (let i = 0; i < list.length; i++) {
            let my = list[i];
            if (typeof my === "string") {  // старый формат (до кружков) — считаем, что это «Роботы»
                my = {club: "robots", text: my};
                list[i] = my;
            }
            if (my.club !== currentClub) {
                continue;
            }
            if (nick === currentNick && my.deletedForMe) {
                continue;                  // удалённые «у себя» не показываем вовсе
            }
            all.push({nick: nick, i: i, my: my});
        }
    }
    all.sort(function (a, b) { return (a.my.time || 0) - (b.my.time || 0); });
    for (let item of all) {
        let id = item.nick === currentNick ? "my" + item.i : "u-" + item.nick + "-" + item.i;
        let message = addMessageToChat(id, item.nick, item.my.deleted ? "" : item.my.text);
        message.dataset.gid = "u-" + item.nick + "-" + item.i;   // общий номер — для модерации
        showMyMessageState(message, item.my);
    }

    // Новый кружок без сообщений — подсказываем написать первым
    if (document.querySelectorAll("#messages .message").length === 0) {
        let hint = document.createElement("p");
        hint.className = "empty-hint";
        hint.textContent = "Здесь пока пусто. Напиши первое сообщение — позови людей в кружок!";
        document.getElementById("messages").append(hint);
    }

    // Скрытые модератором (у всех), скрытые мной и пожалованные — отмечаем снова
    let moderation = loadModeration();
    for (let message of document.querySelectorAll("#messages .message")) {
        if (moderation.hidden.includes(message.dataset.gid)) {
            showTeacherHidden(message);
        } else if (myRole() === "student" && state.hidden.includes(message.id)) {
            showHidden(message);
        } else if (myRole() === "student" && state.reported.includes(message.id) && !message.classList.contains("mine")) {
            showReported(message.querySelectorAll(".actions button")[1]);   // вторая кнопка — «Пожаловаться»
        }
    }
    updateClubBar();
}

// =====================================================================
// УЧАСТНИКИ КРУЖКА: кто в кружке, вступить и выйти
// =====================================================================
function isMember(id) {
    if (id === "class" || (CLUBS[id] && CLUBS[id].owner === currentNick)) {
        return true;                       // в чате своего класса и в своём кружке — всегда
    }
    return (state.joinedClubs || []).includes(id);
}

// Список участников: модераторы кружка, создатель, ученики с этого телефона и придуманные участники
function clubMembers(id) {
    let club = CLUBS[id];
    let list = [];
    let seen = {};
    let add = function (nick, note) {
        if (!seen[nick]) {
            seen[nick] = true;
            list.push({nick: nick, note: note});
        }
    };
    for (let t in users) {
        if (roleOf(t) !== "teacher") { continue; }
        if (id === "class" && users[t].grade && users[t].grade === classGrade()) { add(t, "модератор класса"); }
        if ((users[t].clubs || []).includes(id)) { add(t, "модератор"); }
    }
    if (club.owner) {
        add(club.owner, "создатель");
    }
    for (let n in users) {
        if (roleOf(n) !== "student") { continue; }
        let inClub = id === "class" ? users[n].grade === classGrade() : (users[n].state.joinedClubs || []).includes(id);
        if (inClub) { add(n, users[n].grade); }
    }
    for (let m of club.messages) { add(m[0], ""); }
    for (let n of CLUB_EXTRA[id] || []) { add(id === "class" ? n + "_" + classGrade() : n, ""); }
    return list;
}

// Полоска над чатом: «Участники», «Вступить / Выйти» и можно ли писать
function updateClubBar() {
    let members = clubMembers(currentClub);
    document.getElementById("members-btn").textContent = "👥 Участники: " + members.length;
    let box = document.getElementById("members-list");
    box.innerHTML = "";
    for (let m of members) {
        let row = document.createElement("div");
        row.className = "member";
        row.textContent = m.nick;          // textContent — безопасно
        if (m.note) {
            let note = document.createElement("span");
            note.className = "member-note";
            note.textContent = " · " + m.note;
            row.append(note);
        }
        box.append(row);
    }
    let joinButton = document.getElementById("join-btn");
    let send = document.querySelector("#chat .send");
    let readonly = document.getElementById("chat-readonly");
    if (myRole() === "student") {
        let member = isMember(currentClub);
        joinButton.hidden = currentClub === "class" || CLUBS[currentClub].owner === currentNick;
        joinButton.textContent = member ? "Выйти из кружка" : "Вступить в кружок";
        send.hidden = !member;
        readonly.hidden = member;
        readonly.textContent = "Чтобы писать в этом кружке, вступи в него.";
    } else {
        joinButton.hidden = true;
        send.hidden = true;
        readonly.hidden = false;
        readonly.textContent = "Вы видите чат как модератор и можете скрыть сообщение, нарушающее правила. С аккаунта модератора писать в чатах нельзя.";
    }
}

function toggleMembers() {
    let box = document.getElementById("members-list");
    box.hidden = !box.hidden;
}

function toggleJoin() {
    if (!state.joinedClubs) {
        state.joinedClubs = [];
    }
    let i = state.joinedClubs.indexOf(currentClub);   // indexOf — как list.index, но -1 если нет
    if (i === -1) {
        state.joinedClubs.push(currentClub);
    } else {
        state.joinedClubs.splice(i, 1);    // splice(i, 1) — удалить один элемент, как del list[i]
    }
    saveState();
    updateClubBar();
}

// =====================================================================
// МОДЕРАЦИЯ УЧИТЕЛЕМ: скрыть сообщение у всех, разобрать жалобы
// Решения модератора хранятся отдельно от профилей — они общие для всех
// =====================================================================
function loadModeration() {
    try {
        let saved = JSON.parse(localStorage.getItem("schoolAppModeration"));
        if (saved) {
            return saved;
        }
    } catch (e) {}
    return {hidden: [], dismissed: []};
}

function saveModeration(moderation) {
    try {
        localStorage.setItem("schoolAppModeration", JSON.stringify(moderation));
    } catch (e) {}
}

function showTeacherHidden(message) {
    message.innerHTML = '<p class="muted">🚫 Скрыто модератором: нарушение правил</p>';
}

function teacherHide(button) {
    let message = button.closest(".message");
    askConfirm("Скрыть сообщение у всех?", "Его не увидит никто, включая автора. Вернуть его будет нельзя.", "Скрыть у всех", function () {
        hideForAll(message);
    });
}

function hideForAll(message) {
    let moderation = loadModeration();
    if (!moderation.hidden.includes(message.dataset.gid)) {
        moderation.hidden.push(message.dataset.gid);
        saveModeration(moderation);
    }
    showTeacherHidden(message);
}

// Найти сообщение по общему номеру: robots-0 — придуманное, u-Ник-3 — сообщение ученика
function messageInfo(gid) {
    let last = gid.lastIndexOf("-");
    let index = Number(gid.slice(last + 1));
    if (gid.startsWith("u-")) {
        let nick = gid.slice(2, last);
        let my = users[nick] && users[nick].state.myMessages[index];
        if (!my || my.deleted || typeof my === "string") {
            return null;
        }
        return {club: my.club, nick: nick, text: my.text, grade: users[nick].grade};
    }
    let club = gid.slice(0, last);
    if (!CLUBS[club] || !CLUBS[club].messages[index]) {
        return null;
    }
    return {club: club, nick: CLUBS[club].messages[index][0], text: CLUBS[club].messages[index][1]};
}

// Экран «Жалобы»: на какие сообщения в кружках модератора жаловались ученики
function renderReports() {
    let box = document.getElementById("reports-list");
    box.innerHTML = "";
    let moderation = loadModeration();
    let counts = {};
    for (let id in DEMO_REPORTS) {
        counts[id] = DEMO_REPORTS[id];
    }
    for (let nick in users) {
        if (roleOf(nick) !== "student") { continue; }
        for (let id of users[nick].state.reported || []) {
            if (id.startsWith("dm-")) { continue; }                       // личные сообщения модератор не видит
            if (id.startsWith("class-") && users[nick].grade !== users[currentNick].grade) { continue; }
            counts[id] = (counts[id] || 0) + 1;
        }
    }
    let allowed = reportClubs();
    let shown = 0;
    for (let gid in counts) {
        if (moderation.hidden.includes(gid) || moderation.dismissed.includes(gid)) { continue; }
        let info = messageInfo(gid);
        if (!info || !allowed.includes(info.club)) { continue; }
        if (info.club === "class" && info.grade && info.grade !== users[currentNick].grade) { continue; }
        let card = document.createElement("div");
        card.className = "card report";
        card.innerHTML = '<p class="muted"></p><p><b></b></p><p class="report-text"></p><div class="report-actions"></div>';
        card.querySelector(".muted").textContent = CLUBS[info.club].icon + " " + CLUBS[info.club].name + " · жалоб: " + counts[gid];
        card.querySelector("b").textContent = info.nick;
        card.querySelector(".report-text").textContent = info.text;
        let hideButton = makeButton("Скрыть у всех", "btn small", function () { resolveReport(gid, true); });
        let keepButton = makeButton("Оставить", "btn small second", function () { resolveReport(gid, false); });
        card.querySelector(".report-actions").append(hideButton, keepButton);
        box.append(card);
        shown += 1;
    }
    if (shown === 0) {
        box.innerHTML = '<p class="hint">Новых жалоб нет.</p>';
    }
}

function resolveReport(gid, hide) {
    if (hide) {
        askConfirm("Скрыть сообщение у всех?", "Его не увидит никто, включая автора. Вернуть его будет нельзя.", "Скрыть у всех", function () { closeReport(gid, true); });
    } else {
        askConfirm("Оставить сообщение?", "Жалоба будет закрыта, сообщение останется в чате.", "Оставить", function () { closeReport(gid, false); });
    }
}

function closeReport(gid, hide) {
    let moderation = loadModeration();
    if (hide) {
        moderation.hidden.push(gid);
    } else {
        moderation.dismissed.push(gid);
    }
    saveModeration(moderation);
    document.getElementById("reports-done").textContent = hide ? "Сообщение скрыто у всех." : "Жалоба отклонена, сообщение оставлено.";
    renderReports();
}

// Нарисовать сообщение в чате (используется и при отправке, и при загрузке)
// container — куда добавить (чат кружка или личный чат)
// canWritePrivately — показывать ли кнопку «Написать лично»
function addMessageToChat(id, nick, text, container = "messages", canWritePrivately = true) {
    let message = document.createElement("div");
    message.className = "message";
    message.id = id;
    message.dataset.nick = nick;           // запоминаем автора — нужно для «Написать лично»
    let privateButton = "";
    if (canWritePrivately && !id.startsWith("my")) {
        privateButton = '<button onclick="requestPrivate(this)">Написать лично</button>';
    }
    // Своё ли сообщение — смотрим по номеру, а не по нику (у придуманного ученика может быть такой же ник)
    let mine = id.startsWith("my") || (id.startsWith("dm-") && nick === currentNick);
    if (mine) {
        // Своё сообщение: жаловаться и скрывать незачем — можно изменить или удалить
        message.innerHTML = '<b></b><p></p><div class="actions">' + MY_ACTIONS + '</div>';
        message.classList.add("mine");     // своё сообщение — справа, своим цветом
    } else if (myRole() === "teacher") {
        // Модератор может скрыть сообщение у всех (модерация)
        message.innerHTML = '<b></b><p></p><div class="actions"><button onclick="teacherHide(this)">Скрыть у всех</button></div>';
    } else {
        message.innerHTML = '<b></b><p></p>' +
            '<div class="actions"><button onclick="hideMessage(this)">Скрыть</button>' +
            '<button onclick="report(this)">Пожаловаться</button>' + privateButton + '</div>';
    }
    message.dataset.gid = id;

    // Ник и текст вставляем через textContent — так чужой код в сообщении не выполнится
    message.querySelector("b").textContent = nick;
    if (users[nick] && users[nick].grade) {
        let grade = document.createElement("span");
        grade.className = "grade";
        grade.textContent = " · " + users[nick].grade;    // например «Ёжик · 7Б»
        message.querySelector("b").after(grade);
    }
    message.querySelector("p").textContent = text;

    // Добавляем сообщение в конец списка сообщений
    document.getElementById(container).append(message);
    return message;
}

function sendMessage() {
    let input = document.getElementById("new-message");
    let text = input.value.trim();
    if (text === "") {
        return;                            // пустое не отправляем
    }
    if (stopRudeOrBlocked(text, showChatWarning)) {
        return;                            // грубое сообщение в чат не попадает
    }
    showChatWarning("");                   // убираем старое предупреждение
    let hint = document.querySelector("#messages .empty-hint");
    if (hint) {
        hint.remove();                     // первое сообщение в пустом кружке — подсказка больше не нужна
    }

    state.myMessages.push({club: currentClub, text: text, time: Date.now()});   // запоминаем, в какой кружок отправили
    saveState();
    // id своего сообщения: my0, my1, my2... — номер в списке myMessages
    addMessageToChat("my" + (state.myMessages.length - 1), currentNick, text);
    input.value = "";                      // очищаем поле
}

// =====================================================================
// СВОИ СООБЩЕНИЯ: изменить и удалить (у всех или у себя)
// =====================================================================
const MY_ACTIONS = '<button onclick="editMessage(this)">Изменить</button>' +
                   '<button onclick="askDelete(this)">Удалить</button>';

// Найти данные своего сообщения по id блока.
// my3 → state.myMessages[3];  dm-Ник-2 → state.dm["Ник"].messages[2]
function myMessageData(id) {
    if (id.startsWith("my")) {
        return state.myMessages[Number(id.slice(2))];        // slice(2) — всё после «my»
    }
    let last = id.lastIndexOf("-");                           // номер — после последнего дефиса
    let nick = id.slice(3, last);                             // ник — между «dm-» и номером
    return state.dm[nick].messages[Number(id.slice(last + 1))];
}

// Показать, что сообщение удалено у всех или изменено
function showMyMessageState(message, data) {
    if (data.deleted) {
        message.querySelector("p").textContent = "🚫 Сообщение удалено";
        message.querySelector("p").className = "muted";
        message.querySelector(".actions").remove();          // удалённое больше не изменить
    } else if (data.edited) {
        let mark = document.createElement("span");
        mark.className = "edited";
        mark.textContent = " (изменено)";
        message.querySelector("p").append(mark);
    }
}

// Куда выводить предупреждение: в чат кружка или в личный чат
function warningFor(message) {
    let id = message.closest("#dm-messages") ? "dm-warning" : "chat-warning";
    return function (text) { document.getElementById(id).textContent = text; };
}

// Нажали «Удалить» — посередине экрана открывается окно с выбором
let messageToDelete = null;          // какое сообщение собираемся удалить

function askDelete(button) {
    messageToDelete = button.closest(".message");
    document.getElementById("delete-dialog").classList.add("open");
}

// Закрыть окно (кнопка «Отмена», нажатие мимо окна или клавиша Esc)
function closeDeleteDialog() {
    messageToDelete = null;
    document.getElementById("delete-dialog").classList.remove("open");
}

// forAll = true — удалить у всех, false — только у себя
function deleteMessage(forAll) {
    let message = messageToDelete;
    closeDeleteDialog();
    if (!message) {
        return;
    }
    let data = myMessageData(message.id);
    if (forAll) {
        data.deleted = true;               // все увидят «Сообщение удалено»
        data.text = "";                    // сам текст стираем
        saveState();
        showMyMessageState(message, data);
    } else {
        data.deletedForMe = true;          // пропадает только с моего экрана
        saveState();
        message.remove();
    }
}

document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
        closeDeleteDialog();
        closeConfirm();
    }
});

// Нажали «Изменить» — текст сообщения превращается в поле ввода
function editMessage(button) {
    let message = button.closest(".message");
    let data = myMessageData(message.id);
    let p = message.querySelector("p");
    p.innerHTML = '<input type="text" class="edit-input">';
    p.querySelector("input").value = data.text;                // через value — безопасно
    p.querySelector("input").focus();
    button.closest(".actions").innerHTML =
        '<button onclick="saveEdit(this)">Сохранить</button>' +
        '<button onclick="cancelEdit(this)">Отмена</button>';
}

function saveEdit(button) {
    let message = button.closest(".message");
    let data = myMessageData(message.id);
    let text = message.querySelector(".edit-input").value.trim();
    if (text === "") {
        return;                            // пустым сообщение сделать нельзя — для этого есть «Удалить»
    }
    if (stopRudeOrBlocked(text, warningFor(message))) {
        return;                            // правка тоже проходит фильтр грубых слов
    }
    if (text !== data.text) {
        data.text = text;
        data.edited = true;
        saveState();
    }
    finishEdit(message, data);
}

function cancelEdit(button) {
    let message = button.closest(".message");
    finishEdit(message, myMessageData(message.id));
}

// Вернуть сообщение в обычный вид после правки
function finishEdit(message, data) {
    message.querySelector("p").textContent = data.text;
    message.querySelector(".actions").innerHTML = MY_ACTIONS;
    showMyMessageState(message, data);
}

// =====================================================================
// ФИЛЬТР ГРУБЫХ СЛОВ
// В прототипе — мягкие слова для показа. В настоящей версии список хранился бы на сервере.
// =====================================================================
const RUDE_WORDS = ["дурак", "дура", "тупой", "тупая", "идиот", "лох", "урод", "заткнись"];

function isRude(text) {
    // Маленькие буквы и ё → е, чтобы «ДУРАК» и «дурак» ловились одинаково
    let clean = text.toLowerCase().replaceAll("ё", "е");
    // Делим текст на слова: всё, что не буква, — разделитель (как split в Python)
    let words = clean.split(/[^а-яa-z]+/);
    for (let w of words) {
        for (let rude of RUDE_WORDS) {
            // Слово должно НАЧИНАТЬСЯ с грубого: «дураки» ловим,
            // а «плохо» (внутри «лох») и «процедура» (внутри «дура») — нет
            if (w.startsWith(rude)) {
                return true;
            }
        }
    }
    return false;
}

// Общая проверка для чата кружка и личного чата.
// Возвращает true, если отправлять нельзя. showWarning — функция, которая показывает текст.
function stopRudeOrBlocked(text, showWarning) {
    if (state.blocked) {
        showWarning("Отправка сообщений приостановлена. Модератор рассмотрит ситуацию.");
        return true;
    }
    if (isRude(text)) {
        state.warnings += 1;
        if (state.warnings >= 3) {
            state.blocked = true;
            showWarning("Третье нарушение правил: отправка сообщений приостановлена.");
        } else {
            showWarning("Не отправлено: текст нарушает правила общения. Предупреждение " + state.warnings + " из 3.");
        }
        saveState();
        return true;
    }
    showWarning("");                       // убираем старое предупреждение
    return false;
}

function showChatWarning(text) {
    document.getElementById("chat-warning").textContent = text;
}

// =====================================================================
// ИНИЦИАТИВЫ: «Я в деле»
// =====================================================================
// Подходит и для инициатив («Я в деле»), и для событий («Пойду»)
function join(button) {
    let card = button.closest(".card, .event");
    if (!state.joined.includes(card.id)) {
        state.joined.push(card.id);
        saveState();
    }
    showJoined(card);
}

function showJoined(card) {
    let count = card.querySelector(".count");
    let button = card.querySelector("button");
    if (!button || button.disabled) {
        return;                            // уже отмечено — второй раз не прибавляем
    }
    count.textContent = Number(count.textContent) + 1;   // Number() — как int() в Python
    button.textContent = button.dataset.done;            // текст после нажатия берём из data-done
    button.disabled = true;
}

// =====================================================================
// СВОИ ИНИЦИАТИВЫ И СОБЫТИЯ: предложить / сообщить
// =====================================================================
function addIdea() {
    let title = document.getElementById("idea-title").value.trim();
    let text = document.getElementById("idea-text").value.trim();
    let warn = function (t) { document.getElementById("idea-warning").textContent = t; };
    if (title === "") {
        warn("Напиши, что вы сделаете");
        return;
    }
    if (stopRudeOrBlocked(title + " " + text, warn)) {
        return;                            // инициатива тоже проходит фильтр
    }
    state.myIdeas.push({title: title, text: text});
    saveState();
    drawMyIdea(state.myIdeas.length - 1);
    document.getElementById("idea-title").value = "";
    document.getElementById("idea-text").value = "";
    document.querySelector("#ideas .new-form").open = false;   // сворачиваем форму
}

function drawMyIdea(i) {
    let idea = state.myIdeas[i];
    let card = document.createElement("div");
    card.className = "card";
    card.id = "myidea" + i;
    card.innerHTML = '<h2></h2><p class="muted"></p><p class="mine-tag">Ты автор</p><p>Участников: <b class="count">1</b></p>';
    card.querySelector("h2").textContent = idea.title;           // textContent — безопасно
    card.querySelector(".muted").textContent = idea.text;
    document.getElementById("my-ideas").prepend(card);          // новая — сверху
}

function addEvent() {
    let title = document.getElementById("event-title").value.trim();
    let when = document.getElementById("event-when").value.trim();
    let place = document.getElementById("event-place").value.trim();
    let warn = function (t) { document.getElementById("event-warning").textContent = t; };
    if (title === "" || when === "") {
        warn("Напиши название и когда");
        return;
    }
    if (stopRudeOrBlocked(title + " " + when + " " + place, warn)) {
        return;
    }
    state.myEvents.push({title: title, when: when, place: place});
    saveState();
    drawMyEvent(state.myEvents.length - 1);
    for (let id of ["event-title", "event-when", "event-place"]) {
        document.getElementById(id).value = "";
    }
    document.querySelector("#events .new-form").open = false;
}

function drawMyEvent(i) {
    let ev = state.myEvents[i];
    let div = document.createElement("div");
    div.className = "event";
    div.id = "myevent" + i;
    div.innerHTML = '<b></b><span></span><div class="event-foot">Идут: <b class="count">1</b> <span class="mine-tag">Ты организатор</span></div>';
    div.querySelector("b").textContent = ev.title;
    div.querySelector("span").textContent = ev.when + (ev.place ? " · " + ev.place : "");
    document.getElementById("my-events").prepend(div);
}

// =====================================================================
// СВОИ КРУЖКИ: любой ученик может создать кружок по интересам
// =====================================================================
function addClub() {
    let name = document.getElementById("club-name").value.trim();
    let icon = document.querySelector('input[name="club-icon"]:checked').value;
    let warn = function (t) { document.getElementById("club-warning").textContent = t; };
    if (name === "") {
        warn("Напиши название кружка");
        return;
    }
    // Чаты классов создаются сами, и попасть можно только в чат СВОЕГО класса.
    // Поэтому кружок с названием класса («Класс 7Б», «7Б», «7 б класс») создать нельзя
    if (/^(класс\s*)?\d{1,2}\s*[а-яё]?(\s*класс)?$/i.test(name)) {
        warn("Чат класса создаётся сам — ты в чате своего класса. Придумай другое название");
        return;
    }
    // Такой кружок уже есть? Сравниваем маленькими буквами: «Шахматы» = «шахматы»
    for (let id in CLUBS) {
        if (CLUBS[id].name.toLowerCase() === name.toLowerCase()) {
            warn("Такой кружок уже есть — загляни в него");
            return;
        }
    }
    if (state.myClubs.length >= 1) {
        // Автор кейса предупредил: если каждый будет создавать кружки, начнётся хаос из чатов
        warn("Свой кружок можно создать только один — чтобы не было хаоса из десятков чатов");
        return;
    }
    if (stopRudeOrBlocked(name, warn)) {
        return;                            // название тоже проходит фильтр
    }
    state.myClubs.push({name: name, icon: icon});
    saveState();
    let id = drawMyClub(state.myClubs.length - 1);
    document.getElementById("club-name").value = "";
    document.querySelector("#clubs .new-form").open = false;
    openClub(id);                          // сразу открываем чат нового кружка
    location.hash = "chat";
}

// Добавить свой кружок в список и в сетку кружков. Возвращает его id (myclub0, myclub1...)
function drawMyClub(i) {
    return drawClub("myclub" + i, state.myClubs[i], currentNick);
}

// Значки для своих кружков — линиями, в том же стиле, что и значки в сетке (как на макете).
// Ключ — эмодзи: он остаётся в заголовке чата и в старых сохранённых кружках
const ICON_SVG = {
    "🎨": "<path d=\"M12 3a9 9 0 1 0 0 18c1.1 0 1.7-1 1.2-1.9-.5-1 .2-2.1 1.3-2.1H17a4 4 0 0 0 4-4c0-5.5-4-10-9-10z\"/><circle cx=\"7.5\" cy=\"11\" r=\"1.2\" fill=\"currentColor\"/><circle cx=\"10.5\" cy=\"7\" r=\"1.2\" fill=\"currentColor\"/><circle cx=\"15.2\" cy=\"7.6\" r=\"1.2\" fill=\"currentColor\"/>",
    "⚽": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 8.6l3.2 2.3-1.2 3.8h-4l-1.2-3.8z\"/><path d=\"M12 8.6V3.3\"/><path d=\"M15.2 10.9l4.8-1.6\"/><path d=\"M14 14.7l3 4.2\"/><path d=\"M10 14.7l-3 4.2\"/><path d=\"M8.8 10.9L4 9.3\"/>",
    "🎮": "<path d=\"M7 8h10a4 4 0 0 1 4 4v1a3 3 0 0 1-5.3 1.9L14 13h-4l-1.7 1.9A3 3 0 0 1 3 13v-1a4 4 0 0 1 4-4z\"/><path d=\"M7.5 10v3.4\"/><path d=\"M5.8 11.7h3.4\"/><circle cx=\"15.5\" cy=\"10.8\" r=\"1\" fill=\"currentColor\"/><circle cx=\"17.6\" cy=\"12.8\" r=\"1\" fill=\"currentColor\"/>",
    "🎭": "<path d=\"M5 4h14v7a7 7 0 0 1-14 0z\"/><path d=\"M8.5 9h2\"/><path d=\"M13.5 9h2\"/><path d=\"M9 13.5c1.7 1.6 4.3 1.6 6 0\"/>",
    "♟️": "<circle cx=\"12\" cy=\"6\" r=\"2.6\"/><path d=\"M9.6 10.5h4.8l-1 6.2h-2.8z\"/><path d=\"M8 16.7h8l1 3.3H7z\"/>",
    "🧪": "<path d=\"M9 3h6\"/><path d=\"M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3\"/><path d=\"M7.6 15h8.8\"/>",
    "🎤": "<rect x=\"9\" y=\"3\" width=\"6\" height=\"11\" rx=\"3\"/><path d=\"M6 11a6 6 0 0 0 12 0\"/><path d=\"M12 17v4\"/><path d=\"M9 21h6\"/>",
    "🎬": "<rect x=\"3\" y=\"9\" width=\"18\" height=\"12\" rx=\"2\"/><path d=\"M3.5 9l1.6-4.5h13.8L20.5 9\"/><path d=\"M9 4.5L7.5 9\"/><path d=\"M14 4.5L12.5 9\"/>",
    "🌍": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M3 12h18\"/><path d=\"M12 3c3 3.2 3 14.8 0 18\"/><path d=\"M12 3c-3 3.2-3 14.8 0 18\"/>",
    "🐾": "<path d=\"M12 20.5c-3 0-5-1.6-5-3.6 0-2.1 2.3-4.6 5-4.6s5 2.5 5 4.6c0 2-2 3.6-5 3.6z\"/><circle cx=\"6\" cy=\"10.5\" r=\"1.7\"/><circle cx=\"9.5\" cy=\"6.3\" r=\"1.7\"/><circle cx=\"14.5\" cy=\"6.3\" r=\"1.7\"/><circle cx=\"18\" cy=\"10.5\" r=\"1.7\"/>"
};

function iconSvg(emoji) {
    return '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">' + ICON_SVG[emoji] + '</svg>';
}

// В форме «Создать кружок» вместо эмодзи показываем такие же линейные значки
for (let input of document.querySelectorAll('input[name="club-icon"]')) {
    if (ICON_SVG[input.value]) {
        input.nextElementSibling.innerHTML = iconSvg(input.value);
    }
}

// Нарисовать созданный учеником кружок. owner — кто создал
function drawClub(id, club, owner) {
    CLUBS[id] = {name: club.name, icon: club.icon, messages: [], owner: owner};
    let link = document.createElement("a");
    link.className = "club";
    link.dataset.club = id;
    link.href = "#chat";
    link.onclick = function () { openClub(id); };
    let circle = document.createElement("span");
    circle.className = "circle c-new";
    if (ICON_SVG[club.icon]) {
        circle.innerHTML = iconSvg(club.icon);    // наш значок (строка из кода — безопасно)
    } else {
        circle.textContent = club.icon;           // старый кружок с другим значком
    }
    let title = document.createElement("span");
    title.textContent = club.name;         // textContent — безопасно
    link.append(circle, title);
    let grid = document.getElementById("clubs-grid");
    grid.insertBefore(link, grid.querySelector(".create-tile"));   // новый кружок — перед кругом «Создать»
    layoutClubGrid();
    return id;
}

// =====================================================================
// ЛИЧНЫЕ СООБЩЕНИЯ: каждый чат разрешается отдельно, только если согласны оба
// Статусы: "incoming" — мне прислали запрос, "pending" — я отправил запрос,
//          "allowed" — оба согласны, чат открыт, "blocked" — заблокирован
// =====================================================================
let currentDm = "";      // с кем открыт личный чат

function dmOf(nick) {
    if (!state.dm) {
        state.dm = {};
    }
    return state.dm[nick];
}

// Нажали «Написать лично» у чужого сообщения
function requestPrivate(button) {
    let nick = button.closest(".message").dataset.nick;
    let dm = dmOf(nick);
    if (dm && dm.status === "allowed") {
        openDm(nick);                      // чат уже разрешён — просто открываем
        return;
    }
    if (dm && dm.status === "blocked") {
        button.textContent = "Ты заблокировал этого ученика";
        button.disabled = true;
        return;
    }
    if (dm && dm.status === "incoming") {
        location.hash = "private";         // он уже просил написать тебе — реши в «Личных»
        return;
    }
    state.dm[nick] = {status: "pending", messages: []};
    saveState();
    renderPrivate();                       // запрос сразу появляется в «Моих запросах»
    button.textContent = "Запрос отправлен";
    button.disabled = true;
    simulateAnswer(nick);
}

// В прототипе нет других живых людей, поэтому придуманный собеседник
// «соглашается» сам через 3 секунды. В настоящей версии он решал бы сам.
function simulateAnswer(nick) {
    setTimeout(function () {
        let dm = dmOf(nick);
        if (dm && dm.status === "pending") {
            dm.status = "allowed";
            dm.messages.push({from: nick, text: "Привет! Да, давай общаться."});
            saveState();
            renderPrivate();
        }
    }, 3000);
}

function acceptDm(nick) {
    dmOf(nick).status = "allowed";
    saveState();
    renderPrivate();
}

function declineDm(nick) {
    askConfirm("Отклонить запрос?", nick + " не узнает причину и сможет отправить запрос снова.", "Отклонить", function () {
        delete state.dm[nick];             // запрос просто исчезает, собеседник не узнаёт причину
        saveState();
        renderPrivate();
    });
}

function blockDm() {
    let nick = currentDm;
    askConfirm("Заблокировать " + nick + "?", "Он не сможет тебе писать. Разблокировать можно в разделе ✉️ — переписка сохранится.", "Заблокировать", function () {
        dmOf(nick).status = "blocked";     // переписку не удаляем
        saveState();
        location.hash = "private";
        renderPrivate();
    });
}

function unblockDm(nick) {
    dmOf(nick).status = "allowed";         // чат возвращается вместе со всей перепиской
    saveState();
    renderPrivate();
}

// =====================================================================
// НЕПРОЧИТАННЫЕ: красный кружок с числом на вкладке «Сообщения»
// Запоминаем, сколько чужих сообщений человек уже видел в каждом чате
// =====================================================================
function othersCount(messages) {
    return messages.filter(function (m) { return m.from !== currentNick; }).length;   // filter — как генератор с if в Python
}

function unreadDm(nick) {
    let dm = dmOf(nick);
    if (!dm || dm.status !== "allowed") {
        return 0;
    }
    return Math.max(0, othersCount(dm.messages) - ((state.dmSeen || {})[nick] || 0));
}

function markDmSeen(nick) {
    if (!state.dmSeen) { state.dmSeen = {}; }
    state.dmSeen[nick] = othersCount(dmOf(nick).messages);
    saveState();
    updateBadge();
}

// Сколько всего нового: непрочитанные сообщения + запросы в личку
function updateBadge() {
    if (currentNick === "") {
        return;
    }
    let total = 0;
    for (let nick in state.dm) {
        total += state.dm[nick].status === "incoming" ? 1 : unreadDm(nick);
    }
    let badge = document.getElementById("dm-badge");
    badge.hidden = total === 0;
    badge.textContent = total > 9 ? "9+" : String(total);
}

// Подсветить в меню открытую вкладку
function markActiveTab() {
    for (let link of document.querySelectorAll(".menu a")) {
        let target = link.getAttribute("href");
        let active = location.hash === target || (target === "#private" && location.hash === "#dm");
        link.classList.toggle("active", active);
        if (active) {
            link.scrollIntoView({block: "nearest", inline: "nearest"});   // если кнопка за краем — подкручиваем ряд
        }
    }
}

// Нарисовать экран «Личные сообщения»
function renderPrivate() {
    let incoming = document.getElementById("dm-incoming");
    let outgoing = document.getElementById("dm-outgoing");
    let chats = document.getElementById("dm-chats");
    incoming.innerHTML = "";
    outgoing.innerHTML = "";
    chats.innerHTML = "";

    for (let nick in state.dm) {           // как for nick in state["dm"] в Python
        let dm = state.dm[nick];
        let row = document.createElement("div");
        row.className = "dm-row";
        row.innerHTML = "<b></b><span class='buttons'></span>";
        row.querySelector("b").textContent = nick;
        let buttons = row.querySelector(".buttons");

        if (dm.status === "incoming") {
            buttons.append(makeButton("Разрешить", "btn", function () { acceptDm(nick); }));
            buttons.append(makeButton("Отклонить", "btn logout", function () { declineDm(nick); }));
            incoming.append(row);
        } else if (dm.status === "pending") {
            buttons.innerHTML = "<span class='status'>ожидает согласия</span>";
            outgoing.append(row);
        } else if (dm.status === "allowed") {
            if (unreadDm(nick) > 0) {
                let mark = document.createElement("span");
                mark.className = "unread";
                mark.textContent = " · новых: " + unreadDm(nick);
                row.querySelector("b").append(mark);
            }
            buttons.append(makeButton("Открыть чат", "btn", function () { openDm(nick); }));
            chats.append(row);
        } else if (dm.status === "blocked") {
            row.querySelector("b").textContent = nick + " · заблокирован";
            buttons.append(makeButton("Разблокировать", "btn logout", function () { unblockDm(nick); }));
            chats.append(row);
        }
    }
    for (let box of [incoming, outgoing, chats]) {
        if (box.innerHTML === "") {
            box.innerHTML = "<p class='dm-empty'>Пока пусто</p>";
        }
    }
    updateBadge();
}

// Создать кнопку с действием (так безопаснее, чем вставлять ник в onclick)
function makeButton(text, className, action) {
    let button = document.createElement("button");
    button.textContent = text;
    button.className = className;
    button.onclick = action;
    return button;
}

// Открыть личный чат
function openDm(nick) {
    currentDm = nick;
    document.getElementById("dm-typing").hidden = true;
    document.getElementById("dm-block").hidden = false;
    document.getElementById("dm-title").textContent = "✉️ " + nick;
    document.getElementById("dm-messages").innerHTML = "";
    let messages = dmOf(nick).messages;
    for (let i = 0; i < messages.length; i++) {
        let id = "dm-" + nick + "-" + i;
        if (messages[i].deletedForMe) {
            continue;                      // удалённое «у себя» пропускаем (continue — как в Python)
        }
        let message = addMessageToChat(id, messages[i].from, messages[i].text, "dm-messages", false);
        if (messages[i].from === currentNick) {
            showMyMessageState(message, messages[i]);
        } else if (state.hidden.includes(id)) {
            showHidden(message);
        } else if (state.reported.includes(id)) {
            showReported(message.querySelectorAll(".actions button")[1]);
        }
    }
    document.getElementById("dm-warning").textContent = "";
    markDmSeen(nick);                      // открыли чат — новые сообщения прочитаны
    location.hash = "dm";
}

// Отправить сообщение в личный чат
function sendDm() {
    let input = document.getElementById("dm-input");
    let text = input.value.trim();
    let dm = dmOf(currentDm);
    if (text === "" || !dm || dm.status !== "allowed") {
        return;
    }
    let showDmWarning = function (t) { document.getElementById("dm-warning").textContent = t; };
    if (stopRudeOrBlocked(text, showDmWarning)) {
        return;
    }
    dm.messages.push({from: currentNick, text: text});
    saveState();
    addMessageToChat("dm-" + currentDm + "-" + (dm.messages.length - 1), currentNick, text, "dm-messages", false);
    input.value = "";
    autoReply(currentDm, text);
}

// В прототипе придуманный собеседник отвечает сам через пару секунд.
// В настоящей версии отвечал бы живой ученик
function autoReply(nick, text) {
    let me = currentNick;
    let low = text.toLowerCase();
    let answer;
    if (low.includes("привет") || low.includes("здравствуй") || low.includes("хай")) {
        answer = "Привет! 👋 Как дела?";
    } else if (low.includes("как дела") || low.includes("как ты")) {
        answer = "Нормально, спасибо! А у тебя?";
    } else if (text.includes("?")) {
        answer = "Хороший вопрос 🤔 Давай обсудим после уроков?";
    } else {
        let answers = ["Ага, понял 👍", "Классно!", "Давай!", "Ок, договорились", "Ха-ха 😄", "А ты в каком кружке?"];
        answer = answers[dmOf(nick).messages.length % answers.length];   // % — остаток от деления, как в Python
    }
    // Как в настоящем мессенджере: собеседник сначала «читает», потом «печатает», потом отвечает
    let readTime = 1000 + Math.random() * 1000;            // 1–2 секунды на прочтение
    let typeTime = 2000 + Math.random() * 1500;            // 2–3,5 секунды «печатает…»
    setTimeout(function () {
        if (location.hash === "#dm" && currentDm === nick) {
            let typing = document.getElementById("dm-typing");
            typing.textContent = nick + " печатает…";
            typing.hidden = false;
        }
    }, readTime);
    setTimeout(function () {
        document.getElementById("dm-typing").hidden = true;
        let dm = dmOf(nick);
        if (currentNick !== me || !dm || dm.status !== "allowed") {
            return;                        // вышли из профиля или заблокировали — не отвечаем
        }
        dm.messages.push({from: nick, text: answer});
        saveState();
        if (location.hash === "#dm" && currentDm === nick) {
            addMessageToChat("dm-" + nick + "-" + (dm.messages.length - 1), nick, answer, "dm-messages", false);
            markDmSeen(nick);              // человек сейчас в этом чате — ответ сразу прочитан
        } else {
            updateBadge();                 // вышел из чата — на «Сообщениях» появится красный кружок
            renderPrivate();
        }
    }, readTime + typeTime);
}

// =====================================================================
// НАСТРОЙКИ: тема и крупный текст
// =====================================================================
// Человек переключил галочку — читаем все галочки и сохраняем
function changeSettings() {
    state.settings.dark = document.getElementById("set-dark").checked;     // checked — стоит ли галочка
    state.settings.big = document.getElementById("set-big").checked;
    saveState();
    applySettings();
}

// Применить настройки к странице
function applySettings() {
    // classList.toggle("dark", true) добавляет класс, с false — убирает
    document.body.classList.toggle("dark", state.settings.dark);
    document.body.classList.toggle("big", state.settings.big);
    // Запоминаем тему на телефоне — чтобы экран входа после выхода был в той же теме
    try {
        localStorage.setItem("schoolAppTheme", state.settings.dark ? "dark" : "light");
    } catch (e) {}
    // Галочки на экране настроек ставим так, как сохранено
    document.getElementById("set-dark").checked = state.settings.dark;
    document.getElementById("set-big").checked = state.settings.big;
}

// Заполнить «Мой профиль»
function showProfile() {
    let u = users[currentNick];
    document.getElementById("profile-nick").textContent = currentNick;
    document.getElementById("profile-role").textContent = ROLE_NAMES[myRole()];
    document.getElementById("profile-grade").textContent = classGrade() || "—";
    let extra = "";
    if (myRole() === "teacher") {
        let names = [];
        for (let id of u.clubs || []) { names.push(CLUBS[id].name); }
        extra = "Кружки: " + (names.length ? names.join(", ") : "—");   // join — как ", ".join() в Python
    }
    document.getElementById("profile-extra").textContent = extra;
}

// Показать нужное для роли: меню, формы, кнопки
function applyRole() {
    let role = myRole();
    document.body.classList.remove("role-student", "role-teacher");
    document.body.classList.add("role-" + role);
    for (let el of document.querySelectorAll("[data-roles]")) {
        el.hidden = !el.dataset.roles.split(" ").includes(role);
    }
    let titles = {student: "Кружки по интересам", teacher: "Мои кружки"};
    document.getElementById("clubs-title").textContent = titles[role];
}

// Скрыть в сетке кружки, которые роли не видны
function applyClubFilter() {
    let allowed = allowedClubs();
    for (let link of document.querySelectorAll("#clubs-grid .club")) {
        if (link.classList.contains("create-tile")) {
            link.hidden = myRole() !== "student";           // создавать кружки могут только ученики
        } else {
            link.hidden = allowed !== null && !allowed.includes(link.dataset.club);
        }
    }
    layoutClubGrid();
}

// Если кругов нечётное число — последний ставим по центру, чтобы не было пустой клетки
function layoutClubGrid() {
    let tiles = Array.from(document.querySelectorAll("#clubs-grid .club")).filter(function (t) { return !t.hidden; });
    for (let t of tiles) {
        t.classList.remove("wide");
    }
    if (tiles.length % 2 === 1) {
        tiles[tiles.length - 1].classList.add("wide");
    }
}

// Нажали круг «Создать кружок» — открываем форму над сеткой
function openClubForm() {
    let form = document.querySelector("#clubs .new-form");
    form.open = true;
    form.scrollIntoView({behavior: "smooth", block: "start"});
    document.getElementById("club-name").focus();
}

// «Принимаю» на правилах: ученик идёт в чат класса, модератор — к своим кружкам
function acceptRules() {
    if (myRole() === "student") {
        openClub("class");
        return true;
    }
    location.hash = "clubs";
    return false;                          // false — ссылка сама никуда не переходит
}

// =====================================================================
// ПРИ ОТКРЫТИИ СТРАНИЦЫ: восстановить всё из памяти телефона
// =====================================================================
loadUsers();
try {
    currentNick = sessionStorage.getItem("schoolAppCurrent") || "";
} catch (e) {}
if (currentNick !== "" && !users[currentNick]) {
    currentNick = "";                      // такого профиля больше нет
}

if (currentNick === "") {
    // Никто не вошёл — пускаем только на экран входа
    if (!isOpenScreen()) {
        location.hash = "login";
    }
} else {
    state = users[currentNick].state;
    restoreScreen();
    if (location.hash === "#dm") {
        location.hash = "private";         // после перезагрузки возвращаемся к списку личных чатов
    }
}

// Экраны, которые можно открыть без входа
function isOpenScreen() {
    return location.hash === "" || location.hash === "#login" || location.hash === "#register";
}

// Если кто-то без входа пытается перейти на другой экран по ссылке — возвращаем на вход
window.addEventListener("hashchange", function () {
    if (currentNick === "" && !isOpenScreen()) {
        location.hash = "login";
    } else if (currentNick !== "" && myRole() === "teacher" && (location.hash === "#private" || location.hash === "#dm")) {
        location.hash = "clubs";           // у модератора нет личных сообщений
    } else if (currentNick !== "" && location.hash === "#reports" && myRole() !== "teacher") {
        location.hash = "clubs";
    } else if (currentNick !== "" && location.hash === "#chat" && !canOpenChat(currentClub)) {
        location.hash = "clubs";           // модератору — только чаты его кружков
    } else if (location.hash === "#dm" && currentDm === "") {
        location.hash = "private";         // личный чат открывается только из списка
    }
    markActiveTab();
    if (location.hash === "#events" && currentNick !== "") {
        renderAnnouncements();
    }
    if (location.hash === "#reports" && currentNick !== "" && myRole() === "teacher") {
        document.getElementById("reports-done").textContent = "";
        renderReports();
    }
});

// Восстановить экран из данных пользователя
function restoreScreen() {
    // У старых профилей настроек ещё нет — добавляем по умолчанию
    if (!state.settings) {
        state.settings = {dark: true, big: false};
    }
    // У старых профилей этих списков ещё нет
    if (!state.myIdeas) { state.myIdeas = []; }
    if (!state.myEvents) { state.myEvents = []; }
    if (!state.myClubs) { state.myClubs = []; }
    if (!state.joinedClubs) { state.joinedClubs = []; }
    applySettings();
    applyRole();
    setupClassChat();
    showProfile();
    for (let i = 0; i < state.myIdeas.length; i++) { drawMyIdea(i); }
    for (let i = 0; i < state.myEvents.length; i++) { drawMyEvent(i); }
    for (let i = 0; i < state.myClubs.length; i++) { drawMyClub(i); }
    applyClubFilter();
    renderAnnouncements();
    document.getElementById("clubs-empty").hidden = !(myRole() === "teacher" && allowedClubs().length === 0);
    let allowed = allowedClubs();
    currentClub = allowed === null ? "class" : (allowed[0] || "class");
    if (myRole() === "teacher") {
        renderReports();
    }
    // Для показа: один придуманный ученик уже просит написать тебе лично
    if (!state.dm && myRole() === "student") {
        state.dm = {"Скрипка_7В": {status: "incoming", messages: [
            {from: "Скрипка_7В", text: "Привет! Ты тоже хочешь в группу к концерту?"}
        ]}};
        saveState();
    }
    renderPrivate();
    updateBadge();
    setTimeout(markActiveTab, 0);

    // Рисуем чат открытого кружка (свои сообщения, скрытые, жалобы)
    renderChat();

    // Инициативы, где нажимал «Я в деле»
    for (let id of state.joined) {
        let card = document.getElementById(id);
        if (card) {
            showJoined(card);
        }
    }

    // Если отправка была приостановлена — сразу показываем предупреждение
    if (state.blocked) {
        showChatWarning("Отправка сообщений приостановлена. Модератор рассмотрит ситуацию.");
    }
}

// =====================================================================
// Тема экрана входа (пока никто не вошёл): последняя выбранная на этом телефоне,
// а если её ещё не выбирали — тёмная (основная тема приложения)
// =====================================================================
if (!currentNick) {
    let savedTheme = null;
    try { savedTheme = localStorage.getItem("schoolAppTheme"); } catch (e) {}
    document.body.classList.toggle("dark", savedTheme !== "light");
}

// =====================================================================
// PWA: подключаем service worker (sw.js) — приложение можно установить
// на телефон и открывать без интернета после первого запуска
// =====================================================================
if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(function () {
        // если не получилось (например, открыто как файл) — сайт просто работает как обычно
    });
}
