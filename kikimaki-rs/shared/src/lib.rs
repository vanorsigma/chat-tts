use thiserror::Error;
use tokio::task::JoinHandle;
use tokio_util::sync::CancellationToken;

pub mod ai;
pub mod memory;
pub mod webserver;

#[derive(Debug, Error)]
pub enum PipelineError {
    #[error("general pipeline error {0}")]
    General(Box<dyn std::error::Error>),
}

pub struct Settings {
    /// System Prompt
    pub system_prompt: String,

    /// Local AI host
    pub local_ai_host: String,

    /// Local AI port
    pub local_ai_port: u16,
}

pub struct Pipeline {
    pub join_handle: JoinHandle<()>,
}

pub async fn make_pipeline(
    settings: Settings,
    cancellation: CancellationToken,
) -> Result<Pipeline, PipelineError> {
    let ai = ai::Ai::new(settings.local_ai_host, settings.local_ai_port).await;

    let webserver = webserver::CatWebServer::new::<String, _>(
        async move |message| match ai.send(message, settings.system_prompt.clone()).await {
            Ok(a) => {
                log::debug!("Ai response was {a}");
                Some(a)
            }
            Err(e) => {
                log::error!("Error while prompting AI: {e}");
                None
            }
        },
        cancellation.child_token(),
    );

    Ok(Pipeline {
        join_handle: webserver.handle,
    })
}
