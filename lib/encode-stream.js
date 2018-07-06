
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

	end(value) {
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
		if (this.encoder.pendingEncodings && this.encoder.pendingEncodings.length) {
			if (noBackPressure) {
				this.encoder.pendingEncodings.shift().then()
			} // else wait for next _read call
		} else if (this.endWhenDone) { // nothing to resume, we are done
			this.push(null)
		}
	}

	_read() {
		if(this._writing) {
			return
		}
		if (this.encoder.pendingEncodings && this.encoder.pendingEncodings.length) {
			this.encoder.pendingEncodings.shift().then()
		}
	}
}

exports.createEncodeStream = () => {
	return new DPackEncodeStream()
}
