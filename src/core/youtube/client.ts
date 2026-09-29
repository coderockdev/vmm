import { google } from "googleapis";
import { getYoutubeOAuthConfig, mapYoutubeApiError, YoutubeAuthError } from "./oauth";
import { getYoutubeAccountForChannel } from "../repo/youtubeAccounts";
import { decryptSecret } from "../crypto/secrets";

/**
 * Authenticated googleapis YouTube client for a VMM channel.
 * Refresh token stays server-side (encrypted in DB); access token is refreshed automatically.
 */
export async function getYoutubeClientForChannel(channelId: string) {
  const account = await getYoutubeAccountForChannel(channelId);
  if (!account) {
    throw new YoutubeAuthError(
      "YouTube ainda não está ligado a este canal. Usa «Conectar YouTube»."
    );
  }

  let refreshToken: string;
  try {
    refreshToken = decryptSecret(account.refreshTokenEncrypted);
  } catch {
    throw new YoutubeAuthError(
      "Não foi possível ler o token guardado. Volta a «Conectar YouTube»."
    );
  }

  const { clientId, clientSecret, redirectUri } = getYoutubeOAuthConfig();
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  oauth2.setCredentials({ refresh_token: refreshToken });

  // Force a refresh so we fail fast on invalid_grant before upload starts.
  try {
    const { credentials } = await oauth2.refreshAccessToken();
    oauth2.setCredentials({ ...credentials, refresh_token: refreshToken });
  } catch (err) {
    throw mapYoutubeApiError(err);
  }

  const youtube = google.youtube({ version: "v3", auth: oauth2 });
  return { youtube, oauth2, account };
}
