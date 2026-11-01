import type { QueryClient } from "@tanstack/react-query";

/**
 * Invalidate every OpenCode cache derived from the live config. Provider
 * add/update/delete mutations may change both the provider rows and the live
 * file, so the list must not keep treating a successfully written provider as
 * database-only until another action happens to refresh it.
 */
export async function invalidateOpencodeLiveState(
  queryClient: QueryClient,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: ["opencodeLiveProviderIds"],
    }),
    queryClient.invalidateQueries({
      queryKey: ["opencodeDefaultModel"],
    }),
    queryClient.invalidateQueries({
      queryKey: ["opencode", "runtime-models"],
    }),
    queryClient.invalidateQueries({
      queryKey: ["omo", "current-provider-id"],
    }),
    queryClient.invalidateQueries({
      queryKey: ["omo", "provider-count"],
    }),
    queryClient.invalidateQueries({
      queryKey: ["omo-slim", "current-provider-id"],
    }),
    queryClient.invalidateQueries({
      queryKey: ["omo-slim", "provider-count"],
    }),
  ]);
}
