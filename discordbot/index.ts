import { Client, Events, GatewayIntentBits } from 'discord.js';
import { Synth } from "beepbox";
import { initDbIfRequired, listSongs, saveSong } from './db';

const token = process.env['DISCORD_BOT'];
// const channelId = process.env['DISCORD_CHANNEL_ID']; // TODO: use env
const channelId = "1330568746124709990";

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, readyClient => {
  console.log(`Ready! Logged in as ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.channelId !== channelId) return;

  if (interaction.commandName === 'savesong') {
    const shortname = interaction.options.getString("shortname", true);
    const base64File = interaction.options.getAttachment("base64", true);
    const response = await fetch(base64File.url);
    if (response.status !== 200) {
      await interaction.reply({ content: `Error saving ${shortname}!` });
      return;
    }
    const base64 = (await response.text()).replace("https://www.beepbox.co/#", "");
    try {
      // TODO: try to parse
      new Synth(base64);
      await saveSong(shortname, interaction.user.username, base64);
    } catch {
      await interaction.reply({ content: `Error saving ${shortname}, please copy + paste the entire beepbox link in your attachment` });
      return;
    }

    await interaction.reply({ content: `Successfully saved ${shortname}!` });
  }

  if (interaction.commandName === 'listsongs') {
    try {
      const result = await listSongs();
      const shortnames = result.map(entry => `- ${entry.shortname} (by ${entry.user})`).join('\n');
      await interaction.reply({ content: shortnames, allowedMentions: { parse: [] } });
    } catch {
      await interaction.reply({ content: `Error listing songs` });
      return;
    }
  }
});

try {
  await initDbIfRequired();
} catch (e) {
  console.warn(e);
}

client.login(token);
