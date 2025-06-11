use std::sync::Arc;

use rouille::{Response, Server};
use tokio::{sync::RwLock, task::JoinHandle};
use tokio_util::sync::CancellationToken;

const TEMPLATE_HTML: &str = "{FACE}";

pub struct CatWebServer {
    face_arc: Arc<RwLock<String>>,
    pub handle: JoinHandle<()>,
}

impl CatWebServer {
    pub async fn update_face<S: AsRef<str>>(&self, new_face: S) {
        let mut write_guard = self.face_arc.write().await;
        *write_guard = new_face.as_ref().to_string();
    }

    pub fn new<S: AsRef<str>>(default_face: S, cancellation: CancellationToken) -> Self {
        let face = default_face.as_ref().to_string();
        let face_arc = Arc::new(RwLock::new(face));

        let face_arc_handle_clone = face_arc.clone();
        let server = Server::new("localhost:9123", move |_request| {
            let read_guard = face_arc_handle_clone.blocking_read();
            let current_rendered_html = TEMPLATE_HTML.replace(
                "{FACE}",
                html_escape::encode_safe(&read_guard.to_string()).as_ref(),
            );
            Response::text(current_rendered_html).with_additional_header("Access-Control-Allow-Origin", "*")
        })
        .expect("can create server");
        let (server_handle, server_sender) = server.stoppable();

        let cancelled_child_token = cancellation.child_token();
        let handle = tokio::task::spawn(async move {
            cancelled_child_token.cancelled().await;
            let _ = server_sender.send(());
            let _ = server_handle.join();
        });

        CatWebServer { face_arc, handle }
    }
}
