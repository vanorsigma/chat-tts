use thiserror::Error;
use tokio::select;
use tokio::sync::broadcast::{self, Receiver};
use tokio::sync::mpsc::UnboundedReceiver;
use tokio::task::JoinHandle;
use tokio_util::sync::CancellationToken;
use twitch_irc::TwitchIRCClient;
use twitch_irc::login::StaticLoginCredentials;
use twitch_irc::message::ServerMessage;
use twitch_irc::{ClientConfig, SecureTCPTransport};

#[derive(Debug, Error)]
pub enum TwitchIRCError {
    #[error("unknown twitch irc error")]
    Unknown
}

pub struct TwitchIRCSpawner;

pub struct TwitchIRCConnection {
    pub handle: JoinHandle<()>,
    rx: Receiver<TwitchIRCMessage>,
}

#[derive(Clone)]
pub struct TwitchIRCMessage {
    pub username: String,
    pub message: String,
}

impl TwitchIRCSpawner {
    pub async fn connect<S: AsRef<str> + std::marker::Send + 'static>(
        target: S,
        cancellation: CancellationToken,
    ) -> TwitchIRCConnection {
        let config = ClientConfig::default();
        let (incoming_messages, client) =
            TwitchIRCClient::<SecureTCPTransport, StaticLoginCredentials>::new(config);
        TwitchIRCConnection::new(incoming_messages, client, cancellation, target)
    }
}

impl TwitchIRCConnection {
    fn new<
        A: twitch_irc::transport::Transport,
        B: twitch_irc::login::LoginCredentials,
        S: AsRef<str> + std::marker::Send + 'static,
    >(
        mut incoming_message: UnboundedReceiver<ServerMessage>,
        client: TwitchIRCClient<A, B>,
        cancellation: CancellationToken,
        target: S,
    ) -> Self {
        let (tx, rx) = broadcast::channel(100);
        let join_handle = tokio::task::spawn(async move {
            log::debug!("Trying to join channel {}...", target.as_ref().to_owned());
            if let Err(e) = client.join(target.as_ref().to_owned()) {
                log::error!("Error while joining channel: {e}");
            }

            loop {
                select! {
                    Some(message) = incoming_message.recv() => {
                        log::debug!("Aquired {message:#?}");
                        if let ServerMessage::Privmsg(msg) = message {
                            log::debug!("Processing it as {msg:#?}");
                            let _ = tx.send(TwitchIRCMessage {
                                username: msg.sender.name.to_string(),
                                message: msg.message_text.to_string(),
                            });
                        }
                    }

                    _ = cancellation.cancelled() => {
                        break
                    }
                }
            }
        });

        TwitchIRCConnection {
            handle: join_handle,
            rx,
        }
    }

    pub fn subscribe(&self) -> Receiver<TwitchIRCMessage> {
        self.rx.resubscribe()
    }
}
