import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  InteractionReplyOptions,
  InteractionUpdateOptions
} from 'discord.js';
import { Synth } from 'beepbox/esm/synth/synth';
import { deleteSong, getSong, initDbIfRequired, listSongs, saveSong } from './db';
import { startWebsocketServer } from './websocket';

import dotenv from 'dotenv';
dotenv.config();

const token = process.env['DISCORD_BOT'];
const adminUser = process.env['DISCORD_ADMIN_USER'];
const channelId = process.env['DISCORD_CHANNEL_ID'];

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Ready! Logged in as ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.channelId !== channelId) return;
  if (interaction.commandName !== 'song') return;

  if (interaction.options.getSubcommand(true) === 'save') {
    const shortname = interaction.options.getString('shortname', true);
    const base64File = interaction.options.getAttachment('base64', true);
    const response = await fetch(base64File.url);
    if (response.status !== 200) {
      await interaction.reply({ content: `Error saving ${shortname}!` });
      return;
    }
    const base64 = (await response.text())
      .replace('https://www.beepbox.co/#', '')
      .replace('https://jummb.us/#', '')
      .trim();
    try {
      // TODO: try to parse
      new Synth(base64);
      await saveSong(shortname, interaction.user.username, base64);
    } catch {
      await interaction.reply({
        content: `Error saving ${shortname}, please copy + paste the entire beepbox link in your attachment`
      });
      return;
    }

    await interaction.reply({ content: `Successfully saved ${shortname}!` });
  }

  if (interaction.options.getSubcommand(true) === 'list') {
    try {
      const result = await listSongs();
      let page = interaction.options.getNumber('page', false) || 1;
      const maxpage = Math.ceil(result.length / 10);
      if (page < 1 || page > maxpage) {
        await interaction.reply({
          content: `Invalid page number, must be between 1 and ${maxpage}`,
          ephemeral: true
        });
        return;
      }

      const pageEmbed = new EmbedBuilder().setFooter({ text: `Page ${page} of ${maxpage}` });
      const prev = new ButtonBuilder()
        .setCustomId('prev')
        .setLabel('◀')
        .setStyle(ButtonStyle.Primary);
      const next = new ButtonBuilder()
        .setCustomId('next')
        .setLabel('▶')
        .setStyle(ButtonStyle.Primary);
      const row = new ActionRowBuilder().addComponents(prev, next);

      result.slice((page - 1) * 10, page * 10).forEach((entry) => {
        pageEmbed.addFields({ name: '', value: `${entry.shortname} (by ${entry.user})` });
      });

      prev.setDisabled(page == 1);
      next.setDisabled(page == maxpage);

      await interaction.reply({
        embeds: [pageEmbed],
        components: [row]
      } as InteractionReplyOptions);
      const message = await interaction.fetchReply();
      const collector = message.createMessageComponentCollector({ time: 60000 });

      collector.on('collect', async (btn) => {
        // re-aquire songs so new changes are reflected
        const result = await listSongs();
        const maxpage = Math.ceil(result.length / 10);
        if (btn.user.id !== interaction.user.id)
          return btn.reply({ content: 'Not the intended user', ephemeral: true });

        if (btn.customId === 'prev' && page > 1) page--;
        else if (btn.customId === 'next' && page < maxpage) page++;

        prev.setDisabled(page == 1);
        next.setDisabled(page == maxpage);

        const pageEmbed = new EmbedBuilder().setFooter({ text: `Page ${page} of ${maxpage}` });
        result.slice((page - 1) * 10, page * 10).forEach((entry) => {
          pageEmbed.addFields({ name: '', value: `${entry.shortname} (by ${entry.user})` });
        });
        await btn.update({ embeds: [pageEmbed], components: [row] } as InteractionUpdateOptions);
      });

      collector.on('end', () => interaction.editReply({ components: [] }));
    } catch {
      await interaction.reply({ content: `Error listing songs` });
      return;
    }
  }

  if (interaction.options.getSubcommand(true) === 'delete') {
    const shortname = interaction.options.getString('shortname', true);
    const song = await getSong(shortname);
    if (!song) {
      await interaction.reply({ content: `Error deleting ${shortname}`, ephemeral: true });
      return;
    }

    if (song.user !== interaction.user.username && interaction.user.username !== adminUser) {
      await interaction.reply({ content: `You can't delete ${shortname}`, ephemeral: true });
      return;
    }

    try {
      await deleteSong(shortname);
    } catch {
      await interaction.reply({ content: `Error deleting ${shortname}` });
      return;
    }

    await interaction.reply({ content: `Deleted ${shortname}` });
  }

  try {
    await initDbIfRequired();
  } catch (e) {
    console.warn(e);
  }
});

startWebsocketServer();
client.login(token);
