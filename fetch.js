"use strict"
var createParser = require('./lib/parse').createParser

window.createParser = createParser
var serialize = window.serialize = require('./lib/serialize').serialize
function readResponse(response, onProgress) {
	var reader = response.body.getReader()
	return new Promise(function(resolve, reject) {
		var sourceText = ''
		var parser
		var parsedData
		function readNext() {
			reader.read().then(function(next) {
				if (next.done) {
					resolve(parsedData)
				} else {
					sourceText += new TextDecoder().decode(next.value)
					try {
						if (parser) {
							if (parser.onResume) {
								var updatedData = parser.onResume(sourceText)
								parsedData = parsedData || updatedData
							}
						} else {
							parser = createParser()
							parser.setSource(sourceText)
							parsedData = parser.read()
						}
						parser.read()
					} catch (error) {
						onError(error)
					}
					readNext()
				}
			})
		}
		function onError(error) {
			if (error.message == 'Unexpected end of dpack stream') {
				parsedData = parsedData || error.valueInProgress
				if (onProgress) {
					onProgress(parsedData, response)
				}
			} else {
				reject(error)
			}
		}
		readNext()
	})
}
exports.readResponse = readResponse
exports.fetch = function(url, request) {
	(request.headers || (request.headers = {}))['Accept'] = 'text/dpack;q=1,application/json;q=0.7'
	var fetchResponse = fetch(url, request)
	fetchResponse.then(function(response) {
		response.dpack = function(onProgress) {
			return readResponse(response, onProgress)
		}
		return response
	})
	return fetchResponse
}
