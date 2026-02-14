import sqlite3
import json
import re
from datetime import datetime, timezone

DB_PATH = "chat copy.db"
HANDLE_ID = 2820
OUTPUT_PATH = "messages.json"

# Apple's epoch starts 2001-01-01, vs Unix 1970-01-01
APPLE_EPOCH_OFFSET = 978307200

def extract_text_from_attributed_body(blob):
    """Extract plain text from an NSAttributedString streamtyped blob."""
    # The text sits between 'NSString' class marker and the next section marker.
    # Pattern: NSString + \x01\x94\x84\x01+ + length_byte(s) + UTF-8 text
    # For longer messages, length is encoded differently.

    # Strategy: find the NSString marker, then grab the text that follows.
    marker = b"NSString"
    idx = blob.find(marker)
    if idx == -1:
        return None

    # Skip past: NSString \x01 \x94 \x84 \x01 + <length>
    idx += len(marker)
    # Walk past the fixed header bytes until we hit the '+' marker
    plus_idx = blob.find(b"+", idx, idx + 10)
    if plus_idx == -1:
        return None

    pos = plus_idx + 1

    # Read the length — single byte for short strings, multi-byte for longer ones
    length_byte = blob[pos]
    pos += 1

    if length_byte == 0:
        return ""

    # If high bit is set, it's a multi-byte length (next 2 bytes are little-endian uint16)
    if length_byte & 0x80:
        if pos + 1 >= len(blob):
            return None
        text_len = int.from_bytes(blob[pos : pos + 2], "little")
        pos += 2
    else:
        text_len = length_byte

    text_bytes = blob[pos : pos + text_len]
    try:
        return text_bytes.decode("utf-8")
    except UnicodeDecodeError:
        return text_bytes.decode("utf-8", errors="replace")


def apple_timestamp_to_iso(ts: int) -> str:
    """Convert Apple Core Data nanosecond timestamp to ISO 8601 string."""
    if ts == 0:
        return None
    # Timestamps after ~2017 are in nanoseconds
    if ts > 1_000_000_000_000:
        ts = ts / 1_000_000_000
    unix_ts = ts + APPLE_EPOCH_OFFSET
    return datetime.fromtimestamp(unix_ts, tz=timezone.utc).isoformat()


def main():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    cur.execute(
        """
        SELECT ROWID, text, attributedBody, is_from_me, date
        FROM message
        WHERE handle_id = ?
        ORDER BY date ASC
        """,
        (HANDLE_ID,),
    )

    messages = []
    failed = 0

    for rowid, text, blob, is_from_me, date_val in cur.fetchall():
        # Get text from either the text column or the blob
        msg_text = text
        if not msg_text and blob:
            msg_text = extract_text_from_attributed_body(blob)

        if not msg_text:
            failed += 1
            continue

        messages.append(
            {
                "id": rowid,
                "timestamp": apple_timestamp_to_iso(date_val) if date_val else None,
                "sender": "Kate" if is_from_me else "Harry",
                "text": msg_text,
            }
        )

    conn.close()

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(messages, f, indent=2, ensure_ascii=False)

    print(f"Extracted {len(messages)} messages to {OUTPUT_PATH}")
    if failed:
        print(f"  ({failed} messages had no extractable text — likely images/attachments)")


if __name__ == "__main__":
    main()
