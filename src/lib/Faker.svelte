<script lang="ts">
  import tmi from 'tmi.js';
  let message = '';
  export let onSend: (arg0: tmi.ChatUserstate, arg1: string) => void;

  function handleSend() {
    onSend(
      {
        id: '12345678',
        'display-name': 'Faker',
        username: 'faker',
        color: '#000000',
        emotes: {}
      },
      message
    );
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
