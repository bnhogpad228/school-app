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
        settings: {dark: false, big: false, privateMessages: false}   // настройки
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
        }
        if (my.club === currentClub) {
            addMessageToChat("my" + i, currentNick, my.text);
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
function addMessageToChat(id, nick, text) {
    let message = document.createElement("div");
    message.className = "message";
    message.id = id;
    message.innerHTML = '<b></b><p></p>' +
        '<div class="actions"><button onclick="hideMessage(this)">Скрыть</button>' +
        '<button onclick="report(this)">Пожаловаться</button></div>';

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
    document.getElementById("messages").append(message);
    return message;
}

function sendMessage() {
    let input = document.getElementById("new-message");
    let text = input.value.trim();
    if (text === "") {
        return;                            // пустое не отправляем
    }
    if (state.blocked) {
        showChatWarning("Отправка сообщений приостановлена. Модератор рассмотрит ситуацию.");
        return;
    }
    if (isRude(text)) {
        state.warnings += 1;
        if (state.warnings >= 3) {
            state.blocked = true;
            showChatWarning("Третье нарушение правил: отправка сообщений приостановлена.");
        } else {
            showChatWarning("Сообщение не отправлено: оно нарушает правила общения. Предупреждение " + state.warnings + " из 3.");
        }
        saveState();
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
// НАСТРОЙКИ: тема, крупный текст, личные сообщения
// =====================================================================
// Человек переключил галочку — читаем все галочки и сохраняем
function changeSettings() {
    state.settings.dark = document.getElementById("set-dark").checked;     // checked — стоит ли галочка
    state.settings.big = document.getElementById("set-big").checked;
    state.settings.privateMessages = document.getElementById("set-private").checked;
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
    document.getElementById("set-private").checked = state.settings.privateMessages;
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
}

// Экраны, которые можно открыть без входа
function isOpenScreen() {
    return location.hash === "" || location.hash === "#login" || location.hash === "#register";
}

// Если кто-то без входа пытается перейти на другой экран по ссылке — возвращаем на вход
window.addEventListener("hashchange", function () {
    if (currentNick === "" && !isOpenScreen()) {
        location.hash = "login";
    }
});

// Восстановить экран из данных пользователя
function restoreScreen() {
    // У старых профилей настроек ещё нет — добавляем по умолчанию
    if (!state.settings) {
        state.settings = {dark: false, big: false, privateMessages: false};
    }
    applySettings();
    showProfile();

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
