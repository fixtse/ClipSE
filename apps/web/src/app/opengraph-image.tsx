import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { headers } from "next/headers";
import { ImageResponse } from "next/og";
import { defaultLocale } from "~/i18n/config";
import { messages } from "~/i18n/messages";
import { resolvePreferredLocale } from "~/i18n/path";

export const alt = process.env.NEXT_PUBLIC_SITE_NAME ?? "ContentClip";

export const size = {
	width: 1200,
	height: 630,
};

export const contentType = "image/png";

export default async function Image() {
	const siteName = process.env.NEXT_PUBLIC_SITE_NAME ?? "ContentClip";
	const locale = resolvePreferredLocale(
		(await headers()).get("accept-language") ?? "",
	);
	const dictionary = messages[locale ?? defaultLocale];

	const logoData = await readFile(join(process.cwd(), "public/logo.png"));
	const logoSrc = `data:image/png;base64,${logoData.toString("base64")}`;

	return new ImageResponse(
		<div
			style={{
				width: "100%",
				height: "100%",
				display: "flex",
				flexDirection: "column",
				justifyContent: "center",
				background:
					"linear-gradient(135deg, rgb(3,11,28) 0%, rgb(9,18,38) 36%, rgb(24,20,34) 68%, rgb(3,11,28) 100%)",
				position: "relative",
				overflow: "hidden",
				padding: "56px 72px",
				color: "#f8fafc",
			}}
		>
			<div
				style={{
					position: "absolute",
					inset: 0,
					background:
						"radial-gradient(circle at 18% 18%, rgba(249,115,22,0.18), transparent 32%), radial-gradient(circle at 82% 20%, rgba(45,212,191,0.14), transparent 24%), radial-gradient(circle at 50% 100%, rgba(249,115,22,0.10), transparent 30%)",
				}}
			/>
			<div
				style={{
					position: "absolute",
					top: "36px",
					left: "72px",
					right: "72px",
					height: "1px",
					background:
						"linear-gradient(90deg, transparent, rgba(251,146,60,0.9), transparent)",
				}}
			/>
			<div
				style={{
					position: "absolute",
					bottom: "36px",
					left: "72px",
					right: "72px",
					height: "1px",
					background:
						"linear-gradient(90deg, transparent, rgba(45,212,191,0.65), transparent)",
				}}
			/>

			<div
				style={{
					display: "flex",
					width: "1000px",
					maxWidth: "100%",
					alignItems: "center",
					alignSelf: "center",
					position: "relative",
					gap: "52px",
				}}
			>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						width: "280px",
						height: "280px",
						borderRadius: "40px",
						border: "1px solid rgba(255,255,255,0.18)",
						background:
							"linear-gradient(180deg, rgba(255,255,255,0.3), rgba(255,255,255,0.5))",
						boxShadow: "0 30px 80px rgba(0,0,0,0.18)",
						flexShrink: 0,
					}}
				>
					{/** biome-ignore lint/performance/noImgElement: no */}
					<img
						alt={siteName}
						height={170}
						src={logoSrc}
						style={{
							objectFit: "contain",
							borderRadius: "24px",
						}}
						width={170}
					/>
				</div>

				<div
					style={{
						display: "flex",
						flexDirection: "column",
						alignItems: "flex-start",
						justifyContent: "center",
						gap: "22px",
						flex: 1,
					}}
				>
					<div
						style={{
							display: "flex",
							alignItems: "center",
							gap: "12px",
							border: "1px solid rgba(251,146,60,0.24)",
							background: "rgba(251,146,60,0.10)",
							borderRadius: "999px",
							padding: "10px 18px",
							color: "#fdba74",
							fontSize: "18px",
							fontWeight: 600,
							textTransform: "uppercase",
							letterSpacing: "0.14em",
						}}
					>
						{dictionary.metadata.ogEyebrow}
					</div>
					<div
						style={{
							display: "flex",
							flexDirection: "column",
							gap: "12px",
						}}
					>
						<h1
							style={{
								margin: 0,
								fontSize: "68px",
								lineHeight: 1.02,
								fontWeight: 900,
								letterSpacing: "-0.04em",
								maxWidth: "760px",
							}}
						>
							{siteName}
						</h1>
					</div>
					<h2
						style={{
							margin: 0,
							fontSize: "60px",
							lineHeight: 0.98,
							fontWeight: 600,
							letterSpacing: "-0.04em",
							maxWidth: "660px",
						}}
					>
						{dictionary.metadata.ogTitle}
					</h2>
				</div>
			</div>
		</div>,
		{ ...size },
	);
}
