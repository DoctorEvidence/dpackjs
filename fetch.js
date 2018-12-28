"use strict"
var createParser = require('./lib/parse').createParser

window.createParser = createParser
var serialize = window.serialize = require('./lib/serialize').serialize
function readResponse(response, onProgress) {
	var reader = response.body.getReader()
	return new Promise(function(resolve, reject) {
		var parser
		var parsedData
		var queuedBytes
		function queueUnfinishedChar(bytes) {
			// this checks to see if we end the bytes in the middle of a character, and need to queue bytes for the next chunk
			var length = bytes.length
			var lastStart = length - 1
			if (bytes[lastStart] < 0x80) {
				queuedBytes = null
				return bytes
			}
			while (lastStart >= 0) {
				var byte = bytes[lastStart]
				if (byte >= 0xC0) {
					var charLength = byte >= 0xE0 ? byte >= 0xF0 ? 4 : 3 : 2
					var needs = charLength - length + lastStart
					if (needs > 0) {
						queuedBytes = bytes.slice(lastStart, length - lastStart)
						queuedBytes.needs = needs
						return bytes.slice(0, lastStart)
					}
					queuedBytes = null
					return bytes
				}
				lastStart--
			}
			queuedBytes = null
			return bytes
		}
		var decoder = new TextDecoder()
		function readNext() {
			reader.read().then(function(next) {
				if (next.done) {
					resolve(parsedData)
				} else {
					var bytes = next.value
					var sourceText
					if (queuedBytes) {
						// if we are resuming from the middle of a character, concatenate the bytes and decode it
						sourceText = decoder.decode(new Uint8Array(Array.from(queuedBytes).concat(Array.from(bytes.slice(0, queuedBytes.needs)))))
						// and then remove the consumed byte(s)
						bytes = bytes.slice(queuedBytes.needs)
						bytes = queueUnfinishedChar(bytes)
						sourceText += decoder.decode(bytes)
					} else {
						bytes = queueUnfinishedChar(bytes)
						sourceText = decoder.decode(bytes)
					}
					if (parser) {
						if (parser.onResume) {
							var updatedData = parser.onResume(sourceText, true)
							parsedData = parsedData || updatedData
						}
					} else {
						parser = createParser()
						parser.setSource(sourceText, 0, true)
						parsedData = parser.read()
					}
					parser.read()
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
