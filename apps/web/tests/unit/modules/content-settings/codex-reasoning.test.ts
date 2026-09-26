import { describe, expect, it } from "vitest";
import { resolveCodexReasoningEffort } from "~/modules/content-settings/domain/codex-reasoning";

describe("Codex reasoning effort", () => {
	it("uses only levels advertised by the selected model", () => {
		const model = {
			value: "example-model",
			label: "Example",
			supportedReasoningEfforts: ["low", "high"],
		};
		expect(resolveCodexReasoningEffort(model, "high")).toBe("high");
		expect(resolveCodexReasoningEffort(model, "medium")).toBeNull();
		expect(resolveCodexReasoningEffort(model, null)).toBeNull();
	});
});
