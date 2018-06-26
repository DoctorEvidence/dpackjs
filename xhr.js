var DecodeBuffer = require('msgpack-lite/lib/decode-buffer').DecodeBuffer

exports.DecodedXMLHttpRequest = function() {
    var xhr = new XMLHttpRequest()
    var whenProgressDecoded
    var decoder
    xhr.addEventListener('progress', function(event) {
    	var arrayBuffer = xhr.response
    	if (!decoder) {
    		if (arrayBuffer && /msgpack/.test(xhr.getResponseHeader('Content-Type'))) {
	    		decoder = new DecodeBuffer()
		    	decoder.offset = 0
    		}
	    	else
	    		return
    	}
    	decoder.buffer = new Uint8Array(arrayBuffer)
    	if (decoder.onResume) {
    		decoder.onResume(arrayBuffer)
    		whenProgressDecoded.then(function(value) {
    			xhr.responseDecoded = value // completed successfully
    		}, onError)
    	}
		try {
			xhr.responseDecoded = decoder.codec.decode(decoder)
		} catch (error) {
			onError(error)
		}
		function onError(error) {
			if (error.message == 'BUFFER_SHORTAGE') {
				whenProgressDecoded = error.whenResumed
				xhr.responseDecoded = error.valueInProgress
			} else {
				throw error
			}
		}
    })
    return xhr
}
