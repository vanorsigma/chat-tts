use std::sync::Arc;

use openai::{
    Credentials, OpenAiError,
    chat::{ChatCompletion, ChatCompletionMessage, ChatCompletionMessageRole},
};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use tokio::sync::Mutex;

use crate::memory::Memories;

#[derive(Debug, Error)]
pub enum AiError {
    #[error("NoMessage, AI did not return any messages")]
    NoMessage,

    #[error("CompletionError: {0}")]
    CompletionError(OpenAiError),

    #[error("DeserialisationError: {0}")]
    DeserialisationError(serde_json::Error),

    #[error("SerialisationError: {0}")]
    SerialisationError(serde_json::Error),

    #[error("shrugeg")]
    Unknown,
}

const MODEL_NAME: &str = "kiki";
const RATING_MIN: f32 = -500.0;
const RATING_MAX: f32 = 50.0;

pub struct Ai {
    credentials: Credentials,
    prompt: String,
    memories: Arc<Mutex<Memories>>,
}

#[derive(Deserialize, Debug)]
pub struct AiResponse {
    kamoji: String,
    emoji: String,
    memories: Memories,
    rating: f32,
}

#[derive(Serialize, Debug)]
struct KikiResponse {
    kamoji: String,
    emoji: String,
    rating: f32,
}

impl Ai {
    pub async fn new(
        host: impl Into<String> + std::fmt::Display,
        port: u16,
        prompt: impl Into<String>,
    ) -> Self {
        let credentials = Credentials::new("", format!("http://{host}:{port}/v1"));
        Self {
            credentials,
            prompt: prompt.into(),
            memories: Arc::new(Mutex::new(Memories(vec![]))),
        }
    }

    async fn send_raw(
        &self,
        prompt: impl Into<String>,
        history: impl Into<Vec<ChatCompletionMessage>>,
        temperature: f32,
        top_p: f32,
    ) -> Result<String, AiError> {
        let mut messages = vec![ChatCompletionMessage {
            role: ChatCompletionMessageRole::System,
            content: Some(prompt.into().to_string()),
            ..Default::default()
        }];
        messages.append(&mut history.into());

        let chat_completion = ChatCompletion::builder(MODEL_NAME, messages.clone())
            .credentials(self.credentials.clone())
            .temperature(temperature)
            .top_p(top_p)
            .create()
            .await
            .map_err(AiError::CompletionError)?;

        let completion_messages = chat_completion
            .choices
            .first()
            .ok_or(AiError::NoMessage)?
            .message
            .clone()
            .content
            .expect("should have content");

        let (_thinking, messages) = completion_messages
            .trim()
            .rsplit_once("<think>")
            .map(|(_, msg)| msg)
            .expect("should have thinking")
            .split_once("</think>")
            .expect("responses should have a thinking and message");

        Ok(messages.to_string())
    }

    pub async fn send(&self, message: impl Into<String> + Clone) -> Result<String, AiError> {
        let mut memories = self.memories.lock().await;
        let result = self
            .send_raw(
                self.prompt
                    .replace(
                        "{{memories}}",
                        &serde_json::to_string(&memories.0).map_err(AiError::SerialisationError)?,
                    )
                    .clone(),
                vec![ChatCompletionMessage {
                    role: ChatCompletionMessageRole::User,
                    content: Some(message.clone().into()),
                    ..Default::default()
                }],
                0.8,
                0.95,
            )
            .await
            .inspect(|result| log::info!("Raw response: {result}"))?;

        let response_object =
            serde_json::from_str::<AiResponse>(&result).map_err(AiError::DeserialisationError)?;

        *memories = response_object.memories;
        log::debug!("Memories updated to: {:#?}", memories.0);

        serde_json::to_string(&KikiResponse {
            kamoji: response_object.kamoji,
            emoji: response_object.emoji,
            rating: response_object.rating.clamp(RATING_MIN, RATING_MAX),
        })
        .map_err(AiError::SerialisationError)
    }
}
