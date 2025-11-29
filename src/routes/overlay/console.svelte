<script lang="ts">
  export let terminalOutput = [];
  export let terminalLine = '';
</script>

<div style="height: 1080px; width: 1920px;">
  <div class="terminal">
    <div class="terminal-output">
      {#each terminalOutput as output}
        <p>{output}</p>
      {/each}
    </div>

    <p class="terminal-line">&gt;{terminalLine}</p>
  </div>
</div>

<style>
  .terminal {
    display: flex;
    flex-direction: column;
    gap: 5px;

    width: 300px;
    max-height: 50vh;
  }

  .terminal-output {
    background-color: rgba(0, 0, 0, 0.8);
    color: white;
    flex: 0 0 40vh;
    padding-left: 5px;
    padding-right: 5px;
    overflow-y: scroll;
  }

  .terminal-output p {
    margin: 0;
  }

  .terminal-line {
    background-color: rgba(0, 0, 0, 0.8);
    color: white;
    flex: 0 0 0px;
    padding-left: 5px;
    padding-right: 5px;
  }
</style>
