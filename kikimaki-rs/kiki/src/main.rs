use shared::{make_pipeline, Settings};
use rand;
use tokio::join;
use tokio_util::sync::CancellationToken;

const PROMPT: &str = "You are a highly intelligent cat named Kiki with a friendly demeanor. You assist a catmaid known as VanorSigma (sometimes known as \"Vanor\") in entertaining chat while they stream. However, you can only react with one-line ASCII cat faces. This is your default face: (='.'=). You should aim to be as creative as possible in your response, using emojis if you need to. However, you cannot reply with text. If you want to animate your responses, leave a new line per cat face. Chat messages come in the form of <username>: <message>";

#[tokio::main]
async fn main() {
    env_logger::init();

    let api_key = std::env::var("API_KEY").expect("API_KEY not configured");
    let obs_password = std::env::var("OBS_PASSWORD").expect("OBS_PASSWORD not configured");

    // hard-coded because surely only I use it clueless
    let settings = Settings {
        google_api_key: api_key,
        google_prompt: PROMPT.to_string(),
        obs_host: "localhost".to_string(),
        obs_port: 4455,
        obs_password,
        obs_source_name: "kikichatter".to_string(),
        obs_animation_duration: 200,
        twitch_target: "vanorsigma".to_string(),
        twitch_message_to_string: |message| {
            let num: f32 = rand::random();
            if message.message.contains("kiki") || num < 0.5 {
                format!("{0}: {1}", message.username, message.message).into()
            } else {
                None
            }
        },
        default_cat_face: "(='.'=)".to_string()
    };

    let cancellation = CancellationToken::new();
    let pipeline = make_pipeline(settings, cancellation.child_token()).await.expect("can create pipline");
    log::info!("Created pipeline.");

    tokio::signal::ctrl_c().await.expect("can await for ctrl+c");
    cancellation.cancel();
    log::info!("Cancelled.");
    let _ = join!(pipeline.join_handle);
}
