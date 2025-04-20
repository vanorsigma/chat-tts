use thiserror::Error;
use tokio::{
    join, select,
    task::{JoinHandle, JoinSet},
};
use tokio_util::sync::CancellationToken;

pub mod ai;
pub mod obs;
pub mod twitch;
pub mod webserver;

#[derive(Debug, Error)]
pub enum PipelineError {
    #[error("general pipeline error {0}")]
    General(Box<dyn std::error::Error>),
}

pub struct Settings<F: Fn(twitch::TwitchIRCMessage) -> Option<String>> {
    /// Google Generative AI API Key
    pub google_api_key: String,

    /// Prompt to use
    pub google_prompt: String,

    /// OBS Host
    pub obs_host: String,

    /// OBS Port
    pub obs_port: u16,

    /// OBS Password
    pub obs_password: String,

    /// OBS Source to update
    pub obs_source_name: String,

    /// OBS Animation duration in millis
    pub obs_animation_duration: u64,

    /// Twitch IRC target channel
    pub twitch_target: String,

    /// Twitch Message -> Option<String> converter.
    /// If this function returns None, then the pipeline does not proceed with the message
    pub twitch_message_to_string: F,

    /// Default face
    pub default_cat_face: String,
}

pub struct Pipeline {
    pub join_handle: JoinHandle<()>,
}

pub async fn make_pipeline<
    F: Fn(twitch::TwitchIRCMessage) -> Option<String> + std::marker::Send + 'static,
>(
    settings: Settings<F>,
    cancellation: CancellationToken,
) -> Result<Pipeline, PipelineError> {
    let twitch =
        twitch::TwitchIRCSpawner::connect(settings.twitch_target, cancellation.child_token()).await;
    let mut twitch_rx = twitch.subscribe();

    let ai = ai::Ai::new(settings.google_api_key, settings.google_prompt);

    let webserver =
        webserver::CatWebServer::new(settings.default_cat_face, cancellation.child_token());

    let obscontroller =
        obs::ObsController::new(settings.obs_host, settings.obs_port, settings.obs_password)
            .await
            .map_err(|e| PipelineError::General(e.into()))?;

    let join_handle = tokio::task::spawn(async move {
        loop {
            select! {
                Ok(message) = twitch_rx.recv() => {
                    if let Some(result) = (settings.twitch_message_to_string)(message) {
                        match ai.send(result.clone()).await {
                            Ok(ai_response) => {
                                log::debug!("Ai response was {ai_response}");
                                webserver.update_face(ai_response).await;
                                let _ = obscontroller.update_from_message(
                                    &settings.obs_source_name.clone(),
                                    result
                                ).await;
                            }

                            Err(e) => log::error!("Error while prompting AI: {e}")
                        }
                    }
                }

                _ = cancellation.cancelled() => break
            }
        }

        twitch.handle.await.unwrap();
    });

    Ok(Pipeline { join_handle })
}

#[cfg(test)]
mod tests {}
