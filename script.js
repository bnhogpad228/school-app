// =====================================================================
// ПОЛЬЗОВАТЕЛИ И ПАМЯТЬ НА ТЕЛЕФОНЕ (localStorage)
// На одном телефоне может быть несколько профилей. Все они лежат в users —
// это как словарь в Python: { "Котик_7Б": {password: "...", grade: "7Б", state: {...}}, ... }.
// Данные хранятся только в браузере этого телефона, на сервер ничего не уходит.
// =====================================================================
const SCHOOL_CODE = "1234";   // код школы — один для всех учеников (в настоящей версии проверял бы сервер)

let users = {};          // все профили на этом телефоне
let currentNick = "";    // кто сейчас вошёл (пусто — никто)

// Данные одного пользователя
function emptyState() {
    return {
        myMessages: [],    // свои сообщения
        hidden: [],        // id скрытых сообщений
        reported: [],      // id сообщений, на которые пожаловался
        joined: [],        // id инициатив, где нажал «Я в деле»
        warnings: 0,       // сколько раз нарушил правила
        blocked: false,    // приостановлена ли отправка
        settings: {dark: false, big: false},   // настройки
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
    // .value — то, что ввели в поле; .trim() убирает пробелы по краям (как strip() в Python)
    let code = document.getElementById("reg-code").value.trim();
    let nick = document.getElementById("reg-nick").value.trim();
    let grade = document.getElementById("reg-grade").value;
    let letter = document.getElementById("reg-letter").value;
    let password = document.getElementById("reg-password").value;
    let password2 = document.getElementById("reg-password2").value;
    let error = document.getElementById("register-error");

    if (code !== SCHOOL_CODE) {
        error.textContent = "Неверный код школы";
        return;
    }
    if (nick === "") {
        error.textContent = "Придумай ник";
        return;
    }
    if (users[nick]) {
        error.textContent = "Такой ник уже занят — придумай другой";
        return;
    }
    if (grade === "" || letter === "") {
        error.textContent = "Выбери номер и букву класса";
        return;
    }
    if (password.length < 4) {
        error.textContent = "Пароль — не меньше 4 символов";
        return;
    }
    if (password !== password2) {          // !== значит «строго не равно»
        error.textContent = "Пароли не совпадают";
        return;
    }
    // Создаём нового пользователя
    users[nick] = {password: password, grade: grade + letter, state: emptyState()};
    currentNick = nick;
    saveState();
    startSession(nick);
}

// =====================================================================
// ВХОД: код школы, ник и пароль
// =====================================================================
function login() {
    let code = document.getElementById("code").value.trim();
    let nick = document.getElementById("nick").value.trim();
    let password = document.getElementById("password").value;
    let error = document.getElementById("login-error");

    if (code !== SCHOOL_CODE) {
        error.textContent = "Неверный код школы";
        return;
    }
    if (!users[nick] || users[nick].password !== password) {
        // Не говорим, что именно неверно — так сложнее подбирать чужие ники
        error.textContent = "Неверный ник или пароль";
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

// Удалить свой профиль и все свои данные с этого телефона
function deleteProfile() {
    delete users[currentNick];             // как del users[nick] в Python
    try {
        localStorage.setItem("schoolAppUsers", JSON.stringify(users));
    } catch (e) {}
    logout();
}

// =====================================================================
// СООБЩЕНИЯ: скрыть, пожаловаться, отправить
// =====================================================================
function hideMessage(button) {
    // closest(".message") — ищем вверх ближайший блок сообщения, в котором лежит кнопка
    let message = button.closest(".message");
    if (!state.hidden.includes(message.id)) {
        state.hidden.push(message.id);     // push — как append в Python
        saveState();
    }
    showHidden(message);
}

function showHidden(message) {
    message.innerHTML = '<p class="muted">Сообщение скрыто</p>';
}

function report(button) {
    let message = button.closest(".message");
    if (!state.reported.includes(message.id)) {
        state.reported.push(message.id);
        saveState();
    }
    showReported(button);
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
    music: {name: "Музыка", icon: "🎵", messages: [
        ["Нота_6А", "Кто хочет собрать группу к школьному концерту?"],
        ["Гитарист_9Б", "Я играю на гитаре, нужен барабанщик."],
        ["Скрипка_7В", "Могу петь! Репетиции после уроков?"]
    ]},
    basketball: {name: "Баскетбол", icon: "🏀", messages: [
        ["Мяч_8А", "Турнир 3×3 в пятницу, ищем четвёртого в команду."],
        ["Прыгун_9В", "Я в деле! Тренируемся во дворе в среду?"],
        ["Кольцо_7Б", "Возьму мяч, у меня есть хороший."]
    ]},
    robots: {name: "Роботы", icon: "🤖", messages: [
        ["Котик_7Б", "Кто идёт в пятницу на турнир по роботам?"],
        ["Пиксель_8А", "Я иду! Нужен ещё один человек в команду."],
        ["Сова_9В", "Могу помочь с программированием."]
    ]},
    books: {name: "Книги", icon: "📚", messages: [
        ["Читатель_8Б", "Что читаем в этом месяце? Предлагаю фантастику."],
        ["Закладка_6В", "Давайте обсуждать в библиотеке по четвергам."],
        ["Страница_9А", "Принесу пару книг для обмена."]
    ]},
    photo: {name: "Фото", icon: "📷", messages: [
        ["Объектив_9Б", "Устроим фотопрогулку по школьному двору?"],
        ["Кадр_7А", "Можно сделать выставку на стенде у входа."],
        ["Вспышка_8В", "Я за! Снимаю на телефон, это считается?"]
    ]},
    eco: {name: "Экология", icon: "🌱", messages: [
        ["Листик_6Б", "В субботу сажаем деревья во дворе, кто с нами?"],
        ["Ёлка_8А", "Иду! Надо взять перчатки."],
        ["Капля_9В", "Предлагаю поставить контейнеры для раздельного сбора."]
    ]}
};
let currentClub = "robots";   // какой чат открыт сейчас

// Нажали на кружок: запоминаем его и рисуем его чат
function openClub(clubId) {
    currentClub = clubId;
    renderChat();
    showChatWarning(state.blocked ? "Отправка сообщений приостановлена. Модератор рассмотрит ситуацию." : "");
}

// Нарисовать чат текущего кружка заново
function renderChat() {
    let club = CLUBS[currentClub];
    document.getElementById("chat-title").textContent = club.icon + " Чат: " + club.name;
    document.getElementById("messages").innerHTML = "";        // очищаем старые сообщения

    // Придуманные сообщения кружка. id вида robots-0, music-1...
    for (let i = 0; i < club.messages.length; i++) {
        let nick = club.messages[i][0];
        let text = club.messages[i][1];
        addMessageToChat(currentClub + "-" + i, nick, text);
    }

    // Свои сообщения — только те, что отправлены в этот кружок. id вида my0, my1...
    for (let i = 0; i < state.myMessages.length; i++) {
        let my = state.myMessages[i];
        if (typeof my === "string") {      // старый формат (до кружков) — считаем, что это «Роботы»
            my = {club: "robots", text: my};
            state.myMessages[i] = my;
        }
        if (my.club === currentClub && !my.deletedForMe) {   // удалённые «у себя» не показываем вовсе
            let message = addMessageToChat("my" + i, currentNick, my.text);
            showMyMessageState(message, my);
        }
    }

    // Скрытые и пожалованные сообщения отмечаем снова
    for (let message of document.querySelectorAll("#messages .message")) {
        if (state.hidden.includes(message.id)) {
            showHidden(message);
        } else if (state.reported.includes(message.id)) {
            showReported(message.querySelectorAll(".actions button")[1]);   // вторая кнопка — «Пожаловаться»
        }
    }
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
    if (canWritePrivately && nick !== currentNick) {
        privateButton = '<button onclick="requestPrivate(this)">Написать лично</button>';
    }
    if (nick === currentNick) {
        // Своё сообщение: жаловаться и скрывать незачем — можно изменить или удалить
        message.innerHTML = '<b></b><p></p><div class="actions">' + MY_ACTIONS + '</div>';
        message.classList.add("mine");     // своё сообщение — справа, своим цветом
    } else {
        message.innerHTML = '<b></b><p></p>' +
            '<div class="actions"><button onclick="hideMessage(this)">Скрыть</button>' +
            '<button onclick="report(this)">Пожаловаться</button>' + privateButton + '</div>';
    }

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

    state.myMessages.push({club: currentClub, text: text});   // запоминаем, в какой кружок отправили
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

// Нажали «Удалить» — вместо кнопок показываем развилку
function askDelete(button) {
    let actions = button.closest(".actions");
    actions.innerHTML = '<span class="ask">Удалить сообщение?</span>' +
        '<button onclick="deleteMessage(this, true)">У всех</button>' +
        '<button onclick="deleteMessage(this, false)">У себя</button>' +
        '<button onclick="cancelAction(this)">Отмена</button>';
}

// forAll = true — удалить у всех, false — только у себя
function deleteMessage(button, forAll) {
    let message = button.closest(".message");
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

// Отмена — возвращаем обычные кнопки «Изменить» и «Удалить»
function cancelAction(button) {
    button.closest(".actions").innerHTML = MY_ACTIONS;
}

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
    for (let word of RUDE_WORDS) {         // как for word in RUDE_WORDS в Python
        if (clean.includes(word)) {        // includes — как in для строк в Python
            return true;
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
            showWarning("Сообщение не отправлено: оно нарушает правила общения. Предупреждение " + state.warnings + " из 3.");
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
function join(button) {
    let card = button.closest(".card");
    if (!state.joined.includes(card.id)) {
        state.joined.push(card.id);
        saveState();
    }
    showJoined(card);
}

function showJoined(card) {
    let count = card.querySelector(".count");
    let button = card.querySelector("button");
    if (button.disabled) {
        return;                            // уже отмечено — второй раз не прибавляем
    }
    count.textContent = Number(count.textContent) + 1;   // Number() — как int() в Python
    button.textContent = "Ты в команде";
    button.disabled = true;
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
    delete state.dm[nick];                 // запрос просто исчезает, собеседник не узнаёт причину
    saveState();
    renderPrivate();
}

function blockDm() {
    dmOf(currentDm).status = "blocked";
    saveState();
    location.hash = "private";
    renderPrivate();
}

function unblockDm(nick) {
    delete state.dm[nick];                 // после разблокировки можно снова отправить запрос
    saveState();
    renderPrivate();
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
            buttons.append(makeButton("Открыть чат", "btn", function () { openDm(nick); }));
            chats.append(row);
        } else if (dm.status === "blocked") {
            buttons.append(makeButton("Разблокировать", "btn logout", function () { unblockDm(nick); }));
            chats.append(row);
        }
    }
    for (let box of [incoming, outgoing, chats]) {
        if (box.innerHTML === "") {
            box.innerHTML = "<p class='dm-empty'>Пока пусто</p>";
        }
    }
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
    // Галочки на экране настроек ставим так, как сохранено
    document.getElementById("set-dark").checked = state.settings.dark;
    document.getElementById("set-big").checked = state.settings.big;
}

// Заполнить «Мой профиль»
function showProfile() {
    document.getElementById("profile-nick").textContent = currentNick;
    document.getElementById("profile-grade").textContent = users[currentNick].grade || "—";
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
    } else if (location.hash === "#dm" && currentDm === "") {
        location.hash = "private";         // личный чат открывается только из списка
    }
});

// Восстановить экран из данных пользователя
function restoreScreen() {
    // У старых профилей настроек ещё нет — добавляем по умолчанию
    if (!state.settings) {
        state.settings = {dark: false, big: false};
    }
    applySettings();
    showProfile();
    // Для показа: один придуманный ученик уже просит написать тебе лично
    if (!state.dm) {
        state.dm = {"Скрипка_7В": {status: "incoming", messages: [
            {from: "Скрипка_7В", text: "Привет! Ты тоже хочешь в группу к концерту?"}
        ]}};
        saveState();
    }
    renderPrivate();

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
