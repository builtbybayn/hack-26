import "server-only";

/** Reddit discovery is unavailable until this use case receives approved access. */
export function redditAvailability(): string {
  return "Reddit was not searched: approved Reddit research access is not configured.";
}
