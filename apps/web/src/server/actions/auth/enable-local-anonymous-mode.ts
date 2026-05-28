"use server";

import { cookies } from "next/headers";
import {
	hasExistingUser,
	localAnonymousModeCookieName,
	localAnonymousModeCookieValue,
	persistentSessionMaxAge,
} from "~/server/auth";

type EnableLocalAnonymousModeActionResult =
	| {
			success: true;
	  }
	| {
			success: false;
			error: string;
	  };

export async function enableLocalAnonymousModeAction(): Promise<EnableLocalAnonymousModeActionResult> {
	try {
		if (await hasExistingUser()) {
			return {
				success: false,
				error: "A local account already exists. Sign in to continue.",
			};
		}

		const cookieStore = await cookies();
		cookieStore.set(
			localAnonymousModeCookieName,
			localAnonymousModeCookieValue,
			{
				httpOnly: true,
				maxAge: persistentSessionMaxAge,
				path: "/",
				sameSite: "lax",
				secure: process.env.NODE_ENV === "production",
			},
		);

		return { success: true };
	} catch (error) {
		console.error("Failed to enable local anonymous mode:", error);
		return {
			success: false,
			error:
				error instanceof Error
					? error.message
					: "Failed to continue without an account",
		};
	}
}
