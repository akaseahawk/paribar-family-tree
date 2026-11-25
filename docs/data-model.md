# Data model

Everything is saved in the phone's browser (IndexedDB), in three stores: `people`, `relationships` and `meta`. Visits are saved in `meta` as `visit:<id>` records.

```mermaid
erDiagram
  PERSON ||--o{ RELATIONSHIP : "from"
  PERSON ||--o{ RELATIONSHIP : "to"
  PERSON }o--o{ VISIT : "seen on"
  META ||--|| PERSON : "meId = you"
  PERSON {
    string id
    string name
    string nickname
    string gender "m, f or x"
    string dob "YYYY-MM-DD or year"
    string heritage "optional override"
    string calledTerm "your own word"
    bool placeholder
    string phone
    string email
    bool whatsapp
    string address
    string city
    bool deceased
    string metOn
    string notes
    list photos
  }
  RELATIONSHIP {
    string id
    string type "see Links"
    string from
    string to
    string status "married, separated, widowed"
    string marriedYear
    string marriedOn
    string kind "friends only"
  }
  VISIT {
    string id
    string date "YYYY-MM-DD"
    string place
    list peopleIds
    string notes
    string giftsGiven
    string giftsReceived
    list photos
  }
  META {
    string meId
    object heritage "me, paternal, maternal, inlaw"
    string viewAs "Language menu"
    string theme
    string voiceLang
  }
```

Main fields only. The full list is in [schema/paribar-backup.schema.json](../schema/paribar-backup.schema.json).

## Links

| Type | Means | Notes |
|---|---|---|
| `parent_of` | from = parent, to = child | The backbone of the tree |
| `spouse_of` | either direction | status: married, separated, widowed |
| `sibling_of` | brothers and sisters | Only when their parents aren't in the tree |
| `friend_of` | friends layer | kind: friend, colleague, neighbor, classmate |

Siblings normally come from shared parents. Explicit `sibling_of` links are only for brothers and sisters whose parents aren't in the tree.

## CSV for imports

The AI prompt and the in-app guide use the same data dictionary, kept in `js/aiprompt.js`. See [ai-prompt.md](ai-prompt.md) for the full table.

- Only `name` is required.
- `mother`, `father`, `spouse` and `siblings` must match names in the `name` column exactly. Separate several with `;`.
- `relation_to_me` is a plain-English chain like `mother's sister's son`. The app fills in any missing steps.
- `placeholder` = `yes` marks a stand-in for someone not named yet. The app tags them "add details".
- Dates: MM/DD/YYYY. A year or a decade (1960s) also works.

## Backups

- JSON backups follow [schema/paribar-backup.schema.json](../schema/paribar-backup.schema.json).
- Blank CSV template: [schema/paribar-template.csv](../schema/paribar-template.csv).
- Example backup: [schema/example-import.json](../schema/example-import.json).
