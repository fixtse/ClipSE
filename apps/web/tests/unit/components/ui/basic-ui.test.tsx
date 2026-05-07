import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Badge, badgeVariants } from "~/components/ui/badge";
import { Button, buttonVariants } from "~/components/ui/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Progress } from "~/components/ui/progress";
import { Skeleton } from "~/components/ui/skeleton";
import { Textarea } from "~/components/ui/textarea";

describe("basic UI components", () => {
	it("renders buttons and badges with variant metadata", () => {
		const markup = renderToStaticMarkup(
			<div>
				<Button className="custom-button" size="sm" variant="secondary">
					Save
				</Button>
				<Badge className="custom-badge" variant="highlight">
					Ready
				</Badge>
			</div>,
		);

		expect(markup).toContain('data-slot="button"');
		expect(markup).toContain('data-size="sm"');
		expect(markup).toContain('data-variant="secondary"');
		expect(markup).toContain("custom-button");
		expect(markup).toContain('data-slot="badge"');
		expect(markup).toContain('data-variant="highlight"');
		expect(markup).toContain("custom-badge");
		expect(buttonVariants({ variant: "ghost", size: "icon" })).toContain(
			"size-9",
		);
		expect(badgeVariants({ variant: "outline" })).toContain("border-border");
	});

	it("renders card layout slots", () => {
		const markup = renderToStaticMarkup(
			<Card>
				<CardHeader>
					<CardTitle>Title</CardTitle>
					<CardDescription>Description</CardDescription>
					<CardAction>Action</CardAction>
				</CardHeader>
				<CardContent>Content</CardContent>
				<CardFooter>Footer</CardFooter>
			</Card>,
		);

		expect(markup).toContain('data-slot="card"');
		expect(markup).toContain('data-slot="card-header"');
		expect(markup).toContain('data-slot="card-title"');
		expect(markup).toContain('data-slot="card-description"');
		expect(markup).toContain('data-slot="card-action"');
		expect(markup).toContain('data-slot="card-content"');
		expect(markup).toContain('data-slot="card-footer"');
	});

	it("renders form and feedback primitives", () => {
		const markup = renderToStaticMarkup(
			<div>
				<Input aria-label="Title" className="custom-input" type="text" />
				<Textarea aria-label="Summary" className="custom-textarea" />
				<Skeleton className="custom-skeleton" />
				<Progress value={45} />
			</div>,
		);

		expect(markup).toContain('data-slot="input"');
		expect(markup).toContain('type="text"');
		expect(markup).toContain("custom-input");
		expect(markup).toContain('data-slot="textarea"');
		expect(markup).toContain("custom-textarea");
		expect(markup).toContain('data-slot="skeleton"');
		expect(markup).toContain("custom-skeleton");
		expect(markup).toContain('data-slot="progress"');
		expect(markup).toContain('data-slot="progress-indicator"');
		expect(markup).toContain("translateX(-55%)");
	});
});
