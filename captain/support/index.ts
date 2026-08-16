import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  GuildMember,
  InteractionReplyOptions,
  InteractionUpdateOptions,
  MessageFlags,
  TextChannel,
  type APIInteractionGuildMember,
  type ChatInputCommandInteraction
} from 'discord.js';
import { Synth } from 'beepbox/esm/synth/synth';
import {
  deleteFont,
  deletePendingFont,
  deleteSong,
  getFont,
  getPendingFont,
  getSong,
  initDbIfRequired,
  listFonts,
  listPendingFonts,
  listSongs,
  saveApprovedFont,
  savePendingFont,
  saveSong,
  updatePendingFontMessageId
} from '../src/lib/server/db';
import { startWebsocketServer } from './websocket';
import { startPicomService } from './picom';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { randomUUID } from 'crypto';
import * as fsSync from 'fs';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import dotenv from 'dotenv';
dotenv.config();

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});

const token = process.env['DISCORD_BOT'];
const adminUser = process.env['DISCORD_ADMIN_USER'];
const songChannelId = process.env['DISCORD_SONG_CHANNEL_ID'];
const fontChannelId = process.env['DISCORD_FONT_CHANNEL_ID'];
const fontApproveRoleId = process.env['DISCORD_FONT_APPROVE_ROLE_ID'];
const fontUserId = process.env['DISCORD_FONT_USER_ID'];

const FONT_PREVIEW_TEXT = 'The Quick Brown Fox Jumps Over The Lazy Dog';
const ALLOWED_FONT_EXTENSIONS = ['.woff2', '.woff', '.ttf', '.otf', '.svg'];
const MAX_FONT_SIZE = 1024 * 1024;
const FONTNAME_PATTERN = /^[a-zA-Z0-9_-]{1,32}$/;
const FONTS_DIR = path.join(process.cwd(), 'fonts');
const APPROVAL_EXPIRY_MS = 5 * 60 * 1000;
const FONT_TMP_DIR = fsSync.mkdtempSync(path.join(os.tmpdir(), 'fontbot-'));

if (!fsSync.existsSync(FONTS_DIR)) {
  console.error(
    'You must launch this script in the root directory of Captain, where ./fonts is accessible.'
  );
  process.exit(0);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Ready! Logged in as ${readyClient.user.tag}`);
});

function getFontExtension(filename: string): string | null {
  const lower = filename.toLowerCase();
  return ALLOWED_FONT_EXTENSIONS.find((ext) => lower.endsWith(ext)) ?? null;
}

function memberHasRole(
  member: GuildMember | APIInteractionGuildMember | null,
  roleId: string
): boolean {
  if (!member) return false;
  if (member instanceof GuildMember) return member.roles.cache.has(roleId);
  return member.roles.includes(roleId);
}

async function renderFontPreview(fontPath: string): Promise<Buffer> {
  const family = `font-preview-${Date.now()}`;
  GlobalFonts.registerFromPath(fontPath, family);
  const canvas = createCanvas(1400, 240);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = `48px ${family}`;
  ctx.fillStyle = '#000000';
  ctx.textBaseline = 'middle';
  ctx.fillText(FONT_PREVIEW_TEXT, 40, canvas.height / 2);
  return canvas.toBuffer('image/png');
}

async function handlePaginatedList<T>(
  interaction: ChatInputCommandInteraction,
  opts: {
    fetchEntries: () => Promise<T[]>;
    formatEntry: (entry: T) => string;
    errorMessage: string;
  }
): Promise<void> {
  try {
    const result = await opts.fetchEntries();
    let page = interaction.options.getNumber('page', false) || 1;
    const maxpage = Math.ceil(result.length / 10);
    if (page < 1 || page > maxpage) {
      await interaction.reply({
        content: `Invalid page number, must be between 1 and ${maxpage}`,
        flags: MessageFlags.Ephemeral
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
      pageEmbed.addFields({ name: '', value: opts.formatEntry(entry) });
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
      // re-fetch so new changes are reflected
      const result = await opts.fetchEntries();
      const maxpage = Math.ceil(result.length / 10);
      if (btn.user.id !== interaction.user.id)
        return btn.reply({ content: 'Not the intended user', flags: MessageFlags.Ephemeral });

      if (btn.customId === 'prev' && page > 1) page--;
      else if (btn.customId === 'next' && page < maxpage) page++;

      prev.setDisabled(page == 1);
      next.setDisabled(page == maxpage);

      const pageEmbed = new EmbedBuilder().setFooter({ text: `Page ${page} of ${maxpage}` });
      result.slice((page - 1) * 10, page * 10).forEach((entry) => {
        pageEmbed.addFields({ name: '', value: opts.formatEntry(entry) });
      });
      await btn.update({ embeds: [pageEmbed], components: [row] } as InteractionUpdateOptions);
    });

    collector.on('end', () => interaction.editReply({ components: [] }));
  } catch {
    await interaction.reply({ content: opts.errorMessage });
    return;
  }
}

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  // not a redundunant check, it's for the list subcommand later
  if (interaction.commandName !== 'song' && interaction.commandName !== 'font') return;

  if (interaction.commandName === 'song') {
    if (interaction.channelId !== songChannelId) {
      await interaction.reply({
        content: 'Please run this command in the appropriate channel.',
        flags: MessageFlags.Ephemeral
      });
      console.log(`Ignored song interaction from channel ${interaction.channelId}`);
      return;
    }

    console.log(
      `Processing song command: ${interaction.options.getSubcommand(true)} from ${interaction.user.username}`
    );

    if (interaction.options.getSubcommand(true) === 'save') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const shortname = interaction.options.getString('shortname', true);
      const base64File = interaction.options.getAttachment('base64', true);
      console.log(`Saving song ${shortname}...`);
      const response = await fetch(base64File.url);
      if (response.status !== 200) {
        console.warn(`Failed to fetch song data for ${shortname}`);
        await interaction.editReply({ content: `Error saving ${shortname}!` });
        return;
      }
      const base64 = (await response.text())
        .replace('https://www.beepbox.co/#', '')
        .replace('https://jummb.us/#', '')
        .trim();
      try {
        new Synth(base64);
        await saveSong(shortname, interaction.user.username, base64);
      } catch {
        console.warn(`Invalid song data for ${shortname}`);
        await interaction.editReply({
          content: `Error saving ${shortname}, please copy + paste the entire beepbox link in your attachment`
        });
        return;
      }

      console.log(`Song ${shortname} saved successfully.`);
      await interaction.editReply({ content: `Successfully saved ${shortname}!` });
    }

    if (interaction.options.getSubcommand(true) === 'list') {
      await handlePaginatedList(interaction, {
        fetchEntries: listSongs,
        formatEntry: (entry) => `${entry.shortname} (by ${entry.user})`,
        errorMessage: 'Error listing songs'
      });
    }

    if (interaction.options.getSubcommand(true) === 'delete') {
      const shortname = interaction.options.getString('shortname', true);
      console.log(`Deleting song ${shortname}...`);
      const song = await getSong(shortname);
      if (!song) {
        console.warn(`Song ${shortname} not found for deletion.`);
        await interaction.reply({
          content: `Error deleting ${shortname}`,
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      if (song.user !== interaction.user.username && interaction.user.username !== adminUser) {
        console.warn(
          `${interaction.user.username} tried to delete ${shortname} (owned by ${song.user})`
        );
        await interaction.reply({
          content: `You can't delete ${shortname}`,
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      try {
        await deleteSong(shortname);
      } catch {
        await interaction.reply({ content: `Error deleting ${shortname}` });
        return;
      }

      console.log(`Song ${shortname} deleted.`);
      await interaction.reply({ content: `Deleted ${shortname}` });
    }
  }

  if (interaction.commandName === 'font') {
    if (interaction.channelId !== fontChannelId) {
      await interaction.reply({
        content: 'Please run this command in the appropriate channel.',
        flags: MessageFlags.Ephemeral
      });
      console.log(`Ignored font interaction from channel ${interaction.channelId}`);
      return;
    }

    console.log(
      `Processing font command: ${interaction.options.getSubcommand(true)} from ${interaction.user.username}`
    );

    if (interaction.options.getSubcommand(true) === 'submit') {
      const fontname = interaction.options.getString('fontname', true).trim().toLowerCase();
      const fontFile = interaction.options.getAttachment('fontfile', true);

      if (!FONTNAME_PATTERN.test(fontname)) {
        await interaction.reply({
          content: `Invalid font name, use letters, numbers, _ or - (max 32 chars)`,
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const ext = getFontExtension(fontFile.name);
      if (!ext) {
        console.warn(
          `Rejected font upload ${fontFile.name} from ${interaction.user.username} because extension is unrecognized.`
        );
        await interaction.reply({
          content: `Invalid font file, must be .woff2, .woff, .ttf, .otf or .svg`,
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      if (fontFile.size > MAX_FONT_SIZE) {
        console.warn(
          `Rejected font upload ${fontFile.name} from ${interaction.user.username} because it was too big.`
        );
        await interaction.reply({
          content: `Font file too large, must be 1MB or smaller`,
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      await interaction.deferReply();

      console.log(`Submitting font ${fontname}...`);
      const response = await fetch(fontFile.url);
      if (response.status !== 200) {
        console.warn(`Failed to fetch font data for ${fontname}`);
        await interaction.followUp({
          content: `Error submitting ${fontname}!`,
          flags: MessageFlags.Ephemeral
        });
        return;
      }
      const fontBytes = Buffer.from(await response.arrayBuffer());

      const tempPath = path.join(
        FONT_TMP_DIR,
        `fontbot-${Date.now()}-${randomUUID()}-${fontname}${ext}`
      );
      await fs.writeFile(tempPath, fontBytes);

      const pendingId = await savePendingFont(
        fontname,
        tempPath,
        interaction.id,
        interaction.user.username
      );

      let preview: Buffer;
      try {
        preview = await renderFontPreview(tempPath);
      } catch {
        console.warn(`Failed to render preview for font ${fontname}`);
        await fs.rm(tempPath, { force: true });
        await deletePendingFont(pendingId);
        await interaction.followUp({
          content: `Error submitting ${fontname}, invalid font file`,
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const approve = new ButtonBuilder()
        .setCustomId(`approve:${pendingId}`)
        .setLabel('Approve')
        .setStyle(ButtonStyle.Success);
      const deny = new ButtonBuilder()
        .setCustomId(`deny:${pendingId}`)
        .setLabel('Deny')
        .setStyle(ButtonStyle.Danger);
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(approve, deny);
      const previewAttachment = new AttachmentBuilder(preview, { name: `${fontname}${ext}.png` });

      const mentions = [
        fontApproveRoleId !== undefined ? `<@&${fontApproveRoleId}>` : null,
        adminUser !== undefined ? `<@${adminUser}>` : null,
        fontUserId !== undefined ? `<@${fontUserId}>` : null
      ].filter((m) => m !== null);
      const expiryTimestamp = Math.floor((Date.now() + APPROVAL_EXPIRY_MS) / 1000);

      await interaction.editReply({
        content: `New font submission: \`${fontname}\` (${ext}) by ${interaction.user.username}, expires <t:${expiryTimestamp}:R>\n${mentions.join(' ')}`,
        files: [previewAttachment],
        components: [row]
      });
      const message = await interaction.fetchReply();
      await updatePendingFontMessageId(pendingId, message.id);

      let resolved = false;
      const collector = message.createMessageComponentCollector({ time: APPROVAL_EXPIRY_MS });

      collector.on('collect', async (btn) => {
        if (resolved) {
          return btn.reply({
            content: 'This approval was already handled',
            flags: MessageFlags.Ephemeral
          });
        }
        if (btn.customId !== `approve:${pendingId}` && btn.customId !== `deny:${pendingId}`) return;

        console.log(`Approval/Deny request from user: ${btn.user.username} (id: ${btn.user.id})`);
        console.log(`Allowed users: ${[fontUserId, adminUser]}`);

        const isApprover =
          [fontUserId, adminUser].includes(btn.user.id) ||
          (fontApproveRoleId !== undefined && memberHasRole(btn.member, fontApproveRoleId));

        if (!isApprover) {
          return btn.reply({
            content: "You don't have permission to approve fonts",
            flags: MessageFlags.Ephemeral
          });
        }

        const pending = await getPendingFont(pendingId);
        if (!pending) {
          resolved = true;
          collector.stop();
          return btn.reply({
            content: 'This approval has expired',
            flags: MessageFlags.Ephemeral
          });
        }

        resolved = true;
        try {
          if (btn.customId === `approve:${pendingId}`) {
            const filename = `${pending.fontname}${ext}`;
            await fs.copyFile(pending.temp_path, path.join(FONTS_DIR, filename));
            await saveApprovedFont(pending.fontname, filename);
            console.log(`Font ${pending.fontname} approved by ${btn.user.username}.`);
            await btn.update({
              content: `Font \`${pending.fontname}\` approved by ${btn.user.username}!`,
              components: []
            } as InteractionUpdateOptions);
          } else {
            console.log(`Font ${pending.fontname} denied by ${btn.user.username}.`);
            await btn.update({
              content: `Font \`${pending.fontname}\` denied by ${btn.user.username}.`,
              components: []
            } as InteractionUpdateOptions);
          }
        } catch (e) {
          console.warn(`Failed to finalize font approval for ${pending.fontname}`, e);
        } finally {
          await fs.rm(pending.temp_path, { force: true });
          await deletePendingFont(pendingId);
          collector.stop();
        }
      });

      collector.on('end', async () => {
        if (resolved) return;
        const pending = await getPendingFont(pendingId);
        if (pending) {
          await fs.rm(pending.temp_path, { force: true });
          await deletePendingFont(pendingId);
        }
        await interaction.editReply({
          content: `Font \`${fontname}\` approval expired.`,
          components: []
        });
      });
    }

    if (interaction.options.getSubcommand(true) === 'list') {
      await handlePaginatedList(interaction, {
        fetchEntries: listFonts,
        formatEntry: (entry) => `${entry.fontname} (${entry.filename})`,
        errorMessage: 'Error listing fonts'
      });
    }

    if (interaction.options.getSubcommand(true) === 'delete') {
      const fontname = interaction.options.getString('fontname', true).trim().toLowerCase();
      const isApprover =
        [fontUserId, adminUser].includes(interaction.user.id) ||
        (fontApproveRoleId !== undefined && memberHasRole(interaction.member, fontApproveRoleId));

      if (!isApprover) {
        console.warn(
          `${interaction.user.username} tried to delete font ${fontname} without permission`
        );
        await interaction.reply({
          content: "You don't have permission to delete fonts",
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const font = await getFont(fontname);
      if (!font) {
        console.warn(`Font ${fontname} not found for deletion.`);
        await interaction.reply({
          content: `Error deleting ${fontname}`,
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      console.log(`Deleting font ${fontname}...`);
      try {
        await deleteFont(fontname);
        await fs.rm(path.join(FONTS_DIR, font.filename), { force: true });
      } catch (e) {
        console.warn(`Failed to delete font ${fontname}`, e);
        await interaction.reply({ content: `Error deleting ${fontname}` });
        return;
      }

      console.log(`Font ${fontname} deleted.`);
      await interaction.reply({ content: `Deleted ${fontname}` });
    }
  }

  try {
    await initDbIfRequired();
  } catch (e) {
    console.warn(e);
  }
});

let shuttingDown = false;

async function expireAllApprovals(): Promise<void> {
  const pending = await listPendingFonts();
  for (const p of pending) {
    try {
      await fs.rm(p.temp_path, { force: true });
    } catch (e) {
      console.warn(`Failed to remove temp file for ${p.fontname}`, e);
    }
    try {
      const channel = await client.channels.fetch(songChannelId!);
      if (channel instanceof TextChannel) {
        const msg = await channel.messages.fetch(p.message_id);
        await msg.edit({
          content: `Font \`${p.fontname}\` approval expired.`,
          components: []
        });
      }
    } catch (e) {
      console.warn(`Failed to expire approval message for ${p.fontname}`, e);
    }
    try {
      await deletePendingFont(p.id);
    } catch (e) {
      console.warn(`Failed to delete pending font ${p.fontname}`, e);
    }
  }
  await fs.rm(FONT_TMP_DIR, { force: true, recursive: true });
  console.log(`Expired ${pending.length} pending font approvals on shutdown.`);
}

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    void expireAllApprovals()
      .catch((e) => console.warn('Failed to expire approvals on shutdown', e))
      .finally(() => process.exit(0));
  });
}

startWebsocketServer();
startPicomService();
client.login(token);
