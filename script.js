// ===== Кнопка «Скрыть» =====
// button — это кнопка, на которую нажали (её передаёт onclick="hideMessage(this)")
function hideMessage(button) {
    // closest(".message") — ищем вверх ближайший блок сообщения, в котором лежит кнопка
    let message = button.closest(".message");
    // Заменяем содержимое сообщения на серую надпись
    message.innerHTML = '<p class="muted">Сообщение скрыто</p>';
}

// ===== Кнопка «Пожаловаться» =====
function report(button) {
    button.textContent = "Жалоба отправлена модератору";
    button.disabled = true;      // повторно нажать нельзя
}

// ===== Вход: код школы + ник =====
let myNick = "Я";   // ник пользователя, запомним при входе

function login() {
    // .value — то, что человек ввёл в поле; .trim() убирает пробелы по краям (как strip() в Python)
    let code = document.getElementById("code").value.trim();
    let nick = document.getElementById("nick").value.trim();
    let error = document.getElementById("login-error");

    if (code !== "1234") {                 // !== значит «не равно»
        error.textContent = "Неверный код школы";
        return;                            // дальше не пускаем
    }
    if (nick === "") {
        error.textContent = "Придумай ник";
        return;
    }
    myNick = nick;
    location.hash = "rules";               // переходим на экран правил (как ссылка #rules)
}

// ===== Отправка сообщения в чат =====
function sendMessage() {
    let input = document.getElementById("new-message");
    let text = input.value.trim();
    if (text === "") {
        return;                            // пустое не отправляем
    }

    // Создаём новый блок сообщения
    let message = document.createElement("div");
    message.className = "message";
    message.innerHTML = '<b></b><p></p>' +
        '<div class="actions"><button onclick="hideMessage(this)">Скрыть</button>' +
        '<button onclick="report(this)">Пожаловаться</button></div>';

    // Ник и текст вставляем через textContent — так чужой код в сообщении не выполнится
    message.querySelector("b").textContent = myNick;
    message.querySelector("p").textContent = text;

    // Ставим новое сообщение перед полем ввода
    let sendBox = document.querySelector(".send");
    sendBox.before(message);

    input.value = "";                      // очищаем поле
}

// ===== Кнопка «Я в деле» =====
function join(button) {
    let card = button.closest(".card");
    let count = card.querySelector(".count");
    count.textContent = Number(count.textContent) + 1;   // Number() — как int() в Python
    button.textContent = "Ты в команде";
    button.disabled = true;
}
