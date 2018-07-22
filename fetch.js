"use strict"
var createParser = require('./lib/parse').createParser

window.createParser = createParser
window.serialize = require('./lib/serialize').serialize
exports.fetch = function fetch(url, request) {
	if (request) {
		request.url = url
	} else {
		request = url
	}
	return new Promise(function(requestResolve, requestReject) {
	    var xhr = new XMLHttpRequest()
	    var whenProgressParsed
	    var parser
	    var responseResolve
	    var responseRejected
	    var responsePromise = new Promise(function(responseResolve, responseReject) {
		   	var requestResolved
		    xhr.addEventListener('progress', function(event) {
		    	var sourceText = xhr.responseText
		    	if (!requestResolved) {
		    		requestResolved = true
		    		if (xhr.status) {
		    			var response = {
		    				json: function() {
		    					return responsePromise.then(function() {
		    						return JSON.parse(xhr.responseText)
		    					})
		    				},
		    				text: function() {
		    					return responsePromise.then(function() {
		    						return xhr.responseText
		    					})
		    				},
		    				dpack: function() {
		    					return responsePromise.then(function() {
			    					return xhr.responseParsed
			    				})
		    				},
		    				ok: xhr.status < 300 && xhr.status >= 200,
		    				status: xhr.status,
		    				statusText: xhr.statusText,
		    				xhr: xhr,
		    				onProgress: function(listener) {
		    					xhr.addEventListener('progress', listener)
		    				}
		    			}
		    			requestResolve(response)
		    		}
		    		else
		    			requestReject('Network error')
		    	}
		    	if (!parser) {
		    		if (sourceText && /dpack/.test(xhr.getResponseHeader('Content-Type'))) {
			    		parser = createParser()
		    		}
			    	else
			    		return
		    	}
		    	if (parser.onResume) {
		    		parser.onResume(sourceText)
		    		return whenProgressParsed.then(function(value) {
		    			xhr.responseParsed = xhr.responseParsed || value // completed successfully (only assign value if it isn't assigned yet)
		    			while (parser.hasUnfulfilledReferences()) {
		    				parser.readOpen()
		    			}
		    		}, onError)
		    	}
				try {
					parser.setSource(sourceText)
					xhr.responseParsed = parser.readOpen()
	    			while (parser.hasUnfulfilledReferences()) {
	    				parser.readOpen()
	    			}
				} catch (error) {
					onError(error)
				}
				function onError(error) {
					if (error.message == 'BUFFER_SHORTAGE') {
						whenProgressParsed = error.whenResumed
						xhr.responseParsed = xhr.responseParsed || error.valueInProgress
						if (request.onProgress) {
							request.onProgress(xhr.responseParsed, xhr)
						}
					} else {
						responseReject(error)
					}
				}
		    })
		    xhr.addEventListener('load', function(event) {
		    	responseResolve()
		    })
		    xhr.open(request.method || 'GET', request.url, true)
		    for (var name in request.xhrFields || {}) {
		    	xhr[name] = request.xhrFields[name]
		    }
		    for (var name in request.headers || {}) {
		    	xhr.setRequestHeader(name, request.headers[name])
		    }
		    xhr.send(request.body)
		})
	})
}
