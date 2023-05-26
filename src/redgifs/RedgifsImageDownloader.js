import { log } from "../lib/basics.js";
import { download } from "../lib/download.js";

export class RedgifsImageDownloader {
	async run() {
		const key = location.pathname.replace(/^.+\/([^\/]+)$/, '$1');
		const status = GM_getValue(`r-sd--i-redgifs--${key}`);
		if (status != 'waiting') {
			log('not from downloader');
			return;
		}
		log(status);
		let found = false;
		let fsButton;
		while (!found) {
			log('finding full-screen button');
			const buttons = $$('.sideBar > .fs > svg');
			if (buttons.length > 0) {
				log('found');
				found = true;
				fsButton = buttons[0];
			} else {
				log('not found');
				await wait(100);
			}
		}
		while (!document.fullscreenElement) {
			fsButton.dispatchEvent(new MouseEvent('click', {bubbles:true}));
			await wait(200);
		}
		let url = '';
		while (url.toLowerCase().search(`${key}-large.`) == -1) {
			log(url);
			await wait(100);
			url = $('.previewFeed > .player > img.thumbnail').src;
		}
		const fn = GM_getValue(`r-sd--i-redgifs--${key}--filename`);
		GM_setValue(`r-sd--i-redgifs--${key}`, 'downloading');
		document.exitFullscreen();
		try {
			await download({
				url: url,
				name: fn,
			});
			GM_setValue(`r-sd--i-redgifs--${key}`, 'done');
		} catch (ex) {
			log('FAILED', ex);
			GM_setValue(`r-sd--i-redgifs--${key}`, 'error');
		}
	}
}