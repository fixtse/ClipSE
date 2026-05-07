import { afterEach, vi } from "vitest";

afterEach(() => {
	vi.clearAllMocks();
	vi.restoreAllMocks();
	vi.clearAllTimers();
	vi.unstubAllGlobals();
	vi.useRealTimers();
});
