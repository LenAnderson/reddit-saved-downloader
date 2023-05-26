import { $, log, wait } from "./lib/basics.js";
import { download } from "./lib/download.js";
import { xhrHtml } from "./lib/xhr.js";

export class Thing {
	/**@type{String}*/ subreddit;
	/**@type{String}*/ user;
	/**@type{String}*/ title;
	/**@type{String}*/ url;
	/**@type{String}*/ domain;

	/**@type{String}*/ target;

	/**@type{HTMLElement}*/ element;

	/**@type{Boolean}*/ isDownloaded = false;

	/**@type{Function}*/ onUserChange;




	constructor(/**@type{HTMLElement}*/element) {
		this.element = element;

		this.subreddit = $(element, '.subreddit')?.textContent?.replace(/^(r\/)?/, '');
		this.user = $(element, '.author')?.textContent;
		this.title = $(element, 'a.title')?.textContent;
		this.url = $(element, 'a.title')?.href;
		this.domain = element.getAttribute('data-domain');

		const actions = document.createElement('div'); {
			actions.classList.add('r-sd--thing--actions');
			const titleBtn = document.createElement('button'); {
				titleBtn.classList.add('r-sd--thing--actions--title');
				titleBtn.textContent = '✏️';
				titleBtn.title = 'assign to group';
				titleBtn.addEventListener('click', ()=>this.changeTitle());
				actions.append(titleBtn);
			}
			const userBtn = document.createElement('button'); {
				userBtn.classList.add('r-sd--thing--actions--user');
				userBtn.textContent = '👤';
				userBtn.title = 'user';
				userBtn.addEventListener('click', ()=>this.changeUser());
				actions.append(userBtn);
			}
			$(element, '.thumbnail')?.insertAdjacentElement('afterend', actions);
		}
	}




	changeTitle() {
		const title = prompt('Title', this.title);
		if (title) {
			//TODO handle changed title
			log('NOT IMPLEMENTED', 'Thing.changeTitle', this);
		}
	}

	changeUser() {
		const user = prompt('User', this.user);
		if (user && this.onUserChange) {
			this.onUserChange(user);
		}
	}




	async download(/**@type{String}*/folder) {
		log('Thing.download', this, folder);
		let handled = false;
		let success = false;
		if (this.element.getAttribute('data-type') == 'comment') {
			log('COMMENT');
			const urls = $$(this.element, '.usertext-body > .md a');
			const hlist = [];
			const slist = [];
			for (const url of urls) {
				const result = await this.downloadUrl(folder, url);
				hlist.push(result.handled);
				slist.push(result.success);
			}
			handled = !hlist.find(it=>!it);
			success = !slist.find(it=>!it);
		} else {
			({handled, success} = await this.downloadUrl(folder));
		}
		if (handled) {
			if (success) {
				this.element.classList.add('r-sd--success');
				this.isDownloaded = true;
			} else {
				this.element.classList.add('r-sd--failure');
				this.isDownloaded = false;
			}
		} else {
			this.isDownloaded = false;
		}
	}

	async downloadUrl(/**@type{String}*/folder=null, /**@type{String}*/url=null) {
		log('Thing.downloadUrl', this, folder, url);
		let handled = false;
		let success = false;

		let domain = url ? url.replace(/^(?:[^:]+:\/\/)([^\/]+)(?:\/.+)$/, '$1') : this.element.getAttribute('data-domain');
		url = url || this.element.getAttribute('data-url');
		log(domain, url);

		const today = new Date();
		const ts = [
			today.getFullYear(),
			`00${today.getMonth()+1}`.split('').slice(-2).join(''),
			`00${today.getDate()}`.split('').slice(-2).join(''),
		].join('-');

		switch (domain) {
			case 'i.redgifs.com':
			case 'v3.redgifs.com':
			case 'redgifs.com': {
				let dlKey = 'redgifs';
				if (domain == 'i.redgifs.com') {
					dlKey = 'i-redgifs';
				}
				handled = true;
				const key = url.replace(/^.+\/([^\/]+)$/, '$1').split('.')[0];
				GM_setValue(`r-sd--${dlKey}--${key}`, 'waiting');
				GM_setValue(`r-sd--${dlKey}--${key}--filename`, `${this.target}/${folder}/Random/${key}.mp4`);
				const red = GM_openInTab(`${url}#r-sd--dl-this`, {active:true});
				let done = false;
				while (!done) {
					await wait(100);
					const status = GM_getValue(`r-sd--${dlKey}--${key}`);
					log(key, status);
					switch (status) {
						case 'waiting': {
							break;
						}
						case 'downloading': {
							break;
						}
						case 'done': {
							done = true;
							success = true;
							break;
						}
						case 'error': {
							done = true;
							success = false;
							break;
						}
						default: {
							log(key, 'unknown status');
							break;
						}
					}
				}
				red.close();
				break;
			}
			case 'thumbs.gfycat.com':
			case 'gfycat.com': {
				handled = true;
				url = url.replace('thumbs.gfycat.com', 'gfycat.com');
				const result = await xhrHtml({url:url});
				const mediaUrl = $(result, '[property="og:video"]').getAttribute('content').replace('thumbs.gfycat', 'giant.gfycat').replace('-mobile.mp4', '.mp4');
				const fn = `${ts} ${mediaUrl.replace(/^.+\/([^\/]+)$/, '$1')}`;
				try {
					await download({
						url: mediaUrl,
						name: `${this.target}/${folder}/Random/${fn}`
					});
					success = true;
				} catch (ex) {
					success = false;
					log('FAILED', this, url, ex);
				}
				break;
			}
			case 'imgur.com':
			case 'i.imgur.com': {
				handled = true;
				const thingName = url.replace(/^.+\/([^\/]+)$/, '$1');
				try {
					const urls = await this.fetchImgur(url);
					for (const mediaUrl of urls) {
						const fn = `${ts} ${mediaUrl.replace(/^.+\/([^\/]+)$/, '$1')}`;
						await download({
							url: mediaUrl,
							name: `${this.target}/${folder}/Random/${thingName}--${fn}`
						});
					}
					success = true;
				} catch (ex) {
					success = false;
					log('FAILED', this, url, ex);
				}
				break;
			}
			case 'i.redd.it': {
				handled = true;
				const fn = `${ts} ${url.replace(/^.+\/([^\/]+)$/, '$1')}`;
				try {
					await download({
						url: url,
						name: `${this.target}/${folder}/Random/${fn}`
					});
					success = true;
				} catch (ex) {
					success = false;
					log('FAILED', this, url, ex);
				}
				break;
			}
			case 'v.redd.it': {
				handled = true;
				try {
					let post = (await (await fetch(`${this.element.getAttribute('data-permalink')}.json`)).json())[0].data.children[0].data;
					while (post.crosspost_parent_list && post.crosspost_parent_list.length) {
						post = post.crosspost_parent_list[0];
					}
					const media = (post.media ?? post.secure_media)?.reddit_video;
					if (media) {
						const mediaUrl = media.fallback_url;
						const fn = `${ts} ${mediaUrl.replace(/^.+\/([^\/]+)$/, '$1')}`;
						await download({
							url: mediaUrl,
							name: `${this.target}/${folder}/Random/${fn}.mp4`
						});
						success = true;
					} else {
						success = false;
					}
				} catch (ex) {
					success = false;
					log('FAILED', this, url, ex);
				}
				break;
			}
			case 'reddit.com': {
				const html = document.createElement('div');
				html.innerHTML = $(this.element, '.expando').getAttribute('data-cachedhtml');
				const gallery = $(html, '.media-gallery');
				if (gallery) {
					handled = true;
					try {
						const post = $(this.element, '.entry > .top-matter > .title > .title').textContent.trim();
						const postId = this.element.getAttribute('data-fullname');
						const tiles = $$(gallery, '.gallery-preview > .media-preview-content > a');
						for (let i=0;i<tiles.length;i++) {
							const num = `${'0'.repeat(3)}${i}`.split('').slice(-3).join('');
							const type = tiles[i].href.replace(/^.+?(?:\.([^.?]+)\?.+)?$/, '$1');
							await download({
								url: type ? tiles[i].href : $(tiles[i], 'img').src,
								name: `${this.target}/${folder}/${ts} ${post.replace(/[^a-z0-9]+/ig, '-')}_${postId}/${post.replace(/[^a-z0-9]+/i, '-')}_${num}.${type || 'jpg'}`
							});
						}
						success = true;
					} catch (ex) {
						success = false;
						log('FAILED', this, url, ex);
					}
				}
				break;
			}
			case 'i.imx.to': {
				handled = true;
				const fn = `${ts} ${url.replace(/^.+\/([^\/]+)$/, '$1')}`;
				try {
					await download({
						url: url,
						name: `${this.target}/${folder}/Random/${fn}`
					});
					success = true;
				} catch (ex) {
					success = false;
					log('FAILED', this, url, ex);
				}
				break;
			}
			default: {
				log('UNHANDLED', this);
				break;
			}
		}

		await wait(500);
		return {handled:handled, success:success};
	}


	async fetchImgur(/**@type{String}*/url) {
		const imgurClientId = '73c75cbd34b8579';
		if (url.search(/^https?:\/\/i\.imgur\.com/) === 0) {
			// direct link to imgur image: only replace ".gif" and ".gifv" with ".mp4"
			return [url.replace(/\.(gifv|gif)$/, '.mp4')];
		}
		if (url.search(/\/a\/|\/gallery\//) > -1) {
			// link to an album: get album info and return direct links
			const parts = url.replace(/^https?:\/\/[^/]+/, '').split('/');
			const id = parts[parts.length-1];
			const result = await xhr({
				url: `https://api.imgur.com/3/album/${id}`,
				headers: {
					'Authorization': `Client-ID ${imgurClientId}`
				}
			});
			const data = JSON.parse(result.responseText);
			return data.data.images.map(it=>it.link.replace(/\.(gifv|gif)$/, '.mp4'));
		}
		// link to an image page: figure out if image or video and return direct link
		const parts = url.replace(/^https?:\/\/[^/]+/, '').split('/');
		const id = parts[parts.length-1];
		log('imgur:', `https://api.imgur.com/3/image/${id}`);
		const result = await xhr({
			url: `https://api.imgur.com/3/image/${id}`,
			headers: {
				'Authorization': `Client-ID ${imgurClientId}`
			}
		});
		if (result.status != 200 && url.search(/\.(jpg|gif|gifv|png|mp4)$/)>-1) {
			return [url.replace(/\.(gifv|gif)$/, '.mp4')];
		}
		const data = JSON.parse(result.responseText);
		return [data.data.link.replace(/\.(gifv|gif)$/, '.mp4')];
	}


	async unsave() {
		log('Thing.unsave', this);
		$(this.element, '.link-unsave-button > a, .comment-unsave-button > a').click();
		await wait(100);
		this.element.remove();
	}
}