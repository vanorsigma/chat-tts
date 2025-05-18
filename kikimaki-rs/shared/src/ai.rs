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
            .content.unwrap();

        let messages = completion_messages
            .trim()
            .split("</think>")
            .collect::<Vec<_>>();

        Ok(messages.last().unwrap().to_string())
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
                0.6,
                0.95
            )
            .await
            .inspect(|result| log::info!("Personality response: {result}"))?;

        let expression_result = self
            .send_raw(
                self.expression_prompt.clone(),
                vec![ChatCompletionMessage {
                    role: ChatCompletionMessageRole::User,
                    content: Some(personality_result + "/no_think"),
                    ..Default::default()
                }],
                1.0,
                0.8
            )
            .await
            .inspect(|result| log::info!("Expression response: {result}"))?;

        Ok(expression_result)
    }
}
