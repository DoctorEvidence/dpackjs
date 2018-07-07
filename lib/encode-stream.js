
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
		this.writeFlush()
	}
	writeFlush() {
		this.encoder.flush()
		if (this.readableFlowing && this.encoder.pendingEncodings.length > 0) {
			this.encoder.pendingEncodings.shift().then(() => this.writeFlush())
		} else if (this.endWhenDone) {
			this.push(null)
		}
	}

	end(value) {
		if (value) {
			this.write(value)
		}
		if (this.encoder.pendingEncodings.length > 0) {
			this.endWhenDone = true
		} else {
			this.push(null)
		}
	}

	writeBytes(buffer, onResume) {
		this._writing = true
		this.push(buffer)
		this._writing = false
	}

	_read() {
		if(!this._writing && this.encoder.pendingEncodings.length > 0) {
			this.encoder.pendingEncodings.shift().then(() => this.writeFlush())
		}
	}
}

exports.createEncodeStream = () => {
	return new DPackEncodeStream()
}
