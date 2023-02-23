// ==UserScript==
// @name         Reddit - Saved Downloader
// @namespace    https://github.com/LenAnderson/
// @downloadURL  https://github.com/LenAnderson/reddit-saved-downloader/raw/master/reddit-saved-downloader.user.js
// @version      1.6
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

import { Downloader } from "./Downloader.js";
import { log } from "./lib/basics.js";
import { RedgifsDownloader } from "./redgifs/RedgifsDownloader.js";

(function() {
    'use strict';

	// ${imports}

	if (location.host == 'www.reddit.com') {
		const dl = new Downloader();
	} else if (location.host.search('redgifs.com') > -1) {
		if (location.hash == '#r-sd--dl-this'); {
			log('dl this!');
			const dl = new RedgifsDownloader();
			dl.run();
		}
	}
})();