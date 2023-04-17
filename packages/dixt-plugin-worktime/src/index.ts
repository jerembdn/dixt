import {
  CacheType,
  ChannelType,
  Colors,
  Events,
  GuildMember,
  Interaction,
  User,
} from "discord.js";
import { DixtPlugin, Log } from "dixt";
import dotenv from "dotenv-flow";
import WorktimeController from "./controllers/worktime";
import worktimeLeaderboardTask from "./tasks/leaderboard";

export const name = "dixt-plugin-worktime";

dotenv.config({
  silent: true,
});

export type DixtPluginWorktimeOptions = {
  title?: string;
  channels?: {
    main?: string | string[];
    leaderboard?: string;
    workChannelNames?: string[];
  };
  quotas?: {
    [x: string]: number;
  };
  tasks?: {
    end?: string;
    leaderboard?: string;
  };
  messages?: {
    main?: {
      instructions?: string;
      startButton?: string;
      endButton?: string;
    };
    start?: {
      alreadyStarted?: string;
      success?: string;
    };
    end?: {
      notStarted?: string;
      success?: string;
      progress?: string;
      noQuota?: string;
    };
    leaderboard?: {
      title?: string;
      description?: string;
    };
  };
};

export const optionsDefaults = {
  title: "Worktime",
  channels: {
    main: process.env.DIXT_PLUGIN_WORKTIME_MAIN_CHANNEL_ID || "",
    leaderboard: process.env.DIXT_PLUGIN_WORKTIME_LEADERBOARD_CHANNEL_ID || "",
    workChannelNames:
      process.env.DIXT_PLUGIN_WORKTIME_WORKTIME_CHANNEL_NAMES?.split(",") || [],
  },
  tasks: {
    end: process.env.DIXT_PLUGIN_WORKTIME_END_TASK || "*/10 * * * *",
    leaderboard:
      process.env.DIXT_PLUGIN_WORKTIME_LEADERBOARD_TASK || "0 12 * * 0",
  },
  messages: {
    main: {
      instructions:
        "Worktime of the team members.\n\n" +
        "**Start service**\n" +
        "Click on the **Start service** button to point your arrival.\n\n" +
        "**End service**\n" +
        "Click on the **End service** button to point your departure.\n\n" +
        "**Warning**\n" +
        "Make sure to connect to a **work** voice channel to make sure your service is taken into account.",
      startButton: "✨ Start service",
      endButton: "🚪 End service",
    },
    start: {
      alreadyStarted: "You have already started your service at %time%.",
      success: "Your service has been validated at %time%.",
    },
    end: {
      notStarted: "You have not started your service yet.",
      success:
        "Your end of service has been validated at %time%. \n\n**Time worked this week:** %total_time%.%progress%",
      progress: "\n**Progression:** %progress%",
      noQuota: "You don't have a quota.",
    },
    leaderboard: {
      title: "Leaderboard",
    },
  },
};

const dixtPluginWorktime: DixtPlugin = (
  instance,
  optionsValue?: DixtPluginWorktimeOptions
) => {
  const options = { ...optionsDefaults, ...optionsValue };
  const controller = new WorktimeController(instance, options);
  if (!options.channels.main) {
    Log.error(`${name} - channels.main is required`);
    throw new Error(`${name} - channels.main is required`);
  }

  instance.client.on(Events.ClientReady, async () => {
    if (!options.channels.main) {
      Log.error(`${name} - channels.main is required`);
      throw new Error(`${name} - channels.main is required`);
    }

    if (Array.isArray(options.channels.main)) {
      options.channels.main.forEach((channelId) => {
        const channel = instance.client.channels.cache.get(channelId);
        if (channel?.type === ChannelType.GuildText) {
          controller.initialize(channel);
        } else {
          Log.error(
            `${name} - channel with id ${channelId} is not a text channel`
          );
        }
      });
    } else {
      const channel = instance.client.channels.cache.get(options.channels.main);
      if (channel?.type === ChannelType.GuildText) {
        controller.initialize(channel);
      } else {
        Log.error(
          `${name} - channel with id ${options.channels.main} is not a text channel`
        );
      }
    }
  });

  instance.client.on(
    Events.InteractionCreate,
    async (interaction: Interaction<CacheType>) => {
      if (!interaction.isButton()) return;
      if (!interaction.customId.startsWith("worktime_")) return;
      if (!interaction.guild) return;
      if (!interaction.member || !interaction.member.user) return;

      switch (interaction.customId) {
        case "worktime_start": {
          if (
            await controller.isInWorkChannel(interaction.member as GuildMember)
          ) {
            try {
              const embed = await controller.start(
                interaction.member.user as User
              );
              await interaction.reply({
                embeds: [embed],
                ephemeral: true,
              });
            } catch (e) {
              await interaction.reply({
                embeds: [
                  {
                    ...WorktimeController.baseEmbed,
                    color: Colors.Red,
                    description: `${interaction.member}, ${instance.messages?.error?.dmBlocked}`,
                  },
                ],
                ephemeral: true,
              });
              Log.error(`${interaction.member} - ${e}`);
            }
          } else {
            if (
              options.channels.workChannelNames &&
              options.channels.workChannelNames.length > 0
            ) {
              Log.info(
                `**${interaction.guild}** - ${interaction.member} tried to start worktime but is not in a work channel`
              );
              const workChannels = await controller.getWorkChannels();
              await interaction.reply({
                embeds: [
                  {
                    ...WorktimeController.baseEmbed,
                    description: `Connectez-vous au salon ${workChannels[0]} pour pointer votre arrivée.`,
                    color: Colors.Red,
                  },
                ],
                ephemeral: true,
              });
            }
          }
          break;
        }

        case "worktime_end": {
          try {
            const embed = await controller.end(interaction.member.user as User);
            await interaction.reply({
              embeds: [embed],
              ephemeral: true,
            });
          } catch (e) {
            await interaction.reply({
              embeds: [
                {
                  ...WorktimeController.baseEmbed,
                  color: Colors.Red,
                  description: `${interaction.member}, ${instance.messages?.error?.dmBlocked}`,
                },
              ],
              ephemeral: true,
            });
            Log.error(`${interaction.member} - ${e}`);
          }
          break;
        }
      }
    }
  );

  // tasks
  worktimeLeaderboardTask(instance, controller);

  return {
    name,
  };
};

export default dixtPluginWorktime;