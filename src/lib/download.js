export const download = async(details)=>{
	log('download', details);
	details.name = details.name.replace(/\?.*$/, '');
	return new Promise((resolve,reject)=>{
		details.onload = resolve;
		details.onerror = reject;
		GM_download(details);
	});
};