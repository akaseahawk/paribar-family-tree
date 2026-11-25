// node scripts/export-prompt.js → docs/ai-prompt.md (keeps the doc in sync with the in-app prompt)
global.window = global; global.FT = {};
require('../js/aiprompt.js');
const fs = require('fs');
const dict = '| Column | Required | What goes in it | Allowed | Example |\n|---|---|---|---|---|\n' +
  FT.ai.FIELDS.map((f) => `| ${f.map((x) => String(x || '').replace(/\|/g, '/')).join(' | ')} |`).join('\n');
const tips = FT.ai.TIPS.map(([t, d]) => `- **${t}.** ${d}`).join('\n');
fs.writeFileSync(require('path').join(__dirname, '../docs/ai-prompt.md'),
`# Paribar AI prompt

Paste this into ChatGPT, Gemini, Claude, Perplexity or any AI chat. Fill in the [brackets] first.
The app's own copy button (Settings › Fill it in with an AI chat) fills them in for you.

## How the conversation goes

\`\`\`mermaid
flowchart TD
  A["Paste the prompt"] --> B["AI asks a few questions"]
  B --> C{"Anything unclear?"}
  C -- yes --> B
  C -- no --> D["Short table per side<br/>you correct it"]
  D --> E["You say done"]
  E --> F["One check: open questions,<br/>placeholders, doubts"]
  F --> G["CSV in one code block<br/>+ Paribar_import.csv"]
  G --> H["Import in Paribar"]
\`\`\`

## Tips

${tips}

## Data dictionary (the CSV the AI hands back)

The prompt includes this same list, so the AI knows exactly what to produce.
The full JSON Schema for app backups is in [schema/paribar-backup.schema.json](../schema/paribar-backup.schema.json).

${dict}

## The prompt

\`\`\`text
${FT.ai.prompt()}
\`\`\`
`);
console.log('docs/ai-prompt.md written');
