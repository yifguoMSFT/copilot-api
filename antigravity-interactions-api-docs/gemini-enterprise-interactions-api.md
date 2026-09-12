# Interactions API (Gemini Enterprise Agent Platform)

> Source: https://docs.cloud.google.com/gemini-enterprise-agent-platform/reference/models/interactions-api
> Captured: 2026-09-12 (Asia/Tokyo)
> Capture method: official HTML page converted to Markdown; interactive iframe examples fetched separately and included in the appendix.

---

# Interactions API  

<div class="devsite-article-body clearfix">

The Interactions API is an experimental API that allows developers to build generative AI applications using generative models and agents hosted on Gemini Enterprise Agent Platform.

<div class="prototype" itemscope="" itemtype="http://developers.google.com/ReferenceObject">

## Creating an interaction

<div>

<span class="endpoint"> <span class="http-method post"> post </span> </span> <span class="endpoint-url" style="font-size: 16px; color: var(--devsite-code-color);"> https://aiplatform.googleapis.com/v1beta1/projects/{project}/locations/global/interactions </span>

</div>

<div id="description" class="section">

Creates a new interaction.

</div>

<div class="section prototype">

- [Request body](#CreateInteraction.request_body)
- [Response](#CreateInteraction.response)

<div class="column-container request-section" style="margin-top: 48px;">

<div class="reference">

<div id="CreateInteraction.request_body" class="section">

### Request body

The request body contains data with the following structure:

<span class="expander-icon"></span> <span class="field-name">model</span> <span class="field-type">ModelOption</span> <span class="field-necessity optional"> (optional)</span>

<div class="field-description">

The name of the \`Model\` used for generating the interaction.  
**Required if \`agent\` is not provided.**

Possible values:

- `lyria-3-clip-preview`

  Our low-latency, music generation model optimized for high-fidelity audio clips and precise rhythmic control.

- `lyria-3-pro-preview`

  Our advanced, full-song generative model with deep compositional understanding, optimized for precise structural control and complex transitions across diverse musical styles.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The model that will complete your prompt.\n\nSee \[models\](https://ai.google.dev/gemini-api/docs/models) for additional details.

</div>

</div>

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">agent</span> <span class="field-type">AgentOption</span> <span class="field-necessity optional"> (optional)</span>

<div class="field-description">

The name of the \`Agent\` used for generating the interaction.  
**Required if \`model\` is not provided.**

Possible values:

- `deep-research-preview-04-2026`

  Gemini Deep Research Agent

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The agent to interact with.

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">input</span> <span class="field-type">[Content](#Resource:Content) or array ([Content](#Resource:Content)) or array ([Step](#Resource:Step)) or string</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

The inputs for the interaction (common to both Model and Agent).

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">system_instruction</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

System instruction for the interaction.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">tools</span> <span class="field-type">array ([Tool](#Resource:Tool))</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

A list of tool declarations the model may call during interaction.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">response_format</span> <span class="field-type">[ResponseFormat](#Resource:ResponseFormat) or [ResponseFormatList](#Resource:ResponseFormatList)</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Enforces that the generated response is a JSON object that complies with the JSON schema specified in this field.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">response_mime_type</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The mime type of the response. This is required if response_format is set.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">stream</span> <span class="field-type">boolean</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Input only. Whether the interaction will be streamed.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">store</span> <span class="field-type">boolean</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Input only. Whether to store the response and request for later retrieval.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">background</span> <span class="field-type">boolean</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Input only. Whether to run the model interaction in the background.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">generation_config</span> <span class="field-type">GenerationConfig</span> <span class="field-necessity optional"> (optional)</span>

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

<span class="field-name">temperature</span> <span class="field-type">number</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Controls the randomness of the output.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">top_p</span> <span class="field-type">number</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The maximum cumulative probability of tokens to consider when sampling.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">seed</span> <span class="field-type">integer</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Seed used in decoding for reproducibility.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">stop_sequences</span> <span class="field-type">array (string)</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

A list of character sequences that will stop output interaction.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">thinking_level</span> <span class="field-type">ThinkingLevel</span> <span class="field-necessity optional"> (optional)</span>

<div class="field-description">

The level of thought tokens that the model should generate.

Possible values:

- `minimal`
- `low`
- `medium`
- `high`

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

</div>

</div>

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">thinking_summaries</span> <span class="field-type">ThinkingSummaries</span> <span class="field-necessity optional"> (optional)</span>

<div class="field-description">

Whether to include thought summaries in the response.

Possible values:

- `auto`
- `none`

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">max_output_tokens</span> <span class="field-type">integer</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The maximum number of tokens to include in the response.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">speech_config</span> <span class="field-type">SpeechConfig</span> <span class="field-necessity optional"> (optional)</span>

<div class="field-description">

Configuration for speech interaction.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The configuration for speech interaction.

#### Fields

<div class="field-entry">

<div class="signature">

<span class="field-name">voice</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The voice of the speaker.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">language</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The language of the speech.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">speaker</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The speaker's name, it should match the speaker name given in the prompt.

</div>

</div>

</div>

</div>

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">image_config</span> <span class="field-type">ImageConfig</span> <span class="field-necessity optional"> (optional)</span>

<div class="field-description">

Configuration for image interaction.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The configuration for image interaction.

#### Fields

<div class="field-entry">

<div class="signature">

<span class="field-name">aspect_ratio</span> <span class="field-type">enum (string)</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

No description provided.

Possible values:

- `1:1`
- `2:3`
- `3:2`
- `3:4`
- `4:3`
- `4:5`
- `5:4`
- `9:16`
- `16:9`
- `21:9`
- `1:8`
- `8:1`
- `1:4`
- `4:1`

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">image_size</span> <span class="field-type">enum (string)</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

No description provided.

Possible values:

- `1K`
- `2K`
- `4K`
- `512`

</div>

</div>

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">tool_choice</span> <span class="field-type">[ToolChoiceConfig](#Resource:ToolChoiceConfig) or [ToolChoiceType](#Resource:ToolChoiceType)</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The tool choice configuration.

</div>

</div>

</div>

</div>

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">agent_config</span> <span class="field-type">object</span> <span class="field-necessity optional"> (optional)</span>

<div class="field-description">

**Agent Configuration**  
Configuration for the agent.  
*Alternative to \`generation_config\`. Only applicable when \`agent\` is set.*

#### Possible Types

Polymorphic discriminator: `type`

<span style="font-weight: 500;">DynamicAgentConfig</span>

<div class="subtype-content">

Configuration for dynamic agents.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

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

<span class="field-name">previous_interaction_id</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The ID of the previous interaction, if any.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">response_modalities</span> <span class="field-type">ResponseModality</span> <span class="field-necessity optional"> (optional)</span>

<div class="field-description">

The requested modalities of the response (TEXT, IMAGE, AUDIO).

Possible values:

- `text`
- `image`
- `audio`
- `video`
- `document`

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

</div>

</div>

</div>

</div>

</div>

<div id="CreateInteraction.response" class="section">

### Response

Returns an [Interaction](#Resource:Interaction) resource or a stream of server-sent events of [InteractionSseEvent](#Resource:InteractionSseEvent) resource.

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
  "id": "u-sAauOtHceE6dgPnsup0Qo",
  "status": "completed",
  "role": "model",
  "created": "2026-05-10T20:34:13Z",
  "updated": "2026-05-10T20:34:13Z",
  "steps": [
    {
      "content": [
        {
          "text": "[0.0:] Let the music lift you high\n[3.8:] Dancing under neon skies\n[7.5:] Feel the rhythm in your soul\n[11.3:] Lose yourself and lose control",
          "type": "text"
        }
      ],
      "type": "model_output"
    },
    {
      "content": [
        {
          "text": "Caption: This is a quintessential example of high-energy, euphoric Progressive House, a subgenre of EDM defined by its massive scale and uplifting melodic content...",
          "type": "text"
        }
      ],
      "type": "model_output"
    },
    {
      "content": [
        {
          "mime_type": "audio/mpeg",
          "data": "",
          "type": "audio"
        }
      ],
      "type": "model_output"
    }
  ],
  "object": "interaction",
  "model": "lyria-3-clip-preview"
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
  "id": "v1_ChdPU0F4YWFtNkFwS2kxZThQZ05lbXdROBIXT1NBeGFhbTZBcEtpMWU4UGdOZW13UTg",
  "status": "completed",
  "role": "model",
  "created": "2026-05-10T20:35:12Z",
  "updated": "2026-05-10T20:35:12Z",
  "steps": [
    {
      "type": "model_output",
      "content": [
        {
          "type": "text",
          "text": "[0.0:] High energy beats\n[3.8:] Matching the vibrant neon street"
        }
      ]
    },
    {
      "type": "model_output",
      "content": [
        {
          "type": "text",
          "text": "Caption: Inspired by the cyberpunk aesthetic of the image, this upbeat EDM track features heavy synthesizer bass and crisp percussion..."
        }
      ]
    },
    {
      "type": "model_output",
      "content": [
        {
          "type": "audio",
          "mime_type": "audio/mpeg",
          "data": ""
        }
      ]
    }
  ],
  "object": "interaction",
  "model": "lyria-3-clip-preview",
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
    "total_output_tokens": 45,
    "total_thought_tokens": 0,
    "total_tokens": 313,
    "total_tool_use_tokens": 0
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
  "id": "v1_ChdPU0F4YWFtNkFwS2kxZThQZ05lbXdROBIXT1NBeGFhbTZBcEtpMWU4UGdOZW13UTg",
  "agent": "deep-research-preview-04-2026",
  "status": "completed",
  "object": "interaction",
  "created": "2025-11-26T12:22:47Z",
  "updated": "2025-11-26T12:22:47Z",
  "steps": [
    {
      "type": "model_output",
      "content": [
        {
          "type": "text",
          "text": "Here is an investment memo about the luxury retail industry over the last 3 years..."
        }
      ]
    }
  ],
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

</div>

</div>

</div>

</div>

</div>

<div class="prototype" itemscope="" itemtype="http://developers.google.com/ReferenceObject">

## Listing created interactions

<div>

<span class="endpoint"> <span class="http-method get"> get </span> </span> <span class="endpoint-url" style="font-size: 16px; color: var(--devsite-code-color);"> https://aiplatform.googleapis.com/v1beta1/projects/{project}/locations/global/interactions </span>

</div>

<div id="description" class="section">

Retrieves a list of interactions.

</div>

<div class="section prototype">

- [Path / Query parameters](#listInteractions.PATH_PARAMETERS)
- [Response](#listInteractions.response)

<div class="column-container request-section" style="margin-top: 48px;">

<div class="reference">

<div id="listInteractions.PATH_PARAMETERS" class="section">

### Path / Query Parameters

<div class="field-entry">

<div class="signature">

<span class="field-name">page_size</span> <span class="field-type">integer</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The maximum number of interactions to return (per page).

*If unspecified, defaults to 10. The maximum allowed value is 500.*

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">page_token</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

A page token, received from a previous `ListInteractions` call.

</div>

</div>

</div>

<div id="listInteractions.response" class="section">

### Response

Returns a response containing a list of [InteractionMetadata](#Resource:InteractionMetadata) resources and a `next_page_token`.

</div>

</div>

<div class="second-column">

<div class="examples">

<div class="section">

### List Interactions

<div class="example-content">

<div>

</div>

``` devsite-click-to-copy
curl -X GET \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  "https://aiplatform.googleapis.com/v1beta1/projects/$PROJECT_ID/locations/global/interactions?page_size=10&page_token=page-token-67890"
```

</div>

</div>

<div class="section">

### Response

<div class="example-content">

``` devsite-click-to-copy
{
  "interaction_metadatas": [
    {
      "id": "interaction-12345"
    }
  ],
  "next_page_token": "page-token-67890"
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

<span class="endpoint"> <span class="http-method get"> get </span> </span> <span class="endpoint-url" style="font-size: 16px; color: var(--devsite-code-color);"> https://aiplatform.googleapis.com/v1beta1/projects/{project}/locations/global/interactions/{id} </span>

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

<span class="field-name">id</span> <span class="field-type">string</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

The unique identifier of the interaction to retrieve.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">stream</span> <span class="field-type">boolean</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

If set to true, the generated content will be streamed incrementally.

*Defaults to: `False`*

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">last_event_id</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Optional. If set, resumes the interaction stream from the next chunk after the event marked by the event id. Can only be used if \`stream\` is true.

</div>

</div>

</div>

<div id="getInteractionById.response" class="section">

### Response

Returns an [Interaction](#Resource:Interaction) resource or a stream of server-sent events of [InteractionSseEvent](#Resource:InteractionSseEvent) resource.

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
event: interaction.created
data: {
  "interaction": {
    "id": "v1_ChdPU0F4YWFtNkFwS2kxZThQZ05lbXdROBIXT1NBeGFhbTZBcEtpMWU4UGdOZW13UTg",
    "status": "in_progress",
    "object": "interaction"
  },
  "event_type": "interaction.created"
}

event: interaction.status_update
data: {
  "interaction_id": "v1_ChdPU0F4YWFtNkFwS2kxZThQZ05lbXdROBIXT1NBeGFhbTZBcEtpMWU4UGdOZW13UTg",
  "status": "in_progress",
  "event_type": "interaction.status_update"
}

event: step.start
data: {
  "index": 0,
  "step": {
    "type": "model_output"
  },
  "event_type": "step.start"
}

event: step.delta
data: {
  "index": 0,
  "delta": {
    "text": "Hello! How can I help you today? If you have a question or need research on a specific topic, just let me know!",
    "type": "text"
  },
  "event_type": "step.delta"
}

event: step.stop
data: {
  "index": 0,
  "event_type": "step.stop"
}

event: interaction.completed
data: {
  "interaction": {
    "id": "v1_ChdPU0F4YWFtNkFwS2kxZThQZ05lbXdROBIXT1NBeGFhbTZBcEtpMWU4UGdOZW13UTg",
    "status": "completed",
    "usage": {
      "total_tokens": 790,
      "total_input_tokens": 533,
      "input_tokens_by_modality": [
        {
          "modality": "text",
          "tokens": 533
        }
      ],
      "total_output_tokens": 27,
      "output_tokens_by_modality": [
        {
          "modality": "text",
          "tokens": 27
        }
      ],
      "total_thought_tokens": 230
    },
    "role": "model",
    "created": "2026-05-10T22:14:16Z",
    "updated": "2026-05-10T22:14:16Z",
    "event_id": "MTc3ODQ1MTI1NjI3MDc3NA==",
    "object": "interaction"
  },
  "event_type": "interaction.completed"
}

event: done
data: [DONE]
```

</div>

</div>

</div>

</div>

</div>

</div>

</div>

## Resources

<div itemscope="" itemtype="http://developers.google.com/ReferenceObject">

### InteractionMetadata

<div class="section prototype">

<div class="column-container">

<div class="reference">

The metadata for an interaction. Note: Only the id field is currently supported; other fields are not yet supported.

#### Fields

<div class="field-entry">

<div class="signature">

<span class="field-name">id</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The unique identifier of the interaction.

</div>

</div>

</div>

</div>

</div>

</div>

<div itemscope="" itemtype="http://developers.google.com/ReferenceObject">

### Interaction

<div class="section prototype">

<div class="column-container">

<div class="reference">

The Interaction resource.

#### Fields

<span class="expander-icon"></span> <span class="field-name">model</span> <span class="field-type">ModelOption</span> <span class="field-necessity optional"> (optional)</span>

<div class="field-description">

The name of the \`Model\` used for generating the interaction.

Possible values:

- `lyria-3-clip-preview`

  Our low-latency, music generation model optimized for high-fidelity audio clips and precise rhythmic control.

- `lyria-3-pro-preview`

  Our advanced, full-song generative model with deep compositional understanding, optimized for precise structural control and complex transitions across diverse musical styles.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The model that will complete your prompt.\n\nSee \[models\](https://ai.google.dev/gemini-api/docs/models) for additional details.

</div>

</div>

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">agent</span> <span class="field-type">AgentOption</span> <span class="field-necessity optional"> (optional)</span>

<div class="field-description">

The name of the \`Agent\` used for generating the interaction.

Possible values:

- `deep-research-preview-04-2026`

  Gemini Deep Research Agent

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The agent to interact with.

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">id</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Required. Output only. A unique identifier for the interaction completion.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">status</span> <span class="field-type">enum (string)</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Required. Output only. The status of the interaction.

Possible values:

- `in_progress`
- `requires_action`
- `completed`
- `failed`
- `cancelled`
- `incomplete`

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">created</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Required. Output only. The time at which the response was created in ISO 8601 format (YYYY-MM-DDThh:mm:ssZ).

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">updated</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Required. Output only. The time at which the response was last updated in ISO 8601 format (YYYY-MM-DDThh:mm:ssZ).

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">role</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Output only. The role of the interaction.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">system_instruction</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

System instruction for the interaction.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">tools</span> <span class="field-type">array ([Tool](#Resource:Tool))</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

A list of tool declarations the model may call during interaction.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">usage</span> <span class="field-type">Usage</span> <span class="field-necessity optional"> (optional)</span>

<div class="field-description">

Output only. Statistics on the interaction request's token usage.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

Statistics on the interaction request's token usage.

#### Fields

<div class="field-entry">

<div class="signature">

<span class="field-name">total_input_tokens</span> <span class="field-type">integer</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Number of tokens in the prompt (context).

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">input_tokens_by_modality</span> <span class="field-type">ModalityTokens</span> <span class="field-necessity optional"> (optional)</span>

<div class="field-description">

A breakdown of input token usage by modality.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The token count for a single response modality.

#### Fields

<span class="expander-icon"></span> <span class="field-name">modality</span> <span class="field-type">ResponseModality</span> <span class="field-necessity optional"> (optional)</span>

<div class="field-description">

The modality associated with the token count.

Possible values:

- `text`
- `image`
- `audio`
- `video`
- `document`

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">tokens</span> <span class="field-type">integer</span> <span class="field-necessity optional"> (optional)</span>

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

<span class="field-name">total_cached_tokens</span> <span class="field-type">integer</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Number of tokens in the cached part of the prompt (the cached content).

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">cached_tokens_by_modality</span> <span class="field-type">ModalityTokens</span> <span class="field-necessity optional"> (optional)</span>

<div class="field-description">

A breakdown of cached token usage by modality.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The token count for a single response modality.

#### Fields

<span class="expander-icon"></span> <span class="field-name">modality</span> <span class="field-type">ResponseModality</span> <span class="field-necessity optional"> (optional)</span>

<div class="field-description">

The modality associated with the token count.

Possible values:

- `text`
- `image`
- `audio`
- `video`
- `document`

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">tokens</span> <span class="field-type">integer</span> <span class="field-necessity optional"> (optional)</span>

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

<span class="field-name">total_output_tokens</span> <span class="field-type">integer</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Total number of tokens across all the generated responses.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">output_tokens_by_modality</span> <span class="field-type">ModalityTokens</span> <span class="field-necessity optional"> (optional)</span>

<div class="field-description">

A breakdown of output token usage by modality.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The token count for a single response modality.

#### Fields

<span class="expander-icon"></span> <span class="field-name">modality</span> <span class="field-type">ResponseModality</span> <span class="field-necessity optional"> (optional)</span>

<div class="field-description">

The modality associated with the token count.

Possible values:

- `text`
- `image`
- `audio`
- `video`
- `document`

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">tokens</span> <span class="field-type">integer</span> <span class="field-necessity optional"> (optional)</span>

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

<span class="field-name">total_tool_use_tokens</span> <span class="field-type">integer</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Number of tokens present in tool-use prompt(s).

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">tool_use_tokens_by_modality</span> <span class="field-type">ModalityTokens</span> <span class="field-necessity optional"> (optional)</span>

<div class="field-description">

A breakdown of tool-use token usage by modality.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The token count for a single response modality.

#### Fields

<span class="expander-icon"></span> <span class="field-name">modality</span> <span class="field-type">ResponseModality</span> <span class="field-necessity optional"> (optional)</span>

<div class="field-description">

The modality associated with the token count.

Possible values:

- `text`
- `image`
- `audio`
- `video`
- `document`

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">tokens</span> <span class="field-type">integer</span> <span class="field-necessity optional"> (optional)</span>

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

<span class="field-name">total_thought_tokens</span> <span class="field-type">integer</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Number of tokens of thoughts for thinking models.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">total_tokens</span> <span class="field-type">integer</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Total token count for the interaction request (prompt + responses + other internal tokens).

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">grounding_tool_count</span> <span class="field-type">GroundingToolCount</span> <span class="field-necessity optional"> (optional)</span>

<div class="field-description">

Grounding tool count.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The number of grounding tool counts.

#### Fields

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">enum (string)</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The grounding tool type associated with the count.

Possible values:

- `google_search`
- `google_maps`
- `retrieval`

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">count</span> <span class="field-type">integer</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The number of grounding tool counts.

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

<span class="expander-icon"></span> <span class="field-name">response_modalities</span> <span class="field-type">ResponseModality</span> <span class="field-necessity optional"> (optional)</span>

<div class="field-description">

The requested modalities of the response (TEXT, IMAGE, AUDIO).

Possible values:

- `text`
- `image`
- `audio`
- `video`
- `document`

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">response_mime_type</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The mime type of the response. This is required if response_format is set.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">previous_interaction_id</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The ID of the previous interaction, if any.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">steps</span> <span class="field-type">Step</span> <span class="field-necessity optional"> (optional)</span>

<div class="field-description">

Output only. The steps that make up the interaction.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

A step in the interaction.

#### Possible Types

Polymorphic discriminator: `type`

<span style="font-weight: 500;">UserInputStep</span>

<div class="subtype-content">

Input provided by the user.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"user_input"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">content</span> <span class="field-type">array ([Content](#Resource:Content))</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

No description provided.

</div>

</div>

</div>

<span style="font-weight: 500;">ModelOutputStep</span>

<div class="subtype-content">

Output generated by the model.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"model_output"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">content</span> <span class="field-type">array ([Content](#Resource:Content))</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

No description provided.

</div>

</div>

</div>

<span style="font-weight: 500;">ThoughtStep</span>

<div class="subtype-content">

A thought step.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"thought"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">signature</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

A signature hash for backend validation.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">summary</span> <span class="field-type">ThoughtSummaryContent</span> <span class="field-necessity optional"> (optional)</span>

<div class="field-description">

A summary of the thought.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

#### Possible Types

Polymorphic discriminator: `type`

<span style="font-weight: 500;">TextContent</span>

<div class="subtype-content">

A text content block.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"text"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">text</span> <span class="field-type">string</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

Required. The text content.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">annotations</span> <span class="field-type">Annotation</span> <span class="field-necessity optional"> (optional)</span>

<div class="field-description">

Citation information for model-generated content.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

Citation information for model-generated content.

#### Possible Types

Polymorphic discriminator: `type`

<span style="font-weight: 500;">UrlCitation</span>

<div class="subtype-content">

A URL citation annotation.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"url_citation"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">url</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The URL.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">title</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The title of the URL.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">start_index</span> <span class="field-type">integer</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Start of segment of the response that is attributed to this source. Index indicates the start of the segment, measured in bytes.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">end_index</span> <span class="field-type">integer</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

End of the attributed segment, exclusive.

</div>

</div>

</div>

<span style="font-weight: 500;">FileCitation</span>

<div class="subtype-content">

A file citation annotation.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"file_citation"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">document_uri</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The URI of the file.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">file_name</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The name of the file.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">source</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Source attributed for a portion of the text.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">custom_metadata</span> <span class="field-type">object</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

User provided metadata about the retrieved context.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">page_number</span> <span class="field-type">integer</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Page number of the cited document, if applicable.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">media_id</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Media ID in-case of image citations, if applicable.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">start_index</span> <span class="field-type">integer</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Start of segment of the response that is attributed to this source. Index indicates the start of the segment, measured in bytes.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">end_index</span> <span class="field-type">integer</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

End of the attributed segment, exclusive.

</div>

</div>

</div>

<span style="font-weight: 500;">PlaceCitation</span>

<div class="subtype-content">

A place citation annotation.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"place_citation"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">place_id</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The ID of the place, in \`places/{place_id}\` format.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">name</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Title of the place.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">url</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

URI reference of the place.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">review_snippets</span> <span class="field-type">ReviewSnippet</span> <span class="field-necessity optional"> (optional)</span>

<div class="field-description">

Snippets of reviews that are used to generate answers about the features of a given place in Google Maps.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

Encapsulates a snippet of a user review that answers a question about the features of a specific place in Google Maps.

#### Fields

<div class="field-entry">

<div class="signature">

<span class="field-name">title</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Title of the review.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">url</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

A link that corresponds to the user review on Google Maps.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">review_id</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The ID of the review snippet.

</div>

</div>

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">start_index</span> <span class="field-type">integer</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Start of segment of the response that is attributed to this source. Index indicates the start of the segment, measured in bytes.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">end_index</span> <span class="field-type">integer</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

End of the attributed segment, exclusive.

</div>

</div>

</div>

</div>

</div>

</div>

</div>

</div>

<span style="font-weight: 500;">ImageContent</span>

<div class="subtype-content">

An image content block.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"image"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">data</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The image content.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">uri</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The URI of the image.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">mime_type</span> <span class="field-type">enum (string)</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The mime type of the image.

Possible values:

- `image/png`
- `image/jpeg`
- `image/webp`
- `image/heic`
- `image/heif`
- `image/gif`
- `image/bmp`
- `image/tiff`

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">resolution</span> <span class="field-type">MediaResolution</span> <span class="field-necessity optional"> (optional)</span>

<div class="field-description">

The resolution of the media.

Possible values:

- `low`
- `medium`
- `high`
- `ultra_high`

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

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

<span style="font-weight: 500;">FunctionCallStep</span>

<div class="subtype-content">

A function tool call step.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"function_call"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">name</span> <span class="field-type">string</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

Required. The name of the tool to call.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">arguments</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

Required. The arguments to pass to the function.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">id</span> <span class="field-type">string</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

Required. A unique ID for this specific tool call.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">signature</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

A signature hash for backend validation.

</div>

</div>

</div>

<span style="font-weight: 500;">CodeExecutionCallStep</span>

<div class="subtype-content">

Code execution call step.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"code_execution_call"`.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">arguments</span> <span class="field-type">CodeExecutionCallStepArguments</span> <span class="field-necessity required"> (required)</span>

<div class="field-description">

Required. The arguments to pass to the code execution.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The arguments to pass to the code execution.

#### Fields

<div class="field-entry">

<div class="signature">

<span class="field-name">language</span> <span class="field-type">enum (string)</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Programming language of the \`code\`.

Possible values:

- `python`

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">code</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The code to be executed.

</div>

</div>

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">id</span> <span class="field-type">string</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

Required. A unique ID for this specific tool call.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">signature</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

A signature hash for backend validation.

</div>

</div>

</div>

<span style="font-weight: 500;">UrlContextCallStep</span>

<div class="subtype-content">

URL context call step.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"url_context_call"`.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">arguments</span> <span class="field-type">UrlContextCallStepArguments</span> <span class="field-necessity required"> (required)</span>

<div class="field-description">

Required. The arguments to pass to the URL context.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The arguments to pass to the URL context.

#### Fields

<div class="field-entry">

<div class="signature">

<span class="field-name">urls</span> <span class="field-type">array (string)</span> <span class="field-necessity optional"> (optional)</span>

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

<span class="field-name">id</span> <span class="field-type">string</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

Required. A unique ID for this specific tool call.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">signature</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

A signature hash for backend validation.

</div>

</div>

</div>

<span style="font-weight: 500;">McpServerToolCallStep</span>

<div class="subtype-content">

MCPServer tool call step.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"mcp_server_tool_call"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">name</span> <span class="field-type">string</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

Required. The name of the tool which was called.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">server_name</span> <span class="field-type">string</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

Required. The name of the used MCP server.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">arguments</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

Required. The JSON object of arguments for the function.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">id</span> <span class="field-type">string</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

Required. A unique ID for this specific tool call.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">signature</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

A signature hash for backend validation.

</div>

</div>

</div>

<span style="font-weight: 500;">GoogleSearchCallStep</span>

<div class="subtype-content">

Google Search call step.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"google_search_call"`.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">arguments</span> <span class="field-type">GoogleSearchCallStepArguments</span> <span class="field-necessity required"> (required)</span>

<div class="field-description">

Required. The arguments to pass to Google Search.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The arguments to pass to Google Search.

#### Fields

<div class="field-entry">

<div class="signature">

<span class="field-name">queries</span> <span class="field-type">array (string)</span> <span class="field-necessity optional"> (optional)</span>

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

<span class="field-name">search_type</span> <span class="field-type">enum (string)</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The type of search grounding enabled.

Possible values:

- `web_search`
- `image_search`
- `enterprise_web_search`

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">id</span> <span class="field-type">string</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

Required. A unique ID for this specific tool call.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">signature</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

A signature hash for backend validation.

</div>

</div>

</div>

<span style="font-weight: 500;">FileSearchCallStep</span>

<div class="subtype-content">

File Search call step.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"file_search_call"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">id</span> <span class="field-type">string</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

Required. A unique ID for this specific tool call.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">signature</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

A signature hash for backend validation.

</div>

</div>

</div>

<span style="font-weight: 500;">GoogleMapsCallStep</span>

<div class="subtype-content">

Google Maps call step.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"google_maps_call"`.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">arguments</span> <span class="field-type">GoogleMapsCallStepArguments</span> <span class="field-necessity optional"> (optional)</span>

<div class="field-description">

The arguments to pass to the Google Maps tool.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The arguments to pass to the Google Maps tool.

#### Fields

<div class="field-entry">

<div class="signature">

<span class="field-name">queries</span> <span class="field-type">array (string)</span> <span class="field-necessity optional"> (optional)</span>

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

<span class="field-name">id</span> <span class="field-type">string</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

Required. A unique ID for this specific tool call.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">signature</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

A signature hash for backend validation.

</div>

</div>

</div>

<span style="font-weight: 500;">FunctionResultStep</span>

<div class="subtype-content">

Result of a function tool call.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"function_result"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">name</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The name of the tool that was called.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">is_error</span> <span class="field-type">boolean</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Whether the tool call resulted in an error.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">call_id</span> <span class="field-type">string</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

Required. ID to match the ID from the function call block.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">signature</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

A signature hash for backend validation.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">result</span> <span class="field-type">array ([FunctionResultSubcontent](#Resource:FunctionResultSubcontent)) or string</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

The result of the tool call.

</div>

</div>

</div>

<span style="font-weight: 500;">CodeExecutionResultStep</span>

<div class="subtype-content">

Code execution result step.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"code_execution_result"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">result</span> <span class="field-type">string</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

Required. The output of the code execution.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">is_error</span> <span class="field-type">boolean</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Whether the code execution resulted in an error.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">call_id</span> <span class="field-type">string</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

Required. ID to match the ID from the function call block.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">signature</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

A signature hash for backend validation.

</div>

</div>

</div>

<span style="font-weight: 500;">UrlContextResultStep</span>

<div class="subtype-content">

URL context result step.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"url_context_result"`.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">result</span> <span class="field-type">UrlContextResultItem</span> <span class="field-necessity required"> (required)</span>

<div class="field-description">

Required. The results of the URL context.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The result of the URL context.

#### Fields

<div class="field-entry">

<div class="signature">

<span class="field-name">url</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The URL that was fetched.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">status</span> <span class="field-type">enum (string)</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The status of the URL retrieval.

Possible values:

- `success`
- `error`
- `paywall`
- `unsafe`

</div>

</div>

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">is_error</span> <span class="field-type">boolean</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Whether the URL context resulted in an error.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">call_id</span> <span class="field-type">string</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

Required. ID to match the ID from the function call block.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">signature</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

A signature hash for backend validation.

</div>

</div>

</div>

<span style="font-weight: 500;">GoogleSearchResultStep</span>

<div class="subtype-content">

Google Search result step.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"google_search_result"`.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">result</span> <span class="field-type">GoogleSearchResultItem</span> <span class="field-necessity required"> (required)</span>

<div class="field-description">

Required. The results of the Google Search.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The result of the Google Search.

#### Fields

<div class="field-entry">

<div class="signature">

<span class="field-name">search_suggestions</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

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

<span class="field-name">is_error</span> <span class="field-type">boolean</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Whether the Google Search resulted in an error.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">call_id</span> <span class="field-type">string</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

Required. ID to match the ID from the function call block.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">signature</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

A signature hash for backend validation.

</div>

</div>

</div>

<span style="font-weight: 500;">McpServerToolResultStep</span>

<div class="subtype-content">

MCPServer tool result step.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"mcp_server_tool_result"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">name</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Name of the tool which is called for this specific tool call.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">server_name</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The name of the used MCP server.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">call_id</span> <span class="field-type">string</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

Required. ID to match the ID from the function call block.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">signature</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

A signature hash for backend validation.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">result</span> <span class="field-type">array ([FunctionResultSubcontent](#Resource:FunctionResultSubcontent)) or string</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

The output from the MCP server call. Can be simple text or rich content.

</div>

</div>

</div>

<span style="font-weight: 500;">FileSearchResultStep</span>

<div class="subtype-content">

File Search result step.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"file_search_result"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">call_id</span> <span class="field-type">string</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

Required. ID to match the ID from the function call block.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">signature</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

A signature hash for backend validation.

</div>

</div>

</div>

<span style="font-weight: 500;">GoogleMapsResultStep</span>

<div class="subtype-content">

Google Maps result step.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"google_maps_result"`.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">result</span> <span class="field-type">GoogleMapsResultItem</span> <span class="field-necessity required"> (required)</span>

<div class="field-description">

No description provided.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The result of the Google Maps.

#### Fields

<span class="expander-icon"></span> <span class="field-name">places</span> <span class="field-type">GoogleMapsResultPlaces</span> <span class="field-necessity optional"> (optional)</span>

<div class="field-description">

No description provided.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

#### Fields

<div class="field-entry">

<div class="signature">

<span class="field-name">place_id</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

No description provided.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">name</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

No description provided.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">url</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

No description provided.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">review_snippets</span> <span class="field-type">ReviewSnippet</span> <span class="field-necessity optional"> (optional)</span>

<div class="field-description">

No description provided.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

Encapsulates a snippet of a user review that answers a question about the features of a specific place in Google Maps.

#### Fields

<div class="field-entry">

<div class="signature">

<span class="field-name">title</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Title of the review.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">url</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

A link that corresponds to the user review on Google Maps.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">review_id</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The ID of the review snippet.

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

<span class="field-name">widget_context_token</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

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

<span class="field-name">call_id</span> <span class="field-type">string</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

Required. ID to match the ID from the function call block.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">signature</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

A signature hash for backend validation.

</div>

</div>

</div>

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">input</span> <span class="field-type">[Content](#Resource:Content) or array ([Content](#Resource:Content)) or array ([Step](#Resource:Step)) or string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The input for the interaction.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">response_format</span> <span class="field-type">[ResponseFormat](#Resource:ResponseFormat) or [ResponseFormatList](#Resource:ResponseFormatList)</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Enforces that the generated response is a JSON object that complies with the JSON schema specified in this field.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">agent_config</span> <span class="field-type">object</span> <span class="field-necessity optional"> (optional)</span>

<div class="field-description">

Configuration parameters for the agent interaction.

#### Possible Types

Polymorphic discriminator: `type`

<span style="font-weight: 500;">DynamicAgentConfig</span>

<div class="subtype-content">

Configuration for dynamic agents.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"dynamic"`.

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
  "agent": "deep-research-preview-04-2026",
  "object": "interaction",
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
  "status": "completed",
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

Polymorphic discriminator: `type`

<span style="font-weight: 500;">TextContent</span>

<div class="subtype-content">

A text content block.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"text"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">text</span> <span class="field-type">string</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

Required. The text content.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">annotations</span> <span class="field-type">Annotation</span> <span class="field-necessity optional"> (optional)</span>

<div class="field-description">

Citation information for model-generated content.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

Citation information for model-generated content.

#### Possible Types

Polymorphic discriminator: `type`

<span style="font-weight: 500;">UrlCitation</span>

<div class="subtype-content">

A URL citation annotation.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"url_citation"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">url</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The URL.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">title</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The title of the URL.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">start_index</span> <span class="field-type">integer</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Start of segment of the response that is attributed to this source. Index indicates the start of the segment, measured in bytes.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">end_index</span> <span class="field-type">integer</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

End of the attributed segment, exclusive.

</div>

</div>

</div>

<span style="font-weight: 500;">FileCitation</span>

<div class="subtype-content">

A file citation annotation.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"file_citation"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">document_uri</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The URI of the file.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">file_name</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The name of the file.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">source</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Source attributed for a portion of the text.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">custom_metadata</span> <span class="field-type">object</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

User provided metadata about the retrieved context.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">page_number</span> <span class="field-type">integer</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Page number of the cited document, if applicable.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">media_id</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Media ID in-case of image citations, if applicable.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">start_index</span> <span class="field-type">integer</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Start of segment of the response that is attributed to this source. Index indicates the start of the segment, measured in bytes.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">end_index</span> <span class="field-type">integer</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

End of the attributed segment, exclusive.

</div>

</div>

</div>

<span style="font-weight: 500;">PlaceCitation</span>

<div class="subtype-content">

A place citation annotation.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"place_citation"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">place_id</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The ID of the place, in \`places/{place_id}\` format.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">name</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Title of the place.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">url</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

URI reference of the place.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">review_snippets</span> <span class="field-type">ReviewSnippet</span> <span class="field-necessity optional"> (optional)</span>

<div class="field-description">

Snippets of reviews that are used to generate answers about the features of a given place in Google Maps.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

Encapsulates a snippet of a user review that answers a question about the features of a specific place in Google Maps.

#### Fields

<div class="field-entry">

<div class="signature">

<span class="field-name">title</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Title of the review.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">url</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

A link that corresponds to the user review on Google Maps.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">review_id</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The ID of the review snippet.

</div>

</div>

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">start_index</span> <span class="field-type">integer</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Start of segment of the response that is attributed to this source. Index indicates the start of the segment, measured in bytes.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">end_index</span> <span class="field-type">integer</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

End of the attributed segment, exclusive.

</div>

</div>

</div>

</div>

</div>

</div>

</div>

</div>

<span style="font-weight: 500;">ImageContent</span>

<div class="subtype-content">

An image content block.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"image"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">data</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The image content.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">uri</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The URI of the image.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">mime_type</span> <span class="field-type">enum (string)</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The mime type of the image.

Possible values:

- `image/png`
- `image/jpeg`
- `image/webp`
- `image/heic`
- `image/heif`
- `image/gif`
- `image/bmp`
- `image/tiff`

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">resolution</span> <span class="field-type">MediaResolution</span> <span class="field-necessity optional"> (optional)</span>

<div class="field-description">

The resolution of the media.

Possible values:

- `low`
- `medium`
- `high`
- `ultra_high`

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

</div>

</div>

</div>

</div>

</div>

<span style="font-weight: 500;">AudioContent</span>

<div class="subtype-content">

An audio content block.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"audio"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">data</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The audio content.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">uri</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The URI of the audio.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">mime_type</span> <span class="field-type">enum (string)</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The mime type of the audio.

Possible values:

- `audio/wav`
- `audio/mp3`
- `audio/aiff`
- `audio/aac`
- `audio/ogg`
- `audio/flac`
- `audio/mpeg`
- `audio/m4a`
- `audio/l16`
- `audio/opus`
- `audio/alaw`
- `audio/mulaw`

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">channels</span> <span class="field-type">integer</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The number of audio channels.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">sample_rate</span> <span class="field-type">integer</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The sample rate of the audio.

</div>

</div>

</div>

<span style="font-weight: 500;">DocumentContent</span>

<div class="subtype-content">

A document content block.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"document"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">data</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The document content.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">uri</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The URI of the document.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">mime_type</span> <span class="field-type">enum (string)</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The mime type of the document.

Possible values:

- `application/pdf`

</div>

</div>

</div>

<span style="font-weight: 500;">VideoContent</span>

<div class="subtype-content">

A video content block.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"video"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">data</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The video content.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">uri</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The URI of the video.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">mime_type</span> <span class="field-type">enum (string)</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The mime type of the video.

Possible values:

- `video/mp4`
- `video/mpeg`
- `video/mpg`
- `video/mov`
- `video/avi`
- `video/x-flv`
- `video/webm`
- `video/wmv`
- `video/3gpp`

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">resolution</span> <span class="field-type">MediaResolution</span> <span class="field-necessity optional"> (optional)</span>

<div class="field-description">

The resolution of the media.

Possible values:

- `low`
- `medium`
- `high`
- `ultra_high`

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

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

Polymorphic discriminator: `type`

<span style="font-weight: 500;">Function</span>

<div class="subtype-content">

A tool that can be used by the model.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"function"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">name</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The name of the function.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">description</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

A description of the function.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">parameters</span> <span class="field-type">object</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The JSON Schema for the function's parameters.

</div>

</div>

</div>

<span style="font-weight: 500;">CodeExecution</span>

<div class="subtype-content">

A tool that can be used by the model to execute code.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"code_execution"`.

</div>

</div>

</div>

<span style="font-weight: 500;">UrlContext</span>

<div class="subtype-content">

A tool that can be used by the model to fetch URL context.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"url_context"`.

</div>

</div>

</div>

<span style="font-weight: 500;">ComputerUse</span>

<div class="subtype-content">

A tool that can be used by the model to interact with the computer.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"computer_use"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">environment</span> <span class="field-type">enum (string)</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The environment being operated.

Possible values:

- `browser`

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">excluded_predefined_functions</span> <span class="field-type">array (string)</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The list of predefined functions that are excluded from the model call.

</div>

</div>

</div>

<span style="font-weight: 500;">McpServer</span>

<div class="subtype-content">

A MCPServer is a server that can be called by the model to perform actions.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"mcp_server"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">name</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The name of the MCPServer.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">url</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The full URL for the MCPServer endpoint. Example: "https://api.example.com/mcp"

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">headers</span> <span class="field-type">object</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Optional: Fields for authentication headers, timeouts, etc., if needed.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">allowed_tools</span> <span class="field-type">AllowedTools</span> <span class="field-necessity optional"> (optional)</span>

<div class="field-description">

The allowed tools.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The configuration for allowed tools.

#### Fields

<span class="expander-icon"></span> <span class="field-name">mode</span> <span class="field-type">ToolChoiceType</span> <span class="field-necessity optional"> (optional)</span>

<div class="field-description">

The mode of the tool choice.

Possible values:

- `auto`
- `any`
- `none`
- `validated`

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">tools</span> <span class="field-type">array (string)</span> <span class="field-necessity optional"> (optional)</span>

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

<span style="font-weight: 500;">GoogleSearch</span>

<div class="subtype-content">

A tool that can be used by the model to search Google.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"google_search"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">search_types</span> <span class="field-type">array (enum (string))</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The types of search grounding to enable.

Possible values:

- `web_search`
- `image_search`
- `enterprise_web_search`

</div>

</div>

</div>

<span style="font-weight: 500;">GoogleMaps</span>

<div class="subtype-content">

A tool that can be used by the model to call Google Maps.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"google_maps"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">enable_widget</span> <span class="field-type">boolean</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Whether to return a widget context token in the tool call result of the response.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">latitude</span> <span class="field-type">number</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The latitude of the user's location.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">longitude</span> <span class="field-type">number</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The longitude of the user's location.

</div>

</div>

</div>

<span style="font-weight: 500;">Retrieval</span>

<div class="subtype-content">

A tool that can be used by the model to retrieve files.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"retrieval"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">retrieval_types</span> <span class="field-type">array (enum (string))</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The types of file retrieval to enable.

Possible values:

- `vertex_ai_search`

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">vertex_ai_search_config</span> <span class="field-type">VertexAISearchConfig</span> <span class="field-necessity optional"> (optional)</span>

<div class="field-description">

Used to specify configuration for VertexAISearch.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

Used to specify configuration for VertexAISearch.

#### Fields

<div class="field-entry">

<div class="signature">

<span class="field-name">engine</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Optional. Used to specify Agent Platform Search engine.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">datastores</span> <span class="field-type">array (string)</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Optional. Used to specify Agent Platform Search datastores.

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

### Function

<div class="example-content">

</div>

</div>

<div class="section">

### CodeExecution

<div class="example-content">

</div>

</div>

<div class="section">

### UrlContext

<div class="example-content">

</div>

</div>

<div class="section">

### ComputerUse

<div class="example-content">

</div>

</div>

<div class="section">

### McpServer

<div class="example-content">

</div>

</div>

<div class="section">

### GoogleSearch

<div class="example-content">

</div>

</div>

<div class="section">

### GoogleMaps

<div class="example-content">

</div>

</div>

<div class="section">

### Retrieval

No examples available for this type.

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

<span style="font-weight: 500;">InteractionCreatedEvent</span>

<div class="subtype-content">

<div class="field-entry">

<div class="signature">

<span class="field-name">event_type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"interaction.created"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">interaction</span> <span class="field-type">[Interaction](#Resource:Interaction)</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">event_id</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The event_id token to be used to resume the interaction stream, from this event.

</div>

</div>

</div>

<span style="font-weight: 500;">InteractionCompletedEvent</span>

<div class="subtype-content">

<div class="field-entry">

<div class="signature">

<span class="field-name">event_type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"interaction.completed"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">interaction</span> <span class="field-type">[Interaction](#Resource:Interaction)</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

Required. The completed interaction with empty outputs to reduce the payload size. Use the preceding ContentDelta events for the actual output.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">event_id</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The event_id token to be used to resume the interaction stream, from this event.

</div>

</div>

</div>

<span style="font-weight: 500;">InteractionStatusUpdate</span>

<div class="subtype-content">

<div class="field-entry">

<div class="signature">

<span class="field-name">event_type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"interaction.status_update"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">interaction_id</span> <span class="field-type">string</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">status</span> <span class="field-type">enum (string)</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Possible values:

- `in_progress`
- `requires_action`
- `completed`
- `failed`
- `cancelled`
- `incomplete`

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">event_id</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The event_id token to be used to resume the interaction stream, from this event.

</div>

</div>

</div>

<span style="font-weight: 500;">ErrorEvent</span>

<div class="subtype-content">

<div class="field-entry">

<div class="signature">

<span class="field-name">event_type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"error"`.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">error</span> <span class="field-type">Error</span> <span class="field-necessity optional"> (optional)</span>

<div class="field-description">

No description provided.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

Error message from an interaction.

#### Fields

<div class="field-entry">

<div class="signature">

<span class="field-name">code</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

A URI that identifies the error type.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">message</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

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

<span class="field-name">event_id</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The event_id token to be used to resume the interaction stream, from this event.

</div>

</div>

</div>

<span style="font-weight: 500;">StepStart</span>

<div class="subtype-content">

<div class="field-entry">

<div class="signature">

<span class="field-name">event_type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"step.start"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">index</span> <span class="field-type">integer</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">step</span> <span class="field-type">Step</span> <span class="field-necessity required"> (required)</span>

<div class="field-description">

No description provided.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

A step in the interaction.

#### Possible Types

Polymorphic discriminator: `type`

<span style="font-weight: 500;">UserInputStep</span>

<div class="subtype-content">

Input provided by the user.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"user_input"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">content</span> <span class="field-type">array ([Content](#Resource:Content))</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

No description provided.

</div>

</div>

</div>

<span style="font-weight: 500;">ModelOutputStep</span>

<div class="subtype-content">

Output generated by the model.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"model_output"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">content</span> <span class="field-type">array ([Content](#Resource:Content))</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

No description provided.

</div>

</div>

</div>

<span style="font-weight: 500;">ThoughtStep</span>

<div class="subtype-content">

A thought step.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"thought"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">signature</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

A signature hash for backend validation.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">summary</span> <span class="field-type">ThoughtSummaryContent</span> <span class="field-necessity optional"> (optional)</span>

<div class="field-description">

A summary of the thought.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

#### Possible Types

Polymorphic discriminator: `type`

<span style="font-weight: 500;">TextContent</span>

<div class="subtype-content">

A text content block.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"text"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">text</span> <span class="field-type">string</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

Required. The text content.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">annotations</span> <span class="field-type">Annotation</span> <span class="field-necessity optional"> (optional)</span>

<div class="field-description">

Citation information for model-generated content.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

Citation information for model-generated content.

#### Possible Types

Polymorphic discriminator: `type`

<span style="font-weight: 500;">UrlCitation</span>

<div class="subtype-content">

A URL citation annotation.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"url_citation"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">url</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The URL.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">title</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The title of the URL.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">start_index</span> <span class="field-type">integer</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Start of segment of the response that is attributed to this source. Index indicates the start of the segment, measured in bytes.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">end_index</span> <span class="field-type">integer</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

End of the attributed segment, exclusive.

</div>

</div>

</div>

<span style="font-weight: 500;">FileCitation</span>

<div class="subtype-content">

A file citation annotation.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"file_citation"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">document_uri</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The URI of the file.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">file_name</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The name of the file.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">source</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Source attributed for a portion of the text.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">custom_metadata</span> <span class="field-type">object</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

User provided metadata about the retrieved context.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">page_number</span> <span class="field-type">integer</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Page number of the cited document, if applicable.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">media_id</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Media ID in-case of image citations, if applicable.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">start_index</span> <span class="field-type">integer</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Start of segment of the response that is attributed to this source. Index indicates the start of the segment, measured in bytes.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">end_index</span> <span class="field-type">integer</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

End of the attributed segment, exclusive.

</div>

</div>

</div>

<span style="font-weight: 500;">PlaceCitation</span>

<div class="subtype-content">

A place citation annotation.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"place_citation"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">place_id</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The ID of the place, in \`places/{place_id}\` format.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">name</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Title of the place.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">url</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

URI reference of the place.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">review_snippets</span> <span class="field-type">ReviewSnippet</span> <span class="field-necessity optional"> (optional)</span>

<div class="field-description">

Snippets of reviews that are used to generate answers about the features of a given place in Google Maps.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

Encapsulates a snippet of a user review that answers a question about the features of a specific place in Google Maps.

#### Fields

<div class="field-entry">

<div class="signature">

<span class="field-name">title</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Title of the review.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">url</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

A link that corresponds to the user review on Google Maps.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">review_id</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The ID of the review snippet.

</div>

</div>

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">start_index</span> <span class="field-type">integer</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Start of segment of the response that is attributed to this source. Index indicates the start of the segment, measured in bytes.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">end_index</span> <span class="field-type">integer</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

End of the attributed segment, exclusive.

</div>

</div>

</div>

</div>

</div>

</div>

</div>

</div>

<span style="font-weight: 500;">ImageContent</span>

<div class="subtype-content">

An image content block.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"image"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">data</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The image content.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">uri</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The URI of the image.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">mime_type</span> <span class="field-type">enum (string)</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The mime type of the image.

Possible values:

- `image/png`
- `image/jpeg`
- `image/webp`
- `image/heic`
- `image/heif`
- `image/gif`
- `image/bmp`
- `image/tiff`

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">resolution</span> <span class="field-type">MediaResolution</span> <span class="field-necessity optional"> (optional)</span>

<div class="field-description">

The resolution of the media.

Possible values:

- `low`
- `medium`
- `high`
- `ultra_high`

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

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

<span style="font-weight: 500;">FunctionCallStep</span>

<div class="subtype-content">

A function tool call step.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"function_call"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">name</span> <span class="field-type">string</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

Required. The name of the tool to call.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">arguments</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

Required. The arguments to pass to the function.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">id</span> <span class="field-type">string</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

Required. A unique ID for this specific tool call.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">signature</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

A signature hash for backend validation.

</div>

</div>

</div>

<span style="font-weight: 500;">CodeExecutionCallStep</span>

<div class="subtype-content">

Code execution call step.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"code_execution_call"`.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">arguments</span> <span class="field-type">CodeExecutionCallStepArguments</span> <span class="field-necessity required"> (required)</span>

<div class="field-description">

Required. The arguments to pass to the code execution.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The arguments to pass to the code execution.

#### Fields

<div class="field-entry">

<div class="signature">

<span class="field-name">language</span> <span class="field-type">enum (string)</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Programming language of the \`code\`.

Possible values:

- `python`

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">code</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The code to be executed.

</div>

</div>

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">id</span> <span class="field-type">string</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

Required. A unique ID for this specific tool call.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">signature</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

A signature hash for backend validation.

</div>

</div>

</div>

<span style="font-weight: 500;">UrlContextCallStep</span>

<div class="subtype-content">

URL context call step.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"url_context_call"`.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">arguments</span> <span class="field-type">UrlContextCallStepArguments</span> <span class="field-necessity required"> (required)</span>

<div class="field-description">

Required. The arguments to pass to the URL context.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The arguments to pass to the URL context.

#### Fields

<div class="field-entry">

<div class="signature">

<span class="field-name">urls</span> <span class="field-type">array (string)</span> <span class="field-necessity optional"> (optional)</span>

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

<span class="field-name">id</span> <span class="field-type">string</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

Required. A unique ID for this specific tool call.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">signature</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

A signature hash for backend validation.

</div>

</div>

</div>

<span style="font-weight: 500;">McpServerToolCallStep</span>

<div class="subtype-content">

MCPServer tool call step.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"mcp_server_tool_call"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">name</span> <span class="field-type">string</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

Required. The name of the tool which was called.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">server_name</span> <span class="field-type">string</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

Required. The name of the used MCP server.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">arguments</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

Required. The JSON object of arguments for the function.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">id</span> <span class="field-type">string</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

Required. A unique ID for this specific tool call.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">signature</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

A signature hash for backend validation.

</div>

</div>

</div>

<span style="font-weight: 500;">GoogleSearchCallStep</span>

<div class="subtype-content">

Google Search call step.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"google_search_call"`.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">arguments</span> <span class="field-type">GoogleSearchCallStepArguments</span> <span class="field-necessity required"> (required)</span>

<div class="field-description">

Required. The arguments to pass to Google Search.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The arguments to pass to Google Search.

#### Fields

<div class="field-entry">

<div class="signature">

<span class="field-name">queries</span> <span class="field-type">array (string)</span> <span class="field-necessity optional"> (optional)</span>

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

<span class="field-name">search_type</span> <span class="field-type">enum (string)</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The type of search grounding enabled.

Possible values:

- `web_search`
- `image_search`
- `enterprise_web_search`

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">id</span> <span class="field-type">string</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

Required. A unique ID for this specific tool call.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">signature</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

A signature hash for backend validation.

</div>

</div>

</div>

<span style="font-weight: 500;">FileSearchCallStep</span>

<div class="subtype-content">

File Search call step.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"file_search_call"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">id</span> <span class="field-type">string</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

Required. A unique ID for this specific tool call.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">signature</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

A signature hash for backend validation.

</div>

</div>

</div>

<span style="font-weight: 500;">GoogleMapsCallStep</span>

<div class="subtype-content">

Google Maps call step.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"google_maps_call"`.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">arguments</span> <span class="field-type">GoogleMapsCallStepArguments</span> <span class="field-necessity optional"> (optional)</span>

<div class="field-description">

The arguments to pass to the Google Maps tool.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The arguments to pass to the Google Maps tool.

#### Fields

<div class="field-entry">

<div class="signature">

<span class="field-name">queries</span> <span class="field-type">array (string)</span> <span class="field-necessity optional"> (optional)</span>

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

<span class="field-name">id</span> <span class="field-type">string</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

Required. A unique ID for this specific tool call.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">signature</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

A signature hash for backend validation.

</div>

</div>

</div>

<span style="font-weight: 500;">FunctionResultStep</span>

<div class="subtype-content">

Result of a function tool call.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"function_result"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">name</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The name of the tool that was called.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">is_error</span> <span class="field-type">boolean</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Whether the tool call resulted in an error.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">call_id</span> <span class="field-type">string</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

Required. ID to match the ID from the function call block.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">signature</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

A signature hash for backend validation.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">result</span> <span class="field-type">array ([FunctionResultSubcontent](#Resource:FunctionResultSubcontent)) or string</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

The result of the tool call.

</div>

</div>

</div>

<span style="font-weight: 500;">CodeExecutionResultStep</span>

<div class="subtype-content">

Code execution result step.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"code_execution_result"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">result</span> <span class="field-type">string</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

Required. The output of the code execution.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">is_error</span> <span class="field-type">boolean</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Whether the code execution resulted in an error.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">call_id</span> <span class="field-type">string</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

Required. ID to match the ID from the function call block.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">signature</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

A signature hash for backend validation.

</div>

</div>

</div>

<span style="font-weight: 500;">UrlContextResultStep</span>

<div class="subtype-content">

URL context result step.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"url_context_result"`.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">result</span> <span class="field-type">UrlContextResultItem</span> <span class="field-necessity required"> (required)</span>

<div class="field-description">

Required. The results of the URL context.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The result of the URL context.

#### Fields

<div class="field-entry">

<div class="signature">

<span class="field-name">url</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The URL that was fetched.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">status</span> <span class="field-type">enum (string)</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The status of the URL retrieval.

Possible values:

- `success`
- `error`
- `paywall`
- `unsafe`

</div>

</div>

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">is_error</span> <span class="field-type">boolean</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Whether the URL context resulted in an error.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">call_id</span> <span class="field-type">string</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

Required. ID to match the ID from the function call block.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">signature</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

A signature hash for backend validation.

</div>

</div>

</div>

<span style="font-weight: 500;">GoogleSearchResultStep</span>

<div class="subtype-content">

Google Search result step.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"google_search_result"`.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">result</span> <span class="field-type">GoogleSearchResultItem</span> <span class="field-necessity required"> (required)</span>

<div class="field-description">

Required. The results of the Google Search.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The result of the Google Search.

#### Fields

<div class="field-entry">

<div class="signature">

<span class="field-name">search_suggestions</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

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

<span class="field-name">is_error</span> <span class="field-type">boolean</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Whether the Google Search resulted in an error.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">call_id</span> <span class="field-type">string</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

Required. ID to match the ID from the function call block.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">signature</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

A signature hash for backend validation.

</div>

</div>

</div>

<span style="font-weight: 500;">McpServerToolResultStep</span>

<div class="subtype-content">

MCPServer tool result step.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"mcp_server_tool_result"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">name</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Name of the tool which is called for this specific tool call.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">server_name</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The name of the used MCP server.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">call_id</span> <span class="field-type">string</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

Required. ID to match the ID from the function call block.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">signature</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

A signature hash for backend validation.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">result</span> <span class="field-type">array ([FunctionResultSubcontent](#Resource:FunctionResultSubcontent)) or string</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

The output from the MCP server call. Can be simple text or rich content.

</div>

</div>

</div>

<span style="font-weight: 500;">FileSearchResultStep</span>

<div class="subtype-content">

File Search result step.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"file_search_result"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">call_id</span> <span class="field-type">string</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

Required. ID to match the ID from the function call block.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">signature</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

A signature hash for backend validation.

</div>

</div>

</div>

<span style="font-weight: 500;">GoogleMapsResultStep</span>

<div class="subtype-content">

Google Maps result step.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"google_maps_result"`.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">result</span> <span class="field-type">GoogleMapsResultItem</span> <span class="field-necessity required"> (required)</span>

<div class="field-description">

No description provided.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

The result of the Google Maps.

#### Fields

<span class="expander-icon"></span> <span class="field-name">places</span> <span class="field-type">GoogleMapsResultPlaces</span> <span class="field-necessity optional"> (optional)</span>

<div class="field-description">

No description provided.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

#### Fields

<div class="field-entry">

<div class="signature">

<span class="field-name">place_id</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

No description provided.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">name</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

No description provided.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">url</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

No description provided.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">review_snippets</span> <span class="field-type">ReviewSnippet</span> <span class="field-necessity optional"> (optional)</span>

<div class="field-description">

No description provided.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

Encapsulates a snippet of a user review that answers a question about the features of a specific place in Google Maps.

#### Fields

<div class="field-entry">

<div class="signature">

<span class="field-name">title</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Title of the review.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">url</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

A link that corresponds to the user review on Google Maps.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">review_id</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The ID of the review snippet.

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

<span class="field-name">widget_context_token</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

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

<span class="field-name">call_id</span> <span class="field-type">string</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

Required. ID to match the ID from the function call block.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">signature</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

A signature hash for backend validation.

</div>

</div>

</div>

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">event_id</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The event_id token to be used to resume the interaction stream, from this event.

</div>

</div>

</div>

<span style="font-weight: 500;">StepDelta</span>

<div class="subtype-content">

<div class="field-entry">

<div class="signature">

<span class="field-name">event_type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"step.delta"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">index</span> <span class="field-type">integer</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">delta</span> <span class="field-type">StepDeltaData</span> <span class="field-necessity required"> (required)</span>

<div class="field-description">

No description provided.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

#### Possible Types

Polymorphic discriminator: `type`

<span style="font-weight: 500;">TextDelta</span>

<div class="subtype-content">

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"text"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">text</span> <span class="field-type">string</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

</div>

</div>

</div>

<span style="font-weight: 500;">ImageDelta</span>

<div class="subtype-content">

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"image"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">data</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

No description provided.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">uri</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

No description provided.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">mime_type</span> <span class="field-type">enum (string)</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

No description provided.

Possible values:

- `image/png`
- `image/jpeg`
- `image/webp`
- `image/heic`
- `image/heif`
- `image/gif`
- `image/bmp`
- `image/tiff`

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">resolution</span> <span class="field-type">MediaResolution</span> <span class="field-necessity optional"> (optional)</span>

<div class="field-description">

The resolution of the media.

Possible values:

- `low`
- `medium`
- `high`
- `ultra_high`

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

</div>

</div>

</div>

</div>

</div>

<span style="font-weight: 500;">AudioDelta</span>

<div class="subtype-content">

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"audio"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">data</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

No description provided.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">uri</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

No description provided.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">mime_type</span> <span class="field-type">enum (string)</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

No description provided.

Possible values:

- `audio/wav`
- `audio/mp3`
- `audio/aiff`
- `audio/aac`
- `audio/ogg`
- `audio/flac`
- `audio/mpeg`
- `audio/m4a`
- `audio/l16`
- `audio/opus`
- `audio/alaw`
- `audio/mulaw`

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">rate</span> <span class="field-type">integer</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Deprecated. Use sample_rate instead. The value is ignored.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">sample_rate</span> <span class="field-type">integer</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The sample rate of the audio.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">channels</span> <span class="field-type">integer</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The number of audio channels.

</div>

</div>

</div>

<span style="font-weight: 500;">DocumentDelta</span>

<div class="subtype-content">

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"document"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">data</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

No description provided.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">uri</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

No description provided.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">mime_type</span> <span class="field-type">enum (string)</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

No description provided.

Possible values:

- `application/pdf`

</div>

</div>

</div>

<span style="font-weight: 500;">VideoDelta</span>

<div class="subtype-content">

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"video"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">data</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

No description provided.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">uri</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

No description provided.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">mime_type</span> <span class="field-type">enum (string)</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

No description provided.

Possible values:

- `video/mp4`
- `video/mpeg`
- `video/mpg`
- `video/mov`
- `video/avi`
- `video/x-flv`
- `video/webm`
- `video/wmv`
- `video/3gpp`

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">resolution</span> <span class="field-type">MediaResolution</span> <span class="field-necessity optional"> (optional)</span>

<div class="field-description">

The resolution of the media.

Possible values:

- `low`
- `medium`
- `high`
- `ultra_high`

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

</div>

</div>

</div>

</div>

</div>

<span style="font-weight: 500;">ThoughtSummaryDelta</span>

<div class="subtype-content">

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"thought_summary"`.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">content</span> <span class="field-type">ThoughtSummaryContent</span> <span class="field-necessity optional"> (optional)</span>

<div class="field-description">

A new summary item to be added to the thought.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

#### Possible Types

Polymorphic discriminator: `type`

<span style="font-weight: 500;">TextContent</span>

<div class="subtype-content">

A text content block.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"text"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">text</span> <span class="field-type">string</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

Required. The text content.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">annotations</span> <span class="field-type">Annotation</span> <span class="field-necessity optional"> (optional)</span>

<div class="field-description">

Citation information for model-generated content.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

Citation information for model-generated content.

#### Possible Types

Polymorphic discriminator: `type`

<span style="font-weight: 500;">UrlCitation</span>

<div class="subtype-content">

A URL citation annotation.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"url_citation"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">url</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The URL.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">title</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The title of the URL.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">start_index</span> <span class="field-type">integer</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Start of segment of the response that is attributed to this source. Index indicates the start of the segment, measured in bytes.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">end_index</span> <span class="field-type">integer</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

End of the attributed segment, exclusive.

</div>

</div>

</div>

<span style="font-weight: 500;">FileCitation</span>

<div class="subtype-content">

A file citation annotation.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"file_citation"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">document_uri</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The URI of the file.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">file_name</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The name of the file.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">source</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Source attributed for a portion of the text.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">custom_metadata</span> <span class="field-type">object</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

User provided metadata about the retrieved context.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">page_number</span> <span class="field-type">integer</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Page number of the cited document, if applicable.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">media_id</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Media ID in-case of image citations, if applicable.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">start_index</span> <span class="field-type">integer</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Start of segment of the response that is attributed to this source. Index indicates the start of the segment, measured in bytes.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">end_index</span> <span class="field-type">integer</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

End of the attributed segment, exclusive.

</div>

</div>

</div>

<span style="font-weight: 500;">PlaceCitation</span>

<div class="subtype-content">

A place citation annotation.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"place_citation"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">place_id</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The ID of the place, in \`places/{place_id}\` format.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">name</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Title of the place.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">url</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

URI reference of the place.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">review_snippets</span> <span class="field-type">ReviewSnippet</span> <span class="field-necessity optional"> (optional)</span>

<div class="field-description">

Snippets of reviews that are used to generate answers about the features of a given place in Google Maps.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

Encapsulates a snippet of a user review that answers a question about the features of a specific place in Google Maps.

#### Fields

<div class="field-entry">

<div class="signature">

<span class="field-name">title</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Title of the review.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">url</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

A link that corresponds to the user review on Google Maps.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">review_id</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The ID of the review snippet.

</div>

</div>

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">start_index</span> <span class="field-type">integer</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Start of segment of the response that is attributed to this source. Index indicates the start of the segment, measured in bytes.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">end_index</span> <span class="field-type">integer</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

End of the attributed segment, exclusive.

</div>

</div>

</div>

</div>

</div>

</div>

</div>

</div>

<span style="font-weight: 500;">ImageContent</span>

<div class="subtype-content">

An image content block.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"image"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">data</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The image content.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">uri</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The URI of the image.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">mime_type</span> <span class="field-type">enum (string)</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The mime type of the image.

Possible values:

- `image/png`
- `image/jpeg`
- `image/webp`
- `image/heic`
- `image/heif`
- `image/gif`
- `image/bmp`
- `image/tiff`

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">resolution</span> <span class="field-type">MediaResolution</span> <span class="field-necessity optional"> (optional)</span>

<div class="field-description">

The resolution of the media.

Possible values:

- `low`
- `medium`
- `high`
- `ultra_high`

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

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

<span style="font-weight: 500;">ThoughtSignatureDelta</span>

<div class="subtype-content">

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"thought_signature"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">signature</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Signature to match the backend source to be part of the generation.

</div>

</div>

</div>

<span style="font-weight: 500;">TextAnnotationDelta</span>

<div class="subtype-content">

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"text_annotation_delta"`.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">annotations</span> <span class="field-type">Annotation</span> <span class="field-necessity optional"> (optional)</span>

<div class="field-description">

Citation information for model-generated content.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

Citation information for model-generated content.

#### Possible Types

Polymorphic discriminator: `type`

<span style="font-weight: 500;">UrlCitation</span>

<div class="subtype-content">

A URL citation annotation.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"url_citation"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">url</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The URL.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">title</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The title of the URL.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">start_index</span> <span class="field-type">integer</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Start of segment of the response that is attributed to this source. Index indicates the start of the segment, measured in bytes.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">end_index</span> <span class="field-type">integer</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

End of the attributed segment, exclusive.

</div>

</div>

</div>

<span style="font-weight: 500;">FileCitation</span>

<div class="subtype-content">

A file citation annotation.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"file_citation"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">document_uri</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The URI of the file.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">file_name</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The name of the file.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">source</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Source attributed for a portion of the text.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">custom_metadata</span> <span class="field-type">object</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

User provided metadata about the retrieved context.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">page_number</span> <span class="field-type">integer</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Page number of the cited document, if applicable.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">media_id</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Media ID in-case of image citations, if applicable.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">start_index</span> <span class="field-type">integer</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Start of segment of the response that is attributed to this source. Index indicates the start of the segment, measured in bytes.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">end_index</span> <span class="field-type">integer</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

End of the attributed segment, exclusive.

</div>

</div>

</div>

<span style="font-weight: 500;">PlaceCitation</span>

<div class="subtype-content">

A place citation annotation.

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"place_citation"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">place_id</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The ID of the place, in \`places/{place_id}\` format.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">name</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Title of the place.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">url</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

URI reference of the place.

</div>

</div>

<span class="expander-icon"></span> <span class="field-name">review_snippets</span> <span class="field-type">ReviewSnippet</span> <span class="field-necessity optional"> (optional)</span>

<div class="field-description">

Snippets of reviews that are used to generate answers about the features of a given place in Google Maps.

<div class="section prototype" style="padding-left: 16px;">

<div class="column-container">

<div class="reference">

Encapsulates a snippet of a user review that answers a question about the features of a specific place in Google Maps.

#### Fields

<div class="field-entry">

<div class="signature">

<span class="field-name">title</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Title of the review.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">url</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

A link that corresponds to the user review on Google Maps.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">review_id</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The ID of the review snippet.

</div>

</div>

</div>

</div>

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">start_index</span> <span class="field-type">integer</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

Start of segment of the response that is attributed to this source. Index indicates the start of the segment, measured in bytes.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">end_index</span> <span class="field-type">integer</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

End of the attributed segment, exclusive.

</div>

</div>

</div>

</div>

</div>

</div>

</div>

</div>

<span style="font-weight: 500;">ArgumentsDelta</span>

<div class="subtype-content">

<div class="field-entry">

<div class="signature">

<span class="field-name">type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"arguments_delta"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">partial_arguments</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

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

<span class="field-name">event_id</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The event_id token to be used to resume the interaction stream, from this event.

</div>

</div>

</div>

<span style="font-weight: 500;">StepStop</span>

<div class="subtype-content">

<div class="field-entry">

<div class="signature">

<span class="field-name">event_type</span> <span class="field-type">object</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

Always set to `"step.stop"`.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">index</span> <span class="field-type">integer</span> <span class="field-necessity required"> (required)</span>

</div>

<div class="field-description">

No description provided.

</div>

</div>

<div class="field-entry">

<div class="signature">

<span class="field-name">event_id</span> <span class="field-type">string</span> <span class="field-necessity optional"> (optional)</span>

</div>

<div class="field-description">

The event_id token to be used to resume the interaction stream, from this event.

</div>

</div>

</div>

</div>

<div class="second-column">

<div class="examples">

### Examples

<div class="section">

### Interaction Created

<div class="schema-example-content">

<div>

</div>

``` devsite-click-to-copy
{
  "event_type": "interaction.created",
  "interaction": {
    "id": "v1_ChdXS0l4YWZXTk9xbk0xZThQczhEcmlROBIXV0tJeGFmV05PcW5NMWU4UHM4RHJpUTg",
    "agent": "deep-research-preview-04-2026",
    "status": "in_progress",
    "created": "2025-12-04T15:01:45Z",
    "updated": "2025-12-04T15:01:45Z"
  },
  "event_id": "evt_123"
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
  "event_type": "interaction.completed",
  "interaction": {
    "id": "v1_ChdXS0l4YWZXTk9xbk0xZThQczhEcmlROBIXV0tJeGFmV05PcW5NMWU4UHM4RHJpUTg",
    "agent": "deep-research-preview-04-2026",
    "status": "completed",
    "created": "2025-12-04T15:01:45Z",
    "updated": "2025-12-04T15:01:45Z"
  },
  "event_id": "evt_123"
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

### Error Event

<div class="schema-example-content">

<div>

</div>

``` devsite-click-to-copy
{
  "event_type": "error",
  "error": {
    "message": "Failed to get completed interaction: Result not found.",
    "code": "not_found"
  }
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

### Step Delta

<div class="schema-example-content">

<div>

</div>

``` devsite-click-to-copy
{
  "event_type": "step.delta",
  "index": 0,
  "delta": {
    "type": "text",
    "text": "Hello"
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

</div>

## Appendix: Interactive examples

### Example 1

`n
#### Example Request
`n
REST Python JavaScript
`n`n
``` prettyprint
curl -X POST https://aiplatform.googleapis.com/v1beta1/projects/{project}/locations/global/interactions \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "Content-Type: application/json" \
  -H "Api-Revision: 2026-05-20" \
  -d '{
    "model": "lyria-3-clip-preview",
    "input": [
      {
        "type": "user_input",
        "content": [
          {
            "type": "text",
            "text": "Generate a short happy upbeat electronic music clip."
          }
        ]
      }
    ]
  }'
```
`n`n
``` prettyprint
from google import genai
from google.genai import types
`n
client = genai.Client(vertexai=True, location='global')
interaction = client.interactions.create(
    model="lyria-3-clip-preview",
    input=[
        types.Step(
            type="user_input",
            content=[
                types.Part.from_text(
                    text="Generate a short happy upbeat electronic music clip."
                )
            ],
        )
    ],
)
print(interaction.steps[-1].content[0].text)
```
`n`n
``` prettyprint
import {GoogleGenAI} from '@google/genai';
`n
const ai = new GoogleGenAI({vertexai: true, location: 'global'});
const interaction = await ai.interactions.create({
    model: 'lyria-3-clip-preview',
    input: [
        {
            type: 'user_input',
            content: [{type: 'text', text: 'Generate a short happy upbeat electronic music clip.'}],
        },
    ],
});
console.log(interaction.steps.at(-1).content[0].text);
```
`n`n

### Example 2

`n
#### Example Request
`n
REST Python JavaScript
`n`n
``` prettyprint
curl -X POST https://aiplatform.googleapis.com/v1beta1/projects/{project}/locations/global/interactions \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "Content-Type: application/json" \
  -H "Api-Revision: 2026-05-20" \
  -d '{
    "model": "lyria-3-clip-preview",
    "input": [
      {
        "type": "user_input",
        "content": [
          {
            "type": "text",
            "text": "Generate a music clip for this image."
          },
          {
            "type": "image",
            "data": "BASE64_ENCODED_IMAGE",
            "mime_type": "image/png"
          }
        ]
      }
    ]
  }'
```
`n`n
``` prettyprint
from google import genai
from google.genai import types
`n
client = genai.Client(vertexai=True, location='global')
interaction = client.interactions.create(
    model="lyria-3-clip-preview",
    input=[
        types.Step(
            type="user_input",
            content=[
                types.Part.from_text(text="Generate a music clip for this image."),
                types.Part.from_bytes(
                    data=b"BASE64_ENCODED_IMAGE",
                    mime_type="image/png",
                ),
            ],
        )
    ],
)
print(interaction.steps[-1].content[0].text)
```
`n`n
``` prettyprint
import {GoogleGenAI} from '@google/genai';
`n
const ai = new GoogleGenAI({vertexai: true, location: 'global'});
const interaction = await ai.interactions.create({
    model: 'lyria-3-clip-preview',
    input: [
        {
            type: 'user_input',
            content: [
                {type: 'text', text: 'Generate a music clip for this image.'},
                {type: 'image', data: 'BASE64_ENCODED_IMAGE', mime_type: 'image/png'},
            ],
        },
    ],
});
console.log(interaction.steps.at(-1).content[0].text);
```
`n`n

### Example 3

`n
#### Example Request
`n
REST Python JavaScript
`n`n
``` prettyprint
curl -X POST https://aiplatform.googleapis.com/v1beta1/projects/{project}/locations/global/interactions \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "Content-Type: application/json" \
  -H "Api-Revision: 2026-05-20" \
  -d '{
    "agent": "deep-research-preview-04-2026",
    "input": "Write an investment memo about the luxury retail industry over the last 3 years.",
    "background": true
  }'
```
`n`n
``` prettyprint
from google import genai
`n
client = genai.Client(vertexai=True, location='global')
interaction = client.interactions.create(
    agent="deep-research-preview-04-2026",
    input="Write an investment memo about the luxury retail industry over the last 3 years.",
    background=True,
)
print(interaction.status)
```
`n`n
``` prettyprint
import {GoogleGenAI} from '@google/genai';
`n
const ai = new GoogleGenAI({vertexai: true, location: 'global'});
const interaction = await ai.interactions.create({
    agent: 'deep-research-preview-04-2026',
    input: 'Write an investment memo about the luxury retail industry over the last 3 years.',
    background: true,
});
console.log(interaction.status);
```
`n`n

### Example 4

`n
#### Example Request
`n
REST Python JavaScript
`n`n
``` prettyprint
curl -X GET "https://aiplatform.googleapis.com/v1beta1/projects/{project}/locations/global/interactions/v1_ChdPU0F4YWFtNkFwS2kxZThQZ05lbXdROBIXT1NBeGFhbTZBcEtpMWU4UGdOZW13UTg?stream=true" \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "Api-Revision: 2026-05-20"
```
`n`n
``` prettyprint
from google import genai
`n
client = genai.Client(vertexai=True, location='global')
`n
interaction = client.interactions.get(id="v1_ChdPU0F4YWFtNkFwS2kxZThQZ05lbXdROBIXT1NBeGFhbTZBcEtpMWU4UGdOZW13UTg")
print(interaction.status)
```
`n`n
``` prettyprint
import {GoogleGenAI} from '@google/genai';
`n
const ai = new GoogleGenAI({vertexai: true, location: 'global'});
const interaction = await ai.interactions.get('v1_ChdPU0F4YWFtNkFwS2kxZThQZ05lbXdROBIXT1NBeGFhbTZBcEtpMWU4UGdOZW13UTg');
console.log(interaction.status);
```
`n`n

### Example 5

`n
#### Example
`n
REST Python JavaScript
`n`n
``` prettyprint
curl -X POST https://aiplatform.googleapis.com/v1beta1/projects/{project}/locations/global/interactions \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "Content-Type: application/json" \
  -H "Api-Revision: 2026-05-20" \
  -d '{
    "agent": "deep-research-preview-04-2026",
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
client = genai.Client(vertexai=True, location='global')
response = client.interactions.create(
    agent="deep-research-preview-04-2026",
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
const ai = new GoogleGenAI({vertexai: true, location: 'global'});
const interaction = await ai.interactions.create({
    agent: 'deep-research-preview-04-2026',
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

### Example 6

`n
#### Example
`n
REST Python JavaScript
`n`n
``` prettyprint
curl -X POST https://aiplatform.googleapis.com/v1beta1/projects/{project}/locations/global/interactions \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "Content-Type: application/json" \
  -H "Api-Revision: 2026-05-20" \
  -d '{
    "agent": "deep-research-preview-04-2026",
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
client = genai.Client(vertexai=True, location='global')
response = client.interactions.create(
    agent="deep-research-preview-04-2026",
    tools=[{"type": "code_execution"}],
    input="Calculate the first 10 Fibonacci numbers"
)
print(response.steps[-1].content[0].text)
```
`n`n
``` prettyprint
import {GoogleGenAI} from '@google/genai';
`n
const ai = new GoogleGenAI({vertexai: true, location: 'global'});
const interaction = await ai.interactions.create({
    agent: 'deep-research-preview-04-2026',
    tools: [{ type: 'code_execution' }],
    input: 'Calculate the first 10 Fibonacci numbers'
});
console.log(interaction.steps.at(-1).content[0].text);
```
`n`n

### Example 7

`n
#### Example
`n
REST Python JavaScript
`n`n
``` prettyprint
curl -X POST https://aiplatform.googleapis.com/v1beta1/projects/{project}/locations/global/interactions \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "Content-Type: application/json" \
  -H "Api-Revision: 2026-05-20" \
  -d '{
    "agent": "deep-research-preview-04-2026",
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
client = genai.Client(vertexai=True, location='global')
response = client.interactions.create(
    agent="deep-research-preview-04-2026",
    tools=[{"type": "url_context"}],
    input="Summarize https://www.example.com"
)
print(response.steps[-1].content[0].text)
```
`n`n
``` prettyprint
import {GoogleGenAI} from '@google/genai';
`n
const ai = new GoogleGenAI({vertexai: true, location: 'global'});
const interaction = await ai.interactions.create({
    agent: 'deep-research-preview-04-2026',
    tools: [{ type: 'url_context' }],
    input: 'Summarize https://www.example.com'
});
console.log(interaction.steps.at(-1).content[0].text);
```
`n`n

### Example 8

`n
#### Example
`n
REST Python JavaScript
`n`n
``` prettyprint
curl -X POST https://aiplatform.googleapis.com/v1beta1/projects/{project}/locations/global/interactions \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "Content-Type: application/json" \
  -H "Api-Revision: 2026-05-20" \
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
client = genai.Client(vertexai=True, location='global')
response = client.interactions.create(
    model="gemini-2.5-computer-use-preview-10-2025",
    tools=[{"type": "computer_use"}],
    input="Find a flight to Tokyo"
)
print(response.steps[-1].content[0].text)
```
`n`n
``` prettyprint
import {GoogleGenAI} from '@google/genai';
`n
const ai = new GoogleGenAI({vertexai: true, location: 'global'});
const interaction = await ai.interactions.create({
    model: 'gemini-2.5-computer-use-preview-10-2025',
    tools: [{ type: 'computer_use'}],
    input: 'Find a flight to Tokyo'
});
console.log(interaction.steps.at(-1).content[0].text);
```
`n`n

### Example 9

`n
#### Example
`n
REST Python JavaScript
`n`n
``` prettyprint
curl -X POST https://aiplatform.googleapis.com/v1beta1/projects/{project}/locations/global/interactions \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "Content-Type: application/json" \
  -H "Api-Revision: 2026-05-20" \
  -d '{
    "agent": "deep-research-preview-04-2026",
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
client = genai.Client(vertexai=True, location='global')
response = client.interactions.create(
    agent="deep-research-preview-04-2026",
    tools=[{
        "type": "mcp_server",
        "name": "weather_service",
        "url": "https://gemini-api-demos.uc.r.appspot.com/mcp"
    }],
    input="Today is 12-05-2025, what is the temperature today in London?"
)
print(response.steps[-1].content[0].text)
```
`n`n
``` prettyprint
import {GoogleGenAI} from '@google/genai';
`n
const ai = new GoogleGenAI({vertexai: true, location: 'global'});
const interaction = await ai.interactions.create({
    agent: 'deep-research-preview-04-2026',
    tools: [{
        type: 'mcp_server',
        name: 'weather_service',
        url: 'https://gemini-api-demos.uc.r.appspot.com/mcp'
    }],
    input: 'Today is 12-05-2025, what is the temperature today in London?'
});
console.log(interaction.steps.at(-1).content[0].text);
```
`n`n

### Example 10

`n
#### Example
`n
REST Python JavaScript
`n`n
``` prettyprint
curl -X POST https://aiplatform.googleapis.com/v1beta1/projects/{project}/locations/global/interactions \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "Content-Type: application/json" \
  -H "Api-Revision: 2026-05-20" \
  -d '{
    "agent": "deep-research-preview-04-2026",
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
client = genai.Client(vertexai=True, location='global')
response = client.interactions.create(
    agent="deep-research-preview-04-2026",
    tools=[{"type": "google_search"}],
    input="Who is the current president of France?"
)
print(response.steps[-1].content[0].text)
```
`n`n
``` prettyprint
import {GoogleGenAI} from '@google/genai';
`n
const ai = new GoogleGenAI({vertexai: true, location: 'global'});
const interaction = await ai.interactions.create({
    agent: 'deep-research-preview-04-2026',
    tools: [{ type: 'google_search' }],
    input: 'Who is the current president of France?'
});
console.log(interaction.steps.at(-1).content[0].text);
```
`n`n

### Example 11

`n
#### Example
`n
REST Python JavaScript
`n`n
``` prettyprint
curl -X POST https://aiplatform.googleapis.com/v1beta1/projects/{project}/locations/global/interactions \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "Content-Type: application/json" \
  -H "Api-Revision: 2026-05-20" \
  -d '{
    "agent": "deep-research-preview-04-2026",
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
client = genai.Client(vertexai=True, location='global')
response = client.interactions.create(
    agent="deep-research-preview-04-2026",
    tools=[{
        "type": "google_maps",
        "latitude": 37.7749,
        "longitude": -122.4194
    }],
    input="What is the best food near me?"
)
print(response.steps[-1].content[0].text)
```
`n`n
``` prettyprint
import {GoogleGenAI} from '@google/genai';
`n
const ai = new GoogleGenAI({vertexai: true, location: 'global'});
const interaction = await ai.interactions.create({
    agent: 'deep-research-preview-04-2026',
    tools: [{
        type: 'google_maps',
        latitude: 37.7749,
        longitude: -122.4194
    }],
    input: 'What is the best food near me?'
});
console.log(interaction.steps.at(-1).content[0].text);
```
`n`n


