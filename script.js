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
        blocked: false     // приостановлена ли отправка
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

    // Ставим сообщение перед строкой предупреждений и полем ввода
    document.getElementById("chat-warning").before(message);
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

    state.myMessages.push(text);
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

    // Свои сообщения рисуем обратно в чат
    for (let i = 0; i < state.myMessages.length; i++) {      // как for i in range(len(...))
        addMessageToChat("my" + i, currentNick, state.myMessages[i]);
    }

    // Скрытые сообщения снова скрываем
    for (let id of state.hidden) {
        let message = document.getElementById(id);
        if (message) {
            showHidden(message);
        }
    }

    // Жалобы снова показываем как отправленные
    for (let id of state.reported) {
        let message = document.getElementById(id);
        if (message && !state.hidden.includes(id)) {
            let button = message.querySelectorAll(".actions button")[1];   // вторая кнопка — «Пожаловаться»
            showReported(button);
        }
    }

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
