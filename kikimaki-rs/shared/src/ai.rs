use google_generative_ai_rs::v1::{
    api::Client,
    errors::GoogleAPIError,
    gemini::{
        request::{GenerationConfig, Request, SystemInstructionContent, SystemInstructionPart}, Content, Model, Part, Role
    },
};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AiError {
    #[error("ai returned a part that was empty")]
    ImpartialResponse,

    #[error("ai returned empty")]
    EmptyResponse,

    #[error("idk bro {0}")]
    Unknown(GoogleAPIError),
}

pub struct Ai {
    client: Client,
    system_prompt: String,
}

impl Ai {
    pub fn new<S1: AsRef<str>, S2: AsRef<str>>(api_key: S1, system_prompt: S2) -> Self {
        let client = Client::new_from_model(Model::Gemini2_0Flash, api_key.as_ref().to_string());
        Ai {
            client,
            system_prompt: system_prompt.as_ref().to_string(),
        }
    }

    pub async fn send<S: AsRef<str>>(&self, message: S) -> Result<String, AiError> {
        let request = Request {
            contents: vec![Content {
                role: Role::User,
                parts: vec![Part {
                    text: Some(message.as_ref().to_string()),
                    inline_data: None,
                    file_data: None,
                    video_metadata: None,
                }],
            }],
            tools: vec![],
            safety_settings: vec![],
            generation_config: Some(GenerationConfig {
                temperature: Some(2.0),
                top_p: None,
                top_k: None,
                candidate_count: None,
                max_output_tokens: None,
                stop_sequences: None,
                response_mime_type: None,
                response_schema: None,
            }),
            system_instruction: Some(SystemInstructionContent {
                parts: vec![SystemInstructionPart {
                    text: Some(self.system_prompt.to_string()),
                }],
            }),
        };

        // we don't want a streamed response, since ideally the AI gets all the frames it needs to
        // react to a message
        self.client
            .post(30, &request)
            .await
            .map_err(|e| AiError::Unknown(e))?
            .rest()
            .ok_or(AiError::EmptyResponse)?
            .candidates
            .first()
            .ok_or(AiError::EmptyResponse)?
            .content
            .parts
            .iter()
            .map(|part| part.text.clone())
            .reduce(|accum, ele| {
                if let Some(e) = ele {
                    accum.map(|r| r + &e)
                } else {
                    None
                }
            })
            .ok_or(AiError::EmptyResponse)?
            .ok_or(AiError::ImpartialResponse)
    }
}
