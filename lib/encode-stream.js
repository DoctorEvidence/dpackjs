
const { Readable } = require('stream')
const { encode } = require('./write-doc')
const { createEncodeStream } = require('msgpack-lite')
// a readable stream for serializing a set of variables to a JSON stream
class DPackStream extends (createEncodeStream || function(){}) {

	constructor(options) {
		// Calls the stream.Readable(options) constructor
		super(options)
		this.codec.encode()
	}
	write(value) {
		this.encoder.write(value)
		writeBuffer()
	}

	writeBuffer(onResume) {
		this._writing = true
		var noBackPressure = this.push(this.encoder.getNextChunk())
		this._writing = false
		if (onResume) {
			this.onResume = onResume
			if (noBackPressure) {
				this._read() // immediately continue
			} // else wait for next _read call
		} else { // nothing to resume, we are done
			this.push(null)
		}
	}

	_read() {
		if (this._writing) {
			// I don't know why _read is called from within a push call, but if we are already reading, ignore the call
			return
		}
		var onResume = this.onResume
		this.onResume = null
		onResume().then(null, (error) => {
			this.push(error.toString())
			this.push(null)
		})
	}
}

exports.createEncodeStream = createEncodeStream/*() => {
	return new DPackStream()
}*/
