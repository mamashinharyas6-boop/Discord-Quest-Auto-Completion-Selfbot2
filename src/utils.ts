import { Constants } from './constants';
import { fetch } from 'undici';
import * as readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';

export class Utils extends null {
	public static makeHeaders(init: HeadersInit | undefined) {
		let myHeaders = new Headers(init);
		const isAndroidRequest = myHeaders.get('AndroidRequest') === 'true';
		myHeaders.delete('AndroidRequest');
		myHeaders.set(
			'Authorization',
			myHeaders.get('Authorization')!.replace('Bot ', ''),
		);
		myHeaders.append('accept-language', 'en-US');
		myHeaders.append('x-debug-options', 'bugReporterEnabled');
		myHeaders.append('x-discord-locale', 'en-US');
		myHeaders.append('x-discord-timezone', 'Asia/Saigon');
		if (isAndroidRequest) {
			myHeaders = Utils.mergeHeaders(
				myHeaders,
				Utils.makeAndroidHeaders(true),
			);
		} else {
			myHeaders = Utils.mergeHeaders(
				myHeaders,
				Utils.makeDesktopHeaders(true, true),
			);
		}
		return myHeaders;
	}
	public static makeDesktopHeaders(
		withDiscordClientProperties = true,
		withOriginAndReferer = true,
	) {
		const myHeaders = new Headers();
		myHeaders.append('accept-language', 'vi');
		myHeaders.append('User-Agent', Constants.USER_AGENT);
		if (withOriginAndReferer) {
			myHeaders.append('origin', 'https://discord.com');
			myHeaders.append('referer', 'https://discord.com/channels/@me');
		}
		myHeaders.append('pragma', 'no-cache');
		myHeaders.append('priority', 'u=1, i');
		myHeaders.append(
			'sec-ch-ua',
			'"Not)A;Brand";v="8", "Chromium";v="138"',
		);
		myHeaders.append('sec-ch-ua-mobile', '?0');
		myHeaders.append('sec-ch-ua-platform', '"Windows"');
		myHeaders.append('sec-fetch-dest', 'empty');
		myHeaders.append('sec-fetch-mode', 'cors');
		myHeaders.append('sec-fetch-site', 'same-origin');
		if (withDiscordClientProperties) {
			myHeaders.append(
				'x-super-properties',
				Buffer.from(JSON.stringify(Constants.Properties)).toString(
					'base64',
				),
			);
		}
		return myHeaders;
	}
	public static makeAndroidHeaders(withDiscordClientProperties = true) {
		const myHeaders = new Headers();
		myHeaders.append('accept-language', 'vi');
		myHeaders.append('User-Agent', Constants.ANDROID_USER_AGENT);
		if (withDiscordClientProperties) {
			myHeaders.append(
				'x-super-properties',
				Buffer.from(
					JSON.stringify(Constants.ANDROID_Properties),
				).toString('base64'),
			);
		}
		return myHeaders;
	}
	public static mergeHeaders(a: Headers, b: Headers) {
		const result = new Headers(a);
		b.forEach((value, key) => {
			result.set(key, value);
		});
		return result;
	}
	public static async authorizeDiscordSays(
		applicationId: string,
		authCode: string,
	): Promise<{ token: string | false; error: any }> {
		let error = null;
		const headers = Utils.makeDesktopHeaders(false, false);
		headers.append('Content-Type', 'application/json');
		const token = await fetch(
			`https://${applicationId}.discordsays.com/.proxy/acf/authorize`,
			{
				body: JSON.stringify({ code: authCode }),
				method: 'POST',
				headers,
			},
		)
			.then(
				(res) =>
					res.json() as any as {
						token: string;
					},
			)
			.then((data) => data.token)
			.catch((e) => {
				error = e instanceof Error ? e.message : String(e);
				return '';
			});
		return { token, error };
	}
	public static async progressDiscordSays(
		applicationId: string,
		token: string,
		questTarget: number,
	): Promise<{ success: boolean; error: any }> {
		let error = null;
		const headers = Utils.makeDesktopHeaders(false, false);
		headers.append('Content-Type', 'application/json');
		headers.append('x-auth-token', token);
		const success = await fetch(
			`https://${applicationId}.discordsays.com/.proxy/acf/quest/progress`,
			{
				headers,
				body: JSON.stringify({ progress: questTarget }),
				method: 'POST',
			},
		)
			.then((res) => res.ok)
			.catch((e) => {
				error = e instanceof Error ? e.message : String(e);
				return false;
			});
		return { success, error };
	}
	public static async askQuestion(promptText: string): Promise<string> {
		const rl = readline.createInterface({ input, output });
		try {
			const answer = await rl.question(promptText);
			return answer;
		} finally {
			rl.close();
		}
	}
	public static async updateLatestBuildVersion(): Promise<void> {
		try {
			console.info(
				'Fetching latest Discord build number (Desktop Version)...',
			);
			const response = await fetch('https://discord.com/app', {
				headers: { 'User-Agent': Constants.USER_AGENT },
			});
			if (!response.ok) {
				console.warn(
					`Failed to fetch Discord page (${response.status})`,
				);
				return;
			}
			const html = await response.text();
			// Find JS asset files
			let scripts = Array.from(
				html.match(/\/assets\/web.([a-f0-9]+)\.js/g) || [],
			);
			if (!scripts || scripts.length === 0) {
				console.warn('No JS assets found in HTML.');
				return;
			}

			for (const scriptPath of scripts) {
				try {
					const assetUrl = `https://discord.com${scriptPath}`;

					const assetResponse = await fetch(assetUrl, {
						headers: { 'User-Agent': Constants.USER_AGENT },
					});
					if (!assetResponse.ok) continue;
					const jsContent = await assetResponse.text();
					const match = jsContent.match(
						/buildNumber["\s:]+["\s]*(\d{5,7})/,
					);
					if (match) {
						const buildNumber = parseInt(match[1], 10);
						console.log(`Build number: ${buildNumber}`);
						Constants.Properties.client_build_number = buildNumber;
						return;
					}
				} catch {
					continue;
				}
			}
			console.warn('Build number not found in any JS assets.');
			return;
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			console.error('Error fetching latest build number:', errorMessage);
			return;
		}
	}
	public static async extractWebhookInfo(): Promise<{ id: string; token: string } | null> {
		const webhookUrl = process.env.WEBHOOK_URL;
		if (!webhookUrl) {
			console.warn('WEBHOOK_URL not set in environment variables.');
			return null;
		}
		// Check valid
		const req = await fetch(webhookUrl);
		if (!req.ok) {
			console.warn(`Failed to fetch webhook URL (${req.status})`);
			return null;
		}
		const parts = webhookUrl.split('/');
		const webhookPathIndex = parts.findIndex((part) => part === 'webhooks');
		if (webhookPathIndex === -1 || parts.length < webhookPathIndex + 3) {
			console.warn('Invalid webhook URL format.');
			return null;
		}
		const id = parts[webhookPathIndex + 1];
		const token = parts[webhookPathIndex + 2];
		return { id, token };
	}
}
