"""
Load messages.json into a ChromaDB collection, chunked into conversation segments.
Messages within 30 minutes of each other are grouped into a single chunk.
"""
import json
import chromadb
from datetime import datetime

MESSAGES_PATH = "messages.json"
CHROMA_DIR = "chroma_db"
COLLECTION_NAME = "valentine_messages"
# Group messages within this many minutes into one conversation chunk
GAP_MINUTES = 30


def load_messages():
    with open(MESSAGES_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def chunk_into_conversations(messages):
    """Group messages into conversation chunks based on time gaps."""
    chunks = []
    current_chunk = []
    last_time = None

    for msg in messages:
        ts = msg.get("timestamp")
        if not ts:
            continue

        msg_time = datetime.fromisoformat(ts)

        if last_time and (msg_time - last_time).total_seconds() > GAP_MINUTES * 60:
            if current_chunk:
                chunks.append(current_chunk)
            current_chunk = []

        current_chunk.append(msg)
        last_time = msg_time

    if current_chunk:
        chunks.append(current_chunk)

    return chunks


def format_chunk(chunk):
    """Format a conversation chunk into readable text."""
    lines = []
    for msg in chunk:
        sender = msg["sender"]  # "Kate" or "Harry"
        lines.append(f"{sender}: {msg['text']}")
    return "\n".join(lines)


def main():
    messages = load_messages()
    print(f"Loaded {len(messages)} messages")

    chunks = chunk_into_conversations(messages)
    print(f"Grouped into {len(chunks)} conversation chunks")

    client = chromadb.PersistentClient(path=CHROMA_DIR)

    # Delete existing collection if present so we can rebuild cleanly
    try:
        client.delete_collection(COLLECTION_NAME)
    except Exception:
        pass

    collection = client.create_collection(
        name=COLLECTION_NAME,
        metadata={"hnsw:space": "cosine"},
    )

    # ChromaDB has a batch limit, so add in batches of 100
    batch_size = 100
    total = 0

    for i in range(0, len(chunks), batch_size):
        batch = chunks[i : i + batch_size]
        ids = []
        documents = []
        metadatas = []

        for j, chunk in enumerate(batch):
            idx = i + j
            doc_text = format_chunk(chunk)
            start_ts = chunk[0].get("timestamp", "")
            end_ts = chunk[-1].get("timestamp", "")

            ids.append(f"conv_{idx}")
            documents.append(doc_text)
            metadatas.append({
                "start_time": start_ts,
                "end_time": end_ts,
                "message_count": len(chunk),
            })

        collection.add(ids=ids, documents=documents, metadatas=metadatas)
        total += len(batch)

    print(f"Indexed {total} conversation chunks into ChromaDB at ./{CHROMA_DIR}/")


if __name__ == "__main__":
    main()
