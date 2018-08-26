"use strict"
var createParser = require('./lib/parse').createParser

window.createParser = createParser
var serialize = window.serialize = require('./lib/serialize').serialize
exports.fetch = function fetch(url, request) {
	if (request) {
		request.url = url
	} else if (typeof url === 'string') {
		request = { url: url }
	} else {
		request = url
	}
	if (!request.headers) {
		request.headers = {}
	}
	if (!request.headers.Accept) {
		request.headers.Accept = 'text/dpack;q=1,application/json;q=0.7'
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
				parseTextSoFar()
			})
			function parseTextSoFar() {
				var sourceText = xhr.responseText
				try {
					if (parser) {
						if (parser.onResume) {
							var updatedData = parser.onResume(sourceText)
							xhr.responseParsed = xhr.responseParsed || updatedData
						}
					} else {
						if (sourceText && /dpack/.test(xhr.getResponseHeader('Content-Type'))) {
							parser = createParser()
							parser.setSource(sourceText)
							xhr.responseParsed = parser.read()
						}
						else
							return
					}
					parser.read()
				} catch (error) {
					onError(error)
				}
			}
			function onError(error) {
				if (error.message == 'Unexpected end of dpack stream') {
					xhr.responseParsed = xhr.responseParsed || error.valueInProgress
					if (request.onProgress) {
						request.onProgress(xhr.responseParsed, xhr)
					}
				} else {
					responseReject(error)
				}
			}
			xhr.addEventListener('load', function(event) {
				parseTextSoFar()
				responseResolve()
			})
			xhr.open(request.method || 'GET', request.url, true)
			for (var name in request.xhrFields || {}) {
				xhr[name] = request.xhrFields[name]
			}
			for (var name in request.headers) {
				xhr.setRequestHeader(name, request.headers[name])
			}
			xhr.send(request.data)
		})
	})
}
