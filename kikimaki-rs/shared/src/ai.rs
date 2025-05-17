use openai::{
    Credentials, OpenAiError,
    chat::{ChatCompletion, ChatCompletionMessage, ChatCompletionMessageRole},
};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AiError {
    #[error("NoMessage, AI did not return any messages")]
    NoMessage,

    #[error("CompletionError: {0}")]
    CompletionError(OpenAiError),

    #[error("shrugeg")]
    Unknown,
}

const MODEL_NAME: &str = "Qwen3-1.7B-Q_0";

pub struct Ai {
    credentials: Credentials,
    personality_prompt: String,
    expression_prompt: String,
}

impl Ai {
    pub async fn new(
        host: impl Into<String> + std::fmt::Display,
        port: u16,
        personality_prompt: impl Into<String>,
        expression_prompt: impl Into<String>,
    ) -> Self {
        let credentials = Credentials::new("", format!("http://{host}:{port}"));
        Self {
            credentials,
            personality_prompt: personality_prompt.into(),
            expression_prompt: expression_prompt.into(),
        }
    }

    async fn send_raw(
        &self,
        prompt: impl Into<String>,
        history: impl Into<Vec<ChatCompletionMessage>>,
    ) -> Result<String, AiError> {
        let mut messages = vec![ChatCompletionMessage {
            role: ChatCompletionMessageRole::System,
            content: Some(prompt.into().to_string()),
            ..Default::default()
        }];
        messages.append(&mut history.into());

        let chat_completion = ChatCompletion::builder(MODEL_NAME, messages.clone())
            .credentials(self.credentials.clone())
            .create()
            .await
            .map_err(AiError::CompletionError)?;

        let message = chat_completion
            .choices
            .first()
            .ok_or(AiError::NoMessage)?
            .message
            .clone();
        Ok(message
            .content
            .unwrap()
            .trim()
            .split("</think>")
            .collect::<Vec<_>>()[1]
            .trim()
            .to_string())
    }

    pub async fn send(&self, message: impl Into<String> + Clone) -> Result<String, AiError> {
        let personality_result = self
            .send_raw(
                self.personality_prompt.clone(),
                vec![ChatCompletionMessage {
                    role: ChatCompletionMessageRole::User,
                    content: Some(message.clone().into()),
                    ..Default::default()
                }],
            )
            .await
            .inspect(|result| log::info!("Personality response: {result}"))?;

        let expression_result = self
            .send_raw(
                self.expression_prompt.clone(),
                vec![ChatCompletionMessage {
                    role: ChatCompletionMessageRole::User,
                    content: Some(personality_result),
                    ..Default::default()
                }],
            )
            .await
            .inspect(|result| log::info!("Expression response: {result}"))?;

        Ok(expression_result)
    }
}
