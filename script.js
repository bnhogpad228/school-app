// =====================================================================
// ПАМЯТЬ НА ТЕЛЕФОНЕ (localStorage)
// Всё, что нужно помнить, лежит в одном объекте state (как словарь в Python).
// Он хранится только на телефоне пользователя, на сервер ничего не уходит.
// =====================================================================
let state = {
    nick: "",          // ник
    myMessages: [],    // свои сообщения (список строк)
    hidden: [],        // id скрытых сообщений
    reported: [],      // id сообщений, на которые пожаловался
    joined: [],        // id инициатив, где нажал «Я в деле»
    warnings: 0,       // сколько раз нарушил правила
    blocked: false     // приостановлена ли отправка
};

// Сохранить state на телефон
function saveState() {
    try {
        // localStorage хранит только текст, поэтому превращаем объект в JSON-строку
        localStorage.setItem("schoolApp", JSON.stringify(state));
    } catch (e) {
        // в режиме инкогнито хранилище может быть недоступно — приложение просто не запомнит
    }
}

// Загрузить state с телефона (если там что-то есть)
function loadState() {
    try {
        let saved = localStorage.getItem("schoolApp");
        if (saved) {
            state = JSON.parse(saved);   // из JSON-строки обратно в объект — как json.load в Python
        }
    } catch (e) {
        // если не получилось — начинаем с пустого state
    }
}

// =====================================================================
// ВХОД: код школы + ник
// =====================================================================
function login() {
    // .value — то, что человек ввёл в поле; .trim() убирает пробелы по краям (как strip() в Python)
    let code = document.getElementById("code").value.trim();
    let nick = document.getElementById("nick").value.trim();
    let error = document.getElementById("login-error");

    if (code !== "1234") {                 // !== значит «строго не равно»
        error.textContent = "Неверный код школы";
        return;                            // дальше не пускаем
    }
    if (nick === "") {
        error.textContent = "Придумай ник";
        return;
    }
    state.nick = nick;
    saveState();
    location.hash = "rules";               // переходим на экран правил (как ссылка #rules)
}

// Выход: стираем всё, что приложение запомнило на этом телефоне
function logout() {
    try {
        localStorage.removeItem("schoolApp");
    } catch (e) {}
    location.hash = "";
    location.reload();                     // перезагружаем страницу «с чистого листа»
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
    addMessageToChat("my" + (state.myMessages.length - 1), state.nick || "Я", text);
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
loadState();

// Ник подставляем в поле входа, чтобы не вводить заново
document.getElementById("nick").value = state.nick;

// Свои сообщения рисуем обратно в чат
for (let i = 0; i < state.myMessages.length; i++) {      // как for i in range(len(...))
    addMessageToChat("my" + i, state.nick || "Я", state.myMessages[i]);
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
