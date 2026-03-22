use std::sync::Arc;

use rig::{
    client::{CompletionClient, Nothing},
    completion::{CompletionModel, CompletionRequestBuilder},
    message::Message,
    providers::ollama::{self},
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use thiserror::Error;
use tokio::sync::Mutex;

use crate::memory::Memories;

#[derive(Debug, Error)]
pub enum AiError {
    #[error("NoMessage, AI did not return any messages")]
    NoMessage,

    #[error("CompletionError: {0}")]
    CompletionError(rig::completion::CompletionError),

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
    completion_model: ollama::CompletionModel,
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
    pub async fn new(host: impl Into<String> + std::fmt::Display, port: u16) -> Self {
        let client = ollama::Client::builder()
            .base_url(format!("http://{host}:{port}"))
            .api_key(Nothing)
            .build()
            .expect("can get ollama client");

        let completion_model = client.completion_model(MODEL_NAME);

        Self {
            completion_model,
            memories: Arc::new(Mutex::new(Memories(vec![]))),
        }
    }

    async fn send_raw(
        &self,
        history: impl Into<Vec<Message>>,
        prompt: impl Into<Message>,
    ) -> Result<String, AiError> {
        let request = CompletionRequestBuilder::new(self.completion_model.clone(), prompt)
            .without_preamble()
            .messages(history.into())
            .additional_params(json!({
                "think": false,
            }))
            .build();

        let response = self
            .completion_model
            .completion(request)
            .await
            .map_err(AiError::CompletionError)?;

        Ok(match response.choice.first() {
            rig::message::AssistantContent::Text(text) => text.to_string(),
            _ => return Err(AiError::NoMessage),
        })
    }

    pub async fn send(&self, message: impl Into<String>) -> Result<String, AiError> {
        let mut memories = self.memories.lock().await;
        let the_message = format!(
            "{}\n{}",
            serde_json::to_string(&memories.0).map_err(AiError::SerialisationError)?,
            message.into()
        );

        let result = self
            .send_raw(vec![], the_message)
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
