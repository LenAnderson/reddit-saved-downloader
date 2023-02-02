import { $, $$, log, wait } from "../lib/basics.js";
import { download } from "../lib/download.js";

export class RedgifsDownloader {
	async run() {
		const key = location.pathname.replace(/^.+\/([^\/]+)$/, '$1');
		let found = false;
		let qualityButton;
		while (!found) {
			log('finding quality button...');
			const buttons = $$('.player-buttons > .options-buttons > .has-badge').filter(it=>$(it, '.icon-badge').textContent == 'SD').concat($$('.gif-quality'));
			if (buttons.length > 0) {
				log('found');
				found = true;
				qualityButton = buttons[0];
			} else {
				log('not found');
				await wait(100);
			}
		}
		qualityButton.click();
		await wait(100);
		const url = $('.player-video > video, .videoWrapper > video').src;
		const fn = GM_getValue(`r-sd--redgifs--${key}--filename`);
		GM_setValue(`r-sd--redgifs--${key}`, 'downloading');
		try {
			await download({
				url: url,
				name: fn,
			});
			GM_setValue(`r-sd--redgifs--${key}`, 'done');
		} catch (ex) {
			log('FAILED', ex);
			GM_setValue(`r-sd--redgifs--${key}`, 'error');
		}

	}
}