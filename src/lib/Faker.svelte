<script lang="ts">
  import type { ChatMessage, ChatUser } from '@twurple/chat';

  let message = '';
  export let onSend: (arg0: ChatMessage) => void;

  function handleSend() {
    onSend({
      userInfo: {
        id: '12345678',
        displayName: 'Faker',
        userName: 'faker',
        color: '#000000',
        emotes: new Map()
      } as any as ChatUser,
      text: message
    } as any as ChatMessage);
    message = '';
  }
</script>

<div>
  <input
    type="text"
    bind:value={message}
    on:keydown={(e) => {
      if (e.key === 'Enter') handleSend();
    }}
    placeholder="Sample Message Here"
  />
  <button on:click={handleSend}>Send Message</button>
</div>

<style>
  div {
    width: 100%;
    display: flex;
    gap: 1em;
  }

  div > input {
    width: 80%;
    padding: 10px;
    border: 1px solid #ccc;
    border-radius: 5px;
  }
</style>
