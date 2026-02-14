import os
import json
import random
from datetime import datetime, timezone
from flask import Flask, render_template, request, jsonify
import chromadb
import anthropic

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = Flask(__name__)

CHROMA_DIR = os.path.join(BASE_DIR, "chroma_db")
COLLECTION_NAME = "valentine_messages"
TASKS_FILE = os.path.join(BASE_DIR, "tasks.json")
CHAT_LOGS_DIR = os.path.join(BASE_DIR, "chat_logs")
NUM_RESULTS = 10
APP_PASSWORD = "dlt4me"
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

SYSTEM_PROMPT = """You are Kate — Harry's AI girlfriend. You will be given excerpts from \
Kate and Harry's real text conversations. Your job is to respond ONLY in Kate's voice.

CRITICAL: In the conversation excerpts, lines starting with "Kate:" are YOUR voice. \
Lines starting with "Harry:" are the user talking to you. Study ONLY the "Kate:" lines \
to learn how to respond. Pay close attention to:
- Kate's exact texting style: her capitalization, abbreviations, punctuation habits
- Kate's sentence length and how she structures messages
- Kate's humor, warmth, and personality
- Kate's emoji and slang usage
- How Kate responds to different topics and moods

Do NOT mimic Harry's texting style. Harry's lines are only there for conversational context.

Rules:
- Always respond as Kate, never break character
- Keep responses concise like Kate's real texts — not long paragraphs
- Reference real memories and inside jokes when relevant
- Be warm and affectionate but authentic to how Kate actually texts
- If you don't have context for something, improvise in Kate's voice

Happy Valentine's Day!"""

# ============================================================
# Prompt-specific instructions
# These get injected into the prompt when a special chip is used
# ============================================================

HORSE_MEAL_INSTRUCTIONS = """\
<special_instructions>
HORSE MEAL MODE! Kate and Harry have a running joke that Harry eats "horse meals" — \
things like bran flakes, apples, carrots, oats, hay-adjacent foods. Your job is to \
suggest a horse meal for Harry in Kate's voice.

Guidelines:
- Suggest foods that are hilariously horse-like: bran flakes, whole apples, raw carrots, \
oat buckets, alfalfa smoothies, sugar cubes, etc.
- Mix in some that are borderline normal (overnight oats, apple slices with PB) alongside \
absurd ones (a salt lick, a bag of timothy hay, a horse supplement pellet)
- Occasionally (maybe 1 in 3 times), ask Harry how horse-y he's feeling today. If the \
conversation history shows he said he's feeling very horse-y, go full horse: suggest \
actual horse treats like salt licks, beet pulp, specialty horse feed, mineral blocks, etc.
- Keep it funny and in Kate's voice — she finds this hilarious
- Be creative, don't repeat the same suggestions
</special_instructions>
"""

BOSS_TASK_INSTRUCTIONS_TEMPLATE = """\
<special_instructions>
BOSS MODE! Kate is assigning Harry a task from her real to-do list. She's his boss now.

The task to assign is:
"{task}"

Guidelines:
- Assign this task to Harry in Kate's voice — playful but authoritative
- Act like a fun but demanding boss — "I need this done" energy
- You can add a deadline if it feels natural (like "by end of week" or "before our next call")
- Make it clear this is a REAL task you actually need done, not a joke
- Be encouraging but firm — Harry loves being useful and you know it
- Keep it concise like Kate's texting style
- If Harry says he's done or finished with something, congratulate him enthusiastically \
and tell him to hit the "Be my boss" button again for his next assignment
</special_instructions>
"""

BOSS_ALL_DONE_INSTRUCTIONS = """\
<special_instructions>
BOSS MODE — but all tasks are complete! Every single item on Kate's to-do list has been \
handled. Respond as Kate being genuinely impressed and grateful. Tell Harry he's crushed \
it, he's the best, maybe give him a raise (in love). Keep it in Kate's voice.
</special_instructions>
"""

# Initialize ChromaDB once at module level
chroma_client = chromadb.PersistentClient(path=CHROMA_DIR)
collection = chroma_client.get_collection(name=COLLECTION_NAME)


# ============================================================
# Task management helpers
# ============================================================

def load_tasks():
    try:
        with open(TASKS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def save_tasks(tasks):
    with open(TASKS_FILE, "w", encoding="utf-8") as f:
        json.dump(tasks, f, indent=2, ensure_ascii=False)


def get_next_incomplete_task():
    """Pick a random incomplete task."""
    tasks = load_tasks()
    incomplete = [t for t in tasks if not t.get("completed", False)]
    if not incomplete:
        return None
    return random.choice(incomplete)


def mark_task_completed(task_id):
    tasks = load_tasks()
    for t in tasks:
        if t["id"] == task_id:
            t["completed"] = True
            break
    save_tasks(tasks)


# ============================================================
# Chat logging
# ============================================================

# Ensure chat_logs directory exists
os.makedirs(CHAT_LOGS_DIR, exist_ok=True)


def log_exchange(session_id, user_message, bot_reply, display_label=None):
    """Append a user/bot exchange to the session's log file."""
    log_file = os.path.join(CHAT_LOGS_DIR, session_id + ".json")

    # Load existing log or start fresh
    if os.path.exists(log_file):
        with open(log_file, "r", encoding="utf-8") as f:
            log = json.load(f)
    else:
        log = {"session_id": session_id, "started": datetime.now(timezone.utc).isoformat(), "messages": []}

    timestamp = datetime.now(timezone.utc).isoformat()

    log["messages"].append({
        "timestamp": timestamp,
        "role": "user",
        "text": display_label or user_message,
    })
    log["messages"].append({
        "timestamp": timestamp,
        "role": "assistant",
        "text": bot_reply,
    })

    with open(log_file, "w", encoding="utf-8") as f:
        json.dump(log, f, indent=2, ensure_ascii=False)


# ============================================================
# Prompt-specific detection
# ============================================================

# Maps chip data-prompt values to special instructions
SPECIAL_PROMPTS = {
    "suggest_horse_meal": "horse_meal",
    "be_my_boss": "boss",
}


def get_special_instructions(message):
    """Check if the message is a special prompt and return extra instructions."""
    prompt_type = SPECIAL_PROMPTS.get(message)

    if prompt_type == "horse_meal":
        return HORSE_MEAL_INSTRUCTIONS

    if prompt_type == "boss":
        task = get_next_incomplete_task()
        if task:
            return BOSS_TASK_INSTRUCTIONS_TEMPLATE.format(task=task["task"]), task["id"]
        else:
            return BOSS_ALL_DONE_INSTRUCTIONS, None

    return None


# ============================================================
# RAG helpers
# ============================================================

def retrieve_context(query):
    results = collection.query(query_texts=[query], n_results=NUM_RESULTS)
    return results["documents"][0] if results["documents"] else []


def extract_kate_lines(doc):
    """Pull out only Kate's lines from a conversation chunk."""
    return "\n".join(
        line for line in doc.splitlines() if line.startswith("Kate:")
    )


def build_prompt(user_message, context_docs, special_instructions=""):
    context_block = "\n\n---\n\n".join(context_docs)
    kate_lines = "\n".join(
        extract_kate_lines(doc) for doc in context_docs
    ).strip()

    prompt = (
        "Here are relevant excerpts from Kate and Harry's text conversations "
        "(for understanding what was being discussed):\n\n"
        "<conversations>\n"
        f"{context_block}\n"
        "</conversations>\n\n"
        "Here are ONLY Kate's messages extracted from those conversations. THIS is the voice "
        "and style you must match exactly:\n\n"
        "<kate_style_reference>\n"
        f"{kate_lines}\n"
        "</kate_style_reference>\n\n"
    )

    if special_instructions:
        prompt += special_instructions + "\n\n"

    prompt += f"Harry just texted you: {user_message}\n\nRespond as Kate:"
    return prompt


# ============================================================
# Routes
# ============================================================

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/verify-password", methods=["POST"])
def verify_password():
    data = request.get_json()
    password = data.get("password", "").strip() if data else ""
    if password == APP_PASSWORD:
        return jsonify({"valid": True})
    return jsonify({"valid": False, "error": "Wrong password. Try again!"}), 401


@app.route("/api/tasks", methods=["GET"])
def get_tasks():
    """Return all tasks and their completion status."""
    tasks = load_tasks()
    return jsonify({"tasks": tasks})


@app.route("/api/tasks/<int:task_id>/complete", methods=["POST"])
def complete_task(task_id):
    """Mark a task as completed."""
    mark_task_completed(task_id)
    return jsonify({"success": True})


@app.route("/api/chat", methods=["POST"])
def chat():
    data = request.get_json()
    if not data:
        return jsonify({"error": "No JSON data provided"}), 400

    message = data.get("message", "").strip()
    history = data.get("history", [])
    session_id = data.get("session_id", "")
    display_label = data.get("display_label")

    if not message:
        return jsonify({"error": "No message provided"}), 400

    if not ANTHROPIC_API_KEY:
        return jsonify({"error": "API key not configured on the server."}), 500

    try:
        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

        # Check for special prompt instructions
        special_result = get_special_instructions(message)
        special_instructions = ""
        active_task_id = None

        if special_result is not None:
            if isinstance(special_result, tuple):
                special_instructions, active_task_id = special_result
            else:
                special_instructions = special_result

        # For special prompts, use a more relevant RAG query
        rag_query = message
        if message == "suggest_horse_meal":
            rag_query = "horse meal food eating carrots apples bran"
        elif message == "be_my_boss":
            rag_query = "task help do something for me favor"

        # RAG retrieval
        context_docs = retrieve_context(rag_query)

        # Build augmented prompt
        augmented_prompt = build_prompt(message, context_docs, special_instructions)

        # Build message history for API
        api_messages = []
        for msg in history:
            api_messages.append({"role": msg["role"], "content": msg["content"]})
        api_messages.append({"role": "user", "content": augmented_prompt})

        # Call Anthropic API
        response = client.messages.create(
            model="claude-sonnet-4-5-20250929",
            max_tokens=400,
            system=SYSTEM_PROMPT,
            messages=api_messages,
        )
        reply = response.content[0].text

        # Log the exchange
        if session_id:
            log_exchange(session_id, message, reply, display_label)

        result = {"reply": reply}
        if active_task_id is not None:
            result["active_task_id"] = active_task_id

        return jsonify(result)

    except anthropic.AuthenticationError:
        return jsonify({"error": "Invalid API key. Please check and try again."}), 401
    except anthropic.APIError as e:
        return jsonify({"error": str(e)}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5050))
    app.run(debug=True, host="0.0.0.0", port=port)
