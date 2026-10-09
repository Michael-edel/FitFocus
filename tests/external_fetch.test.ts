import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithTimeout } from "../functions/api/_lib/external_fetch";

describe("fetchWithTimeout", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("returns the caller's timeout code when an upstream request stalls", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise((_, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    })));

    const outcome = fetchWithTimeout("https://provider.test", {}, { timeoutMs: 500, timeoutError: "UPSTREAM_TIMEOUT" })
      .then(() => "resolved", (error: Error) => error.message);
    await vi.advanceTimersByTimeAsync(500);
    await expect(outcome).resolves.toBe("UPSTREAM_TIMEOUT");
  });

  it("preserves caller cancellation instead of classifying it as a timeout", async () => {
    vi.stubGlobal("fetch", vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise((_, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("caller aborted")), { once: true });
    })));
    const controller = new AbortController();
    const outcome = fetchWithTimeout("https://provider.test", { signal: controller.signal }, { timeoutMs: 10_000, timeoutError: "UPSTREAM_TIMEOUT" })
      .then(() => "resolved", (error: Error) => error.message);
    controller.abort();

    await expect(outcome).resolves.toBe("caller aborted");
  });

  it("forwards a signal that was already cancelled before the request starts", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.signal?.aborted) return Promise.reject(new Error("caller aborted"));
      return Promise.resolve(new Response());
    });
    vi.stubGlobal("fetch", fetchMock);

    const outcome = fetchWithTimeout("https://provider.test", { signal: controller.signal }, { timeoutMs: 10_000, timeoutError: "UPSTREAM_TIMEOUT" })
      .then(() => "resolved", (error: Error) => error.message);

    await expect(outcome).resolves.toBe("caller aborted");
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });
});
