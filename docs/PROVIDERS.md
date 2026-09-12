# Free AI providers for Keeptrail

Keeptrail can route text extraction and screenshot understanding through OmniRoute. Google Gemini remains available, but it is not required. Groq, Mistral Free, and OpenRouter Free are the supported free choices in the Settings screen.

## Recommended: Groq

Groq provides a free developer tier and a fixed multimodal model that is a good fit for Keeptrail's small batches:

- Provider in Keeptrail: **Groq**
- OmniRoute model: `groq/qwen/qwen3.6-27b`
- Inputs: text and images; output: text/JSON
- Groq's current vision documentation lists up to five images per request. Its free-plan table lists 30 requests/minute, 1,000 requests/day, 8,000 tokens/minute, and 200,000 tokens/day for this model.

Create the account and key:

1. Open [GroqCloud](https://console.groq.com/) and create an account or sign in.
2. Open [API Keys](https://console.groq.com/keys), choose **Create API Key**, name it `Keeptrail`, and copy it once.
3. Do not add a payment method or enable a paid plan for this use.
4. In Keeptrail, open **Settings → Provider health**, choose **Groq**, paste the key, and choose **Save provider**.

The key is stored in Keeptrail's protected local data directory. It is sent only from the local server to the selected gateway connection; it is never placed in browser storage or Git.

Read the [Groq vision documentation](https://console.groq.com/docs/vision) and [free-plan rate limits](https://console.groq.com/docs/rate-limits) for current limits. Providers can change models and quotas; Keeptrail surfaces an error instead of silently switching to a paid model.

## Alternative: Mistral Free mode

Mistral Studio offers a Free mode with API access enabled by default and no credit card required. Mistral Small supports text and image inputs, which covers Keeptrail's transcript and screenshot analysis:

- Provider in Keeptrail: **Mistral Free**
- OmniRoute model: `mistral/mistral-small-latest`
- Inputs: text and images; output: text/JSON
- Free mode has limited usage and rate limits; Mistral's current limits are shown in the Studio Admin panel.

Create the account and key:

1. Open [Mistral Studio](https://console.mistral.ai/) and create an account or sign in.
2. Open [API Keys](https://console.mistral.ai/api-keys), choose **Create new key**, and name it `Keeptrail`.
3. Keep the organization in **Free mode**; do not enable pay-as-you-go for this test.
4. Copy the key immediately. Mistral shows the full key only once.
5. In Keeptrail, open **Settings → Provider health**, choose **Mistral Free**, paste the key, and choose **Save provider**.

Read Mistral's [API-key quickstart](https://docs.mistral.ai/getting-started/quickstarts/studio/activate-and-generate-api-key), [vision documentation](https://docs.mistral.ai/studio/conversations/vision), and [rate-limit guidance](https://help.mistral.ai/en/articles/698531-why-am-i-hitting-api-rate-limits-and-how-do-i-increase-them). Mistral's API is served from EU data centers by default. Keeptrail never falls back to a paid Mistral route.

## Alternative: OpenRouter Free Models Router

OpenRouter offers a single OpenAI-compatible endpoint that routes to currently available free models. This is useful when you prefer a model pool over one fixed vendor:

- Provider in Keeptrail: **OpenRouter Free**
- OmniRoute model: `openrouter/openrouter/free`
- Inputs: text and images; output: text/JSON
- The router filters for free models with the capabilities requested by the call, including image understanding and structured output.
- Without purchased credits, OpenRouter documents a low free-model allowance of 50 requests/day. The selected underlying model and availability can change.

Create the account and key:

1. Open [OpenRouter](https://openrouter.ai/) and create an account or sign in.
2. Open [Settings → Keys](https://openrouter.ai/settings/keys), choose **Create Key**, name it `Keeptrail`, and copy it once.
3. Do not purchase credits for this free-only setup. Purchased credits change the free request allowance and are outside Keeptrail's free-only policy.
4. In Keeptrail, choose **OpenRouter Free**, paste the key, and choose **Save provider**.

Read [OpenRouter's Free Models Router guide](https://openrouter.ai/docs/cookbook/get-started/free-models-router-playground), [free model variants](https://openrouter.ai/docs/guides/routing/model-variants/free), and [image input documentation](https://openrouter.ai/docs/guides/overview/multimodal/image-understanding). A free model may be temporarily unavailable; retry later or use Groq. Keeptrail never falls back to a paid OpenRouter route.

## Google Gemini

Google Gemini is retained for users who can access the Developer API, but it is not the recommended setup for Keeptrail. Its existing instructions are in [QUICKSTART.md](../QUICKSTART.md). Choose a provider with the selector; each provider has its own key and free-tier policy.

## What you need to create

For the alternatives, you need exactly one account and one API key per provider you want to try. You do not need an OpenAI key, Anthropic key, image-generation key, Hugging Face key, or downloader API key. Whisper transcription and semantic search remain local and require no cloud key.

Keeptrail sends selected transcript text and captures to the provider you select. Free-tier terms, retention, and quotas are controlled by that provider. A free key does not make social-video downloading reliable; access can still require an opted-in Chrome/Firefox browser session or local-file import.

## OmniRoute mapping

These IDs are taken from the pinned OmniRoute v3.8.50 provider registry used by Keeptrail:

| Keeptrail option | OmniRoute provider | OmniRoute model | Gateway behavior |
| --- | --- | --- | --- |
| Groq | `groq` | `groq/qwen/qwen3.6-27b` | Fixed multimodal Qwen model |
| Mistral Free | `mistral` | `mistral/mistral-small-latest` | Fixed multimodal Mistral model |
| OpenRouter Free | `openrouter` | `openrouter/openrouter/free` | Free-only dynamic router |
| Google Gemini | `gemini` | `gemini/gemini-2.5-flash-lite` | Fixed Gemini model |

Keeptrail creates separate managed provider connections and stores each key separately. Selecting a provider does not copy, expose, or delete another provider's key.

The provider and model IDs above were checked against OmniRoute's pinned [Groq registry](https://github.com/diegosouzapw/OmniRoute/blob/v3.8.50/open-sse/config/providers/registry/groq/index.ts), [Mistral registry](https://github.com/diegosouzapw/OmniRoute/blob/v3.8.50/open-sse/config/providers/registry/mistral/index.ts), [OpenRouter registry](https://github.com/diegosouzapw/OmniRoute/blob/v3.8.50/open-sse/config/providers/registry/openrouter/index.ts), and [Gemini registry](https://github.com/diegosouzapw/OmniRoute/blob/v3.8.50/open-sse/config/providers/registry/gemini/index.ts).
