<script lang="ts">
  let chatMsg = '';
  let chatUser = '';
  let subUser = '';
  let subTier: number = 1;
  let bitsUser = '';
  let bitsAmount = 100;

  type Tab = 'chat' | 'sub' | 'bits';
  let activeTab: Tab = 'chat';

  export let onFakerChat: (text: string, username: string) => void;
  export let onFakerSub: (username: string, tier: number) => void;
  export let onFakerBits: (username: string, amount: number) => void;

  function sendChat() {
    onFakerChat(chatMsg, chatUser);
    chatMsg = '';
  }

  function sendSub() {
    onFakerSub(subUser, subTier);
  }

  function sendBits() {
    onFakerBits(bitsUser, bitsAmount);
  }
</script>

<div class="faker-container">
  <div class="tabs">
    <button class:active={activeTab === 'chat'} on:click={() => activeTab = 'chat'}>
      Chat
    </button>
    <button class:active={activeTab === 'sub'} on:click={() => activeTab = 'sub'}>
      Sub
    </button>
    <button class:active={activeTab === 'bits'} on:click={() => activeTab = 'bits'}>
      Bits
    </button>
  </div>

  {#if activeTab === 'chat'}
    <div class="row">
      <input
        type="text"
        bind:value={chatUser}
        on:keydown={(e) => { if (e.key === 'Enter') sendChat(); }}
        placeholder="Username (optional)"
      />
      <input
        type="text"
        bind:value={chatMsg}
        on:keydown={(e) => { if (e.key === 'Enter') sendChat(); }}
        placeholder="Sample Message Here"
      />
      <button on:click={sendChat}>Send Message</button>
    </div>
  {/if}

  {#if activeTab === 'sub'}
    <div class="row">
      <input
        type="text"
        bind:value={subUser}
        on:keydown={(e) => { if (e.key === 'Enter') sendSub(); }}
        placeholder="Username (optional)"
      />
      <select bind:value={subTier}>
        <option value={1}>Tier 1</option>
        <option value={2}>Tier 2</option>
        <option value={3}>Tier 3</option>
      </select>
      <button on:click={sendSub}>Send Sub</button>
    </div>
  {/if}

  {#if activeTab === 'bits'}
    <div class="row">
      <input
        type="text"
        bind:value={bitsUser}
        on:keydown={(e) => { if (e.key === 'Enter') sendBits(); }}
        placeholder="Username (optional)"
      />
      <input
        type="number"
        bind:value={bitsAmount}
        on:keydown={(e) => { if (e.key === 'Enter') sendBits(); }}
        placeholder="Bits amount"
      />
      <button on:click={sendBits}>Send Bits</button>
    </div>
  {/if}
</div>

<style>
  .faker-container {
    width: 100%;
  }

  .tabs {
    display: flex;
    gap: 0.5em;
    margin-bottom: 0.5em;
  }

  .tabs button {
    flex: 1;
    padding: 4px 8px;
    border: 1px solid #ccc;
    border-radius: 4px;
    background: #eee;
    cursor: pointer;
  }

  .tabs button.active {
    background: #4a90d9;
    color: #fff;
    border-color: #4a90d9;
  }

  .row {
    width: 100%;
    display: flex;
    gap: 1em;
  }

  .row > input, .row > select {
    padding: 10px;
    border: 1px solid #ccc;
    border-radius: 5px;
  }

  .row > select {
    min-width: 100px;
  }

  .row > input:first-child {
    width: 30%;
  }

  .row > input:nth-child(2) {
    flex: 1;
  }

  .row > input[type="number"] {
    width: 100px;
  }
</style>
