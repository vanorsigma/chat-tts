use obws::{
    Client,
    requests::inputs::{InputId, SetSettings},
};
use serde::Serialize;
use thiserror::Error;
use tokio::{select, sync::broadcast::Receiver, task::JoinHandle};
use tokio_util::sync::CancellationToken;

pub struct ObsController {
    client: Client,
}

#[derive(Debug, Error)]
pub enum ObsControllerError {
    #[error("cannot find scene name {0}")]
    NoSceneName(String),

    #[error("unknown obs controller error")]
    Unknown(obws::error::Error),
}

#[derive(Serialize)]
struct ObsTextChangeSettings {
    text: String,
}

impl ObsController {
    pub async fn new<S1: AsRef<str>, S2: AsRef<str>>(
        host: S1,
        port: u16,
        password: S2,
    ) -> Result<ObsController, ObsControllerError> {
        Ok(ObsController {
            client: Client::connect(host.as_ref(), port, Some(password.as_ref()))
                .await
                .map_err(|e| ObsControllerError::Unknown(e))?,
        })
    }

    pub async fn update_from_message<S1: AsRef<str>, S2: AsRef<str>>(
        &self,
        source_name: S1,
        msg: S2,
    ) -> Result<(), ObsControllerError> {
        // search for the source name in all scenes
        for scene in self
            .client
            .scenes()
            .list()
            .await
            .map_err(|e| ObsControllerError::Unknown(e))?
            .scenes
        {
            let scene_item = match self
                .client
                .scene_items()
                .list(scene.id.into())
                .await
                .map_err(|e| ObsControllerError::Unknown(e))?
                .iter()
                .find(|item| item.source_name == source_name.as_ref())
            {
                Some(scene) => scene,
                None => continue,
            }
            .source_name
            .to_string();

            return self
                .client
                .inputs()
                .set_settings(SetSettings {
                    input: InputId::Name(&scene_item.to_string()),
                    settings: &ObsTextChangeSettings {
                        text: msg.as_ref().to_string(),
                    },
                    overlay: None,
                })
                .await
                .map_err(|e| ObsControllerError::Unknown(e));
        }

        Err(ObsControllerError::NoSceneName(
            source_name.as_ref().to_string(),
        ))
    }

    pub async fn update_from_receiver<
        T: Clone + AsRef<str> + std::marker::Send + 'static,
        S: AsRef<str> + std::marker::Send + 'static,
    >(
        self,
        mut receiver: Receiver<T>,
        source_name: S,
        cancellation: CancellationToken,
    ) -> JoinHandle<()> {
        tokio::task::spawn(async move {
            loop {
                select! {
                    Ok(message) = receiver.recv() => {
                        if let Err(ObsControllerError::Unknown(e)) = self
                        .update_from_message(source_name.as_ref(), message.to_owned().as_ref())
                        .await
                        {
                            log::error!("Can't update OBS scene due to {e}");
                        }
                    }

                    _ = cancellation.cancelled() => {
                        break;
                    }
                }
            }
        })
    }
}
