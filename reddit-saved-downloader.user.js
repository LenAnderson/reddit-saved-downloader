// ==UserScript==
// @name         Reddit - Saved Downloader
// @namespace    https://github.com/LenAnderson/
// @downloadURL  https://github.com/LenAnderson/reddit-saved-downloader/raw/master/reddit-saved-downloader.user.js
// @version      1.14
// @description  Simple way to download media from saved posts and comments.
// @author       LenAnderson
// @match        https://www.reddit.com/user/*/saved/*
// @match        https://www.reddit.com/user/*/saved
// @match        https://*.redgifs.com/watch/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=reddit.com
// @grant        GM_download
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_openInTab
// @connect      gfycat.com
// @connect      redgifs.com
// @connect      api.imgur.com
// @connect      v.redd.it
// @connect      i.imx.to
// ==/UserScript==






(function() {
    'use strict';

// ---------------- IMPORTS  ----------------



// src\lib\basics.js
const log = (...msgs)=>console.log.call(console.log, '[R-GS]', ...msgs);

const $ = (root,query)=>(query?root:document).querySelector(query?query:root);
const $$ = (root,query)=>Array.from((query?root:document).querySelectorAll(query?query:root));

const wait = async(millis)=>(new Promise(resolve=>setTimeout(resolve,millis)));


// src\lib\BindingTarget.js
class BindingTarget {
	/**@type {HTMLElement}*/ target;
	/**@type {String}*/ attributeName;
	/**@type {Function}*/ targetConverter;
	/**@type {Function}*/ sourceConverter;
	constructor(
		/**@type {HTMLElement}*/ target,
		/**@type {String}*/ attributeName,
		/**@type {Function}*/ targetConverter,
		/**@type {Function}*/ sourceConverter
	) {
		this.target = target;
		this.attributeName = attributeName;
		this.targetConverter = targetConverter;
		this.sourceConverter = sourceConverter;
	}
}


// src\lib\Binding.js


class Binding {
	/**@type {Binding[]}*/ static bindings = [];
	/**@type {Object}*/ source;
	/**@type {String}*/ propertyName;
	/**@type {BindingTarget[]}*/ targets = [];
	/**@type {Function}*/ theGetter;
	/**@type {Function}*/ theSetter;
	/**@type {Boolean}*/ isProperty = false;
	value;
	static create(source, propertyName, target, attributeName, targetConverter=v=>v, sourceConverter=v=>v) {
		let binding = this.bindings.find(it=>it.source==source&&it.propertyName==propertyName);
		if (!binding) {
			binding = new Binding(source, propertyName);
			this.bindings.push(binding);
		}
		binding.targets.push(new BindingTarget(target, attributeName, targetConverter, sourceConverter));
		binding.setTargetValue();
		switch (target.tagName) {
			case 'TEXTAREA':
			case 'INPUT': {
				switch (attributeName) {
					case 'value':
					case 'checked': {
						switch (target.type) {
							case 'radio': {
								target.addEventListener('change', ()=>target.checked?binding.setter(target.value):false);
								break;
							}
							default: {
								target.addEventListener('change', ()=>binding.setter(sourceConverter(target[attributeName])));
								break;
							}
						}
						break;
					}
				}
				break;
			}
		}
	}
	constructor(source, propertyName) {
		this.source = source;
		this.propertyName = propertyName;
		
		this.value = this.source[this.propertyName];
		const p = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(source), propertyName);
		if (p) {
			this.isProperty = true;
			this.theGetter = p.get.bind(source);
			this.theSetter = p.set.bind(source);
		} else {
			this.theGetter = ()=>this.value;
			this.theSetter = (value)=>this.value=value;
		}
		Object.defineProperty(source, propertyName, {
			get: this.getter.bind(this),
			set: this.setter.bind(this)
		});
		this.setTargetValue();
	}
	getter() {
		return this.theGetter();
	}
	setter(value) {
		let changed = false;
		if (this.isProperty) {
			this.theSetter(value);
			changed = this.getValueOf(this.value) != this.getValueOf(this.theGetter())
		} else {
			changed = this.theGetter() != value;
		}
		if (changed) {
			this.value = this.isProperty ? this.theGetter() : value;
			this.setTargetValue();
		}
	}
	getValueOf(it) {
		if (it !== null && it !== undefined && it.valueOf) {
			return it.valueOf();
		}
		return it;
	}
	setTargetValue() {
		this.targets.forEach(target=>{
			if (target.attributeName.substring(0,5) == 'data-') {
				target.target.setAttribute(target.attributeName, target.targetConverter(this.theGetter()));
			} else {
				target.target[target.attributeName] = target.targetConverter(this.theGetter());
			}
		});
	}
}


// src\lib\download.js
const download = async(details)=>{
	log('download', details);
	details.name = details.name.replace(/\?.*$/, '');
	return new Promise((resolve,reject)=>{
		details.onload = resolve;
		details.onerror = reject;
		GM_download(details);
	});
};


// src\lib\xhr.js


const xhr = async(details)=>{
	log('xhr', details);
	return new Promise((resolve,reject)=>{
		details.onload = resolve;
		details.onerror = reject;
		GM_xmlhttpRequest(details);
	});
};

const xhrHtml = async(details)=>{
	log('xhrHtml', details);
	const response = await xhr(details);
	const html = document.createElement('div');
	html.innerHTML = response.responseText;
	return html;
}


// src\Thing.js




class Thing {
	/**@type{String}*/ subreddit;
	/**@type{String}*/ user;
	/**@type{String}*/ title;
	/**@type{String}*/ url;
	/**@type{String}*/ domain;

	/**@type{String}*/ target;

	/**@type{HTMLElement}*/ element;

	/**@type{Boolean}*/ isDownloaded = false;

	/**@type{Function}*/ onUserChange;

	get isUnsaved() {
		return $(this.element, '.link-unsave-button > a, .comment-unsave-button > a')?.textContent?.toLowerCase()?.search('unsave') ?? -1 == -1;
	}




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


// src\Group.js




class Group {
	/**@type{String}*/ subreddit;
	/**@type{Boolean}*/ isSaved;

	/**@type{String}*/ originalTitle;
	/**@type{String}*/ title;

	/**@type{Thing[]}*/ things = [];

	/**@type{HTMLElement}*/ element;
	/**@type{HTMLElement}*/ header;
	/**@type{HTMLElement}*/ actions;

	/**@type{Boolean}*/ isRendered;

	/**@type{Boolean}*/ isDownloading = false;
	/**@type{Number}*/ downloaded = 0;

	/**@type{Function}*/ onUpdate;


	get isNonSpec() {
		return JSON.parse(localStorage.getItem('r-sd--nonSpec') ?? '[]').indexOf(this.subreddit) != -1;
	}
	set isNonSpec(value) {
		let data = JSON.parse(localStorage.getItem('r-sd--nonSpec') ?? '[]');
		if (value) {
			data.push(this.subreddit);
			this.things.forEach(it=>it.element.classList.add('r-sd--nonSpec'));
			this.delete();
		} else {
			data = data.filter(it=>it!=this.subreddit);
			this.things.forEach(it=>it.element.classList.remove('r-sd--nonSpec'));
		}
		localStorage.setItem('r-sd--nonSpec', JSON.stringify(data));
	}




	constructor(/**@type{String}*/subreddit, /**@type{String}*/title, /**@type{Boolean}*/isSaved) {
		this.subreddit = subreddit;
		this.originalTitle = title;
		this.title = title;
		this.isSaved = isSaved;

		this.buildDom();
	}


	save() {
		log('Group.save', this);
		const data = JSON.parse(localStorage.getItem('r-sd--groups') ?? '[]');
		const item = data.find(it=>it.title==this.originalTitle);
		const targetItem = data.find(it=>it.title==this.title);
		if (item) {
			item.subreddit = this.subreddit;
			item.title = this.title;
			localStorage.setItem('r-sd--groups', JSON.stringify(data));
		} else if (targetItem) {
			this.delete();
		} else {
			data.push({subreddit:this.subreddit, title:this.title});
			localStorage.setItem('r-sd--groups', JSON.stringify(data));
		}
		this.originalTitle = this.title;
		this.isSaved = true;
		if (this.onUpdate) {
			this.onUpdate();
		}
	}
	delete() {
		log('Group.delete', this);
		let data = JSON.parse(localStorage.getItem('r-sd--groups') ?? '[]');
		data = data.filter(it=>it.title!=this.originalTitle);
		localStorage.setItem('r-sd--groups', JSON.stringify(data));
	}




	buildDom() {
		const element = document.createElement('div'); {
			this.element = element;
			element.classList.add('r-sd--group');

			const header = document.createElement('div'); {
				this.header = header;
				header.classList.add('r-sd--group--header');
	
				const title = document.createElement('div'); {
					title.classList.add('r-sd--group--title');
					Binding.create(this, 'title', title, 'textContent');
					header.append(title);
				}
	
				const sub = document.createElement('a'); {
					sub.classList.add('r-sd--group--subreddit');
					Binding.create(this, 'subreddit', sub, 'textContent', v=>`r/${v}`);
					Binding.create(this, 'subreddit', sub, 'href', v=>`/r/${v}`);
					header.append(sub);
				}

				element.append(header);
			}

			const actions = document.createElement('div'); {
				this.actions = actions;
				actions.classList.add('r-sd--group--actions');

				const titleBtn = document.createElement('button'); {
					titleBtn.textContent = 'title';
					titleBtn.title = 'Change Title\n = download directory'
					titleBtn.addEventListener('click', ()=>{
						this.title = prompt('Title', this.title) ?? this.title;
						this.save();
					});
					actions.append(titleBtn);
				}

				const subBtn = document.createElement('button'); {
					subBtn.textContent = 'sub';
					subBtn.title = 'Change Subreddit'
					subBtn.addEventListener('click', ()=>{
						this.subreddit = prompt('Title', this.subreddit) ?? this.subreddit;
						this.save();
					});
					actions.append(subBtn);
				}

				const specBtn = document.createElement('button'); {
					specBtn.textContent = 'spec';
					Binding.create(this, 'isNonSpec', specBtn, 'title', v=>`make subreddit ${this.isNonSpec?'specific (single group)':'non-specific (multiple groups)'}`);
					specBtn.addEventListener('click', ()=>{
						this.isNonSpec = !this.isNonSpec;
					});
					actions.append(specBtn);
				}

				const downloadBtn = document.createElement('button'); {
					downloadBtn.textContent = 'download';
					downloadBtn.title = 'Download Content';
					downloadBtn.addEventListener('click', async()=>{
						await this.download();
					});
					actions.append(downloadBtn);
				}

				const unsaveBtn = document.createElement('button'); {
					unsaveBtn.textContent = 'unsave';
					unsaveBtn.title = 'Unsave Downloaded Content\n removes all green posts';
					unsaveBtn.addEventListener('click', async()=>{
						await this.unsave();
					});
					actions.append(unsaveBtn);
				}
				
				const prog = document.createElement('div'); {
					prog.classList.add('r-sd--progress');
					const inner = document.createElement('div'); {
						inner.classList.add('r-sd--progress--inner');
						Binding.create(this, 'downloaded', inner.style, 'width', v=>`${this.downloaded/this.things.length*100}%`);
						prog.append(inner);
					}
					const text = document.createElement('div'); {
						text.classList.add('r-sd--progress--text');
						Binding.create(this, 'downloaded', text, 'textContent', v=>this.downloaded ? `${Math.floor(this.downloaded)} / ${this.things.length}` : '');
						prog.append(text);
					}
					actions.append(prog);
				}

				element.append(actions);
			}
		}
	}


	addThing(/**@type{Thing}*/thing) {
		this.things.push(thing);

		if (this.isNonSpec) {
			thing.element.classList.add('r-sd--nonSpec');
		} else {
			thing.element.classList.remove('r-sd--nonSpec');
		}

		if (this.isRendered) {
			this.element.insertAdjacentElement('afterend', thing.element);
		}
	}


	render(/**@type{HTMLElement}*/siteTable) {
		siteTable.append(this.element);
		this.renderThings();
	}

	renderThings() {
		this.things.forEach(thing=>this.element.insertAdjacentElement('afterend', thing.element));
	}




	async download() {
		log('Group.download', this);
		this.downloaded = 0;
		for (const thing of this.things) {
			this.downloaded += 0.5;
			await thing.download(this.title);
			this.downloaded += 0.5;
		}
	}

	async unsave() {
		log('Group.unsave', this, this.things.filter(it=>it.isDownloaded||it.isUnsaved), this.things.filter(it=>it.isUnsaved));
		for (const thing of this.things.filter(it=>(it.isDownloaded||it.isUnsaved))) {
			await thing.unsave();
			this.things.splice(this.things.indexOf(thing), 1);
		}
	}
}


// src\Downloader.js






class Downloader {
	/**@type{HTMLAnchorElement}*/ navItem;

	/**@type{HTMLElement}*/ siteTable;
	/**@type{HTMLElement[]}*/ siteTableContent;

	/**@type{HTMLElement}*/ settingsBtn;
	/**@type{HTMLElement}*/ spinner;

	/**@type{Thing[]}*/ things = [];
	/**@type{Group[]}*/ groups = [];

	/**@type{Boolean}*/ isLoaded = false;

	/**@type{Object}*/ userLookup = {};
	/**@type{Object}*/ subredditLookup = {};
	/**@type{Object}*/ groupLookup = [];
	/**@type{Object}*/ nonSpec = [];
	/**@type{String}*/ target = 'reddit';


	get isActive() {
		return JSON.parse(localStorage.getItem('r-sd--isActive') ?? 'false');
	}
	set isActive(value) {
		localStorage.setItem('r-sd--isActive', JSON.stringify(value));
	}




	constructor() {
		log('Downloader.constructor');

		this.userLookup = JSON.parse(localStorage.getItem('r-sd--users') ?? '{}');
		this.subredditLookup = JSON.parse(localStorage.getItem('r-sd--subreddits') ?? '{}');
		this.groupLookup = JSON.parse(localStorage.getItem('r-sd--groups') ?? '[]');
		this.nonSpec = JSON.parse(localStorage.getItem('r-sd--nonSpec') ?? '[]');
		this.target = localStorage.getItem('r-ds--target') ?? 'reddit';

		this.groups = JSON.parse(localStorage.getItem('r-sd--groups') ?? '[]').map(it=>new Group(it.subreddit, it.title, true));
		this.groups.forEach(it=>it.onUpdate = ()=>this.groupUpdated(it));

		this.navItem = $('a[href*="/saved/"]');
		this.siteTable = $('#siteTable');

		const style = document.createElement('style'); {
			style.innerHTML = '@keyframes pulse-font-size {  0% {    transform: translateZ(0px);  }  100% {    transform: translateZ(100px);  }}.tabmenu li.selected a.r-sd--settings {  color: #808080;  border: none;}.tabmenu li.selected a.r-sd--settings:hover {  color: #000000;}.r-sd--spinner {  overflow: hidden;  perspective: 500px;  transform-style: preserve-3d;}.r-sd--spinner:after {  content: \"Loading...\";  animation-name: pulse-font-size;  animation-timing-function: ease-in-out;  animation-duration: 1s;  animation-iteration-count: infinite;  animation-direction: alternate;  display: block;  font-size: 24px;  line-height: 5;  text-align: center;}.r-sd--group {  margin-bottom: 2em;}.r-sd--group > .r-sd--group--header {  display: flex;  flex-direction: row;  align-items: center;  padding: 13px 0 3px 0;}.r-sd--group > .r-sd--group--header > .r-sd--group--title {  font-size: 12px;  font-weight: bold;  padding: 0.125em 0.5em;}.r-sd--group > .r-sd--group--header > .r-sd--group--subreddit {  font-size: 12px;  padding: 0.125em 0.5em;}.r-sd--group > .r-sd--group--actions {  display: flex;  flex-direction: row;  align-items: center;}.r-sd--group > .r-sd--group--actions > button {  background-color: #323232 !important;  border: 1px solid #646464 !important;  color: silver !important;  margin: 0 0.5em;}.r-sd--group > .r-sd--group--actions > .r-sd--progress {  background-color: #323232 !important;  border: 1px solid #5f99cf !important;  border-radius: 5px;  height: 20px;  margin: 0 0.5em;  position: relative;  width: 400px;}.r-sd--group > .r-sd--group--actions > .r-sd--progress > .r-sd--progress--inner {  background-color: rgba(239 247 255 / 0.125) !important;  border-radius: 5px;  height: 100%;  transition: ease-in-out 200ms;  width: 0%;}.r-sd--group > .r-sd--group--actions > .r-sd--progress > .r-sd--progress--text {  bottom: 0;  color: silver !important;  left: 0;  line-height: 20px;  position: absolute;  right: 0;  text-align: center;  top: 0;  z-index: 10;}.thing.r-sd--success {  background-color: rgba(0, 255, 0, 0.125) !important;}.thing.r-sd--failure {  background-color: rgba(255, 0, 0, 0.125) !important;}.thing .r-sd--thing--actions {  float: left;  margin-right: 5px;}.thing .r-sd--thing--actions > button {  font-size: 1em;  background-color: #323232 !important;  border: 1px solid #646464 !important;  color: silver !important;  margin: 0 0.5em;}.thing .r-sd--thing--actions > button.r-sd--thing--actions--title {  display: none;}.thing.r-sd--nonSpec .thing .r-sd--thing--actions > button {  display: inline;}.r-sd--divider {  background-color: #f5f5f5;  font-weight: bold;  color: #808080;  margin-top: 3em;  padding: 0.5em;  text-align: center;}';
			document.body.append(style);
		}
		
		if (this.isActive) {
			this.activate();
		}
		this.navItem.addEventListener('click', evt=>{
			evt.preventDefault();
			this.toggleActive();
		});
	}




	toggleActive() {
		log('Downloader.toggleActive');
		this.isActive = !this.isActive;
		if (this.isActive) {
			this.activate();
		} else {
			this.deactivate();
		}
	}

	async activate() {
		this.navItem.textContent = 'saved (DL)';
		this.siteTableContent = $$('#siteTable > *');
		this.siteTable.innerHTML = '';

		if (!this.settingsBtn) {
			const btn = document.createElement('a'); {
				this.settingsBtn = btn;
				btn.classList.add('r-sd--settings');
				btn.href = 'javascript:;';
				btn.textContent = '🛠';
				Binding.create(this, 'target', btn, 'title', v=>`target: ${v}`);
				btn.addEventListener('click', evt=>{
					evt.preventDefault();
					evt.stopPropagation();
					const target = prompt('Target Directory', this.target);
					if (target) {
						localStorage.setItem('r-ds--target', target);
						this.target = target;
						this.things.forEach(it=>it.target = target);
					}
				});
			}
		}
		this.navItem.append(this.settingsBtn);

		if (!this.isLoaded) {
			if (!this.spinner) {
				const spinner = document.createElement('div'); {
					this.spinner = spinner;
					spinner.classList.add('r-sd--spinner');
				}
			}
			this.siteTable.append(this.spinner);
			await this.loadThings();
			this.spinner.remove();
			this.isLoaded = true;
		}
		this.renderGroups();
	}

	deactivate() {
		if (this.settingsBtn) {
			this.settingsBtn.remove();
		}
		this.navItem.textContent = 'saved';
		this.siteTable.innerHTML = '';
		this.siteTableContent.forEach(it=>this.siteTable.append(it));
	}




	async loadThings() {
		log('Downloader.loadThings');
		this.things = [];
		let next = location.href.replace(/^(.+\/saved).*$/, '$1');
		let pages = 0;
		while (next && ++pages <= 10) {
			const html = await xhrHtml({url:next});
			next = $(html, '.nav-buttons [rel*="next"]')?.href;
			this.things.push(...$$(html, '#siteTable .thing').map(it=>{
				const thing = new Thing(it);
				thing.target = this.target;
				thing.onUserChange = (user)=>this.thingUserChanged(thing, user);
				return thing;
			}));
			await wait(10);
		}
		if (pages == 10) {
			log('stopped after 10 pages');
		}
		log('things:', this.things);

		this.things.forEach(thing=>{
			let group;
			if (this.userLookup[thing.user]) {
				group = this.groups.find(it=>it.title == this.userLookup[thing.user]);
				if (!group) {
					group = new Group(thing.user, this.userLookup[thing.user]);
					group.save();
					this.groups.push(group);
					group.onUpdate = ()=>this.groupUpdated(group);
				}
			} else if (this.nonSpec.indexOf(thing.subreddit) == -1) {
				const cleanSub = thing.subreddit.toLowerCase().replace(/\s+/g, '').replace(/[^a-z]+/g, '');
				group = this.groups.find(it=>cleanSub.search(it.subreddit.toLowerCase().replace(/\s+/g, '').replace(/[^a-z]+/g, '')) != -1);
				if (!group) {
					group = new Group(thing.subreddit, thing.subreddit);
					this.groups.push(group);
					group.onUpdate = ()=>this.groupUpdated(group);
				}
			} else {
				const title = thing.title.toLowerCase().replace(/\s+/g, '').replace(/[^a-z]+/g, '') || thing.title.toLowerCase();
				group = this.groups.find(it=>title.search(it.title.toLowerCase().replace(/\s+/g, '').replace(/[^a-z]+/g, '') || it.title.toLowerCase()) != -1);
				if (!group) {
					group = new Group(title, title);
					this.groups.push(group);
					group.onUpdate = ()=>this.groupUpdated(group);
				}
			}
			group.addThing(thing);
		});

		this.sortGroups();

		log('groups:', this.groups);
	}

	renderGroups() {
		let prevSaved = null;
		this.groups.forEach(group=>{
			if (!group.isSaved && prevSaved === true) {
				const divider = document.createElement('div'); {
					divider.classList.add('r-sd--divider');
					divider.textContent = '? ? ?';
					this.siteTable.append(divider);
				}
			}
			group.render(this.siteTable);
			prevSaved = group.isSaved;
		});
	}

	sortGroups() {
		this.groups.filter(it=>it.things.length==0).forEach(it=>it.element.remove());
		this.groups = this.groups.filter(it=>it.things.length);
		this.groups.sort((a,b)=>{
			if (a.isSaved && !b.isSaved) return -1;
			if (!a.isSaved && b.isSaved) return 1;
			const an = a.title.toLowerCase();
			const bn = b.title.toLowerCase();
			if (an > bn) return 1;
			if (an < bn) return -1;
			return 0;
		});
	}


	groupUpdated(/**@type{Group}*/group) {
		log('Downloader.groupUpdated');
		const dupes = this.groups.filter(it=>it.title == group.title);
		if (dupes.length > 1) {
			const first = dupes[0];
			dupes.forEach((dupe,idx)=>{
				if (idx) {
					dupe.things.forEach(thing=>first.addThing(thing));
					dupe.element.remove();
					this.groups.splice(this.groups.indexOf(dupe, 1));
				}
			})
		}
		const oldIdx = this.groups.indexOf(group);
		this.sortGroups();
		const newIdx = this.groups.indexOf(group);
		if (oldIdx != newIdx) {
			if (newIdx < this.groups.length - 1) {
				this.groups[newIdx+1].element.insertAdjacentElement('beforebegin', group.element);
				group.renderThings();
			} else {
				group.render(this.siteTable);
			}
		}
	}

	thingUserChanged(/**@type{Thing}*/thing, /**@type{String}*/user) {
		log('Downloader.thingUserChanged', thing, user);
		const title = this.userLookup[thing.user];
		if (!title || title != user) {
			this.userLookup[thing.user] = user;
			localStorage.setItem('r-sd--users', JSON.stringify(this.userLookup));
		}
		let group = this.groups.find(it=>it.title == title);
		if (!group) {
			group = new Group(thing.user, user);
			group.save();
			this.groups.push(group);
			group.onUpdate = ()=>this.groupUpdated(group);
		}
		this.groups.forEach(g=>{
			g.things.forEach((t,i)=>{
				if (t.user == thing.user) {
					group.addThing(t);
					g.things.splice(i,1);
				}
			});
		});

		this.sortGroups();
		this.renderGroups();
	}
}



// src\redgifs\RedgifsDownloader.js



class RedgifsDownloader {
	async run() {
		const key = location.pathname.replace(/^.+\/([^\/]+)$/, '$1');
		const status = GM_getValue(`r-sd--redgifs--${key}`);
		if (status != 'waiting') {
			log('not from downloader');
			return;
		}
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


// src\redgifs\RedgifsImageDownloader.js



class RedgifsImageDownloader {
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
// ---------------- /IMPORTS ----------------


	if (location.host == 'www.reddit.com') {
		const dl = new Downloader();
	} else if (location.host.search('redgifs.com') > -1) {
		if (location.hash == '#r-sd--dl-this'); {
			log('dl this!');
			const dl = new RedgifsDownloader();
			dl.run();
			const idl = new RedgifsImageDownloader();
			idl.run();
		}
	}
})();