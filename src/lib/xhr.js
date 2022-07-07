import { log } from "./basics.js";

export const xhr = async(details)=>{
	log('xhr', details);
	return new Promise((resolve,reject)=>{
		details.onload = resolve;
		details.onerror = reject;
		GM_xmlhttpRequest(details);
	});
};

export const xhrHtml = async(details)=>{
	log('xhrHtml', details);
	const response = await xhr(details);
	const html = document.createElement('div');
	html.innerHTML = response.responseText;
	return html;
}