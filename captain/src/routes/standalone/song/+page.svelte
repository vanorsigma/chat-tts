<script lang="ts">
  import { LocalSongController } from '$lib/controller';

  let controller = new LocalSongController();
  let ws: WebSocket | undefined;

  let wsUrl = '';
  let currentlyPlaying = '';
  let connectionStatus = 'Disconnected';

  function handleWebSocketMessage(event: MessageEvent) {
    const data = JSON.parse(event.data);
    switch (data.type) {
      case 'play':
        controller.playSong(data.songname).then((result) => {
          if (result) {
            currentlyPlaying = data.songname;
          }
        });
        break;
      case 'cancel':
        controller.cancelSong();
        break;
      case 'changeSpeed':
        controller.changeSpeed(data.speed);
        break;
      default:
        console.warn('Unknown message type', data.type);
    }
  }

  function onConnectClick() {
    if (ws) {
      ws.close();
    }

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      connectionStatus = 'Connected';
      console.log('Connected to WebSocket');
    };
    ws.onmessage = (event) => {
      handleWebSocketMessage(event);
    };
    ws.onclose = () => {
      connectionStatus = 'Disconnected';
      console.log('Disconnected from WebSocket');
    };
  }
</script>

<section>
  <h2>Standalone Song Controller</h2>
  <p>This page is a off-mains song controller. Please connect to the receiver websocket.</p>
  <input type="text" bind:value={wsUrl} placeholder="WebSocket URL here" />
  <button on:click={onConnectClick}>Connect</button>
  <p>
    Connection Status: <span>{connectionStatus}</span>
  </p>
  <p>Last played: <span>{currentlyPlaying}</span></p>
</section>
