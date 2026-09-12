# Gemini Interactions API (Google AI for Developers)

> Source: https://ai.google.dev/api/interactions-api
> Captured: 2026-09-12 (Asia/Tokyo)
> Capture method: official HTML page converted to Markdown; interactive iframe examples fetched separately and included in the appendix.

---

# Gemini Interactions API

<div class="devsite-page-title-meta">

</div>

<div class="devsite-article-body clearfix">

The Gemini Interactions API allows developers to build generative AI applications using Gemini models. Gemini is our most capable model, built from the ground up to be multimodal. It can generalize and seamlessly understand, operate across, and combine different types of information including language, images, audio, video, and code. You can use the Gemini API for use cases like reasoning across text and images, content generation, dialogue agents, summarization and classification systems, and more.

<div class="markdown-actions" style="margin-top: 16px; margin-bottom: 24px;">

<a href="/static/api/interactions.md.txt" class="md-button" target="_blank">View as markdown</a> <a href="/static/api/interactions.openapi.json" class="md-button" target="_blank">View the OpenAPI Spec</a>

</div>

**Beta**: You are viewing the beta version of the Interactions API. Endpoints are under `/v1beta/`. The stable [v1 version](/api/interactions-api-v1) is also available.

<div class="api-version-toggle">

<span class="toggle-label">API version:</span> <span class="version-btn active">v1beta</span> <a href="/api/interactions-api-v1" class="version-btn">v1</a>

</div>

<div class="prototype" itemscope="" itemtype="http://developers.google.com/ReferenceObject">

## Creating an interaction

<div>

<span class="endpoint"> <span class="http-method post"> post </span> </span> <span class="endpoint-url" style="font-size: 16px; color: var(--devsite-code-color);"> https://generativelanguage.googleapis.com/v1beta/interactions </span>

</div>

<div id="description" class="section">

Creates a new interaction.

</div>

<div class="section prototype">

- [Path / Query parameters](#CreateInteraction.PATH_PARAMETERS)
- [Request body](#CreateInteraction.request_body)
- [Response](#CreateInteraction.response)

<div class="column-container request-section" style="margin-top: 48px;">

<div class="reference">

<div id="CreateInteraction.PATH_PARAMETERS" class="section">

### Path / Query Parameters

<div class="field-entry">

<div class="signature">

<span class="field-name">api_version</span> <span class="field-type">string</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

Which version of the API to use.

</div>

</div>

</div>

<div id="CreateInteraction.request_body" class="section">

### Request body

The request body contains data with the following structure:

<span class="expander-icon"></span> <span class="field-name">model</span> <span class="field-type">ModelOption</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

The name of the \`Model\` used for generating the interaction.  
**Required if \`agent\` is not provided.**

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The model that will complete your prompt.\n\nSee \[models\](https://ai.google.dev/gemini-api/docs/models) for additional details.

#### Possible values

- `gemini-2.5-flash`

  Our first hybrid reasoning model which supports a 1M token context window and has thinking budgets.

- `gemini-2.5-pro`

  Our state-of-the-art multipurpose model, which excels at coding and complex reasoning tasks.

- `gemma-4-26b-a4b-it`

  Gemma 4 26B A4B IT

- `gemma-4-31b-it`

  Gemma 4 31B IT

- `gemini-flash-latest`

  Latest release of Gemini Flash

- `gemini-flash-lite-latest`

  Latest release of Gemini Flash-Lite

- `gemini-pro-latest`

  Latest release of Gemini Pro

- `gemini-2.5-flash-lite`

  Our smallest and most cost effective model, built for at scale usage.

- `gemini-2.5-flash-image`

  Our native image generation model, optimized for speed, flexibility, and contextual understanding. Text input and output is priced the same as 2.5 Flash.

- `gemini-3-flash-preview`

  Our most intelligent model built for speed, combining frontier intelligence with superior search and grounding.

- `gemini-3.1-pro-preview`

  Our latest SOTA reasoning model with unprecedented depth and nuance, and powerful multimodal understanding and coding capabilities.

- `gemini-3.1-pro-preview-customtools`

  Gemini 3.1 Pro Preview optimized for custom tool usage

- `gemini-3.1-flash-lite`

  Our most cost-efficient model, optimized for high-volume agentic tasks, translation, and simple data processing.

- `gemini-3-pro-image`

  Gemini 3 Pro Image

- `nano-banana-pro-preview`

  Gemini 3 Pro Image Preview

- `gemini-3.1-flash-image`

  Gemini 3.1 Flash Image.

- `gemini-3.5-flash`

  Gemini 3.5 Flash - Our earlier Flash model, built for speed and foundational performance across routine, high-throughput workloads.

- `gemini-3.6-flash`

  Gemini 3.6 Flash - Our previous generation Flash model, balancing speed and multimodal capabilities across general agentic and everyday tasks.

- `gemini-3.7-flash`

  Gemini 3.7 Flash - Our high-speed, efficient Flash model built for everyday coding, agentic tool use, and reliable multi-step execution.

- `gemini-3.8-flash`

  Gemini 3.8 Flash - Our most intelligent Flash model, engineered for long-horizon software engineering, autonomous agents, and complex enterprise workflows.

- `lyria-3-clip-preview`

  Our low-latency, music generation model optimized for high-fidelity audio clips and precise rhythmic control.

- `lyria-3-pro-preview`

  Our advanced, full-song generative model with deep compositional understanding, optimized for precise structural control and complex transitions across diverse musical styles.

- `gemini-robotics-er-1.6-preview`

  Gemini Robotics-ER 1.6 Preview

- `gemini-robotics-er-2-preview`

  Gemini Robotics Embodied Reasoning 2 Preview

</div>

</div>

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">agent</span> <span class="field-type">AgentOption</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

The name of the \`Agent\` used for generating the interaction.  
**Required if \`model\` is not provided.**

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The agent to interact with.

#### Possible values

- `deep-research-pro-preview-12-2025`

  Gemini Deep Research Agent

- `deep-research-preview-04-2026`

  Gemini Deep Research Agent

- `deep-research-max-preview-04-2026`

  Gemini Deep Research Max Agent

- `antigravity-preview-05-2026`

  Use the Antigravity managed agent to perform multi-step tasks that require reasoning, file operations, and tool use.

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">input</span> <span class="field-type">[Content](#Resource:Content) or array ([Content](#Resource:Content)) or array ([Step](#Resource:Step)) or string</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

The inputs for the interaction (common to both Model and Agent).

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">system_instruction</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

System instruction for the interaction.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">tools</span> <span class="field-type">array ([Tool](#Resource:Tool))</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

A list of tool declarations the model may call during interaction.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">response_format</span> <span class="field-type">[ResponseFormat](#Resource:ResponseFormat) or array ([ResponseFormat](#Resource:ResponseFormat))</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Enforces that the generated response is a JSON object that complies with the JSON schema specified in this field.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">stream</span> <span class="field-type">boolean</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Input only. Whether the interaction will be streamed.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">store</span> <span class="field-type">boolean</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Input only. Whether to store the response and request for later retrieval.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">background</span> <span class="field-type">boolean</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Input only. Whether to run the model interaction in the background.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">generation_config</span> <span class="field-type">GenerationConfig</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

**Model Configuration**  
Configuration parameters for the model interaction.  
*Alternative to \`agent_config\`. Only applicable when \`model\` is set.*

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

Configuration parameters for model interactions.

#### Fields

<div class="field-entry">

<div class="signature">

<span class="field-name">max_output_tokens</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The maximum number of tokens to include in the response.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">seed</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Seed used in decoding for reproducibility.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">speech_config</span> <span class="field-type">SpeakerConfig or array (SpeechConfig)</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

Optional. Speech and multi-speaker configuration.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

Configuration for multi-speaker and speech generation.

#### Fields

<span class="expander-icon"></span> <span class="field-name">speakers</span> <span class="field-type">array (SpeechConfig)</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

Individual speaker configurations.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The configuration for speech interaction.

#### Fields

<div class="field-entry">

<div class="signature">

<span class="field-name">language</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The language of the speech.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">speaker</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The speaker's name, it should match the speaker name given in the prompt.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">voice</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The voice of the speaker.

</div>

</div>

</div>

</div>

</div>

</div>

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">stop_sequences</span> <span class="field-type">array (string)</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

A list of character sequences that will stop output interaction.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">thinking_level</span> <span class="field-type">ThinkingLevel</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

The level of thought tokens that the model should generate.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

#### Possible values

- `minimal`

  Little to no thinking.

- `low`

  Low thinking level.

- `medium`

  Medium thinking level.

- `high`

  High thinking level.

</div>

</div>

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">thinking_summaries</span> <span class="field-type">ThinkingSummaries</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

Whether to include thought summaries in the response.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

#### Possible values

- `auto`

  Auto thinking summaries.

- `none`

  No thinking summaries.

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">tool_choice</span> <span class="field-type">[ToolChoiceConfig](#Resource:ToolChoiceConfig) or enum (string)</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The tool choice configuration.

Possible values:

- `auto`

  Auto tool choice.

- `any`

  Any tool choice.

- `none`

  No tool choice.

- `validated`

  Validated tool choice.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">transcription_config</span> <span class="field-type">TranscriptionConfig</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

Optional. Configuration for speech recognition (transcription). If present, ASR is enabled.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

Configuration for speech recognition (transcription).

#### Fields

<div class="field-entry">

<div class="signature">

<span class="field-name">custom_vocabulary</span> <span class="field-type">array (string)</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Optional. A list of custom vocabulary phrases to bias the speech recognition model toward recognizing specific terms.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">language_codes</span> <span class="field-type">array (string)</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Optional. BCP-47 language codes providing hints about the languages present in the audio. If omitted or empty, defaults to automatic language detection.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">mode</span> <span class="field-type">TranscriptionMode or enum (string)</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

Discriminated transcription mode options or enum.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

Configuration for transcription mode.

#### Possible Types

<span style="font-weight: 500;">SmartTranscriptionMode</span>

<div class="subtype-content">

Configuration for smart transcription mode.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"smart"`.

</div>

</div>

</div>

<span style="font-weight: 500;">VerbatimTranscriptionMode</span>

<div class="subtype-content">

Configuration for verbatim transcription mode.

<div class="field-entry">

<div class="signature">

<span class="field-name">diarization_mode</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Optional. Configures speaker diarization. Supported values: "speaker".

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">timestamp_granularities</span> <span class="field-type">array (string)</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Optional. The granularity of timestamps to include in the transcription output. Supported values: "word". If empty, no timestamps are generated.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"verbatim"`.

</div>

</div>

</div>

</div>

</div>

</div>

</div>

</div>

</div>

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">video_config</span> <span class="field-type">VideoConfig</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

Configuration for video generation.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

Configuration options for video generation.

#### Fields

<div class="field-entry">

<div class="signature">

<span class="field-name">task</span> <span class="field-type">enum (string)</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Optional task mode for video generation. If not specified, the model automatically determines the appropriate mode based on the provided text prompt and input media.

Possible values:

- `text_to_video`

  Generates video solely from a text prompt.

- `image_to_video`

  Generates video from one or two source images. The first image defines the starting frame, and the optional second image defines the ending frame.

- `reference_to_video`

  Generates video using reference media (such as images, audio, or video).

- `edit`

  Modifies an existing input video.

- `extend`

  Extends an existing input video.

</div>

</div>

</div>

</div>

</div>

</div>

</div>

</div>

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">agent_config</span> <span class="field-type">object</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

**Agent Configuration**  
Configuration for the agent.  
*Alternative to \`generation_config\`. Only applicable when \`agent\` is set.*

#### Possible Types

Polymorphic discriminator: `type`

<span style="font-weight: 500;">AntigravityAgentConfig</span>

<div class="subtype-content">

Configuration for the Antigravity agent runtime. Provides server-side control over the agent's execution environment and tool configuration.

<div class="field-entry">

<div class="signature">

<span class="field-name">max_total_tokens</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Max total tokens for the agent run.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">model</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The model to use for agent reasoning.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"antigravity"`.

</div>

</div>

</div>

<span style="font-weight: 500;">DeepResearchAgentConfig</span>

<div class="subtype-content">

Configuration for the Deep Research agent.

<div class="field-entry">

<div class="signature">

<span class="field-name">collaborative_planning</span> <span class="field-type">boolean</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Enables human-in-the-loop planning for the Deep Research agent. If set to true, the Deep Research agent will provide a research plan in its response. The agent will then proceed only if the user confirms the plan in the next turn.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">thinking_summaries</span> <span class="field-type">ThinkingSummaries</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

Whether to include thought summaries in the response.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

#### Possible values

- `auto`

  Auto thinking summaries.

- `none`

  No thinking summaries.

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"deep-research"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">visualization</span> <span class="field-type">enum (string)</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Whether to include visualizations in the response.

Possible values:

- `off`

  Do not include visualizations.

- `auto`

  Automatically include visualizations.

</div>

</div>

</div>

<span style="font-weight: 500;">DynamicAgentConfig</span>

<div class="subtype-content">

Configuration for dynamic agents.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"dynamic"`.

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">environment</span> <span class="field-type">[EnvironmentConfig](#Resource:EnvironmentConfig) or string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The environment configuration for the interaction. Can be an object specifying remote environment sources or a string referencing an existing environment ID.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">labels</span> <span class="field-type">object</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The labels with user-defined metadata for the request.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">previous_interaction_id</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The ID of the previous interaction, if any.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">safety_settings</span> <span class="field-type">array (SafetySetting)</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Safety settings for the interaction.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">service_tier</span> <span class="field-type">ServiceTier</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

The service tier for the interaction.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

#### Possible values

- `flex`

  Flex service tier.

- `standard`

  Standard service tier.

- `priority`

  Priority service tier.

</div>

</div>

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">webhook_config</span> <span class="field-type">WebhookConfig</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

Optional. Webhook configuration for receiving notifications when the interaction completes.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

Message for configuring webhook events for a request.

#### Fields

<div class="field-entry">

<div class="signature">

<span class="field-name">uris</span> <span class="field-type">array (string)</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Optional. If set, these webhook URIs will be used for webhook events instead of the registered webhooks.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">user_metadata</span> <span class="field-type">object</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Optional. The user metadata that will be returned on each event emission to the webhooks.

</div>

</div>

</div>

</div>

</div>

</div>

</div>

<div id="CreateInteraction.response" class="section">

### Response

Returns an [Interaction](#Resource:Interaction) resource.

</div>

</div>

<div class="second-column">

<div class="examples">

<div class="section">

### Simple Request

<div class="example-content">

#### Example Response

<div>

</div>

``` devsite-click-to-copy
{
  "created": "2025-11-26T12:25:15Z",
  "id": "v1_ChdPU0F4YWFtNkFwS2kxZThQZ05lbXdROBIXT1NBeGFhbTZBcEtpMWU4UGdOZW13UTg",
  "model": "gemini-3.6-flash",
  "object": "interaction",
  "status": "completed",
  "steps": [
    {
      "type": "model_output",
      "content": [
        {
          "type": "text",
          "text": "Hello! I'm functioning perfectly and ready to assist you.\n\nHow are you doing today?"
        }
      ]
    }
  ],
  "updated": "2025-11-26T12:25:15Z",
  "usage": {
    "input_tokens_by_modality": [
      {
        "modality": "text",
        "tokens": 7
      }
    ],
    "total_cached_tokens": 0,
    "total_input_tokens": 7,
    "total_output_tokens": 20,
    "total_thought_tokens": 22,
    "total_tokens": 49,
    "total_tool_use_tokens": 0
  }
}
```

</div>

</div>

<div class="section">

### Multi-turn

<div class="example-content">

#### Example Response

<div>

</div>

``` devsite-click-to-copy
{
  "created": "2025-11-26T12:22:47Z",
  "id": "v1_ChdPU0F4YWFtNkFwS2kxZThQZ05lbXdROBIXT1NBeGFhbTZBcEtpMWU4UGdOZW13UTg",
  "model": "gemini-3.6-flash",
  "object": "interaction",
  "status": "completed",
  "steps": [
    {
      "type": "model_output",
      "content": [
        {
          "type": "text",
          "text": "The capital of France is Paris."
        }
      ]
    }
  ],
  "updated": "2025-11-26T12:22:47Z",
  "usage": {
    "input_tokens_by_modality": [
      {
        "modality": "text",
        "tokens": 50
      }
    ],
    "total_cached_tokens": 0,
    "total_input_tokens": 50,
    "total_output_tokens": 10,
    "total_thought_tokens": 0,
    "total_tokens": 60,
    "total_tool_use_tokens": 0
  }
}
```

</div>

</div>

<div class="section">

### Image Input

<div class="example-content">

#### Example Response

<div>

</div>

``` devsite-click-to-copy
{
  "created": "2025-11-26T12:22:47Z",
  "id": "v1_ChdPU0F4YWFtNkFwS2kxZThQZ05lbXdROBIXT1NBeGFhbTZBcEtpMWU4UGdOZW13UTg",
  "model": "gemini-3.6-flash",
  "object": "interaction",
  "status": "completed",
  "steps": [
    {
      "type": "model_output",
      "content": [
        {
          "type": "text",
          "text": "A white humanoid robot with glowing blue eyes stands holding a red skateboard."
        }
      ]
    }
  ],
  "updated": "2025-11-26T12:22:47Z",
  "usage": {
    "input_tokens_by_modality": [
      {
        "modality": "text",
        "tokens": 10
      },
      {
        "modality": "image",
        "tokens": 258
      }
    ],
    "total_cached_tokens": 0,
    "total_input_tokens": 268,
    "total_output_tokens": 20,
    "total_thought_tokens": 0,
    "total_tokens": 288,
    "total_tool_use_tokens": 0
  }
}
```

</div>

</div>

<div class="section">

### Function Calling

<div class="example-content">

#### Example Response

<div>

</div>

``` devsite-click-to-copy
{
  "created": "2025-11-26T12:22:47Z",
  "id": "v1_ChdPU0F4YWFtNkFwS2kxZThQZ05lbXdROBIXT1NBeGFhbTZBcEtpMWU4UGdOZW13UTg",
  "model": "gemini-3.6-flash",
  "object": "interaction",
  "status": "requires_action",
  "steps": [
    {
      "name": "get_weather",
      "type": "function_call",
      "arguments": {
        "location": "Boston, MA"
      },
      "id": "gth23981"
    }
  ],
  "updated": "2025-11-26T12:22:47Z",
  "usage": {
    "input_tokens_by_modality": [
      {
        "modality": "text",
        "tokens": 100
      }
    ],
    "total_cached_tokens": 0,
    "total_input_tokens": 100,
    "total_output_tokens": 25,
    "total_thought_tokens": 0,
    "total_tokens": 125,
    "total_tool_use_tokens": 50
  }
}
```

</div>

</div>

<div class="section">

### Deep Research

<div class="example-content">

#### Example Response

<div>

</div>

``` devsite-click-to-copy
{
  "agent": "deep-research-pro-preview-12-2025",
  "created": "2025-11-26T12:22:47Z",
  "id": "v1_ChdPU0F4YWFtNkFwS2kxZThQZ05lbXdROBIXT1NBeGFhbTZBcEtpMWU4UGdOZW13UTg",
  "object": "interaction",
  "status": "completed",
  "steps": [
    {
      "type": "model_output",
      "content": [
        {
          "type": "text",
          "text": "Here is a comprehensive research report on the current state of cancer research..."
        }
      ]
    }
  ],
  "updated": "2025-11-26T12:22:47Z",
  "usage": {
    "input_tokens_by_modality": [
      {
        "modality": "text",
        "tokens": 20
      }
    ],
    "total_cached_tokens": 0,
    "total_input_tokens": 20,
    "total_output_tokens": 1000,
    "total_thought_tokens": 500,
    "total_tokens": 1520,
    "total_tool_use_tokens": 0
  }
}
```

</div>

</div>

<div class="section">

### Antigravity Agent

<div class="example-content">

#### Example Response

<div>

</div>

``` devsite-click-to-copy
{
  "agent": "antigravity-preview-05-2026",
  "created": "2025-11-26T12:22:47Z",
  "environment_id": "env_abc123",
  "id": "v1_ChdPU0F4YWFtNkFwS2kxZThQZ05lbXdROBIXT1NBeGFhbTZBcEtpMWU4UGdOZW13UTg",
  "object": "interaction",
  "status": "completed",
  "steps": [
    {
      "type": "model_output",
      "content": [
        {
          "type": "text",
          "text": "I've summarized the top 5 Hacker News stories and saved the results to /workspace/summary.md."
        }
      ]
    }
  ],
  "updated": "2025-11-26T12:22:47Z",
  "usage": {
    "input_tokens_by_modality": [
      {
        "modality": "text",
        "tokens": 50
      }
    ],
    "total_cached_tokens": 0,
    "total_input_tokens": 50,
    "total_output_tokens": 500,
    "total_thought_tokens": 200,
    "total_tokens": 750,
    "total_tool_use_tokens": 0
  }
}
```

</div>

</div>

<div class="section">

### Reuse Environment

<div class="example-content">

#### Example Response

<div>

</div>

``` devsite-click-to-copy
{
  "agent": "antigravity-preview-05-2026",
  "created": "2025-11-26T12:23:00Z",
  "environment_id": "env_abc123",
  "id": "v1_Chd2ZTJhYmNkZWZnaGlqa2xtbm9wcXJzdHV2d3h5ejAxMjM0NTY3ODkwMTIzNDU2Nzg",
  "object": "interaction",
  "status": "completed",
  "steps": [
    {
      "type": "model_output",
      "content": [
        {
          "type": "text",
          "text": "I've updated /workspace/hello.py to accept a name argument and greet the user."
        }
      ]
    }
  ],
  "updated": "2025-11-26T12:23:00Z",
  "usage": {
    "input_tokens_by_modality": [
      {
        "modality": "text",
        "tokens": 80
      }
    ],
    "total_cached_tokens": 0,
    "total_input_tokens": 80,
    "total_output_tokens": 200,
    "total_thought_tokens": 100,
    "total_tokens": 380,
    "total_tool_use_tokens": 0
  }
}
```

</div>

</div>

<div class="section">

### With Sources

<div class="example-content">

</div>

</div>

<div class="section">

### Custom Agent

<div class="example-content">

</div>

</div>

</div>

</div>

</div>

</div>

</div>

<div class="prototype" itemscope="" itemtype="http://developers.google.com/ReferenceObject">

## Canceling an interaction

<div>

<span class="endpoint"> <span class="http-method post"> post </span> </span> <span class="endpoint-url" style="font-size: 16px; color: var(--devsite-code-color);"> https://generativelanguage.googleapis.com/v1beta/interactions/{id}/cancel </span>

</div>

<div id="description" class="section">

Cancels an interaction by id. This only applies to background interactions that are still running.

</div>

<div class="section prototype">

- [Path / Query parameters](#cancelInteractionById.PATH_PARAMETERS)
- [Response](#cancelInteractionById.response)

<div class="column-container request-section" style="margin-top: 48px;">

<div class="reference">

<div id="cancelInteractionById.PATH_PARAMETERS" class="section">

### Path / Query Parameters

<div class="field-entry">

<div class="signature">

<span class="field-name">api_version</span> <span class="field-type">string</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

Which version of the API to use.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">id</span> <span class="field-type">string</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

The unique identifier of the interaction to cancel.

</div>

</div>

</div>

<div id="cancelInteractionById.response" class="section">

### Response

Returns an [Interaction](#Resource:Interaction) resource.

</div>

</div>

<div class="second-column">

<div class="examples">

<div class="section">

### Cancel Interaction

<div class="example-content">

#### Example Response

<div>

</div>

``` devsite-click-to-copy
{
  "agent": "deep-research-pro-preview-12-2025",
  "created": "2026-06-22T04:55:47Z",
  "id": "v1_ChdVc0E0YXJTYk1zYlV6N0lQcXRXVG1BYxIXVXNBNGFyU2JNc2JVejdJUHF0V1RtQWM",
  "status": "cancelled",
  "steps": [
    {
      "type": "user_input",
      "content": [
        {
          "type": "text",
          "text": "Research the history of the Google TPUs with a focus on 2025 specs."
        }
      ]
    }
  ],
  "updated": "2026-06-22T04:55:47Z"
}
```

</div>

</div>

</div>

</div>

</div>

</div>

</div>

<div class="prototype" itemscope="" itemtype="http://developers.google.com/ReferenceObject">

## Retrieving an interaction

<div>

<span class="endpoint"> <span class="http-method get"> get </span> </span> <span class="endpoint-url" style="font-size: 16px; color: var(--devsite-code-color);"> https://generativelanguage.googleapis.com/v1beta/interactions/{id} </span>

</div>

<div id="description" class="section">

Retrieves the full details of a single interaction based on its \`Interaction.id\`.

</div>

<div class="section prototype">

- [Path / Query parameters](#getInteractionById.PATH_PARAMETERS)
- [Response](#getInteractionById.response)

<div class="column-container request-section" style="margin-top: 48px;">

<div class="reference">

<div id="getInteractionById.PATH_PARAMETERS" class="section">

### Path / Query Parameters

<div class="field-entry">

<div class="signature">

<span class="field-name">api_version</span> <span class="field-type">string</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

Which version of the API to use.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">id</span> <span class="field-type">string</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

The unique identifier of the interaction to retrieve.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">last_event_id</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Optional. If set, resumes the interaction stream from the next chunk after the event marked by the event id. Can only be used if \`stream\` is true.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">stream</span> <span class="field-type">boolean</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

If set to true, the generated content will be streamed incrementally.

*Defaults to: `False`*

</div>

</div>

</div>

<div id="getInteractionById.response" class="section">

### Response

Returns an [Interaction](#Resource:Interaction) resource.

</div>

</div>

<div class="second-column">

<div class="examples">

<div class="section">

### Get Interaction

<div class="example-content">

#### Example Response

<div>

</div>

``` devsite-click-to-copy
{
  "created": "2025-11-26T12:25:15Z",
  "id": "v1_ChdPU0F4YWFtNkFwS2kxZThQZ05lbXdROBIXT1NBeGFhbTZBcEtpMWU4UGdOZW13UTg",
  "model": "gemini-3.6-flash",
  "object": "interaction",
  "status": "completed",
  "steps": [
    {
      "type": "model_output",
      "content": [
        {
          "type": "text",
          "text": "I'm doing great, thank you for asking! How can I help you today?"
        }
      ]
    }
  ],
  "updated": "2025-11-26T12:25:15Z"
}
```

</div>

</div>

</div>

</div>

</div>

</div>

</div>

<div class="prototype" itemscope="" itemtype="http://developers.google.com/ReferenceObject">

## Deleting an interaction

<div>

<span class="endpoint"> <span class="http-method delete"> delete </span> </span> <span class="endpoint-url" style="font-size: 16px; color: var(--devsite-code-color);"> https://generativelanguage.googleapis.com/v1beta/interactions/{id} </span>

</div>

<div id="description" class="section">

Deletes the interaction by id.

</div>

<div class="section prototype">

- [Path / Query parameters](#deleteInteraction.PATH_PARAMETERS)
- [Response](#deleteInteraction.response)

<div class="column-container request-section" style="margin-top: 48px;">

<div class="reference">

<div id="deleteInteraction.PATH_PARAMETERS" class="section">

### Path / Query Parameters

<div class="field-entry">

<div class="signature">

<span class="field-name">api_version</span> <span class="field-type">string</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

Which version of the API to use.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">id</span> <span class="field-type">string</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

The unique identifier of the interaction to delete.

</div>

</div>

</div>

<div id="deleteInteraction.response" class="section">

### Response

If successful, the response is empty.

</div>

</div>

<div class="second-column">

<div class="examples">

<div class="section">

### Delete

<div class="example-content">

</div>

</div>

</div>

</div>

</div>

</div>

</div>

## Resources

<div itemscope="" itemtype="http://developers.google.com/ReferenceObject">

### Interaction

<div class="section prototype">

<div class="column-container">

<div class="reference">

The Interaction resource.

#### Fields

<span class="expander-icon"></span> <span class="field-name">agent</span> <span class="field-type">AgentOption</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

The name of the \`Agent\` used for generating the interaction.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The agent to interact with.

#### Possible values

- `deep-research-pro-preview-12-2025`

  Gemini Deep Research Agent

- `deep-research-preview-04-2026`

  Gemini Deep Research Agent

- `deep-research-max-preview-04-2026`

  Gemini Deep Research Max Agent

- `antigravity-preview-05-2026`

  Use the Antigravity managed agent to perform multi-step tasks that require reasoning, file operations, and tool use.

</div>

</div>

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">agent_config</span> <span class="field-type">object</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

Configuration parameters for the agent interaction.

#### Possible Types

Polymorphic discriminator: `type`

<span style="font-weight: 500;">AntigravityAgentConfig</span>

<div class="subtype-content">

Configuration for the Antigravity agent runtime. Provides server-side control over the agent's execution environment and tool configuration.

<div class="field-entry">

<div class="signature">

<span class="field-name">max_total_tokens</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Max total tokens for the agent run.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">model</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The model to use for agent reasoning.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"antigravity"`.

</div>

</div>

</div>

<span style="font-weight: 500;">DeepResearchAgentConfig</span>

<div class="subtype-content">

Configuration for the Deep Research agent.

<div class="field-entry">

<div class="signature">

<span class="field-name">collaborative_planning</span> <span class="field-type">boolean</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Enables human-in-the-loop planning for the Deep Research agent. If set to true, the Deep Research agent will provide a research plan in its response. The agent will then proceed only if the user confirms the plan in the next turn.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">thinking_summaries</span> <span class="field-type">ThinkingSummaries</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

Whether to include thought summaries in the response.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

#### Possible values

- `auto`

  Auto thinking summaries.

- `none`

  No thinking summaries.

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"deep-research"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">visualization</span> <span class="field-type">enum (string)</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Whether to include visualizations in the response.

Possible values:

- `off`

  Do not include visualizations.

- `auto`

  Automatically include visualizations.

</div>

</div>

</div>

<span style="font-weight: 500;">DynamicAgentConfig</span>

<div class="subtype-content">

Configuration for dynamic agents.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"dynamic"`.

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">created</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Output only. The time at which the response was created in ISO 8601 format (YYYY-MM-DDThh:mm:ssZ).

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">environment</span> <span class="field-type">[EnvironmentConfig](#Resource:EnvironmentConfig) or string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The environment configuration for the interaction. Can be an object specifying remote environment sources or a string referencing an existing environment ID.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">environment_id</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Output only. The environment ID for the interaction. Only populated if environment config is set in the request.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">errors</span> <span class="field-type">array (Error)</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

Output only. Diagnostic faults / platform errors recorded on the interaction.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

Error message from an interaction.

#### Fields

<div class="field-entry">

<div class="signature">

<span class="field-name">code</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

A URI that identifies the error type.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">message</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

A human-readable error message.

</div>

</div>

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">id</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Required. Output only. A unique identifier for the interaction completion.

*Defaults to:*

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">input</span> <span class="field-type">[Content](#Resource:Content) or array ([Content](#Resource:Content)) or array ([Step](#Resource:Step)) or string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The input for the interaction.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">labels</span> <span class="field-type">object</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The labels with user-defined metadata for the request.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">model</span> <span class="field-type">ModelOption</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

The name of the \`Model\` used for generating the interaction.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The model that will complete your prompt.\n\nSee \[models\](https://ai.google.dev/gemini-api/docs/models) for additional details.

#### Possible values

- `gemini-2.5-flash`

  Our first hybrid reasoning model which supports a 1M token context window and has thinking budgets.

- `gemini-2.5-pro`

  Our state-of-the-art multipurpose model, which excels at coding and complex reasoning tasks.

- `gemma-4-26b-a4b-it`

  Gemma 4 26B A4B IT

- `gemma-4-31b-it`

  Gemma 4 31B IT

- `gemini-flash-latest`

  Latest release of Gemini Flash

- `gemini-flash-lite-latest`

  Latest release of Gemini Flash-Lite

- `gemini-pro-latest`

  Latest release of Gemini Pro

- `gemini-2.5-flash-lite`

  Our smallest and most cost effective model, built for at scale usage.

- `gemini-2.5-flash-image`

  Our native image generation model, optimized for speed, flexibility, and contextual understanding. Text input and output is priced the same as 2.5 Flash.

- `gemini-3-flash-preview`

  Our most intelligent model built for speed, combining frontier intelligence with superior search and grounding.

- `gemini-3.1-pro-preview`

  Our latest SOTA reasoning model with unprecedented depth and nuance, and powerful multimodal understanding and coding capabilities.

- `gemini-3.1-pro-preview-customtools`

  Gemini 3.1 Pro Preview optimized for custom tool usage

- `gemini-3.1-flash-lite`

  Our most cost-efficient model, optimized for high-volume agentic tasks, translation, and simple data processing.

- `gemini-3-pro-image`

  Gemini 3 Pro Image

- `nano-banana-pro-preview`

  Gemini 3 Pro Image Preview

- `gemini-3.1-flash-image`

  Gemini 3.1 Flash Image.

- `gemini-3.5-flash`

  Gemini 3.5 Flash - Our earlier Flash model, built for speed and foundational performance across routine, high-throughput workloads.

- `gemini-3.6-flash`

  Gemini 3.6 Flash - Our previous generation Flash model, balancing speed and multimodal capabilities across general agentic and everyday tasks.

- `gemini-3.7-flash`

  Gemini 3.7 Flash - Our high-speed, efficient Flash model built for everyday coding, agentic tool use, and reliable multi-step execution.

- `gemini-3.8-flash`

  Gemini 3.8 Flash - Our most intelligent Flash model, engineered for long-horizon software engineering, autonomous agents, and complex enterprise workflows.

- `lyria-3-clip-preview`

  Our low-latency, music generation model optimized for high-fidelity audio clips and precise rhythmic control.

- `lyria-3-pro-preview`

  Our advanced, full-song generative model with deep compositional understanding, optimized for precise structural control and complex transitions across diverse musical styles.

- `gemini-robotics-er-1.6-preview`

  Gemini Robotics-ER 1.6 Preview

- `gemini-robotics-er-2-preview`

  Gemini Robotics Embodied Reasoning 2 Preview

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">previous_interaction_id</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The ID of the previous interaction, if any.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">response_format</span> <span class="field-type">[ResponseFormat](#Resource:ResponseFormat) or array ([ResponseFormat](#Resource:ResponseFormat))</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Enforces that the generated response is a JSON object that complies with the JSON schema specified in this field.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">safety_settings</span> <span class="field-type">array (SafetySetting)</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Safety settings for the interaction.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">service_tier</span> <span class="field-type">ServiceTier</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

The service tier for the interaction.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

#### Possible values

- `flex`

  Flex service tier.

- `standard`

  Standard service tier.

- `priority`

  Priority service tier.

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">status</span> <span class="field-type">enum (string)</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Required. Output only. The status of the interaction.

Possible values:

- `in_progress`

  The interaction is in progress.

- `requires_action`

  The interaction requires action/input from the user.

- `completed`

  The interaction is completed.

- `failed`

  The interaction failed.

- `cancelled`

  The interaction was cancelled.

- `incomplete`

  The interaction is completed, but contains incomplete results (e.g. hitting max_tokens).

- `budget_exceeded`

  The interaction was halted because the token budget was exceeded.

- `queued`

  The interaction is queued, waiting for processing.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">steps</span> <span class="field-type">array ([Step](#Resource:Step))</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Output only. The steps that make up the interaction, when included in the response.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">system_instruction</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

System instruction for the interaction.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">tools</span> <span class="field-type">array ([Tool](#Resource:Tool))</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

A list of tool declarations the model may call during interaction.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">updated</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Output only. The time at which the response was last updated in ISO 8601 format (YYYY-MM-DDThh:mm:ssZ).

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">usage</span> <span class="field-type">Usage</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

Output only. Statistics on the interaction request's token usage.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

Statistics on the interaction request's token usage.

#### Fields

<span class="expander-icon"></span> <span class="field-name">cached_tokens_by_modality</span> <span class="field-type">array (ModalityTokens)</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

A breakdown of cached token usage by modality.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The token count for a single response modality.

#### Fields

<span class="expander-icon"></span> <span class="field-name">modality</span> <span class="field-type">ResponseModality</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

The modality associated with the token count.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

#### Possible values

- `text`

  Indicates the model should return text.

- `image`

  Indicates the model should return images.

- `audio`

  Indicates the model should return audio.

- `video`

  Indicates the model should return video.

- `document`

  Indicates the model should return documents.

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">tokens</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Number of tokens for the modality.

</div>

</div>

</div>

</div>

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">grounding_tool_count</span> <span class="field-type">array (GroundingToolCount)</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

Grounding tool count.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The number of grounding tool counts.

#### Fields

<div class="field-entry">

<div class="signature">

<span class="field-name">count</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The number of grounding tool counts.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">enum (string)</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The grounding tool type associated with the count.

Possible values:

- `google_search`

  Grounding with Google Web Search and Image Search, & Web Grounding for Enterprise.

- `google_maps`

  Grounding with Google Maps.

</div>

</div>

</div>

</div>

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">input_tokens_by_modality</span> <span class="field-type">array (ModalityTokens)</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

A breakdown of input token usage by modality.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The token count for a single response modality.

#### Fields

<span class="expander-icon"></span> <span class="field-name">modality</span> <span class="field-type">ResponseModality</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

The modality associated with the token count.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

#### Possible values

- `text`

  Indicates the model should return text.

- `image`

  Indicates the model should return images.

- `audio`

  Indicates the model should return audio.

- `video`

  Indicates the model should return video.

- `document`

  Indicates the model should return documents.

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">tokens</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Number of tokens for the modality.

</div>

</div>

</div>

</div>

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">output_tokens_by_modality</span> <span class="field-type">array (ModalityTokens)</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

A breakdown of output token usage by modality.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The token count for a single response modality.

#### Fields

<span class="expander-icon"></span> <span class="field-name">modality</span> <span class="field-type">ResponseModality</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

The modality associated with the token count.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

#### Possible values

- `text`

  Indicates the model should return text.

- `image`

  Indicates the model should return images.

- `audio`

  Indicates the model should return audio.

- `video`

  Indicates the model should return video.

- `document`

  Indicates the model should return documents.

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">tokens</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Number of tokens for the modality.

</div>

</div>

</div>

</div>

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">tool_use_tokens_by_modality</span> <span class="field-type">array (ModalityTokens)</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

A breakdown of tool-use token usage by modality.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The token count for a single response modality.

#### Fields

<span class="expander-icon"></span> <span class="field-name">modality</span> <span class="field-type">ResponseModality</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

The modality associated with the token count.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

#### Possible values

- `text`

  Indicates the model should return text.

- `image`

  Indicates the model should return images.

- `audio`

  Indicates the model should return audio.

- `video`

  Indicates the model should return video.

- `document`

  Indicates the model should return documents.

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">tokens</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Number of tokens for the modality.

</div>

</div>

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">total_cached_tokens</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Number of tokens in the cached part of the prompt (the cached content).

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">total_input_tokens</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Number of tokens in the prompt (context).

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">total_output_tokens</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Total number of tokens across all the generated responses.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">total_thought_tokens</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Number of tokens of thoughts for thinking models.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">total_tokens</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Total token count for the interaction request (prompt + responses + other internal tokens).

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">total_tool_use_tokens</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Number of tokens present in tool-use prompt(s).

</div>

</div>

</div>

</div>

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">webhook_config</span> <span class="field-type">WebhookConfig</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

Optional. Webhook configuration for receiving notifications when the interaction completes.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

Message for configuring webhook events for a request.

#### Fields

<div class="field-entry">

<div class="signature">

<span class="field-name">uris</span> <span class="field-type">array (string)</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Optional. If set, these webhook URIs will be used for webhook events instead of the registered webhooks.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">user_metadata</span> <span class="field-type">object</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Optional. The user metadata that will be returned on each event emission to the webhooks.

</div>

</div>

</div>

</div>

</div>

</div>

</div>

<div class="second-column">

<div class="examples">

### Examples

<div class="section">

### Example

<div class="schema-example-content">

<div>

</div>

``` devsite-click-to-copy
{
  "created": "2025-12-04T15:01:45Z",
  "id": "v1_ChdXS0l4YWZXTk9xbk0xZThQczhEcmlROBIXV0tJeGFmV05PcW5NMWU4UHM4RHJpUTg",
  "model": "gemini-3.6-flash",
  "object": "interaction",
  "status": "completed",
  "steps": [
    {
      "type": "model_output",
      "content": [
        {
          "type": "text",
          "text": "Hello! I'm doing well, functioning as expected. Thank you for asking! How are you doing today?"
        }
      ]
    }
  ],
  "updated": "2025-12-04T15:01:45Z",
  "usage": {
    "input_tokens_by_modality": [
      {
        "modality": "text",
        "tokens": 7
      }
    ],
    "total_cached_tokens": 0,
    "total_input_tokens": 7,
    "total_output_tokens": 23,
    "total_thought_tokens": 49,
    "total_tokens": 79,
    "total_tool_use_tokens": 0
  }
}
```

</div>

</div>

</div>

</div>

</div>

</div>

</div>

## Data Models

<div itemscope="" itemtype="http://developers.google.com/ReferenceObject">

### Content

<div class="section prototype">

<div class="column-container">

<div class="reference">

The content of the response.

### Possible Types

<span style="font-weight: 500;">AudioContent</span>

<div class="subtype-content">

An audio content block.

<div class="field-entry">

<div class="signature">

<span class="field-name">channels</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The number of audio channels.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">data</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The audio content.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">mime_type</span> <span class="field-type">enum (string)</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The mime type of the audio.

Possible values:

- `audio/wav`

  WAV audio format

- `audio/mp3`

  MP3 audio format

- `audio/aiff`

  AIFF audio format

- `audio/aac`

  AAC audio format

- `audio/ogg`

  OGG audio format

- `audio/flac`

  FLAC audio format

- `audio/mpeg`

  MPEG audio format

- `audio/m4a`

  M4A audio format

- `audio/l16`

  L16 audio format

- `audio/opus`

  OPUS audio format

- `audio/alaw`

  ALAW audio format

- `audio/mulaw`

  MULAW audio format

- `audio/webm`

  WEBM audio format

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">sample_rate</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The sample rate of the audio.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"audio"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">uri</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The URI of the audio.

</div>

</div>

</div>

<span style="font-weight: 500;">DocumentContent</span>

<div class="subtype-content">

A document content block.

<div class="field-entry">

<div class="signature">

<span class="field-name">data</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The document content.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">mime_type</span> <span class="field-type">enum (string)</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The mime type of the document.

Possible values:

- `application/pdf`

  PDF document format

- `text/csv`

  CSV document format

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"document"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">uri</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The URI of the document.

</div>

</div>

</div>

<span style="font-weight: 500;">ImageContent</span>

<div class="subtype-content">

An image content block.

<div class="field-entry">

<div class="signature">

<span class="field-name">data</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The image content.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">mime_type</span> <span class="field-type">enum (string)</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The mime type of the image.

Possible values:

- `image/png`

  PNG image format

- `image/jpeg`

  JPEG image format

- `image/webp`

  WebP image format

- `image/heic`

  HEIC image format

- `image/heif`

  HEIF image format

- `image/gif`

  GIF image format

- `image/bmp`

  BMP image format

- `image/tiff`

  TIFF image format

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">resolution</span> <span class="field-type">MediaResolution</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

The resolution of the media.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

#### Possible values

- `low`

  Low resolution.

- `medium`

  Medium resolution.

- `high`

  High resolution.

- `ultra_high`

  Ultra high resolution.

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"image"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">uri</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The URI of the image.

</div>

</div>

</div>

<span style="font-weight: 500;">TextContent</span>

<div class="subtype-content">

A text content block.

<span class="expander-icon"></span> <span class="field-name">annotations</span> <span class="field-type">array (Annotation)</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

Citation information for model-generated content.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

Citation information for model-generated content.

#### Possible Types

<span style="font-weight: 500;">FileCitation</span>

<div class="subtype-content">

A file citation annotation.

<div class="field-entry">

<div class="signature">

<span class="field-name">custom_metadata</span> <span class="field-type">object</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

User provided metadata about the retrieved context.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">document_uri</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The URI of the file.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">end_index</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

End of the attributed segment, exclusive.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">file_name</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The name of the file.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">media_id</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Media ID in-case of image citations, if applicable.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">page_number</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Page number of the cited document, if applicable.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">source</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Source attributed for a portion of the text.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">start_index</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Start of segment of the response that is attributed to this source. Index indicates the start of the segment, measured in bytes.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"file_citation"`.

</div>

</div>

</div>

<span style="font-weight: 500;">PlaceCitation</span>

<div class="subtype-content">

A place citation annotation.

<div class="field-entry">

<div class="signature">

<span class="field-name">end_index</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

End of the attributed segment, exclusive.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">name</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Title of the place.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">place_id</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The ID of the place, in \`places/{place_id}\` format.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">review_snippets</span> <span class="field-type">array (ReviewSnippet)</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

Snippets of reviews that are used to generate answers about the features of a given place in Google Maps.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

Encapsulates a snippet of a user review that answers a question about the features of a specific place in Google Maps.

#### Fields

<div class="field-entry">

<div class="signature">

<span class="field-name">review_id</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The ID of the review snippet.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">title</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Title of the review.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">url</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

A link that corresponds to the user review on Google Maps.

</div>

</div>

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">start_index</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Start of segment of the response that is attributed to this source. Index indicates the start of the segment, measured in bytes.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"place_citation"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">url</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

URI reference of the place.

</div>

</div>

</div>

<span style="font-weight: 500;">UrlCitation</span>

<div class="subtype-content">

A URL citation annotation.

<div class="field-entry">

<div class="signature">

<span class="field-name">end_index</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

End of the attributed segment, exclusive.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">start_index</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Start of segment of the response that is attributed to this source. Index indicates the start of the segment, measured in bytes.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">title</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The title of the URL.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"url_citation"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">url</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The URL.

</div>

</div>

</div>

<span style="font-weight: 500;">WordInfo</span>

<div class="subtype-content">

Word-level ASR annotation for transcription output. Carries the word text, optional timing, and optional speaker attribution.

<div class="field-entry">

<div class="signature">

<span class="field-name">end_index</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

End of the attributed segment, exclusive.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">end_offset</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

End offset in time of the word relative to the start of the audio. Present when timestamp_granularities contains "word".

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">speaker</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Optional. Speaker label for this word (e.g. "spk_1", "spk_2"). Present when diarization_mode is set in TranscriptionConfig.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">start_index</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Start of segment of the response that is attributed to this source. Index indicates the start of the segment, measured in bytes.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">start_offset</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Start offset in time of the word relative to the start of the audio. Present when timestamp_granularities contains "word".

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">text</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The transcribed word.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"word_info"`.

</div>

</div>

</div>

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">text</span> <span class="field-type">string</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

Required. The text content.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"text"`.

</div>

</div>

</div>

<span style="font-weight: 500;">VideoContent</span>

<div class="subtype-content">

A video content block.

<div class="field-entry">

<div class="signature">

<span class="field-name">data</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The video content.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">mime_type</span> <span class="field-type">enum (string)</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The mime type of the video.

Possible values:

- `video/mp4`

  MP4 video format

- `video/mpeg`

  MPEG video format

- `video/mpg`

  MPG video format

- `video/mov`

  MOV video format

- `video/avi`

  AVI video format

- `video/x-flv`

  FLV video format

- `video/webm`

  WebM video format

- `video/wmv`

  WMV video format

- `video/3gpp`

  3GPP video format

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">name</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

A user-defined name for this content block. Can be referenced by the model in the final response.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">processing</span> <span class="field-type">MediaProcessing or enum (string)</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

How the model processes this video for understanding.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

#### Fields

<div class="field-entry">

<div class="signature">

<span class="field-name">end_offset</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Optional. Segment end time. Specified as a decimal number of seconds followed by an 's' suffix, e.g., "30s". Must be non-negative and greater than \`start_offset\` if \`start_offset\` is set.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">fps</span> <span class="field-type">number</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Optional. Video frame-rate sampling density.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">start_offset</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Optional. Segment start time. Specified as a decimal number of seconds followed by an 's' suffix, e.g., "10.5s". Must be non-negative.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"static"`.

</div>

</div>

</div>

</div>

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">resolution</span> <span class="field-type">MediaResolution</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

The resolution of the media.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

#### Possible values

- `low`

  Low resolution.

- `medium`

  Medium resolution.

- `high`

  High resolution.

- `ultra_high`

  Ultra high resolution.

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"video"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">uri</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The URI of the video.

</div>

</div>

</div>

</div>

<div class="second-column">

<div class="examples">

### Examples

<div class="section">

### Audio

<div class="schema-example-content">

<div>

</div>

``` devsite-click-to-copy
{
  "type": "audio",
  "data": "BASE64_ENCODED_AUDIO",
  "mime_type": "audio/wav"
}
```

</div>

</div>

<div class="section">

### Document

<div class="schema-example-content">

<div>

</div>

``` devsite-click-to-copy
{
  "type": "document",
  "data": "BASE64_ENCODED_DOCUMENT",
  "mime_type": "application/pdf"
}
```

</div>

</div>

<div class="section">

### Image

<div class="schema-example-content">

<div>

</div>

``` devsite-click-to-copy
{
  "type": "image",
  "data": "BASE64_ENCODED_IMAGE",
  "mime_type": "image/png"
}
```

</div>

</div>

<div class="section">

### Text

<div class="schema-example-content">

<div>

</div>

``` devsite-click-to-copy
{
  "type": "text",
  "text": "Hello, how are you?"
}
```

</div>

</div>

<div class="section">

### Video

<div class="schema-example-content">

<div>

</div>

``` devsite-click-to-copy
{
  "type": "video",
  "uri": "https://www.youtube.com/watch?v=9hE5-98ZeCg"
}
```

</div>

</div>

</div>

</div>

</div>

</div>

</div>

<div itemscope="" itemtype="http://developers.google.com/ReferenceObject">

### Tool

<div class="section prototype">

<div class="column-container">

<div class="reference">

A tool that can be used by the model.

### Possible Types

<span style="font-weight: 500;">CodeExecution</span>

<div class="subtype-content">

A tool that can be used by the model to execute code.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"code_execution"`.

</div>

</div>

</div>

<span style="font-weight: 500;">ComputerUse</span>

<div class="subtype-content">

A tool that can be used by the model to interact with the computer.

<div class="field-entry">

<div class="signature">

<span class="field-name">disabled_safety_policies</span> <span class="field-type">array (enum (string))</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Optional. Disabled safety policies for computer use.

Possible values:

- `financial_transactions`

  Safety policy for financial transactions.

- `sensitive_data_modification`

  Safety policy for sensitive data modification.

- `communication_tool`

  Safety policy for communication tools (e.g. Gmail, Chat, Meet).

- `account_creation`

  Safety policy for account creation.

- `data_modification`

  Safety policy for data modification.

- `user_consent_management`

  Safety policy for user consent management.

- `legal_terms_and_agreements`

  Safety policy for legal terms and agreements.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">enable_prompt_injection_detection</span> <span class="field-type">boolean</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Whether enable the prompt injection detection check on computer-use request.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">environment</span> <span class="field-type">enum (string)</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The environment being operated.

Possible values:

- `browser`

  Operates in a web browser.

- `mobile`

  Operates in a mobile environment.

- `desktop`

  Operates in a desktop environment.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">excluded_predefined_functions</span> <span class="field-type">array (string)</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The list of predefined functions that are excluded from the model call.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"computer_use"`.

</div>

</div>

</div>

<span style="font-weight: 500;">FileSearch</span>

<div class="subtype-content">

A tool that can be used by the model to search files.

<div class="field-entry">

<div class="signature">

<span class="field-name">file_search_store_names</span> <span class="field-type">array (string)</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The file search store names to search.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">metadata_filter</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Metadata filter to apply to the semantic retrieval documents and chunks.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">top_k</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The number of semantic retrieval chunks to retrieve.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"file_search"`.

</div>

</div>

</div>

<span style="font-weight: 500;">Function</span>

<div class="subtype-content">

A tool that can be used by the model.

<div class="field-entry">

<div class="signature">

<span class="field-name">description</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

A description of the function.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">name</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The name of the function.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">parameters</span> <span class="field-type">object</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The JSON Schema for the function's parameters.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"function"`.

</div>

</div>

</div>

<span style="font-weight: 500;">GoogleMaps</span>

<div class="subtype-content">

A tool that can be used by the model to call Google Maps.

<div class="field-entry">

<div class="signature">

<span class="field-name">enable_widget</span> <span class="field-type">boolean</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Whether to return a widget context token in the tool call result of the response.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">latitude</span> <span class="field-type">number</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The latitude of the user's location.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">longitude</span> <span class="field-type">number</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The longitude of the user's location.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"google_maps"`.

</div>

</div>

</div>

<span style="font-weight: 500;">GoogleSearch</span>

<div class="subtype-content">

A tool that can be used by the model to search Google.

<div class="field-entry">

<div class="signature">

<span class="field-name">search_types</span> <span class="field-type">array (enum (string))</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The types of search grounding to enable.

Possible values:

- `web_search`

  Setting this field enables web search. Only text results are returned.

- `image_search`

  Setting this field enables image search. Image bytes are returned.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"google_search"`.

</div>

</div>

</div>

<span style="font-weight: 500;">McpServer</span>

<div class="subtype-content">

A MCPServer is a server that can be called by the model to perform actions.

<span class="expander-icon"></span> <span class="field-name">allowed_tools</span> <span class="field-type">array (AllowedTools)</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

The allowed tools.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The configuration for allowed tools.

#### Fields

<div class="field-entry">

<div class="signature">

<span class="field-name">mode</span> <span class="field-type">enum (string)</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The mode of the tool choice.

Possible values:

- `auto`

  Auto tool choice.

- `any`

  Any tool choice.

- `none`

  No tool choice.

- `validated`

  Validated tool choice.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">tools</span> <span class="field-type">array (string)</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The names of the allowed tools.

</div>

</div>

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">headers</span> <span class="field-type">object</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Optional: Fields for authentication headers, timeouts, etc., if needed.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">name</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The name of the MCPServer.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"mcp_server"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">url</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The full URL for the MCPServer endpoint. Example: "https://api.example.com/mcp"

</div>

</div>

</div>

<span style="font-weight: 500;">UrlContext</span>

<div class="subtype-content">

A tool that can be used by the model to fetch URL context.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"url_context"`.

</div>

</div>

</div>

</div>

<div class="second-column">

<div class="examples">

### Examples

<div class="section">

### CodeExecution

<div class="example-content">

</div>

</div>

<div class="section">

### ComputerUse

<div class="example-content">

</div>

</div>

<div class="section">

### FileSearch

<div class="example-content">

</div>

</div>

<div class="section">

### Function

<div class="example-content">

</div>

</div>

<div class="section">

### GoogleMaps

<div class="example-content">

</div>

</div>

<div class="section">

### GoogleSearch

<div class="example-content">

</div>

</div>

<div class="section">

### McpServer

<div class="example-content">

</div>

</div>

<div class="section">

### UrlContext

<div class="example-content">

</div>

</div>

</div>

</div>

</div>

</div>

</div>

<div itemscope="" itemtype="http://developers.google.com/ReferenceObject">

### InteractionSseEvent

<div class="section prototype">

<div class="column-container">

<div class="reference">

### Possible Types

Polymorphic discriminator: `event_type`

<span style="font-weight: 500;">ErrorEvent</span>

<div class="subtype-content">

<span class="expander-icon"></span> <span class="field-name">error</span> <span class="field-type">Error</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

No description provided.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

Error message from an interaction.

#### Fields

<div class="field-entry">

<div class="signature">

<span class="field-name">code</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

A URI that identifies the error type.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">message</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

A human-readable error message.

</div>

</div>

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">event_id</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The event_id token to be used to resume the interaction stream, from this event.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">event_type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"error"`.

</div>

</div>

</div>

<span style="font-weight: 500;">InteractionCompletedEvent</span>

<div class="subtype-content">

<div class="field-entry">

<div class="signature">

<span class="field-name">event_id</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The event_id token to be used to resume the interaction stream, from this event.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">event_type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"interaction.completed"`.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">interaction</span> <span class="field-type">InteractionSseEventInteraction</span> <span class="field-nessesity required"> (required)</span>

<div class="field-description">

Partial completed interaction resource emitted at the end of the stream.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

Partial interaction resource emitted by interaction lifecycle SSE events. Streaming lifecycle payloads may omit fields that are only available on full non-streaming Interaction responses.

#### Fields

<div class="field-entry">

<div class="signature">

<span class="field-name">agent</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The agent to interact with.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">created</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Output only. The time at which the response was created in ISO 8601 format.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">id</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Required. Output only. A unique identifier for the interaction completion.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">model</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The model that will complete your prompt.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">object</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Output only. The resource type.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">service_tier</span> <span class="field-type">ServiceTier</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

The service tier for the interaction.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

#### Possible values

- `flex`

  Flex service tier.

- `standard`

  Standard service tier.

- `priority`

  Priority service tier.

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">status</span> <span class="field-type">enum (string)</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Required. Output only. The status of the interaction.

Possible values:

- `in_progress`

  The interaction is in progress.

- `requires_action`

  The interaction requires action/input from the user.

- `completed`

  The interaction is completed.

- `failed`

  The interaction failed.

- `cancelled`

  The interaction was cancelled.

- `incomplete`

  The interaction is completed, but contains incomplete results (e.g. hitting max_tokens).

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">steps</span> <span class="field-type">array ([Step](#Resource:Step))</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Output only. The steps that make up the interaction, if included in this event.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">updated</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Output only. The time at which the response was last updated in ISO 8601 format.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">usage</span> <span class="field-type">Usage</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

Output only. Statistics on the interaction request's token usage.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

Statistics on the interaction request's token usage.

#### Fields

<span class="expander-icon"></span> <span class="field-name">cached_tokens_by_modality</span> <span class="field-type">array (ModalityTokens)</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

A breakdown of cached token usage by modality.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The token count for a single response modality.

#### Fields

<span class="expander-icon"></span> <span class="field-name">modality</span> <span class="field-type">ResponseModality</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

The modality associated with the token count.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

#### Possible values

- `text`

  Indicates the model should return text.

- `image`

  Indicates the model should return images.

- `audio`

  Indicates the model should return audio.

- `video`

  Indicates the model should return video.

- `document`

  Indicates the model should return documents.

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">tokens</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Number of tokens for the modality.

</div>

</div>

</div>

</div>

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">grounding_tool_count</span> <span class="field-type">array (GroundingToolCount)</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

Grounding tool count.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The number of grounding tool counts.

#### Fields

<div class="field-entry">

<div class="signature">

<span class="field-name">count</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The number of grounding tool counts.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">enum (string)</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The grounding tool type associated with the count.

Possible values:

- `google_search`

  Grounding with Google Web Search and Image Search, & Web Grounding for Enterprise.

- `google_maps`

  Grounding with Google Maps.

</div>

</div>

</div>

</div>

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">input_tokens_by_modality</span> <span class="field-type">array (ModalityTokens)</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

A breakdown of input token usage by modality.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The token count for a single response modality.

#### Fields

<span class="expander-icon"></span> <span class="field-name">modality</span> <span class="field-type">ResponseModality</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

The modality associated with the token count.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

#### Possible values

- `text`

  Indicates the model should return text.

- `image`

  Indicates the model should return images.

- `audio`

  Indicates the model should return audio.

- `video`

  Indicates the model should return video.

- `document`

  Indicates the model should return documents.

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">tokens</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Number of tokens for the modality.

</div>

</div>

</div>

</div>

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">output_tokens_by_modality</span> <span class="field-type">array (ModalityTokens)</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

A breakdown of output token usage by modality.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The token count for a single response modality.

#### Fields

<span class="expander-icon"></span> <span class="field-name">modality</span> <span class="field-type">ResponseModality</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

The modality associated with the token count.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

#### Possible values

- `text`

  Indicates the model should return text.

- `image`

  Indicates the model should return images.

- `audio`

  Indicates the model should return audio.

- `video`

  Indicates the model should return video.

- `document`

  Indicates the model should return documents.

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">tokens</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Number of tokens for the modality.

</div>

</div>

</div>

</div>

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">tool_use_tokens_by_modality</span> <span class="field-type">array (ModalityTokens)</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

A breakdown of tool-use token usage by modality.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The token count for a single response modality.

#### Fields

<span class="expander-icon"></span> <span class="field-name">modality</span> <span class="field-type">ResponseModality</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

The modality associated with the token count.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

#### Possible values

- `text`

  Indicates the model should return text.

- `image`

  Indicates the model should return images.

- `audio`

  Indicates the model should return audio.

- `video`

  Indicates the model should return video.

- `document`

  Indicates the model should return documents.

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">tokens</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Number of tokens for the modality.

</div>

</div>

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">total_cached_tokens</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Number of tokens in the cached part of the prompt (the cached content).

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">total_input_tokens</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Number of tokens in the prompt (context).

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">total_output_tokens</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Total number of tokens across all the generated responses.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">total_thought_tokens</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Number of tokens of thoughts for thinking models.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">total_tokens</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Total token count for the interaction request (prompt + responses + other internal tokens).

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">total_tool_use_tokens</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Number of tokens present in tool-use prompt(s).

</div>

</div>

</div>

</div>

</div>

</div>

</div>

</div>

</div>

</div>

</div>

<span style="font-weight: 500;">InteractionCreatedEvent</span>

<div class="subtype-content">

<div class="field-entry">

<div class="signature">

<span class="field-name">event_id</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The event_id token to be used to resume the interaction stream, from this event.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">event_type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"interaction.created"`.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">interaction</span> <span class="field-type">InteractionSseEventInteraction</span> <span class="field-nessesity required"> (required)</span>

<div class="field-description">

Partial interaction resource emitted when the stream is created.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

Partial interaction resource emitted by interaction lifecycle SSE events. Streaming lifecycle payloads may omit fields that are only available on full non-streaming Interaction responses.

#### Fields

<div class="field-entry">

<div class="signature">

<span class="field-name">agent</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The agent to interact with.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">created</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Output only. The time at which the response was created in ISO 8601 format.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">id</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Required. Output only. A unique identifier for the interaction completion.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">model</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The model that will complete your prompt.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">object</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Output only. The resource type.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">service_tier</span> <span class="field-type">ServiceTier</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

The service tier for the interaction.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

#### Possible values

- `flex`

  Flex service tier.

- `standard`

  Standard service tier.

- `priority`

  Priority service tier.

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">status</span> <span class="field-type">enum (string)</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Required. Output only. The status of the interaction.

Possible values:

- `in_progress`

  The interaction is in progress.

- `requires_action`

  The interaction requires action/input from the user.

- `completed`

  The interaction is completed.

- `failed`

  The interaction failed.

- `cancelled`

  The interaction was cancelled.

- `incomplete`

  The interaction is completed, but contains incomplete results (e.g. hitting max_tokens).

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">steps</span> <span class="field-type">array ([Step](#Resource:Step))</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Output only. The steps that make up the interaction, if included in this event.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">updated</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Output only. The time at which the response was last updated in ISO 8601 format.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">usage</span> <span class="field-type">Usage</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

Output only. Statistics on the interaction request's token usage.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

Statistics on the interaction request's token usage.

#### Fields

<span class="expander-icon"></span> <span class="field-name">cached_tokens_by_modality</span> <span class="field-type">array (ModalityTokens)</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

A breakdown of cached token usage by modality.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The token count for a single response modality.

#### Fields

<span class="expander-icon"></span> <span class="field-name">modality</span> <span class="field-type">ResponseModality</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

The modality associated with the token count.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

#### Possible values

- `text`

  Indicates the model should return text.

- `image`

  Indicates the model should return images.

- `audio`

  Indicates the model should return audio.

- `video`

  Indicates the model should return video.

- `document`

  Indicates the model should return documents.

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">tokens</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Number of tokens for the modality.

</div>

</div>

</div>

</div>

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">grounding_tool_count</span> <span class="field-type">array (GroundingToolCount)</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

Grounding tool count.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The number of grounding tool counts.

#### Fields

<div class="field-entry">

<div class="signature">

<span class="field-name">count</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The number of grounding tool counts.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">enum (string)</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The grounding tool type associated with the count.

Possible values:

- `google_search`

  Grounding with Google Web Search and Image Search, & Web Grounding for Enterprise.

- `google_maps`

  Grounding with Google Maps.

</div>

</div>

</div>

</div>

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">input_tokens_by_modality</span> <span class="field-type">array (ModalityTokens)</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

A breakdown of input token usage by modality.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The token count for a single response modality.

#### Fields

<span class="expander-icon"></span> <span class="field-name">modality</span> <span class="field-type">ResponseModality</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

The modality associated with the token count.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

#### Possible values

- `text`

  Indicates the model should return text.

- `image`

  Indicates the model should return images.

- `audio`

  Indicates the model should return audio.

- `video`

  Indicates the model should return video.

- `document`

  Indicates the model should return documents.

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">tokens</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Number of tokens for the modality.

</div>

</div>

</div>

</div>

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">output_tokens_by_modality</span> <span class="field-type">array (ModalityTokens)</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

A breakdown of output token usage by modality.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The token count for a single response modality.

#### Fields

<span class="expander-icon"></span> <span class="field-name">modality</span> <span class="field-type">ResponseModality</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

The modality associated with the token count.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

#### Possible values

- `text`

  Indicates the model should return text.

- `image`

  Indicates the model should return images.

- `audio`

  Indicates the model should return audio.

- `video`

  Indicates the model should return video.

- `document`

  Indicates the model should return documents.

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">tokens</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Number of tokens for the modality.

</div>

</div>

</div>

</div>

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">tool_use_tokens_by_modality</span> <span class="field-type">array (ModalityTokens)</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

A breakdown of tool-use token usage by modality.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The token count for a single response modality.

#### Fields

<span class="expander-icon"></span> <span class="field-name">modality</span> <span class="field-type">ResponseModality</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

The modality associated with the token count.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

#### Possible values

- `text`

  Indicates the model should return text.

- `image`

  Indicates the model should return images.

- `audio`

  Indicates the model should return audio.

- `video`

  Indicates the model should return video.

- `document`

  Indicates the model should return documents.

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">tokens</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Number of tokens for the modality.

</div>

</div>

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">total_cached_tokens</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Number of tokens in the cached part of the prompt (the cached content).

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">total_input_tokens</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Number of tokens in the prompt (context).

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">total_output_tokens</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Total number of tokens across all the generated responses.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">total_thought_tokens</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Number of tokens of thoughts for thinking models.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">total_tokens</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Total token count for the interaction request (prompt + responses + other internal tokens).

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">total_tool_use_tokens</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Number of tokens present in tool-use prompt(s).

</div>

</div>

</div>

</div>

</div>

</div>

</div>

</div>

</div>

</div>

</div>

<span style="font-weight: 500;">InteractionStatusUpdate</span>

<div class="subtype-content">

<div class="field-entry">

<div class="signature">

<span class="field-name">event_id</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The event_id token to be used to resume the interaction stream, from this event.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">event_type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"interaction.status_update"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">interaction_id</span> <span class="field-type">string</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">status</span> <span class="field-type">enum (string)</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Possible values:

- `in_progress`

  The interaction is in progress.

- `requires_action`

  The interaction requires action/input from the user.

- `completed`

  The interaction is completed.

- `failed`

  The interaction failed.

- `cancelled`

  The interaction was cancelled.

- `incomplete`

  The interaction is completed, but contains incomplete results (e.g. hitting max_tokens).

- `budget_exceeded`

  The interaction was halted because the token budget was exceeded.

</div>

</div>

</div>

<span style="font-weight: 500;">StepDelta</span>

<div class="subtype-content">

<span class="expander-icon"></span> <span class="field-name">delta</span> <span class="field-type">StepDeltaData</span> <span class="field-nessesity required"> (required)</span>

<div class="field-description">

No description provided.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

#### Possible Types

<span style="font-weight: 500;">ArgumentsDelta</span>

<div class="subtype-content">

<div class="field-entry">

<div class="signature">

<span class="field-name">arguments</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

No description provided.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"arguments_delta"`.

</div>

</div>

</div>

<span style="font-weight: 500;">AudioDelta</span>

<div class="subtype-content">

<div class="field-entry">

<div class="signature">

<span class="field-name">channels</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The number of audio channels.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">data</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

No description provided.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">mime_type</span> <span class="field-type">enum (string)</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

No description provided.

Possible values:

- `audio/wav`

  WAV audio format

- `audio/mp3`

  MP3 audio format

- `audio/aiff`

  AIFF audio format

- `audio/aac`

  AAC audio format

- `audio/ogg`

  OGG audio format

- `audio/flac`

  FLAC audio format

- `audio/mpeg`

  MPEG audio format

- `audio/m4a`

  M4A audio format

- `audio/l16`

  L16 audio format

- `audio/opus`

  OPUS audio format

- `audio/alaw`

  ALAW audio format

- `audio/mulaw`

  MULAW audio format

- `audio/webm`

  WEBM audio format

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">sample_rate</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The sample rate of the audio.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"audio"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">uri</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

No description provided.

</div>

</div>

</div>

<span style="font-weight: 500;">CodeExecutionCallDelta</span>

<div class="subtype-content">

<span class="expander-icon"></span> <span class="field-name">arguments</span> <span class="field-type">CodeExecutionCallArguments</span> <span class="field-nessesity required"> (required)</span>

<div class="field-description">

No description provided.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The arguments to pass to the code execution.

#### Fields

<div class="field-entry">

<div class="signature">

<span class="field-name">code</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The code to be executed.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">language</span> <span class="field-type">enum (string)</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Programming language of the \`code\`.

Possible values:

- `python`

  Python \>= 3.10, with numpy and simpy available.

</div>

</div>

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">signature</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

A signature hash for backend validation.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"code_execution_call"`.

</div>

</div>

</div>

<span style="font-weight: 500;">CodeExecutionResultDelta</span>

<div class="subtype-content">

<div class="field-entry">

<div class="signature">

<span class="field-name">is_error</span> <span class="field-type">boolean</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

No description provided.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">result</span> <span class="field-type">string</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">signature</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

A signature hash for backend validation.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"code_execution_result"`.

</div>

</div>

</div>

<span style="font-weight: 500;">DocumentDelta</span>

<div class="subtype-content">

<div class="field-entry">

<div class="signature">

<span class="field-name">data</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

No description provided.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">mime_type</span> <span class="field-type">enum (string)</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

No description provided.

Possible values:

- `application/pdf`

  PDF document format

- `text/csv`

  CSV document format

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"document"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">uri</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

No description provided.

</div>

</div>

</div>

<span style="font-weight: 500;">FileSearchCallDelta</span>

<div class="subtype-content">

<div class="field-entry">

<div class="signature">

<span class="field-name">signature</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

A signature hash for backend validation.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"file_search_call"`.

</div>

</div>

</div>

<span style="font-weight: 500;">FileSearchResultDelta</span>

<div class="subtype-content">

<span class="expander-icon"></span> <span class="field-name">result</span> <span class="field-type">array (FileSearchResult)</span> <span class="field-nessesity required"> (required)</span>

<div class="field-description">

No description provided.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The result of the File Search.

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">signature</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

A signature hash for backend validation.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"file_search_result"`.

</div>

</div>

</div>

<span style="font-weight: 500;">FunctionResultDelta</span>

<div class="subtype-content">

<div class="field-entry">

<div class="signature">

<span class="field-name">is_error</span> <span class="field-type">boolean</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

No description provided.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">name</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

No description provided.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">result</span> <span class="field-type">array ([ImageContent](#Resource:ImageContent) or [TextContent](#Resource:TextContent)) or object or string</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"function_result"`.

</div>

</div>

</div>

<span style="font-weight: 500;">GoogleMapsCallDelta</span>

<div class="subtype-content">

<span class="expander-icon"></span> <span class="field-name">arguments</span> <span class="field-type">GoogleMapsCallArguments</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

The arguments to pass to the Google Maps tool.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The arguments to pass to the Google Maps tool.

#### Fields

<div class="field-entry">

<div class="signature">

<span class="field-name">queries</span> <span class="field-type">array (string)</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The queries to be executed.

</div>

</div>

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">signature</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

A signature hash for backend validation.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"google_maps_call"`.

</div>

</div>

</div>

<span style="font-weight: 500;">GoogleMapsResultDelta</span>

<div class="subtype-content">

<span class="expander-icon"></span> <span class="field-name">result</span> <span class="field-type">array (GoogleMapsResult)</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

The results of the Google Maps.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The result of the Google Maps.

#### Fields

<span class="expander-icon"></span> <span class="field-name">places</span> <span class="field-type">array (Places)</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

The places that were found.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

#### Fields

<div class="field-entry">

<div class="signature">

<span class="field-name">name</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Title of the place.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">place_id</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The ID of the place, in \`places/{place_id}\` format.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">review_snippets</span> <span class="field-type">array (ReviewSnippet)</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

Snippets of reviews that are used to generate answers about the features of a given place in Google Maps.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

Encapsulates a snippet of a user review that answers a question about the features of a specific place in Google Maps.

#### Fields

<div class="field-entry">

<div class="signature">

<span class="field-name">review_id</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The ID of the review snippet.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">title</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Title of the review.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">url</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

A link that corresponds to the user review on Google Maps.

</div>

</div>

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">url</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

URI reference of the place.

</div>

</div>

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">widget_context_token</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Resource name of the Google Maps widget context token.

</div>

</div>

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">signature</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

A signature hash for backend validation.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"google_maps_result"`.

</div>

</div>

</div>

<span style="font-weight: 500;">GoogleSearchCallDelta</span>

<div class="subtype-content">

<span class="expander-icon"></span> <span class="field-name">arguments</span> <span class="field-type">GoogleSearchCallArguments</span> <span class="field-nessesity required"> (required)</span>

<div class="field-description">

No description provided.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The arguments to pass to Google Search.

#### Fields

<div class="field-entry">

<div class="signature">

<span class="field-name">queries</span> <span class="field-type">array (string)</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Web search queries for the following-up web search.

</div>

</div>

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">signature</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

A signature hash for backend validation.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"google_search_call"`.

</div>

</div>

</div>

<span style="font-weight: 500;">GoogleSearchResultDelta</span>

<div class="subtype-content">

<div class="field-entry">

<div class="signature">

<span class="field-name">is_error</span> <span class="field-type">boolean</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

No description provided.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">result</span> <span class="field-type">array (GoogleSearchResult)</span> <span class="field-nessesity required"> (required)</span>

<div class="field-description">

No description provided.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The result of the Google Search.

#### Fields

<div class="field-entry">

<div class="signature">

<span class="field-name">search_suggestions</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Web content snippet that can be embedded in a web page or an app webview.

</div>

</div>

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">signature</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

A signature hash for backend validation.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"google_search_result"`.

</div>

</div>

</div>

<span style="font-weight: 500;">ImageDelta</span>

<div class="subtype-content">

<div class="field-entry">

<div class="signature">

<span class="field-name">data</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

No description provided.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">mime_type</span> <span class="field-type">enum (string)</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

No description provided.

Possible values:

- `image/png`

  PNG image format

- `image/jpeg`

  JPEG image format

- `image/webp`

  WebP image format

- `image/heic`

  HEIC image format

- `image/heif`

  HEIF image format

- `image/gif`

  GIF image format

- `image/bmp`

  BMP image format

- `image/tiff`

  TIFF image format

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">resolution</span> <span class="field-type">MediaResolution</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

The resolution of the media.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

#### Possible values

- `low`

  Low resolution.

- `medium`

  Medium resolution.

- `high`

  High resolution.

- `ultra_high`

  Ultra high resolution.

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"image"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">uri</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

No description provided.

</div>

</div>

</div>

<span style="font-weight: 500;">McpServerToolCallDelta</span>

<div class="subtype-content">

<div class="field-entry">

<div class="signature">

<span class="field-name">arguments</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">name</span> <span class="field-type">string</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">server_name</span> <span class="field-type">string</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"mcp_server_tool_call"`.

</div>

</div>

</div>

<span style="font-weight: 500;">McpServerToolResultDelta</span>

<div class="subtype-content">

<div class="field-entry">

<div class="signature">

<span class="field-name">name</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

No description provided.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">result</span> <span class="field-type">array ([ImageContent](#Resource:ImageContent) or [TextContent](#Resource:TextContent)) or object or string</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">server_name</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

No description provided.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"mcp_server_tool_result"`.

</div>

</div>

</div>

<span style="font-weight: 500;">ProcessingCallDelta</span>

<div class="subtype-content">

Streaming delta for a server-initiated media processing step.

<div class="field-entry">

<div class="signature">

<span class="field-name">signature</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

A signature hash for backend validation.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"processing_call"`.

</div>

</div>

</div>

<span style="font-weight: 500;">ProcessingResultDelta</span>

<div class="subtype-content">

Streaming delta for the result of a server-initiated media processing step.

<div class="field-entry">

<div class="signature">

<span class="field-name">signature</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

A signature hash for backend validation.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"processing_result"`.

</div>

</div>

</div>

<span style="font-weight: 500;">TextAnnotationDelta</span>

<div class="subtype-content">

<span class="expander-icon"></span> <span class="field-name">annotations</span> <span class="field-type">array (Annotation)</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

Citation information for model-generated content.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

Citation information for model-generated content.

#### Possible Types

<span style="font-weight: 500;">FileCitation</span>

<div class="subtype-content">

A file citation annotation.

<div class="field-entry">

<div class="signature">

<span class="field-name">custom_metadata</span> <span class="field-type">object</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

User provided metadata about the retrieved context.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">document_uri</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The URI of the file.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">end_index</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

End of the attributed segment, exclusive.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">file_name</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The name of the file.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">media_id</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Media ID in-case of image citations, if applicable.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">page_number</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Page number of the cited document, if applicable.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">source</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Source attributed for a portion of the text.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">start_index</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Start of segment of the response that is attributed to this source. Index indicates the start of the segment, measured in bytes.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"file_citation"`.

</div>

</div>

</div>

<span style="font-weight: 500;">PlaceCitation</span>

<div class="subtype-content">

A place citation annotation.

<div class="field-entry">

<div class="signature">

<span class="field-name">end_index</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

End of the attributed segment, exclusive.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">name</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Title of the place.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">place_id</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The ID of the place, in \`places/{place_id}\` format.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">review_snippets</span> <span class="field-type">array (ReviewSnippet)</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

Snippets of reviews that are used to generate answers about the features of a given place in Google Maps.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

Encapsulates a snippet of a user review that answers a question about the features of a specific place in Google Maps.

#### Fields

<div class="field-entry">

<div class="signature">

<span class="field-name">review_id</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The ID of the review snippet.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">title</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Title of the review.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">url</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

A link that corresponds to the user review on Google Maps.

</div>

</div>

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">start_index</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Start of segment of the response that is attributed to this source. Index indicates the start of the segment, measured in bytes.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"place_citation"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">url</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

URI reference of the place.

</div>

</div>

</div>

<span style="font-weight: 500;">UrlCitation</span>

<div class="subtype-content">

A URL citation annotation.

<div class="field-entry">

<div class="signature">

<span class="field-name">end_index</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

End of the attributed segment, exclusive.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">start_index</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Start of segment of the response that is attributed to this source. Index indicates the start of the segment, measured in bytes.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">title</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The title of the URL.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"url_citation"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">url</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The URL.

</div>

</div>

</div>

<span style="font-weight: 500;">WordInfo</span>

<div class="subtype-content">

Word-level ASR annotation for transcription output. Carries the word text, optional timing, and optional speaker attribution.

<div class="field-entry">

<div class="signature">

<span class="field-name">end_index</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

End of the attributed segment, exclusive.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">end_offset</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

End offset in time of the word relative to the start of the audio. Present when timestamp_granularities contains "word".

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">speaker</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Optional. Speaker label for this word (e.g. "spk_1", "spk_2"). Present when diarization_mode is set in TranscriptionConfig.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">start_index</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Start of segment of the response that is attributed to this source. Index indicates the start of the segment, measured in bytes.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">start_offset</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Start offset in time of the word relative to the start of the audio. Present when timestamp_granularities contains "word".

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">text</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The transcribed word.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"word_info"`.

</div>

</div>

</div>

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"text_annotation_delta"`.

</div>

</div>

</div>

<span style="font-weight: 500;">TextDelta</span>

<div class="subtype-content">

<div class="field-entry">

<div class="signature">

<span class="field-name">text</span> <span class="field-type">string</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"text"`.

</div>

</div>

</div>

<span style="font-weight: 500;">ThoughtSignatureDelta</span>

<div class="subtype-content">

<div class="field-entry">

<div class="signature">

<span class="field-name">signature</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Signature to match the backend source to be part of the generation.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"thought_signature"`.

</div>

</div>

</div>

<span style="font-weight: 500;">ThoughtSummaryDelta</span>

<div class="subtype-content">

<div class="field-entry">

<div class="signature">

<span class="field-name">content</span> <span class="field-type">[Content](#Resource:Content)</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

A new summary item to be added to the thought.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"thought_summary"`.

</div>

</div>

</div>

<span style="font-weight: 500;">UrlContextCallDelta</span>

<div class="subtype-content">

<span class="expander-icon"></span> <span class="field-name">arguments</span> <span class="field-type">UrlContextCallArguments</span> <span class="field-nessesity required"> (required)</span>

<div class="field-description">

No description provided.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The arguments to pass to the URL context.

#### Fields

<div class="field-entry">

<div class="signature">

<span class="field-name">urls</span> <span class="field-type">array (string)</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The URLs to fetch.

</div>

</div>

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">signature</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

A signature hash for backend validation.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"url_context_call"`.

</div>

</div>

</div>

<span style="font-weight: 500;">UrlContextResultDelta</span>

<div class="subtype-content">

<div class="field-entry">

<div class="signature">

<span class="field-name">is_error</span> <span class="field-type">boolean</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

No description provided.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">result</span> <span class="field-type">array (UrlContextResult)</span> <span class="field-nessesity required"> (required)</span>

<div class="field-description">

No description provided.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The result of the URL context.

#### Fields

<div class="field-entry">

<div class="signature">

<span class="field-name">status</span> <span class="field-type">enum (string)</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The status of the URL retrieval.

Possible values:

- `success`

  Url retrieval is successful.

- `error`

  Url retrieval is failed due to error.

- `paywall`

  Url retrieval is failed because the content is behind paywall.

- `unsafe`

  Url retrieval is failed because the content is unsafe.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">url</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The URL that was fetched.

</div>

</div>

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">signature</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

A signature hash for backend validation.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"url_context_result"`.

</div>

</div>

</div>

<span style="font-weight: 500;">VideoDelta</span>

<div class="subtype-content">

<div class="field-entry">

<div class="signature">

<span class="field-name">data</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

No description provided.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">mime_type</span> <span class="field-type">enum (string)</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

No description provided.

Possible values:

- `video/mp4`

  MP4 video format

- `video/mpeg`

  MPEG video format

- `video/mpg`

  MPG video format

- `video/mov`

  MOV video format

- `video/avi`

  AVI video format

- `video/x-flv`

  FLV video format

- `video/webm`

  WebM video format

- `video/wmv`

  WMV video format

- `video/3gpp`

  3GPP video format

- `video/jpeg2000`

  JPEG 2000 video format

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">resolution</span> <span class="field-type">MediaResolution</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

The resolution of the media.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

#### Possible values

- `low`

  Low resolution.

- `medium`

  Medium resolution.

- `high`

  High resolution.

- `ultra_high`

  Ultra high resolution.

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"video"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">uri</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

No description provided.

</div>

</div>

</div>

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">event_id</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The event_id token to be used to resume the interaction stream, from this event.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">event_type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"step.delta"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">index</span> <span class="field-type">integer</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">metadata</span> <span class="field-type">StepDeltaMetadata</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

No description provided.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

Optional metadata accompanying ANY streamed event.

#### Fields

<span class="expander-icon"></span> <span class="field-name">total_usage</span> <span class="field-type">Usage</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

Statistics on the interaction request's token usage.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

Statistics on the interaction request's token usage.

#### Fields

<span class="expander-icon"></span> <span class="field-name">cached_tokens_by_modality</span> <span class="field-type">array (ModalityTokens)</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

A breakdown of cached token usage by modality.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The token count for a single response modality.

#### Fields

<span class="expander-icon"></span> <span class="field-name">modality</span> <span class="field-type">ResponseModality</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

The modality associated with the token count.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

#### Possible values

- `text`

  Indicates the model should return text.

- `image`

  Indicates the model should return images.

- `audio`

  Indicates the model should return audio.

- `video`

  Indicates the model should return video.

- `document`

  Indicates the model should return documents.

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">tokens</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Number of tokens for the modality.

</div>

</div>

</div>

</div>

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">grounding_tool_count</span> <span class="field-type">array (GroundingToolCount)</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

Grounding tool count.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The number of grounding tool counts.

#### Fields

<div class="field-entry">

<div class="signature">

<span class="field-name">count</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The number of grounding tool counts.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">enum (string)</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The grounding tool type associated with the count.

Possible values:

- `google_search`

  Grounding with Google Web Search and Image Search, & Web Grounding for Enterprise.

- `google_maps`

  Grounding with Google Maps.

</div>

</div>

</div>

</div>

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">input_tokens_by_modality</span> <span class="field-type">array (ModalityTokens)</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

A breakdown of input token usage by modality.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The token count for a single response modality.

#### Fields

<span class="expander-icon"></span> <span class="field-name">modality</span> <span class="field-type">ResponseModality</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

The modality associated with the token count.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

#### Possible values

- `text`

  Indicates the model should return text.

- `image`

  Indicates the model should return images.

- `audio`

  Indicates the model should return audio.

- `video`

  Indicates the model should return video.

- `document`

  Indicates the model should return documents.

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">tokens</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Number of tokens for the modality.

</div>

</div>

</div>

</div>

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">output_tokens_by_modality</span> <span class="field-type">array (ModalityTokens)</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

A breakdown of output token usage by modality.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The token count for a single response modality.

#### Fields

<span class="expander-icon"></span> <span class="field-name">modality</span> <span class="field-type">ResponseModality</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

The modality associated with the token count.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

#### Possible values

- `text`

  Indicates the model should return text.

- `image`

  Indicates the model should return images.

- `audio`

  Indicates the model should return audio.

- `video`

  Indicates the model should return video.

- `document`

  Indicates the model should return documents.

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">tokens</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Number of tokens for the modality.

</div>

</div>

</div>

</div>

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">tool_use_tokens_by_modality</span> <span class="field-type">array (ModalityTokens)</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

A breakdown of tool-use token usage by modality.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The token count for a single response modality.

#### Fields

<span class="expander-icon"></span> <span class="field-name">modality</span> <span class="field-type">ResponseModality</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

The modality associated with the token count.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

#### Possible values

- `text`

  Indicates the model should return text.

- `image`

  Indicates the model should return images.

- `audio`

  Indicates the model should return audio.

- `video`

  Indicates the model should return video.

- `document`

  Indicates the model should return documents.

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">tokens</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Number of tokens for the modality.

</div>

</div>

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">total_cached_tokens</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Number of tokens in the cached part of the prompt (the cached content).

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">total_input_tokens</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Number of tokens in the prompt (context).

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">total_output_tokens</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Total number of tokens across all the generated responses.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">total_thought_tokens</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Number of tokens of thoughts for thinking models.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">total_tokens</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Total token count for the interaction request (prompt + responses + other internal tokens).

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">total_tool_use_tokens</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Number of tokens present in tool-use prompt(s).

</div>

</div>

</div>

</div>

</div>

</div>

</div>

</div>

</div>

</div>

</div>

<span style="font-weight: 500;">StepStart</span>

<div class="subtype-content">

<div class="field-entry">

<div class="signature">

<span class="field-name">event_id</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The event_id token to be used to resume the interaction stream, from this event.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">event_type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"step.start"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">index</span> <span class="field-type">integer</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">step</span> <span class="field-type">[Step](#Resource:Step)</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

</div>

</div>

</div>

<span style="font-weight: 500;">StepStop</span>

<div class="subtype-content">

<div class="field-entry">

<div class="signature">

<span class="field-name">event_id</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The event_id token to be used to resume the interaction stream, from this event.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">event_type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"step.stop"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">index</span> <span class="field-type">integer</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">step_usage</span> <span class="field-type">Usage</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

Model usage stats for this specific step.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

Statistics on the interaction request's token usage.

#### Fields

<span class="expander-icon"></span> <span class="field-name">cached_tokens_by_modality</span> <span class="field-type">array (ModalityTokens)</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

A breakdown of cached token usage by modality.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The token count for a single response modality.

#### Fields

<span class="expander-icon"></span> <span class="field-name">modality</span> <span class="field-type">ResponseModality</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

The modality associated with the token count.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

#### Possible values

- `text`

  Indicates the model should return text.

- `image`

  Indicates the model should return images.

- `audio`

  Indicates the model should return audio.

- `video`

  Indicates the model should return video.

- `document`

  Indicates the model should return documents.

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">tokens</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Number of tokens for the modality.

</div>

</div>

</div>

</div>

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">grounding_tool_count</span> <span class="field-type">array (GroundingToolCount)</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

Grounding tool count.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The number of grounding tool counts.

#### Fields

<div class="field-entry">

<div class="signature">

<span class="field-name">count</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The number of grounding tool counts.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">enum (string)</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The grounding tool type associated with the count.

Possible values:

- `google_search`

  Grounding with Google Web Search and Image Search, & Web Grounding for Enterprise.

- `google_maps`

  Grounding with Google Maps.

</div>

</div>

</div>

</div>

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">input_tokens_by_modality</span> <span class="field-type">array (ModalityTokens)</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

A breakdown of input token usage by modality.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The token count for a single response modality.

#### Fields

<span class="expander-icon"></span> <span class="field-name">modality</span> <span class="field-type">ResponseModality</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

The modality associated with the token count.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

#### Possible values

- `text`

  Indicates the model should return text.

- `image`

  Indicates the model should return images.

- `audio`

  Indicates the model should return audio.

- `video`

  Indicates the model should return video.

- `document`

  Indicates the model should return documents.

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">tokens</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Number of tokens for the modality.

</div>

</div>

</div>

</div>

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">output_tokens_by_modality</span> <span class="field-type">array (ModalityTokens)</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

A breakdown of output token usage by modality.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The token count for a single response modality.

#### Fields

<span class="expander-icon"></span> <span class="field-name">modality</span> <span class="field-type">ResponseModality</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

The modality associated with the token count.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

#### Possible values

- `text`

  Indicates the model should return text.

- `image`

  Indicates the model should return images.

- `audio`

  Indicates the model should return audio.

- `video`

  Indicates the model should return video.

- `document`

  Indicates the model should return documents.

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">tokens</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Number of tokens for the modality.

</div>

</div>

</div>

</div>

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">tool_use_tokens_by_modality</span> <span class="field-type">array (ModalityTokens)</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

A breakdown of tool-use token usage by modality.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The token count for a single response modality.

#### Fields

<span class="expander-icon"></span> <span class="field-name">modality</span> <span class="field-type">ResponseModality</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

The modality associated with the token count.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

#### Possible values

- `text`

  Indicates the model should return text.

- `image`

  Indicates the model should return images.

- `audio`

  Indicates the model should return audio.

- `video`

  Indicates the model should return video.

- `document`

  Indicates the model should return documents.

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">tokens</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Number of tokens for the modality.

</div>

</div>

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">total_cached_tokens</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Number of tokens in the cached part of the prompt (the cached content).

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">total_input_tokens</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Number of tokens in the prompt (context).

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">total_output_tokens</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Total number of tokens across all the generated responses.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">total_thought_tokens</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Number of tokens of thoughts for thinking models.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">total_tokens</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Total token count for the interaction request (prompt + responses + other internal tokens).

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">total_tool_use_tokens</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Number of tokens present in tool-use prompt(s).

</div>

</div>

</div>

</div>

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">usage</span> <span class="field-type">Usage</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

Cumulative model usage stats from the start of the session.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

Statistics on the interaction request's token usage.

#### Fields

<span class="expander-icon"></span> <span class="field-name">cached_tokens_by_modality</span> <span class="field-type">array (ModalityTokens)</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

A breakdown of cached token usage by modality.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The token count for a single response modality.

#### Fields

<span class="expander-icon"></span> <span class="field-name">modality</span> <span class="field-type">ResponseModality</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

The modality associated with the token count.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

#### Possible values

- `text`

  Indicates the model should return text.

- `image`

  Indicates the model should return images.

- `audio`

  Indicates the model should return audio.

- `video`

  Indicates the model should return video.

- `document`

  Indicates the model should return documents.

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">tokens</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Number of tokens for the modality.

</div>

</div>

</div>

</div>

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">grounding_tool_count</span> <span class="field-type">array (GroundingToolCount)</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

Grounding tool count.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The number of grounding tool counts.

#### Fields

<div class="field-entry">

<div class="signature">

<span class="field-name">count</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The number of grounding tool counts.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">enum (string)</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The grounding tool type associated with the count.

Possible values:

- `google_search`

  Grounding with Google Web Search and Image Search, & Web Grounding for Enterprise.

- `google_maps`

  Grounding with Google Maps.

</div>

</div>

</div>

</div>

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">input_tokens_by_modality</span> <span class="field-type">array (ModalityTokens)</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

A breakdown of input token usage by modality.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The token count for a single response modality.

#### Fields

<span class="expander-icon"></span> <span class="field-name">modality</span> <span class="field-type">ResponseModality</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

The modality associated with the token count.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

#### Possible values

- `text`

  Indicates the model should return text.

- `image`

  Indicates the model should return images.

- `audio`

  Indicates the model should return audio.

- `video`

  Indicates the model should return video.

- `document`

  Indicates the model should return documents.

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">tokens</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Number of tokens for the modality.

</div>

</div>

</div>

</div>

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">output_tokens_by_modality</span> <span class="field-type">array (ModalityTokens)</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

A breakdown of output token usage by modality.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The token count for a single response modality.

#### Fields

<span class="expander-icon"></span> <span class="field-name">modality</span> <span class="field-type">ResponseModality</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

The modality associated with the token count.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

#### Possible values

- `text`

  Indicates the model should return text.

- `image`

  Indicates the model should return images.

- `audio`

  Indicates the model should return audio.

- `video`

  Indicates the model should return video.

- `document`

  Indicates the model should return documents.

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">tokens</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Number of tokens for the modality.

</div>

</div>

</div>

</div>

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">tool_use_tokens_by_modality</span> <span class="field-type">array (ModalityTokens)</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

A breakdown of tool-use token usage by modality.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The token count for a single response modality.

#### Fields

<span class="expander-icon"></span> <span class="field-name">modality</span> <span class="field-type">ResponseModality</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

The modality associated with the token count.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

#### Possible values

- `text`

  Indicates the model should return text.

- `image`

  Indicates the model should return images.

- `audio`

  Indicates the model should return audio.

- `video`

  Indicates the model should return video.

- `document`

  Indicates the model should return documents.

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">tokens</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Number of tokens for the modality.

</div>

</div>

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">total_cached_tokens</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Number of tokens in the cached part of the prompt (the cached content).

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">total_input_tokens</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Number of tokens in the prompt (context).

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">total_output_tokens</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Total number of tokens across all the generated responses.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">total_thought_tokens</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Number of tokens of thoughts for thinking models.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">total_tokens</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Total token count for the interaction request (prompt + responses + other internal tokens).

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">total_tool_use_tokens</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Number of tokens present in tool-use prompt(s).

</div>

</div>

</div>

</div>

</div>

</div>

</div>

</div>

<div class="second-column">

<div class="examples">

### Examples

<div class="section">

### Error Event

<div class="schema-example-content">

<div>

</div>

``` devsite-click-to-copy
{
  "error": {
    "code": "not_found",
    "message": "Failed to get completed interaction: Result not found."
  },
  "event_type": "error"
}
```

</div>

</div>

<div class="section">

### Interaction Completed

<div class="schema-example-content">

<div>

</div>

``` devsite-click-to-copy
{
  "event_id": "evt_123",
  "event_type": "interaction.completed",
  "interaction": {
    "created": "2025-12-04T15:01:45Z",
    "id": "v1_ChdXS0l4YWZXTk9xbk0xZThQczhEcmlROBIXV0tJeGFmV05PcW5NMWU4UHM4RHJpUTg",
    "model": "gemini-3.6-flash",
    "status": "completed",
    "updated": "2025-12-04T15:01:45Z"
  }
}
```

</div>

</div>

<div class="section">

### Interaction Completed

<div class="schema-example-content">

<div>

</div>

``` devsite-click-to-copy
{
  "event_id": "evt_123",
  "event_type": "interaction.completed",
  "interaction": {
    "created": "2025-12-04T15:01:45Z",
    "id": "v1_ChdXS0l4YWZXTk9xbk0xZThQczhEcmlROBIXV0tJeGFmV05PcW5NMWU4UHM4RHJpUTg",
    "model": "gemini-3-flash-preview",
    "object": "interaction",
    "status": "completed",
    "updated": "2025-12-04T15:01:45Z"
  }
}
```

</div>

</div>

<div class="section">

### Interaction Created

<div class="schema-example-content">

<div>

</div>

``` devsite-click-to-copy
{
  "event_id": "evt_123",
  "event_type": "interaction.created",
  "interaction": {
    "created": "2025-12-04T15:01:45Z",
    "id": "v1_ChdXS0l4YWZXTk9xbk0xZThQczhEcmlROBIXV0tJeGFmV05PcW5NMWU4UHM4RHJpUTg",
    "model": "gemini-3.6-flash",
    "status": "in_progress",
    "updated": "2025-12-04T15:01:45Z"
  }
}
```

</div>

</div>

<div class="section">

### Interaction Created

<div class="schema-example-content">

<div>

</div>

``` devsite-click-to-copy
{
  "event_id": "evt_123",
  "event_type": "interaction.created",
  "interaction": {
    "id": "v1_ChdXS0l4YWZXTk9xbk0xZThQczhEcmlROBIXV0tJeGFmV05PcW5NMWU4UHM4RHJpUTg",
    "model": "gemini-3-flash-preview",
    "object": "interaction",
    "status": "in_progress"
  }
}
```

</div>

</div>

<div class="section">

### Interaction Status Update

<div class="schema-example-content">

<div>

</div>

``` devsite-click-to-copy
{
  "event_type": "interaction.status_update",
  "interaction_id": "v1_ChdTMjQ0YWJ5TUF1TzcxZThQdjRpcnFRcxIXUzI0NGFieU1BdU83MWU4UHY0aXJxUXM",
  "status": "in_progress"
}
```

</div>

</div>

<div class="section">

### Step Delta

<div class="schema-example-content">

<div>

</div>

``` devsite-click-to-copy
{
  "delta": {
    "type": "text",
    "text": "Hello"
  },
  "event_type": "step.delta",
  "index": 0
}
```

</div>

</div>

<div class="section">

### Step Start

<div class="schema-example-content">

<div>

</div>

``` devsite-click-to-copy
{
  "event_type": "step.start",
  "index": 0,
  "step": {
    "type": "model_output"
  }
}
```

</div>

</div>

<div class="section">

### Step Stop

<div class="schema-example-content">

<div>

</div>

``` devsite-click-to-copy
{
  "event_type": "step.stop",
  "index": 0
}
```

</div>

</div>

</div>

</div>

</div>

</div>

</div>

<div itemscope="" itemtype="http://developers.google.com/ReferenceObject">

### ResponseFormat

<div class="section prototype">

<div class="column-container">

<div class="reference">

### Possible Types

<span style="font-weight: 500;">AudioResponseFormat</span>

<div class="subtype-content">

Configuration for audio output format.

<div class="field-entry">

<div class="signature">

<span class="field-name">bit_rate</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Bit rate in bits per second (bps). Only applicable for compressed formats (MP3, Opus).

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">delivery</span> <span class="field-type">enum (string)</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The delivery mode for the audio output.

Possible values:

- `inline`

  Audio data is returned inline in the response.

- `uri`

  Audio data is returned as a URI.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">mime_type</span> <span class="field-type">enum (string)</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The MIME type of the audio output.

Possible values:

- `audio/mp3`

  MP3 audio format.

- `audio/ogg_opus`

  OGG Opus audio format.

- `audio/l16`

  Raw PCM (L16) audio format.

- `audio/wav`

  WAV audio format.

- `audio/alaw`

  A-law audio format.

- `audio/mulaw`

  Mu-law audio format.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">sample_rate</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Sample rate in Hz.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"audio"`.

</div>

</div>

</div>

<span style="font-weight: 500;">ImageResponseFormat</span>

<div class="subtype-content">

Configuration for image output format.

<div class="field-entry">

<div class="signature">

<span class="field-name">aspect_ratio</span> <span class="field-type">enum (string)</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The aspect ratio for the image output.

Possible values:

- `1:1`

  1:1 aspect ratio.

- `2:3`

  2:3 aspect ratio.

- `3:2`

  3:2 aspect ratio.

- `3:4`

  3:4 aspect ratio.

- `4:3`

  4:3 aspect ratio.

- `4:5`

  4:5 aspect ratio.

- `5:4`

  5:4 aspect ratio.

- `9:16`

  9:16 aspect ratio.

- `16:9`

  16:9 aspect ratio.

- `21:9`

  21:9 aspect ratio.

- `1:8`

  1:8 aspect ratio.

- `8:1`

  8:1 aspect ratio.

- `1:4`

  1:4 aspect ratio.

- `4:1`

  4:1 aspect ratio.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">delivery</span> <span class="field-type">enum (string)</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The delivery mode for the image output.

Possible values:

- `inline`

  Image data is returned inline in the response.

- `uri`

  Image data is returned as a URI.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">image_size</span> <span class="field-type">enum (string)</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The size of the image output.

Possible values:

- `512`

  512px image size.

- `1K`

  1K image size.

- `2K`

  2K image size.

- `4K`

  4K image size.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">mime_type</span> <span class="field-type">enum (string)</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The MIME type of the image output.

Possible values:

- `image/jpeg`

  JPEG image format.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"image"`.

</div>

</div>

</div>

<span style="font-weight: 500;">TextResponseFormat</span>

<div class="subtype-content">

Configuration for text output format.

<div class="field-entry">

<div class="signature">

<span class="field-name">mime_type</span> <span class="field-type">enum (string)</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The MIME type of the text output.

Possible values:

- `application/json`

  JSON output format.

- `text/plain`

  Plain text output format.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">schema</span> <span class="field-type">object</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The JSON schema that the output should conform to. Only applicable when mime_type is application/json.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"text"`.

</div>

</div>

</div>

<span style="font-weight: 500;">VideoResponseFormat</span>

<div class="subtype-content">

Configuration for video output format.

<div class="field-entry">

<div class="signature">

<span class="field-name">aspect_ratio</span> <span class="field-type">enum (string)</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The aspect ratio for the video output.

Possible values:

- `16:9`

  16:9 aspect ratio.

- `9:16`

  9:16 aspect ratio.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">delivery</span> <span class="field-type">enum (string)</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The delivery mode for the video output.

Possible values:

- `inline`

  Video data is returned inline in the response.

- `uri`

  Video data is returned as a URI.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">duration</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The duration for the video output.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">resolution</span> <span class="field-type">enum (string)</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The video output resolution. Defaults to 720p.

Possible values:

- `360p`

  360p resolution.

- `720p`

  720p resolution.

- `1080p`

  1080p resolution.

- `4k`

  4K resolution.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"video"`.

</div>

</div>

</div>

</div>

<div class="second-column">

<div class="examples">

### Examples

<div class="section">

### Audio Output

<div class="schema-example-content">

<div>

</div>

``` devsite-click-to-copy
{
  "type": "audio",
  "sample_rate": 24000
}
```

</div>

</div>

<div class="section">

### Image Output

<div class="schema-example-content">

<div>

</div>

``` devsite-click-to-copy
{
  "type": "image",
  "aspect_ratio": "16:9",
  "image_size": "1K",
  "mime_type": "image/jpeg"
}
```

</div>

</div>

<div class="section">

### Text Output (JSON Schema)

<div class="schema-example-content">

<div>

</div>

``` devsite-click-to-copy
{
  "type": "text",
  "mime_type": "application/json",
  "schema": {
    "type": "object",
    "properties": {
      "ingredients": {
        "type": "array",
        "items": {
          "type": "string"
        }
      },
      "recipe_name": {
        "type": "string"
      }
    },
    "required": [
      "ingredients",
      "recipe_name"
    ]
  }
}
```

</div>

</div>

<div class="section">

### Video Output

<div class="schema-example-content">

<div>

</div>

``` devsite-click-to-copy
{
  "type": "video",
  "aspect_ratio": "16:9",
  "delivery": "inline"
}
```

</div>

</div>

</div>

</div>

</div>

</div>

</div>

<div itemscope="" itemtype="http://developers.google.com/ReferenceObject">

### Step

<div class="section prototype">

<div class="column-container">

<div class="reference">

A step in the interaction.

### Possible Types

<span style="font-weight: 500;">CodeExecutionCallStep</span>

<div class="subtype-content">

Code execution call step.

<span class="expander-icon"></span> <span class="field-name">arguments</span> <span class="field-type">CodeExecutionCallStepArguments</span> <span class="field-nessesity required"> (required)</span>

<div class="field-description">

Required. The arguments to pass to the code execution.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The arguments to pass to the code execution.

#### Fields

<div class="field-entry">

<div class="signature">

<span class="field-name">code</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The code to be executed.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">language</span> <span class="field-type">enum (string)</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Programming language of the \`code\`.

Possible values:

- `python`

  Python \>= 3.10, with numpy and simpy available.

</div>

</div>

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">id</span> <span class="field-type">string</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

Required. A unique ID for this specific tool call.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">signature</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

A signature hash for backend validation.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"code_execution_call"`.

</div>

</div>

</div>

<span style="font-weight: 500;">CodeExecutionResultStep</span>

<div class="subtype-content">

Code execution result step.

<div class="field-entry">

<div class="signature">

<span class="field-name">call_id</span> <span class="field-type">string</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

Required. ID to match the ID from the function call block.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">is_error</span> <span class="field-type">boolean</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Whether the code execution resulted in an error.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">result</span> <span class="field-type">string</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

Required. The output of the code execution.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">signature</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

A signature hash for backend validation.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"code_execution_result"`.

</div>

</div>

</div>

<span style="font-weight: 500;">FileSearchCallStep</span>

<div class="subtype-content">

File Search call step.

<div class="field-entry">

<div class="signature">

<span class="field-name">id</span> <span class="field-type">string</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

Required. A unique ID for this specific tool call.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">signature</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

A signature hash for backend validation.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"file_search_call"`.

</div>

</div>

</div>

<span style="font-weight: 500;">FileSearchResultStep</span>

<div class="subtype-content">

File Search result step.

<div class="field-entry">

<div class="signature">

<span class="field-name">call_id</span> <span class="field-type">string</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

Required. ID to match the ID from the function call block.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">signature</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

A signature hash for backend validation.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"file_search_result"`.

</div>

</div>

</div>

<span style="font-weight: 500;">FunctionCallStep</span>

<div class="subtype-content">

A function tool call step.

<div class="field-entry">

<div class="signature">

<span class="field-name">arguments</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

Required. The arguments to pass to the function.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">id</span> <span class="field-type">string</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

Required. A unique ID for this specific tool call.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">name</span> <span class="field-type">string</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

Required. The name of the tool to call.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"function_call"`.

</div>

</div>

</div>

<span style="font-weight: 500;">FunctionResultStep</span>

<div class="subtype-content">

Result of a function tool call.

<div class="field-entry">

<div class="signature">

<span class="field-name">call_id</span> <span class="field-type">string</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

Required. ID to match the ID from the function call block.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">is_error</span> <span class="field-type">boolean</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Whether the tool call resulted in an error.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">name</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The name of the tool that was called.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">result</span> <span class="field-type">array ([ImageContent](#Resource:ImageContent) or [TextContent](#Resource:TextContent)) or object or string</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

Required. The result of the tool call.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"function_result"`.

</div>

</div>

</div>

<span style="font-weight: 500;">GoogleMapsCallStep</span>

<div class="subtype-content">

Google Maps call step.

<span class="expander-icon"></span> <span class="field-name">arguments</span> <span class="field-type">GoogleMapsCallStepArguments</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

The arguments to pass to the Google Maps tool.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The arguments to pass to the Google Maps tool.

#### Fields

<div class="field-entry">

<div class="signature">

<span class="field-name">queries</span> <span class="field-type">array (string)</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The queries to be executed.

</div>

</div>

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">id</span> <span class="field-type">string</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

Required. A unique ID for this specific tool call.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">signature</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

A signature hash for backend validation.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"google_maps_call"`.

</div>

</div>

</div>

<span style="font-weight: 500;">GoogleMapsResultStep</span>

<div class="subtype-content">

Google Maps result step.

<div class="field-entry">

<div class="signature">

<span class="field-name">call_id</span> <span class="field-type">string</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

Required. ID to match the ID from the function call block.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">result</span> <span class="field-type">array (GoogleMapsResultItem)</span> <span class="field-nessesity required"> (required)</span>

<div class="field-description">

No description provided.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The result of the Google Maps.

#### Fields

<span class="expander-icon"></span> <span class="field-name">places</span> <span class="field-type">array (GoogleMapsResultPlaces)</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

No description provided.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

#### Fields

<div class="field-entry">

<div class="signature">

<span class="field-name">name</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

No description provided.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">place_id</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

No description provided.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">review_snippets</span> <span class="field-type">array (ReviewSnippet)</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

No description provided.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

Encapsulates a snippet of a user review that answers a question about the features of a specific place in Google Maps.

#### Fields

<div class="field-entry">

<div class="signature">

<span class="field-name">review_id</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The ID of the review snippet.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">title</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Title of the review.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">url</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

A link that corresponds to the user review on Google Maps.

</div>

</div>

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">url</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

No description provided.

</div>

</div>

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">widget_context_token</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

No description provided.

</div>

</div>

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">signature</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

A signature hash for backend validation.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"google_maps_result"`.

</div>

</div>

</div>

<span style="font-weight: 500;">GoogleSearchCallStep</span>

<div class="subtype-content">

Google Search call step.

<span class="expander-icon"></span> <span class="field-name">arguments</span> <span class="field-type">GoogleSearchCallStepArguments</span> <span class="field-nessesity required"> (required)</span>

<div class="field-description">

Required. The arguments to pass to Google Search.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The arguments to pass to Google Search.

#### Fields

<div class="field-entry">

<div class="signature">

<span class="field-name">queries</span> <span class="field-type">array (string)</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Web search queries for the following-up web search.

</div>

</div>

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">id</span> <span class="field-type">string</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

Required. A unique ID for this specific tool call.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">search_type</span> <span class="field-type">enum (string)</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The type of search grounding enabled.

Possible values:

- `web_search`

  Setting this field enables web search. Only text results are returned.

- `image_search`

  Setting this field enables image search. Image bytes are returned.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">signature</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

A signature hash for backend validation.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"google_search_call"`.

</div>

</div>

</div>

<span style="font-weight: 500;">GoogleSearchResultStep</span>

<div class="subtype-content">

Google Search result step.

<div class="field-entry">

<div class="signature">

<span class="field-name">call_id</span> <span class="field-type">string</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

Required. ID to match the ID from the function call block.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">is_error</span> <span class="field-type">boolean</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Whether the Google Search resulted in an error.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">result</span> <span class="field-type">array (GoogleSearchResultItem)</span> <span class="field-nessesity required"> (required)</span>

<div class="field-description">

Required. The results of the Google Search.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The result of the Google Search.

#### Fields

<div class="field-entry">

<div class="signature">

<span class="field-name">search_suggestions</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Web content snippet that can be embedded in a web page or an app webview.

</div>

</div>

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">signature</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

A signature hash for backend validation.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"google_search_result"`.

</div>

</div>

</div>

<span style="font-weight: 500;">McpServerToolCallStep</span>

<div class="subtype-content">

MCPServer tool call step.

<div class="field-entry">

<div class="signature">

<span class="field-name">arguments</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

Required. The JSON object of arguments for the function.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">id</span> <span class="field-type">string</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

Required. A unique ID for this specific tool call.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">name</span> <span class="field-type">string</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

Required. The name of the tool which was called.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">server_name</span> <span class="field-type">string</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

Required. The name of the used MCP server.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"mcp_server_tool_call"`.

</div>

</div>

</div>

<span style="font-weight: 500;">McpServerToolResultStep</span>

<div class="subtype-content">

MCPServer tool result step.

<div class="field-entry">

<div class="signature">

<span class="field-name">call_id</span> <span class="field-type">string</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

Required. ID to match the ID from the function call block.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">name</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Name of the tool which is called for this specific tool call.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">result</span> <span class="field-type">array ([ImageContent](#Resource:ImageContent) or [TextContent](#Resource:TextContent)) or object or string</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

Required. The output from the MCP server call. Can be simple text or rich content.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">server_name</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The name of the used MCP server.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"mcp_server_tool_result"`.

</div>

</div>

</div>

<span style="font-weight: 500;">ModelOutputStep</span>

<div class="subtype-content">

Output generated by the model.

<div class="field-entry">

<div class="signature">

<span class="field-name">content</span> <span class="field-type">array ([Content](#Resource:Content))</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

No description provided.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"model_output"`.

</div>

</div>

</div>

<span style="font-weight: 500;">ProcessingCallStep</span>

<div class="subtype-content">

A server-initiated processing step for media analysis (e.g. video understanding).

<div class="field-entry">

<div class="signature">

<span class="field-name">id</span> <span class="field-type">string</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

Required. A unique ID for this specific tool call.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">signature</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

A signature hash for backend validation.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"processing_call"`.

</div>

</div>

</div>

<span style="font-weight: 500;">ProcessingResultStep</span>

<div class="subtype-content">

The result of a server-initiated media processing step.

<div class="field-entry">

<div class="signature">

<span class="field-name">call_id</span> <span class="field-type">string</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

Required. ID to match the ID from the function call block.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">signature</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

A signature hash for backend validation.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"processing_result"`.

</div>

</div>

</div>

<span style="font-weight: 500;">ThoughtStep</span>

<div class="subtype-content">

A thought step.

<div class="field-entry">

<div class="signature">

<span class="field-name">signature</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

A signature hash for backend validation.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">summary</span> <span class="field-type">array (ThoughtSummaryContent)</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

A summary of the thought.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

#### Possible Types

Polymorphic discriminator: `type`

<span style="font-weight: 500;">ImageContent</span>

<div class="subtype-content">

An image content block.

<div class="field-entry">

<div class="signature">

<span class="field-name">data</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The image content.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">mime_type</span> <span class="field-type">enum (string)</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The mime type of the image.

Possible values:

- `image/png`

  PNG image format

- `image/jpeg`

  JPEG image format

- `image/webp`

  WebP image format

- `image/heic`

  HEIC image format

- `image/heif`

  HEIF image format

- `image/gif`

  GIF image format

- `image/bmp`

  BMP image format

- `image/tiff`

  TIFF image format

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">resolution</span> <span class="field-type">MediaResolution</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

The resolution of the media.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

#### Possible values

- `low`

  Low resolution.

- `medium`

  Medium resolution.

- `high`

  High resolution.

- `ultra_high`

  Ultra high resolution.

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"image"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">uri</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The URI of the image.

</div>

</div>

</div>

<span style="font-weight: 500;">TextContent</span>

<div class="subtype-content">

A text content block.

<span class="expander-icon"></span> <span class="field-name">annotations</span> <span class="field-type">array (Annotation)</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

Citation information for model-generated content.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

Citation information for model-generated content.

#### Possible Types

<span style="font-weight: 500;">FileCitation</span>

<div class="subtype-content">

A file citation annotation.

<div class="field-entry">

<div class="signature">

<span class="field-name">custom_metadata</span> <span class="field-type">object</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

User provided metadata about the retrieved context.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">document_uri</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The URI of the file.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">end_index</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

End of the attributed segment, exclusive.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">file_name</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The name of the file.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">media_id</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Media ID in-case of image citations, if applicable.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">page_number</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Page number of the cited document, if applicable.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">source</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Source attributed for a portion of the text.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">start_index</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Start of segment of the response that is attributed to this source. Index indicates the start of the segment, measured in bytes.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"file_citation"`.

</div>

</div>

</div>

<span style="font-weight: 500;">PlaceCitation</span>

<div class="subtype-content">

A place citation annotation.

<div class="field-entry">

<div class="signature">

<span class="field-name">end_index</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

End of the attributed segment, exclusive.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">name</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Title of the place.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">place_id</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The ID of the place, in \`places/{place_id}\` format.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">review_snippets</span> <span class="field-type">array (ReviewSnippet)</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

Snippets of reviews that are used to generate answers about the features of a given place in Google Maps.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

Encapsulates a snippet of a user review that answers a question about the features of a specific place in Google Maps.

#### Fields

<div class="field-entry">

<div class="signature">

<span class="field-name">review_id</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The ID of the review snippet.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">title</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Title of the review.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">url</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

A link that corresponds to the user review on Google Maps.

</div>

</div>

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">start_index</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Start of segment of the response that is attributed to this source. Index indicates the start of the segment, measured in bytes.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"place_citation"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">url</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

URI reference of the place.

</div>

</div>

</div>

<span style="font-weight: 500;">UrlCitation</span>

<div class="subtype-content">

A URL citation annotation.

<div class="field-entry">

<div class="signature">

<span class="field-name">end_index</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

End of the attributed segment, exclusive.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">start_index</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Start of segment of the response that is attributed to this source. Index indicates the start of the segment, measured in bytes.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">title</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The title of the URL.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"url_citation"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">url</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The URL.

</div>

</div>

</div>

<span style="font-weight: 500;">WordInfo</span>

<div class="subtype-content">

Word-level ASR annotation for transcription output. Carries the word text, optional timing, and optional speaker attribution.

<div class="field-entry">

<div class="signature">

<span class="field-name">end_index</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

End of the attributed segment, exclusive.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">end_offset</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

End offset in time of the word relative to the start of the audio. Present when timestamp_granularities contains "word".

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">speaker</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Optional. Speaker label for this word (e.g. "spk_1", "spk_2"). Present when diarization_mode is set in TranscriptionConfig.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">start_index</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Start of segment of the response that is attributed to this source. Index indicates the start of the segment, measured in bytes.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">start_offset</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Start offset in time of the word relative to the start of the audio. Present when timestamp_granularities contains "word".

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">text</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The transcribed word.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"word_info"`.

</div>

</div>

</div>

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">text</span> <span class="field-type">string</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

Required. The text content.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"text"`.

</div>

</div>

</div>

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"thought"`.

</div>

</div>

</div>

<span style="font-weight: 500;">UrlContextCallStep</span>

<div class="subtype-content">

URL context call step.

<span class="expander-icon"></span> <span class="field-name">arguments</span> <span class="field-type">UrlContextCallArguments</span> <span class="field-nessesity required"> (required)</span>

<div class="field-description">

Required. The arguments to pass to the URL context.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The arguments to pass to the URL context.

#### Fields

<div class="field-entry">

<div class="signature">

<span class="field-name">urls</span> <span class="field-type">array (string)</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The URLs to fetch.

</div>

</div>

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">id</span> <span class="field-type">string</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

Required. A unique ID for this specific tool call.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">signature</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

A signature hash for backend validation.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"url_context_call"`.

</div>

</div>

</div>

<span style="font-weight: 500;">UrlContextResultStep</span>

<div class="subtype-content">

URL context result step.

<div class="field-entry">

<div class="signature">

<span class="field-name">call_id</span> <span class="field-type">string</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

Required. ID to match the ID from the function call block.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">is_error</span> <span class="field-type">boolean</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Whether the URL context resulted in an error.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">result</span> <span class="field-type">array (UrlContextResult)</span> <span class="field-nessesity required"> (required)</span>

<div class="field-description">

Required. The results of the URL context.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The result of the URL context.

#### Fields

<div class="field-entry">

<div class="signature">

<span class="field-name">status</span> <span class="field-type">enum (string)</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The status of the URL retrieval.

Possible values:

- `success`

  Url retrieval is successful.

- `error`

  Url retrieval is failed due to error.

- `paywall`

  Url retrieval is failed because the content is behind paywall.

- `unsafe`

  Url retrieval is failed because the content is unsafe.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">url</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The URL that was fetched.

</div>

</div>

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">signature</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

A signature hash for backend validation.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"url_context_result"`.

</div>

</div>

</div>

<span style="font-weight: 500;">UserInputStep</span>

<div class="subtype-content">

Input provided by the user.

<div class="field-entry">

<div class="signature">

<span class="field-name">content</span> <span class="field-type">array ([Content](#Resource:Content))</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

No description provided.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"user_input"`.

</div>

</div>

</div>

</div>

<div class="second-column">

<div class="examples">

### Examples

<div class="section">

### CodeExecutionCallStep

<div class="schema-example-content">

<div>

</div>

``` devsite-click-to-copy
{
  "type": "code_execution_call",
  "arguments": {
    "code": "print(sum(range(1, 11)))"
  },
  "id": "code_call_71021"
}
```

</div>

</div>

<div class="section">

### CodeExecutionResultStep

<div class="schema-example-content">

<div>

</div>

``` devsite-click-to-copy
{
  "type": "code_execution_result",
  "call_id": "code_call_71021",
  "result": "55\n"
}
```

</div>

</div>

<div class="section">

### FileSearchCallStep

<div class="schema-example-content">

<div>

</div>

``` devsite-click-to-copy
{
  "type": "file_search_call",
  "id": "file_call_88192"
}
```

</div>

</div>

<div class="section">

### FileSearchResultStep

<div class="schema-example-content">

<div>

</div>

``` devsite-click-to-copy
{
  "type": "file_search_result",
  "call_id": "file_call_88192"
}
```

</div>

</div>

<div class="section">

### FunctionCallStep

<div class="schema-example-content">

<div>

</div>

``` devsite-click-to-copy
{
  "name": "get_weather",
  "type": "function_call",
  "arguments": {
    "location": "Boston, MA"
  },
  "id": "call_98231"
}
```

</div>

</div>

<div class="section">

### FunctionResultStep

<div class="schema-example-content">

<div>

</div>

``` devsite-click-to-copy
{
  "name": "get_weather",
  "type": "function_result",
  "call_id": "call_98231",
  "result": [
    {
      "type": "text",
      "text": "{\"weather\":\"sunny\"}"
    }
  ]
}
```

</div>

</div>

<div class="section">

### GoogleMapsCallStep

<div class="schema-example-content">

<div>

</div>

``` devsite-click-to-copy
{
  "type": "google_maps_call",
  "arguments": {
    "latitude": 37.7749,
    "longitude": -122.4194
  },
  "id": "maps_call_39201"
}
```

</div>

</div>

<div class="section">

### GoogleMapsResultStep

<div class="schema-example-content">

<div>

</div>

``` devsite-click-to-copy
{
  "type": "google_maps_result",
  "call_id": "maps_call_39201",
  "result": [
    {
      "name": "Golden Gate Park",
      "place_id": "ChIJIQBpAG2ahYAR9R7bNdTLg8M",
      "rating": 4.8
    }
  ]
}
```

</div>

</div>

<div class="section">

### GoogleSearchCallStep

<div class="schema-example-content">

<div>

</div>

``` devsite-click-to-copy
{
  "type": "google_search_call",
  "arguments": {
    "query": "Who won the men's 100m in Paris 2024?"
  },
  "id": "search_call_19201"
}
```

</div>

</div>

<div class="section">

### GoogleSearchResultStep

<div class="schema-example-content">

<div>

</div>

``` devsite-click-to-copy
{
  "type": "google_search_result",
  "call_id": "search_call_19201",
  "result": [
    {
      "title": "Paris 2024 Olympics: Noah Lyles wins men's 100m gold",
      "url": "https://olympics.com/en/news/paris-2024-noah-lyles-wins-mens-100m-gold",
      "snippet": "American Noah Lyles won the Olympic men's 100m gold medal in a photo finish."
    }
  ]
}
```

</div>

</div>

<div class="section">

### McpServerToolCallStep

<div class="schema-example-content">

<div>

</div>

``` devsite-click-to-copy
{
  "name": "calculate_tax",
  "type": "mcp_server_tool_call",
  "arguments": {
    "income": 120000,
    "state": "CA"
  },
  "id": "mcp_call_29012",
  "server_name": "financial_mcp_server"
}
```

</div>

</div>

<div class="section">

### McpServerToolResultStep

<div class="schema-example-content">

<div>

</div>

``` devsite-click-to-copy
{
  "type": "mcp_server_tool_result",
  "call_id": "mcp_call_29012",
  "result": {
    "tax_due": 32400
  }
}
```

</div>

</div>

<div class="section">

### ModelOutputStep

<div class="schema-example-content">

<div>

</div>

``` devsite-click-to-copy
{
  "type": "model_output",
  "content": [
    {
      "type": "text",
      "text": "The capital of France is Paris."
    }
  ]
}
```

</div>

</div>

<div class="section">

### ProcessingCallStep

No examples available for this type.

</div>

<div class="section">

### ProcessingResultStep

No examples available for this type.

</div>

<div class="section">

### ThoughtStep

<div class="schema-example-content">

<div>

</div>

``` devsite-click-to-copy
{
  "type": "thought",
  "signature": "thought_sig_abcd1234",
  "summary": [
    {
      "type": "text",
      "text": "The model is searching Google for the capital of France."
    }
  ]
}
```

</div>

</div>

<div class="section">

### UrlContextCallStep

<div class="schema-example-content">

<div>

</div>

``` devsite-click-to-copy
{
  "type": "url_context_call",
  "arguments": {
    "urls": [
      "https://www.example.com"
    ]
  },
  "id": "url_call_10219"
}
```

</div>

</div>

<div class="section">

### UrlContextResultStep

<div class="schema-example-content">

<div>

</div>

``` devsite-click-to-copy
{
  "type": "url_context_result",
  "call_id": "url_call_10219",
  "result": [
    {
      "title": "Example Domain",
      "url": "https://www.example.com",
      "snippet": "This domain is for use in illustrative examples in documents."
    }
  ]
}
```

</div>

</div>

<div class="section">

### UserInputStep

<div class="schema-example-content">

<div>

</div>

``` devsite-click-to-copy
{
  "type": "user_input",
  "content": [
    {
      "type": "text",
      "text": "What is the capital of France?"
    }
  ]
}
```

</div>

</div>

</div>

</div>

</div>

</div>

</div>

<div itemscope="" itemtype="http://developers.google.com/ReferenceObject">

### EnvironmentConfig

<div class="section prototype">

<div class="column-container">

<div class="reference">

Configuration for a custom environment.

#### Fields

<div class="field-entry">

<div class="signature">

<span class="field-name">environment_id</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Optional. The environment ID for the interaction. If specified, the request will update the existing environment instead of creating a new one.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">network</span> <span class="field-type">[EnvironmentNetworkEgressAllowlist](#Resource:EnvironmentNetworkEgressAllowlist) or enum (string)</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Network configuration for the environment.

Possible values:

- `disabled`

  Turns all network off.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">sources</span> <span class="field-type">array (Source)</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

No description provided.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

A source to be mounted into the environment.

#### Fields

<div class="field-entry">

<div class="signature">

<span class="field-name">content</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The inline content if \`type\` is \`INLINE\`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">encoding</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Optional encoding for inline content (e.g. \`base64\`).

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">source</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The source of the environment. For Cloud Storage, this is the Cloud Storage path. For GitHub, this is the GitHub path.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">target</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Where the source should appear in the environment.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">enum (string)</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

No description provided.

Possible values:

- `gcs`

  A Cloud Storage bucket.

- `inline`

  Inline content.

- `repository`

  A generic repository. The protocol prefix in the source URL identifies the provider (e.g., github://, gcs://).

</div>

</div>

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"remote"`.

</div>

</div>

</div>

<div class="second-column">

<div class="examples">

### Examples

<div class="section">

### Inline Sources

<div class="schema-example-content">

<div>

</div>

``` devsite-click-to-copy
{
  "type": "remote",
  "sources": [
    {
      "type": "inline",
      "content": "You are a data analyst. Always include visualizations and export results as PDF.",
      "target": ".agents/AGENTS.md"
    },
    {
      "type": "inline",
      "content": "---\nname: slide-maker\ndescription: Create HTML slide decks\n---\n# Slide Maker\n\nWhen asked to create a presentation:\n1. Analyze the input data\n2. Create an HTML slide deck with reveal.js\n3. Save to /workspace/output/slides.html",
      "target": ".agents/skills/slide-maker/SKILL.md"
    }
  ]
}
```

</div>

</div>

<div class="section">

### External Sources

<div class="schema-example-content">

<div>

</div>

``` devsite-click-to-copy
{
  "type": "remote",
  "sources": [
    {
      "type": "repository",
      "source": "https://github.com/my-org/my-skills.git",
      "target": ".agents/skills"
    },
    {
      "type": "gcs",
      "source": "gs://my-bucket/my-folder",
      "target": "/workspace/data"
    }
  ]
}
```

</div>

</div>

<div class="section">

### Network Allowlist

<div class="schema-example-content">

<div>

</div>

``` devsite-click-to-copy
{
  "type": "remote",
  "network": {
    "allowlist": [
      {
        "domain": "pypi.org"
      },
      {
        "domain": "*.github.com"
      }
    ]
  }
}
```

</div>

</div>

<div class="section">

### Proxy Credentials

<div class="schema-example-content">

<div>

</div>

``` devsite-click-to-copy
{
  "type": "remote",
  "network": {
    "allowlist": [
      {
        "domain": "api.github.com",
        "transform": {
          "Authorization": "Bearer YOUR_GITHUB_TOKEN"
        }
      }
    ]
  }
}
```

</div>

</div>

</div>

</div>

</div>

</div>

</div>

<div itemscope="" itemtype="http://developers.google.com/ReferenceObject">

### EnvironmentNetworkEgressAllowlist

<div class="section prototype">

<div class="column-container">

<div class="reference">

Outbound networking configuration for the sandbox. Accepts an object with an 'allowlist' array to restrict traffic, or the string 'disabled' to turn off all network access. Omit entirely to allow all outbound traffic with no header injection.

#### Possible Types

<span style="font-weight: 500;">object</span>

<div class="subtype-content">

Outbound networking configuration for the sandbox. When specified, restricts which external domains the sandbox can reach. Omit entirely to allow all outbound traffic with no header injection.

<span class="expander-icon"></span> <span class="field-name">allowlist</span> <span class="field-type">array (AllowlistEntry)</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

List of allowed outbound domains. Only requests to listed domains are permitted. Use \[{'domain': '\*'}\] to allow all domains while still injecting headers on specific ones.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

A single domain allowlist rule with optional header injection.

#### Fields

<div class="field-entry">

<div class="signature">

<span class="field-name">domain</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Domain to allow outbound requests to. Supports wildcards (e.g. '\*.googleapis.com'). Use '\*' to allow all domains.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">transform</span> <span class="field-type">array (object) or object</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Headers to inject on all outbound requests matching this domain. Accepts a single dict or a list of dicts. The egress proxy injects these automatically.

</div>

</div>

</div>

</div>

</div>

</div>

</div>

<span style="font-weight: 500;">string</span>

<div class="subtype-content">

Turns all network off.

</div>

#### Possible values

- `disabled`

  Turns all network off.

</div>

<div class="second-column">

<div class="examples">

### Examples

<div class="section">

### Example

<div class="schema-example-content">

<div>

</div>

``` devsite-click-to-copy
{
  "allowlist": [
    {
      "domain": "github.com",
      "transform": [
        {
          "Authorization": "Bearer your-token"
        }
      ]
    },
    {
      "domain": "*.googleapis.com"
    }
  ]
}
```

</div>

</div>

</div>

</div>

</div>

</div>

</div>

<div itemscope="" itemtype="http://developers.google.com/ReferenceObject">

### ToolChoiceConfig

<div class="section prototype">

<div class="column-container">

<div class="reference">

The tool choice configuration containing allowed tools.

#### Fields

<span class="expander-icon"></span> <span class="field-name">allowed_tools</span> <span class="field-type">AllowedTools</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

The allowed tools.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The configuration for allowed tools.

#### Fields

<div class="field-entry">

<div class="signature">

<span class="field-name">mode</span> <span class="field-type">enum (string)</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The mode of the tool choice.

Possible values:

- `auto`

  Auto tool choice.

- `any`

  Any tool choice.

- `none`

  No tool choice.

- `validated`

  Validated tool choice.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">tools</span> <span class="field-type">array (string)</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The names of the allowed tools.

</div>

</div>

</div>

</div>

</div>

</div>

</div>

<div class="second-column">

<div class="examples">

### Examples

<div class="section">

### Example

<div class="schema-example-content">

<div>

</div>

``` devsite-click-to-copy
{
  "allowed_tools": {
    "mode": "any",
    "tools": [
      "my_tool"
    ]
  }
}
```

</div>

</div>

</div>

</div>

</div>

</div>

</div>

<div itemscope="" itemtype="http://developers.google.com/ReferenceObject">

### ImageContent

<div class="section prototype">

<div class="column-container">

<div class="reference">

An image content block.

#### Fields

<div class="field-entry">

<div class="signature">

<span class="field-name">data</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The image content.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">mime_type</span> <span class="field-type">enum (string)</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The mime type of the image.

Possible values:

- `image/png`

  PNG image format

- `image/jpeg`

  JPEG image format

- `image/webp`

  WebP image format

- `image/heic`

  HEIC image format

- `image/heif`

  HEIF image format

- `image/gif`

  GIF image format

- `image/bmp`

  BMP image format

- `image/tiff`

  TIFF image format

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">resolution</span> <span class="field-type">MediaResolution</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

The resolution of the media.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

#### Possible values

- `low`

  Low resolution.

- `medium`

  Medium resolution.

- `high`

  High resolution.

- `ultra_high`

  Ultra high resolution.

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"image"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">uri</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The URI of the image.

</div>

</div>

</div>

<div class="second-column">

<div class="examples">

### Examples

<div class="section">

### Image

<div class="schema-example-content">

<div>

</div>

``` devsite-click-to-copy
{
  "type": "image",
  "data": "BASE64_ENCODED_IMAGE",
  "mime_type": "image/png"
}
```

</div>

</div>

</div>

</div>

</div>

</div>

</div>

<div itemscope="" itemtype="http://developers.google.com/ReferenceObject">

### TextContent

<div class="section prototype">

<div class="column-container">

<div class="reference">

A text content block.

#### Fields

<span class="expander-icon"></span> <span class="field-name">annotations</span> <span class="field-type">array (Annotation)</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

Citation information for model-generated content.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

Citation information for model-generated content.

#### Possible Types

<span style="font-weight: 500;">FileCitation</span>

<div class="subtype-content">

A file citation annotation.

<div class="field-entry">

<div class="signature">

<span class="field-name">custom_metadata</span> <span class="field-type">object</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

User provided metadata about the retrieved context.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">document_uri</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The URI of the file.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">end_index</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

End of the attributed segment, exclusive.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">file_name</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The name of the file.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">media_id</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Media ID in-case of image citations, if applicable.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">page_number</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Page number of the cited document, if applicable.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">source</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Source attributed for a portion of the text.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">start_index</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Start of segment of the response that is attributed to this source. Index indicates the start of the segment, measured in bytes.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"file_citation"`.

</div>

</div>

</div>

<span style="font-weight: 500;">PlaceCitation</span>

<div class="subtype-content">

A place citation annotation.

<div class="field-entry">

<div class="signature">

<span class="field-name">end_index</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

End of the attributed segment, exclusive.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">name</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Title of the place.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">place_id</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The ID of the place, in \`places/{place_id}\` format.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">review_snippets</span> <span class="field-type">array (ReviewSnippet)</span> <span class="field-nessesity optional"> (optional)</span>

<div class="field-description">

Snippets of reviews that are used to generate answers about the features of a given place in Google Maps.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

Encapsulates a snippet of a user review that answers a question about the features of a specific place in Google Maps.

#### Fields

<div class="field-entry">

<div class="signature">

<span class="field-name">review_id</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The ID of the review snippet.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">title</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Title of the review.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">url</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

A link that corresponds to the user review on Google Maps.

</div>

</div>

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">start_index</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Start of segment of the response that is attributed to this source. Index indicates the start of the segment, measured in bytes.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"place_citation"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">url</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

URI reference of the place.

</div>

</div>

</div>

<span style="font-weight: 500;">UrlCitation</span>

<div class="subtype-content">

A URL citation annotation.

<div class="field-entry">

<div class="signature">

<span class="field-name">end_index</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

End of the attributed segment, exclusive.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">start_index</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Start of segment of the response that is attributed to this source. Index indicates the start of the segment, measured in bytes.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">title</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The title of the URL.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"url_citation"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">url</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The URL.

</div>

</div>

</div>

<span style="font-weight: 500;">WordInfo</span>

<div class="subtype-content">

Word-level ASR annotation for transcription output. Carries the word text, optional timing, and optional speaker attribution.

<div class="field-entry">

<div class="signature">

<span class="field-name">end_index</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

End of the attributed segment, exclusive.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">end_offset</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

End offset in time of the word relative to the start of the audio. Present when timestamp_granularities contains "word".

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">speaker</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Optional. Speaker label for this word (e.g. "spk_1", "spk_2"). Present when diarization_mode is set in TranscriptionConfig.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">start_index</span> <span class="field-type">integer</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Start of segment of the response that is attributed to this source. Index indicates the start of the segment, measured in bytes.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">start_offset</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Start offset in time of the word relative to the start of the audio. Present when timestamp_granularities contains "word".

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">text</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

The transcribed word.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"word_info"`.

</div>

</div>

</div>

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">text</span> <span class="field-type">string</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

Required. The text content.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-nessesity optional"> (optional)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"text"`.

</div>

</div>

</div>

<div class="second-column">

<div class="examples">

### Examples

<div class="section">

### Text

<div class="schema-example-content">

<div>

</div>

``` devsite-click-to-copy
{
  "type": "text",
  "text": "Hello, how are you?"
}
```

</div>

</div>

</div>

</div>

</div>

</div>

</div>

</div>

## Appendix: Interactive examples

### Example 1

`n
#### Example Request
`n
REST Python JavaScript Java
`n`n
``` prettyprint
curl -X POST https://generativelanguage.googleapis.com/v1beta/interactions \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-3.6-flash",
    "input": "Hello, how are you?"
  }'
```
`n`n
``` prettyprint
from google import genai
`n
client = genai.Client()
interaction = client.interactions.create(
    model="gemini-3.6-flash",
    input="Hello, how are you?",
)
print(interaction.output_text)
```
`n`n
``` prettyprint
import {GoogleGenAI} from '@google/genai';
`n
const ai = new GoogleGenAI({});
const interaction = await ai.interactions.create({
    model: 'gemini-3.6-flash',
    input: 'Hello, how are you?',
});
console.log(interaction.output_text);
```
`n`n
``` prettyprint
import com.google.genai.Client;
import com.google.genai.gaos.models.interactions.CreateModelInteraction;
import com.google.genai.gaos.models.interactions.Interaction;
import com.google.genai.gaos.models.interactions.InteractionsInput;
import com.google.genai.gaos.models.operations.CreateInteractionRequestBody;
import com.google.genai.gaos.models.operations.CreateInteractionResponse;
`n
Client client = new Client();
CreateModelInteraction params =
    CreateModelInteraction.builder()
        .model("gemini-3.6-flash")
        .input(InteractionsInput.of("Hello, how are you?"))
        .build();
CreateInteractionResponse response =
    client.interactions.create(CreateInteractionRequestBody.of(params));
Interaction interaction =
    response.interaction().orElseThrow(() -> new RuntimeException("No interaction returned"));
System.out.println(interaction.outputText().orElse(""));
```
`n`n

### Example 2

`n
#### Example Request
`n
REST Python JavaScript Java
`n`n
``` prettyprint
curl -X POST https://generativelanguage.googleapis.com/v1beta/interactions \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-3.6-flash",
    "input": [
      { "type": "user_input", "content": [{ "type": "text", "text": "Hello!" }] },
      { "type": "model_output", "content": [{ "type": "text", "text": "Hi there! How can I help you today?" }] },
      { "type": "user_input", "content": [{ "type": "text", "text": "What is the capital of France?" }] }
    ]
  }'
```
`n`n
``` prettyprint
from google import genai
`n
client = genai.Client()
response = client.interactions.create(
    model="gemini-3.6-flash",
    input=[
        { "type": "user_input", "content": [{ "type": "text", "text": "Hello!" }] },
        { "type": "model_output", "content": [{ "type": "text", "text": "Hi there! How can I help you today?" }] },
        { "type": "user_input", "content": [{ "type": "text", "text": "What is the capital of France?" }] }
    ]
)
print(response.output_text)
```
`n`n
``` prettyprint
import {GoogleGenAI} from '@google/genai';
`n
const ai = new GoogleGenAI({});
const interaction = await ai.interactions.create({
    model: 'gemini-3.6-flash',
    input: [
        { type: 'user_input', content: [{ type: 'text', text: 'Hello' }] },
        { type: 'model_output', content: [{ type: 'text', text: 'Hi there! How can I help you today?' }] },
        { type: 'user_input', content: [{ type: 'text', text: 'What is the capital of France?' }] }
    ]
});
console.log(interaction.output_text);
```
`n`n
``` prettyprint
import com.google.genai.Client;
import com.google.genai.gaos.models.interactions.CreateModelInteraction;
import com.google.genai.gaos.models.interactions.Interaction;
import com.google.genai.gaos.models.interactions.InteractionsInput;
import com.google.genai.gaos.models.interactions.ModelOutputStep;
import com.google.genai.gaos.models.interactions.Step;
import com.google.genai.gaos.models.interactions.TextContent;
import com.google.genai.gaos.models.interactions.UserInputStep;
import com.google.genai.gaos.models.operations.CreateInteractionRequestBody;
import com.google.genai.gaos.models.operations.CreateInteractionResponse;
import java.util.List;
`n
Client client = new Client();
List conversation = List.of(
    UserInputStep.builder()
        .content(List.of(TextContent.builder().text("Hello!").build()))
        .build(),
    ModelOutputStep.builder()
        .content(List.of(TextContent.builder().text("Hi there! How can I help you today?").build()))
        .build(),
    UserInputStep.builder()
        .content(List.of(TextContent.builder().text("What is the capital of France?").build()))
        .build()
);
CreateModelInteraction params =
    CreateModelInteraction.builder()
        .model("gemini-3.6-flash")
        .input(InteractionsInput.ofStep(conversation))
        .build();
CreateInteractionResponse response =
    client.interactions.create(CreateInteractionRequestBody.of(params));
Interaction interaction =
    response.interaction().orElseThrow(() -> new RuntimeException("No interaction returned"));
System.out.println(interaction.outputText().orElse(""));
```
`n`n

### Example 3

`n
#### Example Request
`n
REST Python JavaScript Java
`n`n
``` prettyprint
curl -X POST https://generativelanguage.googleapis.com/v1beta/interactions \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-3.6-flash",
    "input": [
      {
        "type": "text",
        "text": "What is in this picture?"
      },
      {
        "type": "image",
        "data": "BASE64_ENCODED_IMAGE",
        "mime_type": "image/png"
      }
    ]
  }'
```
`n`n
``` prettyprint
from google import genai
`n
client = genai.Client()
response = client.interactions.create(
    model="gemini-3.6-flash",
    input=[
      { "type": "text", "text": "What is in this picture?" },
      { "type": "image", "data": "BASE64_ENCODED_IMAGE", "mime_type": "image/png" }
    ]
)
print(response.output_text)
```
`n`n
``` prettyprint
import {GoogleGenAI} from '@google/genai';
`n
const ai = new GoogleGenAI({});
const interaction = await ai.interactions.create({
    model: 'gemini-3.6-flash',
    input: [
      { type: 'text', text: 'What is in this picture?' },
      { type: 'image', data: 'BASE64_ENCODED_IMAGE', mime_type: 'image/png' }
    ]
});
console.log(interaction.output_text);
```
`n`n
``` prettyprint
import com.google.genai.Client;
import com.google.genai.gaos.models.interactions.Content;
import com.google.genai.gaos.models.interactions.CreateModelInteraction;
import com.google.genai.gaos.models.interactions.ImageContent;
import com.google.genai.gaos.models.interactions.ImageContentMimeType;
import com.google.genai.gaos.models.interactions.Interaction;
import com.google.genai.gaos.models.interactions.InteractionsInput;
import com.google.genai.gaos.models.interactions.TextContent;
import com.google.genai.gaos.models.operations.CreateInteractionRequestBody;
import com.google.genai.gaos.models.operations.CreateInteractionResponse;
import java.util.List;
`n
Client client = new Client();
List content = List.of(
    TextContent.builder().text("What is in this picture?").build(),
    ImageContent.builder()
        .data("BASE64_ENCODED_IMAGE")
        .mimeType(ImageContentMimeType.IMAGE_PNG)
        .build()
);
CreateModelInteraction params =
    CreateModelInteraction.builder()
        .model("gemini-3.6-flash")
        .input(InteractionsInput.ofContent(content))
        .build();
CreateInteractionResponse response =
    client.interactions.create(CreateInteractionRequestBody.of(params));
Interaction interaction =
    response.interaction().orElseThrow(() -> new RuntimeException("No interaction returned"));
System.out.println(interaction.outputText().orElse(""));
```
`n`n

### Example 4

`n
#### Example Request
`n
REST Python JavaScript Java
`n`n
``` prettyprint
curl -X POST https://generativelanguage.googleapis.com/v1beta/interactions \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-3.6-flash",
    "tools": [
      {
        "type": "function",
        "name": "get_weather",
        "description": "Get the current weather in a given location",
        "parameters": {
          "type": "object",
          "properties": {
            "location": {
              "type": "string",
              "description": "The city and state, e.g. San Francisco, CA"
            }
          },
          "required": [
            "location"
          ]
        }
      }
    ],
    "input": "What is the weather like in Boston, MA?"
  }'
```
`n`n
``` prettyprint
from google import genai
`n
client = genai.Client()
response = client.interactions.create(
    model="gemini-3.6-flash",
    tools=[{
        "type": "function",
        "name": "get_weather",
        "description": "Get the current weather in a given location",
        "parameters": {
            "type": "object",
            "properties": {
                "location": {
                    "type": "string",
                    "description": "The city and state, e.g. San Francisco, CA"
                }
            },
            "required": ["location"]
        }
    }],
    input="What is the weather like in Boston, MA?"
)
print(response.steps[-1])
```
`n`n
``` prettyprint
import {GoogleGenAI} from '@google/genai';
`n
const ai = new GoogleGenAI({});
const interaction = await ai.interactions.create({
    model: 'gemini-3.6-flash',
    tools: [{
        type: 'function',
        name: 'get_weather',
        description: 'Get the current weather in a given location',
        parameters: {
            type: 'object',
            properties: {
                location: {
                    type: 'string',
                    description: 'The city and state, e.g. San Francisco, CA'
                }
            },
            required: ['location']
        }
    }],
    input: 'What is the weather like in Boston, MA?'
});
console.log(interaction.steps.at(-1));
```
`n`n
``` prettyprint
import com.google.genai.Client;
import com.google.genai.gaos.models.interactions.CreateModelInteraction;
import com.google.genai.gaos.models.interactions.Function;
import com.google.genai.gaos.models.interactions.Interaction;
import com.google.genai.gaos.models.interactions.InteractionsInput;
import com.google.genai.gaos.models.interactions.Step;
import com.google.genai.gaos.models.operations.CreateInteractionRequestBody;
import com.google.genai.gaos.models.operations.CreateInteractionResponse;
import java.util.List;
import java.util.Map;
`n
Client client = new Client();
Map parameters = Map.of(
    "type", "object",
    "properties", Map.of(
        "location", Map.of(
            "type", "string",
            "description", "The city and state, e.g. San Francisco, CA"
        )
    ),
    "required", List.of("location")
);
Function functionTool = Function.builder()
    .name("get_weather")
    .description("Get the current weather in a given location")
    .parameters(parameters)
    .build();
CreateModelInteraction params =
    CreateModelInteraction.builder()
        .model("gemini-3.6-flash")
        .tools(List.of(functionTool))
        .input(InteractionsInput.of("What is the weather like in Boston, MA?"))
        .build();
CreateInteractionResponse response =
    client.interactions.create(CreateInteractionRequestBody.of(params));
Interaction interaction =
    response.interaction().orElseThrow(() -> new RuntimeException("No interaction returned"));
List steps = interaction.steps().orElse(List.of());
if (!steps.isEmpty()) {
  System.out.println(steps.get(steps.size() - 1));
}
```
`n`n

### Example 5

`n
#### Example Request
`n
REST Python JavaScript Java
`n`n
``` prettyprint
curl -X POST https://generativelanguage.googleapis.com/v1beta/interactions \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "agent": "deep-research-pro-preview-12-2025",
    "input": "Find a cure to cancer",
    "background": true
  }'
```
`n`n
``` prettyprint
from google import genai
`n
client = genai.Client()
interaction = client.interactions.create(
    agent="deep-research-pro-preview-12-2025",
    input="find a cure to cancer",
    background=True,
)
print(interaction.status)
```
`n`n
``` prettyprint
import {GoogleGenAI} from '@google/genai';
`n
const ai = new GoogleGenAI({});
const interaction = await ai.interactions.create({
    agent: 'deep-research-pro-preview-12-2025',
    input: 'find a cure to cancer',
    background: true,
});
console.log(interaction.status);
```
`n`n
``` prettyprint
import com.google.genai.Client;
import com.google.genai.gaos.models.interactions.AgentOption;
import com.google.genai.gaos.models.interactions.CreateAgentInteraction;
import com.google.genai.gaos.models.interactions.Interaction;
import com.google.genai.gaos.models.interactions.InteractionStatus;
import com.google.genai.gaos.models.interactions.InteractionsInput;
import com.google.genai.gaos.models.operations.CreateInteractionRequestBody;
import com.google.genai.gaos.models.operations.CreateInteractionResponse;
`n
Client client = new Client();
CreateAgentInteraction params =
    CreateAgentInteraction.builder()
        .agent(AgentOption.of("deep-research-pro-preview-12-2025"))
        .input(InteractionsInput.of("find a cure to cancer"))
        .background(true)
        .build();
CreateInteractionResponse response =
    client.interactions.create(CreateInteractionRequestBody.of(params));
Interaction interaction =
    response.interaction().orElseThrow(() -> new RuntimeException("No interaction returned"));
System.out.println(interaction.status().map(InteractionStatus::value).orElse(""));
```
`n`n

### Example 6

`n
#### Example Request
`n
REST Python JavaScript Java
`n`n
``` prettyprint
curl -X POST https://generativelanguage.googleapis.com/v1beta/interactions \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "agent": "antigravity-preview-05-2026",
    "input": "Read Hacker News, summarize the top 5 stories, and save results as a markdown file.",
    "environment": "remote"
  }'
```
`n`n
``` prettyprint
from google import genai
`n
client = genai.Client()
interaction = client.interactions.create(
    agent="antigravity-preview-05-2026",
    input="Read Hacker News, summarize the top 5 stories, and save results as a markdown file.",
    environment="remote",
)
print(interaction.output_text)
```
`n`n
``` prettyprint
import {GoogleGenAI} from '@google/genai';
`n
const ai = new GoogleGenAI({});
const interaction = await ai.interactions.create({
    agent: 'antigravity-preview-05-2026',
    input: 'Read Hacker News, summarize the top 5 stories, and save results as a markdown file.',
    environment: 'remote',
});
console.log(interaction.output_text);
```
`n`n
``` prettyprint
import com.google.genai.Client;
import com.google.genai.gaos.models.interactions.AgentOption;
import com.google.genai.gaos.models.interactions.CreateAgentInteraction;
import com.google.genai.gaos.models.interactions.CreateAgentInteractionEnvironment;
import com.google.genai.gaos.models.interactions.Interaction;
import com.google.genai.gaos.models.interactions.InteractionsInput;
import com.google.genai.gaos.models.operations.CreateInteractionRequestBody;
import com.google.genai.gaos.models.operations.CreateInteractionResponse;
`n
Client client = new Client();
CreateAgentInteraction params =
    CreateAgentInteraction.builder()
        .agent(AgentOption.of("antigravity-preview-05-2026"))
        .input(InteractionsInput.of("Read Hacker News, summarize the top 5 stories, and save results as a markdown file."))
        .environment(CreateAgentInteractionEnvironment.of("remote"))
        .build();
CreateInteractionResponse response =
    client.interactions.create(CreateInteractionRequestBody.of(params));
Interaction interaction =
    response.interaction().orElseThrow(() -> new RuntimeException("No interaction returned"));
System.out.println(interaction.outputText().orElse(""));
```
`n`n

### Example 7

`n
#### Example Request
`n
REST Python JavaScript Java
`n`n
``` prettyprint
# Step 1: Create an interaction with a fresh remote environment.
RESPONSE=$(curl -s -X POST https://generativelanguage.googleapis.com/v1beta/interactions \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "agent": "antigravity-preview-05-2026",
    "input": "Write a hello world script at /workspace/hello.py.",
    "environment": "remote"
  }')
INTERACTION_ID=$(echo $RESPONSE | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
ENV_ID=$(echo $RESPONSE | python3 -c "import sys,json; print(json.load(sys.stdin)['environment_id'])")
`n
# Step 2: Reuse the same environment in a follow-up interaction.
curl -X POST https://generativelanguage.googleapis.com/v1beta/interactions \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"agent\": \"antigravity-preview-05-2026\",
    \"input\": \"Modify the script to accept a name argument and greet the user.\",
    \"environment\": \"$ENV_ID\",
    \"previous_interaction_id\": \"$INTERACTION_ID\"
  }"
```
`n`n
``` prettyprint
from google import genai
`n
client = genai.Client()
`n
# Step 1: Create an interaction with a fresh remote environment.
interaction = client.interactions.create(
    agent="antigravity-preview-05-2026",
    input="Write a hello world script at /workspace/hello.py.",
    environment="remote",
)
print(f"Environment ID: {interaction.environment_id}")
`n
# Step 2: Reuse the same environment in a follow-up interaction.
interaction_2 = client.interactions.create(
    agent="antigravity-preview-05-2026",
    input="Modify the script to accept a name argument and greet the user.",
    environment=interaction.environment_id,
    previous_interaction_id=interaction.id,
)
print(interaction_2.output_text)
```
`n`n
``` prettyprint
import {GoogleGenAI} from '@google/genai';
`n
const ai = new GoogleGenAI({});
`n
// Step 1: Create an interaction with a fresh remote environment.
const interaction = await ai.interactions.create({
    agent: 'antigravity-preview-05-2026',
    input: 'Write a hello world script at /workspace/hello.py.',
    environment: 'remote',
});
console.log(`Environment ID: ${interaction.environment_id}`);
`n
// Step 2: Reuse the same environment in a follow-up interaction.
const interaction2 = await ai.interactions.create({
    agent: 'antigravity-preview-05-2026',
    input: 'Modify the script to accept a name argument and greet the user.',
    environment: interaction.environment_id,
    previous_interaction_id: interaction.id,
});
console.log(interaction2.output_text);
```
`n`n
``` prettyprint
import com.google.genai.Client;
import com.google.genai.gaos.models.interactions.AgentOption;
import com.google.genai.gaos.models.interactions.CreateAgentInteraction;
import com.google.genai.gaos.models.interactions.CreateAgentInteractionEnvironment;
import com.google.genai.gaos.models.interactions.Interaction;
import com.google.genai.gaos.models.interactions.InteractionsInput;
import com.google.genai.gaos.models.operations.CreateInteractionRequestBody;
import com.google.genai.gaos.models.operations.CreateInteractionResponse;
`n
Client client = new Client();
`n
// Step 1: Create an interaction with a fresh remote environment.
CreateAgentInteraction params1 =
    CreateAgentInteraction.builder()
        .agent(AgentOption.of("antigravity-preview-05-2026"))
        .input(InteractionsInput.of("Write a hello world script at /workspace/hello.py."))
        .environment(CreateAgentInteractionEnvironment.of("remote"))
        .build();
CreateInteractionResponse response1 =
    client.interactions.create(CreateInteractionRequestBody.of(params1));
Interaction interaction1 =
    response1.interaction().orElseThrow(() -> new RuntimeException("No interaction returned"));
System.out.println("Environment ID: " + interaction1.environmentId().orElse(""));
`n
// Step 2: Reuse the same environment in a follow-up interaction.
CreateAgentInteraction params2 =
    CreateAgentInteraction.builder()
        .agent(AgentOption.of("antigravity-preview-05-2026"))
        .input(InteractionsInput.of("Modify the script to accept a name argument and greet the user."))
        .environment(CreateAgentInteractionEnvironment.of(interaction1.environmentId().orElse("")))
        .previousInteractionId(interaction1.id().orElse(null))
        .build();
CreateInteractionResponse response2 =
    client.interactions.create(CreateInteractionRequestBody.of(params2));
Interaction interaction2 =
    response2.interaction().orElseThrow(() -> new RuntimeException("No interaction returned"));
System.out.println(interaction2.outputText().orElse(""));
```
`n`n

### Example 8

`n
#### Example Request
`n
REST Python JavaScript Java
`n`n
``` prettyprint
curl -X POST https://generativelanguage.googleapis.com/v1beta/interactions \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "agent": "antigravity-preview-05-2026",
    "input": "List all files under /workspace and summarize what you find.",
    "environment": {
      "type": "remote",
      "sources": [
        {
          "type": "repository",
          "source": "https://github.com/octocat/Spoon-Knife",
          "target": "/workspace/repo"
        },
        {
          "type": "inline",
          "content": "Focus on Python files only.",
          "target": "/workspace/notes.txt"
        }
      ]
    }
  }'
```
`n`n
``` prettyprint
from google import genai
`n
client = genai.Client()
interaction = client.interactions.create(
    agent="antigravity-preview-05-2026",
    input="List all files under /workspace and summarize what you find.",
    environment={
        "type": "remote",
        "sources": [
            {
                "type": "repository",
                "source": "https://github.com/octocat/Spoon-Knife",
                "target": "/workspace/repo",
            },
            {
                "type": "inline",
                "content": "Focus on Python files only.",
                "target": "/workspace/notes.txt",
            },
        ],
    },
)
print(interaction.output_text)
```
`n`n
``` prettyprint
import {GoogleGenAI} from '@google/genai';
`n
const ai = new GoogleGenAI({});
const interaction = await ai.interactions.create({
    agent: 'antigravity-preview-05-2026',
    input: 'List all files under /workspace and summarize what you find.',
    environment: {
        type: 'remote',
        sources: [
            {
                type: 'repository',
                source: 'https://github.com/octocat/Spoon-Knife',
                target: '/workspace/repo',
            },
            {
                type: 'inline',
                content: 'Focus on Python files only.',
                target: '/workspace/notes.txt',
            },
        ],
    },
});
console.log(interaction.output_text);
```
`n`n
``` prettyprint
import com.google.genai.Client;
import com.google.genai.gaos.models.interactions.AgentOption;
import com.google.genai.gaos.models.interactions.CreateAgentInteraction;
import com.google.genai.gaos.models.interactions.CreateAgentInteractionEnvironment;
import com.google.genai.gaos.models.interactions.Environment;
import com.google.genai.gaos.models.interactions.Interaction;
import com.google.genai.gaos.models.interactions.InteractionsInput;
import com.google.genai.gaos.models.interactions.Source;
import com.google.genai.gaos.models.interactions.SourceType;
import com.google.genai.gaos.models.operations.CreateInteractionRequestBody;
import com.google.genai.gaos.models.operations.CreateInteractionResponse;
import java.util.List;
`n
Client client = new Client();
Environment env = Environment.builder()
    .sources(List.of(
        Source.builder()
            .type(SourceType.REPOSITORY)
            .source("https://github.com/octocat/Spoon-Knife")
            .target("/workspace/repo")
            .build(),
        Source.builder()
            .type(SourceType.INLINE)
            .content("Focus on Python files only.")
            .target("/workspace/notes.txt")
            .build()
    ))
    .build();
CreateAgentInteraction params =
    CreateAgentInteraction.builder()
        .agent(AgentOption.of("antigravity-preview-05-2026"))
        .input(InteractionsInput.of("List all files under /workspace and summarize what you find."))
        .environment(CreateAgentInteractionEnvironment.of(env))
        .build();
CreateInteractionResponse response =
    client.interactions.create(CreateInteractionRequestBody.of(params));
Interaction interaction =
    response.interaction().orElseThrow(() -> new RuntimeException("No interaction returned"));
System.out.println(interaction.outputText().orElse(""));
```
`n`n

### Example 9

`n
#### Example Request
`n
REST Python JavaScript Java
`n`n
``` prettyprint
# Step 1: Create a custom agent.
curl -X POST https://generativelanguage.googleapis.com/v1beta/agents \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "code-reviewer",
    "base_agent": "antigravity-preview-05-2026",
    "system_instruction": "You are a senior code reviewer. Check every file for bugs, style issues, and security vulnerabilities.",
    "base_environment": {
      "type": "remote",
      "sources": [{
        "type": "repository",
        "source": "https://github.com/octocat/Spoon-Knife",
        "target": "/workspace/repo"
      }]
    }
  }'
`n
# Step 2: Use the custom agent.
curl -X POST https://generativelanguage.googleapis.com/v1beta/interactions \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "agent": "code-reviewer",
    "input": "Review the latest changes in /workspace/repo/src and file a summary.",
    "environment": "remote"
  }'
```
`n`n
``` prettyprint
import uuid
from google import genai
`n
client = genai.Client()
`n
# Step 1: Create a custom agent.
agent_id = f"code-reviewer-{uuid.uuid4().hex[:8]}"
client.agents.create(
    id=agent_id,
    base_agent="antigravity-preview-05-2026",
    system_instruction="You are a senior code reviewer. Check every file for bugs, style issues, and security vulnerabilities.",
    base_environment={
        "type": "remote",
        "sources": [{
            "type": "repository",
            "source": "https://github.com/octocat/Spoon-Knife",
            "target": "/workspace/repo",
        }],
    },
)
`n
# Step 2: Use the custom agent.
result = client.interactions.create(
    agent=agent_id,
    input="Review the latest changes in /workspace/repo/src and file a summary.",
    environment="remote",
)
print(result.output_text)
```
`n`n
``` prettyprint
import {GoogleGenAI} from '@google/genai';
`n
const ai = new GoogleGenAI({});
`n
// Step 1: Create a custom agent.
const agentId = `code-reviewer-${crypto.randomUUID().slice(0, 8)}`;
await ai.agents.create({
    id: agentId,
    base_agent: 'antigravity-preview-05-2026',
    system_instruction: 'You are a senior code reviewer. Check every file for bugs, style issues, and security vulnerabilities.',
    base_environment: {
        type: 'remote',
        sources: [{
            type: 'repository',
            source: 'https://github.com/octocat/Spoon-Knife',
            target: '/workspace/repo',
        }],
    },
});
`n
// Step 2: Use the custom agent.
const result = await ai.interactions.create({
    agent: agentId,
    input: 'Review the latest changes in /workspace/repo/src and file a summary.',
    environment: 'remote',
});
console.log(result.output_text);
```
`n`n
``` prettyprint
import com.google.genai.Client;
import com.google.genai.gaos.models.agents.Agent;
import com.google.genai.gaos.models.agents.BaseEnvironment;
import com.google.genai.gaos.models.interactions.AgentOption;
import com.google.genai.gaos.models.interactions.CreateAgentInteraction;
import com.google.genai.gaos.models.interactions.CreateAgentInteractionEnvironment;
import com.google.genai.gaos.models.interactions.Environment;
import com.google.genai.gaos.models.interactions.Interaction;
import com.google.genai.gaos.models.interactions.InteractionsInput;
import com.google.genai.gaos.models.interactions.Source;
import com.google.genai.gaos.models.interactions.SourceType;
import com.google.genai.gaos.models.operations.CreateInteractionRequestBody;
import com.google.genai.gaos.models.operations.CreateInteractionResponse;
import java.util.List;
import java.util.UUID;
`n
Client client = new Client();
`n
// Step 1: Create a custom agent.
String agentId = "code-reviewer-" + UUID.randomUUID().toString().substring(0, 8);
Environment baseEnv = Environment.builder()
    .sources(List.of(
        Source.builder()
            .type(SourceType.REPOSITORY)
            .source("https://github.com/octocat/Spoon-Knife")
            .target("/workspace/repo")
            .build()
    ))
    .build();
Agent customAgent = Agent.builder()
    .id(agentId)
    .baseAgent("antigravity-preview-05-2026")
    .systemInstruction("You are a senior code reviewer. Check every file for bugs, style issues, and security vulnerabilities.")
    .baseEnvironment(BaseEnvironment.of(baseEnv))
    .build();
client.agents.create(customAgent);
`n
// Step 2: Use the custom agent.
CreateAgentInteraction params =
    CreateAgentInteraction.builder()
        .agent(AgentOption.of(agentId))
        .input(InteractionsInput.of("Review the latest changes in /workspace/repo/src and file a summary."))
        .environment(CreateAgentInteractionEnvironment.of("remote"))
        .build();
CreateInteractionResponse response =
    client.interactions.create(CreateInteractionRequestBody.of(params));
Interaction interaction =
    response.interaction().orElseThrow(() -> new RuntimeException("No interaction returned"));
System.out.println(interaction.outputText().orElse(""));
```
`n`n

### Example 10

`n
#### Example Request
`n
REST Python JavaScript Java Dotnet
`n`n
``` prettyprint
curl -X POST "https://generativelanguage.googleapis.com/v1beta/interactions/$INTERACTION_ID/cancel" \
  -H "x-goog-api-key: $GEMINI_API_KEY"
```
`n`n
``` prettyprint
from google import genai
`n
client = genai.Client()
`n
# Start a background interaction so it stays in-progress.
created = client.interactions.create(
    model="gemini-3.6-flash",
    input="Write a long essay about the history of computing.",
    tools=[{"type": "computer_use"}],
    background=True,
)
`n
# Cancel the in-progress interaction.
interaction = client.interactions.cancel(id=created.id)
print(interaction.status)
```
`n`n
``` prettyprint
import {GoogleGenAI} from '@google/genai';
`n
const ai = new GoogleGenAI({});
`n
// Start a background interaction so it stays in-progress.
const created = await ai.interactions.create({
    model: 'gemini-3.6-flash',
    input: 'Write a long essay about the history of computing.',
    tools: [{ type: 'computer_use' }],
    background: true,
});
`n
// Cancel the in-progress interaction.
const interaction = await ai.interactions.cancel(created.id);
console.log(interaction.status);
```
`n`n
``` prettyprint
import com.google.genai.Client;
import com.google.genai.gaos.models.interactions.ComputerUse;
import com.google.genai.gaos.models.interactions.CreateModelInteraction;
import com.google.genai.gaos.models.interactions.Interaction;
import com.google.genai.gaos.models.interactions.InteractionStatus;
import com.google.genai.gaos.models.interactions.InteractionsInput;
import com.google.genai.gaos.models.operations.CancelInteractionByIdResponse;
import com.google.genai.gaos.models.operations.CreateInteractionRequestBody;
import com.google.genai.gaos.models.operations.CreateInteractionResponse;
import java.util.List;
`n
Client client = new Client();
`n
// Start a background interaction so it stays in-progress.
CreateModelInteraction params =
    CreateModelInteraction.builder()
        .model("gemini-3.6-flash")
        .input(InteractionsInput.of("Write a long essay about the history of computing."))
        .tools(List.of(new ComputerUse()))
        .background(true)
        .build();
CreateInteractionResponse created =
    client.interactions.create(CreateInteractionRequestBody.of(params));
String interactionId = created.interaction().flatMap(Interaction::id).orElseThrow();
`n
// Cancel the in-progress interaction.
CancelInteractionByIdResponse cancelResponse = client.interactions.cancel(interactionId);
Interaction interaction =
    cancelResponse.interaction().orElseThrow(() -> new RuntimeException("No interaction returned"));
System.out.println(interaction.status().map(InteractionStatus::value).orElse(""));
```
`n`n
``` prettyprint
using System.Collections.Generic;
using Google.GenAI;
using Google.GenAI.Gaos.Models.Interactions;
using Google.GenAI.Gaos.Models.Requests;
`n
var client = new Client();
`n
var response = await client.Interactions.CancelAsync(id: created.Interaction!.Id!);
Console.WriteLine(response.Interaction!.Status);
```
`n`n

### Example 11

`n
#### Example Request
`n
REST Python JavaScript Java
`n`n
``` prettyprint
curl -X GET "https://generativelanguage.googleapis.com/v1beta/interactions/$INTERACTION_ID" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
```
`n`n
``` prettyprint
from google import genai
`n
client = genai.Client()
`n
interaction = client.interactions.get(id=created.id)
print(interaction.status)
```
`n`n
``` prettyprint
import {GoogleGenAI} from '@google/genai';
`n
const ai = new GoogleGenAI({});
`n
const interaction = await ai.interactions.get(created.id);
console.log(interaction.status);
```
`n`n
``` prettyprint
import com.google.genai.Client;
import com.google.genai.gaos.models.interactions.CreateModelInteraction;
import com.google.genai.gaos.models.interactions.Interaction;
import com.google.genai.gaos.models.interactions.InteractionStatus;
import com.google.genai.gaos.models.interactions.InteractionsInput;
import com.google.genai.gaos.models.operations.CreateInteractionRequestBody;
import com.google.genai.gaos.models.operations.CreateInteractionResponse;
import com.google.genai.gaos.models.operations.GetInteractionByIdRequest;
import com.google.genai.gaos.models.operations.GetInteractionByIdResponse;
`n
Client client = new Client();
`n
GetInteractionByIdResponse getResponse =
    client.interactions.get(new GetInteractionByIdRequest(interactionId));
Interaction interaction =
    getResponse.interaction().orElseThrow(() -> new RuntimeException("No interaction returned"));
System.out.println(interaction.status().map(InteractionStatus::value).orElse(""));
```
`n`n

### Example 12

`n
#### Example Request
`n
REST Python JavaScript Java Dotnet
`n`n
``` prettyprint
curl -X DELETE "https://generativelanguage.googleapis.com/v1beta/interactions/$INTERACTION_ID" \
  -H "x-goog-api-key: $GEMINI_API_KEY"
```
`n`n
``` prettyprint
from google import genai
`n
client = genai.Client()
`n
client.interactions.delete(id=created.id)
print("Interaction deleted successfully.")
```
`n`n
``` prettyprint
import {GoogleGenAI} from '@google/genai';
`n
const ai = new GoogleGenAI({});
`n
await ai.interactions.delete(created.id);
console.log('Interaction deleted successfully.');
```
`n`n
``` prettyprint
import com.google.genai.Client;
import com.google.genai.gaos.models.interactions.CreateModelInteraction;
import com.google.genai.gaos.models.interactions.Interaction;
import com.google.genai.gaos.models.interactions.InteractionsInput;
import com.google.genai.gaos.models.operations.CreateInteractionRequestBody;
import com.google.genai.gaos.models.operations.CreateInteractionResponse;
`n
Client client = new Client();
`n
client.interactions.delete(interactionId);
System.out.println("Interaction deleted successfully.");
```
`n`n
``` prettyprint
using Google.GenAI;
using Google.GenAI.Gaos.Models.Interactions;
using Google.GenAI.Gaos.Models.Requests;
`n
var client = new Client();
`n
await client.Interactions.DeleteAsync(id: created.Interaction!.Id!);
Console.WriteLine("Interaction deleted successfully.");
```
`n`n

### Example 13

`n
#### Example
`n
REST Python JavaScript Java
`n`n
``` prettyprint
curl -X POST https://generativelanguage.googleapis.com/v1beta/interactions \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-3.6-flash",
    "tools": [{
      "type": "code_execution"
    }],
    "input": "Calculate the first 10 Fibonacci numbers"
  }'
```
`n`n
``` prettyprint
from google import genai
`n
client = genai.Client()
response = client.interactions.create(
    model="gemini-3.6-flash",
    tools=[{"type": "code_execution"}],
    input="Calculate the first 10 Fibonacci numbers"
)
print(response.output_text)
```
`n`n
``` prettyprint
import {GoogleGenAI} from '@google/genai';
`n
const ai = new GoogleGenAI({});
const interaction = await ai.interactions.create({
    model: 'gemini-3.6-flash',
    tools: [{ type: 'code_execution' }],
    input: 'Calculate the first 10 Fibonacci numbers'
});
console.log(interaction.output_text);
```
`n`n
``` prettyprint
import com.google.genai.Client;
import com.google.genai.gaos.models.interactions.CodeExecution;
import com.google.genai.gaos.models.interactions.CreateModelInteraction;
import com.google.genai.gaos.models.interactions.Interaction;
import com.google.genai.gaos.models.interactions.InteractionsInput;
import com.google.genai.gaos.models.operations.CreateInteractionRequestBody;
import com.google.genai.gaos.models.operations.CreateInteractionResponse;
import java.util.List;
`n
Client client = new Client();
CreateModelInteraction params =
    CreateModelInteraction.builder()
        .model("gemini-3.6-flash")
        .tools(List.of(new CodeExecution()))
        .input(InteractionsInput.of("Calculate the first 10 Fibonacci numbers"))
        .build();
CreateInteractionResponse response =
    client.interactions.create(CreateInteractionRequestBody.of(params));
Interaction interaction =
    response.interaction().orElseThrow(() -> new RuntimeException("No interaction returned"));
System.out.println(interaction.outputText().orElse(""));
```
`n`n

### Example 14

`n
#### Example
`n
REST Python JavaScript Java
`n`n
``` prettyprint
curl -X POST https://generativelanguage.googleapis.com/v1beta/interactions \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-2.5-computer-use-preview-10-2025",
    "tools": [{
      "type": "computer_use"
    }],
    "input": "Find a flight to Tokyo"
  }'
```
`n`n
``` prettyprint
from google import genai
`n
client = genai.Client()
response = client.interactions.create(
    model="gemini-2.5-computer-use-preview-10-2025",
    tools=[{"type": "computer_use"}],
    input="Find a flight to Tokyo"
)
print(response.output_text)
```
`n`n
``` prettyprint
import {GoogleGenAI} from '@google/genai';
`n
const ai = new GoogleGenAI({});
const interaction = await ai.interactions.create({
    model: 'gemini-2.5-computer-use-preview-10-2025',
    tools: [{ type: 'computer_use'}],
    input: 'Find a flight to Tokyo'
});
console.log(interaction.output_text);
```
`n`n
``` prettyprint
import com.google.genai.Client;
import com.google.genai.gaos.models.interactions.ComputerUse;
import com.google.genai.gaos.models.interactions.CreateModelInteraction;
import com.google.genai.gaos.models.interactions.Interaction;
import com.google.genai.gaos.models.interactions.InteractionsInput;
import com.google.genai.gaos.models.operations.CreateInteractionRequestBody;
import com.google.genai.gaos.models.operations.CreateInteractionResponse;
import java.util.List;
`n
Client client = new Client();
CreateModelInteraction params =
    CreateModelInteraction.builder()
        .model("gemini-2.5-computer-use-preview-10-2025")
        .tools(List.of(new ComputerUse()))
        .input(InteractionsInput.of("Find a flight to Tokyo"))
        .build();
CreateInteractionResponse response =
    client.interactions.create(CreateInteractionRequestBody.of(params));
Interaction interaction =
    response.interaction().orElseThrow(() -> new RuntimeException("No interaction returned"));
System.out.println(interaction.outputText().orElse(""));
```
`n`n

### Example 15

`n
#### Example
`n
REST Python JavaScript Java
`n`n
``` prettyprint
curl -X POST https://generativelanguage.googleapis.com/v1beta/interactions \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-3.6-flash",
    "tools": [{
      "type": "file_search",
      "file_search_store_names": ["fileSearchStores/m64d1sevsr4y-xfyawui3fxqg"]
    }],
    "input": "Who is the author of the book?"
  }'
```
`n`n
``` prettyprint
from google import genai
`n
client = genai.Client()
`n
# Create a file search store so we have a valid one to use.
store = client.file_search_stores.create()
`n
response = client.interactions.create(
    model="gemini-3.6-flash",
    tools=[{
        "type": "file_search",
        "file_search_store_names": [store.name]
    }],
    input="What documents are available?"
)
print(response.output_text)
`n
# [cleanup]
client.file_search_stores.delete(name=store.name)
# [/cleanup]
```
`n`n
``` prettyprint
import {GoogleGenAI} from '@google/genai';
`n
const ai = new GoogleGenAI({});
`n
// Create a file search store so we have a valid one to use.
const store = await ai.fileSearchStores.create({});
if (!store.name) {
    throw new Error('Store creation failed: Name is undefined');
}
`n
const interaction = await ai.interactions.create({
    model: 'gemini-3.6-flash',
    tools: [{
        type: 'file_search',
        file_search_store_names: [store.name]
    }],
    input: 'What documents are available?'
});
console.log(interaction.output_text);
`n
// [cleanup]
await ai.fileSearchStores.delete({name: store.name});
// [/cleanup]
```
`n`n
``` prettyprint
import com.google.genai.Client;
import com.google.genai.gaos.models.interactions.CreateModelInteraction;
import com.google.genai.gaos.models.interactions.FileSearch;
import com.google.genai.gaos.models.interactions.Interaction;
import com.google.genai.gaos.models.interactions.InteractionsInput;
import com.google.genai.gaos.models.operations.CreateInteractionRequestBody;
import com.google.genai.gaos.models.operations.CreateInteractionResponse;
import com.google.genai.types.CreateFileSearchStoreConfig;
import com.google.genai.types.FileSearchStore;
import java.util.List;
`n
Client client = new Client();
`n
// Create a file search store so we have a valid one to use.
FileSearchStore store = client.fileSearchStores.create(CreateFileSearchStoreConfig.builder().build());
String storeName = store.name().orElseThrow();
`n
FileSearch tool = FileSearch.builder()
    .fileSearchStoreNames(List.of(storeName))
    .build();
CreateModelInteraction params =
    CreateModelInteraction.builder()
        .model("gemini-3.6-flash")
        .tools(List.of(tool))
        .input(InteractionsInput.of("What documents are available?"))
        .build();
CreateInteractionResponse response =
    client.interactions.create(CreateInteractionRequestBody.of(params));
Interaction interaction =
    response.interaction().orElseThrow(() -> new RuntimeException("No interaction returned"));
System.out.println(interaction.outputText().orElse(""));
`n
// [cleanup]
client.fileSearchStores.delete(storeName, null);
// [/cleanup]
```
`n`n

### Example 16

`n
#### Example
`n
REST Python JavaScript Java
`n`n
``` prettyprint
curl -X POST https://generativelanguage.googleapis.com/v1beta/interactions \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-3.6-flash",
    "tools": [{
      "type": "function",
      "name": "get_weather",
      "description": "Get the current weather in a given location",
      "parameters": {
        "type": "object",
        "properties": {
          "location": {
            "type": "string",
            "description": "The city and state, e.g. San Francisco, CA"
          }
        },
        "required": ["location"]
      }
    }],
    "input": "What is the weather like in Boston, MA?"
  }'
```
`n`n
``` prettyprint
from google import genai
`n
client = genai.Client()
response = client.interactions.create(
    model="gemini-3.6-flash",
    tools=[{
        "type": "function",
        "name": "get_weather",
        "description": "Get the current weather in a given location",
        "parameters": {
            "type": "object",
            "properties": {
                "location": {
                    "type": "string",
                    "description": "The city and state, e.g. San Francisco, CA"
                }
            },
            "required": ["location"]
        }
    }],
    input="What is the weather like in Boston?"
)
print(response.steps[-1])
```
`n`n
``` prettyprint
import {GoogleGenAI} from '@google/genai';
`n
const ai = new GoogleGenAI({});
const interaction = await ai.interactions.create({
    model: 'gemini-3.6-flash',
    tools: [{
        type: 'function',
        name: 'get_weather',
        description: 'Get the current weather in a given location',
        parameters: {
            type: 'object',
            properties: {
                location: {
                    type: 'string',
                    description: 'The city and state, e.g. San Francisco, CA'
                }
            },
            required: ['location']
        }
    }],
    input: 'What is the weather like in Boston?'
});
console.log(interaction.steps.at(-1));
```
`n`n
``` prettyprint
import com.google.genai.Client;
import com.google.genai.gaos.models.interactions.CreateModelInteraction;
import com.google.genai.gaos.models.interactions.Function;
import com.google.genai.gaos.models.interactions.Interaction;
import com.google.genai.gaos.models.interactions.InteractionsInput;
import com.google.genai.gaos.models.interactions.Step;
import com.google.genai.gaos.models.operations.CreateInteractionRequestBody;
import com.google.genai.gaos.models.operations.CreateInteractionResponse;
import java.util.List;
import java.util.Map;
`n
Client client = new Client();
Map parameters = Map.of(
    "type", "object",
    "properties", Map.of(
        "location", Map.of(
            "type", "string",
            "description", "The city and state, e.g. San Francisco, CA"
        )
    ),
    "required", List.of("location")
);
Function functionTool = Function.builder()
    .name("get_weather")
    .description("Get the current weather in a given location")
    .parameters(parameters)
    .build();
CreateModelInteraction params =
    CreateModelInteraction.builder()
        .model("gemini-3.6-flash")
        .tools(List.of(functionTool))
        .input(InteractionsInput.of("What is the weather like in Boston?"))
        .build();
CreateInteractionResponse response =
    client.interactions.create(CreateInteractionRequestBody.of(params));
Interaction interaction =
    response.interaction().orElseThrow(() -> new RuntimeException("No interaction returned"));
List steps = interaction.steps().orElse(List.of());
if (!steps.isEmpty()) {
  System.out.println(steps.get(steps.size() - 1));
}
```
`n`n

### Example 17

`n
#### Example
`n
REST Python JavaScript Java
`n`n
``` prettyprint
curl -X POST https://generativelanguage.googleapis.com/v1beta/interactions \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-3.6-flash",
    "tools": [{
      "type": "google_maps",
      "latitude": 37.7749,
      "longitude": -122.4194
    }],
    "input": "What is the best food near me?"
  }'
```
`n`n
``` prettyprint
from google import genai
`n
client = genai.Client()
response = client.interactions.create(
    model="gemini-3.6-flash",
    tools=[{
        "type": "google_maps",
        "latitude": 37.7749,
        "longitude": -122.4194
    }],
    input="What is the best food near me?"
)
print(response.output_text)
```
`n`n
``` prettyprint
import {GoogleGenAI} from '@google/genai';
`n
const ai = new GoogleGenAI({});
const interaction = await ai.interactions.create({
    model: 'gemini-3.6-flash',
    tools: [{
        type: 'google_maps',
        latitude: 37.7749,
        longitude: -122.4194
    }],
    input: 'What is the best food near me?'
});
console.log(interaction.output_text);
```
`n`n
``` prettyprint
import com.google.genai.Client;
import com.google.genai.gaos.models.interactions.CreateModelInteraction;
import com.google.genai.gaos.models.interactions.GoogleMaps;
import com.google.genai.gaos.models.interactions.Interaction;
import com.google.genai.gaos.models.interactions.InteractionsInput;
import com.google.genai.gaos.models.operations.CreateInteractionRequestBody;
import com.google.genai.gaos.models.operations.CreateInteractionResponse;
import java.util.List;
`n
Client client = new Client();
GoogleMaps tool = GoogleMaps.builder()
    .latitude(37.7749)
    .longitude(-122.4194)
    .build();
CreateModelInteraction params =
    CreateModelInteraction.builder()
        .model("gemini-3.6-flash")
        .tools(List.of(tool))
        .input(InteractionsInput.of("What is the best food near me?"))
        .build();
CreateInteractionResponse response =
    client.interactions.create(CreateInteractionRequestBody.of(params));
Interaction interaction =
    response.interaction().orElseThrow(() -> new RuntimeException("No interaction returned"));
System.out.println(interaction.outputText().orElse(""));
```
`n`n

### Example 18

`n
#### Example
`n
REST Python JavaScript Java
`n`n
``` prettyprint
curl -X POST https://generativelanguage.googleapis.com/v1beta/interactions \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-3.6-flash",
    "tools": [{
      "type": "google_search"
    }],
    "input": "Who is the current president of France?"
  }'
```
`n`n
``` prettyprint
from google import genai
`n
client = genai.Client()
response = client.interactions.create(
    model="gemini-3.6-flash",
    tools=[{"type": "google_search"}],
    input="Who is the current president of France?"
)
print(response.output_text)
```
`n`n
``` prettyprint
import {GoogleGenAI} from '@google/genai';
`n
const ai = new GoogleGenAI({});
const interaction = await ai.interactions.create({
    model: 'gemini-3.6-flash',
    tools: [{ type: 'google_search' }],
    input: 'Who is the current president of France?'
});
console.log(interaction.output_text);
```
`n`n
``` prettyprint
import com.google.genai.Client;
import com.google.genai.gaos.models.interactions.CreateModelInteraction;
import com.google.genai.gaos.models.interactions.GoogleSearch;
import com.google.genai.gaos.models.interactions.Interaction;
import com.google.genai.gaos.models.interactions.InteractionsInput;
import com.google.genai.gaos.models.operations.CreateInteractionRequestBody;
import com.google.genai.gaos.models.operations.CreateInteractionResponse;
import java.util.List;
`n
Client client = new Client();
CreateModelInteraction params =
    CreateModelInteraction.builder()
        .model("gemini-3.6-flash")
        .tools(List.of(new GoogleSearch()))
        .input(InteractionsInput.of("Who is the current president of France?"))
        .build();
CreateInteractionResponse response =
    client.interactions.create(CreateInteractionRequestBody.of(params));
Interaction interaction =
    response.interaction().orElseThrow(() -> new RuntimeException("No interaction returned"));
System.out.println(interaction.outputText().orElse(""));
```
`n`n

### Example 19

`n
#### Example
`n
REST Python JavaScript Java
`n`n
``` prettyprint
curl -X POST https://generativelanguage.googleapis.com/v1beta/interactions \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-3.6-flash",
    "tools": [{
      "type": "mcp_server",
      "name": "weather_service",
      "url": "https://gemini-api-demos.uc.r.appspot.com/mcp"
    }],
    "input": "Today is 12-05-2025, what is the temperature today in London?"
  }'
```
`n`n
``` prettyprint
from google import genai
`n
client = genai.Client()
response = client.interactions.create(
    model="gemini-3.6-flash",
    tools=[{
        "type": "mcp_server",
        "name": "weather_service",
        "url": "https://gemini-api-demos.uc.r.appspot.com/mcp"
    }],
    input="Today is 12-05-2025, what is the temperature today in London?"
)
print(response.output_text)
```
`n`n
``` prettyprint
import {GoogleGenAI} from '@google/genai';
`n
const ai = new GoogleGenAI({});
const interaction = await ai.interactions.create({
    model: 'gemini-3.6-flash',
    tools: [{
        type: 'mcp_server',
        name: 'weather_service',
        url: 'https://gemini-api-demos.uc.r.appspot.com/mcp'
    }],
    input: 'Today is 12-05-2025, what is the temperature today in London?'
});
console.log(interaction.output_text);
```
`n`n
``` prettyprint
import com.google.genai.Client;
import com.google.genai.gaos.models.interactions.CreateModelInteraction;
import com.google.genai.gaos.models.interactions.Interaction;
import com.google.genai.gaos.models.interactions.InteractionsInput;
import com.google.genai.gaos.models.interactions.MCPServer;
import com.google.genai.gaos.models.operations.CreateInteractionRequestBody;
import com.google.genai.gaos.models.operations.CreateInteractionResponse;
import java.util.List;
`n
Client client = new Client();
MCPServer mcpTool = MCPServer.builder()
    .name("weather_service")
    .url("https://gemini-api-demos.uc.r.appspot.com/mcp")
    .build();
CreateModelInteraction params =
    CreateModelInteraction.builder()
        .model("gemini-3.6-flash")
        .tools(List.of(mcpTool))
        .input(InteractionsInput.of("Today is 12-05-2025, what is the temperature today in London?"))
        .build();
CreateInteractionResponse response =
    client.interactions.create(CreateInteractionRequestBody.of(params));
Interaction interaction =
    response.interaction().orElseThrow(() -> new RuntimeException("No interaction returned"));
System.out.println(interaction.outputText().orElse(""));
```
`n`n

### Example 20

`n
#### Example
`n
REST Python JavaScript Java
`n`n
``` prettyprint
curl -X POST https://generativelanguage.googleapis.com/v1beta/interactions \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-3.6-flash",
    "tools": [{
      "type": "url_context"
    }],
    "input": "Summarize https://www.example.com"
  }'
```
`n`n
``` prettyprint
from google import genai
`n
client = genai.Client()
response = client.interactions.create(
    model="gemini-3.6-flash",
    tools=[{"type": "url_context"}],
    input="Summarize https://www.example.com"
)
print(response.output_text)
```
`n`n
``` prettyprint
import {GoogleGenAI} from '@google/genai';
`n
const ai = new GoogleGenAI({});
const interaction = await ai.interactions.create({
    model: 'gemini-3.6-flash',
    tools: [{ type: 'url_context' }],
    input: 'Summarize https://www.example.com'
});
console.log(interaction.output_text);
```
`n`n
``` prettyprint
import com.google.genai.Client;
import com.google.genai.gaos.models.interactions.CreateModelInteraction;
import com.google.genai.gaos.models.interactions.Interaction;
import com.google.genai.gaos.models.interactions.InteractionsInput;
import com.google.genai.gaos.models.interactions.URLContext;
import com.google.genai.gaos.models.operations.CreateInteractionRequestBody;
import com.google.genai.gaos.models.operations.CreateInteractionResponse;
import java.util.List;
`n
Client client = new Client();
CreateModelInteraction params =
    CreateModelInteraction.builder()
        .model("gemini-3.6-flash")
        .tools(List.of(new URLContext()))
        .input(InteractionsInput.of("Summarize https://www.example.com"))
        .build();
CreateInteractionResponse response =
    client.interactions.create(CreateInteractionRequestBody.of(params));
Interaction interaction =
    response.interaction().orElseThrow(() -> new RuntimeException("No interaction returned"));
System.out.println(interaction.outputText().orElse(""));
```
`n`n


