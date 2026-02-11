use std::sync::Arc;

use serde::{Deserialize, Serialize};
use thiserror::Error;
use tokio::{
    fs::File,
    io::{AsyncReadExt, AsyncWriteExt},
};

#[derive(Serialize, Deserialize, Debug)]
#[repr(transparent)]
pub struct Memories(pub Vec<String>);

#[derive(Debug, Error)]
pub enum MemoryBackendError {
    #[error("Memory Saving IO Error: {0}")]
    SaveMemoriesIOError(tokio::io::Error),

    #[error("Memories Serialisation Error: {0}")]
    SaveMemoriesSerialisationError(serde_json::Error),

    #[error("Memory Loading IO Error: {0}")]
    LoadMemoryIOError(tokio::io::Error),

    #[error("Memory Deserialisation Error: {0}")]
    LoadMemoriesDeserialisationError(serde_json::Error),

    #[error("Memory Backend Error")]
    Unknown,
}

pub struct MemoryBackend {
    filename: Arc<String>,
}

impl MemoryBackend {
    pub fn new(filename: String) -> Self {
        MemoryBackend {
            filename: Arc::new(filename),
        }
    }

    pub async fn save_memories(&self, memories: Memories) -> Result<(), MemoryBackendError> {
        let mut file = File::create(self.filename.as_ref())
            .await
            .map_err(MemoryBackendError::SaveMemoriesIOError)?;

        file.write_all(
            serde_json::to_string(&memories)
                .map_err(MemoryBackendError::SaveMemoriesSerialisationError)?
                .as_bytes(),
        )
        .await
        .map_err(MemoryBackendError::SaveMemoriesIOError)?;

        Ok(())
    }

    pub async fn load_memories(&self) -> Result<Memories, MemoryBackendError> {
        let mut file = File::open(self.filename.as_ref())
            .await
            .map_err(MemoryBackendError::LoadMemoryIOError)?;

        let mut contents = String::new();
        file.read_to_string(&mut contents)
            .await
            .map_err(MemoryBackendError::LoadMemoryIOError)?;

        let memories: Memories = serde_json::from_str(&contents)
            .map_err(MemoryBackendError::LoadMemoriesDeserialisationError)?;
        Ok(memories)
    }
}
