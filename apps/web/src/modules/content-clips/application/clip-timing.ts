export function roundToFrame(value: number, frameRate: number | null): number {
	if (!frameRate || frameRate <= 0) {
		return Number(value.toFixed(3));
	}

	const frameDuration = 1 / frameRate;
	return Number((Math.round(value / frameDuration) * frameDuration).toFixed(3));
}

export function formatTimecode(seconds: number): string {
	const totalSeconds = Math.max(0, Math.floor(seconds));
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const remainder = totalSeconds % 60;

	if (hours > 0) {
		return `${hours}:${minutes.toString().padStart(2, "0")}:${remainder.toString().padStart(2, "0")}`;
	}

	return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

export function parseTimecode(value: string): number | null {
	const trimmed = value.trim();
	if (!trimmed) {
		return null;
	}

	if (!trimmed.includes(":")) {
		const seconds = Number(trimmed);
		return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
	}

	const parts = trimmed.split(":");
	if (parts.length < 2 || parts.length > 3) {
		return null;
	}

	const numbers = parts.map((part) => Number(part));
	if (numbers.some((part) => !Number.isFinite(part) || part < 0)) {
		return null;
	}

	const [first = 0, second = 0, third = 0] = numbers;
	if (parts.length === 2) {
		return first * 60 + second;
	}

	return first * 3600 + second * 60 + third;
}
