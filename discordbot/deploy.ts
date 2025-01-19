import { REST, Routes, SlashCommandBuilder } from 'discord.js';

const commands = [
  new SlashCommandBuilder()
    .setName('savesong')
    .setDescription('saves the beepbox song')
    .addStringOption((option) =>
      option.setName('shortname').setDescription('the shortname of the song').setRequired(true)
    )
    .addAttachmentOption((option) =>
      option.setName('base64').setDescription('the base64 to save').setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('listsongs')
    .setDescription('list all available beepbox songs')
];
const clientId = '1330567810358710312';
const guildId = '1324837719859396668';

const token = process.env['DISCORD_BOT'];
if (!token) {
  console.error('Need token');
  process.exit(-1);
}
const rest = new REST().setToken(token!);

// and deploy your commands!
(async () => {
  try {
    console.log(`Started refreshing ${commands.length} application (/) commands.`);

    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });

    console.log(`Successfully reloaded application (/) commands.`);
  } catch (error) {
    console.error(error);
  }
})();
