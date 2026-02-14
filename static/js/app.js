/* ========================================
   KATE AI — Frontend Logic
   ======================================== */

let chatHistory = [];
let isSending = false;
let sessionId = "";
let chatUser = "";
let selectedUserAvatar = "harry";
let selectedBotAvatar = "kate";

function generateSessionId() {
    var now = new Date();
    var ts = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
    var rand = Math.random().toString(36).slice(2, 8);
    return "chat-" + ts + "-" + rand;
}

const AVATAR_LABELS = { harry: "Harry", horse: "Horse", kate: "Kate", bald: "Bald" };
const AVATAR_FALLBACK = { harry: "H", horse: "🐴", kate: "K", bald: "B" };

/* ----------------------------------------
   DOM References
   ---------------------------------------- */
const landingPage = document.getElementById("landing-page");
const hubPage = document.getElementById("hub-page");
const valentinePage = document.getElementById("valentine-page");
const moodPage = document.getElementById("mood-page");
const kateChoicePage = document.getElementById("kate-choice-page");
const lavaPage = document.getElementById("lava-page");
const chatPage = document.getElementById("chat-page");

const startBtn = document.getElementById("start-chat-btn");
const backBtn = document.getElementById("back-btn");
const passwordInput = document.getElementById("password-input");
const passwordError = document.getElementById("password-error");
const chatMessages = document.getElementById("chat-messages");
const chatInput = document.getElementById("chat-input");
const sendBtn = document.getElementById("send-btn");
const promptChips = document.getElementById("prompt-chips");

const headerBotAvatar = document.getElementById("header-bot-avatar");
const headerBotFallback = document.getElementById("header-bot-fallback");
const headerBotName = document.getElementById("header-bot-name");

/* ----------------------------------------
   Screen Transitions
   ---------------------------------------- */
function showScreen(screenEl) {
    document.querySelectorAll(".screen").forEach(function (el) {
        el.classList.remove("active");
    });
    screenEl.classList.add("active");
}

async function transitionToHub() {
    const password = passwordInput.value.trim();
    if (!password) {
        passwordError.textContent = "Please enter the password";
        return;
    }

    startBtn.disabled = true;
    startBtn.textContent = "Checking...";

    try {
        const response = await fetch("/api/verify-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password: password }),
        });
        const data = await response.json();

        if (!data.valid) {
            passwordError.textContent = data.error || "Wrong password!";
            startBtn.disabled = false;
            startBtn.textContent = "Continue";
            return;
        }
        chatUser = data.user || "Unknown";
    } catch (err) {
        passwordError.textContent = "Can't reach server. Is it running?";
        startBtn.disabled = false;
        startBtn.textContent = "Continue";
        return;
    }

    startBtn.disabled = false;
    startBtn.textContent = "Continue";
    passwordError.textContent = "";
    landingPage.classList.remove("active");
    if (window.stopHeartsAnimation) window.stopHeartsAnimation();
    setTimeout(function () {
        hubPage.classList.add("active");
    }, 100);
}

function transitionToLanding() {
    showScreen(landingPage);
    if (window.startHeartsAnimation) window.startHeartsAnimation();
    passwordInput.focus();
}

function transitionHubToValentine() {
    showScreen(valentinePage);
}
function transitionValentineToHub() {
    showScreen(hubPage);
}

function transitionHubToMood() {
    showScreen(moodPage);
}
function transitionMoodToHub() {
    showScreen(hubPage);
}
function transitionMoodToKateChoice() {
    showScreen(kateChoicePage);
}
function transitionKateChoiceToMood() {
    showScreen(moodPage);
}
function transitionKateChoiceToChat() {
    chatHistory = [];
    sessionId = generateSessionId();
    headerBotAvatar.src = "/static/images/" + selectedBotAvatar + ".png";
    headerBotAvatar.style.display = "";
    headerBotFallback.style.display = "none";
    headerBotFallback.textContent = AVATAR_FALLBACK[selectedBotAvatar] || "K";
    headerBotAvatar.onerror = function () {
        this.style.display = "none";
        headerBotFallback.textContent = AVATAR_FALLBACK[selectedBotAvatar] || "K";
        headerBotFallback.style.display = "flex";
    };
    headerBotName.textContent = AVATAR_LABELS[selectedBotAvatar] || "Kate";
    showScreen(chatPage);
    chatInput.focus();
}

function transitionHubToLava() {
    showScreen(lavaPage);
    var video = document.getElementById("lava-video");
    if (video) {
        video.play().catch(function () {});
    }
}
function transitionLavaToHub() {
    showScreen(hubPage);
    var video = document.getElementById("lava-video");
    if (video) video.pause();
}

function transitionChatToHub() {
    showScreen(hubPage);
}

/* ----------------------------------------
   Message Rendering (uses selectedUserAvatar / selectedBotAvatar)
   ---------------------------------------- */
function appendMessage(sender, text) {
    var isBot = sender === "bot";
    var avatarId = isBot ? selectedBotAvatar : selectedUserAvatar;
    var fallbackChar = AVATAR_FALLBACK[avatarId] || (isBot ? "K" : "H");

    var row = document.createElement("div");
    row.className = "message-row " + (isBot ? "kate" : "harry");

    var avatar = document.createElement("img");
    avatar.className = "avatar";
    avatar.src = "/static/images/" + avatarId + ".png";
    avatar.alt = avatarId;
    avatar.onerror = function () {
        this.style.display = "none";
        var fallback = document.createElement("div");
        fallback.className = "avatar-fallback " + (isBot ? "kate" : "harry");
        fallback.textContent = fallbackChar;
        if (isBot) {
            row.insertBefore(fallback, row.firstChild);
        } else {
            row.appendChild(fallback);
        }
    };

    var bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.textContent = text;

    if (isBot) {
        row.appendChild(avatar);
        row.appendChild(bubble);
    } else {
        row.appendChild(bubble);
        row.appendChild(avatar);
    }

    chatMessages.appendChild(row);
    scrollToBottom();
}

function appendError(text) {
    const row = document.createElement("div");
    row.className = "message-row error";

    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.textContent = text;
    row.appendChild(bubble);

    chatMessages.appendChild(row);
    scrollToBottom();
}

/* ----------------------------------------
   Task Done Button (Boss Mode)
   ---------------------------------------- */
function appendTaskDoneButton(taskId) {
    var row = document.createElement("div");
    row.className = "message-row task-action";
    row.style.justifyContent = "center";
    row.style.maxWidth = "100%";
    row.style.alignSelf = "center";

    var btn = document.createElement("button");
    btn.className = "chip task-done-btn";
    btn.textContent = "Mark done ✅";
    btn.addEventListener("click", async function () {
        btn.disabled = true;
        btn.textContent = "Marking...";
        try {
            await fetch("/api/tasks/" + taskId + "/complete", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
            });
            btn.textContent = "Done! 🎉";
            btn.style.background = "#4CAF50";
            btn.style.color = "white";
            btn.style.borderColor = "#4CAF50";
        } catch (err) {
            btn.textContent = "Error — try again";
            btn.disabled = false;
        }
    });

    row.appendChild(btn);
    chatMessages.appendChild(row);
    scrollToBottom();
}

/* ----------------------------------------
   Typing Indicator
   ---------------------------------------- */
function showTypingIndicator() {
    var row = document.createElement("div");
    row.className = "message-row kate";
    row.id = "typing-row";

    var avatar = document.createElement("img");
    avatar.className = "avatar";
    avatar.src = "/static/images/" + selectedBotAvatar + ".png";
    avatar.alt = selectedBotAvatar;
    avatar.onerror = function () {
        this.style.display = "none";
        var fallback = document.createElement("div");
        fallback.className = "avatar-fallback kate";
        fallback.textContent = AVATAR_FALLBACK[selectedBotAvatar] || "K";
        row.insertBefore(fallback, row.firstChild);
    };

    var indicator = document.createElement("div");
    indicator.className = "typing-indicator";
    indicator.innerHTML = "<span></span><span></span><span></span>";

    row.appendChild(avatar);
    row.appendChild(indicator);
    chatMessages.appendChild(row);
    scrollToBottom();
}

function hideTypingIndicator() {
    const row = document.getElementById("typing-row");
    if (row) row.remove();
}

/* ----------------------------------------
   Scroll
   ---------------------------------------- */
function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

/* ----------------------------------------
   Send Message
   ---------------------------------------- */
async function sendMessage(text) {
    text = text.trim();
    if (!text || isSending) return;

    isSending = true;
    sendBtn.disabled = true;

    // Show a friendly label in the chat bubble for special prompts
    var DISPLAY_LABELS = {
        "suggest_horse_meal": "Suggest a horse meal 🐴",
        "be_my_boss": "Be my boss 👨🏻‍💻",
    };
    var displayText = DISPLAY_LABELS[text] || text;

    // Show Harry's message
    appendMessage("user", displayText);
    chatInput.value = "";

    // Show typing indicator
    showTypingIndicator();

    // Build history to send (all previous turns, NOT the current one)
    const historyToSend = chatHistory.slice();

    // Add current message to local history
    chatHistory.push({ role: "user", content: text });

    try {
        const response = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                message: text,
                history: historyToSend,
                session_id: sessionId,
                display_label: displayText !== text ? displayText : undefined,
                chat_user: chatUser,
            }),
        });

        const data = await response.json();

        hideTypingIndicator();

        if (!response.ok) {
            appendError(data.error || "Something went wrong. Try again.");
            chatHistory.pop();
        } else {
            appendMessage("bot", data.reply);
            chatHistory.push({ role: "assistant", content: data.reply });

            // If a boss task was assigned, show a "Mark done" button
            if (data.active_task_id) {
                appendTaskDoneButton(data.active_task_id);
            }
        }
    } catch (err) {
        hideTypingIndicator();
        appendError("Network error. Make sure the server is running.");
        chatHistory.pop();
    }

    isSending = false;
    sendBtn.disabled = false;
    chatInput.focus();
}

/* ----------------------------------------
   Event Listeners
   ---------------------------------------- */

// Landing page
startBtn.addEventListener("click", transitionToHub);
passwordInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") transitionToHub();
});
passwordInput.addEventListener("input", function () {
    passwordError.textContent = "";
});

// Hub
document.getElementById("hub-back-btn").addEventListener("click", transitionToLanding);
document.getElementById("hub-valentine").addEventListener("click", transitionHubToValentine);
document.getElementById("hub-kate").addEventListener("click", transitionHubToMood);
document.getElementById("hub-lava").addEventListener("click", transitionHubToLava);

// Valentine page
document.getElementById("valentine-back-btn").addEventListener("click", transitionValentineToHub);

// Mood (user avatar) selection
document.getElementById("mood-back-btn").addEventListener("click", transitionMoodToHub);
document.querySelectorAll("#mood-page .avatar-option[data-role='user']").forEach(function (btn) {
    btn.addEventListener("click", function () {
        selectedUserAvatar = this.dataset.avatar;
        transitionMoodToKateChoice();
    });
});

// Kate (bot avatar) selection
document.getElementById("kate-choice-back-btn").addEventListener("click", transitionKateChoiceToMood);
document.querySelectorAll("#kate-choice-page .avatar-option[data-role='bot']").forEach(function (btn) {
    btn.addEventListener("click", function () {
        selectedBotAvatar = this.dataset.avatar;
        transitionKateChoiceToChat();
    });
});

// Lava page
document.getElementById("lava-back-btn").addEventListener("click", transitionLavaToHub);

// Chat back -> hub
backBtn.addEventListener("click", transitionChatToHub);

// Send message
sendBtn.addEventListener("click", function () {
    sendMessage(chatInput.value);
});

chatInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage(chatInput.value);
    }
});

// Prompt chips
document.querySelectorAll(".chip").forEach(function (chip) {
    chip.addEventListener("click", function () {
        sendMessage(this.dataset.prompt);
    });
});
