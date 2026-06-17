const chat = document.getElementById("chat");
const form = document.getElementById("chatForm");
const input = document.getElementById("messageInput");
const statusEl = document.getElementById("status");

async function checkHealth() {
  try {
    const response = await fetch("/api/health");
    const data = await response.json();
    statusEl.textContent = data.model;
    statusEl.className = "status online";
  } catch {
    statusEl.textContent = "Offline";
    statusEl.className = "status offline";
  }
}

function addMessage(role, text) {
  const wrapper = document.createElement("div");
  wrapper.className = `message ${role}`;

  const name = document.createElement("strong");
  name.textContent = role === "user" ? "You" : "LlamaChat";

  const content = document.createElement("p");
  content.textContent = text;

  wrapper.appendChild(name);
  wrapper.appendChild(content);
  chat.appendChild(wrapper);
  chat.scrollTop = chat.scrollHeight;

  return wrapper;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const message = input.value.trim();
  if (!message) return;

  input.value = "";
  addMessage("user", message);
  const loadingMessage = addMessage("bot", "Thinking...");

  const button = form.querySelector("button");
  button.disabled = true;

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Request failed.");
    }

    loadingMessage.querySelector("p").textContent = data.answer;
  } catch (error) {
    loadingMessage.querySelector("p").textContent = `Error: ${error.message}`;
  } finally {
    button.disabled = false;
    input.focus();
  }
});

input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

checkHealth();

// TODO for next commit:
// - Load saved chat history on page start.
// - Add a clear history button.
// - Show multiple chat sessions in the sidebar.
