// ==UserScript==
// @name         Reddit - Saved Downloader
// @namespace    https://github.com/LenAnderson/
// @downloadURL  https://github.com/LenAnderson/reddit-saved-downloader/raw/master/reddit-saved-downloader.user.js
// @version      1.2
// @description  Simple way to download media from saved posts and comments.
// @author       LenAnderson
// @match        https://www.reddit.com/user/*/saved/*
// @match        https://www.reddit.com/user/*/saved
// @icon         https://www.google.com/s2/favicons?sz=64&domain=reddit.com
// @grant        GM_download
// @grant        GM_xmlhttpRequest
// @connect      gfycat.com
// @connect      redgifs.com
// @connect      api.imgur.com
// @connect      v.redd.it
// ==/UserScript==

import { Downloader } from "./Downloader.js";

(function() {
    'use strict';

	// ${imports}

	const dl = new Downloader();
})();