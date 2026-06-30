export interface DiscordInviteInfo {
  guildName: string;
  guildIconUrl: string | null;
  guildBannerUrl: string | null;
  description: string | null;
  memberCount: number;
  presenceCount: number;
  inviteUrl: string;
}

const INVITE_CODE = '2V4GSxzEgZ';

export async function fetchDiscordInvite(): Promise<DiscordInviteInfo> {
  const res = await fetch(
    `https://discord.com/api/v9/invites/${INVITE_CODE}?with_counts=true&with_expiration=true`
  );
  if (!res.ok) throw new Error('No se pudo obtener la info del Discord');
  const data = await res.json();
  const guildId = data.guild?.id;

  return {
    guildName: data.guild?.name ?? 'MCKBServers',
    guildIconUrl: guildId && data.guild?.icon
      ? `https://cdn.discordapp.com/icons/${guildId}/${data.guild.icon}.png?size=128`
      : null,
    guildBannerUrl: guildId && data.guild?.banner
      ? `https://cdn.discordapp.com/banners/${guildId}/${data.guild.banner}.png?size=1024`
      : null,
    description: data.guild?.description ?? null,
    memberCount: data.approximate_member_count ?? 0,
    presenceCount: data.approximate_presence_count ?? 0,
    inviteUrl: `https://discord.gg/${INVITE_CODE}`,
  };
}