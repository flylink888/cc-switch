import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { providersApi } from "@/lib/api";
import type { Provider } from "@/types";
import {
  useAddProviderMutation,
  useDeleteProviderMutation,
  useUpdateProviderMutation,
} from "./mutations";

const OPENCODE_LIVE_QUERY_KEYS = [
  ["opencodeLiveProviderIds"],
  ["opencodeDefaultModel"],
  ["opencode", "runtime-models"],
  ["omo", "current-provider-id"],
  ["omo", "provider-count"],
  ["omo-slim", "current-provider-id"],
  ["omo-slim", "provider-count"],
] as const;

function opencodeProvider(): Provider {
  return {
    id: "custom",
    name: "Custom",
    settingsConfig: {
      npm: "@ai-sdk/openai-compatible",
      models: { custom: { name: "Custom" } },
    },
  };
}

function createQueryClient() {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });
  for (const queryKey of OPENCODE_LIVE_QUERY_KEYS) {
    queryClient.setQueryData(queryKey, []);
  }
  return queryClient;
}

function createWrapper(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

async function expectLiveQueriesInvalidated(queryClient: QueryClient) {
  await waitFor(() => {
    for (const queryKey of OPENCODE_LIVE_QUERY_KEYS) {
      expect(queryClient.getQueryState(queryKey)?.isInvalidated).toBe(true);
    }
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("OpenCode provider mutations", () => {
  it("refresh live-derived queries after adding a provider", async () => {
    vi.spyOn(providersApi, "add").mockResolvedValue(true);
    vi.spyOn(providersApi, "updateTrayMenu").mockResolvedValue(true);
    const queryClient = createQueryClient();
    const { result } = renderHook(() => useAddProviderMutation("opencode"), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.mutateAsync({
      name: "Custom",
      providerKey: "custom",
      settingsConfig: {
        npm: "@ai-sdk/openai-compatible",
        models: { custom: {} },
      },
    });

    await expectLiveQueriesInvalidated(queryClient);
  });

  it("refresh live-derived queries after updating a provider", async () => {
    vi.spyOn(providersApi, "update").mockResolvedValue(true);
    const queryClient = createQueryClient();
    const { result } = renderHook(() => useUpdateProviderMutation("opencode"), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.mutateAsync({ provider: opencodeProvider() });

    await expectLiveQueriesInvalidated(queryClient);
  });

  it("refresh live-derived queries after deleting a provider", async () => {
    vi.spyOn(providersApi, "delete").mockResolvedValue(true);
    vi.spyOn(providersApi, "updateTrayMenu").mockResolvedValue(true);
    const queryClient = createQueryClient();
    const { result } = renderHook(() => useDeleteProviderMutation("opencode"), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.mutateAsync("custom");

    await expectLiveQueriesInvalidated(queryClient);
  });
});
