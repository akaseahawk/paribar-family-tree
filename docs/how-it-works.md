# How it works

Paribar is plain HTML, CSS and JavaScript. No framework, no build step for the app, and no backend.

## The pieces

```mermaid
flowchart TD
  UI["app.js<br/>screens and forms"] --> K["kinship.js<br/>paths and words"]
  K --> C["cultures.js<br/>18 heritages"]
  UI --> M["mindmap.js<br/>maps, D3"]
  M --> F["family.js<br/>generations"]
  F --> K
  UI --> IO["io.js<br/>import, export"]
  UI --> DB["db.js<br/>IndexedDB"]
```

themes, aiprompt, checks, dupes, visits, dates, speak, treeimage and demo are helpers that app.js calls.

| File | Job |
|---|---|
| `js/app.js` | Screens, forms, placing imported people, export |
| `js/kinship.js` | Finds the path from you to anyone and picks the word for it |
| `js/cultures.js` | Family words for 18 heritages, with an English fallback that handles "second cousin once removed" |
| `js/family.js` | Couples, generations, separation, tree layout |
| `js/mindmap.js` | The Separation map and Generations tree |
| `js/io.js` | Reads CSV, JSON, Excel (.xlsx), ZIP and contacts; writes JSON, CSV, ZIP and .vcf; cleans every imported value |
| `js/demo.js` | The made-up sample family |
| `js/db.js` | Storage in the phone's browser |
| `js/themes.js` | The ten heritage looks |
| `js/aiprompt.js` | The AI prompt and the shared data dictionary |
| `js/checks.js`, `js/dupes.js` | Needs attention, duplicate finder and merge |
| `js/visits.js`, `js/dates.js` | Visit log, birthdays and anniversaries |
| `js/speak.js`, `js/treeimage.js` | Read a word aloud; save the map as a picture |
| `sw.js` | Offline support |

## How a family word is chosen

```mermaid
flowchart TD
  A["Pick a person"] --> B["Shortest family path<br/>from you<br/>e.g. mother › sister › son"]
  B --> C{"Language menu<br/>set?"}
  C -- yes --> L["Use that heritage"]
  C -- no --> D{"Person has their<br/>own heritage?"}
  D -- yes --> P["Use theirs"]
  D -- no --> S["Use the side's heritage<br/>mother's, father's,<br/>in-laws' or yours"]
  L --> T{"Word in that<br/>heritage's table?"}
  P --> T
  S --> T
  T -- yes --> W["Show it<br/>e.g. মাসতুতো ভাই"]
  T -- no --> E["English fallback<br/>e.g. Second cousin"]
```

- Older or younger matters in many languages (Jethu vs Kaku, 伯父 vs 叔叔). Paribar uses birth dates or years when it has them.
- When a gender is unknown, it shows both words, like "Mamato Bhai / Mamato Bon".
- Mixed families: the person card also shows what the other side of the family would call them.
- Your own word for someone (called_term) is shown when the Language menu is off.
- Before the English fallback, each heritage also tries its general rules, and with an unknown gender it tries both forms.
- Friends take their own route ("Colleague", "Priya's husband"). Family links always win over friend links.

## Filling in missing steps

When an import says `relation_to_me = mother's sister's son` but your aunt isn't in the file, Paribar adds a placeholder for her, so the cousin still connects.

```mermaid
flowchart TD
  Me["You"] --> Mo["Mother<br/>already in the tree"]
  Mo --> Au["Unknown (Mashi)<br/>placeholder, add details"]
  Au --> Co["Cousin<br/>from the file"]
```

## Import

```mermaid
flowchart TD
  F["File or pasted text<br/>CSV · JSON · Excel · ZIP · VCF"] --> R["io.js reads it<br/>lenient column names"]
  R --> V["Clean every value<br/>safe ids, real images only"]
  V --> M{"Replace or merge?"}
  M --> P["Place each person<br/>mother/father/spouse links<br/>or relation_to_me chain"]
  P --> H["Add placeholders only<br/>where a link needs one"]
  H --> D["Check for duplicates"]
  D --> S["Save all at once"]
  S --> Rep["Show the import report"]
```

## Updates and offline

```mermaid
sequenceDiagram
  participant Phone
  participant SW as sw.js
  participant Site as GitHub Pages
  Phone->>SW: Open the app
  alt online
    SW->>Site: Fetch the newest files
    Site-->>SW: Files
    SW-->>Phone: Newest version, cached for later
  else offline
    SW-->>Phone: Last cached version
  end
```

Every CSS and JS link in index.html carries `?v=209`, and sw.js uses a matching cache name (`paribar-v209`) and drops older `paribar-v*` caches. So a phone never mixes old and new files after an update. Fonts are cache-first. The Android share target (sharing a contact to Paribar) is also handled in sw.js.
