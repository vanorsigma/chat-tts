import { REST, Routes, SlashCommandBuilder } from 'discord.js';

const commands = [
  new SlashCommandBuilder()
    .setName('song')
    .setDescription('Manage SongBot')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('save')
        .setDescription('saves the beepbox song')
        .addStringOption((option) =>
          option.setName('shortname').setDescription('the shortname of the song').setRequired(true)
        )
        .addAttachmentOption((option) =>
          option.setName('base64').setDescription('the base64 to save').setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('list')
        .setDescription('list all available beepbox songs')
        .addNumberOption((option) =>
          option.setName('page').setDescription('the page number').setRequired(false).setMinValue(1)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('delete')
        .setDescription('delete a beepbox song')
        .addStringOption((option) =>
          option.setName('shortname').setDescription('the shortname of the song').setRequired(true)
        )
    )
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
