use llm_adapter::{
  core::{
    CoreMessage, CoreRequest, CoreRole, EmbeddingRequest, ImageFormat, ImageInput, ImageOptions, ImageProviderOptions,
    ImageRequest, PromptRole, RerankCandidate, RerankRequest, StructuredRequest,
  },
  protocol::{fal::options::FalImageOptions, gemini::image::GeminiImageOptions, openai::images::OpenAiImageOptions},
};
use napi::Result;
use serde::{Serialize, de::DeserializeOwned};
use serde_json::Value;

use super::super::contracts::{
  CanonicalChatRequestContract, CanonicalStructuredRequestContract, LlmEmbeddingRequestContract, LlmImageInputContract,
  LlmImageOptionsContract, LlmImageProviderOptionsContract, LlmImageRequestContract, LlmRequestContract,
  LlmRerankRequestContract, LlmStructuredRequestContract, RerankCandidate as ContractRerankCandidate, ToolContract,
};
use crate::llm::{
  LlmDispatchPayload, LlmMiddlewarePayload, LlmRerankDispatchPayload, LlmStructuredDispatchPayload, host::invalid_arg,
  map_json_error,
};

pub(crate) type PromptMessageInput = llm_adapter::core::PromptMessageInput;

pub(crate) struct CanonicalChatRequest {
  pub(super) request: llm_adapter::core::CanonicalChatRequest,
  pub(super) middleware: LlmMiddlewarePayload,
}

pub(crate) struct CanonicalStructuredRequest {
  pub(super) request: llm_adapter::core::CanonicalStructuredRequest,
  pub(super) middleware: LlmMiddlewarePayload,
}

fn split_middleware_from_contract<TContract, TRequest>(contract: TContract) -> Result<(TRequest, LlmMiddlewarePayload)>
where
  TContract: Serialize,
  TRequest: DeserializeOwned,
{
  let mut value = serde_json::to_value(contract).map_err(map_json_error)?;
  let middleware = value
    .as_object_mut()
    .and_then(|object| object.remove("middleware"))
    .map(serde_json::from_value)
    .transpose()
    .map_err(map_json_error)?
    .unwrap_or_default();
  let request = serde_json::from_value(value).map_err(map_json_error)?;
  Ok((request, middleware))
}

impl TryFrom<CanonicalChatRequestContract> for CanonicalChatRequest {
  type Error = napi::Error;

  fn try_from(request: CanonicalChatRequestContract) -> Result<Self> {
    let (request, middleware) = split_middleware_from_contract(request)?;
    Ok(Self { request, middleware })
  }
}

impl TryFrom<CanonicalStructuredRequestContract> for CanonicalStructuredRequest {
  type Error = napi::Error;

  fn try_from(request: CanonicalStructuredRequestContract) -> Result<Self> {
    let (request, middleware) = split_middleware_from_contract(request)?;
    Ok(Self { request, middleware })
  }
}

impl TryFrom<CoreMessage> for super::super::contracts::LlmCoreMessage {
  type Error = napi::Error;

  fn try_from(message: CoreMessage) -> Result<Self> {
    Ok(Self {
      role: match message.role {
        CoreRole::System => "system".to_string(),
        CoreRole::User => "user".to_string(),
        CoreRole::Assistant => "assistant".to_string(),
        CoreRole::Tool => "tool".to_string(),
      },
      content: message
        .content
        .into_iter()
        .map(|content| serde_json::to_value(content).map_err(map_json_error))
        .collect::<Result<Vec<_>>>()?,
    })
  }
}

fn middleware_payload_is_empty(middleware: &LlmMiddlewarePayload) -> bool {
  let default = llm_adapter::middleware::MiddlewareConfig::default();
  middleware.request.is_empty()
    && middleware.stream.is_empty()
    && middleware.config.additional_properties_policy == default.additional_properties_policy
    && middleware.config.property_format_policy == default.property_format_policy
    && middleware.config.property_min_length_policy == default.property_min_length_policy
    && middleware.config.array_min_items_policy == default.array_min_items_policy
    && middleware.config.array_max_items_policy == default.array_max_items_policy
    && middleware.config.max_tokens_cap.is_none()
}

impl TryFrom<LlmRequestContract> for LlmDispatchPayload {
  type Error = napi::Error;

  fn try_from(request: LlmRequestContract) -> Result<Self> {
    Ok(Self {
      request: CoreRequest {
        model: request.model,
        messages: request
          .messages
          .into_iter()
          .map(|message| {
            Ok(CoreMessage {
              role: PromptRole::from(message.role).into(),
              content: message
                .content
                .into_iter()
                .map(|content| serde_json::from_value(content).map_err(map_json_error))
                .collect::<Result<Vec<_>>>()?,
            })
          })
          .collect::<Result<Vec<_>>>()?,
        stream: request.stream.unwrap_or_default(),
        max_tokens: request.max_tokens,
        temperature: request.temperature,
        tools: request.tools.unwrap_or_default().into_iter().map(Into::into).collect(),
        tool_choice: request
          .tool_choice
          .map(serde_json::from_value)
          .transpose()
          .map_err(map_json_error)?,
        include: request.include,
        reasoning: request.reasoning,
        response_schema: request.response_schema,
      },
      middleware: request
        .middleware
        .map(serde_json::from_value)
        .transpose()
        .map_err(map_json_error)?
        .unwrap_or_default(),
    })
  }
}

impl TryFrom<LlmDispatchPayload> for LlmRequestContract {
  type Error = napi::Error;

  fn try_from(payload: LlmDispatchPayload) -> Result<Self> {
    Ok(Self {
      model: payload.request.model,
      messages: payload
        .request
        .messages
        .into_iter()
        .map(TryInto::try_into)
        .collect::<Result<Vec<_>>>()?,
      stream: Some(payload.request.stream),
      max_tokens: payload.request.max_tokens,
      temperature: payload.request.temperature,
      tools: (!payload.request.tools.is_empty()).then_some(
        payload
          .request
          .tools
          .into_iter()
          .map(|tool| ToolContract {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
          })
          .collect(),
      ),
      tool_choice: payload
        .request
        .tool_choice
        .map(serde_json::to_value)
        .transpose()
        .map_err(map_json_error)?,
      include: payload.request.include,
      reasoning: payload.request.reasoning,
      response_schema: payload.request.response_schema,
      middleware: (!middleware_payload_is_empty(&payload.middleware))
        .then(|| serde_json::to_value(payload.middleware).map_err(map_json_error))
        .transpose()?,
    })
  }
}

impl TryFrom<LlmStructuredRequestContract> for LlmStructuredDispatchPayload {
  type Error = napi::Error;

  fn try_from(request: LlmStructuredRequestContract) -> Result<Self> {
    Ok(Self {
      request: StructuredRequest {
        model: request.model,
        messages: request
          .messages
          .into_iter()
          .map(|message| {
            Ok(CoreMessage {
              role: PromptRole::from(message.role).into(),
              content: message
                .content
                .into_iter()
                .map(|content| serde_json::from_value(content).map_err(map_json_error))
                .collect::<Result<Vec<_>>>()?,
            })
          })
          .collect::<Result<Vec<_>>>()?,
        schema: request.schema,
        max_tokens: request.max_tokens,
        temperature: request.temperature,
        reasoning: request.reasoning,
        strict: request.strict,
        response_mime_type: request.response_mime_type,
      },
      middleware: request
        .middleware
        .map(serde_json::from_value)
        .transpose()
        .map_err(map_json_error)?
        .unwrap_or_default(),
    })
  }
}

impl TryFrom<LlmStructuredDispatchPayload> for LlmStructuredRequestContract {
  type Error = napi::Error;

  fn try_from(payload: LlmStructuredDispatchPayload) -> Result<Self> {
    Ok(Self {
      model: payload.request.model,
      messages: payload
        .request
        .messages
        .into_iter()
        .map(TryInto::try_into)
        .collect::<Result<Vec<_>>>()?,
      schema: payload.request.schema,
      max_tokens: payload.request.max_tokens,
      temperature: payload.request.temperature,
      reasoning: payload.request.reasoning,
      strict: payload.request.strict,
      response_mime_type: payload.request.response_mime_type,
      middleware: (!middleware_payload_is_empty(&payload.middleware))
        .then(|| serde_json::to_value(payload.middleware).map_err(map_json_error))
        .transpose()?,
    })
  }
}

impl From<LlmEmbeddingRequestContract> for EmbeddingRequest {
  fn from(request: LlmEmbeddingRequestContract) -> Self {
    Self {
      model: request.model,
      inputs: request.inputs,
      dimensions: request.dimensions,
      task_type: request.task_type,
    }
  }
}

impl From<EmbeddingRequest> for LlmEmbeddingRequestContract {
  fn from(request: EmbeddingRequest) -> Self {
    Self {
      model: request.model,
      inputs: request.inputs,
      dimensions: request.dimensions,
      task_type: request.task_type,
    }
  }
}

impl From<ContractRerankCandidate> for RerankCandidate {
  fn from(candidate: ContractRerankCandidate) -> Self {
    Self {
      id: candidate.id,
      text: candidate.text,
    }
  }
}

impl From<RerankCandidate> for ContractRerankCandidate {
  fn from(candidate: RerankCandidate) -> Self {
    Self {
      id: candidate.id,
      text: candidate.text,
    }
  }
}

impl From<LlmRerankRequestContract> for RerankRequest {
  fn from(request: LlmRerankRequestContract) -> Self {
    Self {
      model: request.model,
      query: request.query,
      candidates: request.candidates.into_iter().map(Into::into).collect(),
      top_n: request.top_n,
    }
  }
}

impl From<LlmRerankDispatchPayload> for LlmRerankRequestContract {
  fn from(payload: LlmRerankDispatchPayload) -> Self {
    Self {
      model: payload.request.model,
      query: payload.request.query,
      candidates: payload.request.candidates.into_iter().map(Into::into).collect(),
      top_n: payload.request.top_n,
    }
  }
}

fn parse_image_format(value: String) -> Result<ImageFormat> {
  match value.as_str() {
    "png" => Ok(ImageFormat::Png),
    "jpeg" => Ok(ImageFormat::Jpeg),
    "webp" => Ok(ImageFormat::Webp),
    other => Err(invalid_arg(format!("Unsupported image output format: {other}"))),
  }
}

impl TryFrom<LlmImageOptionsContract> for ImageOptions {
  type Error = napi::Error;

  fn try_from(options: LlmImageOptionsContract) -> Result<Self> {
    Ok(Self {
      n: options.n,
      size: options.size,
      aspect_ratio: options.aspect_ratio,
      quality: options.quality,
      output_format: options.output_format.map(parse_image_format).transpose()?,
      output_compression: options
        .output_compression
        .map(|value| u8::try_from(value).map_err(|_| invalid_arg("Image output compression must be between 0 and 100")))
        .transpose()?,
      background: options.background,
      seed: options
        .seed
        .map(|value| u64::try_from(value).map_err(|_| invalid_arg("Image seed must be non-negative")))
        .transpose()?,
    })
  }
}

impl From<ImageOptions> for LlmImageOptionsContract {
  fn from(options: ImageOptions) -> Self {
    Self {
      n: options.n,
      size: options.size,
      aspect_ratio: options.aspect_ratio,
      quality: options.quality,
      output_format: options.output_format.map(|format| format.as_str().to_string()),
      output_compression: options.output_compression.map(u32::from),
      background: options.background,
      seed: options.seed.and_then(|value| i64::try_from(value).ok()),
    }
  }
}

impl TryFrom<LlmImageInputContract> for ImageInput {
  type Error = napi::Error;

  fn try_from(input: LlmImageInputContract) -> Result<Self> {
    match input.kind.as_str() {
      "url" => Ok(Self::Url {
        url: input.url.ok_or_else(|| invalid_arg("Image url input requires url"))?,
        media_type: input.media_type,
      }),
      "data" => Ok(Self::Data {
        data_base64: input
          .data_base64
          .ok_or_else(|| invalid_arg("Image data input requires dataBase64"))?,
        media_type: input
          .media_type
          .ok_or_else(|| invalid_arg("Image data input requires mediaType"))?,
        file_name: input.file_name,
      }),
      "bytes" => Ok(Self::Bytes {
        data: input
          .data
          .ok_or_else(|| invalid_arg("Image bytes input requires data"))?,
        media_type: input
          .media_type
          .ok_or_else(|| invalid_arg("Image bytes input requires mediaType"))?,
        file_name: input.file_name,
      }),
      other => Err(invalid_arg(format!("Unsupported image input kind: {other}"))),
    }
  }
}

impl From<ImageInput> for LlmImageInputContract {
  fn from(input: ImageInput) -> Self {
    match input {
      ImageInput::Url { url, media_type } => Self {
        kind: "url".to_string(),
        url: Some(url),
        data_base64: None,
        data: None,
        media_type,
        file_name: None,
      },
      ImageInput::Data {
        data_base64,
        media_type,
        file_name,
      } => Self {
        kind: "data".to_string(),
        url: None,
        data_base64: Some(data_base64),
        data: None,
        media_type: Some(media_type),
        file_name,
      },
      ImageInput::Bytes {
        data,
        media_type,
        file_name,
      } => Self {
        kind: "bytes".to_string(),
        url: None,
        data_base64: None,
        data: Some(data),
        media_type: Some(media_type),
        file_name,
      },
    }
  }
}

fn parse_provider_options<T>(options: Option<Value>) -> Result<T>
where
  T: serde::de::DeserializeOwned + Default,
{
  options
    .map(serde_json::from_value)
    .transpose()
    .map_err(map_json_error)
    .map(Option::unwrap_or_default)
}

impl TryFrom<LlmImageProviderOptionsContract> for ImageProviderOptions {
  type Error = napi::Error;

  fn try_from(provider_options: LlmImageProviderOptionsContract) -> Result<Self> {
    match provider_options.provider.as_str() {
      "openai" => Ok(Self::Openai(parse_provider_options::<OpenAiImageOptions>(
        provider_options.options,
      )?)),
      "gemini" => Ok(Self::Gemini(parse_provider_options::<GeminiImageOptions>(
        provider_options.options,
      )?)),
      "fal" => Ok(Self::Fal(parse_provider_options::<FalImageOptions>(
        provider_options.options,
      )?)),
      "extra" => Ok(Self::Extra(provider_options.options.unwrap_or(Value::Null))),
      other => Err(invalid_arg(format!("Unsupported image provider options: {other}"))),
    }
  }
}

fn image_provider_options_contract(provider_options: ImageProviderOptions) -> Option<LlmImageProviderOptionsContract> {
  match provider_options {
    ImageProviderOptions::None => None,
    ImageProviderOptions::Openai(options) => Some(LlmImageProviderOptionsContract {
      provider: "openai".to_string(),
      options: Some(serde_json::to_value(options).unwrap_or(Value::Null)),
    }),
    ImageProviderOptions::Gemini(options) => Some(LlmImageProviderOptionsContract {
      provider: "gemini".to_string(),
      options: Some(serde_json::to_value(options).unwrap_or(Value::Null)),
    }),
    ImageProviderOptions::Fal(options) => Some(LlmImageProviderOptionsContract {
      provider: "fal".to_string(),
      options: Some(serde_json::to_value(options).unwrap_or(Value::Null)),
    }),
    ImageProviderOptions::Extra(options) => Some(LlmImageProviderOptionsContract {
      provider: "extra".to_string(),
      options: Some(options),
    }),
  }
}

impl TryFrom<LlmImageRequestContract> for ImageRequest {
  type Error = napi::Error;

  fn try_from(request: LlmImageRequestContract) -> Result<Self> {
    let options = request.options.map(TryInto::try_into).transpose()?.unwrap_or_default();
    let provider_options = request
      .provider_options
      .map(TryInto::try_into)
      .transpose()?
      .unwrap_or_default();

    match request.operation.as_str() {
      "generate" => Ok(Self::generate(request.model, request.prompt, options, provider_options)),
      "edit" => Ok(Self::edit(
        request.model,
        request.prompt,
        request
          .images
          .unwrap_or_default()
          .into_iter()
          .map(TryInto::try_into)
          .collect::<Result<Vec<_>>>()?,
        request.mask.map(TryInto::try_into).transpose()?,
        options,
        provider_options,
      )),
      other => Err(invalid_arg(format!("Unsupported image operation: {other}"))),
    }
  }
}

impl From<ImageRequest> for LlmImageRequestContract {
  fn from(request: ImageRequest) -> Self {
    match request {
      ImageRequest::Generate(request) => Self {
        model: request.model,
        prompt: request.prompt,
        operation: "generate".to_string(),
        images: None,
        mask: None,
        options: Some(request.options.into()),
        provider_options: image_provider_options_contract(request.provider_options),
      },
      ImageRequest::Edit(request) => Self {
        model: request.model,
        prompt: request.prompt,
        operation: "edit".to_string(),
        images: Some(request.images.into_iter().map(Into::into).collect()),
        mask: request.mask.map(Into::into),
        options: Some(request.options.into()),
        provider_options: image_provider_options_contract(request.provider_options),
      },
    }
  }
}
