"use client";

import { Loader2, LockKeyhole, LogIn, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type React from "react";
import { useState } from "react";
import toast from "react-hot-toast";

import { Button } from "~/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { authClient } from "~/lib/auth-client";
import { enableLocalAnonymousModeAction } from "~/server/actions/auth/enable-local-anonymous-mode";

interface AuthFormProps {
	allowAnonymousMode?: boolean;
	mode: "sign-in" | "sign-up";
	returnTo: string;
	switchHref?: string;
}

export function AuthForm({
	allowAnonymousMode = false,
	mode,
	returnTo,
	switchHref,
}: AuthFormProps) {
	const router = useRouter();
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isSkippingAuth, setIsSkippingAuth] = useState(false);

	const isSignUp = mode === "sign-up";
	const title = isSignUp ? "Create local account" : "Sign in";
	const description = isSignUp
		? "Set up the local account that protects this ClipSE workspace."
		: "Use your local account to open the ClipSE workspace.";
	const submitLabel = isSignUp ? "Create account" : "Sign in";
	const switchLabel = isSignUp
		? "Already have a local account?"
		: "Need a local account?";
	const switchAction = isSignUp ? "Sign in" : "Create one";

	async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setIsSubmitting(true);

		try {
			const formData = new FormData(event.currentTarget);
			const email = String(formData.get("email") ?? "").trim();
			const password = String(formData.get("password") ?? "");
			const name = String(formData.get("name") ?? "").trim();

			const result = isSignUp
				? await authClient.signUp.email({
						email,
						password,
						name: name || email,
					})
				: await authClient.signIn.email({
						email,
						password,
					});

			if (result.error) {
				toast.error(result.error.message ?? "Authentication failed");
				return;
			}

			toast.success(isSignUp ? "Account created" : "Signed in");
			router.replace(returnTo);
			router.refresh();
		} catch (error) {
			console.error("Authentication request failed", error);
			toast.error("Authentication failed");
		} finally {
			setIsSubmitting(false);
		}
	}

	async function handleSkipAuth() {
		setIsSkippingAuth(true);

		const result = await enableLocalAnonymousModeAction();
		setIsSkippingAuth(false);

		if (!result.success) {
			toast.error(result.error);
			return;
		}

		router.replace(returnTo);
		router.refresh();
	}

	return (
		<div className="flex min-h-dvh items-center justify-center bg-background px-4 py-10 text-foreground">
			<Card className="w-full max-w-sm border-slate-800 bg-slate-950/80 shadow-2xl shadow-black/40">
				<CardHeader className="gap-2">
					<div className="mb-1 flex size-10 items-center justify-center rounded-md border border-cyan-400/30 bg-cyan-400/10 text-cyan-200">
						<LockKeyhole className="size-5" />
					</div>
					<CardTitle className="text-xl">{title}</CardTitle>
					<CardDescription>{description}</CardDescription>
				</CardHeader>
				<CardContent>
					<form className="space-y-4" method="post" onSubmit={onSubmit}>
						{isSignUp ? (
							<div className="space-y-2">
								<Label htmlFor="name">Name</Label>
								<Input
									autoComplete="name"
									id="name"
									name="name"
									placeholder="ClipSE Admin"
								/>
							</div>
						) : null}
						<div className="space-y-2">
							<Label htmlFor="email">Email</Label>
							<Input
								autoComplete="email"
								id="email"
								name="email"
								placeholder="you@example.com"
								required
								type="email"
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="password">Password</Label>
							<Input
								autoComplete={isSignUp ? "new-password" : "current-password"}
								id="password"
								minLength={8}
								name="password"
								required
								type="password"
							/>
						</div>
						<Button className="w-full" disabled={isSubmitting} type="submit">
							{isSubmitting ? (
								<Loader2 className="animate-spin" />
							) : isSignUp ? (
								<UserPlus />
							) : (
								<LogIn />
							)}
							{submitLabel}
						</Button>
					</form>
					{allowAnonymousMode ? (
						<Button
							className="mt-3 w-full border-white/10 bg-white/6 text-slate-100 hover:bg-white/10"
							disabled={isSubmitting || isSkippingAuth}
							onClick={() => {
								void handleSkipAuth();
							}}
							type="button"
							variant="outline"
						>
							{isSkippingAuth ? (
								<Loader2 className="animate-spin" />
							) : (
								<LogIn />
							)}
							Continue without an account
						</Button>
					) : null}
					{switchHref ? (
						<p className="mt-5 text-center text-slate-400 text-sm">
							{switchLabel}{" "}
							<Link
								className="text-cyan-200 hover:text-cyan-100"
								href={switchHref}
							>
								{switchAction}
							</Link>
						</p>
					) : null}
				</CardContent>
			</Card>
		</div>
	);
}
