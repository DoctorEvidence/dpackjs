
const { Transform } = require('stream')
const { createEncoder } = require('./encode')
// a readable stream for serializing a set of variables to a JSON stream
class DPackEncodeStream extends Transform {

	constructor(options) {
		// Calls the stream.Readable(options) constructor
		super(options)
		this.encoder = createEncoder({
			outlet: this
		})
	}
	write(value) {
		this.encoder.encode(value)
		this.encoder.flush()
	}

	end() {
		if (value) {
			this.write(value)
		}
		if (this.onResume) {
			this.endWhenDone = true
		} else {
			this.push(null)
		}
	}

	writeBytes(buffer, onResume) {
		this._writing = true
		var noBackPressure = this.push(buffer)
		this._writing = false
		if (onResume) {
			this.onResume = onResume
			if (noBackPressure) {
				this._read() // immediately continue
			} // else wait for next _read call
		} else if (this.endWhenDone) { // nothing to resume, we are done
			this.push(null)
		}
	}

	_read() {
		var onResume = this.onResume
		if (onResume) {
			this.onResume = null
			onResume().then(null, (error) => {
				this.push(error.toString())
				this.push(null)
			})
		}
	}
}

exports.createEncodeStream = () => {
	return new DPackEncodeStream()
}
