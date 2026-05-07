import type * as React from "react";

import { cn } from "~/lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			className={cn("animate-pulse rounded-md bg-accent/50", className)}
			data-slot="skeleton"
			{...props}
		/>
	);
}

export { Skeleton };
