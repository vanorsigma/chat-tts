use rouille::{Response, Server};
use tokio::{runtime::Runtime, task::JoinHandle};
use tokio_util::sync::CancellationToken;

pub struct CatWebServer {
    pub handle: JoinHandle<()>,
}

impl CatWebServer {
    pub fn new<
        S: AsRef<str>,
        F: AsyncFn(String) -> Option<String> + std::marker::Sync + std::marker::Send + 'static,
    >(
        callback: F,
        cancellation: CancellationToken,
    ) -> Self {
        let runtime = Runtime::new().expect("can create a runtime");

        let server = Server::new("localhost:9123", move |request| {
            let message = match request.get_param("message") {
                Some(m) => m,
                None => {
                    log::warn!("Message field is empty");
                    return Response::text("Message field is empty").with_status_code(400);
                }
            };

            Response::text(match runtime.block_on(callback(message)) {
                Some(t) => t,
                None => return Response::text("Guh").with_status_code(500),
            })
            .with_status_code(200)
            .with_no_cache()
            .with_additional_header("Access-Control-Allow-Origin", "*")
        })
        .expect("can create server");
        let (server_handle, server_sender) = server.stoppable();

        let cancelled_child_token = cancellation.child_token();
        let handle = tokio::task::spawn(async move {
            cancelled_child_token.cancelled().await;
            let _ = server_sender.send(());
            let _ = server_handle.join();
        });

        CatWebServer { handle }
    }
}
