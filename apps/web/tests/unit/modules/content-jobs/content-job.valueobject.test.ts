import { describe, expect, it } from "vitest";
import {
	ContentJobSchema as ClipSEJobSchema,
	CreateContentJobSchema as CreateClipSEJobSchema,
} from "~/modules/content-jobs/domain/content-job.valueobject";
import { ClipSEJobMother } from "../../../mothers/domain-mothers";

describe("ClipSE job schemas", () => {
	it("parses stored jobs and validates create job inputs", () => {
		expect(ClipSEJobSchema.parse(ClipSEJobMother.create()).status).toBe(
			"pending",
		);
		expect(
			CreateClipSEJobSchema.parse({
				videoId: "11111111-1111-4111-8111-111111111111",
				type: "analyze-video",
			}),
		).toEqual({
			videoId: "11111111-1111-4111-8111-111111111111",
			type: "analyze-video",
		});
	});
});
