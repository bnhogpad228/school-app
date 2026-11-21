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
