export type ValidationResult = {
	valid: boolean;
	status: "active" | "expired" | "not_found";
	plan: "annual" | "lifetime" | null;
	error: string | null;
};

export async function validateLicense(key: string): Promise<ValidationResult> {
	const trimmed = key.trim();
	if (!trimmed) {
		return { valid: false, status: "not_found", plan: null, error: "empty key" };
	}

	try {
		const res = await fetch(
			"https://api.lemonsqueezy.com/v1/licenses/validate",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ license_key: trimmed }),
			}
		);

		if (!res.ok) {
			return { valid: false, status: "not_found", plan: null, error: `http ${res.status}` };
		}

		const data = await res.json();

		// Invalid key — LemonSqueezy returns { valid: false, error: "..." }
		if (!data.valid) {
			const lsStatus = data.license_key?.status;
			return {
				valid: false,
				status: lsStatus === "expired" ? "expired" : "not_found",
				plan: null,
				error: data.error ?? null,
			};
		}

		// Valid key — determine plan from product name
		const productName: string = data.meta?.product_name ?? "";
		const plan: "annual" | "lifetime" | null = productName
			.toLowerCase()
			.includes("lifetime")
			? "lifetime"
			: productName.toLowerCase().includes("annual")
				? "annual"
				: null;

		return { valid: true, status: "active", plan, error: null };
	} catch (e) {
		return {
			valid: false,
			status: "not_found",
			plan: null,
			error: "network",
		};
	}
}
