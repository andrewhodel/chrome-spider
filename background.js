var openSites = [];

var diff = function(s1, s2) {

	if (s1 === s2) {
		console.log('diff exact match');
		return 0;
	} else if (Math.abs(s1.length-s2.length) > 100) {
		console.log('diff > 100 bytes size difference match');
		return 0;
	} else {
		console.log('diff no match');
		return 1;
	}

}

var getDomain = function(url) {

	var p = url.split('/');

	// should be ://domain.tld so 2
	return p[2];

}

var sendToServer = function(url, data) {

	console.log('sending ' + url + ' and ' + data.length + ' bytes of data to server');

	var xhr = new XMLHttpRequest();
	xhr.open('POST', 'http://127.0.0.1:4444/url', true);
	xhr.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
	xhr.onload = function(e) {
	};

	xhr.send(JSON.stringify({url: url, data: data}));

}

chrome.runtime.onInstalled.addListener(function() {
	console.log("Spider Client extension installed and running.");
});

chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {

	if (changeInfo.status == 'loading' && typeof(changeInfo.url) != 'undefined') {

		// this indicates that a new url is being loaded, this is key to the index of the url

		// check the domain in openSites and see if the page has changed or if this domain/tabId pair is finished
		var d = getDomain(changeInfo.url);

		var c = 0;
		var found = false;
		while (c<openSites.length) {

			if (openSites[c].tabId == tabId && openSites[c].domain == d) {

				found = true;

				//console.log('tabId changed paths for domain', openSites[c].domain);

				// update the url
				openSites[c].url = changeInfo.url;

				break;

			}
			c++;
		}

		if (!found) {
			// remove the tabId

			c = 0;
			while (c<openSites.length) {
				if (openSites[c].tabId == tabId) {
					// FIXME this changing domain logic needs to happen before chrome.webRequest.onCompleted, sometimes it does not
					// so here you just add a field in openSites that says domain_change_waiting = true
					// then have this block of logic update the domain and then send the data
					console.log('tabId changed domain from ' + openSites[c].domain + ' to ' + d + ', removing the old one from openSites');
					openSites.splice(c, 1);
					openSites.push({tabId: tabId, domain: d, url: changeInfo.url});
					break;
				}
				c++;
			}

		}

	}
});

chrome.webRequest.onCompleted.addListener(function(details) {

	// the very first time you go to a page (not when you refresh)
	// details.initiator will be undefined
	// we need to store details.tabId then rather than just using details.initiator because another tab can have the same website open
	if (typeof(details.initiator) == 'undefined') {

		// add the site to openSites
		openSites.push({tabId: details.tabId, domain: getDomain(details.url), url: details.url});

		chrome.pageCapture.saveAsMHTML({tabId: details.tabId}, function(mhtml_binary_data) {

			if (chrome.runtime.lastError) {
				// there was an error getting the MHTML
				console.log('error with chrome.pageCapture.saveAsMHTML()', chrome.runtime.lastError);
				return;
			}

			var c = 0;
			while (c<openSites.length) {
				if (openSites[c].tabId == this.details.tabId && openSites[c].domain == getDomain(this.details.url)) {
					// add the original page binary data to openSites
					openSites[c].mhtml = mhtml_binary_data;

					var reader = new FileReader();
					reader.readAsText(mhtml_binary_data, "UTF-8");
					reader.onload = function(e) {

						sendToServer(this.url, e.target.result);

					}.bind({url: openSites[c].url});

					//console.log('added openSites[c].mhtml after initial tab load', mhtml_binary_data);

					break;

				}
				c++;
			}

		}.bind({details: details}));

	} else {

		if (details.type != 'main_frame' && details.type != 'xmlhttprequest') {
			// only check main_frame and xmlhttprequest types
			return;
		}

		console.log('SECONDARY TAB LOAD TYPE:', details.type);

		var c = 0;
		while (c<openSites.length) {

			if (openSites[c].tabId == details.tabId && openSites[c].domain == getDomain(details.url)) {

				console.log('tabId has updated data for the same domain', openSites[c].domain);

				// check if there were significant changes from the original open
				chrome.pageCapture.saveAsMHTML({tabId: details.tabId}, function(mhtml_binary_data) {

					if (chrome.runtime.lastError) {
						// there was an error getting the MHTML
						return;
					}

					if (typeof(this.site.mhtml) == 'undefined' && typeof(mhtml_binary_data) != 'undefined') {
						// there was not previous mhtml data

						var reader = new FileReader();
						reader.readAsText(mhtml_binary_data, "UTF-8");
						reader.onload = function(e) {

							sendToServer(this.url, e.target.result);

						}.bind({url: this.site.url});

					} else if (typeof(this.site.mhtml) != 'undefined' && typeof(mhtml_binary_data) != 'undefined') {
						// there was previous mhtml data

						var reader = new FileReader();
						reader.readAsText(this.site.mhtml, "UTF-8");
						reader.onload = function(e) {

							var reader = new FileReader();
							reader.readAsText(this.b, "UTF-8");
							reader.onload = function(e) {

								var d = diff(this.e.target.result, e.target.result);

								if (d == 0) {
									sendToServer(this.url, e.target.result);
								}

							}.bind({e: e, url: this.url});

						}.bind({b: mhtml_binary_data, url: this.site.url});

					}

				}.bind({site: openSites[c]}));

				break;

			}
			c++;
		}

	}

}, {urls: ["<all_urls>"]}, null);

