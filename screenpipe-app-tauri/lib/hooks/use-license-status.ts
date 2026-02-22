import { useEffect, useState, useCallback, useRef } from "react";
import { useSettings } from "./use-settings";
import { getStartDate } from "../actions/get-start-date";
import { validateLicense } from "../actions/validate-license";

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
	const { settings, updateSettings } = useSettings();
	const [status, setStatus] = useState<LicenseStatus>(LOADING_STATUS);
	const revalidatingRef = useRef(false);

	const check = useCallback(async () => {
		// Step 1: Check license
		if (settings.licenseKey) {
			const cacheAge = daysSince(settings.licenseValidatedAt);

			// Fresh cache (< 24h) — trust it, no online check
			if (cacheAge < 1) {
				setStatus({
					status: "licensed",
					daysRemaining: null,
					plan: (settings.licensePlan as "annual" | "lifetime") ?? null,
					isRecordingAllowed: true,
					isSearchAllowed: true,
				});
				return;
			}

			// Cache 1-7 days old — show licensed, re-validate in background
			if (cacheAge < 7) {
				setStatus({
					status: "licensed",
					daysRemaining: null,
					plan: (settings.licensePlan as "annual" | "lifetime") ?? null,
					isRecordingAllowed: true,
					isSearchAllowed: true,
				});
				// Background re-validation (non-blocking, skip if already running)
				if (!revalidatingRef.current) {
					revalidatingRef.current = true;
					validateLicense(settings.licenseKey).then(async (result) => {
						if (result.valid) {
							await updateSettings({ licenseValidatedAt: new Date().toISOString() });
						} else if (result.status === "expired") {
							await updateSettings({ licenseKey: null, licenseValidatedAt: null, licensePlan: null });
						}
						// Network error with fresh-enough cache — do nothing, keep licensed
					}).finally(() => { revalidatingRef.current = false; });
				}
				return;
			}

			// Cache >= 7 days — attempt online re-validation before declaring expired
			if (revalidatingRef.current) {
				// Another check() is already re-validating — don't flash expired
				return;
			}
			revalidatingRef.current = true;
			try {
				const result = await validateLicense(settings.licenseKey);
				if (result.valid) {
					await updateSettings({ licenseValidatedAt: new Date().toISOString() });
					setStatus({
						status: "licensed",
						daysRemaining: null,
						plan: (settings.licensePlan as "annual" | "lifetime") ?? null,
						isRecordingAllowed: true,
						isSearchAllowed: true,
					});
					return;
				}
				if (result.status === "expired") {
					await updateSettings({ licenseKey: null, licenseValidatedAt: null, licensePlan: null });
				}
				// License invalid or expired — fall through to expired
			} catch {
				// Network error — fall through to expired (cache too old)
			} finally {
				revalidatingRef.current = false;
			}

			// Cache stale + re-validation failed or license expired
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

		if (isNaN(trialStart.getTime())) {
			// Invalid date in firstSeenAt — don't lock the user out
			return;
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
	}, [settings.licenseKey, settings.licenseValidatedAt, settings.licensePlan, settings.firstSeenAt, updateSettings]);

	useEffect(() => {
		check();
		const interval = setInterval(check, 60_000);
		return () => clearInterval(interval);
	}, [check]);

	return status;
}
