import { Group } from "./Group.js";
import { $, $$, log, wait } from "./lib/basics.js";
import { Binding } from "./lib/Binding.js";
import { xhrHtml } from "./lib/xhr.js";
import { Thing } from "./Thing.js";

export class Downloader {
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

		this.groups = JSON.parse(localStorage.getItem('r-sd--groups') ?? '[]').map(it=>new Group(it.subreddit, it.title));
		this.groups.forEach(it=>it.onUpdate = ()=>this.groupUpdated(it));

		this.navItem = $('a[href*="/saved/"]');
		this.siteTable = $('#siteTable');

		const style = document.createElement('style'); {
			style.innerHTML = '${include-min-esc: css/style.css}';
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
		this.groups.forEach(group=>{
			group.render(this.siteTable);
		});
	}

	sortGroups() {
		this.groups.filter(it=>it.things.length==0).forEach(it=>it.element.remove());
		this.groups = this.groups.filter(it=>it.things.length);
		this.groups.sort((a,b)=>{
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
