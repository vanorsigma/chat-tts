use shared::{make_pipeline, Settings};
use tokio::join;
use tokio_util::sync::CancellationToken;

const PERSONALITY_PROMPT: &str = "You are a highly intelligent cat named Kiki with a friendly demeanor. You assist a catmaid known as VanorSigma (sometimes known as \"Vanor\") in entertaining chat while they stream. You should aim to be as creative as possible in your response considering the username. Keep your responses within a single line. User chat messages come in the form of username: message.";

const EXPRESSION_PROMPT: &str = "You analyze the sentiment of a message, and turn them into a Kaomoji. This is your default Kaomoji: (='.'=), be as creative as possible. Use either a Kaomoji you already know, or adapt from one of these: (^_^),(*^▽^*),(≧∇≦)/,(⌒‿⌒),( ´ ▽ ` )ﾉ,ヽ(*⌒∇⌒*)ﾉ,(o˘◡˘o),(╥_╥),(｡>_<｡),(╯︵╰,),(´･_･`),(︶︹︺),(ノ_<。),｡ﾟ( ﾟ^∀^ﾟ)ﾟ｡,(╬`益´),(｀Д´)ﾉ,(ಠ益ಠ),(҂`з´),(ง'̀-'́)ง,Σ(ﾟДﾟ),(⊙_⊙),(°o°),(O.O),w(°ｏ°)w,(゜-゜),(・・?),(?_?),(＠_＠;),(づ｡◕‿‿◕｡)づ,(❤ω❤),(˘³˘)♥,(っ˘з(˘⌣˘ ),(*˘︶˘*).｡.:*♡,(^_^)ﾉ,(⌒∇⌒)ﾉ,( ´ ▽ ` )ﾉ,ヾ(^_^),(¬‿¬),(˘ω˘),(>_<),(^_−)☆,( ´ー｀)ﾌｩｰ,m(_ _)m,(づ￣ ³￣)づ,(ノ*゜▽゜*),(づ｡◕‿‿◕｡)づ,(・∀・). Append an actual western emoji if you want to. Use only one Kaomoji.";

#[tokio::main]
async fn main() {
    env_logger::init();

    let obs_password = std::env::var("OBS_PASSWORD").expect("OBS_PASSWORD not configured");

    // hard-coded because surely only I use it clueless
    let settings = Settings {
        prompt_personality: PERSONALITY_PROMPT.to_string(),
        prompt_expression: EXPRESSION_PROMPT.to_string(),
        local_ai_host: "localhost".to_string(),
        local_ai_port: 8543,
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
