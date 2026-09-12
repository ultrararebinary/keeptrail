# Keeptrail

## Approved brand direction · September 2026

Approved identity for the Keeptrail MVP. This is a design and messaging specification, not a claim that the product has shipped. English is the public language. The implementation contract in docs/MVP_AGENT_PROMPT.md controls concrete MVP decisions. Domain and trademark clearance have not been performed.

## 1. Brand foundation

**Name:** Keeptrail

**Pronunciation:** keep-trayl

**Tagline:** Find your way back.

**Category descriptor:** A local library for your online discoveries.

**Mission:** Make saved discoveries useful again.

**Vision:** A personal collection where ideas remain findable, connected, and grounded in their sources.

**Personality:** Curious. Grounded. Clear.

The name combines keeping something valuable with the trail that leads back to it. It accommodates websites, videos, images, notes, and agent access without binding the identity to one platform or model provider. Its tradeoff is a possible outdoor-navigation association, so pair it with the category descriptor at first contact.

Alternatives considered: Findrail emphasizes retrieval and the transit-map interface but ties the brand more tightly to one visual metaphor. Savedway emphasizes returning to saved material but is less natural in spoken English. Keeptrail is the selected product name. The alternatives are historical context only.

## 2. Audience and positioning

Start with designers and independent builders who save useful videos and visual references across social platforms, then struggle to retrieve a specific resource. Secondary audiences include researchers, students, and developers who want agents to search their personal collections.

**Primary job:** “Help me find the website or idea I remember seeing, even when I cannot remember its name.”

**Secondary job:** “Let me explore what my discoveries have in common.”

**Developer job:** “Give my agent relevant source passages without making it reprocess every original video.”

**Positioning statement:** For curious people who save useful things across the web, Keeptrail is a local discovery library that turns saved links into searchable notes, useful captures, and connections back to the source.

Lead with retrieval. Demonstrate exploration next. Explain AI and infrastructure after the outcome is understood.

## 3. Message system

**Primary headline:** Find your way back.

**Supporting copy:** Turn saved videos, links, and images into a searchable library of notes, captures, and connected ideas.

**Product demonstration hook:** That typography site from a video last week? Find it again.

**Three pillars:**

- **Find the detail.** Search for the idea, website, or phrase you remember.
- **Follow the source.** Open the capture or timestamp behind a note.
- **Explore the connections.** Move between related topics and discoveries.

**Technical supporting line, once implemented:** Local storage. Local transcription. Cloud analysis through OmniRoute.

**Agent supporting line, once implemented:** Let your coding agent search your library and retrieve the passages it needs.

**Short repository description:** A local discovery library that turns saved videos, links, and images into searchable notes and visual connections.

**About copy:** Keeptrail helps you return to the useful things you find online. Save a link, keep the important details, and follow the connections between your discoveries. Search when you know what you need. Explore when you do not.

## 4. Voice and English conventions

Sound like a helpful, precise companion. Use plain international English, sentence case, short sentences, and familiar verbs. Use “you” and “your” naturally. Avoid idioms that require cultural knowledge, exaggerated intelligence claims, guilt about unread content, and productivity pressure.

Use: save, find, explore, source, capture, topic, note, connection.

Avoid in primary product copy: second brain, unlock your potential, AI magic, supercharge, knowledge orchestration, neural memory, never forget anything.

Use the navigation labels **Search**, **Explore**, **Topics**, **Collections**, **Processing**, and **Settings**. Use **Add a link** for capture. Keep **Topics** as broad subject groups and **Tags** as flexible labels. Do not call ordinary entries “stations” or make users learn railway terminology to use the product.

Keep original source titles and quotations in their original languages. An English interface does not imply translating the user's entire collection. Clearly label any translated material.

## 5. Visual identity

The approved direction combines Index's search layout with Parcours' dark environment and transit-map structure. Think of a quiet personal reference desk: focused retrieval with room to wander.

### Palette

| Token | Color | Role |
| --- | --- | --- |
| Canvas | #202220 | Warm graphite background |
| Surface | #2A2D2A | Panels and selected reading areas |
| Text | #F2EFE7 | Main text, soft ivory |
| Secondary text | #B8BDB5 | Metadata and secondary labels |
| Accent | #F08D7E | Primary action and current selection |
| Topic sage | #A8C5AD | Topic route |
| Topic ochre | #DFC17B | Topic route |
| Topic lilac | #B9AFD7 | Topic route |

Use graphite text on filled coral buttons. Topic colors always have text labels or distinct markers. A coral route must not be the only signal that an item is selected; add a selection ring, weight, or label. Error states require explicit text and an icon, not just a red tint. Final component combinations need contrast verification.

### Typography

Use a system sans-serif stack for the application: readable, economical, and native-feeling on the Mac. Use a modest 14–16 px body range, 12–13 px metadata, and 20–28 px panel or page titles. Use tabular figures for timestamps and storage amounts. Reserve a distinctive custom wordmark for brand assets; do not depend on decorative fonts for navigation. A later display-font choice should support the wordmark without adding unnecessary runtime font loads.

### Logo direction

Explore a compact symbol with two paths meeting at one hollow node. It represents a discovery and the route back to it. The wordmark reads **Keeptrail**, with a capital K and lowercase remaining letters. Test the symbol at favicon size and in one color. Preserve generous clear space. Avoid brains, sparkles, generic chain links, railway vehicles, and elaborate miniature graphs.

This is a logo brief, not a completed or approved logo.

### Graphic language

Thin paths, deliberate junctions, source thumbnails, and calm panel boundaries. In marketing, a line can connect a saved video to a website and a note. In the product, every visible connection must describe an actual relationship or be explicitly marked as suggested.

Avoid decorative graphs without meaning, constant drifting nodes, animated backgrounds, and blurred glass panels. Preserve stable map positions. Respect reduced motion. Do not make image color palettes or user content conform artificially to the brand palette.

## 6. Product expression

**Search** is the default working view: filters, ranked results, and a source-aware detail panel. **Explore** is the discovery view: topics become routes, shared entries become intersections, and a selected entry opens in a lower information panel. A shared toolbar keeps the search field and Add a link action available.

Preserve selection, filters, and position when switching views. Support keyboard operation and a list equivalent to the map. All essential actions must remain available without precise dragging or color recognition.

The first successful experience should show a recognizable detail extracted from the user's own link, accompanied by its source. The emotionally satisfying moment is “That's the thing I was looking for.”

### Microcopy examples

| State | Copy |
| --- | --- |
| Search placeholder | Search what you remember… |
| Empty library | Start with something worth finding again. |
| Import helper | Paste a video or website link. |
| Queue | Saved. Waiting to process. |
| Transcription | Transcribing on your device… |
| Analysis | Finding useful details… |
| Completion | Ready. 3 websites found. |
| Source action | View source |
| Map action | Explore connections |
| Inferred connection | Suggested connection |
| Uncertain extraction | Website name needs checking. |
| Quota reached | Analysis paused. Your free provider limit was reached. |
| Download failure | We couldn't download this video. Try again or import the file. |
| Delete video explanation | Your notes, transcript, and captures will stay. |

Counts and statuses must reflect actual results. Never present a guessed website as verified.

## 7. Behavioral strategy

These are design hypotheses informed by marketing psychology, to validate with users rather than treat as guaranteed conversion effects.

| Principle | Application | Evidence to seek |
| --- | --- | --- |
| Jobs to Be Done | Open with a familiar retrieval problem, then show its resolution. | New users can explain the product without naming the AI stack. |
| Recognition and cognitive ease | Show thumbnails, source names, and timestamps beside results. | Users identify the correct saved resource in a retrieval task. |
| Activation energy | Make pasting one link the first action after necessary setup. | Users complete a first import without help. |
| Progressive disclosure | Keep model configuration and advanced filters out of the main task flow. | Users retrieve items without opening settings. |
| Ownership | Let users correct tags, write notes, and export their collection. | Corrections persist and exports remain useful outside the app. |
| Peak-end experience | Finish processing with useful extracted details and their evidence. | Users can immediately use a discovered resource. |

No streaks, fake scarcity, obligatory sharing, anxiety-based reminders, or locked exports. Ask for a GitHub star unobtrusively after value has been demonstrated, never as a requirement. Measure useful retrieval rather than time spent in the app. Initially use observed usability sessions or optional local counters, not undisclosed telemetry.

## 8. GitHub presence and launch

Use Keeptrail consistently in the repository title, screenshots, documentation, and release notes once the name is accepted. Repository: https://github.com/ultrararebinary/keeptrail.

Recommended README order:

1. Wordmark, category descriptor, and concise description.
2. A real capture → extract → search → source demonstration.
3. Search and Explore screenshots with English UI and alt text.
4. Current implementation status, clearly separating available and planned features.
5. Installation and prerequisites, with a tested path.
6. Supported sources and known download limitations.
7. Data flow: what stays local and what is sent to providers.
8. Free-provider setup, quotas, and recovery behavior.
9. Agent integration, when implemented.
10. Roadmap, contribution guide, license, and acknowledgments.

The hero action should be **Get started**, with **Watch the demo** secondary. GitHub source access should stay obvious. Publish release badges and platform-support claims only when they reflect real releases and tests. Until implementation exists, describe the repository as a project in development.

Launch story: show a saved design video, the website extracted from it, a natural-language search that finds it, and its place on the map. Use permission-appropriate demonstration content. Avoid follower-count claims, invented testimonials, fabricated speed figures, or unsupported memory benchmarks.

## 9. Trust and claim boundaries

Repository-authored code and documentation use the MIT license. Dependencies and models retain their own licenses.

Say **local storage**, not **everything stays on your device**. Whisper transcription is intended to run locally, while selected text and captures go to configured cloud providers for analysis. Their account requirements, retention policies, and quotas are provider-specific.

Say **designed to work with free provider tiers**, not **unlimited free AI**. The planned product must never silently switch to paid inference.

Say **retrieve relevant passages for your agent**, not **guaranteed token savings**. Savings depend on usage and must be measured before publishing figures.

Treat MacBook Air M1 with 8 GB as the development target, not a verified support badge. Test realistic imports and library navigation before making performance promises. Clearly document that some social-video downloads fail and that deleting a local video can leave the original source unavailable later.

## 10. Brand asset roadmap

After name approval: create a wordmark and monochrome symbol, favicon, GitHub social preview, English Search and Explore mockups, and a small reusable release graphic. Use one coherent identity across these assets.

Acceptance criteria: recognizable in monochrome; readable at small sizes; useful on graphite and ivory; English labels understandable without railway jargon; source evidence visible in product demonstrations; no claims beyond delivered behavior.

**Keeptrail / Find your way back.** is the selected identity. Implement assets around it without reopening the approved Search + Explore structure.
