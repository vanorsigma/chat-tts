use shared::{make_pipeline, Settings};
use tokio::join;
use tokio_util::sync::CancellationToken;

#[tokio::main]
async fn main() {
    env_logger::init();

    // hard-coded because surely only I use it clueless
    // NOTE: kiki's prompt is already in modelfile, so we don't need to send it
    // all the time. plus llama.cpp does prefix, so this is like good for us
    let settings = Settings {
        local_ai_host: "localhost".to_string(),
        local_ai_port: 11434,
    };

    let cancellation = CancellationToken::new();
    let pipeline = make_pipeline(settings, cancellation.child_token()).await.expect("can create pipline");
    log::info!("Created pipeline.");

    tokio::signal::ctrl_c().await.expect("can await for ctrl+c");
    cancellation.cancel();
    log::info!("Cancelled.");
    let _ = join!(pipeline.join_handle);
}
