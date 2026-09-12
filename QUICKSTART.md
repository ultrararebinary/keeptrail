# Prepare for the Keeptrail MVP build

The repository is currently a specification, not an installable app. These steps prepare credentials and hand the work to the implementation agent.

## 1. Create one free cloud key

Open [Google AI Studio API keys](https://aistudio.google.com/api-keys), sign in, and create an API key for a new Google project without Cloud Billing enabled. Confirm the project's free-tier status in AI Studio. Do not enable paid billing or use a billing-enabled project for this MVP. Available free quotas depend on the account, model, and region.

Use a **Gemini Developer API key**, not a Vertex AI service-account credential. The fixed model is **gemini-2.5-flash-lite**, which accepts text and images and returns text. One key handles both jobs. No separate image-generation, OpenAI, Anthropic, Hugging Face, or downloader API key is needed.

Keep the key private. Once the agent builds the app, enter it in **Keeptrail → Settings → Setup**. The required implementation will configure its own OmniRoute connection automatically. Never paste the key into GitHub, a prompt, a screenshot, or chat.

Free-tier content handling follows [Google's terms](https://ai.google.dev/gemini-api/terms); selected source text and screenshots leave the machine for analysis. Pricing: [Gemini 2.5 Flash-Lite](https://ai.google.dev/gemini-api/docs/pricing#gemini-2.5-flash-lite). Quotas: [rate limits](https://ai.google.dev/gemini-api/docs/rate-limits).

## 2. Run the implementation agent

Open this repository in your coding agent. Select **GPT 5.6 Luna** and reasoning effort **xhigh** in the host's model controls. Paste the entire contents of [MVP_AGENT_PROMPT.md](docs/MVP_AGENT_PROMPT.md), or instruct the agent to read that file in full and execute it. It includes fixed dependencies, model setup, pipeline limits, data contracts, UI, security, tests, and GitHub operations.

The agent can implement and run fixture tests while you prepare the key. Live text/vision checks and Instagram/YouTube verification must remain explicitly pending until credentials and test links are available.

## 3. Prepare two test links

Choose one accessible Instagram Reel and one YouTube video that each mention or visibly show a website. Prefer short videos where you already know the expected website, so you can judge extraction quality. For Instagram, a browser session may be required in addition to the API key. The app must explain that state and offer opted-in Chrome/Firefox session access or local file import.

## 4. GitHub authentication

GitHub access is separate from the Gemini key. On this Mac, GitHub CLI browser authentication was completed for **ultrararebinary** during handoff preparation. Credentials themselves are not stored in this repository. An invalid ambient GITHUB_TOKEN was detected; the agent should use the verified saved login via per-command `env -u GH_TOKEN -u GITHUB_TOKEN gh ...` when necessary.

On a different machine, the agent can start `gh auth login --hostname github.com --git-protocol https --web`; you approve the device sign-in in your browser. Git commit identity alone does not authorize creating or pushing repositories.

## Fixed model choices

| Job | Selection | Key |
| --- | --- | --- |
| Local transcription | whisper.cpp v1.9.4 + ggml-small.bin, multilingual | None |
| Text extraction and synthesis | Gemini 2.5 Flash-Lite through OmniRoute 3.8.50 | Gemini key |
| Screenshot/image understanding | Same Gemini 2.5 Flash-Lite | Same key |
| Semantic search | Quantized multilingual-e5-small, local CPU | None |

This is a specified integration, not a completed live test. An API key cannot guarantee that a social platform will permit every download or that free quota is available at all times.
