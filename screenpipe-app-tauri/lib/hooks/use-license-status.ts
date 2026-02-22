import { useEffect, useState, useCallback } from "react";
import { useSettings } from "./use-settings";
import { getStartDate } from "../actions/get-start-date";

export type LicenseStatus = {
	status: "loading" | "trial" | "trial_expiring" | "expired" | "licensed";
	daysRemaining: number | null;
	plan: "annual" | "lifetime" | null;
	isRecordingAllowed: boolean;
	isSearchAllowed: boolean;
};

const LOADING_STATUS: LicenseStatus = {
	status: "loading",
	daysRemaining: null,
	plan: null,
	isRecordingAllowed: false,
	isSearchAllowed: true,
};

function daysSince(isoString: string | null | undefined): number {
	if (!isoString) return Infinity;
	const dt = new Date(isoString);
	if (isNaN(dt.getTime())) return Infinity;
	return Math.floor((Date.now() - dt.getTime()) / 86400000);
}

export function useLicenseStatus(): LicenseStatus {
	const { settings } = useSettings();
	const [status, setStatus] = useState<LicenseStatus>(LOADING_STATUS);

	const check = useCallback(async () => {
		// Step 1: Check license (cached validation only — online re-validation is Task 2.4)
		if (settings.licenseKey) {
			const cacheAge = daysSince(settings.licenseValidatedAt);
			if (cacheAge < 7) {
				setStatus({
					status: "licensed",
					daysRemaining: null,
					plan: (settings.licensePlan as "annual" | "lifetime") ?? null,
					isRecordingAllowed: true,
					isSearchAllowed: true,
				});
				return;
			}
			// Cache older than 7 days and no online re-validation yet → expired
			setStatus({
				status: "expired",
				daysRemaining: 0,
				plan: null,
				isRecordingAllowed: false,
				isSearchAllowed: true,
			});
			return;
		}

		// Step 2: No license — check trial
		if (!settings.firstSeenAt) {
			// Settings not loaded yet or migration hasn't run
			return;
		}

		let trialStart: Date;
		try {
			const dbResult = await getStartDate();
			// getStartDate() returns a Date on success, or { error: string } on failure
			if (dbResult instanceof Date && !isNaN(dbResult.getTime())) {
				const firstSeen = new Date(settings.firstSeenAt);
				// Use LATEST (most recent) — prevents existing users from instant lockout
				trialStart = dbResult > firstSeen ? dbResult : firstSeen;
			} else {
				// DB query failed or returned error object — use firstSeenAt only
				trialStart = new Date(settings.firstSeenAt);
			}
		} catch {
			// Sidecar not ready yet — use firstSeenAt only
			trialStart = new Date(settings.firstSeenAt);
		}

		const ageDays = Math.floor(
			(Date.now() - trialStart.getTime()) / 86400000
		);

		if (ageDays <= 10) {
			setStatus({
				status: "trial",
				daysRemaining: 15 - ageDays,
				plan: null,
				isRecordingAllowed: true,
				isSearchAllowed: true,
			});
		} else if (ageDays <= 15) {
			setStatus({
				status: "trial_expiring",
				daysRemaining: 15 - ageDays,
				plan: null,
				isRecordingAllowed: true,
				isSearchAllowed: true,
			});
		} else {
			setStatus({
				status: "expired",
				daysRemaining: 0,
				plan: null,
				isRecordingAllowed: false,
				isSearchAllowed: true,
			});
		}
	}, [settings.licenseKey, settings.licenseValidatedAt, settings.licensePlan, settings.firstSeenAt]);

	useEffect(() => {
		check();
		const interval = setInterval(check, 60_000);
		return () => clearInterval(interval);
	}, [check]);

	return status;
}
