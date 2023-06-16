import { log, wait } from "./lib/basics.js";
import { Binding } from "./lib/Binding.js";
import { Thing } from "./Thing.js";

export class Group {
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