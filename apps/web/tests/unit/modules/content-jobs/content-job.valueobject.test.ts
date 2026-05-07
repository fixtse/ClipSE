import { describe, expect, it } from "vitest";
import {
	ContentJobSchema,
	CreateContentJobSchema,
} from "~/modules/content-jobs/domain/content-job.valueobject";
import { ContentJobMother } from "../../../mothers/domain-mothers";

describe("content job schemas", () => {
	it("parses stored jobs and validates create job inputs", () => {
		expect(ContentJobSchema.parse(ContentJobMother.create()).status).toBe(
			"pending",
		);
		expect(
			CreateContentJobSchema.parse({
				videoId: "11111111-1111-4111-8111-111111111111",
				type: "analyze-video",
			}),
		).toEqual({
			videoId: "11111111-1111-4111-8111-111111111111",
			type: "analyze-video",
		});
	});
});
