<script lang="ts">
  import type { FullConfig } from './config';

  export let config: FullConfig;
</script>

<div>
  <p>
    <b>Channel Name:</b>&nbsp;{config.channelName}
  </p>

  <div>
    <b>Voices:</b>
    <ul>
      {#each config.voices as voice}
        <li>{voice}</li>
      {/each}
    </ul>
  </div>

  <p>
    <b>Pitch Range:</b>&nbsp;{config.pitchRange.minimum} - {config.pitchRange.maximum}
  </p>

  <p>
    <b>Rate Range:</b>&nbsp;{config.rateRange.minimum} - {config.rateRange.maximum}
  </p>
</div>
