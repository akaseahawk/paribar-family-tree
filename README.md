# Paribar · পরিবার

See how everyone is connected: your whole family, and the friends who are family too, on a **Generations tree** and in **Family circles** around you. Free, offline, and in your family's own words (Mashi, 姨媽, Tía, Bua …), across 24 heritages. Don't see yours? [Let me know](https://github.com/akaseahawk/paribar-family-tree/issues/new?title=Heritage%20request:%20) and I'll add it.

- **Use it:** [akaseahawk.github.io/paribar-family-tree](https://akaseahawk.github.io/paribar-family-tree/)
- **Open the app directly:** [/app/](https://akaseahawk.github.io/paribar-family-tree/app/)
- **Single-file version:** [/download/paribar-standalone.html](https://akaseahawk.github.io/paribar-family-tree/download/paribar-standalone.html)

Every name in this repo is made up. Real family data never goes in this repo.

## Why I built this

I went back to India after 20 years knowing only two relatives, both very elderly, and just their names and phone numbers. So I built Paribar (family in Bengali): it shows how everyone is connected and keeps their details in one place, so next time I can reach out to everyone directly.

```mermaid
flowchart TD
  A["Back after 20 years<br/>knew 2 relatives"] --> B["Built Paribar"]
  B --> C["A few weeks<br/>home to home"]
  C --> D["Showed everyone<br/>how they connect"]
  D --> E["Nieces and nephews<br/>loved it"]
  D --> F["Stories that never<br/>came up before"]
```

- For a few weeks I went home to home, across the family and close friends.
- At every stop I showed everyone how they were all connected. My little nieces and nephews loved it.
- The conversations were the best part: stories that never come up otherwise, like the wild thing a distant uncle once did. He's on the map now.
- Family history still lives in memories, on paper, or in a photo on the wall. Paribar makes it digital, so you can share it with your kids and keep it, in theory, forever.

### How the family got in

```mermaid
flowchart TD
  A["Chicken scratch<br/>on paper"] --> P["Snap a photo"]
  B["Phone in the middle<br/>of the room"] --> M["Hindi, Bengali, English<br/>all mixed together"]
  P --> AI["AI turns it<br/>into data"]
  M --> AI
  AI --> X["CSV file"]
  X --> F["Paribar draws the<br/>tree and circles"]
```

- We drew the family out on paper and snapped a photo, then put a phone in the middle of the room and just talked.
- An AI read the drawing and the conversation and turned them into data. I imported that, and Paribar built the tree and the circles. The AI only saves the typing; you can always add people by hand.
- The family words fill in a lot on their own: a Mashi is your mother's sister, a Jethu your father's older brother.

With the holidays here and families getting together, I hope you get to have these conversations too.

## See it

| Family circles | Generations tree |
|---|---|
| ![Family circles map of the sample family, rings around Ishaan, friends on dashed blue lines](docs/images/map-circles.png) | ![Generations tree of the sample family, one column per generation, friends in their own band](docs/images/map-generations.png) |
| You're in the middle; each ring is one more step away. | One column per generation, couples side by side, friends in their own band. |

<img src="docs/images/people.png" width="360" alt="The People tab with the sample family grouped by side" />

**Friends can be family too.** Add the neighbor who's practically an uncle, Mom's best friend the kids call Auntie, a colleague or a classmate. They appear on both maps, linked through whoever they know, and their families can join too.

```mermaid
flowchart TD
  Me["You"] --- Mom["Mom"]
  Mom -. "best friend" .- P["Priya Auntie"]
  Me -. "neighbor" .- D["Daniel"]
  D --- J["Daniel's mom"]
  Me -. "classmate" .- L["Leo"]
```

## At a glance

```mermaid
mindmap
  root((Paribar))
    See it
      Generations tree
      Family circles
      Trails
    Friends
      Neighbors
      Colleagues
      Their families
    Family words
      24 heritages
      Mixed families
    Keep in touch
      Phones
      Birthdays
      Visits
    Your data
      On your phone
      Backups
```

## Start in four steps

```mermaid
flowchart TD
  A["Open the app<br/>on your phone"] --> B{"Look around first?"}
  B -- yes --> C["Try the sample family<br/>then open Map"]
  C --> D["Start my own family"]
  B -- no --> D
  D --> E["Add your name and<br/>each side's heritage"]
  E --> F{"How to add people?"}
  F --> G["Type them in"]
  F --> H["Import phone contacts"]
  F --> I["AI chat prompt"]
  G --> J["Add to Home screen<br/>works offline"]
  H --> J
  I --> J
```

## Stay in touch

```mermaid
flowchart TD
  P["Someone's card"] --> W["Chat on WhatsApp"]
  P --> C["Call to check in"]
  P --> M["Map: directions<br/>or book a ride"]
  D["Dates tab"] --> B["Send wishes<br/>happy birthday in<br/>their language"]
```

Everyone's phone, WhatsApp, address, birthday and visits live in one place, and one tap texts, calls or opens the map.

## Fill it in with an AI chat (optional)

Typing people in by hand works fine. The AI is a shortcut that turns drawings and conversations into the data file Paribar imports. Paribar does the rest.

The app has a ready-made prompt (Settings › Fill it in with an AI chat). It already includes the data dictionary, so the AI knows exactly which columns to produce.

```mermaid
sequenceDiagram
  autonumber
  participant You
  participant AI as AI chat
  participant App as Paribar
  You->>App: Copy the prompt
  You->>AI: Paste it
  AI->>You: Asks, never guesses
  You->>AI: Answers, photos
  AI->>You: Final check
  You->>AI: OK
  AI->>You: CSV file
  You->>App: Import the CSV
  App->>You: Report of what was added
```

What the AI does for you:
- **Reads a photo of a hand-drawn tree,** even chicken scratch, and turns it into the table.
- **Transcribes a room full of people** talking in any mix of languages.
- **Fills in what family words imply** (Mashi is mother's sister) and asks about the rest.

> **Hot tip: make it a show.** Download the spreadsheet from Paribar (Settings) and give it, with a few family photos, to an AI that makes pictures or video. Ask for a family tree picture or short video in the style of your favorite show, movie or book. Kids love it. Photos you upload go to that company.

Rules the prompt gives the AI:
- **Ask, don't assume.** No guessed names, genders, sides or ages.
- **Placeholders only to connect people,** for example the unnamed mother between you and a cousin, named like `Unknown (Bubai's mother)`.
- **Empty means unknown.** No "N/A" or "?".

The full prompt and data dictionary are in [docs/ai-prompt.md](docs/ai-prompt.md).

## Where your data lives

```mermaid
flowchart TD
  S["GitHub Pages<br/>app code only"] --> A["Paribar app"]
  F["Google Fonts<br/>fonts only"] --> A
  A <--> P["Your phone's browser<br/>IndexedDB"]
  A --> B["Backup files you save<br/>JSON · CSV · ZIP · VCF"]
```

No account and no server storage. Clearing your browser data erases it, so back up now and then. Voice typing uses the browser's speech service, and what you tell an AI chat goes to that company. Details: [docs/privacy.md](docs/privacy.md).

## Docs

| Doc | What's in it |
|---|---|
| [How it works](docs/how-it-works.md) | Modules, how a family word is chosen, import and export |
| [Data model](docs/data-model.md) | People, links, visits, CSV columns |
| [AI prompt](docs/ai-prompt.md) | The prompt, tips and data dictionary |
| [Privacy](docs/privacy.md) | What stays on your phone, what doesn't |
| [Developing](docs/developing.md) | Run it, test it, release it |

## Run it yourself

- **Any static host:** serve the repo root over https. Offline mode and voice need https, or localhost.
- **Local:** `npm start` → http://localhost:3000
- **Single file:** `python3 build-standalone.py` → `dist/paribar-standalone.html`
- **GitHub Pages:** [.github/workflows/pages.yml](.github/workflows/pages.yml) builds the landing page, `/app/` and `/download/` on every push to `main`.

## Author

Made by [akaseahawk](https://github.com/akaseahawk).
