
const { Transform } = require('stream')
const { createSerializer } = require('./serialize')
// a readable stream for serializing a set of variables to a JSON stream
class DPackSerializeStream extends Transform {

	constructor(options) {
		// Calls the stream.Readable(options) constructor
		super(options)
		this.serializer = createSerializer({
			outlet: this
		})
	}
	write(value) {
		if (!this.blockStarted) {
			this.serializer.startBlock()
			this.blockStarted = true
		}
		this.serializer.serialize(value)
		this.writeFlush()
	}
	writeFlush() {
		this.serializer.flush()
		const hasMoreToSend = this.serializer.pendingEncodings.length > 0
		if (this.readableFlowing && hasMoreToSend) {
			this.serializer.pendingEncodings.shift().then(() => this.writeFlush())
		} else if (this.endWhenDone && !hasMoreToSend) {
			this.push(null)
		}
	}

	end(value) {
		if (value) {
			this.write(value)
		}
		if (this.serializer.pendingEncodings.length > 0) {
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
		if(!this._writing && this.serializer.pendingEncodings.length > 0) {
			this.serializer.pendingEncodings.shift().then(() => this.writeFlush())
		}
	}
}

exports.createSerializeStream = () => {
	return new DPackSerializeStream()
}
