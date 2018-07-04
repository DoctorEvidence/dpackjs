var createDecoder = require('./lib/decode').createDecoder

exports.fetch = function fetch(url, request) {
	if (request) {
		request.url = url
	} else {
		request = url
	}
	return new Promise(function(requestResolve, requestReject) {
	    var xhr = new XMLHttpRequest()
	    var whenProgressDecoded
	    var decoder
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
			    					return xhr.responseDecoded
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
		    	if (!decoder) {
		    		if (sourceText && /dpack/.test(xhr.getResponseHeader('Content-Type'))) {
			    		decoder = createDecoder()
		    		}
			    	else
			    		return
		    	}
		    	if (decoder.onResume) {
		    		decoder.onResume(sourceText)
		    		whenProgressDecoded.then(function(value) {
		    			xhr.responseDecoded = value // completed successfully
		    		}, onError)
		    	}
				try {
					xhr.responseDecoded = decoder.decode(sourceText)
				} catch (error) {
					onError(error)
				}
				function onError(error) {
					if (error.message == 'BUFFER_SHORTAGE') {
						whenProgressDecoded = error.whenResumed
						xhr.responseDecoded = error.valueInProgress
					} else {
						reject(error)
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
