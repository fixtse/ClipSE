import { NextResponse } from "next/server";
import { getSessionFromHeaders } from "~/server/auth";

export async function requireRequestSession(request: Request) {
	const session = await getSessionFromHeaders(request.headers);
	if (!session?.session) {
		return NextResponse.json(
			{ error: "Authentication required" },
			{ status: 401 },
		);
	}

	return null;
}
